/**
 * Injuries (Chapter 7, pages 193–194) — the rules, pure.
 *
 * NEW at 3.579.0, for the block-19 audit's D6, D7, D8, D9 and D10 and
 * Graham's rulings R6–R10 (21 September 2026). The Foundry side is
 * injury-workflow.mjs.
 *
 * WHAT WAS WRONG. Dazed, injured and weakened were three valued
 * conditions with stacking penalties and nothing else: no severity, no
 * sum, no unconsciousness at 10, no recovery clock, no treatment DC, and
 * no record that a Fatal row had ever been rolled. Treat Injury rolled
 * against no DC at all and offered a fumble result ("Crippling") from a
 * draft of the book that no longer exists.
 *
 * WHAT IT DOES NOW, in the page's own order:
 *
 *   "Injuries with a value of up to 4 are called Minor Injuries.
 *    Injuries with a value from 5-7 are considered Serious Injuries.
 *    Injuries with a value of 8+ are considered to be Deadly Injuries."
 *
 *   "If your combined value of Injuries reaches a total of 10 or more,
 *    you gain the Unconscious Condition until your penalties are reduced
 *    to 10 or less."
 *
 *   "Minor Injuries will heal by themselves in three days of rest… a DC
 *    20 Medicine Skill Check and the usage of a Healer's Kit will halve
 *    their recovery time. A Serious Injury requires a DC 24 Medicine
 *    Check and will turn into a Minor Injury… in 10 days of rest, after
 *    being treated. Deadly Injuries start healing with a successful DC 30
 *    Medicine Check and will become a Serious Injury… after 20 days."
 *
 *   "Fatal and Death Injuries will not heal without magical aid."
 *
 *   "Fast Healing reduces your Injured condition by its value every hour.
 *    Regenerate does the same, every 10 minutes."
 */

/**
 * The three conditions the page means by "Injuries": "They're
 * represented by the dazed, injured and weakened conditions."
 *
 * GRAHAM'S R6(a): the combined value is the sum of these three, not of
 * every penalty on the sheet. The page's own second paragraph ("This can
 * be from any combination of penalties… equal to 20 or more") is the
 * GM's, and stays the GM's.
 */
export const INJURY_CONDITION_IDS = Object.freeze(["dazed", "injured", "weakened"]);

/** Page 194's three severities, by value. */
const INJURY_BANDS = Object.freeze([
  { key: "minor", label: "Minor", min: 1, max: 4 },
  { key: "serious", label: "Serious", min: 5, max: 7 },
  { key: "deadly", label: "Deadly", min: 8, max: Infinity }
]);

/**
 * Which band a single injury's value falls in.
 *
 * @param {number} value
 * @returns {{key: string, label: string, min: number, max: number}|null}
 */
export function injurySeverity(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 1) return null;
  return INJURY_BANDS.find((band) => amount >= band.min && amount <= band.max) ?? null;
}

/** "If your combined value of Injuries reaches a total of 10 or more". */
const INCAPACITATION_THRESHOLD = 10;

/**
 * The combined value of the three injury conditions.
 *
 * @param {object} values keyed by condition id
 * @returns {number}
 */
export function combinedInjuryValue(values = {}) {
  let total = 0;
  for (const id of INJURY_CONDITION_IDS) {
    const v = Number(values?.[id] ?? 0);
    if (Number.isFinite(v) && v > 0) total += Math.floor(v);
  }
  return total;
}

/**
 * Unconscious from injuries?
 *
 * GRAHAM'S R6(b). The page says the threshold is "10 or more" and then
 * that it lasts "until your penalties are reduced to 10 or less", which
 * cannot both be true at exactly 10. Ruled: unconscious at 10 or more,
 * awake below 10 — so the sentence that causes it wins, and there is one
 * number rather than two.
 *
 * @param {number} combined
 * @returns {boolean}
 */
function incapacitatedByInjuries(combined) {
  return Number(combined) >= INCAPACITATION_THRESHOLD;
}

/* ------------------------------------------------------------------ */
/* Treating injuries (page 194)                                        */
/* ------------------------------------------------------------------ */

/**
 * The Medicine DC and the recovery clock for each severity.
 *
 * `days` is the rest the page prints; `becomes` is what the injury turns
 * into when the clock runs out — null for Minor, which simply goes.
 * `needsTreatment` is the page's split: a Minor injury "will heal by
 * themselves in three days of rest. No Check is required"; the other two
 * "require a Medicine Skill Check and the use of a Healer's Kit to start
 * healing."
 */
const INJURY_TREATMENT = Object.freeze({
  minor: Object.freeze({ dc: 20, days: 3, becomes: null, needsTreatment: false }),
  serious: Object.freeze({ dc: 24, days: 10, becomes: "minor", needsTreatment: true }),
  deadly: Object.freeze({ dc: 30, days: 20, becomes: "serious", needsTreatment: true })
});

/**
 * The Medicine DC to treat an injury of this severity, or null.
 *
 * @param {string} severityKey
 * @returns {number|null}
 */
export function treatInjuryDC(severityKey) {
  return INJURY_TREATMENT[String(severityKey ?? "").toLowerCase()]?.dc ?? null;
}

/**
 * The recovery clock for one injury.
 *
 * "A DC 20 Medicine Skill Check and the usage of a Healer's Kit will
 * halve their recovery time" — the halving is Minor's only, and three
 * days halved is rounded UP to two, because rest is counted in whole
 * days and a day and a half of rest is two days of it.
 *
 * A Serious or Deadly injury that has NOT been treated has no clock at
 * all: "require a Medicine Skill Check… to start healing."
 *
 * A CRITICAL HALVES WHAT IS LEFT. The page gives no critical result for
 * Treat Injury — this is the system's own, kept from the action that was
 * there before 3.579.0 ("you quarter the healing time"), which for a
 * treated Minor injury is the same three days down to one.
 *
 * @param {string} severityKey
 * @param {boolean} treated whether a successful check has been made
 * @param {boolean} [halved] whether the check was a critical
 * @returns {{days: number|null, becomes: string|null, needsTreatment: boolean}}
 */
export function injuryRecovery(severityKey, treated = false, halved = false) {
  const row = INJURY_TREATMENT[String(severityKey ?? "").toLowerCase()];
  if (!row) return { days: null, becomes: null, needsTreatment: false };
  if (row.needsTreatment && !treated) {
    return { days: null, becomes: row.becomes, needsTreatment: true };
  }
  let days = row.needsTreatment ? row.days : (treated ? Math.ceil(row.days / 2) : row.days);
  if (halved) days = Math.max(1, Math.ceil(days / 2));
  return { days, becomes: row.becomes, needsTreatment: row.needsTreatment };
}

/**
 * The value an injury drops to when its clock runs out: the top of the
 * band below, so a Deadly 9 becomes a Serious 7 and a Serious 6 becomes
 * a Minor 4 — "lowering value accordingly", as the page puts it twice.
 *
 * Zero when the injury heals outright.
 *
 * @param {number} value
 * @returns {number}
 */
export function injuryValueAfterStepDown(value) {
  const band = injurySeverity(value);
  if (!band) return 0;
  const next = INJURY_TREATMENT[band.key]?.becomes ?? null;
  if (!next) return 0;
  const target = INJURY_BANDS.find((b) => b.key === next);
  return target ? Math.min(Math.floor(Number(value)) - 1, target.max) : 0;
}

/**
 * "Once turned into Minor Injuries, Serious Injuries will continue to
 * heal without the need of any further treatment" — so a step-down keeps
 * its treated mark going forward, and a Minor reached this way needs no
 * second check.
 *
 * @param {string} fromSeverity the band it was in
 * @returns {boolean} whether the new band counts as already treated
 */
export function stepDownStaysTreated(fromSeverity) {
  return Boolean(INJURY_TREATMENT[String(fromSeverity ?? "").toLowerCase()]?.needsTreatment);
}

/* ------------------------------------------------------------------ */
/* Fast Healing and Regeneration (page 193; R10)                       */
/* ------------------------------------------------------------------ */

/** "Fast Healing reduces your Injured condition by its value every hour." */
export const FAST_HEALING_INJURY_SECONDS = 3600;

/** "Regenerate does the same, every 10 minutes." */
export const REGENERATION_INJURY_SECONDS = 600;

/**
 * How much Injured a healing rate takes off over a stretch of time, and
 * how much of that stretch is left over.
 *
 * WHOLE PERIODS ONLY, and the remainder is handed back so the caller can
 * carry it: a world clock advanced in two 35-minute steps must heal once
 * at the hour, not never.
 *
 * @param {number} rate the Fast Healing or Regeneration value
 * @param {number} elapsedSeconds including anything carried over
 * @param {number} periodSeconds FAST_HEALING_INJURY_SECONDS or REGENERATION_INJURY_SECONDS
 * @returns {{reduction: number, periods: number, remainder: number}}
 */
export function injuryHealingOverTime(rate, elapsedSeconds, periodSeconds) {
  const per = Math.max(1, Math.floor(Number(periodSeconds) || 1));
  const value = Math.max(0, Math.floor(Number(rate) || 0));
  const elapsed = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  const periods = Math.floor(elapsed / per);
  return { reduction: value * periods, periods, remainder: elapsed - periods * per };
}

/**
 * ONE KEY PER DOCUMENT THE REDUCTION CAN BE WRITTEN TO.
 *
 * Healing on the world clock walks every creature in the world, and two
 * of those "creatures" are regularly the same record seen twice: an
 * unlinked token's synthetic actor presents the BASE actor's effects as
 * its own. Reducing both halves reduces one injury twice.
 *
 * WHY THE PARTS ARE PASSED IN RATHER THAN THE ACTOR. This rule was got
 * wrong twice in a row (F5, then F6 fixing F5) because every obvious
 * identifier on a Foundry object renames the shared document instead of
 * identifying it — the actor uuid does, and so does the EFFECT uuid:
 *
 *   sidebar   Actor.<actor>.ActiveEffect.<effect>
 *   its token Scene.<s>.Token.<t>.Actor.<actor>.ActiveEffect.<effect>
 *
 * The only thing that answers "is this effect this token's own" is what
 * the token's ActorDelta STORES. So the caller reads those ids off the
 * delta and the decision is made here, in the open, where the harness can
 * drive it with the two shapes above instead of agreeing with a regex.
 *
 * @param {object} state
 * @param {string} [state.actorUuid]
 * @param {string} [state.actorId] the BASE actor's id — a synthetic
 *   actor reports the same one
 * @param {boolean} [state.isToken] this is a token's synthetic actor
 * @param {string} [state.effectId] the Injured effect's id
 * @param {string} [state.effectUuid] its uuid, as this actor names it
 * @param {string[]} [state.deltaEffectIds] the effect ids the token's
 *   delta stores of its own — empty for a token carrying no changes
 * @returns {string|null}
 */
export function injuryHealingKey({
  actorUuid = "", actorId = "", isToken = false,
  effectId = "", effectUuid = "", deltaEffectIds = []
} = {}) {
  if (!effectId && !effectUuid) return actorUuid ? `actor:${actorUuid}` : null;
  const own = isToken
    ? Array.from(deltaEffectIds ?? []).some((id) => id && id === effectId)
    : true;
  // Not its own: name the document where it actually lives, which is the
  // name the sidebar actor's pass has already used.
  if (!own) return `effect:Actor.${actorId}.ActiveEffect.${effectId}`;
  return `effect:${effectUuid || `Actor.${actorId}.ActiveEffect.${effectId}`}`;
}

/* ------------------------------------------------------------------ */
/* Persistence (page 193; R9)                                          */
/* ------------------------------------------------------------------ */

/**
 * The conditions a critical's Persistence column must NOT put a round
 * clock on: "these rules only apply to conditions that do not have their
 * own durations."
 *
 * Bleeding and Recurring Damage each end on their own flat check;
 * sickened is removed by its own rules. A "D" critical that caused
 * Bleeding used to end the bleed when its rounds ran out, which is the
 * defect D9 names.
 */
export const SELF_TIMED_CONDITION_IDS = Object.freeze(["bleeding", "recurring", "sickened"]);

/**
 * Split a critical's condition tags into the ones a Persistence clock
 * governs and the ones that keep their own rules.
 *
 * @param {Array<{key: string}>} tags
 * @returns {{timed: object[], selfTimed: object[]}}
 */
export function splitPersistenceTags(tags) {
  const timed = [];
  const selfTimed = [];
  for (const tag of Array.from(tags ?? [])) {
    (SELF_TIMED_CONDITION_IDS.includes(tag?.key) ? selfTimed : timed).push(tag);
  }
  return { timed, selfTimed };
}

/**
 * The five Persistence kinds, in words, and how each one ends.
 *
 * GRAHAM'S R9: UH clears when the creature reaches full HP by magic, or
 * reaches full HP and then rests ten minutes; FR clears after eight
 * hours' sleep; P stays for the GM, with a button.
 */
const PERSISTENCE_KINDS = Object.freeze({
  M: Object.freeze({ label: "Minimal Effect", ends: "the end of your next turn" }),
  D: Object.freeze({ label: "Duration", ends: "a rolled number of rounds" }),
  UH: Object.freeze({
    label: "Until Healed",
    ends: "full HP restored magically, or full HP and ten minutes' rest"
  }),
  FR: Object.freeze({ label: "Full Rest", ends: "eight hours' sleep" }),
  P: Object.freeze({ label: "Permanent", ends: "magical healing, at the GM's word" })
});

/**
 * The Persistence column, normalised to one of the five kinds.
 *
 * THE TABLES WRITE MORE THAN THE FIVE LETTERS: two rows say "UH/Fatal"
 * (until healed AND fatal), fourteen say "Surface Scrape", 240 say "-".
 * The kind is the first token, and anything that is not one of the five
 * is not a kind at all.
 *
 * @param {string} raw
 * @returns {string} one of M, D, UH, FR, P — or "" for none
 */
export function persistenceCode(raw) {
  const first = String(raw ?? "").trim().split(/[/\s]+/)[0]?.toUpperCase() ?? "";
  return Object.hasOwn(PERSISTENCE_KINDS, first) ? first : "";
}

/**
 * Does a Persistence code clear on this event?
 *
 * @param {string} code the Persistence column's letters
 * @param {object} event
 * @param {boolean} [event.fullHP] the creature is at its maximum
 * @param {boolean} [event.magicalHealing] that was done by magic
 * @param {number} [event.restMinutes] minutes rested at full HP
 * @param {number} [event.sleepHours] hours slept
 * @returns {boolean}
 */
export function persistenceCleared(code, { fullHP = false, magicalHealing = false, restMinutes = 0, sleepHours = 0 } = {}) {
  const kind = persistenceCode(code);
  if (kind === "UH") {
    if (!fullHP) return false;
    return Boolean(magicalHealing) || Number(restMinutes) >= 10;
  }
  if (kind === "FR") return Number(sleepHours) >= 8;
  return false;
}

/* ------------------------------------------------------------------ */
/* Fatal injuries (page 193; R8)                                       */
/* ------------------------------------------------------------------ */

/**
 * Does this critical row's Persistence column mark a Fatal injury?
 *
 * Page 193: "a character suffering from such an injury cannot lose the
 * Dying condition when making a recovery check and therefore cannot be
 * brought above 0 HP" until the cause is healed.
 *
 * The tables write the descriptor into the Persistence column, so that
 * is what is read — "Fatal", and "Death" which is the same sentence's
 * other half.
 *
 * @param {string} persistenceCode
 * @returns {boolean}
 */
export function isFatalPersistence(persistenceCode) {
  return /\b(fatal|death)\b/i.test(String(persistenceCode ?? ""));
}

/**
 * May this creature lose the Dying condition, or be brought above 0 HP?
 *
 * @param {number} fatalCount how many unhealed Fatal injuries it carries
 * @returns {boolean}
 */
export function mayRecoverFromDying(fatalCount) {
  return !(Number(fatalCount) > 0);
}

/* ------------------------------------------------------------------ */
/* Incapacitation, as a plan the workflow carries out                  */
/* ------------------------------------------------------------------ */

/**
 * What to do about Unconscious, given the combined injury value.
 *
 * THE SHAPE IS `collapseTransition`'S, and for the same reasons: the rule
 * must be able to take a condition back OFF when the injuries are healed,
 * it must only take off the one it put on, and it must never wake a
 * creature that is unconscious for some other reason (0 HP, dying).
 *
 * @param {object} state
 * @param {number} state.combined the summed injury value
 * @param {boolean} [state.owned] whether this rule applied the Unconscious standing now
 * @param {string[]} [state.present] the conditions actually on the creature
 * @param {boolean} [state.otherReasonUnconscious]
 * @returns {{apply: boolean, remove: boolean, owned: boolean}}
 */
export function injuryIncapacitationPlan({
  combined = 0, owned = false, present = [], otherReasonUnconscious = false
} = {}) {
  const has = Array.from(present ?? []).includes("unconscious");
  if (incapacitatedByInjuries(combined)) {
    return { apply: !has, remove: false, owned: true };
  }
  // Below the threshold: lift only what this rule put on, and only when
  // nothing else is holding the creature down.
  if (owned && has && !otherReasonUnconscious) return { apply: false, remove: true, owned: false };
  return { apply: false, remove: false, owned: owned && has };
}
