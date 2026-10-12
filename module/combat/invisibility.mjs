/**
 * INVISIBILITY AT ATTACK TIME (3.597.0).
 *
 * Graham's R12, 27 September 2026: "go with your recommendation" — the
 * `invisible` condition grants the existing avoidance flat check, and See
 * Invisible changes what it grants rather than switching it off.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE HOLE THIS CLOSES: A CONDITION NOTHING READ.
 *
 * `conditions/registry.mjs` has carried `invisible` with a HUD toggle since
 * the condition pass, and `missChanceAvoidance` asked only about `hidden`
 * and `concealed`. So a GM could tick Invisible on a token and the creature
 * was, at the moment anybody swung at it, exactly as visible as before —
 * a vocabulary entry with no driver, which is the defect shape this project
 * has found nine times and which See Invisible made impossible to ignore:
 * a PP 4 spell whose whole job is to counter a condition that did nothing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE BOOK ACTUALLY SAYS, WHICH IS MORE THAN I EXPECTED.
 *
 * APPENDIX, INVISIBLE: "You're undetected to everyone. Creatures can
 * attempt to detect you; if a creature succeeds at a Search (Perception)
 * check against your Stealth DC, you become hidden to that creature… If
 * you become invisible while someone can already see you, you start out
 * hidden to the observer (instead of undetected)."
 *
 * APPENDIX, UNDETECTED: guessing a square "works like targeting a hidden
 * creature (requiring a DC 10 flat check)".
 *
 * So EVERY case in which an attack is actually aimed at an invisible
 * creature resolves at DC 10 — found and therefore hidden, or unfound and
 * guessed at "like hidden". There is no third number to invent. Invisible
 * is the hidden treatment, and that is printed rather than adjudicated.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SEE INVISIBLE DOWNGRADES; IT DOES NOT WAIVE.
 *
 * PRINTED (page 317): "You view invisible creatures as translucent shapes
 * and ethereal beings take shape as eerie apparitions, EACH NOW HAVING THE
 * CONCEALED CONDITION TO YOU." And its +4 PP option: "invisible creatures
 * can be seen clearly and are not concealed."
 *
 * Two tiers, both printed, and BOTH LIVE ON THE ATTACKER — "to you" is the
 * operative phrase. `missChanceAvoidance` already reads attacker-side
 * effects for Blind Fight and for Osp-Iar's `missCheckDCIncrease`, so this
 * is the shape that file already has rather than a new one.
 *
 * AND THE DOWNGRADE MAKES THE DEFENDER WORSE OFF, which is the right
 * direction and is easy to get backwards: the DEFENDER rolls this check, so
 * a HIGHER DC protects them less. Concealed is DC 17 and hidden is DC 10 —
 * so reading an invisible creature as concealed takes it from avoiding on
 * 10+ to avoiding on 17+, and the +4 PP option takes the check away
 * altogether. A spell you paid for helps you. See `verify-see-invisible`
 * L1, which measures that ordering rather than trusting this paragraph.
 */

/** The flag an active See Invisible leaves on the caster. */
export const SEE_INVISIBLE_FLAG = "seeInvisible";

/**
 * What a caster's See Invisible does to an invisible creature.
 *
 * `CONCEALED` is the printed base; `CLEAR` is the +4 PP option. NONE is a
 * caster without the spell, and is null rather than a string so a typo in
 * a flag value cannot read as a level — see `seeInvisibleLevel`.
 */
export const SEE_INVISIBLE = Object.freeze({
  NONE: null,
  CONCEALED: "concealed",
  CLEAR: "clear"
});

const LEVELS = Object.freeze([SEE_INVISIBLE.CONCEALED, SEE_INVISIBLE.CLEAR]);

/** Is this a level this rule knows? */
export function isSeeInvisibleLevel(value) {
  return LEVELS.includes(value);
}

/**
 * The strongest See Invisible on this attacker, or NONE.
 *
 * TAKES THE ITEMS-AND-EFFECTS LIST, not the actor, so the harness can drive
 * every combination without a world — the same reason `counteractableOn`
 * takes a test instead of a document.
 *
 * THE STRONGER LEVEL WINS when a caster somehow holds both, because CLEAR
 * is the warped version of the same spell and a caster who paid the +4 PP
 * should not be handed the cheaper effect by whichever effect the array
 * happened to list first. An UNKNOWN value is ignored rather than trusted:
 * a hand-edited flag reading "yes" must not silently become a level.
 */
export function seeInvisibleLevel(effects = []) {
  let best = SEE_INVISIBLE.NONE;
  for (const effect of Array.isArray(effects) ? effects : []) {
    if (effect?.disabled) continue;
    const value = effect?.getFlag?.("trg-prime", SEE_INVISIBLE_FLAG)
      ?? effect?.flags?.["trg-prime"]?.[SEE_INVISIBLE_FLAG]
      ?? null;
    if (!isSeeInvisibleLevel(value)) continue;
    if (value === SEE_INVISIBLE.CLEAR) return SEE_INVISIBLE.CLEAR;
    best = SEE_INVISIBLE.CONCEALED;
  }
  return best;
}

/**
 * How the card should name what See Invisible did, or "" when it did nothing.
 *
 * THE NOTE IS ABOUT THE INVISIBILITY, NOT ABOUT THE CHECK — a wording fix
 * from the 3.597.0 drive. It first read "(See Invisible — seen clearly)",
 * and a target that was invisible AND concealed printed
 *
 *   "Concealed (See Invisible — seen clearly) — DC 17"
 *
 * which invites the reading that the CONCEALMENT was seen through. It was
 * not: page 64 gave the check to the dim light, and the spell only
 * neutralised the invisibility. The condition label already says what set
 * the DC, so this phrase now says only what happened to the invisibility
 * and the two cannot be confused. Same defect as Scintillating Pattern's
 * "Unaffected." under a line that had just applied a condition: two true
 * statements that read as one false one.
 */
export function seeInvisibleNote(level, invisible) {
  if (!invisible) return "";
  if (level === SEE_INVISIBLE.CLEAR) return " (See Invisible — its invisibility is no help against you)";
  if (level === SEE_INVISIBLE.CONCEALED) return " (See Invisible — its invisibility reads as concealed to you)";
  return "";
}
