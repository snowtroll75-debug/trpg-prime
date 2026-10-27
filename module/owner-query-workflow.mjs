/**
 * Asking a creature's own player, the Foundry half (3.673.0). See
 * owner-query.mjs for who answers.
 *
 * `askOwner(actor, { title, content, yes, no })` resolves true or false. The
 * question is a yes/no dialog on the answering client; a player who does not
 * answer within the wait is a "no", and the card that asked says so. The
 * answering client may also be handed `onYes` work by name (`then`), run
 * there before it answers — so a write only the owner may make (a rune's
 * daily marker on the wearer's own armour) happens on the client that owns
 * it, before the asker carries on.
 */
import { ANSWER_WINDOW_MS, ASK_WAIT_MS, answeredInTime, answeringUserId } from "./owner-query.mjs";

const OWNER_QUERY = "trg-prime.ownerConfirm";
/** How long a blow waits for a player. */
const WAIT_MS = ASK_WAIT_MS;

/** Work an answering client runs on a yes, by name. Registered by the callers. */
const AFTER_YES = new Map();

/** Register a named step the answering client runs on a yes: `fn(data)`. */
export function registerOwnerQueryStep(name, fn) {
  if (name && typeof fn === "function") AFTER_YES.set(String(name), fn);
}

/** Registered at init: the answering side. */
export function registerOwnerQuery() {
  if (!globalThis.CONFIG) return;
  CONFIG.queries ??= {};
  CONFIG.queries[OWNER_QUERY] = async (data) => askHere(data, { windowMs: ANSWER_WINDOW_MS });
}

/**
 * The question, on this client. Asked for another client (`windowMs`), it
 * closes itself when the asker stops waiting, and an answer after that is a
 * no that runs nothing (found in review: a late yes spent the reaction and
 * the rune's day for nothing).
 */
async function askHere({ title = "", content = "", yes = "Yes", no = "No", then = "", data = null } = {}, { windowMs = 0 } = {}) {
  const { DialogV2 } = foundry.applications.api;
  const askedAt = Date.now();
  let shown = null;
  let timer = null;
  if (windowMs > 0) {
    timer = setTimeout(() => {
      try { shown?.close?.(); } catch (_err) { /* already closed */ }
    }, windowMs);
  }
  const answer = await DialogV2.wait({
    window: { title },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">${content}</div>`,
    buttons: [
      { action: "yes", label: yes },
      { action: "no", label: no, default: true }
    ],
    render: (_event, dialog) => { shown = dialog; },
    rejectClose: false
  });
  if (timer) clearTimeout(timer);
  if (answer !== "yes") return false;
  if (windowMs > 0 && !answeredInTime(askedAt, Date.now(), windowMs)) {
    ui.notifications?.warn?.(`${title}: answered too late — the moment has passed.`);
    return false;
  }
  const step = then ? AFTER_YES.get(then) : null;
  if (step) {
    try { await step(data); } catch (err) { console.error(`TRG Prime | ${then} after a yes`, err); }
  }
  return true;
}

/**
 * Ask the actor's player (or the GM, or here).
 * @returns {Promise<boolean>}
 */
export async function askOwner(actor, question) {
  const owners = Array.from(game.users ?? []).filter((u) => actor?.testUserPermission?.(u, "OWNER"));
  const id = answeringUserId(owners, { gmId: game.users?.activeGM?.id ?? "", selfId: game.user?.id ?? "" });
  if (!id) return askHere(question);
  const user = game.users.get(id);
  if (typeof user?.query !== "function") return askHere(question);
  try {
    return Boolean(await user.query(OWNER_QUERY, question, { timeout: WAIT_MS }));
  } catch (err) {
    console.warn(`TRG Prime | ${user.name} did not answer "${question?.title ?? ""}"`, err);
    return false;
  }
}
