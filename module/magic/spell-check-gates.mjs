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
  if (!out || typeof out !== "object") return { modifiers, lines, disadvantage: false, innateCheck: false };
  for (const row of Array.isArray(out.modifiers) ? out.modifiers : []) {
    const value = Number(row?.value);
    const label = String(row?.label ?? "").trim();
    if (!label || !Number.isFinite(value) || value === 0) continue;
    const type = String(row?.type ?? "untyped").trim();
    // `castingOnly` (3.675.0): the row decides the casting's degree against
    // its casting DC and is left out of an attack spell's attack total.
    // `attackOnly` (3.684.0; Eldritch Arts Block 6, G14), the other half:
    // Spellblade's Mark's "+1 circumstance bonus to … spell attacks" against
    // the Mark. Left out of the casting check (its degree and its DC) and
    // stacked in the spell attack's own pool against DB. A row cannot be both.
    const attackOnly = row?.attackOnly === true && row?.castingOnly !== true;
    modifiers.push({ label, value, type: BONUS_TYPES[type] ? type : "untyped", ...(row?.castingOnly === true ? { castingOnly: true } : {}), ...(attackOnly ? { attackOnly: true } : {}) });
  }
  for (const text of Array.isArray(out.lines) ? out.lines : []) {
    if (typeof text === "string" && text.trim()) lines.push(text.trim());
  }
  /*
   * ZONE CASTING RULES (3.685.0, H8; Eldritch Arts' Zone Disruption: "All
   * Spellcraft checks made within the zone are at disadvantage", and "Innate
   * spells … require a Spellcraft check using the innate ability modifier +
   * level against the spell's normal casting DC"; Graham's Q154).
   *   disadvantage  the casting check is rolled at disadvantage (joined with
   *                 any other bias, so an advantage cancels it);
   *   innateCheck   an innate cast rolls a Spellcraft check — innate ability
   *                 + level against 10 + ⌊1.5 × PP⌋ — whose degree is the
   *                 casting's: a failure is a failed casting (the use is
   *                 spent), a Fumble rolls the fumble table.
   */
  return { modifiers, lines, disadvantage: out.disadvantage === true, innateCheck: out.innateCheck === true };
}

/**
 * The rows a casting check takes, and the rows a spell attack's pool takes
 * (3.684.0, G14): an `attackOnly` row is never on the check. Pure.
 * @returns {{check: object[], attackOnly: object[]}}
 */
export function splitGateRows(modifiers = []) {
  const rows = Array.isArray(modifiers) ? modifiers : [];
  return { check: rows.filter((m) => !m?.attackOnly), attackOnly: rows.filter((m) => m?.attackOnly) };
}

/**
 * Ask every registered gate, in registration order.
 * @param {{actor: object, spell: object, spellData: object, innate: boolean,
 *   itemCast: boolean, attack: boolean, rollsCheck: boolean,
 *   targetUuids?: string[]}} ctx  `targetUuids` (3.684.0): the creatures targeted
 */
export async function runSpellCheckGates(ctx) {
  const modifiers = [];
  const lines = [];
  let disadvantage = false;
  let innateCheck = false;
  for (const gate of registeredSpellCheckGates()) {
    try {
      const said = normaliseGateAnswer(await gate(ctx));
      modifiers.push(...said.modifiers);
      lines.push(...said.lines);
      disadvantage = disadvantage || said.disadvantage;
      innateCheck = innateCheck || said.innateCheck;
    } catch (err) {
      console.error("TRG Prime | a module's spell-check gate failed", err);
      lines.push("<em>A module's answer to this casting failed — see the console.</em>");
    }
  }
  return { modifiers, lines, disadvantage, innateCheck };
}

/**
 * THE INNATE CAST'S ZONE CHECK, AS DATA (3.685.0, H8; Q154). Pure. The DC is
 * the spell's normal casting DC, 10 + ⌊1.5 × PP⌋ (`castingDC`); the modifier
 * is the innate ability + level. A Partial reads as it does on any casting.
 *
 * @param {{pp: number, ability: number, level: number}} facts
 * @returns {{dc: number, modifier: number}}
 */
export function innateZoneCheck({ pp = 0, ability = 0, level = 0 } = {}) {
  const p = Math.max(0, Math.trunc(Number(pp) || 0));
  return { dc: 10 + Math.floor(p * 1.5), modifier: Math.trunc(Number(ability) || 0) + Math.max(0, Math.trunc(Number(level) || 0)) };
}
