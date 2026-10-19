/**
 * SPITEFUL STRIKE (3.663.0; Fiends & Fables 3.0 block 33 R5 — Graham,
 * 19 October 2026: "Option A").
 *
 * The Wight: "R (attack); Trigger the creature is killed. The Wight makes a
 * Strike before being destroyed. If the strike inflicts damage, it heals the
 * creature of half the amount."
 *
 * Read (A1 of the audit, the recommendation): the heal is real. Half of what
 * the Strike inflicts is restored, and a creature healed above 0 HP by it is
 * no longer destroyed — otherwise the sentence would heal a corpse.
 *
 * Declared on the ability: `creatureAbility.derives.spitefulStrike =
 * { weapon: "Claws" }` (the weapon is optional; the first weapon otherwise).
 *
 * Pure. spiteful-strike-workflow.mjs offers the card and writes.
 */
import { abilityDerives } from "../creature-ability-rules.mjs";

/** The creature's Spiteful Strike, or null: `{ item, weapon }`. */
export function spitefulStrikeRule(items = []) {
  for (const { item, derives } of abilityDerives(items)) {
    const rule = derives?.spitefulStrike;
    if (!rule) continue;
    const weapon = typeof rule === "object" ? String(rule.weapon ?? "").trim() : "";
    return { item, weapon };
  }
  return null;
}

/** The weapon the Strike is made with: the named one, else the first. */
export function spitefulWeapon(items = [], name = "") {
  const weapons = Array.from(items ?? []).filter((i) => i?.type === "weapon");
  const wanted = String(name ?? "").trim().toLowerCase();
  return (wanted && weapons.find((w) => String(w.name ?? "").trim().toLowerCase() === wanted)) || weapons[0] || null;
}

/**
 * What the Strike gives back: half the damage it inflicted, rounded down,
 * and whether that lifts the creature above 0 HP (capped at its maximum).
 *
 * @returns {{ heal: number, survives: boolean, hp: number }}
 */
export function spitefulHeal(dealt, maxHP) {
  const heal = Math.floor(Math.max(0, Number(dealt) || 0) / 2);
  const hp = Math.min(Math.max(0, Number(maxHP) || 0), heal);
  return { heal, survives: hp > 0, hp };
}
