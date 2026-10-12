/**
 * The action framework (Core 3.1, Chapter 4 — Basic, Special and Skill
 * Actions). Pure logic; action-workflow.mjs drives the Foundry side.
 *
 * Every opposed action in the rulebook resolves the same way: the actor
 * rolls a check (attack, unarmed, a named skill, Spellcraft...) against a
 * DC derived from the target — their Fortitude, Reflex or Will DC (10 +
 * save bonus), their Attack DC (attack bonus + 10), or a fixed number —
 * and reads the outcome for the degree achieved.
 */

/** What an action's check can be rolled against. */
export const ACTION_TARGETS = Object.freeze({
  none: { label: "No target DC" },
  fortitudeDC: { label: "Target's Fortitude DC" },
  reflexDC: { label: "Target's Reflex DC" },
  willDC: { label: "Target's Will DC" },
  attackDC: { label: "Target's Attack DC" },
  defence: { label: "Target's Defence (DB)" },
  levelDC: { label: "Target's Level DC" },
  // Some actions are level-based checks against the actor's *own* level
  // rather than a target's — Invoke Rage and Revoke Rage. Kept distinct
  // from levelDC so they resolve with nothing targeted, instead of
  // warning for a target they never needed.
  selfLevelDC: { label: "Your own Level DC" },
  fixed: { label: "Fixed DC" }
});

/** Check types an action may call for. */
export const ACTION_CHECK_TYPES = Object.freeze({
  none: { label: "No check", checkType: null },
  attack: { label: "Attack check", checkType: "attack" },
  unarmed: { label: "Unarmed attack check", checkType: "attack" },
  skill: { label: "Skill check", checkType: "skill" },
  spellcraft: { label: "Spellcraft check", checkType: "spellcraft" },
  save: { label: "Saving throw", checkType: "save" }
});

/** The seven degree keys, best to worst, as outcome fields. */
export const OUTCOME_KEYS = Object.freeze([
  "heroic",
  "critical",
  "success",
  "partial",
  "failure",
  "fumble",
  "blunder"
]);

/**
 * Resolve the DC an action rolls against, from the target's derived data.
 * A few actions (Trip Attack: "the target's Acrobatics DC or Fortitude DC,
 * whichever is higher") compare against more than one DC and take the
 * higher — pass an array of ACTION_TARGETS keys for those; the highest
 * successfully-resolved one wins.
 *
 * @param {string|string[]} against One or more ACTION_TARGETS keys.
 * @param {object|null} targetSystem The target actor's system data.
 * @param {number|null} [fixedDC]
 * @param {object|null} [actorSystem] The acting actor's own system data,
 *   needed only by the self-referencing targets (selfLevelDC).
 * @returns {{dc: number|null, label: string, missingTarget: boolean}}
 */
export function actionTargetDC(against, targetSystem, fixedDC = null, actorSystem = null) {
  if (Array.isArray(against)) {
    const results = against.map((key) =>
      resolveOneTarget(key, targetSystem, fixedDC, actorSystem)
    );
    const resolved = results.filter((r) => r.dc !== null);
    if (!resolved.length) {
      return {
        dc: null,
        label: results.map((r) => r.label).join(" or "),
        missingTarget: results.some((r) => r.missingTarget)
      };
    }
    const best = resolved.reduce((a, b) => (b.dc > a.dc ? b : a));
    return { ...best, label: results.map((r) => r.label).join(" or ") };
  }
  return resolveOneTarget(against, targetSystem, fixedDC, actorSystem);
}

import { levelDC } from "../dice/resolution.mjs";

function resolveOneTarget(against, targetSystem, fixedDC, actorSystem = null) {
  const skillMatch = /^skillDC:(.+)$/.exec(against ?? "");
  if (skillMatch) {
    const label = `Target's ${skillMatch[1]} DC`;
    if (!targetSystem) return { dc: null, label, missingTarget: true };
    const dc = Number(targetSystem.skills?.[skillMatch[1]]?.dc ?? NaN);
    return { dc: Number.isFinite(dc) ? dc : null, label, missingTarget: false };
  }

  const meta = ACTION_TARGETS[against] ?? ACTION_TARGETS.none;

  if (against === "none") return { dc: null, label: meta.label, missingTarget: false };
  if (against === "selfLevelDC") {
    return {
      dc: levelDC(actorSystem?.identity?.level ?? 0),
      label: meta.label,
      missingTarget: false
    };
  }
  if (against === "fixed") {
    return {
      dc: Number.isFinite(Number(fixedDC)) ? Number(fixedDC) : null,
      label: meta.label,
      missingTarget: false
    };
  }
  if (!targetSystem) return { dc: null, label: meta.label, missingTarget: true };

  const combat = targetSystem.combat ?? {};
  let dc = null;
  switch (against) {
    case "fortitudeDC":
      dc = Number(combat.saves?.fortitude?.dc ?? NaN);
      break;
    case "reflexDC":
      dc = Number(combat.saves?.reflex?.dc ?? NaN);
      break;
    case "willDC":
      dc = Number(combat.saves?.will?.dc ?? NaN);
      break;
    case "attackDC":
      dc = Number(combat.attack?.dc ?? NaN);
      break;
    case "defence":
      dc = Number(combat.defence?.total ?? NaN);
      break;
    case "levelDC":
      dc = levelDC(targetSystem.identity?.level ?? 0);
      break;
    default:
      dc = null;
  }
  return {
    dc: Number.isFinite(dc) ? dc : null,
    label: meta.label,
    missingTarget: false
  };
}

/**
 * Does an actor meet a Special Action's requirement? Requirements are
 * expressed as a dotted path into the actor's system data plus a minimum
 * value — e.g. "combat.movement.fly" must be > 0 for Fly.
 *
 * @param {string|null} requirement A dotted system-data path, or null for
 *   no requirement (always available).
 * @param {object} actorSystem
 * @returns {boolean}
 */
export function meetsActionRequirement(requirement, actorSystem) {
  if (!requirement) return true;
  const node = requirement
    .split(".")
    .reduce((at, key) => at?.[key], actorSystem);
  // A POOL RESOLVES TO ITS TOTAL (3.412.0). Movement speeds became bonus
  // pools, so `combat.movement.fly` is an OBJECT now — and `Number({})`
  // is NaN, which is not > 0. Every Fly and Burrow action would have
  // silently stopped being available, with nothing saying why.
  const value = node !== null && typeof node === "object" ? node.total : node;
  return Number(value ?? 0) > 0;
}

/** Every Skill/General Skill Action registered for a given skill key. */
export function actionsForSkill(skillKey, registry) {
  return registry.filter((entry) => entry.skills?.includes(skillKey));
}

/**
 * Pick the outcome text for the degree achieved. Rulebook actions list only
 * the degrees they care about (Grapple has no Heroic or Partial line), so
 * when the achieved degree has no text this reports every listed outcome
 * for the table to adjudicate rather than guessing an adjacent row.
 *
 * @param {string} degreeKey
 * @param {object} outcomes The action's outcome fields.
 * @returns {{matched: boolean, text: string|null,
 *   listed: Array<{key: string, text: string}>}}
 */
export function pickOutcome(degreeKey, outcomes = {}) {
  const listed = OUTCOME_KEYS.filter(
    (key) => String(outcomes?.[key] ?? "").trim().length
  ).map((key) => ({ key, text: String(outcomes[key]).trim() }));

  const text = String(outcomes?.[degreeKey] ?? "").trim();
  if (text) return { matched: true, text, listed };
  return { matched: false, text: null, listed };
}

/* ══════════════════════════════════════════════════════════════════════
 * AN ACTION THAT OFFERS SEVERAL SKILLS HAS TO ASK WHICH (3.593.0)
 *
 * Graham, 25 September 2026: "the Flowing Movement Basic Action does not
 * ask for a Skill. When selected, it should ask for a skill."
 *
 * FLOWING MOVEMENT DECLARED `checkType: "skill"` AND NAMED NO SKILL.
 * Every other skill action carries a `skills` array and the workflow
 * reads `action.skills?.[0]`; this one had no array at all, so the key
 * came out undefined, `system.skills[undefined]` was undefined, and the
 * check rolled with a modifier list of one entry reading
 * `{ label: "Skill", value: 0 }`. A flat d20 against the DC, labelled
 * "Flowing Movement — Skill", with the character's Athletics nowhere in
 * it. Nothing refused, nothing warned: the card looked like a roll.
 *
 * Its page says "make a check appropriate to one of the movement types
 * involved (the GM determines which)", which is a choice the data could
 * not express while an action had exactly one skill or none.
 *
 * SO THE RULE IS GENERAL, not a Flowing Movement special case. Any
 * action offering more than one skill asks; any action offering one
 * takes it; an action offering none with `checkType: "skill"` is a
 * DATA FAULT and says so rather than rolling a bare die. Written here
 * once so the next multi-skill action inherits it instead of repeating
 * the hole.
 * ════════════════════════════════════════════════════════════════════ */

/**
 * The skills this action may be rolled with.
 *
 * @param {object} action a basic or skill action entry
 * @returns {string[]} in offer order; the first is the default
 */
export function actionSkillChoices(action) {
  const raw = Array.isArray(action?.skills) ? action.skills : [];
  const seen = new Set();
  const out = [];
  for (const key of raw) {
    const k = String(key ?? "").trim();
    // A BLANK ENTRY IS NOT A CHOICE. `["athletics", ""]` would otherwise
    // offer a nameless second option that resolves to no skill at all —
    // which is the very shape this rule exists to end.
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Must this invocation stop and ask which skill to roll?
 *
 * NOT ASKED WHEN THE CALLER ALREADY KNOWS. The Ready dialog expands a
 * skill action into one entry per skill and hands the chosen key back,
 * and Schooled in Secrets substitutes Religion outright — both arrive
 * with `invokedSkillKey` already set, and asking again would be a second
 * question about a decision already made.
 *
 * @param {object} action
 * @param {string|null} invokedSkillKey what the caller already chose
 * @returns {boolean}
 */
export function actionNeedsSkillChoice(action, invokedSkillKey = null) {
  if (action?.checkType !== "skill") return false;
  if (String(invokedSkillKey ?? "").trim()) return false;
  return actionSkillChoices(action).length > 1;
}

/**
 * An action that says it rolls a skill and names none.
 *
 * This is the state Flowing Movement was in, and it is worth its own
 * question because the answer is not "ask the player" — there is nothing
 * to offer them — but "say so". A check with no skill behind it is a
 * defect in the data, and rolling a bare d20 hides it.
 */
export function actionSkillIsUnnamed(action) {
  return action?.checkType === "skill" && actionSkillChoices(action).length === 0;
}
