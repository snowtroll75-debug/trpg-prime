/**
 * Mounted combat — the Foundry side of mounted.mjs (page 200).
 *
 * NEW at 3.579.0, for the block-19 audit's D13 and Graham's R13 of
 * 21 September 2026: "all of it."
 *
 * The page makes a rider and a mount "a single entity" for four things,
 * and each of them needs a partner to be a partner WITH. The rider has
 * carried a flag naming its mount since 3.576.0; this adds the other
 * half — the mount carries a flag naming its rider — so either one can
 * find the other without scanning every actor in the world.
 *
 *   SHARED AP        one pool, "determined by the character with the
 *                    lowest amount of action points between you"
 *   SHARED MAP       "both you and your mount are subject to the same
 *                    multiple attack penalty"
 *   SHARED SPACE     the reach and the +2, which the attack path applies
 *   ONE INITIATIVE   "your mount acts based on your initiative"
 */

import { actorHandle, resolveActorHandle } from "../actor-handle.mjs";
import { mountedState, sharedActionPoints } from "./mounted.mjs";

const SYSTEM_ID = "trg-prime";

/** The flag a MOUNT carries, naming its rider. */
const RIDDEN_BY_FLAG = "riddenBy";

/** The counter page 200 makes the pair share. */
const MAP_FLAG = "attackCount";

/**
 * Record, on the mount itself, who is riding it.
 *
 * WHY BOTH ENDS. `mountedState` answers "what am I riding"; nothing
 * answered "who is riding me", and the AP and MAP rules are asked from
 * the mount's side as often as from the rider's. The alternative was a
 * scan of every actor looking for a flag pointing here, which is a
 * lookup that gets slower as a campaign grows.
 *
 * @param {Actor} rider
 * @param {Actor|null} steed
 */
export async function markRidden(rider, steed) {
  if (!steed || !rider) return false;
  await steed.setFlag(SYSTEM_ID, RIDDEN_BY_FLAG, actorHandle(
    rider, rider.token ?? rider.getActiveTokens?.()?.[0] ?? null));
  return true;
}

/** Take the mark off — the rider dismounted, or fell. */
export async function clearRidden(steed) {
  if (!steed?.getFlag?.(SYSTEM_ID, RIDDEN_BY_FLAG)) return false;
  await steed.unsetFlag(SYSTEM_ID, RIDDEN_BY_FLAG);
  return true;
}

/**
 * The other half of the pair, from either end — the mount a rider is on,
 * or the rider on a mount's back. Null when this creature is neither.
 *
 * @param {Actor} actor
 * @returns {Promise<Actor|null>}
 */
async function mountPartnerOf(actor) {
  if (!actor) return null;
  const state = mountedState(actor);
  if (state.mounted && state.steed) return (await resolveActorHandle(state.steed)) ?? null;
  const rider = actor.getFlag?.(SYSTEM_ID, RIDDEN_BY_FLAG) ?? null;
  if (rider) return (await resolveActorHandle(rider)) ?? null;
  return null;
}

/**
 * SHARED AP (page 200): "You and your mount operate with a combined pool
 * of action points, which is determined by the character with the lowest
 * amount of action points between you."
 *
 * ONE POOL EXPRESSED AS TWO EQUAL NUMBERS, because both sheets show an AP
 * bar and a pool that lived on only one of them would leave the other
 * lying. The lower of the two is what both are set to, so Tomas's example
 * works out: a warhorse and its rider with 3 AP each have 3 between them,
 * and the Command an Animal that costs 1 leaves 2 on both sheets.
 *
 * @param {Actor} actor either half of the pair
 * @param {number|null} [value] the pool to set; the lower of the two when
 *   omitted
 * @returns {Promise<number|null>} the shared value, or null if not mounted
 */
export async function syncSharedAP(actor, value = null) {
  const partner = await mountPartnerOf(actor);
  if (!partner) return null;
  const shared = value === null
    ? sharedActionPoints(
      Number(actor.system?.resources?.ap?.value ?? 0),
      Number(partner.system?.resources?.ap?.value ?? 0))
    : Math.max(0, Math.floor(Number(value) || 0));
  for (const who of [actor, partner]) {
    if (Number(who.system?.resources?.ap?.value ?? 0) !== shared) {
      await who.update({ "system.resources.ap.value": shared });
    }
  }
  return shared;
}

/**
 * SHARED MULTIPLE ATTACK PENALTY (page 200): "both you and your mount are
 * subject to the same multiple attack penalty."
 *
 * THE HIGHER OF THE TWO COUNTERS, read from either end. A rider who has
 * struck twice hands their mount a mount's third attack, which is what
 * "the same penalty" means and what the paragraph's own reasoning asks
 * for ("it reinforces the need for coordination").
 *
 * @param {Actor} actor
 * @returns {Promise<number>}
 */
export async function sharedMapCount(actor) {
  const own = Number(actor?.getFlag?.(SYSTEM_ID, MAP_FLAG) ?? 0) || 0;
  const partner = await mountPartnerOf(actor);
  if (!partner) return own;
  return Math.max(own, Number(partner.getFlag?.(SYSTEM_ID, MAP_FLAG) ?? 0) || 0);
}

/**
 * Advance the shared counter on both halves of the pair.
 *
 * @param {Actor} actor
 * @param {number} value
 */
export async function setSharedMapCount(actor, value) {
  const next = Math.max(0, Math.floor(Number(value) || 0));
  await actor.setFlag(SYSTEM_ID, MAP_FLAG, next);
  const partner = await mountPartnerOf(actor);
  if (partner) await partner.setFlag(SYSTEM_ID, MAP_FLAG, next);
}

/**
 * ONE INITIATIVE (page 200): "During combat, your mount acts based on
 * your initiative."
 *
 * The mount is given the rider's initiative and placed immediately after
 * them in the order — Foundry breaks a tie by the order combatants were
 * added, so the same number is enough to put them together, and the two
 * then move through the round as one.
 *
 * @param {Combat} combat
 * @returns {Promise<string[]>} the mounts that were moved, by name
 */
export async function alignSteedInitiative(combat) {
  const moved = [];
  if (!combat) return moved;
  for (const combatant of combat.combatants ?? []) {
    const state = mountedState(combatant.actor);
    if (!state.mounted || !state.steed) continue;
    const rider = Number(combatant.initiative ?? NaN);
    if (!Number.isFinite(rider)) continue;
    const steed = await resolveActorHandle(state.steed);
    if (!steed) continue;
    // Marked here as well as at the Mount action, so a pair that was
    // already mounted when the fight began has both ends of the link.
    await markRidden(combatant.actor, steed);
    const steedCombatant = combat.combatants.find((c) => c.actor?.uuid === steed.uuid);
    if (!steedCombatant) continue;
    if (Number(steedCombatant.initiative ?? NaN) === rider) continue;
    await steedCombatant.update({ initiative: rider });
    moved.push(steed.name);
  }
  return moved;
}

