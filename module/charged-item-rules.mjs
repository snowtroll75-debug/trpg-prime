/**
 * WHAT A MODULE MAY SAY TO A CHARGED ITEM'S SPEND (3.684.0; Eldritch Arts
 * Block 6, G6 — the audit's D12, its feat half; Appendix D's S-M7).
 *
 * Chapter 11's one rule is "a character may only wield one charged item at
 * any one time", reported by the sheet (Graham's R21) and never enforced. The
 * Adept's charged-item feats each bend one part of what an item pays:
 *
 *   Dual Channel      "wield two charged items … If you fumble an activation
 *                     check with one of the items, both items immediately lose
 *                     1 additional PP" (a Fumble or a Blunder, Minor).
 *   Conduit Mastery   "wield up to three … whenever you activate a charged
 *                     item, you may reduce its charge cost by 1 (minimum 1)".
 *   Resonant Conduit  "While wielding two or more charged items, the first
 *                     activation you make each day does not consume a charge".
 *   Weave Infusion    "you may spend your own PP instead of expending those of
 *                     the item … roll on the Item Depletion table after the
 *                     spell has been cast with disadvantage" — Graham's Q131:
 *                     "your PP charged by degree, the item untouched. On that
 *                     table low is worse, so disadvantage keeps the lower d100".
 *   Metamagic Conduit "apply metamagic feats to spells cast from charged items
 *                     … spend your own PP equal to the difference … no more
 *                     than double the item's normal maximum" — Q130: "double
 *                     the PP the item releases that spell at; the wielder pays
 *                     the excess from the pool".
 *
 * So every charged item's PP now leave through ONE spend path
 * (charged-items-workflow.mjs `chargedItemSpend`: Cast from Item's release and
 * a rod's spend), and that path asks the rules registered here. "Activation"
 * is Cast from Item and a rod's own printed power, a metamagic rod's
 * included; drawing your own spell's PP from a Rod of the Magi is a `reason`
 * the rule may read and decline (the audit's n6).
 *
 * The arithmetic is here and pure; the asking is the async helpers at the
 * bottom. A rule that throws costs its own answer, never the spend — logged.
 */
import { registeredChargedItemRules } from "./module-api.mjs";

const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);
const text = (v) => String(v ?? "").trim();

/**
 * How many charged items may be wielded: the highest answer, never below the
 * chapter's one. Pure.
 * @param {Array<number|null>} answers
 */
export function chargedWieldLimit(answers = []) {
  return Math.max(1, ...(Array.isArray(answers) ? answers : []).map(int));
}

/**
 * WHAT THE ITEM PAYS after every rule's cut. Pure.
 *
 *   - `free` from any rule pays nothing (Resonant Conduit);
 *   - the reductions add (two −1 rules are −2), and the result is never below
 *     the highest `minimum` asked (Conduit Mastery's "minimum 1"), nor above
 *     what was due — a floor is a floor, never a surcharge: a Partial's 0 PP
 *     stays 0.
 *
 * @param {number} due what the degree charged before any rule
 * @param {Array<{reduction?: number, minimum?: number, free?: boolean, label?: string}|null>} answers
 * @returns {{pp: number, due: number, free: boolean, cut: number, labels: string[]}}
 */
export function chargedItemCost(due, answers = []) {
  const owed = Math.max(0, int(due));
  const list = (Array.isArray(answers) ? answers : []).filter((a) => a && typeof a === "object");
  const labels = list.map((a) => text(a.label)).filter(Boolean);
  if (!owed) return { pp: 0, due: 0, free: false, cut: 0, labels: [] };
  if (list.some((a) => a.free === true)) return { pp: 0, due: owed, free: true, cut: owed, labels };
  const reduction = list.reduce((s, a) => s + Math.max(0, int(a.reduction)), 0);
  if (!reduction) return { pp: owed, due: owed, free: false, cut: 0, labels: [] };
  const floor = Math.min(owed, Math.max(0, ...list.map((a) => Math.max(0, int(a.minimum)))));
  const pp = Math.max(floor, owed - reduction);
  return { pp, due: owed, free: false, cut: owed - pp, labels };
}

/**
 * The OWN-PP PAYMENT a rule offers, or null: the first answer with `ownPP`.
 * Pure.
 * @returns {{ownPP: true, allowEmpty: boolean, depletionBias: string, label: string, key: string}|null}
 */
export function chargedItemPayment(answers = []) {
  for (const a of Array.isArray(answers) ? answers : []) {
    if (!a || a.ownPP !== true) continue;
    const bias = text(a.depletionBias).toLowerCase();
    return {
      ownPP: true,
      allowEmpty: a.allowEmpty === true,
      depletionBias: ["advantage", "disadvantage"].includes(bias) ? bias : "",
      label: text(a.label) || "Pay from your own PP",
      key: text(a.key)
    };
  }
  return null;
}

/**
 * METAMAGIC ON AN ITEM'S CAST, if any rule allows it (Metamagic Conduit). The
 * ceiling is the most PP the released spell may total: a rule's `ceiling`
 * (the highest given), else Q130's "double the PP the item releases that
 * spell at". Pure.
 * @param {number} releasePP what the item releases the spell at (its warp included)
 * @returns {{allowed: boolean, ceiling: number, labels: string[]}}
 */
export function chargedItemMetamagic(releasePP, answers = []) {
  const list = (Array.isArray(answers) ? answers : []).filter((a) => a && a.allowed === true);
  if (!list.length) return { allowed: false, ceiling: 0, labels: [] };
  const given = list.map((a) => int(a.ceiling)).filter((n) => n > 0);
  const ceiling = given.length ? Math.max(...given) : 2 * Math.max(0, int(releasePP));
  return { allowed: true, ceiling, labels: list.map((a) => text(a.label)).filter(Boolean) };
}

/**
 * WHICH OF TWO d100s CHARGE DEPLETION KEEPS. LOW IS WORSE on that table
 * (01–10 explode), the opposite of the fumble and Resonance tables, so
 * disadvantage keeps the LOWER (Q131) and advantage the higher. Pure.
 */
export function depletionKept(first, second, bias) {
  const a = int(first);
  const b = int(second);
  if (bias === "disadvantage") return Math.min(a, b);
  if (bias === "advantage") return Math.max(a, b);
  return a;
}

/**
 * EVERY RULE'S ANSWER TO ONE QUESTION, in registration order: "wieldLimit",
 * "cost", "payment", "metamagic" or "onRelease". A rule without that method is
 * not asked; one that throws is logged and skipped. Each answer object carries
 * its rule's `key`.
 * @returns {Promise<Array<*>>}
 */
export async function chargedRuleAnswers(method, ctx = {}) {
  const out = [];
  for (const rule of registeredChargedItemRules()) {
    const ask = rule?.[method];
    if (typeof ask !== "function") continue;
    try {
      const answer = await ask({ ...ctx });
      if (answer === null || answer === undefined || answer === false) continue;
      out.push(answer && typeof answer === "object" ? { ...answer, key: rule.key } : answer);
    } catch (err) {
      console.error(`TRG Prime | a module's charged-item rule "${rule?.key}" (${method}) failed`, err);
    }
  }
  return out;
}

/**
 * The wield limit, asked synchronously for the sheet: an `async` rule's
 * promise is not waited on (and counts as no answer). Rules should answer
 * `wieldLimit` plainly. Pure apart from the registry.
 */
export function chargedWieldLimitFor(actor) {
  const answers = [];
  for (const rule of registeredChargedItemRules()) {
    if (typeof rule?.wieldLimit !== "function") continue;
    try {
      const n = rule.wieldLimit({ actor });
      if (typeof n?.then === "function") continue;
      answers.push(n);
    } catch (err) {
      console.error(`TRG Prime | a module's charged-item rule "${rule?.key}" (wieldLimit) failed`, err);
    }
  }
  return chargedWieldLimit(answers);
}
