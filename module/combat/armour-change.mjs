/**
 * armour-change — putting armour on and taking it off (3.703.0).
 *
 * Chapter 6, Donning & Removing Armour: "Getting in and out of armour is
 * time consuming—so make sure you're wearing it when you need it! Donning
 * light armour takes 5 rounds, medium armour takes 4 minutes, and heavy
 * armour takes 10 minutes; these times are doubled when donning a full suit
 * of armour." The times themselves are in donning.mjs and, with Fleetguard
 * and registered runes, codex-runes.mjs `donningTimeFor`.
 *
 * WHY THIS EXISTS. Until 3.703.0 the sheet's "Worn" box put armour on and
 * took it off at a click, in combat or out of it, and the donning time was
 * only something the item sheet printed. Found in the 3.702.0 live test,
 * beside the drawing fix; Graham: "As for armour, please implement the rules
 * correctly." His rulings, 19 November 2026:
 *
 *   R1  REMOVING TAKES AS LONG AS DONNING, doubled for a full suit. The
 *       chapter prints donning times only; Graham's ruling supplies the
 *       other half (donning.mjs had refused to invent one, rightly, until a
 *       ruling existed).
 *   R2  IN COMBAT THE TIME IS PAID OVER YOUR TURNS. Ticking the box starts a
 *       Donning (or Removing) task of that many AP; a "Continue" button
 *       spends AP on it, turn by turn; progress is kept; unticking abandons
 *       it. The armour is worn (or off) once the whole time is paid.
 *   R3  OUT OF COMBAT IT IS DONE AT ONCE, with a card stating how long it
 *       took. The world clock is not touched.
 *   R4  A SINGLE PIECE (category "Other": a helmet, bracers, greaves) is a
 *       1 AP Interact in combat, and free outside it.
 *   R5  QUICK DONNING'S RESULT SETS THE TIME of that creature's (you or an
 *       ally) next donning or removal.
 *
 * READINGS TAKEN HERE, flagged to Graham in the 3.703.0 release notes and
 * CONFIRMED by him on 20 November 2026 ("Go with your recommendations"):
 *
 *   Q1  Donning is Manipulate work, so each turn's payment provokes as a
 *       Manipulate action would (Quick Donning itself has the trait).
 *   Q2  Quick Donning's Critical and Success times are printed as absolutes
 *       ("2 minutes to don medium or heavy armour") and are not doubled for
 *       a full suit; its Fumble ("twice the usual time") doubles whatever the
 *       usual time is, full suit and runes included.
 *   Q3  When Quick Donning and a rune both give a time, the shorter stands.
 *
 * Pure: no Foundry API.
 */

import { AP_PER_ROUND, AP_PER_MINUTE, armourCategory, describeAP } from "../donning.mjs";

/** The actor flag holding a donning or removing task in progress. */
export const ARMOUR_TASK_FLAG = "armourChange";
/** The actor flag holding a Quick Donning result waiting to be used. */
export const QUICK_DONNING_FLAG = "quickDonning";

/**
 * What kind of change this item's Worn box makes.
 * @returns {"suit"|"piece"|null} "suit" for light, medium or heavy armour
 *   (it has a donning time); "piece" for any other armour (R4); null for
 *   anything that is not armour.
 */
export function armourChangeKind(item) {
  if (item?.type !== "armour") return null;
  return armourCategory(item?.system?.category) ? "suit" : "piece";
}

/**
 * Is changing this armour an action here? Only in a started combat, and only
 * for a creature in it. Out of combat both kinds are done at once (R3, R4).
 */
export function armourChangeInCombat({ combatStarted, actorInCombat, item }) {
  return Boolean(combatStarted && actorInCombat && armourChangeKind(item));
}

/** Quick Donning's degrees, as the check reports them, by what they mean. */
const QUICK_BEST = new Set(["heroic", "critical"]);
const QUICK_SUCCESS = new Set(["success"]);
const QUICK_FUMBLE = new Set(["fumble", "blunder"]);
export const QUICK_DONNING_DEGREES = Object.freeze(["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);

/**
 * Quick Donning's printed time for this change, in AP, or what it does to the
 * usual time.
 *
 *   Critical: "2 rounds to don light armour, 1 minute to don medium or heavy
 *             armour, and 2 rounds to remove any armour."
 *   Success:  "5 rounds to don light armour, 2 minutes to don medium or heavy
 *             armour, and 5 rounds to remove any armour."
 *   Fumble:   "twice the usual time to don or remove the armour."
 *
 * @returns {{ap: number}|{multiplier: number}|null} null: no effect (a
 *   failure, or no result).
 */
function quickDonningEffect(degree, { category, removing = false } = {}) {
  const key = String(degree ?? "").toLowerCase();
  const cat = armourCategory(category);
  if (QUICK_FUMBLE.has(key)) return { multiplier: 2 };
  if (!cat) return null;
  if (QUICK_BEST.has(key)) {
    if (removing || cat === "light") return { ap: 2 * AP_PER_ROUND };
    return { ap: 1 * AP_PER_MINUTE };
  }
  if (QUICK_SUCCESS.has(key)) {
    if (removing || cat === "light") return { ap: 5 * AP_PER_ROUND };
    return { ap: 2 * AP_PER_MINUTE };
  }
  return null;
}

/**
 * How long this change takes, in AP.
 *
 * @param {object} p
 * @param {{ap: number, label?: string}|null} p.usual the armour's own time
 *   (`donningTimeFor`: the chapter's time, doubled for a full suit, or a
 *   rune's). R1: the same figure serves for removing.
 * @param {string} p.category light | medium | heavy
 * @param {boolean} [p.removing]
 * @param {{degree: string, by?: string}|null} [p.quick] a Quick Donning
 *   result waiting on this creature (R5)
 * @returns {{ap: number, label: string, usualAP: number, quick: string, why: string}|null}
 */
export function armourChangeTime({ usual, category, removing = false, quick = null }) {
  const usualAP = Number(usual?.ap);
  if (!Number.isFinite(usualAP)) return null;
  let ap = usualAP;
  let why = "";
  const degree = String(quick?.degree ?? "").toLowerCase();
  const effect = quick ? quickDonningEffect(degree, { category, removing }) : null;
  const by = quick?.by ? ` (${quick.by})` : "";
  if (effect && "multiplier" in effect) {
    ap = usualAP * effect.multiplier;
    why = `Quick Donning fumbled${by}: twice the usual time.`;
  } else if (effect && "ap" in effect) {
    // Q3: the shorter of the feat's time and the armour's own.
    if (effect.ap < usualAP) {
      ap = effect.ap;
      why = `Quick Donning ${degree === "success" ? "succeeded" : "critically succeeded"}${by}: ${describeAP(effect.ap)}.`;
    } else {
      why = `Quick Donning${by} gives ${describeAP(effect.ap)}; the armour's own time is shorter and stands.`;
    }
  } else if (quick) {
    why = `Quick Donning${by} gave no improvement: the usual time.`;
  }
  return { ap, label: describeAP(ap), usualAP, quick: quick ? degree : "", why };
}

/** A new task. */
export function newArmourTask({ item, removing, time, quick = "" }) {
  return {
    itemId: item?.id ?? "",
    itemName: item?.name ?? "",
    removing: Boolean(removing),
    total: Math.max(0, Math.trunc(Number(time?.ap) || 0)),
    paid: 0,
    quick: String(quick ?? "")
  };
}

/** AP still owed on a task. */
export function armourTaskRemaining(task) {
  return Math.max(0, Number(task?.total ?? 0) - Number(task?.paid ?? 0));
}

/**
 * What to pay on this turn: everything still owed, or every AP the creature
 * has, whichever is less. At 0 AP it is 1, so the "Not Enough AP" prompt
 * asks rather than a payment of nothing being taken.
 */
export function armourPayment(task, available) {
  const remaining = armourTaskRemaining(task);
  if (remaining <= 0) return 0;
  const have = Math.max(0, Math.trunc(Number(available) || 0));
  return Math.min(remaining, Math.max(1, have));
}

/** The task once `ap` more is paid. `done` when nothing is owed. */
export function armourTaskAfter(task, ap) {
  const paid = Math.min(Number(task?.total ?? 0), Number(task?.paid ?? 0) + Math.max(0, Number(ap) || 0));
  const next = { ...task, paid };
  return { task: next, done: armourTaskRemaining(next) <= 0 };
}

/** The verb, for cards and buttons. */
export function armourVerb(removing, { ing = false } = {}) {
  if (removing) return ing ? "Removing" : "Remove";
  return ing ? "Donning" : "Don";
}

/** The progress line on a card. */
export function armourProgressLine(task) {
  const remaining = armourTaskRemaining(task);
  const verb = armourVerb(task?.removing, { ing: true });
  if (remaining <= 0) {
    return task?.removing
      ? `<strong>${task.itemName}</strong> is off.`
      : `<strong>${task.itemName}</strong> is on, and worn.`;
  }
  return `${verb} <strong>${task.itemName}</strong>: ${task.paid} of ${task.total} AP paid, ${remaining} AP to go.`;
}

/**
 * The time with its AP, once (3.703.1). `describeAP` already names the AP
 * for rounds ("5 rounds (15 AP)") but not for minutes ("2 minutes"), so the
 * GM's dialog printed "5 rounds (15 AP) (15 AP)". Found in the 3.703.0 live
 * test; Graham: "fix the display glitch".
 */
export function armourTimeWithAP(time) {
  const label = String(time?.label ?? "");
  return /\bAP\b/.test(label) ? label : `${label} (${time?.ap ?? 0} AP)`;
}

/** The sentence on an out-of-combat change's card (R3). */
export function armourTimeLine(name, removing, time) {
  return `${removing ? "Taking off" : "Putting on"} <strong>${name}</strong> takes <strong>${time.label}</strong>.`;
}
