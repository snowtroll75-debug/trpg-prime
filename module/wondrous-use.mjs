/**
 * Wondrous items that are USED, not only worn (3.617.0, C8 of block 37).
 *
 * Most of Chapter 11's items do their work while invested; a few have an
 * Activate line as well. The Gloves of Vitality's once-a-day heal is the
 * first given a button: "Engage (1 AP); Frequency 1/day — heal an adjacent
 * living creature … This is an essence healing effect. You can't harm undead
 * with this healing."
 *
 * The pure half: which ability a use button runs, what it says, and whether
 * today's use is spent. wondrous-use-workflow.mjs rolls and heals.
 */

import { wondrousAbilitiesOf, wondrousActive } from "./wondrous-effects.mjs";
import { LIVING_KIND, kindGateResult } from "./kind-targeting.mjs";

const SYSTEM_ID = "trg-prime";

/** The item flag recording that today's use is spent. */
export const WONDROUS_USED_FLAG = "wondrousUsedToday";

/** The item's usable ability, or null. */
export function wondrousUseOf(item) {
  // A HEAL WITH A FORMULA, or (3.626.0) a `use` ability that names the
  // automation a companion module registered for it — Pillars of Faith's
  // Past-Life Insight, Borrowed Experience, Reveal the Unseen.
  return wondrousAbilitiesOf(item).find((a) => (a?.kind === "heal" && a?.formula) || (a?.kind === "use" && a?.automation)) ?? null;
}

/** Is a Focus-frequency use spent until the next Refocus (3.626.0)? */
function wondrousFocusSpent(item) {
  return Boolean(item?.flags?.[SYSTEM_ID]?.wondrousFocusExpended);
}

/** Has a 1/day use been spent since the last daily preparation? */
function wondrousUsedToday(item) {
  return Boolean(item?.flags?.[SYSTEM_ID]?.[WONDROUS_USED_FLAG]);
}

/** What the use button says, or "" for an item with none. */
export function wondrousUseLabel(item) {
  const use = wondrousUseOf(item);
  if (!use) return "";
  const freq = use.frequency === "daily" ? "1/day" : use.frequency === "focus" ? "Focus" : use.frequency === "atWill" ? "at will" : String(use.frequency ?? "");
  if (use.kind === "use") {
    if (!wondrousActive(item)) return `${use.label}: invest and wear it to use (${use.activation}${freq ? `, ${freq}` : ""})`;
    if (use.frequency === "daily" && wondrousUsedToday(item)) return `${use.label}: used today`;
    if (use.frequency === "focus" && wondrousFocusSpent(item)) return `${use.label}: expended — Refocus restores it`;
    return `${use.label} (${use.activation}${freq ? `, ${freq}` : ""})`;
  }
  if (!wondrousActive(item)) return `${use.label}: invest and wear it to heal (${use.activation}, 1/day)`;
  if (use.frequency === "daily" && wondrousUsedToday(item)) return `${use.label}: today's heal is used`;
  return `Heal an adjacent living creature ${use.formula} (${use.activation}, 1/day)`;
}

/**
 * Whether the item may be used now, and why not.
 * @returns {{ok: boolean, reason?: string}}
 */
export function wondrousUseRefusal(item) {
  const use = wondrousUseOf(item);
  if (!use) return { ok: false, reason: "has nothing to use" };
  if (!wondrousActive(item)) return { ok: false, reason: "works only while invested and worn" };
  if (use.frequency === "daily" && wondrousUsedToday(item)) {
    return { ok: false, reason: "has already been used today (1/day, renewed at daily preparation)" };
  }
  if (use.frequency === "focus" && wondrousFocusSpent(item)) {
    return { ok: false, reason: "is expended — Refocus restores it" };
  }
  return { ok: true };
}

/**
 * "Heal an adjacent LIVING creature": the reason a patient is refused, or "".
 * Living is "neither undead nor a construct" — the kind gate's own answer
 * (kind-targeting.mjs), so a character with no creature type is living.
 */
export function wondrousUsePatientRefusal(patientSystem, patientName = "The target") {
  const gate = kindGateResult({}, patientSystem ?? {}, LIVING_KIND, patientName);
  return gate.allowed ? "" : gate.reason;
}

/* ─────────────────────── the Agile Sash's removal ─────────────────────── */

/** When the item last began to be worn and invested (world seconds). */
export const WORN_SINCE_FLAG = "wornSince";

/** "After wearing the belt (invested) for 24 hours". */
export const REMOVAL_AFTER_SECONDS = 86400;

/** "… a status penalty … for the next 24 hours". */
export const REMOVAL_PENALTY_SECONDS = 86400;

/** The penalty removing this item would carry, if worn long enough: the bonus. */
export function removalPenaltyOf(item) {
  const ability = wondrousAbilitiesOf(item).find((a) => a?.removalPenalty);
  if (!ability) return null;
  return { value: Math.abs(Math.floor(Number(ability.value) || 0)), stat: ability.stat, target: ability.target };
}

/**
 * Is the penalty due if the item stops being worn now?
 * @returns {number} the penalty's size, or 0
 */
export function removalPenaltyDue(item, now = 0) {
  const penalty = removalPenaltyOf(item);
  if (!penalty?.value) return 0;
  const since = Number(item?.flags?.[SYSTEM_ID]?.[WORN_SINCE_FLAG]);
  if (!Number.isFinite(since) || since <= 0) return 0;
  return Number(now) - since >= REMOVAL_AFTER_SECONDS ? penalty.value : 0;
}

/**
 * The parts of the item `wondrousActive` reads, as they would be after an
 * update's invested/equipped changes (undefined: unchanged).
 */
export function wondrousAfterChange(item, { invested, equipped } = {}) {
  return {
    name: item?.name,
    flags: item?.flags,
    system: {
      invested: invested === undefined ? Boolean(item?.system?.invested) : Boolean(invested),
      equipped: equipped === undefined ? Boolean(item?.system?.equipped) : Boolean(equipped)
    }
  };
}
