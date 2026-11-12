/**
 * THE 0 HP MOMENT (3.684.0; Eldritch Arts Block 6, G7). Two rules the death
 * guards (death-guard.mjs) could not say.
 *
 * 1. "WHEN YOU WOULD FALL UNCONSCIOUS". Subconscious Casting: "When you would
 *    fall unconscious, you may immediately attempt to cast a prepared spell or
 *    known spell with a casting time of 1 AP as a 0 AP action". Graham's Q128:
 *    damage, lethal or subdual, taking you to 0 HP — not sleep or any other
 *    condition; a normal cast (its check, PP + 6, its Focus use); "if the spell
 *    leaves you above 0 HP you do not fall unconscious or gain Dying".
 *    Eternal Vigil's Touch of Healing is the same moment (Q109: once a day, not
 *    against an outright kill, no Dying, healed from 0).
 *
 *    A death guard cannot do it: a guard answers before the blow lands and
 *    names a number of hit points, where these feats run a CAST, whose result
 *    is not known until it is over. So the module's offer is awaited with the
 *    blow already landed — HP written to 0 — and HP is read again after it.
 *    Above 0: the creature neither falls nor gains Dying, and nothing after the
 *    offer (a death guard, massive damage, Dying) is asked. At 0: the blow goes
 *    on exactly as it would have.
 *
 *    NOT ASKED against a blow that kills outright (massive damage) or that
 *    destroys a creature with no Death State: neither falls unconscious, and
 *    Q109 says "not against an outright kill". Subdual damage knocks a creature
 *    out and kills nothing, so it is always asked. With nothing registered,
 *    nothing is asked and no hit point is written early.
 *
 *    The registry is module-api.mjs `registerUnconsciousOffer`; the Foundry
 *    half is zero-hp-moment-workflow.mjs, called from dying-workflow.mjs.
 *
 * 2. A DYING CHECK WAIVED. Last Horizon: "Trigger: you gain the dying
 *    condition … you may act normally and do not need to make a dying check.
 *    If you are not healed before the start of your next turn, the dying
 *    conditions acts as normal." The module keeps the creature conscious
 *    (Smelling Salts' `consciousWhileDying`) and declares, on the actor,
 *
 *      flags.trg-prime.dyingCheckWaived: { effect: <the Dying effect's id>, label: "Last Horizon", actNormally: true }
 *
 *    The next Dying Check of THAT Dying is not rolled (documents/combat.mjs),
 *    the card says why, and the waiver is spent. `actNormally` lets the turn go
 *    on as a conscious creature's would (AP regained) instead of ending at the
 *    check. Naming the effect, as `consciousWhileDying` does, means a waiver
 *    cannot outlive the Dying it was given for: stabilised and dropped again,
 *    the new Dying is a new effect it does not name.
 *
 * Pure.
 */

/** The actor flag that waives a Dying Check. */
export const DYING_CHECK_WAIVED_FLAG = "dyingCheckWaived";

/**
 * Whether the "would fall unconscious" offers are asked for this blow.
 *
 * @param {{subdual?: boolean, massive?: boolean, noDeathState?: boolean}} blow
 */
export function unconsciousOffersAsked({ subdual = false, massive = false, noDeathState = false } = {}) {
  if (subdual) return true;
  return !massive && !noDeathState;
}

/** Did the offers leave the creature standing? Above 0 HP. */
export function unconsciousOfferHeld(hp) {
  return Number(hp) > 0;
}

/** An offer's card lines, as strings; anything else is dropped. */
export function unconsciousOfferLines(answer) {
  const raw = answer?.lines;
  return (Array.isArray(raw) ? raw : (raw ? [raw] : [])).filter((l) => typeof l === "string" && l.trim());
}

/**
 * The waiver for this Dying, or null: `{ label, actNormally }` when the
 * actor's `dyingCheckWaived` names the live Dying effect (a bare id string
 * is accepted too).
 *
 * @param {object} actorFlags `actor.flags["trg-prime"]`
 * @param {string|null} dyingEffectId
 */
export function dyingCheckWaiver(actorFlags, dyingEffectId) {
  const raw = actorFlags?.[DYING_CHECK_WAIVED_FLAG];
  if (!raw || !dyingEffectId) return null;
  const spec = typeof raw === "string" ? { effect: raw } : raw;
  if (typeof spec !== "object" || String(spec.effect ?? "") !== String(dyingEffectId)) return null;
  return {
    label: String(spec.label ?? "").trim() || "A waiver",
    actNormally: spec.actNormally === true
  };
}
