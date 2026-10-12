/**
 * A BURST AROUND A POINT — every creature within a radius of a token, each
 * making a basic save against one damage roll.
 *
 * NEW at 3.617.0, lifted out of Charge Depletion's explosion (3.616.0, R16)
 * when the Pearl of Force (block 37, C2) turned out to be the same thing:
 * "a burst that deals 3d8 points of force damage to all creatures within a
 * 10-foot radius (Basic Reflex DC 22)". One damage roll for the burst, as an
 * area spell rolls one; each creature saves; a failure's extra base dice
 * (`basicSavingThrow`) are rolled at the burst's own die.
 */

import { basicSavingThrow } from "./dice/resolution.mjs";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

/** The die a formula rolls, for a failure's extra base dice: "3d8" → 8. */
export function burstDie(formula) {
  const m = /(\d+)\s*d\s*(\d+)/i.exec(String(formula ?? ""));
  return m ? Number(m[2]) : 6;
}

/**
 * @param {object} options
 * @param {object|null} options.center the token at the burst's centre
 * @param {number} options.radiusFeet
 * @param {string} options.formula e.g. "3d8"
 * @param {string} options.damageType
 * @param {number} options.dc
 * @param {string} [options.save] "reflex" by default
 * @param {string} options.label what is bursting, for the save and the card
 * @param {Array} [options.fallback] who is caught when there is no canvas
 * @returns {Promise<{total: number, lines: string[], caught: Array}>}
 */
export async function burstDamage({ center, radiusFeet, formula, damageType, dc, save = "reflex", label, fallback = [] }) {
  const caught = [];
  if (center && canvas?.tokens?.placeables?.length) {
    const { distanceBetween } = await import("./combat/geometry.mjs");
    for (const token of canvas.tokens.placeables) {
      if (!token?.actor) continue;
      if (token.id === center.id || distanceBetween(center, token) <= radiusFeet) caught.push(token.actor);
    }
  }
  if (!caught.length) caught.push(...fallback);
  const rolled = await new Roll(formula).evaluate();
  const { TRGCheck } = await import("./dice/check.mjs");
  const { applyTypedDamage } = await import("./combat/damage-workflow.mjs");
  const Save = `${save[0].toUpperCase()}${save.slice(1)}`;
  const die = burstDie(formula);
  const lines = [line(`${label}: <strong>${rolled.total}</strong> ${damageType} (${formula}), basic ${Save} DC ${dc}.`)];
  for (const victim of [...new Set(caught)]) {
    const saves = victim.system?.combat?.saves?.[save];
    const check = await TRGCheck.roll({
      actor: victim,
      label: `${Save} Save — ${label}`,
      subject: save,
      subtitle: `DC ${dc} basic ${Save} save`,
      type: "save",
      dc,
      modifiers: [...(saves?.checkModifiers ?? [{ label: Save, value: Number(saves?.total ?? 0), type: "untyped" }])]
    });
    const degree = check?.outcome?.degree?.key ?? "failure";
    const basic = basicSavingThrow(degree, check?.outcome?.margin ?? null);
    let total = rolled.total;
    // THE BONUS DICE ARE NAMED (3.617.1, G2 of the 3.617.0 drive): a fumbled
    // save took 18 from a printed 13, and the card did not say why.
    let bonusText = "";
    if (basic.bonusBaseDamage > 0) {
      const bonus = await new Roll(`${basic.bonusBaseDamage}d${die}`).evaluate();
      total += bonus.total;
      bonusText = ` (${rolled.total} + ${basic.bonusBaseDamage}d${die} = ${bonus.total} bonus base damage)`;
    }
    const dealt = Math.floor(total * basic.damageMultiplier);
    const applied = dealt > 0 ? await applyTypedDamage(victim, { amount: dealt, type: damageType }) : null;
    lines.push(line(`${victim.name}: ${check?.outcome?.degree?.label ?? degree} — `
      + `${dealt > 0 ? `<strong>${Number(applied?.applied ?? 0)}</strong> ${damageType} taken${bonusText}` : "no damage"}.`));
  }
  return { total: rolled.total, lines, caught };
}
