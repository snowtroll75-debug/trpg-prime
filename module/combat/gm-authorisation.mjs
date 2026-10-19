/**
 * The GM's say-so for a strike made outside its maker's turn (3.646.0).
 *
 * Graham, 15 October 2026: "Attack of Opportunity and Readied action (after
 * its initial AP outlay) should use a Reaction. Any other weapon swing made
 * outside of a turn should be free but prompt a GM authorisation."
 *
 * The two named ones have their own doors (the AoO card, Ready) and spend a
 * reaction. Everything else that reaches the Strike off-turn — the weapon
 * row pressed between turns — is a swing the rules have no slot for, so the
 * table decides: the acting GM is asked, and the swing happens only on a yes.
 *
 * A GM's own click is asked on the GM's own screen. A player's click is
 * carried to the acting GM's client and waits for the answer; with no GM
 * connected, or no answer within two minutes, it is refused and says why.
 */
import { isActingGM } from "../acting-gm.mjs";

const SOCKET = "system.trg-prime";
const ASK = "gm.authorise";
const ANSWER = "gm.authorised";
const WAIT_MS = 120000;
const waiting = new Map();

function esc(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}

async function askHere({ who, what, userName }) {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return false;
  const answer = await DialogV2.confirm({
    window: { title: "Off-Turn Strike — GM Authorisation" },
    content: `<p><strong>${esc(who)}</strong> wants to make ${esc(what)} outside their turn${userName ? ` (asked by ${esc(userName)})` : ""}.</p>`
      + "<p>It costs no AP. Allow it?</p>",
    rejectClose: false
  });
  return Boolean(answer);
}

/**
 * Ask the GM whether an off-turn strike may go ahead.
 *
 * @param {Actor} actor the striker
 * @param {string} what e.g. "a Strike with Longsword against the Orc"
 * @returns {Promise<boolean>} true only on the GM's yes
 */
export async function requestGMAuthorisation(actor, what) {
  const who = actor?.name ?? "A creature";
  if (game.user?.isGM) return askHere({ who, what });
  if (!game.users?.activeGM) {
    ui.notifications?.warn(`${who}'s off-turn strike needs the GM's authorisation, and no GM is connected.`);
    return false;
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
  ui.notifications?.info(`Asking the GM to authorise ${who}'s off-turn strike…`);
  game.socket.emit(SOCKET, { action: ASK, requestId, userId: game.user.id, userName: game.user.name, who, what });
  const allowed = await reply;
  if (allowed === null) ui.notifications?.warn(`The GM did not answer — ${who}'s off-turn strike does not happen.`);
  else if (!allowed) ui.notifications?.warn(`The GM did not authorise ${who}'s off-turn strike.`);
  return allowed === true;
}

/** The listener on every client: the GM answers asks, the asker hears answers. */
export function registerGMAuthorisation() {
  game.socket?.on(SOCKET, async (data) => {
    if (data?.action === ANSWER) {
      if (data.userId !== game.user?.id) return;
      const resolve = waiting.get(data.requestId);
      if (!resolve) return;
      waiting.delete(data.requestId);
      resolve(data.allowed === true);
      return;
    }
    if (data?.action !== ASK || !isActingGM()) return;
    let allowed = false;
    try {
      allowed = await askHere({ who: data.who, what: data.what, userName: data.userName });
    } catch (error) {
      console.error("TRG Prime | GM authorisation", error);
    }
    game.socket.emit(SOCKET, { action: ANSWER, requestId: data.requestId, userId: data.userId, allowed });
  });
}
