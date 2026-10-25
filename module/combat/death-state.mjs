/**
 * Death, and what happens on the way back from it (Chapter 7).
 *
 * WHY THIS FILE EXISTS. Two defects from the 13 Aug 2026 combat playtest sit
 * either side of the same boundary, and both were caused by that boundary
 * being nobody's job:
 *
 *   D2 — A DEAD CHARACTER KEPT ROLLING DYING CHECKS. Joe's log, two turns
 *        running: "Dying rises to 7, exceeding Death State 5. The character
 *        has died." … then a Dying Check, PASSED, walking him back to 6, and
 *        "The character has died." again. Death was a sentence in a chat
 *        card and nothing else, so the turn-start handler had nothing to
 *        test and never stood down. He finished the fight at Dying 6 against
 *        Death State 5, still being asked to save.
 *
 *   D3 — RECOVERING FROM DYING LEFT A CHARACTER IN NO STATE AT ALL. Nomira
 *        made her checks, the card said "Dying reaches 0 — recovered,
 *        gaining 1 Fatigue", and she was left at 0/57 HP with no Dying, no
 *        Unconscious, nothing but Fatigued 1. She could not act, nothing on
 *        her sheet said why, and the Attack of Opportunity engine went on
 *        offering her reactions as an eligible reactor.
 *
 * Graham's rule, 13 Aug 2026, verbatim:
 *
 *   RECOVERY: LOSING THE DYING CONDITION
 *   When your Dying condition value is reduced to 0, the following happens:
 *   · You lose the Dying condition.
 *   · You remain at 0 HP and Unconscious unless you are brought to 1+ HP, in
 *     which case you lose the Unconscious condition.
 *   · Your Fatigued condition increases by 1.
 *
 *   HEALING WHILE DYING
 *   Healing affects a character with the Dying condition differently to a
 *   character who is able and moving. If a character receives the benefit of
 *   a magical effect (including regeneration) that heals HP while they have
 *   the Dying condition, the condition is reduced by 1. Non-magical healing
 *   (including fast healing) has no effect on you unless the Resuscitation
 *   (Medicine) action is used.
 *
 * HOW DEATH IS REPRESENTED. Unchanged, deliberately: a Dying value one past
 * the effective Death State IS death, everywhere in the system, and
 * `dying-workflow.mjs` already routes destruction and massive damage through
 * that same shape. What is new is that the state is now READ as well as
 * written — `isDead` below — so the things that must stop when a character
 * dies can tell that they must.
 *
 * Pure predicates first, then the two document-touching routines. Nothing
 * here writes HP; the callers own that.
 */
import { effectiveDeathState } from "./turn-economy.mjs";
import { constitutionIsFatal } from "./ability-collapse.mjs";
import { instantDeathCause } from "../conditions/condition-rules.mjs";

const SYSTEM_ID = "trg-prime";

/** The skull laid over a dead creature's token. */
export const DEAD_OVERLAY_ICON = "icons/svg/skull.svg";

/**
 * Is this Dying value, against this Death State, death?
 *
 * Pure, and separate from `isDead` so the boundary can be checked without an
 * actor — and so the ">" is written once rather than at each call site. The
 * boundary is EXCLUSIVE: Dying exactly equal to the Death State is a
 * character on the brink, not a corpse. Nomira sat at Dying 5 against Death
 * State 5 for most of the playtest and was rightly still alive.
 *
 * @param {number} dying
 * @param {number} deathState
 * @returns {boolean}
 */
export function dyingIsFatal(dying, deathState) {
  const value = Number(dying);
  const limit = Number(deathState);
  if (!Number.isFinite(value) || !Number.isFinite(limit)) return false;
  return value > limit;
}

/**
 * The Death State actually in force for an actor, Doomed included.
 * @param {Actor} actor
 * @returns {number}
 */
export function actorDeathState(actor) {
  return effectiveDeathState(
    actor?.system?.combat?.deathState ?? 5,
    actor?.getConditionValue?.("doomed") ?? 0
  );
}

/**
 * Has this actor died?
 *
 * TWO WAYS, AS OF 3.550.0. Dying passing the effective Death State
 * (Chapter 7), and now Constitution reaching -5 — "A character with a
 * Constitution score of -5 is dead" (Chapter 1, p13).
 *
 * ASKED HERE RATHER THAN BESIDE THE NEW RULE, so that death stays ONE
 * question with ONE answer. `reapDead` guards on this, the death watch
 * tests it, and the turn-start dying check skips on it — routing the
 * Constitution death through the same predicate means all three picked it
 * up without being told, where a second death path would have been three
 * places to remember and one of them would have been missed.
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isDead(actor) {
  // No null guard here on purpose. `dyingIsFatal` already refuses a
  // non-finite value, so `null` and `undefined` — how an actor without the
  // condition reports it — come back false through the same code path that
  // decides everything else. A second check here was written first and then
  // removed: it could not be mutated into any observable difference, which is
  // the sign of a rule stated twice rather than a rule defended twice.
  if (dyingIsFatal(actor?.getConditionValue?.("dying"), actorDeathState(actor))) return true;
  if (instantDeathOf(actor)) return true;
  return constitutionIsFatal(actor?.system);
}

/**
 * THE INSTANT DEATHS OF APPENDIX 2, WHATEVER WROTE THE VALUE (3.621.0;
 * block 39's A7 and A8, and Graham's R6): Doomed bringing the Death State
 * to 0, Fatigue 20, and Soul Drain taking maximum hit points below 0.
 *
 * Asked here, where every death is asked, rather than only in the sheet's
 * Set Doomed and Set Soul Drain buttons — which were the only places it was
 * asked before, so Doomed from a spell, a critical or the token HUD never
 * killed anybody. The death watch reaps on any effect change, so this is
 * reached from every route that can write a condition.
 *
 * @returns {string} The cause as a sentence, or "".
 */
function instantDeathOf(actor) {
  if (!actor?.getConditionValue) return "";
  return instantDeathCause({
    baseDeathState: actor.system?.combat?.deathState ?? 5,
    doomed: actor.getConditionValue("doomed") ?? 0,
    // AS APPLIED: Banish Fatigue ignores a point for its checks, not for
    // whether the body gives out.
    fatigued: actor.conditions?.direct?.get?.("fatigued") ?? actor.getConditionValue("fatigued") ?? 0,
    soulDrain: actor.getConditionValue("soulDrain") ?? 0,
    maxBeforeSoulDrain: actor.system?.resources?.hp?.maxBeforeSoulDrain ?? null
  });
}

/**
 * What a recovery from Dying leaves behind.
 *
 * Pure, because the ordering is the fiddly part and deserves to be checkable
 * without a world: whether Unconscious goes on depends on the HP the
 * character is at when Dying hits 0, and that is exactly the clause the old
 * code had no representation for.
 *
 * @param {number} hp Hit points at the moment Dying reaches 0.
 * @param {number} fatigued Current Fatigued value.
 * @returns {{unconscious: boolean, fatigued: number}}
 */
export function recoveryState(hp, fatigued = 0) {
  return {
    // "You remain at 0 HP and Unconscious UNLESS you are brought to 1+ HP."
    unconscious: !(Number(hp) > 0),
    // "Your Fatigued condition increases by 1" — unconditionally, whether or
    // not somebody got you back above 0.
    fatigued: Math.max(0, Math.floor(Number(fatigued) || 0)) + 1
  };
}

/**
 * How healing lands on a creature that has the Dying condition.
 *
 * Pure. The whole rule in one place, so a caller only has to say whether the
 * healing was magical.
 *
 * @param {object} options
 * @param {boolean} options.dying Does the target have the Dying condition?
 * @param {boolean} options.magical Magical effect (a spell, a magic item,
 *   regeneration) rather than natural healing, rest, Medicine or fast
 *   healing.
 * @param {boolean} [options.resuscitation] The Resuscitation (Medicine)
 *   action, which is the named exception that reaches a Dying character
 *   despite being non-magical.
 * @returns {{healsHP: boolean, dyingDelta: number}}
 */
export function healingWhileDying({ dying, magical, resuscitation = false } = {}) {
  // Not Dying: ordinary healing, ordinary rules. This function has nothing
  // to say about it.
  if (!dying) return { healsHP: true, dyingDelta: 0 };

  // Resuscitation reaches a Dying character and reduces the condition. It
  // restores no hit points — it never has; see skill-actions.mjs, whose
  // outcomes are written purely in Dying steps.
  if (resuscitation) return { healsHP: false, dyingDelta: 0 };

  // "Non-magical healing (including fast healing) has no effect on you."
  // No hit points, no change to Dying — the healing is simply wasted.
  if (!magical) return { healsHP: false, dyingDelta: 0 };

  // "…a magical effect that heals HP while they have the Dying condition:
  // the condition is reduced by 1." The hit points are NOT restored — the
  // magic is spent fighting the dying, and the rule states its effect as
  // the Dying step rather than as HP. A character healed back to
  // consciousness therefore takes a second casting, which is what the
  // recovery clause above ("you remain at 0 HP") describes the end of.
  return { healsHP: false, dyingDelta: -1 };
}

/**
 * Marks an actor dead: skull on the token, out of the initiative order.
 *
 * Idempotent — safe to call from every death path, and they all do, because
 * a death that only some paths reap is the same defect with a smaller
 * blast radius.
 *
 * @param {Actor} actor
 * @param {Combat} [combat] Defaults to the active encounter.
 * @returns {Promise<{skulled: boolean, removed: boolean}>}
 */
/**
 * Actors whose reap is already running, so two reapers cannot both write.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE DEATH, TWO SKULLS — the other half of the race.
 *
 * 3.457.1 stopped two reapers throwing over one combatant. Driving a
 * Death critical at 3.458.0 showed the SAME race still doubling the
 * skull: from a clean actor, one critical produced `["Dying 6", "Dead",
 * "Dead"]`, three times out of three.
 *
 * WHY THE `statuses.has("dead")` GUARD DID NOT HOLD. It is a check
 * followed by a write, and the two reapers interleave between them — the
 * critical path pushes Dying past the Death State and reaps, and that
 * same condition write wakes the death watch, which reaps too. Both read
 * "no skull yet", both then drew one.
 *
 * I REPORTED THIS AS NOT REPRODUCIBLE and was wrong: I had tested the
 * plain Dying route, which has only ONE reaper, and concluded from three
 * clean cycles that the guard worked. It does — on that path. The
 * critical path is the one with two.
 *
 * SERIALISED PER ACTOR, because a re-check before the write would only
 * narrow the window rather than close it. The death watch has its own
 * `inFlight` set, but that one is private to its module and cannot see a
 * direct caller — which is exactly what the critical path is. The guard
 * belongs here, at the one function that actually writes.
 */
const reaping = new Map();

/*
 * WHO WAS SPARED, FOR THE CALLER THAT ASKS SECOND (3.630.1, F1 of the
 * 3.630.0 live test). The damage path and the death watch both reap one
 * death; whichever runs the guards gets `spared`, and the other used to
 * get an empty answer — so a blow Prism Lotus answered still printed
 * "has died". A reap already in flight is now awaited and its answer
 * shared, and an answer given in the last few seconds to a creature no
 * longer dead is handed to the next caller once.
 */
const recentlySpared = new Map();
const SPARE_MEMORY_MS = 10000;

function rememberSpared(key, spared) {
  if (key && spared) recentlySpared.set(key, { spared, at: Date.now() });
}

function takeRecentlySpared(key) {
  const held = key ? recentlySpared.get(key) : null;
  if (!held) return null;
  recentlySpared.delete(key);
  return Date.now() - held.at <= SPARE_MEMORY_MS ? held.spared : null;
}

export async function reapDead(actor, combat = null) {
  const out = { skulled: false, removed: false };
  if (!actor) return out;
  // NOT FROM A PLAYER'S CLIENT ON A CREATURE IT DOES NOT OWN (3.666.1). The
  // skull and the initiative order are the GM's to write, and the GM's death
  // watch (death-watch-workflow.mjs) reaps the moment the Dying condition the
  // relay laid arrives. Asking here as well threw, and lost the caller's
  // card: the same rule `rollWeaponAttack` already follows for a Death
  // critical.
  if (!reapsHere(actor, globalThis.game?.user ?? null)) return out;
  // A REAP ALREADY IN FLIGHT FOR THIS ACTOR DOES THE WORK. Keyed on the
  // token where there is one, for the reason the combatant filter below
  // is: four goblins stamped from one statblock share an `actor.id`.
  // AWAITED, AND ITS ANSWER SHARED (3.630.1): see `recentlySpared`.
  const key = actor.token?.id ?? actor.id ?? null;
  if (key && reaping.has(key)) {
    const shared = await reaping.get(key).catch(() => null);
    takeRecentlySpared(key);
    return shared?.spared ? { ...out, spared: shared.spared } : out;
  }
  if (!isDead(actor)) {
    const spared = takeRecentlySpared(key);
    return spared ? { ...out, spared } : out;
  }
  const running = reapDeadInner(actor, combat, out);
  if (key) reaping.set(key, running);
  try {
    const result = await running;
    if (result?.spared) rememberSpared(key, result.spared);
    return result;
  } finally {
    if (key) reaping.delete(key);
  }
}

/**
 * Does THIS client reap this actor? Yes for a GM, for an owner, and with no
 * user at all (a harness). The GM's death watch covers everyone else.
 *
 * @param {{isOwner: boolean}} actor
 * @param {{isGM: boolean}|null} user
 */
export function reapsHere(actor, user) {
  if (!user || user.isGM) return true;
  return actor?.isOwner !== false;
}

async function reapDeadInner(actor, combat, out) {
  // A "WOULD DIE" GUARD (3.630.0) — Phoenix Root, Prism Lotus. Asked here,
  // where every death passes, and only for a death by Dying: an instant
  // death's cause would still be there afterwards. See death-guard-workflow.mjs.
  if (!instantDeathOf(actor)) {
    const body = actor?.system;
    if (!constitutionIsFatal(body)) {
      const { trySparingGuards } = await import("./death-guard-workflow.mjs");
      const spared = await trySparingGuards(actor);
      if (spared) { out.spared = spared; return out; }
    }
  }
  // AN INSTANT DEATH IS SETTLED BEFORE THE SKULL (3.621.0; block 39's A8).
  // "When you die, you're no longer doomed" — so Doomed comes off, and Dying
  // is set past the Death State Doomed no longer lowers, which keeps the
  // creature dead by the ordinary rule once it is gone. The cause is
  // returned for the death card.
  out.cause = instantDeathOf(actor);
  if (/^Doomed/.test(out.cause)) {
    try {
      const base = Math.max(0, Math.floor(Number(actor.system?.combat?.deathState ?? 5)));
      await actor.toggleStatusEffect("dying", { value: base + 1 });
      await actor.toggleStatusEffect("doomed", { active: false });
    } catch (_e) {
      // The death stands without it; only the tidy-up is lost.
    }
  }
  // The skull, as a token OVERLAY rather than a small corner icon — this is
  // the "skull icon on their scene icon" Graham asked for, and overlay is
  // what makes it the large centred one rather than one more status pip.
  try {
    if (!actor.statuses?.has?.("dead")) {
      await actor.toggleStatusEffect("dead", { active: true, overlay: true });
    }
    out.skulled = true;
  } catch (_e) {
    // A token-less actor, or a client without permission. Removal from the
    // tracker below is the half that actually stops the dying checks, so a
    // failure to draw a skull must not prevent it.
  }

  // EXTRAPLANAR (3.633.0, F&F 3.0 R14): "immediately destroyed when it dies
  // on the material plane". The card, once; the token is the GM's.
  try {
    const { announceExtraplanarDestruction } = await import("../extraplanar-workflow.mjs");
    out.extraplanar = await announceExtraplanarDestruction(actor);
  } catch (_e) {
    // The death stands; only the card is lost.
  }

  const encounter = combat ?? game.combat ?? null;
  if (!encounter) return out;

  // Out of the initiative order. This is what stops the turn-start dying
  // check running for a corpse: no combatant, no turn, no check.
  //
  // MATCHED BY TOKEN, NOT BY ACTOR ID. Unlinked tokens stamped from the same
  // statblock — four Goblin Warriors from one "Goblin Warrior" actor, the
  // commonest NPC setup there is — all report the SAME `actor.id`, because a
  // synthetic token actor borrows the base actor's id. Filtering on it
  // therefore reaped every goblin in the encounter the moment one of them
  // died. Found live on 13 Aug 2026: Goblin Warrior 2 died, and Goblin
  // Warrior 1 — alive at Dying 3 against Death State 5 — vanished from the
  // tracker beside it.
  //
  // `actor.token` is the TokenDocument for a synthetic actor and null for a
  // linked one, so the fallback covers PCs, where the actor id IS unique.
  const tokenId = actor.token?.id ?? null;
  const combatants = Array.from(encounter.combatants ?? []).filter((c) =>
    tokenId ? c.tokenId === tokenId : c.actor?.id === actor.id
  );
  if (!combatants.length) return out;

  // TWO REAPERS CAN RACE FOR ONE CORPSE, and one of them loses.
  //
  // Found by driving a Death critical on 1 September 2026. The critical
  // path pushes Dying past the Death State and then calls this; that
  // condition write also wakes the death watch, which calls this too.
  // Both read the combatant list before either delete landed, both asked
  // the server to remove the same id, and the second came back
  // `Combatant "XPdoH6lGbLaFJzWX" does not exist!` — thrown out of
  // `rollCriticalInjury`, abandoning everything the critical had left to
  // do (Savage Strikes, bleed, the rest of the card). The creature died
  // correctly and the attack fell over on its way out.
  //
  // THE DEATH WATCH'S `inFlight` SET CANNOT COVER THIS: it is private to
  // that module and guards only its own re-entry, so a direct caller —
  // which is exactly what the critical path is — walks straight past it.
  // The defence belongs HERE, at the one place that actually deletes.
  //
  // RE-READ, THEN TOLERATE. The list is checked again against the
  // collection at the moment of writing, and a delete that still loses
  // the race is swallowed rather than thrown: the goal is that the
  // combatant is gone, and if somebody else got there first that goal is
  // met. `removed` reports what THIS call did, so the announcement is
  // still made exactly once.
  const live = combatants.filter((c) => encounter.combatants?.get?.(c.id));
  if (!live.length) return out;

  try {
    await encounter.deleteEmbeddedDocuments("Combatant", live.map((c) => c.id));
    out.removed = true;
  } catch (error) {
    // Already reaped by the other caller between the check and the write.
    // Not an error worth propagating into an attack or a turn change.
    console.debug("TRG Prime | combatant already removed", error);
  }
  return out;
}

/**
 * Whether a death still needs acting on.
 *
 * ADDED 3.373.0, for a defect Graham reported: a character whose Dying
 * passed their Death State did not die. `isDead` said true and `reapDead`
 * worked — but nothing asked. Every caller of `reapDead` was a damage path
 * or a turn boundary, so a Dying value written any OTHER way (a GM setting
 * it on the sheet, a condition applied by an effect) left a dead character
 * in the initiative order, unskulled and unannounced, until their own turn
 * came round again.
 *
 * Driven live before the fix: Dying 6 against Death State 5, `isDead` true,
 * no skull, still in the tracker, no card. One full turn cycle later, the
 * same actor was correctly skulled, removed and announced — which is what
 * narrowed the defect from "death does not work" to "death is only noticed
 * at a turn boundary".
 *
 * The rule that was missing is therefore not "is this actor dead" — that
 * existed — but "is this actor dead and not yet dealt with". It lives here
 * as a pure predicate rather than inside the hook that calls it, because a
 * decision made inside a Foundry-only function is this project's most
 * expensive recurring defect shape.
 *
 * @param {boolean} dead Whether the actor is dead — from `isDead`.
 * @param {boolean} alreadySkulled Whether the dead marker is already set.
 * @returns {boolean}
 */
export function needsReaping(dead, alreadySkulled) {
  return Boolean(dead) && !alreadySkulled;
}

/**
 * Applies the recovery rule when Dying has reached 0.
 *
 * A FATAL INJURY REFUSES IT (page 193; the block-19 audit's D8, Graham's
 * R8 of 21 September 2026): "a character suffering from such an injury
 * cannot lose the Dying condition when making a recovery check and
 * therefore cannot be brought above 0 HP." So the condition is held at 1
 * instead of removed, and the caller is told why — every route out of
 * Dying passes through here, which is why the guard is here and not in
 * each of the four callers.
 *
 * @param {Actor} actor
 * @returns {Promise<{unconscious: boolean, fatigued: number, blocked?: boolean, note?: string}>}
 */
export async function applyDyingRecovery(actor, { noFatigue = false } = {}) {
  const hp = Number(actor?.system?.resources?.hp?.value ?? 0);
  const current = Number(actor?.getConditionValue?.("fatigued") ?? 0) || 0;
  // A RECOVERY THAT COSTS NO FATIGUE (3.611.0) — Death's Defiance: "If the
  // target had the Dying condition, coming back from dying due to this
  // healing doesn't increase its Fatigued condition."
  const recovered = recoveryState(hp, current);
  const state = noFatigue ? { ...recovered, fatigued: current } : recovered;

  const { mayLeaveDying, fatalBlockNote } = await import("../injury-workflow.mjs");
  if (!mayLeaveDying(actor)) {
    await actor.toggleStatusEffect("dying", { value: 1 });
    return { unconscious: true, fatigued: Number(actor?.getConditionValue?.("fatigued") ?? 0) || 0,
      blocked: true, note: fatalBlockNote(actor) };
  }

  await actor.toggleStatusEffect("dying", { active: false });
  if (state.unconscious) {
    await actor.toggleStatusEffect("unconscious", { active: true });
  }
  // NOT TOUCHED WHEN THE RECOVERY COSTS NOTHING (3.611.1, F2 of the
  // 3.611.0 drive). Setting fatigued to the current value was meant as a
  // no-op, and for a character with none it CREATED "Fatigued 0", which
  // reads as fatigued 1.
  if (!noFatigue) await actor.toggleStatusEffect("fatigued", { value: state.fatigued });
  return state;
}

/**
 * Clears Unconscious once a character is back above 0 HP.
 *
 * "…unless you are brought to 1+ HP, in which case you lose the Unconscious
 * condition." Called wherever hit points rise, since the clause is about the
 * hit points changing rather than about who changed them.
 *
 * Deliberately does NOT touch a character who is still Dying: Dying is the
 * stronger state and owns its own exit, through `applyDyingRecovery`.
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>} Whether Unconscious was cleared.
 */
/**
 * Where Dying must come down to when a Death State bonus ends (3.630.0):
 * Worldroot Fragment — "reduce your Dying condition to your normal Death
 * State if it is currently higher". Null when nothing changes. Pure.
 */
export function dyingTrimmedTo(dying, deathState) {
  const d = Number(dying) || 0;
  const limit = Number(deathState) || 0;
  return d > limit && limit > 0 ? limit : null;
}

export async function clearUnconsciousIfConscious(actor) {
  if (!actor?.hasCondition?.("unconscious")) return false;
  if (actor.hasCondition?.("dying")) return false;
  if (Number(actor.system?.resources?.hp?.value ?? 0) <= 0) return false;
  // THE OTHER HALF OF THE WAKING RACE (3.630.1, F3 — found again on the
  // retest). The wake in condition-events-workflow deletes the same effect
  // on the HP change this heal made; the toggle here then asked the server
  // to delete an effect already gone, threw, and aborted every row after the
  // heal (Divine Nectar). A loss to the other path is no failure.
  try {
    await actor.toggleStatusEffect("unconscious", { active: false });
  } catch (_e) {
    return !actor.hasCondition?.("unconscious");
  }
  return true;
}

export { SYSTEM_ID as DEATH_STATE_SYSTEM_ID };

/**
 * What a Death or Fatal critical does once its save is known.
 *
 * NEW at 3.457.0. Pure.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOURTEEN ROWS SAID "TARGET DIES INSTANTLY" AND NOBODY DIED.
 *
 * Graham, 1 September 2026, reporting that a previous ruling had not
 * taken: NPCs should leave the initiative tracker the moment they die,
 * "so Dying exceeds death state OR death is gained through critical".
 * The first half worked — `reapDead` has covered it since 13 August. The
 * second half had never been built.
 *
 * WHAT WAS ACTUALLY WRONG, measured before anything was written. The
 * critical tables carry a structured `persistence` of "Death" (10 rows)
 * or "Fatal" (4 rows), and `deathOrFatalSave` already computed the save
 * and the DC for them. But the workflow only ever PRINTED that sentence
 * and reduced the target to 0 HP — so the deadliest results in the game
 * left a creature at Dying 1 against Death State 5, upright in the
 * tracker, and the printed words "Skull obliterated. Target dies
 * instantly." changed nothing at all.
 *
 * GRAHAM'S THREE RULINGS, 1 September 2026:
 *   - the system ROLLS the save it already knows the DC for, and a
 *     FAILURE kills outright;
 *   - a SUCCESS re-looks-up the table at result − 10, which the printed
 *     rule always said and the card used to hand to the GM;
 *   - it applies to PLAYER CHARACTERS TOO — "the rule is the rule".
 *     PCs have their own outs (Deathless runes, Conviction) and carving
 *     out an exception the book does not print would be inventing one.
 *
 * DEATH IS STILL A STATE, NOT A FLAG. The system has no separate "dead"
 * condition to set — `dying-workflow.mjs` says so in as many words — so
 * dying by critical is expressed exactly the way dying by Dying Check is:
 * push the Dying value one past the effective Death State and reap. One
 * representation, one reaper, one place to change.
 *
 * @param {object|null} save what `deathOrFatalSave` returned, or null
 * @param {number} saveTotal the save roll's total
 * @param {number} result the critical result that was rolled
 * @returns {{applies: boolean, died: boolean, newResult: number|null}}
 */
export function deathCriticalOutcome(save, saveTotal, result) {
  if (!save) return { applies: false, died: false, newResult: null };
  const total = Number(saveTotal);
  const dc = Number(save.dc);
  // A NON-FINITE TOTAL IS A FAILED SAVE, not a skipped rule. The save is
  // rolled by this system; if it could not be rolled the creature has not
  // resisted anything, and treating that as a pass would make the
  // deadliest row in the game safer when something goes wrong.
  const passed = Number.isFinite(total) && Number.isFinite(dc) && total >= dc;
  if (passed) {
    const lowered = Math.max(1, Math.floor(Number(result) || 0) - Number(save.reduction ?? 10));
    return { applies: true, died: false, newResult: lowered };
  }
  return { applies: true, died: true, newResult: null };
}
