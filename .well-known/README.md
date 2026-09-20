# Digital Asset Links (`.well-known/assetlinks.json`)

This file tells Android that the app `com.senlinway.mandarin` is allowed to open
`https://forrest-jones.github.io/Mandarin-The-SenLin-Way/` without the browser
chrome (Trusted Web Activity). Until the fingerprint in it matches the certificate
Google signs our releases with, the TWA opens with a visible URL bar.

## Getting the SHA-256 fingerprint

1. Play Console → your app → **Setup → App signing** (older UI: *Release → Setup → App integrity*).
2. Under **App signing key certificate**, copy the **SHA-256 certificate fingerprint**
   (looks like `AB:CD:12:…`, 32 pairs of hex separated by colons).
3. Replace `REPLACE_WITH_SHA256_FROM_PLAY_CONSOLE` in `assetlinks.json` with it.
   Keep the colons and the uppercase; keep the JSON array brackets.

Two fingerprints are normal during testing: Play's app-signing key (production,
internal and closed testing tracks installed from Play) and your local upload key
(`bubblewrap build` debug installs). Add both entries to the array; extra
fingerprints are harmless.

    "sha256_cert_fingerprints": [
      "PLAY_APP_SIGNING_SHA256",
      "LOCAL_UPLOAD_KEY_SHA256"
    ]

To read the local upload key fingerprint:

    keytool -list -v -keystore android.keystore -alias senlin | grep SHA256

Bubblewrap also prints it at the end of `bubblewrap build` / `bubblewrap fingerprint list`.

## GitHub Pages and dot-folders

Jekyll drops folders that start with a dot. This repo has an empty `.nojekyll` file
at the root, so GitHub Pages publishes the site verbatim and `.well-known/` is
served exactly as committed. Keep `.nojekyll`; never delete it.

## Verifying

After the deploy finishes, these must both return HTTP 200 with `application/json`:

    curl -i https://forrest-jones.github.io/Mandarin-The-SenLin-Way/.well-known/assetlinks.json
    https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://forrest-jones.github.io&relation=delegate_permission/common.handle_all_urls

Note the statement file lives at the **origin root** as far as Android is concerned:
Android fetches `https://forrest-jones.github.io/.well-known/assetlinks.json`,
not the project sub-path. GitHub Pages for a user site (`forrest-jones.github.io`
repo) serves the origin root; a project site (this repo) serves only
`/Mandarin-The-SenLin-Way/`. So the file must ALSO be committed to the
`forrest-jones/forrest-jones.github.io` repository under `.well-known/` (with its
own `.nojekyll`). If that user-site repo does not exist yet, create it with just
`.nojekyll` and `.well-known/assetlinks.json`. This copy here documents the
content and is what the Capacitor build and the PWABuilder flow read.
