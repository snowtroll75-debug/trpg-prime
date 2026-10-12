/**
 * A SALVO WHOSE SIZE IS ITSELF ROLLED.
 *
 * NEW at 3.478.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MISSILE STORM.
 *
 *   "You may target each character in the spell's area of effect with a
 *    massive salvo of Magic Missiles. Each target is hit by 2d6 +6 magic
 *    missiles (each inflicting 1d4+1 force damage) + 1d6 additional
 *    missiles per Size category above Medium."
 *
 *   Arcane, 20 PP, 3 AP, 50-foot radius, Force / Invocation.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOTHING ELSE IN THIS SYSTEM ROLLS DICE TO DECIDE HOW MANY DICE TO
 * ROLL.
 *
 * Every other formula in the pack is a fixed count of a fixed die,
 * possibly stepped by a ladder — `4d6`, or `beaconSteps` walking 4d12
 * down to 4d4. This one rolls `2d6+6` to learn the COUNT, and only then
 * rolls damage. So the count is a first-class result with its own line
 * on the card: a player who took 84 force is owed the number of missiles
 * it came from, or the total is unauditable.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULINGS, 3 September 2026.
 *
 *   IT LANDS AUTOMATICALLY. There is no save line, no defence, and the
 *   sentence is "each target IS HIT BY" — so the salvo is not rolled
 *   against anything. This is the pack's only auto-damage area spell,
 *   which is worth stating plainly rather than leaving a reader to infer
 *   it from a missing field. Twenty PP is what it costs.
 *
 *   Resistance and immunity still bite, because those are core rules
 *   applied by `resolveAgainstDefences` and not by this spell. Graham's
 *   ruling of 2 September 2026 — resistance HALVES and carries no value
 *   — is what makes the bundling below safe; see `stormFormula`.
 *
 *   THE TARGET'S SIZE ADDS THE MISSILES, not the caster's. The sentence
 *   whose subject is "Each target" is the one carrying the size clause,
 *   so a bigger creature catches more of the salvo. This means one cast
 *   produces a DIFFERENT COUNT FOR EACH CREATURE caught — a Huge foe
 *   rolls 2d6+6+2d6 while the Medium one beside it rolls 2d6+6 — and it
 *   is why the count is computed per target rather than once for the
 *   storm.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY ONE BUNDLED ROLL AND NOT N SEPARATE MISSILES.
 *
 * "each inflicting 1d4+1" invites rolling twenty times. `Nd4 + N` is the
 * same distribution — the sum of N independent 1d4+1 IS Nd4+N — so the
 * only thing separate rolls could change is how DEFENCES apply, and in
 * this system they do not change it either: resistance halves, and half
 * the sum equals the sum of the halves. Immunity is all-or-nothing
 * whichever way it is asked.
 *
 * So bundling is not an approximation; it is the same answer with one
 * roll instead of twenty, and the card can still print the missile count
 * because the count is computed first and printed in its own right.
 *
 * (If a later rule ever gave a creature flat reduction PER INSTANCE of
 * damage, this would stop being equivalent. Nothing in this system has
 * one — the defences are resistance, immunity and weakness — and the day
 * one appears, this comment is where to start.)
 */

/** The size ladder this spell counts steps along. */
export const SIZE_LADDER = Object.freeze([
  "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"
]);

/** The size the printed clause measures from. */
export const BASE_SIZE = "medium";

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();
const DICE = /^([1-9]\d*)d([1-9]\d*)$/i;

/**
 * How many size categories above Medium a creature is.
 *
 * NEVER NEGATIVE. A Small creature is one category BELOW Medium, and the
 * printed clause adds missiles "per Size category ABOVE Medium" — it
 * does not subtract them for being small. A signed step count would have
 * given a Tiny target 2d6 FEWER missiles, which is a rule the book does
 * not contain and which could drive the count below zero.
 *
 * AN UNRECOGNISED SIZE COUNTS AS ZERO STEPS rather than throwing or
 * guessing. `template.json` defaults every creature to "medium", so a
 * blank field is a Medium creature; a typo is a creature nobody has
 * sized, and the conservative answer is the printed base salvo.
 *
 * @param {string} size a value from system.identity.size
 * @returns {number} 0 or more
 */
export function sizeStepsAboveMedium(size) {
  const index = SIZE_LADDER.indexOf(lower(size));
  if (index < 0) return 0;
  return Math.max(0, index - SIZE_LADDER.indexOf(BASE_SIZE));
}

/**
 * A missile-storm row, or null when it is malformed.
 *
 * EVERY NUMBER IS DECLARED. The count dice, the flat missiles, the
 * per-size dice and the per-missile damage all come from the pack entry
 * rather than from constants here — the printed-damage ratchet reads
 * pack rows, and a spell whose numbers lived only in code would look,
 * correctly, like a spell the pack cannot roll.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {object|null}
 */
export function normaliseMissileStorm(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "missileStorm") return null;

  const countDice = text(raw.countDice);
  if (!DICE.test(countDice)) return null;

  // THE PER-SIZE DICE ARE OPTIONAL AS A CONCEPT BUT REQUIRED AS A FIELD.
  // A storm row that declared none would silently drop the size clause,
  // and the failure would be invisible: a Huge target would simply take
  // the base salvo and the card would look right.
  const perSizeDice = text(raw.perSizeDice);
  if (!DICE.test(perSizeDice)) return null;

  // THE MISSILE ITSELF — "1d4+1". Stored as its two halves because the
  // bundling above multiplies each by the missile count, and a single
  // string would have to be re-parsed to do it.
  const missileDice = text(raw.missileDice);
  const m = DICE.exec(missileDice);
  if (!m) return null;
  if (Number(m[1]) !== 1) return null; // one die per missile; see stormFormula

  const damageType = lower(raw.damageType);
  if (!damageType) return null;

  return {
    label: text(raw.label) || "Missile Storm",
    countDice,
    flatMissiles: Math.max(0, Math.trunc(Number(raw.flatMissiles) || 0)),
    perSizeDice,
    missileDice,
    missileDieSize: Number(m[2]),
    missileBonus: Math.max(0, Math.trunc(Number(raw.missileBonus) || 0)),
    damageType
  };
}

/**
 * The dice expression that counts one target's missiles.
 *
 * @param {object|null} spec a normalised row
 * @param {string} size the TARGET's size
 * @returns {string|null}
 */
export function stormCountFormula(spec, size) {
  if (!spec) return null;
  const steps = sizeStepsAboveMedium(size);
  const parts = [spec.countDice];
  if (spec.flatMissiles > 0) parts.push(String(spec.flatMissiles));
  // ONE SET OF PER-SIZE DICE PER STEP. Huge is two categories above
  // Medium, so it is 2d6 extra missiles and not 1d6 — "per Size
  // category" counts every category, not merely the fact of being big.
  const m = DICE.exec(spec.perSizeDice);
  if (steps > 0 && m) parts.push(`${Number(m[1]) * steps}d${m[2]}`);
  return parts.join(" + ");
}

/**
 * The damage a known number of missiles deals.
 *
 * @param {object|null} spec
 * @param {number} missiles how many landed
 * @returns {string|null} null when no missile landed at all
 */
export function stormFormula(spec, missiles) {
  if (!spec) return null;
  const n = Math.max(0, Math.trunc(Number(missiles) || 0));
  if (n < 1) return null;
  // N × (1d4 + 1) === Nd4 + N. See the header for why this is the same
  // answer and not a shortcut.
  const flat = n * spec.missileBonus;
  return flat > 0
    ? `${n}d${spec.missileDieSize} + ${flat}`
    : `${n}d${spec.missileDieSize}`;
}

/** What the card says about one target's salvo. */
export function stormLine(spec, name, size, missiles, countFormula, taken, rolled, formula, immune = false) {
  const steps = sizeStepsAboveMedium(size);
  // THE SIZE IS NAMED ONLY WHEN IT CHANGED SOMETHING. Printing
  // "(medium)" beside every Medium target is noise; printing "(huge:
  // +2 sets)" beside the one creature whose size mattered is the
  // explanation a player needs for why their number is bigger.
  const sizeNote = steps > 0 ? ` <em>(${lower(size)} — ${steps} extra ${steps === 1 ? "set" : "sets"})</em>` : "";
  const head = `${name}${sizeNote}: <strong>${missiles}</strong> missiles (${countFormula})`;
  return immune
    ? `${head} — <strong>immune</strong> to ${spec.damageType}.`
    : `${head} — <strong>${taken}</strong> ${spec.damageType} (${formula} rolled ${rolled}).`;
}

/** What the card says when the storm finds nobody. */
export function stormEmptyLine(spec) {
  return `<em>${spec.label} finds nothing in the area to answer.</em>`;
}

/**
 * The note that says this spell asks for no roll.
 *
 * SAID OUT LOUD, because a player watching a 50-foot area spell resolve
 * with no save prompt will otherwise assume the save is broken. Every
 * other area spell in this pack asks for something.
 */
export function stormAutomaticLine(spec) {
  return `<em>${spec.label} requires no attack roll and allows no save — the missiles simply land.</em>`;
}
