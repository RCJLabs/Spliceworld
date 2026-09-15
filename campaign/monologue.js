// The story system (ROADMAP §3.8). Pure and DOM-free.
//
// §3.8 promised two things and delivered half of each: rivals carry a
// profile schema with monologue slots, and "the player profile uses the
// same schema… so the villain-monologue feature drops in later with zero
// refactoring." This is later.
//
// The design rule the whole module exists to enforce: a monologue slot is
// a KEY IN A JSON FILE and a caller, never an engine change. Adding a
// beat — a new taunt when something happens — must cost one line of data
// and one line at the site of the event. Everything here is lookup and
// substitution; nothing here decides anything.
//
// A philosophy is narrative only, and must stay that way. Anatomy is
// where this game keeps its mechanics; a stat bonus hiding inside a
// flavour menu would be exactly the invisible modifier the class triangle
// was built to replace.
//
// R169 — WHAT IS LEFT HERE IS THE HALF BOOT CAN REACH. The name roll, the
// philosophy menu and `duelBarks` went to `campaign/identity.js`, which
// only the lazy War Room imports. Everything below is called from
// `campaign.js`, `rehab.js`, `rivals.js` and `wire.js` — all eager, all on
// the synchronous battle-resolution path — so this module stays on the
// exemption list and is now the size of what actually justifies it.

export const DEFAULT_PHILOSOPHY = 'improver';

export function philosophyOf(state, content) {
  const id = state.profile?.philosophy ?? DEFAULT_PHILOSOPHY;
  return content.philosophies?.[id] ?? content.philosophies?.[DEFAULT_PHILOSOPHY] ?? null;
}

// Who the player is, as far as the story is concerned. An unnamed lab is
// still a lab — nothing in the game waits for the player to fill in a
// form, and the dossier simply says so until they do.
export function profileOf(state, content) {
  const philosophy = philosophyOf(state, content);
  return {
    named: !!state.profile?.named,
    title: state.profile?.title ?? 'Director',
    name: state.profile?.name ?? 'the Management',
    lab: state.profile?.lab ?? 'an unregistered barn',
    philosophy,
  };
}

// {rival} {creature} {node} {lab} {name}. An unknown placeholder is left
// alone rather than printed as "undefined" — a line with a typo in it
// should read oddly, not break.
export function fill(template, vars = {}) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (whole, key) => (vars[key] != null ? String(vars[key]) : whole));
}

export function playerLine(state, content, slot, vars = {}) {
  const profile = profileOf(state, content);
  return fill(profile.philosophy?.monologue?.[slot], {
    lab: profile.lab,
    name: profile.name,
    ...vars,
  });
}

export function rivalLine(content, rivalId, slot, vars = {}) {
  const rival = content.rivals?.[rivalId];
  return fill(rival?.monologue?.[slot], { name: rival?.name, ...vars });
}
