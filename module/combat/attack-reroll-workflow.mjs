/**
 * The Foundry side of attack-reroll.mjs: asking the defender's player,
 * after an attack is rolled and before it resolves, whether to spend
 * conviction to make the attacker roll again (Inner Tempest's Alter the
 * Thread, 3.667.0).
 *
 * THE SOCKET PATTERN IS defence-offer-workflow.mjs's: the question goes to
 * whoever plays the defender (`defenceAnswerer`), the attack waits, and a
 * timeout is a "no". The conviction is spent on the defender's own client,
 * which owns it, before the answer goes back.
 */
import { defenceAnswerer } from "./defence-offer.mjs";
import { ATTACK_REROLL_FLAG, attackRerollOffer, attackRerollSource, rerolledTotal } from "./attack-reroll.mjs";

const SYSTEM_ID = "trg-prime";
const SOCKET = `system.${SYSTEM_ID}`;
const ASK = "reroll.offer";
const ANSWER = "reroll.answer";
const WAIT_MS = 30000;
const waiting = new Map();

const esc = (text) => String(text ?? "").replace(
  /[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

/** The user who answers for this defender. */
function answererFor(defender) {
  const users = Array.from(game.users ?? []).map((u) => ({
    id: u.id, active: Boolean(u.active), isGM: Boolean(u.isGM),
    characterId: u.character?.id ?? null,
    owner: Boolean(defender?.testUserPermission?.(u, "OWNER"))
  }));
  return defenceAnswerer({ actorId: defender?.id ?? "", users, activeGMId: game.users?.activeGM?.id ?? null });
}

/** Is the reroll on offer to this defender against this roll? */
async function offerFor(attacker, defender, check) {
  const source = attackRerollSource(Array.from(defender?.items ?? []));
  const { getConvictionState } = await import("../conviction.mjs");
  const verdict = attackRerollOffer({
    declared: Boolean(source),
    conviction: source ? getConvictionState(defender) : { ok: false },
    chaos: Boolean(check?.outcome?.chaos ?? check?.dice?.chaos),
    attackerIsDefender: Boolean(attacker && defender && attacker.uuid === defender.uuid)
  });
  return verdict.offer ? source : null;
}

/** Ask on THIS screen; spend the point here on a yes. */
async function askHere(defender, { label, attackerName, what, total, db }) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return false;
  const verdict = Number.isFinite(Number(db)) ? (Number(total) >= Number(db) ? "hits" : "misses") : "";
  const yes = await new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const dialog = new DialogV2({
      window: { title: `${label} — ${defender.name}` },
      content: `<p><strong>${esc(attackerName)}</strong>${what ? ` (${esc(what)})` : ""} rolled <strong>${esc(total)}</strong>`
        + `${Number.isFinite(Number(db)) ? ` against ${esc(defender.name)}'s DB ${esc(db)}, which ${verdict}` : ""}.</p>`
        + `<p>Spend 1 conviction to make them roll again? The new roll stands.</p>`,
      buttons: [
        { action: "yes", label: `${label} (1 conviction)` },
        { action: "no", label: "Let it stand", default: true }
      ],
      submit: async (result) => finish(result === "yes")
    });
    dialog.addEventListener?.("close", () => finish(false), { once: true });
    dialog.render({ force: true });
    setTimeout(() => { if (!settled) { finish(false); dialog.close?.().catch?.(() => {}); } }, WAIT_MS - 2000);
  });
  if (!yes) return false;
  const { getConvictionState, markConvictionSpent } = await import("../conviction.mjs");
  if (!getConvictionState(defender).ok) return false;
  await markConvictionSpent(defender);
  return true;
}

/**
 * After an attack check is rolled against `defender`: ask, and on a yes
 * return true (the point is spent). The caller rolls again.
 *
 * @param {{attacker: Actor, defender: Actor, check: object, what?: string, db?: number}} args
 * @returns {Promise<{rerolled: boolean, label: string}>}
 */
export async function offerAttackReroll({ attacker, defender, check, what = "", db = null } = {}) {
  if (!defender || !check) return { rerolled: false, label: "" };
  const source = await offerFor(attacker, defender, check);
  if (!source) return { rerolled: false, label: "" };
  const answerer = answererFor(defender);
  if (!answerer) return { rerolled: false, label: "" };
  const ask = {
    label: source.label, attackerName: attacker?.name ?? "The attacker", what,
    total: Number(check?.outcome?.total ?? check?.total ?? 0), db
  };
  if (answerer === game.user?.id) {
    return { rerolled: await askHere(defender, ask), label: source.label };
  }
  const requestId = foundry.utils.randomID();
  const reply = new Promise((resolve) => {
    waiting.set(requestId, resolve);
    setTimeout(() => { if (waiting.has(requestId)) { waiting.delete(requestId); resolve(null); } }, WAIT_MS);
  });
  const answererName = game.users?.get?.(answerer)?.name ?? "the defender's player";
  ui.notifications?.info?.(`Waiting for ${answererName}: does ${defender.name} use ${source.label}?`);
  game.socket.emit(SOCKET, { action: ASK, requestId, userId: game.user.id, answererId: answerer, defenderUuid: defender.uuid, ...ask });
  const answer = await reply;
  if (answer === null) {
    ui.notifications?.warn?.(`${answererName} did not answer in time — the roll stands.`);
    return { rerolled: false, label: source.label };
  }
  return { rerolled: Boolean(answer), label: source.label };
}

/**
 * New dice for a reroll, at the original check's bias: a throwaway check
 * with no modifiers, whose dice are the reroll.
 */
async function freshAttackDice(attacker, check) {
  const { TRGCheck } = await import("../dice/check.mjs");
  const fresh = await TRGCheck.roll({
    actor: attacker, label: "Reroll", type: "attack", modifiers: [],
    ...(check?.bias ? { bias: check.bias } : {}),
    suppressDegree: true, toMessage: false, allowConviction: false
  });
  return fresh?.dice ?? null;
}

/**
 * A spell attack's check with new dice (see `rerolledTotal`): the shape
 * resolveSpellAttack reads — `outcome.total` and `dice`.
 */
export async function rerolledSpellCheck(attacker, check) {
  const dice = await freshAttackDice(attacker, check);
  if (!dice) return check;
  return {
    ...check,
    outcome: { ...(check?.outcome ?? {}), total: rerolledTotal(check?.outcome?.total, check?.dice?.total, dice.total), chaos: Boolean(dice.chaos) },
    dice,
    rerolledFrom: Number(check?.outcome?.total ?? 0)
  };
}

/** The card that says what happened. */
export async function postRerollCard(defender, attacker, label, before, after) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: defender }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${esc(defender?.name)}</span><h3>${esc(label)}</h3></div></header>`
      + `<p style="margin:2px 0">${esc(defender?.name)} spends 1 conviction: ${esc(attacker?.name)} rolls the attack again — `
      + `<strong>${esc(before)}</strong> → <strong>${esc(after)}</strong>. The new roll stands.</p></div>`
  });
}

/** The listener on every client: the answerer answers, the asker hears. */
export function registerAttackRerollOffers() {
  game.socket?.on(SOCKET, async (data) => {
    if (data?.action === ANSWER) {
      if (data.userId !== game.user?.id) return;
      const resolve = waiting.get(data.requestId);
      if (!resolve) return;
      waiting.delete(data.requestId);
      resolve(Boolean(data.yes));
      return;
    }
    if (data?.action !== ASK || data.answererId !== game.user?.id) return;
    let yes = false;
    try {
      const defender = await (foundry.utils?.fromUuid ?? globalThis.fromUuid)(data.defenderUuid);
      // RE-ASKED HERE, where the point would be spent.
      if (defender && attackRerollSource(Array.from(defender.items ?? []))) {
        const { getConvictionState } = await import("../conviction.mjs");
        if (getConvictionState(defender).ok) yes = await askHere(defender, data);
      }
    } catch (error) {
      console.error("TRG Prime | attack reroll offer", error);
    }
    game.socket.emit(SOCKET, { action: ANSWER, requestId: data.requestId, userId: data.userId, yes });
  });
}

export { ATTACK_REROLL_FLAG };
