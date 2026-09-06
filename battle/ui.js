// Arena renderer. Two jobs, both about making a fight read as a fight.
//
// 1. PLAYBACK. The engine resolves a whole round in one synchronous call,
//    which is right for the harness and wrong for a human. step() hands
//    back events that each carry a snapshot of the battle at that instant;
//    we walk them one beat at a time, driving the HUD from each snapshot.
//    The shell is built once per turn and then mutated in place —
//    re-rendering mid-playback would cancel every animation.
//
// 2. STAGING. One screen, no scrolling, laid out the way a turn-based
//    creature battle has been laid out since 1996: the foe up and to the
//    right, you down and to the left, both facing each other, a message
//    box under the field and the command menu under that. Everything that
//    used to be a stacked panel is now either an overlay on the field or
//    one tap away, because a battle you have to scroll is not a battle.

import { creaturePortrait, renderUnitSVG, drawableGenome } from '../render/renderer.js';
import { chimeraGenome } from '../splice/theater.js';
import {
  step, playerActions, playerActive, turnForecast, intentOf, bracePreview, braceTitle,
} from './engine.js';
import { moveReadout } from './readout.js';
import { resolveBattle } from '../campaign/campaign.js';
import { openPicker } from '../ui/picker.js';
import { moveSummary, moveDetail } from './moves.js';
import { renderIcon } from '../ui/icons.js';

// Move names and keyword sentences are authored content, not player input,
// but they land in innerHTML and an apostrophe in a name should not be able
// to shape the markup around it.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
import * as sfx from '../audio/sfx.js';

// Beat lengths. Kept here so the whole fight's pacing is one edit away.
const BEAT = {
  damage: 620,
  ko: 900,
  waveIn: 720,
  bark: 1100,
  victory: 700,
  defeat: 700,
  info: 460,
};
const beatFor = (kind) => BEAT[kind] ?? BEAT.info;

const reducedMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

let playing = false; // guards clicks while a round resolves
// How much of the opening exchange the player has read. Keyed to the
// battle so a reload mid-duel replays it rather than skipping it, and a
// new fight always starts from the first line.
let openingKey = null;
let openingSeen = 0;

// --- Small view helpers -------------------------------------------------

function bar(value, max, cls) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="meter"><div class="meter-fill ${cls}" style="width:${pct}%"></div></div>`;
}

// R72 - the chip reads the class out of classes.json rather than a hardcoded
// trio, so a fourth class gets its own icon and a retired one degrades to the
// Unclassed diamond instead of throwing on `c.name`. `beats` is looked up the
// same way: the triangle is a cycle in the data, and a cycle with a hole in it
// must not take the battle screen down mid-fight.
function classChip(creatureClass, content) {
  const c = creatureClass ? content.classes?.[creatureClass] : null;
  if (!c) return '<span class="cls-chip">◇</span>';
  const beaten = content.classes?.[c.beats];
  return `<span class="cls-chip class-${creatureClass}" title="${c.name}${
    beaten ? ` — beats ${beaten.name}` : ''
  }">${renderIcon(c.icon, { size: 13 })}</span>`;
}

// Status as icons, not sentences: the HP box has no room for prose and the
// message box is already saying it out loud.
const STATUS_ICONS = [
  ['venom', (c) => `☠${c.status.venom > 1 ? c.status.venom : ''}`, 'bad', 'Envenomed'],
  ['sleep', () => '💤', 'bad', 'Asleep'],
  ['stun', () => '✶', 'bad', 'Stunned'],
  ['trapped', () => '⛓', 'bad', 'Trapped — cannot switch'],
  ['guard', () => '🛡', 'good', 'Guarding'],
];

function statusIcons(c) {
  if (!c) return '';
  const bits = STATUS_ICONS.filter(([k]) => c.status[k]).map(
    ([, label, tone, title]) => `<i class="st st-${tone}" title="${title}">${label(c)}</i>`
  );
  if (c.status.charging != null) bits.push('<i class="st st-good" title="Winding up">⏳</i>');
  if (c.rejection) bits.push('<i class="st st-bad" title="Unsettled — Rejection debuffs">⚠</i>');
  for (const [stat, label] of [['power', 'PWR'], ['acc', 'ACC'], ['evasion', 'EVA']]) {
    const n = c.stages?.[stat] ?? 0;
    if (n) bits.push(`<i class="st st-${n > 0 ? 'good' : 'bad'}" title="${label} ${n > 0 ? '+' : ''}${n}">${label[0]}${n > 0 ? '↑' : '↓'}</i>`);
  }
  return bits.join('');
}

// How many fighters each side still has standing. The foe's is a row of
// pips on their box; yours doubles as the bench, so a KO'd slot goes dark.
const pips = (list) =>
  list.map((ok) => `<i class="pip ${ok ? '' : 'pip-out'}"></i>`).join('');

// What a move will actually do to the thing standing in front of you.
// This is where the tag chart and the class triangle stop being lore.
const fxHtml = (chips) => chips.map(([k, t]) => `<span class="fx fx-${k}">${t}</span>`).join('');

// Enemy units are drawn in a tight viewBox; creatures in a generous one.
// The zoom that makes a chimera fill its slot would crop a Riot Squad's
// head off, so the slot is told which it is holding.
function spriteKind(side, refId, ctx, battle) {
  if (side !== 'enemy') return 'creature';
  const unit = battle.units?.[refId] ?? ctx.content.enemies[refId];
  return unit?.genome ? 'creature' : 'unit';
}

function spriteFor(side, refId, ctx, battle) {
  const { state, content } = ctx;
  if (side === 'enemy') {
    const unit = battle.units?.[refId] ?? content.enemies[refId];
    // R72 — `battle.units` is serialized with the save, so a fight resumed
    // after one of its parts was retired reaches this with a stale genome.
    const foeGenome = drawableGenome(unit?.genome, content);
    if (foeGenome) return creaturePortrait(foeGenome, content, { idPrefix: `foe-${refId}` });
    return renderUnitSVG(unit ?? { name: '?', shapes: [] });
  }
  const chimera =
    state.chimeras.find((c) => c.id === refId) ??
    state.campaign.captives.find((c) => c.chimera.id === refId)?.chimera;
  return chimera ? creaturePortrait(chimeraGenome(chimera, content), content, { idPrefix: `me-${refId}` }) : '';
}

function hpBox(side, c, content, extra = '') {
  return `
    <div class="hp-box hp-${side}" id="${side}-box">
      <div class="hp-name">
        <strong id="${side}-name">${c.name}</strong>
        ${classChip(c.creatureClass, content)}
        <span class="hp-pips" id="${side}-pips"></span>
      </div>
      ${bar(c.hp, c.maxHp, side === 'me' ? 'fill-hp' : 'fill-foe')}
      <div class="hp-read"><span id="${side}-hp">${c.hp}/${c.maxHp}</span><span class="st-row" id="${side}-st">${statusIcons(c)}</span></div>
      ${extra}
    </div>`;
}

// --- The shell ----------------------------------------------------------

export function renderArena(root, ctx, onDone) {
  const { state, content } = ctx;
  const battle = state.battle;
  const me = playerActive(battle);
  const foe = battle.enemy.active;
  const actions = playerActions(battle);
  const order = turnForecast(battle);
  document.body.classList.add('in-battle');

  const mode =
    battle.context.kind === 'rescue' ? '<span class="mode-tag mode-rescue">RESCUE</span>'
      : battle.context.kind === 'rival' ? '<span class="mode-tag mode-rival">RIVAL</span>'
        : '';

  // The opening exchange owns the message box until it is read: a story
  // beat the player has to open a log overlay to find is a story beat
  // nobody sees.
  const key = `${battle.encounterId}:${battle.seed}`;
  if (openingKey !== key) { openingKey = key; openingSeen = 0; }
  const opening = battle.turn === 1 && !battle.over ? (battle.opening ?? [])[openingSeen] ?? null : null;

  // R103 — WHAT IS COMING. The opposition commits at the top of the turn and
  // this is where it says so; without it the brace and the counter-switch
  // are two buttons whose whole value is answering something the player
  // cannot see. Read through `intentOf`, which is the same call `step` makes
  // — the arena shows the fight the engine is about to resolve, not a second
  // guess at it (R28's rule: the number on the screen is the number that
  // lands).
  const intent = battle.pendingReplace || battle.over ? null : intentOf(battle, content);
  const counterClass = intent?.creatureClass
    ? Object.values(content.classes ?? {}).find((c) => c.beats === intent.creatureClass)
    : null;
  const telegraph = intent && intent.index >= 0
    ? `<p class="intent" id="intent">${renderIcon('target', { size: 13 })} <strong>${foe.name}</strong> is winding up
        <strong>${intent.name}</strong>${intent.priority ? ' <span class="intent-pri">first</span>' : ''}${
        intent.ignoreGuard ? ' <span class="intent-pri">unguardable</span>' : ''}${
        counterClass ? ` <span class="intent-answer">· ${counterClass.name} answers it</span>` : ''}</p>`
    : intent
      ? `<p class="intent" id="intent">${renderIcon('target', { size: 13 })} <strong>${foe.name}</strong> is catching its breath.</p>`
      : '';

  const prompt = opening
    ? `<span class="bark-msg">${opening}</span><span class="bark-next">tap ▸</span>`
    : battle.pendingReplace
    ? '<span class="ord-swap">Send in a replacement.</span>'
    : order.tied
      ? `What now? <span class="ord-tie">Dead heat at ${order.playerSpeed} speed.</span>`
      : order.playerFirst
        ? `What now? <span class="ord-you">⚡ You are faster (${order.playerSpeed} vs ${order.enemySpeed}).</span>`
        : `What now? <span class="ord-them">⚠ They are faster (${order.enemySpeed} vs ${order.playerSpeed}).</span>`;

  root.innerHTML = `
    <section class="arena">
      <div class="stage" id="stage">
        <div class="stage-bar">
          <span class="turn-badge">TURN ${battle.turn}</span>
          <span class="stage-title">${battle.encounterName}</span>
          ${mode}
        </div>

        ${hpBox('foe', foe, content)}

        <div class="slot slot-foe kind-${spriteKind('enemy', foe.refId, ctx, battle)}" id="foe-slot">
          <div class="platform"></div>
          <div class="sprite-zoom"><div class="sprite" id="foe-sprite">${spriteFor('enemy', foe.refId, ctx, battle)}</div></div>
          <div class="float-layer"></div>
        </div>

        <div class="slot slot-me" id="me-slot">
          <div class="platform"></div>
          <div class="sprite-zoom"><div class="sprite" id="me-sprite">${spriteFor('player', me.refId, ctx, battle)}</div></div>
          <div class="float-layer"></div>
        </div>

        ${hpBox('me', me, content, `
          <div class="sta-line">${bar(me.stamina, me.staminaMax, 'fill-sta')}<span id="me-sta">${me.stamina}/${me.staminaMax}⚡</span></div>
          <div class="cannon-line" id="cannon-line">${bar(battle.cannon.charge, 100, 'fill-cannon')}<span id="cannon-read">${battle.cannon.charge}%</span></div>`)}
      </div>

      <div class="msg-box ${opening ? 'is-bark' : ''}" id="msg-box">
        <!-- R80: the running commentary of a fight — every hit, every miss,
             every status — is written into this one node beat by beat while
             a round plays, and until now it was written silently. It is a
             stable element for the length of a round, which is exactly the
             case a live region is for. -->
        <p class="msg-text" id="msg-text" role="status" aria-live="polite">${prompt}</p>
        ${opening ? '<button type="button" class="msg-next" id="msg-next" aria-label="Continue">&#9654;</button>' : ''}
        <button type="button" class="msg-log" id="msg-log" aria-label="Battle log">▤</button>
      </div>

      ${telegraph}
      <div class="cmd" id="cmd">${commandHtml(battle, actions, me, foe, content)}</div>
    </section>`;

  wireCommands(root, ctx, onDone, actions, me, foe);
  if (opening) {
    // R80 — the opening exchange used to advance by CLICKING THE DIV, so a
    // keyboard could not get past the first line of a rival duel and the
    // fight was unplayable from there. The whole box stays tappable, which
    // is the right target on a phone; the advance is now also a real button
    // that Tab reaches and Enter presses, and it is what takes focus.
    const advance = () => { openingSeen += 1; renderArena(root, ctx, onDone); };
    root.querySelector('#msg-box').addEventListener('click', (e) => {
      if (e.target.closest('#msg-log')) return; // the log button keeps its own job
      advance();
    });
    root.querySelector('#msg-next')?.focus();
  }
  root.querySelector('#msg-log').addEventListener('click', () => showLog(battle));
  paintPips(root, battle.player.team.map((c) => c.hp > 0), battle.enemy.queue.length + 1);
  root.querySelector('#cannon-line').classList.toggle('is-idle', !battle.cannon.charge && !foe.capturable);
}

// The command menu. Four move cells like every creature battler ever made,
// with the overflow behind one more tap rather than a taller screen.
function commandHtml(battle, actions, me, foe, content) {
  const intent = battle.pendingReplace || battle.over ? null : intentOf(battle, content);
  if (battle.pendingReplace) {
    return `<div class="move-grid">${actions
      .map((a, i) => `<button type="button" class="mv mv-swap" data-action="${i}">
        <span class="mv-name">${a.label}</span><span class="mv-sub">send in</span></button>`)
      .join('')}</div>`;
  }

  const moves = actions.filter((a) => a.type === 'move' || a.type === 'release');
  // Which moves earn the four buttons. It used to be the first four in
  // SOCKET order — head, forelimbs, hindlimbs, tail, hide, organ — so on a
  // six-part chimera the hide and organ actives were always the two that
  // fell off the end, behind "more". R23 gave those sockets something to do
  // and this is where the player would never have found it.
  //
  // So: the hardest swings, plus one utility, which is enough to know the
  // option exists. Ties break on socket order, so the buttons stay put
  // rather than reshuffling under a thumb.
  // R30: four slots, and the creature actually has four. This block used to
  // rank six or seven moves down to three and add a "More moves" button — a
  // four-slot grid apologising for anatomy that handed out more buttons than
  // it could show. The moveset is the cap now, so every move a creature
  // carries is on screen, in the order the player trained it.
  const cells = moves.map((a) => {
    const i = actions.indexOf(a);
    const move = me.moves[a.type === 'release' ? me.status.charging : a.index];
    const r = moveReadout(move, me, foe, content, battle.turn);
    // What it DOES, not the word "util". 41% of the roster's moves are
    // power-0, and every one of them used to render as three grey letters.
    const says = move.power > 0
      ? (r.immune ? '<i>no effect</i>' : `<b>~${r.damage}</b>`)
      : `<i>${esc(moveSummary(move, content))}</i>`;
    return `<button type="button" class="mv ${a.type === 'release' ? 'mv-release' : ''}${move.power > 0 ? '' : ' mv-util'}" data-action="${i}" data-detail="${a.type === 'release' ? me.status.charging : a.index}">
      <span class="mv-name">${a.label}${r.lethal ? '<span class="mv-lethal" title="This should graduate them">✓</span>' : ''}</span>
      <span class="mv-sub">${says}${
        move.power > 0 && r.hitChance < 100 ? `<span class="mv-acc">(${r.hitChance}%)</span>` : ''
      } · ${move.cost}⚡ ${fxHtml(r.chips)}</span>
    </button>`;
  });
  while (cells.length < 4) cells.push('<span class="mv mv-empty"></span>');

  const util = actions
    .filter((a) => ['rest', 'switch', 'flee', 'capture'].includes(a.type))
    .slice(0, 4)
    .map((a) => {
      const i = actions.indexOf(a);
      const icon = { rest: '❑', switch: '⇄', flee: '↩', capture: '◎' }[a.type];
      // R103 — the rest button is a STANCE now, so it is named for the half
      // that decides fights and marked when it is answering something. The
      // old label ("Breath") described the half that never did.
      const label = { rest: 'Brace', switch: 'Switch', flee: 'Retreat', capture: 'Cannon' }[a.type];
      // Lit only when a brace would actually HAPPEN, and captioned by the
      // engine's own preview — the first draft lit the button whenever
      // something was telegraphed and promised stamina back from a brace
      // that spends it (R28: the number on the screen is the number that
      // lands).
      const brace = a.type === 'rest' ? bracePreview(me, intent, content) : null;
      const live = !!brace?.braced && !brace.unguardable;
      const title = a.type === 'rest' ? braceTitle(me, intent, content) : '';
      return `<button type="button" class="ut ut-${a.type}${live ? ' ut-live' : ''}" data-action="${i}"${
        title ? ` title="${esc(title)}"` : ''}><b>${icon}</b> ${label}</button>`;
    })
    .join('');

  return `<div class="move-grid">${cells.join('')}</div><div class="util-row">${util}</div>`;
}

function wireCommands(root, ctx, onDone, actions, me, foe) {
  const { state, content } = ctx;
  const battle = state.battle;
  const fire = (action) => {
    if (playing) return;
    if (action.type === 'capture') sfx.play('capture');
    const events = step(battle, action, content);
    ctx.save();
    playRound(root, ctx, onDone, events);
  };
  root.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => fire(actions[Number(btn.dataset.action)]));
  });
  // R30: hold a move to find out what it does. Every move used to be a name
  // and a number; the keyword sentences existed in keywords.json and were
  // shown to nobody. A long press (or a right-click, for the desktop build)
  // opens the whole thing: the arithmetic, the tags spelled out against the
  // chart, and one line per keyword with this move's own magnitudes in it.
  const HOLD_MS = 350;
  root.querySelectorAll('[data-detail]').forEach((btn) => {
    const idx = Number(btn.dataset.detail);
    let timer = null;
    let held = false;
    const open = () => { held = true; showMoveDetail(me.moves[idx], me, foe, content, battle.turn); };
    const start = () => { held = false; timer = setTimeout(open, HOLD_MS); };
    const stop = () => { clearTimeout(timer); };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    // A hold must not also fire the move it was explaining.
    btn.addEventListener('click', (e) => { if (held) { e.stopPropagation(); e.preventDefault(); held = false; } }, true);
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); open(); });
    // R80 — a hold is a pointer gesture and nothing else, so the whole of
    // R30 — the arithmetic, the tags, the keyword sentences — was behind a
    // door a keyboard could not open. `contextmenu` covers Shift+F10 and the
    // Menu key on a desktop keyboard, but a TWA soft keyboard has neither,
    // so the shortcut is also a plain "?" on the focused move, advertised
    // where a screen reader will read it out.
    btn.setAttribute('aria-keyshortcuts', 'Shift+Slash');
    btn.title = 'Hold, right-click, or press ? for the full readout';
    btn.addEventListener('keydown', (e) => {
      if (e.key !== '?') return;
      e.preventDefault();
      open();
      held = false; // a key press is not a hold, and must not eat the next click
    });
  });
}

// R30: the whole truth about one move. Reached by holding its button.
// Everything here was already computed or already written down — the
// arithmetic in moveReadout (R28), the keyword sentences in keywords.json,
// the tag chart in the same file — and none of it was ever on screen.
function showMoveDetail(move, me, foe, content, turn) {
  const d = moveDetail(move, content);
  const r = moveReadout(move, me, foe, content, turn);
  const overlay = document.querySelector('#overlay');
  overlay.hidden = false;
  const stat = (label, value) => `<div><span class="econ-label">${label}</span><strong>${value}</strong></div>`;
  overlay.innerHTML = `
    <div class="sheet move-sheet">
      <div class="pick-head">
        <h3>${esc(d.name)}</h3>
        <p class="fine-print">${d.kind === 'attack' ? 'Attack' : 'Utility'}${d.source ? ` · from ${esc(d.source)}` : ''}</p>
        <button type="button" class="pick-close" data-close="1" aria-label="Close">&#10005;</button>
      </div>
      <div class="econ-row">
        ${d.power > 0 ? stat('Listed power', d.power) : stat('Power', '—')}
        ${stat('Stamina', `${d.cost}⚡`)}
        ${stat('Accuracy', `${d.acc}%`)}
      </div>
      ${d.power > 0 ? `<p class="ranch-msg">Against ${esc(foe.name)} right now: <strong>${
        r.immune ? 'no effect at all' : `about ${r.damage} damage`
      }</strong>, landing ${r.hitChance}% of the time.${r.lethal ? ' This should finish them.' : ''}</p>` : ''}
      ${d.effects.length ? `<h4>What it does</h4><ul class="move-effects">${
        d.effects.map((e) => `<li><strong>${esc(e.name)}</strong> — ${esc(e.text)}</li>`).join('')
      }</ul>` : `<p class="fine-print">${d.power > 0 ? 'No special effects — it just hits.' : 'No effect. Which is itself a finding.'}</p>`}
      ${d.tagNotes.length ? `<h4>Tags</h4><ul class="move-effects">${
        d.tagNotes.map((t) => `<li>${esc(t)}</li>`).join('')
      }</ul>` : ''}
    </div>`;
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { overlay.hidden = true; }));
  // R75 — this was `{ once: true }`, which spends the listener on the FIRST
  // click anywhere in the overlay. A tap inside the sheet bubbles up to it,
  // does nothing (the target is not the overlay), and takes the backdrop
  // dismissal with it: read one move detail and the only way out is the ✕.
  // `once` was there to stop handlers stacking across opens, since this one
  // binds to the overlay itself rather than to markup that gets replaced —
  // so keep one handler by name and replace it, instead of spending it.
  overlay.removeEventListener('click', backdropClose);
  overlay.addEventListener('click', backdropClose);
}

// One named handler for the overlay backdrop, so binding it again replaces
// rather than stacks. See the move sheet below.
function backdropClose(e) {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
}

// The log lives one tap away instead of eating a third of the screen.
function showLog(battle) {
  const overlay = document.querySelector('#overlay');
  overlay.hidden = false;
  overlay.innerHTML = `
    <div class="ceremony card log-sheet">
      <h3>Battle log — turn ${battle.turn}</h3>
      <div class="battle-log">${battle.log.slice(-40).map((l) => `<p class="${l.startsWith('“') ? 'log-bark' : ''}">${l}</p>`).join('')}</div>
      <button type="button" id="log-done" class="big-btn">Back to it</button>
    </div>`;
  const list = overlay.querySelector('.battle-log');
  list.scrollTop = list.scrollHeight;
  overlay.querySelector('#log-done').addEventListener('click', () => {
    overlay.hidden = true;
    overlay.innerHTML = '';
  });
}

function paintPips(root, playerAlive, foeLeft) {
  const foePips = root.querySelector('#foe-pips');
  const mePips = root.querySelector('#me-pips');
  if (foePips) foePips.innerHTML = pips(Array.from({ length: foeLeft }, () => true));
  if (mePips) mePips.innerHTML = pips(playerAlive);
}

// --- Playback -----------------------------------------------------------

function playRound(root, ctx, onDone, events) {
  const { state, content } = ctx;
  const battle = state.battle;
  const cmd = root.querySelector('#cmd');
  const msg = root.querySelector('#msg-text');
  const instant = reducedMotion();

  playing = true;
  let skipped = false;
  let timer = null;
  if (cmd) {
    cmd.innerHTML = '<button type="button" class="resolving">resolving… ▶ tap to skip</button>';
    cmd.querySelector('.resolving').addEventListener('click', () => {
      if (skipped) return;
      skipped = true;
      clearTimeout(timer); // flush now, not at the end of the current beat
      next();
    });
  }

  const finish = () => {
    playing = false;
    if (battle.over) {
      sfx.play(battle.outcome === 'win' ? 'win' : 'lose');
      const detail = resolveBattle(state, battle, content, ctx.now());
      ctx.save();
      document.body.classList.remove('in-battle');
      onDone(detail);
    } else {
      renderArena(root, ctx, onDone);
    }
  };

  let i = 0;
  function next() {
    if (i >= events.length) return finish();
    // Skipping does not cheat: every remaining beat still runs, it just
    // runs now. The HUD ends up exactly where it would have.
    if (skipped || instant) {
      while (i < events.length) applyBeat(root, ctx, battle, events[i++], msg);
      return finish();
    }
    const e = events[i++];
    applyBeat(root, ctx, battle, e, msg);
    timer = setTimeout(next, beatFor(e.kind));
  }
  next();
}

function applyBeat(root, ctx, battle, e, msg) {
  const snap = e.snap;
  const q = (sel) => root.querySelector(sel);

  // 1. The line, in the box under the field.
  if (msg) {
    msg.className = `msg-text msg-${e.kind}`;
    msg.textContent = e.text;
  }

  // 2. Sprites, if this beat swapped somebody in.
  if (e.kind === 'waveIn' || e.kind === 'capture') {
    for (const [side, sel] of [['enemy', '#foe-sprite'], ['player', '#me-sprite']]) {
      const holder = q(sel);
      const refId = snap[side === 'enemy' ? 'enemy' : 'player']?.refId;
      if (!holder || !refId || holder.dataset.ref === refId) continue;
      holder.innerHTML = spriteFor(side, refId, ctx, battle);
      holder.dataset.ref = refId;
      holder.closest('.slot')?.classList.remove('kind-unit', 'kind-creature');
      holder.closest('.slot')?.classList.add(`kind-${spriteKind(side, refId, ctx, battle)}`);
      animate(holder, 'anim-wavein');
    }
  }

  // 3. Boxes, straight from the snapshot.
  paintBox(root, 'foe', snap.enemy);
  paintBox(root, 'me', snap.player);
  const meSta = q('#me-sta');
  if (meSta && snap.player) {
    meSta.textContent = `${snap.player.stamina}/${snap.player.staminaMax}⚡`;
    const staFill = q('#me-box .fill-sta');
    if (staFill) staFill.style.width = `${(snap.player.stamina / snap.player.staminaMax) * 100}%`;
  }
  const cannonFill = q('#cannon-line .meter-fill');
  if (cannonFill) cannonFill.style.width = `${snap.cannon}%`;
  const cannonRead = q('#cannon-read');
  if (cannonRead) cannonRead.textContent = `${snap.cannon}%`;
  q('#cannon-line')?.classList.toggle('is-idle', !snap.cannon && !battle.enemy.active?.capturable);
  paintPips(root, snap.bench.map((c) => c.hp > 0), snap.wavesLeft + 1);

  // 4. The animation this beat means. They face each other, so a lunge is
  //    horizontal: toward the other one, and back.
  const meSprite = q('#me-sprite');
  const foeSprite = q('#foe-sprite');
  const spriteOf = (side) => (side === 'enemy' ? foeSprite : meSprite);
  const slotOf = (side) => (side === 'enemy' ? q('#foe-slot') : q('#me-slot'));

  if ((e.kind === 'damage' && !e.recoil && !e.dot && e.actor) || e.kind === 'miss' || e.kind === 'immune') {
    // The foe's zoom wrapper is mirrored, so "forward" already reads as
    // "toward the other one" for both sides.
    animate(spriteOf(e.actor), 'anim-lunge-fwd');
  }
  if (e.kind === 'damage') {
    animate(spriteOf(e.target), 'anim-hit');
    float(slotOf(e.target), `-${e.amount}`, e.mult > 1.05 ? 'float-crit' : e.mult < 0.95 ? 'float-weak' : 'float-dmg');
    if (e.mult > 1.05) flash(q('#stage'), 'stage-crit');
    sfx.play(e.mult > 1.05 ? 'bigHit' : e.mult < 0.95 ? 'weakHit' : 'hit');
  } else if (e.kind === 'heal') {
    float(slotOf(e.target), `+${e.amount}`, 'float-heal');
    sfx.play('buff');
  } else if (e.kind === 'miss' || e.kind === 'immune') {
    float(slotOf(e.target), e.kind === 'miss' ? 'MISS' : 'NO EFFECT', 'float-miss');
    sfx.play('miss');
  } else if (e.kind === 'ko') {
    animate(spriteOf(e.target), 'anim-ko');
    sfx.play('ko');
  } else if (e.kind === 'buff' || e.kind === 'rest') {
    animate(spriteOf(e.target), 'anim-buff');
    sfx.play('buff');
  } else if (e.kind === 'debuff' || e.kind === 'disobey') {
    animate(spriteOf(e.target), 'anim-debuff');
    sfx.play('debuff');
  } else if (e.kind === 'waveIn') {
    sfx.play('waveIn');
  }
}

function paintBox(root, side, c) {
  if (!c) return;
  const box = root.querySelector(`#${side}-box`);
  if (!box) return;
  const name = box.querySelector(`#${side}-name`);
  const hp = box.querySelector(`#${side}-hp`);
  const fill = box.querySelector('.meter-fill');
  if (name) name.textContent = c.name;
  if (hp) hp.textContent = `${c.hp}/${c.maxHp}`;
  if (fill) fill.style.width = `${Math.max(0, (c.hp / c.maxHp) * 100)}%`;
  const st = box.querySelector(`#${side}-st`);
  if (st) st.innerHTML = statusIcons(c);
  box.classList.toggle('is-low', c.hp > 0 && c.hp / c.maxHp <= 0.25);
  const slot = root.querySelector(`#${side === 'foe' ? 'foe' : 'me'}-slot`);
  slot?.classList.toggle('is-down', c.hp <= 0);
}

// Restart a CSS animation by removing and re-adding the class.
function animate(el, cls) {
  if (!el || reducedMotion()) return;
  el.classList.remove(cls);
  void el.offsetWidth; // reflow: the class must actually leave the element
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

function flash(el, cls) {
  if (!el || reducedMotion()) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 200);
}

function float(host, text, cls) {
  if (!host || reducedMotion()) return;
  const layer = host.querySelector('.float-layer');
  if (!layer) return;
  const node = document.createElement('span');
  node.className = `float ${cls}`;
  node.textContent = text;
  layer.appendChild(node);
  setTimeout(() => node.remove(), 1000);
}
