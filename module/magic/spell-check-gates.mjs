/**
 * A MODULE'S ANSWER TO A CASTING, BEFORE ITS CHECK (3.672.0; Block 8's C5a).
 *
 * Inner Tempest's Spiritual Distraction: "Each time the target casts a spell
 * they must make a saving throw … Partial −2, Failure −4, Fumble −10
 * circumstance to their spell check." The save is the module's to roll; the
 * penalty has to reach a check the system is about to roll, which only the
 * system can do. Spell Drain (3.608.0) is the system's own penalty of this
 * shape and is added at the same moment; a gate is that door for a module.
 *
 * A GATE ADDS; IT DOES NOT STOP. It may return rows for the casting check and
 * lines for the card, and nothing else. A casting refused by a module would
 * be a rule the system cannot see or explain.
 *
 * A FAILING GATE COSTS ITS OWN ANSWER, NOT THE CASTING. Logged, and said on
 * the card, so the table knows a rule did not run.
 */
import { registeredSpellCheckGates } from "../module-api.mjs";
import { BONUS_TYPES } from "../dice/resolution.mjs";

/**
 * What one gate said, cleaned: rows with a label and a finite non-zero value,
 * and lines that are strings. Anything else is dropped.
 * @returns {{modifiers: Array<{label: string, value: number, type: string}>, lines: string[]}}
 */
export function normaliseGateAnswer(out) {
  const modifiers = [];
  const lines = [];
  if (!out || typeof out !== "object") return { modifiers, lines };
  for (const row of Array.isArray(out.modifiers) ? out.modifiers : []) {
    const value = Number(row?.value);
    const label = String(row?.label ?? "").trim();
    if (!label || !Number.isFinite(value) || value === 0) continue;
    const type = String(row?.type ?? "untyped").trim();
    modifiers.push({ label, value, type: BONUS_TYPES[type] ? type : "untyped" });
  }
  for (const text of Array.isArray(out.lines) ? out.lines : []) {
    if (typeof text === "string" && text.trim()) lines.push(text.trim());
  }
  return { modifiers, lines };
}

/**
 * Ask every registered gate, in registration order.
 * @param {{actor: object, spell: object, spellData: object, innate: boolean,
 *   itemCast: boolean, attack: boolean, rollsCheck: boolean}} ctx
 */
export async function runSpellCheckGates(ctx) {
  const modifiers = [];
  const lines = [];
  for (const gate of registeredSpellCheckGates()) {
    try {
      const said = normaliseGateAnswer(await gate(ctx));
      modifiers.push(...said.modifiers);
      lines.push(...said.lines);
    } catch (err) {
      console.error("TRG Prime | a module's spell-check gate failed", err);
      lines.push("<em>A module's answer to this casting failed — see the console.</em>");
    }
  }
  return { modifiers, lines };
}
