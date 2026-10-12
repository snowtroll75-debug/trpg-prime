/**
 * The Foundry half of wondrous-use.mjs (3.617.0, C8 of block 37): the
 * Gloves of Vitality's once-a-day heal.
 *
 * Refusals come before anything is spent — the AP, the day's use. An undead
 * or a construct is not living, so the gloves do nothing to it (and, by the
 * page, cannot harm the undead either); the use is kept.
 */

import {
  WONDROUS_USED_FLAG, WORN_SINCE_FLAG, removalPenaltyDue, removalPenaltyOf, wondrousAfterChange,
  wondrousUseOf, wondrousUsePatientRefusal, wondrousUseRefusal
} from "./wondrous-use.mjs";
import { wondrousActive } from "./wondrous-effects.mjs";
import { activationCost, recipientMode } from "./elixirs.mjs";

const SYSTEM_ID = "trg-prime";

/** The pure rules the removal hooks read, gathered (static imports: a hook is synchronous). */
const WONDROUS_USE_API = Object.freeze({
  WORN_SINCE_FLAG, removalPenaltyDue, removalPenaltyOf, wondrousActive, wondrousAfterChange
});

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/**
 * Use a wondrous item's activated ability. Null when refused.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function useWondrousItem(actor, item) {
  const use = wondrousUseOf(item);
  const allowed = wondrousUseRefusal(item);
  if (!allowed.ok) {
    ui.notifications.warn(`${item.name} ${allowed.reason}.`);
    return null;
  }
  if (use.kind === "use") return useRegisteredAbility(actor, item, use);

  // WHO: the one targeted creature within reach, or the wearer with nothing
  // targeted ("an adjacent living creature" — the wearer is one).
  const targets = Array.from(game.user?.targets ?? []);
  const own = actor.getActiveTokens?.()?.[0] ?? null;
  const only = targets.length === 1 ? targets[0] : null;
  let distance = null;
  if (only && own && only.document?.id !== own.document?.id) {
    const { distanceBetween } = await import("./combat/geometry.mjs");
    distance = distanceBetween(own, only);
  }
  const who = recipientMode({
    targetCount: targets.length,
    targetIsSelf: Boolean(only && own && only.document?.id === own.document?.id) || only?.actor?.id === actor.id,
    distance,
    reach: use.reach ?? 5
  });
  if (who.mode === "refuse") {
    ui.notifications.warn(`${item.name}: ${who.reason.replace("to feed it", "to heal it").replace("feed a creature", "heal a creature")}.`);
    return null;
  }
  const patient = who.mode === "fed" ? only.actor : actor;
  if (!patient) return null;

  // LIVING IS THE KIND GATE'S WORD, NOT A TRAIT (3.617.1, F1 of the 3.617.0
  // drive): asking `isOfKind(system, "living")` was false for everyone, so
  // the gloves healed nobody. See wondrousUsePatientRefusal.
  const refusal = wondrousUsePatientRefusal(patient.system ?? {}, patient.name);
  if (refusal) {
    ui.notifications.warn(`${item.name}: ${refusal} The gloves' essence healing does nothing to it.`);
    return null;
  }

  const cost = activationCost(use.activation, { inCombat: Boolean(game.combat?.started) });
  if (!cost.allowed) {
    ui.notifications.warn(`${item.name} ${cost.reason}.`);
    return null;
  }
  if (cost.ap > 0) {
    const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
    if (!await ensureActionPoints(actor, cost.ap, item.name)) return null;
    await spendActionPoints(actor, cost.ap, item.name);
  }

  const roll = await new Roll(use.formula).evaluate();
  const { healActor } = await import("./magic/spell-effects.mjs");
  const restored = await healActor(patient, roll.total, { magical: true });
  if (use.frequency === "daily") await item.setFlag(SYSTEM_ID, WONDROUS_USED_FLAG, true);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${esc(actor.name)}</span><h3>${esc(item.name)} — Heal</h3></div></header>`
      + line(`<strong>${esc(actor.name)}</strong> lays the gloves on <strong>${esc(patient.name)}</strong>: `
        + `${use.formula} = <strong>${roll.total}</strong> essence healing (${restored} HP restored).`)
      + (use.frequency === "daily" ? line("<em>Used for today — renewed at daily preparation.</em>") : "")
      + `</div>`
  });
  return { used: true, patient: patient.id, healed: restored, rolled: roll.total };
}

/* ─────────────────────── the Agile Sash's removal ─────────────────────── */

/**
 * The penalty, laid on the actor that took the sash off: "a status penalty
 * to your Dexterity ability score for the next 24 hours equal to the item's
 * bonus. This penalty cannot be removed by any means short of a PP 20+
 * spell" — that last is the table's; the effect says so.
 */
async function laySashPenalty(actor, item, value) {
  const { REMOVAL_PENALTY_SECONDS } = await import("./wondrous-use.mjs");
  const { CHANGE_TYPE } = await import("./effect-change-types.mjs");
  const penalty = removalPenaltyOf(item);
  if (!actor || !penalty || !value) return;
  const now = Number(game.time?.worldTime ?? 0);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `${item.name} — Removed`,
    img: item.img || "icons/svg/downgrade.svg",
    changes: [{ key: `${penalty.target}.status`, type: CHANGE_TYPE.CUSTOM, value: String(-value) }],
    description: `Removed after being worn for 24 hours: −${value} status penalty to ${penalty.stat} for 24 hours. `
      + "It cannot be removed by any means short of a PP 20+ spell.",
    flags: { [SYSTEM_ID]: { spellEffect: true, spellEffectEnd: now + REMOVAL_PENALTY_SECONDS, sashRemoval: true } }
  }]);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${esc(actor.name)}</span><h3>${esc(item.name)} — Removed</h3></div></header>`
      + line(`Worn for more than 24 hours, the sash clings as it comes off: <strong>−${value} status penalty to `
        + `${esc(penalty.stat)}</strong> for the next 24 hours.`)
      + line("<em>Nothing short of a PP 20+ spell removes it.</em>")
      + `</div>`
  });
}

/** Register the removal clock. Called once, at init. */
export function registerWondrousHooks() {
  Hooks.on("preUpdateItem", (item, changes, options) => {
    if (!item?.flags?.[SYSTEM_ID]?.wondrous) return;
    const api = WONDROUS_USE_API;
    if (!api.removalPenaltyOf(item)) return;
    const flat = foundry.utils.flattenObject(changes ?? {});
    const invested = flat["system.invested"];
    const equipped = flat["system.equipped"];
    if (invested === undefined && equipped === undefined) return;
    const before = api.wondrousActive(item);
    const after = api.wondrousActive(api.wondrousAfterChange(item, { invested, equipped }));
    if (before === after) return;
    const now = Number(game.time?.worldTime ?? 0);
    if (after) {
      foundry.utils.setProperty(changes, `flags.${SYSTEM_ID}.${api.WORN_SINCE_FLAG}`, now);
      return;
    }
    const due = api.removalPenaltyDue(item, now);
    foundry.utils.setProperty(changes, `flags.${SYSTEM_ID}.${api.WORN_SINCE_FLAG}`, 0);
    if (due) options.trgSashRemoval = due;
  });
  Hooks.on("updateItem", (item, changes, options, userId) => {
    if (!options?.trgSashRemoval || userId !== game.user?.id) return;
    void laySashPenalty(item.parent, item, options.trgSashRemoval);
  });
  Hooks.on("preDeleteItem", (item, options) => {
    if (!item?.flags?.[SYSTEM_ID]?.wondrous || !item.parent) return;
    const api = WONDROUS_USE_API;
    if (!api.wondrousActive(item)) return;
    const due = api.removalPenaltyDue(item, Number(game.time?.worldTime ?? 0));
    if (due) options.trgSashRemoval = due;
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    if (!options?.trgSashRemoval || userId !== game.user?.id) return;
    void laySashPenalty(item.parent, item, options.trgSashRemoval);
  });
}

/**
 * A WONDROUS ITEM'S REGISTERED USE (3.626.0): `{ kind: "use", automation,
 * activation, frequency }` runs the `{ use(actor, item, ability) }` a
 * companion module registered under that name. The AP is paid here; the
 * frequency is marked here — daily on the wondrous marker, Focus on the
 * item's own flag that Refocus clears — once the automation reports it ran
 * (a `false` return leaves the use unspent).
 */
async function useRegisteredAbility(actor, item, use) {
  const { registeredItemAutomation } = await import("./module-api.mjs");
  const automation = registeredItemAutomation(use.automation);
  if (!automation) {
    ui.notifications.warn(`${item.name}: nothing is registered to run "${use.automation}" — is its module active?`);
    return null;
  }
  const cost = activationCost(use.activation, { inCombat: Boolean(game.combat?.started) });
  if (!cost.allowed) {
    ui.notifications.warn(`${item.name} ${cost.reason}.`);
    return null;
  }
  if (cost.ap > 0) {
    const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
    if (!await ensureActionPoints(actor, cost.ap, item.name)) return null;
    await spendActionPoints(actor, cost.ap, item.name);
  }
  const ran = await automation.use(actor, item, use);
  if (ran === false) return null;
  if (use.frequency === "daily") await item.setFlag(SYSTEM_ID, WONDROUS_USED_FLAG, true);
  if (use.frequency === "focus") await item.setFlag(SYSTEM_ID, "wondrousFocusExpended", true);
  return { used: true };
}
