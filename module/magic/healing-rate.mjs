/**
 * A SPELL THAT GRANTS FAST HEALING OR REGENERATION.
 *
 * NEW at 3.591.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * METABOLISM (PP 18, 10 minutes): "you gain Regeneration 5".
 *
 * BOTH RATES HAVE EXISTED FOR MONTHS AND NO SPELL COULD GRANT EITHER.
 * `documents/combat.mjs` heals from a `fastHealing` flag at the start of
 * a turn; `injury-workflow.mjs` reads `fastHealing` AND `regeneration`
 * against the Injured condition on their two cadences. The only writer
 * of either, measured across every pack, is the Fast Healer feat's
 * `fastHealing: 1`.
 *
 * So this kind does not build a mechanism. It opens one.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TWO RATES ARE THE SAME SENTENCE FOR HIT POINTS AND DIFFERENT FOR
 * INJURIES, which is the whole reason they are two flags rather than one
 * number. Page 193:
 *
 *   "A creature with fast healing or regeneration regains the listed
 *    amount of Hit Points each round at the beginning of its turn.
 *    ... Fast Healing reduces your Injured condition by its value every
 *    hour. Regenerate does the same, every 10 minutes."
 *
 * Six times the injury rate is not a rounding difference, so a row that
 * said "healing 5" and let something downstream decide which kind it was
 * would be guessing at a factor of six. The row names the rate.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE CREATURE CODEX'S REGENERATION IS NOT THIS. That one heals the
 * creature's LEVEL, stops it dying while it runs, and switches off for a
 * turn when the creature takes a hit as big as the rate — and it has its
 * own rail in creature-turn-start.mjs, which posts a card with a button
 * because the off-switch needs a person to answer it.
 *
 * A spell granting "Regeneration 5" is the CORE rule: a listed number on
 * the same turn clock as fast healing, with the faster injury cadence.
 * Metabolism says so itself, in the sentence that would be redundant
 * under the Codex reading: "If you are subjected to an effect or attack
 * which kills you instantly then this spell has no benefit."
 */

const text = (v) => String(v ?? "").trim();

/**
 * The rates something can actually be given.
 *
 * NAMED, AND THE NAMES ARE THE FLAGS THE READERS READ. A row that could
 * ask for "healing" or "regen" would be a third spelling for a thing two
 * files already agree on, and the first misspelling would be silent.
 */
export const HEALING_RATES = Object.freeze(["fastHealing", "regeneration"]);

/** How often each rate takes a point off the Injured condition. */
export const INJURY_CADENCE = Object.freeze({
  fastHealing: "every hour",
  regeneration: "every 10 minutes"
});

/**
 * A healing-rate row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {{rate:string, value:number, label:string}|null}
 */
export function normaliseHealingRate(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "healingRate") return null;

  const rate = HEALING_RATES.find((r) => r.toLowerCase() === text(raw.rate).toLowerCase()) ?? null;
  if (!rate) return null;

  // A RATE OF ZERO IS NOT A GRANT. Left to the arithmetic it would create
  // an effect on the sheet that heals nothing and says it is healing —
  // the shape `normaliseLightShift` refuses a zero-step circle for.
  const value = Math.trunc(Number(raw.value) || 0);
  if (value <= 0) return null;

  return { rate, value, label: text(raw.label) };
}

/** The name the card and the sheet should use for a rate. */
export function healingRateName(rate) {
  return rate === "regeneration" ? "Regeneration" : "Fast Healing";
}

/** What the card says when the rate is granted. */
export function healingRateLine(spec, targetName, durationText = "") {
  return `<strong>${targetName}</strong> gains `
    + `<strong>${healingRateName(spec.rate)} ${spec.value}</strong>${durationText}`
    + ` &mdash; ${spec.value} HP at the start of each of their turns, and `
    + `${spec.value} off the Injured condition ${INJURY_CADENCE[spec.rate]}.`;
}
