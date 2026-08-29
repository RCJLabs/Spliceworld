// Arena renderer (M4, slimmed in M5): the live fight only. The War Room
// (campaign/ui.js) owns navigation, briefings, and aftermath display; the
// aftermath itself resolves through campaign.resolveBattle so conquest,
// capture, and containment all fire.

import { renderCreatureSVG, renderUnitSVG } from '../render/renderer.js';
import { chimeraGenome } from '../splice/theater.js';
import { step, playerActions, playerActive } from './engine.js';
import { resolveBattle } from '../campaign/campaign.js';
import * as sfx from '../audio/sfx.js';

function bar(value, max, cls) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div class="cond-bar"><div class="cond-fill ${cls}" style="width:${pct}%"></div></div>`;
}

// onDone(detail) fires once the battle resolves (win/loss/flee).
export function renderArena(root, ctx, onDone) {
  const { state, content } = ctx;
  const battle = state.battle;
  const me = playerActive(battle);
  const foe = battle.enemy.active;
  const myChimera = state.chimeras.find((c) => c.id === me.refId)
    ?? state.campaign.captives.find((c) => c.chimera.id === me.refId)?.chimera;

  const actions = playerActions(battle);
  const actionBtns = actions
    .map((a, i) => {
      const cost = a.type === 'move' ? ` <span class="cost">${a.cost}⚡</span>` : '';
      return `<button type="button" data-action="${i}" class="act act-${a.type}">${a.label}${cost}</button>`;
    })
    .join('');

  const cannon = battle.cannon.charge > 0
    ? `<div class="cond-bar cannon-bar"><div class="cond-fill tier-apex" style="width:${battle.cannon.charge}%"></div></div>
       <span class="fine-print">Containment Cannon ${battle.cannon.charge}%${foe.capturable ? ` — fires at ≤40% HP` : ' — no capturable target'}</span>`
    : '';

  root.innerHTML = `
    <section class="card arena">
      <p class="recipe">${battle.encounterName}${battle.context.kind === 'rescue' ? ' · RESCUE RAID' : ''}</p>
      <div class="arena-side arena-foe">
        <div class="arena-info">
          <strong>${foe.name}</strong> ${statusLine(foe)}
          ${bar(foe.hp, foe.maxHp, 'tier-scruffy')}
          <span class="fine-print">HP ${foe.hp}/${foe.maxHp} · wave ${battle.enemy.queue.length + 1} remaining</span>
        </div>
        <div class="arena-sprite">${renderUnitSVG(content.enemies[foe.refId] ?? { name: foe.name, shapes: [] })}</div>
      </div>
      <div class="arena-side arena-me">
        <div class="arena-sprite">${myChimera ? renderCreatureSVG(chimeraGenome(myChimera, content), content, { idPrefix: 'arena' }) : ''}</div>
        <div class="arena-info">
          <strong>${me.name}</strong> ${statusLine(me)}
          ${bar(me.hp, me.maxHp, 'tier-gleaming')}
          <span class="fine-print">HP ${me.hp}/${me.maxHp}</span>
          ${bar(me.stamina, me.staminaMax, 'tier-fine')}
          <span class="fine-print">STA ${me.stamina}/${me.staminaMax}${me.regen < 0 ? ' (runs hot!)' : ''}</span>
          ${cannon}
        </div>
      </div>
    </section>
    <section class="card">
      <div class="battle-log">${battle.log.slice(-8).map((l) => `<p>${l}</p>`).join('')}</div>
      <div class="action-grid">${actionBtns}</div>
    </section>`;

  root.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = actions[Number(btn.dataset.action)];
      if (action.type === 'capture') sfx.play('capture');
      step(battle, action, content);
      ctx.save();
      if (battle.over) {
        sfx.play(battle.outcome === 'win' ? 'win' : 'lose');
        const detail = resolveBattle(state, battle, content, ctx.now());
        ctx.save();
        onDone(detail);
      } else {
        renderArena(root, ctx, onDone);
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
