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

  // AN AURA SWITCHED ON FOR A WHILE (3.658.0; F&F 3.0 block 25 R6 — Soul
  // Eclipse): the effect that keeps its aura live, and the card.
  const { auraSwitchOf } = await import("./aura-switch.mjs");
  if (auraSwitchOf(item)) return useAuraSwitch(actor, item, lines);

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
    // A TYPE CHOSEN ON USE (3.634.0, F&F 3.0 block 4 R7): Radiant Eyes.
    const { areaDamageChoices, withChosenDamageType } = await import("./creature-area.mjs");
    const choices = areaDamageChoices(use.spec);
    if (choices.length) {
      const picked = await foundry.applications.api.DialogV2.wait({
        window: { title: `${item.name} — damage type` }, classes: [SYSTEM_ID],
        content: `<div class="trg-prime trg-check-dialog"><p>${item.name}: which energy?</p></div>`,
        buttons: choices.map((c, i) => ({ action: c, label: c.charAt(0).toUpperCase() + c.slice(1), default: i === 0 })),
        rejectClose: false
      });
      if (!picked) return false;
      use.spec = withChosenDamageType(use.spec, picked);
    }
    // AN AREA ABILITY WITH A USE COUNT SPENDS ONE (3.635.0, F&F 3.0 block 5
    // R7): the Ankheg's Acidic Spittle is Focus — one use until it Refocuses.
    // Refused before an AP is spent when none remain.
    const { itemUsesMax, itemUsesRemaining } = await import("./uses-workflow.mjs");
    const usesMax = itemUsesMax(item);
    const counted = Number.isFinite(usesMax) && usesMax !== null;
    const usesLeft = counted ? itemUsesRemaining(item) : null;
    if (counted && usesLeft <= 0) { ui.notifications?.warn(`${item.name}: no uses remain — Refocus or rest to restore it.`); return false; }
    const activation = item.flags?.[SYSTEM_ID]?.creatureAbility?.activation ?? {};
    // A PP COST (3.650.0; block 17 R4): "Using the breath weapon costs the
    // gorgon 10 PP." Refused before anything is spent when the pool is short.
    const ppCost = Math.max(0, Math.trunc(Number(use.spec?.ppCost ?? activation.pp ?? 0) || 0));
    const ppHeld = Number(actor.system?.resources?.pp?.value ?? 0);
    if (ppCost > 0 && ppHeld < ppCost) { ui.notifications?.warn(`${item.name}: it costs ${ppCost} PP, and ${actor.name} has ${ppHeld}.`); return false; }
    const apCost = Number(activation.ap ?? activation.actionPoints ?? use.ap) || 0;
    if ((activation.kind === "action" || (!activation.kind && use.ap)) && apCost > 0) {
      const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
      if (!(await ensureActionPoints(actor, apCost, item.name))) return false;
      await spendActionPoints(actor, apCost, item.name);
    }
    if (ppCost > 0) await actor.update({ "system.resources.pp.value": ppHeld - ppCost });
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
    if (counted) {
      await item.update({ "system.usesValue": usesLeft - 1 });
      rolled.push(`<p style="margin:2px 0"><em>${usesLeft - 1} of ${usesMax} use(s) left${/\bfocus\b/i.test(String(item.system?.traits ?? "")) ? " — Refocus restores it" : ""}.</em></p>`);
    }
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

/** Switch an ability's aura on (3.658.0): the effect, the cost, the card. */
async function useAuraSwitch(actor, item, lines) {
  const { auraSwitchOf, auraSwitchRecord, auraSwitchSpan, AURA_SWITCH_FLAG } = await import("./aura-switch.mjs");
  const sw = auraSwitchOf(item);
  const now = Number(game.time?.worldTime ?? 0);
  const activation = item.flags?.[SYSTEM_ID]?.creatureAbility?.activation ?? {};
  const apCost = Number(activation.ap ?? 0) || 0;
  if (activation.kind === "action" && apCost > 0) {
    const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
    if (!(await ensureActionPoints(actor, apCost, item.name))) return false;
    await spendActionPoints(actor, apCost, item.name);
  }
  // A fresh use replaces the one running: one effect, its clock restarted.
  const old = Array.from(actor.effects ?? []).filter((e) => e.getFlag?.(SYSTEM_ID, AURA_SWITCH_FLAG)?.state === sw.state).map((e) => e.id);
  if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old);
  const record = auraSwitchRecord(sw, now);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: item.name, img: item.img || "icons/svg/aura.svg",
    duration: { seconds: sw.seconds, startTime: now },
    flags: { [SYSTEM_ID]: { [AURA_SWITCH_FLAG]: record, spellEffect: true, spellEffectEnd: record.until } }
  }]);
  const { auraEmitters } = await import("./creature-aura-workflow.mjs");
  const emitted = auraEmitters().find((e) => e.token?.actor?.id === actor.id)?.auras?.find((a) => a.emitterState === sw.state);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header">`
      + `<div class="check-heading"><span class="check-actor">${actor?.name ?? ""}</span>`
      + `<h3>${item?.name ?? "Ability"}</h3></div></header>`
      + lines.filter((l) => !l.degree).map((l) => line(l.label, l.text, l.degree)).join("")
      + `<p><strong>${item.name} is on for ${auraSwitchSpan(sw.seconds)}.</strong>${emitted ? ` Each creature within ${emitted.radius} feet saves at the start of its turn.` : ""}</p>`
      // A DARKNESS AURA (3.658.1; found live): the light is the GM's to set.
      + (emitted?.traits?.includes("darkness") ? `<p><em>Its darkness is magical: set the scene's light.</em></p>` : "")
      + `</div>`
  });
  return true;
}
