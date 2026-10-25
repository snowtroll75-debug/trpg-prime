/**
 * A SPELL'S OWN BONUS (3.671.0; Inner Tempest's Lotus Enchanter and Onmyoji
 * Necromancer: "When you gain an Enchantment spell through Mystic Essence,
 * you gain a +1 class bonus to its innate spell attack checks and save
 * DCs"). Pure; no Foundry.
 *
 * The bonus belongs to ONE spell — the one a feat granted — so it rides on
 * that spell's copy, `flags.trg-prime.spellBonus: { attack, dc, type,
 * label }`, rather than on an effect scoped by trait (spellDCBonus, which
 * would reach every Enchantment spell the caster has). Read by the cast
 * for the copy's own attack roll and save DC; not for an item's cast (a
 * potion's spell is not "your" spell).
 *
 * @param {object} spell the spell item
 * @returns {{attack: number, dc: number, type: string, label: string}|null}
 */
export function spellOwnBonus(spell) {
  const raw = spell?.flags?.["trg-prime"]?.spellBonus;
  if (!raw || typeof raw !== "object") return null;
  const attack = Math.trunc(Number(raw.attack) || 0);
  const dc = Math.trunc(Number(raw.dc) || 0);
  if (!attack && !dc) return null;
  return {
    attack, dc,
    type: String(raw.type ?? "").trim().toLowerCase() || "untyped",
    label: String(raw.label ?? "").trim() || String(spell?.name ?? "Spell bonus")
  };
}
