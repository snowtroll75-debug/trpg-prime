/**
 * SEER'S VISION (PP 1) — Chance, Concentrate, Insight.
 *
 *   Cast 1 AP; Targets 1 willing living creature
 *   Duration until the end of your next turn
 *
 *   "You glimpse the target's near future, foreseeing a pivotal moment.
 *    Roll a d20 and record the result. When the target attempts a
 *    non-secret saving throw or skill check, they may use the recorded
 *    number instead of rolling, ending the spell. Casting this spell
 *    again immediately cancels any active instance of Seer's Vision."
 *
 * NEW at 3.449.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS IS THE FOURTH SPELL ON THE SAME ROAD, AND THE FIRST THAT REPLACES
 * THE DIE.
 *
 * Cutting Words leaves a penalty, Counter Perform a bonus, Inspire
 * Competence an Aid — all three are MODIFIERS pushed onto a roll before
 * `buildOutcome` reads it. This one is different in kind: "use the
 * recorded number INSTEAD OF ROLLING" replaces the d20 itself.
 *
 * GRAHAM'S RULING, 31 August 2026: a recorded 20 IS a natural 20, and
 * "behaves exactly as though rolled — criticals, open-ended chains and
 * all."
 *
 * THAT RULING IS WHY THIS IS SIMPLE. The honest implementation is not to
 * substitute a TOTAL — which would mean re-deciding what counts as a
 * natural 20, whether the chain fires, and what `unmodified` should say,
 * three questions this file has no business answering. It is to force
 * the FIRST DIE FACE and let `rollChain` do the rest. Everything
 * downstream is then correct by construction rather than by
 * re-implementation: a recorded 20 explodes because 20 explodes, and a
 * recorded 1 explodes downward for the same reason.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "THEY MAY USE" — SO IT IS OFFERED, NOT TAKEN.
 *
 * The other three spells on this road apply themselves. This one is the
 * target's choice at the moment of the check, because a recorded 4 is
 * worse than most rolls and the spell would otherwise be a curse. The
 * offer is a prompt; declining leaves the vision intact for a later
 * check, since only USING it ends the spell.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "NON-SECRET" IS A REAL DISTINCTION IN THIS SYSTEM, not a flourish.
 *
 * Appendix 3's Secret trait makes the GM roll a check in secret, and
 * `secretRollMode` turns that into a blind roll mode. A player cannot
 * choose to spend a recorded number on a roll they are not permitted to
 * see, so a blind check is refused here rather than prompted.
 */

import { BLIND_ROLL_MODE } from "../traits.mjs";

/** Where the recorded number waits on the target. */
export const SEERS_VISION_FLAG = "seersVision";

/** The die the spell rolls and records. */
export const VISION_DIE_FACES = 20;

/**
 * The spell's name, for a record that does not carry its own.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SPELT AS THE PACK SPELLS IT — with U+2019, not a typewriter apostrophe.
 *
 * Driving 3.449.0 in Graham's world put both spellings on one screen: the
 * cast card said "Seer’s Vision — Result" (from the pack row) and the
 * prompt beside it said "Seer's Vision" (from five hard-coded strings in
 * this module and check.mjs). One spell, two names, the same defect this
 * project keeps paying to remove in other guises.
 *
 * THE PACK IS THE AUTHORITY, so `visionName` prefers the label the record
 * carried from the spell itself and falls back here only when a record
 * predates that. Renaming the spell now renames the prompt.
 */
export const SEERS_VISION_NAME = "Seer’s Vision";

/** What to call the spell in front of a player. */
export function visionName(pending) {
  const label = String(pending?.label ?? "").trim();
  return label || SEERS_VISION_NAME;
}

// APPENDIX 3'S SECRET TRAIT BECOMES A BLIND ROLL, and the word for it is
// IMPORTED rather than retyped. The first draft declared it here as a
// local const — two places stating one string — and the uncalled-export
// ratchet noticed, because `traits.mjs` exported the real one with
// nobody calling it. Importing removes the duplicate and gives the
// export its caller.

/**
 * What the cast records on the target, or null when the number is not a
 * face this die has.
 *
 * A RECORDED NUMBER OUTSIDE 1..20 IS REFUSED rather than clamped. It can
 * only arise from a bug or a hand-edited flag, and clamping would hand
 * somebody a silent 20.
 */
export function seersVisionRecord({
  value, casterName = "", label = "", round = null, types = null, source = ""
} = {}) {
  const face = Math.trunc(Number(value));
  if (!Number.isFinite(face) || face < 1 || face > VISION_DIE_FACES) return null;
  return {
    value: face,
    casterName: String(casterName ?? ""),
    // CARRIED FROM THE SPELL so the prompt and the card agree with the
    // pack rather than with a constant typed in this file.
    label: String(label ?? ""),
    round: round === null || round === undefined ? null : Number(round)
    ,
    // WHICH SPELL RECORDED IT (3.589.0). Two spells now write recorded
    // numbers and each forbids stacking with ITSELF only, so uniqueness
    // is per source — see `withRecordedRoll`.
    source: String(source ?? "").trim() || SEERS_VISION_NAME,
    // WHAT IT MAY REPLACE. Declared per record rather than baked into
    // `seersVisionConsumes`, because the two spells differ on exactly
    // this: Seer's Vision says "a non-secret saving throw or skill
    // check" and Embrace Destiny says "a single attack roll, saving
    // throw, or skill check". A record that declares nothing gets
    // Seer's Vision's list, which is what every record written before
    // this release is.
    types: normaliseRecordTypes(types)
  };
}

/** The check types a recorded number may replace. */
const RECORDABLE_TYPES = Object.freeze(["save", "skill", "attack"]);

/** Seer's Vision's own list, and the default for a record without one. */
export const DEFAULT_RECORD_TYPES = Object.freeze(["save", "skill"]);

export function normaliseRecordTypes(raw) {
  const list = (Array.isArray(raw) ? raw : [])
    .map((t) => String(t ?? "").trim().toLowerCase())
    .filter((t) => RECORDABLE_TYPES.includes(t));
  return list.length ? [...new Set(list)] : [...DEFAULT_RECORD_TYPES];
}

/**
 * Every recorded number a creature is carrying.
 *
 * ACCEPTS THE LEGACY SHAPE. Until 3.589.0 this flag held ONE record, and
 * Graham's world may have one sitting on a character right now. Reading
 * a bare object as a list of one costs a line here and saves a
 * migration; refusing it would have quietly eaten a live Seer's Vision.
 */
export function recordedRolls(raw) {
  if (Array.isArray(raw)) return raw.filter((r) => r && Number.isFinite(Number(r.value)));
  if (raw && typeof raw === "object" && Number.isFinite(Number(raw.value))) return [raw];
  return [];
}

/**
 * The list after a new record from the same source replaces its
 * predecessor.
 *
 * PER SOURCE, AND THAT IS THE RULE BOTH SPELLS PRINT. Seer's Vision:
 * "casting this spell again immediately cancels any active instance."
 * Embrace Destiny: "you can't have more than one instance of embrace
 * destiny active on yourself." Neither says a word about the other, so a
 * single shared slot — which is what this flag was until 3.589.0 — would
 * have invented a rule where casting one cancelled the other.
 */
export function withRecordedRoll(raw, record) {
  if (!record) return recordedRolls(raw);
  const kept = recordedRolls(raw).filter((r) => String(r.source ?? SEERS_VISION_NAME) !== record.source);
  return [...kept, record];
}

/**
 * The first recorded number this check may spend, or null.
 *
 * FIRST RATHER THAN BEST, deliberately: choosing for the player between
 * a recorded 4 and a recorded 17 is a decision the prompt should put to
 * them, and the prompt is per record. Ordered as recorded, so the older
 * offer comes first and is declined first.
 */
export function applicableRecordedRoll(raw, checkType, rollMode) {
  for (const record of recordedRolls(raw)) {
    if (seersVisionConsumes(checkType, rollMode, record)) return record;
  }
  return null;
}

/**
 * May this check spend the recorded number?
 *
 * "A NON-SECRET SAVING THROW OR SKILL CHECK" — three conditions, and all
 * three are the printed sentence rather than a reading of it. An attack
 * roll is neither a save nor a skill check, which is what keeps this
 * spell from being a better version of every other one on this road.
 *
 * @param {string} checkType the `type` a TRGCheck carries
 * @param {string} rollMode the check's roll mode
 * @param {object|null} pending what the creature is carrying
 */
export function seersVisionConsumes(checkType, rollMode, pending) {
  if (!pending) return false;
  if (String(rollMode ?? "").trim().toLowerCase() === BLIND_ROLL_MODE) return false;
  const type = String(checkType ?? "").trim().toLowerCase();
  /*
   * READ FROM THE RECORD (3.589.0), not hardcoded.
   *
   * This returned `save || skill` — Seer's Vision's printed list, and
   * correct while it was the only spell that recorded a number. Embrace
   * Destiny (page 277) records one too and its list includes an ATTACK
   * ROLL, so the sentence differs per spell and belongs on the record.
   *
   * A record with no list gets Seer's Vision's, which is what every
   * record written before this release is — so the blind-roll refusal
   * and the type test both behave exactly as they did.
   */
  return normaliseRecordTypes(pending.types).includes(type);
}

/**
 * The draw function a check should use when the vision is spent.
 *
 * FORCES ONLY THE FIRST FACE, and this is the whole mechanism. Graham's
 * ruling is that the recorded number behaves exactly as though rolled,
 * so it is handed to `rollChain` as the die's own result and every
 * subsequent draw — the open-ended chain's continuation — is the real
 * die again. A recorded 20 therefore explodes, and a recorded 1 explodes
 * downward, without this file knowing either rule.
 *
 * @param {number} face the recorded number
 * @param {() => Promise<number>} realDraw the check's own die draw
 * @returns {() => Promise<number>}
 */
export function visionDraw(face, realDraw) {
  let spent = false;
  return async () => {
    if (!spent) {
      spent = true;
      return Number(face);
    }
    return realDraw();
  };
}

/** What the cast card says was foreseen. */
export function seersVisionCastLine(value, targetName, types = null) {
  /*
   * THE LIST COMES FROM THE RECORD (3.589.0).
   *
   * This sentence was hardcoded to "their next non-secret saving throw or
   * skill check" — Seer's Vision's own list, and correct while it was the
   * only spell that recorded a number. Embrace Destiny's list includes an
   * attack roll, and a card that told a player otherwise would have been
   * a false statement about a spell they had just paid 4 PP for. Worse
   * than a missing line, which is the rule this project applies to cards.
   */
  const list = normaliseRecordTypes(types);
  const words = list
    .map((t) => ({ save: "saving throw", skill: "skill check", attack: "attack roll" }[t] ?? t))
    .join(", ")
    .replace(/, ([^,]*)$/, " or $1");
  return `${targetName} has glimpsed a <strong>${value}</strong> — they may use it instead of rolling `
    + `their next non-secret ${words}.`;
}

/** What the consuming card says. */
export function seersVisionSpentLine(value, casterName, label = "") {
  const who = String(casterName ?? "").trim();
  return `${visionName({ label })}${who ? ` (${who})` : ""} — the foreseen <strong>${value}</strong> replaces the die.`;
}
