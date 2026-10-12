/**
 * TWO SPELLS CAST IN ANSWER TO A SAVING THROW (3.612.0, block 34's R4).
 *
 * NEW. Pure; no Foundry. The workflow is save-reaction-spells-workflow.mjs.
 *
 * Fateful Temptation (Cleric, PP 7, reaction, 120 ft):
 *   "Trigger: You or an ally within range attempts a saving throw. ...
 *    The target of this spell gains a +2 status bonus to the saving throw
 *    that triggered the spell. If the original saving throw would have been
 *    a success, it instead becomes a critical. Conversely, if it would have
 *    been a failure, it becomes a fumble. ... +2 PP: the bonus to the saving
 *    throw increases by +1 (max +5)."
 *
 * Lucky Break (Cleric, PP 7, reaction):
 *   "Trigger: You fail (but don't fumble) a saving throw. A brief glimpse of
 *    insight allows you to reroll the failed saving throw. You then become
 *    temporarily immune for 10 minutes."
 *
 * ASKED INSIDE THE SAVE, NOT FROM ITS CARD. A spell's save is rolled inside
 * the cast that forced it, and that cast reads the degree the moment the roll
 * returns: a button on the posted card would change a number after the
 * effects it decided had already landed. So Fateful Temptation is offered
 * before the dice — when its trigger fires — and Lucky Break once the degree
 * is known and before anybody reads it. Both are cast through `castSpell`, so
 * the casting check, the PP, the warps and the reaction are the ordinary ones.
 *
 * "FAIL (BUT DON'T FUMBLE)": a Partial fails in this system (it "fails by less
 * than 5"), so Lucky Break answers a Partial and a Failure, and never a Fumble
 * or a Blunder.
 */

export const FATEFUL_TEMPTATION = "Fateful Temptation";
export const LUCKY_BREAK = "Lucky Break";
export const FATEFUL_RANGE_FEET = 120;
const FATEFUL_BASE_BONUS = 2;
const FATEFUL_MAX_BONUS = 5;
export const LUCKY_BREAK_IMMUNITY_SECONDS = 600;
const LUCKY_BREAK_DEGREES = Object.freeze(["partial", "failure"]);

const fold = (v) => String(v ?? "").trim().toLowerCase().replace(/[‘’]/g, "'");

/** Whether an item is the named spell. */
export function isNamedSpell(item, name) {
  return item?.type === "spell" && fold(item?.name) === fold(name);
}

/** Whether a rolled degree is one Lucky Break answers. */
export function luckyBreakTriggers(degreeKey) {
  return LUCKY_BREAK_DEGREES.includes(String(degreeKey ?? ""));
}

/**
 * Fateful Temptation's bonus for a cast's warp modifiers: +2, and +1 for
 * each warp bought, never above +5.
 * @param {object|null} warpMods
 */
export function fatefulBonus(warpMods) {
  const added = Math.max(0, Math.trunc(Number(warpMods?.bonusValue) || 0));
  return Math.min(FATEFUL_MAX_BONUS, FATEFUL_BASE_BONUS + added);
}

/** The modifier the bonus rides on. Status, so it stacks as the page says. */
export function fatefulModifier(bonus) {
  return { label: FATEFUL_TEMPTATION, value: Number(bonus) || 0, type: "status" };
}

/**
 * Whether a creature may cast one of these in answer, and why not.
 *
 * @param {object} facts
 * @param {boolean} facts.hasSpell holds the spell
 * @param {boolean} facts.canAct this user may act for it
 * @param {number} facts.pp Power Points available
 * @param {number} facts.ppCost the spell's base PP
 * @param {boolean} facts.inCombat
 * @param {number} facts.reactions reactions left (read only in combat)
 * @param {number|null} [facts.feet] distance to the saver, for a ranged spell
 * @param {number|null} [facts.rangeFeet] the spell's range, null for self
 * @param {boolean} [facts.sameSide] an ally of the saver, or the saver
 * @param {boolean} [facts.immune] still immune to it
 * @returns {{ok: boolean, reason: string}}
 */
export function reactionCasterEligible({
  hasSpell = false, canAct = false, pp = 0, ppCost = 0, inCombat = false, reactions = 0,
  feet = null, rangeFeet = null, sameSide = true, immune = false
} = {}) {
  if (!hasSpell) return { ok: false, reason: "does not know the spell" };
  if (!canAct) return { ok: false, reason: "not yours to cast" };
  if (immune) return { ok: false, reason: "still temporarily immune" };
  if (!sameSide) return { ok: false, reason: "not an ally" };
  if (rangeFeet !== null && rangeFeet !== undefined
    && !(Number.isFinite(Number(feet)) && Number(feet) <= Number(rangeFeet))) {
    return { ok: false, reason: "out of range" };
  }
  if (Number(pp) < Number(ppCost)) return { ok: false, reason: "not enough PP" };
  if (inCombat && !(Number(reactions) >= 1)) return { ok: false, reason: "no reaction left" };
  return { ok: true, reason: "" };
}

/** The card line for a Fateful Temptation that took hold. */
export function fatefulLine(casterName, bonus) {
  return `Fateful Temptation (${casterName}): +${bonus} status to this save — a Success becomes a `
    + "Critical, and a Failure a Fumble that nothing may soften.";
}

/** The card line for a Lucky Break reroll. */
export function luckyBreakLine(firstLabel, firstTotal, name) {
  return `Lucky Break: the first throw was a ${firstLabel} (${firstTotal}) — rerolled, and this second `
    + `result stands. ${name} is temporarily immune to Lucky Break for 10 minutes.`;
}

/* ------------------------------------------------------------------ *
 * UNITY — NEW at 3.614.0, Graham's R6 of 2 October 2026 (block 35).
 *
 *   "Trigger You and 1 or more allies within range are targeted by a spell
 *    or ability that allows a saving throw. … Each ally can use your saving
 *    throw modifier instead of its own against the triggering spell. Each
 *    ally decides individually which modifier to use."
 *
 * ONE CASTING ANSWERS EVERY ALLY'S SAVE AGAINST THE SAME SOURCE. It is cast
 * from inside the first ally's save, like Fateful Temptation, and leaves a
 * WINDOW on the caster keyed by what forced the save and the moment it was
 * forced. Every later ally's save against that same source, at that same
 * moment, finds the window and is asked whether to use the caster's
 * modifier — "each ally decides individually". The substitution rides a
 * modifier row worth the difference, so the card shows both numbers.
 * ------------------------------------------------------------------ */

export const UNITY = "Unity";
export const UNITY_RANGE_FEET = 30;
export const UNITY_WINDOW_FLAG = "unityWindow";

/**
 * What forced this save, as a key two saves against the same spell share.
 * @param {{sourceUuid?: string, saveSource?: string}} check
 * @returns {string} "" when nothing names the source — Unity then has nothing to answer
 */
export function unitySourceKey(check) {
  const uuid = String(check?.sourceUuid ?? "").trim();
  const name = String(check?.saveSource ?? "").trim();
  return uuid || name ? `${uuid}|${name}` : "";
}

/** The moment a save is forced: the world clock and, in a fight, the turn. */
export function unityMoment({ worldTime = 0, combatId = null, round = null, turn = null } = {}) {
  return `${Number(worldTime) || 0}|${combatId ?? ""}|${round ?? ""}|${turn ?? ""}`;
}

/**
 * Does a recorded window answer this save?
 * @param {{key?: string, moment?: string}|null} window
 * @param {string} key the save's source key
 * @param {string} moment the save's moment
 */
export function unityWindowOpen(window, key, moment) {
  return Boolean(key) && window?.key === key && window?.moment === moment;
}

/**
 * The modifier row that swaps the saver's modifier for the caster's.
 * Null when the caster's is no better — there is nothing to decide.
 */
export function unityModifier(casterName, saveName, casterTotal, ownTotal) {
  const diff = Math.trunc(Number(casterTotal) || 0) - Math.trunc(Number(ownTotal) || 0);
  if (diff <= 0) return null;
  return {
    label: `Unity — ${casterName}'s ${saveName} (${signed(casterTotal)} instead of ${signed(ownTotal)})`,
    value: diff,
    type: "untyped"
  };
}

const signed = (n) => `${Number(n) >= 0 ? "+" : ""}${Math.trunc(Number(n) || 0)}`;
