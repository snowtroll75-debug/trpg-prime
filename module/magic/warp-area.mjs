/**
 * A WARP THAT CHANGES THE AREA.
 *
 * NEW at 3.445.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT, FOUND BY CASTING IT.
 *
 * Graham asked on 31 August 2026 whether Dark Tendrils' warping options
 * worked. Two of its three do exactly what `spell-warp.mjs` documents for
 * a qualitative option: spend the PP, print the text, leave the rest to
 * the GM. The third printed this, on one line of one card:
 *
 *   "Warped — +1 PP: THE AREA BECOMES A 15-FOOT CONE INSTEAD OF A LINE.
 *    … Area: 30 FT LINE template placed — caught 2: Ally, Enemy."
 *
 * The Region created was `shape: "line"`. The player paid a PP, the
 * Casting DC and the Save DC both rose with it, and the area was exactly
 * what it had always been — while the card asserted both things at once.
 *
 * THAT IS NOT THE QUALITATIVE CASE. A warp about the area is not "text
 * for the GM to apply" the way a heal or a rider is, because the system
 * DRAWS the area and NAMES it. `spell-warp.mjs` records the same lesson
 * from `freezeMembership`: "the option is offered, the PP is charged, the
 * card says it was warped, and nothing happens."
 *
 * ─────────────────────────────────────────────────────────────────────
 * EIGHT SPELLS, MEASURED, NOT GUESSED.
 *
 * 478 of the pack's 702 warps carry no `mods`, which is the design. The
 * ones that matter are those whose text changes an area the system
 * actually templates — nine by text, of which **eight** place a real
 * template:
 *
 *   GROWTH   Ember Of Devotion, Flare, Forbiddance, Radiant Aegis,
 *            Verdant Snare, Wellspring Of Valour
 *   OVERRIDE Dark Tendrils (line → 15-foot cone),
 *            Wash Away Sin (15-foot cone → 30-foot)
 *
 * SNAGGING PIT IS THE NINTH AND IS DELIBERATELY NOT HERE. Its area reads
 * "5-foot square, 10-foot pit", which carries no shape word `parseSpellArea`
 * knows, so it places NO template at all — there is nothing for a warp to
 * change until the spell itself is given an area the system can draw.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TEXT IS REWRITTEN, NOT THE PARSED SHAPE.
 *
 * Everything downstream — `parseSpellArea`, `placeSpellTemplate`,
 * `describeArea`, the card's own sentence — already works from the area
 * STRING. So a warp produces a new string and not one of them has to
 * learn that warping exists. It also means the card's "Area: …" clause is
 * generated from the same value the template was, so the two cannot
 * disagree again the way they just did.
 */

/** The distance and its unit at the front of an area string. */
const FIRST_DISTANCE = /(\d+(?:\.\d+)?)(\s*[-\s]?\s*(?:foot|feet|ft|’|'))/i;

/**
 * The area this cast actually has, after its warps.
 *
 * @param {string} areaText the spell's printed area
 * @param {object} mods     the aggregated warp mods
 * @returns {string} the effective area string — the original when nothing
 *   warped it, so a spell with no area warp is byte-for-byte unchanged
 */
/**
 * Who an area catches, after its warps.
 *
 * NEW at 3.529.1... (3.530.0). `areaTargeting` is a SPELL-LEVEL field —
 * "all", "allies" or "enemies" — and until now nothing could change it.
 * That was fine while every area warp said "all creatures", and wrong the
 * moment one said otherwise:
 *
 *   Aid, "+3 PP: effect all allies in a 10-foot radius"
 *
 * Aid is `areaTargeting: "all"`, so an area override alone would have let
 * a 10-foot Aid hand temporary HP and a +1 to attack to every ENEMY
 * standing near the target. A warp that buffs the people you are fighting
 * is worse than a warp that does nothing, which is why this exists rather
 * than the six-word data fix that would have shipped without it.
 *
 * AN OVERRIDE WINS OUTRIGHT and is not multiplied by anything, exactly as
 * `areaOverride` beside it: "all allies" is true or it is not.
 *
 * @param {string} printed the spell's own `areaTargeting`
 * @param {object} mods aggregated warp mods
 * @returns {"all"|"allies"|"enemies"}
 */
export function warpedAreaTargeting(printed, mods = {}) {
  const override = String(mods?.areaTargetingOverride ?? "").trim().toLowerCase();
  if (override === "all" || override === "allies" || override === "enemies") return override;
  // ANYTHING ELSE IS NOT AN ANSWER, and falls through to the spell's own
  // — a typo in a fix must not quietly widen an area to everyone.
  const base = String(printed ?? "").trim().toLowerCase();
  return base === "allies" || base === "enemies" ? base : "all";
}

export function warpedAreaText(areaText, mods = {}) {
  const base = String(areaText ?? "");

  // AN OVERRIDE WINS OUTRIGHT, and taking it twice buys nothing — the
  // same shape as `freezeMembership`, for the same reason: "the area
  // becomes a 15-foot cone" is true or it is not.
  const override = String(mods?.areaOverride ?? "").trim();
  if (override) return override;

  const growth = Math.max(0, Math.trunc(Number(mods?.areaGrowth) || 0));
  if (!growth || !base.trim()) return base;

  const match = base.match(FIRST_DISTANCE);
  // A PROSE AREA IS LEFT ALONE. If there is no distance to grow, the honest
  // answer is the printed text rather than a number invented beside it.
  if (!match) return base;

  const from = Number(match[1]);
  const cap = Number(mods?.areaMax);
  let to = from + growth;
  // THE CAP NEVER SHRINKS AN AREA. A warp is something bought; a cap
  // authored below a spell's own printed area would otherwise turn a
  // purchase into a penalty, which is the "a waiver is a discount, never
  // a rebate" rule this project has met before in another guise.
  if (Number.isFinite(cap) && cap > 0) to = Math.min(to, Math.max(from, cap));
  if (to === from) return base;

  return base.slice(0, match.index) + String(to) + match[2]
    + base.slice(match.index + match[0].length);
}

/**
 * How many times an area-growth warp can sensibly be bought.
 *
 * FROM THE SPELL'S OWN AREA, because the cap is an absolute size and not
 * a bonus total: "increase the radius by 10-foot (max 50 feet)" is four
 * purchases from a 10-foot emanation and three from a 20-foot one. The
 * bonus-cap arithmetic in `spell-warp.mjs` cannot answer that, since it
 * never sees the spell.
 *
 * @param {object} mods     one warp's declared mods
 * @param {string} areaText the spell's printed area
 * @returns {number} at least 1
 */
export function areaGrowthMaxTimes(mods, areaText) {
  const growth = Math.max(0, Math.trunc(Number(mods?.areaGrowth) || 0));
  if (!growth) return 1;
  const cap = Number(mods?.areaMax);
  if (!Number.isFinite(cap) || cap <= 0) return 1;
  const match = String(areaText ?? "").match(FIRST_DISTANCE);
  if (!match) return 1;
  const from = Number(match[1]);
  // ONE FLOOR, NOT TWO. This had a `if (!(cap > from)) return 1;` guard
  // above for an area already at or past its ceiling — and a mutation
  // that deleted it SURVIVED, because `Math.max(1, …)` already answers
  // that case (a cap of 50 on a 50-foot area divides to 0, a smaller cap
  // to a negative). A duplicated rule is a rule that cannot be tested;
  // the same shape `scrollSpellCandidates` had, and removed for the same
  // reason. The floor below is the one that carries it.
  return Math.max(1, Math.ceil((cap - from) / growth));
}

/**
 * Does this printed note restate the spell's own area?
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO PLACES STATING ONE NUMBER, and a warp is what makes them disagree.
 *
 * Ember Of Devotion's note read "10-ft aura (allies only) that also sheds
 * dim light" — true, and matching its printed "10-foot emanation"
 * exactly, until 3.445.0 let a warp grow that emanation. Cast with the
 * +2 PP radius option in Graham's world on 31 August 2026, the card said
 * "Area: 20 ft emanation (allies only) template placed" and, four lines
 * below, "10-ft aura (allies only)". One card, one circle, two answers —
 * which is the defect this whole release exists to end, arriving through
 * the door nobody was watching.
 *
 * THE NUMBER CAME OUT OF THE NOTE rather than being made to follow the
 * warp. The card already prints the radius of the template it actually
 * placed, so a note repeating it was redundant before warping could
 * touch it and wrong afterwards.
 *
 * THIS IS THE RATCHET, not the fix. It exists so the next note authored
 * with a distance matching its spell's area fails a check rather than a
 * session — the same job `verify-emanation`'s mod-key cross-check does
 * one layer down.
 *
 * @param {string} areaText the spell's printed area
 * @param {string} noteText one printed note
 * @returns {boolean}
 */
export function noteRestatesArea(areaText, noteText) {
  const area = String(areaText ?? "").match(FIRST_DISTANCE);
  if (!area) return false;
  const note = String(noteText ?? "").match(FIRST_DISTANCE);
  if (!note) return false;
  return Number(note[1]) === Number(area[1]);
}
