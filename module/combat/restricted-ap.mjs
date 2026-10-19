/**
 * BONUS AP THAT ONLY BUYS CERTAIN ACTIONS (3.648.0).
 *
 * Core rulebook, Quickened: "During Phase 1 of your turn, you are granted 1
 * additional AP. The individual effect that renders you quickened will
 * outline the specific actions that this bonus AP can be used for. If you
 * become quickened from multiple sources, the extra AP you receive can be
 * utilized for any single action permitted by any of the effects causing
 * your quickened condition."
 *
 * Fast Attack: "You gain one additional AP each round which may only be used
 * to make a Strike action."
 *
 * Graham, 15 October 2026, found at the table: Fast Attack raised the AP
 * maximum and nothing granted the point; Quickened's point was granted and
 * then clamped away by the sheet's maximum, so Haste gave nothing at all;
 * and the "Strike and Stride only" of Haste, Speed and Swift Sonata was a
 * note. Ruling: a separate strike-only AP, spent first by a Strike.
 *
 * THE SHAPE. The bonus point sits in the ordinary pool (`ap.value`), so the
 * sheet, the mounted pool and every refund keep working, and the actor
 * carries the turn's grant beside it:
 *
 *   flags.trg-prime.apGrant = { combatId, bonus, entries: [{ key, label, actions, value }] }
 *
 * `bonus` is how far above the maximum this turn's grant may stand (the
 * sheet clamps to max + bonus). `entries` are the restricted points still
 * unspent. A restricted point is never more than the pool holds: whatever
 * took AP straight off the pool took it from the general points first, so
 * the entries are read capped at `ap.value` (see `restrictedHeld`).
 *
 * Pure: no Foundry globals except where an actor is passed in.
 */

export const SYSTEM_ID = "trg-prime";
export const AP_GRANT_FLAG = "apGrant";

/** The action kinds a restricted point can be spent on. */
const USE_KINDS = Object.freeze(["strike", "stride", "step", "move"]);

const LABEL = { strike: "Strike", stride: "Stride", step: "Step", move: "Move" };

/**
 * What each printed source of Quickened allows its point to buy, by the
 * source's name. Quickened applied by anything not listed (the token HUD,
 * Temporal Distortion, a GM's hand) is unrestricted.
 */
const QUICKENED_SOURCES = Object.freeze({
  "haste": ["strike", "stride"],
  "speed": ["strike", "stride"],
  "swift sonata": ["strike", "stride", "step"],
  "channel the aspect": ["move", "strike"]
});

/** Fast Attack's point. */
const FAST_ATTACK = Object.freeze({ key: "fastAttack", label: "Fast Attack", actions: ["strike"] });

export function quickenedActionsFor(sourceName) {
  const list = QUICKENED_SOURCES[String(sourceName ?? "").trim().toLowerCase()];
  return list ? [...list] : null;
}

function cleanActions(list) {
  if (!Array.isArray(list)) return null;
  const out = USE_KINDS.filter((k) => list.map((x) => String(x).toLowerCase()).includes(k));
  return out.length ? out : null;
}

/**
 * The kinds an action counts as. A Stride and a Step are each also a Move
 * action; anything with the Move trait is a Move.
 *
 * @param {string} actionName e.g. "Longsword — Strike", "Stride", "Climb"
 * @param {{use?: string|null, traits?: string|string[]}} [options]
 * @returns {string[]} empty for an action no restricted point can buy
 */
export function useKindsOf(actionName, { use = null, traits = "" } = {}) {
  const kinds = new Set();
  const explicit = String(use ?? "").trim().toLowerCase();
  const name = String(actionName ?? "").trim();
  const add = (k) => {
    kinds.add(k);
    if (k === "stride" || k === "step") kinds.add("move");
  };
  if (USE_KINDS.includes(explicit)) add(explicit);
  if (/(^|—\s*)Strike$/i.test(name)) add("strike");
  if (/^Stride$/i.test(name)) add("stride");
  if (/^Step$/i.test(name)) add("step");
  const traitText = Array.isArray(traits) ? traits.join(",") : String(traits ?? "");
  if (/\bmove\b/i.test(traitText)) add("move");
  return USE_KINDS.filter((k) => kinds.has(k));
}

/** Whether a restricted entry may pay for an action of these kinds. */
function entryServes(entry, kinds) {
  return Array.isArray(entry?.actions) && entry.actions.some((a) => kinds.includes(a));
}

/**
 * The turn's grant, from what is on the creature at the start of its turn.
 *
 * @param {object} p
 * @param {boolean} p.quickened
 * @param {Array<string[]|null>} p.quickenedSources each Quickened effect's
 *   allowed actions, null for one that names none
 * @param {boolean} p.fastAttack
 * @returns {{bonus:number, entries:Array}} `bonus` AP above the base;
 *   `entries` the restricted ones among them
 */
export function turnGrant({ quickened = false, quickenedSources = [], fastAttack = false } = {}) {
  const entries = [];
  let bonus = 0;
  if (quickened) {
    bonus += 1;
    const sources = Array.isArray(quickenedSources) && quickenedSources.length ? quickenedSources : [null];
    // ANY UNRESTRICTED SOURCE MAKES THE POINT GENERAL; otherwise it may go on
    // "any single action permitted by any of the effects".
    if (!sources.some((s) => cleanActions(s) === null)) {
      const union = USE_KINDS.filter((k) => sources.some((s) => cleanActions(s).includes(k)));
      entries.push({ key: "quickened", label: "Quickened", actions: union, value: 1 });
    }
  }
  if (fastAttack) {
    bonus += 1;
    entries.push({ ...FAST_ATTACK, actions: [...FAST_ATTACK.actions], value: 1 });
  }
  return { bonus, entries };
}

/**
 * Take AP lost at the grant (Stunned, Slowed, a surprise round's cap, a
 * shared mounted pool) out of the restricted points first.
 */
export function loseFromRestricted(entries, lost) {
  let left = Math.max(0, Math.trunc(Number(lost) || 0));
  const out = [];
  // The narrowest point goes first: it is the one least likely to be usable.
  const order = [...(entries ?? [])].map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.actions?.length ?? 0) - (b.e.actions?.length ?? 0) || a.i - b.i);
  const kept = new Map();
  for (const { e, i } of order) {
    const v = Math.max(0, Math.trunc(Number(e.value) || 0));
    const take = Math.min(v, left);
    left -= take;
    kept.set(i, v - take);
  }
  (entries ?? []).forEach((e, i) => { if (kept.get(i) > 0) out.push({ ...e, value: kept.get(i) }); });
  return out;
}

/** Restricted entries as they stand against the pool: never more than it holds. */
export function cappedEntries(entries, apValue) {
  return loseFromRestricted(entries, Math.max(0,
    (entries ?? []).reduce((t, e) => t + Math.max(0, Number(e.value) || 0), 0) - Math.max(0, Number(apValue) || 0)));
}

/**
 * How many AP an action of these kinds may draw on.
 *
 * @returns {number} the general points plus the restricted points that serve it
 */
export function availableFor(apValue, entries, kinds = []) {
  const pool = Math.max(0, Number(apValue) || 0);
  const held = cappedEntries(entries, pool);
  const barred = held.filter((e) => !entryServes(e, kinds)).reduce((t, e) => t + e.value, 0);
  return Math.max(0, pool - barred);
}

/**
 * Spend `cost` for an action of these kinds: restricted points that serve
 * it go first (the narrowest first), then general points. An action no
 * restricted point serves never touches them, unless the spend overruns the
 * general points (a "Proceed anyway"), when the pool's clamp takes them too.
 *
 * @returns {{newValue:number, entries:Array, fromRestricted:number}}
 */
export function spendPlan(apValue, entries, cost, kinds = []) {
  const pool = Math.max(0, Number(apValue) || 0);
  const spend = Math.max(0, Number(cost) || 0);
  const held = cappedEntries(entries, pool);
  let left = spend;
  let fromRestricted = 0;
  const order = held.map((e, i) => ({ e, i })).filter(({ e }) => entryServes(e, kinds))
    .sort((a, b) => a.e.actions.length - b.e.actions.length || a.i - b.i);
  const value = held.map((e) => e.value);
  for (const { i } of order) {
    const take = Math.min(value[i], left);
    value[i] -= take; left -= take; fromRestricted += take;
  }
  const newValue = Math.max(0, pool - spend);
  const remaining = held.map((e, i) => ({ ...e, value: value[i] })).filter((e) => e.value > 0);
  return { newValue, entries: cappedEntries(remaining, newValue), fromRestricted };
}

/** "Strike or Stride". */
export function actionsText(actions) {
  const words = (actions ?? []).map((a) => LABEL[a] ?? a);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/** The grant on an actor, for the current combat only. */
export function grantOf(actor, combatId = globalThis.game?.combat?.id ?? null) {
  const g = actor?.getFlag?.(SYSTEM_ID, AP_GRANT_FLAG) ?? actor?.flags?.[SYSTEM_ID]?.[AP_GRANT_FLAG] ?? null;
  if (!g || !combatId || g.combatId !== combatId) return null;
  return g;
}

/** Restricted points the actor holds right now. */
export function restrictedHeld(actor) {
  const g = grantOf(actor);
  if (!g) return [];
  return cappedEntries(g.entries ?? [], Number(actor?.system?.resources?.ap?.value ?? 0));
}

/** AP the actor may spend on an action of these kinds (all of it, if none are restricted). */
export function apAvailable(actor, kinds = []) {
  const g = grantOf(actor);
  const value = Number(actor?.system?.resources?.ap?.value ?? 0);
  return g ? availableFor(value, g.entries ?? [], kinds) : Math.max(0, value);
}

/** AP the actor may spend on anything at all — the general points. */
export function generalAP(actor) {
  return apAvailable(actor, []);
}

/** The sheet's line: "1 for Strike or Stride (Quickened)". */
export function restrictedSummary(entries) {
  return (entries ?? []).filter((e) => e.value > 0)
    .map((e) => `${e.value} for ${actionsText(e.actions)} only (${e.label})`).join("; ");
}
