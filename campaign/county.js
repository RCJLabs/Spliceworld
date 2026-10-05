// R211 — THE COUNTY ON A MAP. The War Room's map tab was five region cards
// and a row of text per node, and nothing on the screen said where anything
// was: Kestrel Reach was a heading, not a place north of the barn. This draws
// the county those cards describe — region outlines, the roads between the
// nodes, the lab in the middle — from `regions.json`, and puts every node on
// it as a button that opens the card that is already there for it.
//
// Pure: state in, markup out. `campaign/ui.js` (lazy, like the whole War
// Room) draws it above the region cards and binds the buttons. Every
// coordinate is data: a node's `at` and `road`, a region's `map` (its
// outline, where its name sits, where an expedition camps, where a loose
// specimen wanders, and on one of them, the lab). The county's size is the
// outlines' own extent, so a sixth region drawn further out makes a bigger
// county without anybody typing a number. See data/notes/regions.md.

import { regionStates } from './campaign.js';
import { contestAlerts } from './warroom.js';
import { activeRaid } from './taskforce.js';
import { activeExpedition } from './expedition.js';
import { looseSpecimens } from './breakout.js';
import { renderIcon } from '../ui/icons.js';
import { fmtDuration } from '../ranch/ui.js';
import { copy, esc } from '../util/text.js';

const points = (outline) => String(outline).trim().split(/\s+/).map((p) => p.split(',').map(Number));

// What the map shows today: every region with an outline and whether it is
// open, every node with a place on it and its state (and a contested node's
// clock), the roads, the lab, the vans at its gate while a raid is open, the
// expedition's camp, and the loose specimens out in the open country.
export function countyScene(state, content, now) {
  const drawn = regionStates(state, content).filter(({ region }) => region.map?.outline);
  if (!drawn.length) return null;
  const corners = drawn.flatMap(({ region }) => points(region.map.outline));
  const box = { w: Math.max(...corners.map((p) => p[0])), h: Math.max(...corners.map((p) => p[1])) };
  const clocks = new Map(contestAlerts(state, content, now).map((a) => [a.nodeId, a.remainingMs]));
  const lab = drawn.find(({ region }) => region.map.lab)?.region.map.lab ?? [box.w / 2, box.h / 2];
  const nodes = drawn.flatMap(({ region, nodes: rows }) => rows
    .filter(({ node }) => Array.isArray(node.at))
    .map(({ node, status }) => ({ node, region, status, clock: clocks.get(node.id) ?? null })));
  const at = new Map([['lab', lab], ...nodes.map((n) => [n.node.id, n.node.at])]);
  const roads = nodes.filter((n) => at.has(n.node.road))
    .map((n) => ({ from: at.get(n.node.road), to: n.node.at, open: n.status !== 'locked' }));
  const trip = activeExpedition(state);
  const wilds = drawn.map(({ region }) => region.map.wild).filter(Array.isArray);
  return {
    box,
    lab,
    raid: !!activeRaid(state),
    regions: drawn.map(({ region, open }) => ({ region, open })),
    nodes,
    roads,
    party: trip ? drawn.find(({ region }) => region.id === trip.regionId)?.region.map.camp ?? null : null,
    strays: looseSpecimens(state).slice(0, wilds.length).map((one, i) => ({ one, at: wilds[i] })),
  };
}

// The shape a node's state takes, and its word. Colour is the third channel,
// never the only one: a held node flies a flag and says so, a contested one
// shows its clock, a locked one wears a padlock.
const ICON = { held: 'flag', contested: 'hourglass', available: 'target', locked: 'lock' };
// A contested node's clock in one unit, so its marker is no wider than the
// others ("11h 59m" would crowd its neighbour); the full time is in its name.
const clock = (ms) => {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m < 60 ? `${m}m` : m < 2880 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};
function stateWord(content, n, full = false) {
  if (n.status === 'held') return copy(content, 'county.held');
  if (n.status === 'contested') {
    if (n.clock == null) return copy(content, 'county.contested');
    return full ? `${copy(content, 'county.contested')} ${fmtDuration(n.clock)}` : clock(n.clock);
  }
  if (n.status === 'available') return copy(content, 'county.open');
  return copy(content, 'county.locked');
}

function lab([x, y], raid) {
  const vans = raid
    ? [x - 26, x + 8].map((vx) => `<g class="county-van"><rect x="${vx}" y="${y + 24}" width="18" height="10" rx="2" fill="#2f3540" stroke="#11131a" stroke-width="1.5"/>`
      + `<rect x="${vx + 11}" y="${y + 26}" width="5" height="4" fill="#9fb4c8"/><circle cx="${vx + 4}" cy="${y + 34}" r="2.2" fill="#11131a"/>`
      + `<circle cx="${vx + 14}" cy="${y + 34}" r="2.2" fill="#11131a"/></g>`).join('')
    : '';
  return `<g class="county-lab"><rect x="${x - 4}" y="${y - 32}" width="6" height="14" fill="#5a6270"/>`
    + `<circle cx="${x - 1}" cy="${y - 36}" r="5" fill="#a6e22e" opacity="0.6"/>`
    + `<rect x="${x - 24}" y="${y - 14}" width="48" height="30" rx="3" fill="#cfd6dd" stroke="#2b2440" stroke-width="2"/>`
    + `<polygon points="${x - 28},${y - 13} ${x},${y - 28} ${x + 28},${y - 13}" fill="#7d8796" stroke="#2b2440" stroke-width="2"/>`
    + `<rect x="${x - 6}" y="${y + 2}" width="12" height="14" fill="#2b2440"/>`
    + `<circle cx="${x - 14}" cy="${y - 2}" r="4" fill="#a6e22e" stroke="#2b2440" stroke-width="1.5"/>`
    + `<circle cx="${x + 14}" cy="${y - 2}" r="4" fill="#a6e22e" stroke="#2b2440" stroke-width="1.5"/></g>${vans}`;
}

const camp = ([x, y]) => `<g class="county-party"><polygon points="${x - 9},${y + 6} ${x},${y - 8} ${x + 9},${y + 6}" fill="#e0b450" stroke="#2b2440" stroke-width="1.5"/>`
  + `<line x1="${x}" y1="${y - 8}" x2="${x}" y2="${y - 16}" stroke="#2b2440" stroke-width="1.5"/><polygon points="${x},${y - 16} ${x + 7},${y - 13} ${x},${y - 10}" fill="#a6e22e"/>`
  + `<circle cx="${x - 13}" cy="${y + 3}" r="3" fill="#f2f0ea" stroke="#2b2440" stroke-width="1.2"/><circle cx="${x + 13}" cy="${y + 3}" r="3" fill="#f2f0ea" stroke="#2b2440" stroke-width="1.2"/></g>`;

const stray = ([x, y]) => `<g class="county-stray"><ellipse cx="${x}" cy="${y + 2}" rx="7" ry="5" fill="#c98fd6" stroke="#2b2440" stroke-width="1.5"/>`
  + `<circle cx="${x + 6}" cy="${y - 3}" r="4" fill="#c98fd6" stroke="#2b2440" stroke-width="1.5"/><circle cx="${x + 7}" cy="${y - 4}" r="1.2" fill="#2b2440"/></g>`;

const pct = (v, of) => `${Math.round((v / of) * 1000) / 10}%`;

export function countyMarkup(state, content, now) {
  const scene = countyScene(state, content, now);
  if (!scene) return '';
  const { box } = scene;
  const land = scene.regions.map(({ region, open }) => `<polygon points="${region.map.outline}" fill="${region.map.tint ?? '#5a6270'}"`
    + ` fill-opacity="${open ? 0.34 : 0.12}" stroke="${region.map.tint ?? '#5a6270'}" stroke-width="2" stroke-opacity="0.8"${open ? '' : ' stroke-dasharray="5 5"'}/>`).join('');
  const roads = scene.roads.map(({ from, to, open }) => {
    const [mx, my] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const bend = [(to[1] - from[1]) * 0.12, (from[0] - to[0]) * 0.12];
    return `<path d="M ${from[0]} ${from[1]} Q ${Math.round(mx + bend[0])} ${Math.round(my + bend[1])} ${to[0]} ${to[1]}" fill="none" stroke="#e2d3a8"`
      + ` stroke-width="4" stroke-linecap="round" stroke-opacity="${open ? 0.5 : 0.22}"${open ? '' : ' stroke-dasharray="3 7"'}/>`;
  }).join('');
  const svg = `<svg viewBox="0 0 ${box.w} ${box.h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${land}${roads}`
    + `${lab(scene.lab, scene.raid)}${scene.party ? camp(scene.party) : ''}${scene.strays.map((s) => stray(s.at)).join('')}</svg>`;
  const names = scene.regions.filter(({ region }) => Array.isArray(region.map.label)).map(({ region }) =>
    `<span class="county-name" style="left:${pct(region.map.label[0], box.w)};top:${pct(region.map.label[1], box.h)}">${esc(region.name)}</span>`).join('');
  const nodes = scene.nodes.map((n) => {
    const word = stateWord(content, n);
    const label = copy(content, 'county.node', { name: n.node.name, region: n.region.name, state: stateWord(content, n, true) });
    return `<button type="button" class="county-node is-${n.status}" data-map-node="${esc(n.node.id)}"`
      + ` style="left:${pct(n.node.at[0], box.w)};top:${pct(n.node.at[1], box.h)}" aria-label="${esc(label)}">`
      + `${renderIcon(ICON[n.status] ?? 'target', { size: 16 })}<span class="county-word">${esc(word)}</span></button>`;
  }).join('');
  return `<section class="county" aria-label="${esc(copy(content, 'county.label'))}">`
    + `<div class="county-map" style="aspect-ratio:${box.w} / ${box.h}">${svg}${names}${nodes}</div></section>`;
}
