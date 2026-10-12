/**
 * A CREATURE'S PRINTED INNATE NUMBERS (3.633.0; Fiends & Fables 3.0 block 3,
 * ruling R1 — Graham, 11 October 2026: "go with your recommendations").
 *
 * A bestiary stat block prints its innate line whole: "Verdant Innate
 * Spells DC 24 (+14)". Core derives the same pair from Chapter 9 —
 * "Innate Attack Bonus = magical ability score + level", "Innate Save =
 * 10 + magical ability score + level" — and for most creatures the two
 * agree once the tradition's ability is set. Where they do not, the book's
 * number is the creature's, so a declared printed pair WINS:
 *
 *   flags.trg-prime.innatePrinted = { dc: 24, attack: 14 }
 *
 * on each innate spell item (the module declares it from the stat block).
 * Either half may be absent; the absent half is derived as before.
 *
 * HIGH MAGIC (R12) is not added to a printed DC — a printed number is the
 * creature's finished number. It IS added to a derived one.
 *
 * Pure.
 */
import { innateAttackBonus, innateSaveDC } from "./casting.mjs";

const SYSTEM_ID = "trg-prime";
const whole = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));

/** The declared printed pair on an innate spell, or null. */
function innatePrintedOf(spell) {
  const raw = spell?.flags?.[SYSTEM_ID]?.innatePrinted;
  if (!raw || typeof raw !== "object") return null;
  const dc = whole(raw.dc);
  const attack = whole(raw.attack);
  if (dc === null && attack === null) return null;
  return { dc, attack };
}

/** The innate attack bonus: printed when declared, else ability + level. */
export function innateAttackFor(spell, magicalAbility, level) {
  const printed = innatePrintedOf(spell);
  if (printed?.attack !== null && printed?.attack !== undefined) return { value: printed.attack, printed: true };
  return { value: innateAttackBonus(magicalAbility, level), printed: false };
}

/** The innate save DC: printed when declared, else 10 + ability + level. */
export function innateSaveFor(spell, magicalAbility, level) {
  const printed = innatePrintedOf(spell);
  if (printed?.dc !== null && printed?.dc !== undefined) return { value: printed.dc, printed: true };
  return { value: innateSaveDC(magicalAbility, level), printed: false };
}
