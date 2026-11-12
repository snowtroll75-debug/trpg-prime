/**
 * LEVELS ADDED TO AN INNATE CAST (3.682.0; Eldritch Arts Block 4, D9).
 *
 * The Warlock's bonded souls: "You are treated as one level higher when using
 * spells with either the Fire or Healing traits" (the Emberlord), "…of the
 * Insight school" (the Void Seer), and their kin. Every Warlock spell is
 * innate, so the level they raise is the innate cast's: the one its attack,
 * save DC, free warp budget and innate PP limit read
 * (`innateCastLevel`, item-innate-level.mjs). A module registers the bonus
 * with `registerInnateLevelBonus`; each is asked, and the answers add.
 *
 * Not for a spell an item grants: that is cast at the item's level, which
 * the item fixes (Graham's R23 of block 37).
 */
import { registeredInnateLevelBonuses } from "../module-api.mjs";

const words = (value) => String(value ?? "").split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean);

/** What a bonus is told about the spell. Pure. */
export function innateLevelBonusContext(actor, spell) {
  const data = spell?.system ?? {};
  return {
    actor: actor ?? null,
    spell: spell ?? null,
    traits: [...new Set([...words(data.traits), ...words(data.school)])],
    tradition: String(data.tradition ?? "").trim().toLowerCase()
  };
}

/**
 * The levels the registered bonuses add to this innate cast. A failing or
 * non-numeric answer adds nothing; the total is a whole number, never below 0.
 */
export async function innateLevelBonusFor(actor, spell) {
  const ctx = innateLevelBonusContext(actor, spell);
  let total = 0;
  for (const { key, bonus } of registeredInnateLevelBonuses()) {
    try {
      const n = Math.trunc(Number(await bonus(ctx)) || 0);
      if (n > 0) total += n;
    } catch (error) {
      console.error(`TRG Prime | innate level bonus "${key}"`, error);
    }
  }
  return total;
}
