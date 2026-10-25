/**
 * Drowning and suffocation — the Foundry side of drowning.mjs (page 202).
 *
 * NEW at 3.580.0, for the block-20 audit's D3 and Graham's R3 of
 * 21 September 2026: "Yes", with a Suffocating condition the critical
 * tables and the breath-holding feat can point at.
 *
 * WHERE THE AIR LIVES. One flag on the actor, `drowning`, carrying the
 * rounds remaining and how many suffocation saves have been made:
 *
 *   { air: 7, capacity: 7, checks: 0 }
 *
 * ON THE ACTOR, NOT THE TOKEN, deliberately — and it is the one thing in
 * this file to be careful about. An unlinked token's synthetic actor
 * writes flags into its own delta, which is what makes two tokens of one
 * NPC hold their breath separately; a LINKED token and its sidebar actor
 * are one creature and share one lungful. That is the behaviour wanted
 * both times, and it is the same distinction that cost three releases in
 * block 19, so it is written down rather than assumed.
 */

import { findMarker } from "./magic/markers.mjs";
import { isActingGM } from "./acting-gm.mjs";
import { DEGREES, DEGREE_BY_KEY } from "./dice/resolution.mjs";
import {
  airLostToEvent,
  airRestored,
  airSpentThisTurn,
  breathCapacity,
  spendAir,
  suffocationOutcome,
  suffocationSave
} from "./drowning.mjs";
import { abilityBreathMultiplier, breathesWaterSource } from "./creature-ability-rules.mjs";

const SYSTEM_ID = "trg-prime";

/** The flag that holds a creature's remaining air. */
const DROWNING_FLAG = "drowning";

/**
 * "ON A CRITICAL FAILURE, YOU DIE" — WHICH DEGREE IS THAT?
 *
 * Graham, 21 September 2026: "the critical failure for drowning should
 * be fumble." So FUMBLE is the named threshold, and the test is that
 * degree OR WORSE, read off the ladder's own ranks rather than typed out
 * as a list of keys. A Blunder is a worse roll than a Fumble
 * (dice/resolution.mjs: fails by 20+ against fails by 10+), so a rule
 * that killed on the Fumble and spared the Blunder would make the worse
 * roll the safer one.
 *
 * DERIVED, NOT LISTED (3.580.3). A hand-written `["fumble", "blunder"]`
 * is two more strings I would have to keep true by hand — and every
 * defect this block cost was a name believed rather than measured. The
 * ladder is the source; this reads the rank of the named degree from it
 * and takes everything at or below.
 */
const CRITICAL_FAILURE_DEGREE = "fumble";

/** Every degree at or below the named one, by rank. */
const CRITICAL_FAILURE_DEGREES = Object.freeze(
  DEGREES.filter((d) => d.rank <= (DEGREE_BY_KEY[CRITICAL_FAILURE_DEGREE]?.rank ?? -1))
    .map((d) => d.key));

/** The feat that multiplies a lungful, by name, as the pack writes it. */
const LONG_BREATH_FEATS = Object.freeze([["aquatic adaptation", 10]]);

const card = (actor, title, body, flags = null) => ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content:
    '<div class="trg-prime trg-check-card"><header class="check-header">'
    + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
    + `<h3>${title}</h3></div></header>`
    + `<p style="margin:2px 0">${body}</p></div>`,
  ...(flags ? { flags } : {})
});

/**
 * The state, or null when this creature is breathing normally.
 *
 * NOT EXPORTED, with `rollSuffocationSave` beside it: nothing outside
 * this file asks either question yet, and an export with no caller is
 * what the uncalled-export ratchet exists to catch. Both become exports
 * the moment something needs them.
 */
function drowningState(actor) {
  const raw = actor?.getFlag?.(SYSTEM_ID, DROWNING_FLAG) ?? null;
  if (!raw || typeof raw !== "object") return null;
  return {
    air: Math.max(0, Math.trunc(Number(raw.air) || 0)),
    capacity: Math.max(0, Math.trunc(Number(raw.capacity) || 0)),
    checks: Math.max(0, Math.trunc(Number(raw.checks) || 0)),
    // Carried, so every rewrite of the state keeps Quicksand's nonlethal.
    ...(raw.nonlethal ? { nonlethal: true } : {}),
    ...(raw.source ? { source: String(raw.source) } : {})
  };
}

/** How many times over this creature can hold its breath. */
function breathMultiplier(actor) {
  const names = Array.from(actor?.items ?? [])
    .filter((i) => i.type === "feat")
    .map((i) => String(i.name).trim().toLowerCase());
  let best = 1;
  for (const [name, factor] of LONG_BREATH_FEATS) {
    if (names.includes(name) && factor > best) best = factor;
  }
  // HOLD BREATH (Creature Codex; 3.631.0): "10 x the normal amount".
  return Math.max(best, abilityBreathMultiplier(Array.from(actor?.items ?? [])));
}

/**
 * What says this creature does not breathe — the label of an applied effect
 * declaring `doesNotBreathe` — or "" when it breathes. (3.627.0)
 */
function doesNotBreatheSource(actor) {
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (!effect?.disabled && effect?.flags?.[SYSTEM_ID]?.doesNotBreathe === true) return String(effect.name ?? "No Need to Breathe");
  }
  return "";
}

/**
 * Start holding your breath.
 *
 * "You can hold your breath for a number of rounds equal to 5 + Con or 1
 * round whichever is greater."
 *
 * @param {Actor} actor
 * @returns {Promise<number>} the rounds now held
 */
export async function startHoldingBreath(actor, { nonlethal = false, source = "" } = {}) {
  if (!actor) return 0;
  // A CREATURE THAT BREATHES WATER HOLDS NOTHING (3.617.0, block 37's B5):
  // Water Breathing — the spell, or the potion that carries it.
  if (findMarker(actor, "waterBreathing")) {
    await card(actor, "Breathing Water", "Breathes underwater — no breath to hold (Water Breathing).");
    return 0;
  }
  // …OR BY NATURE (3.664.0; Inner Tempest's Zennyo, `derives.breathesWater`).
  const amphibious = breathesWaterSource(Array.from(actor?.items ?? []));
  if (amphibious) {
    await card(actor, "Breathing Water", `Breathes underwater — no breath to hold (${amphibious}).`);
    return 0;
  }
  // …AND ONE THAT DOES NOT BREATHE AT ALL (3.627.0). Pillars of Faith's
  // Shared Unliving Base Mods: "does not need to breathe and cannot suffocate
  // from lack of air." Declared on an applied effect, `doesNotBreathe: true`.
  const breathless = doesNotBreatheSource(actor);
  if (breathless) {
    await card(actor, "No Need to Breathe", `${actor.name} does not breathe — no breath to hold (${breathless}).`);
    return 0;
  }
  const existing = drowningState(actor);
  if (existing) return existing.air;
  const capacity = breathCapacity(
    Number(actor.system?.attributes?.constitution?.total ?? 0),
    breathMultiplier(actor));
  // QUICKSAND (3.620.0; Chapter 12's environmental damage table, Graham's
  // R15): "Nonlethal — suffocation rules apply". The clock is this one; the
  // damage it deals is recorded as nonlethal, and the card names the cause.
  await actor.setFlag(SYSTEM_ID, DROWNING_FLAG, { air: capacity, capacity, checks: 0, ...(nonlethal ? { nonlethal: true } : {}), ...(source ? { source: String(source) } : {}) });
  await card(actor, source ? `Holding Breath — ${source}` : "Holding Breath",
    `<strong>${capacity} round${capacity === 1 ? "" : "s"}</strong> of air (5 + Con, minimum 1`
    + `${breathMultiplier(actor) > 1 ? `, multiplied by a feat` : ""}) — page 202.`);
  return capacity;
}

/**
 * Air is back: "you stop suffocating and are no longer unconscious…
 * you only regain consciousness if there are no other factors causing
 * the condition."
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function restoreAir(actor) {
  if (!drowningState(actor) && !actor?.hasCondition?.("suffocating")) return false;
  const otherReasonUnconscious = Number(actor.system?.resources?.hp?.value ?? 1) <= 0
    || Boolean(actor.hasCondition?.("dying"))
    || Boolean(actor.hasCondition?.("dead"));
  const outcome = airRestored({ otherReasonUnconscious });

  await actor.unsetFlag(SYSTEM_ID, DROWNING_FLAG);
  if (actor.hasCondition?.("suffocating")) {
    await actor.toggleStatusEffect("suffocating", { active: false });
  }
  if (outcome.wakes) {
    await actor.toggleStatusEffect("unconscious", { active: false });
  }
  await card(actor, "Air Restored",
    outcome.wakes
      ? "No longer suffocating, and no longer unconscious (page 202)."
      : "No longer suffocating — but <strong>still unconscious</strong>: page 202 only "
        + "returns you to consciousness if nothing else is holding you down.");
  return true;
}

/**
 * Spend air for an event rather than a turn: "you also lose 1 round
 * worth of air each time you are critically hit or critically fail a
 * save against a damaging effect. If you speak… you lose all remaining
 * air."
 *
 * @param {Actor} actor
 * @param {{criticallyHit?: boolean, criticalSaveFailure?: boolean, spoke?: boolean}} event
 * @returns {Promise<number|null>} the air left, or null if not holding
 */
export async function loseAirToEvent(actor, event = {}) {
  const state = drowningState(actor);
  if (!state) return null;
  const cost = airLostToEvent(event);
  if (!cost) return state.air;
  const spent = spendAir(state.air, cost);
  await actor.setFlag(SYSTEM_ID, DROWNING_FLAG, { ...state, air: spent.remaining });
  await card(actor, "Air",
    event.spoke
      ? "<strong>Speaking underwater costs everything.</strong> All remaining air is gone (page 202)."
      : `Air spent: <strong>${cost}</strong> — ${spent.remaining} round`
        + `${spent.remaining === 1 ? "" : "s"} left.`);
  if (spent.ranOut) await beginSuffocating(actor);
  return spent.remaining;
}

/** "When you run out of air, you fall unconscious and start suffocating." */
async function beginSuffocating(actor) {
  if (actor.hasCondition?.("suffocating")) return;
  await actor.toggleStatusEffect("suffocating", { active: true });
  await card(actor, "Out of Air",
    `<strong>${actor.name} runs out of air</strong> — unconscious and suffocating, and cannot `
    + "recover from the unconscious while it lasts (page 202).");
}

/**
 * The end-of-turn tick: air first, then the suffocation save once it has
 * run out.
 *
 * ONE OR THE OTHER, NEVER BOTH IN A TURN. A creature that runs out of
 * air on this turn's tick starts suffocating now and makes its first
 * save at the END OF ITS NEXT TURN — "when you run out of air, you fall
 * unconscious and start suffocating… must attempt a Fortitude save… at
 * the end of each of your turns" reads as the state beginning here and
 * the saves belonging to the turns that follow it.
 *
 * @param {Actor} actor
 * @param {{actedViolently?: boolean}} [turn]
 * @returns {Promise<boolean>} whether anything happened
 */
export async function advanceDrowningAtTurnEnd(actor, { actedViolently = false } = {}) {
  if (!actor || !isActingGM()) return false;

  if (actor.hasCondition?.("suffocating")) {
    await rollSuffocationSave(actor);
    return true;
  }

  const state = drowningState(actor);
  if (!state) return false;

  const cost = airSpentThisTurn({ actedViolently });
  const spent = spendAir(state.air, cost);
  await actor.setFlag(SYSTEM_ID, DROWNING_FLAG, { ...state, air: spent.remaining });
  await card(actor, "Air",
    `Air spent: <strong>${cost}</strong>${actedViolently ? " (attacked or cast this turn)" : ""} — `
    + `<strong>${spent.remaining}</strong> round${spent.remaining === 1 ? "" : "s"} left.`
    // THE ONE TRIGGER WITH NO HOME OF ITS OWN. "You also lose 1 round
    // worth of air each time you are critically hit or critically fail a
    // save against a damaging effect." The critical hit is applied where
    // criticals are rolled; the save is not, because nothing in this
    // system knows in one place that a save was against a DAMAGING
    // effect — dozens of paths roll saves and only the caller knows what
    // was at stake. So it is a button rather than a claim.
    + '<br><button type="button" data-action="spendAirRound" style="width:100%;margin-top:4px">'
    + "Critical failure on a save against a damaging effect — spend 1 more round of air</button>",
    { [SYSTEM_ID]: { spendAirRound: { actorUuid: actor.uuid } } });
  if (spent.ranOut) await beginSuffocating(actor);
  return true;
}

/**
 * One suffocation save.
 *
 * "attempt a Fortitude save, needing to achieve 20 or greater, at the end
 * of each of your turns. On a failure, you take 10 damage (untyped), and
 * on a critical failure, you die. On each check after the first, you take
 * a cumulative -2 penalty to the save and the damage increases by 5."
 *
 * @param {Actor} actor
 * @returns {Promise<object|null>}
 */
async function rollSuffocationSave(actor) {
  const state = drowningState(actor) ?? { air: 0, capacity: 0, checks: 0 };
  const plan = suffocationSave(state.checks);

  const { TRGCheck } = await import("./dice/check.mjs");
  const fortitude = actor.system?.combat?.saves?.fortitude;
  const modifiers = [{
    label: "Fortitude", value: Number(fortitude?.total ?? 0), type: "untyped"
  }];
  if (plan.penalty) {
    modifiers.push({ label: "Suffocating", value: plan.penalty, type: "status" });
  }
  const check = await TRGCheck.roll({
    actor,
    label: "Suffocation — Fortitude",
    subtitle: `DC ${plan.dc}${plan.penalty ? ` (${plan.penalty} cumulative)` : ""}`,
    type: "save",
    dc: plan.dc,
    modifiers
  });

  const outcome = suffocationOutcome({
    total: Number(check?.outcome?.total ?? 0),
    dc: plan.dc,
    // "on a critical failure, you die" — and THIS SYSTEM'S LADDER HAS NO
    // SUCH FIELD (3.580.2, F4). A degree carries `key`, `label`, `min`,
    // `rank` and `success` and nothing else, so `degree.criticalFailure`
    // was `undefined` on every save ever made and page 202's death could
    // never fire: drowning could only ever kill by hit points.
    //
    // The degree it IS, is Fumble — Graham's ruling — or worse.
    criticalFailure: CRITICAL_FAILURE_DEGREES.includes(
      String(check?.outcome?.degree?.key ?? "")),
    damage: plan.damage
  });

  await actor.setFlag(SYSTEM_ID, DROWNING_FLAG, { ...state, checks: state.checks + 1 });

  if (outcome.dies) {
    await actor.toggleStatusEffect("dead", { active: true });
    await card(actor, "Suffocation",
      "<strong>Critical failure — they die.</strong> Page 202.");
    return outcome;
  }
  if (outcome.passed) {
    await card(actor, "Suffocation",
      `Held on. The next check takes <strong>${suffocationSave(state.checks + 1).penalty}</strong> `
      + "and deals more if it fails (page 202).");
    return outcome;
  }

  // `dying-workflow`, MEASURED (3.580.1, F2). It was imported from
  // `damage-workflow` on the strength of its name, which threw
  // "applyDamageAndCheckDying is not a function" on the first failed
  // suffocation save — so nothing could actually drown. A dynamic import
  // of the wrong module is invisible to every check in the harness.
  const { applyDamageAndCheckDying } = await import("./combat/dying-workflow.mjs");
  await applyDamageAndCheckDying(actor, outcome.damage, { isCritical: false, nonlethal: Boolean(state.nonlethal) });
  await card(actor, "Suffocation",
    `<strong>${outcome.damage} damage</strong> (${state.nonlethal ? `nonlethal${state.source ? `, ${state.source}` : ""}` : "untyped"}). The next check takes `
    + `<strong>${suffocationSave(state.checks + 1).penalty}</strong> and deals `
    + `<strong>${suffocationSave(state.checks + 1).damage}</strong>.`);
  return outcome;
}
