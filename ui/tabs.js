// Sub-navigation, shared. R15 built this for the War Room when nineteen
// waves of features had stacked thirteen cards into one 3,884px column;
// R45 needed the same thing for the Dex, which had grown to 12.5 screens.
// One implementation rather than two, because two copies of a nav is how
// the two halves of a game stop feeling like one game.
//
// Deliberately driven by caller-held module state rather than the save:
// which view you were last on survives the re-render on every tick and
// every action, which is what actually matters, and it costs no
// migration to do it that way.

// The column count was hardcoded to 5 when only the War Room used this.
// It is the caller's now — a bar that always splits into five is a bar
// that only ever fits one screen's tabs.
export function subtabBar({ tabs, active, attr, badgeFor = () => null, id = '' }) {
  return `
    <nav class="subtabs" style="--subtab-n:${tabs.length}"${id ? ` id="${id}"` : ''}>
      ${tabs.map((tab) => {
        const badge = badgeFor(tab.id);
        return `
          <button type="button" data-${attr}="${tab.id}" class="${active === tab.id ? 'is-on' : ''}">
            <span class="subtab-icon" aria-hidden="true">${tab.icon}</span>
            <span class="subtab-label">${tab.label}</span>
            ${badge ? `<span class="subtab-badge badge-${badge.kind}">${badge.text}</span>` : ''}
          </button>`;
      }).join('')}
    </nav>`;
}

// `attr` is the data attribute name; the dataset key is its camelCase form,
// which is the one thing about this that is easy to get wrong by hand.
export function bindSubtabs(root, attr, onPick) {
  if (!root?.querySelectorAll) return;
  const key = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  root.querySelectorAll(`button[data-${attr}]`).forEach((btn) => {
    btn.addEventListener('click', () => onPick(btn.dataset[key]));
  });
}
