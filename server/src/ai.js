// Anthropic Messages API proxy with rate limits and usage metering.
import { HttpError, json, readJson, upstreamFetch } from './util.js';
import { requireUser } from './auth.js';
import { addUsage, getUsage } from './db.js';
import { effectivePlan, limitsFor, limitError, resetDaily, resetMonthly, AI_RATE_PER_MINUTE } from './limits.js';
import { parseSse, sseLine } from './sse.js';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
export const DEFAULT_MODEL = 'claude-sonnet-5';
export const DEFAULT_ALLOWED_MODELS = ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5'];

export const AI_LIMITS = { maxMessages: 40, maxMessageChars: 4000, maxSystemChars: 12000, maxOutputTokens: 1200, defaultOutputTokens: 600 };

export function allowedModels(env) {
  const list = String(env.ANTHROPIC_ALLOWED_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const dflt = env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  return Array.from(new Set([dflt, ...DEFAULT_ALLOWED_MODELS, ...list]));
}

function validateChat(body) {
  const system = body.system == null ? '' : body.system;
  if (typeof system !== 'string' || system.length > AI_LIMITS.maxSystemChars) throw new HttpError(400, 'bad_system');
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > AI_LIMITS.maxMessages) throw new HttpError(400, 'bad_messages');
  const clean = messages.map((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) throw new HttpError(400, 'bad_messages');
    const content = typeof m.content === 'string' ? m.content : '';
    if (!content.trim() || content.length > AI_LIMITS.maxMessageChars) throw new HttpError(400, 'bad_messages');
    return { role: m.role, content };
  });
  if (clean[0].role !== 'user') throw new HttpError(400, 'bad_messages');
  const maxTokens = Math.min(Math.max(1, Number(body.maxTokens) || AI_LIMITS.defaultOutputTokens), AI_LIMITS.maxOutputTokens);
  return { system, messages: clean, maxTokens, stream: body.stream !== false };
}

async function checkRate(env, userId, now = new Date()) {
  const minute = Math.floor(now.getTime() / 60000);
  const key = `rl:ai:${userId}:${minute}`;
  const count = Number((await env.CACHE.get(key)) || 0);
  if (count >= AI_RATE_PER_MINUTE) throw limitError('rate', new Date((minute + 1) * 60000));
  await env.CACHE.put(key, String(count + 1), { expirationTtl: 120 });
}

// POST /v1/ai/chat
export async function handleAiChat(request, env, ctx) {
  const user = await requireUser(request, env);
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'ai_not_configured');
  const body = await readJson(request, 512 * 1024);
  const { system, messages, maxTokens, stream } = validateChat(body);

  const plan = effectivePlan(user);
  const limits = limitsFor(plan);
  await checkRate(env, user.id);
  const usage = await getUsage(env, user.id);
  if (usage.aiMessagesToday >= limits.aiMessagesPerDay) throw limitError('daily', resetDaily());
  if (usage.aiTokensMonth >= limits.aiTokensPerMonth) throw limitError('monthly', resetMonthly());

  const models = allowedModels(env);
  const model = typeof body.model === 'string' && models.includes(body.model) ? body.model : models[0];

  const upstreamBody = { model, max_tokens: maxTokens, messages, stream };
  if (system) upstreamBody.system = system;

  const upstream = await upstreamFetch(env, ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
      accept: stream ? 'text/event-stream' : 'application/json',
    },
    body: JSON.stringify(upstreamBody),
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    let detail = '';
    try { detail = JSON.parse(text)?.error?.message || ''; } catch { /* ignore */ }
    console.error('anthropic error', upstream.status, detail || text.slice(0, 200));
    const status = upstream.status === 429 ? 429 : upstream.status === 529 ? 503 : 502;
    throw new HttpError(status, 'upstream', { status: upstream.status, detail: detail.slice(0, 200) });
  }

  const record = (usageTotals) => addUsage(env, user.id, { messages: 1, input: usageTotals.input, output: usageTotals.output })
    .catch((e) => console.error('usage record failed', e));

  if (!stream) {
    const msg = await upstream.json();
    const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const totals = { input: msg.usage?.input_tokens || 0, output: msg.usage?.output_tokens || 0 };
    const p = record(totals);
    if (ctx?.waitUntil) ctx.waitUntil(p); else await p;
    return json({ text, usage: totals, model, stopReason: msg.stop_reason || null });
  }

  const enc = new TextEncoder();
  let controller;
  const readable = new ReadableStream({ start(c) { controller = c; } });
  const totals = { input: 0, output: 0 };
  const pump = (async () => {
    const send = (obj) => { try { controller.enqueue(enc.encode(sseLine(obj))); } catch { /* client gone */ } };
    try {
      for await (const evt of parseSse(upstream.body)) {
        let d;
        try { d = JSON.parse(evt.data); } catch { continue; }
        switch (d.type) {
          case 'message_start':
            totals.input = d.message?.usage?.input_tokens || 0;
            break;
          case 'content_block_delta':
            if (d.delta?.type === 'text_delta' && d.delta.text) send({ text: d.delta.text });
            break;
          case 'message_delta':
            if (d.usage) {
              if (typeof d.usage.output_tokens === 'number') totals.output = d.usage.output_tokens;
              if (typeof d.usage.input_tokens === 'number') totals.input = d.usage.input_tokens;
            }
            send({ usage: { input: totals.input, output: totals.output }, stopReason: d.delta?.stop_reason || null });
            break;
          case 'error':
            send({ error: d.error?.message || 'upstream' });
            break;
          default:
            break;
        }
      }
    } catch (e) {
      console.error('stream error', e);
      send({ error: 'stream' });
    } finally {
      send('[DONE]');
      try { controller.close(); } catch { /* already closed */ }
      await record(totals);
    }
  })();
  if (ctx?.waitUntil) ctx.waitUntil(pump);

  return new Response(readable, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' },
  });
}
