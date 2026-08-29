// War Room screen (M5): region map, notoriety, captives with live
// dissection countdowns, Containment salvage, news feed — and the launch
// point for assaults and rescue raids (arena rendered via battle/ui).

import { renderArena } from '../battle/ui.js';
import { createBattle, isInjured, obediencePercent } from '../battle/engine.js';
import { isSettled } from '../splice/theater.js';
import { fmtDuration } from '../ranch/ui.js';
import { toggleRow } from '../ui/picker.js';
import { analyze } from '../splice/physiology.js';
import {
  nodeStates, threatGen, incomePerDay, salvageUnit, regionOf,
} from './campaign.js';

let draftTarget = null; // { kind, nodeId?, captiveId?, encounterId }
let draftTeam = [];
let lastAftermath = null;

export function renderWarRoomScreen(root, ctx) {
  const { state } = ctx;
  if (state.battle) {
    renderArena(root, ctx, (detail) => {
      lastAftermath = aftermathText(detail);
      draftTarget = null;
      draftTeam = [];
      ctx.refreshTicker?.();
      renderWarRoomScreen(root, ctx);
    });
    return;
  }
  if (draftTarget) renderBriefing(root, ctx);
  else renderMap(root, ctx);
}

// --- The map ------------------------------------------------------------

function renderMap(root, ctx) {
  const { state, content, now } = ctx;
  const t = now();
  const region = regionOf(content);
  const gen = threatGen(state, content);
  const income = incomePerDay(state, content);

  const nodes = nodeStates(state, content).map(({ node, status }) => {
    const encounter = content.encounters[node.encounter];
    const btn =
      status === 'available'
        ? `<button type="button" data-node="${node.id}">Assault</button>`
        : status === 'held'
          ? `<span class="held-tag">HELD +$${node.incomePerDay}/d</span>`
          : `<span class="locked-tag">${(node.threatGen ?? 1) > gen ? 'needs Threat Gen 2' : 'locked'}</span>`;
    return `
      <div class="encounter node-${status}">
        <div><strong>${node.name}</strong>${node.boss ? ' 👑' : ''} <span class="lineage">${encounter.waves.length} waves · $${encounter.reward}</span><br>
        <span class="fine-print">${node.blurb}</span></div>
        ${btn}
      </div>`;
  }).join('');

  const captives = state.campaign.captives.map((cap) => `
    <div class="encounter captive">
      <div><strong>${cap.chimera.name}</strong> <span class="lineage">captured</span><br>
      <span class="fine-print">Unauthorized peer review in <strong class="countdown">${fmtDuration(cap.deadline - t)}</strong>. There is still time.</span></div>
      <button type="button" data-rescue="${cap.id}">Rescue Raid</button>
    </div>`).join('');

  const containment = state.campaign.containment.map((entry, i) => {
    const unit = content.enemies[entry.unitId];
    return `
      <div class="encounter">
        <div><strong>${unit.name}</strong><br><span class="fine-print">salvage: ${(unit.salvage ?? [])
          .map((p) => content.parts[p].name).join(', ')}</span></div>
        <button type="button" data-salvage="${i}">Salvage</button>
      </div>`;
  }).join('');

  const news = state.news.slice(-5).reverse().map((n) => `<p>📡 ${n}</p>`).join('');

  root.innerHTML = `
    ${lastAftermath ? `<section class="card"><h3>Last Sortie</h3><p class="ranch-msg">${lastAftermath}</p></section>` : ''}
    <section class="card">
      <div class="econ-row">
        <div><span class="econ-label">Notoriety</span><strong>${state.campaign.notoriety}</strong></div>
        <div><span class="econ-label">Threat Gen</span><strong>${gen}</strong></div>
        <div><span class="econ-label">Territory</span><strong>+$${income}/day</strong></div>
        <div><span class="econ-label">Record</span><strong>${state.warRecord.wins}W–${state.warRecord.losses}L</strong></div>
      </div>
    </section>
    ${captives ? `<section class="card"><h3>⏳ Captured — Rescue Windows</h3>${captives}</section>` : ''}
    <section class="card">
      <h3>${region.name}</h3>
      ${nodes}
    </section>
    ${containment ? `<section class="card"><h3>Containment</h3>${containment}</section>` : ''}
    <section class="card">
      <h3>News Wire</h3>
      <div class="news-feed">${news || '<p class="fine-print">All quiet. Suspiciously quiet.</p>'}</div>
    </section>`;

  root.querySelectorAll('button[data-node]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const node = region.nodes.find((n) => n.id === btn.dataset.node);
      draftTarget = { kind: 'assault', nodeId: node.id, encounterId: node.encounter, label: node.name };
      draftTeam = [];
      renderBriefing(root, ctx);
    });
  });
  root.querySelectorAll('button[data-rescue]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cap = state.campaign.captives.find((c) => c.id === btn.dataset.rescue);
      draftTarget = {
        kind: 'rescue',
        captiveId: cap.id,
        encounterId: content.campaignMeta.rescueEncounter,
        label: `Rescue ${cap.chimera.name}`,
      };
      draftTeam = [];
      renderBriefing(root, ctx);
    });
  });
  root.querySelectorAll('button[data-salvage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const result = salvageUnit(state, Number(btn.dataset.salvage), content, ctx.now());
      lastAftermath = result.msg;
      ctx.save();
      renderMap(root, ctx);
    });
  });
}

// --- Briefing / team picker ---------------------------------------------

function renderBriefing(root, ctx) {
  const { state, content, now } = ctx;
  const t = now();
  const encounter = content.encounters[draftTarget.encounterId];

  // What are we walking into? The class triangle only matters if the player
  // can see the matchup before they commit a team.
  const foeClasses = new Set(
    encounter.waves.flat().map((u) => content.enemies[u]?.class).filter(Boolean)
  );
  const foeLine = foeClasses.size
    ? [...foeClasses].map((c) => `${content.classes[c].icon} ${content.classes[c].name}`).join(', ')
    : 'no declared class';

  const roster = state.chimeras.map((ch) => {
    const injured = isInjured(ch, t);
    const note = injured
      ? `Infirmary: ${ch.injury.name} — ${fmtDuration(ch.injury.until - t)} left`
      : isSettled(ch, t)
        ? `ready · obedience ${obediencePercent(ch, t)}%`
        : `unsettled — Rejection debuffs · obedience ${obediencePercent(ch, t)}%`;
    const chClass = analyze(ch.frame, Object.values(ch.tokens), content).creatureClass;
    const cls = chClass ? content.classes[chClass] : null;
    const edge = cls && foeClasses.has(cls.beats) ? ' · type advantage here' : '';
    return toggleRow({
      id: ch.id,
      label: `${cls ? cls.icon + ' ' : '◇ '}${ch.name}`,
      sub: `${note}${edge}`,
      checked: draftTeam.includes(ch.id),
      disabled: injured,
    });
  }).join('');

  root.innerHTML = `
    <section class="card">
      <h3>${draftTarget.label}</h3>
      <p class="fine-print">${encounter.blurb} (${encounter.waves.length} waves${encounter.reward ? ` · $${encounter.reward}` : ''})</p>
      <p class="fine-print">Opposition: ${foeLine}</p>
      <h3>Strike Team (up to 3)</h3>
      ${roster || '<p class="ranch-msg">No chimeras available. The Surgery Theater accepts walk-ins.</p>'}
      <div class="ceremony-btns">
        <button type="button" id="wr-launch" class="big-btn" ${draftTeam.length ? '' : 'disabled'}>⚔ Launch</button>
        <button type="button" id="wr-back">Back</button>
      </div>
    </section>`;

  root.querySelectorAll('button[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggle;
      if (draftTeam.includes(id)) {
        draftTeam = draftTeam.filter((x) => x !== id);
      } else {
        if (draftTeam.length >= 3) return;
        draftTeam.push(id);
      }
      renderBriefing(root, ctx);
    });
  });
  root.querySelector('#wr-back').addEventListener('click', () => {
    draftTarget = null;
    renderMap(root, ctx);
  });
  root.querySelector('#wr-launch').addEventListener('click', () => {
    const team = draftTeam
      .map((id) => state.chimeras.find((c) => c.id === id))
      .filter((c) => c && !isInjured(c, ctx.now()));
    if (!team.length) return;
    const battleNo = state.warRecord.wins + state.warRecord.losses + 1;
    const seed = (state.seed ^ Math.imul(battleNo, 0x9e3779b9)) >>> 0;
    state.battle = createBattle(team, encounter, content, seed, ctx.now(), {
      kind: draftTarget.kind,
      nodeId: draftTarget.nodeId ?? null,
      captiveId: draftTarget.captiveId ?? null,
    });
    ctx.save();
    renderWarRoomScreen(root, ctx);
  });
}

function aftermathText(detail) {
  const bits = [];
  if (detail.outcome === 'win') bits.push(`Victory!${detail.reward ? ` Confiscated budget: $${detail.reward}.` : ''}`);
  else if (detail.outcome === 'fled') bits.push('Tactical scamper executed flawlessly.');
  else bits.push('Defeat.');
  if (detail.freed) bits.push(`${detail.freed} is home safe (and slightly dramatic about it).`);
  if (detail.capturedChimera) bits.push(`${detail.capturedChimera} was CAPTURED — a rescue window is open in the War Room.`);
  if (detail.salvageUnits.length) bits.push(`Impounded: ${detail.salvageUnits.length} unit(s) for Containment.`);
  const treatable = detail.injuries.filter((i) => i.chimera !== detail.capturedChimera);
  if (treatable.length) bits.push(treatable.map((i) => `${i.chimera} → Infirmary (${i.injury.name}).`).join(' '));
  return bits.join(' ');
}
