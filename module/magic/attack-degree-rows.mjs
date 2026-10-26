/**
 * A ROW THAT BELONGS TO ONE OUTCOME OF A SPELL ATTACK — NEW at 3.613.0.
 *
 * Graham's R13 of 2 October 2026 (block 35). Sickly Ray (page 357):
 *
 *   "Critical Inflicted  The target becomes sickened 2 and slowed 1 as long
 *                        as it's sickened.
 *    Hit for Damage      The target becomes sickened 1.
 *    Miss                The target is unaffected."
 *
 * A save spell's row has said which degree it answers since 3.300 (`onSave`);
 * an attack spell's row could not, so every row landed on every hit and the
 * Critical lived in a note. The only spell in the Grimoire that prints a
 * separate critical outcome, and the reason this is a field rather than a
 * second kind: `onAttack` lists the outcomes a row answers, "hit" or
 * "critical". A row that declares none is ungated and applies on any hit,
 * exactly as before. A miss never reaches the effect engine at all.
 *
 * Pure; no Foundry.
 */

const ATTACK_OUTCOMES = Object.freeze(["hit", "critical"]);

const list = (value) => (Array.isArray(value) ? value : value ? [value] : [])
  .map((v) => String(v ?? "").trim().toLowerCase())
  .filter(Boolean);

/** Does this row name the attack outcomes it answers? */
export function isAttackGated(effect) {
  return list(effect?.onAttack).some((o) => ATTACK_OUTCOMES.includes(o));
}

/**
 * Does this row reach a target the attack struck this way?
 * @param {object} effect the row
 * @param {boolean} critical whether the attack on this target was a critical
 * @returns {boolean}
 */
function attackRowApplies(effect, critical, severity = null) {
  const outcomes = list(effect?.onAttack).filter((o) => ATTACK_OUTCOMES.includes(o));
  if (!outcomes.length) return true;
  if (!outcomes.includes(critical ? "critical" : "hit")) return false;
  // A FLOOR ON THE CRITICAL (3.672.0; C10). Water Bolt: "on a serious or
  // deadly critical, the target is pushed 5 feet". Asked of a critical only;
  // a critical whose severity is unknown does not clear a floor.
  const floor = minimumSeverity(effect);
  if (critical && floor) return severityRank(severity) >= severityRank(floor);
  return true;
}

/** The critical severities, mildest first (combat/attack.mjs `criticalSeverity`). */
const SEVERITY_ORDER = Object.freeze(["minor", "serious", "deadly"]);

function severityRank(severity) {
  return SEVERITY_ORDER.indexOf(String(severity ?? "").trim().toLowerCase());
}

/** The row's `minCriticalSeverity`, or "" for none (an unknown word is none). */
export function minimumSeverity(effect) {
  const s = String(effect?.minCriticalSeverity ?? "").trim().toLowerCase();
  return SEVERITY_ORDER.includes(s) ? s : "";
}

/**
 * The struck targets a gated row reaches.
 * @param {object} effect the row
 * @param {Array<object>} recipients the struck targets
 * @param {Array<{target: object, critical: boolean, severity?: string|null}>} results per-target outcomes
 * @returns {Array<object>}
 */
export function attackRowRecipients(effect, recipients, results = []) {
  if (!isAttackGated(effect)) return recipients;
  const crits = new Map((Array.isArray(results) ? results : [])
    .filter((r) => r?.critical).map((r) => [r.target, r.severity ?? null]));
  return (Array.isArray(recipients) ? recipients : [])
    .filter((target) => attackRowApplies(effect, crits.has(target), crits.get(target) ?? null));
}
