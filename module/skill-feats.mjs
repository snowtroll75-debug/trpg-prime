import { registeredDegreeUpgrades } from "./module-api.mjs";
/**
 * The seven General feats that change how a SKILL ACTION behaves.
 *
 *   SUBTLE               advantage on all Sneak (Stealth) checks.
 *   ODDITY ASSESSMENT    advantage on Identify Power and Sense Power for
 *                        four traits.
 *   CANNY SMUGGLER       Underworld Earn Income counts the work one level
 *                        higher, without raising the DC; and attempts to
 *                        find what you are smuggling are at disadvantage.
 *   SCHOOLED IN SECRETS  Gather Information about cults may use Religion.
 *   EXPERIENCED TRACKER  tracking at full Speed costs you nothing.
 *   GROUP COERCION       some additional Coerce targets are free.
 *   SURVEY WILDLIFE      ten minutes reading a wilderness for its beasts.
 *
 * TWO OF THEM ARE WRITTEN AGAINST RULES THIS SYSTEM DID NOT OFFER, and
 * that is now a familiar shape rather than a surprise — Constant Guard was
 * the same, one batch ago. Experienced Tracker waives the cost of tracking
 * at full Speed, and the Track action had no full-Speed option at all;
 * Graham's ruling, 21 August 2026, was to add the option and then the
 * exemption, so that a printed Chapter 4 rule becomes real rather than
 * only the feat that modifies it.
 *
 * GROUP COERCION NEEDED A TRANSLATION, not just a home. It reads "you
 * ignore the first -4 penalty received for coercing multiple targets. For
 * every 5 ranks that you have in the Intimidate skill, you may ignore a
 * further -2 penalty" — and Chapter 4 charges +2 DC per additional target
 * with no -4 anywhere in it. Graham's ruling: read the penalties as
 * TARGETS. The first additional target is free, and every 5 Intimidate
 * ranks frees one more. That keeps the feat's shape — a fixed benefit that
 * scales with ranks — and maps onto the rule the chapter actually prints.
 */

const has = (featNames, name) => Array.from(featNames ?? [])
  .some((n) => String(n).trim().toLowerCase() === name);

/* ------------------------------------------------------------------ */
/* Group Coercion                                                      */
/* ------------------------------------------------------------------ */

/** Intimidate ranks per additional free target, beyond the first. */
export const GROUP_COERCION_RANKS_PER_TARGET = 5;

/**
 * How many additional Coerce targets cost no DC at all.
 *
 * ONE, PLUS ONE PER FIVE RANKS. See the module note for why the printed
 * "-4… a further -2" is read as targets rather than as DC: the chapter's
 * own multi-target cost is +2 DC each, uniformly, so there is no -4 for
 * the feat to ignore and no smaller penalty for it to ignore afterwards.
 *
 * @param {string[]} featNames
 * @param {number} intimidateRanks
 * @returns {number} additional targets that are free
 */
export function groupCoercionFreeTargets(featNames = [], intimidateRanks = 0) {
  if (!has(featNames, "group coercion")) return 0;
  const ranks = Math.max(0, Math.floor(Number(intimidateRanks) || 0));
  return 1 + Math.floor(ranks / GROUP_COERCION_RANKS_PER_TARGET);
}

/*
 * `coerceTargetCost` stood here until 3.367.0 and is named rather than
 * silently dropped. It priced the free-target waiver itself — the same sum
 * `resolveTradeoffs` has always done from the waiver the action workflow
 * hands it — and was called by nothing. Two places deciding one question,
 * with the tested one inert. Its four checks were re-pointed at the live
 * path rather than deleted with it; see tools/verify-skill-feats.mjs B8-B11.
 */

/* ------------------------------------------------------------------ */
/* Experienced Tracker                                                 */
/* ------------------------------------------------------------------ */

/** What Chapter 4 charges to track at full Speed. */
export const FULL_SPEED_TRACKING_DC = 5;

/**
 * The DC increase for tracking at full Speed.
 *
 * "Increasing the difficulty by 5 lets you track at full Speed" (Chapter
 * 4, Track) — and Experienced Tracker: "you no longer take the penalty for
 * tracking at full speed."
 *
 * THE OPTION HAD TO EXIST FIRST. Until 3.360.0 the Track action offered no
 * full-Speed choice, so the feat's whole text described removing a cost
 * nobody could incur. Adding the option is not scope creep — it is the
 * printed rule the feat is an exception to.
 */
export function fullSpeedTrackingDC(featNames = []) {
  return has(featNames, "experienced tracker") ? 0 : FULL_SPEED_TRACKING_DC;
}

/* ------------------------------------------------------------------ */
/* Canny Smuggler                                                      */
/* ------------------------------------------------------------------ */

/**
 * "When using Underworld to make Earn Income checks, the level of the work
 * is always treated as 1 higher WITHOUT AFFECTING THE DC."
 *
 * THE SECOND HALF OF THAT SENTENCE IS THE WHOLE FEAT. Earn Income's task
 * level does two jobs — it sets the DC and it sets the pay — and this
 * raises only the second. A single number bumped before the DC is read
 * would hand the character a harder check for their trouble, which is the
 * opposite of what the feat sells.
 *
 * @param {string[]} featNames
 * @param {string} skillKey  the skill the Earn Income check is using
 * @param {number} taskLevel
 * @returns {{payLevel: number, dcLevel: number, raised: boolean}}
 */
export function cannySmugglerEarnIncome(featNames = [], skillKey = "", taskLevel = 0) {
  const level = Math.max(0, Math.floor(Number(taskLevel) || 0));
  const applies = has(featNames, "canny smuggler")
    && String(skillKey).trim().toLowerCase() === "underworld";
  return {
    payLevel: applies ? level + 1 : level,
    dcLevel: level,
    raised: applies
  };
}

/* ------------------------------------------------------------------ */
/* Schooled in Secrets                                                 */
/* ------------------------------------------------------------------ */

/**
 * "When you make a Gather Information check to obtain knowledge about
 * cults or religious groups, you may INSTEAD USE your Religion skill
 * instead of Diplomacy."
 *
 * OFFERED, NOT SUBSTITUTED. "May" is the operative word, and the subject
 * matter — whether this particular enquiry is about a cult — is a thing
 * only the player and GM know. So this answers whether the choice exists,
 * and the action asks.
 *
 * @returns {{offered: boolean, skills: string[]}}
 */
export function schooledInSecretsSkills(featNames = [], baseSkills = ["diplomacy"]) {
  if (!has(featNames, "schooled in secrets")) return { offered: false, skills: [...baseSkills] };
  const skills = [...baseSkills];
  if (!skills.includes("religion")) skills.push("religion");
  return { offered: true, skills };
}

/* ------------------------------------------------------------------ */
/* Survey Wildlife                                                     */
/* ------------------------------------------------------------------ */

/** The circumstance penalty on the Recall Knowledge that follows a survey. */
export const SURVEY_WILDLIFE_PENALTY = -2;

/**
 * What a Survey Wildlife attempt yields.
 *
 * "Make a Survival check… If you SUCCEED, you may then make a Recall
 * Knowledge check, albeit with a -2-circumstance penalty."
 *
 * THE SECOND CHECK IS EARNED, not automatic — and a Partial does not earn
 * it. This system's Partial is its own degree and is not a success, the
 * same reading `basicSavingThrow` takes everywhere else.
 *
 * @param {string} degree
 * @returns {{signs: boolean, recall: boolean, penalty: number}}
 */
export function surveyWildlifeOutcome(degree) {
  const succeeded = ["heroic", "critical", "success"].includes(String(degree));
  return {
    signs: succeeded,
    recall: succeeded,
    penalty: succeeded ? SURVEY_WILDLIFE_PENALTY : 0
  };
}

/**
 * SHADOWBORN AGILITY (Racial, Chapter 5, level 5): "When you Fumble a
 * Squeeze (Acrobatics) check, you instead get a result of failure.
 * Furthermore, when you roll a success on an Escape check, it is elevated
 * to a Critical. In the event of a Critical, you have the option to Step
 * up to 5 feet instead of simply Striding."
 *
 * NEW at 3.377.0. In this file, not feats.mjs, because it changes what a
 * skill/basic ACTION does — which is what every other rule here is.
 *
 * DECLARED AS PAIRS, NOT AS "ONE STEP BETTER". Both upgrades happen to be
 * a single rung on the degree ladder, and it was tempting to write an
 * `improveDegree` twin to `worsenDegree` and call it twice. Two reasons
 * not to:
 *
 *   1. The book names DESTINATIONS — "a result of failure", "elevated to
 *      a Critical" — not distances. If the ladder ever gains a rung, a
 *      step-based reading silently starts doing something else, while
 *      these pairs go on doing what is printed.
 *   2. `improveDegree` would have had exactly one contrived caller. §5.1:
 *      a rule with no caller is not automation, and manufacturing a
 *      caller to justify an export is the same mistake wearing a hat.
 *
 * The array is the rule. Adding a third clause is adding a row.
 *
 * THE THIRD SENTENCE IS NOT HERE, and that is deliberate. "You have the
 * option to Step up to 5 feet instead of simply Striding" chooses between
 * two actions a player takes after the check resolves; Escape's own
 * critical already prints "may immediately take any action with the Move
 * trait, moving no more than 5 feet", which permits the Step. Automating
 * a choice between two legal moves would take it away from the player.
 * It is surfaced as a note on the card instead — see `shadowbornStepNote`.
 */
const SHADOWBORN_AGILITY_UPGRADES = Object.freeze([
  Object.freeze({ actionKey: "squeeze", from: "fumble", to: "failure" }),
  Object.freeze({ actionKey: "escape", from: "success", to: "critical" })
]);

/** Does this actor own Shadowborn Agility? */
function ownsShadowbornAgility(featNames) {
  return (Array.isArray(featNames) ? featNames : [])
    .some((n) => String(n ?? "").trim().toLowerCase() === "shadowborn agility");
}

/**
 * The degree an action actually resolves at, after Shadowborn Agility.
 *
 * Returns the degree UNCHANGED when the feat does not apply, so a caller
 * can assign the result unconditionally and no call site needs to know
 * whether the feat exists.
 *
 * @param {string} actionKey
 * @param {string} degree The degree rolled.
 * @param {string[]} featNames
 * @returns {{degree: string, upgraded: boolean, from: string|null}}
 */
export function shadowbornAgilityDegree(actionKey, degree, featNames = []) {
  const key = String(actionKey ?? "").trim();
  const rolled = String(degree ?? "").trim().toLowerCase();
  if (ownsShadowbornAgility(featNames)) {
    const match = SHADOWBORN_AGILITY_UPGRADES.find(
      (u) => u.actionKey === key && u.from === rolled
    );
    if (match) return { degree: match.to, upgraded: true, from: match.from, feat: "Shadowborn Agility" };
  }
  // A MODULE FEAT'S UPGRADE (3.561.0), declared through
  // `registerDegreeUpgrades(featName, [{ actionKey, from, to }])` in the
  // same shape as the table above. Pillars of Faith's Keeper of Records
  // ("when using Compare Testaments, a Partial result is treated as a
  // Success"), Close Reading and Watch the Eyes are the first. One
  // upgrade per roll: the first owned feat that matches wins.
  for (const name of Array.isArray(featNames) ? featNames : []) {
    const entries = registeredDegreeUpgrades(name);
    if (!entries) continue;
    const match = entries.find((u) => u.actionKey === key && String(u.from).toLowerCase() === rolled);
    if (match) return { degree: String(match.to).toLowerCase(), upgraded: true, from: rolled, feat: String(name).trim() };
  }
  return { degree: rolled, upgraded: false, from: null, feat: null };
}

/**
 * The line the card prints when Shadowborn Agility has moved a degree,
 * or when its Step option is available on an Escape critical.
 *
 * A SILENT UPGRADE WOULD BE A LIE OF OMISSION. The player sees a card
 * saying "Critical" over a d20 that plainly did not critical; without a
 * line saying why, the only readings available are "the system is broken"
 * or "I misread the die". The §5.9 rule — the card says what the system
 * did — applies to things done FOR you as much as to things done to you.
 *
 * @param {object} result From `shadowbornAgilityDegree`.
 * @param {string} actionKey
 * @returns {string} "" when there is nothing to say.
 */
export function shadowbornStepNote(result, actionKey) {
  if (!result?.upgraded) return "";
  const label = (d) => String(d ?? "").charAt(0).toUpperCase() + String(d ?? "").slice(1);
  const base = `<em>${result.feat ?? "Shadowborn Agility"}: your ${label(result.from)} is treated as a `
    + `<strong>${label(result.degree)}</strong>.</em>`;
  if (String(actionKey ?? "").trim() !== "escape") return base;
  return `${base} <em>You may <strong>Step</strong> up to 5 feet instead of Striding.</em>`;
}
