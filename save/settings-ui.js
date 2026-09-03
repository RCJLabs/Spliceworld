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

import {
  exportSave, exportFilename, importSave, adoptSave, startNewRun, runSummary,
  loadSlotRegistry, slotSummary, createSlot, switchSlot, deleteSlot, renameSlot, MAX_SLOTS,
} from './save.js';
import { renderIcon } from '../ui/icons.js';
import { openPicker, openPrompt, toggleRow } from '../ui/picker.js';
import * as sfx from '../audio/sfx.js';

// The five colour schemes style.css ships. BASE_THEME is a sentinel, not a
// `[data-theme]` selector — biohazard IS the bare `:root`, so "picked
// biohazard" and "picked nothing" have to resolve to the same no-attribute
// state, which is what applyTheme() (main.js) does with this list.
export const BASE_THEME = 'biohazard';
export const THEMES = [
  { id: 'biohazard', name: 'Biohazard' },
  { id: 'lab', name: 'Lab Standard' },
  { id: 'vivarium', name: 'Vivarium' },
  { id: 'blueprint', name: 'Blueprint' },
  { id: 'saturday', name: 'Saturday Morning' },
];

function themeName(id) {
  return THEMES.find((t) => t.id === id)?.name ?? THEMES[0].name;
}

function fmtAgo(ts, now) {
  if (!ts) return null;
  const mins = Math.max(0, Math.round((now - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function openSettings(overlay, ctx) {
  const { state } = ctx;
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
    ? { ...runSummary(state, now), lab: state.profile?.lab ?? null }
    : slotSummary(slot.id, storage, now));
  const slotLabel = (slot, summary) => slot.name ?? summary.lab ?? `Lab ${slot.id}`;

  // One render path, always fed the current state — so a message never
  // has to survive being appended to a DOM the very next line replaces.
  // `note`-then-`render` was tried first and lost every message it showed.
  const render = (msg) => {
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
        const played = active ? 'playing now' : fmtAgo(slot.lastPlayedAt, now);
        return `
          <li class="slot-row ${active ? 'is-active' : ''}" data-slot="${slot.id}">
            <div class="slot-info">
              <strong>${label}</strong>${active ? ' <span class="slot-badge">ACTIVE</span>' : ''}
              <span class="fine-print">${detail}${played ? ` · ${played}` : ''}</span>
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
    overlay.innerHTML = `
      <div class="ceremony card settings-card">
        <h3>${renderIcon('settings')} Settings</h3>

        <p class="settings-heading">Sound</p>
        ${toggleRow({ id: 'sound', label: state.settings.muted ? 'Muted' : 'Sound on', checked: !state.settings.muted })}

        <p class="settings-heading">Theme</p>
        <button type="button" class="care-train" id="set-theme">Theme: ${themeName(state.settings.theme ?? BASE_THEME)}</button>

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
      sfx.setMuted(state.settings.muted);
      ctx.save();
      if (!state.settings.muted) sfx.play('click');
      render();
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
      const parsed = importSave(read);
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

  const confirmNewRun = () => {
    const sum = runSummary(state);
    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="ceremony card">
        <h3>${renderIcon('warning-triangle')} Start a new run?</h3>
        <p class="ranch-msg">This ends the current one: <strong>${sum.chimeras}</strong> chimera${sum.chimeras === 1 ? '' : 's'},
          <strong>${sum.animals}</strong> animal${sum.animals === 1 ? '' : 's'} on the ranch,
          <strong>${sum.parts}</strong> part token${sum.parts === 1 ? '' : 's'},
          <strong>${sum.nodes}</strong> node${sum.nodes === 1 ? '' : 's'} held, over ${sum.days} day${sum.days === 1 ? '' : 's'}.</p>
        <p class="fine-print">The run is kept in this browser as a backup — but a backup you cannot
          see is not a plan. Take the file first.</p>
        <button type="button" id="cnr-export" class="big-btn">⬇ Download it first</button>
        <p class="fine-print">Your sound setting and the field notes you have already read carry over.
          Everything else starts again from an empty ranch.</p>
        <button type="button" id="cnr-go" class="pen-dismantle">Yes, start over</button>
        <button type="button" id="cnr-back" class="care-train">Cancel</button>
      </div>`;
    overlay.querySelector('#cnr-back').addEventListener('click', () => render());
    overlay.querySelector('#cnr-export').addEventListener('click', () => downloadSave());
    overlay.querySelector('#cnr-go').addEventListener('click', () => {
      const written = adoptSave(startNewRun(state), storage, state.slotId);
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
