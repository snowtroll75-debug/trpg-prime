/**
 * ONE BASIC SAVE AGAINST ONE CREATURE, AFTER THE CAST.
 *
 * NEW at 3.610.0. The cast workflow's own basic-save branch is the model,
 * and it can only run at the cast: it is buried in a function that also
 * draws the template, spends the PP and prints the card. A wall bites when
 * a creature walks into it or ends a turn in it, and a storm strikes on
 * each Sustain — rounds later, from a Region that remembers the DC.
 *
 * THE SAME RULE, NOT A SECOND ONE: `basicSavingThrow` decides the share and
 * the critical, `criticalBonusDamage` reads the spell's Base Damage for the
 * extra dice, `resolveAgainstDefences` applies resistance as a magical area
 * source, and `rollCriticalInjury` rolls the injury at the creature.
 */

/**
 * Roll a creature's save, and deal its share.
 *
 * @param {object} opts
 * @param {Actor|null} opts.caster who rolls the critical (the creature itself if none)
 * @param {Actor} opts.target
 * @param {string} opts.save "fortitude" | "reflex" | "will"
 * @param {number} opts.dc
 * @param {string} opts.label what to call the source on the card
 * @param {string} [opts.formula] rolled for this creature alone
 * @param {number|null} [opts.amount] a total already rolled for everyone
 * @param {string} opts.type the damage type
 * @param {string} [opts.baseDamage] the spell's Base Damage, for a critical's extra dice
 * @returns {Promise<{line: string, degree: string, taken: number}>}
 */
export async function basicSaveHit({ caster = null, target, save, dc, label, formula = "", amount = null, type, baseDamage = "" }) {
  const { TRGCheck } = await import("../dice/check.mjs");
  const { basicSavingThrow } = await import("../dice/resolution.mjs");
  const { criticalBonusDamage } = await import("./spell-damage.mjs");
  const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
  const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
  const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");

  const saveName = save.charAt(0).toUpperCase() + save.slice(1);
  const saveData = target.system?.combat?.saves?.[save];
  const check = await TRGCheck.roll({
    actor: target,
    label: `${target.name} — ${saveName} Save`,
    subtitle: `vs ${label} — DC ${dc}`,
    type: "save",
    saveSource: label,
    sourceUuid: caster?.uuid ?? "",
    subject: save,
    dc,
    modifiers: saveData?.checkModifiers ?? [
      { label: `${saveName} save`, value: Number(saveData?.total ?? 0), type: "untyped" }
    ]
  });
  const degree = check?.outcome?.degree?.key ?? "failure";
  const degreeLabel = check?.outcome?.degree?.label ?? degree;
  const bs = basicSavingThrow(degree, check?.outcome?.margin ?? null);

  // NO TOTAL MEANS "ROLL IT HERE", AND NULL IS NO TOTAL (3.610.1, F1 of
  // the 3.610.0 drive). This read `Number(amount)` and asked whether that
  // was finite — and `Number(null)` is 0, which is. So every caller that
  // left the roll to this function (a wall's crossing and turn saves, the
  // storm's lightning) dealt exactly nothing, and rolled no critical with
  // it. Hail and Acid Rain pass a total in and were right all along.
  const given = amount === null || amount === undefined || amount === "" ? NaN : Number(amount);
  let base = given;
  if (!Number.isFinite(base)) base = formula ? (await new Roll(formula).evaluate()).total : 0;
  let dealt = Math.floor(base * bs.damageMultiplier);
  const extra = criticalBonusDamage({ baseDamage }, bs.criticalSeverity, bs.bonusBaseDamage);
  if (extra && dealt > 0) dealt += (await new Roll(extra).evaluate()).total;

  let taken = 0;
  let hp = null;
  let bracersLine = "";
  if (dealt > 0) {
    const packet = resolveAgainstDefences(target.system ?? {}, {
      amount: dealt, type,
      creatureTypeSystem: ownedCreatureTypeSystem(target),
      magical: true,
      area: true
    });
    // Bracers of Armour absorb what their DR stopped (3.617.0, R17).
    const { drainBracers } = await import("../bracers-workflow.mjs");
    bracersLine = await drainBracers(target, packet);
    taken = packet.taken;
    if (taken > 0) {
      const applied = await applyDamageAndCheckDying(target, taken, { isCritical: Boolean(bs.criticalSeverity) });
      hp = applied?.newHP ?? null;
    }
  }
  if (bs.criticalSeverity && taken > 0) {
    const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
    await rollCriticalInjury(caster ?? target, {
      targetActor: target, damageType: type, severity: bs.criticalSeverity, attackBonus: dc
    });
  }
  const total = check?.outcome?.total ?? "?";
  const line = `${target.name}: <strong>${degreeLabel}</strong> (${total} vs DC ${dc}) — `
    + (taken > 0
      ? `<strong>${taken} ${type}</strong>${bs.criticalSeverity ? ` and a ${bs.criticalSeverity} critical` : ""}`
        + `${hp !== null ? ` — now ${hp} HP` : ""}.`
      : "unharmed.") + bracersLine;
  return { line, degree, taken };
}

/** The caster recorded on a Region, or null. */
export async function recordedCaster(uuid) {
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    return doc?.documentName === "Actor" ? doc : (doc?.actor ?? null);
  } catch {
    return null;
  }
}

/** Is this token's centre inside the Region? */
export function tokenInRegion(region, token) {
  const t = token?.object ?? token;
  const c = t?.center ?? null;
  if (!c) return false;
  try {
    return region.testPoint({ x: c.x, y: c.y, elevation: t.document?.elevation ?? 0 });
  } catch {
    return false;
  }
}

/** Every creature token on the scene whose centre is inside the Region. */
export function tokensInRegion(region) {
  return (canvas?.tokens?.placeables ?? []).filter((t) => t.actor && tokenInRegion(region, t));
}

