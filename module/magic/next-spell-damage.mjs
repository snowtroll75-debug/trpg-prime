/**
 * THE NEXT SPELL OF A TYPE, BOOSTED (3.630.0). Pure; no Foundry.
 *
 * Pillars of Faith, Chapter 6:
 *   Blackfire Ivy — "The next fire spell you cast within 1-minute deals one
 *     additional damage die and negates each target's fire resistance. The
 *     dose is expended when the spell is cast."
 *   Emberthistle — "The next time you deal fire damage within 1 minute,
 *     increase one damage roll by 1d4. The dose is then expended." (Graham,
 *     8 Oct 2026: any fire damage — a spell, or a Strike through the rider
 *     the same effect carries.)
 *
 * Read at the cast, where reagents already add their dice: a boost whose
 * damage types meet the spell's joins the warp-dice channel, and the
 * effect carrying it is spent. "One additional damage die" is one die of
 * the size the spell's damage rolls — the same reading Weapon Surge's
 * "additional die" takes for a weapon.
 *
 *   flags.trg-prime.nextSpellDamage = {
 *     label, damageTypes: ["fire"],
 *     extraDie: true,            // or dice: "1d4"
 *     ignoreResistance: true     // the spell's damage ignores resistance to those types
 *   }
 */
const SYSTEM_ID = "trg-prime";
const lower = (v) => String(v ?? "").trim().toLowerCase();
const DICE = /^\s*([1-9]\d*)\s*d\s*([1-9]\d*)/i;

/** Every boost the caster's effects carry, with the effect it lives on. */
export function declaredNextSpellDamage(effects = []) {
  const out = [];
  for (const effect of Array.from(effects ?? [])) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.[SYSTEM_ID]?.nextSpellDamage;
    if (!raw || typeof raw !== "object") continue;
    const damageTypes = (Array.isArray(raw.damageTypes) ? raw.damageTypes : []).map(lower).filter(Boolean);
    const dice = String(raw.dice ?? "").trim();
    const extraDie = raw.extraDie === true;
    if (!damageTypes.length || (!extraDie && !DICE.test(dice))) continue;
    out.push({
      effectId: String(effect.id ?? ""),
      label: String(raw.label ?? effect.name ?? "Next spell"),
      damageTypes,
      dice: extraDie ? "" : dice,
      extraDie,
      ignoreResistance: raw.ignoreResistance === true
    });
  }
  return out;
}

/**
 * Every damage type a spell's data names: its damage rows, its save and
 * attack damage, and an elemental warp that replaces them.
 */
function spellDamageTypes(spellSystem = {}, { elementalType = "" } = {}) {
  if (lower(elementalType)) return [lower(elementalType)];
  const found = new Set();
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) { for (const n of node) visit(n, depth + 1); return; }
    for (const [k, v] of Object.entries(node)) {
      if ((k === "damageType" || k === "type") && typeof v === "string" && /damage|formula/i.test(Object.keys(node).join(" "))) {
        for (const t of v.split(/[,/]| or /i)) if (lower(t)) found.add(lower(t));
      } else if (v && typeof v === "object") visit(v, depth + 1);
    }
  };
  visit(spellSystem.effects);
  visit(spellSystem.damage);
  visit(spellSystem.save);
  visit(spellSystem.attack);
  return [...found];
}

/** One die of the size the spell's first damage formula rolls. */
function spellOwnDie(spellSystem = {}) {
  const formulas = [];
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) { for (const n of node) visit(n, depth + 1); return; }
    for (const [k, v] of Object.entries(node)) {
      if (k === "formula" && typeof v === "string") formulas.push(v);
      else if (v && typeof v === "object") visit(v, depth + 1);
    }
  };
  visit(spellSystem.damage);
  visit(spellSystem.save);
  visit(spellSystem.attack);
  visit(spellSystem.effects);
  for (const f of formulas) {
    const m = DICE.exec(f);
    if (m) return `1d${m[2]}`;
  }
  return "";
}

/**
 * The boost this cast takes, or null: the first declared one whose types
 * meet the spell's damage.
 */
export function nextSpellDamageFor(boosts = [], spellSystem = {}, ctx = {}) {
  const types = spellDamageTypes(spellSystem, ctx);
  if (!types.length) return null;
  for (const b of boosts ?? []) {
    if (!b.damageTypes.some((t) => types.includes(t))) continue;
    const dice = b.extraDie ? spellOwnDie(spellSystem) : b.dice;
    if (!dice) continue;
    return { ...b, dice, types: b.damageTypes.filter((t) => types.includes(t)) };
  }
  return null;
}
