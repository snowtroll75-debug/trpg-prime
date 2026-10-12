/**
 * Injuries — the Foundry side of injuries.mjs.
 *
 * NEW at 3.579.0 for the block-19 audit (D6, D8, D9, D10; Graham's
 * rulings R6, R8, R9, R10 of 21 September 2026). The rules themselves are
 * pure and live in injuries.mjs; this file is the trigger and the write.
 *
 * FOUR JOBS:
 *
 *   1. INCAPACITATION. The combined value of dazed + injured + weakened
 *      reaching 10 applies Unconscious, and dropping below 10 takes it
 *      off again — but only the Unconscious this rule applied, and never
 *      while the creature is down for another reason. Hooked, for the
 *      reason ability-collapse-workflow.mjs is hooked: three conditions
 *      change from dozens of places and there is no single site to call.
 *
 *   2. FATAL INJURIES. A critical whose Persistence column says Fatal or
 *      Death marks the creature; while the mark stands it cannot lose
 *      Dying and cannot be brought above 0 HP.
 *
 *   3. FAST HEALING AND REGENERATION reduce Injured on the world clock —
 *      hourly and every ten minutes — carrying the remainder, so a clock
 *      advanced in two half-hour steps heals once at the hour.
 *
 *   4. PERSISTENCE. UH clears at full HP (magically, or with ten minutes'
 *      rest after); FR clears on eight hours' sleep; P waits for the GM.
 */

import { isActingGM } from "./acting-gm.mjs";
import {
  INJURY_CONDITION_IDS,
  combinedInjuryValue,
  injuryHealingOverTime,
  injuryIncapacitationPlan,
  injuryRecovery,
  injurySeverity,
  injuryValueAfterStepDown,
  injuryHealingKey,
  isFatalPersistence,
  mayRecoverFromDying,
  persistenceCleared,
  persistenceCode,
  stepDownStaysTreated,
  FAST_HEALING_INJURY_SECONDS,
  REGENERATION_INJURY_SECONDS
} from "./injuries.mjs";

const SYSTEM_ID = "trg-prime";

/** Which Unconscious this rule owns, so it only lifts its own. */
const INCAPACITATION_FLAG = "injuryIncapacitation";

/** The unhealed Fatal injuries a creature carries. */
const FATAL_FLAG = "fatalInjuries";

/** Persistence entries waiting on full HP, a rest or a night's sleep. */
const PERSISTENCE_FLAG = "injuryPersistence";

/** Leftover seconds of the healing clocks, so nothing is lost to rounding. */
const HEALING_CLOCK_FLAG = "injuryHealingClock";

const inFlight = new Set();
const scheduled = new Map();

/* ------------------------------------------------------------------ */
/* 1. Incapacitation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Every status the creature is actually under, read from the effect
 * DOCUMENTS as well as the derived set.
 *
 * The same belt and braces ability-collapse-workflow.mjs uses, and for
 * the same defect: applying a condition is itself a document event, which
 * re-enters this rule through its own hooks before `actor.statuses` has
 * caught up. Without this the rule applies Unconscious twice.
 */
function presentStatuses(actor) {
  const out = new Set(actor?.statuses ?? []);
  for (const effect of actor?.effects ?? []) {
    if (effect?.disabled) continue;
    for (const status of effect?.statuses ?? []) out.add(status);
  }
  return Array.from(out);
}

/** Reasons to be unconscious that have nothing to do with injuries. */
function otherReasonToBeUnconscious(actor) {
  if (Number(actor?.system?.resources?.hp?.value ?? 1) <= 0) return true;
  const present = presentStatuses(actor);
  return present.includes("dying") || present.includes("dead");
}

/** The three injury conditions' current values. */
function injuryValues(actor) {
  const out = {};
  for (const id of INJURY_CONDITION_IDS) out[id] = Number(actor?.getConditionValue?.(id) ?? 0) || 0;
  return out;
}

/**
 * Settle one creature against the incapacitation rule.
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>} whether anything changed
 */
async function settleIncapacitation(actor) {
  try {
    if (!actor?.id || actor.documentName !== "Actor") return false;
    if (!isActingGM()) return false;
    if (inFlight.has(actor.id)) return false;

    const combined = combinedInjuryValue(injuryValues(actor));
    const owned = Boolean(actor.getFlag?.(SYSTEM_ID, INCAPACITATION_FLAG));
    // The common case costs nothing: no injuries, nothing owned.
    if (!combined && !owned) return false;

    const plan = injuryIncapacitationPlan({
      combined,
      owned,
      present: presentStatuses(actor),
      otherReasonUnconscious: otherReasonToBeUnconscious(actor)
    });
    if (!plan.apply && !plan.remove && plan.owned === owned) return false;

    inFlight.add(actor.id);
    try {
      if (plan.apply) await actor.toggleStatusEffect("unconscious", { active: true });
      if (plan.remove) await actor.toggleStatusEffect("unconscious", { active: false });
      if (plan.owned && !owned) await actor.setFlag(SYSTEM_ID, INCAPACITATION_FLAG, true);
      else if (!plan.owned && owned) await actor.unsetFlag(SYSTEM_ID, INCAPACITATION_FLAG);

      if (plan.apply || plan.remove) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content:
            '<div class="trg-prime trg-check-card"><header class="check-header">'
            + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
            + "<h3>Incapacitation from Injuries</h3></div></header>"
            + `<p style="margin:2px 0"><strong>Combined injuries ${combined}</strong> — `
            + (plan.apply
              ? `${actor.name} falls <strong>Unconscious</strong> (page 194: 10 or more).</p>`
              : `${actor.name} wakes: the combined value is below 10 again.</p>`)
            + "</div>"
        });
      }
      return plan.apply || plan.remove;
    } finally {
      inFlight.delete(actor.id);
    }
  } catch (_e) {
    inFlight.delete(actor?.id);
    return false;
  }
}

/**
 * One settle per creature, run outside the hook that asked for it and
 * coalesced — the same shape, and the same reasons, as `scheduleSettle`
 * in ability-collapse-workflow.mjs.
 */
function scheduleSettle(actor) {
  if (!actor?.id || actor.documentName !== "Actor") return;
  const existing = scheduled.get(actor.id);
  if (existing) {
    existing.again = true;
    return;
  }
  const entry = { again: false };
  scheduled.set(actor.id, entry);
  entry.promise = (async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      do {
        entry.again = false;
        await settleIncapacitation(actor);
      } while (entry.again);
    } finally {
      scheduled.delete(actor.id);
    }
  })();
}

/* ------------------------------------------------------------------ */
/* 2. Fatal injuries                                                   */
/* ------------------------------------------------------------------ */

/**
 * Mark a creature with a Fatal injury (page 193, R8).
 *
 * @param {Actor} actor
 * @param {object} injury
 * @param {string} injury.effect the row's printed text
 * @param {string} injury.severity
 * @param {string} injury.persistence the column that said Fatal
 * @returns {Promise<boolean>} whether a mark was added
 */
export async function markFatalInjury(actor, { effect = "", severity = "", persistence = "" } = {}) {
  if (!actor || !isFatalPersistence(persistence)) return false;
  const existing = Array.isArray(actor.getFlag?.(SYSTEM_ID, FATAL_FLAG))
    ? actor.getFlag(SYSTEM_ID, FATAL_FLAG) : [];
  await actor.setFlag(SYSTEM_ID, FATAL_FLAG, [
    ...existing,
    { id: foundry.utils.randomID(), effect: String(effect), severity: String(severity), persistence: String(persistence) }
  ]);
  return true;
}

/** How many unhealed Fatal injuries this creature carries. */
function fatalInjuryCount(actor) {
  const list = actor?.getFlag?.(SYSTEM_ID, FATAL_FLAG);
  return Array.isArray(list) ? list.length : 0;
}

/**
 * May this creature lose Dying, or be healed above 0 HP?
 *
 * Page 193: a Fatal injury means it "cannot lose the Dying condition when
 * making a recovery check and therefore cannot be brought above 0 HP".
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
export function mayLeaveDying(actor) {
  return mayRecoverFromDying(fatalInjuryCount(actor));
}

/** The sentence a card prints when a Fatal injury is what stopped it. */
export function fatalBlockNote(actor) {
  const count = fatalInjuryCount(actor);
  if (!count) return "";
  return `<strong>Fatal injury.</strong> ${actor?.name ?? "The creature"} carries `
    + `${count === 1 ? "a Fatal injury" : `${count} Fatal injuries`} — page 193: it cannot lose `
    + "the Dying condition, and cannot be brought above 0 HP, until the injury is healed by magic.";
}

/**
 * Clear one Fatal mark, or all of them — the magical aid page 194 asks
 * for, applied by the GM from the card's button.
 *
 * @param {Actor} actor
 * @param {string|null} id the mark to clear, or null for all
 */
export async function clearFatalInjury(actor, id = null) {
  const list = Array.isArray(actor?.getFlag?.(SYSTEM_ID, FATAL_FLAG))
    ? actor.getFlag(SYSTEM_ID, FATAL_FLAG) : [];
  if (!list.length) return false;
  const left = id === null ? [] : list.filter((row) => row?.id !== id);
  if (left.length) await actor.setFlag(SYSTEM_ID, FATAL_FLAG, left);
  else await actor.unsetFlag(SYSTEM_ID, FATAL_FLAG);
  return true;
}

/* ------------------------------------------------------------------ */
/* 3. Fast Healing and Regeneration on the world clock                 */
/* ------------------------------------------------------------------ */

/**
 * The creature's Fast Healing and Regeneration values.
 *
 * READ FROM THE SAME PLACE THE HP HALF READS THEM (documents/combat.mjs,
 * Phase 1): a numeric flag on an applied effect, summed across sources,
 * taken from `appliedEffects` because a compendium feat carries the flag
 * on a TRANSFERRED effect that `actor.effects` does not show. Two numbers
 * deciding one rate is how Fast Healer's flag went invisible at 3.185.1.
 */
function healingRates(actor) {
  const effects = Array.from(actor?.appliedEffects ?? actor?.effects ?? []).filter((e) => !e.disabled);
  const sum = (flag) => effects.reduce(
    (total, e) => total + Math.max(0, Number(e.getFlag?.(SYSTEM_ID, flag) ?? 0)), 0);
  return {
    fastHealing: Math.floor(sum("fastHealing")),
    regeneration: Math.floor(sum("regeneration"))
  };
}

/**
 * Advance one creature's injury healing by a stretch of world time.
 *
 * Page 193: "Fast Healing reduces your Injured condition by its value
 * every hour. Regenerate does the same, every 10 minutes."
 *
 * @param {Actor} actor
 * @param {number} deltaSeconds
 * @returns {Promise<number>} how much Injured was removed
 */
async function advanceInjuryHealing(actor, deltaSeconds) {
  const delta = Math.max(0, Math.floor(Number(deltaSeconds) || 0));
  if (!actor || !delta) return 0;
  const rates = healingRates(actor);
  if (!rates.fastHealing && !rates.regeneration) return 0;

  const injured = Number(actor.getConditionValue?.("injured") ?? 0) || 0;
  const carried = actor.getFlag?.(SYSTEM_ID, HEALING_CLOCK_FLAG) ?? {};
  const fast = injuryHealingOverTime(
    rates.fastHealing, delta + Number(carried.fast ?? 0), FAST_HEALING_INJURY_SECONDS);
  const regen = injuryHealingOverTime(
    rates.regeneration, delta + Number(carried.regen ?? 0), REGENERATION_INJURY_SECONDS);

  await actor.setFlag(SYSTEM_ID, HEALING_CLOCK_FLAG, {
    fast: rates.fastHealing ? fast.remainder : 0,
    regen: rates.regeneration ? regen.remainder : 0
  });

  const removed = Math.min(injured, fast.reduction + regen.reduction);
  if (removed <= 0) return 0;

  const left = injured - removed;
  if (left > 0) await actor.toggleStatusEffect("injured", { value: left });
  else await actor.toggleStatusEffect("injured", { active: false });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content:
      '<div class="trg-prime trg-check-card"><header class="check-header">'
      + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
      + "<h3>Injury Healing</h3></div></header>"
      + `<p style="margin:2px 0">${[
        fast.reduction ? `<strong>Fast Healing ${rates.fastHealing}</strong> over ${fast.periods} hour${fast.periods === 1 ? "" : "s"}` : "",
        regen.reduction ? `<strong>Regeneration ${rates.regeneration}</strong> over ${regen.periods} ten-minute period${regen.periods === 1 ? "" : "s"}` : ""
      ].filter(Boolean).join(" and ")} — Injured ${injured} → <strong>${left}</strong>.</p></div>`
  });
  return removed;
}

/* ------------------------------------------------------------------ */
/* 4. Persistence (UH / FR / P)                                        */
/* ------------------------------------------------------------------ */

/**
 * Record a critical's Persistence so the events that end it can find it.
 *
 * Only the three kinds no clock can count: M and D are round-counted
 * where they are rolled, and a code this system does not know is left
 * alone rather than guessed at.
 *
 * @param {Actor} actor
 * @param {object} entry
 */
export async function recordPersistence(actor, { code = "", conditions = [], effect = "" } = {}) {
  const kind = persistenceCode(code);
  if (!["UH", "FR", "P"].includes(kind)) return false;
  if (!actor || !conditions.length) return false;
  const existing = Array.isArray(actor.getFlag?.(SYSTEM_ID, PERSISTENCE_FLAG))
    ? actor.getFlag(SYSTEM_ID, PERSISTENCE_FLAG) : [];
  await actor.setFlag(SYSTEM_ID, PERSISTENCE_FLAG, [
    ...existing,
    {
      id: foundry.utils.randomID(),
      code: kind,
      conditions: conditions.map((c) => ({ key: String(c.key), value: Number(c.value) || 0 })),
      effect: String(effect)
    }
  ]);
  return true;
}

/** The persistence entries a creature is carrying. */
function persistenceEntries(actor) {
  const list = actor?.getFlag?.(SYSTEM_ID, PERSISTENCE_FLAG);
  return Array.isArray(list) ? list : [];
}

/**
 * Clear whatever this event ends, and take the conditions off with it.
 *
 * @param {Actor} actor
 * @param {object} event see `persistenceCleared`
 * @returns {Promise<string[]>} the effects cleared, in words
 */
export async function settlePersistence(actor, event = {}) {
  const entries = persistenceEntries(actor);
  if (!entries.length) return [];
  const cleared = [];
  const left = [];
  for (const entry of entries) {
    if (persistenceCleared(entry.code, event)) cleared.push(entry);
    else left.push(entry);
  }
  if (!cleared.length) return [];

  for (const entry of cleared) {
    for (const condition of entry.conditions ?? []) {
      const current = Number(actor.getConditionValue?.(condition.key) ?? 0) || 0;
      const after = Math.max(0, current - (Number(condition.value) || 0));
      if (after > 0) await actor.toggleStatusEffect(condition.key, { value: after });
      else await actor.toggleStatusEffect(condition.key, { active: false });
    }
  }
  if (left.length) await actor.setFlag(SYSTEM_ID, PERSISTENCE_FLAG, left);
  else await actor.unsetFlag(SYSTEM_ID, PERSISTENCE_FLAG);
  return cleared.map((entry) => entry.effect || entry.code);
}

/* ------------------------------------------------------------------ */
/* 5. Treating injuries, and the day clock (page 194; R7)              */
/* ------------------------------------------------------------------ */

/** What has been treated, and how many days of rest each has had. */
const TREATMENT_FLAG = "injuryTreatment";

/** The treatment record for one injury condition. */
function treatmentRecord(actor, conditionKey) {
  const all = actor?.getFlag?.(SYSTEM_ID, TREATMENT_FLAG) ?? {};
  const row = all?.[conditionKey];
  return row && typeof row === "object" ? row : null;
}

/**
 * Record a successful Medicine check against one injury (page 194).
 *
 * "Other Injuries require a Medicine Skill Check and the use of a
 * Healer's Kit to start healing" — so the mark is what starts the clock,
 * and the clock itself is counted in days of rest below.
 *
 * @param {Actor} actor
 * @param {string} conditionKey dazed, injured or weakened
 * @param {string} severityKey the band it was treated at
 */
async function recordTreatment(actor, conditionKey, severityKey, { halved = false } = {}) {
  const all = { ...(actor?.getFlag?.(SYSTEM_ID, TREATMENT_FLAG) ?? {}) };
  all[conditionKey] = { severity: String(severityKey), days: 0, halved: Boolean(halved) };
  await actor.setFlag(SYSTEM_ID, TREATMENT_FLAG, all);
}

/**
 * Treat every injury on the patient that this severity's DC covers, and
 * say what it did (page 194; R7).
 *
 * ONE CHECK, ONE PATIENT: the page's DCs are per severity, so a
 * successful DC 24 starts the clock on the Serious injuries the creature
 * carries. A Minor injury is included, because the same check is what
 * halves its three days.
 *
 * @param {Actor} actor the patient
 * @param {string} severityKey the band the check was rolled against
 * @param {boolean} halved whether it was a critical
 * @returns {Promise<string[]>} one line per injury treated
 */
export async function applyTreatInjury(actor, severityKey, { halved = false } = {}) {
  const out = [];
  for (const key of INJURY_CONDITION_IDS) {
    const value = Number(actor?.getConditionValue?.(key) ?? 0) || 0;
    const band = injurySeverity(value);
    if (!band || band.key !== severityKey) continue;
    await recordTreatment(actor, key, band.key, { halved });
    const recovery = injuryRecovery(band.key, true, halved);
    out.push(
      `<strong>${band.label} ${key} ${value}</strong> — treated: `
      + `${recovery.days} day${recovery.days === 1 ? "" : "s"} of rest`
      + (recovery.becomes ? ` until it becomes a ${recovery.becomes} injury` : " until it heals")
      + (halved ? " (halved by the critical)" : "") + ".");
  }
  return out;
}

/**
 * A stretch of rest, applied to every injury the creature carries.
 *
 * "Injured characters can travel at a slow pace or engage in similarly
 * light activities, but fighting or exerting themselves will prevent any
 * recovery for that day" — the caller decides whether this rest counted;
 * this function counts the days and steps the bands down.
 *
 * WHOLE DAYS ONLY, with the remainder carried on the record, for the
 * reason `injuryHealingOverTime` carries its own: a party that rests
 * eight hours three nights running has rested a day.
 *
 * @param {Actor} actor
 * @param {object} options
 * @param {number} options.hours hours rested
 * @returns {Promise<Array<{condition: string, from: number, to: number, days: number, needed: number}>>}
 */
export async function advanceInjuryRest(actor, { hours = 0 } = {}) {
  const added = Math.max(0, Number(hours) || 0) / 24;
  if (!actor || added <= 0) return [];
  const all = { ...(actor.getFlag?.(SYSTEM_ID, TREATMENT_FLAG) ?? {}) };
  const out = [];
  let touched = false;

  for (const key of INJURY_CONDITION_IDS) {
    const value = Number(actor.getConditionValue?.(key) ?? 0) || 0;
    const band = injurySeverity(value);
    if (!band) {
      if (all[key]) { delete all[key]; touched = true; }
      continue;
    }
    const record = all[key] ?? null;
    const treated = Boolean(record) && record.severity === band.key;
    const recovery = injuryRecovery(band.key, treated, Boolean(record?.halved));
    if (recovery.days === null) continue;    // untreated Serious/Deadly: no clock

    const days = Number(record?.days ?? 0) + added;
    if (days < recovery.days) {
      all[key] = { severity: band.key, days };
      touched = true;
      out.push({ condition: key, from: value, to: value, days, needed: recovery.days });
      continue;
    }

    // The clock ran out: the injury steps down a band, and keeps its
    // treated mark if the page says it heals on without further care.
    const next = injuryValueAfterStepDown(value);
    if (next > 0) await actor.toggleStatusEffect(key, { value: next });
    else await actor.toggleStatusEffect(key, { active: false });

    const nextBand = injurySeverity(next);
    if (nextBand && stepDownStaysTreated(band.key)) {
      all[key] = { severity: nextBand.key, days: 0 };
    } else {
      delete all[key];
    }
    touched = true;
    out.push({ condition: key, from: value, to: next, days: recovery.days, needed: recovery.days, stepped: true });
  }

  if (touched) {
    if (Object.keys(all).length) await actor.setFlag(SYSTEM_ID, TREATMENT_FLAG, all);
    else await actor.unsetFlag(SYSTEM_ID, TREATMENT_FLAG);
  }
  return out;
}

/**
 * The severity of the worst injury a creature carries, for the Treat
 * Injury ladder and the sheet.
 *
 * @param {Actor} actor
 * @returns {{key: string, label: string}|null}
 */
export function worstInjurySeverity(actor) {
  const values = injuryValues(actor);
  let worst = null;
  for (const id of INJURY_CONDITION_IDS) {
    const band = injurySeverity(values[id]);
    if (!band) continue;
    if (!worst || band.min > worst.min) worst = band;
  }
  return worst;
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

/**
 * What a creature's Injured condition IS, for the purpose of healing it
 * once — the id of the EFFECT DOCUMENT the reduction will be written to.
 *
 * THE DEFECT THIS EXISTS FOR (3.579.2, F5), found by driving 3.579.1: an
 * UNLINKED token with no delta of its own does not copy the base actor's
 * effects, it SHARES them. The sidebar actor and that token's synthetic
 * actor therefore have different `uuid`s and the SAME ActiveEffect, so a
 * key of `actor.uuid` treated one record as two creatures and the hour
 * healed it twice: "Injured 8 → 6" and "Injured 6 → 4" in the same tick.
 *
 * AND THE FIRST FIX FOR IT WAS WRONG (3.579.3, F6), found by driving
 * 3.579.2: keying on `effect.uuid` changed nothing, because a synthetic
 * actor's effect uuid is the base document's id under the TOKEN's path —
 *
 *   Actor.dPA5….ActiveEffect.BBS0…
 *   Scene.35MC….Token.cjya….Actor.dPA5….ActiveEffect.BBS0…
 *
 * one document, two names, and the same two cards. The measurement that
 * found F5 read the effect's `id`; the code was written against `uuid`.
 *
 * SO THE DELTA IS ASKED INSTEAD. `token.delta._source.effects` holds what
 * this token stores of its OWN, and nothing else: empty means the write
 * lands on the base actor's document, which the sidebar pass has claimed
 * already. Two unlinked tokens that each carry their own Injured effect
 * appear in that source, keep the token-path key, and heal separately.
 *
 * Null when there is nothing to heal.
 *
 * @param {Actor} actor
 * @returns {string|null}
 */
function injuryIdentityOf(actor) {
  if (!Number(actor?.getConditionValue?.("injured") ?? 0)) return null;
  const effect = Array.from(actor.effects ?? [])
    .find((e) => !e.disabled && e.statuses?.has?.("injured"));
  // THE DELTA'S STORED SOURCE is the only thing that says whether this
  // token has an Injured effect of its own; everything else renames the
  // base actor's document. The decision itself is `injuryHealingKey`,
  // where it can be driven by the harness.
  return injuryHealingKey({
    actorUuid: actor?.uuid ?? "",
    actorId: actor?.id ?? "",
    isToken: Boolean(actor?.isToken),
    effectId: effect?.id ?? "",
    effectUuid: effect?.uuid ?? "",
    deltaEffectIds: Array.from(actor?.token?.delta?._source?.effects ?? []).map((row) => row?._id)
  });
}

/**
 * Every creature in the world carrying an Injured value, sidebar actors
 * and placed tokens alike.
 *
 * THE DEFECT THIS EXISTS FOR (3.579.1, F2), found by driving 3.579.0:
 * the world-clock hook iterated `game.actors` alone, and an UNLINKED
 * token has a SYNTHETIC actor that is not in that collection. Most NPCs
 * are unlinked, so Fast Healing and Regeneration reduced the Injured
 * condition for player characters and for nothing else — the same
 * sidebar-versus-token defect the critical injury paid for at 3.468.0.
 *
 * DE-DUPLICATED BY UUID, because a LINKED token and its sidebar actor are
 * the same creature and must not heal twice in one tick.
 *
 * @returns {Actor[]}
 */
function injuredActors() {
  const seen = new Map();
  const consider = (actor) => {
    if (!actor) return;
    const key = injuryIdentityOf(actor);
    if (!key || seen.has(key)) return;
    seen.set(key, actor);
  };
  for (const actor of game.actors ?? []) consider(actor);
  // EVERY SCENE, not only the one on screen: the clock is the world's,
  // and a wounded creature waiting on another map heals as time passes.
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink) continue;   // the sidebar actor above IS this creature
      consider(token.actor);
    }
  }
  return Array.from(seen.values());
}

/**
 * Watch every route the three injury conditions change by, and the world
 * clock the two healing rates run on.
 *
 * EVERY HOOK SCHEDULES rather than settling, for the reason the ability
 * collapse beside it learned at 3.551.0: several hooks fire for one
 * logical change, and the write this rule makes is itself an event.
 */
export function registerInjuryHooks() {
  const fromEffect = (effect) => effect?.parent ?? null;
  const touchesInjury = (effect) => {
    for (const status of effect?.statuses ?? []) {
      if (INJURY_CONDITION_IDS.includes(status)) return true;
    }
    // Unconscious itself: if somebody takes off the one this rule
    // applied, the flag must stop claiming it.
    return Boolean(effect?.statuses?.has?.("unconscious"));
  };

  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, (effect) => {
      const actor = fromEffect(effect);
      if (actor?.documentName === "Actor" && touchesInjury(effect)) scheduleSettle(actor);
    });
  }

  // HP and Dying decide whether the Unconscious may be lifted at all.
  Hooks.on("updateActor", (actor, changes) => {
    if (actor?.documentName !== "Actor") return;
    if (!foundry.utils.hasProperty(changes, "system.resources.hp")) return;
    scheduleSettle(actor);
  });

  // THE WORLD CLOCK (R10). `updateWorldTime` hands over the delta, which
  // is exactly what the two healing rates are counted in — and it fires
  // for a rest, a GM's clock nudge and the combat tracker alike, so no
  // caller has to remember to advance the injuries.
  Hooks.on("updateWorldTime", async (_worldTime, delta) => {
    if (!isActingGM()) return;
    const seconds = Number(delta) || 0;
    if (seconds <= 0) return;
    for (const actor of injuredActors()) await advanceInjuryHealing(actor, seconds);
  });
}
