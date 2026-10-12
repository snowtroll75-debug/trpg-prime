/**
 * RECHARGE ITEM (Chapter 4, page 91). Pure; no Foundry.
 *
 * NEW at 3.565.0. The action existed as data — full outcome ladder,
 * correct traits, correct 10-minute cast — and `rechargeItem` appeared
 * nowhere else in the system. Every one of its printed consequences was
 * text on a card: the PP regained per degree, the 24-hour block on a
 * Fumble, the immunity until the next Daily Preparation, and the
 * one-success-per-item-per-day limit.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DC. "You spend 10 minutes holding the item and chanting and then
 * make a skill check with the DC based upon the level and rarity of the
 * item."
 *
 * GRAHAM'S RULING R4, 17 September 2026: "The level of the item
 * determines its DC (which should equate to a characters level DC)."
 *
 * So the DC is `levelDC(itemLevel)` and RARITY DOES NOT ENTER IT. His
 * ruling is narrower than the printed sentence on purpose; it is
 * recorded here rather than quietly implemented, because a later reader
 * comparing the code to page 91 will otherwise go looking for a rarity
 * term that was deliberately dropped.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LADDER ROUNDS UP, AND THAT MATTERS AT LOW LEVELS. "1 PP per 2
 * caster levels (round up)" on a Critical gives a 1st-level caster 1 PP,
 * not 0 — `Math.ceil(1/2)`. A floor here would make the action do
 * nothing at all for the first four levels of a Success, which is the
 * kind of silent dead zone this project has shipped before.
 */

/** Caster levels per PP regained, by degree. Heroic is every level. */
const LEVELS_PER_PP = Object.freeze({
  heroic: 1,
  critical: 2,
  success: 4
});

/** "The item regains no PP during this 24-hour period." */
export const FUMBLE_BLOCK_SECONDS = 86400;

/**
 * PP the item regains, by degree and caster level.
 *
 * A DEGREE THAT IS NOT ON THE LADDER REGAINS NOTHING, and that is all
 * four of the others: Partial retries, Failure fails, Fumble is worse
 * than failing, and Blunder is not a degree this action has.
 *
 * @param {string} degree
 * @param {number} casterLevel
 * @returns {number}
 */
export function rechargeAmount(degree, casterLevel) {
  const per = LEVELS_PER_PP[String(degree ?? "")];
  if (!per) return 0;
  const level = Math.max(0, Math.trunc(Number(casterLevel) || 0));
  return Math.ceil(level / per);
}

/**
 * What a degree does to the item, beyond the PP.
 *
 * BOTH A SUCCESS AND A FUMBLE MAKE IT IMMUNE, and it took reading the
 * two sentences side by side to see that they say the same thing for
 * opposite reasons:
 *
 *   Success — "Once you have used this skill successfully, the charged
 *              item becomes temporarily immune until your next daily
 *              preparation." (plus: "you may only make ONE SUCCESSFUL
 *              recharge check per item per day")
 *   Fumble  — "...blocks the items natural recharging process. The item
 *              regains no PP during this 24-hour period and becomes
 *              temporarily immune to this skill until your next daily
 *              preparation."
 *
 * A PARTIAL IS NEITHER, deliberately: "you may continue for another ten
 * minutes and attempt the check again or treat as failure below" — an
 * item locked out on a Partial could not be retried, which is the one
 * thing the Partial explicitly offers.
 *
 * @param {string} degree
 * @returns {{pp: boolean, immune: boolean, blocksNatural: boolean, resonance: boolean}}
 */
export function rechargeConsequence(degree) {
  const key = String(degree ?? "");
  const gains = Boolean(LEVELS_PER_PP[key]);
  const fumble = key === "fumble";
  return {
    pp: gains,
    immune: gains || fumble,
    blocksNatural: fumble,
    resonance: fumble
  };
}
