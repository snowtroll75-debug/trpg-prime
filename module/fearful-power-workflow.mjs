/**
 * FEARFUL POWER, READ FROM THE CANVAS (3.659.0; F&F 3.0 block 28 R9). See
 * fearful-power.mjs. Distances are measured as an aura's are — from the
 * Tenebrax's edge, to the other creature's near edge.
 */
import { fearfulPowerOf } from "./fearful-power.mjs";
import { auraReachFeet, withinAura } from "./creature-auras.mjs";
import { tokenCentreFeet, tokenWidthFeet } from "./creature-aura-workflow.mjs";

const tokenOf = (actor) => {
  const tokens = actor?.getActiveTokens?.() ?? [];
  return tokens.find((t) => t.controlled) ?? tokens[0] ?? null;
};
const near = (from, to, feet) => withinAura(tokenCentreFeet(from.document), tokenCentreFeet(to.document),
  auraReachFeet(feet, tokenWidthFeet(from.document)) + Math.max(0, tokenWidthFeet(to.document) - 5) / 2);

/** The Tenebrax-kind creatures whose Fearful Power reaches this actor (never itself). */
export function fearfulPowersReaching(actor) {
  const target = tokenOf(actor);
  if (!target || typeof canvas === "undefined") return [];
  const out = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (!token.actor || token.actor.id === actor.id) continue;
    const power = fearfulPowerOf(Array.from(token.actor.items ?? []));
    if (power && near(token, target, power.feet)) out.push(token.actor.name);
  }
  return out;
}

/** This creature's own Fearful Power bonus: the highest frightened value within its reach (0 if none). */
export function fearfulPowerBonus(actor) {
  const power = fearfulPowerOf(Array.from(actor?.items ?? []));
  const self = power ? tokenOf(actor) : null;
  if (!self || typeof canvas === "undefined") return 0;
  let best = 0;
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (!token.actor || token.actor.id === actor.id || !near(self, token, power.feet)) continue;
    const v = token.actor.hasCondition?.("frightened") ? Number(token.actor.getConditionValue?.("frightened") ?? 0) || 0 : 0;
    if (v > best) best = v;
  }
  return best;
}
