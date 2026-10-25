/**
 * Create (Core, Chapter 4 — General Skill Actions, Trained; Manipulate).
 * Pure logic; the Foundry workflow (the multi-day project on the actor, the
 * setup and manager) lives in create-crafting-workflow.mjs.
 *
 * You make an item from a formula and raw materials over one or more days.
 * A single check at the start sets your rate of progress; you accumulate gold
 * value per day until it meets the item's Price.
 */

/**
 * Item types and what it takes to Create them (Core Table). Each carries the
 * skills that can craft it and the feat required (null = none). Item level
 * and Price are entered per project — this system has no item Prices yet.
 */
export const ITEM_TYPES = Object.freeze({
  mundane: { label: "Mundane Item", skills: ["crafting"], feat: null },
  elixirs: { label: "Elixirs", skills: ["crafting", "nature"], feat: "Alchemical Crafting" },
  oils: { label: "Oils", skills: ["crafting"], feat: "Alchemical Crafting" },
  poisons: { label: "Poisons", skills: ["crafting", "nature"], feat: "Alchemical Crafting" },
  // VIALS ARE CRAFTING OR NATURE (3.578.0, Graham's R11 of the block-18
  // audit). Chapter 4's table says Crafting; page 185 says "Each of these
  // substances can be made with Alchemy (Crafting or Nature) checks", and
  // the page that describes the vials wins, as page 180 did for herbs.
  // Alchemical Crafting is still required through either skill.
  vials: { label: "Vials", skills: ["crafting", "nature"], feat: "Alchemical Crafting" },
  // HERBS ARE CRAFTING OR NATURE, AND THE FEAT IS A DC, NOT A DOOR
  // (3.577.1, Graham's R5 of the block-17 audit): "If you have the
  // Alchemical Crafting feat you may use either the Crafting or Nature
  // skills to make Herbs. If you do not have this feat, you may still
  // create Herbs as a Very Hard (DC +5) check." `featLabel` is what the
  // setup dialog prints, because "needs Alchemical Crafting" would be
  // untrue of a Nature herbalist. See `craftingFeatGate`.
  herbs: {
    label: "Herbs",
    skills: ["crafting", "nature"],
    feat: "Alchemical Crafting",
    featLabel: "Alchemical Crafting, or Nature at DC +5 without it"
  },
  magical: {
    label: "Magical Item",
    skills: ["arcana", "nature", "occultism", "religion"],
    feat: "Brew Potion or Magical Crafting"
  },
  // SCROLLS ARE THEIR OWN TYPE (3.361.0), because Scribe Scroll grants
  // exactly one thing: "you may use the Create (Arcana, Nature, Occultism
  // or Religion) action to scribe magical SCROLLS." Folded into `magical`
  // — where it sat until now, as one of three feats that unlocked every
  // magical item — the feat let a scroll-scriber brew potions and forge
  // rings, which is three times what it says. Split out, it is also the
  // one crafting requirement this system can check outright rather than
  // ask about, because it names a single feat.
  scrolls: {
    label: "Magical Scroll",
    skills: ["arcana", "nature", "occultism", "religion"],
    feat: "Scribe Scroll"
  }
});

/** Whether an item type carries the consumable batch rules (consumables + ammunition). */
export const CONSUMABLE_ITEM_TYPES = Object.freeze(["elixirs", "oils", "poisons", "vials", "herbs"]);

/**
 * THE TYPES A FUMBLE RUINS AT ONCE (3.577.1, Graham's R5): "failing by 10
 * or more should ruin the herb." Chapter 4's Fumble dooms a project on a
 * hidden 1d6-day clock — shoddy work nobody notices yet. A herb is one
 * dose prepared in one sitting, and page 180 says the failed one is
 * ruined, so there is no clock: the project fails on the day, with its
 * materials. A smaller failure is already a wasted day.
 */
const RUINED_ON_FUMBLE = Object.freeze(["herbs"]);

/**
 * Does a Fumble ruin this item type on the spot, rather than doom it?
 *
 * @param {string} itemTypeKey
 * @returns {boolean}
 */
export function fumbleRuinsAtOnce(itemTypeKey) {
  return RUINED_ON_FUMBLE.includes(String(itemTypeKey ?? "").trim().toLowerCase());
}

/**
 * Is this Create check's result a herb ruined on the day?
 *
 * ASKED BY THE CARD AS WELL AS THE PROJECT (3.577.2; F4 of the 3.577.1
 * live test). The project was ruined correctly, but the card still
 * printed the Create action's own Fumble row — "After 1d6 days you
 * realise the project has failed" — directly above "Failed by 10 or more
 * — the herb is ruined". Two sentences disagreeing about the same roll.
 * The card now prints the herb's line in place of the table's, and both
 * ask this, so they cannot disagree again. A Blunder is a Fumble here,
 * as it is in `createPerDay`.
 *
 * @param {string} itemTypeKey
 * @param {string} degreeKey
 * @returns {boolean}
 */
export function ruinedOnTheDay(itemTypeKey, degreeKey) {
  return fumbleRuinsAtOnce(itemTypeKey) && ["fumble", "blunder"].includes(String(degreeKey ?? ""));
}

/**
 * The Success work multiplier, by how far the check *exceeded* its DC (Core
 * Table): 0–4→2, 5–6→3, 7–8→4 … 19–20→10, 21+→11.
 *
 * @param {number} margin Check total minus DC (>= 0 on a success).
 * @returns {number} 2–11.
 */
export function createSuccessModifier(margin) {
  const m = Math.max(0, Math.trunc(Number(margin) || 0));
  if (m <= 4) return 2;
  return Math.min(11, 3 + Math.floor((m - 5) / 2));
}

/**
 * The DC modifier for crafting a batch of consumables, by count (Core Table):
 * 1–3→−2, 4→0, 5–6→+2, 7–8→+5, 9–10→+10. Beyond 10 holds at +10 (the table
 * stops there); reported so it isn't a silent cap.
 *
 * @param {number} count
 * @returns {number}
 */
export function consumableDCModifier(count) {
  const n = Math.max(1, Math.trunc(Number(count) || 1));
  if (n <= 3) return -2;
  if (n === 4) return 0;
  if (n <= 6) return 2;
  if (n <= 8) return 5;
  return 10;
}

/** A level-0 item counts as level 1 for the work maths. */
export function effectiveItemLevel(level) {
  return Math.max(1, Math.trunc(Number(level) || 0));
}

/**
 * The gold value of work a single day produces, and the outcome kind.
 *
 * - Success: ranks × effective item level × success modifier (from margin).
 * - Partial: ranks × effective item level (flat).
 * - Failure: 0 — a wasted day.
 * - Fumble: 0 — the project is doomed (see the workflow's 1d6-day clock).
 *
 * Critical/Heroic read as Success (the book gives no separate row, and the
 * margin already rewards a big beat); Blunder reads as Fumble.
 *
 * @param {string} degreeKey
 * @param {number} ranks
 * @param {number} itemLevel
 * @param {number} margin Check total minus DC.
 * @returns {{perDay: number, outcome: "success"|"partial"|"failure"|"fumble"}}
 */
export function createPerDay(degreeKey, ranks, itemLevel, margin, { workMultiplier = 1 } = {}) {
  const rank = Math.max(0, Math.trunc(Number(ranks) || 0));
  const level = effectiveItemLevel(itemLevel);
  // MASTERFUL CRAFTER (Chapter 5): "the amount of work that you complete in
  // the given timescale is doubled." A multiplier on the day's work rather
  // than on the ranks, because doubling the ranks would also double the
  // Partial row — and the feat doubles what you COMPLETE, which is both
  // rows equally. Applied here so there is one place that says what a day
  // is worth. A failed or fumbled day is nothing doubled, which is nothing.
  const boost = Math.max(0, Number(workMultiplier) || 1);
  switch (degreeKey) {
    case "heroic":
    case "critical":
    case "success":
      return { perDay: rank * level * createSuccessModifier(margin) * boost, outcome: "success" };
    case "partial":
      return { perDay: rank * level * boost, outcome: "partial" };
    case "failure":
      return { perDay: 0, outcome: "failure" };
    case "fumble":
    case "blunder":
      return { perDay: 0, outcome: "fumble" };
    default:
      return { perDay: 0, outcome: "failure" };
  }
}

/** Whether the actor's ranks in the crafting skill meet the item's level requirement. */
export function meetsRankRequirement(ranks, itemLevel) {
  return Math.trunc(Number(ranks) || 0) >= effectiveItemLevel(itemLevel);
}

/**
 * The traits a Crafting check carries because of WHAT it is making.
 *
 * "CRAFTING (ALCHEMY)" IS CRAFTING AN ALCHEMICAL ITEM (3.577.0). Pages 172
 * and 180 name a Crafting (alchemy) check, and Chapter 4's specialty list
 * has no Alchemy. Graham's R6 of the block-17 audit: alchemy is governed
 * by its feat, Alchemical Crafting — so the check is Crafting used on one
 * of the five alchemical item types, or on Identify Alchemy. The trait is
 * what lets the Alchemy Lab's "+4 circumstance bonus on Crafting (alchemy)
 * checks" be offered on exactly those rolls and no others.
 *
 * @param {string} actionKey
 * @param {string} [itemTypeKey] the Create project's type, if any
 * @returns {string} "alchemical" or ""
 */
export function alchemicalCheckTraits(actionKey, itemTypeKey = "") {
  if (actionKey === "identifyAlchemy") return "alchemical";
  if (actionKey === "create" && CONSUMABLE_ITEM_TYPES.includes(String(itemTypeKey ?? ""))) return "alchemical";
  return "";
}

/**
 * THE TRAITS AN ACTION'S CHECK CARRIES (3.666.0): the action's own, plus the
 * alchemical trait above where it applies. Until now only "alchemical" was
 * passed, so nothing could be scoped to "Concentrate and Mental actions"
 * (Inner Tempest's Maintain Clarity). Checked before shipping: no bonus in
 * any pack or in core's code that reaches a skill, attack or unarmed check
 * names a trait, and no core action is rolled as a save or spellcraft, so
 * nothing that applied before applies differently.
 *
 * @param {{key?: string, traits?: string}} action
 * @param {string} itemTypeKey
 * @returns {string} comma-separated, lower case
 */
export function actionCheckTraits(action, itemTypeKey = "") {
  const own = String(action?.traits ?? "").split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const alchemical = alchemicalCheckTraits(action?.key, itemTypeKey);
  return [...new Set([...own, ...(alchemical ? [alchemical] : [])])].join(", ");
}
