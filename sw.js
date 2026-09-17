// Service worker. CACHE-FIRST for the versioned shell, network-first for
// everything else, and the cache name IS the version.
//
// R100 — WHY IT TURNED ROUND. M7 shipped this network-first and R81 filed the
// consequence as a known issue without a number on it. Measured, cold open,
// app already cached, timed to the moment a screen first holds a game:
//
//     wire cut      125ms     0 requests reached the server
//     server +0ms   200ms    85
//     server +150ms 2414ms   85
//     server +300ms 4683ms   85
//
// OFFLINE WAS THE CASE NETWORK-FIRST ACCIDENTALLY HANDLED — a dead port
// refuses instantly, so all 85 failures cost 125ms between them. The case it
// did not handle is the ordinary one: a phone with a signal, where a request
// does not fail, it waits. At 300ms of latency the game took 4.7 seconds to
// appear from a disk it was already on, 37x slower than with the wire cut.
//
// THE COST OF TURNING IT ROUND, stated rather than discovered later: a deploy
// now lands on the NEXT open rather than this one. The browser revalidates
// this file on every navigation, so a changed CACHE installs a new worker,
// which refetches the whole shell and claims the page — but the page being
// looked at was already served from the old one. R122b's gate asserts exactly
// this and is updated to two opens with the reason written beside it.
//
// WHICH MAKES THE BUMP LOAD-BEARING. Under network-first a forgotten CACHE
// bump cost ten minutes of staleness; under cache-first it is indefinite,
// which is R122's original bug report — a phone stuck on a broken build.
// `tools/release.js` is the answer and exists for this: CACHE is checked
// against SAVE_VERSION by a gate rather than by anybody remembering.
const CACHE = 'spliceworld-v56-aed5f3a9';

const SHELL = [
  '.',
  'index.html',
  'style.css',
  'main.js',
  'manifest.webmanifest',
  'icon.svg',
  'util/rng.js',
  'save/save.js',
  'save/migrations.js',
  'save/slots.js',
  'save/durable.js',
  'save/settings-ui.js',
  'render/renderer.js',
  'render/mood.js',
  'ui/picker.js',
  'ui/cards.js',
  'ui/patch.js',
  'ui/tabs.js',
  'ui/roster.js',
  'ui/pager.js',
  'ui/facility-card.js',
  'ui/icons.js',
  'ui/focus.js',
  'ui/live.js',
  'ui/theme.js',
  'data/loader.js',
  'data/catalog.js',
  'campaign/breakout.js',
  'ranch/ranch.js',
  'ranch/breeding.js',
  'ranch/agenda.js',
  'ranch/founding-ui.js',
  'ranch/onboarding.js',
  'ranch/ui.js',
  'splice/extract.js',
  'splice/facility.js',
  'splice/extract-ui.js',
  'splice/vault-ui.js',
  'splice/physiology.js',
  'splice/dossier.js',
  'battle/autoplay.js',
  'battle/tagtext.js',
  'campaign/matchup.js',
  'campaign/sparring.js',
  'campaign/gauntlet.js',
  'splice/theater.js',
  'splice/card.js',
  'splice/chimera.js',
  'splice/grades.js',
  'splice/vault.js',
  'splice/chaos.js',
  'splice/temperament.js',
  'splice/scars.js',
  'splice/feral.js',
  'splice/rush.js',
  'splice/theater-ui.js',
  'splice/tier.js',
  'splice/pens-ui.js',
  'splice/dex-ui.js',
  'splice/dexentry.js',
  'battle/ai.js',
  'battle/moves.js',
  'battle/move-text.js',
  'splice/resequencer.js',
  'battle/readout.js',
  'battle/forecast.js',
  'battle/veterancy.js',
  'battle/engine.js',
  'battle/statblock.js',
  'battle/ui.js',
  'campaign/campaign.js',
  'campaign/map.js',
  'campaign/monologue.js',
  'campaign/identity.js',
  'campaign/operations.js',
  'campaign/rehab.js',
  'campaign/taskforce.js',
  'campaign/legacy.js',
  'campaign/calendar.js',
  'ui/sky.js',
  'campaign/contest.js',
  'campaign/rivals.js',
  'campaign/visiting.js',
  'campaign/director.js',
  'campaign/wire.js',
  'campaign/world.js',
  'campaign/digest.js',
  'ui/welcome.js',
  'campaign/warroom.js',
  'campaign/ui.js',
  'audio/sfx.js',
  'data/breakout.json',
  'data/taskforce.json',
  'data/legacy.json',
  'data/cards.json',
  'data/calendar.json',
  'data/frames.json',
  'data/resequencer.json',
  'data/training.json',
  'data/gauntlet.json',
  'data/news.json',
  'data/parts.json',
  // R81: the geometry, split out of parts.json and enemies.json and fetched
  // after the first paint. Still precached — offline needs the pictures too,
  // it just does not need them before the shell is on screen.
  'data/parts-shapes.json',
  'data/enemies-shapes.json',
  'data/species.json',
  'data/combos.json',
  'data/enemies.json',
  'data/keywords.json',
  'data/regions.json',
  'data/traits.json',
  'data/classes.json',
  'data/rivals.json',
  'data/director.json',
  'data/facility.json',
  'data/philosophies.json',
  'data/operations.json',
  'data/chaos.json',
  'data/temperament.json',
  'data/scars.json',
  'data/feral.json',
  'data/rush.json',
  'data/stance.json',
  'data/starters.json',
  'data/tiers.json',
  'data/guides.json',
];

// R100 — `cache: 'reload'` on every shell entry, for R122b's reason one layer
// up: `cache.addAll` fetches through the browser's HTTP cache, and Pages sends
// the shell with `max-age=600`, so a worker installing inside that window
// would fill its brand-new versioned cache with the PREVIOUS build.
//
// AND IT IS BELT AND BRACES, WHICH THE BATTERY ESTABLISHED RATHER THAN THE
// REASONING. Break 112 was pointed here and went MISSED twice, the second time
// against a gate reordered specifically so install ran with the old file still
// in the HTTP cache. Whatever a stale install caches, the revalidation below
// replaces on the next open, so from outside the two are indistinguishable.
// This line stays because it is correct and costs nothing — it just is not
// what holds the rule up. The revalidation is; break 112 aims there now.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// R122b — REVALIDATE, or "network-first" is a lie for ten minutes after every
// deploy. A plain `fetch(request)` reads through the BROWSER's HTTP cache, and
// GitHub Pages serves the shell with `Cache-Control: max-age=600` — so for ten
// minutes after a push this returned the old file while believing it had gone
// to the network, and then wrote that stale copy into the freshly-named cache,
// where it outlived the ten minutes. `cache: 'no-cache'` forces a conditional
// request instead: a changed file comes back 200 with new bytes, an unchanged
// one 304 with almost none.
//
// R100 KEEPS THAT EXACTLY AS IT WAS and changes only WHEN it runs. For a shell
// entry the conditional request now happens AFTER the response has already
// gone to the page, instead of in front of it. Same request, same headers,
// same freshness; it is no longer on the critical path.
const revalidate = (request) => fetch(request, { cache: 'no-cache' })
  .then((response) => {
    // An error page must never be written over a good cached copy: a 502 from
    // a proxy is not a new build, and caching it would brick the app until the
    // next CACHE bump.
    if (response && response.ok) {
      const copy = response.clone();
      return caches.open(CACHE).then((cache) => cache.put(request, copy)).then(() => response);
    }
    return response;
  })
  // Offline, or a browser that refuses the `cache` option. Either way the
  // cached copy the page already has is still the right answer.
  .catch(() => null);

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      // THE SHELL: answer now, check later. `caches.match` hitting IS the
      // definition of "an entry this browser already has" — there is no second
      // list of paths to keep in step with SHELL above, which is R157's break
      // 152 (one constant, one home, however many readers).
      if (cached) {
        event.waitUntil(revalidate(event.request));
        return cached;
      }
      // EVERYTHING ELSE: unchanged from M7. Anything not precached is either
      // new since the last release or not ours, and for both of those the
      // network is the right first question.
      return fetch(event.request, { cache: 'no-cache' })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => fetch(event.request).catch(() => null))
        .then((r) => r ?? caches.match(event.request, { ignoreSearch: true }));
    })
  );
});
