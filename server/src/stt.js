// Speech-to-text proxy (Deepgram or OpenAI Whisper) for browsers without SpeechRecognition.
import { HttpError, json, upstreamFetch } from './util.js';
import { requireUser } from './auth.js';
import { addUsage, getUsage } from './db.js';
import { effectivePlan, limitsFor, limitError, resetMonthly } from './limits.js';

export const STT_MAX_BYTES = 5 * 1024 * 1024;
const AUDIO_TYPES = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a' };

export function sttProvider(env) {
  const p = String(env.STT_PROVIDER || '').toLowerCase();
  if (p === 'deepgram' && env.DEEPGRAM_API_KEY) return 'deepgram';
  if (p === 'openai' && env.OPENAI_API_KEY) return 'openai';
  return null;
}

function langFor(provider, lang) {
  const l = String(lang || 'zh').toLowerCase();
  if (provider === 'deepgram') return l.startsWith('zh') ? (l === 'zh-tw' ? 'zh-TW' : 'zh-CN') : l;
  return l.split('-')[0];
}

async function transcribeDeepgram(env, bytes, contentType, lang) {
  const url = `https://api.deepgram.com/v1/listen?model=nova-2&language=${encodeURIComponent(lang)}&smart_format=true`;
  const res = await upstreamFetch(env, url, { method: 'POST', headers: { authorization: `Token ${env.DEEPGRAM_API_KEY}`, 'content-type': contentType }, body: bytes });
  if (!res.ok) throw new HttpError(502, 'stt_failed', { status: res.status });
  const data = await res.json();
  const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  const seconds = Number(data?.metadata?.duration) || null;
  return { text, seconds };
}

async function transcribeOpenai(env, bytes, contentType, lang) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: contentType }), `audio.${AUDIO_TYPES[contentType] || 'webm'}`);
  form.append('model', 'whisper-1');
  form.append('language', lang);
  form.append('response_format', 'verbose_json');
  const res = await upstreamFetch(env, 'https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form });
  if (!res.ok) throw new HttpError(502, 'stt_failed', { status: res.status });
  const data = await res.json();
  return { text: data.text || '', seconds: Number(data.duration) || null };
}

// POST /v1/stt?lang=zh  (raw audio body)
export async function handleStt(request, env, ctx) {
  const user = await requireUser(request, env);
  const provider = sttProvider(env);
  if (!provider) throw new HttpError(503, 'stt_not_configured');
  const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!AUDIO_TYPES[contentType]) throw new HttpError(415, 'bad_content_type', { allowed: Object.keys(AUDIO_TYPES) });
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > STT_MAX_BYTES) throw new HttpError(413, 'too_large', { maxBytes: STT_MAX_BYTES });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) throw new HttpError(400, 'empty_audio');
  if (bytes.byteLength > STT_MAX_BYTES) throw new HttpError(413, 'too_large', { maxBytes: STT_MAX_BYTES });

  const plan = effectivePlan(user);
  const usage = await getUsage(env, user.id);
  const estimate = Math.max(1, Math.ceil(bytes.byteLength / 16000));
  if (usage.sttSecondsMonth + estimate > limitsFor(plan).sttSecondsPerMonth) throw limitError('monthly', resetMonthly());

  const lang = langFor(provider, new URL(request.url).searchParams.get('lang'));
  const result = provider === 'deepgram' ? await transcribeDeepgram(env, bytes, contentType, lang) : await transcribeOpenai(env, bytes, contentType, lang);
  const seconds = Math.max(1, Math.ceil(result.seconds || estimate));
  const p = addUsage(env, user.id, { sttSeconds: seconds }).catch((e) => console.error('stt usage failed', e));
  if (ctx?.waitUntil) ctx.waitUntil(p); else await p;
  return json({ text: result.text, seconds });
}
