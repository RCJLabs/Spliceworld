// War Room screen (M5): region map, notoriety, captives with live
// dissection countdowns, Containment salvage, news feed — and the launch
// point for assaults and rescue raids (arena rendered via battle/ui).
//
// R60 moved this screen's DECISIONS to campaign/warroom.js — which strip
// opens, which tab earns a badge, what a counter-offensive is costing, what
// a job row says when it cannot be run — so they can be tested without
// rendering the screen and reading the HTML back. What is left here is
// markup and the module state the five views share: `warTab`, `draftTarget`,
// `draftTeam`, `lastAftermath`, `identityRoll`. That shared state is why the
// screen is still one file: the map builds the briefing's target and the
// briefing writes the map's aftermath, so they are one state machine written
// in two halves, not two screens that happen to live together.

import { renderArena } from '../battle/ui.js';
import { createBattle, isInjured, obediencePercent, combatantFromChimera } from '../battle/engine.js';
import { forecast, diagnose, wantsDiagnosis } from '../battle/forecast.js';
import { isSettled } from '../splice/theater.js';
import { fmtDuration } from '../ranch/ui.js';
import { subtabBar, bindSubtabs } from '../ui/tabs.js';
import { fieldNote, bindFieldNote, collapsibleCard, bindFolds, isOpen } from '../ui/cards.js';
import { matchupNotes, attackTags, foeTagLines, classNotes } from './matchup.js';
// STABLE is the cap, not a coincidence: A1 measured the campaign at three
// bodies, the harness has fought at three since M4.5, and the Path tells
// the player to build three. A second `3` typed in here is how those four
// numbers drift apart.
import { guideForScreen, STABLE as TEAM_CAP } from '../ranch/onboarding.js';
import { startSpar } from './sparring.js';
import { gauntletState } from './gauntlet.js';
import { toggleRow, pickerField, bindPickers, openPicker } from '../ui/picker.js';
import { renderCreatureSVG, renderRivalSVG, drawableGenome } from '../render/renderer.js';
import { rivalStatus, rivalEncounter } from './rivals.js';
import { rescueEncounterFor } from './map.js';
import { renderIcon } from '../ui/icons.js';
import { directorRead } from './director.js';
import {
  bayUnit, rehabPlan, rehabTuning, startRehab, rehabSession, cancelRehab,
  rehabRemainingMs, sessionReadyAt,
} from './rehab.js';
import { gradeOf, gradeIndexOf } from '../splice/extract.js';
import { isContested } from './contest.js';
import {
  operationList, freeCrew, startOperation, abortOperation, opOdds,
} from './operations.js';
import {
  profileOf, philosophyList, rollIdentities, setIdentity, setPhilosophy, duelBarks,
} from './monologue.js';
import {
  WAR_TABS, tabBadge, warTargetEncounter, frontierRegionId, sparVerdict, econRow,
  stripState, contestAlerts, heatBand, jobsModel, jobRow, foeRead, obedienceRead,
  canBringMore, fitTeam, aftermathText,
} from './warroom.js';
import {
  regionStates, salvageUnit, nodeById, dominionBanner,
} from './campaign.js';

let draftTarget = null; // { kind, nodeId?, captiveId?, rivalId?, encounterId, label }

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
let warTab = 'map';

// R45 extracted the bar itself to ui/tabs.js — the Dex needed the same
// nav, and two copies of it is how two screens drift apart.
function warSubtabBar(state) {
  return subtabBar({
    tabs: WAR_TABS,
    active: warTab,
    attr: 'war-tab',
    id: 'war-subtabs',
    badgeFor: (id) => tabBadge(state, id),
  });
}

export function renderWarRoomScreen(root, ctx) {
  const { state } = ctx;
  // Battle mode locks the shell to one screen; every other view scrolls.
  //
  // R49: guarded so the War Room renders to a plain `{ innerHTML }` like
  // every other screen does. This is the ONLY `document` reference in the
  // module, and main.js already clears the class on every navigation, so
  // the guard is inert in a browser — what it buys is that the harness can
  // assert this screen's markup instead of grepping its source, which is
  // what R15's gate had to do.
  if (!state.battle) globalThis.document?.body?.classList.remove('in-battle');
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
    return `<p class="fine-print rival-file">${renderIcon('document')} ${dossier.fights} duel${
      dossier.fights === 1 ? '' : 's'
    } on file. They have not changed anything yet.</p>`;
  }
  // Written as sentences rather than a stat block: what they know, then
  // what they have done about it.
  const read = [];
  if (dossier.topClass) {
    const cls = content.classes[dossier.topClass];
    read.push(`filed under ${renderIcon(cls.icon)} ${cls.name}`);
  }
  if (dossier.topTag) read.push(`swinging ${dossier.topTag}`);

  const done = [];
  if (dossier.counterClass) {
    const cls = content.classes[dossier.counterClass];
    done.push(`${dossier.counterLeads ? 'Leading with' : 'Answering with'} ${renderIcon(cls.icon)} ${cls.name}.`);
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
  const map = regionStates(state, content);
  const { gen, income, suspended, bonus, nextRung, upkeep, net } = econRow(state, content);

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
  // R41: one gate for every Spar button — the ring has one bucket.
  // R43: and it holds charges, so the button says how many rather than
  // just whether.
  //
  // R49: …and whether is more than the bucket. This read `sparCharges`
  // alone, so with three charges and every chimera in the Infirmary the
  // button said "Spar 3", was pressable, and landed on a briefing where
  // every roster row is disabled and Launch is disabled with it. Nothing
  // broke — R48 recorded that as a wording gap on those grounds — but an
  // ENABLED button onto a screen that can do nothing is a wasted trip, not
  // a wording problem. `canSpar` is the same predicate the agenda and the
  // Pens read, so the three cannot disagree about whether the ring is open.
  //
  // The wording is not shared, only the verdict: this is a chip in a node
  // row and the Pens has a whole line, so they say the same thing at
  // different lengths.
  const sparGate = sparVerdict(state, content, t);
  const sparLabel = sparGate.kind === 'charges'
    ? `Spar <span class="spar-charges">${sparGate.charges}</span>`
    : sparGate.kind === 'nobody-fit'
      ? 'no-one fit'
      : fmtDuration(sparGate.msToNext);
  const frontier = frontierRegionId(state, content, map);
  const regions = map.map(({ region, open, blockers, nodes: nodeRows, held }) => {
    const contestedHere = region.nodes.filter((n) => isContested(state, n.id)).length;
    const rows = open ? nodeRows.map(({ node, status }) => {
      const encounter = content.encounters[node.encounter];
      const btn =
        status === 'available'
          ? `<button type="button" data-node="${node.id}">Assault</button>`
          : status === 'held'
            ? `<span class="held-tag">HELD +$${node.incomePerDay}/d</span>
               <button type="button" class="spar-btn" data-spar="${node.id}" ${sparGate.ok ? '' : 'disabled'}>${renderIcon('boxing-glove')} ${sparLabel}</button>`
            : status === 'contested'
              ? `<span class="contested-tag">CONTESTED −$${node.incomePerDay}/d</span>`
              : `<span class="locked-tag">${(node.threatGen ?? 1) > gen ? `needs Threat Gen ${node.threatGen}` : 'locked'}</span>`;
      return `
        <div class="encounter node-${status}">
          <div><strong>${node.name}</strong>${node.boss ? ` ${renderIcon('crown')}` : ''} <span class="lineage">${encounter.waves.length} waves · $${encounter.reward}</span><br>
          <span class="fine-print">${node.blurb}</span></div>
          ${btn}
        </div>`;
    }).join('') : '';
    const body = open
      ? `${region.demand ? `<p class="region-demand">${renderIcon('dna')} ${region.demand}</p>` : ''}${rows}`
      : `<p class="region-locked">${renderIcon('lock')} ${blockers.map((b) => b.label).join(' · ')}</p>`;
    // A9: the strip bonus needs saying on the strip, not only in the econ
    // row — "one node left" is a different sentence when finishing it pays
    // a standing bonus, and a contest that suspends one is worth answering
    // for more than the node it took.
    const bonusState = stripState(state, content, region, contestedHere);
    const strip = bonusState === 'paying'
      ? ` Strip bonus +$${region.completionBonus}/day.`
      : bonusState === 'suspended'
        ? ` Strip bonus of $${region.completionBonus}/day suspended.`
        : bonusState === 'available'
          ? ` Take the strip for +$${region.completionBonus}/day.`
          : '';
    const summary = open
      ? held === region.nodes.length
        ? `Held end to end.${strip}`
        : `${region.nodes.length - held} node${region.nodes.length - held === 1 ? '' : 's'} still theirs.${strip}`
      : `${renderIcon('lock')} ${blockers.map((b) => b.label).join(' · ')}`;
    return collapsibleCard({
      id: `region:${region.id}`,
      title: `${region.name}${region.subtitle ? ` <span class="fine-print region-sub">${region.subtitle}</span>` : ''}`,
      badge: `${contestedHere ? `${renderIcon('shield')} ` : ''}${held}/${region.nodes.length}`,
      summary,
      body,
      open: isOpen(state, `region:${region.id}`, open && region.id === frontier),
      extraClass: `region-card ${open ? '' : 'is-locked'}`,
    });
  }).join('');

  // A counter-offensive is time-critical and costs money every hour it
  // stands, so it gets an alert of its own rather than a quieter row on
  // the map (which also marks it).
  const contests = contestAlerts(state, content, t).map((a) => `
    <div class="encounter contested">
      <div><strong>${a.name}</strong> <span class="lineage">counter-offensive</span><br>
      <span class="fine-print"><strong class="countdown">${fmtDuration(a.remainingMs)}</strong> to hold the line · <strong>$${a.nodeIncome + a.bonusAtRisk}/day</strong> suspended until you do${
        a.bonusAtRisk ? ` (the node plus ${a.stripName}'s $${a.bonusAtRisk} strip bonus)` : ''
      }${
        a.stripAlsoDown ? ` (the node — ${a.stripName}'s strip bonus is already counted against ${a.stripCountedOn})` : ''
      }${
        a.defences ? ` · you have held it ${a.defences}× already` : ''
      }.</span></div>
      <button type="button" data-defend="${a.nodeId}">${renderIcon('shield')} Defend</button>
    </div>`).join('');

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
          .map((u) => `${content.classes[u.class] ? renderIcon(content.classes[u.class].icon) : '◇'} ${u.name} <span class="lineage">HP ${u.hp} · PWR ${u.power}</span>`)
          .join('<br>')
      : '';
    return `
      <div class="rival-card ${locked ? 'is-locked' : ''}">
        <div class="rival-portrait">
          ${locked ? '<div class="rival-redacted">?</div>' : renderRivalSVG(rival, content.classes)}
          ${lead && !locked
            ? `<div class="rival-lead" title="What they lead with">${renderCreatureSVG(lead.genome, content, { idPrefix: `rv-${rival.id}` })}</div>`
            : ''}
        </div>
        <div class="rival-body">
          <strong>${rival.name}</strong>
          <p class="fine-print">${rival.title}</p>
          <p class="class-banner class-${rival.classBias}">${renderIcon(cls.icon)} ${cls.name} school${
            content.classes[cls.beats] ? ` — beats ${content.classes[cls.beats].name}` : ''
          }</p>
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
        <h3>${renderIcon('satellite')} Their Dossier On You</h3>
        <p class="fine-print">${
          read.profile.topTags.length
            ? `Filed under: ${read.profile.topTags.map((t) => `<strong>${t.tag}</strong> ${Math.round(t.share * 100)}%`).join(' · ')}`
            : 'No pattern yet. Keep them guessing.'
        }${read.profile.favoredClass ? ` · stable reads <strong>${renderIcon(content.classes[read.profile.favoredClass].icon)} ${content.classes[read.profile.favoredClass].name}</strong>` : ' · no dominant class'}</p>
        <p class="fine-print">${
          read.rule
            ? `⚠ Countermeasures in the field: ${read.rule.intel}`
            : 'They have a file but no plan yet. Give them fewer ideas.'
        }${read.profile.dissections ? ` They have completed ${read.profile.dissections} unauthorized peer review${read.profile.dissections === 1 ? '' : 's'} — that is where most of this came from.` : ''}</p>
      </section>`
    : '';

  // The wire has its own view now, so it shows everything it keeps
  // rather than the last five lines squeezed under the map.
  const wire = [...state.news].reverse().map((n) => `<p>${renderIcon('satellite')} ${n}</p>`).join('');

  const views = {
    map: regions,
    jobs: jobsCard(state, ctx, t),
    labs: `
      ${dossier}
      ${dossierCard(state, content)}
      ${rivals ? `<section class="card"><h3>${renderIcon('petri-dish')} Rival Labs</h3>${rivals}</section>` : ''}`,
    bays: containment
      ? `<section class="card"><h3>⛓ Containment</h3>${containment}</section>`
      : `<section class="card"><h3>⛓ Containment</h3><p class="ranch-msg">The bays are empty. Charge the Containment Cannon in a fight and bring something home.</p></section>`,
    wire: `
      <section class="card">
        <h3>${renderIcon('satellite')} News Wire</h3>
        <div class="news-feed">${wire || '<p class="fine-print">All quiet. Suspiciously quiet.</p>'}</div>
      </section>`,
  };

  // R40. The news wire says it once; this says it for good. A player who
  // was away when the burst scrolled past would otherwise never learn that
  // the run they finished was finished. Phrased as a standing state rather
  // than an ending, because R9's counter-offensives keep arriving.
  const banner = dominionBanner(state, content);
  const dominionCard = banner
    ? `<section class="card dominion-card">
        <h3>${renderIcon('flag')} ${banner.title}</h3>
        <p>${banner.body}</p>
        <p class="fine-print">${banner.note}</p>
      </section>`
    : '';

  // R42: the Gauntlet card. Only ever rendered once the county is yours —
  // before that the coalition is still pretending it has nothing in storage.
  const gauntletCard = state.dominionAt
    ? (() => {
        const rows = gauntletState(state, content).map(({ stage, status }) => `
          <div class="encounter gauntlet-${status}">
            <div><strong>${stage.name}</strong>${status === 'beaten' ? ` ${renderIcon('trophy')}` : ''} <span class="lineage">${stage.escorts.length + 1} waves · $${stage.reward}</span><br>
            <span class="fine-print">${status === 'locked' ? 'The card goes in order.' : stage.blurb}</span></div>
            ${status === 'open' ? `<button type="button" data-gauntlet="${stage.id}">Answer</button>` : status === 'beaten' ? '<span class="held-tag">BEATEN</span>' : '<span class="locked-tag">locked</span>'}
          </div>`).join('');
        return `<section class="card gauntlet-card">
          <h3>${renderIcon('stadium')} The Gauntlet</h3>
          <p class="fine-print">The county is yours, so the coalition has stopped pretending its storage is empty. Four exhibitions, in order. No territory changes hands — only reputations.</p>
          ${rows}
        </section>`;
      })()
    : '';

  root.innerHTML = `
    ${dominionCard}
    ${gauntletCard}
    ${lastAftermath ? `<section class="card"><h3>Last Sortie</h3><p class="ranch-msg">${lastAftermath}</p></section>` : ''}
    <section class="card">
      <div class="econ-row">
        <div><span class="econ-label">Notoriety</span><strong>${state.campaign.notoriety}</strong></div>
        <div><span class="econ-label">Threat Gen</span><strong>${gen}</strong>${
          nextRung ? `<span class="econ-next">Gen ${nextRung.gen} at ${nextRung.at}</span>` : ''
        }</div>
        <div><span class="econ-label">Territory</span><strong>+$${income}/day</strong>${
          bonus ? `<span class="econ-next">incl. +$${bonus} strip bonus</span>` : ''
        }${
          suspended ? `<span class="econ-suspended">−$${suspended} contested</span>` : ''
        }</div>
        <div><span class="econ-label">Net</span><strong class="${net < 0 ? 'net-negative' : 'net-positive'}">${
          net < 0 ? '−' : '+'
        }$${Math.abs(net)}/day</strong><span class="econ-next">after $${upkeep} upkeep</span></div>
        <div><span class="econ-label">Record</span><strong>${state.warRecord.wins}W–${state.warRecord.losses}L</strong></div>
      </div>
    </section>
    ${contests ? `<section class="card contest-card"><h3>${renderIcon('shield')} Counter-Offensive</h3>${contests}</section>` : ''}
    ${captives ? `<section class="card captive-alert"><h3>⏳ Captured — Rescue Windows</h3>${captives}</section>` : ''}
    ${warSubtabBar(state)}
    ${fieldNote(guideForScreen(state, content, t, 'battle'))}
    ${views[warTab] ?? views.map}`;

  bindFieldNote(root, ctx, () => renderMap(root, ctx));
  bindFolds(root, ctx, () => renderMap(root, ctx));
  bindSubtabs(root, 'war-tab', (id) => {
    warTab = id;
    renderMap(root, ctx);
  });
  bindDossier(root, ctx, () => renderMap(root, ctx));
  bindJobs(root, ctx, () => renderMap(root, ctx));
  root.querySelectorAll('button[data-gauntlet]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const row = gauntletState(state, content).find((r) => r.stage.id === btn.dataset.gauntlet);
      if (!row || row.status !== 'open') return;
      draftTarget = { kind: 'gauntlet', stageId: row.stage.id, encounterId: row.stage.id, label: row.stage.name };
      renderWarRoomScreen(root, ctx);
    })
  );
  root.querySelectorAll('button[data-spar]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const node = nodeById(content, btn.dataset.spar);
      if (!node) return;
      draftTarget = { kind: 'sparring', nodeId: node.id, encounterId: node.encounter, label: `Sparring — ${node.name}` };
      renderWarRoomScreen(root, ctx);
    })
  );
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
        encounterId: rescueEncounterFor(state, content, cap.id),
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
      <h3>${renderIcon('document')} Your Dossier</h3>
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
        { label: null, options: [{ id: '__reroll', label: `${renderIcon('dice')} Roll a different set`, sub: 'None of these. Try again.' }] },
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
  const { runs, slots, crewsOut, youOut, heat, report } = jobsModel(state, content, t);
  const crewLine = [
    slots ? `${slots - crewsOut} of ${slots} ${slots === 1 ? 'crew' : 'crews'} free` : 'no crews fit to work',
    youOut ? 'you are out' : 'you are available',
  ].join(' · ');
  const band = heatBand(heat);
  const heatLine = `<p class="fine-print">Heat <strong class="${band === 'awake' ? 'heat-high' : ''}">${heat}/100</strong> — ${
    band === 'awake'
      ? 'the county is extremely awake. Everything is harder until it is not.'
      : band === 'noticed'
        ? 'somebody has started noticing a pattern.'
        : 'nobody is looking for you. Yet.'
  }</p>`;

  // A job in flight no longer hides the board. It used to return here, so
  // launching one thing removed the only screen that showed you what else
  // there was — which is half of why a visit felt like one click and a wait.
  const liveCard = runs.length ? `
      <section class="card jobs-card">
        <h3>${renderIcon('briefcase')} ${runs.length === 1 ? 'Job In Progress' : `${runs.length} Jobs In Progress`}</h3>
        ${runs.map(({ run, op, who, remainingMs }) => `
        <div class="encounter job-live">
          <div><strong>${renderIcon(op.icon)} ${op.name}</strong><br>
          <span class="fine-print">Back in <strong class="countdown">${fmtDuration(remainingMs)}</strong> · ${
            who ? who.name : 'you went yourself'
          } · odds were ${pct(run.chance)}</span></div>
          <button type="button" class="job-abort" data-abort="${run.opId}">Call it off</button>
        </div>`).join('')}
        ${heatLine}
      </section>` : '';

  const free = freeCrew(state, t);
  const liveRuns = runs.map((r) => r.run);
  const rows = jobs.map((op) => {
    // The lane verdict and the odds are decisions (warroom.js); the wording
    // is short on purpose, because this sits in a flex row next to the job's
    // title and a long string turns the row into one word per line at 380px.
    const { out, cooling, ready, odds, noSlot, cooldownEndsAt } = jobRow(state, content, op, t, liveRuns, free);
    const loot = [
      `$${op.funds[0]}–${op.funds[1]}`,
      op.livestock ? `${pct(op.livestock.chance)} livestock` : null,
    ].filter(Boolean).join(' · ');
    // The blurb is good writing and it lives in the crew sheet, not here:
    // seven four-line rows above the map turned the board into a wall and
    // pushed the entire campaign off the screen.
    return `
      <div class="encounter job-row ${ready ? '' : 'is-cooling'}">
        <div><strong>${renderIcon(op.icon)} ${op.name}</strong> <span class="lineage">${op.hours}h · ${loot}</span>
        <span class="fine-print job-odds">${
          odds.blocked ? `⚠ ${odds.blocked}` : `Best odds: <strong>${pct(odds.chance)}</strong>`
        }${op.notoriety ? ` · +${op.notoriety} heat` : ' · draws no attention at all'}</span></div>
        ${out
          ? '<span class="locked-tag">out right now</span>'
          : cooling
            ? `<span class="locked-tag">quiet for ${fmtDuration(cooldownEndsAt - t)}</span>`
            : noSlot
              ? `<span class="locked-tag">${noSlot}</span>`
              : `<button type="button" data-job="${op.id}" ${odds.blocked ? 'disabled' : ''}>Run it</button>`}
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
    ${liveCard}
    <section class="card jobs-card">
      <h3>${renderIcon('briefcase')} Jobs</h3>
      <p class="fine-print job-slots">${crewLine}</p>
      ${reportHtml}
      ${rows}
      ${runs.length ? '' : heatLine}
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
      lastAftermath = abortOperation(state, content, btn.dataset.abort, ctx.now()).msg;
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
  // R72 — this genome is frozen into the save at capture time, so a part
  // retired afterwards used to throw here and take the whole War Room down.
  // That was a soft-lock, not just a blank screen: dismantling the bay is a
  // button on this same screen.
  const bayGenome = drawableGenome(unit.genome, content);
  const portrait = bayGenome
    ? renderCreatureSVG(bayGenome, content, { idPrefix: `bay-${entry.id ?? unit.id}` })
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
        <p class="fine-print">${cls ? `${renderIcon(cls.icon)} ${cls.name}` : '◇ Unclassed'} · HP ${unit.hp} · PWR ${unit.power} · ARM ${unit.armor}</p>
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
    .sort((a, b) => gradeIndexOf(b[0]) - gradeIndexOf(a[0]))
    .map(([id, n]) => `<span class="grade-badge grade-${id}">${gradeOf(id).name}</span>${n > 1 ? ` ×${n}` : ''}`)
    .join(' ');
  const salvageList = names.length ? `${badges} — ${names.join(', ')}` : '';

  return `
    <p class="fine-print">${renderIcon('wrench')} <strong>Salvage</strong> → ${salvageList || 'nothing recoverable'}</p>
    ${plan.possible
      ? `<p class="fine-print">${renderIcon('handshake')} <strong>Rehabilitate</strong> → joins the roster whole, on a ${content.frames[unit.genome.frame]?.name ?? unit.genome.frame} chassis, at the grades its old lab raised. ${plan.hours}h · $${plan.fee} · arrives settled but wary (instability ${plan.instability}, bond 0).</p>`
      : `<p class="fine-print locked-note">${plan.reason}</p>`}
    <div class="bay-btns">
      <button type="button" data-salvage="${entry.id}">${renderIcon('wrench')} Salvage</button>
      ${plan.possible
        ? plan.enabled
          ? `<button type="button" class="bay-rehab" data-rehab="${entry.id}" ${state.funds >= plan.fee ? '' : 'disabled'}>${renderIcon('handshake')} Rehabilitate — $${plan.fee}</button>`
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
            ? `${renderIcon('target')} Enrichment session ($${tune.sessionCost})`
            : `Next session in ${fmtDuration(readyAt - t)}`
      }</button>
      <button type="button" class="bay-cancel" data-cancel="${entry.id}">End programme</button>
    </div>`;
}

// --- Briefing / team picker ---------------------------------------------

function renderBriefing(root, ctx) {
  const { state, content, now } = ctx;
  const t = now();
  const encounter = warTargetEncounter(state, draftTarget, content, t);
  // The window can close while the briefing is open (a tick fires on
  // focus). There is nothing left to defend, so say so rather than
  // rendering a battle against undefined.
  if (!encounter) {
    lastAftermath = 'The convoy arrived while you were choosing a team. That one is theirs for now.';
    draftTarget = null;
    renderMap(root, ctx);
    return;
  }

  // What are we walking into? One read of the opposition (warroom.js) —
  // this used to normalise the wave list TWICE, once with `.flat()` and
  // once without, which is two chances to disagree about the same fight.
  const { classes: foeClasses, tags: foeTags, attackTags: foeAttackTags } = foeRead(encounter, content);
  const foeLine = foeClasses.size
    ? [...foeClasses].map((c) => `${renderIcon(content.classes[c].icon)} ${content.classes[c].name}`).join(', ')
    : 'no declared class';

  // R35. The class triangle was the only matchup layer on this screen. The
  // OTHER one — the tag chart — is live in 96% of the 24 encounters (Vehicle
  // in 19, Airborne in 13, Armored and Aquatic in 11 each) and 71% of them
  // throw a Ground move. Isolated with the same build on both sides of the
  // chart, `Ground misses Airborne` is worth 3.7pp to a flier and `Sonic
  // ignores Armor` 7.4pp against armour. None of it was here.
  const tagLines = foeTagLines(foeTags, content.tagChart, foeAttackTags);

  const roster = state.chimeras.map((ch) => {
    const injured = isInjured(ch, t);
    const note = injured
      ? `Infirmary: ${ch.injury.name} — ${fmtDuration(ch.injury.until - t)} left`
      : isSettled(ch, t)
        ? `ready · obedience ${obediencePercent(ch, t)}%`
        : `unsettled — Rejection debuffs · obedience ${obediencePercent(ch, t)}%`;
    // One combatant per row, not a combatant AND a separate analyze: the
    // combatant already carries the class the icon needs, and building it
    // twice per chimera per render is work nobody sees.
    const cb = combatantFromChimera(ch, content, t);
    const cls = cb.creatureClass ? content.classes[cb.creatureClass] : null;
    // Name the class it beats, not just that it beats something. Measured
    // across the 24 encounters against a one-of-each stable, "type advantage
    // here" is true of EVERY row in 21% of them — Slag Gate among them —
    // where it stops being information and becomes decoration. It
    // discriminates in the other 79%, so it stays; saying which class costs
    // nothing and tells you something in both cases.
    // R37. This used to be `beats their Water` when the triangle favoured
    // the row and an EMPTY STRING when it did not — R35 put losses beside
    // wins on the tag notes and left the class chip a sales brochure, on
    // the bigger of the two layers (16-20pp against 3.7-7.4pp). Silence is
    // not the same as "no problem", and it was silent at exactly the wrong
    // moment. Both directions now, rendered like the tag notes below.
    const clsNotes = classNotes(cb.creatureClass, foeClasses, content.classes);
    const edge = clsNotes.length
      ? '<br>' + clsNotes.map((n) => `<span class="matchup ${n.kind}">${n.kind === 'good' ? '✔' : '✘'} ${n.text}</span>`).join(' ')
      : '';
    // What the tag chart does between THIS creature and THIS enemy — using
    // the four moves it can actually press, because a move it knows and
    // cannot field answers nothing. Losses are shown as loudly as wins: a
    // briefing that lists only upsides is a sales brochure, and A1's lesson
    // was that the game must not present a losing pick as a choice.
    const notes = matchupNotes({
      myTags: new Set(cb.tags),
      myAttackTags: attackTags(cb.moves),
      foeTags,
      foeAttackTags,
    }, content.tagChart);
    const chart = notes.length
      ? '<br>' + notes.map((n) => `<span class="matchup ${n.kind}">${n.kind === 'good' ? '✔' : '✘'} ${n.text}</span>`).join(' ')
      : '';
    return toggleRow({
      id: ch.id,
      label: `${cls ? renderIcon(cls.icon) + ' ' : '◇ '}${ch.name}${cb.level > 0 ? ` <span class="level-chip">Lv ${cb.level}</span>` : ''}`,
      sub: `${note}${edge}${chart}`,
      checked: draftTeam.includes(ch.id),
      disabled: injured,
    });
  }).join('');

  // The forecast (A1). The audit found the second node of the campaign at a
  // flat 0% for a player with one chimera — and 84% with three — for a
  // reason no wave count on the screen communicates: combat is one active
  // per side over a queue, so three enemy bodies means grinding three
  // health bars with one of your own. So the briefing runs the fight,
  // seven-and-twenty times, with the real engine and the real AI, and says
  // what it found. It refuses nothing; it just stops the game presenting an
  // unwinnable fight as though it were a choice.
  const picked = fitTeam(state, draftTeam, t);
  const fc = picked.length ? forecast(picked, encounter, content, state.seed, t) : null;

  // A7: obedience as a DECISION, not a percentage. The audit filed this as
  // "the number that decides whether your orders happen is not on the screen
  // where you choose who fights" — but it was: every roster row already
  // prints it. What no player could do was convert it into anything. So
  // measure it instead: replay the same fight with disobedience switched
  // off, and the gap between the two win rates is what this team's
  // obedience is costing against THIS encounter. It is honest at whatever
  // the mechanic turns out to be worth — which, measured, is one to three
  // points at realistic values and about nine at the 60% cap.
  //
  // Only computed when somebody on the team can actually disobey, so a
  // fully bonded, settled team pays nothing for the extra 32 replays.
  const { disobedient, worst: worstObedience } = obedienceRead(picked, t);
  const fcObedient = fc && disobedient.length
    ? forecast(picked, encounter, content, state.seed, t, { obedient: true })
    : null;
  const obedienceCost = fcObedient ? Math.round((fcObedient.winRate - fc.winRate) * 100) : 0;
  const obedienceLine = disobedient.length
    ? `<span class="fine-print obedience-cost${obedienceCost >= 5 ? ' is-costly' : ''}">Obedience ${worstObedience}% — ${
        obedienceCost >= 3
          ? `worth about <strong>${obedienceCost} points</strong> of win chance here. Train them, or let them settle.`
          : 'costing nothing measurable in this fight.'
      }</span>`
    : '';

  // R37. On a losing verdict, say WHY — measured, not from a constant
  // string. The briefing caps a team at three, so the old hopeless hint
  // ("bring more creatures") was, for a player who already had three,
  // advice the screen itself refuses to accept. Only computed on a verdict
  // that needs it, the same way the obedience replay is.
  // R74 — the comment above says "only computed on a verdict that needs it",
  // and until now that was only true of the RESULT: `diagnose` ran a full
  // 32-battle forecast of its own before it could work out the band and
  // return null, so a walkover paid for a diagnosis it then threw away. The
  // band is already in `fc`, so ask it here — and hand `fc` over rather than
  // let diagnose recompute the identical sweep a third time.
  const why = fc && wantsDiagnosis(fc.band)
    ? diagnose(picked, encounter, content, state.seed, t,
      { canBringMore: canBringMore(state, draftTeam, t, TEAM_CAP), base: fc })
    : null;
  const odds = fc
    ? `
      <p class="forecast forecast-${fc.band.id}">
        <strong>${fc.band.label}</strong> — about ${Math.round(fc.winRate * 100)}% ·
        ${picked.length} against ${fc.waves}${
          fc.outnumberedBy > 0
            ? ` · <strong>outnumbered ${picked.length}v${fc.waves}</strong>`
            : ''
        }
        <span class="fine-print">${fc.band.hint}</span>
        ${why ? `<span class="fine-print why why-${why.id}">${why.text}</span>` : ''}
        ${obedienceLine}
      </p>`
    : '<p class="fine-print">Pick a team and the lab will run the numbers.</p>';

  root.innerHTML = `
    <section class="card">
      <h3>${draftTarget.label}</h3>
      <p class="${draftTarget.kind === 'rival' ? 'rival-quote' : 'fine-print'}">${
        draftTarget.kind === 'rival' ? `&ldquo;${encounter.blurb}&rdquo;` : encounter.blurb
      } <span class="fine-print">(${encounter.waves.length} ${draftTarget.kind === 'rival' ? 'specimens' : 'waves'}${encounter.reward ? ` · $${encounter.reward}` : ''})</span></p>
      <p class="fine-print">Opposition: ${foeLine}${
        foeClasses.size > 1 && encounter.counterClass ? ' — one of them was built to answer your stable' : ''
      }</p>
      ${tagLines.length ? `<ul class="foe-tags">${tagLines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
      ${encounter.contestOf ? `<p class="fine-print contest-intel">${renderIcon('shield')} ${encounter.intel}</p>` : ''}
      ${encounter.directed ? `<p class="fine-print intel-line">${renderIcon('satellite')} Intel: ${encounter.directed.intel} <strong>${content.enemies[encounter.directed.unitId].name}</strong> ${
        encounter.directed.added
          ? 'is riding along — they sent extra.'
          : `has replaced the ${content.enemies[encounter.directed.replaced].name}.`
      }</p>` : ''}
      <h3>Strike Team (up to 3)</h3>
      ${roster || '<p class="ranch-msg">No chimeras available. The Surgery Theater accepts walk-ins.</p>'}
      ${odds}
      <div class="ceremony-btns">
        <button type="button" id="wr-launch" class="big-btn${
          fc && fc.band.id === 'hopeless' ? ' is-illadvised' : ''
        }" ${draftTeam.length ? '' : 'disabled'}>⚔ ${
          fc && fc.band.id === 'hopeless' ? 'Launch anyway' : 'Launch'
        }</button>
        <button type="button" id="wr-back">Back</button>
      </div>
    </section>`;

  root.querySelectorAll('button[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggle;
      if (draftTeam.includes(id)) {
        draftTeam = draftTeam.filter((x) => x !== id);
      } else {
        if (draftTeam.length >= TEAM_CAP) return;
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
    const team = fitTeam(state, draftTeam, ctx.now());
    if (!team.length) return;
    if (draftTarget.kind === 'sparring') startSpar(state, ctx.now(), content);
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
