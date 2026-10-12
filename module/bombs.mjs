/**
 * Thrown alchemical bombs (Chapter 6, pages 185–186) — the rules, pure.
 *
 * NEW at 3.578.0, for the block-18 audit. The Foundry side is `throwBomb`
 * in alchemical-workflow.mjs; everything that decides something is here,
 * where the harness can drive it.
 *
 * WHAT WAS WRONG (D1–D6). `throwBomb` has existed since 3.249.0 and every
 * bomb it ever threw HIT. It asked `check.outcome !== "failure"`, and
 * `check.outcome` is an object — the total, the margin and the degree —
 * so the comparison was always true, and `isCritical` (the same object
 * against "critical") always false. No DC was passed, so the target's DB
 * was never read. It cost no AP, took no multiple attack penalty and
 * added nothing to it, applied no range penalty, printed recurring damage
 * and bleed as lines for the GM, applied none of the bombs' other
 * effects, refused the Tanglefoot Bag outright for printing no damage,
 * and dealt Holy Water's "good/essence" damage — not a damage type — to
 * anyone it hit.
 *
 * GRAHAM'S RULINGS, 20 September 2026 (the block-18 audit):
 *
 *   R4  the thrown-weapon rules: roll against DB, AV 5+ is a critical,
 *       it rolls a critical injury with the bomb's damage type, and
 *       "on a critical hit" effects apply.
 *   R5  Holy Water is essence damage with the Good trait, dealt only to
 *       undead and evil eternals; anyone else takes nothing, splash
 *       included.
 *   R6  Thunderstone's save is the vial's own level DC, rolled by each
 *       creature within 10 ft of the target.
 *   R7  Tanglefoot: -10 status to Speeds for 1 minute; immobilised for 1
 *       round on a critical; Escape against the bag's level DC ends it,
 *       and so do 3 Interact actions from anyone.
 *
 * WHAT A BOMB DOES BEYOND ITS DAMAGE IS DATA, on the pack item at
 * `flags.trg-prime.alchemical.bombEffects` — see `bombEffectsOf` — so no
 * vial is named in code and a new one needs no code at all.
 */

import { attackOutcome, criticalSeverity } from "./combat/attack.mjs";
import { rangeIncrementPenalty } from "./combat/ranged.mjs";
import { levelDC } from "./dice/resolution.mjs";
import { hasCreatureTrait } from "./creature-traits.mjs";
import { isEvilEternal } from "./magic/alignment-channel.mjs";

const SYSTEM_ID = "trg-prime";

/** "Activate Strike (1 AP)" — every vial on pages 185–186. */
export const BOMB_STRIKE_AP = 1;

/** How many Interact actions scrape a tanglefoot bag off (page 186). */
export const TANGLEFOOT_INTERACTS = 3;

/**
 * When a rider applies.
 *
 *   hit              any hit, a critical included
 *   hitNotCritical   a hit that is not a critical — Sulphur Bomb's
 *                    "−1 … or becomes sickened 1 on a critical hit" and
 *                    Violet Haze's "frightened 1 or frightened 2 on a
 *                    critical hit" are one or the other, never both
 *   critical         a critical hit only
 */
const RIDER_TIMINGS = Object.freeze(["hit", "hitNotCritical", "critical"]);

/**
 * The bomb's declared extras, normalised. Absent fields read as nothing.
 *
 * @param {object} item
 * @returns {{effects: object[], area: object|null, onlyVs: string[], sourceTraits: string[],
 *   immunitySeconds: number, escape: object|null, notes: string[]}}
 */
export function bombEffectsOf(item) {
  const raw = item?.flags?.[SYSTEM_ID]?.alchemical?.bombEffects ?? {};
  return {
    effects: Array.isArray(raw.effects) ? raw.effects.filter((e) => RIDER_TIMINGS.includes(e?.on)) : [],
    area: raw.area && typeof raw.area === "object" ? raw.area : null,
    onlyVs: Array.isArray(raw.onlyVs) ? raw.onlyVs.map((v) => String(v).trim().toLowerCase()) : [],
    sourceTraits: Array.isArray(raw.sourceTraits) ? raw.sourceTraits.map((t) => String(t).trim().toLowerCase()) : [],
    immunitySeconds: Math.max(0, Number(raw.immunitySeconds) || 0),
    escape: raw.escape && typeof raw.escape === "object" ? raw.escape : null,
    notes: Array.isArray(raw.notes) ? raw.notes.map(String) : []
  };
}

/**
 * Does this bomb harm this creature at all?
 *
 * HOLY WATER (R5): "Holy water damages undead creatures and evil
 * eternals." Anything else is untouched — the damage, the splash, all of
 * it. Asked of `hasCreatureTrait` (a type implies its trait) and
 * `isEvilEternal`, the test the Alignment Channel feat already uses for
 * the same pair of words.
 *
 * @param {{onlyVs: string[]}} effects
 * @param {object} targetSystem
 * @returns {boolean}
 */
export function bombReaches(effects, targetSystem) {
  const only = effects?.onlyVs ?? [];
  if (!only.length) return true;
  return only.some((kind) => {
    if (kind === "evil eternal") return isEvilEternal(targetSystem);
    return hasCreatureTrait(targetSystem, kind);
  });
}

/**
 * The creatures a bomb harms, in words for the card: "undead and evil
 * eternals" (3.578.1, F4 of the 3.578.0 live test — it read "undead and
 * evil eternal"). The data keeps the singular, which is what the matcher
 * above compares; only the card is plural. "Undead" is its own plural.
 *
 * @param {string[]} onlyVs
 * @returns {string}
 */
export function onlyVsText(onlyVs) {
  const plural = (word) => (/(undead|s)$/i.test(word) ? word : `${word}s`);
  return (onlyVs ?? []).map((w) => plural(String(w))).join(" and ");
}

/**
 * The throw's result against the target's DB — the thrown-weapon rules
 * (R4), through the same `attackOutcome` every Strike uses: an
 * unmodified 1 always misses and a 20 always hits, the AV is the margin,
 * and a critical is read from the AV against Critical Resistance.
 *
 * @param {object} state
 * @param {number} state.unmodified
 * @param {number} state.total
 * @param {number|null} state.db
 * @param {boolean} [state.proficient]
 * @param {number} [state.criticalResistance]
 * @param {boolean} [state.criticalImmune]
 * @returns {{resolved: boolean, hits: boolean|null, av: number|null,
 *   critical: {severity: string, bonusDice: number, diceBias: string, injuryImmune: boolean}|null,
 *   autoMiss: boolean, autoHit: boolean}}
 */
export function bombAttackResult({
  unmodified, total, db = null, proficient = true, criticalResistance = 0, criticalImmune = false
} = {}) {
  const outcome = attackOutcome({ unmodified, total, db, proficient, criticalResistance, criticalImmune });
  return {
    resolved: Boolean(outcome.resolved ?? (db !== null && db !== undefined)),
    hits: outcome.hits ?? null,
    av: outcome.av ?? null,
    critical: outcome.critical ?? null,
    autoMiss: Boolean(outcome.autoMiss),
    autoHit: Boolean(outcome.autoHit)
  };
}

/** Re-exported for the harness: the severity bands a bomb's critical reads. */
export { criticalSeverity };

/**
 * The riders that apply to this result.
 *
 * @param {{effects: object[]}} effects
 * @param {{hit: boolean, critical: boolean}} result
 * @returns {object[]}
 */
export function bombRidersFor(effects, { hit = false, critical = false } = {}) {
  if (!hit) return [];
  return (effects?.effects ?? []).filter((rider) => {
    if (rider.on === "hit") return true;
    if (rider.on === "critical") return critical;
    if (rider.on === "hitNotCritical") return !critical;
    return false;
  });
}

/**
 * The range penalty and whether the target is out of reach at all:
 * "a range increment of 20 feet" (page 185), and Chapter 7's six
 * increments as the most anything thrown can travel.
 *
 * @param {number|null} distance feet, or null when not measurable
 * @param {number} [increment]
 * @returns {{increments: number, penalty: number, outOfRange: boolean}}
 */
export function bombRange(distance, increment = 20) {
  if (distance === null || distance === undefined || !Number.isFinite(Number(distance))) {
    return { increments: 1, penalty: 0, outOfRange: false };
  }
  const range = rangeIncrementPenalty(Number(distance), increment);
  return { increments: range.increments, penalty: range.penalty ?? 0, outOfRange: range.outOfRange };
}

/**
 * The bonus damage a critical adds: one die of the bomb's own size per
 * step of severity (minor +1, serious +2, deadly +3), as a Strike's
 * critical adds its weapon's. A bomb with no dice (the Tanglefoot Bag)
 * adds nothing.
 *
 * @param {string} damage the bomb's damage at its level, e.g. "2d6"
 * @param {number} bonusDice
 * @returns {string} a formula, or ""
 */
export function bombCriticalDice(damage, bonusDice) {
  const dice = /(\d+)d(\d+)/i.exec(String(damage ?? ""));
  const count = Math.max(0, Math.floor(Number(bonusDice) || 0));
  if (!dice || !count) return "";
  return `${count}d${dice[2]}`;
}

/**
 * The save a Thunderstone asks (R6): the vial's own level DC.
 *
 * @param {number} itemLevel
 * @returns {number}
 */
export function bombSaveDC(itemLevel) {
  return levelDC(Math.max(0, Math.floor(Number(itemLevel) || 0)));
}

/**
 * The Tanglefoot Bag's scrape-off count (R7): three Interact actions,
 * "don't have to be consecutive, and other creatures can provide the
 * actions as well".
 *
 * @param {number} left before this action
 * @returns {{left: number, ended: boolean}}
 */
export function tanglefootInteract(left) {
  const before = Math.max(0, Math.floor(Number(left) || 0));
  const after = Math.max(0, before - 1);
  return { left: after, ended: after === 0 };
}

/**
 * The recurring damage a hit applies, keeping the stronger of two of the
 * same type rather than adding them — the engine carries one Recurring
 * Damage condition per creature, and a second flask of acid does not
 * make the first one burn harder.
 *
 * @param {{value: number, damageType: string}|null} existing
 * @param {number} incoming
 * @param {string} damageType
 * @returns {{value: number, damageType: string, replaced: boolean}}
 */
export function recurringAfterHit(existing, incoming, damageType) {
  const value = Math.max(0, Math.floor(Number(incoming) || 0));
  if (!existing || !existing.value) return { value, damageType, replaced: false };
  if (String(existing.damageType ?? "") === String(damageType ?? "")) {
    return { value: Math.max(Number(existing.value) || 0, value), damageType, replaced: false };
  }
  return { value, damageType, replaced: true };
}
