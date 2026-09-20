import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { makeEnv, req, FakeCtx, signIn, fakeFetch } from './fakes.js';
import { addUsage } from '../src/db.js';

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

test('tts: azure synth, KV cache hit on repeat, metering', async () => {
  const FETCH = fakeFetch({ 'tts.speech.microsoft.com': () => new Response(MP3.slice(0), { status: 200, headers: { 'content-type': 'audio/mpeg' } }) });
  const env = makeEnv({ TTS_PROVIDER: 'azure', AZURE_TTS_KEY: 'k', AZURE_TTS_REGION: 'eastus', FETCH });
  const { token, user } = await signIn(env, worker);
  const ctx = new FakeCtx();
  const r1 = await worker.fetch(req('/v1/tts', { method: 'POST', token, body: { text: '你好', rate: 0.8 } }), env, ctx);
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('content-type'), 'audio/mpeg');
  assert.equal(r1.headers.get('x-senlin-cache'), 'miss');
  assert.deepEqual(new Uint8Array(await r1.arrayBuffer()), MP3);
  await ctx.done();
  assert.equal(FETCH.calls.length, 1);
  const call = FETCH.calls[0];
  assert.equal(call.url, 'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1');
  assert.equal(call.init.headers['Ocp-Apim-Subscription-Key'], 'k');
  assert.equal(call.init.headers['X-Microsoft-OutputFormat'], 'audio-24khz-48kbitrate-mono-mp3');
  assert.match(call.init.body, /<voice name='zh-CN-XiaoxiaoNeural'><prosody rate='-20%'>你好<\/prosody>/);
  assert.equal(env.DB.tables.usage.find((r) => r.user_id === user.id).tts_chars, 2);

  const r2 = await worker.fetch(req('/v1/tts', { method: 'POST', token, body: { text: '你好', rate: 0.8 } }), env, new FakeCtx());
  assert.equal(r2.status, 200);
  assert.equal(r2.headers.get('x-senlin-cache'), 'hit');
  assert.deepEqual(new Uint8Array(await r2.arrayBuffer()), MP3);
  assert.equal(FETCH.calls.length, 1, 'no second provider call');

  // different rate -> different cache key
  const r3 = await worker.fetch(req('/v1/tts', { method: 'POST', token, body: { text: '你好', rate: 1 } }), env, new FakeCtx());
  assert.equal(r3.headers.get('x-senlin-cache'), 'miss');
  assert.equal(FETCH.calls.length, 2);
});

test('tts: google provider decodes base64 and escapes nothing into JSON', async () => {
  const b64 = Buffer.from(MP3).toString('base64');
  const FETCH = fakeFetch({ 'texttospeech.googleapis.com': () => new Response(JSON.stringify({ audioContent: b64 }), { status: 200 }) });
  const env = makeEnv({ TTS_PROVIDER: 'google', GOOGLE_TTS_KEY: 'gk', FETCH });
  const { token } = await signIn(env, worker);
  const r = await worker.fetch(req('/v1/tts', { method: 'POST', token, body: { text: '谢谢' } }), env, new FakeCtx());
  assert.equal(r.status, 200);
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), MP3);
  const sent = JSON.parse(FETCH.calls[0].init.body);
  assert.equal(sent.voice.name, 'cmn-CN-Wavenet-A');
  assert.equal(sent.audioConfig.audioEncoding, 'MP3');
  assert.equal(sent.audioConfig.speakingRate, 1);
  assert.match(FETCH.calls[0].url, /key=gk/);
});

test('tts: validation, monthly limit, unconfigured provider', async () => {
  const env = makeEnv({ TTS_PROVIDER: 'azure', AZURE_TTS_KEY: 'k', AZURE_TTS_REGION: 'eastus', FETCH: fakeFetch({}) });
  const { token, user } = await signIn(env, worker);
  const long = await worker.fetch(req('/v1/tts', { method: 'POST', token, body: { text: '字'.repeat(301) } }), env, new FakeCtx());
  assert.equal(long.status, 400);
  const empty = await worker.fetch(req('/v1/tts', { method: 'POST', token, body: { text: '  ' } }), env, new FakeCtx());
  assert.equal(empty.status, 400);
  await addUsage(env, user.id, { ttsChars: 20_000 });
  const lim = await worker.fetch(req('/v1/tts', { method: 'POST', token, body: { text: '你好' } }), env, new FakeCtx());
  assert.equal(lim.status, 429);
  assert.equal((await lim.json()).limit, 'monthly');
  const env2 = makeEnv();
  const s = await signIn(env2, worker);
  const r = await worker.fetch(req('/v1/tts', { method: 'POST', token: s.token, body: { text: '你好' } }), env2, new FakeCtx());
  assert.equal(r.status, 503);
});

test('stt: deepgram proxy meters seconds', async () => {
  const FETCH = fakeFetch({ 'api.deepgram.com': () => new Response(JSON.stringify({ metadata: { duration: 2.4 }, results: { channels: [{ alternatives: [{ transcript: '你好吗' }] }] } }), { status: 200 }) });
  const env = makeEnv({ STT_PROVIDER: 'deepgram', DEEPGRAM_API_KEY: 'dg', FETCH });
  const { token, user } = await signIn(env, worker);
  const ctx = new FakeCtx();
  const audio = new Uint8Array(1000);
  const r = await worker.fetch(req('/v1/stt?lang=zh', { method: 'POST', token, raw: audio, headers: { 'content-type': 'audio/webm;codecs=opus' } }), env, ctx);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { text: '你好吗', seconds: 3 });
  await ctx.done();
  assert.equal(env.DB.tables.usage.find((x) => x.user_id === user.id).stt_seconds, 3);
  assert.match(FETCH.calls[0].url, /language=zh-CN/);
  assert.equal(FETCH.calls[0].init.headers.authorization, 'Token dg');
  const bad = await worker.fetch(req('/v1/stt', { method: 'POST', token, raw: audio, headers: { 'content-type': 'text/plain' } }), env, new FakeCtx());
  assert.equal(bad.status, 415);
});
