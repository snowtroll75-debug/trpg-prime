/**
 * The learned caster's daily memorisation cycle (Chapter 3 x Chapter 9),
 * the other half of spell distribution — the instinctive repertoire
 * (repertoire.mjs) is the half that shipped first, at 3.224.0.
 *
 * The Druid, Cleric and Wizard print the identical shape in the
 * identical words: "you may select an amount of spells for which you
 * meet the casting requirements ... to commit to memory for the day
 * equal to 2 + (level x 2)", plus "each day when you prepare your
 * spells you may also [learn/memorise] any four [tradition] cantrips
 * ... may change them each day during daily preparation." So — the
 * same reasoning `repertoire.mjs` gives for its own shared schedule —
 * this is ONE rule, not three.
 *
 * What varies is the POOL memorisation draws from, and it is data on
 * the class item (`memorisationStyle`): the Cleric and Druid have
 * blanket access to their whole tradition's spell list ("Divinity
 * casters have access to all divinity spells and may select any
 * available to them" — Chapter 9's Divinity/Verdant Learning
 * Requirements) — `memorisationStyle: "list"`. The Wizard alone has a
 * genuine restricted Spell Book that must be grown first
 * (spellbook.mjs) — `memorisationStyle: "book"`. Cantrips are the SAME
 * pack-wide pool for every learned caster regardless of style — the
 * Wizard's own text says so explicitly ("Cantrips do not need to be
 * written into a spell book, and you have access to all arcane
 * cantrips").
 *
 * Two mechanisms carry the daily cycle on the actor:
 *   - "book"-style leveled spells live in the permanent Spell Book
 *     (spellBookPick flag, spellbook.mjs) and are simply toggled
 *     `prepared` true/false each day — nothing is created or deleted.
 *   - Every cantrip, and every "list"-style leveled spell, is CREATED
 *     fresh each day (flag dailyMemorised) and swept — deleted — at
 *     the START of the next daily preparation, before the new day's
 *     picks are made. A Deific Aspect's bonus spells ("you do not need
 *     to memorise... always available") are untouched by any of this:
 *     they carry neither flag, so the sweep never reaches them and
 *     their permanent `prepared: true` (set when granted) already
 *     satisfies the cast gate below on its own.
 *
 * Ruling from Graham (3.225.0), confirmed and overturnable: the
 * `prepared` flag is now ENFORCED at cast time for a learned caster's
 * non-innate spells — memorising is what makes a spell castable, not
 * merely owning it. Instinctive casters and non-casters are untouched
 * (their spells were never memorised in the first place). Whether a
 * character skipped daily preparation entirely ("can only cast
 * cantrips that day") is NOT automated — this system tracks no
 * calendar, so that clause stays a GM judgement, printed as a reminder
 * on the Daily Preparation card, the same treatment Endeavour's "risk"
 * and Ethics' XP-reward guideline already get.
 *
 * Pure functions only — the Foundry side lives in
 * memorisation-workflow.mjs.
 */

import { maxPPPerCast } from "./casting.mjs";
import { spellShapeMatches } from "./repertoire.mjs";

const SYSTEM_ID = "trg-prime";

/** "any four [tradition] cantrips" — identical across all three learned
 * casters, but kept as a fallback rather than hardcoded at every call
 * site: a class item's own `cantripsPerDay` field wins when set. */
export const DEFAULT_CANTRIPS_PER_DAY = 4;

/** "2 + (level x 2)" — the daily leveled-spell memorisation budget. */
export function memorisedSpellCount(level) {
  return 2 + 2 * Math.max(0, Math.floor(Number(level) || 0));
}

/** The class's own cantrip allowance, or the printed default. */
export function cantripsPerDay(classCantripsPerDay) {
  const value = Math.floor(Number(classCantripsPerDay) || 0);
  return value > 0 ? value : DEFAULT_CANTRIPS_PER_DAY;
}

/**
 * Is this pack spell eligible for today's LEVELED memorisation pick?
 * Shape (tradition, no category restriction for a learned caster's
 * full list — Chapter 3 never restricts one the way the Ranger's
 * repertoire does), non-cantrip, and castable this level.
 *
 * @param {object} spell {tradition, ppCost, specialist} — index fields.
 * @param {object} rules
 * @param {string} rules.tradition The class's tradition.
 * @param {number} rules.casterLevel For the castable cap.
 */
export function memorisationPoolEligible(spell, { tradition = "", casterLevel = 0 } = {}) {
  if (!spellShapeMatches(spell, { tradition })) return false;
  const pp = Math.floor(Number(spell?.ppCost) || 0);
  if (pp <= 0) return false;
  return pp <= maxPPPerCast(casterLevel);
}

/**
 * Is this pack spell eligible for today's CANTRIP pick? Tradition-
 * matched, PP 0 exactly, specialist excluded (same shape rule as
 * everywhere else) — pack-wide regardless of the class's
 * memorisationStyle, per the Wizard's own explicit carve-out.
 */
export function cantripPoolEligible(spell, { tradition = "" } = {}) {
  if (!spellShapeMatches(spell, { tradition })) return false;
  return Math.floor(Number(spell?.ppCost) || 0) === 0;
}

/** Owned spell items created for today's cycle — cantrips and, for a
 * "list"-style caster, leveled picks too. Swept wholesale at the START
 * of the next daily preparation, before new picks are made. */
export function dailyMemorisedSpells(actor) {
  return Array.from(actor?.items ?? []).filter(
    (item) => item.type === "spell" && Boolean(item.flags?.[SYSTEM_ID]?.dailyMemorised)
  );
}

/** The subset of those that are leveled (non-cantrip) picks. */
export function dailyMemorisedLeveled(actor) {
  return dailyMemorisedSpells(actor).filter((item) => Number(item.system?.ppCost ?? 0) > 0);
}

/** The subset that are today's cantrip picks. */
export function dailyMemorisedCantrips(actor) {
  return dailyMemorisedSpells(actor).filter((item) => Number(item.system?.ppCost ?? 0) === 0);
}

/**
 * Everything the Memorisation card shows, resolved once.
 *
 * @param {object} state
 * @param {number} state.level Character level.
 * @param {number} state.leveledMemorised Count of today's leveled picks.
 * @param {number} state.cantripsMemorised Count of today's cantrip picks.
 * @param {number} [state.cantripAllowance] The class's own allowance, or
 *   the printed default when omitted.
 * @param {number} [state.bonusLeveled] Extra leveled slots from OUTSIDE
 *   the class schedule — Magical Discovery (magical-discovery.mjs), one
 *   per copy for a learned caster. Cantrips are never bonused — the feat
 *   only ever names a "spell memorised slot," which is the leveled half.
 * @returns {{leveledAllowed, leveledPicked, leveledRemaining,
 *   cantripsAllowed, cantripsPicked, cantripsRemaining}}
 */
export function memorisationState({
  level = 0,
  leveledMemorised = 0,
  cantripsMemorised = 0,
  cantripAllowance = null,
  bonusLeveled = 0
} = {}) {
  const leveledAllowed = memorisedSpellCount(level) + Math.max(0, Math.floor(Number(bonusLeveled) || 0));
  const leveledPicked = Math.max(0, Math.floor(Number(leveledMemorised) || 0));
  const cantripsAllowed = cantripAllowance === null
    ? DEFAULT_CANTRIPS_PER_DAY
    : cantripsPerDay(cantripAllowance);
  const cantripsPicked = Math.max(0, Math.floor(Number(cantripsMemorised) || 0));
  return {
    leveledAllowed,
    leveledPicked,
    leveledRemaining: Math.max(0, leveledAllowed - leveledPicked),
    cantripsAllowed,
    cantripsPicked,
    cantripsRemaining: Math.max(0, cantripsAllowed - cantripsPicked)
  };
}

/*
 * `canCastSpell` LIVED HERE UNTIL 3.348.0. It asked whether the class was
 * "learned" and refused anything unprepared if so — which refused a
 * Cleric's deific aspect spells, showed an instinctive caster an empty
 * circle on every row, and waved a Fighter/Arcanist through to cast all
 * four of their spellbook cantrips. Graham's ruling replaced it with a
 * rule about the SPELL rather than the character: see
 * magic/spell-availability.mjs.
 */
