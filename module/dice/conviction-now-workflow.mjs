/**
 * THE CONVICTION BONUS, ASKED ON THE CARD (3.667.2).
 *
 * Graham, 23 October 2026, after the live test of 3.667.0: the +1d6 prompt
 * "should appear after the dice is rolled but before the result is known",
 * and "it needs to appear on the chat card but actually change the result".
 *
 * Until now (3.645.0) it was a dialog on the roller's screen that printed the
 * total against the DB or DC — and a save's degree — so the result was known
 * before the choice was made; and the card's own +1d6 button, the older way,
 * only re-added a total the workflow had already read.
 *
 * Now the roll posts a card at once: the dice and the total, and nothing of
 * the DB, the DC or the degree. It carries two buttons, Spend Conviction
 * (+1d6) and No. The workflow waits on the card; whichever is pressed, by the
 * character's owner or the GM, on any screen, decides it, and the +1d6 is
 * added before anything reads the result. The card then records the choice,
 * and the full check card follows as before.
 *
 * WHO ASKS. The client that rolled (the GM, or the character's owner) holds
 * the check and spends the point; another screen's press reaches it by the
 * system socket. Pure section first.
 */
const SYSTEM_ID = "trg-prime";

const SOCKET = `system.${SYSTEM_ID}`;
const ANSWER = "convictionNow.answer";
const FLAG = "convictionNow";
const waiting = new Map();

const esc = (text) => String(text ?? "").replace(
  /[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

/* ------------------------------------------------------------------ */
/* Pure                                                                 */
/* ------------------------------------------------------------------ */

/**
 * The card that asks: the dice and the total, never the DB, the DC or the
 * degree.
 *
 * @param {{actorName: string, label: string, diceTotal: number, total: number, pointsLeft: number}} args
 * @returns {string} HTML
 */
export function convictionNowCard({ actorName = "", label = "Check", diceTotal = 0, total = 0, pointsLeft = 0 } = {}) {
  return `<div class="trg-prime trg-check-card conviction-now">`
    + `<header class="check-header"><div class="check-heading"><span class="check-actor">${esc(actorName)}</span><h3>${esc(label)}</h3></div></header>`
    + `<p style="margin:2px 0">Rolled <strong>${esc(diceTotal)}</strong> on the dice: total <strong>${esc(total)}</strong>.</p>`
    + `<p style="margin:2px 0"><em>The result is held. Spend a conviction point to add +1d6 before it is read?</em></p>`
    + `<div class="conviction-bonus-control">`
    + `<button type="button" data-action="convictionNowSpend" class="gold-button small-button"><i class="fa-solid fa-star"></i> Spend Conviction (+1d6) &mdash; ${esc(pointsLeft)} left</button> `
    + `<button type="button" data-action="convictionNowPass" class="small-button">No</button>`
    + `</div></div>`;
}

/**
 * The card once decided: what was chosen, and nothing to press.
 *
 * @param {{actorName: string, label: string, total: number, spent: boolean, die?: number|null, newTotal?: number|null}} args
 */
export function convictionDecidedCard({ actorName = "", label = "Check", total = 0, spent = false, die = null, newTotal = null } = {}) {
  const line = spent
    ? `Conviction spent: +1d6 rolled <strong>${esc(die)}</strong> — total <strong>${esc(total)}</strong> → <strong>${esc(newTotal)}</strong>.`
    : `No conviction spent: the total <strong>${esc(total)}</strong> stands.`;
  return `<div class="trg-prime trg-check-card conviction-now">`
    + `<header class="check-header"><div class="check-heading"><span class="check-actor">${esc(actorName)}</span><h3>${esc(label)}</h3></div></header>`
    + `<p style="margin:2px 0">${line}</p></div>`;
}

/** May this user answer for this actor? Its owner, or the GM. */
export function mayAnswer({ isGM = false, isOwner = false } = {}) {
  return Boolean(isGM || isOwner);
}

/* ------------------------------------------------------------------ */
/* Foundry                                                              */
/* ------------------------------------------------------------------ */

/**
 * Post the card and wait for the answer.
 *
 * @param {TRGCheck} check the rolled check, its outcome not yet read
 * @param {{value: number}} state getConvictionState's verdict
 * @returns {Promise<{spend: boolean, message: ChatMessage|null}>}
 */
export async function askConvictionOnCard(check, state) {
  const requestId = foundry.utils.randomID();
  const data = {
    speaker: ChatMessage.getSpeaker({ actor: check.actor }),
    content: convictionNowCard({
      actorName: check.actor?.name ?? "",
      label: check.label ?? "Check",
      diceTotal: Number(check.dice?.total ?? 0),
      total: Number(check.outcome?.total ?? 0),
      pointsLeft: Number(state?.value ?? 0)
    }),
    flags: { [SYSTEM_ID]: { [FLAG]: { requestId, actorUuid: check.actor?.uuid ?? "", askerId: game.user.id, decided: false } } }
  };
  // The check's own roll mode: a blind or private roll asks privately too.
  const { applyMessageMode } = await import("./check.mjs");
  applyMessageMode(data, check.rollMode);
  const answer = new Promise((resolve) => waiting.set(requestId, resolve));
  const message = await ChatMessage.create(data);
  const spend = Boolean(await answer);
  return { spend, message };
}

/** Record the decision on the card (by the client that asked, its author). */
export async function settleConvictionCard(message, { actorName, label, total, spent, die = null, newTotal = null }) {
  if (!message) return;
  const flag = message.getFlag(SYSTEM_ID, FLAG) ?? {};
  await message.update({
    content: convictionDecidedCard({ actorName, label, total, spent, die, newTotal }),
    [`flags.${SYSTEM_ID}.${FLAG}`]: { ...flag, decided: true, spent }
  });
}

/** A press on this screen: answer here, or send it to the client that asked. */
async function press(message, spend) {
  const flag = message?.getFlag?.(SYSTEM_ID, FLAG);
  if (!flag || flag.decided) return;
  const actor = flag.actorUuid ? await fromUuid(flag.actorUuid) : null;
  if (!mayAnswer({ isGM: game.user?.isGM, isOwner: Boolean(actor?.isOwner) })) {
    ui.notifications?.warn?.("Only this character's owner or the GM can spend their conviction.");
    return;
  }
  if (flag.askerId === game.user?.id) {
    const resolve = waiting.get(flag.requestId);
    if (resolve) { waiting.delete(flag.requestId); resolve(spend); }
    return;
  }
  game.socket?.emit(SOCKET, { action: ANSWER, requestId: flag.requestId, userId: flag.askerId, spend });
}

/** The socket listener and the card's buttons. Called once at start-up. */
export function registerConvictionNow() {
  game.socket?.on(SOCKET, (data) => {
    if (data?.action !== ANSWER || data.userId !== game.user?.id) return;
    const resolve = waiting.get(data.requestId);
    if (!resolve) return;
    waiting.delete(data.requestId);
    resolve(Boolean(data.spend));
  });
  Hooks.on("renderChatMessageHTML", async (message, html) => {
    const flag = message?.getFlag?.(SYSTEM_ID, FLAG);
    if (!flag || flag.decided) return;
    const actor = flag.actorUuid ? await fromUuid(flag.actorUuid) : null;
    const allowed = mayAnswer({ isGM: game.user?.isGM, isOwner: Boolean(actor?.isOwner) });
    for (const [selector, spend] of [['[data-action="convictionNowSpend"]', true], ['[data-action="convictionNowPass"]', false]]) {
      const button = html.querySelector?.(selector);
      if (!button) continue;
      if (!allowed) { button.style.display = "none"; continue; }
      if (button.dataset.bound) continue;
      button.dataset.bound = "true";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        html.querySelectorAll?.(".conviction-now button").forEach((b) => { b.disabled = true; });
        await press(message, spend);
      });
    }
  });
}
