/**
 * The Foundry half of a versus-damage bonus (see versus-damage.mjs).
 *
 * NEW at 3.608.0 for Smash. ONE CALLER: `resolveWeaponDamage`, beside the
 * other flat additions to a weapon's formula.
 */

import { alignedTraitsOf, creatureTypesOf } from "../aligned.mjs";
import {
  VERSUS_DAMAGE_FLAG, normaliseVersusDamage, versusDamageBonus, versusDamageLine, versusDamageReaching
} from "./versus-damage.mjs";

const SYSTEM_ID = "trg-prime";

/** Every live record this actor carries, with the cast it came from. */
function recordsOn(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled) continue;
    const raw = effect.getFlag?.(SYSTEM_ID, VERSUS_DAMAGE_FLAG);
    const spec = normaliseVersusDamage(raw ? { ...raw, castId: effect.getFlag?.(SYSTEM_ID, "castId") ?? raw.castId } : null);
    if (spec) out.push(spec);
  }
  return out;
}

/**
 * What this attacker adds against this target, asking about the discharge
 * when there is one to take.
 *
 * @returns {Promise<{value: number, line: string}>}
 */
export async function versusDamageFor(attacker, targetActor) {
  if (!attacker || !targetActor) return { value: 0, line: "" };
  const reaching = versusDamageReaching(recordsOn(attacker), creatureTypesOf(targetActor.system ?? {}), alignedTraitsOf(targetActor.system ?? {}));
  if (!reaching.length) return { value: 0, line: "" };
  const best = reaching[0];
  let discharge = false;
  if (best.discharge > 1 && best.castId) {
    const answer = await foundry.applications.api.DialogV2.wait({
      window: { title: `${best.label} — discharge?` },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p>End <strong>${best.label}</strong> now to make this `
        + `roll's +${best.value} into <strong>+${best.value * best.discharge}</strong>? (0 AP)</p></div>`,
      buttons: [
        { action: "keep", label: `Keep it (+${best.value})`, default: true },
        { action: "discharge", label: `Discharge (+${best.value * best.discharge})` }
      ],
      rejectClose: false
    });
    discharge = answer === "discharge";
  }
  const bonus = versusDamageBonus(reaching, { discharge });
  if (discharge) {
    const { removeEffectsByCastId } = await import("../combat/effect-application-workflow.mjs");
    await removeEffectsByCastId(attacker, best.castId, { dismissed: true });
    const { endActiveSpell, getActiveSpells } = await import("./active-spells.mjs");
    if (getActiveSpells(attacker).some((e) => e.id === best.castId)) {
      await endActiveSpell(attacker, best.castId, { dismissed: true });
    }
  }
  return { value: bonus.value, line: versusDamageLine(bonus.record, bonus.value, discharge, targetActor.name) };
}
