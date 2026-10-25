/**
 * A BLOW HELD (3.668.0): Inner Tempest's Black Lotus. "Once per round, may
 * delay your damage and critical rolls until the start of the enemy's turn."
 *
 * Graham's ruling, 23 October 2026: the Strike stops after the hit. At the
 * start of the target's turn a card offers "Land the blow", which rolls the
 * critical injury and the damage through the core's own damage roll, set to
 * that hit (`rollWeaponDamage`'s preset path), against that target.
 *
 * What the landing does not carry, because the Strike's own hit path is not
 * re-run: riders, precision dice and declared Armour Rending that the
 * Strike would have added. The damage's declared bonuses (the forms' "+Int
 * to damage") are asked as on any damage roll.
 *
 * The record lives on the attacker (`flags.trg-prime.heldStrike`); there is
 * one at a time ("once per round").
 */

const SYSTEM_ID = "trg-prime";

/* ------------------------------------------------------------------ */
/* Pure                                                                 */
/* ------------------------------------------------------------------ */

/** The record a held blow leaves. */
export function heldStrikeRecord({ weaponId = "", weaponName = "", targetUuid = "", targetName = "", critical = null, damageType = "", label = "Held blow", combatId = "", round = 0 } = {}) {
  return {
    weaponId: String(weaponId), weaponName: String(weaponName),
    targetUuid: String(targetUuid), targetName: String(targetName),
    critical: critical ? String(critical) : null,
    damageType: String(damageType ?? ""),
    label: String(label || "Held blow"),
    combatId: String(combatId ?? ""), round: Number(round) || 0
  };
}

/**
 * Is the held blow due: is the combatant whose turn has started its target?
 *
 * @param {object|null} record
 * @param {{actorUuid: string, combatId: string}} turn the combatant now acting
 */
export function heldStrikeDue(record, { actorUuid = "", combatId = "" } = {}) {
  if (!record?.targetUuid) return false;
  if (record.combatId && combatId && record.combatId !== combatId) return false;
  return record.targetUuid === actorUuid;
}

/* ------------------------------------------------------------------ */
/* Foundry                                                              */
/* ------------------------------------------------------------------ */

/**
 * Land the held blow: the critical injury, if the hit was a critical, then
 * the damage, against the recorded target. Clears the record.
 *
 * @param {Actor} actor the attacker
 * @returns {Promise<boolean>} whether a blow landed
 */
export async function landHeldStrike(actor) {
  const record = actor?.getFlag?.(SYSTEM_ID, "heldStrike");
  if (!record) return false;
  const weapon = actor.items?.get?.(record.weaponId) ?? null;
  const targetActor = record.targetUuid ? await fromUuid(record.targetUuid) : null;
  await actor.unsetFlag(SYSTEM_ID, "heldStrike");
  if (!weapon || !targetActor) {
    ui.notifications?.warn?.(`${record.label}: the weapon or the target is gone; the blow does not land.`);
    return false;
  }
  const { activeToken } = await import("./geometry.mjs");
  const targetToken = activeToken(targetActor) ?? null;
  const { rollCriticalInjury, rollWeaponDamage } = await import("./attack-workflow.mjs");
  let locationArmoured = true; let armourAmended = false;
  if (record.critical) {
    const injury = await rollCriticalInjury(actor, {
      targetActor,
      damageType: record.damageType || weapon.system?.damageType || "slashing",
      severity: record.critical,
      attackBonus: Number(actor.system?.combat?.attack?.total ?? 0),
      hasSerrated: /\bserrated\b/i.test(String(weapon.system?.traits ?? "")),
      weaponTraits: String(weapon.system?.traits ?? ""),
      weapon
    });
    locationArmoured = injury?.locationArmoured ?? true;
    armourAmended = Boolean(injury?.armourAmended);
  }
  await rollWeaponDamage(actor, weapon, {
    preset: {
      critical: record.critical, locationArmoured, armourAmended,
      damageType: record.damageType || null, targetToken,
      note: `${record.label}: the held blow lands on ${targetActor.name}.`
    }
  });
  return true;
}
