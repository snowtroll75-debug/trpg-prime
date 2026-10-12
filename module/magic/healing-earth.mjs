/**
 * Healing Earth — a spell that makes a THING, not a bonus.
 *
 * NEW at 3.407.0. Pure; no Foundry.
 *
 * > You transform dirt or mud into a malleable earth with healing
 * > properties. This claylike substance can be used instead of
 * > traditional healer's tools for performing Medicine checks to
 * > Administer First Aid or Treat Wounds. If the earth remains unused
 * > until the spell's duration expires, or if you cast the spell again
 * > before using it, the earth reverts back to its original non-magical
 * > form of ordinary dirt or mud, losing its healing properties.
 * > CL 5: The earth grants anyone using it to Administer First Aid or
 * > Treat Wounds a +1 item bonus to the Medicine check.
 *
 * The last PP 0 spell.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS AN ITEM AND NOT A MARKER.
 *
 * A marker (see markers.mjs) is a flag on ONE actor that a rule reads and
 * consumes, and it was the obvious cheap build. Graham's ruling on 25
 * August 2026 rules it out: "anyone who has it" — the caster can hand the
 * earth to the party medic, and whoever performs the check gets the
 * benefit. The printed CL 5 line says the same thing in the book's own
 * words: it grants ANYONE USING IT a +1 item bonus.
 *
 * A flag on the caster cannot change hands. A gear item can, using
 * Foundry's own inventory, with no new mechanism at all.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT SUBSTITUTES BY TRAIT RATHER THAN BY A SPECIAL CASE.
 *
 * `consumeGearUse(actor, HEALERS_TOOLS)` already spends one use of the
 * first EQUIPPED gear whose traits match "healer's tools", on each of the
 * four Medicine actions the project's own data marks as requiring them.
 * So the earth does not need the workflow to learn about spells: it needs
 * to BE a piece of equipped gear carrying that trait. The substitution
 * then happens in the code that was already there.
 *
 * THE PATTERN IS DEFINED ONCE, in gear-uses.mjs, and imported by both the
 * consumer and this file. It was written out twice — a regex in
 * action-workflow.mjs and a trait string here — and two spellings of one
 * fact is the defect shape that has cost this project five bugs, most
 * recently the marker flag that `mutate-markers` #10 renamed while
 * fifty-nine checks stayed green. `verify-healing-earth` asserts the
 * trait this file writes matches the pattern that file reads.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE SPELL DOES NOT DO, AND WHY — Graham's ruling.
 *
 * The book pairs "Administer First Aid or Treat Wounds". In this system's
 * own data only Treat Wounds (with Treat Disease/Injury/Toxin) requires
 * healer's tools; First Aid requires only "You have a hand free". So the
 * substitution clause has mechanical force on Treat Wounds ALONE — there
 * was never anything to substitute for on First Aid. Graham's ruling was
 * to follow the system's requirement data rather than invent a tools
 * requirement for First Aid, which would change that action for every
 * character in the game to make one cantrip tidier.
 *
 * THE CL 5 BONUS IS NOT NARROWED THAT WAY. "+1 item bonus to the Medicine
 * check" for either action is a plain grant that needs no requirement to
 * hang on, so it is offered on both, exactly as printed.
 */

/**
 * The trait a piece of gear must carry to be spent as healer's tools.
 *
 * Re-exported from the module that CONSUMES it so there is one spelling.
 * See the header.
 */
export { HEALERS_TOOLS } from "../gear-uses.mjs";
import { TEMPORARY_GEAR_FLAG } from "../gear-uses.mjs";

/** The flag marking an item as this spell's product. */
export const HEALING_EARTH_FLAG = "healingEarth";

/**
 * The caster level at which the earth starts granting a bonus, and how
 * much. From the printed Caster Level Modifications line.
 */
export const HEALING_EARTH_CL = 5;
// NOT EXPORTED: nothing outside this file needs the magnitude, only the
// answer `healingEarthBonus` gives. The uncalled-export ratchet caught it
// exported and unused — a well-tested opinion rather than automation.
const HEALING_EARTH_BONUS = 1;

/**
 * The traits string the earth carries.
 *
 * "Healer's Tools" is the trait the real item carries and the one
 * `HEALERS_TOOLS` matches; "Alteration" and "Earth" are the spell's own,
 * kept so the object on the sheet reads like what it is.
 */
// NOT EXPORTED, for the same reason: the harness checks the traits the
// PRODUCED ITEM carries, run through the real finder, which is the fact
// that matters. Reading the constant instead would be a check comparing
// this file to itself.
const HEALING_EARTH_TRAITS = "Healer's Tools, Alteration, Earth";

/**
 * The +1 item bonus this earth grants, given the caster's level.
 *
 * BELOW CL 5 IT GRANTS NOTHING, and that is the printed rule rather than
 * an oversight: the base spell only substitutes for the tools. Returning
 * 0 rather than omitting the concept keeps the caller's shape the same at
 * every level.
 *
 * @param {number} casterLevel
 * @returns {number}
 */
export function healingEarthBonus(casterLevel) {
  return Number(casterLevel) >= HEALING_EARTH_CL ? HEALING_EARTH_BONUS : 0;
}

/**
 * The conditional entries the earth carries, for the CL 5 bonus.
 *
 * TYPED `item`, because the book says "item bonus" and Appendix 1 pools
 * by type — an item bonus does not stack with the +2 the real healer's
 * tools already give, which is the correct reading of a substitute.
 *
 * SCOPED TO THE TWO PRINTED ACTIONS. A blanket Medicine bonus would also
 * apply to Treat Disease and Treat Toxin, which the spell does not name.
 *
 * `auto` because the scope is exact: the action key settles it with
 * nothing left for a player to judge.
 */
function healingEarthConditionals(casterLevel) {
  const value = healingEarthBonus(casterLevel);
  if (!value) return [];
  return [{
    kind: "modifier",
    value,
    type: "item",
    label: "Healing Earth",
    scope: "Administer First Aid or Treat Wounds",
    auto: true,
    when: { checkTypes: ["skill"], subjects: ["medicine"], actions: ["firstAid", "treatWounds"] }
  }];
}

/**
 * The gear item this spell creates. THE SINGLE WRITER of its shape.
 *
 * EVERY FIELD HERE IS LOAD-BEARING for `findEquippedGearByTrait`, which
 * finds the first item that is `type: "gear"`, `system.equipped`, and
 * whose traits match. Miss any one and the earth sits in the inventory
 * looking correct and substituting for nothing, silently — so the harness
 * checks the produced object against that finder rather than against a
 * list I typed here.
 *
 * ONE USE, because the printed text says the earth reverts "if it remains
 * UNUSED" — a single application is what the sentence describes.
 *
 * EQUIPPED ON CREATION, because "using healer's tools" is what the
 * requirement says and an unequipped kit is not in use. The player can
 * unequip or hand it on like any other gear.
 *
 * @param {object} options
 * @param {number} options.casterLevel
 * @param {number|null} options.expiresAt world time, seconds, or null
 * @param {string} [options.img]
 * @returns {object} an Item creation payload
 */
export function healingEarthItemData({ casterLevel = 0, expiresAt = null, img = "" } = {}) {
  return {
    name: "Healing Earth",
    type: "gear",
    img: img || "icons/commodities/materials/bowl-powder-grey.webp",
    system: {
      quantity: 1,
      weight: 0,
      price: 0,
      equipped: true,
      invested: false,
      traits: HEALING_EARTH_TRAITS,
      description:
        "Claylike earth with healing properties. Used instead of healer's tools for "
        + "Treat Wounds. Reverts to ordinary dirt when the spell ends, when it is used, "
        + "or if the caster casts the spell again.",
      slot: "",
      uses: { value: 1, max: 1 },
      itemSize: "T",
      itemLevel: 1,
      heldHands: 0,
      gearCategory: "Kits & Tools"
    },
    flags: {
      "trg-prime": {
        [HEALING_EARTH_FLAG]: { expiresAt: expiresAt === null ? null : Number(expiresAt) },
        // SPENT BEFORE A REAL KIT. See findEquippedGearByTrait: the earth
        // reverts on its own whether used or not, so a character holding
        // both should never burn a charge of the tools they paid for.
        [TEMPORARY_GEAR_FLAG]: true,
        conditionals: healingEarthConditionals(casterLevel)
      }
    }
  };
}

/** Is this item the product of this spell? */
export function isHealingEarth(item) {
  return Boolean(item?.flags?.["trg-prime"]?.[HEALING_EARTH_FLAG]);
}

/**
 * Has this earth reverted to ordinary dirt?
 *
 * NULL `expiresAt` NEVER EXPIRES. A spell cast with no readable duration
 * has no end to compare against, and inventing one would delete a
 * player's item on a clock nobody set. The pack's duration is "10
 * minutes", so this is the defensive branch rather than the usual one.
 *
 * @param {object} item
 * @param {number} worldTime
 * @returns {boolean}
 */
export function healingEarthExpired(item, worldTime) {
  const data = item?.flags?.["trg-prime"]?.[HEALING_EARTH_FLAG];
  if (!data) return false;
  const end = data.expiresAt;
  if (end === null || end === undefined) return false;
  return Number(worldTime) >= Number(end);
}

/**
 * Every earth on an actor that has reverted, for the world-clock sweep.
 *
 * @param {Iterable<object>} items
 * @param {number} worldTime
 * @returns {object[]}
 */
export function expiredHealingEarth(items, worldTime) {
  return Array.from(items ?? []).filter((item) => healingEarthExpired(item, worldTime));
}

/**
 * Every earth on an actor, expired or not — what a recast reverts.
 *
 * "IF YOU CAST THE SPELL AGAIN BEFORE USING IT" is a printed clause and
 * this is the whole of it: a second casting reverts the first earth
 * wherever it is, so a caster cannot stockpile them.
 */
export function existingHealingEarth(items) {
  return Array.from(items ?? []).filter(isHealingEarth);
}
