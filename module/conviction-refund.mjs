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
 *     label: "Adaptive Mind"
 *   }
 *
 * Only skill checks. A point Luck of Heroes already kept has nothing to
 * refund, and one refund per check: the caller asks once.
 */

const DEGREE_KEYS = Object.freeze(["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);

/**
 * The first item that refunds the conviction point spent on Advantage for
 * this check, as `{item, label}`, or null.
 *
 * @param {Iterable<object>} items the actor's items
 * @param {{checkType: string, subject: string, degree: string}} check
 */
export function convictionRefundRow(items = [], { checkType = "", subject = "", degree = "" } = {}) {
  if (String(checkType) !== "skill") return null;
  const want = String(degree ?? "").trim().toLowerCase();
  if (!DEGREE_KEYS.includes(want)) return null;
  const skill = String(subject ?? "").trim().toLowerCase();
  for (const item of Array.isArray(items) ? items : Array.from(items ?? [])) {
    if (!item || !["feat", "ability"].includes(item.type)) continue;
    if (item.type === "ability" && item.system?.active === false) continue;
    const raw = item.flags?.["trg-prime"]?.convictionRefund;
    if (!raw || typeof raw !== "object") continue;
    const skills = (Array.isArray(raw.skills) ? raw.skills : []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
    if (skills.length && !skills.includes(skill)) continue;
    const degrees = (Array.isArray(raw.degrees) ? raw.degrees : []).map((d) => String(d).trim().toLowerCase());
    if (!degrees.includes(want)) continue;
    return { item, label: String(raw.label ?? item.name).trim() || item.name };
  }
  return null;
}

/** The card line for a refund. */
export function convictionRefundLine(label) {
  return `${label} — the conviction point spent on advantage is not expended, and does not count as this round's spend.`;
}
