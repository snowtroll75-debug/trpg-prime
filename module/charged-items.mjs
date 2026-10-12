/**
 * Charged items (Chapter 11) — rods, staves, wands and their kin.
 *
 * "Charged items contain power points which may be used to release
 * spells or other effects." The item's OWN power points, which is what
 * Graham ruled before I had read this line and what the chapter says
 * independently — the wielder's pool is never mentioned.
 *
 * WHAT WAS ALREADY BUILT. The Item Depletion d100 table and the
 * invest/activate actions (magic-items.mjs, magic-items-workflow.mjs).
 * What is new here is the arithmetic around them: how a charged item's
 * level is worked out, how it recharges, and which check you roll to
 * cast from it.
 */

import { TRADITIONS } from "./config.mjs";
import { itemLevelForPrice, priceForLevel } from "./magic-item-tables.mjs";
import { maxPPPerCast } from "./magic/casting.mjs";

/**
 * How much an invested charged item recovers each day.
 *
 * "During daily preparation, an invested, charged item will regain 1 PP
 * for every 10 PP (or part thereof) it has at maximum charge each day."
 *
 * "OR PART THEREOF" ROUNDS UP, and it is the whole rule: a 1 PP item
 * recovers 1 PP a day, not none. Flooring would leave every item below
 * 10 PP permanently unable to recharge, which is plainly not what a
 * clause saying "or part thereof" is for.
 *
 * REQUIRES INVESTMENT. An uninvested item does not recover at all — the
 * caller passes that in rather than this function guessing, because
 * whether an item is invested is a fact about the actor.
 */
export function dailyRecharge(maximumPP, { invested = true } = {}) {
  if (!invested) return 0;
  const max = Math.max(0, Math.floor(Number(maximumPP) || 0));
  return Math.ceil(max / 10);
}

/**
 * What one charged item recovers each day: its PRINTED recharge where the
 * book prints one, and the formula otherwise (3.615.0, Graham's R18 of
 * block 36 — "keep the printed values throughout"). Versarians Sight
 * prints "Recharge 2" on a 28 PP pool the formula would give 3.
 * @param {object} flag the item's `chargedItem` flag
 * @param {{invested?: boolean}} [options]
 */
export function itemRecharge(flag, { invested = true } = {}) {
  if (!invested) return 0;
  const printed = Math.floor(Number(flag?.printedRecharge ?? flag?.recharge) || 0);
  return printed > 0 ? printed : dailyRecharge(flag?.maximumPP, { invested });
}

/**
 * A rod's level: "add up the total amount of PP required for its base
 * spells or abilities."
 *
 * The metamagic clause — "if the rod creates a Metamagic effect on an
 * existing spell, the rod's level must be at least the minimum level
 * required to cast that spell" — is a FLOOR, not an alternative, so it
 * is applied as one.
 */
export function rodLevel({ spellPPCosts = [], metamagicMinimumLevel = 0 } = {}) {
  const total = (spellPPCosts ?? []).reduce(
    (sum, pp) => sum + Math.max(0, Math.floor(Number(pp) || 0)), 0
  );
  return Math.max(total, Math.max(0, Math.floor(Number(metamagicMinimumLevel) || 0)));
}

/**
 * A staff's level: "always at least 2 levels higher than the highest PP
 * spell that it contains... if a staff contains spells from more than
 * one school its level is further increased by 1."
 *
 * The chapter's worked example is the check that matters. Aelar's staff
 * holds Burning Hands (2), Magic Missile (2), Fleeting Speed (4) and
 * Fireball (6), from two schools: highest 6, plus 2 is 8, plus 1 for the
 * second school is **9**.
 *
 * ONE school is no increase and THREE is still only +1 — the chapter
 * says "more than one", not "per school". Worth stating, because "+1 per
 * extra school" is the reading a hurried implementation reaches for.
 */
export function staffLevel({ spellPPCosts = [], schools = [] } = {}) {
  const costs = (spellPPCosts ?? []).map((pp) => Math.max(0, Math.floor(Number(pp) || 0)));
  const highest = costs.length ? Math.max(...costs) : 0;
  const distinct = new Set(
    (schools ?? []).map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean)
  );
  return highest + 2 + (distinct.size > 1 ? 1 : 0);
}

/**
 * A wand or other charged item: "the PP cost of the contained spell +1."
 *
 * FLEXIBLE WANDS. "A wand may be created to allow it to freely use its
 * warping options within the confines of its PP limits. Doing this
 * increases the level of the wand by 1." That is a printed rule, and it
 * is what the Wand of Darkvision – Flexible is — 3.235.4 shipped it as
 * an unexplained exception, one level above the formula, because I had
 * not read the WANDS preamble closely enough. It is not an exception at
 * all.
 */
export function wandLevel(spellPPCost, { flexible = false } = {}) {
  return Math.max(0, Math.floor(Number(spellPPCost) || 0)) + 1 + (flexible ? 1 : 0);
}

/**
 * How much power a wand holds: three castings of its spell.
 *
 * "When first created the spell in a wand must be warped to the amount
 * of PP that it will be cast with and this amount of PP can never
 * change. The wand will contain enough power points to cast the spell
 * contained within it three times."
 *
 * SO THE SPELL'S COST IS ITS WARPED COST, fixed at creation — a wand of
 * a 2 PP spell warped to 6 is a 6 PP wand holding 18, not a 2 PP wand.
 * 3.235.4 checked the ×3 across all seven shipped wands and recorded it
 * as "an exact regularity, not a printed rule". It is a printed rule; I
 * had not read this paragraph.
 */
export function wandPowerPoints(castPPCost) {
  return Math.max(0, Math.floor(Number(castPPCost) || 0)) * 3;
}

/**
 * A staff's pool: "when first created, a staff will contain an amount of
 * PP equal to its level x2."
 *
 * TWO OF THE CHAPTER'S OWN STAVES DISAGREE with this — Staff of Cure is
 * level 5 with 8 PP where the rule gives 10, and Versarian's Sight is
 * level 14 with 16 where the rule gives 28. Both are internally
 * consistent (each one's printed Recharge matches its printed PP), so
 * the disagreement is with the formula, not within the entry. The
 * shipped items keep their printed figures; this function is the rule,
 * and the harness records the two exceptions by name rather than
 * quietly widening the rule to fit them.
 */
export function staffPowerPoints(level) {
  return Math.max(0, Math.floor(Number(level) || 0)) * 2;
}

/**
 * The most PP a spell cast from a staff may be warped to.
 *
 * "Each spell that you can cast from a staff may be warped using its own
 * pool of power to a maximum PP of no more than the items level."
 *
 * A wand cannot be warped at the table at all — its cost was fixed when
 * it was made — unless it is a FLEXIBLE wand, which may "freely use its
 * warping options within the confines of its PP limits". And a scroll
 * never can: "you cannot warp a spell cast from a scroll".
 */
export function warpCeiling({ kind, level, maximumPP, flexible = false } = {}) {
  const key = String(kind ?? "").trim().toLowerCase();
  const itemLevel = Math.max(0, Math.floor(Number(level) || 0));
  const pool = Math.max(0, Math.floor(Number(maximumPP) || 0));
  if (key === "staff") return { allowed: true, ceiling: itemLevel, reason: "" };
  if (key === "wand") {
    // A FLEXIBLE WAND WARPS UP TO ITS OWN PRINTED PP, NOT ITS POOL (3.615.0,
    // A15 of block 36): "a Darkvision spell of up to PP 6" — and a wand's
    // pool is three castings at that PP, so the ceiling is a third of it.
    return flexible
      ? { allowed: true, ceiling: Math.floor(pool / 3), reason: "" }
      : {
        allowed: false,
        ceiling: 0,
        reason: "a wand's spell is warped when it is made and that cost can never change"
      };
  }
  if (key === "scroll") {
    return { allowed: false, ceiling: 0, reason: "a spell cast from a scroll cannot be warped" };
  }
  return { allowed: false, ceiling: 0, reason: `nothing lets a ${key || "charged item"} be warped` };
}

/** Which cost column a kind of charged item reads. */
export function chargedItemKind(kind) {
  const key = String(kind ?? "").trim().toLowerCase();
  if (key === "rod" || key === "wand") return "rod";
  return "staff";
}

/**
 * A charged item's own level, from the flag its builder wrote.
 *
 * NEW at 3.565.0, for Recharge Item — "a skill check with the DC based
 * upon the level and rarity of the item" (Chapter 4, page 91), where
 * Graham's ruling R4 of 17 September 2026 makes the DC the item's LEVEL
 * DC and drops the rarity term.
 *
 * THE THREE FORMULAS ALREADY EXISTED; nothing chose between them. Each
 * one is the rule for a different kind of item, and the kind is on the
 * flag, so this is the dispatch and not a fourth formula. A staff with
 * no schools recorded is a one-school staff by `staffLevel`'s own rule
 * ("more than one", not "per school"), which is the right default for a
 * pack entry that predates the field.
 *
 * A WAND'S SPELL COST IS ITS WARPED COST, fixed at creation, and the
 * flag records exactly one spell for a wand — so the first entry is the
 * spell, not an arbitrary pick from several.
 *
 * @param {object} flag the item's `flags["trg-prime"].chargedItem`
 * @returns {number} the level, or 0 when the flag cannot supply one
 */
export function chargedItemLevel(flag) {
  if (!flag || typeof flag !== "object") return 0;
  const costs = (Array.isArray(flag.spells) ? flag.spells : [])
    .map((s) => Math.max(0, Math.floor(Number(s?.pp) || 0)));
  const kind = String(flag.kind ?? "").trim().toLowerCase();
  if (kind === "wand") return wandLevel(costs[0] ?? 0, { flexible: Boolean(flag.flexible) });
  if (kind === "rod") return rodLevel({ spellPPCosts: costs });
  // OTHER CHARGED ITEMS (3.616.0, B13): the highest spell's PP + 1.
  if (kind === "other") return costs.length ? Math.max(...costs) + 1 : 0;
  return staffLevel({ spellPPCosts: costs, schools: flag.schools ?? [] });
}

/**
 * A charged item's level for a DC: the item's own printed level first
 * (3.615.0, A13 of block 36). Recomputing it read every rod as level 0 —
 * rods carry no spells — and two staves a level low.
 * @param {object} item
 */
export function chargedItemLevelOf(item) {
  const printed = Math.floor(Number(item?.system?.itemLevel) || 0);
  return printed > 0 ? printed : chargedItemLevel(item?.flags?.["trg-prime"]?.chargedItem);
}

/** A charged item's price, from its level. */
export function chargedItemPrice(kind, level) {
  return priceForLevel(chargedItemKind(kind) === "rod" ? "rod" : "staff", level);
}

/**
 * The two ways to cast a spell out of a charged item.
 *
 * Spellcraft, as an EASY check, if your caster level covers the spell's
 * PP and the spell is from your tradition — "although you do not need to
 * know it", which is the whole point of a wand.
 *
 * Otherwise the spell's own tradition skill as a HARD check, if your
 * rank in that skill is at least the spell's PP cost AND you have Use
 * Magic Device.
 *
 * Returns every option with whether it is available and, when it is not,
 * WHY. A dialog that simply omits the path you cannot use leaves a
 * player guessing which requirement they failed — and the two paths fail
 * for four different reasons between them.
 *
 * @returns {Array<{key: string, label: string, difficulty: string,
 *   dcAdjustment: number, available: boolean, reason: string}>}
 */
/**
 * Each tradition's own skill — DERIVED FROM THE SYSTEM'S OWN TABLE
 * rather than retyped from the chapter.
 *
 * The first version of this file hard-coded
 * `{arcane, occult, primal, divine}`, which are the words Chapter 11
 * uses in passing. This system's traditions are `arcane`, `divinity`,
 * `ethereal` and `verdant` (config.mjs, from Chapter 9), so the lookup
 * missed on every real spell and every charged item reported "the spell
 * has no tradition recorded". The skill names were right; the keys were
 * from a different book. Live testing found it — nothing in the harness
 * could, because the harness used the same invented keys (lesson 13:
 * reuse the real mechanism, do not restate it).
 */
export const TRADITION_SKILLS = Object.freeze(
  Object.fromEntries(Object.entries(TRADITIONS).map(([key, t]) => [key, t.skill]))
);

/** "arcane, verdant" -> ["arcane", "verdant"]. A spell may have several. */
export function traditionsOf(value) {
  return String(value ?? "")
    .split(/[,/]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function castFromItemOptions({
  spellPPCost = 0,
  spellTradition = "",
  casterLevel = 0,
  casterTradition = "",
  skillRanks = {},
  hasUseMagicDevice = false
} = {}) {
  const pp = Math.max(0, Math.floor(Number(spellPPCost) || 0));
  const level = Math.max(0, Math.floor(Number(casterLevel) || 0));
  const spellTraditions = traditionsOf(spellTradition);
  const casterKey = String(casterTradition ?? "").trim().toLowerCase();
  // A SPELL MAY BELONG TO SEVERAL TRADITIONS — most of this system's do
  // ("arcane, verdant"). Spellcraft is open if ANY of them is yours,
  // and the skill path is offered once per tradition the spell has,
  // because a Wizard casting from a verdant wand rolls Nature and it is
  // not obvious from the item which skill that will be.
  const sameTradition = spellTraditions.includes(casterKey) && Boolean(casterKey);
  const ranksIn = (skill) => Math.max(0, Math.floor(Number(skillRanks?.[skill]) || 0));

  // "YOUR CASTER LEVEL MUST MEET THE PP REQUIREMENTS (SEE CHAPTER 9)" —
  // and Chapter 9's requirement is PP up to caster level + 1 (3.615.0,
  // Graham's R20 of block 36). This read `level < pp`, one too strict: a
  // 1st-level caster could not use Spellcraft on a 2 PP wand.
  const spellcraftReasons = [];
  if (pp > maxPPPerCast(level)) spellcraftReasons.push(`your caster level (${level}) casts at most ${maxPPPerCast(level)} PP, below the spell's ${pp}`);
  if (!sameTradition) spellcraftReasons.push("the spell is not from your tradition");

  const options = [{
    key: "spellcraft",
    label: "Spellcraft",
    skill: "spellcraft",
    difficulty: "easy",
    dcAdjustment: -2,
    available: spellcraftReasons.length === 0,
    reason: spellcraftReasons.join("; ")
  }];

  if (!spellTraditions.length) {
    options.push({
      key: "tradition",
      label: "Tradition skill",
      skill: "",
      difficulty: "hard",
      dcAdjustment: 2,
      available: false,
      reason: "the spell has no tradition recorded"
    });
    return options;
  }

  for (const tradition of spellTraditions) {
    const skill = TRADITION_SKILLS[tradition] ?? "";
    const reasons = [];
    if (!skill) reasons.push(`"${tradition}" is not one of this world's traditions`);
    else if (ranksIn(skill) < pp) {
      reasons.push(`your ${skill} ranks (${ranksIn(skill)}) are below the spell's ${pp} PP`);
    }
    if (!hasUseMagicDevice) reasons.push("you do not have Use Magic Device");
    options.push({
      key: `tradition:${tradition}`,
      label: skill ? skill[0].toUpperCase() + skill.slice(1) : "Tradition skill",
      skill,
      difficulty: "hard",
      dcAdjustment: 2,
      available: skill !== "" && reasons.length === 0,
      reason: reasons.join("; ")
    });
  }
  return options;
}

/**
 * "Be aware that a character may only wield one charged item at any one
 * time."
 *
 * Reported rather than enforced, the same way duplicate worn items are
 * (magic-items.mjs) — a GM may be mid-shuffle, and refusing to let
 * someone hold a second wand would be the sheet arguing with the table.
 */
export function chargedItemWarnings(wieldedChargedItems = []) {
  const held = (wieldedChargedItems ?? []).filter(Boolean);
  if (held.length <= 1) return [];
  return [
    `${held.length} charged items wielded (${held.join(", ")}) — a character may only wield one at a time.`
  ];
}
