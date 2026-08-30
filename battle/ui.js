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

import { renderCreatureSVG, renderUnitSVG } from '../render/renderer.js';
import { chimeraGenome } from '../splice/theater.js';
import {
  step, playerActions, playerActive, turnForecast,
} from './engine.js';
import { moveReadout } from './readout.js';
import { resolveBattle } from '../campaign/campaign.js';
import { openPicker } from '../ui/picker.js';
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

const CLASS_ICON = { ground: '🦶', water: '🌊', air: '🪽' };

function classChip(creatureClass, content) {
  if (!creatureClass) return '<span class="cls-chip">◇</span>';
  const c = content.classes[creatureClass];
  return `<span class="cls-chip class-${creatureClass}" title="${c.name} — beats ${content.classes[c.beats].name}">${CLASS_ICON[creatureClass]}</span>`;
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
    if (unit?.genome) return renderCreatureSVG(unit.genome, content, { idPrefix: `foe-${refId}` });
    return renderUnitSVG(unit ?? { name: '?', shapes: [] });
  }
  const chimera =
    state.chimeras.find((c) => c.id === refId) ??
    state.campaign.captives.find((c) => c.chimera.id === refId)?.chimera;
  return chimera ? renderCreatureSVG(chimeraGenome(chimera, content), content, { idPrefix: `me-${refId}` }) : '';
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
        <p class="msg-text" id="msg-text">${prompt}</p>
        <button type="button" class="msg-log" id="msg-log" aria-label="Battle log">▤</button>
      </div>

      <div class="cmd" id="cmd">${commandHtml(battle, actions, me, foe, content)}</div>
    </section>`;

  wireCommands(root, ctx, onDone, actions, me, foe);
  if (opening) {
    root.querySelector('#msg-box').addEventListener('click', (e) => {
      if (e.target.closest('#msg-log')) return; // the log button keeps its own job
      openingSeen += 1;
      renderArena(root, ctx, onDone);
    });
  }
  root.querySelector('#msg-log').addEventListener('click', () => showLog(battle));
  paintPips(root, battle.player.team.map((c) => c.hp > 0), battle.enemy.queue.length + 1);
  root.querySelector('#cannon-line').classList.toggle('is-idle', !battle.cannon.charge && !foe.capturable);
}

// The command menu. Four move cells like every creature battler ever made,
// with the overflow behind one more tap rather than a taller screen.
function commandHtml(battle, actions, me, foe, content) {
  if (battle.pendingReplace) {
    return `<div class="move-grid">${actions
      .map((a, i) => `<button type="button" class="mv mv-swap" data-action="${i}">
        <span class="mv-name">${a.label}</span><span class="mv-sub">send in</span></button>`)
      .join('')}</div>`;
  }

  const moves = actions.filter((a) => a.type === 'move' || a.type === 'release');
  const shown = moves.length > 4 ? moves.slice(0, 3) : moves.slice(0, 4);
  const cells = shown.map((a) => {
    const i = actions.indexOf(a);
    const move = me.moves[a.type === 'release' ? me.status.charging : a.index];
    const r = moveReadout(move, me, foe, content);
    return `<button type="button" class="mv ${a.type === 'release' ? 'mv-release' : ''}" data-action="${i}">
      <span class="mv-name">${a.label}${r.lethal ? '<span class="mv-lethal" title="This should graduate them">✓</span>' : ''}</span>
      <span class="mv-sub">${r.immune ? '<i>—</i>' : r.damage != null ? `<b>~${r.damage}</b>` : '<i>util</i>'}${
        r.hitChance < 100 ? `<span class="mv-acc">(${r.hitChance}%)</span>` : ''
      } · ${move.cost}⚡ ${fxHtml(r.chips)}</span>
    </button>`;
  });
  if (moves.length > 4) {
    cells.push(`<button type="button" class="mv mv-more" data-more="1">
      <span class="mv-name">More moves</span><span class="mv-sub">${moves.length - 3} others</span></button>`);
  }
  while (cells.length < 4) cells.push('<span class="mv mv-empty"></span>');

  const util = actions
    .filter((a) => ['rest', 'switch', 'flee', 'capture'].includes(a.type))
    .slice(0, 4)
    .map((a) => {
      const i = actions.indexOf(a);
      const icon = { rest: '❑', switch: '⇄', flee: '↩', capture: '◎' }[a.type];
      const label = { rest: 'Breath', switch: 'Switch', flee: 'Retreat', capture: 'Cannon' }[a.type];
      return `<button type="button" class="ut ut-${a.type}" data-action="${i}"><b>${icon}</b> ${label}</button>`;
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
  root.querySelector('[data-more]')?.addEventListener('click', () => {
    const moves = actions.filter((a) => a.type === 'move' || a.type === 'release');
    openPicker({
      title: 'Every move',
      subtitle: `${me.name} · ${me.stamina}/${me.staminaMax}⚡ in the tank`,
      selectedId: '',
      groups: [{
        label: null,
        options: moves.map((a) => {
          const move = me.moves[a.type === 'release' ? me.status.charging : a.index];
          const r = moveReadout(move, me, foe, content);
          return {
            id: String(actions.indexOf(a)),
            label: a.label,
            badge: fxHtml(r.chips),
            // The full picker has room to show the arithmetic, so it does:
            // what the swing is worth against THIS opponent, and the listed
            // power it came from, which is how the two stop looking like a
            // contradiction when armor eats half of it.
            sub: `${r.immune ? 'no effect here' : r.damage != null ? `~${r.damage} damage${r.lethal ? ' — should finish' : ''}` : 'utility'} · ${move.cost}⚡ · ${r.hitChance}% to land${
              move.power > 0 ? ` · listed ${move.power}` : ''
            }${move.tags.length ? ` · ${move.tags.join(', ')}` : ''}`,
          };
        }),
      }],
      onPick: (value) => value && fire(actions[Number(value)]),
    });
  });
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
