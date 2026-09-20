#!/usr/bin/env node
/* Copies the static web app from the repo root into native/www/ for Capacitor.
   Usage: node scripts/copy-web.js   (or `npm run build` inside native/)
   Nothing is transformed: the same index.html + js + css that GitHub Pages serves
   is what ships inside the app. Only the listed entries are copied. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');   // repo root
const OUT = path.resolve(__dirname, '..', 'www');   // native/www

/* Files and folders to ship. Missing entries (e.g. audio/) are skipped quietly. */
const INCLUDE = [
  'index.html', 'privacy.html', 'terms.html',
  'css', 'js', 'assets', 'audio',
  'manifest.webmanifest', 'sw.js', 'daily.ics'
];

/* Never copied, even if nested inside an included folder. */
const SKIP = new Set(['node_modules', 'server', 'tests', 'tools', 'store', 'native', '.git', '.DS_Store']);

function copy(src, dest) {
  const name = path.basename(src);
  if (SKIP.has(name)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) copy(path.join(src, entry), path.join(dest, entry));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let copied = 0;
for (const entry of INCLUDE) {
  const src = path.join(ROOT, entry);
  if (!fs.existsSync(src)) { console.log(`  skip  ${entry} (not found)`); continue; }
  copy(src, path.join(OUT, entry));
  console.log(`  copy  ${entry}`);
  copied++;
}

/* The service worker is unnecessary inside the native shell (Capacitor serves files
   from disk). index.html only registers it on http(s) origins, and Capacitor's
   https scheme qualifies, so ship it but let it no-op: precaching a local origin is harmless. */

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error('copy-web: index.html was not copied. Run this from the native/ folder of the repo.');
  process.exit(1);
}
console.log(`Done: ${copied} entries → ${path.relative(process.cwd(), OUT) || 'www'}`);
