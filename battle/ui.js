// Arena renderer. The engine resolves a whole round in one synchronous
// call, which is right for the harness and wrong for a human: pressing one
// button and watching seven lines appear at once does not read as a turn.
//
// So this module is a PLAYER, not a printer. step() hands back events that
// each carry a snapshot of the battle at that instant; we walk them one
// beat at a time, driving the HUD from each snapshot and animating what
// the beat means. The shell is built once per turn and then mutated in
// place — re-rendering mid-playback would cancel every animation.

import { renderCreatureSVG, renderUnitSVG } from '../render/renderer.js';
import { chimeraGenome } from '../splice/theater.js';
import {
  step, playerActions, playerActive, turnForecast,
  tagMultiplier, classMultiplier,
} from './engine.js';
import { resolveBattle } from '../campaign/campaign.js';
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

// --- Small view helpers -------------------------------------------------

function bar(value, max, cls, extra = '') {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="meter ${extra}"><div class="meter-fill ${cls}" style="width:${pct}%"></div></div>`;
}

function classChip(creatureClass, content) {
  if (!creatureClass) return '<span class="cls-chip cls-none">◇ Unclassed</span>';
  const c = content.classes[creatureClass];
  return `<span class="cls-chip class-${creatureClass}">${c.icon} ${c.name}</span>`;
}

const STATUS_CHIPS = [
  ['venom', (c) => `☠ venom ×${c.status.venom}`, 'bad'],
  ['sleep', () => '💤 asleep', 'bad'],
  ['stun', () => '✶ stunned', 'bad'],
  ['trapped', () => '⛓ trapped', 'bad'],
  ['guard', () => '🛡 guarding', 'good'],
];

function statusChips(c) {
  if (!c) return '';
  const bits = STATUS_CHIPS.filter(([k]) => c.status[k]).map(
    ([, label, tone]) => `<span class="st-chip st-${tone}">${label(c)}</span>`
  );
  if (c.status.charging != null) bits.push('<span class="st-chip st-good">⏳ charging</span>');
  if (c.rejection) bits.push('<span class="st-chip st-bad">⚠ rejection</span>');
  for (const [stat, label] of [['power', 'PWR'], ['acc', 'ACC'], ['evasion', 'EVA']]) {
    const n = c.stages?.[stat] ?? 0;
    if (n) bits.push(`<span class="st-chip st-${n > 0 ? 'good' : 'bad'}">${label} ${n > 0 ? '+' : ''}${n}</span>`);
  }
  return bits.join('');
}

// Wave pips: how many fighters the other side still has to throw at you.
function wavePips(remaining) {
  const total = remaining + 1;
  return Array.from({ length: total }, (_, i) => `<span class="pip ${i === 0 ? 'pip-now' : ''}"></span>`).join('');
}

function teamTray(battle) {
  return battle.player.team
    .map((c, i) => {
      const state = c.hp <= 0 ? 'out' : i === battle.player.active ? 'active' : 'ready';
      return `<span class="tray-slot tray-${state}" title="${c.name}">
        <span class="tray-name">${c.name}</span>
        ${bar(c.hp, c.maxHp, 'fill-hp')}
      </span>`;
    })
    .join('');
}

// What a move will actually do to the thing standing in front of you.
// This is where the tag chart and the class triangle stop being lore.
function effectFor(move, me, foe, content) {
  const { mult, ignoreArmor } = tagMultiplier(move.tags, foe.tags, content.tagChart);
  const cls = classMultiplier(me.creatureClass, foe.creatureClass, content);
  const total = mult * cls;
  const chips = [];
  if (move.power > 0) {
    if (total === 0) chips.push('<span class="fx fx-null">no effect</span>');
    else if (total > 1.05) chips.push(`<span class="fx fx-up">×${total.toFixed(total % 1 ? 1 : 0)}</span>`);
    else if (total < 0.95) chips.push(`<span class="fx fx-down">×${total.toFixed(1)}</span>`);
  }
  if (ignoreArmor || move.keywords?.ignoreArmor) chips.push('<span class="fx fx-up">armor ✗</span>');
  if (move.keywords?.priority) chips.push('<span class="fx fx-fast">⚡ first</span>');
  if (move.keywords?.charge) chips.push('<span class="fx fx-slow">2-turn</span>');
  return chips.join('');
}

const cannonText = (charge, capturable) =>
  `Containment Cannon ${charge}%${capturable ? ' — fires at ≤40% HP' : ' — nothing capturable here'}`;

function spriteFor(side, refId, ctx, battle) {
  const { state, content } = ctx;
  if (side === 'enemy') {
    const unit = battle.units?.[refId] ?? content.enemies[refId];
    if (unit?.genome) return renderCreatureSVG(unit.genome, content, { idPrefix: `foe-${refId}` });
    return renderUnitSVG(unit ?? { name: '?', shapes: [] });
  }
  const chimera =
    state.chimeras.find((c) => c.id === refId) ??
    state.campaign.captives.find((c) => c.chimera.id === refId)?.chimera;
  return chimera ? renderCreatureSVG(chimeraGenome(chimera, content), content, { idPrefix: `me-${refId}` }) : '';
}

// --- The shell ----------------------------------------------------------

export function renderArena(root, ctx, onDone) {
  const { state, content } = ctx;
  const battle = state.battle;
  const me = playerActive(battle);
  const foe = battle.enemy.active;
  const actions = playerActions(battle);
  const order = turnForecast(battle);

  const modeTag =
    battle.context.kind === 'rescue' ? '<span class="mode-tag mode-rescue">RESCUE RAID</span>'
      : battle.context.kind === 'rival' ? '<span class="mode-tag mode-rival">RIVAL DUEL</span>'
        : '';

  const orderLine = battle.pendingReplace
    ? '<span class="order-swap">Send in a replacement — the enemy waits (grudgingly)</span>'
    : order.tied
      ? `<span class="order-tie">Dead heat at ${order.playerSpeed} speed — coin toss for first strike</span>`
      : order.playerFirst
        ? `<span class="order-you">⚡ You strike first — ${order.playerSpeed} speed vs ${order.enemySpeed}</span>`
        : `<span class="order-them">⚠ They strike first — ${order.enemySpeed} speed vs your ${order.playerSpeed}</span>`;

  const actionBtns = actions
    .map((a, i) => {
      if (a.type !== 'move' && a.type !== 'release') {
        return `<button type="button" data-action="${i}" class="act act-${a.type}">${a.label}</button>`;
      }
      const move = me.moves[a.type === 'release' ? me.status.charging : a.index];
      return `<button type="button" data-action="${i}" class="act act-${a.type}">
        <span class="act-name">${a.label}</span>
        <span class="act-meta">${move.power > 0 ? `<span class="act-pow">${move.power}</span>` : '<span class="act-pow act-util">util</span>'}<span class="cost">${move.cost}⚡</span></span>
        <span class="act-fx">${effectFor(move, me, foe, content)}</span>
      </button>`;
    })
    .join('');

  root.innerHTML = `
    <section class="card arena">
      <div class="arena-top">
        <span class="turn-badge">TURN ${battle.turn}</span>
        <span class="arena-title">${battle.encounterName}</span>
        ${modeTag}
      </div>

      <div class="fighter fighter-foe" id="foe-panel">
        <div class="fighter-art" id="foe-art">
          <div class="sprite-wrap">${spriteFor('enemy', foe.refId, ctx, battle)}</div>
          <div class="float-layer" id="foe-floats"></div>
        </div>
        <div class="fighter-info">
          <div class="name-row"><strong id="foe-name">${foe.name}</strong>${classChip(foe.creatureClass, content)}</div>
          <div class="wave-pips" id="foe-pips">${wavePips(battle.enemy.queue.length)}</div>
          ${bar(foe.hp, foe.maxHp, 'fill-foe')}
          <span class="meter-label" id="foe-hp">HP ${foe.hp}/${foe.maxHp}</span>
          ${bar(foe.stamina, foe.staminaMax, 'fill-sta')}
          <span class="meter-label" id="foe-sta">STA ${foe.stamina}/${foe.staminaMax}</span>
          <div class="chip-row" id="foe-status">${statusChips(foe)}</div>
        </div>
      </div>

      <div class="turn-strip" id="turn-strip">${orderLine}</div>

      <div class="fighter fighter-me" id="me-panel">
        <div class="fighter-info">
          <div class="name-row"><strong id="me-name">${me.name}</strong>${classChip(me.creatureClass, content)}</div>
          ${bar(me.hp, me.maxHp, 'fill-hp')}
          <span class="meter-label" id="me-hp">HP ${me.hp}/${me.maxHp}</span>
          ${bar(me.stamina, me.staminaMax, 'fill-sta')}
          <span class="meter-label" id="me-sta">STA ${me.stamina}/${me.staminaMax}${me.regen < 0 ? ' · runs hot' : ''}</span>
          <div class="chip-row" id="me-status">${statusChips(me)}</div>
        </div>
        <div class="fighter-art" id="me-art">
          <div class="sprite-wrap">${spriteFor('player', me.refId, ctx, battle)}</div>
          <div class="float-layer" id="me-floats"></div>
        </div>
      </div>

      <div class="cannon-row" id="cannon-row">
        ${bar(battle.cannon.charge, 100, 'fill-cannon')}
        <span class="meter-label" id="cannon-label">${cannonText(battle.cannon.charge, foe.capturable)}</span>
      </div>

      <div class="team-tray" id="team-tray">${teamTray(battle)}</div>
    </section>

    <section class="card">
      <div class="battle-log" id="battle-log">${battle.log
        .slice(-6)
        .map((l) => `<p class="${l.startsWith('\u201c') ? 'log-bark' : ''}">${l}</p>`)
        .join('')}</div>
      <div class="action-grid" id="action-grid">${actionBtns}</div>
    </section>`;

  root.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (playing) return;
      const action = actions[Number(btn.dataset.action)];
      if (action.type === 'capture') sfx.play('capture');
      const events = step(battle, action, content);
      ctx.save();
      playRound(root, ctx, onDone, events);
    });
  });
}

// --- Playback -----------------------------------------------------------

function playRound(root, ctx, onDone, events) {
  const { state, content } = ctx;
  const battle = state.battle;
  const grid = root.querySelector('#action-grid');
  const strip = root.querySelector('#turn-strip');
  const log = root.querySelector('#battle-log');
  const instant = reducedMotion();

  playing = true;
  let skipped = false;
  let timer = null;
  if (grid) {
    grid.innerHTML = '<button type="button" class="resolving">resolving the round… ▶ tap to skip</button>';
    grid.querySelector('.resolving').addEventListener('click', () => {
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
      onDone(detail);
    } else {
      renderArena(root, ctx, onDone);
    }
  };

  let i = 0;
  function next() {
    if (i >= events.length) return finish();
    // Skipping does not cheat: every remaining beat still runs, it just
    // runs now. The log and the HUD end up exactly where they would have.
    if (skipped || instant) {
      while (i < events.length) applyBeat(root, ctx, battle, events[i++], strip, log);
      return finish();
    }
    const e = events[i++];
    applyBeat(root, ctx, battle, e, strip, log);
    timer = setTimeout(next, beatFor(e.kind));
  }
  next();
}

const PHASE_LABEL = {
  player: 'YOUR MOVE',
  enemy: 'ENEMY MOVE',
};

function applyBeat(root, ctx, battle, e, strip, log) {
  const snap = e.snap;
  const q = (sel) => root.querySelector(sel);

  // 1. Phase banner — the beat that makes turns legible.
  if (strip) {
    const actor = e.actor ?? (e.kind === 'ko' || e.kind === 'damage' ? (e.target === 'player' ? 'enemy' : 'player') : null);
    strip.className = `turn-strip ${actor ? `phase-${actor}` : 'phase-none'}`;
    strip.innerHTML = actor
      ? `<span class="phase-label">${PHASE_LABEL[actor]}</span><span class="phase-text">${e.text}</span>`
      : `<span class="phase-text">${e.text}</span>`;
  }

  // 1b. Spotlight the fighter whose beat this is.
  for (const [side, sel] of [['enemy', '#foe-panel'], ['player', '#me-panel']]) {
    q(sel)?.classList.toggle('is-acting', !!e.actor && e.actor === side);
  }

  // 2. Sprites, if this beat swapped somebody in.
  if (e.kind === 'waveIn' || e.kind === 'capture') {
    for (const [side, sel] of [['enemy', '#foe-art'], ['player', '#me-art']]) {
      const holder = q(sel);
      const refId = snap[side]?.refId;
      if (!holder || !refId || holder.dataset.ref === refId) continue;
      const wrap = holder.querySelector('.sprite-wrap');
      wrap.innerHTML = spriteFor(side, refId, ctx, battle);
      holder.dataset.ref = refId;
      animate(wrap, 'anim-wavein');
    }
  }

  // 3. Bars, labels, chips — straight from the snapshot.
  paintSide(q('#foe-name'), q('#foe-hp'), q('#foe-sta'), q('#foe-status'), q('#foe-panel'), snap.enemy, 0);
  paintSide(q('#me-name'), q('#me-hp'), q('#me-sta'), q('#me-status'), q('#me-panel'), snap.player, 0);
  const pips = q('#foe-pips');
  if (pips) pips.innerHTML = wavePips(snap.wavesLeft);
  const cannon = q('#cannon-row .meter-fill');
  if (cannon) cannon.style.width = `${snap.cannon}%`;
  const cannonLabel = q('#cannon-label');
  if (cannonLabel) cannonLabel.textContent = cannonText(snap.cannon, battle.enemy.active?.capturable);
  const tray = q('#team-tray');
  if (tray) {
    tray.innerHTML = snap.bench
      .map((c, n) => {
        const st = c.hp <= 0 ? 'out' : n === snap.activeIndex ? 'active' : 'ready';
        return `<span class="tray-slot tray-${st}"><span class="tray-name">${c.name}</span>${bar(c.hp, c.maxHp, 'fill-hp')}</span>`;
      })
      .join('');
  }

  // 4. The animation this beat means.
  const foeArt = q('#foe-art');
  const meArt = q('#me-art');
  const artOf = (side) => (side === 'enemy' ? foeArt : meArt);

  if (e.kind === 'damage' && !e.recoil && !e.dot && e.actor) {
    animate(artOf(e.actor)?.querySelector('.sprite-wrap'), e.actor === 'player' ? 'anim-lunge-up' : 'anim-lunge-down');
  }
  if (e.kind === 'damage') {
    const art = artOf(e.target);
    animate(art?.querySelector('.sprite-wrap'), 'anim-hit');
    float(art, `-${e.amount}`, e.mult > 1.05 ? 'float-crit' : e.mult < 0.95 ? 'float-weak' : 'float-dmg');
    sfx.play(e.mult > 1.05 ? 'bigHit' : e.mult < 0.95 ? 'weakHit' : 'hit');
  } else if (e.kind === 'heal') {
    float(artOf(e.target), `+${e.amount}`, 'float-heal');
    sfx.play('buff');
  } else if (e.kind === 'miss' || e.kind === 'immune') {
    animate(artOf(e.actor)?.querySelector('.sprite-wrap'), e.actor === 'player' ? 'anim-lunge-up' : 'anim-lunge-down');
    float(artOf(e.target), e.kind === 'miss' ? 'MISS' : 'NO EFFECT', 'float-miss');
    sfx.play('miss');
  } else if (e.kind === 'ko') {
    animate(artOf(e.target)?.querySelector('.sprite-wrap'), 'anim-ko');
    sfx.play('ko');
  } else if (e.kind === 'buff' || e.kind === 'rest') {
    animate(artOf(e.target)?.querySelector('.sprite-wrap'), 'anim-buff');
    sfx.play('buff');
  } else if (e.kind === 'debuff' || e.kind === 'disobey') {
    animate(artOf(e.target)?.querySelector('.sprite-wrap'), 'anim-debuff');
    sfx.play('debuff');
  } else if (e.kind === 'waveIn') {
    sfx.play('waveIn');
  }

  // 5. The log still gets every line, for anyone reading rather than watching.
  if (log) {
    const p = document.createElement('p');
    p.textContent = e.text;
    p.className = `log-${e.kind}`;
    log.appendChild(p);
    while (log.children.length > 8) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
}

function paintSide(nameEl, hpEl, staEl, statusEl, panel, c, _i) {
  if (!c || !panel) return;
  const meters = panel.querySelectorAll('.meter-fill');
  if (nameEl) nameEl.textContent = c.name;
  if (meters[0]) meters[0].style.width = `${Math.max(0, (c.hp / c.maxHp) * 100)}%`;
  if (meters[1]) meters[1].style.width = `${Math.max(0, (c.stamina / c.staminaMax) * 100)}%`;
  if (hpEl) hpEl.textContent = `HP ${c.hp}/${c.maxHp}`;
  if (staEl) staEl.textContent = `STA ${c.stamina}/${c.staminaMax}`;
  if (statusEl) statusEl.innerHTML = statusChips(c);
  panel.classList.toggle('is-down', c.hp <= 0);
}

// Restart a CSS animation by removing and re-adding the class.
function animate(el, cls) {
  if (!el || reducedMotion()) return;
  el.classList.remove(cls);
  void el.offsetWidth; // reflow: the class must actually leave the element
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
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
