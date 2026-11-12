/**
 * ASK THE REACTOR, WHEREVER THEY ARE (3.681.0; Eldritch Arts Block 3b, Q34).
 *
 * A reaction is the reactor's to take, and the reactor's client is the one
 * that must do its work: the Witch's player casts Missed Chance from her own
 * screen, with her own warp and her own Conviction. But the trigger is seen
 * by whoever rolled — the GM, usually. The defence offers (Shadow Shift) solved
 * this for attacks with a socket ask and answer; this is the same rule made
 * general:
 *
 *   - the answerer is the reactor's player if one is online (their own
 *     character first), else the GM (`defenceAnswerer`);
 *   - the question waits 30 seconds, and no answer is "no";
 *   - a "yes" is acknowledged at once, and the reactor's client then runs the
 *     named step (`registerReactionStep`), however long its dialogs take
 *     (up to five minutes), and sends back what it returned.
 *
 * Asked on this client when this client is the answerer, with no socket.
 */
import { defenceAnswerer } from "../combat/defence-offer.mjs";
import { registeredReactionStep } from "../module-api.mjs";

const SOCKET = "system.trg-prime";
const ASK = "reaction.ask";
const ACCEPTED = "reaction.accepted";
const ANSWER = "reaction.answer";
/** How long a question waits for its answer. */
const ANSWER_WAIT_MS = 30000;
/** How long an accepted reaction may take to do its work. */
const STEP_WAIT_MS = 300000;
const waiting = new Map();

/** Who answers for this actor: a user id, or null. */
function reactorAnswerer(actor) {
  const users = Array.from(globalThis.game?.users ?? []).map((u) => ({
    id: u.id,
    active: Boolean(u.active),
    isGM: Boolean(u.isGM),
    characterId: u.character?.id ?? null,
    owner: Boolean(actor?.testUserPermission?.(u, "OWNER"))
  }));
  return defenceAnswerer({ actorId: actor?.id ?? "", users, activeGMId: globalThis.game?.users?.activeGM?.id ?? null });
}

/** Ask on this screen; resolves the button's action, or null when closed or timed out. */
function askHere({ title, content, buttons }) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const dialog = new DialogV2({
      window: { title: String(title ?? "Reaction") },
      classes: ["trg-prime"],
      content: `<div class="trg-prime">${content ?? ""}</div>`,
      buttons: (buttons ?? []).map((b, i) => ({ action: String(b.action), label: String(b.label), default: i === 0 })),
      submit: async (result) => finish(result ?? null)
    });
    dialog.addEventListener?.("close", () => finish(null), { once: true });
    dialog.render({ force: true });
    setTimeout(() => {
      if (settled) return;
      finish(null);
      dialog.close?.().catch?.(() => {});
    }, ANSWER_WAIT_MS - 2000);
  });
}

/** Run a named step for this answer, here. */
async function runStep(step, actor, answer, data) {
  const run = step ? registeredReactionStep(step) : null;
  if (!run) return null;
  try {
    return (await run(actor, answer, data)) ?? null;
  } catch (error) {
    console.error(`TRG Prime | reaction step "${step}"`, error);
    globalThis.ui?.notifications?.error?.(`The reaction could not be taken: ${error?.message ?? error}`);
    return null;
  }
}

const declined = (answer) => !answer || answer === "no";

/**
 * Ask the reactor a question and, on any answer but "no", run `step` on
 * their client.
 *
 * @param {Actor} actor the reactor
 * @param {{title: string, content: string, buttons?: Array<{action: string, label: string}>,
 *   step?: string, data?: object}} question `buttons` defaults to Yes / No;
 *   `data` must be plain (it may cross the socket)
 * @returns {Promise<{answer: string|null, result: any, left?: boolean}>}
 *   answer null when nobody answered in time, or when the answerer left
 *   the game (`left`; their step may already have run part of the way)
 */
export async function askReactor(actor, { title, content, buttons = null, step = "", data = {} } = {}) {
  const choices = buttons?.length ? buttons : [{ action: "yes", label: "Yes" }, { action: "no", label: "No" }];
  const answerer = reactorAnswerer(actor);
  if (!actor || !answerer) return { answer: null, result: null };

  if (answerer === globalThis.game?.user?.id) {
    const answer = await askHere({ title, content, buttons: choices });
    if (declined(answer)) return { answer, result: null };
    return { answer, result: await runStep(step, actor, answer, data) };
  }

  const requestId = foundry.utils.randomID();
  const reply = new Promise((resolve) => {
    const entry = { resolve, timer: null, answererId: answerer };
    entry.timer = setTimeout(() => {
      if (!waiting.has(requestId)) return;
      waiting.delete(requestId);
      resolve({ answer: null, result: null });
    }, ANSWER_WAIT_MS);
    waiting.set(requestId, entry);
  });
  const answererName = game.users?.get?.(answerer)?.name ?? "the reactor's player";
  ui.notifications?.info?.(`Waiting for ${answererName}: ${String(title ?? "a reaction")}?`);
  game.socket.emit(SOCKET, {
    action: ASK, requestId, userId: game.user.id, answererId: answerer,
    actorUuid: actor.uuid, title, content, buttons: choices, step, data
  });
  const out = await reply;
  if (out.answer === null) ui.notifications?.warn?.(out.left ? `${answererName} left the game — no reaction.` : `${answererName} did not answer in time — no reaction.`);
  return out;
}

/** The listener on every client: the answerer answers, the asker hears. */
export function registerReactionAsk() {
  // AN ANSWERER WHO LEAVES answers no (found in review): an accepted step may
  // run five minutes, and a closed browser would hold the roll that long.
  globalThis.Hooks?.on?.("userConnected", (user, connected) => {
    if (connected) return;
    for (const [requestId, entry] of Array.from(waiting)) {
      if (entry.answererId !== user?.id) continue;
      clearTimeout(entry.timer);
      waiting.delete(requestId);
      entry.resolve({ answer: null, result: null, left: true });
    }
  });
  game.socket?.on(SOCKET, async (data) => {
    if (data?.action === ACCEPTED) {
      if (data.userId !== game.user?.id) return;
      const entry = waiting.get(data.requestId);
      // ONLY FROM THE ANSWERER ASKED (3.685.3, the second review of the
      // pending-cast relay, which found the same trust here).
      if (!entry || data.answererId !== entry.answererId) return;
      // ACCEPTED: the work may take as long as its dialogs do.
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        if (!waiting.has(data.requestId)) return;
        waiting.delete(data.requestId);
        entry.resolve({ answer: data.answer ?? null, result: null });
      }, STEP_WAIT_MS);
      return;
    }
    if (data?.action === ANSWER) {
      if (data.userId !== game.user?.id) return;
      const entry = waiting.get(data.requestId);
      // ONLY FROM THE ANSWERER ASKED (3.685.3, the second review of the
      // pending-cast relay, which found the same trust here).
      if (!entry || data.answererId !== entry.answererId) return;
      clearTimeout(entry.timer);
      waiting.delete(data.requestId);
      entry.resolve({ answer: data.answer ?? null, result: data.result ?? null });
      return;
    }
    if (data?.action !== ASK || data.answererId !== game.user?.id) return;
    let answer = null;
    let result = null;
    try {
      const actor = await (foundry.utils?.fromUuid ?? globalThis.fromUuid)(data.actorUuid);
      if (actor) {
        answer = await askHere({ title: data.title, content: data.content, buttons: data.buttons });
        if (!declined(answer)) {
          game.socket.emit(SOCKET, { action: ACCEPTED, requestId: data.requestId, userId: data.userId, answererId: game.user.id, answer });
          result = await runStep(data.step, actor, answer, data.data ?? {});
        }
      }
    } catch (error) {
      console.error("TRG Prime | reaction ask", error);
    }
    game.socket.emit(SOCKET, { action: ANSWER, requestId: data.requestId, userId: data.userId, answererId: game.user.id, answer, result });
  });
}
