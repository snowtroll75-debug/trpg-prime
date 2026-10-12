/**
 * ADJUSTING A CREATURE'S LEVEL (3.633.0; Fiends & Fables 3.0 block 3,
 * ruling R13 — Graham, 11 October 2026). Bestiary page 5:
 *
 *   "Sometimes it is handy to be able to increase or decrease the power level
 *    of a creature quickly. To do this you may adjust the creature's EL by
 *    +/- 1. Each increment adds +1 to all d20 variables (attack, skills,
 *    saving throws, spellcraft etc), DB and also modifies the creature's HP
 *    by 8 for each level added or removed."
 *
 * A GM-only number on the NPC sheet, `flags.trg-prime.elAdjust`, read at
 * preparation: one untyped row per d20 pool and DB, and 8 HP a step. Bounded
 * to ±5 — "quickly" is the page's word, not a second levelling system.
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
const EL_ADJUST_FLAG = "elAdjust";
const EL_ADJUST_LIMIT = 5;
const EL_ADJUST_HP_PER_STEP = 8;

/** The adjustment on an actor, a whole number in [-5, 5]; 0 when none. */
export function elAdjustOf(actor) {
  const raw = Math.trunc(Number(actor?.flags?.[SYSTEM_ID]?.[EL_ADJUST_FLAG]) || 0);
  return Math.max(-EL_ADJUST_LIMIT, Math.min(EL_ADJUST_LIMIT, raw));
}

/**
 * The pool paths and the row each receives. Skills and specialist skills
 * are listed from the actor's own keys.
 * @param {object} system
 * @param {number} steps
 * @returns {{path: string, entry: object}[]}
 */
export function elAdjustRows(system, steps) {
  const n = Math.trunc(Number(steps) || 0);
  if (!n) return [];
  const entry = { label: `EL adjustment ${n > 0 ? "+" : ""}${n}`, value: n, type: "untyped", source: "elAdjust" };
  const paths = [
    "system.combat.attack",
    "system.combat.defence",
    "system.combat.saves.fortitude",
    "system.combat.saves.reflex",
    "system.combat.saves.will",
    "system.magic.spellcraft",
    ...Object.keys(system?.skills ?? {}).map((k) => `system.skills.${k}`),
    ...Object.keys(system?.specialistSkills ?? {}).map((k) => `system.specialistSkills.${k}`)
  ];
  return paths.map((path) => ({ path, entry: { ...entry } }));
}

/** The HP the adjustment adds (or removes). */
export function elAdjustHP(steps) {
  return Math.trunc(Number(steps) || 0) * EL_ADJUST_HP_PER_STEP;
}
