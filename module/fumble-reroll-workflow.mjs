/**
 * The Foundry side of fumble-reroll.mjs (3.669.0): ask the fumbler, spend
 * the reaction and the use, and say so. The caller rerolls.
 */
import { fumbleRerollRows, fumbleWords } from "./fumble-reroll.mjs";
import { itemUsesMax, itemUsesRemaining } from "./uses-workflow.mjs";
import { reactionRefusal, spendReaction } from "./combat/action-points-workflow.mjs";

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const inCombatNow = (actor) => Boolean(game.combat?.started && game.combat.combatants?.some?.((c) => c.actor?.id === actor.id));

/**
 * The first item that could answer this fumble now — its use left and, in
 * combat, the reaction — or null. Asks nothing; the Strike reads it to
 * decide whether to confirm a fumble early.
 */
export function fumbleRerollAvailable(actor, kind) {
  if (!actor?.isOwner) return null;
  return fumbleRerollRows(Array.from(actor.items ?? []), kind).find(({ item, reaction }) => {
    const max = itemUsesMax(item);
    if (max !== null && max !== Infinity && !(itemUsesRemaining(item) > 0)) return false;
    // THE REACTION AS SPENDING IT WOULD SEE IT (3.669.1): none left, or only
    // Battle Readiness's, which this reaction's traits cannot take.
    return !(reaction && reactionRefusal(actor, String(item.system?.traits ?? "")));
  }) ?? null;
}

/**
 * Offer the first item that can answer this fumble. Resolves `{ label }`
 * when it was taken (its costs paid), or null.
 *
 * @param {Actor} actor
 * @param {"attack"|"skill"|"save"} kind
 * @param {{degree?: string}} [options] the first result's degree, for the
 *   wording (3.669.2): a Blunder is called one
 */
export async function offerFumbleReroll(actor, kind, { degree = "fumble" } = {}) {
  const row = fumbleRerollAvailable(actor, kind);
  if (!row) return null;
  const inCombat = inCombatNow(actor);
  const costs = [row.reaction && inCombat ? "your reaction" : "", itemUsesMax(row.item) !== null && itemUsesMax(row.item) !== Infinity ? "its use" : ""].filter(Boolean);
  const what = kind === "attack" ? "attack check" : kind === "save" ? "saving throw" : "skill check";
  const yes = await foundry.applications.api.DialogV2.confirm({
    window: { title: `${row.label} — ${actor.name}` },
    content: `<p>You ${fumbleWords(degree).verb} the ${what}. Use <strong>${esc(row.label)}</strong>${costs.length ? ` (${costs.join(" and ")})` : ""}: reroll it and use the second result, even if it is worse?</p>`,
    rejectClose: false
  });
  if (!yes) return null;
  // NOTHING IS REROLLED WITHOUT ITS REACTION (3.669.1).
  if (row.reaction && inCombat && !(await spendReaction(actor, row.label, { traits: String(row.item.system?.traits ?? "") }))) return null;
  const max = itemUsesMax(row.item);
  if (max !== null && max !== Infinity) await row.item.update({ "system.usesValue": Math.max(0, itemUsesRemaining(row.item) - 1) });
  return { label: row.label };
}
