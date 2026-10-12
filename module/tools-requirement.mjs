/**
 * Tools, at the moment a skill action is invoked.
 *
 * Chapter 4, Tools: "Sometimes tools are needed to carry out a certain
 * task as part of a skill check. If you do not have the required tools to
 * carry out a task, the GM may apply penalties of up to -10 to the check
 * or may not allow the check at all."
 *
 * That sentence hands the *size* of the consequence to the GM and keeps
 * only one fact for the system: whether the character has the thing. So
 * this module answers that question and nothing else, and the answer is
 * OFFERED rather than imposed — the same shape as the light penalty and
 * the pending-modifier rows, and for the same reason. Refusing the action
 * outright would contradict Pick Lock's own text, which explicitly allows
 * improvised picks at a penalty the GM judges.
 *
 * FORCE OPEN IS THE EXCEPTION, and it is an exception the book makes, not
 * one invented here. Athletics, Force Open: "If you do not have an
 * appropriate tool (such as a crowbar) to assist with the task, the
 * check's difficulty is increased by one step." That is a printed number
 * with no judgement left in it, so it is applied rather than offered.
 *
 * CREATE IS NOT IN TOOL_REQUIREMENTS, BUT IT IS HERE (3.577.0). Its setup
 * dialog carried an "I have the tools (and a workshop, if the item needs
 * one)" checkbox, and until the block-17 audit that tick was the whole of
 * it — so an elixir could be brewed without the tools page 172 says it is
 * "not possible" to brew one without. The kits the book names for an item
 * TYPE are now checked by `createKitShortfall` (Graham's R4), and the tick
 * remains only for mundane and magical items, whose tools the GM decides.
 *
 * Pure and Foundry-free: it takes a plain list of item-shaped objects.
 */

import { HEALERS_TOOLS, isTemporaryGear } from "./gear-uses.mjs";

const SYSTEM_ID = "trg-prime";

/** How a missing tool is handled. */
export const TOOL_MODES = Object.freeze({
  /** Offer a circumstance penalty the GM can adjust or drop. */
  PENALTY: "penalty",
  /** Step the difficulty one harder, per the action's own printed rule. */
  DIFFICULTY_STEP: "difficultyStep"
});

/**
 * The starting point for the penalty the dialog offers.
 *
 * The chapter gives a RANGE ("up to -10") and no default, so any single
 * number here is a convention rather than a rule. -5 is the midpoint, and
 * it matches the magnitude the difficulty ladder already calls Very Hard —
 * a working figure for the GM to raise towards -10 for a task the tools
 * really matter to, or lower for one they barely do. It is a starting
 * value in a box, never a silent application.
 */
export const DEFAULT_TOOL_PENALTY = -5;

/**
 * Every skill action whose Requirements or description names a tool, and
 * the gear that satisfies it.
 *
 * `tools` holds compendium item names. Matching is by normalised name
 * CONTAINMENT (see toolMatches), so "Healer's Tools", "Healers Tools" and
 * a masterwork or quality-prefixed copy all satisfy the same entry — the
 * packs spell these without apostrophes while the rulebook uses them, and
 * a match that broke on punctuation would be a trap for content authors.
 *
 * An item may also DECLARE that it serves as a tool, with
 * `flags["trg-prime"].toolFor` naming action keys. Homebrew gear, an
 * improvised kit or a magical item that stands in for thieves' tools then
 * works without being renamed to match — the same reasoning as the
 * `untrainedActions` flag on the trained-action gate.
 */
export const TOOL_REQUIREMENTS = Object.freeze({
  forceOpen: Object.freeze({
    tools: Object.freeze(["Crowbar"]),
    label: "an appropriate tool (such as a crowbar)",
    mode: TOOL_MODES.DIFFICULTY_STEP
  }),
  // "If you lack a compass, the check difficulty increases by one step"
  // (Chapter 4, page 95). The same printed shape as Force Open's crowbar
  // — a named object, and an exact consequence for not having it — so it
  // is the same mode rather than a bespoke branch beside it. The Compass
  // is a real item in the gear pack. Added 3.565.0.
  senseDirection: Object.freeze({
    tools: Object.freeze(["Compass"]),
    label: "a compass",
    mode: TOOL_MODES.DIFFICULTY_STEP
  }),
  identifyAlchemy: Object.freeze({
    tools: Object.freeze(["Alchemy Tools"]),
    label: "alchemist's tools",
    mode: TOOL_MODES.PENALTY
  }),
  repair: Object.freeze({
    tools: Object.freeze(["Repair Kit"]),
    label: "a repair kit",
    mode: TOOL_MODES.PENALTY
  }),
  disguise: Object.freeze({
    tools: Object.freeze(["Disguise Kit"]),
    label: "a disguise kit",
    mode: TOOL_MODES.PENALTY
  }),
  treatDisease: Object.freeze({
    tools: Object.freeze(["Healers Tools"]),
    trait: HEALERS_TOOLS,
    label: "healer's tools",
    mode: TOOL_MODES.PENALTY
  }),
  treatInjury: Object.freeze({
    tools: Object.freeze(["Healers Tools"]),
    trait: HEALERS_TOOLS,
    label: "healer's tools",
    mode: TOOL_MODES.PENALTY
  }),
  treatToxin: Object.freeze({
    tools: Object.freeze(["Healers Tools"]),
    trait: HEALERS_TOOLS,
    label: "healer's tools",
    mode: TOOL_MODES.PENALTY
  }),
  treatWounds: Object.freeze({
    tools: Object.freeze(["Healers Tools"]),
    trait: HEALERS_TOOLS,
    label: "healer's tools",
    mode: TOOL_MODES.PENALTY
  }),
  disableADevice: Object.freeze({
    tools: Object.freeze(["Thieves Tools"]),
    label: "thieves' tools",
    mode: TOOL_MODES.PENALTY
  }),
  pickLock: Object.freeze({
    tools: Object.freeze(["Thieves Tools"]),
    label: "thieves' tools",
    mode: TOOL_MODES.PENALTY
  })
});

/**
 * Names compared without punctuation, case or doubled spacing, so
 * "Healer's Tools" and "Healers Tools" are the same string.
 *
 * @param {string} name
 * @returns {string}
 */
export function normaliseToolName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Is this item usable right now?
 *
 * Graham's ruling (18 Aug 2026): CARRIED, NOT STOWED. A kit packed at the
 * bottom of a chest is not to hand, and requiring it be held would mean
 * drawing your thieves' tools before every Pick Lock. Quantity is checked
 * because an emptied stack is a row on the sheet, not a tool in a hand.
 *
 * @param {object} item
 * @returns {boolean}
 */
export function isToolAvailable(item) {
  if (!item) return false;
  if (item?.system?.stowed === true) return false;
  if (isToolExhausted(item)) return false;
  const quantity = item?.system?.quantity;
  return quantity === undefined || quantity === null || Number(quantity) > 0;
}

/**
 * Has a kit that counts its uses run out?
 *
 * EXHAUSTED IS NOT CARRIED (3.577.0). "A healer's kit is exhausted after
 * 10 uses"; a disguise kit "can create 10 disguises ... before it is
 * exhausted" (page 173). Until the block-17 audit (D4) a kit at 0 / 10
 * still passed the requirement, so the counter ran down to nothing and
 * changed nothing. A kit that tracks no uses (max 0) is never exhausted.
 *
 * @param {object} item
 * @returns {boolean}
 */
export function isToolExhausted(item) {
  const max = Number(item?.system?.uses?.max ?? 0);
  if (!(max > 0)) return false;
  return Number(item?.system?.uses?.value ?? 0) <= 0;
}

/**
 * Does this item satisfy this requirement?
 *
 * @param {object} item
 * @param {{tools: string[]}} requirement
 * @param {string} actionKey
 * @returns {boolean}
 */
export function toolMatches(item, requirement, actionKey) {
  const declared = item?.flags?.[SYSTEM_ID]?.toolFor;
  const declaredKeys = (Array.isArray(declared) ? declared : String(declared ?? "").split(/[,;]/))
    .map((k) => String(k ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (declaredKeys.includes(String(actionKey ?? "").trim().toLowerCase())) return true;

  // BY TRAIT AS WELL AS BY NAME (3.577.0). Healing Earth "can be used
  // instead of traditional healer's tools", and it carries the Healer's
  // Tools trait for exactly that reason — the spending side has always
  // found it by trait (gear-uses.mjs). This side matched names only, so a
  // character holding the earth was still offered the missing-tools
  // penalty on the Treat Wounds it was conjured for. Found in the block-17
  // audit, beside D4.
  if (requirement?.trait instanceof RegExp && requirement.trait.test(String(item?.system?.traits ?? ""))) {
    return true;
  }
  const name = normaliseToolName(item?.name);
  if (!name) return false;
  return (requirement?.tools ?? []).some((tool) => {
    const wanted = normaliseToolName(tool);
    return Boolean(wanted) && name.includes(wanted);
  });
}

/**
 * The requirement for an action, or null if it has none.
 *
 * @param {string} actionKey
 * @returns {object|null}
 */
export function toolRequirement(actionKey) {
  return TOOL_REQUIREMENTS[String(actionKey ?? "")] ?? null;
}

/**
 * The tool this character has for this action, or null.
 *
 * @param {object} args
 * @param {string} args.actionKey
 * @param {Array} [args.items]
 * @returns {object|null}
 */
export function heldToolFor({ actionKey, items = [] } = {}) {
  const requirement = toolRequirement(actionKey);
  if (!requirement) return null;
  for (const item of items ?? []) {
    if (!isToolAvailable(item)) continue;
    if (toolMatches(item, requirement, actionKey)) return item;
  }
  return null;
}

/**
 * What is missing, if anything.
 *
 * Returns null both when the action needs no tool AND when the tool is
 * present — the two cases the caller treats identically.
 *
 * @param {object} args
 * @param {string} args.actionKey
 * @param {Array} [args.items]
 * @returns {{actionKey, label, tools, mode}|null}
 */
export function toolShortfall({ actionKey, items = [] } = {}) {
  const requirement = toolRequirement(actionKey);
  if (!requirement) return null;
  if (heldToolFor({ actionKey, items })) return null;
  // SAID WHEN THE KIT IS THERE BUT SPENT, because "you are not carrying
  // healer's tools" to a player looking at them on the sheet reads as a bug.
  const spent = (items ?? []).find((item) => item?.system?.stowed !== true
    && isToolExhausted(item) && toolMatches(item, requirement, actionKey)) ?? null;
  return {
    actionKey,
    label: requirement.label,
    tools: [...requirement.tools],
    mode: requirement.mode,
    exhausted: spent ? String(spent.name ?? "") : ""
  };
}

/**
 * The words for a shortfall, where the player is told about it.
 *
 * @param {{label: string, exhausted?: string}} shortfall
 * @returns {string}
 */
export function toolShortfallText(shortfall) {
  if (!shortfall) return "";
  return shortfall.exhausted
    ? `your ${shortfall.exhausted} ${/s$/i.test(shortfall.exhausted) ? "are" : "is"} exhausted`
    : `you are not carrying ${shortfall.label}`;
}

/* ─────────────────────────── spending a use ─────────────────────────── */

/**
 * The actions that spend one use of the tool they were made with.
 *
 *   treat*    "A healer's kit is exhausted after 10 uses" (page 173) — per
 *             Graham, one use per Medicine check that requires the kit.
 *   disguise  "You can create 10 disguises with this kit before it is
 *             exhausted" (page 173). NEW at 3.577.0 (block 17, D5).
 */
export const TOOL_USE_ACTIONS = Object.freeze([
  "treatDisease", "treatInjury", "treatToxin", "treatWounds", "disguise"
]);

/**
 * The kit a use comes out of, or null.
 *
 * THE SAME KIT THE REQUIREMENT ACCEPTED (3.577.0). The requirement took a
 * kit that was CARRIED (Graham, 18 August), while the spending side took
 * only an EQUIPPED one — so a kit carried and never equipped passed every
 * check and never ran down (block 17, D4). Both now ask this module.
 *
 * TEMPORARY GEAR FIRST, as before (gear-uses.mjs): Healing Earth reverts
 * whether or not it is used, so a character holding both never burns a
 * use of the kit they paid for. Then a kit that counts its uses.
 *
 * @param {object} args
 * @param {string} args.actionKey
 * @param {Array} [args.items]
 * @returns {object|null}
 */
export function toolToSpend({ actionKey, items = [] } = {}) {
  if (!TOOL_USE_ACTIONS.includes(String(actionKey ?? ""))) return null;
  const requirement = toolRequirement(actionKey);
  if (!requirement) return null;
  const usable = (items ?? []).filter((item) => isToolAvailable(item) && toolMatches(item, requirement, actionKey));
  return usable.find(isTemporaryGear)
    ?? usable.find((item) => Number(item?.system?.uses?.max ?? 0) > 0)
    ?? null;
}

/* ───────────────────────── the kits Create needs ────────────────────── */

/**
 * The kit each Create item type needs, and what satisfies it.
 *
 * GRAHAM'S R4 OF THE BLOCK-17 AUDIT (20 September 2026), from page 172-173:
 *
 *   Alchemy Tools   "It is not possible to make alchemical items without
 *                    these tools." An Alchemy Lab serves as well.
 *   Herbalism Kit   "required to make herbal remedies and poisons"; the
 *                    table: "Required for crafting herbs".
 *   Scribes Kit     "Required for writing and scroll crafting".
 *
 * Poisons take any of the three, because they are both alchemical and
 * herbal. MUNDANE AND MAGICAL ITEMS ARE NOT HERE: which Artisan Tools a
 * piece of work needs is "determined by the GM", so those keep the Create
 * dialog's tick.
 */
export const CREATE_KITS = Object.freeze({
  elixirs: Object.freeze({ tools: Object.freeze(["Alchemy Tools", "Alchemy Lab"]), label: "alchemist's tools or an alchemy lab" }),
  oils: Object.freeze({ tools: Object.freeze(["Alchemy Tools", "Alchemy Lab"]), label: "alchemist's tools or an alchemy lab" }),
  vials: Object.freeze({ tools: Object.freeze(["Alchemy Tools", "Alchemy Lab"]), label: "alchemist's tools or an alchemy lab" }),
  poisons: Object.freeze({
    tools: Object.freeze(["Alchemy Tools", "Alchemy Lab", "Herbalism Kit"]),
    label: "alchemist's tools, an alchemy lab or a herbalism kit"
  }),
  herbs: Object.freeze({ tools: Object.freeze(["Herbalism Kit"]), label: "a herbalism kit" }),
  scrolls: Object.freeze({ tools: Object.freeze(["Scribes Kit"]), label: "a scribe's kit" })
});

/**
 * Why this character cannot start (or continue) this kind of project for
 * want of a kit — or null if they can, or if the type names no kit.
 *
 * CARRIED, NOT STOWED, as every other tool is (`isToolAvailable`).
 *
 * @param {object} args
 * @param {string} args.itemTypeKey
 * @param {Array} [args.items]
 * @returns {{label: string, tools: string[], reason: string}|null}
 */
export function createKitShortfall({ itemTypeKey, items = [] } = {}) {
  const kit = CREATE_KITS[String(itemTypeKey ?? "")];
  if (!kit) return null;
  const has = (items ?? []).some((item) => isToolAvailable(item)
    && toolMatches(item, { tools: kit.tools }, "create"));
  if (has) return null;
  return {
    label: kit.label,
    tools: [...kit.tools],
    reason: `This item type needs ${kit.label}, carried and not stowed.`
  };
}

/**
 * The row to offer on the check dialog, or null.
 *
 * Only for PENALTY-mode requirements: Force Open's step is applied by the
 * workflow before the dialog opens, so offering it here as well would
 * charge the same character twice for the same crowbar.
 *
 * @param {object} args
 * @param {string} args.actionKey
 * @param {Array} [args.items]
 * @param {number} [args.penalty]
 * @returns {{label, value, type, hint}|null}
 */
export function toolPenaltyRow({ actionKey, items = [], penalty = DEFAULT_TOOL_PENALTY } = {}) {
  const shortfall = toolShortfall({ actionKey, items });
  if (!shortfall || shortfall.mode !== TOOL_MODES.PENALTY) return null;
  return {
    label: "Improvised tools",
    value: penalty,
    type: "circumstance",
    hint: `${toolShortfallText(shortfall).replace(/^./, (c) => c.toUpperCase())} — the GM may apply up to -10, or disallow the check`
  };
}

/**
 * Should this action's difficulty step one harder for want of a tool?
 *
 * @param {object} args
 * @param {string} args.actionKey
 * @param {Array} [args.items]
 * @returns {boolean}
 */
export function toolDifficultyStep({ actionKey, items = [] } = {}) {
  const shortfall = toolShortfall({ actionKey, items });
  return Boolean(shortfall) && shortfall.mode === TOOL_MODES.DIFFICULTY_STEP;
}
