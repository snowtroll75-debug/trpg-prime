import { CHANGE_TYPE } from "../effect-change-types.mjs";
/**
 * Aim (Chapter 4): "You may spend up to 4 rounds aiming at your
 * target and each round grants you a +1-circumstance bonus to your
 * AB. Whilst aiming, you are flat-footed and if you take any other
 * action besides this one, you lose all accrued aiming bonus."
 *
 * Architecturally different from the Tier 3 stances already built:
 * those expire at a fixed point (the start of the actor's next turn).
 * Aim instead stacks across repeated uses and is cleared the moment
 * *any other action* happens — including a weapon Strike (the whole
 * point of aiming in the first place) or a spell. Cleared from all
 * three of this system's action entry points (resolveAction,
 * rollWeaponAttack, castSpell) rather than only one, since "any other
 * action" genuinely means any of them.
 */

const AIM_EFFECT_NAME = "Aim";
const AIM_MAX_STACKS = 4;
const AIM_STACKS_FLAG = "aimStacks";

/**
 * The next stack count after one more round of Aim, capped at the
 * rulebook's own maximum of 4.
 *
 * @param {number} currentStacks
 * @returns {number}
 */
export function nextAimStacks(currentStacks) {
  return Math.min(AIM_MAX_STACKS, Math.max(0, Math.floor(Number(currentStacks) || 0)) + 1);
}

/**
 * Accrues one more round of Aim: increments the stack, refreshes the
 * Active Effect to the new attack bonus, and applies Flat-Footed
 * (both persist only while Aim is active).
 *
 * @param {Actor} actor
 * @returns {Promise<number>} The new stack count.
 */
export async function accrueAim(actor) {
  const current = Number(actor.getFlag("trg-prime", AIM_STACKS_FLAG) ?? 0);
  const stacks = nextAimStacks(current);

  const existing = actor.effects.filter((effect) => effect.name === AIM_EFFECT_NAME);
  if (existing.length) {
    await actor.deleteEmbeddedDocuments(
      "ActiveEffect",
      existing.map((effect) => effect.id)
    );
  }

  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: AIM_EFFECT_NAME,
      img: "icons/skills/ranged/target-bullseye-arrow-blue.webp",
      changes: [
        {
          key: "system.combat.attack.circumstance",
          type: CHANGE_TYPE.CUSTOM,
          value: String(stacks)
        }
      ]
    }
  ]);

  // Fast Aim (Class, Chapter 5): "you are not Flat-Footed whilst aiming"
  // (its AP reduction rides the apCostReduction layer in the workflow).
  const fastAim = Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "fast aim"
  );
  if (!fastAim) await actor.toggleStatusEffect("flatFooted", { active: true });
  await actor.setFlag("trg-prime", AIM_STACKS_FLAG, stacks);

  return stacks;
}

/**
 * Clears Aim's bonus and Flat-Footed — called whenever the actor
 * takes any action other than Aim itself, per the rulebook directly.
 * Safe to call unconditionally; a no-op if Aim isn't currently active.
 *
 * @param {Actor} actor
 * @param {string} currentActionKey The key of the action actually
 *   being taken — Aim itself doesn't clear its own accrual.
 * @returns {Promise<void>}
 */
export async function clearAimIfOtherAction(actor, currentActionKey) {
  if (currentActionKey === "aim") return;

  const stacks = Number(actor.getFlag("trg-prime", AIM_STACKS_FLAG) ?? 0);
  if (!stacks) return;

  const existing = actor.effects.filter((effect) => effect.name === AIM_EFFECT_NAME);
  if (existing.length) {
    await actor.deleteEmbeddedDocuments(
      "ActiveEffect",
      existing.map((effect) => effect.id)
    );
  }

  await actor.toggleStatusEffect("flatFooted", { active: false });
  await actor.unsetFlag("trg-prime", AIM_STACKS_FLAG);
}
