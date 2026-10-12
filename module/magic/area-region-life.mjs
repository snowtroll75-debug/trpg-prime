/**
 * WHO OWNS THE REGION A SPELL'S TEMPLATE DREW.
 *
 * NEW at 3.480.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND BY DRIVING 3.479.1, 3 September 2026.
 *
 * Three casts of Missile Storm left three Regions named "Missile Storm
 * Area" sitting on the Charnel House, permanently. Nothing had gone
 * wrong: `placeSpellTemplate` creates a Region for every area spell, and
 * deletion existed only for emanations (`emanation-workflow`) and
 * creature auras. An instantaneous blast drew a circle and walked away.
 *
 * MEASURED ACROSS THE PACK RATHER THAN GUESSED AT: of 152 area spells,
 * **39 keep their Region by design** and **113 leave one behind** —
 * Stinking Cloud, Eldritch Ball, Line Of Fire, Harrow, Flare and the
 * rest. Every cast of any of them litters the scene for ever.
 *
 * IT ACCUMULATES SILENTLY, which is what makes it worth fixing rather
 * than sweeping by hand. Nothing errors, nothing looks wrong on the
 * card, and the cost is paid weeks later by a GM wondering why a scene
 * has two hundred invisible regions in it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULE: A PLACED REGION IS TEMPORARY UNLESS SOMETHING CLAIMS IT.
 *
 * Four mechanisms in this system record onto the Region the template
 * drew, and for each of them the Region IS the mechanism:
 *
 *   emanation      the circle that moves with the caster and is swept
 *                  every turn; deleted by `emanation-workflow` when the
 *                  spell ends.
 *   hazard         "damage for each square entered" — read on movement.
 *   elementalNexus "any creature that begins their turn inside".
 *   areaRider      consecrated ground, read by attacks made on it.
 *
 * Anything else — a blast, a burst, a one-off save against a cone — has
 * resolved by the time the card is printed and has nothing left to read
 * the Region for.
 *
 * DECLARED AS A CLAIM, NOT INFERRED FROM THE SPELL. The alternative is a
 * list of spell names or a guess from the duration field, and both go
 * stale the moment a mechanism is added. A claimant says so; the default
 * is to clean up. That way a NEW region-reading mechanism that forgets
 * to claim loses its region immediately and loudly on the first live
 * cast, rather than a new instantaneous spell silently littering for
 * months — which is the failure that already happened, and the safer
 * direction for a mistake to point.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SECOND CALLER: A CANCELLED TARGET PICKER (Graham, 3 September).
 *
 * "A cancel should refund." Cancelling Missile Storm's Choose Targets
 * dialog used to fall through to hitting everyone, the caster included —
 * the exact outcome the picker exists to prevent. A refunded cast has
 * the same question to answer as a finished one — does anything still
 * need this Region? — and the answer is always no, because a cast that
 * was called off claims nothing.
 */

/** The effect kinds whose whole mechanism IS the placed Region. */
export const REGION_CLAIMING_KINDS = Object.freeze([
  "hazard", "elementalNexus", "areaRider",
  // DIFFICULT TERRAIN (3.501.0). The Region IS the mechanism here more
  // literally than for any of the three above: the movement cost lives on
  // it as a Foundry behaviour, so deleting the Region is the spell not
  // happening. Added only once 3.500.0 gave a claimed Region an ending —
  // before that, claiming would have meant a one-minute illusion
  // outliving the session.
  "difficultTerrain",
  // A WALL AND A STORM (3.610.0). The wall's Region carries its riders and
  // its Foundry Walls hang off it; the storm's carries the DC and the last
  // strike chosen. Each is the mechanism, and each prints a duration.
  "wall", "storm",
  // A THRESHOLD (3.630.1, F10 of the 3.630.0 live test). Old Law of the
  // Threshold and Threshold Ward are an entry check and nothing else: the
  // check is recorded on the Region, and an unclaimed Region was deleted at
  // the end of the very cast that recorded it. Web survived only because
  // its difficult terrain claimed the Region first.
  "entryCheck"
]);

/**
 * Does anything about this cast need the Region to outlive it?
 *
 * @param {object|null} spellData the spell's `system`
 * @param {boolean} isLiveEmanation the result of `emanationIsLive`, passed
 *   in rather than imported so this file stays pure and driveable
 * @returns {boolean}
 */
export function areaRegionIsClaimed(spellData, isLiveEmanation = false) {
  if (isLiveEmanation) return true;
  const rows = Array.isArray(spellData?.effects) ? spellData.effects : [];
  return rows.some((row) => REGION_CLAIMING_KINDS.includes(String(row?.kind ?? ""))
    || rowClaimsForRecurringLadder(row));
}

/**
 * A `saveLadder` whose SECOND save is owed on a turn boundary.
 *
 * NEW at 3.590.1, and it is the defect the header above predicted in
 * advance: "a NEW region-reading mechanism that forgets to claim loses
 * its region immediately and loudly on the first live cast". It was
 * right about the mechanism and wrong about the "loudly" — nothing said
 * a word, because `recordRecurringLadder` SUCCEEDS. It stamps the flag
 * onto a Region that the clean-up below deletes moments later.
 *
 * FOUND BY CASTING INCENDIARY CLOUD IN GRAHAM'S WORLD, 25 September
 * 2026: the card read "20 ft radius template placed — caught 3" and the
 * scene held no Region at all afterwards.
 *
 * IT PREDATES THE SPELL THAT FOUND IT. The recurring ladder shipped at
 * 3.587.0 with Disturbing Tentacles, which does not claim its Region
 * either — so its "whenever a creature ends its turn in the area"
 * Will save has never once been rolled. The `startOfTurn` driver fixed
 * at 3.590.0 was one of TWO reasons a recurring save never happens.
 *
 * NOT THE WHOLE KIND. Six spells carry a plain cast-time `saveLadder`
 * that has resolved by the time the card is printed, and claiming for
 * those would litter a scene with a Region per cast — the 3.480.0
 * failure, reintroduced by a fix. The claim is the `recurring` FIELD,
 * because that field is the only thing that needs the Region to outlive
 * the cast.
 *
 * @param {object} row an effect row
 * @returns {boolean}
 */
export function rowClaimsForRecurringLadder(row) {
  return String(row?.kind ?? "").toLowerCase() === "saveladder" && Boolean(row?.recurring);
}

/**
 * Should the Region this cast drew be deleted now?
 *
 * @param {string|null} regionId
 * @param {object|null} spellData
 * @param {boolean} isLiveEmanation
 * @param {boolean} refunded true when the cast was called off
 * @returns {boolean}
 */
export function shouldClearAreaRegion(regionId, spellData, isLiveEmanation = false, refunded = false) {
  if (!regionId) return false;
  // A REFUNDED CAST CLAIMS NOTHING, whatever the spell declares. A cast
  // called off before it resolved must not leave a live hazard behind.
  if (refunded) return true;
  return !areaRegionIsClaimed(spellData, isLiveEmanation);
}

/* ═════════════════════════════════════════════════════════════════════
 * THE REFUND
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * What a cancelled cast gives back.
 *
 * BOTH RESOURCES, BECAUSE BOTH WERE TAKEN. The picker opens long after
 * `ppSpent` is written and after `spendActionCost` has run — measured at
 * 3.480.0: PP at cast-workflow line ~1650, AP at ~1713, the picker at
 * ~2031. A refund that returned only the PP would quietly cost the
 * player their turn, which at three AP is the more expensive half.
 *
 * CLAMPED TO THE POOL, NOT ADDED BLINDLY. A refund is a restoration of a
 * known previous value, so it can never push a caster above their own
 * maximum — the shape `applyDamageAndCheckDying` uses in the other
 * direction, and the reason this takes the maximum rather than trusting
 * the arithmetic.
 *
 * @param {number} current the pool now
 * @param {number} spent what the cast took
 * @param {number} max the pool's maximum
 * @returns {number} what the pool should read after the refund
 */
export function refundedPool(current, spent, max) {
  const now = Math.max(0, Number(current) || 0);
  const back = Math.max(0, Number(spent) || 0);
  const cap = Math.max(0, Number(max) || 0);
  return Math.min(cap, now + back);
}

/** What the card says when a cast is called off at the picker. */
export function castRefundedLine(spellName, pp, ap) {
  const parts = [];
  if (Number(pp) > 0) parts.push(`<strong>${Number(pp)} PP</strong>`);
  if (Number(ap) > 0) parts.push(`<strong>${Number(ap)} AP</strong>`);
  const given = parts.length ? ` — ${parts.join(" and ")} refunded` : "";
  // SAID PLAINLY, because a cast that vanishes with no card is
  // indistinguishable from one that broke. The 3.450.0 empty-selection
  // ruling is the same principle: the player is told what their own
  // click did.
  return `<em>${spellName} is called off — no targets were chosen${given}.</em>`;
}
