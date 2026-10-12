/**
 * Magic Items (Core 3.1, Chapter 11). Pure logic only — the Foundry
 * workflow lives in magic-items-workflow.mjs.
 */

/**
 * Investment (Chapter 11): "Each character can benefit from three
 * invested items at 1st level. You gain a bonus to the amount of items
 * that you can invest equal to your spellcasting ability score. At 5th
 * level and then every 5 levels thereafter, you may invest an
 * additional item." Verified against the rulebook's own worked example
 * (Mikhail, 1st level cleric, Wisdom +2, max 5 invested items).
 */
export function investmentSlots(level, magicalAbilityScore) {
  const base = 3;
  const abilityBonus = Math.floor(Number(magicalAbilityScore) || 0);
  const levelBonus = Math.floor(Math.max(0, Number(level) || 0) / 5);
  return base + abilityBonus + levelBonus;
}

/**
 * Charge Depletion (Chapter 11): "If a charged item is ever reduced to
 * less than 0 PP you must make a d100 check on the Item Depletion
 * table." A plain, non-exploding d100 — the rulebook doesn't call for
 * an open-ended roll here, unlike the magic-mishap tables in Chapter 9.
 */
export const ITEM_DEPLETION_TABLE = Object.freeze([
  {
    min: 1,
    max: 10,
    kind: "explode",
    effect:
      "The item explodes, affecting all creatures within a 10-foot radius per item level. 1d4 force damage per level of the item, Basic Reflex Save (level-based)."
  },
  { min: 11, max: 40, kind: "crumble", effect: "The item crumbles to dust, forever destroyed." },
  {
    min: 41,
    max: 65,
    // FLAGGED, so the workflow can carry the break out rather than only
    // announce it (3.573.0). Chapter 6: "if an effect makes an item
    // broken automatically it is reduced to 0 HP."
    breaks: true,
    kind: "break",
    effect: "The item is depleted and gains the broken condition. It may be repaired and recharged normally."
  },
  {
    min: 66,
    max: 66,
    kind: "resonance",
    effect: "The item randomly changes into another charged item. Roll on the Resonance Event table at +20."
  },
  { min: 67, max: 90, kind: "depleted", effect: "The item is depleted and may be recharged normally." },
  { min: 91, max: 99, kind: "recharge", effect: "The item strangely recharges itself." },
  {
    min: 100,
    max: 100,
    kind: "rechargePlus",
    effect: "The item recharges itself and has its maximum charges increased by 1."
  }
]);

/*
 * WHAT EACH ROW DOES, CARRIED OUT (3.616.0, Graham's R16 of block 36). Until
 * now only the break was; the explosion, the dust, the change and the two
 * recharges were read out and left to the table.
 */

/** The explosion of a 01–10: its radius, its damage dice and its DC. */
export function depletionExplosion(level, levelDCOf) {
  const lvl = Math.max(1, Math.floor(Number(level) || 0));
  return { radiusFeet: 10 * lvl, dice: lvl, formula: `${lvl}d4`, damageType: "force", dc: levelDCOf(lvl) };
}

/** A 91–100: the pool refilled, and at 100 one more PP at most. */
export function depletionRefill(kind, maximumPP) {
  const max = Math.max(0, Math.floor(Number(maximumPP) || 0));
  if (kind === "rechargePlus") return { uses: max + 1, maximumPP: max + 1 };
  if (kind === "recharge") return { uses: max, maximumPP: max };
  return null;
}

/**
 * A 41–65 on an item with no hit points: one, at 0, so it reads broken
 * like any other broken item until it is Repaired. "It may be repaired and
 * recharged normally" — so it has to be something Repair can mend.
 */
export const UNTRACKED_BROKEN_HP = Object.freeze({ max: 1, value: 0 });

/** Whether a charged item is broken: tracked hit points at 0. */
export function chargedItemBroken(item) {
  const max = Math.floor(Number(item?.system?.hp?.max) || 0);
  return max > 0 && Math.floor(Number(item?.system?.hp?.value) || 0) <= 0;
}

export function itemDepletionResult(roll) {
  const value = Math.min(100, Math.max(1, Math.round(Number(roll) || 0)));
  return (
    ITEM_DEPLETION_TABLE.find((row) => value >= row.min && value <= row.max) ??
    ITEM_DEPLETION_TABLE[1]
  );
}

/*
 * DUPLICATE ITEMS WERE WARNED ABOUT HERE until 3.617.0. Graham's R21 of
 * block 37: "There is no restriction to how many items of the same type
 * that can be worn. Limits are driven by the Invested Trait only. … Such
 * decisions would be left to the GM to decide however rather than stopping
 * it on the sheet." The investment cap (`investmentSlots` above) is the
 * limit.
 */
