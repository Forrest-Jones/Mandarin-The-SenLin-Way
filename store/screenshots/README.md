# Store screenshots

Phone screenshots (1080 x 1920, portrait) of the live app for the Play Store / App Store listings.

## Capture

```sh
npm run serve            # optional: python3 -m http.server 8080 from the repo root
node tools/icons.js --screens
```

`--screens` starts `python3 -m http.server 8080` itself when nothing is listening on :8080,
opens a 360 x 640 CSS-pixel phone viewport at 3x device scale (= 1080 x 1920 output), visits
`#/`, `#/levels`, `#/business` and `#/talk`, and writes:

| file | route | caption |
| --- | --- | --- |
| `today.png` | `#/` — the Today page with the 10-minute lesson card | Ten minutes a day. One tree at a time. |
| `talk.png` | `#/talk` — the live tutor | Talk with a live AI tutor. |
| `levels.png` | `#/levels` — HSK 1 to 6 timeline | HSK 1 to 6, in order. |
| `business.png` | `#/business` — Deal Desk | Mandarin for the deal room. |

Each shot is framed with a caption band (the benefit, high contrast) above the phone view; upload
them to Play in the order above, benefit first. The frame is a signed-in Pro learner two weeks in,
with the API answered locally, so the capture needs no network.

Point it at another server with `--base http://host:port`. Google Fonts are fetched through
`curl` and served to the browser from there, so the hanzi render even where the browser
itself cannot reach the internet (sandboxes, proxies with private CAs).

Screenshots are captured with an empty profile (Day 1 = the default start date, nothing
completed). To show a "lived-in" app, open the local site in a normal browser first, do a few
lessons, export the backup from Settings, and import it before capturing — or set the Day 1
date in Settings to a few weeks back.

The same script without `--screens` renders the icons in `assets/` and
`store/feature-graphic-1024x500.png`.
