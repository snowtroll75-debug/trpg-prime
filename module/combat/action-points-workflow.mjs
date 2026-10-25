/**
 * The Foundry-layer half of Action Points: actually deducting AP on
 * an actor when an apCost-bearing action is used. Only draws from the
 * pool while the ACTING CHARACTER is in an active (started) combat —
 * outside combat, or when a combat is running that this character isn't
 * a participant in, AP isn't tracked turn-by-turn.
 *
 * The gate is `actorInCombat` (below), not a bare `game.combat?.started`:
 * a leftover/empty encounter left running in the tracker would otherwise
 * make every actor — including ones not in that fight — spend AP on
 * spells and actions, which is the bug this guards against.
 */
import { parseApCost, computeApSpend, canAffordAP } from "./action-points.mjs";
import { battleReadinessBonus, battleReadinessSpendBlock, reactionQualifies } from "../fighter.mjs";
import {
  AP_GRANT_FLAG, actionsText, apAvailable, grantOf, restrictedHeld, spendPlan, useKindsOf
} from "./restricted-ap.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Whether an actor is currently taking turns in a live combat: there is a
 * started combat AND this actor is one of its combatants. Foundry's
 * `Actor#inCombat` resolves the actor's token(s) against the active combat
 * (handling unlinked token actors), and `game.combat?.started` ensures the
 * encounter has actually begun (round > 0) rather than merely existing.
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
export function actorInCombat(actor) {
  return Boolean(game.combat?.started && actor?.inCombat);
}

/**
 * MAY THIS ACTION HAPPEN AT ALL — asked before anything is rolled, spent
 * or committed.
 *
 * Graham, 14 Aug 2026: "Casting a spell when not having enough AP gives a
 * warning but does not block the spell being cast."
 *
 * It did not, and deliberately: `spendActionPoints` below has always
 * clamped to 0 and warned rather than refusing, on the grounds that a GM
 * override or an unmodelled bonus-AP source might legitimately apply.
 * That reasoning is sound and is why this does not simply refuse either —
 * but it was being used to justify a SILENT overspend at the end of a
 * resolution, long after the check had been rolled and the PP spent. A
 * notification is not a decision.
 *
 * So the escape hatch becomes an explicit one: refuse by default, and ask
 * whether to proceed anyway. The GM (or player) makes the call knowingly,
 * before anything happens, instead of finding out afterwards.
 *
 * Outside combat, or for a free/reaction cost, this is always true — AP is
 * not tracked turn-by-turn there (see `actorInCombat`).
 *
 * @returns {Promise<boolean>} true to proceed.
 */
export async function ensureActionPoints(actor, apCost, actionName = "This action", { use = null, traits = "" } = {}) {
  if (!actorInCombat(actor)) return true;

  // BONUS AP THAT ONLY BUYS CERTAIN ACTIONS (3.648.0; see restricted-ap.mjs):
  // Haste's point is not there for a spell, and Fast Attack's is not there
  // for a Stride. What this action may draw on is the general points plus
  // any restricted point that serves it.
  const kinds = useKindsOf(actionName, { use, traits });
  const currentAP = apAvailable(actor, kinds);
  const { cost, affordable, shortfall } = canAffordAP(currentAP, apCost);
  if (!cost || affordable) return true;
  const barred = restrictedHeld(actor).filter((e) => !e.actions.some((a) => kinds.includes(a)));
  const barredLine = barred.length
    ? `<p>${barred.map((e) => `${e.value} AP from ${e.label} may only be spent on ${actionsText(e.actions)}`).join("; ")}, so it does not count here.</p>`
    : "";

  const proceed = await foundry.applications.api.DialogV2.confirm({
    window: { title: `${actionName} — Not Enough AP` },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <p><strong>${actionName}</strong> costs <strong>${cost} AP</strong>, and ${actor.name} has <strong>${currentAP}</strong> to spend on it — ${shortfall} short.</p>${barredLine}
      <p class="hint">Proceed anyway? Take this only for a GM override or a bonus-AP source the sheet does not model. The pool will still be reduced to 0.</p>
    </div>`,
    yes: { icon: "fa-solid fa-triangle-exclamation", label: "Proceed anyway" },
    no: { icon: "fa-solid fa-xmark", label: "Cancel", default: true },
    rejectClose: false
  });
  return Boolean(proceed);
}

/**
 * Spends AP for an action, if currently in combat and the cost is
 * non-zero. Does not block the action — an insufficient pool still
 * clamps to 0 and warns.
 *
 * THIS IS THE BACKSTOP, NOT THE GATE (3.311.3). `ensureActionPoints`
 * above is what refuses; by the time this runs the decision has been
 * made. It still clamps-and-warns because a cost can GROW after the gate
 * — extra casting time, a metamagic AP delta — and reporting that is
 * better than unwinding a resolved action half-way through.
 *
 * @param {Actor} actor
 * @param {string|number} apCost e.g. "1", "3", "Free", "Reaction".
 * @param {string} [actionName] For the warning message, if any.
 */
export async function spendActionPoints(actor, apCost, actionName = "This action", { use = null, traits = "" } = {}) {
  if (!actorInCombat(actor)) return;

  const cost = parseApCost(apCost);
  if (!cost) return;

  const currentAP = Number(actor.system?.resources?.ap?.value ?? 0);
  const result = computeApSpend(currentAP, cost);
  // RESTRICTED POINTS FIRST, AND ONLY FOR WHAT THEY SERVE (3.648.0). A
  // Strike spends Fast Attack's or Haste's point before a general one; a
  // spell never touches them unless it overruns the general points.
  const grant = grantOf(actor);
  const grantUpdate = {};
  if (grant && (grant.entries ?? []).length) {
    const plan = spendPlan(currentAP, grant.entries, cost, useKindsOf(actionName, { use, traits }));
    grantUpdate[`flags.${SYSTEM_ID}.${AP_GRANT_FLAG}.entries`] = plan.entries;
  }

  // THE ROUND THIS ACTOR LAST SPENT AP IN (3.619.0; Chapter 12, Graham's
  // R10): Boost Your Defence is spent "at the start of any combat round",
  // read as before any action point that round (conviction.mjs). Stamped
  // in the same update, here, because every spend passes through here.
  await actor.update({
    "system.resources.ap.value": result.newValue,
    // AND THE TURN (3.622.0; Graham's R11 of block 39): a Word spell "must
    // be used as your opening action", and every AP spent passes here.
    [`flags.${SYSTEM_ID}.apSpentRound`]: { combatId: game.combat.id, round: game.combat.round, turn: game.combat.turn },
    ...grantUpdate
  });

  // SHARED AP (page 200; the block-19 audit's D13, Graham's R13 of 21
  // September 2026): "You and your mount operate with a combined pool of
  // action points." One pool shown on two sheets, so whatever one half
  // spends the other half has spent too — Tomas's own example on the
  // page: 1 AP on Command an Animal leaves 2 between them.
  //
  // AFTER THE SPEND, not instead of it: the actor's own pool is the one
  // the cost was measured against, and this carries the result across.
  {
    const { syncSharedAP } = await import("./mounted-workflow.mjs");
    await syncSharedAP(actor, result.newValue);
  }

  if (!result.sufficient) {
    ui.notifications.warn(
      `${actionName} costs ${cost} AP, but ${actor.name} only had ${currentAP} — AP reduced to 0.`
    );
  }

  /*
   * SONIC 90 IS WATCHING (3.581.0; the pages 211-220 audit's D9,
   * Graham's R9): "Each time the target spends more than 1 AP in a round
   * they must make a DC 5 flat check or fall unconscious for 1 minute."
   *
   * HERE, BECAUSE THIS IS WHERE AN ACTION POINT ACTUALLY LEAVES A POOL.
   * Every action, spell, reaction and manoeuvre in the system passes
   * through this one function, so nothing has to remember to report its
   * own spending. A watch hung on the turn tracker instead would see a
   * round's total and could never answer "each time".
   *
   * AFTER THE SPEND, like the shared-AP sync above it, so the check is
   * asked about an expenditure that has really happened.
   */
  {
    const { checkApSpendWatch } = await import("./critical-ap-watch.mjs");
    await checkApSpendWatch(actor, cost);
  }
}

/**
 * Gives AP back for an action that was called off.
 *
 * NEW at 3.480.0, for Graham's ruling that cancelling Missile Storm's
 * target picker refunds the cast.
 *
 * THE SAME `actorInCombat` GUARD AS THE SPEND, and that is the whole
 * reason this is a function rather than an inline addition at the call
 * site. AP is only ever TAKEN in combat; a refund without the guard
 * would hand a caster three AP they never paid the moment they
 * cancelled a spell outside an encounter — inventing a resource from
 * nothing, which is worse than the defect being fixed.
 *
 * CLAMPED TO THE MAXIMUM, because a refund restores a known previous
 * value and can never lift a pool above its own ceiling. An unclamped
 * add would turn a cancelled 3 AP spell into a way of banking AP.
 *
 * @param {Actor} actor
 * @param {number|string} apCost what the action took
 */
export async function refundActionCost(actor, apCost) {
  if (!actorInCombat(actor)) return;
  const cost = parseApCost(apCost);
  if (!cost) return;
  const current = Number(actor.system?.resources?.ap?.value ?? 0);
  // THE TURN'S BONUS AP COUNTS (3.648.0): a hasted creature's 4 is not
  // clamped back to 3 by a cancelled spell.
  const max = Number(actor.system?.resources?.ap?.max ?? 0) + (Number(grantOf(actor)?.bonus) || 0);
  const restored = Math.min(Math.max(0, max), Math.max(0, current) + cost);
  if (restored === current) return;
  await actor.update({ "system.resources.ap.value": restored });
}

/**
 * Spends the actor's single reaction, if currently in combat — the
 * same "warn, don't block" philosophy as spendActionPoints, since a
 * GM override or an unmodelled bonus reaction might legitimately
 * apply. Reused generic clamp-at-0 math (computeApSpend), since
 * spending a reaction is the same shape as spending AP, just against
 * a different pool.
 *
 * @param {Actor} actor
 * @param {string} [actionName] For the warning message, if any.
 */
/**
 * WHY THIS ACTOR COULD NOT SPEND A REACTION NOW, or "" when it could
 * (3.669.1). Out of combat nothing is spent, so nothing refuses. In combat:
 * none left, or only Battle Readiness's left and this reaction carries
 * neither the Attack nor the Martial trait. Asks nothing and changes
 * nothing; an offer reads it before it asks (found live: Fortune's Reversal
 * was offered, its reaction refused, and the reroll made anyway).
 */
export function reactionRefusal(actor, traits = "") {
  if (!actorInCombat(actor)) return "";
  if (Number(actor.system?.resources?.reactions?.value ?? 0) <= 0) return `${actor.name} has no reaction left this round.`;
  if (battleReadinessBonus(actor) > 0) {
    return battleReadinessSpendBlock({
      hasBattleReadiness: true,
      qualifies: reactionQualifies(traits),
      nonQualifyingSpent: Boolean(actor.getFlag?.(SYSTEM_ID, "nonMartialReactionSpent"))
    }) ?? "";
  }
  return "";
}

/**
 * Spend the reaction. RESOLVES WHETHER IT WAS SPENT (3.669.1): true out of
 * combat (nothing to spend) or when spent; false when Battle Readiness
 * refused it or none was left. Callers that ignored the result still may.
 */
export async function spendReaction(actor, actionName = "This action", { traits = "" } = {}) {
  if (!actorInCombat(actor)) return true;

  // Battle Readiness (Fighter, 2nd): the extra reaction in the pool may
  // only go on a Reaction with the Attack or Martial trait, enforced as
  // "at most one NON-qualifying spend per round". The resolveAction gate
  // refuses such an action before anything happens; this is the second
  // half — recording which kind of spend this was (and defence in depth
  // for callers that reach here without passing that gate).
  const hasBattleReadiness = battleReadinessBonus(actor) > 0;
  if (hasBattleReadiness) {
    const qualifies = reactionQualifies(traits);
    const blocked = battleReadinessSpendBlock({
      hasBattleReadiness,
      qualifies,
      nonQualifyingSpent: Boolean(actor.getFlag?.(SYSTEM_ID, "nonMartialReactionSpent"))
    });
    if (blocked) {
      ui.notifications.warn(`${actionName}: ${blocked}`);
      return false;
    }
    if (!qualifies) {
      await actor.setFlag(SYSTEM_ID, "nonMartialReactionSpent", true);
    }
  }

  const currentReactions = Number(actor.system?.resources?.reactions?.value ?? 0);
  const result = computeApSpend(currentReactions, 1);

  await actor.update({ "system.resources.reactions.value": result.newValue });

  if (!result.sufficient) {
    ui.notifications.warn(`${actionName} needs a reaction, but ${actor.name} has none left this turn.`);
    return false;
  }
  return true;
}

/**
 * Spends whichever cost an action actually has — AP, or the single
 * reaction, dispatched by the cost string itself so callers (mainly
 * resolveAction) don't need to special-case Reaction-cost actions
 * individually.
 *
 * @param {Actor} actor
 * @param {string|number} apCost
 * @param {string} [actionName]
 */
export async function spendActionCost(actor, apCost, actionName = "This action", { traits = "", use = null } = {}) {
  if (String(apCost ?? "").trim().toLowerCase() === "reaction") {
    return spendReaction(actor, actionName, { traits });
  }
  return spendActionPoints(actor, apCost, actionName, { use, traits });
}
