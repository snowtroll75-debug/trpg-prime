/**
 * trait-rules — the clauses of Appendix 3 that were left as text.
 *
 * NEW at 3.622.0 (block 39, Graham's rulings of 5 October 2026: R8–R13,
 * "your recommendation", and the audit's A17, A19 and A20). Pure, and given
 * plain data, so the harness can run every clause; the workflows read the
 * actor, the combat and the scene and hand the answer on.
 *
 * traits.mjs keeps the per-turn record and the parser; this file is the
 * rest of the appendix.
 */

import { hasTrait, rarityDCIncrease } from "./traits.mjs";

/**
 * An ITEM's traits are written space-separated ("Invested Magical Rod"),
 * where an action's and a spell's are comma-separated. Either reads here.
 */
export function itemHasTrait(item, name) {
  const source = String(item?.system?.traits ?? item?.traits ?? "");
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return false;
  return source.split(/[,\s]+/).map((t) => t.trim().toLowerCase()).includes(wanted);
}

/* ------------------------------------------------------------------ */
/* LIGHT (A17, R9)                                                     */
/* ------------------------------------------------------------------ */

/**
 * "Any spell that has this trait increase the illumination level by one
 * step (max 8), unless its description states otherwise."
 */
const LIGHT_TRAIT_DEFAULT = Object.freeze({ steps: 1, cap: 8 });

/** Row kinds that state a spell's own light. */
const STATES_ITS_LIGHT = Object.freeze(["light", "lightShift", "wall"]);

/** Whether a duration text describes something that lasts. */
function lastingDuration(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t || /instant/.test(t)) return false;
  return /round|minute|hour|day|week|sustain|unlimited|until|permanent/.test(t);
}

/**
 * The light-shift row a Light-traited spell that states no light of its own
 * gets, or null.
 *
 * Centred on the caster for an emanation (or a spell with no area), and on
 * each creature it reaches otherwise — Fairy Fire's outlined targets, a
 * Glitterdust cloud's victims. Only for a spell that lasts: an instant
 * bolt's flash leaves nothing for the light level to read.
 */
export function lightTraitDefaultRow(spellSystem = {}, name = "") {
  if (!hasTrait(spellSystem?.traits ?? "", "light")) return null;
  const rows = [
    ...(spellSystem?.effects ?? []),
    ...(spellSystem?.apOptions ?? []).flatMap((o) => o?.effects ?? [])
  ];
  if (rows.some((r) => STATES_ITS_LIGHT.includes(String(r?.kind ?? "")))) return null;
  if (!lastingDuration(spellSystem?.duration)) return null;
  const area = String(spellSystem?.area ?? "").toLowerCase();
  const emanation = area.match(/(\d+)\s*-?\s*f(?:oo)?t\.?\s*-?\s*(?:emanation|aura)/);
  const onSelf = Boolean(emanation) || !area.trim();
  return {
    kind: "lightShift",
    label: `${name || "Light"} (Light trait)`,
    target: onSelf && !String(spellSystem?.targets ?? "").trim() ? "self" : "targets",
    steps: LIGHT_TRAIT_DEFAULT.steps,
    cap: LIGHT_TRAIT_DEFAULT.cap,
    radiusFeet: emanation ? Number(emanation[1]) : 5,
    follows: true,
    lightTraitDefault: true
  };
}

/* ------------------------------------------------------------------ */
/* RARE AND UNCOMMON (A19, R10)                                        */
/* ------------------------------------------------------------------ */

/** The checks a creature's rarity makes harder (R10). */
const RARITY_ACTIONS = Object.freeze(["recallKnowledge", "identifyPower", "identifyAlchemy"]);

/**
 * "All checks in relation to the entity with this trait have their DC
 * increased by +5" (Rare), +2 (Uncommon) — for identifying or recalling
 * knowledge about a targeted creature.
 *
 * @param {string} actionKey
 * @param {string[]} creatureTraits the target's traits, as creatureTraits() lists them
 */
export function rarityRaiseForAction(actionKey, creatureTraits = []) {
  if (!RARITY_ACTIONS.includes(actionKey)) return 0;
  return rarityDCIncrease(Array.from(creatureTraits ?? []).join(", "));
}

/**
 * An affliction's rarity raise: the GM's own modifier when one is set,
 * otherwise the page's +5 / +2.
 */
export function afflictionRarityRaise(system = {}) {
  const typed = Math.floor(Number(system?.rarityModifier) || 0);
  if (typed) return typed;
  return rarityDCIncrease({ rarity: system?.rarity ?? "", traits: system?.traits ?? "" });
}

/** The card's words for a rarity raise: "(+5: the Basilisk is Rare)", or "". */
export function rarityRaiseNote(name, raise) {
  const n = Math.trunc(Number(raise) || 0);
  if (n <= 0) return "";
  return `(+${n}: ${name || "the target"} is ${n >= 5 ? "Rare" : "Uncommon"})`;
}

/**
 * A DC THE GM SETS AFTER THE ROLL (3.622.1; the 3.622.0 drive's F2, Graham's
 * R2). Recall Knowledge with no DC goes to "Awaiting Difficulty", and the
 * raise could only be added to a DC settled before the dice — so the common
 * way of running the action skipped it. The raise is stored with the card's
 * pending outcome and added here to whatever the GM enters.
 *
 * @param {number} entered the GM's DC
 * @param {{value:number, name:string}|null} raise what the roll stored
 * @returns {{dc:number, note:string}}
 */
export function lateSetDC(entered, raise = null) {
  const n = Math.max(0, Math.trunc(Number(raise?.value) || 0));
  return { dc: Number(entered) + n, note: rarityRaiseNote(raise?.name ?? "", n) };
}

/* ------------------------------------------------------------------ */
/* SPLASH (A20)                                                        */
/* ------------------------------------------------------------------ */

/** "multiplied by the severity level … of the critical". */
const SEVERITY_LEVEL = Object.freeze({ minor: 1, serious: 2, deadly: 3 });

/** The splash a hit deals: × the critical's severity level on a critical. */
export function splashOnHit(amount, criticalSeverity = null) {
  const base = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!criticalSeverity) return base;
  return base * (SEVERITY_LEVEL[String(criticalSeverity).toLowerCase()] ?? 1);
}

/**
 * "Attack Misses: The bomb lands off target and scatters half the distance
 * of the original throw in a random direction." The direction is a d8 —
 * the eight squares around the aimed one.
 */
const SCATTER_DIRECTIONS = Object.freeze(["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]);

export function scatter(throwFeet, d8) {
  const feet = Math.max(0, Math.floor((Number(throwFeet) || 0) / 2 / 5) * 5);
  const face = Math.min(8, Math.max(1, Math.trunc(Number(d8) || 1)));
  return { feet, direction: SCATTER_DIRECTIONS[face - 1] };
}

/* ------------------------------------------------------------------ */
/* ELECTRICITY UNDERWATER (R8), and the other elemental environments    */
/* ------------------------------------------------------------------ */

/**
 * Why an elemental spell cannot be cast where the caster is, or "".
 *
 * Fire, Air, Water: "cannot be cast underwater". Earth: "cannot be cast in
 * mid-air". Sonic: "cannot be used in a vacuum".
 */
export function elementalCastingRefusal(traits, { underwater = false, airborne = false, vacuum = false } = {}) {
  if (underwater) {
    for (const t of ["fire", "air", "water"]) {
      if (hasTrait(traits, t)) return `${t[0].toUpperCase()}${t.slice(1)} spells cannot be cast underwater`;
    }
  }
  if (airborne && hasTrait(traits, "earth")) return "Earth spells cannot be cast in mid-air";
  if (vacuum && hasTrait(traits, "sonic")) return "Sonic effects cannot be used in a vacuum";
  return "";
}

/** Cold: "Cold spells cast underwater crystalise and change their damage type to piercing." */
export function underwaterDamageType(type, underwater = false) {
  return underwater && String(type ?? "").trim().toLowerCase() === "cold" ? "piercing" : type;
}

/* ------------------------------------------------------------------ */
/* TELEPORTATION, ROD, STAFF, INVESTED, RAGE (R11, R12)                 */
/* ------------------------------------------------------------------ */

/** Whether a {combatId, round, turn} stamp is this combat's current turn. */
function stampIsThisTurn(stamp, combat) {
  return Boolean(stamp && combat && stamp.combatId === combat.id
    && stamp.round === combat.round && stamp.turn === combat.turn);
}

/** Whether a {combatId, round} stamp is this combat's current round. */
export function stampIsThisRound(stamp, combat) {
  return Boolean(stamp && combat && stamp.combatId === combat.id && stamp.round === combat.round);
}

/**
 * Teleportation, on the creature moved: "If you are subject to an
 * additional teleportation effect in a turn, it automatically fails."
 * Otherwise it owes "a Spatial Awareness check to continuing acting".
 */
export function teleportArrival(stamp, combat) {
  if (!combat) return { fails: false, check: false };
  if (stampIsThisTurn(stamp, combat)) return { fails: true, check: false };
  return { fails: false, check: true };
}

/**
 * Rod: "You can only gain the benefits of one magical item with this trait
 * each round. Furthermore, you may only use an item with the trait once per
 * turn. You cannot combine the effects of an item with this trait with
 * other magical items that cast spells such as scrolls, staves and wands."
 */
export function rodRefusal(stamp, combat, { fromItemCast = false } = {}) {
  if (fromItemCast) return "a Rod cannot be combined with a spell cast from a scroll, staff or wand";
  if (stampIsThisRound(stamp, combat)) return "only one Rod may be used each round";
  return "";
}

/** Staff: "Only one item with the Staff trait may be invested by you at any one time." */
export function staffInvestRefusal(item, items = []) {
  if (!itemHasTrait(item, "staff")) return "";
  const other = Array.from(items ?? []).find((i) => i !== item && i?.id !== item?.id
    && i?.system?.invested && itemHasTrait(i, "staff"));
  return other ? `only one Staff may be invested at a time — ${other.name} already is` : "";
}

/** Invested: "must be invested using the Invest Item action before its abilities can be fully utilised." */
export function investedRefusal(item) {
  if (!itemHasTrait(item, "invested")) return "";
  return item?.system?.invested ? "" : "it has the Invested trait and is not invested";
}

/** Rage: "You must be in a state of rage to use abilities and actions that have this trait." */
export function rageTraitRefusal(action, raging, { key = "" } = {}) {
  if (!hasTrait(action, "rage")) return "";
  // INVOKE RAGE IS HOW YOU GET THERE.
  if (key === "invokeRage") return "";
  return raging ? "" : "a Rage action needs you to be raging";
}

/* ------------------------------------------------------------------ */
/* COMPOSITION, POLYMORPH, MORPH (R11)                                  */
/* ------------------------------------------------------------------ */

/**
 * Composition: "You can only have one spell with this trait active at any
 * one time. If you cast a new composition spell, any ongoing effects from
 * your previous composition spell end immediately." The ids to end.
 *
 * @param {{id:string, name:string}[]} active the caster's active spells
 * @param {(name:string)=>boolean} isComposition
 * @param {string} newCastId
 */
export function compositionsToEnd(active = [], isComposition = () => false, newCastId = "") {
  return Array.from(active ?? [])
    .filter((e) => e?.id && e.id !== newCastId && isComposition(e.name))
    .map((e) => e.id);
}

/**
 * Polymorph: "you can only benefit from one polymorph effect at any one time
 * and any subsequent affect attempts to counter the prior." Morph: "a
 * polymorph effect which alters the entire body, immediately ends a morph
 * effect."
 *
 * @param {string} newTraits the incoming spell's traits
 * @param {{castId:string, traits:string}[]} prior the effects already on the creature
 * @returns {{counter:string[], end:string[]}} cast ids to counteract, and to end outright
 */
export function shapeChangeConflicts(newTraits, prior = []) {
  const out = { counter: [], end: [] };
  if (!hasTrait(newTraits, "polymorph")) return out;
  for (const p of prior ?? []) {
    if (!p?.castId) continue;
    if (hasTrait(p.traits, "polymorph") && !out.counter.includes(p.castId)) out.counter.push(p.castId);
    else if (hasTrait(p.traits, "morph") && !out.end.includes(p.castId)) out.end.push(p.castId);
  }
  return out;
}

/** Morph: "Any strikes granted by a morph effect are magical." */
export function morphStrikeIsMagical(sourceTraits) {
  return hasTrait(sourceTraits, "morph");
}
