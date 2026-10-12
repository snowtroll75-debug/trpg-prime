/**
 * The Foundry side of AREA RIDERS (see area-rider.mjs for the rules and
 * for Graham's ruling of 2 September 2026).
 *
 * NEW at 3.465.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SOURCE IS THE SCENE, NOT THE ATTACKER.
 *
 * `strikeRiderPackets` asks the actor swinging what it is carrying.
 * This asks the ground the TARGET is standing on, so it is handed the
 * struck creature and its token and goes looking for an area that covers
 * it.
 *
 * CONSECRATED GROUND STAYS WHERE IT WAS CAST, so this reads REGIONS and
 * not `runningEmanations()`.
 *
 * The first draft read the emanation list, and driving the pack entries
 * killed it before it ever ran: Consecrate's area is "40-foot-radius" and
 * Desecrate's is "40-foot-radius" — neither says "emanation", so
 * `emanationIsLive` refuses both and the list would always have been
 * empty. THE PACK WAS RIGHT AND THE DRAFT WAS WRONG. An emanation follows
 * its caster; a consecrated place is somewhere you consecrate and then
 * walk away from for a day. Spike Stones is the shape this actually is,
 * so it uses that one: a flag on the Region the template created, and
 * `region.testPoint` for the question "is the target standing in it".
 *
 * ASKED OF THE REGION, NOT RECOMPUTED FROM A RADIUS — the reason
 * hazard-terrain-workflow gives: a region a GM has reshaped by hand still
 * answers for where it now is.
 */

import {
  AREA_RIDER_KEY, normaliseAreaRider, areaRiderReaches, areaRiderPacket
} from "./area-rider.mjs";
import { isUndead } from "../aligned.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Every area rider covering this creature, as damage packets.
 *
 * SWALLOWS ITS OWN FAILURE. This runs inside a Strike that has already
 * hit; throwing here would abandon the weapon's own damage to report a
 * bad flag on a spell nobody in this Strike cast.
 *
 * @param {Actor|null} targetActor the creature being struck
 * @param {Token|null} targetToken its token
 * @returns {Array<object>} packets in `resolveWeaponDamage`'s shape
 */
export function areaRiderPackets(targetActor, targetToken) {
  const packets = [];
  try {
    if (!targetActor || !targetToken) return packets;
    const undead = isUndead(targetActor.system);

    for (const region of canvas?.scene?.regions ?? []) {
      const spec = normaliseAreaRider(region.getFlag?.(SYSTEM_ID, AREA_RIDER_KEY) ?? null);
      if (!spec) continue;
      let inside = false;
      try {
        inside = region.testPoint({
          x: targetToken.center?.x ?? targetToken.x,
          y: targetToken.center?.y ?? targetToken.y,
          elevation: targetToken.document?.elevation ?? 0
        });
      } catch {
        inside = false;
      }
      if (!areaRiderReaches(spec, { isUndead: undead, inside })) continue;
      const packet = areaRiderPacket(spec);
      if (packet) packets.push(packet);
    }
  } catch (error) {
    console.error("TRG Prime | area riders could not be gathered for this Strike", error);
  }
  return packets;
}

/** Record an area rider on the Region a spell's template just created. */
export async function recordAreaRider(region, descriptor) {
  if (!region?.setFlag) return null;
  const spec = normaliseAreaRider(descriptor);
  if (!spec) return null;
  await region.setFlag(SYSTEM_ID, AREA_RIDER_KEY, descriptor);
  return spec;
}
