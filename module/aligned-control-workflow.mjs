/**
 * Aligned Control, at the table (Creature Codex, Appendix — Aligned).
 *
 * > "ALIGNED CONTROL — CONCENTRATE. Action 1 AP. Requirements The
 * >  controller satisfies all the above criteria. The creature attempts
 * >  to take control of an appropriate target … The target must make an
 * >  opposed level-based (the controllers' level) Will saving throw."
 *
 * THE SAVE IS THE TARGET'S, so it is posted for them rather than rolled
 * for them — the same stance every opposed save in this system takes,
 * and the reason this posts a card with the DC and the five outcomes
 * instead of resolving the control itself.
 *
 * THE THREE REQUIREMENTS ARE CHECKED FIRST and reported separately: a
 * shared aligned trait, the level gap, and the core rulebook's Control
 * Level cap. "The controller satisfies all the above criteria" is the
 * action's Requirements line, so failing any of them means the action is
 * not taken and the AP is not spent.
 */

import {
  ALIGNED_CONTROL_FEATS, HOSTILE_ACTION_BREAKS_CONTROL,
  alignedControlAccess, alignedControlEligibility, alignedControlOutcome,
  auraStrength, isMortal, isUndead, sharedAlignedTraits, sharesCreatureType
} from "./aligned.mjs";
import { levelDC } from "./dice/resolution.mjs";
import { spendActionCost } from "./combat/action-points-workflow.mjs";
import { CONTROL_RELEASE_DC } from "./magic/control-register.mjs";
import { controlledLevelsOf } from "./magic/control-register-workflow.mjs";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "trg-prime";
const CONTROLLED_BY_FLAG = "alignedControlledBy";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header">`
      + `<div class="check-heading"><span class="check-actor">${esc(actor?.name ?? "")}</span>`
      + `<h3>${esc(title)}</h3></div></header>${lines.join("")}</div>`
  });
}

/** The first targeted token's actor, or null. */
function targetActorOf() {
  const target = Array.from(game.user?.targets ?? [])[0] ?? null;
  return target?.actor ?? null;
}

/** Which route is being used, when a character has more than one. */
async function chooseRoute(routes) {
  if (routes.length === 1) return routes[0];
  const buttons = routes.map((route) => ({
    action: route.key,
    label: route.label,
    icon: "fa-solid fa-hand-sparkles"
  }));
  const chosen = await DialogV2.wait({
    window: { title: "Aligned Control", icon: "fa-solid fa-hand-sparkles" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog"><p class="hint">${
      routes.map((r) => `<strong>${esc(r.label)}</strong> — ${esc(r.reaches)}`).join("<br>")
    }</p></div>`,
    buttons: [...buttons, { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }],
    rejectClose: false
  });
  if (!chosen || chosen === "cancel") return null;
  return routes.find((route) => route.key === chosen) ?? null;
}

/**
 * Take the action.
 *
 * @param {Actor} actor the controller
 * @param {object} action the Aligned Control entry
 */
export async function resolveAlignedControl(actor, action) {
  const featNames = Array.from(actor?.items ?? [])
    .filter((item) => item.type === "feat")
    .map((item) => item.name);
  const access = alignedControlAccess(actor?.system, featNames);
  if (!access.available) {
    ui.notifications.warn(
      "Aligned Control: you carry no aligned trait, and neither Ebon Bind nor Grave Authority.");
    return null;
  }

  const targetActor = targetActorOf();
  if (!targetActor) {
    ui.notifications.warn("Aligned Control: target the creature you mean to control.");
    return null;
  }

  const route = await chooseRoute(access.routes);
  if (!route) return null;

  const controllerLevel = Number(actor.system?.identity?.level ?? 0);
  const targetLevel = Number(targetActor.system?.identity?.level ?? 0);
  // CREATURE TYPE, not "any shared trait". A creature's traits hold its
  // type and its alignment in one field, and comparing the whole list
  // makes an Eternal and an Undead the same type because both are Evil —
  // which halves the level gap the appendix asks for. See
  // `sharesCreatureType`.
  const sameCreatureType = sharesCreatureType(actor.system, targetActor.system);

  const eligibility = alignedControlEligibility({
    controllerLevel,
    targetLevel,
    shared: sharedAlignedTraits(actor.system, targetActor.system),
    sameCreatureType,
    ignoreAlignment: route.ignoreAlignment,
    // GRAVE AUTHORITY'S OWN LIMIT (3.363.0). See ALIGNED_CONTROL_FEATS:
    // the waiver above had been honoured since the feat landed and the
    // restriction beside it had never been checked.
    requiresUndead: Boolean(route.requiresUndead),
    targetIsUndead: isUndead(targetActor.system),
    controlLevelCap: Number(actor.system?.magic?.controlLevels ?? 0),
    // THE REAL TALLY (3.585.0). This passed 0 with a comment explaining
    // that "this system tracks no register of controlled creatures", so
    // every attempt was measured against an empty slate and a caster
    // could take creatures all day. There is a register now; see
    // magic/control-register.mjs.
    controlledAlready: controlledLevelsOf(actor)
  });

  // A CRITICAL'S IMMUNITY (3.632.0): "cannot be controlled by this creature
  // again until after their next daily preparation".
  if (targetActor.getFlag?.(SYSTEM_ID, "alignedControlImmune")?.[actor.uuid]) {
    await postCard(actor, "Aligned Control — not available", [
      line(`<strong>${esc(targetActor.name)}</strong> shrugged off ${esc(actor.name)}'s control with a Critical and cannot be controlled by them again until after its next daily preparation.`)
    ]);
    return null;
  }

  if (!eligibility.able) {
    // "Requirements The controller satisfies all the above criteria."
    // Not met means the action is not taken, so nothing is spent.
    await postCard(actor, "Aligned Control — not available", [
      line(`<strong>${esc(targetActor.name)}</strong> cannot be controlled by ${esc(actor.name)}:`),
      ...eligibility.problems.map((problem) => line(`— ${esc(problem)}`))
    ]);
    return null;
  }

  await spendActionCost(actor, action?.apCost ?? "1", action?.name ?? "Aligned Control",
    { traits: action?.traits ?? "" });

  const dc = levelDC(controllerLevel);
  // "The level of a mortal creature is five lower when determining aura
  // strength" — a fact about the TARGET, read as "not Eternal". See
  // `isMortal`.
  const aura = auraStrength(targetLevel, { mortal: isMortal(targetActor.system) });

  const lines = [
    line(`<strong>${esc(actor.name)}</strong> reaches for <strong>${esc(targetActor.name)}</strong> — ${esc(route.label)}.`),
    route.key === "trait"
      ? line(`Shared: <strong>${esc(eligibility.shared.join(", "))}</strong>.`)
      : line(`<em>${esc(ALIGNED_CONTROL_FEATS[route.key]?.reaches ?? route.reaches)}${
        route.ignoreAlignment ? ", with no alignment restriction" : ""}.</em>`),
    line(`Level ${controllerLevel} against ${targetLevel} — a gap of <strong>${eligibility.gap}</strong>, and ${eligibility.needed} is needed.`),
    line(`<strong>${esc(targetActor.name)} makes an opposed level-based Will save, DC ${dc}</strong> (the controller's Level DC).`),
    line(`<em>Their aura reads <strong>${esc(aura.label)}</strong>.</em>`)
  ];

  // ROLLED AND APPLIED (3.632.0; Fiends & Fables 3.0 block 2, ruling 15).
  lines.push(...await rollAlignedControlSave(actor, targetActor, { targetLevel, dc }));
  lines.push(line(`<em>${esc(HOSTILE_ACTION_BREAKS_CONTROL)}</em> <em>A strike or spell from ${esc(actor.name)} or an ally offers it the save.</em>`));
  lines.push(line("<em>Release is a 1 AP concentrate action, at any time.</em>"));

  // WHAT THIS WOULD COST IN CONTROL LEVELS (3.585.0). Said before the
  // button rather than after it, so a GM about to push a caster over
  // their cap knows they are doing it — the page permits it, and the
  // creature then pulls to break free every round.
  if (eligibility.overCap) {
    lines.push(line(
      `<strong>Control Levels: ${eligibility.wouldHold} of ${eligibility.cap}</strong> — `
      + `${eligibility.overBy} over. While over, the highest-level creature held rolls a `
      + `DC ${CONTROL_RELEASE_DC} Will save each round to break free.`));
  } else {
    lines.push(line(
      `<em>Control Levels: ${eligibility.wouldHold} of ${eligibility.cap} once taken.</em>`));
  }
  return postCard(actor, "Aligned Control", lines);
}


/**
 * The target's opposed level-based Will save against the controller's Level
 * DC, and its outcome applied (3.632.0, ruling 15): Controlled for 1 minute /
 * 1 hour / permanently, on its clock; recorded on the controller's register;
 * a Critical's immunity until the target's next daily preparation; a
 * Spawn's save one degree worse against its creator.
 *
 * Used by the action, by the re-save when the Controlled clock runs out, and
 * by the re-save a hostile action offers. Returns the card lines.
 */
async function rollAlignedControlSave(controller, target, { targetLevel = null, dc = null, reason = "" } = {}) {
  const level = Number(targetLevel ?? target?.system?.identity?.level ?? 0);
  const saveDC = Number(dc ?? levelDC(Number(controller?.system?.identity?.level ?? 0)));
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const check = await TRGCheck.roll(withCheckModifiers({
    actor: target, type: "save", save: "will", dc: saveDC,
    label: `${target.name} — Will Save`,
    subtitle: `Aligned Control — opposed, ${controller.name}'s Level DC ${saveDC}${reason ? ` (${reason})` : ""}`
  }));
  let degree = check?.outcome?.degree?.key ?? "failure";
  const out = [];
  // THE SPAWN'S CONTROL VULNERABILITY (ruling 8).
  const { spawnControlDegree } = await import("./codex-trait-rules.mjs");
  const fromCreator = String(target.getFlag?.(SYSTEM_ID, "spawnCreator")?.uuid ?? "") === String(controller.uuid);
  const shifted = spawnControlDegree(target.system, degree, { grantsControl: true, fromCreator });
  if (shifted !== degree) { out.push(line(`<em>${esc(target.name)} is ${esc(controller.name)}'s Spawn: ${degree} read as <strong>${shifted}</strong>.</em>`)); degree = shifted; }
  const outcome = alignedControlOutcome(degree);
  out.push(line(`<strong>${esc(target.name)}: Will ${esc(degree)}</strong> — ${esc(outcome.text)}`));

  if (outcome.immuneUntilPreparation) {
    const immune = { ...(target.getFlag?.(SYSTEM_ID, "alignedControlImmune") ?? {}), [controller.uuid]: true };
    await target.setFlag(SYSTEM_ID, "alignedControlImmune", immune);
  }
  if (!outcome.controlled) {
    if (target.getFlag?.(SYSTEM_ID, CONTROLLED_BY_FLAG)?.uuid === controller.uuid) await endAlignedControl(controller, target);
    return out;
  }
  const { applyConditionTags, formatAppliedTags } = await import("./combat/effect-application-workflow.mjs");
  const { relayConditionTags } = await import("./combat/target-relay-workflow.mjs");
  const { declaredConditionTag } = await import("./combat/declared-after-strikes.mjs");
  const clock = { combatRound: game.combat?.started ? Number(game.combat.round ?? 0) : null, worldTime: Number(game.time?.worldTime ?? 0) };
  const row = Number.isFinite(outcome.seconds) ? { key: "controlled", minutes: Math.round(outcome.seconds / 60) } : { key: "controlled" };
  const { conditionLabel } = await import("./conditions/condition-rules.mjs");
  // The label the card prints (3.632.2, found live: "Applied: undefined").
  const tags = [{ ...declaredConditionTag(row, clock), label: conditionLabel("controlled") }];
  // A fresh clock: the old Controlled comes off first, quietly.
  await target.setFlag(SYSTEM_ID, CONTROLLED_BY_FLAG, { uuid: controller.uuid, name: controller.name, degree, renewing: true });
  if (target.hasCondition?.("controlled")) await target.toggleStatusEffect("controlled", { active: false });
  const applied = await relayConditionTags(target, tags, {}, () => applyConditionTags(target, tags, {}));
  await target.setFlag(SYSTEM_ID, CONTROLLED_BY_FLAG, { uuid: controller.uuid, name: controller.name, degree, newSaveAtEnd: outcome.newSaveAtEnd === true, renewing: false });
  out.push(line(`Applied: ${formatAppliedTags(applied ?? [])} (${esc(outcome.duration)}).`));
  const { controlledOf, recordControlled } = await import("./magic/control-register-workflow.mjs");
  const held = controlledOf(controller).some((e) => e?.handle?.actorUuid === target.uuid || e?.name === target.name);
  if (!held) await recordControlled(controller, { target, token: target.token?.object ?? null, level, source: "aligned" });
  return out;
}

/** Control is over: the flag and the condition come off, and the register lets go. */
async function endAlignedControl(controller, target) {
  await target.unsetFlag(SYSTEM_ID, CONTROLLED_BY_FLAG);
  if (target.hasCondition?.("controlled")) await target.toggleStatusEffect("controlled", { active: false });
  if (controller) {
    const { controlledOf, releaseControlled } = await import("./magic/control-register-workflow.mjs");
    const entry = controlledOf(controller).find((e) => e?.handle?.actorUuid === target.uuid || e?.name === target.name);
    if (entry) await releaseControlled(controller, entry.id);
  }
}

/** A card offering the target its new save (clock out, or a hostile act). */
async function offerAlignedResave(target, reason) {
  const by = target.getFlag?.(SYSTEM_ID, CONTROLLED_BY_FLAG);
  if (!by?.uuid) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${esc(target.name)}</span><h3>Aligned Control — a new save</h3></div></header>`
      + line(`${esc(reason)} — ${esc(target.name)} may make a new Will save against ${esc(by.name)}'s control.`)
      + `<p><button type="button" data-trg-aligned-resave="${target.uuid}">Roll the new save</button></p></div>`
  });
}

/**
 * The re-saves (3.632.0, ruling 15): when the Controlled clock runs out, and
 * when the controller or an ally strikes or casts at the controlled creature.
 * The GM judges whether a spell was hostile; the button is the offer.
 */
export function registerAlignedControlHooks() {
  Hooks.on("deleteActiveEffect", (effect) => {
    const target = effect?.parent;
    if (!target || target.documentName !== "Actor") return;
    if (!/controlled/i.test(String(effect.name ?? "")) && !effect.statuses?.has?.("controlled")) return;
    const by = target.getFlag?.(SYSTEM_ID, CONTROLLED_BY_FLAG);
    if (!by || by.renewing || !by.newSaveAtEnd) return;
    if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;
    offerAlignedResave(target, "The Controlled condition has run its course").catch((e) => console.error(`${SYSTEM_ID} | Aligned Control`, e));
  });
  const hostile = async (attacker, targets) => {
    for (const target of targets ?? []) {
      const by = target?.getFlag?.(SYSTEM_ID, CONTROLLED_BY_FLAG);
      if (!by?.uuid || !attacker) continue;
      const controller = await fromUuid(by.uuid);
      const controllerToken = controller?.getActiveTokens?.()?.[0]?.document ?? null;
      const attackerToken = attacker.getActiveTokens?.()?.[0]?.document ?? null;
      const ally = attacker.uuid === by.uuid || (controllerToken && attackerToken && controllerToken.disposition === attackerToken.disposition);
      if (ally) await offerAlignedResave(target, `${attacker.name} acts against it`);
    }
  };
  Hooks.on("trgPrimeStrikeRolled", ({ attacker, target }) => { hostile(attacker, [target]).catch((e) => console.error(`${SYSTEM_ID} | Aligned Control`, e)); });
  Hooks.on("trgPrimeSpellCast", ({ actor, targets }) => { hostile(actor, targets).catch((e) => console.error(`${SYSTEM_ID} | Aligned Control`, e)); });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const button of html.querySelectorAll?.("[data-trg-aligned-resave]") ?? []) {
      if (button.dataset.bound) continue;
      button.dataset.bound = "1";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        const target = await fromUuid(button.dataset.trgAlignedResave);
        const by = target?.getFlag?.(SYSTEM_ID, CONTROLLED_BY_FLAG);
        const controller = by?.uuid ? await fromUuid(by.uuid) : null;
        if (!target || !controller) return;
        const lines = await rollAlignedControlSave(controller, target, { reason: "a new save" });
        await postCard(target, "Aligned Control — new save", lines);
      });
    }
  });
}
