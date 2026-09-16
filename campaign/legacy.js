// R102 — THE RUN BOUNDARY. What survives the end of a campaign, and how much.
//
// R87 gave the endgame a stake and a sink and deferred this on purpose. The
// measurement that made it urgent: the county falls on median day 28.6 across
// thirteen seeds — 24 at the earliest, 39 at the latest, thirteen out of
// thirteen — and a campaign is 180 days. **151 of them happen after the only
// thing the game calls an ending.** (The R102 entry said median day 35-54 and
// "~130 days"; both were measured before R94, R138, R154 and R157 each made
// the player stronger, and both moved the wrong way.)
//
// The boundary already existed and was empty. `startNewRun` carried
// `settings`, `guidesSeen` and `ui` — a sound toggle and some read receipts —
// so retiring a finished county produced a run identical to the first and
// merely emptier. A new game plus that carries nothing is a new game.
//
// EXACTLY ONE THING, and the word doing the work is exactly. Both failure
// modes are real and they are opposite: carry nothing and the ceremony is a
// lie, carry two and a legacy system becomes a save editor one milestone at a
// time. `maxPicks` lives in data/legacy.json so it can be read out loud, and
// `applyLegacy` refuses a second pick rather than replacing the first —
// refusing is the behaviour a player can understand from one try.
//
// WHAT IS DATA AND WHAT IS ENGINE. The kinds, their prose and the ceremony's
// words are data, so a fourth kind is a JSON object. What a kind MEANS — which
// field of the fresh state it writes — is `carries`, and this module refuses a
// `carries` it does not implement instead of quietly keeping nothing. That is
// the R41 training.json lesson: a silent fallback is worse than an error.
//
// THE OFFER IS DERIVED FROM THE RUN. You cannot keep a veteran you never
// built, or a bloodline off an empty ranch. An option that cannot be taken is
// a dead end dressed as a choice, and the founding picker (R119) had exactly
// that bug before it was measured.

export function legacyTuning(content) {
  return content?.legacy ?? { maxPicks: 1, kinds: {}, ceremony: {} };
}

// Everything this particular finished run could pack. Empty for a run that has
// not finished — the pick is what FINISHING buys, and offering it earlier
// would make dominion mean nothing.
export function legacyOffers(state, content) {
  const t = legacyTuning(content);
  const openedBy = t.openedBy ?? 'dominionAt';
  if (!state?.[openedBy]) return [];

  const offers = [];
  const kinds = t.kinds ?? {};

  if (kinds.veteran) {
    for (const c of state.chimeras ?? []) {
      if (!c?.id) continue;
      offers.push({
        kind: 'veteran',
        id: c.id,
        label: c.name ?? 'an unnamed creature',
        // What the ceremony shows underneath the name, so the player is
        // choosing between creatures rather than between ids.
        detail: [
          (c.scars ?? []).length ? `${(c.scars ?? []).length} scar${(c.scars ?? []).length === 1 ? '' : 's'}` : null,
          c.level ? `level ${c.level}` : null,
        ].filter(Boolean).join(' · '),
      });
    }
  }

  if (kinds.bloodline) {
    // One offer per LINE, not per animal: keeping a bloodline is keeping the
    // species you raised, and two goats are one bloodline.
    const seen = new Set();
    for (const a of state.ranch?.stock ?? []) {
      if (!a?.species || seen.has(a.species)) continue;
      seen.add(a.species);
      offers.push({
        kind: 'bloodline',
        id: a.species,
        label: content?.species?.[a.species]?.name ?? a.species,
        detail: 'a founding animal of the line',
      });
    }
  }

  if (kinds.doctrine && state.profile?.philosophy) {
    offers.push({
      kind: 'doctrine',
      id: state.profile.philosophy,
      label: content?.philosophies?.[state.profile.philosophy]?.name ?? state.profile.philosophy,
      detail: 'carried instead of rolled again',
    });
  }

  return offers;
}

// R102 — one chimera, stripped of the run it came from.
//
// "Arrives with its history and none of its old roster" is the entry's own
// wording and the two halves pull against each other, so the line is drawn at
// WHAT IT IS versus WHAT IT HAD. Its genome, name, scars, temperament and
// level are what make it that creature rather than a fresh body wearing its
// name; its injuries, its place in a stable that no longer exists and any
// clock it was standing in are what it HAD, and those do not travel.
function carryChimera(source) {
  const c = structuredClone(source);
  // Run-scoped state. A creature that crosses mid-infirmary would arrive in a
  // building that does not exist yet.
  delete c.injury;
  delete c.injuredUntil;
  delete c.settlingUntil;
  delete c.agitatedAt;
  delete c.containedAt;
  delete c.sparredAt;
  // It has fought nothing in this county.
  c.record = { wins: 0, losses: 0 };
  return c;
}

// Write exactly one thing into a fresh state. `fresh` is `startNewRun`'s
// output — already carrying the device preferences R55 chose — and `previous`
// is the finished run, which is where the pick's substance comes from.
//
// Returns the state either way: a refused second pick is not an error the UI
// has to handle, it is simply the first pick still being the answer.
export function applyLegacy(fresh, pick, previous, content) {
  const t = legacyTuning(content);
  if (!pick) return fresh;
  // THE CEILING. Not "replace", not "append" — refuse. See the note above.
  const taken = fresh.legacy ? 1 : 0;
  if (taken >= (t.maxPicks ?? 1)) return fresh;

  const kind = t.kinds?.[pick.kind];
  if (!kind) return fresh;                  // a kind the data does not declare

  const out = fresh;
  switch (kind.carries) {
    case 'chimera': {
      const source = (previous?.chimeras ?? []).find((c) => c.id === pick.id);
      if (!source) return fresh;
      out.chimeras = [carryChimera(source)];
      out.chimeraCount = 1;
      break;
    }
    case 'species': {
      const source = (previous?.ranch?.stock ?? []).find((a) => a.species === pick.id);
      if (!source) return fresh;
      // A FOUNDER, not the animal itself: the line crosses, the individual
      // does not. Age, condition and stars start where a founding animal
      // starts, which is what keeps this from being a second veteran slot.
      out.ranch = { ...out.ranch, founderSpecies: pick.id };
      break;
    }
    case 'philosophy': {
      if (!previous?.profile?.philosophy) return fresh;
      out.profile = { ...out.profile, philosophy: previous.profile.philosophy };
      break;
    }
    default:
      // R41's lesson: an unimplemented `carries` is an error, not a quiet
      // nothing. Returning `fresh` unchanged here would let somebody add a
      // kind to the JSON, see the ceremony offer it, take it, and lose it.
      throw new Error(`legacy kind "${pick.kind}" carries "${kind.carries}", which this engine does not implement`);
  }

  // What was kept, and what it was kept FROM. The lab name is the story: a
  // second run that opens saying where its one creature came from is the
  // whole point of a boundary the player chose.
  out.legacy = {
    kind: pick.kind,
    id: pick.id,
    label: pick.label ?? null,
    from: {
      lab: previous?.profile?.lab ?? null,
      days: previous?.createdAt ? Math.max(0, Math.floor((Date.now() - previous.createdAt) / 86400000)) : 0,
    },
  };
  return out;
}
