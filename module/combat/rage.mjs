/**
 * Rage (Chapter 4 — Invoke Rage / Revoke Rage). Pure logic;
 * rage-workflow.mjs drives the Foundry side.
 *
 * Both actions are unusual in the same way: their AP cost is the
 * *result* of the check, not an input to it ("Action varies"). Every
 * other action in this project spends AP before rolling; these two
 * cannot, so the workflow defers the spend until the degree is known
 * and reads the cost from here.
 *
 * Sparse tables, interpolated and recorded rather than silently
 * assumed (the convention used throughout this project):
 *
 * - Invoke Rage lists no Partial. Success already occupies the slowest
 *   successful entry (3 actions, the cap) and Failure already allows a
 *   re-roll next round, so there is no stated room between them:
 *   Partial is read as Failure. Inventing a "partial rage" would be
 *   inventing a mechanic the rulebook doesn't describe.
 * - Neither action lists a Blunder. Both are read as their Fumble, the
 *   worst stated result, rather than manufacturing something harsher.
 * - Revoke Rage lists no Heroic. Read as at least as good as Critical
 *   (1 action) — the established convention in this codebase, already
 *   used for Spell Concentration.
 *
 * Left deliberately unresolved: the rulebook says Revoke Rage's
 * difficulty is "based upon your original Invoke Rage Result" but never
 * gives the mapping. Per Graham directly, that clause is set aside
 * pending a rules revision — Revoke Rage is a plain level-based check
 * at Medium until then.
 */
import { stepDifficultyHarder } from "../dice/resolution.mjs";

/** The name of the Active Effect that *is* the rage state. */
export const RAGE_EFFECT_NAME = "Raging";

/** Rage lasts 1 minute unless revoked earlier. */
export const RAGE_DURATION_SECONDS = 60;

/**
 * The same minute, counted in rounds. A round is six seconds.
 *
 * BOTH ARE NEEDED, and it is not belt-and-braces. Foundry's world clock
 * does not necessarily advance during combat, and combat rounds do not
 * exist outside an encounter — so a rage measured only in seconds never
 * ends in a fight, and one measured only in rounds never ends in a
 * corridor. Graham's ruling was "one minute of game time", and game time
 * is read off whichever of the two clocks is actually running.
 */
export const RAGE_DURATION_ROUNDS = RAGE_DURATION_SECONDS / 6;

/**
 * When a rage begun now should end, on both clocks.
 *
 * NEW at 3.416.0, because until then NOTHING ENDED A RAGE. `endRage` had
 * exactly one caller — a SUCCESSFUL Revoke Rage roll — so the printed
 * minute was decorative, and a fumbled Revoke set `mustRideOut`, which
 * refuses every further attempt while waiting for a minute that was
 * measured nowhere. Found in Graham's live session on 26 August 2026:
 * combat ended with the rage still running, and there was no way out of
 * it from inside the system at all.
 *
 * Stamped at `beginRage` rather than computed at expiry, for the reason
 * every timed effect here is stamped: "when does this end" has one
 * answer, decided once, by the code that knows when it started.
 *
 * @param {object} options
 * @param {number} [options.worldTime] `game.time.worldTime` at the start
 * @param {number|null} [options.round] the combat round, or null if none
 * @returns {{endsAtWorldTime: number, endsOnRound: number|null}}
 */
export function rageExpiry({ worldTime = 0, round = null } = {}) {
  const start = Number(worldTime) || 0;
  const startRound = round === null || round === undefined ? null : Number(round) || 0;
  return {
    endsAtWorldTime: start + RAGE_DURATION_SECONDS,
    endsOnRound: startRound === null ? null : startRound + RAGE_DURATION_ROUNDS
  };
}

/**
 * Has the minute run out?
 *
 * EITHER CLOCK ENDS IT. Whichever one is moving measures the minute; the
 * other never reaches its mark and costs nothing.
 *
 * A RAGE WITH NO STAMP FALLS BACK TO FOUNDRY'S OWN CLOCK (3.417.1).
 *
 * 3.416.0 said such a rage had simply not expired, on the grounds that
 * "inventing a start time would end someone's rage at a moment nobody
 * chose". THAT REASONING WAS WRONG, and Throngar Redtusk proved it a day
 * later: his stuck rage carried `duration: {seconds: 60}` and Foundry
 * computed `remaining: -9459`. The start time was never missing. Foundry
 * had recorded it from the beginning and nothing had ever read it —
 * which is the same defect the release was written to fix, one level
 * down, in the fix itself.
 *
 * So there is no invention here: `durationRemaining` is the effect's own
 * recorded countdown, and a rage whose own clock has run out is over.
 * Only a rage with NEITHER a stamp NOR a countdown is genuinely
 * unmeasurable, and that one still waits to be revoked or switched off.
 *
 * @param {object|null} state the stored rage flag
 * @param {object} now {worldTime, round, durationRemaining}
 * @returns {boolean}
 */
export function rageHasElapsed(state, { worldTime = null, round = null, durationRemaining = null } = {}) {
  if (!state) return false;
  const stamped = (state.endsAtWorldTime ?? null) !== null || (state.endsOnRound ?? null) !== null;
  if (!stamped) {
    // Pre-3.416.0: read the effect's own Foundry countdown instead.
    return durationRemaining !== null && Number(durationRemaining) <= 0;
  }
  const byTime = state.endsAtWorldTime !== undefined && state.endsAtWorldTime !== null
    && worldTime !== null && Number(worldTime) >= Number(state.endsAtWorldTime);
  const byRound = state.endsOnRound !== undefined && state.endsOnRound !== null
    && round !== null && Number(round) >= Number(state.endsOnRound);
  return Boolean(byTime || byRound);
}

/** The circumstance bonus rage grants, and the DB penalty it costs. */
export const RAGE_BONUS = 2;
export const RAGE_DB_PENALTY = -2;

/** Fatigue taken when a rage ends normally, and after a fumbled Revoke. */
export const RAGE_FATIGUE = 1;
export const RAGE_FUMBLE_FATIGUE = 2;

/** Fatigue from rage lasts an hour — 3600 seconds. */
export const RAGE_FATIGUE_SECONDS = 3600;

const RAGE_TEMP_HP_MULTIPLIER = 20;

/**
 * Temporary HP granted on entering a rage: "temporary HP equal to your
 * class bonus x 20".
 *
 * @param {number} classBonus
 * @returns {number} Never negative — a missing or nonsense class bonus
 *   grants nothing rather than draining the actor.
 */
export function rageTemporaryHP(classBonus) {
  const bonus = Number(classBonus);
  if (!Number.isFinite(bonus) || bonus <= 0) return 0;
  return Math.floor(bonus) * RAGE_TEMP_HP_MULTIPLIER;
}

/**
 * Invoke Rage: how many actions it took, and whether a rage started.
 *
 * @param {string} degree A degree key.
 * @returns {{apCost: number, raging: boolean, confused: boolean}}
 */
export function invokeRageResult(degree) {
  switch (degree) {
    case "heroic":
      return { apCost: 1, raging: true, confused: false };
    case "critical":
      return { apCost: 2, raging: true, confused: false };
    case "success":
      return { apCost: 3, raging: true, confused: false };
    // Partial reads as Failure; see this file's header.
    case "partial":
    case "failure":
      return { apCost: 3, raging: false, confused: false };
    // Blunder reads as Fumble; see this file's header.
    case "fumble":
    case "blunder":
      return { apCost: 3, raging: true, confused: true };
    default:
      return { apCost: 3, raging: false, confused: false };
  }
}

/**
 * Revoke Rage: how many actions it took, whether the rage ended, and
 * how much Fatigue is owed when it eventually does.
 *
 * @param {string} degree A degree key.
 * @returns {{apCost: number, ended: boolean, mustRideOut: boolean, fatigue: number}}
 */
export function revokeRageResult(degree) {
  switch (degree) {
    // Heroic reads as Critical; see this file's header.
    case "heroic":
    case "critical":
      return { apCost: 1, ended: true, mustRideOut: false, fatigue: RAGE_FATIGUE };
    case "success":
      return { apCost: 2, ended: true, mustRideOut: false, fatigue: RAGE_FATIGUE };
    case "partial":
      return { apCost: 3, ended: true, mustRideOut: false, fatigue: RAGE_FATIGUE };
    case "failure":
      return { apCost: 3, ended: false, mustRideOut: false, fatigue: RAGE_FATIGUE };
    // Blunder reads as Fumble; see this file's header.
    case "fumble":
    case "blunder":
      return { apCost: 3, ended: false, mustRideOut: true, fatigue: RAGE_FUMBLE_FATIGUE };
    default:
      return { apCost: 3, ended: false, mustRideOut: false, fatigue: RAGE_FATIGUE };
  }
}

/**
 * The difficulty of the next attempt to extend a rage.
 *
 * Per Graham directly: a level-based check with no stated modifier is
 * always Medium, and "the difficulty of this check increases by one step
 * each time" counts from there — so the first extension is Hard (+2),
 * the second Very Hard (+5), the third Incredibly Hard (+10), and the
 * fourth Impossible, which the difficulty ladder already resolves as an
 * automatic failure. No rage can be extended a fourth time; that falls
 * out of the table rather than being enforced separately.
 *
 * @param {number} previousExtensions How many times this rage has
 *   already been extended.
 * @returns {string} A DIFFICULTIES key.
 */
export function rageExtensionDifficulty(previousExtensions = 0) {
  const used = Math.max(0, Math.floor(Number(previousExtensions) || 0));
  let difficulty = "medium";
  for (let step = 0; step <= used; step++) {
    difficulty = stepDifficultyHarder(difficulty);
  }
  return difficulty;
}

/**
 * Whether an extension check's degree keeps the rage going.
 *
 * The rulebook gives the extension no outcome table of its own, only the
 * check and its escalating difficulty. Read conservatively: a success or
 * better extends, anything less does not — Partial included, matching
 * how Refocus already treats a Partial as a failure you may retry rather
 * than a qualified success. Recorded as an interpolation, not assumed.
 *
 * @param {string} degree
 * @returns {boolean}
 */
export function rageExtensionSucceeds(degree) {
  return ["heroic", "critical", "success"].includes(degree);
}

/**
 * The bonus package applied while raging, as bonus-pool change keys.
 *
 * "A +2-circumstance bonus to all Strength and Constitution based
 * checks" needs interpreting against this system's actual data: only
 * Athletics is Strength-keyed and no skill at all is Constitution-keyed,
 * so the literal skill-only reading would touch a single skill. Per
 * Graham directly, it covers Athletics, Fortitude saves (the one real
 * Constitution-based check here), Strength-based attack rolls, and the
 * base damage of Strength-based attacks (that last one applied at
 * damage time, not here — a damage formula isn't a bonus pool).
 *
 * The attack-roll half is decided when the rage begins rather than
 * expressed conditionally: an Active Effect can't ask "is this actor's
 * attack ability Strength?", so the caller passes the answer in.
 *
 * @param {object} [options]
 * @param {string} [options.attackAbilityKey] The actor's attack ability.
 * @returns {Array<{key: string, value: number}>}
 */
export function rageEffectChanges({ attackAbilityKey = "strength" } = {}) {
  const changes = [
    { key: "system.skills.athletics.circumstance", value: RAGE_BONUS },
    { key: "system.combat.saves.fortitude.circumstance", value: RAGE_BONUS },
    { key: "system.combat.saves.will.circumstance", value: RAGE_BONUS },
    { key: "system.combat.defence.circumstance", value: RAGE_DB_PENALTY }
  ];
  if (attackAbilityKey === "strength") {
    changes.push({ key: "system.combat.attack.circumstance", value: RAGE_BONUS });
  }
  return changes;
}

/**
 * Whether an attack draws on Strength, and so takes rage's damage
 * bonus. Melee attacks always do; missile attacks only with the
 * Propulsive trait, which is exactly when this system already adds a
 * Strength modifier to their damage at all.
 *
 * @param {object} weaponSystem A weapon item's system data.
 * @returns {boolean}
 */
export function isStrengthBasedAttack(weaponSystem = {}) {
  const isMelee = (weaponSystem.attackMode ?? "melee") !== "missile";
  if (isMelee) return true;
  return /\bpropulsive\b/i.test(String(weaponSystem.traits ?? ""));
}

function traitList(traits) {
  return String(traits ?? "")
    .split(",")
    .map((trait) => trait.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether rage forbids an action, and why.
 *
 * Two of the three restrictions are genuinely detectable from data this
 * project already carries: actions record their traits, so "you cannot
 * use any action which has the Defence trait" and "you cannot use
 * actions with the concentrate trait unless they also have the rage
 * trait" are real checks rather than reminders. Revoke Rage is itself a
 * Concentrate action carrying the Rage trait, so it stays available by
 * the rule's own wording rather than by an exception.
 *
 * @param {object} action An action definition with a `traits` string.
 * @returns {{blocked: boolean, reason: string}}
 */
export function rageBlocksAction(action = {}) {
  const traits = traitList(action.traits);

  if (traits.includes("defence") || traits.includes("defense")) {
    return {
      blocked: true,
      reason: "you cannot use actions with the Defence trait while raging"
    };
  }

  if (traits.includes("concentrate") && !traits.includes("rage")) {
    return {
      blocked: true,
      reason:
        "you cannot use Concentrate actions while raging unless they also have the Rage trait"
    };
  }

  return { blocked: false, reason: "" };
}
