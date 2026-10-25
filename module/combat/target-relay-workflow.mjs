/**
 * The Foundry side of target-relay.mjs: sending, waiting for the GM's
 * answer, and installing the listener.
 *
 * WHY IT WAITS FOR AN ANSWER. The damage card prints "Now 12 / 30 HP",
 * and that number is only known after the write. A fire-and-forget relay
 * would apply the damage correctly and leave the player's own card unable
 * to say what happened — so the request carries an id and the GM's reply
 * resolves the promise the caller is awaiting.
 *
 * WHAT HAPPENS IF NO GM ANSWERS. The wait times out and the caller is
 * told so, rather than hanging the workflow. The damage card still posts,
 * saying the application could not be relayed — visible failure beats a
 * silent one, which is the whole lesson of the defect this fixes.
 */
import {
  RELAY_ACTIONS,
  RELAY_SOCKET,
  RELAY_TIMEOUT_MS,
  buildRelayRequest,
  handleRelayMessage,
  needsRelay
} from "./target-relay.mjs";

/** Requests this client is waiting on, by id. */
const pending = new Map();

let counter = 0;
function nextRequestId() {
  counter += 1;
  return `${game.user.id}-${counter}-${foundry.utils.randomID(6)}`;
}

/**
 * Ask the GM's client to do something to a target, and wait for the
 * answer.
 *
 * @returns {Promise<{ok:boolean, result?:*, reason?:string}>}
 */
function ask(action, target, payload) {
  const requestId = nextRequestId();
  const request = buildRelayRequest({
    action,
    uuid: target.uuid,
    userId: game.user.id,
    requestId,
    payload
  });

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({ ok: false, reason: "no GM answered — is one connected?" });
    }, RELAY_TIMEOUT_MS);

    pending.set(requestId, (reply) => {
      clearTimeout(timer);
      pending.delete(requestId);
      resolve(reply);
    });

    game.socket.emit(RELAY_SOCKET, request);
  });
}

/** The four operations, each doing it directly when this client may. */

export async function relayDamage(target, amount, options, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.DAMAGE, target, {
    amount,
    isCritical: Boolean(options?.isCritical),
    nonlethal: Boolean(options?.nonlethal),
    // What a death guard asks of the blow (3.627.0): plain data, so it crosses the socket.
    damageTypes: Array.isArray(options?.damageTypes) ? options.damageTypes.map(String) : [],
    sourceLevel: options?.sourceLevel ?? null,
    sourceName: String(options?.sourceName ?? "")
  });
  if (reply.ok) return reply.result;

  // A FAILED RELAY IS ANNOUNCED, NOT RETURNED AND FORGOTTEN. Fourteen
  // call sites read this result and print "Now X / Y HP" from it; asking
  // every one of them to remember a failure case is exactly the kind of
  // discipline that decays. So the failure posts its own card here, once,
  // and every caller gets it for free.
  await announceRelayFailure(target, `${amount} damage`, reply.reason);

  // newHP is the target's UNCHANGED value, not null: the damage did not
  // land, so its HP really is what it was. A null here printed
  // "Now null / 30 HP" on the card, which reads as a second bug.
  return {
    case: "relay-failed",
    newHP: Number(target?.system?.resources?.hp?.value ?? 0),
    relayError: reply.reason
  };
}

/** Say plainly, in chat, that something was rolled and never applied. */
async function announceRelayFailure(target, amount, reason, heading = "Damage not applied") {
  try {
    const what = amount == null
      ? `Something meant for <strong>${target?.name ?? "the target"}</strong>`
      : `<strong>${amount}</strong> to <strong>${target?.name ?? "the target"}</strong>`;
    await ChatMessage.create({
      content:
        `<div class="trg-card"><h3>${heading}</h3>` +
        `<p>${what} could not be applied: ${reason}.</p>` +
        `<p><em>The GM needs to apply it by hand.</em></p></div>`,
      whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id).concat(game.user.id)
    });
  } catch (error) {
    console.error("TRG Prime | could not announce relay failure", error);
  }
}

export async function relayConditionTags(target, tags, options, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  // EVERY OPTION TRAVELS (3.646.0): a spell's condition carries its clock,
  // its cast id and its traits, and the GM's client must lay it the same way.
  const carried = {};
  for (const key of ["duration", "spellEffect", "spellEffectEnd", "castId", "sourceTraits"]) {
    if (options?.[key] !== undefined && options?.[key] !== null) carried[key] = options[key];
  }
  const reply = await ask(RELAY_ACTIONS.CONDITIONS, target, {
    tags,
    expiresRound: options?.expiresRound ?? null,
    options: carried
  });
  return reply.ok ? reply.result : [];
}

export async function relayStatus(target, status, options, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.STATUS, target, { status, options });
  return reply.ok;
}

export async function relayHpZero(target, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.HP_ZERO, target, {});
  return reply.ok;
}

/**
 * Put ActiveEffects on a target, relaying when this client may not.
 *
 * THE SECOND PERMISSION BOUNDARY, found live on 19 August 2026. A player
 * cast Bless, the check card posted, the PP was spent — and nothing
 * else. No Result card, no template, no bonus. The error underneath was
 * `User PC Tester lacks permission to create ActiveEffect in parent
 * Actor`, and it unwound the cast before the Result card could post.
 *
 * It failed even when the caster targeted THEMSELVES, because Bless is
 * an emanation: it catches every ally in the area, and one of them was
 * a character the caster does not own. That is why "just target
 * yourself" was never a workaround.
 */
/**
 * Heal a creature, through the GM when it is not ours to touch.
 *
 * NEW at 3.474.0, after a live session hit "user lacks permission" on a
 * player casting Cure on another player's character.
 */
export async function relayHeal(target, amount, options, applyDirect) {
  if (!needsRelay(target)) return applyDirect ? applyDirect() : 0;
  const reply = await ask(RELAY_ACTIONS.HEAL, target, {
    amount, magical: options?.magical !== false, noDyingFatigue: options?.noDyingFatigue === true,
    // Resurgent Healing (3.625.0): half the heal to a Dying creature, across the relay.
    dyingHalf: options?.dyingHalf === true
  });
  return reply?.ok ? Number(reply.healed) || 0 : 0;
}

export async function createEffectsOn(target, effects, applyDirect) {
  const data = Array.isArray(effects) ? effects : [effects];
  if (!data.length) return [];
  if (!needsRelay(target)) {
    return applyDirect ? applyDirect() : target.createEmbeddedDocuments("ActiveEffect", data);
  }
  const reply = await ask(RELAY_ACTIONS.EFFECTS, target, { effects: data });
  if (reply.ok) return reply.result ?? [];
  await announceRelayFailure(
    target,
    null,
    reply.reason,
    `${data.length === 1 ? "An effect" : `${data.length} effects`} could not be applied`
  );
  return [];
}

/**
 * THE DEFENDER'S ONE-ATTACK EFFECTS THAT THIS ATTACK SPENT (3.666.0) — see
 * one-attack.mjs. Called by every attack against a creature once the attack
 * has resolved; relayed to the GM when this client does not own the
 * defender. Returns the ids removed. A failure to relay is announced, not
 * swallowed: the bonus would otherwise linger for a second attack.
 */
export async function consumeOneAttackEffects(target, event, { direct = false } = {}) {
  if (!target) return [];
  const { oneAttackEffectIds } = await import("./one-attack.mjs");
  const ids = oneAttackEffectIds(target.effects, event);
  if (!ids.length) return [];
  if (direct || !needsRelay(target)) {
    await target.deleteEmbeddedDocuments("ActiveEffect", ids);
    return ids;
  }
  const reply = await ask(RELAY_ACTIONS.ONE_ATTACK, target, { event });
  if (reply.ok) return reply.result ?? [];
  await announceRelayFailure(target, null, reply.reason, "A defence that lasts one attack could not be removed");
  return [];
}

/** Treat Wounds and the other Medicine card buttons. */
/**
 * Set (or clear) an attached light on a token the asker may not own.
 *
 * ADDED AT 3.396.1 after the live pass found the gap. `createEffectsOn`
 * already relayed the RULES half of a cast to an unowned target; the
 * glow had no such route, so a player lighting an ally's lantern got the
 * effect and no light. Same shape as every other operation here: do it
 * directly when this client may, ask the GM when it may not.
 */
export async function relayTokenLight(target, source, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.TOKEN_LIGHT, target,
    source === null ? { clear: true } : { source: String(source) });
  if (!reply.ok) throw new Error(reply.reason ?? "the GM's client refused the light");
  return reply.result;
}

export async function relayMedicine(target, raw, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.MEDICINE, target, {
    kind: raw?.kind ?? "heal",
    conditionKey: raw?.conditionKey ?? "",
    amount: raw?.amount ?? 0
  });
  if (reply.ok) return true;
  // NAMED FOR WHAT IT WAS (3.549.0). This channel carries Resuscitation's
  // failed stabilisation as well as the healing it was built for, and
  // announcing a botched revival as "Healing not applied" would describe
  // it as the opposite of what it is.
  const label = raw?.kind === "increaseCondition"
    ? "Condition not applied"
    : "Healing not applied";
  await announceRelayFailure(target, raw?.amount ?? null, reply.reason, label);
  return false;
}

/**
 * Write a spell-lent rune onto one of the target's items, asking the GM
 * when this client may not.
 *
 * RETURNS WHETHER IT LANDED, and the caller must say so on the card when
 * it did not. The defect this closes (3.525.0) was silent: a player
 * casting Magic Weapon on an ally's sword spent the PP, threw a
 * permission error into the console, and got no result card at all.
 *
 * @param {Actor} target the item's owner
 * @param {string} itemId the item being imbued
 * @param {object} update the fields to write
 * @param {Function} applyDirect what to do when this client owns it
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
/**
 * End a cast on a target this client may not write to.
 *
 * THE MIRROR OF `createEffectsOn`, which has been relayed since this file
 * existed. Its removal never was, so a player could buff an ally and not
 * take it back — found live at 3.526.0 and fixed at 3.527.0.
 *
 * @param {Actor} target the creature the spell landed on
 * @param {string} castId the cast being ended
 * @param {boolean} dismissed whether a person chose to end it
 * @returns {Promise<{ok: boolean, result?: number, reason?: string}>}
 */
export async function relayEndCast(target, castId, dismissed) {
  return ask(RELAY_ACTIONS.END_CAST, target, { castId, dismissed });
}

/**
 * A disabling attempt against a peril this client may not write to
 * (3.620.0, R17). Returns what the GM's client made of it.
 */
/**
 * An affliction reaches a creature this client may not own (3.627.0): the
 * once-a-day mark and the exposure, together, on the GM's client.
 */
export async function relayAffliction(target, data, { exposureKey = "", now = 0 } = {}, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.AFFLICTION, target, { data, exposureKey, now });
  if (reply.ok) return reply.result;
  await announceRelayFailure(target, null, reply.reason, `${data?.name ?? "Affliction"} not applied`);
  return null;
}

/**
 * A critical injury's record on a creature this client may not own
 * (3.627.1) — see RELAY_ACTIONS.INJURY_RECORD. A failure is said on a card
 * and never thrown: the strike's damage and its card must still land.
 *
 * @param {Actor} target
 * @param {"persistence"|"fatal"|"location"|"air"} kind
 * @param {object} entry the record's fields
 * @param {Function} applyDirect what to do when this client owns it
 */
export async function relayInjuryRecord(target, kind, entry, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.INJURY_RECORD, target, { kind, entry });
  if (reply.ok) return reply.result;
  await announceRelayFailure(target, null, reply.reason, "Injury record not written");
  return false;
}

export async function relayPerilAttempt(target, degree, applyDirect, how = {}) {
  if (!needsRelay(target)) return applyDirect();
  // A COUNTERACT, AND ITS SPELL'S DURATION (3.629.0): what the asker's
  // effect says, as a degree is. The GM's client still reads the peril's
  // own section for everything else.
  const reply = await ask(RELAY_ACTIONS.PERIL, target, {
    degree: String(degree ?? ""),
    mode: how?.mode === "counteract" ? "counteract" : "disable",
    force: how?.force === true,
    ...(how?.seconds !== undefined ? { seconds: how.seconds === null ? null : Number(how.seconds) || 0 } : {})
  });
  if (!reply.ok) throw new Error(reply.reason ?? "the GM's client refused the attempt");
  return reply.result;
}

export async function relaySpellRune(target, itemId, update, applyDirect) {
  if (!needsRelay(target)) {
    try {
      await applyDirect();
      return { ok: true };
    } catch (error) {
      // OWNERSHIP IS NOT THE ONLY WAY A WRITE FAILS, and a caller that
      // reports "applied" because no relay was needed would be lying.
      return { ok: false, reason: String(error?.message ?? error) };
    }
  }
  const reply = await ask(RELAY_ACTIONS.SPELL_RUNE, target, { itemId, update });
  return { ok: Boolean(reply.ok), reason: reply.reason };
}

/**
 * A creature dropped to a stated destination below zero, through the GM when
 * it is not ours (3.666.1). A failure is said on a card, never thrown, so the
 * spell's card still posts.
 */
export async function relayDyingAt(target, finalHP, options, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.DYING_AT, target, {
    finalHP: Math.trunc(Number(finalHP) || 0),
    isCritical: options?.isCritical === true
  });
  if (reply.ok) return reply.result;
  await announceRelayFailure(target, `a drop to ${finalHP} HP`, reply.reason, "Not applied");
  return { case: "relay-failed", newHP: Number(target?.system?.resources?.hp?.value ?? 0), relayError: reply.reason };
}

export async function relayItemHp(target, itemId, value, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.ITEM_HP, target, { itemId, value });
  return reply.ok;
}

/** What the GM's client uses to carry a request out. */
async function liveDeps() {
  const { applyDamageAndCheckDying } = await import("./dying-workflow.mjs");
  const { applyConditionTags } = await import("./effect-application-workflow.mjs");
  return {
    // foundry.utils.fromUuid in V13+, the bare global before it. This
    // system already documents the fallback in compendium-refresh.mjs
    // and feats-workflow.mjs; the relay shipped using the bare global
    // and, on a Foundry where it is gone, threw before it could write.
    fromUuid: (uuid) => (foundry.utils?.fromUuid ?? globalThis.fromUuid)(uuid),
    applyDamage: (target, amount, options) =>
      applyDamageAndCheckDying(target, amount, options),
    // `direct` STOPS THE RELAY RECURSING — the GM already owns the target.
    applyConditionTags: (target, tags, options) =>
      applyConditionTags(target, tags, { ...options, direct: true }),
    toggleStatus: (target, status, options) => target.toggleStatusEffect(status, options),
    setHpZero: (target) => target.update({ "system.resources.hp.value": 0 }),
    createEffects: (target, effects) => target.createEmbeddedDocuments("ActiveEffect", effects),
    // The GM owns the target, so `enterDyingAt` writes rather than asks again.
    enterDyingAt: async (target, finalHP, options) => {
      const { enterDyingAt } = await import("./dying-workflow.mjs");
      return enterDyingAt(target, finalHP, options);
    },
    // `direct` STOPS THE RELAY RECURSING — the GM already owns the target.
    consumeOneAttack: async (target, event) => consumeOneAttackEffects(target, event, { direct: true }),
    applyHealing: async (target, amount, options) => {
      const { healActor } = await import("../magic/spell-effects.mjs");
      // `direct` STOPS THE RELAY RECURSING. The GM already owns the
      // target, so healActor must do the work rather than ask again.
      return healActor(target, amount, { ...options, direct: true });
    },
    applyMedicine: async (target, raw) => {
      const { applyMedicineOutcome } = await import("../dice/check-card-interactions.mjs");
      return applyMedicineOutcome(target, raw);
    },
    setTokenLight: async (target, key) => {
      const { attachTokenLight } = await import("../light-attach-workflow.mjs");
      return attachTokenLight(target, key, { direct: true });
    },
    clearTokenLight: async (target) => {
      const { restoreTokenLight } = await import("../light-attach-workflow.mjs");
      return restoreTokenLight(target, { direct: true });
    },
    // `direct` STOPS THE RELAY RECURSING — see the END_CAST case.
    endCast: async (target, castId, dismissed) => {
      const { removeEffectsByCastId } = await import("./effect-application-workflow.mjs");
      return removeEffectsByCastId(target, castId, { dismissed, direct: true });
    },
    // AN AFFLICTION, ON THE GM'S CLIENT (3.627.0) — see target-relay.mjs.
    markExposure: async (target, key, now) => {
      const { EXPOSED_FLAG } = await import("./declared-after-strikes.mjs");
      await target.setFlag("trg-prime", EXPOSED_FLAG, { ...(target.getFlag("trg-prime", EXPOSED_FLAG) ?? {}), [key]: now });
    },
    exposeAffliction: async (target, data) => {
      const { exposeToAffliction } = await import("./affliction-workflow.mjs");
      return exposeToAffliction(target, data);
    },
    // A CRITICAL INJURY'S RECORD, ON THE GM'S CLIENT (3.627.1).
    recordInjury: async (target, kind, entry) => {
      if (kind === "persistence" || kind === "fatal") {
        const { recordPersistence, markFatalInjury } = await import("../injury-workflow.mjs");
        return kind === "persistence" ? recordPersistence(target, entry) : markFatalInjury(target, entry);
      }
      if (kind === "ppDrain") {
        // The GM's client reads its own pool, so the drain is never more than it holds.
        const pool = Number(target.system?.resources?.pp?.value ?? 0);
        const spent = Math.min(pool, Math.max(0, Math.floor(Number(entry.amount) || 0)));
        if (spent > 0) await target.update({ "system.resources.pp.value": pool - spent });
        return { pool, spent };
      }
      if (kind === "apWatch") {
        const { armApSpendWatch } = await import("./critical-ap-watch.mjs");
        await armApSpendWatch(target, entry);
        return true;
      }
      if (kind === "soulDestroyed") {
        // Built here from the two fields read, never from a record sent whole.
        const { SOUL_DESTROYED_FLAG, soulDestroyedRecord } = await import("../magic/resurrection.mjs");
        await target.setFlag("trg-prime", SOUL_DESTROYED_FLAG,
          soulDestroyedRecord(String(entry.spellName ?? ""), Number(entry.worldTime) || 0));
        return true;
      }
      if (kind === "air") {
        const { loseAirToEvent } = await import("../drowning-workflow.mjs");
        return loseAirToEvent(target, { criticallyHit: true });
      }
      const injured = Array.from(target.effects ?? []).find((e) => !e.disabled && e.statuses?.has?.("injured"));
      if (!injured) return false;
      await injured.setFlag("trg-prime", "injuryLocation", String(entry.location ?? ""));
      return true;
    },
    applyPerilAttempt: async (target, degree, how = {}) => {
      const { applyPerilAttempt } = await import("../peril-workflow.mjs");
      return applyPerilAttempt(target, degree, { direct: true, ...how });
    },
    itemOf: (target, itemId) => target.items?.get(itemId) ?? null,
    updateItem: (item, data) => item.update(data),
    reply: (message) => game.socket.emit(RELAY_SOCKET, message)
  };
}

/** Install the listener. Called once from the ready hook. */
export function registerTargetRelay() {
  game.socket.on(RELAY_SOCKET, (data) => {
    // A reply to something this client asked for.
    if (data?.action === RELAY_ACTIONS.RESULT) {
      const resolve = pending.get(data.requestId);
      if (resolve) resolve(data);
      return;
    }
    if (!String(data?.action ?? "").startsWith("target.")) return;

    // A request, which only the designated GM carries out.
    liveDeps()
      .then((deps) =>
        handleRelayMessage(data, {
          user: game.user,
          activeGM: game.users.activeGM ?? null,
          deps
        })
      )
      .catch((error) => {
        // A THROWN ERROR MUST STILL ANSWER. This handler used to log and
        // return, so any failure on the GM's client reached the player
        // as an eight-second silence and a card blaming the GM for not
        // being connected — which is exactly the silent failure this
        // whole release exists to abolish, reintroduced in the one place
        // I did not look. The asker now gets the real reason.
        console.error("TRG Prime | target relay", error);
        if (!game.user?.isGM) return;
        game.socket.emit(RELAY_SOCKET, {
          action: RELAY_ACTIONS.RESULT,
          requestId: data?.requestId,
          userId: data?.userId,
          ok: false,
          reason: `the GM's client could not apply it: ${error?.message ?? error}`
        });
      });
  });
}
