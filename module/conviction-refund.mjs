/**
 * A CONVICTION POINT NOT EXPENDED ON A GOOD RESULT (3.669.0; Inner Tempest's
 * Adaptive Mind: "When you use a conviction point to reroll a Mental Focus
 * skill check, you only expend it if the result of the check is a success or
 * better." The core's conviction has no reroll; Graham's B5-3 of 24 October
 * 2026 reads it as conviction's Advantage on a Mental Focus check, refunded
 * when the result is a success or better.) Pure: which of the actor's items
 * refund the point, for one check.
 *
 * Scoundrel's Luck (rogue.mjs) is the same shape the other way round — its
 * point comes back on a FAILURE — and is left as it is; this is the declared
 * form a module's feat can carry:
 *
 *   flags.trg-prime.convictionRefund: {
 *     skills: ["mentalFocus"],          // skill keys; empty for any skill
 *     degrees: ["success", "critical", "heroic"],
 *     label: "Adaptive Mind",
 *     checkTypes: ["skill"],            // optional (3.684.0): "skill", "save"
 *     frequency: "daily"                // optional (3.684.0)
 *   }
 *
 * Only skill checks, unless `checkTypes` says otherwise. A point Luck of
 * Heroes already kept has nothing to refund, and one refund per check: the
 * caller asks once.
 *
 * SAVES, AND ONCE A DAY (3.684.0; Eldritch Arts Block 6, G18). Fate's Favour:
 * "The first time each day that you spend a conviction point to gain
 * advantage on a check, you only expend the conviction if the result of the
 * check is a success or greater." Graham's Q110: read LITERALLY — the point
 * comes back on a Partial or worse — on saves and skill checks (the checks
 * conviction's advantage serves), the first time each day. Inner Tempest's
 * identical sentence (B5-3) stays as it was ruled; the module writes the
 * degrees each wants. "The first time" is the first spend the row could
 * answer, whatever its result: a Success uses the day's chance as surely as a
 * refund does. `convictionRefundDailyUsed` names the daily rows a spend uses,
 * and the caller marks them in `declaredUsedToday`, which daily preparation
 * clears. A row with no `checkTypes` and no `frequency` reads exactly as it
 * did.
 */

const DEGREE_KEYS = Object.freeze(["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);
/** The checks conviction's advantage serves (conviction.mjs CONVICTION_SPENDS). */
const REFUND_CHECK_TYPES = Object.freeze(["skill", "save"]);
/** The key a daily row's use is kept under in the actor's `declaredUsedToday` flag. */
export const convictionRefundDailyKey = (label) => `convictionRefund:${String(label ?? "").trim()}`;

/** One item's declaration, normalised; null when it declares nothing usable. */
function refundRowOf(item) {
  if (!item || !["feat", "ability"].includes(item.type)) return null;
  if (item.type === "ability" && item.system?.active === false) return null;
  const raw = item.flags?.["trg-prime"]?.convictionRefund;
  if (!raw || typeof raw !== "object") return null;
  const checkTypes = (Array.isArray(raw.checkTypes) ? raw.checkTypes : []).map((t) => String(t).trim().toLowerCase())
    .filter((t) => REFUND_CHECK_TYPES.includes(t));
  return {
    item,
    label: String(raw.label ?? item.name).trim() || item.name,
    skills: (Array.isArray(raw.skills) ? raw.skills : []).map((s) => String(s).trim().toLowerCase()).filter(Boolean),
    degrees: (Array.isArray(raw.degrees) ? raw.degrees : []).map((d) => String(d).trim().toLowerCase()),
    checkTypes: checkTypes.length ? checkTypes : ["skill"],
    daily: ["daily", "1/day"].includes(String(raw.frequency ?? "").trim().toLowerCase())
  };
}

/** Does this row answer this check at all (its type and skill, and today's use)? */
function rowAnswers(row, { checkType, subject, usedToday }) {
  if (!row.checkTypes.includes(String(checkType))) return false;
  if (row.skills.length && !row.skills.includes(String(subject ?? "").trim().toLowerCase())) return false;
  if (row.daily && usedToday?.[convictionRefundDailyKey(row.label)]) return false;
  return true;
}

/**
 * The first item that refunds the conviction point spent on Advantage for
 * this check, as `{item, label, daily}`, or null.
 *
 * @param {Iterable<object>} items the actor's items
 * @param {{checkType: string, subject: string, degree: string, usedToday?: object}} check
 *   `usedToday`: the actor's `declaredUsedToday` flag, for a daily row (3.684.0)
 */
export function convictionRefundRow(items = [], { checkType = "", subject = "", degree = "", usedToday = {} } = {}) {
  if (!REFUND_CHECK_TYPES.includes(String(checkType))) return null;
  const want = String(degree ?? "").trim().toLowerCase();
  if (!DEGREE_KEYS.includes(want)) return null;
  for (const item of Array.isArray(items) ? items : Array.from(items ?? [])) {
    const row = refundRowOf(item);
    if (!row || !rowAnswers(row, { checkType, subject, usedToday })) continue;
    if (!row.degrees.includes(want)) continue;
    return { item, label: row.label, daily: row.daily };
  }
  return null;
}

/**
 * The `declaredUsedToday` keys this spend uses up (3.684.0, G18): every daily
 * row that answers the check, refunded or not — "the first time each day".
 * Empty until the degree is known, so a check whose DC comes later is counted
 * when its card learns it.
 */
export function convictionRefundDailyUsed(items = [], { checkType = "", subject = "", degree = "", usedToday = {} } = {}) {
  if (!REFUND_CHECK_TYPES.includes(String(checkType))) return [];
  if (!DEGREE_KEYS.includes(String(degree ?? "").trim().toLowerCase())) return [];
  const keys = [];
  for (const item of Array.isArray(items) ? items : Array.from(items ?? [])) {
    const row = refundRowOf(item);
    if (!row?.daily || !rowAnswers(row, { checkType, subject, usedToday })) continue;
    const key = convictionRefundDailyKey(row.label);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * THE DAY'S USES AS A CARD'S RE-ASK SEES THEM (3.684.0; Eldritch Arts Block 6,
 * G18 — review, Low). The roll marks a daily row used the moment the degree
 * is first known; if the GM then changes the DC on the card, the re-ask read
 * the row as "used" — by this very roll — and a newly qualifying degree got
 * no refund. The card remembers the keys its own roll took
 * (`convictionRefundDaily`), and the re-ask is asked as though those were
 * still free: the same spend, answered again, not a second spend.
 *
 * @param {object} usedToday the actor's `declaredUsedToday` flag
 * @param {string[]} takenByCard the keys this card's roll marked
 * @returns {object} a new object
 */
export function usedTodayForCard(usedToday = {}, takenByCard = []) {
  const out = { ...(usedToday && typeof usedToday === "object" ? usedToday : {}) };
  for (const key of Array.isArray(takenByCard) ? takenByCard : []) delete out[key];
  return out;
}

/** The card line for a refund. */
export function convictionRefundLine(label) {
  return `${label} — the conviction point spent on advantage is not expended, and does not count as this round's spend.`;
}
