// Text-to-speech proxy (Azure Speech or Google Cloud TTS) with a KV cache.
import { HttpError, readJson, sha256Hex, clampNumber, base64ToBytes, upstreamFetch } from './util.js';
import { requireUser } from './auth.js';
import { addUsage, getUsage } from './db.js';
import { effectivePlan, limitsFor, limitError, resetMonthly } from './limits.js';

export const TTS_MAX_CHARS = 300;
export const TTS_CACHE_TTL_SEC = 30 * 24 * 3600;
export const DEFAULT_VOICES = { azure: 'zh-CN-XiaoxiaoNeural', google: 'cmn-CN-Wavenet-A' };

export function ttsProvider(env) {
  const p = String(env.TTS_PROVIDER || '').toLowerCase();
  if (p === 'azure' && env.AZURE_TTS_KEY && env.AZURE_TTS_REGION) return 'azure';
  if (p === 'google' && env.GOOGLE_TTS_KEY) return 'google';
  return null;
}

const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

export async function synthesizeAzure(env, { text, voice, rate }) {
  const pct = Math.round((rate - 1) * 100);
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody rate='${pct >= 0 ? '+' : ''}${pct}%'>${escapeXml(text)}</prosody></voice></speak>`;
  const res = await upstreamFetch(env, `https://${env.AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.AZURE_TTS_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'senlin-api',
    },
    body: ssml,
  });
  if (!res.ok) throw new HttpError(502, 'tts_failed', { status: res.status });
  return new Uint8Array(await res.arrayBuffer());
}

export async function synthesizeGoogle(env, { text, voice, rate }) {
  const languageCode = voice.split('-').slice(0, 2).join('-') || 'cmn-CN';
  const res = await upstreamFetch(env, `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(env.GOOGLE_TTS_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: { languageCode, name: voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: rate } }),
  });
  if (!res.ok) throw new HttpError(502, 'tts_failed', { status: res.status });
  const data = await res.json();
  if (!data.audioContent) throw new HttpError(502, 'tts_failed');
  return base64ToBytes(data.audioContent);
}

// POST /v1/tts {text, rate?, voice?}
export async function handleTts(request, env, ctx) {
  const user = await requireUser(request, env);
  const provider = ttsProvider(env);
  if (!provider) throw new HttpError(503, 'tts_not_configured');
  const body = await readJson(request, 16 * 1024);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > TTS_MAX_CHARS) throw new HttpError(400, 'bad_text', { max: TTS_MAX_CHARS });
  const rate = Math.round(clampNumber(body.rate, 0.5, 1.2, 1) * 100) / 100;
  const voice = typeof body.voice === 'string' && /^[A-Za-z0-9-]{3,64}$/.test(body.voice) ? body.voice : DEFAULT_VOICES[provider];

  const key = 'tts:' + (await sha256Hex(`${provider}|${voice}|${rate}|${text}`));
  const cached = await env.CACHE.get(key, { type: 'arrayBuffer' });
  if (cached) return audioResponse(cached, 'hit');

  const plan = effectivePlan(user);
  const usage = await getUsage(env, user.id);
  if (usage.ttsCharsMonth + text.length > limitsFor(plan).ttsCharsPerMonth) throw limitError('monthly', resetMonthly());

  const bytes = provider === 'azure' ? await synthesizeAzure(env, { text, voice, rate }) : await synthesizeGoogle(env, { text, voice, rate });
  const after = Promise.all([
    env.CACHE.put(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { expirationTtl: TTS_CACHE_TTL_SEC }),
    addUsage(env, user.id, { ttsChars: text.length }),
  ]).catch((e) => console.error('tts post-processing failed', e));
  if (ctx?.waitUntil) ctx.waitUntil(after); else await after;
  return audioResponse(bytes, 'miss');
}

function audioResponse(bytes, cache) {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=2592000', 'x-senlin-cache': cache },
  });
}
