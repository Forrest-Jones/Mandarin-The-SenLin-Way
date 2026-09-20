import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv, req, FakeCtx, signIn, fakeFetch } from './fakes.js';
import { addUsage } from '../src/db.js';

const SSE = [
  'event: message_start',
  'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-sonnet-5","usage":{"input_tokens":25,"output_tokens":1}}}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
  '',
  'event: ping',
  'data: {"type":"ping"}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"！"}}',
  '',
  'event: content_block_stop',
  'data: {"type":"content_block_stop","index":0}',
  '',
  'event: message_delta',
  'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":12}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
  '',
].join('\n');

function sseResponse(text = SSE) {
  // deliver in odd-sized chunks to exercise the parser's buffering
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  const stream = new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function aiEnv(extra = {}) {
  const FETCH = fakeFetch({ 'api.anthropic.com/v1/messages': (url, init) => {
    const body = JSON.parse(init.body);
    if (body.stream === false) {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '好的' }], usage: { input_tokens: 9, output_tokens: 3 }, stop_reason: 'end_turn' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return sseResponse();
  } });
  return makeEnv({ ANTHROPIC_API_KEY: 'sk-test', FETCH, ...extra });
}

test('ai: streams simplified SSE and records usage', async () => {
  const env = aiEnv();
  const { token, user } = await signIn(env, worker);
  const ctx = new FakeCtx();
  const res = await worker.fetch(req('/v1/ai/chat', { method: 'POST', token, body: { system: 'You are a tutor.', messages: [{ role: 'user', content: '你好' }], maxTokens: 5000 } }), env, ctx);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const text = await res.text();
  assert.equal(text, 'data: {"text":"你好"}\n\ndata: {"text":"！"}\n\ndata: {"usage":{"input":25,"output":12},"stopReason":"end_turn"}\n\ndata: [DONE]\n\n');
  await ctx.done();
  const row = env.DB.tables.usage.find((r) => r.user_id === user.id);
  assert.equal(row.messages, 1);
  assert.equal(row.input_tokens, 25);
  assert.equal(row.output_tokens, 12);

  // upstream request shape
  const call = env.FETCH.calls[0];
  assert.equal(call.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(call.init.headers['x-api-key'], 'sk-test');
  const sent = JSON.parse(call.init.body);
  assert.equal(sent.model, 'claude-sonnet-5');
  assert.equal(sent.max_tokens, 1200); // clamped
  assert.equal(sent.stream, true);
  assert.equal(sent.system, 'You are a tutor.');
  assert.deepEqual(sent.messages, [{ role: 'user', content: '你好' }]);
});

test('ai: stream:false returns {text, usage}', async () => {
  const env = aiEnv();
  const { token } = await signIn(env, worker);
  const ctx = new FakeCtx();
  const res = await worker.fetch(req('/v1/ai/chat', { method: 'POST', token, body: { messages: [{ role: 'user', content: 'hi' }], stream: false } }), env, ctx);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.text, '好的');
  assert.deepEqual(j.usage, { input: 9, output: 3 });
  await ctx.done();
  assert.equal(env.DB.tables.usage[0].output_tokens, 3);
});

test('ai: validation and model allow-list', async () => {
  const env = aiEnv();
  const { token } = await signIn(env, worker);
  const post = (body) => worker.fetch(req('/v1/ai/chat', { method: 'POST', token, body }), env, new FakeCtx());
  assert.equal((await post({ messages: [] })).status, 400);
  assert.equal((await post({ messages: [{ role: 'user', content: 'x'.repeat(4001) }] })).status, 400);
  assert.equal((await post({ system: 's'.repeat(12001), messages: [{ role: 'user', content: 'x' }] })).status, 400);
  assert.equal((await post({ messages: Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' })) })).status, 400);
  assert.equal((await post({ messages: [{ role: 'system', content: 'x' }] })).status, 400);
  const r = await post({ messages: [{ role: 'user', content: 'x' }], model: 'gpt-9', stream: false });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(env.FETCH.calls.at(-1).init.body).model, 'claude-sonnet-5');
  const r2 = await post({ messages: [{ role: 'user', content: 'x' }], model: 'claude-haiku-4-5', stream: false });
  assert.equal(r2.status, 200);
  assert.equal(JSON.parse(env.FETCH.calls.at(-1).init.body).model, 'claude-haiku-4-5');
});

test('ai: 20 requests/minute rate limit', async () => {
  const env = aiEnv();
  const { token } = await signIn(env, worker);
  for (let i = 0; i < 20; i++) {
    const r = await worker.fetch(req('/v1/ai/chat', { method: 'POST', token, body: { messages: [{ role: 'user', content: 'hi' }], stream: false } }), env, new FakeCtx());
    assert.equal(r.status, 200, `request ${i}`);
  }
  const r = await worker.fetch(req('/v1/ai/chat', { method: 'POST', token, body: { messages: [{ role: 'user', content: 'hi' }], stream: false } }), env, new FakeCtx());
  assert.equal(r.status, 429);
  const j = await r.json();
  assert.equal(j.error, 'limit');
  assert.equal(j.limit, 'rate');
  assert.ok(Date.parse(j.resetAt) > Date.now() - 1000);
});

test('ai: daily and monthly caps by plan', async () => {
  const env = aiEnv();
  const { token, user } = await signIn(env, worker);
  await addUsage(env, user.id, { messages: 25 });
  const r = await worker.fetch(req('/v1/ai/chat', { method: 'POST', token, body: { messages: [{ role: 'user', content: 'hi' }], stream: false } }), env, new FakeCtx());
  assert.equal(r.status, 429);
  assert.equal((await r.json()).limit, 'daily');

  // pro raises the daily cap; monthly token budget still enforced
  env.DB.tables.users[0].plan = 'pro';
  const ok = await worker.fetch(req('/v1/ai/chat', { method: 'POST', token, body: { messages: [{ role: 'user', content: 'hi' }], stream: false } }), env, new FakeCtx());
  assert.equal(ok.status, 200);
  await addUsage(env, user.id, { output: 2_000_000 });
  const m = await worker.fetch(req('/v1/ai/chat', { method: 'POST', token, body: { messages: [{ role: 'user', content: 'hi' }], stream: false } }), env, new FakeCtx());
  assert.equal(m.status, 429);
  assert.equal((await m.json()).limit, 'monthly');

  // expired pro falls back to free
  env.DB.tables.users[0].plan_expires_at = new Date(Date.now() - 1000).toISOString();
  const me = await (await worker.fetch(req('/v1/me', { token }), env, new FakeCtx())).json();
  assert.equal(me.user.plan, 'free');
});

test('ai: upstream failure and missing key', async () => {
  const env = aiEnv({ FETCH: fakeFetch({ 'api.anthropic.com': new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }) }) });
  const { token } = await signIn(env, worker);
  const r = await worker.fetch(req('/v1/ai/chat', { method: 'POST', token, body: { messages: [{ role: 'user', content: 'hi' }] } }), env, new FakeCtx());
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, 'upstream');
  const env2 = makeEnv();
  const s2 = await signIn(env2, worker);
  const r2 = await worker.fetch(req('/v1/ai/chat', { method: 'POST', token: s2.token, body: { messages: [{ role: 'user', content: 'hi' }] } }), env2, new FakeCtx());
  assert.equal(r2.status, 503);
});
