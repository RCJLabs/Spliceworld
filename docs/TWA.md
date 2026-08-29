# TWA Checklist (Spliceworld → Google Play)

Per RCJ Labs convention: browser → PWA (done in M7) → Trusted Web Activity.
Do this after v0.1 has been live on Pages for a bit.

## Prerequisites (already shipped)
- [x] PWA manifest (`manifest.webmanifest`) with standalone display + icons
- [x] Service worker (`sw.js`) with offline fallback
- [x] HTTPS hosting (GitHub Pages)
- [x] Mobile-first layout (380px verified every milestone)
- [x] Saves in `localStorage` with `SAVE_VERSION` migrations (survive TWA wrapper)

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
- [ ] Test the `.aab` on a real device: saves persist, timers compute on
      resume, no dead zones at display cutouts.
- [ ] 512×512 PNG export of `icon.svg` for the Play listing (Play requires
      raster art for store assets even though the TWA uses the manifest icon).
- [ ] Screenshots at phone aspect from the deployed site.
- [ ] Bump `CACHE` in `sw.js` with the release.
