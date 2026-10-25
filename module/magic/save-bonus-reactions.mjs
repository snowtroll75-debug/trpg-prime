/**
 * save-bonus-reactions — a reaction that rolls a skill before a save and adds
 * the Bonus Check result to it.
 *
 * NEW at 3.666.0 (Inner Tempest Block 2; Graham's rulings of 21 October
 * 2026). Steel the Mind: "Trigger: you are required to make a Will saving
 * throw against an effect with the Emotion or Mental trait … Make a Mental
 * Focus check against your Level DC and compare the result to the Bonus
 * Check table. Any positive result is added as a circumstance bonus to the
 * triggering Will saving throw … declared before the triggering saving throw
 * is rolled."
 *
 * The neighbouring seam (save-reactions.mjs) answers a save with ADVANTAGE
 * and nothing else. This answers it with a number, from a roll of the
 * defender's own, so it is a sibling rather than a fourth key on that flag.
 *
 * DECLARED BY FLAG on an item or a live effect:
 *
 *   flags.trg-prime.saveBonusReaction = {
 *     label:   "Steel the Mind",
 *     skill:   "mentalFocus",          the skill rolled against your Level DC
 *     saves:   ["will"],               which saves it answers (empty: any)
 *     traits:  ["emotion", "mental"],  the effect must carry one (empty: any)
 *     type:    "circumstance"          the bonus type (default circumstance)
 *   }
 *
 * The decision is pure and lives here; the prompt and the roll are below it.
 */

const SYSTEM_ID = "trg-prime";
const lower = (v) => String(v ?? "").trim().toLowerCase();
const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[,;]/)).map(lower).filter(Boolean);

/** One declaration, normalised, or null. */
export function normaliseSaveBonusReaction(raw, sourceName = "") {
  if (!raw || typeof raw !== "object") return null;
  const skill = String(raw.skill ?? "").trim();
  if (!skill) return null;
  return {
    label: String(raw.label ?? sourceName ?? "Reaction"),
    skill,
    saves: list(raw.saves),
    traits: list(raw.traits),
    type: lower(raw.type) || "circumstance",
    source: String(sourceName ?? "")
  };
}

/** Every declaration on the actor's items and live effects. */
function saveBonusReactionsOf(actor) {
  const found = [];
  const consider = (document) => {
    const entry = normaliseSaveBonusReaction(document?.flags?.[SYSTEM_ID]?.saveBonusReaction, document?.name);
    if (entry) found.push(entry);
  };
  for (const item of Array.from(actor?.items ?? [])) consider(item);
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (!effect?.disabled) consider(effect);
  }
  return found;
}

/**
 * The declarations that answer this save.
 *
 * @param {object[]} entries from saveBonusReactionsOf
 * @param {{save: string, traits: string|string[]}} roll
 */
export function saveBonusReactionsFor(entries, { save = "", traits = "" } = {}) {
  const key = lower(save);
  const carried = list(traits);
  return (entries ?? []).filter((e) => {
    if (e.saves.length && !e.saves.includes(key)) return false;
    if (e.traits.length && !e.traits.some((t) => carried.includes(t))) return false;
    return true;
  });
}

/** The bonus a Bonus Check degree gives: negative results count as 0. */
export function saveBonusFromDegree(bonusCheckValue) {
  return Math.max(0, Math.trunc(Number(bonusCheckValue) || 0));
}

/**
 * Offer, roll and return the modifier for this save, or null.
 *
 * Asked only when a declaration answers the save, and only when a reaction
 * is left in combat (spent once the answer is yes). Out of combat no
 * reaction is tracked, as for every other reaction.
 *
 * @returns {Promise<{label: string, value: number, type: string}|null>}
 */
export async function offerSaveBonusReaction(actor, { save = "", traits = "", saveName = "save", sourceLabel = "" } = {}) {
  const answers = saveBonusReactionsFor(saveBonusReactionsOf(actor), { save, traits });
  if (!answers.length) return null;
  const { actorInCombat, spendReaction } = await import("../combat/action-points-workflow.mjs");
  const inCombat = actorInCombat(actor);
  if (inCombat && !(Number(actor?.system?.resources?.reactions?.value ?? 0) > 0)) return null;
  const entry = answers[0];
  const skillLabel = actor?.system?.skills?.[entry.skill]?.label ?? entry.skill;
  const { DialogV2 } = foundry.applications.api;
  const taken = await DialogV2.confirm({
    window: { title: `${entry.label} — ${actor.name}`, icon: "fa-solid fa-brain" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <p><strong>${actor.name}</strong> must attempt a ${saveName} save${sourceLabel ? ` — <strong>${sourceLabel}</strong>` : ""}.</p>
      <p>${inCombat ? "Spend a reaction on" : "Use"} <strong>${entry.label}</strong>: a ${skillLabel} check against your Level DC, its Bonus Check result added as a ${entry.type} bonus to this save?</p>
    </div>`,
    yes: { icon: "fa-solid fa-brain", label: entry.label },
    no: { icon: "fa-solid fa-xmark", label: "Save normally", default: true },
    rejectClose: false
  });
  if (!taken) return null;
  if (inCombat) await spendReaction(actor, entry.label);
  const { TRGCheck } = await import("../dice/check.mjs");
  const { levelDC, bonusCheckModifier } = await import("../dice/resolution.mjs");
  const level = Number(actor?.system?.identity?.level ?? 1);
  const skill = actor?.system?.skills?.[entry.skill] ?? {};
  // The skill's own breakdown where the sheet derived one, as a sheet roll
  // uses; its total otherwise.
  const modifiers = Array.isArray(skill.checkModifiers) && skill.checkModifiers.length
    ? skill.checkModifiers
    : [{ label: skillLabel, value: Number(skill.total ?? 0), type: "untyped" }];
  const check = await TRGCheck.roll({
    actor,
    label: entry.label,
    subtitle: `${skillLabel} — before the ${saveName} save`,
    type: "skill",
    subject: entry.skill,
    dc: levelDC(level),
    modifiers
  });
  const value = saveBonusFromDegree(bonusCheckModifier(check?.outcome?.degree?.key ?? "failure"));
  return { label: entry.label, value, type: entry.type };
}
