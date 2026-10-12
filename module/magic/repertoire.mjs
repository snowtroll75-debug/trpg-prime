/**
 * The instinctive caster's spell repertoire (Chapter 3 x Chapter 9).
 *
 * Three classes print the identical schedule in the identical words —
 * the Ranger (verdant, utility spells only), the Bard (ethereal) and
 * the Crusader (divinity): "At 1st level you may select any two PP 2
 * [...] spells and add them to your spell repertoire. At 3rd level and
 * then every two levels thereafter (5th, 7th etc) you may select a new
 * [...] spell and add it your repertoire. [...] At 5th level and then
 * every two levels thereafter, you may swap any one spell from your
 * repertoire for a new spell."
 *
 * So this is ONE rule owned by the magic module, not three copies owned
 * by three class modules — the same reasoning powerPointMax gives for
 * the shared "+ability to PP" clause. What varies per class is data on
 * the class item: the tradition (already there), casterStyle
 * ("instinctive"/"learned") and repertoireCategory (the Ranger's
 * "utility" restriction; blank for the other two).
 *
 * Two rulings from Graham (3.224.0), both overturnable:
 *   - Picks after 1st have no printed PP limit; capped here at what the
 *     character could actually cast (PP <= caster level + 1) so a
 *     3rd-level Ranger cannot bank a PP 15 spell.
 *   - Swaps BANK: one per milestone (5th, 7th...), unused ones carry
 *     forward, tracked as a spent count on the class item.
 *
 * Pure functions only — the Foundry side lives in
 * repertoire-workflow.mjs.
 */

import { sourceEntryId } from "../items.mjs";
import { maxPPPerCast } from "./casting.mjs";

const SYSTEM_ID = "trg-prime";

/** "any two PP 2 ... spells" — the 1st-level picks, and their fixed cost. */
export const REPERTOIRE_FIRST_PICKS = 2;
export const REPERTOIRE_FIRST_PICK_PP = 2;

/**
 * THE PRINTED SCHEDULE, AS DATA (3.563.0).
 *
 * The three core instinctive casters print one schedule — two PP 2 picks
 * at 1st, one more at 3rd and every two levels after, a swap at 5th and
 * every two levels after — and until now it was the only one this file
 * knew. Pillars of Faith's Grimward, Healer and Shaman each print "at
 * 2nd level and every level thereafter" for picks, and the Healer and
 * Shaman "whenever you gain a level" from 5th for swaps. A class item
 * declares its own in `flags.trg-prime.repertoire`:
 *
 *   { pickStep: 1|2, pickFrom: 3, swapStep: 1|2, swapFrom: 5 }
 *
 * Every field is optional and defaults to the core schedule, so the
 * Bard, Ranger and Crusader carry no flag and read exactly as before.
 * `firstPicks` is fixed at two — every instinctive class printed so far
 * opens the same way.
 */
const DEFAULT_REPERTOIRE_SCHEDULE = Object.freeze({
  pickStep: 2, pickFrom: 3, swapStep: 2, swapFrom: 5
});

/** The schedule a class item declares, or the default. Pure. */
export function repertoireSchedule(classItem) {
  const raw = classItem?.flags?.[SYSTEM_ID]?.repertoire;
  const pick = (key) => {
    const n = Math.floor(Number(raw?.[key]));
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_REPERTOIRE_SCHEDULE[key];
  };
  return { pickStep: pick("pickStep"), pickFrom: pick("pickFrom"), swapStep: pick("swapStep"), swapFrom: pick("swapFrom") };
}

/** How many grants a "from L, every N levels" clause has made by a level. */
function stepsGranted(level, from, step) {
  if (level < from) return 0;
  return 1 + Math.floor((level - from) / step);
}

/** The next level at or after `level + 1` on which the clause grants, or null past 20. */
function nextStep(level, from, step) {
  const next = level < from ? from : from + (Math.floor((level - from) / step) + 1) * step;
  return next > 20 ? null : next;
}

/**
 * Total picks the schedule has granted by a level: two at 1st, one more
 * at 3rd and every two levels thereafter. Eleven at 19th and 20th. A
 * class with its own schedule (see above) counts by that instead.
 */
export function repertoirePickCount(level, schedule = DEFAULT_REPERTOIRE_SCHEDULE) {
  const value = Math.floor(Number(level) || 0);
  if (value < 1) return 0;
  return REPERTOIRE_FIRST_PICKS + stepsGranted(value, schedule.pickFrom, schedule.pickStep);
}

/**
 * Total swaps the schedule has granted by a level: one at 5th and one
 * more every two levels thereafter. Banked — this is the allowance, and
 * the workflow counts spends against it.
 */
export function repertoireSwapCount(level, schedule = DEFAULT_REPERTOIRE_SCHEDULE) {
  const value = Math.floor(Number(level) || 0);
  return stepsGranted(value, schedule.swapFrom, schedule.swapStep);
}

/**
 * Everything about a pack spell's SHAPE that a pick schedule cares about,
 * independent of any PP budget: does its tradition match, does it match
 * a category restriction, is it a specialist spell (never pickable from
 * a list — Chapter 9: "You can learn specialist spells only through
 * special class features or feats"). Extracted at 3.225.0 so the
 * Wizard's Spell Book growth and the learned casters' daily
 * memorisation pool (memorisation.mjs) share this exact, already-
 * verified logic rather than a plausible-looking second copy (lesson
 * 13) — each of those has its OWN PP band (a cantrip's PP 0, a
 * memorised spell's castable cap, the spell book's PP 2 first picks),
 * which is why the PP check itself stays out of this function and in
 * each caller's own gate.
 *
 * Tradition matching reuses the comma-list intersection semantics the
 * generic spell picker already applies (picker-filters.mjs): a spell
 * tagged "arcane, verdant" is a verdant spell; a spell with no
 * tradition tag is universal and qualifies for any tradition.
 *
 * In the shipped pack, every untagged-tradition utility spell turns out
 * to be a specialist spell — the specialist exclusion is what keeps the
 * untagged-is-universal rule from quietly admitting all 82 of them.
 *
 * @param {object} spell {tradition, category, specialist} — index
 *   fields.
 * @param {object} rules
 * @param {string} rules.tradition The class's tradition ("verdant").
 * @param {string} rules.category A category restriction ("utility" for
 *   the Ranger's repertoire), or "" for none.
 */
export function spellShapeMatches(spell, { tradition = "", category = "" } = {}) {
  if (spell?.specialist) return false;
  const wanted = String(tradition ?? "").trim().toLowerCase();
  if (wanted) {
    const printed = String(spell?.tradition ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (printed.length && !printed.includes(wanted)) return false;
  }
  const restriction = String(category ?? "").trim().toLowerCase();
  if (restriction) {
    if (String(spell?.category ?? "").trim().toLowerCase() !== restriction) return false;
  }
  return true;
}

/**
 * Is this pack spell eligible for a repertoire pick right now? Shape,
 * plus the repertoire's own PP band: exactly 2 for the two 1st-level
 * picks, castable cap for every pick after.
 *
 * @param {object} spell {tradition, category, ppCost, specialist} —
 *   index fields.
 * @param {object} rules
 * @param {string} rules.tradition The class's tradition ("verdant").
 * @param {string} rules.category The class's repertoireCategory
 *   restriction ("utility" for the Ranger), or "" for none.
 * @param {boolean} rules.firstPick Still filling the two 1st-level
 *   slots — PP must be exactly 2.
 * @param {number} rules.casterLevel For the castable cap on later picks.
 */
export function repertoirePickEligible(spell, {
  tradition = "",
  category = "",
  firstPick = false,
  casterLevel = 0
} = {}) {
  if (!spellShapeMatches(spell, { tradition, category })) return false;
  const pp = Math.floor(Number(spell?.ppCost) || 0);
  if (firstPick) return pp === REPERTOIRE_FIRST_PICK_PP;
  return pp <= maxPPPerCast(casterLevel);
}

/* ------------------------------------------------------------------ */
/* ALREADY ON THE SHEET                                                 */
/* ------------------------------------------------------------------ */
/*
 * "Select any two PP 2 divinity spells and add them to your spell
 * repertoire" is a sentence about TWO spells. Until 3.328.0 every one
 * of the spell choosers except the Wizard's Spell Book would happily
 * offer a spell the character already held, and taking it created a
 * second identical item — a pick, a cantrip slot or a banked swap spent
 * on nothing, with a card that cheerfully announced "Bless swapped out
 * for Bless".
 *
 * Found live on 17 Aug 2026 while auditing the Crusader: both 1st-level
 * picks were spent on Bless, and the 5th-level swap then traded Bless
 * for Bless and reported "0 swaps remaining in the bank".
 *
 * TWO KEYS, NOT ONE. The Spell Book's existing exclusion matches on the
 * compendium entry id (`sourceEntryId`), and that is the exact key —
 * items.mjs explains why name alone will not do: the pack ships two
 * different spells called "Sleep" at different PP costs, and a
 * name-only match would hide the one you can't cast yet along with the
 * one you know. But an id-only match is not enough either, because
 * nothing that arrives through the GRANT path carries a
 * `compendiumSource` at all (a deific aspect's bonus spells, a wizard
 * school's specialist spells, a race or background's granted spells).
 * On a live Crusader, all four of War's granted spells read
 * `compendiumSource: null`. 3.328.0 stamps the source on granted items
 * too, but every sheet created before it still holds unstamped ones.
 *
 * So: the id when there is one, and `name|ppCost` when there isn't —
 * which disambiguates precisely the duplicate-name case the id exists
 * to handle, rather than falling back to the blunt name match.
 */

/** Keys for every spell already on a sheet. See the comment above. */
export function knownSpellKeys(items = []) {
  const keys = new Set();
  for (const item of Array.from(items ?? [])) {
    if (item?.type !== "spell") continue;
    const id = sourceEntryId(item?._stats?.compendiumSource);
    if (id) keys.add(id);
    const name = String(item?.name ?? "").trim().toLowerCase();
    if (name) keys.add(`${name}|${Math.floor(Number(item?.system?.ppCost) || 0)}`);
  }
  return keys;
}

/**
 * Does this pack index entry name a spell the sheet already holds?
 *
 * @param {Set<string>} keys From knownSpellKeys.
 * @param {object} entry A compendium index entry ({_id, name, system}).
 */
export function alreadyKnownSpell(keys, entry) {
  const set = keys instanceof Set ? keys : new Set(keys ?? []);
  if (entry?._id && set.has(String(entry._id))) return true;
  const name = String(entry?.name ?? "").trim().toLowerCase();
  if (!name) return false;
  return set.has(`${name}|${Math.floor(Number(entry?.system?.ppCost) || 0)}`);
}

/**
 * The spells this repertoire has picked: owned spell items carrying the
 * repertoirePick flag. Spells that arrived any other way — a deific
 * aspect's bonus spells, a background's choice, Magical Discovery, a
 * hand-dragged spell — deliberately do not count against the schedule.
 */
export function repertoireSpells(actor) {
  return Array.from(actor?.items ?? []).filter(
    (item) => item.type === "spell" && Boolean(item.flags?.[SYSTEM_ID]?.repertoirePick)
  );
}

/**
 * Everything the Repertoire card shows, resolved once.
 *
 * @param {object} state
 * @param {number} [state.bonus] Extra picks from OUTSIDE the class
 *   schedule — Magical Discovery (magical-discovery.mjs), one per copy
 *   for an instinctive caster. Added straight onto the schedule's own
 *   allowance so a bonus slot fills through the ordinary Pick button
 *   and counts as an ordinary `repertoirePick`, rather than living as a
 *   separate one-off grant outside the schedule entirely.
 * @returns {{allowed, picked, remaining, firstPicksOutstanding,
 *   swapsAllowed, swapsUsed, swapsLeft, nextPickLevel, nextSwapLevel}}
 */
export function repertoireState({ level = 0, picked = 0, swapsUsed = 0, bonus = 0, schedule = DEFAULT_REPERTOIRE_SCHEDULE } = {}) {
  const lvl = Math.floor(Number(level) || 0);
  const allowed = repertoirePickCount(lvl, schedule) + Math.max(0, Math.floor(Number(bonus) || 0));
  const made = Math.max(0, Math.floor(Number(picked) || 0));
  const swapsAllowed = repertoireSwapCount(lvl, schedule);
  const spent = Math.max(0, Math.floor(Number(swapsUsed) || 0));
  return {
    allowed,
    picked: made,
    remaining: Math.max(0, allowed - made),
    // The two PP 2 slots fill FIRST; every pick after them uses the
    // castable cap instead.
    firstPicksOutstanding: made < Math.min(REPERTOIRE_FIRST_PICKS, allowed),
    swapsAllowed,
    swapsUsed: spent,
    swapsLeft: Math.max(0, swapsAllowed - spent),
    // The next level at which the schedule grows: picks at 3, 5, 7...
    // swaps at 5, 7, 9... Null once level 19 has granted the last pick
    // (the schedule itself has no printed end, but the level cap does).
    // Read off the schedule (3.563.0) rather than the parity arithmetic
    // that assumed every-two-levels; the core schedule gives the same
    // answers it always did.
    nextPickLevel: lvl < 1 ? 1 : nextStep(lvl, schedule.pickFrom, schedule.pickStep),
    nextSwapLevel: nextStep(lvl, schedule.swapFrom, schedule.swapStep)
  };
}

/* ══════════════════════════════════════════════════════════════════════
 * SPELL AVAILABILITY (3.583.0; the pages 231-240 audit's D10, Graham's
 * R11 of 22 September 2026: "Warning").
 *
 * Page 235 divides spells into tiers and rules what a level-up pick may
 * take:
 *
 *   COMMON — "All spells listed in the Core Rulebook are considered
 *   Common. Casters may freely add these spells to the repertoire
 *   through level up picks."
 *
 *   UNCOMMON OR RARE — "Spells introduced in supplemental materials…
 *   are not assumed to be known by default… Casters cannot select these
 *   spells using automatic spell picks upon levelling unless the GM
 *   rules otherwise."
 *
 * THE SPELL ITEM HAD NO SUCH FIELD, and nothing filtered a pick. Every
 * supplement's spells — Pillars of Faith, Inner Mastery, Fury & Finesse,
 * Fiends & Fables — were takeable with a free pick.
 *
 * A WARNING, NOT A REFUSAL, on Graham's ruling. The page's own escape
 * clause is "unless the GM rules otherwise", and it ends by saying a GM
 * "may adjust availability as appropriate for their world". A hard
 * refusal would make the system the arbiter of a question the page hands
 * to the table twice in four sentences.
 *
 * COMMON IS THE DEFAULT, so the whole Core pack keeps working untouched
 * and only a supplement that marks its spells says anything.
 * ═══════════════════════════════════════════════════════════════════ */

/** The tiers page 235 names. */
export const AVAILABILITY_TIERS = Object.freeze(["common", "uncommon", "rare"]);

/** A spell's tier, defaulting to the Core Rulebook's own. */
export function spellAvailabilityTier(spell) {
  const raw = String(spell?.system?.availability ?? spell?.availability ?? "").trim().toLowerCase();
  return AVAILABILITY_TIERS.includes(raw) ? raw : "common";
}

/**
 * What a level-up pick should say about this spell.
 *
 * @param {object} spell
 * @returns {{tier: string, warn: boolean, said: string}}
 */
export function availabilityWarning(spell) {
  const tier = spellAvailabilityTier(spell);
  if (tier === "common") return { tier, warn: false, said: "" };
  const name = String(spell?.name ?? "This spell");
  return {
    tier,
    warn: true,
    said: `${name} is ${tier} — page 235: a spell from supplemental material is `
      + "not taken with an automatic level-up pick unless your GM rules otherwise. "
      + "Research it, find it, or be taught it."
  };
}
