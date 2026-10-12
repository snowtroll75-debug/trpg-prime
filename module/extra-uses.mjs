/**
 * Feats that add daily uses to a class ability (Chapter 5).
 *
 * Three feats say the same sentence about three different abilities:
 *
 *   Extra Channels   "You can channel energy two additional times per day."
 *   Extra Mercy      "You can use Crusaders Mercy two additional times per day."
 *   Extra Wildshape  "You can Wildshape two additional times per day."
 *
 * All three shipped as a `featNote` effect reading *"…when the class
 * model lands"*. The class model landed some time ago; the note stayed.
 * This is the mechanism that replaces it.
 *
 * ONE ANSWER, NOT TWO. The daily maximum for an ability was computed in
 * two places — `itemUsesMax` for the sheet, and a second inline
 * `usesMax(...)` in the daily-preparation top-up loop. Two places
 * deciding one question is the defect shape that has cost this chapter
 * four bugs (the `prepared` stamp, the reload button, the orphan guard,
 * the BSB floor), so the bonus is not added twice: the daily-prep loop
 * now asks `itemUsesMax`, and `itemUsesMax` asks this.
 *
 * MATCHED BY THE ABILITY'S NAME, not by the feat's. That is what keeps
 * Wild Shape's bonus off the Shape Of The Animal SPELL, whose
 * `usesPerDay` the Wild Shape button writes as an already-summed
 * number — if this matched loosely, the two would compound and a Druid
 * would gain four uses for one feat. See `wildShapeDailyUses`
 * (druid.mjs) for where the Druid's copy of the bonus is actually
 * applied.
 *
 * COPIES COUNT. Nothing in the printed text forbids taking any of the
 * three twice, and a player who has spent two feat slots on Extra
 * Channels has bought four channels, not two. If a cap is ruled later
 * it belongs here, in `perCopy`'s neighbourhood, and nowhere else.
 */

const normalise = (name) => String(name ?? "").trim().toLowerCase();

/**
 * feat name (normalised) → the ability it feeds, and by how much.
 *
 * `ability` is matched against the ITEM'S OWN NAME, normalised, so a
 * world copy renamed in case or spacing still resolves.
 *
 * ALL THREE STAY LITERALS, and 3.384.0 decided that rather than
 * inherited it. `WILD_SHAPE_ABILITY` exists in magic/wildshape-feats.mjs
 * and four other call sites now read it, so the obvious tidy was to
 * import it here too — leaving Channels and Crusader's Mercy as bare
 * strings beside it. That trades a uniform table for a lopsided one, and
 * points a class-agnostic module at a magic-specific one to save a
 * single repetition.
 *
 * The protection those five names actually need is the same either way:
 * `verify-wildshape-vocabulary.mjs` opens the packs and fails if any of
 * these three abilities is not a real item. A pack check covers a
 * literal exactly as well as it covers a constant — which is the whole
 * reason the constant is worth anything.
 */
export const EXTRA_USES_FEATS = Object.freeze({
  "extra channels": Object.freeze({ ability: "Channels", perCopy: 2 }),
  "extra mercy": Object.freeze({ ability: "Crusader's Mercy", perCopy: 2 }),
  "extra wildshape": Object.freeze({ ability: "Wild Shape", perCopy: 2 })
});

/** The abilities any of these feats can feed, normalised. */
export const EXTRA_USES_ABILITIES = Object.freeze(
  [...new Set(Object.values(EXTRA_USES_FEATS).map((e) => normalise(e.ability)))]
);

/**
 * How many extra daily uses this actor's feats grant the named ability.
 *
 * @param {string[]} featNames  every feat name on the actor (duplicates included)
 * @param {string} abilityName  the ability item's own name
 * @returns {number} zero or more
 */
export function extraUsesBonus(featNames, abilityName) {
  // NO `if (!wanted) return 0` GUARD, and no clamp on `perCopy`. Both
  // were here and both were dead: an empty name matches no entry's
  // ability anyway, and `perCopy` is a frozen literal 2. A guard nothing
  // can reach is a guard no mutation can prove, and an unprovable line
  // is exactly what this chapter's harness rules exist to refuse.
  const wanted = normalise(abilityName);
  let total = 0;
  for (const name of Array.isArray(featNames) ? featNames : []) {
    const entry = EXTRA_USES_FEATS[normalise(name)];
    if (!entry) continue;
    // EXACT, NOT CONTAINED. A loose match would let Extra Mercy feed
    // anything with "Mercy" in its name, and Extra Wildshape feed a
    // "Greater Wild Shape" that is not the ability it names.
    if (normalise(entry.ability) !== wanted) continue;
    total += Math.floor(Number(entry.perCopy) || 0);
  }
  return total;
}

