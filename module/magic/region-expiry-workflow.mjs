/**
 * The Foundry side of Region expiry (see region-expiry.mjs).
 *
 * NEW at 3.500.0.
 *
 * ONE SWEEP, TWO CLOCKS, the shape rage and Protective Ward both take:
 * `TRGCombat._onStartTurn` counts rounds and `updateWorldTime` counts
 * seconds, and whichever clock is moving is the one that reaches the
 * mark. Consecrate's day will never elapse inside a combat; Verdant
 * Retribution's minute may never see the world clock move.
 *
 * SCENE-WIDE RATHER THAN PER-ACTOR, unlike every other sweep beside it —
 * a Region belongs to the canvas, not to a character. It is called from
 * the same per-turn handler all the same, because that handler is where
 * the round number lives, and it is cheap: no flag, no opinion.
 */

import {
  REGION_EXPIRY_FLAG, expiredRegions, regionExpiryRecord
} from "./region-expiry.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Stamp a Region the cast has decided to keep.
 *
 * FAILS QUIETLY AND SAYS SO. A Region that cannot be stamped is one that
 * will outlive its spell — annoying — and a throw here would lose the
 * whole cast's result after the damage has already been applied, which is
 * the reasoning the deletion beside it already records.
 */
export async function stampRegionExpiry(regionId, { castId, spellName, ends }) {
  const region = canvas?.scene?.regions?.get(regionId) ?? null;
  if (!region) return false;
  // NO CLOCK, NO STAMP. `regionExpiryRecord` answers null ends for a
  // duration nothing can count, and writing the flag anyway would claim
  // this Region for a sweep that can never act on it.
  const record = regionExpiryRecord({ castId, spellName, ends });
  if (!record.ends) return false;
  try {
    await region.setFlag(SYSTEM_ID, REGION_EXPIRY_FLAG, record);
    return true;
  } catch (error) {
    console.warn("TRG Prime | the spell area region could not be stamped", error);
    return false;
  }
}

/**
 * Delete every stamped Region whose time is up.
 *
 * @returns {Promise<string[]>} the spell names that dispersed
 */
export async function sweepRegionExpiry(scene, { worldTime = null, round = null } = {}) {
  const target = scene ?? canvas?.scene ?? null;
  if (!target?.regions) return [];
  const rows = Array.from(target.regions).map((region) => ({
    id: region.id,
    record: region.getFlag?.(SYSTEM_ID, REGION_EXPIRY_FLAG) ?? null
  }));
  const gone = expiredRegions(rows, { worldTime, round });
  if (!gone.length) return [];
  try {
    await target.deleteEmbeddedDocuments("Region", gone.map((g) => g.id));
  } catch (error) {
    console.warn("TRG Prime | expired spell regions could not be removed", error);
    return [];
  }
  return gone.map((g) => g.spellName);
}
