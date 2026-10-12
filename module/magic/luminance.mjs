/**
 * LUMINANCE (Cleric, PP 7) — an emanation that acts on a clock rather
 * than on a boundary.
 *
 * NEW at 3.435.0. Pure; no Foundry.
 *
 *   Duration 1 minute (D); 10-foot radius centred on you
 *
 *   "A bright light emanates from you in a 10-foot radius (increasing
 *    the light level by three steps). All creatures that BEGIN THEIR
 *    TURN in the radius of the spell are healed of 1d8 HP, or in the
 *    case of an Undead creature, take 1d8 HP of essence damage.
 *    At the beginning of each of your turns, you can Sustain the spell
 *    to increase the healing (or damage to undead) by 1d8 (max 5d8) or
 *    allow the spell to remove 1 point of bleed damage."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE FIFTH MECHANISM, and the first that is not about MEMBERSHIP.
 *
 * magic/emanation.mjs records four ways an area can matter while a spell
 * runs. Every one of them answers "what is true of you while you stand
 * here": Bless's travelling bonus, Bane's remembered save, Song Of
 * Despair's floor on recovery, Protective Ward's growing circle.
 *
 * Luminance answers a different question — "what HAPPENS to you, and
 * when". Standing in it does nothing at all; beginning your turn in it
 * heals you. So it hangs off the turn clock, not off the movement sweep
 * that keeps the other four honest, and a creature that walks in and out
 * between turns is never touched.
 *
 * THAT IS WHY THE HEAL IS NOT AN EFFECT. An ActiveEffect describes a
 * continuous state; this is an event with a die roll in it. Modelling it
 * as a bonus would have meant a number on a sheet that healed nobody.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULINGS, 29 August 2026.
 *
 *   - THE HEALING IS AUTOMATIC. No prompt, no offer: a creature that
 *     begins its turn inside is healed, and the card says so.
 *   - AN UNDEAD IS IDENTIFIED BY ITS CREATURE TYPE. Not by a trait
 *     guessed from a name or an alignment — `isUndead` already reads
 *     `details.creatureType`, and this uses it rather than inventing a
 *     second answer to a question the system has already settled.
 *   - THE SUSTAIN ASKS EACH TIME. "+1d8 healing" or "remove 1 more
 *     bleed" is a choice the Bard makes per round, which is what the
 *     printed "or" reads like.
 *   - THE BLEED REMOVAL, ONCE BOUGHT, APPLIES EVERY ROUND to everyone
 *     the spell heals. "Allow the spell to remove" is a capability the
 *     spell gains, not a one-round trade.
 */

/*
 * NOT EXPORTED. Both are the spell's printed figures — 1d8 to start,
 * 5d8 at the cap — and every question a caller has about them is
 * answered by `luminanceState` or `luminanceWarpedLimits`, which apply
 * the warp on the way past. Exporting the raw numbers would invite a
 * second place to add the warp to them, and the uncalled-export ratchet
 * refused them the moment they existed.
 */
const LUMINANCE_BASE_DICE = 1;
const LUMINANCE_MAX_DICE = 5;

/**
 * The state one casting carries, normalised.
 *
 * READ DEFENSIVELY because it is stored on a flag and a spell cast
 * before this release has none of it. A missing record is a spell at its
 * printed strength, which is the correct reading of "nobody has
 * sustained this yet".
 *
 * @param {object|null} stored
 * @param {number} maxDice the cap, raised by warps
 * @returns {{healingDice: number, bleedRemoved: number, maxDice: number}}
 */
export function luminanceState(stored, maxDice = LUMINANCE_MAX_DICE) {
  const cap = Math.max(1, Math.trunc(Number(maxDice) || LUMINANCE_MAX_DICE));
  const dice = Math.trunc(Number(stored?.healingDice));
  return {
    healingDice: Math.min(cap, Number.isFinite(dice) && dice > 0 ? dice : LUMINANCE_BASE_DICE),
    bleedRemoved: Math.max(0, Math.trunc(Number(stored?.bleedRemoved) || 0)),
    maxDice: cap
  };
}

/**
 * The two things a Sustain may buy, and whether each is still worth
 * buying.
 *
 * A CHOICE WITH ONE LIVE OPTION IS STILL PRESENTED, deliberately — the
 * healing option greys out at the cap rather than vanishing, because a
 * picker whose contents change shape is one a player has to re-read
 * every round. `available: false` is the caller's cue to disable, not to
 * omit.
 *
 * @param {object} state from `luminanceState`
 * @returns {Array<{key: string, label: string, available: boolean, reason: string}>}
 */
export function luminanceSustainOptions(state) {
  const { healingDice, bleedRemoved, maxDice } = state;
  const atCap = healingDice >= maxDice;
  return [
    {
      key: "healing",
      label: atCap
        ? `Healing is at its maximum (${maxDice}d8)`
        : `Increase the healing to ${healingDice + 1}d8 (max ${maxDice}d8)`,
      available: !atCap,
      reason: atCap ? `already ${maxDice}d8` : ""
    },
    {
      key: "bleed",
      // NO PRINTED CAP. The spell says "remove 1 point of bleed damage"
      // and the warp sells "or bleed amount by 1"; neither states a
      // ceiling, so none is invented here.
      label: bleedRemoved
        ? `Remove ${bleedRemoved + 1} bleed instead of ${bleedRemoved}`
        : "Also remove 1 bleed from those it heals",
      available: true,
      reason: ""
    }
  ];
}

/**
 * What one Sustain does to the state.
 *
 * REPORTS WHAT CHANGED, NOT WHAT WAS ASKED FOR — the lesson Song Of
 * Despair's card taught on 28 August 2026, and Protective Ward's growth
 * applied at the source a day later. A Sustain spent on healing at the
 * cap moves nothing, and must say so rather than announcing a die it did
 * not add.
 *
 * @param {object} state from `luminanceState`
 * @param {string} choice "healing" | "bleed"
 * @returns {{state: object, changed: boolean, note: string}}
 */
export function luminanceSustain(state, choice) {
  const next = { ...state };
  if (choice === "bleed") {
    next.bleedRemoved = state.bleedRemoved + 1;
    return {
      state: next,
      changed: true,
      note: `it now removes <strong>${next.bleedRemoved}</strong> bleed from those it heals`
    };
  }
  if (state.healingDice >= state.maxDice) {
    return { state, changed: false, note: `its healing is already at its maximum of <strong>${state.maxDice}d8</strong>` };
  }
  next.healingDice = state.healingDice + 1;
  return {
    state: next,
    changed: true,
    note: `its healing rises to <strong>${next.healingDice}d8</strong>`
      + (next.healingDice >= next.maxDice ? " — its maximum" : "")
  };
}

/**
 * The refusal for a Sustain whose CHOSEN option would buy nothing.
 *
 * PROTECTIVE WARD'S RULE, ARRIVING BY A DIFFERENT DOOR. There the whole
 * Sustain is refused at the cap, because a ward at thirty feet has
 * nothing else to sell. Here only ONE of the two options can be
 * exhausted — bleed removal has no printed ceiling — so the refusal is
 * about the CHOICE rather than about the spell, and a Sustain spent on
 * bleed is never refused however high the dice have climbed.
 *
 * THE PICKER ALREADY DISABLES THE CAPPED OPTION, which is why this was
 * reported on 29 August 2026 rather than shipped as a defect: forcing
 * the disabled control was the only way to reach it. A guard behind a
 * disabled control is still worth having — the control is UI, and this
 * is the rule.
 *
 * ASKED OF THE SAME FUNCTION THAT WOULD PERFORM THE CHANGE, never of a
 * second reading of the cap. Two places that decide "is this at its
 * maximum" is how they come to disagree.
 *
 * @param {object} state from `luminanceState`
 * @param {string} choice the option the player picked
 * @param {string} name the spell's name, for the message
 * @returns {string|null}
 */
export function luminanceChoiceRefusal(state, choice, name = "This spell") {
  if (!state || !choice) return null;
  if (luminanceSustain(state, choice).changed) return null;
  return `${name}'s healing is already at its maximum of ${state.maxDice}d8 `
    + "— sustaining it that way would buy nothing. Choose the bleed removal instead.";
}

/**
 * What a creature beginning its turn inside the radius receives.
 *
 * THE UNDEAD INVERSION IS THE WHOLE POINT of the second clause, and it
 * is a different KIND of number rather than a negative one: positive
 * energy heals the living and burns the undead, so this returns a damage
 * packet with a type rather than a negative heal. A negative heal would
 * bypass resistances, immunities and the damage pipeline entirely.
 *
 * @param {object} options
 * @param {object} options.state from `luminanceState`
 * @param {boolean} options.undead the target's creature type is undead
 * @returns {{formula: string, mode: "heal"|"damage", damageType: string|null, bleedRemoved: number}}
 */
export function luminanceTurnEffect({ state, undead = false } = {}) {
  const dice = Math.max(1, Math.trunc(Number(state?.healingDice) || LUMINANCE_BASE_DICE));
  return {
    formula: `${dice}d8`,
    mode: undead ? "damage" : "heal",
    damageType: undead ? "essence" : null,
    // BLEED IS NOT REMOVED FROM THE UNDEAD. The clause reads "remove 1
    // point of bleed damage" as part of what the spell does for those it
    // HEALS; a creature the spell is burning is not being tended.
    bleedRemoved: undead ? 0 : Math.max(0, Math.trunc(Number(state?.bleedRemoved) || 0))
  };
}

/**
 * The cap a casting carries after its warps.
 *
 * "+2 PP: increase the healing amount AND THE SUSTAINED MAX by 1d8" —
 * the warp raises both ends, so a warped Luminance starts at 2d8 and can
 * reach 6d8. Reading it as raising only the starting dice would let a
 * single Sustain hit a cap the caster had paid to lift.
 *
 * @param {object|null} warpMods the accumulated `mods` of chosen warps
 * @returns {{startingDice: number, maxDice: number}}
 */
export function luminanceWarpedLimits(warpMods) {
  const extra = countExtraDice(warpMods?.damageDice);
  return {
    startingDice: LUMINANCE_BASE_DICE + extra,
    maxDice: LUMINANCE_MAX_DICE + extra
  };
}

/** How many d8 a warp's dice string adds. "2d8" is two, "" is none. */
function countExtraDice(formula) {
  const match = /^\s*(\d+)\s*d\s*8\s*$/i.exec(String(formula ?? ""));
  return match ? Math.max(0, Math.trunc(Number(match[1]) || 0)) : 0;
}
