/**
 * Effects that depend on the TARGET'S saving-throw degree.
 *
 * NEW at 3.404.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE GAP THIS FILLS IS THE WIDEST ONE FOUND THIS WEEK: 115 spells in
 * the rulebook print a different outcome per degree, and the engine
 * flattened every one of them to a single result applied to whoever
 * failed.
 *
 * FEAR IS THE CLEAREST EXAMPLE, and it was wrong in BOTH directions:
 *
 *   Critical  The target is unaffected.
 *   Success   The target is frightened 1.
 *   Partial   the target is frightened 2.
 *   Failure   The target is frightened 3.
 *   Fumble    The target is frightened 4 and fleeing for 1 round.
 *
 * The pack carried one entry — `frightened 3` — applied to `spellSave.failed`.
 * So a target who SUCCEEDED took nothing at all, where the book says it is
 * still frightened 1; and a target who FUMBLED took 3 rather than 4 and
 * never fled. Rolling well was rewarded too much and rolling badly not
 * enough, from one flattened row.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BACKWARD COMPATIBLE ON PURPOSE. An effect with no `onSave` behaves
 * exactly as it always has — applied to the targets the caller passes,
 * which for a save spell is those who failed. Around a hundred spells
 * depend on that and none of them are touched. `onSave` is opt-in, and
 * only the spells that declare it change behaviour.
 *
 * THE DEGREES ARE READ FROM THE RESOLUTION TABLE, not listed here. This
 * project has been bitten twice this session by a second copy of a table
 * drifting from the first; `DEGREES` already knows every degree there
 * is, and a degree added later is valid here without this file changing.
 */

import { DEGREES, DEGREE_BY_KEY } from "../dice/resolution.mjs";

/** Every degree key a save can produce. */
export const SAVE_DEGREE_KEYS = Object.freeze(DEGREES.map((d) => d.key));

/** Is this a degree the resolution table knows? */
export function isDegreeKey(key) {
  return Object.hasOwn(DEGREE_BY_KEY, String(key ?? "").trim().toLowerCase());
}

/**
 * The degree keys an effect declares, normalised — or null when it
 * declares none.
 *
 * NULL AND EMPTY ARE DIFFERENT, and the difference matters. No `onSave`
 * at all means "not degree-gated" and the effect applies as it always
 * did. An `onSave` present but EMPTY means the author gated it and named
 * nothing, which can only be a mistake — an effect that applies on no
 * degree at all is a spell entry that does nothing, for ever, silently.
 * `verify-spell-degrees` refuses to let one ship.
 */
export function declaredDegrees(effect) {
  const raw = effect?.onSave;
  if (raw === undefined || raw === null) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((d) => String(d ?? "").trim().toLowerCase()).filter(Boolean);
}

/** Any key in `onSave` the resolution table does not know. */
export function unknownDegrees(effect) {
  return (declaredDegrees(effect) ?? []).filter((d) => !isDegreeKey(d));
}

/**
 * Does this effect apply to a target who rolled `degree`?
 *
 * AN UNGATED EFFECT ALWAYS APPLIES — the caller has already decided who
 * is in the list, and for a save spell that is the failures.
 *
 * A GATED EFFECT WITH AN UNKNOWN DEGREE DOES NOT APPLY. The alternative
 * is applying on a key nobody meant, and `verify-spell-degrees` makes an
 * unknown key impossible to ship, so being quiet here is safe in the one
 * way this project accepts: a check upstream has made the silent case
 * unreachable.
 */
export function effectAppliesOnDegree(effect, degree) {
  const declared = declaredDegrees(effect);
  if (declared === null) return true;
  return declared.includes(String(degree ?? "").trim().toLowerCase());
}

/** Is this effect gated on the save degree at all? */
export function isDegreeGated(effect) {
  return declaredDegrees(effect) !== null;
}

/**
 * The degree a gated effect list should be READ AT, given the degree a
 * target actually rolled.
 *
 * NEW at 3.405.0.
 *
 * THE HOLE THIS CLOSES IS THE FEAR BUG WEARING A DIFFERENT HAT. The
 * resolution table has SEVEN degrees; no printed ladder in the book names
 * more than five. Fear prints critical / success / partial / failure /
 * fumble, and says nothing about `heroic` or `blunder` — so once 3.404.0
 * gated its effects on the five it names, a target who BLUNDERED the save
 * (margin −20 or worse, the single worst roll in the game) matched no
 * effect at all and walked away untouched, while the target beside them
 * who merely fumbled was frightened 4 and fleeing.
 *
 * Rolling worse than the worst printed outcome made you SAFER. That is
 * the same defect 3.404.0 existed to remove — rolling badly rewarded —
 * surviving one rung below where anyone thought to look.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULE TURNS ON WHETHER THE ROLL SAVED (revised 3.493.0).
 *
 * Until then there was one rule for every gap — read at the lowest-ranked
 * declared degree at or above the roll — on the reasoning that "a ladder
 * that skips a rung should not be read as an invitation to punish".
 *
 * DRIVING SILENT BINDING SHOWED WHAT THAT COST. Toben rolled a Partial
 * (14 vs 16), the card printed *"is affected"*, and the SUCCESS rung
 * fired — one round instead of one minute. Worse, four spells declared
 * only rungs BELOW a Partial, so nothing was at-or-above, the fallback
 * matched nothing, and the effect applied to NOBODY: Bane, Charm Undead,
 * Alluring Caress and Surge Of The Tempest all did nothing at all on a
 * Partial save.
 *
 * Graham's ruling, 4 September 2026: an unnamed degree reads at the
 * nearest rung that is NO BETTER for the target. The degree table already
 * said so — `partial` is `success: false`, so a Partial is not a save and
 * must not be read at a save's rung.
 *
 * SO THE TWO SIDES ARE NOT SYMMETRICAL, because saving and failing are
 * not symmetrical:
 *
 *   THE ROLL SAVED, and the spell does not name it → NOTHING APPLIES.
 *     Unchanged, and it is how "Critical: the target is unaffected" is
 *     represented: by the absence of a row. Silent Binding names
 *     `success` and not `critical`, so a Critical takes nothing while a
 *     Success takes one round. `heroic` above every rung is the same
 *     case — beating the best printed outcome should beat it.
 *
 *   THE ROLL FAILED → IT ALWAYS LANDS SOMEWHERE. The nearest declared
 *     rung that is no better; and if every declared rung is milder than
 *     the roll, the WORST of them, so a Blunder cannot fall off the
 *     bottom of a ladder that stops at Fumble.
 *
 *   blunder  below every rung → the bottom rung, `fumble`. Unchanged.
 *   partial  Silent Binding → `failure`, one minute. REVERSED.
 *   partial  Bane, which names only failure and fumble → `failure`,
 *            where it previously matched nothing whatsoever.
 *   heroic   above every rung → nothing. Unchanged.
 *
 * `prison.mjs` already answered this question the ruled way — its
 * `DEGREE_FALLBACK` has read `partial: "failure"` since it was written —
 * so the two agree on it now rather than contradicting each other. They
 * still differ on `heroic`, because a prison ladder must name all four
 * printed degrees and clamps to `critical`; this one may be asked about a
 * ladder with gaps and answers "nothing" instead. `verify-spell-degrees`
 * holds them against each other so the difference stays deliberate.
 *
 * AN UNGATED LIST IS RETURNED UNCHANGED — but by the ordinary path, not
 * by a special case. The first version opened with
 *
 *   if (!declared.length) return rolled;
 *
 * and `mutate-spell-degrees` proved it dead: deleted, every check still
 * passed, because an empty `declared` makes the loop below run zero
 * times, leaves `best` null, and returns the rolled degree anyway. The
 * guard read like the safety rail for the hundred-odd ungated spells and
 * was in fact the seventh piece of unreachable protection removed this
 * week. A guard nothing can reach is a guard no mutation can prove, and
 * one that cannot be proved is one nobody should trust.
 *
 * @param {object[]} effects every effect of the spell
 * @param {string} rolled the degree key the target actually rolled
 * @returns {string} the degree key to read the ladder at
 */
/**
 * WHETHER THIS SPELL'S SAVE IS A BASIC ONE — and therefore whether its
 * `onSave` rows are ladder rungs at all.
 *
 * NEW at 3.493.0, and it is what stops the ruling above from breaking a
 * spell it was never about.
 *
 * SURGE OF THE TEMPEST is the only spell in the pack with a Basic save
 * and a gated row, and its sentence is not a ladder:
 *
 *   "The target must make a basic Reflex save to partially avoid the
 *    effects. IN THE EVENT OF A FUMBLE, the target is not only struck
 *    with the damaging electricity but ALSO becomes temporarily dazzled."
 *
 * "Not only … but also" is an ADDITION on one named degree, not a rung
 * of a ladder with gaps to fill. A basic save's degrees already govern
 * the thing they govern — the damage, halved or negated — so a row hung
 * off one of them means exactly that degree and no other. Reading a
 * Failure at the Fumble rung would dazzle on a roll the book never
 * dazzles on.
 *
 * DERIVED FROM THE PRINTED SAVE rather than from a flag on the row,
 * because it is a fact about the spell that is already written down. A
 * flag would have to be remembered by every future author of a basic-save
 * spell, and forgotten once is a rider quietly becoming a ladder.
 *
 * @param {string} defence the spell's printed `defence` field
 */
export function isBasicSave(defence) {
  return /\bbasic\b/i.test(String(defence ?? ""));
}

export function effectiveSaveDegree(effects, rolled, { basicSave = false } = {}) {
  const declared = gatedDegrees(effects);
  const key = String(rolled ?? "").trim().toLowerCase();
  if (declared.includes(key)) return key;

  const self = DEGREE_BY_KEY[key];
  if (!self) return key;

  /*
   * A HEROIC SAVE READS AT A PRINTED CRITICAL RUNG (3.609.0).
   *
   * Graham, 1 October 2026, widening his Speak With Dead ruling of 30
   * September ("heroic should also haunt the caster") to every spell:
   * "yes to the second question". The page prints four rungs and the
   * system rolls seven, and a Heroic is a better Critical — so where the
   * spell names what a Critical does and says nothing of Heroic, the
   * Heroic gets that. Before this a Heroic matched no row and escaped
   * altogether, which made the best possible save on Word Of Blinding
   * the only one that was not dazzled.
   *
   * MEASURED: sixteen spells gate a row on `critical` without `heroic`,
   * all of them non-basic saves. A spell that names Heroic itself keeps
   * its own rung, because a declared degree is returned above.
   */
  if (key === "heroic" && declared.includes("critical")) return "critical";

  // A SAVE THE SPELL DOES NOT NAME IS A SAVE THAT ESCAPED IT. Returning
  // the rolled key unchanged matches no `onSave` and so applies nothing,
  // which is exactly how an "unaffected" rung is written: as no row.
  //
  // A `heroic` AGAINST A SPELL THAT PRINTS NO CRITICAL RUNG lands here
  // too, and applies nothing; the ungated case still returns the rolled
  // degree by the ordinary path rather than a guard.
  if (self.success) return key;

  // A FAILURE ALWAYS LANDS SOMEWHERE, and on the harsher side of the gap.
  let nearest = null;   // the highest-ranked rung that is no better
  let worst = null;     // the lowest-ranked rung of any
  for (const name of declared) {
    const entry = DEGREE_BY_KEY[name];
    if (!entry) continue;
    if (entry.rank <= self.rank && (nearest === null || entry.rank > nearest.rank)) nearest = entry;
    if (worst === null || entry.rank < worst.rank) worst = entry;
  }
  /*
   * A RIDER IS CLAMPED FROM BELOW AND NEVER FILLED FROM ABOVE.
   *
   * "In the event of a fumble … also becomes dazzled" applies on a
   * Fumble and on anything WORSE than one — a Blunder is a worse Fumble,
   * and letting it fall off the bottom would make the worst roll in the
   * game safer than the second worst, which is the defect the clamp
   * exists for. But a FAILURE is better than a Fumble, and nothing in
   * that sentence reaches up to it.
   *
   * So a rider takes the `worst` clamp and not the `nearest` fill. That
   * is the whole difference between it and a ladder, and it is why this
   * is a parameter rather than two functions: everything else about
   * reading a degree is identical.
   */
  if (basicSave) return worst && self.rank < worst.rank ? worst.key : key;

  // `worst` catches a roll below every rung — a Blunder against a ladder
  // that stops at Fumble. With nothing declared at all both stay null and
  // the rolled degree comes back, which is the ungated path.
  return (nearest ?? worst)?.key ?? key;
}

/**
 * The recipients of one effect, given every target that rolled.
 *
 * `saveResults` is `spellSave.results` — `[{target, degree, saved}]`,
 * which the cast workflow already builds and, before this, threw away
 * everything but `saved`.
 *
 * WHY A GATED EFFECT NEEDS THE FULL LIST rather than the failures. The
 * whole point is that a target who SUCCEEDED can still be affected —
 * Fear's success is "frightened 1". Handing this only the failures would
 * reproduce the bug it exists to fix, one layer down.
 *
 * @param {object} effect
 * @param {Array<{target:object, degree:string}>} saveResults
 * @param {object[]} fallbackTargets used when the effect is not gated
 * @returns {object[]} the actors this effect applies to
 */
/**
 * WHO A `self` ROW REACHES ONCE ITS SPELL HAS BEEN GIVEN REACH (3.534.0).
 *
 * A row targeting `self` has always gone to the caster and nowhere else,
 * which was right while a spell with no range and no area WAS the caster.
 * 3.532.0 made that silence explicit, and six warps in the pack then read
 * as buying something the applier had no way to deliver: they grant a
 * range or an area to a spell whose only row says `self`, so the warp
 * charged its PP and the effect stayed on the caster.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO MODS, BECAUSE THE PACK SAYS TWO THINGS.
 *
 * Graham ruled on 8 September 2026 that these follow the wording of each
 * warp rather than share one flag, and reading them shows why:
 *
 *   Jump              "the target CHANGES to one touched creature"
 *   Loremasters Edge  "TARGET AN ALLY within 30 feet"
 *
 * versus
 *
 *   Hunter's Veil     "affects ALL ALLIES within 30 feet"
 *   Prescience        "YOU affect all allies in a 20-foot radius"
 *   Confounded Imagery "affecting ALL TARGETS within"
 *   Concealing Terrain "gains a 15-foot radius centred on YOU"
 *
 * The first pair MOVES the effect off the caster — "changes to" and
 * "target an ally" both name a different creature instead. The second
 * four SHARE it — "all allies", and Prescience and Concealing Terrain say
 * "you" outright. One flag for both would have to pick a side, and would
 * be wrong four times or twice.
 *
 * NEITHER MOD INVENTS A RECIPIENT. Both work from whoever the spell
 * actually reached, so the range gate and the area's own filters still
 * decide who is eligible — this only answers what a `self` row does with
 * that list.
 *
 * @param {Actor} caster
 * @param {Array} reached everyone the spell reached this cast
 * @param {object} warpMods aggregated warp mods
 * @returns {Array} the row's recipients
 */
export function selfRowRecipients(caster, reached, warpMods = {}) {
  const others = (Array.isArray(reached) ? reached : []).filter(Boolean);
  // THE TARGET CHANGES. If the warp moved the effect and the cast reached
  // nobody, that is a cast with no recipient — NOT a silent fallback to
  // the caster, which would hand somebody a buff they had spent PP to
  // give away.
  if (warpMods?.retargetSelfRows) return others;
  if (!warpMods?.shareSelfRows) return caster ? [caster] : [];
  // SHARED, AND THE CASTER IS NOT COUNTED TWICE. An area with no range
  // centres on the caster, so they are usually already in `reached`.
  return caster ? [caster, ...others.filter((t) => t !== caster)] : others;
}

export function recipientsForEffect(effect, saveResults, fallbackTargets = []) {
  if (!isDegreeGated(effect)) return fallbackTargets;
  return (Array.isArray(saveResults) ? saveResults : [])
    .filter((r) => effectAppliesOnDegree(effect, r?.degree))
    .map((r) => r?.target)
    .filter(Boolean);
}

/**
 * Every degree some effect in this list gates on.
 *
 * Used by the harness to check a spell covers its printed ladder — a
 * spell that names four outcomes and gates on three has lost one.
 */
export function gatedDegrees(effects) {
  const seen = new Set();
  for (const effect of Array.isArray(effects) ? effects : []) {
    for (const degree of declaredDegrees(effect) ?? []) seen.add(degree);
  }
  return [...seen];
}
