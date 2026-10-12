/**
 * The Druid's class abilities (Chapter 3).
 *
 * Same split as fighter.mjs, rogue.mjs, ranger.mjs, crusader.mjs and
 * bard.mjs: everything that is arithmetic on data already on the sheet
 * lives here as pure functions the harness can RUN without a Foundry
 * actor. The glue:
 *
 *   Wild Empathy   authored conditional on the ability item itself
 *                  (packs-source/abilities/druid-wild-empathy.json,
 *                  generated from tools/class-data.mjs) — a flat,
 *                  unscoped-by-rank +2, unlike Trap Finder's two-tier
 *                  version, so there is nothing for this module to
 *                  compute. Auto-applies on Handle Animal checks
 *                  because "checks involving communication with
 *                  animals" IS Handle Animal — no judgement call for a
 *                  tickbox to ask about.
 *   Wild Shape     feats-workflow.mjs (the Use button that configures
 *                  Shape Of The Animal as an innate spell, scaling its
 *                  uses with wildShapeUsesPerDay below) and
 *                  combat/attack-workflow.mjs (the +1 class bonus on
 *                  natural-weapon attacks, wildShapeAttackBonus below)
 *   Druidic Code   no code — proficiency-rules.mjs already encodes the
 *                  non-metal armour/shield/weapon restriction, and
 *                  "may lose druidic abilities" is printed as GM
 *                  Discretion, matching the pack's existing
 *                  proficiency-is-penalty-only, never-hard-blocked
 *                  philosophy (module/magic-items.mjs's "doesn't block
 *                  equipping" is the same reading elsewhere).
 *
 * Levels are the CHARACTER level (system.identity.level), as everywhere
 * else — this system is single-class.
 */

import { hasClassAbility } from "./crusader.mjs";
import { extraUsesBonus } from "./extra-uses.mjs";
import { WILD_SHAPE_ABILITY } from "./magic/wildshape-feats.mjs";

/* ---------------------------------------------------------------------- */
/*  Wild Shape (3rd; +1 use at 5th and every two levels thereafter)       */
/* ---------------------------------------------------------------------- */

/**
 * "At 3rd level you may once per day... At 5th level and then every two
 * levels thereafter you may use wild shape an additional time each
 * day." Zero below 3rd — the ability has not arrived (and per the
 * grant-timing rule, a character below 3rd will not have the item on
 * their sheet to ask this of in the first place).
 *
 * Mirrors Primal Shape's inline uses formula (feats-workflow.mjs) rather
 * than the levelled usesPerDay grammar (module/uses.mjs): the daily
 * count is written onto the SHAPE OF THE ANIMAL SPELL's own usesPerDay
 * field at Use time, exactly like Primal Shape, rather than tracked on
 * the ability item itself — so a flat recomputed number is what the
 * spell's field wants, not a formula string.
 */
export function wildShapeUsesPerDay(level) {
  const value = Math.floor(Number(level) || 0);
  if (value < 3) return 0;
  return 1 + Math.floor((value - 3) / 2);
}

/**
 * The total daily uses of Wild Shape: the level table, plus the Wildform
 * rune, plus Extra Wildshape.
 *
 * WHY THIS FUNCTION EXISTS AT ALL. The number is written onto the Shape
 * Of The Animal SPELL's `usesPerDay` by the Wild Shape button, which
 * means the generic `itemUsesMax` path cannot see it — the spell is not
 * named "Wild Shape", and if it were, the button's already-summed number
 * and the generic bonus would compound. So the Druid's copy of the
 * Extra Wildshape bonus is added HERE, where that number is decided, and
 * nowhere else.
 *
 * A ZERO STAYS A ZERO. Below 3rd the ability has not arrived, and a
 * character who somehow holds Extra Wildshape without Wild Shape should
 * not get two uses of an ability they do not have.
 *
 * @param {object}   opts
 * @param {number}   opts.level      character level
 * @param {string[]} opts.featNames  every feat name on the actor
 * @param {number}   opts.runeUses   Wildform's contribution (codex-runes.mjs)
 */
export function wildShapeDailyUses({ level = 0, featNames = [], runeUses = 0 } = {}) {
  const base = wildShapeUsesPerDay(level);
  if (base <= 0) return 0;
  return base
    + Math.max(0, Math.floor(Number(runeUses) || 0))
    + extraUsesBonus(featNames, WILD_SHAPE_ABILITY);
}

/**
 * "You gain a +1-class bonus to all attacks made using natural weapons
 * when using this ability or any form spell."
 *
 * Read as: a +1 whenever the Druid attacks with a natural weapon THEY
 * WERE GRANTED BY SHAPESHIFTING — bite, claw, gore, slam, sting,
 * tail-slap, wings/hoof/tentacle (Chapter 6's Unarmed Attacks table
 * lists these as "normally only available when a specific ability
 * grants them", i.e. Wild Shape or a cast Shape Of The Animal). Every
 * character — shapeshifted or not — also carries a natural Unarmed
 * Strike (held-items.mjs's `existingUnarmedStrike`, auto-equipped
 * whenever nothing else is), so gating on `system.natural` alone would
 * hand a Druid +1 to throwing a punch outside any wild shape at all.
 * Excluding Unarmed Strike by name is what keeps this to the natural
 * weapons the book actually means.
 *
 * No separate "is the character currently shapeshifted" check is
 * needed for that reason: nothing except a shapeshift (or a Beastman's
 * Primal Shape, which is a different character's different ability)
 * ever puts a non-Unarmed-Strike natural weapon on a Druid's sheet, so
 * the weapon's own presence already answers the question this gate
 * asks.
 *
 * @returns {number} 1 or 0.
 */
export function wildShapeAttackBonus({ actor = null, weaponName = "", weaponNatural = false } = {}) {
  if (!hasClassAbility(actor, WILD_SHAPE_ABILITY)) return 0;
  if (!weaponNatural) return 0;
  if (String(weaponName ?? "").trim().toLowerCase() === "unarmed strike") return 0;
  return 1;
}
