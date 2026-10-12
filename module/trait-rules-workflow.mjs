/**
 * trait-rules-workflow — Appendix 3's clauses, wired to the table (3.622.0).
 *
 * The rules are in trait-rules.mjs, pure. This file reads tokens, scenes,
 * the combat and the caster's active spells, and writes the consequences:
 * the elemental casting environments, Teleportation's arrival, the Rod's
 * once a round, Composition's one at a time, and Polymorph against Polymorph
 * and Morph.
 */

import {
  compositionsToEnd, elementalCastingRefusal, rodRefusal, shapeChangeConflicts,
  stampIsThisRound, teleportArrival
} from "./trait-rules.mjs";
import { hasTrait } from "./traits.mjs";

const SYSTEM_ID = "trg-prime";
const TELEPORTED_FLAG = "teleportedTurn";
const ROD_FLAG = "rodUsedRound";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines, extra = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`,
    ...extra
  });
}

function tokenOf(actor) {
  return actor?.getActiveTokens?.()?.[0]?.document ?? actor?.token ?? null;
}

function runningCombat() {
  return game.combat?.started ? game.combat : null;
}

/* ------------------------------------------------------------------ */
/* Where the caster is                                                  */
/* ------------------------------------------------------------------ */

export async function actorUnderwater(actor) {
  const { tokenIsUnderwater } = await import("./combat/underwater-workflow.mjs");
  return tokenIsUnderwater(tokenOf(actor));
}

/** Mid-air: a token above the ground (elevation over 0). */
function actorAirborne(actor) {
  return Number(tokenOf(actor)?.elevation ?? 0) > 0;
}

/**
 * A vacuum: the scene's, or a region's the token stands in, Weather section
 * ticked "Vacuum" (environment-workflow.mjs).
 */
function actorInVacuum(actor) {
  const token = tokenOf(actor);
  if (Array.from(token?.regions ?? []).some((r) => r?.getFlag?.(SYSTEM_ID, "weather")?.vacuum === true)) return true;
  const scene = token?.parent ?? canvas?.scene ?? null;
  return scene?.getFlag?.(SYSTEM_ID, "weather")?.vacuum === true;
}

/**
 * FIRE, AIR, WATER, EARTH, SONIC (3.622.0; Graham's R11 of block 39).
 * Refused before anything is chosen or spent.
 *
 * @returns {Promise<boolean>} true when the cast may go ahead
 */
export async function elementalCastGate(actor, spellData, spellName) {
  const refused = elementalCastingRefusal(spellData?.traits ?? "", {
    underwater: await actorUnderwater(actor),
    airborne: actorAirborne(actor),
    vacuum: actorInVacuum(actor)
  });
  if (!refused) return true;
  ui.notifications.warn(`${spellName}: ${refused}.`);
  return false;
}

/* ------------------------------------------------------------------ */
/* Teleportation                                                        */
/* ------------------------------------------------------------------ */

/**
 * TELEPORTATION, on whoever it moves: "if you are the target of a
 * teleportation effect, you must make a Spatial Awareness check to
 * continuing acting for the rest of the turn. If you are subject to an
 * additional teleportation effect in a turn, it automatically fails."
 *
 * In combat — a turn is an encounter's word (R13). A second teleport in the
 * same turn is announced as failing; the first stamps the creature and posts
 * the check's button for its owner.
 */
export async function teleportationArrives(caster, spell, movedActors = []) {
  const combat = runningCombat();
  if (!combat || !hasTrait(spell?.system?.traits ?? "", "teleportation")) return [];
  const said = [];
  const moved = movedActors.length ? movedActors : [caster];
  for (const actor of moved) {
    if (!actor) continue;
    const arrival = teleportArrival(actor.getFlag?.(SYSTEM_ID, TELEPORTED_FLAG) ?? null, combat);
    if (arrival.fails) {
      said.push(`<strong>${spell.name} fails on ${actor.name}</strong> — a second teleportation in one turn `
        + "automatically fails. Leave the token where it is.");
      continue;
    }
    // STAMPED WHERE THIS CLIENT MAY WRITE. A player teleporting a creature
    // they do not own leaves the stamp to the GM's next teleport of it.
    const stamp = { combatId: combat.id, round: combat.round, turn: combat.turn };
    if (actor.isOwner) await actor.setFlag(SYSTEM_ID, TELEPORTED_FLAG, stamp);
    await postCard(actor, "Teleported — Spatial Awareness", [
      line(`${actor.name} has been teleported by ${spell.name}, and must make a Spatial Awareness `
        + "(Mental Focus) check to keep acting this turn — a failure costs AP, a fumble more."),
      `<button type="button" class="trg-spatial-awareness" data-actor-uuid="${actor.uuid}">`
        + `<i class="fa-solid fa-dice-d20"></i> Roll Spatial Awareness</button>`
    ]);
  }
  return said;
}

/* ------------------------------------------------------------------ */
/* Rod                                                                  */
/* ------------------------------------------------------------------ */

/** Why a Rod cannot be used now, or "". */
export function rodUseRefusal(actor, { fromItemCast = false } = {}) {
  return rodRefusal(actor?.getFlag?.(SYSTEM_ID, ROD_FLAG) ?? null, runningCombat(), { fromItemCast });
}

/** A Rod was used this round. */
export async function stampRodUse(actor, item) {
  const combat = runningCombat();
  if (!combat || !actor?.isOwner) return;
  await actor.setFlag(SYSTEM_ID, ROD_FLAG, { combatId: combat.id, round: combat.round, itemId: item?.id ?? null });
}

/** Whether a Rod was used this round — for the offers that should not appear. */
export function rodUsedThisRound(actor) {
  return stampIsThisRound(actor?.getFlag?.(SYSTEM_ID, ROD_FLAG) ?? null, runningCombat());
}

/* ------------------------------------------------------------------ */
/* Composition                                                          */
/* ------------------------------------------------------------------ */

/**
 * COMPOSITION: "If you cast a new composition spell, any ongoing effects
 * from your previous composition spell end immediately."
 *
 * @returns {Promise<string[]>} the names ended
 */
export async function endPreviousComposition(caster, spell, newCastId = "") {
  if (!hasTrait(spell?.system?.traits ?? "", "composition")) return [];
  const { endActiveSpell, getActiveSpells } = await import("./magic/active-spells.mjs");
  const spells = Array.from(caster?.items ?? []).filter((i) => i.type === "spell");
  const isComposition = (name) => spells.some((s) => s.name === name && hasTrait(s.system?.traits ?? "", "composition"));
  const active = getActiveSpells(caster);
  const ending = compositionsToEnd(active.filter((e) => e.name !== spell.name || e.id !== newCastId), isComposition, newCastId);
  const names = [];
  for (const id of ending) {
    const entry = active.find((e) => e.id === id);
    await endActiveSpell(caster, id, { dismissed: true });
    if (entry?.name) names.push(entry.name);
  }
  return names;
}

/* ------------------------------------------------------------------ */
/* Polymorph and Morph                                                  */
/* ------------------------------------------------------------------ */

/** The shape-changing spell effects on a creature, with their spells' traits. */
function shapeEffectsOn(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    const castId = effect.getFlag?.(SYSTEM_ID, "castId");
    if (!castId || effect.disabled) continue;
    let traits = effect.getFlag?.(SYSTEM_ID, "spellTraits") ?? "";
    if (!traits && effect.origin) {
      try {
        traits = globalThis.fromUuidSync?.(effect.origin)?.system?.traits ?? "";
      } catch {
        traits = "";
      }
    }
    if (hasTrait(traits, "polymorph") || hasTrait(traits, "morph")) out.push({ castId, traits, effect });
  }
  return out;
}

/**
 * POLYMORPH: "you can only benefit from one polymorph effect at any one time
 * and any subsequent affect attempts to counter the prior." MORPH: "a
 * polymorph effect which alters the entire body, immediately ends a morph
 * effect."
 *
 * The counter is the counteract rule (Chapter 8): the new casting's check
 * against the old spell's casting DC, ±2 per PP between them. A spell whose
 * DC was not recorded is countered outright — said on the card.
 *
 * @returns {Promise<{lines:string[], blocked:boolean}>} blocked when the
 *   prior polymorph held, so the new one does not take
 */
export async function shapeChangeArrives(caster, spell, target, { castTotal = null, castPP = 0, castId = "" } = {}) {
  const out = { lines: [], blocked: false };
  const prior = shapeEffectsOn(target).filter((p) => p.castId !== castId);
  const { counter, end } = shapeChangeConflicts(spell?.system?.traits ?? "", prior);
  if (!counter.length && !end.length) return out;
  const { counteractModifier } = await import("./counteract.mjs");
  for (const id of counter) {
    const entry = await findActiveEntry(id);
    const dc = Number(entry?.entry?.castingDC ?? 0) || null;
    const oldPP = Number(entry?.entry?.pp ?? 0) || 0;
    const total = Number(castTotal);
    if (dc && Number.isFinite(total)) {
      const mod = counteractModifier(castPP, oldPP);
      if (total + mod < dc) {
        out.blocked = true;
        out.lines.push(`<strong>${spell.name} fails to counter ${entry?.entry?.name ?? "the polymorph"}</strong> on ${target.name} `
          + `(${total}${mod ? ` ${mod > 0 ? "+" : ""}${mod}` : ""} vs DC ${dc}) — only one polymorph at a time, and the first holds.`);
        continue;
      }
      out.lines.push(`${spell.name} counters ${entry?.entry?.name ?? "the earlier polymorph"} on ${target.name} `
        + `(${total}${mod ? ` ${mod > 0 ? "+" : ""}${mod}` : ""} vs DC ${dc}).`);
    } else {
      out.lines.push(`${spell.name} replaces the earlier polymorph on ${target.name} (its casting DC was not recorded).`);
    }
    await endShapeCast(target, id, entry);
  }
  for (const id of end) {
    const entry = await findActiveEntry(id);
    out.lines.push(`${spell.name} alters the whole body: ${entry?.entry?.name ?? "a morph"} on ${target.name} ends.`);
    await endShapeCast(target, id, entry);
  }
  return out;
}

/** The active-spell entry for a cast id, and its caster, on any actor. */
async function findActiveEntry(castId) {
  const { getActiveSpells } = await import("./magic/active-spells.mjs");
  const actors = [...(game.actors ?? []), ...(canvas?.tokens?.placeables ?? []).map((t) => t.actor).filter(Boolean)];
  for (const actor of actors) {
    const entry = getActiveSpells(actor).find((e) => e?.id === castId);
    if (entry) return { actor, entry };
  }
  return null;
}

async function endShapeCast(target, castId, found) {
  if (found?.actor?.isOwner) {
    const { endActiveSpell } = await import("./magic/active-spells.mjs");
    await endActiveSpell(found.actor, castId, { dismissed: false });
  }
  const left = Array.from(target?.effects ?? []).filter((e) => e.getFlag?.(SYSTEM_ID, "castId") === castId);
  if (left.length && target.isOwner) await target.deleteEmbeddedDocuments("ActiveEffect", left.map((e) => e.id));
}

/* ------------------------------------------------------------------ */
/* The Spatial Awareness button                                         */
/* ------------------------------------------------------------------ */

export function registerTraitRuleHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const button = html?.querySelector?.(".trg-spatial-awareness");
    if (!button) return;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const actor = await fromUuid(button.dataset.actorUuid);
      if (!actor?.isOwner) return ui.notifications.warn("Only the teleported creature's owner can roll this.");
      const { SKILL_ACTIONS } = await import("./data/skill-actions.mjs");
      const action = SKILL_ACTIONS.find((a) => a.key === "spatialAwareness");
      const { resolveAction } = await import("./combat/action-workflow.mjs");
      if (action) await resolveAction(actor, action, { event: { shiftKey: true } });
    });
  });
}
