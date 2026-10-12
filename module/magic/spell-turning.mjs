/**
 * A WARD THAT TURNS A SPELL BACK ON ITS CASTER.
 *
 * NEW at 3.608.0, for R6 of the pages 321–330 audit. Pure; no Foundry.
 *
 * SPELL TURNING (PP 14, page 326), 3 AP, 1 hour
 *   "You throw up a defensive ward which turns spells back at their
 *    caster. Each time you're the target of a spell, you may as a reaction,
 *    make a counteract check using your Spellcraft bonus and the PP cost of
 *    this casting of Spell Turning. If you are successful, the spell is
 *    turned back on its caster (they must deal with the spell as if it were
 *    successfully cast on them using their Spellcasting result)."
 *
 * ─────────────────────────────────────────────────────────────────────
 * A WARD THE CASTING READS, LIKE SANCTUARY (3.598.0, Graham's R1).
 *
 * The reaction is not a spell cast in answer to an announcement — the
 * ward is already up — so it is not Cutting Words' road. It is asked
 * where the question arises: a casting that has SUCCEEDED and names the
 * warded creature as a target. The warded creature's controller answers;
 * a yes spends its reaction and rolls the counteract check at once,
 * because every number the check needs is known at that moment and none
 * of them is known before it.
 *
 * THE CHECK (Chapter 8's counteract, `counteractModifier`): Spellcraft,
 * plus 2 per PP this Spell Turning was cast at above the incoming spell
 * (minus 2 per PP below), against the DC of the effect. For a spell being
 * cast that DC is read as ITS CASTER'S SPELLCASTING RESULT — the number
 * the page itself says the turned spell is resolved with, and the only DC
 * a casting has that the turning is opposing.
 *
 * "THE TARGET OF A SPELL": a spell that names targets. An area spell
 * catches the warded creature without targeting it, so nothing is offered.
 *
 * ON A SUCCESS the warded creature's place among the targets is taken by
 * the caster, and the spell resolves as cast — the same Spellcasting
 * result, the same saves, now rolled by the caster.
 */

import { counteractModifier } from "../counteract.mjs";

/** The flag the warded creature's effect carries. */
export const SPELL_TURNING_FLAG = "spellTurning";

const text = (v) => String(v ?? "").trim();
const int = (v) => Math.trunc(Number(v) || 0);

/** A `spellTurning` row or stored record, or null. */
export function normaliseSpellTurning(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && text(raw.kind) !== "spellTurning") return null;
  return { label: text(raw.label) || "Spell Turning", pp: Math.max(0, int(raw.pp)) };
}

/**
 * Can this casting be turned at all? A spell that NAMES TARGETS and is not
 * an area. A spell with no Targets line — Shield, Stoneskin — targets
 * nobody even if the caster happens to have a token marked.
 */
export function castCanBeTurned(spellData) {
  return Boolean(text(spellData?.targets)) && !text(spellData?.area);
}

/** The counteract row the check carries, or null when the PP are equal. */
export function turningModifierRow(turnPP, incomingPP) {
  const value = counteractModifier(int(turnPP), int(incomingPP));
  if (!value) return null;
  return { label: `Counteract (${int(turnPP)} vs ${int(incomingPP)} PP)`, value, type: "circumstance" };
}

/** The card lines. */
export function turnedLine(label, holderName, spellName, casterName) {
  return `<strong>${label}</strong>: ${holderName} turns <strong>${spellName}</strong> back on `
    + `<strong>${casterName}</strong> — it resolves on its caster with the same Spellcasting result.`;
}

export function notTurnedLine(label, holderName, spellName) {
  return `<em>${label}: ${holderName} fails to turn ${spellName} — it lands as cast.</em>`;
}
