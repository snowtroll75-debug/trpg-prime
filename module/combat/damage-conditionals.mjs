/**
 * CONDITIONALS ON A WEAPON'S DAMAGE ROLL (3.626.1). Pure; no Foundry.
 *
 * `conditionals.mjs` has named "damage" as a check type since the axes
 * were written, and nothing read it: a weapon's damage is a Roll, not a
 * TRGCheck, so a conditional scoped to `checkTypes: ["damage"]` matched
 * no roll the system ever made. Found live on Pillars of Faith 0.8.0 —
 * the Vowkeeper rune's "add your class bonus to damage rolls while
 * pursuing your vow" was declared, offered nowhere, and the module's own
 * Rejuvenating Surge (+N status to attack AND damage) had been applying
 * its attack half only since 0.4.0.
 *
 * This module decides WHAT applies; the workflow beside it asks the
 * table about the rows that need a person and adds the total to the
 * damage formula in one place, before the dice.
 *
 * ONLY MODIFIERS. Advantage and disadvantage are properties of a d20,
 * and a damage roll has none; a row of either kind scoped to damage is
 * an authoring mistake and is left out here rather than guessed at.
 *
 * TYPED STACKING, the way the pools do it: bonuses of one type take the
 * highest, penalties of one type the lowest, untyped sums. Two +2 status
 * bonuses to damage are +2, not +4.
 */

import { CONDITIONAL_KINDS, conditionalRows } from "../conditionals.mjs";

/** The rows that reach THIS damage roll, modifiers only. */
export function damageConditionalRows(entries = [], context = {}) {
  return conditionalRows(entries, { ...context, checkType: "damage" })
    .filter((row) => row.kind === CONDITIONAL_KINDS.MODIFIER && Number.isFinite(Number(row.value)) && Number(row.value) !== 0);
}

/**
 * The total the ticked rows add, with the typed-pool rule, and a card
 * line per row that counted.
 * @param {object[]} rows damageConditionalRows(...) filtered to the ticked ones
 * @returns {{total: number, lines: string[], counted: object[]}}
 */
export function damageConditionalTotal(rows = []) {
  const best = new Map();
  let untyped = 0;
  const counted = [];
  for (const row of rows ?? []) {
    const value = Math.trunc(Number(row?.value) || 0);
    if (!value) continue;
    const type = String(row.type ?? "untyped").trim().toLowerCase() || "untyped";
    if (type === "untyped") { untyped += value; counted.push(row); continue; }
    const key = `${type}:${value > 0 ? "+" : "-"}`;
    const held = best.get(key);
    if (!held || Math.abs(value) > Math.abs(held.value)) best.set(key, { ...row, value, type });
  }
  for (const row of best.values()) counted.push(row);
  const total = untyped + [...best.values()].reduce((sum, row) => sum + row.value, 0);
  const lines = counted.map((row) => {
    const signed = row.value > 0 ? `+${row.value}` : String(row.value);
    const type = String(row.type ?? "untyped").trim().toLowerCase() || "untyped";
    return `${row.label}: ${signed}${type === "untyped" ? "" : ` ${type}`} to damage${row.scope ? ` (${row.scope})` : ""}.`;
  });
  return { total, lines, counted };
}

/** The ids ticked in advance: every row its author marked `auto`. */
export function autoDamageRowIds(rows = []) {
  return (rows ?? []).filter((row) => row.auto).map((row) => row.id);
}
