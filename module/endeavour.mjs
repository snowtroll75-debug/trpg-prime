import { ATTRIBUTE_LABELS } from "./config.mjs";
import { abilityBaseRange } from "./attributes.mjs";

/**
 * Endeavour (optional rule, from Graham's Endeavour Rules document).
 *
 * "You may earn endeavour for extreme results and GM-judged risk or
 * significant challenge." What counts as "risk" or a "Significant
 * Challenge" is a GM call the rules never formula-ise, so Endeavour is
 * gained by hand — a plain editable field on the sheet, the same
 * treatment Luck already gets for the same reason (Graham's decision,
 * confirmed when this feature was scoped). This module is only the
 * SPENDING half: the downtime purchases and their costs.
 *
 * "Anything purchased with Endeavour increases the max of that resource"
 * — a Skill Point, General/Racial/Class Feat, or Ability Score purchase
 * does not hand the player a specific pick. It raises the BUDGET a pick
 * draws from (system.identity.endeavourSkillPoints,
 * system.identity.endeavourFeats.{general,racial,class}), or the ability
 * score's own base, by one. The player then spends the wider budget
 * through the sheet's existing mechanisms exactly as if they had earned
 * it any other way.
 *
 * The pure section (costs and eligibility) is Foundry-free and covered by
 * verify-endeavour.mjs; the workflow section drives the actual spends.
 */

const SYSTEM_ID = "trg-prime";

/* ------------------------------------------------------------------ */
/* Pure rules                                                          */
/* ------------------------------------------------------------------ */

/** Downtime purchase costs, in Endeavour points. */
export const ENDEAVOUR_COSTS = Object.freeze({
  skillPoint: 3,
  generalFeat: 10,
  racialFeat: 15,
  classFeat: 20,
  abilityScore: 30
});

/** Which identity bonus field each feat-group purchase writes to. */
export const ENDEAVOUR_FEAT_GROUPS = Object.freeze({
  general: { cost: ENDEAVOUR_COSTS.generalFeat, label: "General Feat" },
  racial: { cost: ENDEAVOUR_COSTS.racialFeat, label: "Racial Feat" },
  class: { cost: ENDEAVOUR_COSTS.classFeat, label: "Class Feat" }
});

/** Whether the current Endeavour balance can afford a cost. */
export function canAffordEndeavour(value, cost) {
  return Math.max(0, Number(value) || 0) >= Math.max(0, Number(cost) || 0);
}

/**
 * Whether an Ability Score purchase may raise this ability's base by 1.
 *
 * Endeavour is an additional way to reach the SAME ceiling normal
 * advancement is bound by, not a way past it: "You can also use your
 * level-based ability score increases to bring a base ability above 4 to
 * a maximum of 6" (Chapter 1) is the ceiling this checks, via
 * attributes.mjs's own abilityBaseRange rather than a bare 6 — at low
 * levels that ceiling is lower than 6, and Endeavour respects it exactly
 * as a level-based increase would.
 *
 * @param {number} base The ability's current Base value.
 * @param {number} level The character's level.
 * @returns {boolean}
 */
export function abilityScorePurchaseAllowed(base, level) {
  return (Number(base) || 0) < abilityBaseRange(level).max;
}

/* ------------------------------------------------------------------ */
/* Foundry workflows                                                   */
/* ------------------------------------------------------------------ */

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/** The actor's current Endeavour balance and lifetime spend. */
export function getEndeavourState(actor) {
  const resource = actor?.system?.resources?.endeavour ?? {};
  return {
    value: Number(resource.value ?? 0),
    spent: Number(resource.spent ?? 0)
  };
}

/**
 * Deduct a purchase's cost from the pool and add it to the lifetime spent
 * tally, in the same update as whatever the purchase itself changes.
 */
function spendUpdate(actor, cost, extra = {}) {
  const state = getEndeavourState(actor);
  return actor.update({
    "system.resources.endeavour.value": Math.max(0, state.value - cost),
    "system.resources.endeavour.spent": state.spent + cost,
    ...extra
  });
}

/** Buy a Skill Point (3 Endeavour): +1 to the skill-point budget. */
export async function spendEndeavourSkillPoint(actor) {
  const state = getEndeavourState(actor);
  const cost = ENDEAVOUR_COSTS.skillPoint;
  if (!canAffordEndeavour(state.value, cost)) {
    ui.notifications.warn(`Not enough Endeavour — a Skill Point costs ${cost}, ${actor.name} has ${state.value}.`);
    return false;
  }
  const bonus = Number(actor.system?.identity?.endeavourSkillPoints ?? 0) + 1;
  await spendUpdate(actor, cost, { "system.identity.endeavourSkillPoints": bonus });
  await postCard(actor, "Endeavour — Skill Point", [
    line(`<strong>+1 Skill Point</strong> added to the budget (now ${bonus} bonus point${bonus === 1 ? "" : "s"} from Endeavour).`),
    line(`Spent ${cost} Endeavour.`)
  ]);
  return true;
}

/**
 * Buy a Feat pick (10/15/20 Endeavour by group): +1 to that group's feat
 * budget.
 * @param {Actor} actor
 * @param {"general"|"racial"|"class"} group
 */
export async function spendEndeavourFeat(actor, group) {
  const entry = ENDEAVOUR_FEAT_GROUPS[group];
  if (!entry) return false;
  const state = getEndeavourState(actor);
  if (!canAffordEndeavour(state.value, entry.cost)) {
    ui.notifications.warn(`Not enough Endeavour — a ${entry.label} pick costs ${entry.cost}, ${actor.name} has ${state.value}.`);
    return false;
  }
  const current = Number(actor.system?.identity?.endeavourFeats?.[group] ?? 0);
  const bonus = current + 1;
  await spendUpdate(actor, entry.cost, { [`system.identity.endeavourFeats.${group}`]: bonus });
  await postCard(actor, `Endeavour — ${entry.label}`, [
    line(`<strong>+1 ${entry.label} pick</strong> added to the budget (now ${bonus} bonus pick${bonus === 1 ? "" : "s"} from Endeavour).`),
    line(`Spent ${entry.cost} Endeavour.`)
  ]);
  return true;
}

/** Buy an Ability Score increase (30 Endeavour): +1 to that ability's base. */
export async function spendEndeavourAbilityScore(actor, ability) {
  const cost = ENDEAVOUR_COSTS.abilityScore;
  const label = ATTRIBUTE_LABELS[ability];
  if (!label) {
    ui.notifications.warn("Choose an ability to raise first.");
    return false;
  }
  const state = getEndeavourState(actor);
  if (!canAffordEndeavour(state.value, cost)) {
    ui.notifications.warn(`Not enough Endeavour — an Ability Score costs ${cost}, ${actor.name} has ${state.value}.`);
    return false;
  }
  const level = actor.system?.identity?.level ?? 0;
  const base = Number(actor.system?.attributes?.[ability]?.base ?? 0);
  if (!abilityScorePurchaseAllowed(base, level)) {
    const range = abilityBaseRange(level);
    ui.notifications.warn(`${label} is already at ${base}, the maximum your level allows (${range.max}).`);
    return false;
  }
  await spendUpdate(actor, cost, { [`system.attributes.${ability}.base`]: base + 1 });
  await postCard(actor, "Endeavour — Ability Score", [
    line(`<strong>${label}</strong> base ${base} → <strong>${base + 1}</strong>.`),
    line(`Spent ${cost} Endeavour.`)
  ]);
  return true;
}

/** The spend menu behind the sheet's Endeavour button. */
export async function openEndeavourMenu(actor) {
  const state = getEndeavourState(actor);
  const { DialogV2 } = foundry.applications.api;

  const abilityOptions = Object.entries(ATTRIBUTE_LABELS)
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join("");

  const rows = [
    ["Skill Point", ENDEAVOUR_COSTS.skillPoint, "Raises your skill-point budget by 1 — spend the extra point on a skill as normal."],
    ["General Feat", ENDEAVOUR_COSTS.generalFeat, "Raises your General Feat budget by 1 — pick the feat itself as normal."],
    ["Racial Feat", ENDEAVOUR_COSTS.racialFeat, "Raises your Racial Feat budget by 1 — pick the feat itself as normal."],
    ["Class Feat", ENDEAVOUR_COSTS.classFeat, "Raises your Class Feat budget by 1 — pick the feat itself as normal."],
    ["Ability Score", ENDEAVOUR_COSTS.abilityScore, "Raises one ability's base by 1, up to the same maximum level-based advancement can reach."]
  ]
    .map(([label, cost, rule]) => `<p style="margin:3px 0"><strong>${label} (${cost}):</strong> ${rule}</p>`)
    .join("");

  const action = await DialogV2.wait({
    window: { title: `Endeavour — ${state.value} available (${state.spent} spent)` },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime">${rows}<div class="form-group" style="margin-top:6px"><label>Ability Score purchase — which ability?</label><select name="ability">${abilityOptions}</select></div></div>`,
    buttons: [
      { action: "skillPoint", label: `Skill Point (${ENDEAVOUR_COSTS.skillPoint})` },
      { action: "generalFeat", label: `General Feat (${ENDEAVOUR_COSTS.generalFeat})` },
      { action: "racialFeat", label: `Racial Feat (${ENDEAVOUR_COSTS.racialFeat})` },
      { action: "classFeat", label: `Class Feat (${ENDEAVOUR_COSTS.classFeat})` },
      {
        action: "abilityScore",
        label: `Ability Score (${ENDEAVOUR_COSTS.abilityScore})`,
        callback: (event, button) => ({ action: "abilityScore", ability: button.form.elements.ability?.value })
      },
      { action: "close", label: "Close" }
    ],
    rejectClose: false
  });

  const chosen = action && typeof action === "object" ? action.action : action;
  switch (chosen) {
    case "skillPoint":
      return spendEndeavourSkillPoint(actor);
    case "generalFeat":
      return spendEndeavourFeat(actor, "general");
    case "racialFeat":
      return spendEndeavourFeat(actor, "racial");
    case "classFeat":
      return spendEndeavourFeat(actor, "class");
    case "abilityScore":
      return spendEndeavourAbilityScore(actor, action.ability);
    default:
      return null;
  }
}

/** Whether the Endeavour optional rule is switched on for this world. */
export function endeavourEnabled() {
  return Boolean(game.settings.get(SYSTEM_ID, "endeavourEnabled"));
}
