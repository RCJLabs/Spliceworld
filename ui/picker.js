// In-game picker. A native <select> opens the OS wheel/dialog on Android and
// iOS, which shatters the Saturday-morning-villain aesthetic — so every
// choice in the game goes through this instead: a styled field button that
// opens a full-screen sheet drawn with the game's own panels.
//
// Presentation only; callers own the state. Sheets close on pick, backdrop
// tap, or Escape, and never leave a listener behind.

let openSheet = null;

// A field that looks like a form control but is a plain button.
// R80 — the label is ASSOCIATED, not merely adjacent. A <span> beside a
// button is a span beside a button: every picker in the game announced
// itself as its own current value with no idea which field it belonged to,
// so a screen reader heard "Laboratory, button" and "Goat, button" and had
// to guess which was the theme and which was the animal. `aria-labelledby`
// naming the label and the value in that order reads them as one control —
// "Theme, Laboratory, button" — which is what the sighted layout already
// says. The hint moves to `aria-describedby` rather than being dropped:
// `aria-labelledby` REPLACES the accessible name, so naming the label and
// the value without this would silently throw away "3 available" and
// "Prime · Biscuit".
export function pickerField({ id, label, value, hint, disabled = false, count = null }) {
  return `
    <div class="pick-field ${disabled ? 'is-disabled' : ''}">
      <span class="pick-label" id="pick-label-${id}">${label}${count != null ? ` <em>${count}</em>` : ''}</span>
      <button type="button" class="pick-button" data-picker="${id}" ${disabled ? 'disabled' : ''}
              aria-labelledby="pick-label-${id} pick-value-${id}"
              ${hint ? `aria-describedby="pick-hint-${id}"` : ''}>
        <span class="pick-value" id="pick-value-${id}">${value}</span>
        ${hint ? `<span class="pick-hint" id="pick-hint-${id}">${hint}</span>` : ''}
        <span class="pick-caret" aria-hidden="true">▾</span>
      </button>
    </div>`;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Who to give focus back to. Both sheets need it and only one of them had it
// (R80): openPrompt never recorded an opener, so renaming a chimera returned
// a keyboard user to the top of the document rather than to the Rename
// button they had just pressed.
const openerNow = () => (document.activeElement instanceof HTMLElement ? document.activeElement : null);

// Escape closes, and Tab cycles inside. Both sheets are `aria-modal="true"`,
// which is a PROMISE that nothing outside them is reachable; the trap is what
// makes it true for a keyboard as well as for assistive tech. openPrompt
// carried the promise and not the trap, so Tab walked straight out of a
// rename sheet and into the screen behind it.
function sheetKeys(host) {
  return (e) => {
    if (e.key === 'Escape') { closePicker(); return; }
    if (e.key !== 'Tab') return;
    const items = [...host.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
}

// groups: [{ label, options: [{ id, label, sub, mark, disabled, badge }] }]
// A group with a null label renders its options ungrouped.
export function openPicker({ title, subtitle, groups, selectedId, onPick }) {
  closePicker();
  const host = document.querySelector('#picker');
  if (!host) return;

  const body = groups
    .filter((g) => g.options.length)
    .map((g) => {
      const rows = g.options
        .map(
          (o) => `
        <button type="button" class="pick-row ${o.id === selectedId ? 'is-selected' : ''}"
                data-value="${o.id}" ${o.disabled ? 'disabled' : ''}>
          <span class="pick-row-main">
            ${o.mark ? `<span class="pick-mark">${o.mark}</span>` : ''}
            <span class="pick-row-label">${o.label}</span>
            ${o.badge ?? ''}
          </span>
          ${o.sub ? `<span class="pick-row-sub">${o.sub}</span>` : ''}
        </button>`
        )
        .join('');
      return g.label
        ? `<div class="pick-group"><h4>${g.label}</h4>${rows}</div>`
        : `<div class="pick-group">${rows}</div>`;
    })
    .join('');

  host.hidden = false;
  host.innerHTML = `
    <div class="pick-backdrop" data-close="1"></div>
    <div class="pick-sheet" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="pick-head">
        <h3>${title}</h3>
        ${subtitle ? `<p class="fine-print">${subtitle}</p>` : ''}
        <button type="button" class="pick-close" data-close="1" aria-label="Close">&#10005;</button>
      </div>
      <div class="pick-list">${body || '<p class="ranch-msg">Nothing to choose from yet.</p>'}</div>
    </div>`;

  // R73 — the sheet already CLAIMED to be a modal dialog (role, aria-modal,
  // a label) and behaved like a div: nothing moved focus into it, so a
  // keyboard user opened a picker and stayed exactly where they were, tabbing
  // through the page behind it. `aria-modal` is a promise; these three make
  // it true — focus in, Tab kept inside, focus back to the opener on close.
  const onKey = sheetKeys(host);
  document.addEventListener('keydown', onKey);
  openSheet = { host, onKey, opener: openerNow() };

  host.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', () => closePicker())
  );
  host.querySelectorAll('.pick-row').forEach((row) =>
    row.addEventListener('click', () => {
      const value = row.dataset.value;
      closePicker();
      onPick(value);
    })
  );
  // The selected row is where the player's attention already is, so it is
  // where focus goes; failing that, the first thing they can act on.
  const landing = host.querySelector('.pick-row.is-selected:not([disabled])')
    ?? host.querySelector('.pick-row:not([disabled])')
    ?? host.querySelector('.pick-close');
  landing?.scrollIntoView({ block: 'center' });
  landing?.focus();
}

// R41: a one-field text sheet in the same chrome as the picker — the OS
// keyboard is unavoidable for typing a name, but the sheet around it is
// still ours. Enter submits, Escape and backdrop cancel.
export function openPrompt({ title, label, value = '', maxLength = 24, onSubmit }) {
  closePicker();
  const host = document.querySelector('#picker');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="pick-backdrop" data-close="1"></div>
    <div class="pick-sheet" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="pick-head">
        <h3>${title}</h3>
        <button type="button" class="pick-close" data-close="1" aria-label="Close">&#10005;</button>
      </div>
      <div class="pick-list">
        <label class="prompt-label">${label}
          <input type="text" class="prompt-input" maxlength="${maxLength}" autocomplete="off" spellcheck="false">
        </label>
        <button type="button" class="big-btn" id="prompt-go">Make it official</button>
      </div>
    </div>`;
  const input = host.querySelector('.prompt-input');
  input.value = value;
  const submit = () => {
    const v = input.value;
    closePicker();
    onSubmit(v);
  };
  // R80 — Enter belongs to the FIELD, not to the document. It was registered
  // on `document` with no target check, so pressing Enter on the sheet's own
  // ✕ COMMITTED the rename instead of cancelling it: the two controls a
  // keyboard user is most likely to be on did the same thing, and one of
  // them was the one that means "no". Escape and the Tab trap stay on the
  // document, because those are properties of the sheet rather than of any
  // control in it.
  const onKey = sheetKeys(host);
  document.addEventListener('keydown', onKey);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submit();
  });
  openSheet = { host, onKey, opener: openerNow() };
  host.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => closePicker()));
  host.querySelector('#prompt-go').addEventListener('click', submit);
  input.focus();
  input.select();
}

export function closePicker() {
  if (!openSheet) return;
  document.removeEventListener('keydown', openSheet.onKey);
  const { opener } = openSheet;
  openSheet.host.hidden = true;
  openSheet.host.innerHTML = '';
  openSheet = null;
  // Back where they came from, not the top of the document.
  if (opener && document.contains(opener)) opener.focus();
}

// Wire every pickerField in a container. specs: { [id]: () => pickerConfig }
export function bindPickers(root, specs) {
  root.querySelectorAll('button[data-picker]').forEach((btn) => {
    const spec = specs[btn.dataset.picker];
    if (!spec) return;
    btn.addEventListener('click', () => openPicker(spec()));
  });
}

// A checkbox replacement that matches the game's chrome.
export function toggleRow({ id, label, sub, checked, disabled = false }) {
  return `
    <button type="button" class="toggle-row ${checked ? 'is-on' : ''} ${disabled ? 'is-disabled' : ''}"
            data-toggle="${id}" ${disabled ? 'disabled' : ''} aria-pressed="${checked}">
      <span class="toggle-box">${checked ? '&#10003;' : ''}</span>
      <span class="toggle-text"><strong>${label}</strong>${sub ? `<span class="fine-print">${sub}</span>` : ''}</span>
    </button>`;
}
