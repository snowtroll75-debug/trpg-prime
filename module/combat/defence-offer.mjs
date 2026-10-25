/**
 * defence-offer — a reaction to being attacked, offered before the roll.
 *
 * NEW at 3.666.1. Graham, 22 October 2026, after a session: "Nimble Dodge
 * still isn't giving any option for the player to use."
 *
 * THE GAP. 3.666.0 made Nimble Dodge spend its reaction and last one attack,
 * as Graham ruled ("a reaction to being attacked is declared when you are
 * targeted, and it lasts for that attack"). But the only way to declare it
 * was the Use button on the defender's own sheet, and the attack is rolled
 * on the ATTACKER's client: the player whose character was being swung at
 * was never asked, and by the time the card appeared the roll was made.
 *
 * THE FIX. Every attack against a creature now asks, before it rolls,
 * whether the defender takes any reaction it has registered here. The
 * question goes to whoever plays the defender (see `defenceAnswerer`), the
 * attack waits for the answer, and a yes runs the reaction's own Use on the
 * defender's own client, so its effect and its spent reaction are written by
 * somebody who owns them. The attack then reads the DB the reaction raised.
 *
 * WHAT IS OFFERED. Only what the defender could take right now: the feat is
 * owned, the attack is the kind it answers, a reaction is left in combat, no
 * condition forbids reactions, the reaction's own requirement holds (Nimble
 * Dodge: no ACP, not encumbered), and it is not already up. Nothing to offer
 * means nothing is asked: a prompt on every swing would be noise.
 *
 * Pure: the decisions live here, so the harness drives them without Foundry.
 */
import { oneAttackSpec, oneAttackUsedBy } from "./one-attack.mjs";

const norm = (v) => String(v ?? "").trim().toLowerCase();

/** The registered reactions, by normalised name. */
const REGISTRY = new Map();

/**
 * Register a reaction a defender may take when attacked.
 *
 * @param {string} name the feat's name (or a module's own key)
 * @param {object} spec
 * @param {string} [spec.label] what the button says (the name by default)
 * @param {string} spec.summary one line: what it does
 * @param {"attack"|"weapon"} [spec.against] which attacks it answers
 *   ("attack": any attack against DB; "weapon": a Strike only)
 * @param {Function} [spec.find] (actor) => the item that grants it, or null;
 *   a feat of this name by default
 * @param {Function} [spec.requires] (actor) => a reason it cannot be taken
 *   now, or null
 * @param {Function} [spec.use] (actor, item, attack) => Promise; the feat's
 *   own Use by default
 * @param {boolean} [spec.forAlly] offered not to the attacked creature but to
 *   its allies within `reachFeet` (5 by default), who then become the target
 *   (3.669.0; Inner Tempest's Guardian's Intercession: "an adjacent ally is
 *   targeted by a physical attack … You become the target of the triggering
 *   attack instead"). `attack.protectedUuid` names the ally.
 * @param {string} [moduleId]
 * @returns {boolean} whether it was registered
 */
export function registerDefenceOffer(name, spec = {}, moduleId = "trg-prime") {
  const key = norm(name);
  if (!key || !spec || typeof spec !== "object") return false;
  const against = norm(spec.against) === "weapon" ? "weapon" : "attack";
  REGISTRY.set(key, Object.freeze({
    key,
    name: String(name).trim(),
    label: String(spec.label ?? name).trim(),
    summary: String(spec.summary ?? "").trim(),
    against,
    find: typeof spec.find === "function" ? spec.find : null,
    requires: typeof spec.requires === "function" ? spec.requires : null,
    use: typeof spec.use === "function" ? spec.use : null,
    forAlly: spec.forAlly === true,
    reachFeet: Math.max(5, Math.trunc(Number(spec.reachFeet) || 5)),
    moduleId: String(moduleId ?? "trg-prime")
  }));
  return true;
}

/** Every registered reaction (a copy). */
export function registeredDefenceOffers() {
  return Array.from(REGISTRY.values());
}

/**
 * WHO MAY STEP IN (3.669.0): the creatures beside the attacked one, on its
 * side, that are neither it nor the attacker, within the reach the offer
 * names.
 *
 * @param {Array<{id, actorId, disposition, distance}>} tokens the scene's
 *   other tokens, with their distance to the attacked one
 * @param {{targetId, attackerId, disposition, reachFeet}} opts
 */
export function interceptorCandidates(tokens = [], { targetId = "", attackerId = "", disposition = 0, reachFeet = 5 } = {}) {
  return (tokens ?? []).filter((t) => t && t.id !== targetId && t.id !== attackerId && t.actorId
    && Number(t.disposition) === Number(disposition)
    && t.distance !== null && t.distance !== undefined && Number(t.distance) <= Number(reachFeet));
}

/**
 * Does this reaction answer this attack?
 *
 * The same vocabulary as one-attack.mjs, so what is offered is exactly what
 * the attack will then spend: a "weapon" reaction is not offered against a
 * spell it would never last through.
 *
 * @param {"attack"|"weapon"} against
 * @param {{kind: string}} event
 */
export function defenceAnswersAttack(against, event) {
  return oneAttackUsedBy(oneAttackSpec(against === "weapon" ? { against: "weapon" } : true), {
    kind: String(event?.kind ?? "")
  });
}

/**
 * What one defender is offered against one attack.
 *
 * @param {object} opts
 * @param {Array<{key, label, summary, against, has: boolean, requiresReason?: string|null, reactionReason?: string, alreadyUp?: boolean}>} opts.candidates
 *   `reactionReason`: why spending the reaction would be refused (3.669.2)
 * @param {{kind: string}} opts.event
 * @param {boolean} opts.inCombat
 * @param {number} opts.reactions reactions left
 * @param {string|null} opts.blockReason why no reaction can be taken at all
 * @returns {{offered: Array, held: Array}}
 */
export function defenceOffersFor({ candidates = [], event, inCombat = false, reactions = 0, blockReason = null } = {}) {
  const offered = [];
  const held = [];
  for (const c of candidates) {
    if (!c?.has || c.alreadyUp) continue;
    if (!defenceAnswersAttack(c.against, event)) continue;
    const reason = blockReason
      ? String(blockReason)
      : inCombat && !(Number(reactions) > 0)
      ? "no reaction left this round"
      // THE REACTION AS SPENDING IT WOULD SEE IT (3.669.2; found live): a
      // Fighter whose only reaction left is Battle Readiness's, which serves
      // an Attack or Martial reaction only, was still asked about Guardian's
      // Intercession and refused when it answered.
      : inCombat && c.reactionReason
      ? String(c.reactionReason)
      : c.requiresReason
      ? String(c.requiresReason)
      : null;
    const row = { key: c.key, label: c.label, summary: c.summary };
    if (reason) held.push({ ...row, reason });
    else offered.push(row);
  }
  return { offered, held };
}

/**
 * Who answers for this defender?
 *
 * An active player who owns it, the one whose character it is first; with
 * none connected, the acting GM. A GM plays every creature nobody connected
 * plays, and a reaction is the defender's choice, not the attacker's.
 *
 * @param {object} opts
 * @param {string} opts.actorId the defender's (base) actor id
 * @param {Array<{id, active, isGM, characterId, owner}>} opts.users
 * @param {string|null} opts.activeGMId
 * @returns {string|null} the user id, or null when nobody can answer
 */
export function defenceAnswerer({ actorId = "", users = [], activeGMId = null } = {}) {
  const players = users.filter((u) => u?.active && !u.isGM && u.owner);
  const own = players.find((u) => actorId && u.characterId === actorId);
  if (own) return own.id;
  if (players.length) return players[0].id;
  if (activeGMId) return activeGMId;
  const gm = users.find((u) => u?.active && u.isGM);
  return gm?.id ?? null;
}

/** The answer a defender's client sends: the keys it took, nothing else. */
export function defenceAnswerKeys(taken, offered) {
  const allowed = new Set(Array.from(offered ?? []).map((o) => norm(o?.key)));
  return Array.from(taken ?? []).map(norm).filter((k) => allowed.has(k));
}

/* ------------------------------------------------------------------ *
 * NIMBLE DODGE, the core's own (Core Rulebook, General Feats).
 *
 * "Reaction. Trigger: An enemy targets you with an attack. Requirements:
 * You are not encumbered or subject to an ACP. +2 dodge bonus to your DB
 * against the triggering attack." Its Use (feats-workflow.mjs) refuses the
 * same things and spends the reaction; this only decides whether to ask.
 * ------------------------------------------------------------------ */
registerDefenceOffer("Nimble Dodge", {
  summary: "+2 dodge to your DB against this attack (spends your reaction).",
  against: "attack",
  requires: (actor) => (Number(actor?.system?.combat?.acp?.total ?? 0) > 0
    || Boolean(actor?._trgEncumbered)
    || Boolean(actor?.hasCondition?.("encumbered"))
    ? "not while subject to an ACP or encumbered"
    : null)
});
