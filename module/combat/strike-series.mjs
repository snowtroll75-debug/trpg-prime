/**
 * strike-series — several Strikes taken as one action that meets the
 * target's defences once.
 *
 * NEW at 3.667.0, for Inner Tempest Block 3. Flurry of Blows (Disciple):
 *
 *   "Make two unarmed Strikes. If both hit the same creature, apply DR,
 *    resistance and weakness only once. Apply your multiple attack penalty
 *    to the Strikes normally. Be aware that you may only inflict one
 *    critical injury when using this ability, although you still gain
 *    additional critical damage from both strikes."
 *
 * and Disciplined Flurry (Inner Discipline), "make one additional attack at
 * your highest Combat Bonus as part of the Flurry". Graham, 22 October 2026
 * (B3-4): that extra Strike takes no penalty itself but counts towards the
 * penalty for later Strikes.
 *
 * HOW "ONCE" IS KEPT. Each Strike resolves its own damage packet, as every
 * Strike in this system does. DR is the part that differs between "once"
 * and "per hit": a later hit on a creature the series already hit meets no
 * DR (`drWaived`). Resistance and weakness are proportional (half, half
 * again), so meeting them per hit is meeting them once on the total, but
 * for rounding. And once one critical injury has been rolled, a later
 * critical keeps its bonus dice and rolls no injury (`noCriticalInjury`).
 *
 * Unlike Double Slice, the multiple attack penalty is NOT frozen: "apply
 * your multiple attack penalty to the Strikes normally".
 *
 * Pure section first (driven by the harness), then the workflow.
 */

/** A fresh record for one series. */
export function newSeriesState() {
  return { hitTargets: [], injuryRolled: false };
}

/**
 * The options the next Strike of the series carries, given what the series
 * has done so far and the creature it is aimed at.
 *
 * @param {{hitTargets: string[], injuryRolled: boolean}} state
 * @param {string} targetUuid
 * @returns {{drWaived: boolean, noCriticalInjury: boolean}}
 */
export function seriesStrikeOptions(state, targetUuid) {
  const uuid = String(targetUuid ?? "");
  return {
    drWaived: Boolean(uuid) && (state?.hitTargets ?? []).includes(uuid),
    noCriticalInjury: Boolean(state?.injuryRolled)
  };
}

/**
 * Record one resolved Strike.
 *
 * @param {object} state
 * @param {string} targetUuid
 * @param {{hits?: boolean, critical?: object|boolean|null, injuryImmune?: boolean}} result
 * @param {{noCriticalInjury?: boolean}} [carried] the options it was rolled with
 * @returns {object} the same state
 */
export function recordSeriesStrike(state, targetUuid, result = {}, carried = {}) {
  const uuid = String(targetUuid ?? "");
  if (result?.hits && uuid && !state.hitTargets.includes(uuid)) state.hitTargets.push(uuid);
  // An injury was rolled if this hit was a critical that was allowed one
  // and the target was not immune to it.
  if (result?.hits && result?.critical && !carried?.noCriticalInjury && !result?.injuryImmune) {
    state.injuryRolled = true;
  }
  return state;
}

/**
 * Run a series of Strikes.
 *
 * @param {Actor} actor
 * @param {Array<{weapon: Item, mapOverride?: number|null, extraModifiers?: Array, skipTargetPrompt?: boolean, label?: string}>} strikes
 * @param {{label?: string, apPaid?: boolean}} [opts]
 * @returns {Promise<{state: object, checks: Array}>}
 */
export async function runStrikeSeries(actor, strikes = [], { label = "Strike series", apPaid = true } = {}) {
  const { rollWeaponAttack } = await import("./attack-workflow.mjs");
  const state = newSeriesState();
  const checks = [];
  for (const [i, strike] of strikes.entries()) {
    if (!strike?.weapon) continue;
    const target = Array.from(globalThis.game?.user?.targets ?? [])[0]?.actor ?? null;
    const options = seriesStrikeOptions(state, target?.uuid ?? "");
    const check = await rollWeaponAttack(actor, strike.weapon, {
      apPaid,
      // The first Strike asks for its target as any Strike does; the later
      // ones keep the one selected unless the caller asks again.
      skipTargetPrompt: i > 0 ? strike.skipTargetPrompt !== false : Boolean(strike.skipTargetPrompt),
      extraModifiers: strike.extraModifiers ?? [],
      ...(strike.mapOverride !== undefined && strike.mapOverride !== null ? { mapOverride: strike.mapOverride } : {}),
      drWaived: options.drWaived,
      noCriticalInjury: options.noCriticalInjury,
      seriesLabel: label
    });
    checks.push(check ?? null);
    if (!check) break;
    const struck = Array.from(globalThis.game?.user?.targets ?? [])[0]?.actor ?? target;
    recordSeriesStrike(state, struck?.uuid ?? "", {
      hits: Boolean(check.attackOutcome?.hits),
      critical: check.attackOutcome?.critical ?? null,
      injuryImmune: Boolean(check.attackOutcome?.critical?.injuryImmune)
    }, options);
  }
  return { state, checks };
}
