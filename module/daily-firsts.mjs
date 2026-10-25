/**
 * THE FIRST TIME EACH DAY (3.664.0). Pure; no Foundry.
 *
 * Inner Tempest writes rules about the first use of an action in a day:
 *
 *   CENTRED RECOVERY (feat)   "The first time each day that you use
 *     Refocus, improve the result by one degree, to a maximum of Critical.
 *     The first time each day that you use Power Recovery (Meditation),
 *     double the amount of PP restored."
 *   TIANZHI DISCIPLINE (feat) "the first Refocus each day is treated as a
 *     Critical."
 *
 * Declared on any carrier (an owned item's transferred effect, or an
 * active ability) as
 *
 *   flags["trg-prime"].dailyFirst = [
 *     { action: "refocus", improve: 1, max: "critical", label },
 *     { action: "refocus", set: "critical", label },
 *     { action: "powerRecovery", multiplier: 2, label }
 *   ]
 *
 * and spent on the actor: `flags["trg-prime"].dailyFirsts = {refocus: true}`
 * once the day's first use has been made, whether or not a row changed
 * it, because "the first time each day" is the first use and not the first
 * one that needed help. Daily preparation clears the record.
 */
import { DEGREE_ORDER } from "./creature-activation.mjs";

const SYSTEM_ID = "trg-prime";

/** The actor flag that records which firsts are spent today. */
export const DAILY_FIRSTS_FLAG = "dailyFirsts";

const norm = (s) => String(s ?? "").trim().toLowerCase();

function rowsOf(carrier) {
  const raw = carrier?.flags?.[SYSTEM_ID]?.dailyFirst;
  if (Array.isArray(raw)) return raw;
  return raw && typeof raw === "object" ? [raw] : [];
}

/** Every well-formed row for one action, from these carriers. */
function rowsFor(carriers, actionKey) {
  const wanted = norm(actionKey);
  const out = [];
  for (const carrier of carriers ?? []) {
    for (const row of rowsOf(carrier)) {
      if (!row || norm(row.action) !== wanted) continue;
      out.push({ ...row, label: String(row.label ?? carrier?.name ?? "First use today") });
    }
  }
  return out;
}

/** Has this action's first use today been made? */
export function dailyFirstSpent(actorFlags, actionKey) {
  return Boolean(actorFlags?.[DAILY_FIRSTS_FLAG]?.[String(actionKey ?? "")]);
}

/**
 * The degree the day's first use of this action resolves at, or null when
 * nothing declares one for it (or the first is already spent). A `set`
 * row wins over an `improve` row; improvements add up, capped at `max`
 * (default Critical) and never worsening the roll.
 *
 * @param {Array} carriers declarationCarriers(actor)
 * @param {string} actionKey
 * @param {string} degree the degree rolled
 * @param {boolean} spent dailyFirstSpent(...)
 * @returns {{degree: string, from: string, labels: string[]}|null}
 */
export function dailyFirstDegree(carriers, actionKey, degree, spent = false) {
  if (spent) return null;
  const rolled = norm(degree);
  const at = DEGREE_ORDER.indexOf(rolled);
  if (at < 0) return null;
  const rows = rowsFor(carriers, actionKey);
  const setRow = rows.find((r) => DEGREE_ORDER.includes(norm(r.set)));
  if (setRow) {
    const target = DEGREE_ORDER.indexOf(norm(setRow.set));
    // EXACTLY THAT DEGREE (3.669.0; Tianzhi Discipline: "treated as a
    // Critical result without the need for a roll"): `exact` takes no
    // better roll. Otherwise it is that degree, or kept if the roll beat it.
    if (setRow.exact === true) return { degree: DEGREE_ORDER[target], from: rolled, labels: [setRow.label], exact: true };
    return { degree: DEGREE_ORDER[Math.min(at, target)], from: rolled, labels: [setRow.label] };
  }
  const improvers = rows.filter((r) => Math.floor(Number(r.improve) || 0) > 0);
  if (!improvers.length) return null;
  const steps = improvers.reduce((sum, r) => sum + Math.floor(Number(r.improve)), 0);
  const caps = improvers.map((r) => DEGREE_ORDER.indexOf(norm(r.max || "critical"))).filter((i) => i >= 0);
  const cap = caps.length ? Math.max(...caps) : DEGREE_ORDER.indexOf("critical");
  const improved = Math.max(Math.min(at, cap), at - steps);
  return { degree: DEGREE_ORDER[Math.min(at, improved)], from: rolled, labels: improvers.map((r) => r.label) };
}

/**
 * ADVANTAGE ON THE DAY'S FIRST USE (3.669.0; Inner Tempest's Tianzhi
 * Meditation: "advantage on your first Cleansing Trance, Clear Mind or
 * Healing Trance (Meditation) check each day"). A row
 * `{ actions: [...], slot, advantage: true, label }` shares one first among
 * several actions, recorded under `slot`; `{ action, advantage: true }` is
 * that action's own. Resolves `{ slot, label }` while the first is unspent.
 *
 * @param {Array} carriers
 * @param {string} actionKey
 * @param {object} actorFlags the actor's system flags (for the spent record)
 */
export function dailyFirstAdvantage(carriers, actionKey, actorFlags = {}) {
  const wanted = norm(actionKey);
  for (const carrier of carriers ?? []) {
    for (const row of rowsOf(carrier)) {
      if (!row || row.advantage !== true) continue;
      const actions = (Array.isArray(row.actions) ? row.actions : [row.action]).map(norm).filter(Boolean);
      if (!actions.includes(wanted)) continue;
      const slot = String(row.slot ?? row.action ?? actionKey);
      if (dailyFirstSpent(actorFlags, slot)) continue;
      return { slot, label: String(row.label ?? carrier?.name ?? "First use today") };
    }
  }
  return null;
}

/**
 * WILL THE DAY'S FIRST SET THE DEGREE WITHOUT READING THE DICE? (3.669.1)
 * An unspent `{ action, set, exact: true }` row for this action: the roll
 * is made but not read, so nothing should be spent on it (found live:
 * Tianzhi Discipline's first Refocus offered conviction's +1d6). Resolves
 * the row's label, or null.
 */
export function dailyFirstExact(carriers, actionKey, spent = false) {
  if (spent) return null;
  const row = rowsFor(carriers, actionKey).find((r) => r.exact === true && DEGREE_ORDER.includes(norm(r.set)));
  return row ? row.label : null;
}

/**
 * …AND THE DEGREE IT SETS (3.669.2), the same row's: the check is declared
 * at it before anybody reads the dice, so its card shows that degree and
 * not theirs (found live: "Fumble" above the outcome's Critical). Resolves
 * the degree key, or null.
 */
export function dailyFirstExactDegree(carriers, actionKey, spent = false) {
  if (spent) return null;
  // The first exact row, as dailyFirstExact reads it.
  for (const r of rowsFor(carriers, actionKey)) {
    if (r.exact === true && DEGREE_ORDER.includes(norm(r.set))) return norm(r.set);
  }
  return null;
}

/**
 * The multiplier on the day's first use of this action (Power Recovery's
 * PP), or 1.
 */
export function dailyFirstMultiplier(carriers, actionKey, spent = false) {
  if (spent) return 1;
  return rowsFor(carriers, actionKey).reduce((best, r) => Math.max(best, Number(r.multiplier) || 1), 1);
}

/**
 * Does anything declare a first-use rule of this kind for this action?
 * `kind` "degree" (a `set` or `improve` row, resolved where the action's
 * degree is) or "multiplier" (resolved where its yield is) — so a sheet
 * roll of Power Recovery, which applies nothing, does not spend the
 * rest's doubling.
 */
export function hasDailyFirst(carriers, actionKey, kind = "degree") {
  return rowsFor(carriers, actionKey).some((r) => kind === "multiplier"
    ? (Number(r.multiplier) || 1) > 1
    : DEGREE_ORDER.includes(norm(r.set)) || Math.floor(Number(r.improve) || 0) > 0);
}
