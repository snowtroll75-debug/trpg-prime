/**
 * The GM relay for writes to a target you do not own.
 *
 * THE DEFECT, found in Graham's live session on 19 August 2026. A player
 * attacked a goblin, the attack rolled, the critical injury rolled — and
 * no damage card appeared at all. Their own cards showed attacks and
 * critical injuries and not one damage roll; the GM's showed both.
 *
 * The cause is the last line of the damage step: it writes HP to the
 * TARGET. Players own their own characters and not the monsters, so
 * Foundry refuses the update, the exception unwinds the whole damage
 * step, and the card is never posted. It looks like "damage isn't
 * rolling". Damage is rolling; it dies on application.
 *
 * WHY NOBODY CAUGHT IT. Every automated pass this project has run drove
 * combat as a GM, who can write to anything. A permission defect is
 * invisible to that method by construction.
 *
 * THE SAME SHAPE AS THE LOOT RELAY. `party-socket.mjs` solved this in
 * August for taking loot, and its reasoning applies unchanged: the
 * alternative is giving every player Owner on every monster, which also
 * lets them rewrite its stats. So the player asks the GM's client to do
 * the write.
 *
 * WHAT IS AND IS NOT TRUSTED. The GM's client resolves the target actor
 * ITSELF from the uuid and performs a NAMED operation from the table
 * below — never an arbitrary update payload. What it does accept is the
 * damage AMOUNT, because the player's client already rolled it and the
 * roll is public in chat; re-rolling it on the GM's side would produce a
 * different number from the one everybody just watched. That is a real
 * trust boundary and it is deliberate: a player who forges a payload can
 * overstate damage, exactly as they could by misreading a die at the
 * table.
 *
 * WRAPPED LOW ON PURPOSE. The wrappers sit inside the shared primitives
 * rather than at the attack workflow's call sites, so every route that
 * damages a target — weapon attacks, spell effects, runes, criticals,
 * bleed — is carried across the boundary by the same code.
 */

const SYSTEM_ID = "trg-prime";

/** The socket channel. Shared with the party relay; actions namespace it. */
export const RELAY_SOCKET = `system.${SYSTEM_ID}`;

/** Every operation a player may ask a GM to perform on a target. */
export const RELAY_ACTIONS = Object.freeze({
  DAMAGE: "target.damage",
  CONDITIONS: "target.conditions",
  STATUS: "target.status",
  ITEM_HP: "target.itemHp",
  SPELL_RUNE: "target.spellRune",
  END_CAST: "target.endCast",
  HP_ZERO: "target.hpZero",
  EFFECTS: "target.effects",
  HEAL: "target.heal",
  MEDICINE: "target.medicine",
  TOKEN_LIGHT: "target.tokenLight",
  // A DISABLING ATTEMPT AGAINST A PERIL (3.620.0; Chapter 12, Graham's R17):
  // a player's Disable Device banks its successes on, or triggers, a peril
  // the GM owns.
  PERIL: "target.peril",
  // AN AFFLICTION REACHES A CREATURE (3.627.0): a player's Ghoul Fever bite
  // on the GM's NPC. The GM's client marks the once-a-day exposure and hands
  // the copy to the core's own exposure, which refuses an immune creature.
  AFFLICTION: "target.affliction",
  // WHAT A CRITICAL INJURY LEAVES ON THE CREATURE (3.627.1): its Persistence
  // record (UH / FR / P), a Fatal mark, the Injured penalty's location and a
  // held breath's lost air. Each was a direct write to the target, so a
  // player's critical on the GM's NPC threw a permission error and the whole
  // strike — damage and card — was lost. Found live on 7 October 2026.
  INJURY_RECORD: "target.injuryRecord",
  // A DEFENCE THAT LASTED ONE ATTACK (3.666.0): the attacker's client asks
  // the GM's to remove the defender's one-attack effects that attack spent.
  // The payload names the ATTACK, not effect ids, so the GM's client decides
  // what it spends by the defender's own declarations (one-attack.mjs).
  ONE_ATTACK: "target.oneAttack",
  // A STATED DESTINATION BELOW ZERO (3.666.1): Word Of Death's "otherwise it
  // drops to -10 HP" and Slay The Soul's Failure, cast by a player on the
  // GM's creature. A named operation, as HP_ZERO is: the GM's client runs
  // the dying rule's own branch with the two numbers it reads.
  DYING_AT: "target.dyingAt",
  RESULT: "target.result"
});

/** The records an INJURY_RECORD request may write, and nothing else. */
// "ppDrain" and "apWatch" joined at 3.627.2: the Aligned 19 row's "Drained of
// 2 PP" and the AP-spend watch a critical arms were the same direct write.
// "soulDestroyed" joined at 3.666.1: Soul Destruction's rung marks the body
// for a later Resurrection, and a player's cast wrote it directly.
const INJURY_RECORD_KINDS = Object.freeze(["persistence", "fatal", "location", "air", "ppDrain", "apWatch", "soulDestroyed"]);

/** How long a client waits for the GM's answer before giving up. */
export const RELAY_TIMEOUT_MS = 8000;

/**
 * Should THIS client carry out a relayed request?
 *
 * Same rule and same reasoning as the party relay: with two GMs
 * connected, a handler that only asked "am I a GM?" would apply the
 * damage twice. Pure, so the harness can prove a two-GM table applies
 * one hit.
 *
 * @param {{isGM: boolean, id: string}} user
 * @param {{id: string}|null} activeGM
 * @returns {boolean}
 */
export function shouldHandleAsGM(user, activeGM) {
  if (!user?.isGM) return false;
  // No designated GM: act anyway. A duplicated application is visible and
  // reversible; damage that silently never lands is neither.
  if (!activeGM?.id) return true;
  return activeGM.id === user.id;
}

/**
 * Does this client need the relay for this document at all?
 *
 * A GM — and a player who genuinely owns the target, which happens when
 * one character heals another — does the write directly. Bouncing a
 * message off yourself would make the GM's own attacks depend on a
 * healthy socket, which is the kind of coupling that turns one broken
 * thing into two.
 *
 * @param {object} document
 * @returns {boolean}
 */
export function needsRelay(document) {
  if (!document) return false;
  return !document.isOwner;
}

/**
 * Must a condition toggle on this actor go through the GM (3.666.1)?
 *
 * Asked by `Actor#toggleStatusEffect` itself, so every caller is covered.
 * Never on a GM's client (the GM owns everything and is the relay's own
 * end), never with no user (a harness, or a world still loading), and
 * never for an actor this user owns.
 *
 * @param {{isOwner: boolean}} actor
 * @param {{isGM: boolean}|null} user
 */
export function statusRelayNeeded(actor, user) {
  if (!actor || !user || user.isGM) return false;
  return needsRelay(actor);
}

/** The toggle options that mean anything on the GM's client, as plain data. */
// Not `force`: the GM's override of an immunity is the GM's, and a player's
// client asking for it through the relay would be a way round the guard.
const RELAYABLE_STATUS_OPTIONS = Object.freeze(["active", "value", "damageType", "overlay"]);

/**
 * The options a relayed toggle carries: plain data, and only the keys the
 * GM's own toggle reads, so nothing unserialisable reaches the socket.
 *
 * @param {object} options
 */
export function relayableStatusOptions(options = {}) {
  const out = {};
  for (const key of RELAYABLE_STATUS_OPTIONS) {
    const value = options?.[key];
    if (value === undefined || value === null) continue;
    if (key === "value") { if (Number.isFinite(Number(value))) out.value = Number(value); continue; }
    if (key === "damageType") { out.damageType = String(value); continue; }
    out[key] = Boolean(value);
  }
  return out;
}

/**
 * Must a REMOVAL be relayed?
 *
 * `needsRelay` alone is not the whole question here, because the GM's own
 * client re-enters `removeEffectsByCastId` after the relay lands and must
 * not ask again. `direct` is what says "you are already the GM doing the
 * work" — the same flag, and the same reason, as `applyHealing`.
 *
 * PULLED OUT AS A NAMED RULE so the harness can drive both halves without
 * a socket. Testing it through the relay would need a live Foundry.
 *
 * @param {object} target
 * @param {boolean} direct
 * @returns {boolean}
 */
export function removalNeedsRelay(target, direct) {
  return !direct && needsRelay(target);
}

/**
 * The message a client sends. Built here so the shape lives in one place
 * and the harness can assert the sender builds what the handler reads.
 */
export function buildRelayRequest({ action, uuid, userId, requestId, payload = {} }) {
  return { action, uuid, userId, requestId, payload };
}

/**
 * Perform a relayed request on this (GM) client.
 *
 * `deps` is injected so the harness can drive every branch without
 * Foundry: it needs `fromUuid`, and the four primitives.
 *
 * @returns {Promise<object>} the result to send back to the asker.
 */
export async function performRelay(request, deps) {
  const { action, uuid, payload = {} } = request ?? {};
  const target = await deps.fromUuid(uuid);
  if (!target) return { ok: false, reason: "target not found" };

  switch (action) {
    case RELAY_ACTIONS.DAMAGE: {
      const amount = Math.max(0, Math.floor(Number(payload.amount) || 0));
      const result = await deps.applyDamage(target, amount, {
        isCritical: Boolean(payload.isCritical),
        nonlethal: Boolean(payload.nonlethal),
        damageTypes: Array.isArray(payload.damageTypes) ? payload.damageTypes.map(String) : [],
        sourceLevel: Number.isFinite(Number(payload.sourceLevel)) && payload.sourceLevel !== null ? Number(payload.sourceLevel) : null,
        sourceName: String(payload.sourceName ?? "")
      });
      return { ok: true, result };
    }
    case RELAY_ACTIONS.CONDITIONS: {
      const carried = payload.options && typeof payload.options === "object" ? payload.options : {};
      const applied = await deps.applyConditionTags(target, payload.tags ?? [], {
        duration: carried.duration ?? null,
        spellEffect: carried.spellEffect === true,
        spellEffectEnd: carried.spellEffectEnd ?? null,
        castId: carried.castId ?? null,
        sourceTraits: carried.sourceTraits ?? null,
        expiresRound: payload.expiresRound ?? null
      });
      return { ok: true, result: applied };
    }
    case RELAY_ACTIONS.STATUS: {
      await deps.toggleStatus(target, String(payload.status ?? ""), payload.options ?? {});
      return { ok: true, result: null };
    }
    case RELAY_ACTIONS.END_CAST: {
      /*
       * A SPELL ENDING ON SOMEBODY ELSE'S SHEET (3.527.0).
       *
       * FOUND LIVE, 8 September 2026, testing as a player. A player
       * cannot delete an ActiveEffect on an actor they do not own:
       *
       *   "User PC Tester lacks permission to delete ActiveEffect […]"
       *
       * `endActiveSpell` walks the caster PLUS every target it recorded
       * and calls `removeEffectsByCastId` on each, and that ended in a
       * bare `deleteEmbeddedDocuments`. So a player who buffed an ally and
       * pressed End Spell removed it from themselves and left it on the
       * ally — for every spell with a target, not one channel's worth.
       *
       * THE ASYMMETRY IS THE POINT: `createEffectsOn` has been relayed
       * since the relay existed, and the matching removal never was. One
       * half of the pair went through the GM and the other half did not.
       *
       * `direct` STOPS THE RELAY RECURSING — the GM already owns the
       * target, so the removal must do the work rather than ask again.
       * Same arrangement, and the same reason, as `applyHealing`.
       */
      const removed = await deps.endCast(target, String(payload.castId ?? ""),
        Boolean(payload.dismissed));
      return { ok: true, result: removed };
    }
    case RELAY_ACTIONS.SPELL_RUNE: {
      /*
       * A SPELL-LENT POTENCY RUNE, WRITTEN BY THE GM (3.525.0).
       *
       * FOUND LIVE, 8 September 2026, testing as a player rather than as
       * the GM. Magic Weapon says the weapon may be "wielded by you or a
       * willing ally", and a player casting it on an ally's sword got:
       *
       *   "User PC Tester lacks permission to update Item […]"
       *
       * The throw aborted the effects loop, so the Cast card posted, the
       * PP was spent, and NO result card appeared at all — the player was
       * charged 8 PP and told nothing. Invisible to a GM, who can write
       * to anything.
       *
       * THE ITEM IS RESOLVED FROM THE TARGET the GM just fetched, not
       * from a uuid the asker supplied, so a request cannot reach into an
       * item on some other actor. Same rule as ITEM_HP below, and the
       * reason is the same.
       */
      const item = deps.itemOf(target, String(payload.itemId ?? ""));
      if (!item) return { ok: false, reason: "item not found on that target" };
      await deps.updateItem(item, payload.update ?? {});
      return { ok: true, result: null };
    }
    case RELAY_ACTIONS.ITEM_HP: {
      // The item is resolved from the TARGET the GM just fetched, not
      // from a uuid the asker supplied, so a request cannot reach into
      // an item on some other actor.
      const item = deps.itemOf(target, String(payload.itemId ?? ""));
      if (!item) return { ok: false, reason: "item not found on that target" };
      await deps.updateItem(item, {
        "system.hp.value": Math.max(0, Math.floor(Number(payload.value) || 0))
      });
      return { ok: true, result: null };
    }
    case RELAY_ACTIONS.HP_ZERO: {
      // A NAMED operation, not an arbitrary update. The Quick Crit "kill"
      // result drops a mook outright with no dying save, so it cannot go
      // through applyDamage — that would run the dying rules the printed
      // result explicitly skips. It carries no payload at all, which is
      // why it is safe to expose: the worst a forged request can do is
      // what a forged DAMAGE request could already do.
      await deps.setHpZero(target);
      return { ok: true, result: null };
    }
    case RELAY_ACTIONS.HEAL: {
      /*
       * HEALING SOMEBODY ELSE'S CHARACTER (3.474.0).
       *
       * FOUND IN A LIVE SESSION, 2 September 2026. A player cast Cure on
       * another player's character and got "user lacks permission to
       * create active effect". Every other write in this file had a relay
       * and healing did not: `healActor` calls `actor.update` on the HP
       * and `toggleStatusEffect` on Dying, and a player owns neither on
       * somebody else's character.
       *
       * IT IS ITS OWN ACTION AND NOT NEGATIVE DAMAGE. Healing has rules
       * damage does not — it is capped at max HP, and it steps Dying back
       * by a rule that depends on whether the healing was magical. Sending
       * a negative amount through DAMAGE would have skipped all of it.
       */
      const amount = Math.max(0, Math.floor(Number(payload.amount) || 0));
      const healed = await deps.applyHealing(target, amount, {
        magical: payload.magical !== false,
        // Death's Defiance (3.611.0): a recovery from Dying that costs no
        // Fatigued, carried across the relay like `magical`.
        noDyingFatigue: payload.noDyingFatigue === true,
        dyingHalf: payload.dyingHalf === true
      });
      return { ok: true, healed };
    }
    case RELAY_ACTIONS.EFFECTS: {
      // THE WIDEST THING THE RELAY CARRIES, and worth being plain about.
      // Every other action is a named operation with a number or a key;
      // this one carries whole ActiveEffect documents built on the
      // asker's client. It has to: a Bless builds its effect from the
      // spell, the caster's level and the metamagic chosen in the
      // dialog, and none of that is reconstructible from a spell id.
      //
      // It is the same trust boundary as the damage AMOUNT, one notch
      // wider: a player who forges this payload can grant themselves a
      // bonus, exactly as they could by writing one on their sheet at a
      // physical table. What it cannot do is reach a DIFFERENT actor —
      // the GM resolves the target itself, from the uuid, below.
      const effects = Array.isArray(payload.effects) ? payload.effects : [];
      if (!effects.length) return { ok: true, result: [] };
      const created = await deps.createEffects(target, effects);
      return { ok: true, result: created ?? [] };
    }
    case RELAY_ACTIONS.MEDICINE: {
      // Treat Wounds and its kin. Named fields only — a kind, a
      // condition key and an amount — so the GM's client runs the
      // system's own healing rules rather than a payload's instructions.
      const outcome = await deps.applyMedicine(target, {
        kind: String(payload.kind ?? ""),
        conditionKey: String(payload.conditionKey ?? ""),
        amount: Math.max(0, Math.floor(Number(payload.amount) || 0))
      });
      return { ok: true, result: outcome ?? null };
    }
    case RELAY_ACTIONS.TOKEN_LIGHT: {
      // AN ATTACHED LIGHT ON A TOKEN THE ASKER DOES NOT OWN.
      //
      // WHY THIS EXISTS, from the live pass of 25 August: PC Tester cast
      // Light on an ally's token and the card said "the light is in
      // effect, but the token's own glow could not be set". The effect
      // landed — the EFFECTS action above carried it — and then the
      // glow did not, because a player may not update another player's
      // TokenDocument. Light's printed Targets line is "1 object of 1 lb
      // or less, either unattended or POSSESSED BY YOU OR A WILLING
      // ALLY", so lighting somebody else's lantern is the spell's
      // ordinary use, not an edge case. Leaving it to a GM to finish by
      // hand would make the commonest casting of a cantrip a chore.
      //
      // NAMED FIELDS, NOT A PAYLOAD OF INSTRUCTIONS. The asker sends a
      // source KEY; the GM's client looks the light config up from
      // LIGHT_SOURCES itself. A forged request can therefore only ask
      // for one of the eleven lights the book prints, on a token the GM
      // resolves from the uuid — it cannot invent a radius, and it
      // cannot reach a different token.
      const key = String(payload.source ?? "");
      const cleared = payload.clear === true;
      const result = cleared
        ? await deps.clearTokenLight(target)
        : await deps.setTokenLight(target, key);
      return { ok: true, result: result ?? null };
    }
    case RELAY_ACTIONS.PERIL: {
      // A DEGREE, NOT A STATE. The asker sends what its check rolled; the
      // GM's client works out the successes, the disabling and the trigger
      // from the peril's own stored section (peril.mjs) — a forged request
      // can claim a heroic roll, as a player could at the table, but cannot
      // write a progress or a state of its own.
      const how = { mode: payload.mode === "counteract" ? "counteract" : "disable", force: payload.force === true };
      if (payload.seconds === null || Number.isFinite(Number(payload.seconds))) how.seconds = payload.seconds === null ? null : Math.max(0, Number(payload.seconds));
      const result = await deps.applyPerilAttempt(target, String(payload.degree ?? ""), how);
      return { ok: true, result: result ?? null };
    }
    case RELAY_ACTIONS.AFFLICTION: {
      // AN AFFLICTION ITEM, NOTHING ELSE. The type is checked here so a forged
      // payload cannot slip an arbitrary item onto somebody else's sheet.
      const data = payload.data;
      if (!data || data.type !== "affliction") return { ok: false, reason: "not an affliction" };
      if (payload.exposureKey) await deps.markExposure(target, String(payload.exposureKey), Number(payload.now) || 0);
      const result = await deps.exposeAffliction(target, data);
      return { ok: true, result: result ? { immune: Boolean(result.immune) } : null };
    }
    case RELAY_ACTIONS.INJURY_RECORD: {
      // A NAMED RECORD, NOTHING ELSE. The kind is checked here, and the GM's
      // client builds the record from the fields it reads, so a forged
      // request cannot write an arbitrary flag on somebody else's creature.
      const kind = String(payload.kind ?? "");
      if (!INJURY_RECORD_KINDS.includes(kind)) return { ok: false, reason: `not an injury record: ${kind}` };
      const result = await deps.recordInjury(target, kind, payload.entry ?? {});
      return { ok: true, result: result ?? null };
    }
    case RELAY_ACTIONS.DYING_AT: {
      const finalHP = Math.trunc(Number(payload.finalHP));
      if (!Number.isFinite(finalHP)) return { ok: false, reason: "no hit points named" };
      const result = await deps.enterDyingAt(target, finalHP, { isCritical: payload.isCritical === true });
      return { ok: true, result: result ?? null };
    }
    case RELAY_ACTIONS.ONE_ATTACK: {
      const event = {
        kind: String(payload.event?.kind ?? ""),
        actionKey: String(payload.event?.actionKey ?? ""),
        attackerUuid: String(payload.event?.attackerUuid ?? "")
      };
      const removed = await deps.consumeOneAttack(target, event);
      return { ok: true, result: removed ?? [] };
    }
    default:
      return { ok: false, reason: `unknown relay action: ${action}` };
  }
}

/**
 * Route one incoming socket message.
 *
 * Ignores anything that is not ours — the channel is shared with the
 * party relay, so every client receives both kinds and each handler must
 * mind its own.
 */
export async function handleRelayMessage(data, { user, activeGM, deps }) {
  const action = data?.action ?? "";
  if (!action.startsWith("target.")) return { handled: false, reason: "not a target relay message" };
  if (action === RELAY_ACTIONS.RESULT) return { handled: false, reason: "a reply, not a request" };
  if (!shouldHandleAsGM(user, activeGM)) return { handled: false, reason: "another GM is handling it" };

  // A THROW MUST STILL ANSWER. If the write fails on the GM's client —
  // a missing global, a schema refusal, anything — returning without a
  // reply leaves the player waiting out the timeout and reading a card
  // that says no GM was connected. That is a lie about the cause, and it
  // is the same silent-failure shape this module exists to abolish.
  let outcome;
  try {
    outcome = await performRelay(data, deps);
  } catch (error) {
    outcome = { ok: false, reason: `the GM's client could not apply it: ${error?.message ?? error}` };
  }
  deps.reply({
    action: RELAY_ACTIONS.RESULT,
    requestId: data.requestId,
    userId: data.userId,
    ...outcome
  });
  return { handled: true, outcome };
}
