/**
 * A HEALING POOL THAT WEARS OUT AS IT IS USED.
 *
 * NEW at 3.470.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * VITAL BEACON.
 *
 *   "You infuse your hands with healing energy. Once per round, either
 *    you or an ally can use an Interact action to touch you and regain
 *    HP. Each time the beacon heals someone; it decreases in strength.
 *    It initially restores 4d12 HP but after each use of healing, the
 *    die type is reduced by one step. After healing 4d4, the spell ends.
 *    You can have only one vital beacon active at a time."
 *
 *   Duration: until your next daily preparations.
 *
 * NOTHING IN THIS SYSTEM WEARS OUT LIKE THIS. Luminance GROWS as it is
 * sustained; a charged item counts uses of a fixed thing. This is the
 * opposite: a fixed number of uses, each weaker than the last, and the
 * spell ends by being spent rather than by a duration expiring. That is
 * why it is a file and not a `heal` row with a number in it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE STEPS ARE THE BOOK'S, AND THE LAST ONE HEALS.
 *
 *   4d12 → 4d10 → 4d8 → 4d6 → 4d4, and then the spell ends.
 *
 * "AFTER healing 4d4" — so the 4d4 IS rolled and IS applied, and the
 * spell ends afterwards. Five uses, not four. An implementation that
 * ended the spell when it reached 4d4 would quietly steal the last heal,
 * and the card would look identical.
 *
 * THE DIE TYPE STEPS, NOT THE COUNT. "the die type is reduced by one
 * step" — four dice throughout. The +2 PP warping option adds a die
 * ("the beacon restores an additional die of HP"), so a warped beacon is
 * 5d12 → 5d10 → … and still five uses. The count and the step are
 * therefore separate fields rather than one formula.
 */

/**
 * Where the caster's beacon lives.
 *
 * ON THE CASTER, NOT ON THE CARD. "You can have only one vital beacon
 * active at a time" is a fact about the caster, so a second cast
 * replaces the first — which per-card state would not have done.
 */
export const BEACON_FLAG = "vitalBeacon";

/**
 * The ladder a beacon passes down, strongest first.
 *
 * THE DEFAULT, NOT THE RULE. The book prints these numbers for this
 * spell, so the pack entry carries them and this is only what a row that
 * declares none falls back to — the same place every other spell's dice
 * live. The printed-damage ratchet reads pack rows, and a mechanism that
 * kept its numbers in code alone would look, correctly, like a spell the
 * pack cannot roll.
 */
export const BEACON_STEPS = Object.freeze([12, 10, 8, 6, 4]);

/** Read a declared ladder, or fall back to the printed one. */
function beaconSteps(raw) {
  // EITHER SHAPE. The pack declares strings ("4d12"); a beacon already
  // burning carries the PARSED steps, and `beaconAfterUse` hands those
  // straight back in. A parser that only read strings would return null
  // for every one of them and silently revert a declared ladder to the
  // default on the beacon's second use — which is the kind of fault that
  // shows up as one wrong die, four heals in.
  const declared = Array.isArray(raw) ? raw : [];
  const sizes = declared
    .map((f) => {
      if (f && typeof f === "object") {
        const size = Math.trunc(Number(f.size));
        return Number.isFinite(size) && size > 0
          ? { dice: Math.max(1, Math.trunc(Number(f.dice)) || BEACON_BASE_DICE), size }
          : null;
      }
      const m = /^([1-9]\d*)d([1-9]\d*)$/i.exec(String(f ?? "").trim());
      return m ? { dice: Number(m[1]), size: Number(m[2]) } : null;
    })
    .filter(Boolean);
  return sizes.length ? sizes : BEACON_STEPS.map((size) => ({ dice: BEACON_BASE_DICE, size }));
}

/** How many dice a beacon rolls before any warping. */
export const BEACON_BASE_DICE = 4;

const int = (v, fallback = 0) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

/**
 * A beacon's state, normalised.
 *
 * @param {object|null} raw whatever is stored on the actor
 * @returns {{dice: number, used: number, lastRound: number|null}}
 */
export function normaliseBeacon(raw) {
  return {
    dice: Math.max(1, int(raw?.dice, BEACON_BASE_DICE) || BEACON_BASE_DICE),
    // HOW MANY TIMES IT HAS HEALED, which is what picks the step.
    used: Math.max(0, int(raw?.used, 0)),
    // THE LADDER THE PACK DECLARED, carried on the beacon so a spell
    // whose entry is edited mid-campaign does not change a beacon that
    // is already burning.
    steps: beaconSteps(raw?.steps),
    lastRound: raw?.lastRound === null || raw?.lastRound === undefined
      ? null
      : int(raw.lastRound, 0)
  };
}

/** Has the beacon been spent to nothing? */
export function beaconExhausted(state) {
  const s = normaliseBeacon(state);
  return s.used >= s.steps.length;
}

/**
 * What the beacon would heal on its next use, or null when it is spent.
 *
 * @returns {string|null} a dice formula
 */
export function beaconFormula(state) {
  const s = normaliseBeacon(state);
  if (s.used >= s.steps.length) return null;
  // THE DECLARED DICE COUNT WINS unless warping added one — `dice` is the
  // beacon's own count and the ladder supplies the die SIZE.
  const step = s.steps[s.used];
  return `${s.dice}d${step.size}`;
}

/**
 * May the beacon be used now?
 *
 * ONCE PER ROUND IS PRINTED, and it is about the BEACON rather than about
 * whoever touches it: "Once per round, either you or an ally can use an
 * Interact action to touch you". So the round is remembered on the beacon
 * and not on the person healed — two allies cannot each take one.
 *
 * OUTSIDE AN ENCOUNTER there is no round, and the honest reading is that
 * the limit does not bite: the spell lasts until your next daily
 * preparations and a party resting between fights is exactly what it is
 * for. Recorded rather than assumed, because the alternative — one use
 * per session outside initiative — would be a different spell.
 *
 * @param {object|null} state
 * @param {number|null} round the round now, or null outside an encounter
 * @returns {{ok: boolean, why: string}}
 */
export function beaconAvailable(state, round = null) {
  const s = normaliseBeacon(state);
  if (s.used >= s.steps.length) {
    return { ok: false, why: "the beacon is spent" };
  }
  if (round !== null && s.lastRound !== null && s.lastRound === round) {
    return { ok: false, why: "the beacon has already healed this round" };
  }
  return { ok: true, why: "" };
}

/**
 * The beacon after one use.
 *
 * THE STATE MOVES WHETHER OR NOT THE PATIENT NEEDED THE HP. A creature
 * at full health that touches the beacon has still used it — "each time
 * the beacon heals someone" is a use, and the alternative would let a
 * party drain nothing from it at full health and keep every die.
 */
export function beaconAfterUse(state, round = null) {
  const s = normaliseBeacon(state);
  return { dice: s.dice, used: s.used + 1, lastRound: round ?? null, steps: s.steps };
}

/**
 * How much bleeding a use stops, under the +4 PP option.
 *
 * "the beacon may also stop bleeding at a rate of 1 point per die of
 * healing used" — per DIE, so a 4-dice beacon stops 4 points. Declared
 * per beacon rather than assumed, since it is an option somebody paid
 * for.
 */
export function beaconBleedStopped(state, warped = false) {
  return warped ? normaliseBeacon(state).dice : 0;
}

/** What the card says when the beacon heals. */
export function beaconLine(name, healed, formula, rolled, bleedNote = "") {
  return `<strong>Vital Beacon</strong>: ${name} `
    + (healed > 0
      ? `regains <strong>${healed}</strong> HP (${formula} rolled ${rolled}).`
      : `is already at full health — no healing (${formula} rolled ${rolled}).`)
    + bleedNote;
}

/** What the card says when the last die has been spent. */
export function beaconEndsLine() {
  return "<em>The beacon fades — its last light is spent.</em>";
}

/** What the card says when it cannot be used. */
export function beaconRefusal(why) {
  return `<em>Vital Beacon does nothing — ${why}.</em>`;
}
