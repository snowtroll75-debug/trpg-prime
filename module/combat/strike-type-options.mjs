/**
 * Damage-type options a creature declares for its own strikes (3.627.0).
 *
 * Pillars of Faith, Chapter 9 — Essence Attacks (Unliving Ghost): "When you
 * make an unarmed attack or natural attack, you may have the attack deal
 * essence damage instead of its normal physical damage type. The attack
 * remains magical."
 *
 * THE SAME MOMENT AS VERSATILE. Chapter 6 says a Versatile weapon's type is
 * chosen "before you make the attack", and the attack path already asks it
 * there; an option declared here joins that one question rather than
 * asking a second. A weapon with no Versatile trait and no option in reach
 * asks nothing, as before.
 *
 * "REMAINS MAGICAL" is read as: an essence strike made through the option is
 * a magical source (Graham, 7 Oct 2026 — the default reading in the Chapter 9
 * audit). Declared as `magical: true` on the option, so another book's
 * option need not inherit it.
 *
 * Declaration, on any applied effect (a feat's transferred one included):
 *
 *   flags.trg-prime.strikeTypeOption = {
 *     type: "essence", label: "Essence Attacks",
 *     scope: ["natural", "unarmed"], magical: true
 *   }
 *
 * Pure and Foundry-free; the attack workflow reads the effects and asks.
 */
import { isNaturalAttack, isUnarmedAttack } from "./unarmed.mjs";

const SYSTEM_ID = "trg-prime";
const STRIKE_TYPE_OPTION_FLAG = "strikeTypeOption";
const SCOPES = Object.freeze(["natural", "unarmed", "any"]);

/** One declaration, normalised, or null when it names no type. */
function normaliseStrikeTypeOption(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type ?? "").trim().toLowerCase();
  if (!type) return null;
  const scope = (Array.isArray(raw.scope) ? raw.scope : [raw.scope ?? "any"])
    .map((s) => String(s ?? "").trim().toLowerCase())
    .filter((s) => SCOPES.includes(s));
  return {
    type,
    label: String(raw.label ?? "").trim() || type,
    scope: scope.length ? scope : ["any"],
    magical: raw.magical === true
  };
}

/** Every option on these effects (disabled ones carry nothing). */
export function declaredStrikeTypeOptions(effects = []) {
  const out = [];
  for (const effect of Array.from(effects ?? [])) {
    if (effect?.disabled) continue;
    const raw = effect?.flags?.[SYSTEM_ID]?.[STRIKE_TYPE_OPTION_FLAG];
    for (const row of Array.isArray(raw) ? raw : (raw ? [raw] : [])) {
      const option = normaliseStrikeTypeOption(row);
      if (option) out.push(option);
    }
  }
  return out;
}

/** Does this option reach a strike with this weapon? */
function optionReaches(option, weaponSystem = {}) {
  if (!option) return false;
  if (option.scope.includes("any")) return true;
  if (option.scope.includes("natural") && isNaturalAttack(weaponSystem)) return true;
  if (option.scope.includes("unarmed") && isUnarmedAttack(weaponSystem)) return true;
  return false;
}

/**
 * The damage types offered for one strike: the weapon's own first, then a
 * Versatile alternate, then each option in reach — each type once.
 *
 * @param {object} weaponSystem
 * @param {Array} options normalised options
 * @param {string|null} versatileAlternate the Versatile type, if any
 * @returns {Array<{type: string, source: string}>}
 */
export function strikeTypeChoices(weaponSystem = {}, options = [], versatileAlternate = null) {
  const normal = String(weaponSystem?.damageType ?? "").trim().toLowerCase();
  const out = [];
  const add = (type, source) => {
    const t = String(type ?? "").trim().toLowerCase();
    if (t && !out.some((c) => c.type === t)) out.push({ type: t, source });
  };
  add(normal, "normal");
  if (versatileAlternate) add(versatileAlternate, "Versatile");
  for (const option of options ?? []) if (optionReaches(option, weaponSystem)) add(option.type, option.label);
  return out;
}

/**
 * Whether the type this strike deals came through an option that makes it
 * magical. A type the weapon deals anyway (its own, or Versatile) is not
 * made magical by an option naming the same word.
 */
export function strikeTypeIsMagical(weaponSystem = {}, options = [], damageType = "", versatileAlternate = null) {
  const t = String(damageType ?? "").trim().toLowerCase();
  if (!t) return false;
  const choice = strikeTypeChoices(weaponSystem, options, versatileAlternate).find((c) => c.type === t);
  if (!choice || choice.source === "normal" || choice.source === "Versatile") return false;
  return (options ?? []).some((o) => o.type === t && o.magical && optionReaches(o, weaponSystem));
}
