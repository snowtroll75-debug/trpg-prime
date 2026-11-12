/**
 * THE PP A SPELL IS CAST AT, FOR A RULE THAT COUNTS THEM (3.684.0; Eldritch
 * Arts Block 6, G12). Pure; no Foundry.
 *
 *   ANGELIC PACT: "any spell you cast with the Healing trait heals the
 *   target of 1 HP per PP expended."
 *   DEMONIC PACT: "an additional point of secondary fire damage per PP
 *   expended."
 *
 * "Per PP expended" read literally does nothing for a Warlock, one of the
 * two classes the Pacts are for: every Warlock spell is innate, and an
 * innate cast pays no PP (Q37, Q52). A Partial refunds half; a rod or a
 * Bleed pays some of it.
 *
 * GRAHAM'S Q101 (4 November 2026, as proposed): "the PP the spell is cast
 * at (base + warps and metamagic), the innate spell's own PP for a Warlock.
 * Not reduced by a Partial's refund. Cantrips 0." So the number is a fact
 * about the CASTING, not about the pool:
 *
 *   - an ordinary cast: its `totalPP`, what a Success costs — base, warps,
 *     metamagic — whoever paid it (the caster, a rod, a Bleed), and whatever
 *     the degree then refunded;
 *   - an innate cast: the spell's printed PP, plus the warps and metamagic
 *     its free budget (or the pool) bought, since the innate `totalPP` is
 *     always 0 ("innate costs nothing" is a rule about paying);
 *   - an item's cast: the PP the item releases it at (or the printed PP),
 *     plus the metamagic taken on it (3.684.0 review: Q101's "base + warps
 *     and metamagic" — G6's `itemMetamagic` lets a charged item's cast take
 *     module metamagic, paid from the wielder's pool, and it was dropped);
 *   - a cantrip: 0, however warped.
 */

const whole = (v) => Math.max(0, Math.trunc(Number(v) || 0));

/**
 * @param {object} cast
 * @param {boolean} [cast.cantrip]
 * @param {boolean} [cast.innate]   an innate cast (an item's is innate too)
 * @param {boolean} [cast.itemCast]
 * @param {number}  [cast.spellPP]  the spell's printed `ppCost`
 * @param {number}  [cast.itemPP]   what the item releases it at
 * @param {number}  [cast.warpPP]   the warps bought
 * @param {number}  [cast.metamagicPP] the metamagic bought
 * @param {number}  [cast.totalPP]  the cast's own total (an ordinary cast)
 * @returns {number}
 */
export function castRiderPP({ cantrip = false, innate = false, itemCast = false, spellPP = 0, itemPP = null, warpPP = 0, metamagicPP = 0, totalPP = 0 } = {}) {
  if (cantrip) return 0;
  if (itemCast) return whole(itemPP ?? spellPP) + whole(warpPP) + whole(metamagicPP);
  if (innate) return whole(spellPP) + whole(warpPP) + whole(metamagicPP);
  return whole(totalPP);
}

/**
 * THE SAME NUMBER, FOR A MODULE METAMAGIC'S `apply(ctx)` (3.684.1; Graham, 4
 * November 2026: Wellspring Conduit's "+1d6 damage per 2 PP expended in their
 * casting" counts the PP the spell is cast at, as Q101 reads the Pacts). It
 * runs after the warps are chosen and before the cast's `totalPP` exists, so
 * it is put together here from what is known then: the base (an innate's or
 * an item's printed or release PP, as `castRiderPP`), the warps, and EVERY
 * metamagic option taken — the core's as ticked and each module option's
 * `ppCost` (its choice's, × times), THE ASKING OPTION'S OWN INCLUDED; paid in
 * PP, in AP (G3) or a resource alike, a rod-paid one at 0 (R12). Economic
 * Spell's and Signature Spell's PP come off (they lower the cost as cast);
 * G4's payment-only discounts (Q93) do not. A cantrip is 0.
 *
 * @param {object} cast as `castRiderPP`, with:
 * @param {number} [cast.basePP]       an ordinary cast's base PP
 * @param {number} [cast.economicPP]   Economic Spell's PP lowered
 * @param {number} [cast.signaturePP]  Signature Spell's PP (0 or 1)
 * @returns {number}
 */
export function metamagicCastPP({ cantrip = false, innate = false, itemCast = false, spellPP = 0, itemPP = null, basePP = 0, warpPP = 0, metamagicPP = 0, economicPP = 0, signaturePP = 0 } = {}) {
  const asCast = Math.max(1, whole(basePP) + whole(warpPP) + whole(metamagicPP) - whole(economicPP) - whole(signaturePP));
  return castRiderPP({ cantrip, innate, itemCast, spellPP, itemPP, warpPP, metamagicPP, totalPP: asCast });
}

/**
 * The spell's PRINTED cost, for a bonus "equivalent to its PP cost"
 * (Dangerous Sorcery; Graham's Q146: "the printed PP (a cantrip adds 0)").
 * Warps and metamagic do not raise it.
 */
export function printedSpellPP(spellData = {}) {
  return whole(spellData?.ppCost);
}

/**
 * "A spell without a duration" (Q146): one that prints no Duration entry.
 * "Instantaneous" is not printed anywhere in the pack: a blank field is the
 * book's instant spell.
 */
export function spellHasNoDuration(spellData = {}) {
  return !String(spellData?.duration ?? "").trim();
}
