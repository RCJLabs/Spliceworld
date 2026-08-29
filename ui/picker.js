// In-game picker. A native <select> opens the OS wheel/dialog on Android and
// iOS, which shatters the Saturday-morning-villain aesthetic — so every
// choice in the game goes through this instead: a styled field button that
// opens a full-screen sheet drawn with the game's own panels.
//
// Presentation only; callers own the state. Sheets close on pick, backdrop
// tap, or Escape, and never leave a listener behind.

let openSheet = null;

// A field that looks like a form control but is a plain button.
export function pickerField({ id, label, value, hint, disabled = false, count = null }) {
  return `
    <div class="pick-field ${disabled ? 'is-disabled' : ''}">
      <span class="pick-label">${label}${count != null ? ` <em>${count}</em>` : ''}</span>
      <button type="button" class="pick-button" data-picker="${id}" ${disabled ? 'disabled' : ''}>
        <span class="pick-value">${value}</span>
        ${hint ? `<span class="pick-hint">${hint}</span>` : ''}
        <span class="pick-caret" aria-hidden="true">▾</span>
      </button>
    </div>`;
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

  const onKey = (e) => { if (e.key === 'Escape') closePicker(); };
  document.addEventListener('keydown', onKey);
  openSheet = { host, onKey };

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
  host.querySelector('.pick-row.is-selected')?.scrollIntoView({ block: 'center' });
}

export function closePicker() {
  if (!openSheet) return;
  document.removeEventListener('keydown', openSheet.onKey);
  openSheet.host.hidden = true;
  openSheet.host.innerHTML = '';
  openSheet = null;
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
