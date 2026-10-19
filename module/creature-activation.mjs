/**
 * Creature abilities that are USED rather than simply had.
 *
 * Thirty-five of the Codex's abilities print an Action line — an AP cost,
 * a free action with a trigger, a reaction with a frequency, or a bare
 * Requirement. This reads what they printed and turns it into a card.
 *
 * WHAT THIS DOES NOT DO, and why. It does not swallow a creature, track
 * whether a strike was the second one this turn, or spend the AP. Each
 * of those is a bespoke mechanism, and thirty-five bespoke mechanisms
 * built in one pass would be thirty-five untested assumptions — the
 * mistake 3.255.0 deliberately avoided by shipping one aura before a
 * hundred and eleven.
 *
 * What it does is put the ability's own cost, trigger, requirement and
 * outcome ladder in front of the person running it, at the moment they
 * press Use, with the numbers already worked out. That is the same
 * "offered, not applied" convention the auras, the turn-start abilities
 * and the light penalty all follow.
 *
 * Pure and Foundry-free.
 */

import { moduleBreathArea, moduleSwarmArea } from "./creature-area.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * The system's degree ladder, BEST TO WORST — heroic first, blunder last.
 *
 * The comment here read "worst to best" until 3.377.0, which is simply
 * backwards, and `codex-trait-rules.mjs` has described the same array
 * correctly the whole time. Corrected rather than left, because the two
 * consumers move along this array in opposite directions —
 * `worsenDegree` steps forward, Shadowborn Agility's upgrades step back —
 * and anyone implementing the second from this comment would have got the
 * sign wrong and produced a feat that made its owner worse at Escaping.
 */
export const DEGREE_ORDER = Object.freeze([
  "heroic", "critical", "success", "partial", "failure", "fumble", "blunder"
]);

/** The activation block an ability declares, or null. */
export function activationOf(item) {
  const a = item?.flags?.[SYSTEM_ID]?.creatureAbility?.activation;
  return a && typeof a === "object" ? a : null;
}

/**
 * The cost line, as a sheet should show it.
 *
 * "1 AP", "Free", "Reaction", "2 AP, 1 PP/level". A PP cost that scales
 * with level is resolved against the creature's level when one is given,
 * because "1/level" on a level 8 creature means 8 and the person
 * pressing Use should not have to do that arithmetic.
 */
export function activationCostLine(activation, level = null) {
  if (!activation) return "";
  const parts = [];
  if (activation.kind === "free") parts.push("Free");
  else if (activation.kind === "reaction") parts.push("Reaction");
  else if (Number.isFinite(Number(activation.ap))) parts.push(`${Number(activation.ap)} AP`);

  if (activation.ppPerLevel) {
    const lvl = Number(level);
    parts.push(Number.isFinite(lvl) && lvl > 0
      ? `${activation.ppPerLevel * lvl} PP (${activation.ppPerLevel}/level)`
      : `${activation.ppPerLevel} PP/level`);
  } else if (Number.isFinite(Number(activation.pp)) && Number(activation.pp) > 0) {
    parts.push(`${Number(activation.pp)} PP`);
  }
  if (activation.frequency) parts.push(activation.frequency);
  return parts.join(", ");
}

/**
 * Everything the card should say, as plain lines.
 *
 * Order matters and is the page's own: what it costs, what has to be
 * true before it can be used, what it does, then how it can go.
 */
export function activationLines(item, level = null) {
  const activation = activationOf(item);
  if (!activation) return [];
  const lines = [];

  const cost = activationCostLine(activation, level);
  if (cost) lines.push({ label: "Cost", text: cost });
  if (activation.trigger) lines.push({ label: "Trigger", text: activation.trigger });
  if (activation.requirement) lines.push({ label: "Requirement", text: activation.requirement });
  if (activation.area) lines.push({ label: "Area", text: activation.area });

  const outcomes = activation.outcomes ?? {};
  for (const degree of DEGREE_ORDER) {
    if (outcomes[degree]) {
      lines.push({ label: degree[0].toUpperCase() + degree.slice(1), text: outcomes[degree], degree: true });
    }
  }
  if (activation.save) {
    lines.unshift({ label: "Save", text: `${activation.save[0].toUpperCase()}${activation.save.slice(1)}` });
  }
  return lines;
}

/**
 * True when this item is a Codex ability the Use button can speak for.
 *
 * Recognised by what the item DECLARES, not by its name: the sheet's
 * automation tables are name-keyed and cannot know about the Codex, so
 * gating the button on them left every parsed cost and ladder
 * unreachable from the sheet. Found in live testing at 3.265.0.
 */
export function hasCreatureActivation(item) {
  return isUsable(item);
}

/** The tooltip on that button — the cost, so it reads before it is pressed. */
export function creatureActionHint(item, level = null) {
  const cost = activationCostLine(activationOf(item), level);
  return cost ? `Use — ${cost}` : "Use";
}

/**
 * Whether this ability's Use button can say anything useful at all.
 *
 * An ability with an activation block but nothing in it would post an
 * empty card, which is worse than the "no automated action" notice it
 * would otherwise get.
 */
export function isUsable(item) {
  const own = item?.flags?.[SYSTEM_ID]?.creatureAbility;
  // A declared action, area or compound action has a Use even when the entry
  // printed no Action line to parse (3.631.0).
  // An aura switched on by its Use (3.658.0; block 25 R6 — Soul Eclipse) too.
  if (own && (own.action || own.area || own.compound || own.auraSwitch)) return true;
  // A module's breath weapon read as a declared breath (3.632.0, ruling 16).
  if (moduleBreathArea(item) || moduleSwarmArea(item)) return true;
  return activationLines(item).length > 0;
}
