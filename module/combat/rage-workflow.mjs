/**
 * Rage — the Foundry side of Invoke Rage and Revoke Rage.
 *
 * The rage state *is* an Active Effect: one document carrying the whole
 * bonus package, the temporary HP grant, and the flags recording how the
 * rage was entered. Nothing else needs a parallel "is raging" field, and
 * a GM who deletes the effect by hand ends the rage exactly as the
 * rulebook's own "end it manually" would — the same approach Take Cover
 * already takes.
 */
import { applyConditionTags } from "./effect-application-workflow.mjs";
import { CHANGE_TYPE } from "../effect-change-types.mjs";
import {
  RAGE_DURATION_SECONDS,
  RAGE_EFFECT_NAME,
  RAGE_FATIGUE_SECONDS,
  rageEffectChanges,
  rageTemporaryHP,
  rageExpiry,
  rageHasElapsed
} from "./rage.mjs";

const SYSTEM_ID = "trg-prime";
const RAGE_FLAG = "rage";
const RAGE_ICON = "icons/creatures/abilities/mouth-teeth-rows-red.webp";

/**
 * The rage Active Effect on an actor, if any.
 *
 * A DISABLED EFFECT IS NOT A RAGE (3.416.0). This matched by name alone
 * and ignored `disabled`, so switching the effect off in the Effects
 * table left Foundry no longer applying the changes while every rule in
 * the system still believed the character was raging: `canInvokeRage`
 * refused a fresh rage, `canRevokeRage` was still gated behind
 * `mustRideOut`, and the sheet and the rules disagreed about the same
 * character. Graham hit exactly that, live, on 26 August 2026 — the
 * natural "turn this off" gesture put the character somewhere the system
 * had no way out of.
 *
 * Disabling now ENDS the rage properly (see `endRageOnDisable`), so a
 * disabled rage should never linger; this reads past one anyway, because
 * the alternative is the state that trapped him.
 */
export function rageEffect(actor) {
  return actor?.effects?.find(
    (effect) => effect.name === RAGE_EFFECT_NAME && !effect.disabled
  ) ?? null;
}

/** Whether an actor is currently raging. */
export function isRaging(actor) {
  return Boolean(rageEffect(actor));
}

/**
 * How this rage was entered — `{degree, confused, temporaryHP}` — or
 * null when not raging.
 */
export function rageState(actor) {
  return rageEffect(actor)?.getFlag?.(SYSTEM_ID, RAGE_FLAG) ?? null;
}

/**
 * Whether Invoke Rage's own requirements are met: "You have the Frenzy
 * feat; you aren't fatigued or raging."
 *
 * The Frenzy check matches a feat item by name, the same way Repair
 * matches its repair kit — feats carry no machine-readable key of their
 * own in this project yet, so a name match is the honest mechanism
 * rather than a pretend one.
 *
 * @param {Actor} actor
 * @returns {{allowed: boolean, reason: string}}
 */
export function canInvokeRage(actor) {
  const hasFrenzy = Array.from(actor?.items ?? []).some(
    (item) => item.type === "feat" && /\bfrenzy\b/i.test(item.name ?? "")
  );
  if (!hasFrenzy) {
    return { allowed: false, reason: `${actor.name} doesn't have the Frenzy feat.` };
  }
  if (actor.hasCondition?.("fatigued")) {
    return { allowed: false, reason: `${actor.name} is Fatigued and cannot rage.` };
  }
  if (isRaging(actor)) {
    return { allowed: false, reason: `${actor.name} is already raging.` };
  }
  return { allowed: true, reason: "" };
}

/**
 * Whether Revoke Rage's requirements are met: "You have the Frenzy feat,
 * you are raging."
 *
 * A rage entered on a Fumble "does not end until the condition does", so
 * a still-Confused actor cannot revoke at all — that's the rulebook's
 * own wording rather than an added restriction. The same applies to a
 * rage that fumbled its Revoke and must now be ridden out in full.
 *
 * @param {Actor} actor
 * @returns {{allowed: boolean, reason: string}}
 */
export function canRevokeRage(actor) {
  if (!isRaging(actor)) {
    return { allowed: false, reason: `${actor.name} isn't raging.` };
  }
  const state = rageState(actor);
  if (state?.confused && actor.hasCondition?.("confused")) {
    return {
      allowed: false,
      reason: `${actor.name}'s rage cannot end while the Confused condition lasts.`
    };
  }
  if (state?.mustRideOut) {
    return {
      allowed: false,
      reason: `${actor.name} failed to master the rage and must ride out the full minute.`
    };
  }
  return { allowed: true, reason: "" };
}

/**
 * Enters the rage state: creates the effect, grants temporary HP, and
 * applies Confused when the rage was entered on a Fumble.
 *
 * @param {Actor} actor
 * @param {object} options
 * @param {string} options.degree The Invoke Rage degree achieved.
 * @param {boolean} [options.confused]
 * @returns {Promise<{temporaryHP: number, confused: boolean}>}
 */
export async function beginRage(actor, { degree, confused = false } = {}) {
  const temporaryHP = rageTemporaryHP(actor.system?.identity?.classBonus);
  const attackAbilityKey = actor.system?.combat?.attack?.abilityKey ?? "strength";

  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: RAGE_EFFECT_NAME,
      img: RAGE_ICON,
      duration: { seconds: RAGE_DURATION_SECONDS },
      changes: rageEffectChanges({ attackAbilityKey }).map((change) => ({
        key: change.key,
        type: CHANGE_TYPE.CUSTOM,
        value: String(change.value)
      })),
      flags: {
        [SYSTEM_ID]: {
          // THE MINUTE, STAMPED ON BOTH CLOCKS. Until 3.416.0 the
          // `duration` above was the only record of it and nothing ever
          // read it, so no rage ended by itself. See rage.mjs.
          [RAGE_FLAG]: {
            degree,
            confused,
            temporaryHP,
            mustRideOut: false,
            ...rageExpiry({
              worldTime: Number(game.time?.worldTime ?? 0),
              round: game.combat?.round ?? null
            })
          }
        }
      }
    }
  ]);

  if (temporaryHP > 0) {
    // Temporary HP doesn't stack with itself in any rules text here, so
    // a fresh rage sets the pool rather than adding to whatever an
    // earlier source left behind.
    await actor.update({ "system.resources.hp.temp": temporaryHP });
    // AND THE RECORD GOES ON THE ACTOR, NOT ONLY ON THE EFFECT (3.433.0).
    //
    // Graham, 29 August 2026: "Rage still does not remove modifiers when
    // ended (such as temp HP)" — the third report of this, after two
    // fixes that both made `endRage` more careful.
    //
    // Neither fix moved the BOOKKEEPING. How much was granted lived on
    // the rage effect's own flag, so any path that removed the effect
    // other than `endRage` — a hand-deletion, a sweep, a module, a
    // disable in an older version — took the only record of the debt
    // with it, and the temporary HP became unreclaimable. Throngar
    // Redtusk was carrying 28 points and no rage effect at all when this
    // was written.
    //
    // A debt has to outlive the thing that incurred it.
    await actor.setFlag(SYSTEM_ID, RAGE_TEMP_HP_FLAG, temporaryHP);
  }

  if (confused) {
    await applyConditionTags(actor, [
      { key: "confused", label: "Confused", value: null }
    ]);
  }

  return { temporaryHP, confused };
}

/** How many times the current rage has already been extended. */
export function rageExtensionsUsed(actor) {
  return Number(rageState(actor)?.extensions ?? 0);
}

/**
 * Whether the actor can attempt to extend their rage.
 *
 * @param {Actor} actor
 * @returns {{allowed: boolean, reason: string}}
 */
export function canExtendRage(actor) {
  if (!isRaging(actor)) {
    return { allowed: false, reason: `${actor.name} isn't raging.` };
  }
  return { allowed: true, reason: "" };
}

/**
 * Extends the rage by a further minute, recording the attempt so the
 * next one steps up a difficulty.
 *
 * The count increments whether or not the check succeeded: "the
 * difficulty of this check increases by one step each time" reads as
 * each attempt costing you ground, not each success.
 *
 * @param {Actor} actor
 * @param {object} options
 * @param {boolean} options.succeeded
 * @returns {Promise<{extensions: number}>}
 */
export async function recordRageExtension(actor, { succeeded }) {
  const effect = rageEffect(actor);
  if (!effect) return { extensions: 0 };

  const state = effect.getFlag(SYSTEM_ID, RAGE_FLAG) ?? {};
  const extensions = Number(state.extensions ?? 0) + 1;

  const nextState = { ...state, extensions };
  if (succeeded) {
    // THE STAMP MOVES WITH THE DURATION (3.416.0). The Foundry
    // `duration` below was already extended; the stamp the sweep
    // actually reads was not, so before this an extended rage still
    // ended at its original minute — the extension bought nothing the
    // system could see. Both clocks are pushed out by a further minute
    // from where they now stand.
    const pushed = rageExpiry({
      worldTime: Number(state.endsAtWorldTime ?? game.time?.worldTime ?? 0),
      round: state.endsOnRound ?? game.combat?.round ?? null
    });
    nextState.endsAtWorldTime = pushed.endsAtWorldTime;
    nextState.endsOnRound = pushed.endsOnRound;
  }

  const update = {
    [`flags.${SYSTEM_ID}.${RAGE_FLAG}`]: nextState
  };
  if (succeeded) {
    const remaining = Number(effect.duration?.remaining ?? 0);
    update.duration = {
      seconds: Math.max(0, remaining) + RAGE_DURATION_SECONDS
    };
  }
  await effect.update(update);

  return { extensions };
}

/**
 * Marks a rage as one that failed its Revoke badly enough that it must
 * run its full minute, so further Revoke attempts are refused.
 *
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function markRageRideOut(actor) {
  const effect = rageEffect(actor);
  if (!effect) return;
  const state = effect.getFlag(SYSTEM_ID, RAGE_FLAG) ?? {};
  await effect.setFlag(SYSTEM_ID, RAGE_FLAG, { ...state, mustRideOut: true });
}

/**
 * Ends the rage: removes the effect, clears any temporary HP it granted,
 * and applies the Fatigue owed ("When you eventually come out of Rage,
 * you are fatigued 1 for 1 hour", or 2 after a fumbled Revoke).
 *
 * @param {Actor} actor
 * @param {object} [options]
 * @param {number} [options.fatigue]
 * @returns {Promise<{fatigue: number, temporaryHPLost: number}>}
 */
/*
 * NOT EXPORTED. Nothing outside this file has business reading the debt
 * directly — `reclaimOrphanedRageTemporaryHP` is the question callers
 * actually have, and the boot sweep asks the flag by its literal name
 * only to avoid importing this module on every world-clock tick.
 */
const RAGE_TEMP_HP_FLAG = "rageTemporaryHP";

/** Forget the debt once it has been settled. */
async function clearRageTempRecord(actor) {
  if (actor?.getFlag?.(SYSTEM_ID, RAGE_TEMP_HP_FLAG) === undefined) return;
  try {
    await actor.unsetFlag(SYSTEM_ID, RAGE_TEMP_HP_FLAG);
  } catch (error) {
    console.error("TRG Prime | Could not clear the rage temporary-HP record", error);
  }
}

/**
 * Reclaim temporary HP from a rage whose effect is gone.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LEFTOVERS THIS EXISTS FOR. Throngar Redtusk was carrying 28
 * temporary HP and no rage effect when Graham reported this for the
 * third time. Under the old design that debt was unrecoverable — the
 * amount had been recorded on an effect that no longer existed.
 *
 * From 3.433.0 the amount is on the actor, so a rage whose effect has
 * vanished by any route is still settleable. This is what settles it.
 *
 * NO FATIGUE IS CHARGED. The rage ended at some earlier, unknown moment;
 * landing its cost now would put it at a time nobody chose — the same
 * reasoning `endRageOnDisable` records for a leftover.
 *
 * @param {Actor} actor
 * @returns {Promise<number>} the temporary HP reclaimed
 */
export async function reclaimOrphanedRageTemporaryHP(actor) {
  const granted = Number(actor?.getFlag?.(SYSTEM_ID, RAGE_TEMP_HP_FLAG) ?? 0);
  if (!granted) return 0;
  // STILL RAGING IS NOT AN ORPHAN. The record belongs to a live effect.
  if (rageEffect(actor)) return 0;
  const currentTemp = Number(actor.system?.resources?.hp?.temp ?? 0);
  const reclaimed = Math.min(currentTemp, granted);
  if (reclaimed > 0) {
    await actor.update({ "system.resources.hp.temp": currentTemp - reclaimed });
  }
  await clearRageTempRecord(actor);
  return reclaimed;
}

export async function endRage(actor, { fatigue = 1 } = {}) {
  const effect = rageEffect(actor);
  // THE ACTOR'S RECORD FIRST, the effect's only as a fallback for a rage
  // begun before 3.433.0. See beginRage: the effect can be gone by paths
  // that never reach here, and then its flag is gone with it.
  const granted = Number(
    actor?.getFlag?.(SYSTEM_ID, RAGE_TEMP_HP_FLAG)
      ?? effect?.getFlag?.(SYSTEM_ID, RAGE_FLAG)?.temporaryHP
      ?? 0
  );

  if (effect) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  }

  // Only clear what's actually left of the pool: damage may already have
  // eaten some of it, and nothing else should be zeroed if another
  // source topped it up in the meantime.
  const currentTemp = Number(actor.system?.resources?.hp?.temp ?? 0);
  const temporaryHPLost = Math.min(currentTemp, granted);
  if (temporaryHPLost > 0) {
    await actor.update({
      "system.resources.hp.temp": currentTemp - temporaryHPLost
    });
  }
  await clearRageTempRecord(actor);

  if (fatigue > 0) {
    const applied = await applyConditionTags(actor, [
      { key: "fatigued", label: "Fatigued", value: fatigue }
    ]);
    const effectDoc = actor.effects?.find?.(
      (e) => !e.disabled && e.statuses?.has?.("fatigued")
    );
    // "Fatigued 1 for 1 hour" — a real duration, so it expires on its
    // own rather than sitting on the sheet until someone remembers.
    if (effectDoc?.update && applied.length) {
      await effectDoc.update({ duration: { seconds: RAGE_FATIGUE_SECONDS } });
    }
  }

  return { fatigue, temporaryHPLost };
}

/**
 * End a rage whose minute has run out.
 *
 * NEW at 3.416.0. Called from the same two places every other timed
 * effect is swept from — `TRGCombat._onStartTurn` for the combat clock
 * and the `updateWorldTime` hook for the world clock — because a rage
 * has to be able to end in a fight and in a corridor, and only one of
 * those clocks is moving at a time.
 *
 * IT CANNOT SIMPLY DELETE THE EFFECT, which is why rage could not ride
 * the existing sweeps as they stand. `expireTimedConditions` and
 * `expireSpellEffects` both end an effect by removing it; ending a rage
 * also clears the temporary HP it granted and applies the Fatigue the
 * book charges for coming out of one. Deleting the effect alone would
 * leave a character with rage's temporary HP and none of its cost — a
 * strictly better outcome than playing the rule, arrived at by doing
 * nothing.
 *
 * @param {Actor} actor
 * @param {object} now {worldTime, round}
 * @returns {Promise<{ended: boolean, fatigue: number, temporaryHPLost: number}|null>}
 */
export async function expireRage(actor, { worldTime = null, round = null } = {}) {
  // BY NAME, INCLUDING A DISABLED ONE (3.417.1). `rageEffect` correctly
  // ignores a disabled effect — a disabled rage is not a rage — but that
  // leaves a pre-3.416.0 leftover invisible to this sweep, and the
  // toggle hook cannot fire retroactively for one switched off before
  // the hook existed. Throngar Redtusk carried exactly that: a disabled
  // "Raging" effect and 36 phantom temporary HP, a day after the fix
  // that was supposed to make it impossible.
  const effect = actor?.effects?.find((e) => e.name === RAGE_EFFECT_NAME) ?? null;
  if (!effect) return null;
  const state = effect.getFlag?.(SYSTEM_ID, RAGE_FLAG) ?? null;
  if (!state) return null;

  // A DISABLED RAGE IS A LEFTOVER, and ending it charges no Fatigue: it
  // stopped applying whenever it was switched off, which may have been
  // sessions ago, and landing an hour of Fatigue now would put the cost
  // at a moment nobody chose. The bookkeeping is catching up, not the
  // character coming out of a rage.
  if (effect.disabled) {
    const cleared = await endRageOnDisable(effect, { fatigue: 0 });
    return cleared ? { ended: true, leftover: true, ...cleared } : null;
  }

  if (!rageHasElapsed(state, {
    worldTime, round, durationRemaining: effect.duration?.remaining ?? null
  })) return null;
  const ended = await endRage(actor, { fatigue: state.mustRideOut ? 2 : 1 });
  return { ended: true, ...ended };
}

/**
 * End the rage when a GM switches its effect off by hand.
 *
 * GRAHAM'S RULING, 27 August 2026: the toggle should end the rage
 * properly — temporary HP cleared, Fatigued 1 for an hour — rather than
 * being refused or silently half-applying.
 *
 * WHY THE TOGGLE NEEDED A MEANING AT ALL. Before this it had none, and
 * the result was the worst of both: Foundry stopped applying the rage's
 * changes while `isRaging` still answered yes, so the character kept
 * none of the benefit and all of the lock — `canInvokeRage` refused a
 * new rage, and `canRevokeRage` sat behind a `mustRideOut` waiting for a
 * minute nothing measured. It is the gesture a GM reaches for first, and
 * it led somewhere the system had no exit from.
 *
 * THE FATIGUE IS CHARGED, because the book charges it however the rage
 * ends: "when you eventually come out of Rage, you are fatigued 1 for 1
 * hour". A toggle that skipped it would make switching the effect off
 * the cheapest way to leave a rage, and the cheapest way out of a rule
 * should not be the one that ignores it.
 *
 * @param {ActiveEffect} effect the effect that was just disabled
 * @returns {Promise<object|null>}
 */
export async function endRageOnDisable(effect, { fatigue = null } = {}) {
  if (effect?.name !== RAGE_EFFECT_NAME) return null;
  if (!effect?.disabled) return null;
  const actor = effect.parent;
  if (!actor?.isOwner) return null;

  const state = effect.getFlag?.(SYSTEM_ID, RAGE_FLAG) ?? {};
  // `endRage` reads through `rageEffect`, which now ignores a disabled
  // effect — so the disabled one is removed here, by name, and the rest
  // of the ending (temporary HP, Fatigue) runs exactly as a revoke's.
  await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);

  const granted = Number(state.temporaryHP ?? 0);
  const currentTemp = Number(actor.system?.resources?.hp?.temp ?? 0);
  const temporaryHPLost = Math.min(currentTemp, granted);
  if (temporaryHPLost > 0) {
    await actor.update({ "system.resources.hp.temp": currentTemp - temporaryHPLost });
  }
  await clearRageTempRecord(actor);

  // `fatigue: 0` is the leftover path — see expireRage. A rage switched
  // off in an earlier session already ended; the cost is not charged now.
  const owed = fatigue === null ? (state.mustRideOut ? 2 : 1) : Number(fatigue);
  if (owed <= 0) return { fatigue: 0, temporaryHPLost };
  const applied = await applyConditionTags(actor, [
    { key: "fatigued", label: "Fatigued", value: owed }
  ]);
  const fatigueDoc = actor.effects?.find?.(
    (e) => !e.disabled && e.statuses?.has?.("fatigued")
  );
  if (fatigueDoc?.update && applied.length) {
    await fatigueDoc.update({ duration: { seconds: RAGE_FATIGUE_SECONDS } });
  }
  return { fatigue: owed, temporaryHPLost };
}
