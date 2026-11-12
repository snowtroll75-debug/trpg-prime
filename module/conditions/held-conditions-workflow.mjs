/**
 * CONDITIONS HELD BY A CURSE (3.686.0, H17) — the Foundry half of
 * conditions/held-conditions.mjs: when a holding effect that says `endWith`
 * goes (its hour ran out, Remove Curse counteracted it, the GM deleted it),
 * the conditions it added go with it.
 *
 * ONE CLIENT (the 3.685.2/3.685.3 lesson): `deleteActiveEffect` fires on
 * every connected client, so the lowering is done by `isActingClientFor` the
 * creature — the acting GM, or with no GM the lowest-id owner — and nobody
 * else.
 */

import { isActingClientFor } from "../acting-gm.mjs";
import { heldEndings, heldOf, normaliseHeld, HELD_FLAG } from "./held-conditions.mjs";

/**
 * Lower what an ended hold added. The effect is already gone from the actor.
 * @param {Actor} actor
 * @param {object} effect the deleted effect (its data)
 * @returns {Promise<Array<{key: string, from: number, to: number}>>}
 */
async function settleEndedHold(actor, effect) {
  const held = normaliseHeld(effect?.flags?.["trg-prime"]?.[HELD_FLAG]);
  if (!actor || !held?.endWith) return [];
  const others = Array.from(actor.effects ?? []).filter((e) => e?.id !== effect?.id).map((e) => heldOf(e)).filter(Boolean);
  const raw = (key) => Number(actor.conditions?.rawValues?.get?.(key) ?? actor.getConditionValue?.(key) ?? 0);
  const changes = heldEndings(held, raw, others);
  for (const c of changes) {
    if (c.to > 0) await actor.toggleStatusEffect?.(c.key, { value: c.to });
    else await actor.toggleStatusEffect?.(c.key, { active: false });
  }
  return changes;
}

/** Wire the hook. Called once, at init. */
export function registerHeldConditionHooks() {
  globalThis.Hooks?.on?.("deleteActiveEffect", (effect) => {
    const actor = effect?.parent;
    if (!actor || actor.documentName !== "Actor") return;
    if (!effect?.flags?.["trg-prime"]?.[HELD_FLAG]) return;
    if (!isActingClientFor(actor)) return;
    settleEndedHold(actor, effect).catch((err) => console.warn("TRG Prime | a held condition could not be lowered", err));
  });
}
