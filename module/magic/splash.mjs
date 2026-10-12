/**
 * SPLASH — DAMAGE THAT LANDS ON THE TARGET AND SPATTERS THE REST.
 *
 * NEW at 3.482.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * REPORTED FROM A LIVE SESSION, 2 September 2026.
 *
 * Graham: "when a caster in my session last night used orb of acid, it
 * reported no splash damage."
 *
 *   ORB OF ACID   "If you hit, you deal 1d6 acid damage PLUS 1 SPLASH
 *                  acid damage."
 *                  CL 4+: the damage increases by 1d6 and the splash by 1.
 *
 *   ACID BOLT     "4d6 acid damage plus 2 SPLASH acid damage, and on a
 *                  critical hit the target also takes 1 persistent."
 *
 * Both carried `effects: []`. The splash was printed prose read by
 * nothing — the target took the dice and nothing else happened.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE PRINTED-DAMAGE RATCHET NEVER CAUGHT IT.
 *
 * `verify-printed-damage` finds numbers the pack cannot roll by matching
 * `\b(\d+)d(\d+)\b` — DICE. A spell printing "1 splash acid damage"
 * carries no dice expression at all, so the whole class of FLAT printed
 * damage is invisible to the instrument built to find exactly this.
 *
 * That gap is the more valuable half of this finding, and it is why
 * `verify-flat-damage` exists beside the dice ratchet rather than this
 * being a two-spell fix.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BOOK NEVER DEFINES SPLASH — AND THE SYSTEM ALREADY HAD TWO ANSWERS.
 *
 * "Splash" appears on two spells and six alchemical items. This said it was
 * defined nowhere and "not even an Appendix 3 trait with text"; it IS one
 * (page 409, found by block 39's audit, A20): a critical multiplies the
 * splash by its severity and a miss scatters the bomb half the throw. Both
 * are applied from 3.622.0 (trait-rules.mjs). The radius is still unprinted.
 * The ruling below was asked for before that page was read, and turned up
 * something worse than the missing spell mechanism:
 *
 *   `alchemical-workflow.mjs` opens with "SPLASH IS APPLIED TO THE
 *   TARGET AND REPORTED FOR EVERYONE ELSE" — and its code applies only
 *   the main damage. Splash landed on NOBODY, the target included. The
 *   comment asserted a reading the code never implemented, which is the
 *   same defect shape as Healing Channel's "+10 is IN ADDITION" and the
 *   reason this project distrusts a comment as evidence.
 *
 * GRAHAM'S RULING, 3 September 2026, having been shown that: THE TARGET
 * TAKES THE SPLASH, adjacent creatures are named on the card and applied
 * by hand, and BOMBS ARE FIXED IN THE SAME RELEASE so there is one
 * answer rather than two.
 *
 * THE RADIUS IS STILL NOT INVENTED. "Adjacent" is the card's word and
 * the GM's judgement, because the book prints no distance and guessing
 * one would silently rule for every splash item in the game at once.
 */

const text = (v) => String(v ?? "").trim();

/** Read a splash amount, tolerant of "0", "", null and numbers. */
export function splashAmount(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * A splash written as dice (3.622.1; the 3.622.0 drive's F5, Graham's R5).
 * Shard Bomb prints "1d4 splash damage", and `splashAmount` reads only a
 * number, so the bomb had no splash at all: no line on a hit, no scatter on a
 * miss. A dice splash is rolled ONCE per throw — the same splash lands on
 * everything it reaches — and the rolled number then goes everywhere a
 * printed number does.
 */
export function splashIsDice(value) {
  return /^\s*\d*\s*d\s*\d+(\s*[+-]\s*\d+)?\s*$/i.test(String(value ?? ""));
}

/** Does this row carry splash worth applying? */
export function hasSplash(value) {
  return splashAmount(value) > 0;
}

/**
 * A splash row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {object|null}
 */
export function normaliseSplash(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "splash") return null;
  const amount = splashAmount(raw.amount);
  if (!amount) return null;
  const damageType = text(raw.damageType).toLowerCase();
  if (!damageType) return null;
  return {
    label: text(raw.label) || "Splash",
    amount,
    damageType,
    // PER CASTER LEVEL STEP, declared rather than derived. Orb Of Acid's
    // "CL 4+: the splash damage by 1" is a ladder the pack already
    // carries for its dice; the splash climbs beside it.
    perStep: splashAmount(raw.perStep)
  };
}

/**
 * The splash a cast actually deals, after caster-level steps.
 *
 * @param {object|null} spec
 * @param {number} steps how many CL thresholds have been passed
 * @returns {number}
 */
export function splashTotal(spec, steps = 0) {
  if (!spec) return 0;
  const extra = spec.perStep * Math.max(0, Math.trunc(Number(steps) || 0));
  return spec.amount + extra;
}

/**
 * The splash's share of the damage line's own formula.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND BY DRIVING 3.483.0, and it is the same defect twice.
 *
 * 3.482.0 printed the splash as its own sentence — "…and 3 acid splash
 * (3)" — pushed BEFORE the hit and damage lines. On a live CL 8 Orb Of
 * Acid the card read:
 *
 *     …and 3 acid splash (3).
 *     Splash 3 acid — to every creature adjacent to the target.
 *     Hit vs ZZCS Target — attack 74 vs DB 10. Critical Hit (deadly)
 *     16 ACID DAMAGE (3D6, WARPED) — now 914 HP.
 *
 * TWO THINGS WRONG, BOTH MINE. The "…and" sentence arrived two rows
 * above the thing it continues, so it read as a sentence with no
 * beginning. And the damage line said `(3d6, warped)` beside a 16 that
 * INCLUDES the 3 splash — a formula that does not produce the number
 * next to it. A player checking their own maths finds a discrepancy
 * they cannot explain, which is exactly the fault 3.481.0 existed to
 * fix, one release later, in code I had just written.
 *
 * SO THE SPLASH BECOMES PART OF THE FORMULA IT IS PART OF. The damage
 * is one blow — "1d6 acid damage PLUS 1 splash acid damage" — and now
 * reads as one: `16 acid damage (3d6 warped + 3 splash)`.
 *
 * @param {object|null} spec
 * @param {number} amount the splash actually added
 * @returns {string} a fragment for the damage line, or ""
 */
export function splashFormulaNote(spec, amount) {
  const n = splashAmount(amount);
  if (!spec || !n) return "";
  return ` + ${n} splash`;
}

/**
 * What the card says about everyone else.
 *
 * NAMED, NOT APPLIED. The book prints no radius for splash anywhere —
 * not for the spells and not for the six alchemical items that use the
 * word — so the creatures it reaches are the GM's call. Saying so on the
 * card is the honest half: the alternative is a number nobody was told
 * about, or a silence that reads as the splash not existing, which is
 * exactly what Graham reported.
 */
export function splashNeighboursLine(spec, amount) {
  // AND IT FOLLOWS THE DAMAGE LINE, not precedes it. This used to be
  // pushed before the hit was even reported; the neighbours' share only
  // makes sense once the reader knows the blow landed.
  return `<strong>Splash ${amount} ${spec.damageType}</strong> — to every creature adjacent to the target. `
    + "<em>Applied by hand: the book prints no radius for splash.</em>";
}

/**
 * What the card says when an immune target eats the splash too.
 *
 * KEPT AS ITS OWN SENTENCE because the damage line has already said
 * "immune … no damage", and repeating the splash inside a formula that
 * produced nothing would be noise.
 */
export function splashImmuneLine(spec, targetName) {
  return `<em>${targetName} is immune to ${spec.damageType} — the splash does nothing to them either.</em>`;
}
