# TWA Checklist (Spliceworld → Google Play)

Per RCJ Labs convention: browser → PWA (done in M7) → Trusted Web Activity.
Do this after v0.1 has been live on Pages for a bit.

## Prerequisites (already shipped)
- [x] PWA manifest (`manifest.webmanifest`) with standalone display + icons
- [x] Service worker (`sw.js`), cache-first for the versioned shell (R100)
- [x] HTTPS hosting (GitHub Pages)
- [x] Mobile-first layout (380px verified every milestone)
- [x] Saves in `localStorage` with `SAVE_VERSION` migrations, backed up to
      IndexedDB so seven days away does not cost a campaign (R100)

## Wrap it
1. `npm i -g @bubblewrap/cli` (tooling only — not a game dependency).
2. `bubblewrap init --manifest https://rcjlabs.github.io/Spliceworld/manifest.webmanifest`
   - Package id: `com.rcjlabs.spliceworld`
   - App name: Spliceworld
3. `bubblewrap build` → produces the signed `.aab` + `assetlinks.json`.
4. Publish `.well-known/assetlinks.json` at the site root (Pages: put it in
   the repo under `.well-known/`) with the signing-key fingerprint so the
   TWA opens fullscreen without browser chrome.
5. Play Console: internal testing track first; content rating questionnaire
   (cartoon violence: soldiers parachute away — answer honestly, it's mild);
   data safety: no data collected (saves are local).

## Before submitting

R100 turned three of these four boxes into commands. A box is an instruction to
a human and is the weakest rule this repo has; the ones below that could become
tooling, did.

- [x] **512×512 PNG export of `icon.svg`** for the Play listing (Play requires
      raster art for store assets even though the TWA uses the manifest icon).
      → `npm run assets` renders it from the same `icon.svg` the app ships.
- [x] **Screenshots at phone aspect.** → `npm run assets`, five screens at
      1080×1920 off a walked day-180 save, so the listing shows a ranch with
      animals in it rather than the founding dialog.
- [x] **Bump `CACHE` in `sw.js` with the release.** → `npm run release` checks
      it and `npm run release -- --fix` sets it. `CACHE` now carries a hash of
      the shell, so a release that changes a precached file and forgets the
      bump fails the build and names the files that moved. This matters more
      than it used to: under the old network-first worker a stale cache drained
      in ten minutes, and under cache-first it does not drain at all.

`dist/store/` is generated and gitignored. CLAUDE.md's "procedural SVG only, no
image files" governs what the *game* draws; a storefront's metadata is not that,
and generating the assets keeps both true.

- [ ] **Test the `.aab` on a real device**: saves persist, timers compute on
      resume, no dead zones at display cutouts.

      **This one cannot be automated and is not closed.** It needs an Android
      device, a JDK and the Android SDK for `bubblewrap build`, and a signing
      key — none of which exist in the environment the rest of this repo is
      built and verified in. It is the last box and it is a human holding a
      phone.

      What the suite CAN say about it, so the manual pass has less to find:
      - saves persist → `tools/durable.js` clears `localStorage` the way iOS
        does and requires a 2 MB save and its slot registry back.
      - timers compute on resume → `tools/smoke.js` runs the offline-tick path
        on every milestone; CLAUDE.md's "timers are timestamps, not intervals".
      - opens offline → `tools/offline.js` opens the app with the HTTP server
        closed and the network emulated down.
      - no dead zones at cutouts → nothing checks this. It is genuinely a
        device test, and it is what the device test is *for*.
