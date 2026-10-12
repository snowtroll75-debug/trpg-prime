/**
 * A DEFENCE WHOSE TYPE THE CASTER CHOOSES.
 *
 * NEW at 3.611.0, block 34 (R3, Graham's ruling of 2 October 2026: "Your
 * recommendation"). Pure; no Foundry. The prompt is in
 * defence-choice-workflow.mjs.
 *
 *   ELEMENT WARD (PP 7), Cast R; Trigger "An effect would deal acid, cold,
 *   electricity, or fire damage to you."
 *   "You gain resistance acid, cold, electricity, or fire damage from the
 *    triggering effect (choose one type)."
 *   +8 PP: you instead gain immunity.
 *
 * THE REACTION'S TIMING IS GRAHAM'S CUTTING WORDS SEQUENCE: the hit is
 * announced at the table, the caster casts, and the damage is applied
 * after. So the resistance is an ordinary `defence` row that lasts until
 * the end of the turn, and the type is asked once, at the cast.
 */

const text = (v) => String(v ?? "").trim().toLowerCase();

/** The printed list a `defence` row offers, or [] for an ordinary row. */
export function defenceValueChoices(effect) {
  if (!effect || typeof effect !== "object") return [];
  const list = Array.isArray(effect.valueChoices) ? effect.valueChoices : [];
  return [...new Set(list.map(text).filter(Boolean))];
}

/** What an unanswered prompt falls back to: the first printed type. */
export function defaultDefenceChoice(choices) {
  return Array.isArray(choices) && choices.length ? choices[0] : "";
}

/** A picked value, refused unless it is one the row printed. */
export function acceptedDefenceChoice(choices, picked) {
  const p = text(picked);
  return Array.isArray(choices) && choices.includes(p) ? p : defaultDefenceChoice(choices);
}
