/**
 * The PP a cast's effects are counteracted at (Graham's U3, 26 Nov 2026).
 *
 * "When you heighten a spell, you are increasing its raw power level which
 * makes it more difficult to dispel (and potentially resist)." Graham: "Yes,
 * it should also affect dispel and counteract." A counteract is "modified by
 * +/-2 for each level or PP difference between your counteract action and
 * that of the effect" (Chapter 8), so a heightened cast's effects stand at
 * the caster's MAXIMUM castable PP, as its Save DC does.
 *
 * And every other cast's effects at the PP they were cast at, which until
 * now the Counteract dialog left at 0 for the table to remember. A CANTRIP
 * at the PP its caster can cast (page 236: cantrips "are always treated as
 * the PP that you are able to cast for counteract purposes") — the dialog
 * already applied that to the ACTING side; this is the other side.
 *
 * HOW IT REACHES THE EFFECT. Each effect a cast lays carries its `castId`;
 * the cast notes its power here under that id, and the effect's data is
 * stamped with `counteractAs: { pp }` (the flag `counteractAsOf` in
 * held-conditions.mjs already reads, for a symbol's curse) on the caster's
 * client — in `createEffectsOn` before a relay, and by the
 * `preCreateActiveEffect` hook for an effect created directly. A stamp the
 * effect already carries (a symbol's own) is never replaced.
 */

const NOTED = new Map();
const KEEP = 40;

/** The counteract PP of a cast. Pure. */
export function castCounteractPP({ totalPP = 0, cap = 0, heightened = false, cantrip = false } = {}) {
  const spent = Math.max(0, Math.trunc(Number(totalPP) || 0));
  const max = Math.max(0, Math.trunc(Number(cap) || 0));
  return heightened || cantrip ? Math.max(spent, max) : spent;
}

/** Remember a cast's counteract PP by its castId (the newest KEEP casts). */
export function noteCastPower(castId, pp) {
  if (!castId) return;
  NOTED.delete(castId);
  NOTED.set(castId, Math.max(0, Math.trunc(Number(pp) || 0)));
  while (NOTED.size > KEEP) NOTED.delete(NOTED.keys().next().value);
}

/**
 * The stamp for one effect's data, or null: an effect of a noted cast that
 * carries no `counteractAs` of its own. Pure apart from the note above.
 */
function castPowerStamp(effectData, systemId = "trg-prime") {
  const flags = effectData?.flags?.[systemId];
  const castId = flags?.castId;
  if (!castId || flags?.counteractAs) return null;
  // ONE FLOOR: a cast never noted has no PP here, and no PP is no stamp.
  const pp = NOTED.get(castId) ?? 0;
  return pp > 0 ? { pp } : null;
}

/** Stamp an array of effect data in place (before a relay). Returns it. */
export function stampCastPower(effects, systemId = "trg-prime") {
  for (const data of Array.isArray(effects) ? effects : []) {
    const stamp = castPowerStamp(data, systemId);
    if (stamp) data.flags[systemId].counteractAs = stamp;
  }
  return effects;
}

/** The hook for an effect this client creates directly. */
export function registerCastPowerHooks(systemId = "trg-prime") {
  globalThis.Hooks?.on?.("preCreateActiveEffect", (effect, data) => {
    const stamp = castPowerStamp(data, systemId);
    if (stamp) effect.updateSource({ [`flags.${systemId}.counteractAs`]: stamp });
  });
}
