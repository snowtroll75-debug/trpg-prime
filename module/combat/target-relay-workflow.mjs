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
import { isGMConnectionWriter } from "../gm-connection.mjs";
import {
  actorCreateNeedsRelay,
  RELAY_ACTIONS,
  RELAY_SOCKET,
  RELAY_TIMEOUT_MS,
  RELAY_WORKING_TIMEOUT_MS,
  buildRelayRequest,
  handleRelayMessage,
  needsRelay
} from "./target-relay.mjs";

/** Requests this client is waiting on, by id. */
const pending = new Map();
/** The longer wait a request is given once the GM's client has it (3.673.0). */
const working = new Map();

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
    const giveUp = (reason) => () => {
      pending.delete(requestId);
      working.delete(requestId);
      resolve({ ok: false, reason });
    };
    let timer = setTimeout(giveUp("no GM answered — is one connected?"), RELAY_TIMEOUT_MS);

    pending.set(requestId, (reply) => {
      clearTimeout(timer);
      pending.delete(requestId);
      working.delete(requestId);
      resolve(reply);
    });
    // THE GM HAS IT (3.673.0): wait for its answer, up to the longer clock.
    working.set(requestId, () => {
      clearTimeout(timer);
      timer = setTimeout(giveUp("the GM's client took too long to answer"), RELAY_WORKING_TIMEOUT_MS);
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
  // …AND WHOSE TURN START ENDS IT (3.707.1).
  for (const key of ["duration", "spellEffect", "spellEffectEnd", "castId", "sourceTraits", "endsAtTurnStartOf", "endsAtTurnEndOf"]) {
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

/**
 * A REFRESHED EFFECT REPLACES ITS ELDER (3.685.1): an effect carrying
 * `flags.trg-prime.refreshKey` (a bonus group's `refresh: true`, keyed to its
 * spell) replaces the creature's earlier effect of the same key — on the GM's
 * client too, below. CREATED FIRST (review): the elder is removed only once
 * the new effect exists, so a failed create loses nothing. Effects without a
 * key are simply created. See magic/bonus-group.mjs.
 */
async function createRefreshing(target, data) {
  const { refreshedEffectIds } = await import("../magic/bonus-group.mjs");
  const elders = refreshedEffectIds(target?.effects ?? [], data);
  const created = await target.createEmbeddedDocuments("ActiveEffect", data);
  if (elders.length && Array.isArray(created) && created.length) {
    await target.deleteEmbeddedDocuments("ActiveEffect", elders).catch((err) => console.warn("TRG Prime | a refreshed effect could not be removed", err));
  }
  return created;
}

export async function createEffectsOn(target, effects, applyDirect) {
  const data = Array.isArray(effects) ? effects : [effects];
  if (!data.length) return [];
  // THE CAST'S COUNTERACT PP, STAMPED HERE ON THE CASTER'S CLIENT (U3): the
  // GM's client, which creates a relayed effect, never saw the cast.
  const { stampCastPower } = await import("../magic/cast-power.mjs");
  stampCastPower(data);
  if (!needsRelay(target)) {
    if (applyDirect) return applyDirect();
    return createRefreshing(target, data);
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

/** A save rolled on this client, as the creature. */
async function rollSaveHere(target, params) {
  const { TRGCheck } = await import("../dice/check.mjs");
  return TRGCheck.roll({ ...params, actor: target });
}

/** What a caller reads of a save: its outcome, as plain data. */
function saveOutcomeOf(check) {
  const o = check?.outcome;
  if (!o) return null;
  return {
    outcome: {
      total: Number(o.total ?? 0),
      margin: o.margin ?? null,
      degree: o.degree ? { key: o.degree.key, label: o.degree.label, success: Boolean(o.degree.success) } : null
    }
  };
}

/**
 * A SPELL'S SAVE, ROLLED WHERE THE CREATURE IS OWNED (26 Nov 2026; Graham's
 * U11). On a client that owns the creature (the GM's always does) it is
 * rolled here, as before, and the check itself returned. Otherwise the GM's
 * client rolls it and this returns `{ outcome }` — the only part of the check
 * `resolveSpellSave` reads. With no GM to answer, it is rolled here rather
 * than leave the spell unresolved, and the card says so.
 */
export async function rollSaveFor(target, params = {}) {
  if (!target || !needsRelay(target) || game.user?.isGM) return rollSaveHere(target, params);
  // NO GM CONNECTED, NO RELAY: rolled here at once rather than after the
  // relay's timeout, once per creature saving (a player alone at the table).
  if (!game.users?.activeGM) return rollSaveHere(target, params);
  const plain = JSON.parse(JSON.stringify({ ...params, actor: undefined }));
  const reply = await ask(RELAY_ACTIONS.SAVE, target, { params: plain });
  if (reply.ok && reply.result?.outcome) return reply.result;
  ui.notifications?.warn?.(`${target.name}'s save could not be rolled on the GM's client (${reply.reason ?? "no answer"}); rolled here instead.`);
  return rollSaveHere(target, params);
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

/**
 * DELETE A COUNTERACTED EFFECT (3.686.0; Block 8a review): directly when this
 * client owns the creature (or is the GM doing the relayed work), else through
 * the GM, who re-checks that the row's traits reach it. A refusal or no GM is
 * announced. Returns whether it is gone.
 */
export async function counteractEffectOn(target, effectId, traits, { direct = false } = {}) {
  const effect = target?.effects?.get?.(effectId);
  if (!effect) return false;
  if (direct || !needsRelay(target)) { await effect.delete(); return true; }
  const reply = await ask(RELAY_ACTIONS.COUNTERACT, target, { effectId: String(effectId), traits: (traits ?? []).map(String) });
  if (reply.ok) return true;
  await announceRelayFailure(target, null, reply.reason, "The counteracted effect could not be removed");
  return false;
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
 * Damage a spell's shield on a creature this client does not own (3.707.0;
 * Stone Shield). `{ ok, result, barrier }` as `damageBarrierDirect` answers,
 * or `{ ok: false, reason }`; a failure is the caller's to say on its card.
 */
export async function relayBarrierDamage(target, effectId, damage) {
  const reply = await ask(RELAY_ACTIONS.BARRIER_DAMAGE, target, { effectId: String(effectId ?? ""), damage: Math.max(0, Math.floor(Number(damage) || 0)) });
  if (reply.ok) return reply.result ?? { ok: false, reason: "no answer" };
  return { ok: false, reason: reply.reason };
}

/**
 * End a caster's registered spell from wherever the ending happened
 * (3.672.0). Directly when this client owns the caster, through the GM
 * otherwise. `{ ok, result }`: result is whether a spell of that id was there.
 */
export async function relayEndSpell(caster, castId) {
  const id = String(castId ?? "");
  if (!caster || !id) return { ok: false, reason: "no caster or cast" };
  if (!needsRelay(caster)) {
    const { endActiveSpell } = await import("../magic/active-spells.mjs");
    return { ok: true, result: Boolean(await endActiveSpell(caster, id, { dismissed: false })) };
  }
  return ask(RELAY_ACTIONS.END_SPELL, caster, { castId: id });
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

/**
 * A COMPANION ACTOR, CREATED BY THE GM FOR A PLAYER WHO MAY NOT (3.674.1).
 * Resolves the created actor, or null with a notice. The actor arrives on
 * this client by Foundry's own broadcast; it is waited for briefly, since the
 * GM's reply and the creation travel separately.
 */
export async function relayCreateCompanion(master, data, applyDirect) {
  if (!actorCreateNeedsRelay(game.user)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.COMPANION, master, { data });
  if (!reply.ok) {
    ui.notifications?.warn?.(`The companion could not be created through the GM: ${reply.reason ?? "no answer"}.`);
    return null;
  }
  const id = String(reply.result?.id ?? "");
  for (let i = 0; i < 40 && !game.actors?.get(id); i += 1) await new Promise((r) => setTimeout(r, 50));
  return game.actors?.get(id) ?? null;
}

/**
 * An action resolved at a total, on the GM's client when this one may not
 * write to the target (3.692.0). Resolves what the workflow resolves, or
 * `{ ok: false, reason }` when the GM did not.
 */
export async function relayActionAtTotal(actor, target, payload, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.ACTION_AT_TOTAL, target, { actorUuid: actor?.uuid ?? "", ...payload });
  return reply.ok ? reply.result : { ok: false, reason: reply.reason ?? "no answer", lines: [] };
}

/**
 * Condition effects with their clock, laid on a creature this client may not
 * write to (3.706.0) — see CONDITION_EFFECTS. True when the GM's client laid
 * them.
 */
export async function relayConditionEffects(target, actor, effects, { expiresRound = null, actionKey = null } = {}, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.CONDITION_EFFECTS, target, {
    actorUuid: actor?.uuid ?? "", effects, expiresRound, actionKey
  });
  return reply.ok;
}

/** Who grabbed it, or left it flat-footed, recorded on a creature this client may not write to (3.706.0). */
export async function relayInflictedBy(target, actor, kind, { action = "" } = {}, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.INFLICTED_BY, target, { kind, actorUuid: actor?.uuid ?? "", action });
  return reply.ok;
}

/**
 * An offer card created by the GM's client (3.706.0) — see OFFER_CARD and
 * combat/offer-card.mjs. `anchor` is any document the GM's client can find
 * (the creature the card is about); nothing is written to it. Fire and
 * forget: nothing waits on a card, and a table with no GM connected has
 * nobody to take the offer.
 */
export function relayOfferCard(anchor, data) {
  if (!anchor?.uuid) return Promise.resolve(false);
  return ask(RELAY_ACTIONS.OFFER_CARD, anchor, data).then((reply) => {
    if (!reply.ok) console.info(`TRG Prime | an offer card was not posted: ${reply.reason ?? "no answer"}`);
    return reply.ok;
  });
}

/**
 * A charm's attitude on a creature this client may not write to (3.718.0) —
 * see RELAY_ACTIONS.ATTITUDE. Answers what happened, `{from, to, moved}`, as
 * the direct write does, or null when the GM's client refused or no GM
 * answered; the caller says so on its card.
 *
 * @param {Actor} target
 * @param {{mode:"charm"|"step", observerUuid:string, floor?:string, steps?:number, seconds:number|null}} request
 * @param {Function} applyDirect what to do when this client owns it
 */
export async function relayAttitude(target, request, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.ATTITUDE, target, {
    mode: request?.mode === "step" ? "step" : "charm",
    observerUuid: String(request?.observerUuid ?? ""),
    floor: String(request?.floor ?? ""),
    steps: Math.trunc(Number(request?.steps) || 0),
    seconds: request?.seconds === null || request?.seconds === undefined ? null : Number(request.seconds)
  });
  if (reply?.ok) return reply.result ?? null;
  await announceRelayFailure(target, null, reply?.reason, "Attitude not changed");
  return null;
}

/**
 * A conjured item made on a creature this client may not write to (3.718.0)
 * — see RELAY_ACTIONS.CONJURE_ITEM. Answers `{ok, item, reason}` so the
 * caller can tell a refused write from an entry the compendium lacks.
 */
export async function relayConjureItem(target, spec, opts, applyDirect) {
  if (!needsRelay(target)) {
    const item = await applyDirect();
    return { ok: Boolean(item), item: item ?? null };
  }
  const reply = await ask(RELAY_ACTIONS.CONJURE_ITEM, target, {
    spec: { pack: spec?.pack, itemName: spec?.itemName, quantity: spec?.quantity, costGp: spec?.costGp },
    castId: opts?.castId ?? null,
    expires: opts?.expires === true,
    stamp: opts?.stamp ?? null
  });
  if (reply?.ok) return { ok: true, item: reply.result ?? null };
  return { ok: false, item: null, reason: reply?.reason ?? "the GM's client did not answer" };
}

/**
 * A spell's record on a creature this client may not write to (3.718.0) —
 * see RELAY_ACTIONS.SPELL_FLAG. True when it landed. A refusal is said on a
 * card and never thrown: the spell's own card must still post.
 */
export async function relaySpellFlag(target, key, value) {
  const reply = await ask(RELAY_ACTIONS.SPELL_FLAG, target, { key, value: value ?? null });
  if (reply?.ok) return true;
  await announceRelayFailure(target, null, reply?.reason, "Spell record not written");
  return false;
}

/**
 * A spell's granted abilities on a creature this client may not write to
 * (3.718.0). Answers `[{id, name}]`, or [] when refused (said on a card).
 */
export async function relaySpellItems(target, items) {
  const reply = await ask(RELAY_ACTIONS.SPELL_ITEMS, target, { items });
  if (reply?.ok) return Array.isArray(reply.result) ? reply.result : [];
  await announceRelayFailure(target, null, reply?.reason, "Spell's ability not granted");
  return [];
}

/** A stamp on, or the removal of, a target's effect (3.718.0). True when it landed. */
export async function relayEffectStamp(effect, { flags = null, remove = false } = {}) {
  const target = effect?.parent;
  const reply = await ask(RELAY_ACTIONS.EFFECT_STAMP, target, {
    effectId: effect?.id ?? "", ...(remove ? { remove: true } : { flags: flags ?? {} })
  });
  if (reply?.ok) return true;
  await announceRelayFailure(target, null, reply?.reason, remove ? "Effect not removed" : "Effect not stamped");
  return false;
}

/** A wall spell's segments, made on the GM's client (3.718.0). The count made, or 0. */
export async function relaySpellWalls(region, walls, castId) {
  const reply = await ask(RELAY_ACTIONS.SPELL_WALLS, region, { walls, castId: castId ?? null });
  return reply?.ok ? Number(reply.result) || 0 : 0;
}

/** A spell's forced movement of a creature this client may not move (3.718.0). */
export async function relayForcedMove(source, target, feet) {
  const reply = await ask(RELAY_ACTIONS.FORCED_MOVE, target, { sourceUuid: source?.uuid ?? "", feet });
  if (reply?.ok && reply.result) return reply.result;
  return { ok: false, text: `${target?.name ?? "The target"} could not be moved: ${reply?.reason ?? "the GM's client did not answer"}. Move it by hand.` };
}

/**
 * Behaviours on a spell's Region, which a player may place but not furnish
 * (3.718.0). Answers the made ids, or null when refused.
 */
export async function relayRegionBehaviours(region, behaviours, name = "") {
  const reply = await ask(RELAY_ACTIONS.REGION_BEHAVIOURS, region, { behaviours, name });
  if (reply?.ok) return Array.isArray(reply.result) ? reply.result : [];
  return null;
}

/** A Quick Donning result, set on a creature this client may not write to (3.703.0). */
export async function relayQuickDonning(target, record, applyDirect) {
  if (!needsRelay(target)) return applyDirect();
  const reply = await ask(RELAY_ACTIONS.QUICK_DONNING, target, { degree: record?.degree ?? "", by: record?.by ?? "" });
  return reply.ok;
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
    createEffects: (target, effects) => createRefreshing(target, effects),
    // The GM owns the target, so `enterDyingAt` writes rather than asks again.
    enterDyingAt: async (target, finalHP, options) => {
      const { enterDyingAt } = await import("./dying-workflow.mjs");
      return enterDyingAt(target, finalHP, options);
    },
    // A SAVE ROLLED AS THE GM'S CREATURE (U11): the outcome, as plain data.
    rollSave: async (target, params) => saveOutcomeOf(await rollSaveHere(target, params)),
    // `direct` STOPS THE RELAY RECURSING — the GM already owns the target.
    consumeOneAttack: async (target, event) => consumeOneAttackEffects(target, event, { direct: true }),
    // AN ACTION AT A TOTAL, ON THE GM'S CLIENT (3.692.0). `direct` stops the
    // relay recursing — the GM already owns the target.
    actionAtTotal: async (actor, target, actionKey, opts) => {
      const { resolveBasicActionAtTotal } = await import("./basic-action-at-total-workflow.mjs");
      return resolveBasicActionAtTotal(actor, target, actionKey, { ...opts, direct: true });
    },
    // A COUNTERACT, ON THE GM'S CLIENT (3.686.0) — see counteractEffectAsGM.
    counteractEffect: async (target, effectId, traits) => {
      const { counteractEffectAsGM } = await import("../magic/counteract-relay-workflow.mjs");
      return counteractEffectAsGM(target, effectId, traits);
    },
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
    // A SPELL'S SHIELD STRUCK, ON THE GM'S CLIENT (3.707.0) — see BARRIER_DAMAGE.
    damageBarrier: async (target, effectId, damage) => {
      const { damageBarrierDirect } = await import("../magic/barrier-workflow.mjs");
      return damageBarrierDirect(target, effectId, damage);
    },
    // A CASTER'S SPELL, ENDED ON THE GM'S CLIENT (3.672.0) — see END_SPELL.
    endSpell: async (caster, castId) => {
      const { endActiveSpell } = await import("../magic/active-spells.mjs");
      return endActiveSpell(caster, castId, { dismissed: false });
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
    // A CHARM'S ATTITUDE AND A CONJURED ITEM, ON THE GM'S CLIENT (3.718.0).
    // `isAttitude` is checked here, where the ladder is importable.
    charmAttitude: async (target, observerUuid, floor, seconds) => {
      const { isAttitude } = await import("../attitude.mjs");
      if (!isAttitude(floor)) return null;
      const { charmAttitude } = await import("../attitude-workflow.mjs");
      return charmAttitude(target, observerUuid, floor, seconds);
    },
    charmAttitudeByStep: async (target, observerUuid, steps, seconds) => {
      if (!steps) return null;
      const { charmAttitudeByStep } = await import("../attitude-workflow.mjs");
      return charmAttitudeByStep(target, observerUuid, steps, seconds);
    },
    conjureItem: async (target, spec, opts) => {
      const { normaliseConjuredItem } = await import("../magic/conjured-item.mjs");
      const clean = normaliseConjuredItem({ kind: "conjureItem", ...spec });
      if (!clean) return null;
      const { conjureItemOnto } = await import("../magic/conjured-item-workflow.mjs");
      return conjureItemOnto(target, clean, opts);
    },
    // A SPELL'S RECORD, ITS GRANTED ABILITY, ITS GROUND (3.718.0).
    setSpellFlag: (target, key, value) => (value === null
      ? target.unsetFlag("trg-prime", key)
      : target.setFlag("trg-prime", key, value)),
    createSpellItems: (target, items) => target.createEmbeddedDocuments("Item", items),
    effectOf: (target, effectId) => target.effects?.get?.(effectId) ?? null,
    isSpellEffect: (effect) => {
      const f = effect?.flags?.["trg-prime"] ?? {};
      return f.spellEffect === true || f.spellBuff === true;
    },
    deleteEffect: (effect) => effect.delete(),
    stampEffect: (effect, flags) => effect.update(Object.fromEntries(
      Object.entries(flags).map(([k, v]) => [`flags.trg-prime.${k}`, v]))),
    // `direct` keeps the GM's own pass from asking itself.
    forceMoveAway: async (source, target, feet) => {
      const { forceMoveAway } = await import("./forced-movement-workflow.mjs");
      return forceMoveAway(source, target, feet, { direct: true });
    },
    userPlacedRegion: (region, userId) => {
      const user = game.users?.get(userId);
      return Boolean(user && (region?.author?.id === userId || region?.testUserPermission?.(user, "OWNER")));
    },
    updateRegion: (region, data) => region.update(data),
    // A WALL SPELL'S SEGMENTS, flagged to their Region as the caster's own
    // client flags them, so the Region's deletion takes them away.
    createSpellWalls: async (region, segments, castId) => {
      const { WALL_FLAG } = await import("../magic/wall-spell.mjs");
      const scene = region?.parent;
      if (!scene) return [];
      return scene.createEmbeddedDocuments("Wall", segments.map((s) => ({
        ...s, flags: { "trg-prime": { [WALL_FLAG]: { regionId: region.id, castId } } }
      })));
    },
    createRegionBehaviours: (region, behaviours) => region.createEmbeddedDocuments("RegionBehavior", behaviours),
    itemOf: (target, itemId) => target.items?.get(itemId) ?? null,
    // A COMPANION FOR A PLAYER (3.674.1): does the asker own the master, and the creation.
    userOwns: (target, userId) => {
      const user = game.users?.get(userId);
      return Boolean(user && target?.testUserPermission?.(user, "OWNER"));
    },
    createCompanion: (data) => Actor.create(data),
    updateItem: (item, data) => item.update(data),
    setQuickDonning: (target, record) => target.setFlag("trg-prime", "quickDonning", record),
    // A CONDITION'S CLOCK AND WHO LAID IT, ON THE GM'S CLIENT (3.706.0).
    // `direct` stops the relay recursing — the GM already owns the target.
    applyConditionEffects: async (actor, target, effects, opts) => {
      const { applyBasicActionConditionEffects } = await import("./basic-action-conditions.mjs");
      return applyBasicActionConditionEffects(effects, actor, target, { ...opts, direct: true });
    },
    setInflictedBy: (target, kind, record) => target.setFlag("trg-prime", kind, record),
    currentRound: () => Number(game.combat?.round ?? 0),
    // AN OFFER CARD, CREATED HERE SO ITS AUTHOR IS THE GM (3.706.0).
    knownUserIds: () => Array.from(game.users ?? []).map((u) => u.id),
    createOfferCard: (data) => ChatMessage.create(data),
    reply: (message) => game.socket.emit(RELAY_SOCKET, message),
    acknowledge: (message) => game.socket.emit(RELAY_SOCKET, message)
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
    // …and the GM's word that it has taken it (3.673.0).
    if (data?.action === RELAY_ACTIONS.WORKING) {
      if (data.userId === game.user?.id) working.get(data.requestId)?.();
      return;
    }
    if (!String(data?.action ?? "").startsWith("target.")) return;

    // A request, which only the designated GM carries out.
    liveDeps()
      .then((deps) =>
        handleRelayMessage(data, {
          user: game.user,
          activeGM: game.users.activeGM ?? null,
          connectionWriter: isGMConnectionWriter(),
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
