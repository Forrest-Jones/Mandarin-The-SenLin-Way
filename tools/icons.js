#!/usr/bin/env node
/* Mandarin The SenLin Way — icon, store-graphic and screenshot renderer.

   node tools/icons.js            renders assets/icon-*.png, assets/apple-touch-icon.png and
                                  store/feature-graphic-1024x500.png from an inline HTML brand mark
   node tools/icons.js --screens  screenshots #/, #/levels, #/business and #/talk at 1080x1920
                                  (phone, 3x) from the local server into store/screenshots/*.png
                                  (starts `python3 -m http.server 8080` itself when nothing is
                                  listening; override with --base http://host:port)

   The 森 glyph comes from, in order of preference:
     1. Google Fonts' one-character Noto Sans SC subset, fetched with curl and embedded as a
        data: URI (so the rendering is identical on every machine that can reach the network);
     2. a CJK font installed on the system (fc-list :lang=zh);
     3. a stylised three-tree logo drawn with SVG — never a tofu box.
   Playwright is resolved from the project's node_modules first, then from the global install. */
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const { execFileSync, spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GREEN = '#14a066', G1 = '#2f7d4f', G2 = '#0b1f15';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* ------------------------------------------------------------ playwright */
function loadPlaywright() {
  const candidates = ['playwright', '/opt/node22/lib/node_modules/playwright'];
  module.paths.push('/opt/node22/lib/node_modules');
  for (const c of candidates) { try { return require(c); } catch (e) { /* try next */ } }
  throw new Error('playwright not found: run `npm i -D playwright` or install it globally');
}
function findChromium() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean);
  for (const r of roots) {
    const direct = path.join(r, 'chromium');
    if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
    if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r).filter(n => /^chromium-\d+$/.test(n)).sort().reverse()) {
      const bin = path.join(r, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return null;
}
async function launch(pw) {
  try { return await pw.chromium.launch(); } catch (e) {
    const executablePath = findChromium();
    if (!executablePath) throw e;
    console.warn('chromium.launch() failed (' + e.message.split('\n')[0] + '); retrying with ' + executablePath);
    return pw.chromium.launch({ executablePath });
  }
}

/* ------------------------------------------------------------ network via curl (honours the proxy + CA bundle) */
function curl(url, opts = {}) {
  const args = ['-sS', '-L', '--max-time', String(opts.timeout || 20), '-A', UA, '-H', 'Accept: */*', url];
  return execFileSync('curl', args, { maxBuffer: 64 * 1024 * 1024 });
}
const fontCache = new Map();
function fetchFontCSS(family, weights, text) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weights.join(';')}&text=${encodeURIComponent(text)}`;
  const css = curl(url).toString('utf8');
  if (!/@font-face/.test(css)) throw new Error('no @font-face in response');
  return css.replace(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g, (m, u) => {
    if (!fontCache.has(u)) fontCache.set(u, 'data:font/woff2;base64,' + curl(u).toString('base64'));
    return `url(${fontCache.get(u)})`;
  });
}
function systemCJK() {
  try {
    const out = execFileSync('fc-list', [':lang=zh', 'family'], { encoding: 'utf8' }).split('\n').map(s => s.split(',')[0].trim()).filter(Boolean);
    const pref = out.find(f => /Noto (Sans|Serif) CJK|Source Han|WenQuanYi Zen Hei$|WenQuanYi Micro Hei|Droid Sans Fallback/i.test(f)) || out.find(f => !/unifont/i.test(f)) || out[0];
    return pref || null;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------ the mark */
// Three stylised trees (the 森 idea: 木木木) for machines with neither network nor a CJK font.
const TREES_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="#fff">
  <path d="M50 12 L66 40 H58 L70 58 H56 V74 H44 V58 H30 L42 40 H34 Z"/>
  <path d="M22 44 L32 62 H27 L36 76 H27 V88 H17 V76 H8 L17 62 H12 Z"/>
  <path d="M78 44 L88 62 H83 L92 76 H83 V88 H73 V76 H64 L73 62 H68 Z"/>
</svg>`;

async function resolveMark(page) {
  // 1. Google Fonts subset (森 in Noto Sans SC 900)
  try {
    const css = fetchFontCSS('Noto Sans SC', [900], '森');
    return { mode: 'google-fonts subset (Noto Sans SC 900, embedded)', css: css.replace(/font-family: '[^']+'/g, "font-family: 'SenLinMark'"), family: 'SenLinMark', glyph: true };
  } catch (e) { console.warn('Google Fonts subset unavailable (' + e.message.split('\n')[0] + ')'); }
  // 2. an installed CJK font
  const sys = systemCJK();
  if (sys) return { mode: 'system font ' + sys, css: '', family: sys, glyph: true };
  // 3. the three-tree logo
  return { mode: 'three-tree SVG fallback (no CJK font available)', css: '', family: 'sans-serif', glyph: false };
}

// Is the glyph a real 森 or a tofu box? Compare against a private-use codepoint, which no font covers.
async function glyphRenders(page, family) {
  return page.evaluate(async fam => {
    await document.fonts.ready;
    const draw = ch => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.font = `900 48px "${fam}", sans-serif`; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText(ch, 32, 32); return Array.from(x.getImageData(0, 0, 64, 64).data); };
    const a = draw('森'), b = draw('\uE000');
    let diff = 0, ink = 0; for (let i = 3; i < a.length; i += 4) { if (a[i] !== b[i]) diff++; if (a[i]) ink++; }
    return ink > 50 && diff > 50;
  }, family);
}

function markHTML(size, { rounded, maskable, mark, scale = 1 }) {
  const w = size * scale;
  const glyph = mark.glyph
    ? `<span class="hz">森</span>`
    : `<span class="trees">${TREES_SVG}</span>`;
  const inner = maskable ? 0.6 : 0.74;
  return `<!doctype html><meta charset="utf-8"><style>
    ${mark.css}
    html,body{margin:0;background:transparent}
    .tile{width:${w}px;height:${w}px;display:flex;align-items:center;justify-content:center;
      background:${maskable ? GREEN : `linear-gradient(135deg, ${G1}, ${G2})`};
      border-radius:${rounded ? Math.round(w * 14 / 64) : 0}px;overflow:hidden}
    .hz{font-family:"${mark.family}","Noto Sans SC","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Zen Hei",sans-serif;font-weight:900;color:#fff;
      font-size:${Math.round(w * inner)}px;line-height:1;display:block;transform:translateY(${maskable ? 0.02 : 0.03}em)}
    .trees{display:block;width:${Math.round(w * inner)}px;height:${Math.round(w * inner)}px}
    .trees svg{width:100%;height:100%}
  </style><div class="tile">${glyph}</div>`;
}

function featureHTML(mark, fonts) {
  const glyph = mark.glyph ? `<div class="big">森</div>` : `<div class="big trees">${TREES_SVG}</div>`;
  return `<!doctype html><meta charset="utf-8"><style>
    ${mark.css} ${fonts}
    html,body{margin:0}
    .g{width:1024px;height:500px;position:relative;overflow:hidden;background:linear-gradient(120deg, ${G1} 0%, #1b5636 45%, ${G2} 100%);color:#fff;font-family:Nunito,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
    .big{position:absolute;left:56px;top:50%;transform:translateY(-50%);font-family:"${mark.family}","Noto Sans SC","WenQuanYi Zen Hei",sans-serif;font-weight:900;font-size:340px;line-height:1;text-shadow:0 12px 40px rgba(0,0,0,.35)}
    .big.trees{width:340px;height:340px}.big.trees svg{width:100%;height:100%}
    .txt{position:absolute;left:440px;top:0;bottom:0;right:48px;display:flex;flex-direction:column;justify-content:center;gap:18px}
    h1{margin:0;font-size:64px;line-height:1.05;font-weight:800;letter-spacing:-.01em}
    p{margin:0;font-size:29px;line-height:1.35;font-weight:600;opacity:.92}
    .pill{align-self:flex-start;margin-top:8px;padding:8px 18px;border-radius:999px;background:rgba(255,255,255,.14);font-size:20px;font-weight:700;letter-spacing:.04em}
    .ring{position:absolute;right:-180px;bottom:-260px;width:560px;height:560px;border-radius:50%;border:80px solid rgba(255,255,255,.05)}
  </style><div class="g"><div class="ring"></div>${glyph}
    <div class="txt"><h1>Mandarin The SenLin Way</h1><p>Building your Mandarin Word Forest, one tree at a time.</p><span class="pill">10 MINUTES A DAY · HSK 1 → 6</span></div></div>`;
}

// Skia dithers CSS gradients, which defeats PNG compression. Read the pixels back, drop the noise
// (6 bits per channel) and encode the PNG ourselves with Paeth filtering and maximum deflate:
// visually identical, roughly half the size of the browser's own encoder.
async function quantize(page, png, w, h) {
  const b64 = await page.evaluate(([src, w, h]) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, w, h).data; let s = '';
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
      res(btoa(s));
    };
    img.onerror = rej; img.src = src;
  }), ['data:image/png;base64,' + png.toString('base64'), w, h]);
  const px = Buffer.from(b64, 'base64');
  for (let i = 0; i < px.length; i++) px[i] = Math.min(255, Math.round(px[i] / 4) * 4);
  const out = encodePNG(px, w, h);
  if (process.env.ICONS_DEBUG) console.log('quantize', png.length, '->', out.length);
  return out.length < png.length ? out : png;
}
function encodePNG(px, w, h) {
  const zlib = require('zlib');
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 4; // Paeth
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? px[y * stride + i - 4] : 0, b = y ? px[(y - 1) * stride + i] : 0, c = (y && i >= 4) ? px[(y - 1) * stride + i - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[y * (stride + 1) + 1 + i] = (px[y * stride + i] - pred) & 255;
    }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

async function shoot(page, html, w, h, file, scale = 1) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const raw = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true });
  const buf = await quantize(page, raw, w, h);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`${path.relative(ROOT, file)}  ${w * scale}x${h * scale}  ${(buf.length / 1024).toFixed(1)} KB`);
}

async function renderIcons() {
  const pw = loadPlaywright();
  const browser = await launch(pw);
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  let mark = await resolveMark(page);
  if (mark.glyph) {
    await page.setContent(`<!doctype html><style>${mark.css}</style><span style="font-family:'${mark.family}'">森</span>`);
    if (!(await glyphRenders(page, mark.family))) {
      console.warn('森 did not render with ' + mark.mode + '; using the three-tree logo');
      mark = { mode: 'three-tree SVG fallback (glyph missing)', css: '', family: 'sans-serif', glyph: false };
    }
  }
  console.log('mark: ' + mark.mode);

  let fonts = '';
  try { fonts = fetchFontCSS('Nunito', [600, 800], 'Mandarin The SenLin Way Building your Word Forest, one tree at a time.10MINUTESADYHSK→6'); }
  catch (e) { console.warn('Nunito unavailable, using system sans-serif'); }

  const A = p => path.join(ROOT, 'assets', p);
  await shoot(page, markHTML(192, { rounded: true, mark }), 192, 192, A('icon-192.png'));
  await shoot(page, markHTML(512, { rounded: true, mark }), 512, 512, A('icon-512.png'));
  await shoot(page, markHTML(192, { maskable: true, mark }), 192, 192, A('icon-maskable-192.png'));
  await shoot(page, markHTML(512, { maskable: true, mark }), 512, 512, A('icon-maskable-512.png'));
  await shoot(page, markHTML(180, { rounded: false, mark }), 180, 180, A('apple-touch-icon.png'));
  await shoot(page, featureHTML(mark, fonts), 1024, 500, path.join(ROOT, 'store', 'feature-graphic-1024x500.png'));
  await browser.close();
}

/* ------------------------------------------------------------ screenshots */
function listening(port) {
  return new Promise(res => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
}
async function ensureServer(base) {
  const port = Number(new URL(base).port || 80);
  if (await listening(port)) return null;
  const child = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await listening(port)); i++) await new Promise(r => setTimeout(r, 100));
  console.log('started python3 -m http.server ' + port);
  return child;
}
// Chromium in a sandbox may not trust the egress proxy's CA; curl does. Serve Google Fonts through it.
async function routeFontsThroughCurl(context) {
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, async route => {
    try {
      const url = route.request().url();
      const body = curl(url, { timeout: 30 });
      route.fulfill({ status: 200, body, headers: { 'content-type': /googleapis/.test(url) ? 'text/css' : 'font/woff2', 'access-control-allow-origin': '*' } });
    } catch (e) { route.abort(); }
  });
}
async function renderScreens(base) {
  const pw = loadPlaywright();
  const server = await ensureServer(base);
  const browser = await launch(pw);
  try {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light', locale: 'en-GB' });
    await routeFontsThroughCurl(ctx);
    // Store shots show a signed-in Pro learner a couple of weeks in, with the API answered locally (no network in CI).
    await ctx.route(/\/v1\//, route => {
      const u = route.request().url();
      const body = /\/v1\/health/.test(u) ? { ok: true, ready: true, providers: { ai: true, tts: true, stt: true, email: true } }
        : /\/v1\/entitlement/.test(u) ? { plan: 'pro', expiresAt: null, features: { ai: true, hsk3plus: true, dealDesk: true } }
        : /\/v1\/me/.test(u) ? { user: { id: 'demo', email: 'you@example.com', plan: 'pro' }, plan: 'pro' }
        : /\/v1\/sync\/pull/.test(u) ? { version: 0, data: null }
        : { ok: true };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await ctx.addInitScript(() => {
      try {
        const d = new Date(); d.setDate(d.getDate() - 14);
        localStorage.setItem('senlin.settings', JSON.stringify({ startDate: d.toISOString().slice(0, 10) }));
        const completed = {}; for (let i = 1; i <= 14; i++) completed[i] = new Date(Date.now() - (15 - i) * 864e5).toISOString().slice(0, 10);
        localStorage.setItem('senlin.progress', JSON.stringify({ completed, streak: 14, reviews: { total: 42, good: 37 }, quiz: { total: 60, right: 54 } }));
        localStorage.setItem('senlin.auth', JSON.stringify({ token: 'demo', user: { id: 'demo', email: 'you@example.com', plan: 'pro' }, plan: 'pro', expiresAt: null }));
      } catch (e) { /* ignore */ }
    });
    const page = await ctx.newPage();
    const shots = [['', 'today'], ['levels', 'levels'], ['business', 'business'], ['talk', 'talk']];
    for (const [route, name] of shots) {
      await page.goto(`${base}/#/${route}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.querySelector('#app') && document.querySelector('#app').children.length > 0);
      await page.waitForTimeout(400);
      const file = path.join(ROOT, 'store', 'screenshots', `${name}.png`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const buf = await page.screenshot({ type: 'png', fullPage: false });
      fs.writeFileSync(file, buf);
      console.log(`${path.relative(ROOT, file)}  1080x1920  ${(buf.length / 1024).toFixed(1)} KB`);
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
}

/* ------------------------------------------------------------ main */
(async () => {
  const args = process.argv.slice(2);
  const base = (args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:8080').replace(/\/$/, '');
  if (args.includes('--screens')) await renderScreens(base); else await renderIcons();
})().catch(e => { console.error(e); process.exit(1); });
