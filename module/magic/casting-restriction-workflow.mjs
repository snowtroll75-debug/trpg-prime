/**
 * WHEN A CRITICAL TAKES YOUR SPELLCASTING AWAY.
 *
 * NEW at 3.581.0, for the pages 211-220 audit's D5 and D6 and Graham's
 * R5 and R6 of 21 September 2026.
 *
 * Three rows across the later tables restrict a caster, and all three
 * were printed on the card and honoured by nothing:
 *
 *   Force 96    "Target Injured 3, Fatigued 2, and CANNOT CAST SPELLS
 *                FOR (D)."
 *   Aligned 57  "Target CANNOT USE VERBAL COMPONENTS until the end of
 *                their next turn and are Stunned 2."
 *   Force 39    "Target is Stunned 1 and SPELLCASTING REQUIRES A SPELL
 *                CONCENTRATION SUCCESS next round."
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SCOPES AND A REQUIREMENT, because the casting path has exactly two
 * gates to hang them on and one action to demand.
 *
 *   SPELLS      refuses the cast outright, beside Rage's own "You cannot
 *               cast spells" — the same place, before anything is spent
 *               or rolled, so a blocked attempt costs nothing. That
 *               ordering is not decoration: a lockout that refused after
 *               the PP had left the pool would be a worse rule than no
 *               lockout at all.
 *   VERBAL      refuses only a spell with a verbal component, which the
 *               cast path already inspects for the page-202 breath
 *               rules. An innate cast is untouched, for the same reason
 *               it is untouched underwater.
 *   CONCENTRATION demands a Spell Concentration success first, which is
 *               an action this system already has with its own DC rules.
 *
 * WHAT IS DELIBERATELY NOT HERE. "Cannot speak" beyond its verbal
 * consequence, "cannot use the hand" (Piercing 71) and "cannot use the
 * arm" stay printed text. There is no somatic gate in this system to
 * honour them, and inventing one to hold a single row would be a worse
 * answer than saying plainly that it is still prose.
 *
 * THE RESTRICTION IS AN ACTIVE EFFECT, so a GM can see it, clear it, and
 * so it survives a reload — and so the ordinary clocks expire it. A
 * lockout with a round duration is swept by `expireTimedConditions`; one
 * tied to a bleed is swept by the linked-condition cascade; one with a
 * world-time end by the world clock. It needs no sweeper of its own,
 * which is the point of stamping the same flags everything else uses.
 */
const SYSTEM_ID = "trg-prime";
export const CASTING_RESTRICTION_FLAG = "castingRestriction";
const EXPIRY_FLAG = "conditionExpiresRound";
const ENDS_WITH_FLAG = "conditionEndsWith";
const END_TIME_FLAG = "conditionExpiresTime";

const NAMES = Object.freeze({
  spells: "Cannot Cast Spells",
  verbal: "Cannot Use Verbal Components",
  concentration: "Spell Concentration Required"
});

/**
 * Put the restriction on the target and say what it did.
 *
 * @param {Actor} actor the target
 * @param {object} options
 * @param {object|null} options.lockout from `castingLockout`
 * @param {object|null} options.concentration from `concentrationRequirement`
 * @param {string} options.text the row's effect, for its duration
 * @param {string|null} options.persistenceRounds the row's "for (D)" formula
 * @returns {Promise<string[]>} card lines
 */
export async function armCastingRestriction(actor, {
  lockout = null, concentration = null, text = "", persistenceRounds = null
} = {}) {
  if (!actor?.createEmbeddedDocuments) return [];
  const said = [];

  const game = globalThis.game;
  const round = Number(game?.combat?.round ?? 0);
  const now = Number(game?.time?.worldTime ?? 0);

  if (lockout) {
    const { durationAfter } = await import("../combat/critical-durations.mjs");
    const duration = durationAfter(text, lockout.index);
    const flags = { [SYSTEM_ID]: { [CASTING_RESTRICTION_FLAG]: lockout.scope } };
    let describes = "until a GM removes it";

    if (duration?.kind === "rounds") {
      flags[SYSTEM_ID][EXPIRY_FLAG] = round + Math.max(1, Math.trunc(Number(duration.rounds) || 1));
      describes = duration.label;
    } else if (duration?.kind === "linked") {
      flags[SYSTEM_ID][ENDS_WITH_FLAG] = duration.to;
      describes = duration.label;
    } else if (duration?.kind === "time") {
      const roll = await new globalThis.Roll(duration.formula).evaluate();
      flags[SYSTEM_ID][END_TIME_FLAG] = now + Number(roll.total ?? 0) * (duration.unit === "hour" ? 3600 : 60);
      describes = `for ${roll.total} ${duration.unit}${roll.total === 1 ? "" : "s"}`;
    } else if (persistenceRounds) {
      /*
       * "FOR (D)" IS A DURATION SCOPED TO ONE CLAUSE, on a row whose own
       * Persistence column reads Fatal — so the column cannot answer it
       * and the clause has to. Rolled on the same severity-keyed formula
       * every other (D) uses, rather than on a second scale invented for
       * one row.
       */
      const roll = await new globalThis.Roll(persistenceRounds).evaluate();
      flags[SYSTEM_ID][EXPIRY_FLAG] = round + Number(roll.total ?? 0);
      describes = `for <strong>${roll.total} rounds</strong> (${persistenceRounds})`;
    }

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: NAMES[lockout.scope] ?? NAMES.spells,
      img: "icons/svg/silenced.svg",
      changes: [],
      flags
    }]);
    said.push(
      `<strong>${NAMES[lockout.scope] ?? NAMES.spells}</strong> — ${actor.name} ${describes}.`
    );
  }

  if (concentration) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: NAMES.concentration,
      img: "icons/svg/daze.svg",
      changes: [],
      flags: {
        [SYSTEM_ID]: {
          [CASTING_RESTRICTION_FLAG]: "concentration",
          [EXPIRY_FLAG]: round + Math.max(1, Math.trunc(Number(concentration.rounds) || 1))
        }
      }
    }]);
    said.push(
      `<strong>${NAMES.concentration}</strong> — ${actor.name}'s next spell needs a `
      + "Spell Concentration success first."
    );
  }

  return said;
}

/**
 * What is stopping this actor casting, if anything.
 *
 * @param {Actor} actor
 * @returns {string[]} any of "spells", "verbal", "concentration"
 */
export function castingRestrictionsOn(actor) {
  const found = [];
  for (const effect of Array.from(actor?.effects ?? [])) {
    if (effect.disabled) continue;
    const scope = effect.getFlag?.(SYSTEM_ID, CASTING_RESTRICTION_FLAG);
    if (scope && !found.includes(scope)) found.push(scope);
  }
  return found;
}

/**
 * The gate itself: may this actor cast this spell?
 *
 * @param {Actor} actor
 * @param {object} spellData the spell's system data
 * @param {boolean} isInnate innate casting needs no components
 * @returns {{blocked: boolean, reason: string, concentration: boolean}}
 */
export function castingRefusal(actor, spellData, isInnate = false) {
  const scopes = castingRestrictionsOn(actor);
  if (scopes.includes("spells")) {
    return {
      blocked: true,
      reason: `${actor?.name ?? "They"} cannot cast spells — a critical injury (page 215).`,
      concentration: false
    };
  }
  if (scopes.includes("verbal") && spellData?.components?.verbal && !isInnate) {
    return {
      blocked: true,
      reason: `${actor?.name ?? "They"} cannot use verbal components — a critical injury (page 212).`,
      concentration: false
    };
  }
  return { blocked: false, reason: "", concentration: scopes.includes("concentration") };
}
