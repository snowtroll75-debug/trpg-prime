/**
 * SPELL RANGE (3.519.0) — how far a spell reaches, and whether the
 * creature you aimed it at is inside that.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOTHING CHECKED IT. Measured before building: every spell in the pack
 * carries a printed `range`, and the only things that ever read it were
 * a Cure feat's ranged/melee split, area template placement, and Reach
 * Spell's eligibility test. No distance was ever compared to it, so a
 * TOUCH spell landed on a creature across the room and a 30-foot spell
 * landed at two hundred feet.
 *
 * A WEAPON ALREADY REFUSES. `attack-workflow.mjs` has done this for
 * melee reach and for range increments since long before this release:
 *
 *   "Toben is 40 ft away — beyond Longsword's reach (max 10 ft)."
 *
 * So this is not a new kind of rule, it is the same rule reaching the
 * other half of the game. The wording, the refusal, and the decision to
 * name the distance rather than only the verdict are all copied
 * deliberately from there.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TOUCH IS THE CASTER'S OWN REACH, and that needed no new ruling: it is
 * what `meleeReach` already means for a weapon with no reach trait —
 * `system.combat.reach`, defaulting to 5 feet. A Large caster with a
 * 10-foot reach touches at ten feet, exactly as they punch at ten feet.
 * 142 spells in the pack print "touch", so getting this from the
 * existing rule rather than inventing a constant matters.
 *
 * WHAT IS DELIBERATELY NOT GATED. Spells printing "varies", "see text",
 * "planetary" or "unlimited" reach as far as they like. A range nothing
 * can READ is not a range of zero — it is the absence of a limit to
 * enforce, and guessing one would refuse casts the book permits. That is
 * the same rule `castTimeAP` follows for a cast time it cannot parse, and
 * the same one `parseApCost` has always followed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AN EMPTY RANGE IS NO LONGER ONE OF THEM (3.532.0).
 *
 * That paragraph used to cover the 217 spells printing NO range at all,
 * and for 68 of them it still does — a blank range beside a printed AREA
 * is the area speaking. For the other 149, printing neither a range nor
 * an area, Graham ruled on 8 September 2026 that the silence is a
 * statement: they affect the caster. `effectiveRangeText` is that rule,
 * and it is the difference between a value that cannot be read and one
 * that is empty. Live testing found the old behaviour let Shield Of Faith
 * — no range, no area — land on an ally seven feet away, and its own warp
 * reading "increase the range to touch" change nothing at all.
 *
 * NOR IS A CAST WITH NOTHING TO MEASURE. Both tokens have to be on the
 * canvas; a spell cast off-scene, or on an actor with no token, is not
 * refused for a distance nobody could measure. `attack-workflow.mjs`
 * calls that condition `positional` and this file means the same thing.
 */

import { parseRangeFeet } from "./spell-template.mjs";

/** The reach a creature touches at when its sheet says nothing. */
export const DEFAULT_REACH = 5;

/*
 * THERE WAS A LIST OF UNGATED WORDS HERE — "self", "personal", "varies",
 * "see text", "planetary", "unlimited" — and `mutate-spell-range` U2
 * showed it decided nothing. `parseRangeFeet` already refuses "self" and
 * "personal" by name, and every other word on the list contains no digit,
 * so it returns null for all of them anyway.
 *
 * THE NINTH DEAD GUARD, deleted rather than defended. The behaviour is
 * unchanged and section U of the check still pins every one of those
 * words, because what must stay true is the ANSWER, not the branch that
 * used to give it.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/**
 * How far a caster may touch. Read off the same field a melee weapon
 * reads, so the two can never disagree.
 *
 * @param {object} actorSystem the caster's `system`
 * @returns {number} feet
 */
export function touchReach(actorSystem) {
  return Math.max(1, Number(actorSystem?.combat?.reach ?? DEFAULT_REACH) || DEFAULT_REACH);
}

/**
 * The furthest this spell may reach, in feet — or null when there is no
 * limit to enforce.
 *
 * NULL RATHER THAN INFINITY. A caller has to be able to tell "this spell
 * reaches everywhere" from "this spell reaches 500 feet", because only
 * one of them produces a refusal, and a number that is merely very large
 * would still refuse something eventually.
 *
 * @param {string} rangeText the spell's printed (or warped) range
 * @param {number} reach the caster's touch reach
 * @returns {number|null}
 */
export function spellRangeFeet(rangeText, reach = DEFAULT_REACH) {
  const t = String(rangeText ?? "").trim();
  if (!t) return null;
  // SELF IS A RANGE OF ZERO, NOT AN ABSENT ONE (3.532.0). It used to
  // fall through to `parseRangeFeet`, which refuses "self" by name and
  // answers null — and null means "no limit to enforce", so a spell that
  // said it only affected the caster reached anybody on the board.
  //
  // No spell in the pack PRINTS "self" today, so this branch changes
  // nothing on its own. It exists because `effectiveRangeText` below now
  // produces the word, and the two have to agree about what it means.
  if (/^(self|personal)$/i.test(t)) return 0;
  if (/^touch$/i.test(t)) return Math.max(1, int(reach) || DEFAULT_REACH);

  // HYPHENS AND THE WORD "RANGE" ARE STRIPPED FIRST. The pack contains
  // "30-feet" exactly once, and `parseRangeFeet` reads its number only
  // when a space or nothing separates it from the unit — so that one
  // spell would have been silently ungated by a typo. Normalising here
  // rather than editing one row keeps the next such row working too.
  // AND NO `> 0` TEST ON THE WAY OUT. `parseRangeFeet` ends with
  // `d > 0 ? d : null`, so a non-positive distance never leaves it —
  // `mutate-spell-range` R2 proved the second test decided nothing.
  // The tenth dead guard.
  return parseRangeFeet(t.replace(/-/g, " "));
}

/**
 * THE RANGE A SPELL ACTUALLY HAS, once silence is read as a statement.
 *
 * NEW at 3.532.0, and it reverses a decision this file made deliberately.
 * The header above still says why the old one was reasonable: "A range
 * nothing can read is not a range of zero — it is the absence of a limit
 * to enforce, and guessing one would refuse casts the book permits."
 *
 * THAT WAS TRUE OF AN UNREADABLE RANGE AND WRONG ABOUT AN EMPTY ONE, and
 * the difference is the area beside it. Graham, 8 September 2026:
 *
 *   "Spells that have no range or area affect the caster. So if a
 *    warping option increases that to a range (such as touch) then it
 *    gains that range with the warping option."
 *
 * So a spell printing NEITHER a range NOR an area is not missing its
 * range — it is saying the caster, in the way the book says it. 149
 * spells in the pack are that shape. Measured before building: 51 of
 * their effect rows target `self` and exactly TWO target `targets` —
 * Invisibility and Shield Of Faith — so this refuses almost nothing that
 * anybody is casting, and both exceptions have a warp that grants them a
 * range, which is the point.
 *
 * A BLANK RANGE WITH AN AREA IS UNTOUCHED (68 spells). An emanation
 * centred on the caster reaches whatever its template covers; its silence
 * about range is the area speaking, not the caster.
 *
 * AND "varies", "see text", "planetary" AND "unlimited" STAY UNGATED.
 * They are unreadable rather than empty, which is the case the old
 * paragraph was actually about, and it is still right about them.
 *
 * @param {string} rangeText the printed (or warped) range
 * @param {string} areaText the printed (or warped) area
 * @returns {string} the range text to gate on
 */
export function effectiveRangeText(rangeText, areaText) {
  const r = String(rangeText ?? "").trim();
  const a = String(areaText ?? "").trim();
  return !r && !a ? "self" : String(rangeText ?? "");
}

/**
 * Is this target too far for the spell?
 *
 * NEITHER A MISSING DISTANCE NOR A MISSING LIMIT IS A REFUSAL — but only
 * one of them needs saying, and which one is the whole point. See the
 * comments in the body.
 *
 * @param {number|null} distanceFeet
 * @param {number|null} maxFeet
 * @returns {boolean}
 */
export function outOfSpellRange(distanceFeet, maxFeet) {
  // A RANGE WITH NO LIMIT IS NEVER EXCEEDED, and this half has to be
  // said out loud: `50 > null` is TRUE in JavaScript, so without it
  // every one of the 217 spells that print no range at all would refuse
  // every target on the board.
  if (!Number.isFinite(maxFeet)) return false;
  // AND NO GUARD ON THE DISTANCE, deliberately. A null, undefined or NaN
  // distance is a cast with nothing to measure, and every one of those
  // compares FALSE against any number — the comparison already gives the
  // right answer. The first draft guarded it anyway; that would have
  // been the NINTH dead guard this project has had to delete, and the
  // eighth was found only last release by a mutation surviving.
  return distanceFeet > maxFeet;
}

/**
 * The spell's range after warping.
 *
 * ONE KEY, BECAUSE ALL 25 INERT ONES SET. Every range warp that shipped
 * with `mods: {}` names a new range — "increase the range to 30 feet",
 * "the range becomes touch", "increase the link range to unlimited". So
 * this is an override in the shape of `areaOverride`, not a count in the
 * shape of `areaGrowth`, and buying it twice names the same range twice.
 *
 * ONE WARP IN THE PACK DOES SAY "+5 FEET", and it is not in that set
 * because it was already non-empty: Slide's "+1 PP: the range increases
 * by 5 feet", carrying `bonusValue: 5`. It is NOT evidence that this key
 * should be a count — it is a warp pointed at the wrong thing. Slide's
 * printed `range` is "touch"; the thirty feet its warp lengthens is the
 * SLIDE DISTANCE in its description, which the spell does not model
 * (`effects: []`). And `bonusValue` is read by sacrificing-shield,
 * magic-stone, spell-conditional and slot-choice — none of them Slide,
 * so the number is aggregated and then read by nobody. Recorded rather
 * than fixed here: the distance a creature is teleported is its own
 * unbuilt mechanism, not this channel.
 *
 * @param {string} rangeText the printed range
 * @param {object} warpMods aggregated warp mods
 * @returns {string}
 */
export function warpedRange(rangeText, warpMods = {}) {
  const over = warpMods?.rangeOverride;
  return over === undefined || over === null || over === ""
    ? String(rangeText ?? "")
    : String(over);
}

/**
 * How the range reads on a card. "touch" says how far touch actually
 * reached, because a refusal that says "beyond touch (max 10 ft)" is
 * answerable and one that says "beyond touch" is an argument.
 *
 * @param {string} rangeText
 * @param {number} reach
 * @returns {string}
 */
export function rangeLabel(rangeText, reach = DEFAULT_REACH) {
  const t = String(rangeText ?? "").trim();
  if (!t) return "";
  if (/^touch$/i.test(t)) return `touch (${Math.max(1, int(reach) || DEFAULT_REACH)} ft)`;
  return t;
}

/**
 * The line refusing a target that is out of range. Names the creature,
 * the distance and the limit — the three facts the weapon refusal names,
 * in the same order, because a player who has read one should not have
 * to learn a second format.
 *
 * @param {string} spellName
 * @param {string} targetName
 * @param {number} distanceFeet
 * @param {string} rangeText
 * @param {number} reach
 * @returns {string|null}
 */
export function outOfRangeLine(spellName, targetName, distanceFeet, rangeText, reach = DEFAULT_REACH) {
  const spell = String(spellName ?? "").trim();
  const who = String(targetName ?? "").trim();
  const max = spellRangeFeet(rangeText, reach);
  if (!spell || !who || max === null || !Number.isFinite(distanceFeet)) return null;
  // NO "(max N ft)" SUFFIX (3.519.1). It was there to copy the weapon
  // refusal — "beyond Longsword's reach (max 10 ft)" — but a weapon's
  // "reach" is a WORD and a spell's range is already a NUMBER, so the
  // suffix said the same thing twice. Live testing read it back as
  // "beyond Fatigue's range of touch (5 ft) (max 5 ft)" and, worse,
  // "beyond Blindness's range of 30 feet (max 30 ft)".
  //
  // `rangeLabel` carries the number in every case — it expands touch to
  // the caster's reach precisely so this sentence never has to — so the
  // limit is still named, once.
  return `<strong>${who}</strong> is ${distanceFeet} ft away — beyond `
    + `<strong>${spell}</strong>'s range of ${rangeLabel(rangeText, reach)}.`;
}

/**
 * Every target that is out of range, given a list of
 * `{name, distance}` entries.
 *
 * THE WHOLE LIST, NOT THE FIRST ONE. A cleric who catches four allies in
 * one cast and has walked one of them out of range should be told which
 * one, not told that "a target" is too far and left to measure.
 *
 * @param {Array<{name: string, distance: number|null}>} targets
 * @param {string} rangeText
 * @param {number} reach
 * @returns {Array<{name: string, distance: number}>}
 */
export function targetsOutOfRange(targets, rangeText, reach = DEFAULT_REACH) {
  // NO EARLY EXIT FOR AN UNGATED SPELL. One used to sit here, and
  // `mutate-spell-range` M2 showed it changed no answer: `outOfSpellRange`
  // returns false against a null limit for every target, so the filter
  // below already empties the list. The eleventh dead guard.
  const max = spellRangeFeet(rangeText, reach);
  return (Array.isArray(targets) ? targets : [])
    .filter((t) => outOfSpellRange(Number(t?.distance), max))
    .map((t) => ({ name: String(t?.name ?? "The target"), distance: Number(t.distance) }));
}

/* ══════════════════════════════════════════════════════════════════════
 * A TOUCH ON SOMEBODY WHO DOES NOT WANT IT (3.583.0; the pages 231-240
 * audit's D12, Graham's R13 of 22 September 2026).
 *
 * Page 240:
 *
 *   "When casting a spell with a range of touch, you need to physically
 *    make contact with the target, using your unarmed reach to determine
 *    if you can reach them. If the target is unwilling, you must make an
 *    attack roll, using your Spellcraft Bonus. If the attack successfully
 *    lands, it doesn't cause any damage, but it triggers the spell's
 *    effects as intended."
 *
 * The RANGE half has been right since 3.532.0 — `touchReach` reads the
 * same field a melee weapon reads, so a ten-foot reach touches at ten
 * feet. The ROLL half was never built, and it is the half that decides
 * whether the spell lands at all.
 *
 * IT MATTERS MOST FOR A SAVE SPELL AT TOUCH RANGE, which otherwise
 * arrives with no roll to hit whatsoever — the target's save was the
 * only thing between them and it. An Attack spell already rolls, and a
 * Utility spell "will not work on non-willing targets" (page 236), so
 * this is the case the book's sentence is actually for.
 * ═══════════════════════════════════════════════════════════════════ */

/** Does this cast need the page-240 touch attack before anything else? */
export function touchAttackRequired({ rangeText, willing = true, isAttackSpell = false } = {}) {
  if (willing) return false;
  // AN ATTACK SPELL ALREADY ROLLS, and its Cast a Spell check IS the
  // attack roll (page 239) — asking for a second would hit twice.
  if (isAttackSpell) return false;
  return /^\s*touch\s*$/i.test(String(rangeText ?? ""));
}

/**
 * The touch attack's outcome against a defence.
 *
 * "IT DOESN'T CAUSE ANY DAMAGE, BUT IT TRIGGERS THE SPELL'S EFFECTS" —
 * so this answers landed-or-not and nothing else. No critical, no
 * damage: a touch that lands is a touch.
 *
 * @param {number} attackValue the Spellcraft attack roll's total
 * @param {number} defence the target's defence
 * @returns {{landed: boolean, by: number}}
 */
export function touchAttackOutcome(attackValue, defence) {
  const av = Math.floor(Number(attackValue) || 0);
  const db = Math.floor(Number(defence) || 0);
  return { landed: av >= db, by: av - db };
}
