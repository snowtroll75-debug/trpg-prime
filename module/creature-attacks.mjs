/**
 * Creature natural attacks, and the Codex's own damage-by-size table.
 *
 * The Creature Codex prints ten natural attacks — Bite, Claw, Gore,
 * Hoof, Slam, Sting, Tail Slap, Tentacle, Unarmed Strike, Wings — all in
 * the Brawling group, all with a Fumble DC of 5, and all written for a
 * MEDIUM creature. A second table then steps that damage up or down by
 * size, from -3 to +4 categories.
 *
 * THERE IS ALREADY A LADDER IN THIS SYSTEM, AND IT IS A DIFFERENT ONE.
 * `resizedNaturalDamage` in module/companion.mjs steps a natural attack
 * across sizes for animal companions, on a ladder of 3/4/6/8/10/12
 * inferred from the printed companion attacks. That is not this table
 * and must not be replaced by it:
 *
 *   - The Codex's ladder has rungs the companion one does not: 1, 1d2,
 *     1d5, and everything above 1d12 (1d16, 1d20, 1d30, 1d40). The
 *     companion ladder CLAMPS at 1d12, so on it a Colossal creature's
 *     bite is the same as a Large one's — fine for companions, which
 *     never grow past Huge, and wrong for a dragon.
 *   - The two disagree on printed values. Claws are 1d6 at Medium; the
 *     companion table prints 1d4 at Small and this table gives 1d5. A
 *     Tiny Bite is 1d4 on the companion table and 1d5 here.
 *
 * Both are printed rules from the same author, and neither is a typo I
 * can identify — so both stay, each named for the rule it serves, and
 * the disagreement is reported to Graham rather than resolved by
 * whichever file happened to be written second. This is the same
 * arrangement module/companion.mjs already argues for when it declines
 * to reuse item-quality's die-stepping.
 */

/**
 * The Codex's damage ladder, read off Table 6 rather than assumed.
 *
 * Every row of that table is this one ladder offset by the size
 * difference — 1d4 at -3 sizes is 1, 1d12 at +4 is 1d40 — which is why
 * thirteen rungs replace a seven-column grid. The harness checks the
 * whole grid against it, cell by cell, so "it is one ladder" is a
 * verified claim rather than a convenient reading.
 *
 * The bottom rung is a flat 1, not a die, and is printed that way.
 */
export const CODEX_DAMAGE_LADDER = Object.freeze([1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 30, 40]);

/** The eight sizes, smallest first — the same order SIZE_TABLE uses. */
export const CREATURE_SIZES = Object.freeze([
  "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"
]);

/**
 * A natural attack's damage, moved by a number of size categories.
 *
 * @param {string} damage The Medium-sized damage, e.g. "1d8".
 * @param {number} steps Size categories up (positive) or down (negative).
 * @returns {string|null} e.g. "1d10", "1" at the bottom rung, or null if
 *   the damage is not on the Codex's ladder at all.
 */
export function steppedCreatureDamage(damage, steps) {
  const match = /^(\d+)d(\d+)$/.exec(String(damage ?? "").trim());
  if (!match) return null;
  const count = Number(match[1]);
  const rung = CODEX_DAMAGE_LADDER.indexOf(Number(match[2]));
  if (rung < 0) return null;
  const moved = Math.min(
    CODEX_DAMAGE_LADDER.length - 1,
    Math.max(0, rung + Math.trunc(Number(steps) || 0))
  );
  const faces = CODEX_DAMAGE_LADDER[moved];
  // The bottom of the table is a flat 1 rather than a die, and the
  // document prints it that way. "1d1" would roll the same number and
  // read as a mistake.
  return faces === 1 ? String(count) : `${count}d${faces}`;
}

