// War Room screen (M5): region map, notoriety, captives with live
// dissection countdowns, Containment salvage, news feed — and the launch
// point for assaults and rescue raids (arena rendered via battle/ui).

import { renderArena } from '../battle/ui.js';
import { createBattle, isInjured, obediencePercent } from '../battle/engine.js';
import { isSettled } from '../splice/theater.js';
import { fmtDuration } from '../ranch/ui.js';
import { fieldNote, bindFieldNote, collapsibleCard, bindFolds, isOpen } from '../ui/cards.js';
import { guideForScreen } from '../ranch/onboarding.js';
import { upkeepPerDay, TUNING } from '../ranch/ranch.js';
import { toggleRow, pickerField, bindPickers, openPicker } from '../ui/picker.js';
import { analyze } from '../splice/physiology.js';
import { renderCreatureSVG } from '../render/renderer.js';
import { rivalStatus, rivalEncounter } from './rivals.js';
import { directEncounter, directorRead } from './director.js';
import {
  bayUnit, rehabPlan, rehabTuning, startRehab, rehabSession, cancelRehab,
  rehabRemainingMs, sessionReadyAt,
} from './rehab.js';
import { GRADES, GRADE_INDEX } from '../splice/extract.js';
import { contestOn, contestEncounter, contestRemainingMs, defencesOf, isContested } from './contest.js';
import {
  operationList, activeOp, opOdds, opReady, opCooldownEndsAt, opRemainingMs,
  startOperation, abortOperation, heatNow, opTuning,
} from './operations.js';
import {
  profileOf, philosophyList, rollIdentities, setIdentity, setPhilosophy, duelBarks,
} from './monologue.js';
import {
  regionStates, threatGen, threatRung, nextThreatRung,
  incomePerDay, incomeSuspended, salvageUnit, nodeById,
} from './campaign.js';

let draftTarget = null; // { kind, nodeId?, captiveId?, rivalId?, encounterId, label }

// Static encounters live in enemies.json; a rival duel is generated from
// the world seed and their record, so it is identical every time it is
// resolved — briefing preview and battle always face the same team.
function encounterFor(state, target, content) {
  if (target.kind === 'rival') return rivalEncounter(state, content.rivals[target.rivalId], content);
  // A defence is the node's own encounter, escalated — built fresh from
  // the live contest so the briefing and the battle always agree.
  const base =
    target.kind === 'defend'
      ? contestEncounter(state, content, contestOn(state, target.nodeId))
      : content.encounters[target.encounterId];
  // The AI director gets a look at every human encounter before you do.
  return base ? directEncounter(state, base, content) : null;
}
let draftTeam = [];
let lastAftermath = null;

// --- Sub-navigation -------------------------------------------------------
//
// The War Room accumulated thirteen cards over nineteen waves — jobs,
// counter-offensives, captives, the strip, two dossiers, rival labs,
// containment and the wire, stacked into one column on a 380px phone. It
// is now five views behind a tab bar.
//
// The rule the layout is built around: ALERTS NEVER GO BEHIND A TAB. A
// rescue window and a counter-offensive both carry live countdowns that
// cost you a creature or a node when they run out, so hiding one on
// another view would recreate exactly the failure mode contestation was
// designed to avoid. They sit above the tabs, on every view.
//
// Deliberately module state rather than saved state: it survives the
// re-render on every tick and every action, which is what matters, and it
// costs no save migration to do it that way.
const WAR_TABS = [
  { id: 'map', icon: '🗺', label: 'Map' },
  { id: 'jobs', icon: '💼', label: 'Jobs' },
  { id: 'labs', icon: '🧫', label: 'Labs' },
  { id: 'bays', icon: '⛓', label: 'Bays' },
  { id: 'wire', icon: '📡', label: 'Wire' },
];
let warTab = 'map';

// A badge is a promise that something is waiting, so only two things earn
// one: a job report nobody has read, and a bay with something in it.
// Everything else would be decoration, and a decoration on a tab teaches
// players to ignore the badges that matter.
function tabBadge(state, id) {
  if (id === 'jobs') {
    if (state.campaign.opReport) return { text: '!', kind: 'alert' };
    if (activeOp(state)) return { text: '⏳', kind: 'busy' };
    return null;
  }
  if (id === 'bays') {
    const n = state.campaign.containment?.length ?? 0;
    return n ? { text: String(n), kind: 'count' } : null;
  }
  return null;
}

function subtabBar(state) {
  return `
    <nav class="subtabs" id="war-subtabs">
      ${WAR_TABS.map((tab) => {
        const badge = tabBadge(state, tab.id);
        return `
          <button type="button" data-war-tab="${tab.id}" class="${warTab === tab.id ? 'is-on' : ''}">
            <span class="subtab-icon" aria-hidden="true">${tab.icon}</span>
            <span class="subtab-label">${tab.label}</span>
            ${badge ? `<span class="subtab-badge badge-${badge.kind}">${badge.text}</span>` : ''}
          </button>`;
      }).join('')}
    </nav>`;
}

export function renderWarRoomScreen(root, ctx) {
  const { state } = ctx;
  // Battle mode locks the shell to one screen; every other view scrolls.
  if (!state.battle) document.body.classList.remove('in-battle');
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

// What a rival has worked out about you (R27), in their words rather than a
// stat block. The player is warned BEFORE committing a team, because a
// counter you cannot see coming is a coin flip rather than a decision — and
// this is the same dossier object the team builder used, so what is on the
// card is what is on the field.
function rivalFile(dossier, content) {
  if (!dossier || !dossier.fights) return '';
  if (!dossier.tier) {
    return `<p class="fine-print rival-file">🗂 ${dossier.fights} duel${
      dossier.fights === 1 ? '' : 's'
    } on file. They have not changed anything yet.</p>`;
  }
  // Written as sentences rather than a stat block: what they know, then
  // what they have done about it.
  const read = [];
  if (dossier.topClass) {
    const cls = content.classes[dossier.topClass];
    read.push(`filed under ${cls.icon} ${cls.name}`);
  }
  if (dossier.topTag) read.push(`swinging ${dossier.topTag}`);

  const done = [];
  if (dossier.counterClass) {
    const cls = content.classes[dossier.counterClass];
    done.push(`${dossier.counterLeads ? 'Leading with' : 'Answering with'} ${cls.icon} ${cls.name}.`);
  }
  // The intel lines are authored as whole sentences already.
  if (dossier.intel) done.push(dossier.intel);
  if (dossier.mirror) {
    done.push(`They are fielding your own ${content.parts[dossier.mirror]?.name ?? 'anatomy'} back at you.`);
  }
  return `
    <p class="fine-print rival-counter">⚠ ${dossier.fights} duel${dossier.fights === 1 ? '' : 's'} on file${
      read.length ? `, ${read.join(', ')}` : ''
    }. ${done.length ? done.join(' ') : 'They are iterating.'}</p>`;
}

// --- The map ------------------------------------------------------------

function renderMap(root, ctx) {
  const { state, content, now } = ctx;
  const t = now();
  const gen = threatGen(state, content);
  const income = incomePerDay(state, content);
  const suspended = incomeSuspended(state, content);
  const map = regionStates(state, content);
  const nextRung = nextThreatRung(state, content);
  // Territory is gross. What the lab banks is territory plus the stipend
  // minus what the stable eats, and since R25 the stable eats plenty.
  const upkeep = upkeepPerDay(state, content);
  const net = Math.round(TUNING.stipendPerDay + income - upkeep);

  // Five strips instead of one (R26). A locked region still shows its name,
  // its identity and the one thing standing between you and it — a map that
  // hides where you are going is a map you cannot plan against. Its nodes
  // stay folded away until it opens, so the strip you are actually fighting
  // in is never buried under three you cannot reach.
  // The strip you are actually fighting in is the first open one you have
  // not finished. That one starts unfolded; everything else — conquered,
  // or still locked — starts shut, because five strips at four nodes each
  // is a very long column to scroll past to reach the news. A player's own
  // choice always overrides the guess.
  const frontier = map.find((r) => r.open && r.held < r.region.nodes.length)?.region.id ?? null;
  const regions = map.map(({ region, open, blockers, nodes: nodeRows, held }) => {
    const rows = open ? nodeRows.map(({ node, status }) => {
      const encounter = content.encounters[node.encounter];
      const btn =
        status === 'available'
          ? `<button type="button" data-node="${node.id}">Assault</button>`
          : status === 'held'
            ? `<span class="held-tag">HELD +$${node.incomePerDay}/d</span>`
            : status === 'contested'
              ? `<span class="contested-tag">CONTESTED −$${node.incomePerDay}/d</span>`
              : `<span class="locked-tag">${(node.threatGen ?? 1) > gen ? `needs Threat Gen ${node.threatGen}` : 'locked'}</span>`;
      return `
        <div class="encounter node-${status}">
          <div><strong>${node.name}</strong>${node.boss ? ' 👑' : ''} <span class="lineage">${encounter.waves.length} waves · $${encounter.reward}</span><br>
          <span class="fine-print">${node.blurb}</span></div>
          ${btn}
        </div>`;
    }).join('') : '';
    const contestedHere = region.nodes.filter((n) => isContested(state, n.id)).length;
    const body = open
      ? `${region.demand ? `<p class="region-demand">🧬 ${region.demand}</p>` : ''}${rows}`
      : `<p class="region-locked">🔒 ${blockers.map((b) => b.label).join(' · ')}</p>`;
    const summary = open
      ? held === region.nodes.length
        ? 'Held end to end.'
        : `${region.nodes.length - held} node${region.nodes.length - held === 1 ? '' : 's'} still theirs.`
      : `🔒 ${blockers.map((b) => b.label).join(' · ')}`;
    return collapsibleCard({
      id: `region:${region.id}`,
      title: `${region.name}${region.subtitle ? ` <span class="fine-print region-sub">${region.subtitle}</span>` : ''}`,
      badge: `${contestedHere ? '🛡 ' : ''}${held}/${region.nodes.length}`,
      summary,
      body,
      open: isOpen(state, `region:${region.id}`, open && region.id === frontier),
      extraClass: `region-card ${open ? '' : 'is-locked'}`,
    });
  }).join('');

  // A counter-offensive is time-critical and costs money every hour it
  // stands, so it gets an alert of its own rather than a quieter row on
  // the map (which also marks it).
  const contests = (state.campaign.contested ?? []).map((c) => {
    const node = nodeById(content, c.nodeId);
    if (!node) return '';
    const held = defencesOf(state, c.nodeId);
    return `
    <div class="encounter contested">
      <div><strong>${node.name}</strong> <span class="lineage">counter-offensive</span><br>
      <span class="fine-print"><strong class="countdown">${fmtDuration(contestRemainingMs(c, t))}</strong> to hold the line · <strong>$${node.incomePerDay}/day</strong> suspended until you do${
        held ? ` · you have held it ${held}× already` : ''
      }.</span></div>
      <button type="button" data-defend="${c.nodeId}">🛡 Defend</button>
    </div>`;
  }).join('');

  const captives = state.campaign.captives.map((cap) => `
    <div class="encounter captive">
      <div><strong>${cap.chimera.name}</strong> <span class="lineage">captured</span><br>
      <span class="fine-print">Unauthorized peer review in <strong class="countdown">${fmtDuration(cap.deadline - t)}</strong>. There is still time.</span></div>
      <button type="button" data-rescue="${cap.id}">Rescue Raid</button>
    </div>`).join('');

  const containment = state.campaign.containment.map((entry) => bayCard(state, entry, content, t)).join('');

  // Rival Labs. Their chimeras are real genomes, so the card can just draw
  // the lead specimen — no portrait art, same renderer as everything else.
  const rivals = rivalStatus(state, content).map(({ rival, record, status, need }) => {
    const cls = content.classes[rival.classBias];
    const locked = status === 'locked';
    const preview = locked ? null : rivalEncounter(state, rival, content);
    const lead = preview?.waves[0];
    const roster = preview
      ? preview.waves
          .map((u) => `${content.classes[u.class]?.icon ?? '◇'} ${u.name} <span class="lineage">HP ${u.hp} · PWR ${u.power}</span>`)
          .join('<br>')
      : '';
    return `
      <div class="rival-card ${locked ? 'is-locked' : ''}">
        <div class="rival-portrait">${
          lead ? renderCreatureSVG(lead.genome, content, { idPrefix: `rv-${rival.id}` }) : '<div class="rival-redacted">?</div>'
        }</div>
        <div class="rival-body">
          <strong>${rival.name}</strong>
          <p class="fine-print">${rival.title}</p>
          <p class="class-banner class-${rival.classBias}">${cls.icon} ${cls.name} school — beats ${content.classes[cls.beats].name}</p>
          <p class="rival-quote">&ldquo;${rival.philosophy}&rdquo;</p>
          ${record.defeats || record.losses ? `<p class="fine-print">Record: ${record.defeats}W–${record.losses}L against you${record.defeats ? ` · iterated ${record.defeats}× since` : ''}</p>` : ''}
          ${roster ? `<p class="fine-print">${roster}</p>` : ''}
          ${rivalFile(preview?.dossier, content)}
          ${
            locked
              ? `<span class="locked-tag">${need.join(' · ')}</span>`
              : `<button type="button" data-rival="${rival.id}">${status === 'rematch' ? `Rematch — $${preview.reward}` : `Challenge — $${preview.reward}`}</button>`
          }
        </div>
      </div>`;
  }).join('');

  // What the world has learned. Shown whether or not it is acting on it yet,
  // because "they are studying you" is the threat, not the swap.
  const read = directorRead(state, content);
  const dossier = read.profile.samples >= (content.directorMeta?.minSamples ?? 4)
    ? `<section class="card dossier">
        <h3>🛰 Their Dossier On You</h3>
        <p class="fine-print">${
          read.profile.topTags.length
            ? `Filed under: ${read.profile.topTags.map((t) => `<strong>${t.tag}</strong> ${Math.round(t.share * 100)}%`).join(' · ')}`
            : 'No pattern yet. Keep them guessing.'
        }${read.profile.favoredClass ? ` · stable reads <strong>${content.classes[read.profile.favoredClass].icon} ${content.classes[read.profile.favoredClass].name}</strong>` : ' · no dominant class'}</p>
        <p class="fine-print">${
          read.rule
            ? `⚠ Countermeasures in the field: ${read.rule.intel}`
            : 'They have a file but no plan yet. Give them fewer ideas.'
        }${read.profile.dissections ? ` They have completed ${read.profile.dissections} unauthorized peer review${read.profile.dissections === 1 ? '' : 's'} — that is where most of this came from.` : ''}</p>
      </section>`
    : '';

  // The wire has its own view now, so it shows everything it keeps
  // rather than the last five lines squeezed under the map.
  const wire = [...state.news].reverse().map((n) => `<p>📡 ${n}</p>`).join('');

  const views = {
    map: regions,
    jobs: jobsCard(state, ctx, t),
    labs: `
      ${dossier}
      ${dossierCard(state, content)}
      ${rivals ? `<section class="card"><h3>🧫 Rival Labs</h3>${rivals}</section>` : ''}`,
    bays: containment
      ? `<section class="card"><h3>⛓ Containment</h3>${containment}</section>`
      : `<section class="card"><h3>⛓ Containment</h3><p class="ranch-msg">The bays are empty. Charge the Containment Cannon in a fight and bring something home.</p></section>`,
    wire: `
      <section class="card">
        <h3>📡 News Wire</h3>
        <div class="news-feed">${wire || '<p class="fine-print">All quiet. Suspiciously quiet.</p>'}</div>
      </section>`,
  };

  root.innerHTML = `
    ${lastAftermath ? `<section class="card"><h3>Last Sortie</h3><p class="ranch-msg">${lastAftermath}</p></section>` : ''}
    <section class="card">
      <div class="econ-row">
        <div><span class="econ-label">Notoriety</span><strong>${state.campaign.notoriety}</strong></div>
        <div><span class="econ-label">Threat Gen</span><strong>${gen}</strong>${
          nextRung ? `<span class="econ-next">Gen ${nextRung.gen} at ${nextRung.at}</span>` : ''
        }</div>
        <div><span class="econ-label">Territory</span><strong>+$${income}/day</strong>${
          suspended ? `<span class="econ-suspended">−$${suspended} contested</span>` : ''
        }</div>
        <div><span class="econ-label">Net</span><strong class="${net < 0 ? 'net-negative' : 'net-positive'}">${
          net < 0 ? '−' : '+'
        }$${Math.abs(net)}/day</strong><span class="econ-next">after $${upkeep} upkeep</span></div>
        <div><span class="econ-label">Record</span><strong>${state.warRecord.wins}W–${state.warRecord.losses}L</strong></div>
      </div>
    </section>
    ${contests ? `<section class="card contest-card"><h3>🛡 Counter-Offensive</h3>${contests}</section>` : ''}
    ${captives ? `<section class="card captive-alert"><h3>⏳ Captured — Rescue Windows</h3>${captives}</section>` : ''}
    ${subtabBar(state)}
    ${fieldNote(guideForScreen(state, content, t, 'battle'))}
    ${views[warTab] ?? views.map}`;

  bindFieldNote(root, ctx, () => renderMap(root, ctx));
  bindFolds(root, ctx, () => renderMap(root, ctx));
  root.querySelectorAll('button[data-war-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      warTab = btn.dataset.warTab;
      renderMap(root, ctx);
    });
  });
  bindDossier(root, ctx, () => renderMap(root, ctx));
  bindJobs(root, ctx, () => renderMap(root, ctx));
  root.querySelectorAll('button[data-node]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const node = nodeById(content, btn.dataset.node);
      draftTarget = { kind: 'assault', nodeId: node.id, encounterId: node.encounter, label: node.name };
      draftTeam = [];
      renderBriefing(root, ctx);
    });
  });
  root.querySelectorAll('button[data-rival]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rival = content.rivals[btn.dataset.rival];
      draftTarget = { kind: 'rival', rivalId: rival.id, encounterId: `rival_${rival.id}`, label: rival.name };
      draftTeam = [];
      renderBriefing(root, ctx);
    });
  });
  root.querySelectorAll('button[data-defend]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const node = nodeById(content, btn.dataset.defend);
      draftTarget = { kind: 'defend', nodeId: node.id, encounterId: node.encounter, label: `Defend ${node.name}` };
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
  const bayAction = (attr, run) => {
    root.querySelectorAll(`button[data-${attr}]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = run(btn.dataset[attr]);
        lastAftermath = result.msg;
        for (const line of result.news ?? []) ctx.pushNews(line);
        ctx.save();
        renderMap(root, ctx);
      });
    });
  };
  bayAction('salvage', (id) => salvageUnit(state, id, content, ctx.now()));
  bayAction('rehab', (id) => startRehab(state, id, content, ctx.now()));
  bayAction('session', (id) => rehabSession(state, id, content, ctx.now()));
  bayAction('cancel', (id) => cancelRehab(state, id, content));
}

// --- Your dossier --------------------------------------------------------

// §3.8's other half. The rivals have carried a name, a title and a
// philosophy since they were written; this is the player's, on the same
// schema, which is what makes the monologue drop in without a refactor.
//
// A philosophy is NARRATIVE ONLY and the card says so out loud, because a
// menu that looks like a build choice and is not would be worse than no
// menu at all.
let identityRoll = 0;

function dossierCard(state, content) {
  const me = profileOf(state, content);
  return `
    <section class="card dossier-mine">
      <h3>🧾 Your Dossier</h3>
      <p class="dossier-name">${me.named ? `${me.title} ${me.name}` : 'Unregistered Operator'}</p>
      <p class="fine-print">${me.named ? `of ${me.lab}` : 'The paperwork has not been filed. The paperwork will never be filed.'}</p>
      <p class="rival-quote">&ldquo;${me.philosophy?.tagline ?? ''}&rdquo;</p>
      <p class="fine-print">${me.philosophy?.blurb ?? ''}</p>
      ${pickerField({
        id: 'me-identity',
        label: 'Name on the door',
        value: me.named ? `${me.title} ${me.name}` : 'Choose a name',
        hint: me.lab,
      })}
      ${pickerField({
        id: 'me-philosophy',
        label: 'Philosophy',
        value: me.philosophy?.name ?? '—',
        hint: 'Flavour only — your anatomy is where the mechanics live',
      })}
    </section>`;
}

function bindDossier(root, ctx, redraw) {
  const { state, content } = ctx;
  bindPickers(root, {
    'me-identity': () => ({
      title: 'Name on the door',
      subtitle: 'Rolled, not typed — this game does not open the phone keyboard for anybody.',
      groups: [
        {
          label: null,
          options: rollIdentities(content, state.seed + identityRoll, 6).map((id) => ({
            id: id.id,
            label: `${id.title} ${id.name}`,
            sub: `of ${id.lab}`,
          })),
        },
        { label: null, options: [{ id: '__reroll', label: '🎲 Roll a different set', sub: 'None of these. Try again.' }] },
      ],
      selectedId: '',
      onPick: (value) => {
        if (value === '__reroll') {
          identityRoll += 1;
        } else {
          const chosen = rollIdentities(content, state.seed + identityRoll, 6).find((i) => i.id === value);
          if (chosen) setIdentity(state, { title: chosen.title, name: chosen.name, lab: chosen.lab });
        }
        ctx.save();
        redraw();
      },
    }),
    'me-philosophy': () => ({
      title: 'Philosophy',
      subtitle: 'What you tell people at parties. Changes what you SAY, never what you roll.',
      groups: [
        {
          label: null,
          options: philosophyList(content).map((ph) => ({
            id: ph.id,
            label: ph.name,
            sub: ph.tagline,
          })),
        },
      ],
      selectedId: profileOf(state, content).philosophy?.id ?? '',
      onPick: (value) => {
        setPhilosophy(state, value);
        ctx.save();
        redraw();
      },
    }),
  });
}

// --- The Jobs board ------------------------------------------------------

// Non-combat work: the answer to a campaign where every route to money and
// to new fauna ran through winning battles. It sits ABOVE the map on
// purpose — it is the first thing a broke player should see, because a
// broke player is exactly who it is for.

const pct = (n) => `${Math.round(n * 100)}%`;

function jobsCard(state, ctx, t) {
  const { content } = ctx;
  const jobs = operationList(content);
  if (!jobs.length) return '';
  const run = activeOp(state);
  const heat = Math.round(heatNow(state, content, t));
  const report = state.campaign.opReport;

  const heatLine = `<p class="fine-print">Heat <strong class="${heat > 55 ? 'heat-high' : ''}">${heat}/100</strong> — ${
    heat > 55
      ? 'the county is extremely awake. Everything is harder until it is not.'
      : heat > 20
        ? 'somebody has started noticing a pattern.'
        : 'nobody is looking for you. Yet.'
  }</p>`;

  if (run) {
    const op = content.operations[run.opId];
    const who = state.chimeras.find((c) => c.id === run.chimeraId);
    return `
      <section class="card jobs-card">
        <h3>💼 Job In Progress</h3>
        <div class="encounter job-live">
          <div><strong>${op.icon} ${op.name}</strong><br>
          <span class="fine-print">Back in <strong class="countdown">${fmtDuration(opRemainingMs(state, t))}</strong> · ${
            who ? who.name : 'you went yourself'
          } · odds were ${pct(run.chance)}</span></div>
          <button type="button" class="job-abort" data-abort="1">Call it off</button>
        </div>
        ${heatLine}
      </section>`;
  }

  const rows = jobs.map((op) => {
    const ready = opReady(state, op.id, t);
    const crew = op.crew === 'none' ? null : state.chimeras.find((c) => !isInjured(c, t)) ?? null;
    const odds = opOdds(state, op, crew, content, t);
    const loot = [
      `$${op.funds[0]}–${op.funds[1]}`,
      op.livestock ? `${pct(op.livestock.chance)} livestock` : null,
    ].filter(Boolean).join(' · ');
    // The blurb is good writing and it lives in the crew sheet, not here:
    // seven four-line rows above the map turned the board into a wall and
    // pushed the entire campaign off the screen.
    return `
      <div class="encounter job-row ${ready ? '' : 'is-cooling'}">
        <div><strong>${op.icon} ${op.name}</strong> <span class="lineage">${op.hours}h · ${loot}</span>
        <span class="fine-print job-odds">${
          odds.blocked ? `⚠ ${odds.blocked}` : `Best odds: <strong>${pct(odds.chance)}</strong>`
        }${op.notoriety ? ` · +${op.notoriety} heat` : ' · draws no attention at all'}</span></div>
        ${ready
          ? `<button type="button" data-job="${op.id}" ${odds.blocked ? 'disabled' : ''}>Run it</button>`
          : `<span class="locked-tag">quiet for ${fmtDuration(opCooldownEndsAt(state, op.id) - t)}</span>`}
      </div>`;
  }).join('');

  const reportHtml = report
    ? `<div class="encounter job-report ${report.success ? 'is-win' : 'is-bust'}">
        <div><strong>${report.success ? '✔' : '✘'} ${report.name}</strong><br>
        <span class="fine-print">${report.msg}${report.funds ? ` <strong>+$${report.funds}</strong>.` : ''}${
          report.animal ? ` <strong>${report.animal.name}</strong> the ${content.species[report.animal.species].name} is in the pens.` : ''
        }${report.overCapacity ? ' The pens are over capacity and everyone is cross about it.' : ''}${
          report.injured ? ` ${report.injured} is in the Infirmary, sulking.` : ''
        }</span></div>
        <button type="button" data-dismiss="1">OK</button>
      </div>`
    : '';

  return `
    <section class="card jobs-card">
      <h3>💼 Jobs</h3>
      ${reportHtml}
      ${rows}
      ${heatLine}
    </section>`;
}

function bindJobs(root, ctx, redraw) {
  const { state, content } = ctx;
  const t = ctx.now();
  root.querySelectorAll('button[data-dismiss]').forEach((btn) => {
    btn.addEventListener('click', () => { state.campaign.opReport = null; ctx.save(); redraw(); });
  });
  root.querySelectorAll('button[data-abort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lastAftermath = abortOperation(state, content).msg;
      ctx.save();
      redraw();
    });
  });
  root.querySelectorAll('button[data-job]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const op = content.operations[btn.dataset.job];
      // The crew sheet is where the anatomy pays off: every candidate
      // shows the odds IT would give and why, so picking the right
      // creature is a decision rather than a guess (Law 4).
      const options = [];
      if (op.crew !== 'required') {
        const solo = opOdds(state, op, null, content, t);
        options.push({ id: '__solo', label: 'Go yourself', sub: `${pct(solo.chance)} — no anatomy, no alibi` });
      }
      for (const ch of state.chimeras) {
        const injured = isInjured(ch, t);
        const odds = opOdds(state, op, ch, content, t);
        const why = odds.reasons
          .map((r) => `${r.delta > 0 ? '+' : ''}${Math.round(r.delta * 100)} ${r.text}`)
          .join(' · ');
        options.push({
          id: ch.id,
          label: `${pct(odds.chance)} — ${ch.name}`,
          sub: injured ? 'in the Infirmary' : why || 'brings nothing in particular to this one',
          disabled: injured,
        });
      }
      openPicker({
        title: op.name,
        subtitle: `${op.blurb}<br><br>${op.hours}h · ${
          op.demands.tags.length ? `wants ${op.demands.tags.join(' or ')} anatomy` : 'no particular anatomy'
        }${op.demands.class ? ` · favours a ${op.demands.class} build` : ''}. Anatomy improves the odds; it never bars the door.`,
        groups: [{ label: null, options }],
        selectedId: '',
        onPick: (value) => {
          const result = startOperation(state, op.id, value === '__solo' ? null : value, content, ctx.now());
          lastAftermath = result.msg;
          ctx.save();
          redraw();
        },
      });
    });
  });
}

// --- Containment ---------------------------------------------------------

// A bay offers the two futures §3.6 promises, side by side and with real
// numbers on both, because the whole point is that it is a CHOICE: take it
// apart for enemy tech you cannot otherwise get, or spend time and money
// on a creature you could not otherwise build.
function bayCard(state, entry, content, t) {
  const unit = bayUnit(entry, content);
  if (!unit) return '';
  const plan = rehabPlan(state, entry, content);
  const portrait = unit.genome
    ? renderCreatureSVG(unit.genome, content, { idPrefix: `bay-${entry.id ?? unit.id}` })
    : '<div class="rival-redacted">⛓</div>';
  const cls = unit.class ? content.classes[unit.class] : null;
  const body = entry.rehab
    ? programmeHtml(state, entry, unit, content, t)
    : offerHtml(state, entry, plan, unit, content);

  return `
    <div class="rival-card bay-card">
      <div class="rival-portrait">${portrait}</div>
      <div class="rival-body">
        <strong>${unit.name}</strong>
        <p class="fine-print">${cls ? `${cls.icon} ${cls.name}` : '◇ Unclassed'} · HP ${unit.hp} · PWR ${unit.power} · ARM ${unit.armor}</p>
        ${body}
      </div>
    </div>`;
}

function offerHtml(state, entry, plan, unit, content) {
  // A badge per part turned a six-part specimen into six lines of PRIME.
  // The grades are the interesting part but there are usually only one or
  // two of them, so count them once and then just name the anatomy.
  const byGrade = new Map();
  const names = [];
  for (const [i, partId] of (unit.salvage ?? []).entries()) {
    const part = content.parts[partId];
    if (!part) continue;
    const grade = unit.salvageGrades?.[i] ?? 'standard';
    byGrade.set(grade, (byGrade.get(grade) ?? 0) + 1);
    names.push(part.name);
  }
  const badges = [...byGrade.entries()]
    .sort((a, b) => GRADE_INDEX[b[0]] - GRADE_INDEX[a[0]])
    .map(([id, n]) => `<span class="grade-badge grade-${id}">${GRADES[GRADE_INDEX[id]].name}</span>${n > 1 ? ` ×${n}` : ''}`)
    .join(' ');
  const salvageList = names.length ? `${badges} — ${names.join(', ')}` : '';

  return `
    <p class="fine-print">🔧 <strong>Salvage</strong> → ${salvageList || 'nothing recoverable'}</p>
    ${plan.possible
      ? `<p class="fine-print">🫂 <strong>Rehabilitate</strong> → joins the roster whole, on a ${content.frames[unit.genome.frame]?.name ?? unit.genome.frame} chassis, at the grades its old lab raised. ${plan.hours}h · $${plan.fee} · arrives settled but wary (instability ${plan.instability}, bond 0).</p>`
      : `<p class="fine-print locked-note">${plan.reason}</p>`}
    <div class="bay-btns">
      <button type="button" data-salvage="${entry.id}">🔧 Salvage</button>
      ${plan.possible
        ? plan.enabled
          ? `<button type="button" class="bay-rehab" data-rehab="${entry.id}" ${state.funds >= plan.fee ? '' : 'disabled'}>🫂 Rehabilitate — $${plan.fee}</button>`
          : '<span class="locked-tag">needs the Reorientation Wing — Ranch › Facility</span>'
        : ''}
    </div>`;
}

function programmeHtml(state, entry, unit, content, t) {
  const tune = rehabTuning(content);
  const readyAt = sessionReadyAt(entry, content);
  const maxed = entry.rehab.sessions >= tune.maxSessions;
  const ready = t >= readyAt;
  return `
    <p class="fine-print">⏳ Reorientation: <strong class="countdown">${fmtDuration(rehabRemainingMs(entry, t))}</strong> remaining · bond ${entry.rehab.bond}/100 · instability ${entry.rehab.instability}/100 · sessions ${entry.rehab.sessions}/${tune.maxSessions}</p>
    <p class="fine-print">${entry.rehab.sessions
      ? 'It has stopped watching the door and started watching you, which is progress of a kind.'
      : 'The clock alone will graduate it — just wary of you. Sessions are what buy the bond.'}</p>
    <div class="bay-btns">
      <button type="button" data-session="${entry.id}" ${ready && !maxed && state.funds >= tune.sessionCost ? '' : 'disabled'}>${
        maxed
          ? 'Curriculum complete'
          : ready
            ? `🎯 Enrichment session ($${tune.sessionCost})`
            : `Next session in ${fmtDuration(readyAt - t)}`
      }</button>
      <button type="button" class="bay-cancel" data-cancel="${entry.id}">End programme</button>
    </div>`;
}

// --- Briefing / team picker ---------------------------------------------

function renderBriefing(root, ctx) {
  const { state, content, now } = ctx;
  const t = now();
  const encounter = encounterFor(state, draftTarget, content);
  // The window can close while the briefing is open (a tick fires on
  // focus). There is nothing left to defend, so say so rather than
  // rendering a battle against undefined.
  if (!encounter) {
    lastAftermath = 'The convoy arrived while you were choosing a team. That one is theirs for now.';
    draftTarget = null;
    renderMap(root, ctx);
    return;
  }

  // What are we walking into? The class triangle only matters if the player
  // can see the matchup before they commit a team.
  const foeClasses = new Set(
    encounter.waves
      .map((u) => (typeof u === 'string' ? content.enemies[u] : u)?.class)
      .filter(Boolean)
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
      <p class="${draftTarget.kind === 'rival' ? 'rival-quote' : 'fine-print'}">${
        draftTarget.kind === 'rival' ? `&ldquo;${encounter.blurb}&rdquo;` : encounter.blurb
      } <span class="fine-print">(${encounter.waves.length} ${draftTarget.kind === 'rival' ? 'specimens' : 'waves'}${encounter.reward ? ` · $${encounter.reward}` : ''})</span></p>
      <p class="fine-print">Opposition: ${foeLine}${
        foeClasses.size > 1 && encounter.counterClass ? ' — one of them was built to answer your stable' : ''
      }</p>
      ${encounter.contestOf ? `<p class="fine-print contest-intel">🛡 ${encounter.intel}</p>` : ''}
      ${encounter.directed ? `<p class="fine-print intel-line">🛰 Intel: ${encounter.directed.intel} <strong>${content.enemies[encounter.directed.unitId].name}</strong> ${
        encounter.directed.added
          ? 'is riding along — they sent extra.'
          : `has replaced the ${content.enemies[encounter.directed.replaced].name}.`
      }</p>` : ''}
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
      directed: encounter.directed ?? null,
      kind: draftTarget.kind,
      nodeId: draftTarget.nodeId ?? null,
      captiveId: draftTarget.captiveId ?? null,
      rivalId: draftTarget.rivalId ?? null,
      // The wave list as actually launched. A derived encounter (a
      // defence) and a director-rewritten one are both absent from
      // enemies.json, so the aftermath cannot look them up afterwards —
      // the Splice-Dex and the defence's salvage both read this.
      waveIds: encounter.waves.filter((w) => typeof w === 'string'),
      // §3.8: a rival duel is a scene, so the player's half of it is
      // handed to the engine as data. Everything else fights in silence.
      ...(draftTarget.kind === 'rival'
        ? {
            playerBarks: duelBarks(state, content, content.rivals[draftTarget.rivalId]),
            speakers: {
              enemy: content.rivals[draftTarget.rivalId]?.name ?? 'The opposition',
              // Mirror the rivals: they speak as "Dr. Mantissa", not as
              // "Chief Entomologist, Hexapod Futures". The full title
              // belongs on the dossier card, not in every line of dialogue.
              player: profileOf(state, content).named ? profileOf(state, content).name : 'You',
            },
          }
        : {}),
    });
    ctx.save();
    renderWarRoomScreen(root, ctx);
  });
}

function aftermathText(detail) {
  const bits = [];
  if (detail.rival && detail.outcome === 'win') bits.push(`${detail.rival} defeated.`);
  else if (detail.rival && detail.outcome === 'loss') bits.push(`${detail.rival} wins this round.`);
  if (detail.outcome === 'win') bits.push(`Victory!${detail.reward ? ` Confiscated budget: $${detail.reward}.` : ''}`);
  else if (detail.outcome === 'fled') bits.push('Tactical scamper executed flawlessly.');
  else bits.push('Defeat.');
  if (detail.defended === true) bits.push(`${detail.node} holds.${detail.wreckage ? ` A ${detail.wreckage} was left behind and is now in Containment.` : ''}`);
  else if (detail.defended === false) bits.push(`${detail.node} is theirs again. It can be retaken.`);
  if (detail.freed) bits.push(`${detail.freed} is home safe (and slightly dramatic about it).`);
  if (detail.capturedChimera) bits.push(`${detail.capturedChimera} was CAPTURED — a rescue window is open in the War Room.`);
  if (detail.salvageUnits.length) bits.push(`Impounded: ${detail.salvageUnits.length} unit(s) for Containment.`);
  const treatable = detail.injuries.filter((i) => i.chimera !== detail.capturedChimera);
  if (treatable.length) bits.push(treatable.map((i) => `${i.chimera} → Infirmary (${i.injury.name}).`).join(' '));
  return bits.join(' ');
}
