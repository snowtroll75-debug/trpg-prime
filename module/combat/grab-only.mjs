/**
 * A STRIKE THAT ONLY GRABS (3.652.0; F&F 3.0 block 19 R4 — Graham, 16
 * October 2026: "Go with your recommendations"). The Giant Chameleon's
 * Tongue: "+8 (agile, reach 15) grab only". Declared on the weapon as
 * `flags.trg-prime.creatureAttack.grabOnly`. A hit deals no damage and
 * inflicts no critical injury: the target is Grabbed by the attacker — the
 * same `grabbedBy` mark a landed Grapple writes, so Swallow and Constrict
 * read it.
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";

/** Whether the weapon is declared to grab rather than damage. */
export function isGrabOnly(weapon) {
  return weapon?.flags?.[SYSTEM_ID]?.creatureAttack?.grabOnly === true;
}

/**
 * THE GRAB TRAIT (3.657.0; F&F 3.0 block 24 R6 — Graham, 17 October 2026:
 * "Go with your recommendations"). "Vine +23 (grab, reach 30)": a hit also
 * Grabs the target, marked as held by the attacker, and deals its damage as
 * usual. The trait as a word in the weapon's traits.
 */
export function hasGrabTrait(weapon) {
  return /(^|[\s,(])grab([\s,)]|$)/i.test(String(weapon?.system?.traits ?? ""));
}

/** The card's line for a grab trait's hit. */
export function grabTraitLine(attackerName, targetName, weaponName) {
  return `<strong>${weaponName} (grab):</strong> ${targetName} is <strong>Grabbed</strong> by ${attackerName}.`;
}

/** The card's line for a grab-only hit. */
export function grabOnlyLine(attackerName, targetName, weaponName, critical = false) {
  return `<strong>${weaponName} grabs.</strong> ${targetName} is <strong>Grabbed</strong> by ${attackerName}`
    + ` — the ${weaponName} deals no damage${critical ? " and a critical inflicts no injury" : ""}.`;
}

/**
 * A STRIKE THAT ONLY LAYS A CONDITION (3.661.0; F&F 3.0 block 30 R2 — the
 * spiders' Web: "a target struck by the web is immobilised and must make
 * Escape checks to free themselves"). The grab-only Strike's shape,
 * generalised: `flags.trg-prime.creatureAttack.hitCondition: { key }`. A hit
 * deals no damage and inflicts no injury; the condition is laid. Core's Escape
 * already ends Immobilised (and Grabbed).
 *
 * @returns {{key: string}|null}
 */
export function hitConditionOf(weapon) {
  const raw = weapon?.flags?.[SYSTEM_ID]?.creatureAttack?.hitCondition;
  const key = String(raw?.key ?? "").trim();
  return key ? { key } : null;
}

/** The card's line for a condition-only hit. */
export function hitConditionLine(attackerName, targetName, weaponName, label, critical = false) {
  return `<strong>${weaponName}:</strong> ${targetName} is <strong>${label}</strong> — the ${weaponName} deals no damage${critical ? " and a critical inflicts no injury" : ""}. It may Escape to free itself.`;
}
