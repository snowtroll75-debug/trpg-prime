/**
 * THE WINDOW EXTRA CASTING TIME OPENS — the Foundry half.
 *
 * NEW at 3.584.0 (R9 of the pages 231-240 audit).
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE CAST IS SUSPENDED, NOT RESTARTED.
 *
 * The obvious build is to end the cast, store every choice the player
 * made, and replay them when they press Complete. `castSpell` asks up to
 * eight questions before it rolls — targets, AP scale, warps, metamagic,
 * reagents, the conditions prompt — and a record carrying all of them is
 * a second copy of the cast's state that has to agree with the first.
 * The moment it disagrees, a player gets a spell they did not choose.
 *
 * So nothing is replayed. `awaitPendingCast` returns a promise, and the
 * cast simply waits on it at the point where every question has been
 * answered and the DC is known. Complete resolves it, Stop resolves it,
 * damage resolves it. The rest of `castSpell` then runs exactly as it
 * always has, with one forced degree if the window was interrupted.
 *
 * WHAT THAT COSTS, SAID PLAINLY: a suspended cast lives in the browser
 * that started it. Reload mid-casting and the promise is gone — so the
 * flag below is cleared at startup and the card says the casting lapsed,
 * rather than leaving a button that resolves nothing. ONLY THAT BROWSER'S
 * OWN CASTINGS, and the acting GM's sweep of anybody no longer connected
 * (3.685.3): see `pendingCastLapsesAtStartup`. No PP was at
 * stake, which is the whole reason this is an acceptable trade rather
 * than a data-loss bug: page 237 spends nothing until the spell is cast.
 *
 * THE FLAG IS NOT THE STATE. It exists so the sheet, the GM and the
 * startup sweep can see that a casting is in progress; the promise is
 * what actually carries it. Two records of one fact, and this comment is
 * here so the next reader knows which one is load-bearing.
 */

import { generalAP } from "../combat/restricted-ap.mjs";
import {
  PENDING_CAST_FLAG, apPaymentForTurn, armedLine, castingHeldLine, castingProgressLine,
  extraApOwed, extraApRemaining, hitPointsLost, interruptedDegree, interruptedLine,
  lapsedLine, pendingCastHolder, pendingCastLapsesAtStartup, pendingCastReady, stoppedLine
} from "./pending-cast.mjs";
import { isActingGM } from "../acting-gm.mjs";
import { gmConnectionReady, gmConnectionSettled } from "../gm-connection.mjs";
import { actorInCombat, spendActionPoints } from "../combat/action-points-workflow.mjs";
/*
 * A CARD NAMES A CREATURE BY HANDLE, NOT BY ACTOR ID (3.584.0).
 * `game.actors.get(id)` answers the WORLD actor, so a caster who is an
 * unlinked token — or a wildshaped druid — would have their casting
 * completed on somebody else's sheet, or not found at all.
 * `verify-actor-handle` refused this file's first draft for exactly
 * that, before it reached a live world.
 */
import { actorHandle, resolveActorHandle } from "../actor-handle.mjs";

const SYSTEM_ID = "trg-prime";

/** actor id → the resolver of the promise its cast is waiting on. */
const waiting = new Map();
/**
 * What each held casting knows about its own flag (3.686.2, the third
 * review's LOW 4): the resolver it belongs to, its cast id, and whether its
 * flag has been written yet. A removal of the PREVIOUS casting's flag that
 * lands between holding a new casting and writing its flag must not end it.
 */
const castState = new Map();

/**
 * A fresh id. `foundry.utils.randomID` in Foundry; a harness's thinner
 * `foundry.utils` may not carry it (3.686.2), so the fallback is local.
 */
function newId() {
  const make = globalThis.foundry?.utils?.randomID;
  if (typeof make === "function") return make();
  return Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 62)]).join("");
}

/** actor ids whose interruption's module steps are being asked (3.684.0, G26). */
const interrupting = new Set();

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines, extra = "") {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card" data-pending-actor="${actor.id}">`
      + `<header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>`
      + lines.join("") + extra + "</div>"
  });
}

/** Is this actor part-way through a casting? */
export function pendingCastOf(actor) {
  return actor?.getFlag?.(SYSTEM_ID, PENDING_CAST_FLAG) ?? null;
}

/**
 * Hold the cast open while the caster takes the extra time.
 *
 * @param {Actor} actor
 * @param {object} state
 * @param {object} state.spell the spell item being cast
 * @param {number} state.increments how many extra increments were taken
 * @param {string} state.unit "AP" | "minute"
 * @param {number} state.size the size of one increment
 * @param {number} state.bonus the circumstance bonus they buy
 * @param {number} state.dc the casting DC, already computed
 * @returns {Promise<{outcome: "complete"|"stopped"|"interrupted", criticalSeverity?: string|null}>}
 */
export async function awaitPendingCast(actor, { spell, increments, unit, size, bonus, dc, castAP = 0 }) {
  // ONE AT A TIME. A second casting started while the first is open would
  // leave the first's resolver unreachable and its card dead, so the
  // earlier one is stopped — which costs nothing, by page 237.
  if (waiting.has(actor.id)) await stopPendingCast(actor, { silent: true });

  const handle = actorHandle(actor, actor?.token ?? actor?.getActiveTokens?.()?.[0] ?? null);
  const record = {
    castId: newId(),
    spellId: spell?.id ?? null,
    spellName: spell?.name ?? "A spell",
    increments, unit, size, bonus, dc, handle, castAP,
    /*
     * WHAT THE TIME COSTS, AND WHAT HAS BEEN PUT IN (3.592.0).
     * `extraApOwed` answers 0 for a minute-unit window and for a caster
     * outside combat, and a window owing nothing is ready at once —
     * which is how both of those keep 3.584.0's behaviour exactly.
     */
    apOwed: extraApOwed({ increments, unit, size }, actorInCombat(actor)),
    apPaid: 0,
    startedAt: Number(globalThis.game?.time?.worldTime ?? 0),
    /*
     * WHOSE BROWSER HOLDS IT (3.685.3). The promise below lives in this
     * client, so the startup sweep has to know which user that was before
     * it can say a casting is orphaned. Nothing else reads it.
     */
    userId: globalThis.game?.user?.id ?? null
  };

  /*
   * THE TURN THEY DECLARE IT IS THE FIRST TURN THEY PAY FOR. Graham's
   * worked example is "turns 1 and 2, three AP each" for a six-AP
   * window, and the turn the caster stands up to do it is turn one —
   * so whatever AP is still in their pool goes in now, before any
   * turn-start driver ever runs.
   */
  /*
   * THE PROMISE IS HELD BEFORE THE FLAG IS WRITTEN (3.686.2, the 3.686.1
   * review). Another client that sees the flag may probe or ask this one
   * at once; with the resolver set only after the card, a fast ask found
   * no `waiting` entry and was answered as if nobody held the casting.
   */
  let resolveCast = null;
  const held = new Promise((resolve) => { resolveCast = resolve; });
  waiting.set(actor.id, resolveCast);
  const state = { resolve: resolveCast, castId: record.castId, flagWritten: false };
  castState.set(actor.id, state);
  try {
    const firstPayment = await payTowards(actor, record);
    await actor.setFlag(SYSTEM_ID, PENDING_CAST_FLAG, record);
    state.flagWritten = true;

    await postCard(actor, `${record.spellName} — Casting`, [
      line(armedLine(record.spellName, record, bonus)),
      ...(record.apOwed > 0 ? [line(castingProgressLine(record.spellName, record, firstPayment))] : []),
      line(`<em>Casting DC ${dc}. Damage taken before it completes makes the check `
        + "automatically a failure — a critical injury, a fumble (page 238).</em>")
    ], pendingCastButtons(record));
  } catch (error) {
    if (waiting.get(actor.id) === resolveCast) waiting.delete(actor.id);
    throw error;
  }
  return held;
}

/**
 * The buttons a casting card carries.
 *
 * COMPLETE IS NOT OFFERED UNTIL THE TIME IS PAID (Graham, 25 September
 * 2026). Offering it from the first card is what let a caster take the
 * bonus for extra casting time without ever standing there for it, and
 * it is the button that then scrolled away up the log while they did.
 */
function pendingCastButtons(record) {
  const handle = JSON.stringify(record.handle ?? {});
  const complete = pendingCastReady(record)
    ? `<button type="button" data-action="completePendingCast" data-handle='${handle}' `
      + `class="gold-button small-button">Complete the casting</button> `
    : "";
  return `<p style="margin:6px 0 2px">${complete}`
    + `<button type="button" data-action="stopPendingCast" data-handle='${handle}' `
    + `class="small-button">Stop</button></p>`;
}

/**
 * Put this turn's AP into an open window, mutating the record.
 *
 * SPENT THROUGH THE ONE SPENDER, not by writing the pool here. The
 * mounted pair share a pool, and `spendActionPoints` is the single place
 * that knows so; a direct update would pay a mounted caster's extra time
 * out of only half the pool they actually have.
 *
 * @returns {Promise<number>} what went in this turn
 */
async function payTowards(actor, record) {
  if (extraApRemaining(record.apOwed, record.apPaid) === 0) return 0;
  // NOT HASTE'S OR FAST ATTACK'S POINT (3.648.0): standing still for a spell is neither a Strike nor a Stride.
  const available = generalAP(actor);
  const payment = apPaymentForTurn(available, record.apOwed, record.apPaid);
  if (payment <= 0) return 0;
  /*
   * ONLY WHAT WAS SPENT COUNTS (3.685.3, the second review).
   * `spendActionPoints` returns its receipt when the points left the pool,
   * and nothing when it did not (no started combat on this client, or the
   * actor not in it). Crediting the window regardless paid for casting time
   * nobody stood there for.
   */
  const receipt = await spendActionPoints(actor, payment, `${record.spellName} — extra casting time`);
  if (!receipt) return 0;
  record.apPaid = Math.max(0, Math.trunc(Number(record.apPaid) || 0)) + payment;
  return payment;
}

/**
 * Pay down an open window at the start of the caster's turn.
 *
 * Called from `documents/combat.mjs` Phase 1, AFTER the turn's AP has
 * been granted — paying before the grant would spend the previous turn's
 * leftovers and then hand the caster a full pool to act with, which is
 * the opposite of what standing still for a spell is supposed to cost.
 *
 * @returns {Promise<{line: string, buttons: string}|null>} null when this
 *   actor has no open window, so Phase 1 prints nothing
 */
export async function payPendingCastTurn(actor) {
  const record = pendingCastOf(actor);
  if (!record) return null;
  /*
   * ASKED OF THE CLIENT THAT HOLDS IT (3.685.3). Phase 1 runs on a GM's
   * client, and a player's casting is held in the player's browser, so
   * this answered null for every player: their extra time was never paid
   * down, and no turn card carried their Complete button. The same payment
   * now runs on the holder's client (`payHere`, unchanged) and its answer
   * comes back for the GM's card. Nobody connected holds it: null, as before.
   */
  if (!waiting.has(actor.id)) {
    const asked = await askHolder(actor, record, "pay", { combatId: game.combat?.id ?? null },
      { notice: `${record.spellName}'s extra casting time` });
    return asked.relayed ? (asked.result ?? null) : null;
  }
  return payHere(actor, { combatId: game.combat?.id ?? null });
}

/**
 * The turn's payment, on the client that holds the casting.
 *
 * @param {Actor} actor
 * @param {{combatId?: string|null}} [ask] the combat whose turn this is, as
 *   the client running Phase 1 sees it
 */
async function payHere(actor, { combatId = null } = {}) {
  const record = pendingCastOf(actor);
  if (!record) return null;
  // A FLAG WITHOUT A PROMISE IS A GHOST — the browser that held the cast
  // reloaded. The startup sweep clears these, but a turn that arrives
  // first must not charge AP toward a casting nobody is waiting on.
  if (!waiting.has(actor.id)) return null;

  /*
   * A TURN WITH NOTHING LEFT TO PAY STILL CARRIES THE BUTTON (3.592.1).
   *
   * This used to return null here, and driving it on 25 September showed
   * what that cost: the turn after the last instalment printed nothing,
   * so "Complete the casting" lived on exactly ONE card and scrolled
   * away as the rounds passed. A caster holding the spell — which the
   * ruling explicitly allows — lost the affordance all over again, which
   * is the complaint this release was written to answer.
   *
   * No AP is taken and the flag is not rewritten, because nothing
   * changed; the turn simply says the casting is still open.
   */
  if (extraApRemaining(record.apOwed, record.apPaid) === 0) {
    return {
      line: castingHeldLine(record.spellName, record),
      buttons: pendingCastButtons(record)
    };
  }

  /*
   * THE COMBAT THE TURN BELONGS TO (3.685.3, the second review). The AP is
   * spent through `spendActionPoints`, which reads THIS client's
   * `game.combat` and does nothing when the actor is not in it. A holder
   * whose screen is on another combat would have spent nothing and still
   * been credited. It cannot be told which combat to use, so a turn whose
   * combat is not the one this client is viewing pays nothing here, and
   * the line says why.
   */
  if (combatId && game.combat?.id !== combatId) {
    return {
      line: `<strong>Casting ${record.spellName}</strong> — nothing went into the extra casting time this turn: `
        + `the caster's player is viewing a different combat, so their client cannot spend the AP.`,
      buttons: pendingCastButtons(record)
    };
  }

  /*
   * NOT IF IT ENDED MEANWHILE (3.685.3, the second review). A blow landing
   * while the AP was being spent settles the window and clears the flag;
   * writing the record back after that would bring it back as a ghost. So
   * the write is made only while this window is still the one waiting, and
   * undone if it settled while the write was in flight.
   */
  const resolve = waiting.get(actor.id);
  const paid = await payTowards(actor, record);
  if (waiting.get(actor.id) !== resolve) return null;
  await actor.setFlag(SYSTEM_ID, PENDING_CAST_FLAG, record);
  if (waiting.get(actor.id) !== resolve) {
    await actor.unsetFlag(SYSTEM_ID, PENDING_CAST_FLAG).catch(() => {});
    return null;
  }
  return {
    line: castingProgressLine(record.spellName, record, paid),
    buttons: pendingCastButtons(record)
  };
}

async function settle(actor, outcome, extra = {}) {
  const resolve = waiting.get(actor.id);
  waiting.delete(actor.id);
  await actor.unsetFlag(SYSTEM_ID, PENDING_CAST_FLAG).catch(() => {});
  if (resolve) resolve({ outcome, ...extra });
  return Boolean(resolve);
}

/** The caster stands there long enough and casts (page 237). */
export async function completePendingCast(actor) {
  // ON THE HOLDER'S CLIENT (3.685.3): a Complete pressed anywhere else
  // resolved nothing. Relayed; nobody holding it, as before.
  const record = pendingCastOf(actor);
  if (record && !waiting.has(actor.id)) {
    const asked = await askHolder(actor, record, "complete", {}, { notice: `completing ${record.spellName}` });
    if (asked.relayed) return Boolean(asked.result);
    // A HOLDER STILL THERE keeps its casting (3.685.3, the second review):
    // only with nobody holding it is the flag this client's to clear.
    if (asked.reason !== "none") return false;
  }
  return settle(actor, "complete");
}

/**
 * The caster thinks better of it.
 *
 * "All accrued bonuses are lost and the process must be started anew,
 * but no PPs are spent" — so this is cheap, deliberately.
 */
export async function stopPendingCast(actor, { silent = false } = {}) {
  const record = pendingCastOf(actor);
  /*
   * THE GM'S STOP (3.685.3). `game.trgPrime.pendingCast.stop` exists for a
   * GM ending a player's casting, and on the GM's client it cleared the
   * flag, answered false and said nothing: the promise was in the player's
   * browser. Relayed to the holder now, who stops it and posts the card.
   * Nobody holding it: there is no promise anywhere, so clearing the flag
   * is the whole stop, and the card says so.
   */
  if (record && !waiting.has(actor.id)) {
    const asked = await askHolder(actor, record, "stop", { silent }, { notice: `stopping ${record.spellName}` });
    if (asked.relayed) return Boolean(asked.result);
    /*
     * ONLY WHEN NOBODY HOLDS IT (3.685.3, the second review). A holder that
     * is connected but did not answer still has the promise, and clearing
     * the flag here would post "Stopped" over a casting its player can
     * still complete. So a timeout, a refusal or a departure mid-ask stops
     * nothing, and the notice above has said so.
     */
    if (asked.reason !== "none") return false;
    // AND ONLY IF THE FLAG ACTUALLY WENT: a client that may not write it
    // (a player who does not own the caster) is refused, and says nothing.
    try {
      await actor.unsetFlag(SYSTEM_ID, PENDING_CAST_FLAG);
    } catch {
      return false;
    }
    if (!silent) await postCard(actor, `${record.spellName} — Stopped`, [line(stoppedLine(record.spellName))]);
    return true;
  }
  return stopHere(actor, { silent });
}

async function stopHere(actor, { silent = false } = {}) {
  const record = pendingCastOf(actor);
  const settled = await settle(actor, "stopped");
  // A FLAG WITH NO PROMISE BEHIND IT (a reload) is stopped too, and said so
  // (3.685.3): clearing it is the whole stop, and a silent clear reads as
  // the button doing nothing.
  if (!silent && record) {
    await postCard(actor, `${record.spellName} — Stopped`, [line(stoppedLine(record.spellName))]);
  }
  return settled || Boolean(record);
}

/**
 * Something hit the caster while they stood there (page 238).
 *
 * @param {Actor} actor
 * @param {object} options
 * @param {string|null} options.criticalSeverity a critical injury's
 *   severity, or null for ordinary hit point damage
 * @returns {Promise<boolean>} whether a casting was actually interrupted
 */
export async function interruptPendingCast(actor, { criticalSeverity = null, sourceUuid = null, sourceName = null, context = null } = {}) {
  const record = pendingCastOf(actor);
  if (!record) return false;
  /*
   * A BLOW STRUCK ON ANOTHER CLIENT (3.685.3). The damage is applied by
   * whoever rolled it — the GM, for an NPC — and the casting is held in the
   * caster's browser, so `waiting` was empty here and the cast was never
   * interrupted. Relayed to the holder, with the blow's source as this
   * client noted it (the note is in memory, so it would not be there).
   * The interruption itself is `interruptHere`, unchanged.
   */
  if (!waiting.has(actor.id)) {
    const { lastDamageSourceOf } = await import("./pending-cast-steps.mjs");
    const noted = lastDamageSourceOf(actor);
    const asked = await askHolder(actor, record, "interrupt", {
      criticalSeverity,
      sourceUuid: String(sourceUuid ?? noted.sourceUuid ?? ""),
      sourceName: String(sourceName ?? noted.sourceName ?? ""),
      context: plain(context ?? noted.context ?? null)
    }, { notice: `${record.spellName} is interrupted` });
    return asked.relayed ? Boolean(asked.result) : false;
  }
  return interruptHere(actor, { criticalSeverity, sourceUuid, sourceName, context });
}

/** The interruption, on the client that holds the casting. */
async function interruptHere(actor, { criticalSeverity = null, sourceUuid = null, sourceName = null, context = null } = {}) {
  const record = pendingCastOf(actor);
  if (!record || !waiting.has(actor.id)) return false;

  /*
   * A MODULE'S STEP FIRST (3.684.0; Eldritch Arts Block 6, G26): Magical
   * Retribution's attack of opportunity, "resolved before any potential spell
   * fumbles are rolled" (Q149). Awaited while the window is still open, with
   * the blow's source where the damage path noted it (or the caller said).
   * No step registered: nothing is asked, and the window settles as before.
   */
  // ONE INTERRUPTION AT A TIME: a second blow while the steps are asked
  // finds the window already being settled.
  if (interrupting.has(actor.id)) return false;
  interrupting.add(actor.id);
  let stepLines = [];
  try {
    const { lastDamageSourceOf, pendingCastStepsBefore } = await import("./pending-cast-steps.mjs");
    const noted = lastDamageSourceOf(actor);
    stepLines = await pendingCastStepsBefore({
      actor, spellName: record.spellName ?? "", dc: Number(record.dc ?? 0), criticalSeverity,
      sourceUuid: String(sourceUuid ?? noted.sourceUuid ?? ""), sourceName: String(sourceName ?? noted.sourceName ?? ""),
      context: context ?? noted.context ?? null
    });
  } finally {
    interrupting.delete(actor.id);
  }
  if (!waiting.has(actor.id)) return false;

  const degree = interruptedDegree(criticalSeverity);
  const settled = await settle(actor, "interrupted", { criticalSeverity });
  if (!settled) return false;

  /*
   * SPELL CONCENTRATION, WITH THE DC ALREADY IN IT (Graham's ruling).
   * The reaction has existed since the fatigue work and asked the player
   * to type the original Casting DC — a number they would have had to go
   * and find on a card that had already scrolled away. It is the same
   * dialog; it simply arrives knowing what it is for.
   */
  const buttons =
    `<p style="margin:6px 0 2px">`
    + `<button type="button" data-action="pendingCastConcentration" data-handle='${JSON.stringify(record.handle ?? actorHandle(actor))}' `
    + `data-dc="${record.dc}" data-severity="${criticalSeverity ?? ""}" `
    + `class="gold-button small-button">Spell Concentration (DC ${record.dc}`
    + `${criticalSeverity ? `, stepped up for a ${criticalSeverity} injury` : ""})</button></p>`;

  await postCard(actor, `${record.spellName} — Interrupted`, [
    ...stepLines.map((text) => line(text)),
    line(interruptedLine(record.spellName, criticalSeverity)),
    line(`<em>A free reaction may still save it — Spell Concentration against the `
      + `casting DC of <strong>${record.dc}</strong>.</em>`)
  ], buttons);
  return degree === "fumble" || degree === "failure";
}

/* ------------------------------------------------------------------ */
/* THE RELAY TO THE CLIENT THAT HOLDS A CASTING (3.685.3)               */
/* ------------------------------------------------------------------ */

/*
 * THE SAME ASK AND ANSWER AS reaction-ask-workflow.mjs: the system's
 * socket, a request id, the user it is for, a wait, and a user who leaves
 * answering at once. The holder runs the same `…Here` function the caster's
 * own client always ran, so the rules for paying and interrupting do not
 * change; only which client asks.
 *
 * AND THE SAME TWO WAITS (3.685.3, the second review). The holder
 * acknowledges at once (`pendingCast.accepted`); the asker waits
 * `RELAY_ACCEPT_MS` for that, which only a client that is not there fails
 * to send, and then up to `RELAY_WORK_MS` — the reaction ask's five minutes
 * — while the holder works, because an interruption can run a module's step
 * (Magical Retribution's dialog and roll) that takes as long as its player
 * does. The asker's screen says who it is waiting for.
 *
 * WHO MAY ASK, AND WHO MAY ANSWER (3.685.3, the second review). The holder
 * acts only for the users `mayAskFor` allows — anybody for an interruption,
 * a GM for a payment, a GM or an owner for Stop and Complete — so a player
 * cannot stop or complete somebody else's casting; and the asker takes an
 * acknowledgement or an answer only from the holder it asked.
 */
const RELAY_SOCKET = `system.${SYSTEM_ID}`;
const RELAY_ASK = "pendingCast.ask";
const RELAY_ACCEPTED = "pendingCast.accepted";
const RELAY_ANSWER = "pendingCast.answer";
/**
 * THE ASKER HAS STOPPED WAITING (3.686.2, the review's LOW 3). Sent when an
 * ask's window lapses, so a holder that hears the ask only now does not
 * act on it as well: the asker has already run its own fallback (or told
 * Phase 1 "nothing"), and a second Stop card, or AP paid with no line on
 * the GM's card, would follow.
 */
const RELAY_CANCEL = "pendingCast.cancel";
/**
 * ...AND THE HOLDER ACTS ONLY ON THE ASKER'S GO (3.686.2). A cancel can
 * arrive after the holder has started; so the holder acknowledges, then
 * waits for the asker to confirm it is still waiting. An asker that has
 * lapsed never confirms, and the holder does nothing.
 */
const RELAY_GO = "pendingCast.go";
const cancelledAsks = new Map();
const goWaiters = new Map();
function cancelAsk(requestId, holder) {
  game.socket?.emit?.(RELAY_SOCKET, { action: RELAY_CANCEL, requestId, holderId: holder, userId: game.user?.id ?? null });
}
/** How long the asker waits for the holder to acknowledge. */
const RELAY_ACCEPT_MS = 10000;
/** How long an acknowledged ask may take: the reaction ask's step wait. */
const RELAY_WORK_MS = 300000;
/**
 * After a "ghost" answer — a tab of the holder's account that does not hold
 * the casting — how long another tab of that account has to accept it
 * before the asker takes it that nobody does (3.686.2).
 */
const RELAY_GHOST_MS = 750;
const relayWaiting = new Map();
let relayRegistered = false;

// A user may have several browsers; only a live resolver proves ownership.
const holderProbes = new Map();
async function hasLiveHolder(actor, record) {
  if (waiting.has(actor.id)) return true;
  if (!game.socket) return false;
  const requestId = newId();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { holderProbes.delete(requestId); resolve(false); }, 1500);
    holderProbes.set(requestId, { actorUuid: actor.uuid, userId: record.userId, castId: record.castId, resolve, timer });
    game.socket.emit(RELAY_SOCKET, { action: "pendingCast.probe", requestId, actorUuid: actor.uuid, holderId: record.userId, castId: record.castId });
  });
}

/** Anything that crosses the socket must be plain data. */
function plain(value) {
  if (value === null || value === undefined) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

/** The user whose client holds this casting, or null. */
function holderOf(actor, record) {
  const users = Array.from(globalThis.game?.users ?? []).map((u) => ({
    id: u.id, active: Boolean(u.active), isGM: Boolean(u.isGM),
    owner: Boolean(actor?.testUserPermission?.(u, "OWNER"))
  }));
  return pendingCastHolder({ startedBy: record?.userId ?? null, users });
}

/** May this user have the holder act on this caster? A GM, or an owner. */
function mayAsk(user, actor) {
  return Boolean(user && (user.isGM || actor?.testUserPermission?.(user, "OWNER")));
}

/**
 * Who may ask the holder for which operation (3.685.3, Graham's ruling on
 * the second review). An interruption is what damage does under the rules,
 * not a control: whoever struck the blow — a player's critical on another
 * player's caster included — interrupts it at the blow's degree, so any
 * connected user may ask. Phase 1 is the GM's turn machinery, so only a GM
 * asks for a payment. Stop and Complete are the caster's choices: a GM, or
 * an owner.
 */
function mayAskFor(op, user, actor) {
  if (!user?.active) return false;
  if (op === "interrupt") return true;
  if (op === "pay") return Boolean(user.isGM);
  return mayAsk(user, actor);
}

/**
 * Ask the holder's client to do `op`.
 *
 * @returns {Promise<{relayed: boolean, result?: any, reason?: string}>}
 *   `relayed: false` with `reason` "none" when there is no other client
 *   holding it, "timeout" when the holder did not acknowledge or finish in
 *   time, "left" when it disconnected, "refused" when it would not act for
 *   this user
 */
async function askHolder(actor, record, op, args = {}, { notice = "" } = {}) {
  const holder = holderOf(actor, record);
  if (!holder || !game.socket) return { relayed: false, reason: "none" };
  const requestId = newId();
  const reply = new Promise((resolve) => {
    const entry = { resolve, holder, timer: null, accepted: false };
    // THIS ACCOUNT HOLDS IT, BUT NOT THIS TAB (3.686.2): another tab of
    // ours that holds it answers within a round trip; with none, nobody
    // will, so a short wait means "nobody holds it", not a timeout.
    const self = holder === game.user?.id;
    entry.timer = setTimeout(() => {
      if (!relayWaiting.has(requestId)) return;
      relayWaiting.delete(requestId);
      cancelAsk(requestId, holder);
      resolve({ relayed: false, reason: self ? "none" : "timeout" });
    }, self ? RELAY_GHOST_MS * 2 : RELAY_ACCEPT_MS);
    relayWaiting.set(requestId, entry);
  });
  const holderName = game.users?.get?.(holder)?.name ?? "the caster's player";
  if (notice) ui.notifications?.info?.(`Waiting for ${holderName}: ${notice}…`);
  game.socket.emit(RELAY_SOCKET, {
    action: RELAY_ASK, requestId, userId: game.user.id, holderId: holder, op, actorUuid: actor.uuid, args: plain(args) ?? {}
  });
  const out = await reply;
  if (out.reason === "timeout" || out.reason === "left") {
    ui.notifications?.warn?.(`${holderName} ${out.reason === "left" ? "left the game" : "did not answer"} — ${record?.spellName ?? "the casting"} was not reached.`);
  } else if (out.reason === "refused") {
    ui.notifications?.warn?.(`Only ${actor?.name ?? "the caster"}'s owner or the GM can do that.`);
  }
  return out;
}

/** What the holder can be asked, each the function its own client already ran. */
const RELAYED = Object.freeze({
  pay: (actor, args) => payHere(actor, args ?? {}),
  interrupt: (actor, args) => interruptHere(actor, args ?? {}),
  stop: (actor, args) => stopHere(actor, args ?? {}),
  // A RELAYED COMPLETE IS THE BUTTON'S, and the button is offered only once
  // the time is paid (`pendingCastReady`, Graham's 25 September ruling), so
  // the holder asks that before it completes anything.
  complete: async (actor) => {
    const record = pendingCastOf(actor);
    // THE FLAG HAS ALREADY GONE (3.686.2): another client cleared it after
    // its ask lapsed. The window is over, so the promise this client holds
    // is settled too, rather than waiting for the actor's next casting.
    if (!record) { await settle(actor, "stopped"); return false; }
    if (!pendingCastReady(record)) return false;
    return settle(actor, "complete");
  }
});

/** The listener on every client: the holder answers, the asker hears. */
export function registerPendingCastRelay() {
  if (relayRegistered || !game.socket) return;
  relayRegistered = true;
  globalThis.Hooks?.on?.("userConnected", (user, connected) => {
    if (connected) return;
    for (const [requestId, entry] of Array.from(relayWaiting)) {
      if (entry.holder !== user?.id) continue;
      clearTimeout(entry.timer);
      relayWaiting.delete(requestId);
      entry.resolve({ relayed: false, reason: "left" });
    }
  });
  game.socket?.on(RELAY_SOCKET, async (data) => {
    if (data?.action === "pendingCast.held") {
      const probe = holderProbes.get(data.requestId);
      if (!probe || data.actorUuid !== probe.actorUuid || data.holderId !== probe.userId || data.castId !== probe.castId) return;
      clearTimeout(probe.timer); holderProbes.delete(data.requestId); probe.resolve(true);
      return;
    }
    if (data?.action === "pendingCast.probe") {
      if (data.holderId && data.holderId !== game.user?.id) return;
      const actor = await (foundry.utils?.fromUuid ?? globalThis.fromUuid)(data.actorUuid);
      if (actor && waiting.has(actor.id) && pendingCastOf(actor)?.castId === data.castId) {
        game.socket.emit(RELAY_SOCKET, { ...data, action: "pendingCast.held" });
      }
      return;
    }
    if (data?.action === RELAY_ACCEPTED || data?.action === RELAY_ANSWER) {
      if (data.userId !== game.user?.id) return;
      const entry = relayWaiting.get(data.requestId);
      // ONLY FROM THE HOLDER ASKED.
      if (!entry || data.answererId !== entry.holder) return;
      // A GHOST (3.686.2): that tab does not hold it. Another of the same
      // account may; give it a moment, then fall back to "nobody holds it",
      // so the asker's local fallback runs instead of waiting out 10 s.
      if (data.ghost) {
        if (entry.accepted || entry.ghosted) return;
        entry.ghosted = true;
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          if (!relayWaiting.has(data.requestId)) return;
          relayWaiting.delete(data.requestId);
          cancelAsk(data.requestId, entry.holder);
          entry.resolve({ relayed: false, reason: "none" });
        }, RELAY_GHOST_MS);
        return;
      }
      clearTimeout(entry.timer);
      if (data.action === RELAY_ACCEPTED) {
        entry.accepted = true;
        game.socket.emit(RELAY_SOCKET, { action: RELAY_GO, requestId: data.requestId, holderId: entry.holder, userId: game.user?.id ?? null });
        entry.timer = setTimeout(() => {
          if (!relayWaiting.has(data.requestId)) return;
          relayWaiting.delete(data.requestId);
          cancelAsk(data.requestId, entry.holder);
          entry.resolve({ relayed: false, reason: "timeout" });
        }, RELAY_WORK_MS);
        return;
      }
      relayWaiting.delete(data.requestId);
      entry.resolve(data.refused
        ? { relayed: false, reason: "refused" }
        : { relayed: true, result: data.result ?? null });
      return;
    }
    if (data?.action === RELAY_CANCEL) {
      if (data.holderId !== game.user?.id || !data.requestId) return;
      const now = Date.now();
      for (const [id, at] of cancelledAsks) if (now - at > RELAY_WORK_MS) cancelledAsks.delete(id);
      cancelledAsks.set(data.requestId, now);
      goWaiters.get(data.requestId)?.(false);
      return;
    }
    if (data?.action === RELAY_GO) {
      if (data.holderId !== game.user?.id || !data.requestId) return;
      goWaiters.get(data.requestId)?.(true);
      return;
    }
    if (data?.action !== RELAY_ASK || data.holderId !== game.user?.id) return;
    const reply = (extra) => game.socket.emit(RELAY_SOCKET, {
      requestId: data.requestId, userId: data.userId, answererId: game.user.id, ...extra
    });
    // Same-account observers must not acknowledge a request they cannot
    // settle (3.686.1) — but they do say so at once (3.686.2), as a ghost
    // answer the asker reads as "nobody holds it" unless the holding tab
    // accepts in the meantime.
    const heldActor = await (foundry.utils?.fromUuid ?? globalThis.fromUuid)(data.actorUuid);
    if (!heldActor || !waiting.has(heldActor.id)) {
      reply({ action: RELAY_ANSWER, ghost: true, result: null, refused: false });
      return;
    }
    // AN ASK ITS ASKER HAS GIVEN UP ON is not acted on (3.686.2).
    if (cancelledAsks.has(data.requestId)) return;
    const go = new Promise((resolve) => {
      const timer = setTimeout(() => { goWaiters.delete(data.requestId); resolve(false); }, RELAY_ACCEPT_MS);
      goWaiters.set(data.requestId, (yes) => { clearTimeout(timer); goWaiters.delete(data.requestId); resolve(yes); });
    });
    reply({ action: RELAY_ACCEPTED });
    // NO GO: nothing is done. Said at once (3.686.2, the third review): an
    // asker still waiting (its go was lost) settles now rather than after
    // RELAY_WORK_MS; one that has lapsed ignores the answer.
    if (!(await go)) { reply({ action: RELAY_ANSWER, result: null, refused: false }); return; }
    let result = null;
    let refused = false;
    try {
      const run = RELAYED[data.op];
      const actor = run ? await (foundry.utils?.fromUuid ?? globalThis.fromUuid)(data.actorUuid) : null;
      if (actor && !mayAskFor(data.op, game.users?.get?.(data.userId), actor)) refused = true;
      else if (actor && !cancelledAsks.has(data.requestId)) result = plain(await run(actor, data.args ?? {})); // nor once cancelled (3.686.2)
    } catch (error) {
      console.error("TRG Prime | pending cast relay", error);
    }
    reply({ action: RELAY_ANSWER, result, refused });
  });
}

/**
 * Watch for the two things that end a window the caster did not end.
 */
export function registerPendingCastHooks() {
  /*
   * HIT POINTS, NOT THE DAMAGE PIPELINE. Every route that hurts a
   * creature in this system ends at the actor's hit points — a weapon, a
   * spell, a poison's stage, a bleed on the world clock, a fall. Hooking
   * the update catches all of them at once and leaves the pipeline
   * untouched; hooking the pipeline would have meant finding every
   * entrance and being wrong about one.
   */
  /*
   * A WINDOW WHOSE FLAG ANOTHER CLIENT CLEARED IS OVER (3.686.2, the
   * review's LOW 3). When an ask lapses, the asker clears the flag itself
   * (Stop, Complete with nobody holding it); if this client did hold the
   * casting after all, its promise would otherwise wait for the actor's
   * next casting. Only an update that REMOVES the flag counts — the AP a
   * casting spends before its flag is first written must not end it.
   */
  Hooks.on("updateActor", (actor, changed) => {
    if (!waiting.has(actor?.id)) return;
    const scope = changed?.flags?.[SYSTEM_ID];
    // `-=key` or the key itself (V14 may carry a deletion operator there): the flag was touched...
    if (!scope || !(Object.hasOwn(scope, `-=${PENDING_CAST_FLAG}`) || Object.hasOwn(scope, PENDING_CAST_FLAG))) return;
    // ...and is now gone.
    if (pendingCastOf(actor)) return;
    // ...and it was THIS casting's flag: one held but not yet written is
    // still being set up, and the removal was the previous casting's.
    const state = castState.get(actor.id);
    if (state && state.resolve === waiting.get(actor.id) && !state.flagWritten) return;
    const resolve = waiting.get(actor.id); waiting.delete(actor.id);
    resolve?.({ outcome: "stopped" });
  });

  Hooks.on("preUpdateActor", (actor, changed) => {
    // A CASTING HELD ON ANOTHER CLIENT IS WATCHED TOO (3.685.3): this runs
    // only on the client making the update, and `interruptPendingCast`
    // relays it to the holder.
    if (!waiting.has(actor.id) && !pendingCastOf(actor)) return;
    /*
     * `system.resources.hp.value`, MEASURED (3.584.1; F1 of the 3.584.0
     * live drive).
     *
     * The first draft watched `system.hp.value`, which exists on a
     * character and is a vestigial `{ value: null }` that NOTHING writes
     * — every creature's hit points live under `resources`, which is
     * where `dying-workflow`, the rest and the attack workflow all put
     * them. So the whole automatic half of this feature was dead, and no
     * check could have said so: the rule was tested as a pure function
     * and the hook was tested for its shape. Only driving it found it.
     *
     * Tenth time in this project that a name was believed instead of
     * measured, which is why the drive comes before the release.
     */
    const after = changed?.system?.resources?.hp?.value;
    if (after === undefined) return;
    // ASKED OF THE RULE. The first draft compared the two numbers here
    // instead, which is the third time in two releases the ratchet has
    // caught me writing a rule and then repeating it at its call site.
    if (!hitPointsLost(actor.system?.resources?.hp?.value, after)) return;
    // Resolved on the next tick so the hit points land first: the card
    // this posts should describe a caster who has already been hurt.
    globalThis.setTimeout(() => { interruptPendingCast(actor, { criticalSeverity: null }); }, 0);
  });

  /*
   * A CASTING DOES NOT SURVIVE A RELOAD, and must not pretend to. The
   * promise holding it lived in the browser that started it, so a flag
   * found at startup belongs to a cast nobody is waiting on — IF this is
   * that browser, or that browser is gone. Nothing was spent, so saying so
   * is the whole cleanup.
   *
   * NOT EVERY FLAG ON EVERY GM'S LOAD (3.685.3). This asked
   * `game.user.isGM` and then lapsed every flag it found: two GMs loading
   * together each posted "— Lapsed", and a GM reloading mid-session lapsed
   * a casting a player was still making in their own open browser. Each
   * flag is now asked of `pendingCastLapsesAtStartup`: this client's own
   * castings, on any client; somebody else's only on the acting GM, and
   * only once their user is no longer connected.
   */
  Hooks.once("ready", async () => {
    // The main ready workflow registers relays later, after asynchronous
    // startup work. Listen before probing so a fast answer cannot be lost.
    registerPendingCastRelay();
    // ONCE, SO NEVER SKIPPED (3.686.2): the election settles first.
    if (!gmConnectionSettled()) await gmConnectionReady();
    const thisUser = game.user?.id ?? null;
    const actingGM = isActingGM();
    for (const actor of game.actors ?? []) {
      const record = pendingCastOf(actor);
      if (!record) continue;
      const startedBy = record.userId ?? null;
      const lapses = pendingCastLapsesAtStartup({
        startedBy, thisUser, actingGM,
        starterConnected: Boolean(game.users?.get?.(startedBy)?.active),
        ownerConnected: Array.from(game.users ?? []).some((u) => u?.active && !u.isGM
          && actor.testUserPermission?.(u, "OWNER"))
      });
      if (!lapses || await hasLiveHolder(actor, record)) continue;
      // Do not clear a replacement cast created while the probe was in flight.
      if (JSON.stringify(pendingCastOf(actor)) !== JSON.stringify(record)) continue;
      await actor.unsetFlag(SYSTEM_ID, PENDING_CAST_FLAG).catch(() => {});
      await postCard(actor, `${record.spellName} — Lapsed`, [
        line(lapsedLine(record.spellName, { reloaded: !startedBy || startedBy === thisUser }))
      ]);
    }
  });
}

/**
 * May this client press Complete or Stop on this caster's card? (3.685.3,
 * the second review). A GM, or an owner. The card is in everybody's log,
 * and with the relay a click on somebody else's casting would now reach it.
 */
function mayAct(actor) {
  if (mayAsk(game.user, actor)) return true;
  ui.notifications?.warn?.(`Only ${actor?.name ?? "the caster"}'s owner or the GM can do that.`);
  return false;
}

/** Card buttons. Registered beside the other check-card listeners. */
export function registerPendingCastCardListeners() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const casterOf = async (button) => {
      try {
        return await resolveActorHandle(JSON.parse(button.dataset.handle || "{}"));
      } catch {
        return null;
      }
    };
    for (const button of html.querySelectorAll?.('[data-action="completePendingCast"]') ?? []) {
      button.addEventListener("click", async () => {
        const actor = await casterOf(button);
        if (actor && mayAct(actor)) await completePendingCast(actor);
      });
    }
    for (const button of html.querySelectorAll?.('[data-action="stopPendingCast"]') ?? []) {
      button.addEventListener("click", async () => {
        const actor = await casterOf(button);
        if (actor && mayAct(actor)) await stopPendingCast(actor);
      });
    }
    for (const button of html.querySelectorAll?.('[data-action="pendingCastConcentration"]') ?? []) {
      button.addEventListener("click", async () => {
        const actor = await casterOf(button);
        if (!actor) return;
        const { rollSpellConcentration } = await import("./cast-workflow.mjs");
        await rollSpellConcentration(actor, {
          dc: Number(button.dataset.dc) || 0,
          criticalSeverity: button.dataset.severity || ""
        });
      });
    }
  });
}
