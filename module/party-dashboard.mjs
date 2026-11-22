/**
 * THE PARTY OVERVIEW'S RULES (Party Sheet V2, Stage 2; 3.709.0).
 *
 * What the dashboard decides for itself, and nothing more: which token is
 * "this member's", where a member stands in the current combat, the
 * party summary line, and what a resource stepper writes. Every figure it
 * prints is a member's own prepared value (party.mjs `memberSummary`), and
 * every action it takes goes through an existing system entry point:
 *
 *   initiative   TRGCombat#rollInitiative (Zealous Battlecry, Reactive
 *                Stance, module hooks and ownership all included)
 *   damage       dying-workflow's applyDamage dialog
 *   conditions   the actor's own toggleStatusEffect (immunity, value
 *                prompts, the GM relay)
 *   resources    the same field update the character sheet makes, which
 *                the actor's preparation then clamps (Graham, 22 Nov 2026)
 *   APL          rewards.mjs averagePartyLevel
 *   slowest      travel.mjs partyTravelSpeed over landSpeed (speedValue)
 *   coin         items.mjs coinValueInGP
 *
 * The pure half is first, so the harness can exhaust it. The Foundry half
 * (finding tokens on the canvas, panning, rolling) is at the bottom.
 */

import { averagePartyLevel } from "./rewards.mjs";
import { partyTravelSpeed } from "./travel.mjs";

const str = (value) => String(value ?? "").trim();

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

/**
 * The tokens on a scene that ARE this member, in a fixed order.
 *
 * - A world actor (a linked PC, a linked NPC) is represented by its
 *   LINKED tokens only. An unlinked token made from the same actor is a
 *   separate creature with its own hit points; selecting it would act on
 *   the wrong actor, so it is counted (`unlinkedCopies`) and never chosen.
 * - A member that is itself a token's actor (an unlinked token put on the
 *   roster) is represented by that one token.
 *
 * Ordered by token id, so "the first" and "the next" are the same answer
 * every time, whatever order the canvas happens to hold them in.
 *
 * @param {{uuid: string, id?: string, isToken?: boolean}} member
 * @param {Array<{id: string, actorId?: string, actorLink?: boolean, actorUuid?: string}>} tokens
 */
export function memberTokens(member, tokens = []) {
  const list = Array.isArray(tokens) ? tokens : [];
  let mine;
  let unlinkedCopies = 0;
  if (member?.isToken) {
    mine = list.filter((t) => str(t.actorUuid) === str(member.uuid));
  } else {
    mine = list.filter((t) => t.actorLink && str(t.actorId) === str(member?.id));
    unlinkedCopies = list.filter((t) => !t.actorLink && str(t.actorId) === str(member?.id)).length;
  }
  mine = [...mine].sort((a, b) => str(a.id).localeCompare(str(b.id)));
  return { tokens: mine, unlinkedCopies };
}

/**
 * Which token Find (and then Select) should go to.
 *
 * The first, then on each further press the next, wrapping round, so a
 * member with two linked tokens on the scene can be stepped through. If
 * the remembered token has gone, start again from the first.
 */
export function nextToken(tokens = [], lastId = null) {
  if (!tokens.length) return null;
  const at = tokens.findIndex((t) => str(t.id) === str(lastId));
  return at < 0 ? tokens[0] : tokens[(at + 1) % tokens.length];
}

/* ------------------------------------------------------------------ */
/* Initiative                                                          */
/* ------------------------------------------------------------------ */

/**
 * Where a member stands in the active combat.
 *
 *   { state: "none" }          no combat is active
 *   { state: "absent" }        a combat is active, and this member is not in it
 *   { state: "ready", id }     exactly one of its combatants needs a roll,
 *                              and this user may roll it
 *   { state: "rolled", value } every one of its combatants has rolled
 *   { state: "several", count} more than one of its combatants needs a roll;
 *                              the Combat Tracker says which is which, the
 *                              dashboard does not guess
 *   { state: "notYours" }      it needs a roll this user may not make
 *
 * @param {{combatants: Array<{id: string, actorUuid: string, initiative: number|null, isOwner: boolean}>}|null} combat
 * @param {{uuid: string}} member
 */
export function initiativeState(combat, member) {
  if (!combat) return { state: "none" };
  const mine = (combat.combatants ?? []).filter((c) => str(c.actorUuid) === str(member?.uuid));
  if (!mine.length) return { state: "absent" };
  const unrolled = mine.filter((c) => c.initiative === null || c.initiative === undefined);
  if (!unrolled.length) return { state: "rolled", value: Math.max(...mine.map((c) => Number(c.initiative))) };
  if (unrolled.length > 1) return { state: "several", count: unrolled.length };
  if (!unrolled[0].isOwner) return { state: "notYours" };
  return { state: "ready", id: unrolled[0].id };
}

/**
 * Every combatant the party-wide Roll Initiative button may roll: the
 * members' unrolled combatants this user owns, each once. A member with
 * several unrolled combatants is left to the tracker, as on its own row.
 */
export function partyInitiativeIds(combat, members = []) {
  const ids = [];
  for (const member of members) {
    const state = initiativeState(combat, member);
    if (state.state === "ready" && !ids.includes(state.id)) ids.push(state.id);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* The summary line                                                    */
/* ------------------------------------------------------------------ */

/**
 * The party summary at the top of the Overview.
 *
 * Counted from the roster entries, so "members" means the ones that are
 * really there. APL is the existing Chapter 12 rule. The slowest land
 * Speed is the existing travel rule, over the members this viewer may
 * inspect: a gated NPC's Speed (or its name as the pace-setter) is not
 * shown to a player who cannot open its sheet.
 *
 * @param {object} options
 * @param {Array<{missing: boolean, status: string, restricted?: boolean, name: string, level?: number, stats?: {speed: number|null}}>} options.rows member summaries
 * @param {number} options.coinGP the party's coin, in gp
 */
export function partySummary({ rows = [], coinGP = 0 }) {
  const active = rows.filter((r) => !r.missing);
  const visible = active.filter((r) => !r.restricted);
  const apl = averagePartyLevel(visible.map((r) => r.level));
  const pace = partyTravelSpeed(visible.map((r) => ({ name: r.name, speed: r.stats?.speed ?? 0 })));
  return {
    members: active.length,
    npcs: active.filter((r) => r.isNPC).length,
    missing: rows.filter((r) => r.missing && r.status !== "ineligible").length,
    ineligible: rows.filter((r) => r.status === "ineligible").length,
    hidden: active.length - visible.length,
    apl,
    speed: pace.speed,
    pacedBy: pace.pacedBy,
    coinGP: Math.round((Number(coinGP) || 0) * 100) / 100
  };
}

/* ------------------------------------------------------------------ */
/* Resource steppers                                                   */
/* ------------------------------------------------------------------ */

/** The resources a GM may step from the dashboard. */
export const STEPPED_RESOURCES = Object.freeze(["hp", "pp", "ap", "reactions", "conviction"]);

/**
 * What one press of a resource stepper writes (Graham, 22 Nov 2026: the
 * same change editing the sheet's field makes).
 *
 * The value is written to `system.resources.<key>.value`, exactly as the
 * sheet's input does. HP may go below zero: that is how this system records
 * dying. PP, AP, Reactions and Conviction never go below zero, and no
 * resource is raised past its maximum (3.709.0, found live).
 *
 * @returns {{path: string, value: number}|null} null for an unknown
 *   resource, a missing pool, or a press that would change nothing
 */
export function stepResource({ key, value, max = null, delta }) {
  if (!STEPPED_RESOURCES.includes(str(key))) return null;
  const current = Number(value);
  const step = Math.trunc(Number(delta));
  if (!Number.isFinite(current) || !Number.isFinite(step) || step === 0) return null;
  let next = current + step;
  if (key !== "hp") next = Math.max(0, next);
  // NOT ABOVE THE MAXIMUM (3.709.0, found live). The actor's preparation
  // clamps what it SHOWS, but the stored value stayed above it: Conviction
  // stored as 2 with a maximum of 1 would surface as a free point the day
  // the maximum rose. A raise stops at the maximum; a value already above
  // it (temporary effects, an old typed value) is never pushed further.
  const top = Number(max);
  if (step > 0 && Number.isFinite(top) && max !== null) next = Math.min(next, Math.max(top, current));
  if (next === current) return null;
  return { path: `system.resources.${key}.value`, value: next };
}

/* ------------------------------------------------------------------ */
/* Foundry                                                             */
/* ------------------------------------------------------------------ */

/**
 * The current scene's tokens, as plain records for `memberTokens`.
 * A player only sees the tokens Foundry already shows them: a hidden
 * token is not offered to Find.
 */
export function sceneTokenRecords() {
  const placeables = globalThis.canvas?.tokens?.placeables ?? [];
  const isGM = globalThis.game?.user?.isGM === true;
  return placeables
    .filter((token) => isGM || (token.visible && !token.document?.hidden))
    .map((token) => ({
      id: token.id,
      actorId: token.document?.actorId ?? null,
      actorLink: token.document?.actorLink === true,
      actorUuid: token.actor?.uuid ?? null,
      isOwner: token.document?.isOwner === true,
      token
    }));
}

/** The active combat as plain records for `initiativeState`. */
export function combatRecord(combat = globalThis.game?.combat ?? null) {
  if (!combat) return null;
  return {
    id: combat.id,
    combat,
    combatants: Array.from(combat.combatants ?? []).map((c) => ({
      id: c.id,
      actorUuid: c.actor?.uuid ?? null,
      initiative: c.initiative ?? null,
      isOwner: c.isOwner === true
    }))
  };
}
