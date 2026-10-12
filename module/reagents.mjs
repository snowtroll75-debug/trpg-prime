/**
 * Reagents (Chapter 6, pages 178–186) — the rules, pure.
 *
 * NEW at 3.578.0, for Graham's R10 of the block-18 audit (and block 17's
 * R14, which waited for it). Seven vials print "may be used as an
 * additional material component when casting a spell with the X trait",
 * and Blood-Block prints its own: "if used in conjunction with any spell
 * used to suppress or stop bleeding, increase the amount of bleeding
 * stopped by the amount the elixir stops."
 *
 * R10: the cast dialog offers the matching reagents you carry, as ticks;
 * a ticked one is spent, and its bonus applied. Each is one of five:
 *
 *   damageDie     +1 die of the spell's own damage die
 *   spellcraft    +N to the Spellcraft check
 *   castingDC     the casting DC moves by N
 *   saveDC        the spell's save DC moves by N
 *   reliefAmount  the spell stops N more of a condition (Blood-Block)
 *
 * WHAT A REAGENT MATCHES AND DOES IS DATA, on the pack item at
 * `flags.trg-prime.alchemical.reagentUse`. Nothing below names a vial.
 */

import { hasTrait } from "./traits.mjs";
import { scaledAlchemicalEffect } from "./elixirs.mjs";

const SYSTEM_ID = "trg-prime";

const REAGENT_EFFECTS = Object.freeze(["damageDie", "spellcraft", "castingDC", "saveDC", "reliefAmount"]);

/**
 * The reagent use an item declares, normalised, or null.
 *
 * @param {object} item
 * @returns {{effect: string, value: number, traits: string[], traditions: string[],
 *   relieves: string, judgement: string, label: string}|null}
 */
function reagentUseOf(item) {
  const raw = item?.flags?.[SYSTEM_ID]?.alchemical?.reagentUse ?? null;
  if (!raw || typeof raw !== "object" || !REAGENT_EFFECTS.includes(raw.effect)) return null;
  const list = (v) => (Array.isArray(v) ? v : []).map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean);
  let value = Number.isFinite(Number(raw.value)) ? Math.trunc(Number(raw.value)) : 1;
  // BLOOD-BLOCK'S "THE AMOUNT THE ELIXIR STOPS" is its own relief at the
  // level it was made, which rises every 3 levels — read from the elixir,
  // not copied into the reagent, so the two cannot disagree.
  if (raw.valueFrom === "relief") {
    const row = scaledAlchemicalEffect(item)?.effects?.find((e) => e?.kind === "conditionRelief");
    if (row && Number(row.amount) > 0) value = Math.trunc(Number(row.amount));
  }
  return {
    effect: raw.effect,
    value,
    traits: list(raw.traits),
    traditions: list(raw.traditions),
    relieves: String(raw.relieves ?? "").trim(),
    // A MATCH NOBODY CAN COMPUTE — the Tanglefoot Bag's "a spell that
    // restricts speed or movement". Offered on every spell with a save,
    // with these words beside the tick, for the caster to judge.
    judgement: String(raw.judgement ?? "").trim(),
    label: String(raw.label ?? "").trim()
  };
}

/** The spell's first damage die — "2d6+4" is d6. */
function spellDamageDie(formula) {
  const m = /(\d*)d(\d+)/i.exec(String(formula ?? ""));
  return m ? Number(m[2]) : null;
}

/**
 * Does this reagent suit this spell?
 *
 * @param {object} use from `reagentUseOf`
 * @param {object} spellData the spell's `system`
 * @param {{tradition?: string}} [context]
 * @returns {{ok: boolean, why: string}}
 */
function reagentMatches(use, spellData, { tradition = "" } = {}) {
  if (!use || !spellData) return { ok: false, why: "" };
  // WHAT IT WOULD ADD TO MUST EXIST: a die to a spell with no damage, a
  // save DC to a spell with no save, relief to a spell that relieves
  // nothing, would be a reagent spent on nothing.
  if (use.effect === "damageDie" && !spellDamageDie(spellData.damage?.formula)) return { ok: false, why: "" };
  if (use.effect === "saveDC" && !String(spellData.defence ?? "").trim()) return { ok: false, why: "" };
  if (use.effect === "reliefAmount") {
    const relieves = (Array.isArray(spellData.effects) ? spellData.effects : [])
      .some((e) => e?.kind === "conditionRelief" && (!use.relieves || e.condition === use.relieves));
    return relieves ? { ok: true, why: `a spell that stops ${use.relieves || "a condition"}` } : { ok: false, why: "" };
  }
  if (use.judgement) return { ok: true, why: use.judgement };
  const traitHit = use.traits.find((t) => hasTrait(String(spellData.traits ?? ""), t));
  if (traitHit) return { ok: true, why: `the ${traitHit} trait` };
  const spellTradition = String(tradition || spellData.tradition || "").trim().toLowerCase();
  const traditionHit = use.traditions.find((t) => spellTradition.includes(t));
  if (traditionHit) return { ok: true, why: `a ${traditionHit} spell` };
  return { ok: false, why: "" };
}

/**
 * The reagents on offer for this cast: one row per carried item that
 * suits the spell.
 *
 * @param {object[]} items the caster's items
 * @param {object} spellData
 * @param {{tradition?: string}} [context]
 * @returns {Array<{id: string, name: string, use: object, why: string}>}
 */
export function reagentOffers(items, spellData, context = {}) {
  const out = [];
  for (const item of Array.from(items ?? [])) {
    const use = reagentUseOf(item);
    if (!use) continue;
    if (Number(item.system?.quantity ?? 1) <= 0) continue;
    const match = reagentMatches(use, spellData, context);
    if (!match.ok) continue;
    out.push({ id: item.id, name: item.name, use, why: match.why });
  }
  return out;
}

/** What one reagent does, in words, for the tick and the card. */
export function reagentEffectText(use, spellData = {}) {
  const v = Number(use?.value ?? 0);
  const sign = v > 0 ? `+${v}` : `${v}`;
  switch (use?.effect) {
    case "damageDie": {
      const die = spellDamageDie(spellData.damage?.formula);
      return `+${Math.max(1, v)} damage ${Math.max(1, v) === 1 ? "die" : "dice"}${die ? ` (d${die})` : ""}`;
    }
    case "spellcraft": return `${sign} to the Spellcraft check`;
    case "castingDC": return `casting DC ${sign}`;
    case "saveDC": return `save DC ${sign}`;
    case "reliefAmount": return `stops ${v} more ${use.relieves || ""}`.trim();
    default: return "";
  }
}

/**
 * The chosen reagents, added up.
 *
 * @param {Array<{use: object}>} chosen
 * @param {object} spellData
 * @returns {{damageDice: string, spellcraft: number, castingDC: number, saveDC: number, reliefBump: number}}
 */
export function reagentMods(chosen, spellData = {}) {
  const out = { damageDice: "", spellcraft: 0, castingDC: 0, saveDC: 0, reliefBump: 0 };
  let dice = 0;
  for (const { use } of Array.from(chosen ?? [])) {
    const v = Number(use?.value ?? 0);
    if (use?.effect === "damageDie") dice += Math.max(1, v);
    else if (use?.effect === "spellcraft") out.spellcraft += v;
    else if (use?.effect === "castingDC") out.castingDC += v;
    else if (use?.effect === "saveDC") out.saveDC += v;
    else if (use?.effect === "reliefAmount") out.reliefBump += Math.max(0, v);
  }
  const die = spellDamageDie(spellData.damage?.formula);
  if (dice && die) out.damageDice = `${dice}d${die}`;
  return out;
}
