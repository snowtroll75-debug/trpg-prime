/**
 * The Foundry half of a creature's own reactions (3.650.0). See
 * creature-reactions.mjs.
 *
 *   offerMissedReactions     a Strike against the creature missed
 *   offerAdjacentReactions   a creature ended a move next to it
 *   offerCriticalReplacement a critical with a declared weapon: injury, or a
 *                            lesser effect
 *   registerCreatureReactionHooks   the buttons on those cards
 *
 * Offered on a card with a button, the way every reaction is (Graham's
 * ruling of 21 August 2026). Pressed, it spends the reaction; on the
 * creature's own turn it arms the move as a compound-action leg (free of AP,
 * within its limit, provoking nothing unless the ability says it does), and
 * off-turn the drag is already free and unprovoking.
 */
import { bindOnce } from "./dice/check-card-interactions.mjs";
import {
  criticalReplacementFor, reactionMoveLeg, reactionMovesOf, requiredEffectOn
} from "./creature-reactions.mjs";

const SYSTEM_ID = "trg-prime";
const FLAG = "reactionMove";
const line = (text) => `<p style="margin:2px 0">${text}</p>`;

function canReact(actor) {
  if (!game.combat?.started) return true;
  return Number(actor?.system?.resources?.reactions?.value ?? 0) >= 1;
}

async function offerCard(actor, item, spec, why) {
  const whisper = [...new Set([
    ...ChatMessage.getWhisperRecipients("GM").map((u) => u.id),
    ...game.users.filter((u) => !u.isGM && actor.testUserPermission?.(u, "OWNER")).map((u) => u.id)
  ])];
  const mode = spec.speedKey === "land" ? "" : ` (${spec.speedKey})`;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper,
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${spec.label}</h3></div></header>`
      + line(`${why} Reaction: move up to <strong>${spec.feet} feet</strong>${mode}${spec.provokes ? "" : ", provoking no reactions"}.`)
      + `<p style="margin:6px 0 2px"><button type="button" data-action="creatureReactionMove">${spec.label}</button></p></div>`,
    flags: { [SYSTEM_ID]: { [FLAG]: { actorUuid: actor.uuid, spec, used: false } } }
  });
}

/** The moving token as it will stand at `at`, for the measurement. */
function moverAt(token, at) {
  const grid = canvas?.grid?.size ?? 100;
  const w = Math.max(1, Number(token.document?.width) || 1);
  const h = Math.max(1, Number(token.document?.height) || w);
  return {
    id: token.id, name: token.name, actor: token.actor,
    document: { x: at.x, y: at.y, width: w, height: h },
    center: { x: at.x + (w * grid) / 2, y: at.y + (h * grid) / 2 }
  };
}

/** A Strike against `defender` missed. */
export async function offerMissedReactions(defender, attacker) {
  if (!defender || !canReact(defender)) return [];
  const offered = [];
  for (const { item, spec } of reactionMovesOf(defender.items, "missed")) {
    if (!requiredEffectOn(defender.effects, spec.requiresEffect)) continue;
    offered.push(await offerCard(defender, item, spec, `<strong>${attacker?.name ?? "A creature"} missed ${defender.name}.</strong>`));
  }
  return offered;
}

/**
 * A creature ended a move: every other creature now adjacent to it with an
 * "adjacent" reaction move, and a reaction to spend, is offered it.
 */
export async function offerAdjacentReactions(movedTokenDoc, destination = null) {
  const placed = movedTokenDoc?.object ?? null;
  if (!placed || !canvas?.tokens) return [];
  // MEASURED FROM WHERE THE MOVE ENDS (3.650.1, found live). While a move
  // animates, the placeable's document still reads the square it left —
  // a 35-foot Stride measured 35 feet from its own destination, and only a
  // one-square step (over before anyone looked) was ever offered.
  const at = destination && Number.isFinite(Number(destination.x)) && Number.isFinite(Number(destination.y))
    ? { x: Number(destination.x), y: Number(destination.y) }
    : { x: Number(movedTokenDoc.x), y: Number(movedTokenDoc.y) };
  const mover = moverAt(placed, at);
  const { distanceBetween } = await import("./combat/geometry.mjs");
  const offered = [];
  for (const other of canvas.tokens.placeables) {
    if (!other?.actor || other.id === mover.id) continue;
    const moves = reactionMovesOf(other.actor.items, "adjacent");
    if (!moves.length || !canReact(other.actor)) continue;
    const feet = distanceBetween(mover, other);
    if (feet === null || feet > 5) continue;
    for (const { item, spec } of moves) {
      offered.push(await offerCard(other.actor, item, spec, `<strong>${mover.name} ended its move adjacent to ${other.name}.</strong>`));
    }
  }
  return offered;
}

async function pressReactionMove(message) {
  const raw = message.getFlag(SYSTEM_ID, FLAG);
  if (!raw || raw.used) return null;
  const doc = await fromUuid(raw.actorUuid).catch(() => null);
  const actor = doc?.actor ?? doc;
  if (!actor) return null;
  if (!canReact(actor)) { ui.notifications?.warn(`${raw.spec.label}: ${actor.name} has no reaction left.`); return null; }
  if (game.combat?.started) {
    const { spendReaction } = await import("./combat/action-points-workflow.mjs");
    await spendReaction(actor, raw.spec.label);
  }
  await message.setFlag(SYSTEM_ID, FLAG, { ...raw, used: true });
  // ON ITS OWN TURN the move is armed as a compound leg: free of AP, held to
  // its limit, provoking nothing. ON ANYONE ELSE'S TURN — nearly always, for
  // a reaction — a drag is already uncharged and provokes nothing (the AoO
  // detection only watches the acting creature), and an armed leg would sit
  // unspent until the creature's own turn and swallow its first Stride. So
  // off-turn it is not armed; the card states the limit.
  if (game.combat?.started && game.combat.combatant?.actor?.id === actor.id) {
    const { armCompoundLeg } = await import("./combat/compound-action-workflow.mjs");
    await armCompoundLeg(actor, reactionMoveLeg(raw.spec), raw.spec.label);
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card">${line(`<strong>${raw.spec.label}:</strong> ${actor.name} moves up to ${raw.spec.feet} feet${raw.spec.speedKey === "land" ? "" : ` (${raw.spec.speedKey})`}${raw.spec.provokes ? "" : ", provoking no reactions"}. Reaction spent.`)}</div>`
  });
  ui.notifications?.info(`${raw.spec.label}: drag ${actor.name} up to ${raw.spec.feet} feet.`);
  return true;
}

/**
 * PRANKSTER'S CRUELTY (block 17 R8): "may choose to replace any critical injury
 * with one of the following effects: the target drops one held unattended
 * object, becomes Flat-Footed until the start of its next turn, or takes a -2
 * circumstance penalty to its next attack before the end of its next turn."
 *
 * @returns {Promise<boolean>} true when the injury was replaced
 */
export async function offerCriticalReplacement(attacker, weapon, target) {
  const spec = criticalReplacementFor(attacker?.items, weapon?.name);
  if (!spec || !target) return false;
  const labels = {
    dropObject: "Drops a held object",
    flatFooted: "Flat-Footed",
    nextAttackPenalty: `${spec.penalty} to its next attack`
  };
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `${spec.label} — ${target.name}` }, classes: [SYSTEM_ID],
    content: `<div class="trg-prime trg-check-dialog"><p>A critical hit with ${weapon.name}. Roll the critical injury, or replace it?</p></div>`,
    buttons: [{ action: "injury", label: "Roll the injury", default: true }, ...spec.options.map((o) => ({ action: o, label: labels[o] }))],
    rejectClose: false
  }).catch(() => null);
  if (!picked || picked === "injury") return false;
  let said = "";
  if (picked === "flatFooted") {
    const { applyConditionTags } = await import("./combat/effect-application-workflow.mjs");
    const round = game.combat?.started ? Number(game.combat.round ?? 0) + 1 : null;
    await applyConditionTags(target, [{ key: "flatFooted", label: "Flat-Footed" }], { expiresRound: round });
    said = `${target.name} is <strong>Flat-Footed</strong> until the start of its next turn.`;
  } else if (picked === "nextAttackPenalty") {
    const { addPendingModifier, pendingTurnsFor } = await import("./pending-modifiers.mjs");
    const own = game.combat?.combatant?.actor?.id === target.id;
    await addPendingModifier(target, { value: spec.penalty, type: "circumstance", label: spec.label,
      scope: "its next attack, before the end of its next turn", oneShot: true, auto: true, checkTypes: ["attack"], turns: pendingTurnsFor(own) });
    said = `${target.name} takes <strong>${spec.penalty} circumstance</strong> to its next attack before the end of its next turn.`;
  } else {
    said = `${target.name} <strong>drops one held, unattended object</strong> — the GM chooses which.`;
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${attacker.name}</span><h3>${spec.label}</h3></div></header>`
      + line(`The critical injury is replaced: ${said}`) + `</div>`
  });
  return true;
}

export function registerCreatureReactionHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const raw = message.getFlag?.(SYSTEM_ID, FLAG);
    if (!raw) return;
    const button = html.querySelector?.('[data-action="creatureReactionMove"]');
    if (!button) return;
    if (raw.used) { button.disabled = true; button.textContent = `✓ ${raw.spec?.label ?? "Used"}`; return; }
    bindOnce(button, "click", async (event) => {
      event.preventDefault(); button.disabled = true;
      try { await pressReactionMove(message); } catch (err) { button.disabled = false; throw err; }
    });
  });
}
