/**
 * stat-rows — a bonus to Defence or Speed that depends on what the
 * creature is wearing and carrying.
 *
 * NEW at 3.667.0, for Inner Tempest Block 3 (the narrow form of core
 * dependency D9). Two class features need it:
 *
 *   Disciple's Dodge: "you may add your Wisdom ability score as a dodge
 *   bonus to your Defence (DB). This bonus is only applied if you are
 *   unencumbered and wearing no armour."
 *
 *   Incredible Movement: "a +10-foot status bonus to your Speed whenever
 *   you're not wearing armour. The bonus increases by 5 feet at 10th level
 *   and every 6 levels thereafter."
 *
 * A transferred Active Effect cannot say either, because effects apply
 * before armour and encumbrance are known. So the item declares the row,
 * and actor preparation adds it once those facts are settled, into the same
 * typed pools every other bonus uses (so stacking and Flat-Footed's dodge
 * filter still apply):
 *
 *   flags.trg-prime.statBonuses = [{
 *     target: "defence" | "speed",
 *     type: "dodge" | "status" | …,
 *     ability: "wisdom",                     // the score's total, never below 0
 *     value: 10,                             // or a flat value
 *     byLevel: [{ level: 4, value: 10 }, …], // or a value by character level
 *     valueFrom: "classBonus-1", valueMin: 1, // or a scaled figure (3.668.0),
 *                                            // the conditionals' grammar
 *     when: { unarmoured: true, unencumbered: true },
 *     label: "Disciple's Dodge"
 *   }]
 *
 * A shield is carried, not worn: it never switches a row off.
 *
 * Pure: no Foundry.
 */
import { scaledFigure } from "./conditionals.mjs";

const FLAG = "trg-prime";
const norm = (v) => String(v ?? "").trim().toLowerCase();

/** Where each target's bonus goes. */
const STAT_ROW_PATHS = Object.freeze({
  defence: "system.combat.defence",
  speed: "system.combat.movement.land"
});

/**
 * Every `statBonuses` row among these carriers (items and effects),
 * disabled effects skipped, each labelled with its carrier's name.
 */
export function declaredStatRows(carriers = []) {
  const out = [];
  for (const c of carriers ?? []) {
    if (!c || c.disabled) continue;
    const raw = c.flags?.[FLAG]?.statBonuses;
    if (!raw) continue;
    for (const row of Array.isArray(raw) ? raw : [raw]) {
      if (row && typeof row === "object" && STAT_ROW_PATHS[norm(row.target)]) {
        // WHO GAVE IT (3.668.0), kept apart from `source`: Formless Cut ignores
        // what a stance's effect gives, and needs to know which rows those are.
        out.push({ ...row, target: norm(row.target), label: String(row.label ?? c.name ?? "Bonus"), carrierUuid: String(c.uuid ?? "") });
      }
    }
  }
  return out;
}

/** The value a row gives at this level, before its conditions are asked. */
export function statRowValue(row, { attributes = {}, level = 0, classBonus = 0 } = {}) {
  // A SCALED FIGURE (3.668.0; Inner Tempest's Echoing Crane, "class bonus -1
  // to your DB", and Iron Tortoise, "+1 DB per 2 Int mod (min +1)"), read
  // with the conditionals' own grammar.
  if (row?.valueFrom) {
    const scaling = { classBonus: Number(classBonus) || 0, level: Number(level) || 0, halfLevel: Math.floor((Number(level) || 0) / 2) };
    for (const key of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]) scaling[key] = Number(attributes?.[key]?.total ?? 0) || 0;
    const figure = scaledFigure(row.valueFrom, scaling);
    if (figure === null) return 0;
    return Number.isFinite(Number(row.valueMin)) ? Math.max(figure, Math.trunc(Number(row.valueMin))) : figure;
  }
  if (row?.ability) {
    const total = Number(attributes?.[norm(row.ability)]?.total ?? 0);
    return Math.max(0, Number.isFinite(total) ? total : 0);
  }
  if (Array.isArray(row?.byLevel)) {
    let best = 0;
    for (const step of row.byLevel) {
      if (Number(level) >= Number(step?.level ?? Infinity)) best = Number(step?.value) || 0;
    }
    return best;
  }
  return Number(row?.value) || 0;
}

/** Why a row is off right now, or null when it applies. */
function statRowRefusal(row, { wearingArmour = false, encumbered = false } = {}) {
  const when = row?.when ?? {};
  if (when.unarmoured && wearingArmour) return "wearing armour";
  if (when.unencumbered && encumbered) return "encumbered";
  return null;
}

/**
 * The bonus entries to add, each with the pool path it goes to.
 *
 * @param {Array<object>} rows
 * @param {{attributes?: object, level?: number, wearingArmour?: boolean, encumbered?: boolean}} state
 * @returns {Array<{path: string, entry: {label: string, value: number, type: string, source: string}}>}
 */
export function statRowEntries(rows = [], state = {}) {
  const out = [];
  for (const row of rows ?? []) {
    if (statRowRefusal(row, state)) continue;
    const value = statRowValue(row, state);
    if (!value) continue;
    out.push({
      path: STAT_ROW_PATHS[row.target],
      entry: { label: row.label, value, type: String(row.type ?? "untyped"), source: "statRow", ...(row.carrierUuid ? { carrierUuid: row.carrierUuid } : {}) }
    });
  }
  return out;
}
