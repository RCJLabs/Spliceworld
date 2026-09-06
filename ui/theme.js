// The five colour schemes style.css ships.
//
// R81 — these moved out of `save/settings-ui.js`. The shell needs them on
// every boot, to know which `[data-theme]` to stamp on the document before
// anything paints; the settings panel needs them only when somebody opens
// it. Leaving them together meant main.js imported a 16 KB modal to read a
// seven-line list, and the modal brought the whole save module with it.
//
// BASE_THEME is a sentinel, not a `[data-theme]` selector — biohazard IS the
// bare `:root`, so "picked the default" means REMOVING the attribute rather
// than setting it to something. Every other id here has a matching
// `:root[data-theme="…"]` block in style.css, and smoke checks the pairing.
export const BASE_THEME = 'biohazard';

export const THEMES = [
  { id: 'biohazard', name: 'Biohazard' },
  { id: 'lab', name: 'Lab Standard' },
  { id: 'vivarium', name: 'Vivarium' },
  { id: 'blueprint', name: 'Blueprint' },
  { id: 'saturday', name: 'Saturday Morning' },
];

export function themeName(id) {
  return THEMES.find((t) => t.id === id)?.name ?? THEMES[0].name;
}
