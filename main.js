// M0 dev harness: the Splice Slab. Assemble a genome, watch it render,
// reload the page, watch it persist. This screen grows into the real
// Surgery Theater in M3 — the renderer and save flow underneath are final.

import { loadContent } from './data/loader.js';
import { loadSave, saveGame, SAVE_VERSION } from './save/save.js';
import { renderCreatureSVG, SLOTS } from './render/renderer.js';
import { rngStream, pick } from './util/rng.js';
import { ensureRanchSeeded, applyElapsed } from './ranch/ranch.js';
import { renderRanchScreen } from './ranch/ui.js';
import { runExtraction } from './splice/extract-ui.js';
import { renderVaultScreen } from './splice/vault-ui.js';

// Dev time-warp: ?warp=48 pretends 48 hours have passed. QA-only — the
// warp lives in the URL, never in the save, so removing it can produce a
// lastTickAt in the future; applyElapsed clamps that to zero elapsed.
const WARP_MS = (Number(new URLSearchParams(location.search).get('warp')) || 0) * 3600000;
const NOW = () => Date.now() + WARP_MS;

const SLOT_LABELS = {
  head: 'Head',
  forelimbs: 'Forelimbs',
  hindlimbs: 'Hindlimbs',
  tail: 'Tail',
  hide: 'Hide',
  organ: 'Organ',
};

const NICKNAMES = [
  'Chompers', 'Bessie 2.0', 'Kevin', 'Dr. Fluffles', 'Beefsquawk',
  'Sir Hornsalot', 'Nibbles', 'The Intern', 'Gerald', 'Snack Hazard',
  'Mildred', 'Captain Wiggles', 'Exhibit A', 'Prototype Dave', 'Ms. Chaos',
];

const TICKER_LINES = [
  'Local zoo reports goat shortage. Authorities baffled.',
  'Feed store owner retires early, thanks "one extremely loyal customer."',
  'Study finds ranch animals happiest when brushed by cackling owners.',
  'Mail-order livestock industry booming. Postal service requests hazard pay.',
  'Area geneticist "just asking questions" about eagle wingspans.',
  'Hardware store sells out of googly eyes. No one is asking why.',
  'Weather service issues advisory for "unusually confident livestock."',
  'City council votes to pretend everything is normal.',
  'Nearby farm insists its bear was "always shaped like that."',
  'Ethics board postpones meeting indefinitely, cites scheduling.',
  'Mysterious kazoo noises reported near old barn. Investigation pending.',
];

// The M0 acceptance creature: a bear-headed, eagle-winged goat.
function acceptanceGenome() {
  return {
    frame: 'M',
    parts: {
      head: 'bear_head',
      forelimbs: 'eagle_forelimbs',
      hindlimbs: 'goat_hindlimbs',
      tail: 'goat_tail',
      hide: 'goat_hide',
      organ: 'goat_organ',
    },
  };
}

const $ = (sel) => document.querySelector(sel);

let content;
let state;

function describeRecipe(genome) {
  const bits = [];
  for (const slot of SLOTS) {
    const partId = genome.parts[slot];
    if (!partId) continue;
    const part = content.parts[partId];
    const species = content.species[part.species];
    bits.push(`${species.name.toUpperCase()} ${SLOT_LABELS[slot].toLowerCase()}`);
  }
  const frame = content.frames[genome.frame];
  return `${frame.name} (${frame.sizeClass}) · ${bits.join(' × ') || 'no parts — a very shy specimen'}`;
}

function persistAndPaint() {
  const ok = saveGame(state);
  $('#creature-stage').innerHTML = renderCreatureSVG(state.genome, content);
  $('#nickname').textContent = state.nickname;
  $('#recipe').textContent = describeRecipe(state.genome);
  $('#save-info').textContent = ok
    ? `Saved ✓ · v${SAVE_VERSION} · lab founded ${new Date(state.createdAt).toLocaleString()} · splices: ${state.spliceCount}`
    : 'Save failed — check storage permissions';
  syncControls();
}

function syncControls() {
  document.querySelectorAll('#frame-picker button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.frame === state.genome.frame);
  });
  for (const slot of SLOTS) {
    const sel = $(`#slot-${slot}`);
    if (sel) sel.value = state.genome.parts[slot] ?? '';
  }
}

function recordDirectorStats(genome) {
  // AI-director stub (ROADMAP §3.7): just count part usage for now.
  for (const partId of Object.values(genome.parts)) {
    if (!partId) continue;
    state.directorStats.partUse[partId] = (state.directorStats.partUse[partId] ?? 0) + 1;
    const part = content.parts[partId];
    for (const tag of content.species[part.species].tags) {
      state.directorStats.tagUse[tag] = (state.directorStats.tagUse[tag] ?? 0) + 1;
    }
  }
}

function randomSplice() {
  const rng = rngStream(state.seed, 'splice', state.spliceCount);
  state.spliceCount += 1;

  const genome = { frame: pick(rng, Object.keys(content.frames)), parts: {} };
  const partsBySlot = {};
  for (const part of Object.values(content.parts)) {
    (partsBySlot[part.slot] ??= []).push(part.id);
  }
  for (const slot of SLOTS) {
    const pool = partsBySlot[slot] ?? [];
    if (!pool.length) continue;
    // Heads are mandatory: every abomination deserves googly eyes.
    if (slot === 'head' || rng() < 0.85) genome.parts[slot] = pick(rng, pool);
  }
  state.genome = genome;
  state.nickname = pick(rng, NICKNAMES);
  recordDirectorStats(genome);
  $('#ticker').textContent = pick(rng, TICKER_LINES);
  persistAndPaint();
}

function buildControls() {
  const framePicker = $('#frame-picker');
  for (const frame of Object.values(content.frames)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.frame = frame.id;
    btn.textContent = `${frame.sizeClass} · ${frame.name}`;
    btn.title = frame.flavor;
    btn.addEventListener('click', () => {
      state.genome.frame = frame.id;
      persistAndPaint();
    });
    framePicker.appendChild(btn);
  }

  const grid = $('#slot-grid');
  for (const slot of SLOTS) {
    const wrap = document.createElement('label');
    wrap.className = 'slot';
    const caption = document.createElement('span');
    caption.textContent = SLOT_LABELS[slot];
    const sel = document.createElement('select');
    sel.id = `slot-${slot}`;
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— empty socket —';
    sel.appendChild(none);
    for (const part of Object.values(content.parts)) {
      if (part.slot !== slot) continue;
      const opt = document.createElement('option');
      opt.value = part.id;
      opt.textContent = `${part.name} (${part.ability})`;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      state.genome.parts[slot] = sel.value || null;
      persistAndPaint();
    });
    wrap.append(caption, sel);
    grid.appendChild(wrap);
  }

  $('#btn-random').addEventListener('click', randomSplice);
}

const ranchCtx = {
  get state() { return state; },
  get content() { return content; },
  now: NOW,
  save: () => saveGame(state),
  onExtract: (animalId) =>
    runExtraction($('#overlay'), ranchCtx, animalId, () => showScreen(state.activeScreen)),
};

const SCREENS = ['ranch', 'vault', 'slab'];

function showScreen(name) {
  if (!SCREENS.includes(name)) name = 'ranch';
  state.activeScreen = name;
  saveGame(state);
  for (const s of SCREENS) $(`#screen-${s}`).hidden = s !== name;
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.screen === name);
  });
  if (name === 'ranch') tickRanch();
  if (name === 'vault') renderVaultScreen($('#screen-vault'), ranchCtx);
}

// Timestamps, not intervals: recompute elapsed effects on load, on focus,
// and on a slow display refresh while the ranch is visible.
function tickRanch() {
  applyElapsed(state, content, NOW());
  saveGame(state);
  if (!$('#screen-ranch').hidden) renderRanchScreen($('#screen-ranch'), ranchCtx);
}

async function boot() {
  try {
    content = await loadContent('.');
  } catch (err) {
    document.querySelector('main').innerHTML =
      `<p class="boot-error">Could not load content data (${err.message}). ` +
      `If you opened index.html directly, serve it instead: <code>python3 -m http.server</code></p>`;
    return;
  }

  state = loadSave();
  if (!state.genome) {
    state.genome = acceptanceGenome();
    state.nickname = 'Chompers';
    recordDirectorStats(state.genome);
  }
  state.nickname ??= 'Chompers';
  ensureRanchSeeded(state, content, NOW());
  applyElapsed(state, content, NOW());

  buildControls();
  $('#ticker').textContent = TICKER_LINES[0];
  persistAndPaint();

  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
  showScreen(state.activeScreen);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tickRanch();
  });
  setInterval(() => {
    if (!document.hidden) tickRanch();
  }, 30000);
}

boot();
