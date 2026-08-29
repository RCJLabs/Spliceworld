// Guided onboarding (M7): the "Path to World Domination" checklist. Pure
// derivation from save state — no tutorial flags to migrate, no scripted
// cage. It renders until the first conquest, then retires itself.

export function onboardingSteps(state, content, now) {
  const caredOnce = state.ranch.stock.some((a) =>
    Object.values(a.lastCare ?? {}).some((t) => t > 0)
  );
  const extracted = state.inventory.tokenCount > 0;
  const spliced = state.chimeraCount > 0;
  const settledOne = state.chimeras.some((c) => now >= c.settleUntil);
  const conquered = state.campaign.heldNodes.length > 0;

  return [
    {
      label: 'Care for an animal',
      hint: 'Feed, groom, exercise, or enrich anything on the Ranch. Happy donors make better parts.',
      done: caredOnce,
    },
    {
      label: 'Graduate a donor',
      hint: 'Extract an animal on the Ranch — it becomes a DNA vial and parts. (Older + better-kept = higher grade.)',
      done: extracted,
    },
    {
      label: 'Splice a chimera',
      hint: 'Open the Splice tab, put vault parts on a frame (a head is mandatory), and hit SPLICE IT.',
      done: spliced,
    },
    {
      label: 'Let it settle',
      hint: 'Fresh chimeras need to settle in the Pens. Deploying early causes Rejection. Patience is a stat.',
      done: settledOne,
    },
    {
      label: 'Conquer the Old Barn Perimeter',
      hint: 'War tab → assault the first node with your settled chimera. The clipboards never stood a chance.',
      done: conquered,
    },
  ];
}

export function onboardingActive(state) {
  return state.campaign.heldNodes.length === 0;
}
