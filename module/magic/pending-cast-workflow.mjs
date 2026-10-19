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
 * rather than leaving a button that resolves nothing. No PP was at
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
  pendingCastReady, stoppedLine
} from "./pending-cast.mjs";
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
    startedAt: Number(globalThis.game?.time?.worldTime ?? 0)
  };

  /*
   * THE TURN THEY DECLARE IT IS THE FIRST TURN THEY PAY FOR. Graham's
   * worked example is "turns 1 and 2, three AP each" for a six-AP
   * window, and the turn the caster stands up to do it is turn one —
   * so whatever AP is still in their pool goes in now, before any
   * turn-start driver ever runs.
   */
  const firstPayment = await payTowards(actor, record);
  await actor.setFlag(SYSTEM_ID, PENDING_CAST_FLAG, record);

  await postCard(actor, `${record.spellName} — Casting`, [
    line(armedLine(record.spellName, record, bonus)),
    ...(record.apOwed > 0 ? [line(castingProgressLine(record.spellName, record, firstPayment))] : []),
    line(`<em>Casting DC ${dc}. Damage taken before it completes makes the check `
      + "automatically a failure — a critical injury, a fumble (page 238).</em>")
  ], pendingCastButtons(record));

  return new Promise((resolve) => {
    waiting.set(actor.id, resolve);
  });
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
  if (payment > 0) {
    await spendActionPoints(actor, payment, `${record.spellName} — extra casting time`);
    record.apPaid = Math.max(0, Math.trunc(Number(record.apPaid) || 0)) + payment;
  }
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

  const paid = await payTowards(actor, record);
  await actor.setFlag(SYSTEM_ID, PENDING_CAST_FLAG, record);
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
  const settled = await settle(actor, "stopped");
  if (settled && !silent && record) {
    await postCard(actor, `${record.spellName} — Stopped`, [line(stoppedLine(record.spellName))]);
  }
  return settled;
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
export async function interruptPendingCast(actor, { criticalSeverity = null } = {}) {
  const record = pendingCastOf(actor);
  if (!record || !waiting.has(actor.id)) return false;

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
    line(interruptedLine(record.spellName, criticalSeverity)),
    line(`<em>A free reaction may still save it — Spell Concentration against the `
      + `casting DC of <strong>${record.dc}</strong>.</em>`)
  ], buttons);
  return degree === "fumble" || degree === "failure";
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
  Hooks.on("preUpdateActor", (actor, changed) => {
    if (!waiting.has(actor.id)) return;
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
   * found at startup belongs to a cast nobody is waiting on. Nothing was
   * spent, so saying so is the whole cleanup.
   */
  Hooks.once("ready", async () => {
    if (!game.user?.isGM) return;
    for (const actor of game.actors ?? []) {
      const record = pendingCastOf(actor);
      if (!record) continue;
      await actor.unsetFlag(SYSTEM_ID, PENDING_CAST_FLAG).catch(() => {});
      await postCard(actor, `${record.spellName} — Lapsed`, [
        line(`<strong>${record.spellName}</strong> was still being cast when the world reloaded, `
          + "so the casting lapsed. <em>No PP was spent</em> — page 237.")
      ]);
    }
  });
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
        if (actor) await completePendingCast(actor);
      });
    }
    for (const button of html.querySelectorAll?.('[data-action="stopPendingCast"]') ?? []) {
      button.addEventListener("click", async () => {
        const actor = await casterOf(button);
        if (actor) await stopPendingCast(actor);
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
