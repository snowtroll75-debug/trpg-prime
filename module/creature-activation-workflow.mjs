/**
 * The Use button for a Creature Codex ability.
 *
 * Posts the ability's own cost, trigger, requirement, area and outcome
 * ladder as a card, with a level-scaled PP cost already worked out — and
 * applies nothing. See creature-activation.mjs for why that is the
 * design rather than a shortfall.
 */
import { activationLines, hasCreatureActivation } from "./creature-activation.mjs";

const SYSTEM_ID = "trg-prime";
const line = (label, text, degree) => degree
  ? `<p><strong>${label}</strong> ${text}</p>`
  : `<p><strong>${label}:</strong> ${text}</p>`;

// Re-exported so useFeat and the sheet ask the SAME question. It was
// defined here as well for a while, which is one definition too many for
// a rule that must agree with itself.
export { hasCreatureActivation };

export async function useCreatureAbility(actor, item) {
  // A PERIL'S ROUTINE ACTION (3.629.0): rolled and applied, not a card for
  // the GM to resolve — Graham's design for Pillars of Faith's haunts.
  const { usePerilRoutine } = await import("./peril-workflow.mjs");
  const routine = await usePerilRoutine(actor, item);
  if (routine !== null) return routine;
  // A CODEX ACTION OF ITS OWN (3.631.0): Constrict, Rend, Swallow, … See
  // codex-actions-workflow.mjs. A compound action (a move and its strikes)
  // the same way. Both before the generic card.
  const { useCodexAction } = await import("./codex-actions-workflow.mjs");
  const own = await useCodexAction(actor, item);
  if (own !== null) return own;
  const { compoundOf } = await import("./combat/compound-action.mjs");
  if (compoundOf(item)) {
    const { useCompoundAction } = await import("./combat/compound-action-workflow.mjs");
    return useCompoundAction(actor, item);
  }
  const level = Number(actor?.system?.identity?.level ?? 0);
  const lines = activationLines(item, level);

  // A DECLARED AREA EFFECT (3.631.0): rolled and applied, the cost spent.
  // A module's breath weapon is one too (3.632.0, ruling 16) — read from the
  // breath's own shape or its printed sentence; see creature-area.mjs.
  const { declaredArea } = await import("./creature-area.mjs");
  const area = declaredArea(item);
  if (!area && !lines.length) return false;
  if (area && typeof area === "object") {
    const { declaredAreaUse } = await import("./creature-area.mjs");
    const use = declaredAreaUse(item, { worldTime: Number(game.time?.worldTime ?? 0) });
    if (use.refusal) { ui.notifications?.warn(`${item.name}: ${use.refusal}`); return false; }
    const activation = item.flags?.[SYSTEM_ID]?.creatureAbility?.activation ?? {};
    const apCost = Number(activation.ap ?? activation.actionPoints ?? use.ap) || 0;
    if ((activation.kind === "action" || (!activation.kind && use.ap)) && apCost > 0) {
      const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
      if (!(await ensureActionPoints(actor, apCost, item.name))) return false;
      await spendActionPoints(actor, apCost, item.name);
    }
    const { perilEffectSpec } = await import("./peril-effect.mjs");
    const { runDeclaredAreaEffect } = await import("./peril-workflow.mjs");
    const { resolveAreaDamageSource } = await import("./creature-area.mjs");
    const spec = perilEffectSpec(resolveAreaDamageSource(use.spec, Array.from(actor.items ?? []), {
      bab: Number(actor.system?.combat?.bab?.total ?? 0), strength: Number(actor.system?.attributes?.strength?.total ?? 0)
    }), "");
    // An area effect, for a Swarm's Weakness to area effects (3.632.0) — a
    // cone, line, burst or emanation; a swarm's own attack is its space.
    spec.isCreatureArea = spec.scope !== "sharedSpace";
    if (use.breath) {
      // A breath, for whoever it reaches (3.632.0): Scaly Resilience.
      spec.isBreath = true;
      const { breathRiders } = await import("./breath-memory.mjs");
      if (breathRiders(Array.from(actor.items ?? [])).some((r) => r.rider.kind === "penetrating")) {
        spec.drBypassed = true; spec.ignoreResistance = true;
      }
    }
    const results = [];
    const rolled = await runDeclaredAreaEffect(actor, spec, { title: item.name, results });
    const { recordBreath } = await import("./breath-memory-workflow.mjs");
    await recordBreath(actor, item, use, results);
    if (use.cooldownSeconds) await item.setFlag(SYSTEM_ID, "lastUsedAt", Number(game.time?.worldTime ?? 0));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header">`
        + `<div class="check-heading"><span class="check-actor">${actor?.name ?? ""}</span>`
        + `<h3>${item?.name ?? "Ability"}</h3></div></header>`
        + lines.filter((l) => !l.degree).map((l) => line(l.label, l.text, l.degree)).join("")
        + rolled.map((l) => l).join("")
        + `</div>`
    });
    return true;
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header">`
      + `<div class="check-heading"><span class="check-actor">${actor?.name ?? ""}</span>`
      + `<h3>${item?.name ?? "Ability"}</h3></div></header>`
      + lines.map((l) => line(l.label, l.text, l.degree)).join("")
      + `<p><em>Resolved by the GM — the cost is not spent automatically.</em></p>`
      + `</div>`
  });
  return true;
}
