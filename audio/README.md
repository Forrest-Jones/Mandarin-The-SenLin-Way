# Pre-generated audio

This folder holds licensed, pre-generated MP3 pronunciations for every character, word,
sentence, grammar example, scenario opener, Deal Desk term/phrase/dialogue line and
pronunciation drill the site can speak, plus `index.json` describing them. The files are
produced once with `node tools/audio.js` and committed (or uploaded to the same host), so
the site no longer depends on whichever voice a visitor's browser happens to have.

## Licensing

The audio is synthesised with a commercial neural voice and then owned by this project:

- **Azure AI Speech (text to speech)** — synthesised audio may be used in your own
  applications and content, including public websites, under the Microsoft product terms
  for Azure Cognitive Services. Neural voices cost about **US$16 per 1M characters**.
- **Google Cloud Text-to-Speech** — audio may likewise be used in your own products under
  the Google Cloud terms of service. WaveNet voices cost about **US$16 per 1M characters**.

Both providers bill per character sent, not per download, and neither claims rights over
the output. Keep the invoice (and the run summary that `tools/audio.js` prints) with the
project as proof of licence. Do not swap in audio scraped from an unlicensed source.

The whole curriculum is roughly 40,000 characters (≈ 10,700 requests including the slow
variants): under US$2 with either provider. Run `node tools/audio.js --dry-run` for the
current numbers.

## How to run

```sh
# see what would be synthesised, per kind, and the estimated cost (no network)
node tools/audio.js --dry-run

# Azure
export AZURE_TTS_KEY=...  AZURE_TTS_REGION=eastasia        # AZURE_TTS_VOICE defaults to zh-CN-XiaoxiaoNeural
node tools/audio.js --provider azure

# Google
export GOOGLE_TTS_KEY=...                                  # GOOGLE_TTS_VOICE defaults to cmn-CN-Wavenet-A
node tools/audio.js --provider google

# subsets
node tools/audio.js --levels 1,2 --kinds chars,words,sentences   # HSK 1–2 only
node tools/audio.js --kinds business,pinyin,ui                    # everything that is not level-bound
node tools/audio.js --limit 20                                    # smoke test: first 20 utterances
node tools/audio.js --force                                       # regenerate files that already exist
node tools/audio.js --out /path/to/audio                          # write elsewhere (default: audio/)
```

Kinds: `chars`, `words`, `sentences`, `grammar`, `scenarios`, `business`, `pinyin`, `ui`
(all by default). The run is incremental: ids already present in `index.json` whose file
exists are skipped, so a failed or interrupted run can simply be re-run. Requests go four at
a time with retry and backoff on 429/5xx; `index.json` is saved every 50 files and on Ctrl-C.

Output:

- `audio/<id>.mp3` — the utterance at normal speed.
- `audio/<id>-slow.mp3` — a 0.7× version, produced for sentences only (level sentences,
  grammar examples, scenario openers, Deal Desk phrases and dialogue lines).
- `audio/index.json`:

  ```json
  {"version":1,"provider":"azure","voice":"zh-CN-XiaoxiaoNeural",
   "items":{"a1b2c3d4e5f60718":{"t":"你好，我是森林。","d":1840,"s":1}}}
  ```

  `t` is the exact text, `d` the duration in milliseconds (omitted if unknown), and `s: 1`
  marks that a `-slow.mp3` exists.

Azure output format is `audio-24khz-48kbitrate-mono-mp3`; Google returns MP3 as base64.
Expect ~10 KB per short utterance, ~30 KB per sentence: the whole set is on the order of
100–150 MB, which is why the files are not tracked in git by default (`.gitkeep` keeps the
folder). Commit them, publish them with a release, or host them on any static origin and
point the client at it.

## Client lookup rule

The site loads `audio/index.json` once. For a text `T` it computes

```js
id = hex(sha256(utf8(T))).slice(0, 16)
```

(Web Crypto: `crypto.subtle.digest('SHA-256', new TextEncoder().encode(T))`) and, if
`index.items[id]` exists, plays `audio/<id>.mp3` — or `audio/<id>-slow.mp3` when a slow
rate is requested and `index.items[id].s` is set. Any text without an entry (tutor replies,
user input) falls back to the browser voice or the online voice as today. The text is hashed
exactly as passed to `tts.speak()`, trimmed, so the pipeline mirrors the site's own text
transformations (for example pronunciation drills have their `(…)` hints and `→` arrows
removed first). `tools/review.js` uses the same id, so a sentence can be traced from a
reviewer's CSV to its audio file.
