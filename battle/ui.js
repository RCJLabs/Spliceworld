// Battle screen (M4). Three states: encounter briefing + team picker,
// the live arena (menu-driven, Pokémon layout), and the aftermath. All
// rules live in engine.js; this file renders state and forwards actions.
// The in-progress battle is part of gameState — reloads resume mid-fight.

import { renderCreatureSVG, renderUnitSVG } from '../render/renderer.js';
import { chimeraGenome, isSettled } from '../splice/theater.js';
import {
  createBattle, step, finishBattle, playerActions, playerActive, isInjured,
} from './engine.js';
import { fmtDuration } from '../ranch/ui.js';

let draftTeam = []; // chimera ids picked in the briefing (screen-local)
let lastAftermath = null;

function bar(value, max, cls) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div class="cond-bar"><div class="cond-fill ${cls}" style="width:${pct}%"></div></div>`;
}

export function renderBattleScreen(root, ctx) {
  const { state } = ctx;
  if (state.battle) renderArena(root, ctx);
  else renderBriefing(root, ctx);
}

// --- Briefing: pick an encounter and up to 3 fighters -------------------

function renderBriefing(root, ctx) {
  const { state, content, now } = ctx;
  const t = now();

  const roster = state.chimeras.map((ch) => {
    const injured = isInjured(ch, t);
    const settled = isSettled(ch, t);
    const picked = draftTeam.includes(ch.id);
    const note = injured
      ? `Infirmary: ${ch.injury.name} — ${fmtDuration(ch.injury.until - t)} left`
      : settled ? 'ready' : 'unsettled — Rejection debuffs apply';
    return `
      <label class="pick ${injured ? 'pick-injured' : ''}">
        <input type="checkbox" data-chimera="${ch.id}" ${picked ? 'checked' : ''} ${injured ? 'disabled' : ''}>
        <span><strong>${ch.name}</strong> · ${note}</span>
      </label>`;
  }).join('');

  const encounters = Object.values(content.encounters).map((e) => `
    <div class="encounter">
      <div><strong>${e.name}</strong> <span class="lineage">$${e.reward}</span><br>
      <span class="fine-print">${e.blurb} (${e.waves.length} wave${e.waves.length > 1 ? 's' : ''})</span></div>
      <button type="button" data-encounter="${e.id}" ${draftTeam.length ? '' : 'disabled'}>Deploy</button>
    </div>`).join('');

  const aftermath = lastAftermath
    ? `<section class="card"><h3>Last Sortie</h3><p class="ranch-msg">${lastAftermath}</p></section>`
    : '';

  root.innerHTML = `
    ${aftermath}
    <section class="card">
      <h3>Strike Team (up to 3)</h3>
      ${roster || '<p class="ranch-msg">No chimeras. The Surgery Theater is thataway.</p>'}
      <p class="fine-print">War record: ${state.warRecord.wins}W – ${state.warRecord.losses}L</p>
    </section>
    <section class="card">
      <h3>Gen 1 — Local Law Enforcement</h3>
      ${encounters}
    </section>`;

  root.querySelectorAll('input[data-chimera]').forEach((box) => {
    box.addEventListener('change', () => {
      const id = box.dataset.chimera;
      if (box.checked) {
        if (draftTeam.length >= 3) { box.checked = false; return; }
        draftTeam.push(id);
      } else {
        draftTeam = draftTeam.filter((x) => x !== id);
      }
      renderBriefing(root, ctx);
    });
  });
  root.querySelectorAll('button[data-encounter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const team = draftTeam
        .map((id) => state.chimeras.find((c) => c.id === id))
        .filter((c) => c && !isInjured(c, ctx.now()));
      if (!team.length) return;
      const battleNo = state.warRecord.wins + state.warRecord.losses + 1;
      const seed = (state.seed ^ Math.imul(battleNo, 0x9e3779b9)) >>> 0;
      state.battle = createBattle(team, content.encounters[btn.dataset.encounter], content, seed, ctx.now());
      draftTeam = [];
      ctx.save();
      renderArena(root, ctx);
    });
  });
}

// --- Arena --------------------------------------------------------------

function renderArena(root, ctx) {
  const { state, content } = ctx;
  const battle = state.battle;
  const me = playerActive(battle);
  const foe = battle.enemy.active;
  const myChimera = state.chimeras.find((c) => c.id === me.refId);

  const actions = playerActions(battle);
  const moveBtns = actions
    .map((a, i) => {
      const cost = a.type === 'move' ? ` <span class="cost">${a.cost}⚡</span>` : '';
      return `<button type="button" data-action="${i}" class="act act-${a.type}">${a.label}${cost}</button>`;
    })
    .join('');

  const foeStatus = statusLine(foe);
  const meStatus = statusLine(me);

  root.innerHTML = `
    <section class="card arena">
      <div class="arena-side arena-foe">
        <div class="arena-info">
          <strong>${foe.name}</strong> ${foeStatus}
          ${bar(foe.hp, foe.maxHp, 'tier-scruffy')}
          <span class="fine-print">HP ${foe.hp}/${foe.maxHp} · wave ${battle.enemy.queue.length + 1} remaining</span>
        </div>
        <div class="arena-sprite">${renderUnitSVG(content.enemies[foe.refId] ?? { name: foe.name, shapes: [] })}</div>
      </div>
      <div class="arena-side arena-me">
        <div class="arena-sprite">${myChimera ? renderCreatureSVG(chimeraGenome(myChimera, content), content, { idPrefix: 'arena' }) : ''}</div>
        <div class="arena-info">
          <strong>${me.name}</strong> ${meStatus}
          ${bar(me.hp, me.maxHp, 'tier-gleaming')}
          <span class="fine-print">HP ${me.hp}/${me.maxHp}</span>
          ${bar(me.stamina, me.staminaMax, 'tier-fine')}
          <span class="fine-print">STA ${me.stamina}/${me.staminaMax}${me.regen < 0 ? ' (runs hot!)' : ''}</span>
        </div>
      </div>
    </section>
    <section class="card">
      <div class="battle-log">${battle.log.slice(-8).map((l) => `<p>${l}</p>`).join('')}</div>
      <div class="action-grid">${moveBtns}</div>
    </section>`;

  root.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = actions[Number(btn.dataset.action)];
      step(battle, action, content);
      ctx.save();
      if (battle.over) {
        const result = finishBattle(state, battle, content, ctx.now());
        ctx.save();
        lastAftermath = aftermathText(result);
        renderBriefing(root, ctx);
      } else {
        renderArena(root, ctx);
      }
    });
  });
}

function statusLine(c) {
  const bits = [];
  if (c.status.venom) bits.push(`☠×${c.status.venom}`);
  if (c.status.sleep) bits.push('💤');
  if (c.status.stun) bits.push('✶stun');
  if (c.status.trapped) bits.push('⛓trapped');
  if (c.status.guard) bits.push('🛡guard');
  if (c.status.charging != null) bits.push('⏳charging');
  if (c.rejection) bits.push('⚠rejection');
  return bits.length ? `<span class="lineage">${bits.join(' ')}</span>` : '';
}

function aftermathText(result) {
  const injuryNote = result.injuries.length
    ? ' ' + result.injuries.map((i) => `${i.chimera} is in the Infirmary (${i.injury.name}).`).join(' ')
    : '';
  if (result.outcome === 'win') return `Victory! Confiscated budget: $${result.reward}.${injuryNote}`;
  if (result.outcome === 'fled') return `Tactical scamper executed flawlessly.${injuryNote}`;
  return `Defeat. The lab demands a better chimera — breed, raise, splice.${injuryNote}`;
}
