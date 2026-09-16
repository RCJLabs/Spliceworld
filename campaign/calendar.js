// R105 — THE COUNTY CALENDAR. What time it is, what month it is, and what
// the sky is doing — none of which this game has ever known.
//
// The reasoning, the measurements and the three design rules this module
// obeys are in data/notes/calendar.md, which no browser downloads. In one
// line each: nothing here is written to the save (so no `SAVE_VERSION`
// bump); a season moves HUSBANDRY and never power; and `stocks` only ever
// ADDS to the catalogue, because R95 measured that availability was never
// that screen's problem.

import { mulberry32, hashString } from '../util/rng.js';

const DAY = 86400000;
const HOUR = 3600000;

export function calendarTuning(content) {
  return content?.calendar ?? { seasonDays: 28, order: [], seasons: {}, weather: {}, sky: {} };
}

// Which season a moment falls in, counted from the save's birthday — so two
// players who started on different afternoons get the same opening.
export function seasonOf(state, content, now = Date.now()) {
  const t = calendarTuning(content);
  const span = t.seasonDays ?? 28;
  const order = t.order ?? [];
  const elapsed = Math.max(0, (now - (state?.createdAt ?? now)) / DAY);
  const index = order.length ? Math.floor(elapsed / span) % order.length : 0;
  const id = order[index] ?? null;
  const season = t.seasons?.[id] ?? {};
  return {
    index,
    id,
    name: season.name ?? 'Undated',
    blurb: season.blurb ?? '',
    // Day within the season, 1-based, so prose can say "late" without
    // re-deriving the arithmetic.
    day: Math.floor(elapsed % span) + 1,
    days: span,
    // Defaults are 1 and 0 — a season the data forgot to tune changes
    // nothing, rather than multiplying a husbandry number by undefined.
    decayScale: season.decayScale ?? 1,
    incubationScale: season.incubationScale ?? 1,
    variantBonus: season.variantBonus ?? 0,
    stocks: season.stocks ?? [],
  };
}

// The day's weather, rolled from the seed and the day number, never stored.
//
// IT IS A LINE AND A SKY AND CARRIES NO MECHANICAL EFFECT. The entry proposed
// one ("rain slows the ring's refill"); it was built and cut, because every
// candidate hook here is a timestamp-derived bucket and a multiplier that
// changes daily cannot be applied to one without occasionally eating the
// player a charge. The full arithmetic is in data/notes/calendar.md.
export function weatherOf(state, content, now = Date.now()) {
  const t = calendarTuning(content);
  const order = t.weather?.order ?? [];
  const kinds = t.weather?.kinds ?? {};
  if (!order.length) return { id: null, name: '', line: '' };
  const dayIndex = Math.floor((now - (state?.createdAt ?? now)) / DAY);
  const rng = mulberry32(hashString(`${state?.seed ?? 0}:weather:${dayIndex}`));
  const id = order[Math.floor(rng() * order.length)];
  const kind = kinds[id] ?? {};
  return {
    id,
    name: kind.name ?? id,
    line: kind.line ?? '',
  };
}

// What the header draws, as NUMBERS rather than markup — `ui/sky.js` turns
// these into SVG and loads after the first paint. `bodyX` walks 0..1 across
// the band so the sun crosses the header over an afternoon rather than
// snapping between seven positions; `bodyY` is a parabola, so it rises and
// sets. Clouds are seeded per hour, so a foggy Tuesday stays overcast.
export function skyOf(state, content, now = Date.now()) {
  const bands = calendarTuning(content).sky?.bands ?? [];
  const local = new Date(now);
  const hour = local.getHours() + local.getMinutes() / 60;
  let band = bands[bands.length - 1] ?? { id: 'day', tint: '#000', alpha: 0, body: 'sun', name: '' };
  let next = bands[0]?.from ?? 24;
  for (let i = 0; i < bands.length; i++) {
    if (hour >= bands[i].from) {
      band = bands[i];
      next = bands[i + 1]?.from ?? 24;
    }
  }
  const span = Math.max(0.5, next - band.from);
  const through = Math.min(1, Math.max(0, (hour - band.from) / span));
  const weather = weatherOf(state, content, now);
  const rng = mulberry32(hashString(`${state?.seed ?? 0}:sky:${Math.floor(hour)}`));
  return {
    band: band.id,
    name: band.name ?? band.id,
    tint: band.tint,
    alpha: band.alpha ?? 0,
    body: band.body,
    bodyX: +through.toFixed(3),
    // A parabola peaking mid-band: 0 at the horizons, 1 overhead.
    bodyY: +(1 - Math.abs(through * 2 - 1)).toFixed(3),
    clouds: Math.round(rng() * 3) + (weather.id === 'clear' ? 0 : 2),
    weather: weather.id,
  };
}

// The Ranch's one line — a sentence, not a panel, because R133 spent a
// milestone getting things off the top of that screen.
export function calendarLine(state, content, now = Date.now()) {
  const season = seasonOf(state, content, now);
  const third = season.day / season.days;
  const when = third < 0.34 ? 'Early' : third < 0.67 ? 'Mid' : 'Late';
  const weather = weatherOf(state, content, now);
  return `${when} ${season.name}. ${weather.name}.`;
}
