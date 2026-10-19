/**
 * A HEAL FROM ANY DEATH NEARBY (3.659.0; Fiends & Fables 3.0 block 28 R7 —
 * the Wrathmorta's Soul Harvest: "Trigger A creature dies within 60 feet of
 * the Wrathmorta. The Wrathmorta immediately gains healing equivalent to that
 * of a cure or restoration spell warped to a PP cost equal to the creature's
 * level").
 *
 * Souldrinker heals its KILLER; this heals whoever stands near the death.
 * Declared on the ability:
 *
 *   derives.deathHarvest: { feet: 60, ppCost: 12 }   (ppCost defaults to the level)
 *
 * Cure (the spell pack): 1d8 for 2 PP, and "+2 PP: the amount of healing
 * increases by 1d8" — so a Cure warped to N PP heals 1 + floor((N − 2) / 2) d8.
 * Pure.
 */
const SYSTEM_ID = "trg-prime";

/** The d8s a Cure warped to this PP cost heals (2 PP → 1d8, 12 PP → 6d8). */
function cureWarpedDice(ppCost) {
  const pp = Math.max(2, Math.trunc(Number(ppCost) || 0));
  return 1 + Math.floor((pp - 2) / 2);
}

/** A creature's death harvest, or null: `{ item, feet, dice }`. */
export function deathHarvestOf(items = [], level = 0) {
  for (const item of Array.from(items ?? [])) {
    if (item?.type !== "ability") continue;
    const raw = item.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.deathHarvest;
    if (!raw || typeof raw !== "object") continue;
    const feet = Math.max(0, Math.trunc(Number(raw.feet) || 0));
    if (!feet) continue;
    const pp = Number(raw.ppCost) > 0 ? Number(raw.ppCost) : Number(level) || 0;
    return { item, feet, dice: cureWarpedDice(pp) };
  }
  return null;
}
