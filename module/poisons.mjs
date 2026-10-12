/**
 * Poisons (Chapter 6, pages 183–184) — the rules, pure.
 *
 * NEW at 3.578.0, for the block-18 audit's D7 and Graham's rulings R1–R3
 * and R13 (20 September 2026).
 *
 * WHAT WAS WRONG. Thirteen poisons, and using one spent it and posted its
 * description. The affliction engine was already built — a tracked
 * affliction item, the initial exposure save, stage saves, a poison
 * critical — and no poison ever became an affliction: no pack held one,
 * nothing turned a poison into one, and nothing coated a weapon. Even
 * inside the engine a stage's "1d4 poison damage and sickened 1" was text
 * on a card.
 *
 * WHAT IT DOES NOW (R1, option A):
 *
 *   - an ingested, contact or inhaled poison is applied to the targeted
 *     creature, which rolls its exposure save at once;
 *   - an injury poison coats a weapon, and the weapon's first hit
 *     delivers it (R2: the first hit spends the dose; it dries after a
 *     minute if nothing is hit), which takes two hands (R3);
 *   - each stage's damage is dealt and its conditions applied, and a
 *     "poison critical" rolls a critical injury whose severity is the
 *     margin the save failed by, exactly as a spell's (R13);
 *   - a stage that runs in rounds is saved against automatically in the
 *     creature's end phase — "you take damage from them and then may make
 *     checks to remove them" (p.190) — and ends when its duration does;
 *   - Kamarsk Oil and Sumark Oil are one save with four outcomes;
 *   - Arsenic's "You can't reduce your sickened condition while affected"
 *     refuses the Retch action.
 *
 * THE POISON IS DATA, on the pack item at
 * `flags.trg-prime.consumable.affliction` — its stages, what each deals
 * and inflicts, its delivery — and becomes an affliction item on whoever
 * it reaches. Nothing below names a poison.
 */

import { criticalSeverity } from "./combat/attack.mjs";
import { initialExposureOutcome } from "./afflictions.mjs";
import { handsOccupied } from "./held-items.mjs";

const SYSTEM_ID = "trg-prime";

/** The four ways a poison reaches a creature (page 183's traits). */
const POISON_DELIVERIES = Object.freeze(["ingested", "injury", "contact", "inhaled"]);

/** How long an injury poison stays wet on a blade with nothing hit (R2). */
const COAT_SECONDS = 60;
const COAT_ROUNDS = 10;

/** The flag a coated weapon carries. */
export const POISON_COAT_FLAG = "poisonCoat";

/** The flag an affliction item carries for what poisons add. */
export const POISON_FLAG = "poison";

/**
 * The poison a consumable carries, normalised, or null.
 *
 * @param {object} item
 * @returns {{delivery: string, incubation: string, duration: string, stages: object[],
 *   outcomes: object|null, locks: string[]}|null}
 */
export function poisonAfflictionOf(item) {
  const raw = item?.flags?.[SYSTEM_ID]?.consumable?.affliction ?? null;
  if (!raw || typeof raw !== "object") return null;
  const delivery = String(raw.delivery ?? "").trim().toLowerCase();
  const stages = Array.isArray(raw.stages) ? raw.stages : [];
  const outcomes = raw.outcomes && typeof raw.outcomes === "object" ? raw.outcomes : null;
  if (!stages.length && !outcomes) return null;
  return {
    delivery: POISON_DELIVERIES.includes(delivery) ? delivery : "ingested",
    incubation: String(raw.incubation ?? ""),
    duration: String(raw.duration ?? ""),
    stages,
    outcomes,
    locks: Array.isArray(raw.locks) ? raw.locks.map(String) : []
  };
}

/**
 * The affliction item a poison becomes on the creature it reaches.
 *
 * THE ENGINE'S OWN SHAPE (template.json `affliction`), so the sheet,
 * the Treat actions and the stage-save button all read it without
 * knowing it was ever a poison. What poisons add rides in a flag.
 *
 * @param {object} item the poison consumable
 * @returns {object|null} item data
 */
export function afflictionItemData(item) {
  const poison = poisonAfflictionOf(item);
  if (!poison) return null;
  const stages = poison.stages.map((stage) => ({
    effect: String(stage.effect ?? ""),
    interval: String(stage.interval ?? ""),
    criticalOnFailure: Boolean(stage.critical),
    criticalDamageType: "poison",
    damage: String(stage.damage ?? ""),
    conditions: Array.isArray(stage.conditions) ? stage.conditions : [],
    conditionDuration: String(stage.conditionDuration ?? "")
  }));
  return {
    name: item.name,
    type: "affliction",
    img: item.img,
    system: {
      afflictionType: "poison",
      traits: afflictionTraits(item.system?.traits),
      level: Math.max(0, Math.floor(Number(item.system?.itemLevel) || 0)),
      savingThrow: "fortitude",
      rarity: "common",
      rarityModifier: 0,
      incubation: poison.incubation,
      duration: poison.duration,
      maxStage: Math.max(1, stages.length),
      stages: stages.length ? stages : [{ effect: "", interval: "", criticalOnFailure: false, criticalDamageType: "poison" }],
      incubating: true,
      currentStage: 0,
      description: String(item.system?.description ?? "")
    },
    flags: {
      [SYSTEM_ID]: {
        [POISON_FLAG]: {
          delivery: poison.delivery,
          outcomes: poison.outcomes,
          locks: poison.locks,
          durationRounds: durationRounds(poison.duration),
          elapsedRounds: 0,
          applied: []
        }
      }
    }
  };
}

/**
 * The affliction's traits, as the LIST every trait reader expects.
 *
 * FOUND LIVE ON 3.578.0 (F1). The alchemical pack prints its traits as
 * the page does — "Alchemical Consumable Ingested Poison", words with no
 * commas — and `traitList` splits on commas, so the whole string was ONE
 * trait. A zombie immune to poison drank Kamarsk Oil and went blind, and
 * Limorsor's "+1 item to saves against poison" was never ticked. Split
 * into words when there are no commas (every trait on these items is one
 * word), and Poison is always among them.
 *
 * @param {string} text the consumable's traits
 * @returns {string} e.g. "Alchemical, Consumable, Ingested, Poison"
 */
export function afflictionTraits(text) {
  const raw = String(text ?? "").trim();
  const words = (raw.includes(",") ? raw.split(",") : raw.split(/\s+/))
    .map((w) => w.trim()).filter(Boolean);
  if (!words.some((w) => w.toLowerCase() === "poison")) words.push("Poison");
  return words.join(", ");
}

/**
 * A phrase that is literally a number of rounds — "6 rounds", "1 round" —
 * or null. Minutes and hours are NOT converted: Graham's R1 automates the
 * stages that run in rounds, and a minute-long stage keeps its button, so
 * "1 minute" must not quietly become ten rounds here.
 *
 * @param {string} text
 * @returns {number|null}
 */
function literalRounds(text) {
  const m = /^\s*(\d+)\s*rounds?\s*$/i.exec(String(text ?? ""));
  return m ? Math.max(1, Number(m[1])) : null;
}

/** The poison's own duration in rounds, when it is printed in rounds. */
export function durationRounds(text) {
  return literalRounds(text);
}

/**
 * How many rounds a stage lasts, when it is a matter of rounds — the
 * stages the end phase saves against on its own (R1).
 *
 * A STAGE WITH NO INTERVAL, IN A POISON THAT RUNS IN ROUNDS, IS ONE ROUND.
 * Green Dragon Bile, Bloodroot and Graveroot's second stage print none
 * (erratum E8 of the block-18 audit); their durations are 4–6 rounds, so
 * a round is the only reading that lets the stages happen at all. A stage
 * interval printed in minutes inside a poison that lasts only rounds
 * (Greenblood Oil: "(1 minute)" stages in a 4-round poison) reads the same
 * way, for the same reason: the poison would be over before its first save.
 *
 * @param {object} stage
 * @param {number|null} poisonRounds the poison's own duration in rounds
 * @returns {number|null}
 */
export function stageIntervalRounds(stage, poisonRounds = null) {
  const interval = String(stage?.interval ?? "").trim();
  const rounds = literalRounds(interval);
  if (rounds) return poisonRounds ? Math.min(rounds, poisonRounds) : rounds;
  if (poisonRounds) return 1;
  return null;
}

/**
 * The severity of a poison critical (R13): "based on the severity of the
 * saving throw failure (same as spells)". The margin the save failed by,
 * read on the same bands a failed basic save uses — minor at 5, serious
 * at 15, deadly at 25 — and, as for a spell, a failure by less than 5 is
 * no critical at all.
 *
 * @param {number|null} margin the save's total minus its DC
 * @returns {string|null} "minor" | "serious" | "deadly" | null
 */
export function poisonCriticalSeverity(margin) {
  if (margin === null || margin === undefined || !Number.isFinite(Number(margin))) return null;
  const failedBy = Math.max(0, -Math.round(Number(margin)));
  return criticalSeverity(failedBy)?.severity ?? null;
}

/**
 * The exposure save's result, for a staged poison or a one-save one.
 *
 * KAMARSK AND SUMARK (page 184) print four outcomes of one save —
 * Critical, Success, Failure, Fumble — not stages. Heroic reads as
 * Critical and Blunder as Fumble, the ladder's own ends; a Partial reads
 * as a Failure, as the engine's exposure table already reads it.
 *
 * @param {{outcomes: object|null}} poison
 * @param {string} degree
 * @returns {{affected: boolean, startingStage: number, outcome: object|null}}
 */
export function exposureResult(poison, degree) {
  const outcomes = poison?.outcomes ?? null;
  if (!outcomes) {
    const staged = initialExposureOutcome(degree);
    return { ...staged, outcome: null };
  }
  const key = { heroic: "critical", critical: "critical", success: "success", partial: "failure",
    failure: "failure", fumble: "fumble", blunder: "fumble" }[degree] ?? "failure";
  const outcome = outcomes[key] ?? null;
  const affected = Boolean(outcome && ((outcome.conditions ?? []).length || outcome.effect));
  return { affected, startingStage: 0, outcome: affected ? { ...outcome, degree: key } : null };
}

/**
 * Does coating this weapon leave the two hands page 183 asks for? "If you
 * are applying a poison to a weapon or item, this requires two hands."
 * The weapon's own hand counts, and so does the poison's: everything ELSE
 * equipped must leave both free (R3).
 *
 * @param {object[]} items the actor's items
 * @param {object} weapon
 * @param {object} poison
 * @param {string} actorSize
 * @returns {{ok: boolean, free: number}}
 */
export function coatHandsCheck(items, weapon, poison, actorSize = "medium") {
  const others = Array.from(items ?? []).filter((item) => item?.system?.equipped
    && item !== weapon && item !== poison
    && (!weapon?.id || item?.id !== weapon.id) && (!poison?.id || item?.id !== poison.id));
  const free = Math.max(0, 2 - handsOccupied(others, actorSize));
  return { ok: free >= 2, free };
}

/**
 * Does applying this poison leave the free hand page 183 asks for? "A
 * poison requires at least one free hand to apply to release into the
 * air or apply to food or drink." Everything else equipped counts; the
 * poison's own vial does not, since it is the thing being applied.
 *
 * @param {object[]} items the actor's items
 * @param {object} poison
 * @param {string} actorSize
 * @returns {{ok: boolean, free: number}}
 */
export function applyHandsCheck(items, poison, actorSize = "medium") {
  const others = Array.from(items ?? []).filter((item) => item?.system?.equipped
    && item !== poison && (!poison?.id || item?.id !== poison.id));
  const free = Math.max(0, 2 - handsOccupied(others, actorSize));
  return { ok: free >= 1, free };
}

/**
 * Is a weapon's coating still wet? (R2) A minute of world time, or ten
 * rounds of the combat it was put on in — whichever the table is keeping.
 *
 * @param {object|null} coat the weapon's `poisonCoat` flag
 * @param {{worldTime?: number, combatId?: string|null, round?: number|null}} now
 * @returns {boolean}
 */
export function coatActive(coat, { worldTime = 0, combatId = null, round = null } = {}) {
  if (!coat || typeof coat !== "object") return false;
  const appliedAt = Number(coat.appliedAt ?? NaN);
  if (Number.isFinite(appliedAt) && Number(worldTime) - appliedAt >= COAT_SECONDS) return false;
  if (coat.combatId && combatId && coat.combatId === combatId
    && Number.isFinite(Number(coat.round)) && Number.isFinite(Number(round))
    && Number(round) - Number(coat.round) >= COAT_ROUNDS) return false;
  return true;
}

/**
 * Is a condition locked by an affliction the creature carries? Arsenic:
 * "You can't reduce your sickened condition while affected."
 *
 * @param {object[]} items the creature's items
 * @param {string} conditionKey
 * @returns {string|null} the affliction's name, if locked
 */
export function conditionLockedBy(items, conditionKey) {
  for (const item of Array.from(items ?? [])) {
    if (item?.type !== "affliction") continue;
    if (Number(item.system?.currentStage ?? 0) < 1 && !item.flags?.[SYSTEM_ID]?.[POISON_FLAG]?.outcomeApplied) continue;
    const locks = item.flags?.[SYSTEM_ID]?.[POISON_FLAG]?.locks ?? [];
    if (locks.includes(conditionKey)) return item.name;
  }
  return null;
}

/**
 * What to take back when a stage ends: each condition it added, by the
 * amount it added. A valued condition another source also raised keeps
 * the rest; a plain condition is removed only if this stage put it there.
 *
 * @param {Array<{key: string, value: number|null, added: boolean}>} applied
 * @param {(key: string) => number|null} currentValue
 * @returns {Array<{key: string, value: number|null, remove: boolean}>}
 */
export function conditionsToWithdraw(applied, currentValue) {
  const out = [];
  for (const entry of Array.from(applied ?? [])) {
    const now = currentValue(entry.key);
    if (now === null || now === undefined) continue;
    if (entry.value === null || entry.value === undefined) {
      if (entry.added) out.push({ key: entry.key, value: null, remove: true });
      continue;
    }
    const next = Math.max(0, Number(now) - Number(entry.value));
    out.push({ key: entry.key, value: next || null, remove: next <= 0 });
  }
  return out;
}
