/**
 * A spell that performs a basic ACTION with a substituted check.
 *
 * NEW at 3.401.0, for Tanglefoot (Chapter 10, PP 0):
 *
 *   "From thin air you summon a vine coated in sticky sap. With a flick
 *    of your hand, it lashes out towards the target, attempting to
 *    ensnare it in a grapple. Use your Spellcraft result at -4 to
 *    perform a grapple action against the target. The effects of the
 *    spell end at the beginning of your next turn."
 *
 * Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BUILT FOR ONE SPELL, AND MEASURED BEFORE SAYING SO.
 *
 * "to perform a … action" occurs twice in the rulebook and one of those
 * is Train Animal; "use your [skill] result at -N" occurs once. So
 * Tanglefoot is the only spell that borrows an action's machinery with a
 * substituted check, and this is built for it rather than as a family.
 * That is the third time today the measurement has come back "one" after
 * I assumed "several" — the assumption is the thing to distrust.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS DID *NOT* HAVE TO BUILD, and I had it wrong.
 *
 * I told Graham that finishing Tanglefoot meant extracting grapple from
 * `action-workflow.mjs`, "where nothing can currently call it". That was
 * from a shallow look and it was wrong. Grapple's outcomes have been
 * data since long before this release:
 *
 *   module/data/basic-actions.mjs        the action, its checkType
 *                                        ("unarmed"), what it rolls
 *                                        against ("fortitudeDC"), and
 *                                        its outcome text per degree
 *   module/combat/basic-action-conditions.mjs
 *                                        `basicActionConditionEffects`
 *                                        — the conditions each degree
 *                                        applies, already pure, with an
 *                                        applier that takes an expiry
 *   module/combat/attack.mjs             `sizeCategoryDifference` and
 *                                        `maneuverSizePenalty`
 *
 * The ONLY thing that was trapped was the size-penalty TABLE, a
 * module-private constant in the workflow; it moved to attack.mjs beside
 * the function that consumes it. Everything else this file needed was
 * already reachable, and claiming otherwise would have justified a
 * rewrite that was not needed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 25 August 2026: the size penalty applies ON TOP of
 * the spell's own -4. "Perform a grapple action" brings the action's
 * rules with it, so a Medium caster tangling a Huge creature is at -8.
 */

import { MANEUVER_SIZE_PENALTY, maneuverSizePenalty, sizeCategoryDifference }
  from "../combat/attack.mjs";
import { basicActionConditionEffects } from "../combat/basic-action-conditions.mjs";

/**
 * Does this spell's mechanic BE an attack action, rather than have one?
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 25 August 2026, after the live pass on 3.401.0:
 *
 *   "Attack spells follow the same path as attack actions as a general
 *    rule. So if a spell emulates an attack action that does not inflict
 *    damage (grapple, shove etc), it should also inflict no damage.
 *    Also, such actions do not inflict criticals so the spells that
 *    emulate them should not either."
 *
 * WHAT WENT WRONG WITHOUT IT. Tanglefoot is category "attack", as the
 * book prints it, so the cast workflow rolled a SPELL ATTACK for it —
 * on top of the grapple the spell actually describes. The spell carries
 * no damage, so that attack critically hit for zero damage and rolled on
 * the critical injury table: a cantrip that grabs somebody left the
 * target prone, dying and soul-drained.
 *
 * MY FIRST FIX WAS THE WRONG LEVER. I relabelled the spell's category to
 * "utility", which stopped the symptom by lying about the spell —
 * Tanglefoot IS an attack spell. This is the right lever: the category
 * stays true and the MECHANISM asks whether the spell's attack is
 * already accounted for.
 *
 * ONE ATTACK PER SPELL. A maneuver spell's check IS its attack: it rolls
 * against a DC, it has degrees, and the action it emulates deals no
 * damage and inflicts no critical injury. Running the spell-attack
 * pipeline as well would be a second attack for one casting.
 *
 * GENERAL, NOT TANGLEFOOT-SHAPED. Two other spells in the book have this
 * mechanic — Spectral Grasp ("Disarm, Grapple, Shove or Trip using your
 * Spellcraft check at -4") and Telekinetic Manoeuvre ("using your
 * Spellcraft check instead of a Combat check"). Both are category
 * "attack" with no damage, so both had the same bug waiting, and both
 * are covered by this the moment they are wired.
 *
 * @param {object} spellSystem a spell's `system`
 * @returns {boolean}
 */
export function spellIsManeuver(spellSystem) {
  const effects = spellSystem?.effects;
  if (!Array.isArray(effects)) return false;
  return effects.some((e) => e?.kind === "maneuver");
}

/**
 * The modifiers a spell-driven maneuver rolls with.
 *
 * TWO SEPARATE PENALTIES, KEPT SEPARATE ON THE CARD. The spell's own -4
 * and the action's size penalty are different rules with different
 * causes, and a player looking at "-8" with no breakdown cannot tell
 * whether the system applied one twice. They are also different TYPES:
 * the size penalty is a circumstance penalty, which Appendix 1 pools
 * highest-wins, while the spell's is untyped and always applies.
 *
 * @param {object} args
 * @param {string} args.actionKey     which maneuver, e.g. "grappleAttack"
 * @param {number} args.spellPenalty  the spell's own modifier (-4)
 * @param {string} args.actorSize
 * @param {string} args.targetSize
 * @param {string} [args.label]       what to call the spell's own penalty
 * @returns {Array<{label:string,value:number,type:string}>}
 */
export function spellManeuverModifiers({
  actionKey = "",
  spellPenalty = 0,
  actorSize = "medium",
  targetSize = "medium",
  label = "Spell"
} = {}) {
  const modifiers = [];

  const own = Math.floor(Number(spellPenalty) || 0);
  if (own !== 0) modifiers.push({ label, value: own, type: "untyped" });

  // THE SIZE PENALTY IS READ FROM THE ACTION'S OWN TABLE, not from a
  // number here. Disarm's threshold differs from the other three, and a
  // spell that later borrowed Disarm would get Disarm's rule for free.
  const config = MANEUVER_SIZE_PENALTY[actionKey];
  if (config) {
    const penalty = maneuverSizePenalty(
      sizeCategoryDifference(actorSize, targetSize),
      config.threshold,
      config.perCategory
    );
    if (penalty) modifiers.push({ label: "Target size", value: penalty, type: "circumstance" });
  }

  return modifiers;
}

/**
 * The conditions a degree applies, from the ACTION's own table.
 *
 * A THIN PASS-THROUGH, AND DELIBERATELY SO. The temptation was to write
 * Tanglefoot's outcomes out here — grabbed on a success, grabbed plus a
 * -4 to Escape on a critical — and that would have been a second copy of
 * a table Graham has already corrected once, against a typo in the
 * printed book. If the grapple outcome changes again, this follows it
 * without being touched.
 */
export function spellManeuverEffects(actionKey, degree) {
  return basicActionConditionEffects(actionKey, degree);
}

/**
 * Whether a degree did anything at all, for the card's wording.
 *
 * A FAILURE IS NOT NOTHING. Grapple's failure text is "You fail to grab
 * your target. If you already had the target grabbed or immobilised,
 * those conditions end" — so a failed Tanglefoot on an already-grabbed
 * creature RELEASES it. That is a real consequence and the table carries
 * it; this only reports whether the table had anything to say.
 */
export function spellManeuverLanded(actionKey, degree) {
  return spellManeuverEffects(actionKey, degree).length > 0;
}

/*
 * ─────────────────────────────────────────────────────────────────────
 * A SPELL THAT OFFERS FOUR MANEUVERS (3.608.0, R5 of block 32).
 *
 * SPECTRAL GRASP (PP 6, page 326): "Spectral limbs make either a Disarm,
 * Grapple, Shove or Trip (attack actions) using your Spellcraft check at
 * -4." The second spell this file's header predicted, and it needed three
 * things Tanglefoot never did:
 *
 *   A CHOICE. The row lists `actions`; the caster picks one per target.
 *
 *   EACH ACTION'S OWN DC. The applier asked every maneuver for the
 *   target's Fortitude DC, which is Grapple's. Disarm rolls against the
 *   Attack DC and Trip against the better of Acrobatics and Fortitude —
 *   read from the action's `against`, so a spell borrowing an action takes
 *   its DC with it.
 *
 *   WHAT THE ACTION DOES BEYOND A CONDITION. A Shove moves the target (5
 *   feet, 10 on a critical) through the same planner the Shove button
 *   uses; a Disarm's outcome is the item's, printed as the action prints
 *   it, because which item and where it falls are the table's.
 *
 * TANGLEFOOT IS UNTOUCHED: a row with a single `action` takes the path it
 * always took, its own "ends at the beginning of your next turn" included.
 */

/** Every maneuver a row offers, in its printed order. */
export function maneuverChoices(effect) {
  if (Array.isArray(effect?.actions) && effect.actions.length) {
    return effect.actions.map((a) => String(a ?? "").trim()).filter(Boolean);
  }
  const one = String(effect?.action ?? "").trim();
  return one ? [one] : [];
}

/** How far a Shove moves the target, by degree. 0 when it does not. */
const MANEUVER_PUSH_FEET = Object.freeze({
  shoveAttack: Object.freeze({ heroic: 10, critical: 10, success: 5 })
});

export function maneuverPushFeet(actionKey, degree) {
  return Number(MANEUVER_PUSH_FEET[actionKey]?.[degree] ?? 0) || 0;
}

/**
 * The action's own words for a degree, read DOWN the succeeding degrees as
 * the condition table is — Disarm prints no Heroic, so a Heroic disarm is
 * its Critical. A failing degree reads only its own line.
 *
 * @param {object|null} action the BASIC_ACTIONS entry
 * @param {string} degree
 */
export function maneuverOutcomeText(action, degree) {
  const outcomes = action?.outcomes ?? {};
  const ladder = ["heroic", "critical", "success"];
  const from = ladder.indexOf(degree);
  if (from < 0) return String(outcomes[degree] ?? "").trim();
  for (let i = from; i < ladder.length; i += 1) {
    const t = String(outcomes[ladder[i]] ?? "").trim();
    if (t) return t;
  }
  return "";
}
