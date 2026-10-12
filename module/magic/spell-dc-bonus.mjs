/**
 * Spell save DC bonuses a caster declares, scoped by the spell's traits
 * (3.627.0).
 *
 * Pillars of Faith, Chapter 9 — Soul-Magic Dominion (Unliving Lich): "You
 * gain a +1 racial bonus to Spellcraft checks and spell save DCs for spells
 * with the soul trait. This bonus applies only to your own spellcasting and
 * innate spells." The Spellcraft half is an ordinary conditional; nothing
 * carried the DC half — the save DC had no channel for a scoped bonus.
 *
 *   flags.trg-prime.spellDCBonus = { label, value: 1, type: "race", traits: ["soul"] }
 *
 * Typed as every bonus is: the highest of a type, untyped summed. An item's
 * spell (a staff, a scroll) is not "your own spellcasting"; the caller does
 * not ask for one.
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
const lower = (v) => String(v ?? "").trim().toLowerCase();
const traitList = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[,;]/)).map(lower).filter(Boolean);

/**
 * @param {Iterable} effects the caster's applied effects
 * @param {string|string[]} spellTraits
 * @returns {Array<{label: string, value: number, type: string}>} the bonuses that apply, after stacking
 */
export function declaredSpellDCBonuses(effects = [], spellTraits = []) {
  const have = new Set(traitList(spellTraits));
  const rows = [];
  for (const effect of Array.from(effects ?? [])) {
    if (effect?.disabled) continue;
    const raw = effect?.flags?.[SYSTEM_ID]?.spellDCBonus;
    for (const row of Array.isArray(raw) ? raw : (raw ? [raw] : [])) {
      const value = Math.trunc(Number(row?.value) || 0);
      if (!value) continue;
      const wanted = traitList(row?.traits);
      if (wanted.length && !wanted.some((t) => have.has(t))) continue;
      rows.push({ label: String(row?.label ?? "").trim() || "Spell DC bonus", value, type: lower(row?.type) || "untyped" });
    }
  }
  const best = new Map();
  const out = [];
  for (const row of rows) {
    if (row.type === "untyped" || row.value < 0) { out.push(row); continue; }
    const held = best.get(row.type);
    if (!held || row.value > held.value) best.set(row.type, row);
  }
  return [...best.values(), ...out];
}
