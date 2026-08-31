// The Resequencer (R31). DOM-free.
//
// WHY THIS EXISTS. A DNA vial has been produced by every extraction since
// M2 and read by NOTHING. The Gene Vault listed them and that was the end of
// it — a pile of inventory that grew forever and did nothing. This spends
// them.
//
// A vial is the whole donor, not one piece of it, so spending one grows that
// donor BACK: same species, same star potential, same genotype. That last
// part is the point. Extraction was the one irreversible act in the game —
// graduate your best recessive carrier and those genes were gone, because
// `potential` and `genotype` live on the animal and the animal left the
// herd. Vials bank them now.
//
// The trade is real and deliberate: real-world hours, the vial is consumed
// either way, and one run in four collapses. Quality does not buy safety —
// it buys UPSIDE, in the chance the returning animal carries a gene neither
// it nor its donor had.

import { rngStream, randInt, pick } from '../util/rng.js';
import { incubatorGrants } from './facility.js';
import { STATS, TUNING, createAnimal } from '../ranch/ranch.js';
import { expressedTraits } from '../ranch/breeding.js';

const HOUR = 3600000;

// Code defaults mirror data/resequencer.json. A10's gate asserts the two
// agree, because the data wins and a default that disagrees is a lie.
const DEFAULTS = {
  hours: 2,
  successBase: 0.75,
  mutationBase: 0.06,
  mutationPerStar: 0.05,
};

export function resequencerTuning(content) {
  return { ...DEFAULTS, ...(content?.resequencerMeta ?? {}) };
}

export const activeResequence = (state) => state.resequencer ?? null;

export function resequenceRemainingMs(state, now) {
  return Math.max(0, (state.resequencer?.until ?? 0) - now);
}

// What a given vial is worth putting in, quoted before the player commits.
// The odds are stated plainly rather than hinted at: this game shows its
// arithmetic (R28, A7), and a one-in-four loss the player was not told
// about is a different feature from one they accepted.
export function resequencePlan(state, vialId, content, now) {
  const vial = (state.inventory?.vials ?? []).find((v) => v.id === vialId);
  if (!vial) return { ok: false, msg: 'No such vial.' };
  if (state.resequencer) return { ok: false, msg: 'The resequencer is already running.' };
  const species = content.species?.[vial.species];
  if (!species) return { ok: false, msg: 'Nothing in the catalogue matches that essence.' };

  const t = resequencerTuning(content);
  const g = incubatorGrants(state, content);
  const stars = vial.stars ?? 3;
  return {
    ok: true,
    vial,
    species,
    stars,
    hours: Math.max(0.25, Math.round(t.hours * g.hourScale * 100) / 100),
    successChance: t.successBase,
    // Quality buys upside, not safety.
    mutationChance: Math.min(0.95, (t.mutationBase + stars * t.mutationPerStar) * (1 + g.mutationBonus)),
    msg: `Resequence ${vial.donorName} (${species.name}, ★${stars})`,
  };
}

export function startResequence(state, vialId, content, now) {
  const plan = resequencePlan(state, vialId, content, now);
  if (!plan.ok) return plan;

  // Sealed at launch from a seeded stream, exactly like the vat and the jobs
  // board: reloading the app must not be able to reroll a failure into a
  // success. Every die is thrown here, and `tick` only reads the answer.
  state.resequenceCount = (state.resequenceCount ?? 0) + 1;
  const rng = rngStream(state.seed, 'resequence', state.resequenceCount);
  const succeeded = rng() < plan.successChance;
  const mutated = succeeded && rng() < plan.mutationChance;

  // The donor's own numbers, if the vial carries them. Vials written before
  // R31 only stored a star average, so those are reconstructed to match it —
  // an older vial is worth what it always said it was worth.
  // COPY, do not alias. Taking the vial's own object and then applying a
  // mutation to it edits the banked sample in place — which is how a
  // 60-cycle abort loop walked a 3/3/3/3/3 donor up to 3/4/4/5/3 without
  // ever completing a run.
  const potential = { ...(plan.vial.potential ?? reconstructPotential(plan.stars, rng)) };
  const genotype = { ...(plan.vial.genotype ?? {}) };
  let mutationNote = null;
  if (mutated) {
    // The same three shapes breeding uses, so a mutation here reads as the
    // same phenomenon rather than a second unrelated system.
    const mutable = Object.values(content.traits ?? {});
    if (mutable.length && rng() < 0.5) {
      const trait = pick(rng, mutable);
      genotype[trait.id] = Math.min(2, (genotype[trait.id] ?? 0) + 1);
      mutationNote = `Resequencing artefact: a ${trait.name} gene that was not in the sample. The lab denies responsibility.`;
    } else {
      const stat = pick(rng, STATS);
      potential[stat] = Math.min(5, (potential[stat] ?? 3) + 1);
      mutationNote = `Resequencing artefact: a spontaneous ${stat.toUpperCase()} surge. Nobody planned this.`;
    }
  }

  state.inventory.vials = state.inventory.vials.filter((v) => v.id !== vialId);
  state.resequencer = {
    vialId,
    species: plan.vial.species,
    donorName: plan.vial.donorName,
    stars: plan.stars,
    startedAt: now,
    until: now + Math.round(plan.hours * HOUR),
    // The sample EXACTLY as it went in, kept separately from the outcome so
    // an abort returns what was banked. Writing the outcome back instead
    // would let a player abort-cycle a mutation into the vial for free —
    // they cannot see the roll, but the genome would still drift upward on
    // every aborted run, which is a ratchet nobody asked for.
    sample: { potential: { ...(plan.vial.potential ?? potential) }, genotype: { ...(plan.vial.genotype ?? {}) } },
    outcome: { succeeded, mutated, potential, genotype, mutationNote },
  };
  return { ok: true, plan, msg: content.resequencerLines?.start ?? 'The vial goes into the resequencer.' };
}

// Pulling the plug. The vial comes BACK — nothing has been done to it yet,
// and a cancel that ate it would make starting one a trap.
export function cancelResequence(state, content) {
  const run = state.resequencer;
  if (!run) return { ok: false, msg: 'The resequencer is empty.' };
  state.inventory.vials.push({
    id: run.vialId,
    species: run.species,
    donorName: run.donorName,
    stars: run.stars,
    extractedAt: run.startedAt,
    // The sample, not the outcome — see the note where `sample` is set.
    potential: { ...(run.sample?.potential ?? {}) },
    genotype: { ...(run.sample?.genotype ?? {}) },
  });
  state.resequencer = null;
  return { ok: true, msg: content.resequencerLines?.cancel ?? 'Resequencer drained.' };
}

// Elapsed effect, computed on load like every other timer. Returns wire
// lines rather than pushing them, so this module never learns what a news
// feed is.
export function tickResequencer(state, content, now) {
  const run = state.resequencer;
  if (!run || now < run.until) return { news: [], result: null };
  const lines = content.resequencerLines ?? {};

  if (!run.outcome.succeeded) {
    state.resequencer = null;
    return {
      news: [lines.failure ?? 'The resequencer produced nothing at all.'],
      result: { ok: false, donorName: run.donorName, species: run.species },
    };
  }

  // A full pen is not a failure. The run WAITS — losing a successful decant
  // to a housekeeping problem the player cannot see coming is exactly the
  // kind of surprise this project's house rules forbid.
  if (state.ranch.stock.length >= state.ranch.penCapacity) {
    return { news: [lines.penFull ?? 'It is ready and there is nowhere to put it.'], result: null, waiting: true };
  }

  const animal = createAnimal(state, run.species, content, now);
  animal.name = run.donorName;
  animal.potential = run.outcome.potential;
  animal.genotype = run.outcome.genotype;
  animal.traits = expressedTraits(animal.genotype, content);
  state.ranch.stock.push(animal);
  state.resequencer = null;

  const news = [run.outcome.mutated ? (lines.successMutated ?? 'The tank clears — something is different.')
                                    : (lines.success ?? 'The tank clears.')];
  if (run.outcome.mutationNote) news.push(run.outcome.mutationNote);
  return { news, result: { ok: true, animal, mutated: run.outcome.mutated, note: run.outcome.mutationNote } };
}

// A vial written before R31 stored only a star average. Rebuild five stats
// that average to it, so an old vial is worth exactly what it always said.
function reconstructPotential(stars, rng) {
  const target = Math.max(1, Math.min(5, stars));
  const base = Math.floor(target);
  const out = {};
  for (const stat of STATS) out[stat] = base;
  let remainder = Math.round((target - base) * STATS.length);
  const order = [...STATS];
  while (remainder > 0 && order.length) {
    const stat = order.splice(randInt(rng, 0, order.length - 1), 1)[0];
    out[stat] = Math.min(5, out[stat] + 1);
    remainder--;
  }
  return out;
}
