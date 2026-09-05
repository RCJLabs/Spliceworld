// Service worker (M7): network-first with cache fallback. Fresh deploys win
// whenever the network is up; offline play falls back to the last good
// build. Bump CACHE with SAVE_VERSION-sized releases so stale caches drain.
const CACHE = 'spliceworld-v43-r119';

const SHELL = [
  '.',
  'index.html',
  'style.css',
  'main.js',
  'manifest.webmanifest',
  'icon.svg',
  'util/rng.js',
  'save/save.js',
  'save/settings-ui.js',
  'render/renderer.js',
  'ui/picker.js',
  'ui/cards.js',
  'ui/tabs.js',
  'ui/roster.js',
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
  'ranch/onboarding.js',
  'ranch/ui.js',
  'splice/extract.js',
  'splice/facility.js',
  'splice/extract-ui.js',
  'splice/vault-ui.js',
  'splice/physiology.js',
  'splice/dossier.js',
  'battle/tagtext.js',
  'campaign/matchup.js',
  'campaign/sparring.js',
  'campaign/gauntlet.js',
  'splice/theater.js',
  'splice/chaos.js',
  'splice/temperament.js',
  'splice/scars.js',
  'splice/feral.js',
  'splice/rush.js',
  'splice/theater-ui.js',
  'splice/pens-ui.js',
  'splice/dex-ui.js',
  'splice/dexentry.js',
  'battle/ai.js',
  'battle/moves.js',
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
  'campaign/operations.js',
  'campaign/rehab.js',
  'campaign/taskforce.js',
  'campaign/contest.js',
  'campaign/rivals.js',
  'campaign/director.js',
  'campaign/wire.js',
  'campaign/world.js',
  'campaign/warroom.js',
  'campaign/ui.js',
  'audio/sfx.js',
  'data/breakout.json',
  'data/taskforce.json',
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
  'data/guides.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
