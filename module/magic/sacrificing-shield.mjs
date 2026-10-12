/**
 * A WOUND TAKEN IN SOMEBODY ELSE'S PLACE.
 *
 * NEW at 3.499.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SACRIFICING SHIELD (PP 1, Reaction, 30 feet, Warding)
 *
 *   "You shield your ally by absorbing their wounds. The HP damage that
 *    would have been inflicted upon them is reduced by 5. However, you
 *    absorb this damage instead, and any immunities, weaknesses, or
 *    resistances you possess do not come into effect. Be aware that you
 *    only absorb HP damage with this spell and suffer no effects from any
 *    other part of the attack."
 *      +1 PP: the damage you redirect increases by 1
 *      +2 PP: you may also absorb any condition that the target suffers
 *
 * WHAT IT CARRIED BEFORE THIS RELEASE: `effects: []`, no duration, no
 * targets. The spell did nothing at all.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE GATE IS THE SAME LINE DELAYED RESPITE USES.
 *
 * "Reduced by 5" is a reduction of HP DAMAGE, and the number arriving at
 * `applyDamageDirect` has already crossed the target's resistances,
 * weaknesses and immunities — those run upstream in `resolveAgainstDefences`.
 * So a redirect placed there gets two of the spell's printed clauses for
 * free rather than implementing them:
 *
 *   "you only absorb HP damage"        the gate only ever sees HP damage
 *   "your resistances do not apply"    the caster's 5 goes in as a raw
 *                                      number that crosses no defence
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE ROUND, AND SPENT BY THE FIRST BLOW. Graham's ruling, 5 September
 * 2026, on a spell that prints no duration at all.
 *
 * Foundry cannot let a reaction interrupt a blow that is already being
 * applied, so the ward is cast in anticipation and waits — exactly the
 * shape Delayed Respite took, and for exactly the same reason. A round is
 * what Respite prints, so a round is what this takes: long enough to be
 * the reaction it says it is, short enough that it cannot be banked and
 * carried around all day. The first blow it reduces spends it.
 *
 * THE ALTERNATIVE WAS AN UNTIMED WARD spent only by use. It reads truer
 * to "reaction" in isolation, and it would have let a caster pre-cast at
 * leisure every morning — which is the one thing a reaction cost exists
 * to prevent.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT FIRES WHATEVER STATE THE CASTER IS IN. Graham's ruling, same day.
 *
 * Dying, unconscious, or forty feet away when the blow finally lands: the
 * redirect happens. The spell was paid for at casting and the ally has
 * been counting on it since; a ward that quietly evaporates at the moment
 * the fight goes badly is a ward nobody can plan around. ONLY A CASTER
 * WHO NO LONGER EXISTS stops it — a deleted token has no HP to take the
 * blow — and the card says so rather than letting the number vanish.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE +2 PP WARP IS NOT BUILT, AND THAT IS DELIBERATE.
 *
 * "You may also absorb any condition that the target suffers" has no gate
 * to hang on. `applyConditionTags` has 28 call sites across 11 files and
 * its own comment records that "most of the forty or so places that apply
 * conditions never call" it — there is no single primitive for conditions
 * the way there is for damage. Building the absorb against the helper
 * alone would work on some routes and fail invisibly on the rest, which
 * is the worst of the three shapes available. Graham ruled on 5 September
 * 2026: defer it, and PRINT THE CLAUSE so the table moves the condition
 * by hand knowing the system did not. That is the same answer Delayed
 * Respite's "no other effects of the attack take hold" got.
 */

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/** The record on the warded ally's effect. */
export const SHIELD_FLAG = "sacrificingShield";

/** What the book redirects before any warp. */
export const BASE_ABSORB = 5;

/**
 * A Sacrificing Shield record, or null when it is malformed.
 *
 * `casterUuid` IS THE LOAD-BEARING FIELD and the reason this record is
 * shaped unlike Delayed Respite's. A Respite hands the blow back to the
 * creature it is already sitting on; this one has to find somebody else,
 * and an effect that cannot name them is a shield with nowhere to send
 * the wound.
 */
export function normaliseSacrificingShield(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && text(raw.kind) !== "sacrificingShield") return null;
  return {
    label: text(raw.label) || "Sacrificing Shield",
    amount: Math.max(0, int(raw.amount ?? BASE_ABSORB)),
    casterUuid: text(raw.casterUuid),
    conditions: Boolean(raw.conditions)
  };
}

/**
 * How much this ward redirects, warps folded in.
 *
 * `bonusValue` IS THE KEY THE WARP ALREADY DECLARED — "damage you
 * redirect increases by 1", `mods: {bonusValue: 1}`, one of the few warps
 * in the pack that was not inert. `aggregateWarpSelection` multiplies it
 * by the number of times the warp was taken, so three purchases redirect
 * eight, and nothing here has to count.
 *
 * @param {object} warpMods the aggregated warp mods
 */
export function shieldAmount(warpMods = {}) {
  return BASE_ABSORB + Math.max(0, int(warpMods?.bonusValue));
}

/**
 * Whether this ward will take any of this blow.
 *
 * A ZERO BLOW IS NOT A BLOW — the same rule `respiteCatches` applies —
 * because spending a one-round ward on damage that was never going to
 * land is a resource lost to a rounding artefact.
 */
export function shieldCatches(record, damage) {
  if (!record) return false;
  if (!record.casterUuid) return false;
  if (record.amount <= 0) return false;
  return Math.max(0, int(damage)) > 0;
}

/**
 * How the blow divides between the ally and the caster.
 *
 * CAPPED BY THE BLOW ITSELF. "The HP damage that would have been
 * inflicted upon them is reduced by 5. However, you absorb THIS damage
 * instead" — this damage is the damage that was reduced, so a 3-point
 * blow costs the caster 3 and not 5. Reading the 5 as a flat transfer
 * would let a caster be killed by a scratch their ally shrugged off.
 *
 * @returns {{absorbed: number, remaining: number}}
 */
export function shieldSplit(record, damage) {
  const incoming = Math.max(0, int(damage));
  if (!shieldCatches(record, incoming)) return { absorbed: 0, remaining: incoming };
  const absorbed = Math.min(record.amount, incoming);
  return { absorbed, remaining: incoming - absorbed };
}

/** What the card says when the ward is placed. */
export function shieldPlacedLine(targetName, amount, durationText = "") {
  return `<strong>${targetName}</strong>: the next blow is reduced by `
    + `<strong>${amount}</strong>, and the caster takes it instead${durationText}.`;
}

/** What the card says when the ward fires. */
export function shieldAbsorbedLine(casterName, targetName, absorbed, remaining) {
  return `<strong>${casterName}</strong> takes <strong>${absorbed}</strong> damage in `
    + `<strong>${targetName}</strong>'s place`
    + (remaining
      ? `; <strong>${remaining}</strong> still reaches them.`
      : "; the blow reaches them for nothing.");
}

/**
 * What the card says when the caster is no longer on the scene.
 *
 * SAID OUT LOUD, NOT SWALLOWED. This is the one case that stops the
 * redirect, and an ally who takes a full blow they had paid a spell to
 * halve deserves to be told why rather than concluding the spell is
 * broken.
 */
export function shieldCasterGoneLine(targetName, label = "Sacrificing Shield") {
  return `<em>${label} had nobody left to take the wound — its caster is no longer on the `
    + `scene, so the blow reaches ${targetName} in full.</em>`;
}

/**
 * The clauses this spell hands to the table, named on every cast.
 *
 * THE CONDITION WARP IS NAMED HERE ONLY WHEN IT WAS BOUGHT. Printing a
 * clause nobody paid for would be as misleading as printing none: a
 * caster who did not take the warp is not owed a reminder about
 * conditions, because they never had any claim on them.
 */
export function shieldRemainderLine(conditions = false) {
  const base = "<em>Only HP damage is absorbed: conditions, critical injuries, bleed and "
    + "everything else the attack does still land on the target in full. The ward lasts one "
    + "round and is spent by the first blow it reduces.</em>";
  if (!conditions) return base;
  return base
    + "<em> The warp bought this casting the target's conditions as well; the system does not "
    + "move those, so the GM should transfer them to the caster by hand.</em>";
}
