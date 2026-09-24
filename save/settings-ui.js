// R71 — one door for everything that is a DEVICE preference or a SAVE
// operation, rather than two footer buttons and growing. Sound and the
// save-file panel used to live inline in main.js; the slot picker this
// phase adds would have made that a third. Screens get their own -ui.js
// module for the same reason (CLAUDE.md: small modules by system) — this
// is that module for the shell's own settings, not a system of its own.
//
// `openSettings` owns the whole overlay's lifecycle the way
// splice/extract-ui.js's runExtraction owns the Graduation Ceremony's:
// takes the host element and a ctx, renders, wires, and every action
// either re-renders in place or reloads (never leaves a stale handler
// behind — closing and reopening is how every button here escapes).

import { loadSlotRegistry, MAX_SLOTS } from './save.js';
// R101 — the slot picker, the export file and the new-run ceremony live in
// their own module now. This panel is already behind a dynamic import, so
// naming them here keeps them out of the first paint rather than putting
// them back into it.
import {
  exportSave, exportFilename, importSave, adoptSave, startNewRun, runSummary,
  slotSummary, createSlot, switchSlot, deleteSlot, renameSlot,
} from './slots.js';
import { renderIcon } from '../ui/icons.js';
import { openPicker, openPrompt, toggleRow } from '../ui/picker.js';
import * as sfx from '../audio/sfx.js';
import { announce } from '../ui/live.js';
// R111 — the panel's own words, out of the module and into data (R110).
import { copy } from '../util/text.js';
// R81 — the theme list moved to ui/theme.js so the shell can read it on boot
// without importing this whole panel: main.js needs to know which
// [data-theme] to stamp before anything paints, and needed a 16 KB modal to
// find out. Re-exported so nothing else has to learn that it moved.
import { THEMES, BASE_THEME, themeName } from '../ui/theme.js';

// R88 — the replay speeds. Data here rather than in data/*.json because
// these are three fixed multipliers the ARENA implements, not content: a
// sixth speed would need engine work, so a JSON file promising one would be
// a lie of the kind CLAUDE.md's "all content is data" rule exists to stop.
// R111 — volume as a picker rather than a range input, because Wave 1.5's
// rule is that no OS control appears anywhere in this game and a slider is
// one. Three steps is all a kazoo needs, and the words are data (R110).
const volumes = (content) => [
  { id: 1, label: copy(content, 'settings.volume_full'), sub: copy(content, 'settings.volume_full_sub') },
  { id: 0.5, label: copy(content, 'settings.volume_half'), sub: copy(content, 'settings.volume_half_sub') },
  { id: 0.2, label: copy(content, 'settings.volume_quiet'), sub: copy(content, 'settings.volume_quiet_sub') },
];

const SPEEDS = [
  { id: 1, label: 'Normal', sub: 'Every beat, at the pace it was written' },
  { id: 2, label: 'Quick', sub: 'Twice as fast, same fight' },
  { id: 0, label: 'Instant', sub: 'Skip the replay; the result is the same' },
];

export { THEMES, BASE_THEME };


function fmtAgo(ts, now) {
  if (!ts) return null;
  const mins = Math.max(0, Math.round((now - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// R102 — the run boundary's engine. This module is lazy (R81), so importing it
// here costs the first paint nothing; see campaign/legacy.js.
import { legacyOffers, applyLegacy, legacyTuning, recallLegends } from '../campaign/legacy.js';

export function openSettings(overlay, ctx) {
  // R111 — `content` beside `state`, because the copy ledger scans the source
  // for the reader's exact spelling. A call made through `ctx` instead is copy
  // the gate cannot see, and it read seven live ids as unreachable.
  // (This comment named the spelling literally on its first draft, and the
  // ledger counted the example — a gate that reads source reads comments too.)
  const { state, content } = ctx;
  const storage = globalThis.localStorage;
  // Set once the panel is closed (by any path — Close, a reload-bound
  // action, reopening fresh). Guards the one truly async gap below: an
  // import's file read can still be pending after the player has already
  // tapped Close.
  let closed = false;

  // One downloader, two callers: the panel and the reset confirmation. The
  // confirmation is where it matters most, so it cannot be the copy that
  // drifts. The anchor is appended before the click and removed after —
  // Safari does not reliably honour `download` on a detached element.
  const downloadSave = () => {
    const blob = new Blob([exportSave(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(state);
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next frame: revoking synchronously races the download
    // in some browsers and silently produces an empty file.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    sfx.play('click');
  };

  // One place that knows how to read a slot — the active one from live
  // `state` (its own save may be ahead of whatever last hit storage), any
  // other straight off disk. Shared by render()'s rows and the rename
  // prompt, which needs the same fallback label render() shows rather than
  // opening blank.
  const summaryFor = (slot, reg, now) => (slot.id === reg.activeId
    ? { ...runSummary(state, now), lab: state.profile?.lab ?? null, foundedIn: state.starterLab ?? null }
    : slotSummary(slot.id, storage, now));
  const slotLabel = (slot, summary) => slot.name ?? summary.lab ?? `Lab ${slot.id}`;

  // One render path, always fed the current state — so a message never
  // has to survive being appended to a DOM the very next line replaces.
  // `note`-then-`render` was tried first and lost every message it showed.
  const render = (msg) => {
    // R80 — this panel's whole conversation with the player is one line of
    // text that appears in a full re-render, so a screen reader was told
    // nothing at all: not that the save downloaded, not that the import
    // failed, not why. The line still renders where it always did; it is
    // also spoken.
    announce(msg);
    const reg = loadSlotRegistry(storage);
    const now = ctx.now();
    const slotRows = reg.slots
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((slot) => {
        const active = slot.id === reg.activeId;
        const summary = summaryFor(slot, reg, now);
        const label = slotLabel(slot, summary);
        const detail = summary.corrupt
          ? 'Corrupted — this lab could not be read. Delete it and start a new one.'
          : summary.empty
          ? 'Empty — not started yet.'
          : `${summary.chimeras} chimera${summary.chimeras === 1 ? '' : 's'} · ${summary.animals} animal${summary.animals === 1 ? '' : 's'} · ${summary.days} day${summary.days === 1 ? '' : 's'}`;
        // Which of R119's five it was founded in, named from the content
        // rather than from the id, so a sixth lab needs no edit here.
        const founded = summary.foundedIn
          ? (ctx.content?.starterLabs ?? []).find((l) => l.id === summary.foundedIn)?.name ?? null
          : null;
        const played = active ? 'playing now' : fmtAgo(slot.lastPlayedAt, now);
        return `
          <li class="slot-row ${active ? 'is-active' : ''}" data-slot="${slot.id}">
            <div class="slot-info">
              <strong>${label}</strong>${active ? ' <span class="slot-badge">ACTIVE</span>' : ''}
              <span class="fine-print">${founded ? `${founded} · ` : ''}${detail}${played ? ` · ${played}` : ''}</span>
            </div>
            <div class="slot-actions">
              ${active ? '' : `<button type="button" class="care-train" data-switch-slot="${slot.id}">Switch</button>`}
              <button type="button" class="care-train" data-rename-slot="${slot.id}">Rename</button>
              ${active ? '' : `<button type="button" class="pen-dismantle" data-delete-slot="${slot.id}">Delete</button>`}
            </div>
          </li>`;
      })
      .join('');

    overlay.hidden = false;
    // Read once, used twice each — and written as two straight calls rather
    // than one `copy(content, cond ? a : b)`, so the ledger can see both ids.
    const bedOn = state.settings.ambience !== false;
    const buzzOn = state.settings.haptics !== false;
    overlay.innerHTML = `
      <div class="ceremony card settings-card">
        <h3>${renderIcon('settings')} Settings</h3>

        <p class="settings-heading">Sound</p>
        ${toggleRow({ id: 'sound', label: state.settings.muted ? 'Muted' : 'Sound on', checked: !state.settings.muted })}
        <button type="button" class="care-train" id="set-volume">${copy(content, 'settings.volume_label')}: ${volumes(content).find((v) => v.id === (state.settings.volume ?? 1))?.label ?? ''}</button>
        ${toggleRow({ id: 'ambience', label: bedOn ? copy(content, 'settings.ambience_on') : copy(content, 'settings.ambience_off'), checked: bedOn })}
        <p class="fine-print">${copy(content, 'settings.ambience_note')}</p>
        ${toggleRow({ id: 'haptics', label: buzzOn ? copy(content, 'settings.haptics_on') : copy(content, 'settings.haptics_off'), checked: buzzOn })}
        <p class="fine-print">${copy(content, 'settings.haptics_note')}</p>

        <p class="settings-heading">Theme</p>
        <button type="button" class="care-train" id="set-theme">Theme: ${themeName(state.settings.theme ?? BASE_THEME)}</button>

        <p class="settings-heading">Battle speed</p>
        <button type="button" class="care-train" id="set-speed">Replay: ${SPEEDS.find((s) => s.id === (state.settings.battleSpeed ?? 1))?.label ?? 'Normal'}</button>
        <p class="fine-print">How fast the arena replays a fight. A duel is worth watching; the
          fourth spar of the day is not. If your device asks for reduced motion, that wins.</p>

        <hr class="settings-rule">
        <p class="settings-heading">Labs (${reg.slots.length}/${MAX_SLOTS})</p>
        <ul class="slot-list">${slotRows}</ul>
        <button type="button" class="care-train" id="set-new-slot" ${reg.slots.length >= MAX_SLOTS ? 'disabled' : ''}>
          + New Lab
        </button>
        ${reg.slots.length >= MAX_SLOTS ? `<p class="fine-print">Delete one to make room for another.</p>` : ''}

        <hr class="settings-rule">
        <p class="settings-heading">Save File</p>
        <p class="fine-print">This game lives in this browser. Clear the site data, change phones, or
          reinstall, and it is gone — unless you have carried it out first.</p>
        <button type="button" class="care-train" id="set-export">⬇ Download my save</button>
        <!-- R73: a <label for> is never in the tab order and never fires on
             Enter, so the one control that carries a save back INTO the game
             was reachable by touch and mouse only. A button that forwards the
             click to the hidden input is focusable, Enter- and Space-
             activated, and announces itself as a button. -->
        <button type="button" class="care-train" id="set-import">⬆ Load a save file…</button>
        <input type="file" id="set-import-file" accept="application/json,.json" hidden>

        ${msg ? `<p class="ranch-msg settings-note">${msg}</p>` : ''}
        <hr class="settings-rule">
        <button type="button" class="pen-dismantle" id="set-reset">Start a new run…</button>
        <button type="button" class="big-btn" id="set-close">Close</button>
      </div>`;

    bind();
  };

  const bind = () => {
    overlay.querySelector('#set-close').addEventListener('click', () => {
      closed = true;
      overlay.hidden = true;
      overlay.innerHTML = '';
    });

    overlay.querySelector('[data-toggle="sound"]').addEventListener('click', () => {
      state.settings.muted = !state.settings.muted;
      sfx.applyAudioSettings(state.settings);
      ctx.save();
      if (!state.settings.muted) sfx.play('click');
      render();
    });

    overlay.querySelector('#set-volume').addEventListener('click', () => {
      openPicker({
        title: copy(content, 'settings.volume_label'),
        groups: [{ label: null, options: volumes(content) }],
        selectedId: state.settings.volume ?? 1,
        onPick: (id) => {
          state.settings.volume = id;
          sfx.applyAudioSettings(state.settings);
          ctx.save();
          if (!state.settings.muted) sfx.play('click');
          render();
        },
      });
    });

    overlay.querySelector('[data-toggle="ambience"]').addEventListener('click', () => {
      state.settings.ambience = state.settings.ambience === false;
      sfx.applyAudioSettings(state.settings);
      ctx.save();
      render();
    });

    overlay.querySelector('[data-toggle="haptics"]').addEventListener('click', () => {
      state.settings.haptics = state.settings.haptics === false;
      sfx.applyAudioSettings(state.settings);
      ctx.save();
      // The one honest way to show a haptic setting is to fire it once.
      if (state.settings.haptics) sfx.buzz('ko', content);
      render();
    });

    overlay.querySelector('#set-speed').addEventListener('click', () => {
      openPicker({
        title: 'Battle speed',
        groups: [{ label: null, options: SPEEDS.map((s) => ({ id: s.id, label: s.label, sub: s.sub })) }],
        selectedId: state.settings.battleSpeed ?? 1,
        onPick: (id) => {
          state.settings.battleSpeed = id;
          ctx.save();
          render();
        },
      });
    });

    overlay.querySelector('#set-theme').addEventListener('click', () => {
      openPicker({
        title: 'Theme',
        groups: [{
          label: null,
          options: THEMES.map((t) => ({
            id: t.id, label: t.name, sub: t.id === BASE_THEME ? 'Default' : undefined,
          })),
        }],
        selectedId: state.settings.theme ?? BASE_THEME,
        onPick: (id) => {
          state.settings.theme = id;
          ctx.save();
          ctx.applyTheme();
          sfx.play('click');
          render();
        },
      });
    });

    overlay.querySelectorAll('[data-switch-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.switchSlot);
        const result = switchSlot(id, storage);
        if (!result.ok) return render(result.msg);
        location.reload();
      });
    });

    overlay.querySelectorAll('[data-rename-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.renameSlot);
        const reg = loadSlotRegistry(storage);
        const slot = reg.slots.find((s) => s.id === id);
        if (!slot) return render('That lab no longer exists.');
        openPrompt({
          title: 'Rename lab',
          label: 'Lab name',
          value: slot.name ?? slotLabel(slot, summaryFor(slot, reg, ctx.now())),
          maxLength: 40,
          onSubmit: (value) => {
            const result = renameSlot(id, value, storage);
            render(result.ok ? undefined : result.msg);
          },
        });
      });
    });

    // Deleting a lab is permanent and, unlike every other destructive
    // action here, has no backup behind it — deleteSlot() only removes.
    // "Start a new run" gets a two-tap dialog naming the cost; a mis-tap
    // in this row's tight Switch/Rename/Delete cluster deserved the same,
    // not a single unguarded click next to two harmless ones.
    overlay.querySelectorAll('[data-delete-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.deleteSlot);
        confirmDeleteSlot(id);
      });
    });

    overlay.querySelector('#set-new-slot').addEventListener('click', () => {
      const result = createSlot(state, storage);
      if (!result.ok) return render(result.msg);
      location.reload();
    });

    overlay.querySelector('#set-export').addEventListener('click', () => {
      downloadSave();
      render(`Saved as ${exportFilename(state)}. Keep it somewhere that is not this phone.`);
    });

    overlay.querySelector('#set-import').addEventListener('click', () => {
      overlay.querySelector('#set-import-file').click();
    });

    overlay.querySelector('#set-import-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const read = await file.text().catch(() => null);
      // The one genuinely async gap in this file: the panel can be closed
      // (or reopened, rebuilding everything under `bind()`) while a file
      // read is in flight. Reappearing with a reload the player never
      // asked for, after they already tapped away, is the bug — the read
      // still happened and cost nothing, so simply stopping here is enough.
      if (closed) return;
      if (read === null) return render('That file could not be read.');
      const parsed = await importSave(read);
      if (!parsed.ok) return render(parsed.msg);
      const written = adoptSave(parsed.save, storage, state.slotId);
      if (!written.ok) return render(written.msg);
      // Reload rather than swapping state in place: every screen, timer and
      // module-level cache in the game was built against the old save, and
      // a boot is the one path already proven to set all of them up.
      location.reload();
    });

    // R55: the reset. Two taps, and the second one is only ever reached
    // after the first has said out loud what it costs — with the download
    // button repeated inside the confirmation, because "there is a backup
    // in this browser" is not a plan a player can hold.
    overlay.querySelector('#set-reset').addEventListener('click', () => {
      // Nothing to lose means nothing to confirm: a dialogue that guards an
      // empty ranch is how a player learns to tap through the one that
      // guards a real run.
      if (runSummary(state).empty) {
        const written = adoptSave(startNewRun(state), storage, state.slotId);
        if (!written.ok) return render(written.msg);
        return location.reload();
      }
      confirmNewRun();
    });
  };

  // R102 — WHAT YOU PACK, offered only to a run that finished. `legacyOffers`
  // returns nothing for an unfinished campaign, so this whole branch is
  // invisible until the county is yours: the pick is what finishing buys, and
  // a choice shown to somebody who cannot take it is a dead end with a button
  // on it. Everything the ceremony says comes from data/legacy.json.
  let picked = null;
  const legacyBlock = () => {
    const offers = legacyOffers(state, ctx.content);
    if (!offers.length) return '';
    const t = legacyTuning(ctx.content);
    const c = t.ceremony ?? {};
    const kinds = t.kinds ?? {};
    return `
      <div class="legacy-pack">
        <h4>${c.title ?? 'Pack one thing'}</h4>
        <p class="ranch-msg">${c.blurb ?? ''}</p>
        ${offers.map((o) => `
          <button type="button" class="care-train legacy-pick" data-legacy="${o.kind}:${o.id}"
                  aria-pressed="false">
            <strong>${kinds[o.kind]?.name ?? o.kind}</strong> — ${o.label}
            ${o.detail ? `<span class="lineage">${o.detail}</span>` : ''}
          </button>`).join('')}
        ${t.cost?.line ? `<p class="fine-print">${t.cost.line}</p>` : ''}
        <button type="button" class="care-train legacy-pick" data-legacy="" aria-pressed="true">
          <strong>${c.noneLabel ?? 'Travel light'}</strong>
          <span class="lineage">${c.noneBlurb ?? ''}</span>
        </button>
      </div>`;
  };

  const confirmNewRun = () => {
    const sum = runSummary(state, Date.now(), content);
    picked = null;
    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="ceremony card">
        <h3>${renderIcon('warning-triangle')} Start a new run?</h3>
        <p class="ranch-msg">This ends the current one: <strong>${sum.chimeras}</strong> chimera${sum.chimeras === 1 ? '' : 's'},
          <strong>${sum.animals}</strong> animal${sum.animals === 1 ? '' : 's'} on the ranch,
          <strong>${sum.parts}</strong> part token${sum.parts === 1 ? '' : 's'},
          <strong>${sum.nodes}</strong> node${sum.nodes === 1 ? '' : 's'} held, over ${sum.days} day${sum.days === 1 ? '' : 's'}.</p>
        ${/* R112 — and what the run ADDS UP TO, which the five list lengths
              above cannot say: a player who graduated a thousand chimeras and
              keeps nine was being shown the nine. The Yearbook's headline
              rows, so this line grows when a counter does. */ ''}
        ${sum.lifetime.length
          ? `<p class="fine-print">${sum.lifetime.map((r) => `${r.label}: <strong>${r.value}</strong>`).join(' &middot; ')} &mdash; the whole of it is on the Dex's Yearbook.</p>`
          : ''}
        <p class="fine-print">The run is kept in this browser as a backup — but a backup you cannot
          see is not a plan. Take the file first.</p>
        <button type="button" id="cnr-export" class="big-btn">⬇ Download it first</button>
        <p class="fine-print">Your sound setting and the field notes you have already read carry over.
          Everything else starts again from an empty ranch.</p>
        ${legacyBlock()}
        <button type="button" id="cnr-go" class="pen-dismantle">Yes, start over</button>
        <button type="button" id="cnr-back" class="care-train">Cancel</button>
      </div>`;
    overlay.querySelector('#cnr-back').addEventListener('click', () => render());
    overlay.querySelector('#cnr-export').addEventListener('click', () => downloadSave());
    // R102 — one pressed at a time, which is the ceiling made visible. The
    // engine refuses a second pick anyway; this is so the player never gets
    // as far as being refused.
    for (const btn of overlay.querySelectorAll('.legacy-pick')) {
      btn.addEventListener('click', () => {
        for (const other of overlay.querySelectorAll('.legacy-pick')) {
          other.setAttribute('aria-pressed', String(other === btn));
        }
        const [kind, id] = (btn.dataset.legacy ?? '').split(':');
        picked = kind
          ? legacyOffers(state, ctx.content).find((o) => o.kind === kind && o.id === id) ?? null
          : null;
      });
    }
    overlay.querySelector('#cnr-go').addEventListener('click', () => {
      // `applyLegacy` is a no-op for a null pick, so travelling light goes
      // through exactly the path it always did.
      const fresh = applyLegacy(startNewRun(state), picked, state, ctx.content);
      // R186 — and whichever it is, the new lab hears about anybody the old
      // one found (campaign/legacy.js).
      recallLegends(fresh, ctx.content);
      const written = adoptSave(fresh, storage, state.slotId);
      if (!written.ok) return render(written.msg);
      location.reload();
    });
  };

  // Unlike confirmNewRun, deleteSlot() has no backup to fall back on — it
  // only removes — so this is the one guard standing between a mis-tap and
  // a permanently gone lab. Same two-tap shape, no download step: there is
  // nothing left running to download once this confirms.
  const confirmDeleteSlot = (id) => {
    const reg = loadSlotRegistry(storage);
    const slot = reg.slots.find((s) => s.id === id);
    if (!slot) return render('That lab is already gone.');
    const summary = summaryFor(slot, reg, ctx.now());
    const label = slotLabel(slot, summary);
    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="ceremony card">
        <h3>${renderIcon('warning-triangle')} Delete ${label}?</h3>
        <p class="ranch-msg">${summary.empty
          ? 'This lab has nothing in it yet — deleting it costs nothing.'
          : `This deletes it for good: <strong>${summary.chimeras}</strong> chimera${summary.chimeras === 1 ? '' : 's'}, `
            + `<strong>${summary.animals}</strong> animal${summary.animals === 1 ? '' : 's'}, over ${summary.days} day${summary.days === 1 ? '' : 's'}.`}</p>
        ${summary.empty ? '' : '<p class="fine-print">There is no backup for this one — switch to it and download a save file first if you want to keep it.</p>'}
        <button type="button" id="cds-go" class="pen-dismantle">Yes, delete it</button>
        <button type="button" id="cds-back" class="care-train">Cancel</button>
      </div>`;
    overlay.querySelector('#cds-back').addEventListener('click', () => render());
    overlay.querySelector('#cds-go').addEventListener('click', () => {
      const result = deleteSlot(id, storage);
      render(result.ok ? 'Lab deleted.' : result.msg);
    });
  };

  render();
}
