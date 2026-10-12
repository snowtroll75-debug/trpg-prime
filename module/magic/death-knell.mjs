/**
 * Death Knell (page 262): a spell whose rungs move hit points on BOTH
 * sides of the table.
 *
 * NEW at 3.587.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT AN `onSave` ROW.
 *
 *   Success  the target's Dying condition increases by 1 and you regain
 *            1 HP for every 2 levels it possesses
 *   Failure  the target dies and you [regain] 1 HP for every level it
 *            possesses
 *
 * Every `onSave` row acts on the TARGET. Both of these also act on the
 * CASTER, by a figure read off the target's level, and the second one
 * kills outright. There is no combination of existing rows that says
 * either sentence, which is why the audit asked before building.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "THE TARGET DIES" IS NOT A NEW STATE.
 *
 * This system has no separate dead/destroyed status: Dying set one past
 * the creature's effective Death State IS how death is represented
 * everywhere — `dying-workflow.mjs` says so in as many words, and both
 * of its own instant-death branches do exactly that. So this reuses that
 * shape rather than inventing a second way to be dead, which is how two
 * ways to be dead start disagreeing about whether someone is.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THREE REFUSALS ARE PART OF THE SPELL, NOT ERROR HANDLING.
 *
 * "Targets 1 creature that has the Dying condition" is a targeting
 * restriction the page prints, so a target without Dying is not a bug to
 * swallow quietly — it is a cast that does nothing, and the card has to
 * say so. A target of level 0 or unknown level heals the caster nothing
 * and must say that too: `Number(null)` is 0 and 0 is finite, and a
 * silent 0 HP heal looks identical to a spell that worked.
 */

/** Best-for-the-target first, as the degree engine orders them. */
const HEAL_PER_LEVEL = Object.freeze({ dying: 0.5, kill: 1 });

/**
 * What one rung does.
 *
 * @param {object} options
 * @param {"dying"|"kill"} options.mode which rung was reached
 * @param {number|null} options.targetLevel the target's level
 * @param {number|null} options.targetDying its current Dying value
 * @param {boolean} options.hasDying whether it has the condition at all
 * @param {number} options.deathState its EFFECTIVE death state, Doomed
 *   already folded in by the caller — this file does not know the rule
 *   and must not guess at it
 * @returns {{refusal: string|null, dyingTo: number|null, kills: boolean,
 *   healing: number, levelUnknown: boolean}}
 */
export function deathKnellOutcome({
  mode, targetLevel = null, targetDying = null, hasDying = false, deathState = 5
} = {}) {
  const nothing = { refusal: null, dyingTo: null, kills: false, healing: 0, levelUnknown: false };

  const rate = HEAL_PER_LEVEL[String(mode ?? "")];
  if (rate === undefined) {
    return { ...nothing, refusal: "declares a rung Death Knell does not have" };
  }
  if (!hasDying) {
    return { ...nothing, refusal: "only reaches a creature that already has the Dying condition" };
  }

  // A level that was never recorded is not level zero. `Number(null)` is
  // 0 and 0 is finite, so the two would be indistinguishable downstream
  // and the caster would be told they healed nothing by a spell that in
  // fact could not be measured.
  const rawLevel = Number(targetLevel);
  const levelUnknown = targetLevel === null || targetLevel === undefined || !Number.isFinite(rawLevel);
  const level = levelUnknown ? 0 : Math.max(0, Math.trunc(rawLevel));
  const healing = Math.floor(level * rate);

  if (mode === "kill") {
    const state = Math.max(0, Math.trunc(Number(deathState)) || 0);
    return { refusal: null, dyingTo: state + 1, kills: true, healing, levelUnknown };
  }

  const current = Math.max(0, Math.trunc(Number(targetDying)) || 0);
  return { refusal: null, dyingTo: current + 1, kills: false, healing, levelUnknown };
}

/** The card line for whatever happened. */
export function deathKnellLine(spellName, targetName, casterName, outcome) {
  if (!outcome) return "";
  if (outcome.refusal) return `<em>${spellName} ${outcome.refusal} — nothing applied.</em>`;
  const fate = outcome.kills
    ? `${targetName} dies (Dying ${outcome.dyingTo}).`
    : `${targetName}'s Dying rises to ${outcome.dyingTo}.`;
  const gain = outcome.levelUnknown
    ? ` ${casterName} regains nothing: ${targetName} has no recorded level, so there was nothing to halve or count.`
    : outcome.healing > 0
      ? ` ${casterName} regains ${outcome.healing} HP.`
      : ` ${casterName} regains nothing — ${targetName} is level 0.`;
  return fate + gain;
}
