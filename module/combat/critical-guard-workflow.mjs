/**
 * A rune's answer to a critical hit, the Foundry half (3.673.0). The rules are
 * in rune-declarations.mjs: `runeCriticalGuard` (Inner Tempest's Guarded, C4)
 * and `runeCriticalAdvantage` (Harmony Edge, C5).
 *
 * BOTH ARE REACTIONS, ONCE A DAY, AND BOTH ARE ASKED OF THEIR OWN PLAYER.
 * Guarded belongs to the creature struck, whose player is rarely the one
 * rolling the blow, so the question goes to them (owner-query-workflow.mjs)
 * and the blow waits. On a yes their own client spends the reaction and marks
 * the rune's day on their own armour, before the blow carries on. Harmony
 * Edge belongs to the attacker, whose client is the one rolling.
 */
import { biasWithAdvantage, criticalGuardHeal, runeCriticalAdvantage, runeCriticalGuard, runeMarkersOf, runeUseUpdates } from "../rune-declarations.mjs";
import { askOwner, registerOwnerQueryStep } from "../owner-query-workflow.mjs";

const SYSTEM_ID = "trg-prime";
const GUARD_STEP = "criticalGuardSpend";

const worldNow = () => Number(game.time?.worldTime ?? 0);

/** Mark a rune's use on its item and spend the reaction: run on the owner's client. */
async function spendRuneReaction({ actorUuid = "", itemId = "", key = "", frequency = "daily", label = "" } = {}) {
  const actor = actorUuid ? await fromUuid(actorUuid) : null;
  const item = actor?.items?.get?.(itemId) ?? null;
  if (item) {
    const updates = runeUseUpdates(runeMarkersOf(item), key, frequency, worldNow());
    const data = {};
    for (const [flag, value] of Object.entries(updates)) data[`flags.${SYSTEM_ID}.${flag}`] = value;
    if (Object.keys(data).length) await item.update(data);
  }
  if (actor) {
    const { spendReaction } = await import("./action-points-workflow.mjs");
    await spendReaction(actor, label || "Rune");
  }
}

/** Registered at init: the owner's half of Guarded. */
export function registerCriticalGuardStep() {
  registerOwnerQueryStep(GUARD_STEP, spendRuneReaction);
}

/**
 * GUARDED (C4): asked when a critical hit lands on a creature wearing it,
 * before the damage is rolled. Resolves the guard (its label) when its player
 * takes it, or null.
 */
export async function offerCriticalGuard(target, attacker, weapon) {
  const guard = runeCriticalGuard(Array.from(target?.items ?? []), worldNow());
  if (!guard) return null;
  const { reactionRefusal } = await import("./action-points-workflow.mjs");
  if (reactionRefusal(target)) return null;
  const yes = await askOwner(target, {
    title: guard.runeLabel,
    content: `<p><strong>${attacker?.name ?? "An attacker"}</strong> scores a critical hit on <strong>${target.name}</strong>`
      + `${weapon?.name ? ` with ${weapon.name}` : ""}.</p><p>Use <strong>${guard.label}</strong> (a reaction, once per day)? `
      + `The critical's extra damage is not dealt, and ${target.name} heals half of it.</p>`,
    yes: `Use ${guard.runeLabel}`,
    no: "Not now",
    then: GUARD_STEP,
    data: { actorUuid: target.uuid, itemId: guard.item?.id ?? "", key: guard.key, frequency: guard.frequency, label: guard.runeLabel }
  });
  return yes ? guard : null;
}

/** Guarded's heal: half of what was negated, rounded up. */
export { criticalGuardHeal };

/**
 * HARMONY EDGE (C5): asked when its wielder scores a critical, before the
 * injury roll. Resolves the bias to roll at — the severity's own, raised by
 * an advantage (B9-3) — and the card line, or null when it is not used.
 */
export async function offerCriticalAdvantage(attacker, weapon, bias) {
  const edge = runeCriticalAdvantage(weapon, worldNow());
  // NOTHING TO GAIN, NOTHING ASKED (found in review): a deadly critical is
  // already rolled at advantage, so a yes would spend the day for nothing.
  if (!edge || !attacker || biasWithAdvantage(bias) === bias) return null;
  const { reactionRefusal } = await import("./action-points-workflow.mjs");
  if (reactionRefusal(attacker)) return null;
  const yes = await askOwner(attacker, {
    title: edge.label,
    content: `<p>A critical hit with <strong>${weapon.name}</strong>. Use <strong>${edge.label}</strong> (a reaction, once per day) `
      + `to roll the critical injury at advantage?</p>`,
    yes: "Roll at advantage",
    no: "Not now",
    then: GUARD_STEP,
    data: { actorUuid: attacker.uuid, itemId: weapon.id, key: edge.key, frequency: edge.frequency, label: edge.label }
  });
  if (!yes) return null;
  const next = biasWithAdvantage(bias);
  return {
    bias: next,
    line: `<strong>${edge.label}</strong> — the injury is rolled at ${next === "normal" ? "advantage, which cancels the minor critical's disadvantage" : "advantage"}.`
  };
}
