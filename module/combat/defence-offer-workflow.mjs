/**
 * The Foundry side of defence-offer.mjs: asking the defender's player before
 * an attack rolls, waiting for the answer, and running the reaction on the
 * client that owns the defender.
 *
 * THE SOCKET PATTERN IS gm-authorisation.mjs's: an ask carrying a request id,
 * a Map of waiting promises, an answer addressed back to the asker, and a
 * timeout so a player who walked away cannot hold the table's attack
 * hostage. A timeout is a "no", said on the attacker's screen.
 *
 * ORDERING. The reaction's effect is created on the defender's client and
 * the answer is sent after that write resolves. Foundry's server relays both
 * to the attacker's client over the same socket, in order, so the attack
 * that resumes reads the raised DB.
 */
import { actorReactionBlock } from "./reactions.mjs";
import { reactionRefusal } from "./action-points-workflow.mjs";
import {
  defenceAnswerKeys,
  defenceAnswerer,
  defenceOffersFor,
  interceptorCandidates,
  registeredDefenceOffers
} from "./defence-offer.mjs";

const SYSTEM_ID = "trg-prime";
const SOCKET = `system.${SYSTEM_ID}`;
const ASK = "defence.offer";
const ANSWER = "defence.answer";
/** How long an attack waits for a defender's player. */
const WAIT_MS = 30000;
const waiting = new Map();

const norm = (v) => String(v ?? "").trim().toLowerCase();
const esc = (text) => String(text ?? "").replace(
  /[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

/** The item that grants this reaction on this actor, or null. */
function grantingItem(actor, spec) {
  if (spec.find) {
    try { return spec.find(actor) ?? null; } catch (error) { console.error("TRG Prime | defence offer find", error); return null; }
  }
  return Array.from(actor?.items ?? []).find((i) => i.type === "feat" && norm(i.name) === spec.key) ?? null;
}

/** Is a one-attack effect from this reaction already on the defender? */
function alreadyUp(actor, spec) {
  return Array.from(actor?.effects ?? []).some((e) => !e.disabled
    && norm(e.name).startsWith(spec.key)
    && Boolean(e.flags?.[SYSTEM_ID]?.oneAttack));
}

/** What this defender could take against this attack, read off the world. */
function defenceOffersAgainst(defender, event, { forAlly = false } = {}) {
  const specs = registeredDefenceOffers().filter((s) => Boolean(s.forAlly) === Boolean(forAlly));
  const candidates = specs.map((spec) => {
    const item = grantingItem(defender, spec);
    let requiresReason = null;
    if (item && spec.requires) {
      try { requiresReason = spec.requires(defender, item) ?? null; } catch (error) {
        console.error("TRG Prime | defence offer requirement", error);
        requiresReason = "its requirement could not be read";
      }
    }
    // Read with the reaction's own traits (3.669.2): Battle Readiness's extra
    // reaction takes an Attack or Martial one only.
    const reactionReason = item ? reactionRefusal(defender, String(item.system?.traits ?? "")) : "";
    return {
      key: spec.key, label: spec.label, summary: spec.summary, against: spec.against,
      has: Boolean(item), requiresReason, reactionReason, alreadyUp: Boolean(item) && alreadyUp(defender, spec)
    };
  });
  return defenceOffersFor({
    candidates,
    event,
    inCombat: Boolean(game.combat?.started && defender?.inCombat),
    reactions: Number(defender?.system?.resources?.reactions?.value ?? 0),
    blockReason: actorReactionBlock(defender)
  });
}

/** The user who answers for this defender. */
function answererFor(defender) {
  const users = Array.from(game.users ?? []).map((u) => ({
    id: u.id,
    active: Boolean(u.active),
    isGM: Boolean(u.isGM),
    characterId: u.character?.id ?? null,
    owner: Boolean(defender?.testUserPermission?.(u, "OWNER"))
  }));
  return defenceAnswerer({ actorId: defender?.id ?? "", users, activeGMId: game.users?.activeGM?.id ?? null });
}

/** Ask on THIS screen, and close the question when the wait runs out. */
async function askHere({ defenderName, attackerName, what, offered, protectedName = "" }) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2 || !offered.length) return [];
  const content = protectedName
    ? `<p><strong>${esc(attackerName)}</strong> is attacking <strong>${esc(protectedName)}</strong>, beside <strong>${esc(defenderName)}</strong>`
      + `${what ? `, with ${esc(what)}` : ""}.</p><p>Step in and take the attack yourself?</p>`
      + offered.map((o) => `<p style="margin:2px 0"><strong>${esc(o.label)}</strong> — ${esc(o.summary)}</p>`).join("")
    : `<p><strong>${esc(attackerName)}</strong> is attacking <strong>${esc(defenderName)}</strong>`
    + `${what ? ` with ${esc(what)}` : ""}.</p><p>Take a reaction before the attack is rolled?</p>`
    + offered.map((o) => `<p style="margin:2px 0"><strong>${esc(o.label)}</strong> — ${esc(o.summary)}</p>`).join("");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (keys) => { if (!settled) { settled = true; resolve(keys); } };
    const dialog = new DialogV2({
      window: { title: `Reaction — ${defenderName}` },
      content,
      buttons: [
        ...offered.map((o, i) => ({ action: o.key, label: o.label, default: i === 0 })),
        { action: "none", label: "No reaction" }
      ],
      submit: async (result) => finish(result && result !== "none" ? [result] : [])
    });
    dialog.addEventListener?.("close", () => finish([]), { once: true });
    dialog.render({ force: true });
    setTimeout(() => {
      if (settled) return;
      finish([]);
      dialog.close?.().catch?.(() => {});
    }, WAIT_MS - 2000);
  });
}

/** Run the reactions this client was told to take. */
async function takeHere(defender, keys, attack) {
  const specs = new Map(registeredDefenceOffers().map((s) => [s.key, s]));
  const taken = [];
  for (const key of keys) {
    const spec = specs.get(norm(key));
    const item = spec ? grantingItem(defender, spec) : null;
    if (!spec || !item) continue;
    try {
      if (spec.use) await spec.use(defender, item, attack);
      else {
        const { useFeat } = await import("../feats-workflow.mjs");
        await useFeat(defender, item);
      }
      taken.push(spec.key);
    } catch (error) {
      console.error(`TRG Prime | ${spec.label} as a reaction`, error);
      ui.notifications?.error?.(`${spec.label} could not be taken: ${error?.message ?? error}`);
    }
  }
  return taken;
}

/**
 * Before an attack rolls: offer the defender its reactions, and wait.
 *
 * @param {Actor} attacker
 * @param {Actor} defender
 * @param {{kind: "weapon"|"spell"|"bomb"|"spiritualWeapon", what?: string}} attack
 * @returns {Promise<string[]>} the reactions taken (keys)
 */
export async function offerDefences(attacker, defender, attack = {}) {
  if (!defender || defender === attacker) return [];
  const event = { kind: String(attack.kind ?? "weapon") };
  const { offered } = defenceOffersAgainst(defender, event, { forAlly: Boolean(attack.forAlly) });
  if (!offered.length) return [];
  const answerer = answererFor(defender);
  if (!answerer) return [];
  const ask = {
    defenderName: defender.name, attackerName: attacker?.name ?? "A creature",
    what: String(attack.what ?? ""), offered,
    protectedName: String(attack.protectedName ?? ""), forAlly: Boolean(attack.forAlly)
  };

  if (answerer === game.user?.id) {
    const keys = await askHere(ask);
    return takeHere(defender, defenceAnswerKeys(keys, offered), { ...attack, attackerUuid: attacker?.uuid ?? "" });
  }

  const requestId = foundry.utils.randomID();
  const reply = new Promise((resolve) => {
    waiting.set(requestId, resolve);
    setTimeout(() => {
      if (!waiting.has(requestId)) return;
      waiting.delete(requestId);
      resolve(null);
    }, WAIT_MS);
  });
  const answererName = game.users?.get?.(answerer)?.name ?? "the defender's player";
  ui.notifications?.info?.(`Waiting for ${answererName}: does ${defender.name} react to the attack?`);
  game.socket.emit(SOCKET, {
    action: ASK, requestId, userId: game.user.id, answererId: answerer,
    defenderUuid: defender.uuid, attackerUuid: attacker?.uuid ?? "", kind: event.kind,
    protectedUuid: String(attack.protectedUuid ?? ""),
    ...ask
  });
  const taken = await reply;
  if (taken === null) {
    ui.notifications?.warn?.(`${answererName} did not answer in time — ${defender.name} takes no reaction.`);
    return [];
  }
  return defenceAnswerKeys(taken, offered);
}

/**
 * AN ALLY STEPS IN (3.669.0): before a Strike reads its target, each ally
 * beside the target with a `forAlly` offer is asked in turn; the first who
 * takes it becomes the target. Resolves that ally's token, or null.
 *
 * @param {Actor} attacker
 * @param {Token} targetToken the attacked creature's token
 * @param {Token|null} attackerToken
 * @param {{kind: string, what?: string}} attack
 */
export async function offerIntercepts(attacker, targetToken, attackerToken, attack = {}) {
  const specs = registeredDefenceOffers().filter((s) => s.forAlly);
  const defender = targetToken?.actor;
  if (!specs.length || !defender || !canvas?.tokens?.placeables?.length) return null;
  const { distanceBetween } = await import("./geometry.mjs");
  const reachFeet = Math.max(...specs.map((s) => s.reachFeet));
  const tokens = canvas.tokens.placeables.map((t) => ({
    id: t.id, token: t, actorId: t.actor?.id ?? "", disposition: t.document?.disposition,
    distance: t.id === targetToken.id ? 0 : distanceBetween(t, targetToken)
  }));
  const candidates = interceptorCandidates(tokens, {
    targetId: targetToken.id, attackerId: attackerToken?.id ?? "", disposition: targetToken.document?.disposition, reachFeet
  });
  for (const c of candidates) {
    const taken = await offerDefences(attacker, c.token.actor, {
      ...attack, forAlly: true, protectedName: defender.name, protectedUuid: defender.uuid
    });
    if (taken.length) return c.token;
  }
  return null;
}

/** The listener on every client: the answerer answers, the asker hears. */
export function registerDefenceOffers() {
  game.socket?.on(SOCKET, async (data) => {
    if (data?.action === ANSWER) {
      if (data.userId !== game.user?.id) return;
      const resolve = waiting.get(data.requestId);
      if (!resolve) return;
      waiting.delete(data.requestId);
      resolve(Array.isArray(data.taken) ? data.taken.map(String) : []);
      return;
    }
    if (data?.action !== ASK || data.answererId !== game.user?.id) return;
    let taken = [];
    try {
      const defender = await (foundry.utils?.fromUuid ?? globalThis.fromUuid)(data.defenderUuid);
      // RE-ASKED HERE, on the client that will act: what the attacker's
      // client saw may be a moment stale, and only an offer still open now
      // is taken.
      const { offered } = defender
        ? defenceOffersAgainst(defender, { kind: String(data.kind ?? "weapon") }, { forAlly: Boolean(data.forAlly) })
        : { offered: [] };
      const asked = defenceAnswerKeys((data.offered ?? []).map((o) => o?.key), offered);
      const stillOpen = offered.filter((o) => asked.includes(o.key));
      if (defender && stillOpen.length) {
        const keys = await askHere({ ...data, offered: stillOpen });
        taken = await takeHere(defender, defenceAnswerKeys(keys, stillOpen),
          { kind: data.kind, what: data.what, attackerUuid: data.attackerUuid, protectedUuid: data.protectedUuid ?? "", forAlly: Boolean(data.forAlly) });
      }
    } catch (error) {
      console.error("TRG Prime | defence offer", error);
    }
    game.socket.emit(SOCKET, { action: ANSWER, requestId: data.requestId, userId: data.userId, taken });
  });
}
