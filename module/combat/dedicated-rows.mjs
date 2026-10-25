/**
 * dedicated-rows — outcome rows a dedicated rule already applies, and the
 * queued copies the generic reader left behind.
 *
 * NEW at 3.666.3. Graham, 22 October 2026, of Keldran's Acrobatics dialog
 * listing ten copies of "-4 circumstance — Detect Deception: on all future
 * Detect Deception checks against the target until you achieve a Critical
 * against them with this skill": "lots of duplicates and this is not a Detect
 * Deception check so should not even apply here."
 *
 * THE CAUSE. Since 3.101.0 the action workflow has read every outcome row for
 * a circumstance bonus or penalty and queued it as a pending modifier,
 * offered on the character's next roll. Since 3.565.0 Detect Deception's
 * Fumble has had its own rule: a -4 against THAT target, on Detect Deception
 * only, cleared by a Critical (sense-motive.mjs). Nothing told the generic
 * reader, so every Fumble also queued an unscoped copy of the same sentence,
 * offered on every roll the character made, for ever. Aid Defensive and Aid
 * Offensive are the same shape: their bonus goes onto the ALLY as an effect
 * (aid-bonus.mjs), and the generic reader queued a second copy on the AIDER.
 *
 * THE FIX, IN THREE PARTS:
 *   1. The generic reader leaves these actions' rows alone (as it leaves a
 *      module's `outcomesApplied` actions alone since 3.666.0).
 *   2. A row it does queue that names its own action ("-2 to Subsist checks
 *      for 1 week") is offered only on that action's checks.
 *   3. The same "for all future" entry is queued once, not once per roll; and
 *      the copies already on sheets are cleared by a migration pass.
 *
 * Pure: no Foundry.
 */

/** Actions whose modifier rows a dedicated rule applies. */
export const DEDICATED_MODIFIER_ACTIONS = Object.freeze([
  // sense-motive.mjs: the -4 against that target, until a Critical.
  "detectDeception",
  // aid-bonus.mjs: the bonus on the ally, against that target.
  "aidDefensive",
  "aidOffensive"
]);

/** May the generic reader queue a modifier from this action's row? */
export function readsGenericModifier(action) {
  if (!action || action.outcomesApplied) return false;
  return !DEDICATED_MODIFIER_ACTIONS.includes(String(action.key ?? ""));
}

/**
 * Does a row's scope name the action that wrote it? "-2 to Subsist checks
 * for 1 week" does; "+4 to its next saving throw against the disease" names a
 * save, not Treat Disease.
 *
 * @param {string} scope
 * @param {string} actionName
 */
export function scopeNamesAction(scope, actionName) {
  const name = String(actionName ?? "").trim().toLowerCase();
  if (!name) return false;
  return String(scope ?? "").toLowerCase().includes(name);
}

/**
 * The generic copies a dedicated rule makes stale: an entry labelled with a
 * dedicated action's name whose scope is word for word one of that action's
 * rows as the generic reader queued it.
 *
 * @param {Array<object>} entries an actor's pending modifiers
 * @param {Array<object>} actions the action tables
 * @param {Function} extractModifier the generic reader
 * @returns {string[]} ids
 */
export function staleDedicatedCopies(entries = [], actions = [], extractModifier = () => null) {
  const scopes = new Map();
  for (const action of actions ?? []) {
    if (!DEDICATED_MODIFIER_ACTIONS.includes(String(action?.key ?? ""))) continue;
    const set = scopes.get(action.name) ?? new Set();
    for (const text of Object.values(action.outcomes ?? {})) {
      const m = text ? extractModifier(text) : null;
      if (m) set.add(String(m.scope ?? ""));
    }
    scopes.set(action.name, set);
  }
  return (entries ?? [])
    .filter((e) => scopes.get(String(e?.label ?? ""))?.has(String(e?.scope ?? "")))
    .map((e) => String(e.id));
}

/** The fields that make two pending entries the same entry. */
function pendingIdentity(entry) {
  return JSON.stringify([
    String(entry?.kind ?? "modifier"), Number(entry?.value ?? 0), String(entry?.type ?? ""),
    String(entry?.label ?? ""), String(entry?.scope ?? ""), Boolean(entry?.oneShot),
    Array.isArray(entry?.actions) ? entry.actions.map(String) : []
  ]);
}

/**
 * Is an entry the same lasting modifier as one already queued? A "next roll"
 * entry may genuinely be owed twice (two treatments); an "all future" one
 * cannot: owing it twice is owing it once.
 *
 * @param {object} entry the one about to be queued
 * @param {Array<object>} existing
 */
export function duplicateLasting(entry, existing = []) {
  if (entry?.oneShot || Number.isFinite(Number(entry?.turns))) return null;
  const id = pendingIdentity(entry);
  return (existing ?? []).find((e) => !e?.oneShot && Number.isNaN(Number(e?.turnsRemaining)) && pendingIdentity(e) === id) ?? null;
}

/**
 * The ids of lasting duplicates already queued: every copy after the first.
 *
 * @param {Array<object>} entries
 * @returns {string[]}
 */
export function lastingDuplicateIds(entries = []) {
  const seen = new Set();
  const out = [];
  for (const entry of entries ?? []) {
    if (entry?.oneShot || Number.isFinite(Number(entry?.turnsRemaining))) continue;
    const id = pendingIdentity(entry);
    if (seen.has(id)) out.push(String(entry.id));
    else seen.add(id);
  }
  return out;
}

/**
 * Is this queued entry offered on this check? An entry that names actions is
 * offered only on those actions' checks.
 *
 * @param {object} row
 * @param {string} actionKey the check's action, "" for a plain check
 */
export function pendingFitsCheck(row, actionKey = "") {
  const actions = Array.isArray(row?.actions) ? row.actions.map(String) : [];
  return !actions.length || actions.includes(String(actionKey ?? ""));
}
