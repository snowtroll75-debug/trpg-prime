/**
 * SPENDING POWER POINTS, INCLUDING PAST ZERO.
 *
 * NEW at 3.565.0 (Chapter 4 audit, pages 91–100). Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULE, PRINTED TWICE ON PAGE 91 (and see E1 — it is duplicated in
 * the book, which is errata, not emphasis):
 *
 *   "NEGATIVE PP — It is impossible to have a negative PP value under
 *    normal circumstances. If for some reason (such as a dispel action)
 *    your PP value would drop below 0 you instead take 5 Soul Drain for
 *    every PP that you would fall below 0."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT HAD NEVER FIRED.
 *
 * Every PP spend site in the system wrote `Math.max(0, pool - cost)`.
 * Four in cast-workflow, one in attack-workflow, one in the check-card
 * relay — all of them correct about the floor and all of them silently
 * discarding the number the rule is about. The shortfall reached
 * nothing, so the Soul Drain condition — which exists, and is valued —
 * was never applied by this route in the system's history.
 *
 * The book names DISPEL as its example cause, and Dispel, until this
 * release, spent no PP at all (D2). The one action the rule was written
 * for could not trigger it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING R3, 17 September 2026, to two questions — "is the
 * overspend always allowed rather than refused?" and "does the 5-per-PP
 * rate apply to a VOLUNTARY overspend as well as an external drain?" —
 * was "Yes and yes."
 *
 * So this never refuses. "You instead take" is a price, not a
 * prohibition: the spend happens, the pool floors at 0, and the
 * difference is charged in Soul Drain. A caster who declares 8 PP of
 * Dispel holding 3 gets the 8 PP Dispel and 25 Soul Drain.
 */

/** "5 Soul Drain for every PP that you would fall below 0." */
export const SOUL_DRAIN_PER_PP = 5;

/**
 * What a spend costs, floor and price together.
 *
 * ONE FUNCTION RATHER THAN A FLOOR AND A SEPARATE PENALTY, because the
 * two are the same sentence and every site that had only the floor is
 * how the rule went missing. A caller that asks this cannot forget the
 * half it did not think about.
 *
 * NEGATIVE AND FRACTIONAL COSTS ARE FLOORED TO ZERO rather than treated
 * as a refund — "spend -3 PP" is a caller bug, and quietly handing the
 * character three points would hide it.
 *
 * @param {number} current the pool before the spend
 * @param {number} cost
 * @returns {{value: number, spent: number, shortfall: number, soulDrain: number}}
 */
export function spendPowerPoints(current, cost) {
  const pool = Math.max(0, Math.trunc(Number(current) || 0));
  const spent = Math.max(0, Math.trunc(Number(cost) || 0));
  const shortfall = Math.max(0, spent - pool);
  return {
    value: Math.max(0, pool - spent),
    spent,
    shortfall,
    soulDrain: shortfall * SOUL_DRAIN_PER_PP
  };
}

/**
 * The card line for a spend, or "" when nothing was spent.
 *
 * THE SHORTFALL IS NAMED, NOT JUST ITS PRICE. "Gains 25 Soul Drain" on
 * its own leaves the player to divide by five to find out what happened;
 * the sentence that produced it is the thing worth printing.
 *
 * @param {{spent: number, shortfall: number, soulDrain: number}} result
 * @param {string} label what the PP was spent on
 * @returns {string}
 */
export function powerPointSpendNote(result, label = "") {
  const spent = Math.max(0, Math.trunc(Number(result?.spent) || 0));
  if (!spent) return "";
  const what = String(label ?? "").trim();
  const head = `Spends <strong>${spent} PP</strong>${what ? ` (${what})` : ""}`;
  const shortfall = Math.max(0, Math.trunc(Number(result?.shortfall) || 0));
  if (!shortfall) return `${head}.`;
  return `${head} — <strong>${shortfall} PP below 0</strong>, `
    + `so <strong>${result.soulDrain} Soul Drain</strong> `
    + `(${SOUL_DRAIN_PER_PP} per PP).`;
}
