/**
 * Chapter 5, Archetype Progression Requirements — a SEPARATE gate from
 * ordinary feat prerequisites (module/prerequisites.mjs). Confirmed via
 * the three "prerequisites waived" archetype choosers already shipped
 * (Martial Training 3.216.0, Archetypal Path 3.217.0, Priestly Path
 * 3.230.0 — module/feats-workflow.mjs) and their own printed ruling text:
 * normally you may only progress ONE archetype at a time — picking a
 * SECOND, different archetype feat through the ordinary picker requires
 * first satisfying your CURRENT archetype's own printed Progression
 * Requirements. An archetype feat granted through one of the three
 * waiver choosers is explicitly exempt from this — "does not require you
 * to complete its progression requirements before selecting another
 * archetype" (Martial Training's own printed text) — those choosers
 * already stamp `flags["trg-prime"].grantedBy.sourceName` with their own
 * ability name, which is exactly how withArchetypeProgressionGate
 * (picker-filters.mjs) tells a waived pick apart from an ordinary one.
 *
 * The requirement text itself lives in `system.progressionRequirements`
 * on the 28 Archetype-category feats (added 3.230.8, extracted verbatim
 * from each feat's own printed "Progression Requirements ..." sentence at
 * the end of its description — not new content, just promoted into a
 * structured field the same way system.prerequisites already is).
 *
 * ───────────────────────────────────────────────────────────────────
 * THIS PARAGRAPH USED TO SAY SOMETHING FALSE, and the block-11 audit of
 * 18 September 2026 caught it. It read:
 *
 *   "Four archetypes (Assassin, Enigma, Gymnast, Mastermind) print no
 *    Progression Requirements sentence at all"
 *
 * Three quarters of that is wrong against 3.8.1. Assassin prints
 * "Perception and Stealth both +10 ranks", Gymnast prints "Acrobatics
 * +10 ranks", Mastermind prints "Arcana, Crafting, Culture, Nature,
 * Occultism, Planes or Religion +10 ranks". Only ENIGMA genuinely prints
 * none. Their fields were empty, the empty field never blocks, and so
 * three archetypes had no progression gate at all.
 *
 * IT IS RECORDED RATHER THAN QUIETLY CORRECTED because of HOW it
 * survived. Anyone checking those four would read this comment, find the
 * empty fields agreeing with it, and stop — the comment was not merely
 * wrong, it was load-bearing for the wrong answer. That is the recurring
 * lesson on this project (a comment describing something that is not so)
 * wearing its least obvious face: a claim about the BOOK rather than
 * about the code, in a file nobody would think to re-read the book for.
 *
 * `verify-chapter5-archetype-111-120` now reads the three requirements
 * out of the pack and runs them, so the claim cannot rot again.
 * ───────────────────────────────────────────────────────────────────
 *
 * Enigma's empty string is always treated as "nothing to check" (never
 * blocks) rather than "impossible to satisfy", per this module's own
 * fail-open philosophy below. That specific choice — no printed
 * requirement meaning "unblocked" rather than "permanently stuck" — is a
 * judgment call, not a printed rule.
 *
 * Parses only the same safely-structured shapes module/prerequisites.mjs
 * already parses (ability/BAB/BSB/Level, reused directly rather than
 * re-implemented — lesson 13) plus ONE new shape this field's own text
 * actually uses: a skill-rank minimum written "+N ranks" (progression
 * text puts the + before the number; ordinary prerequisites text never
 * does) with either one skill or an OR-list of several ("Arcana, Culture,
 * Linguistics, Nature, Occultism, Planes or Religion +10 ranks" —
 * Loremaster; satisfied by ANY ONE of the seven). Archer's own text
 * ("Any 3 feats which effect missile weapons or attacks, +8 levels")
 * matches neither shape and is left entirely unparsed — there's no
 * structured link from a feat to "affects missile weapons" to count the
 * first clause against, and "+8 levels" reads as levels gained SINCE
 * taking the archetype, a delta this system has nowhere to store,
 * so guessing it means "character Level 8" would just as often be wrong
 * as right. Same "false exclusion is worse" reasoning as
 * module/prerequisites.mjs: an unparseable requirement never blocks.
 *
 * Pure functions only — module/picker-filters.mjs supplies the actor and
 * item data this needs; nothing here touches Foundry.
 */
import { SKILL_LABEL_TO_KEY, parsePrerequisiteClause } from "./prerequisites.mjs";

/**
 * Parses a Progression Requirements string into a structured check, or
 * null if it isn't one of the safely-parseable shapes. Unlike
 * parsePrerequisiteClause, this is NOT comma-split first — the Loremaster
 * skill-OR-list uses commas WITHIN one clause ("Arcana, Culture, ... or
 * Religion +10 ranks"), so splitting on comma at the top level would
 * wrongly chop that single clause into unrelated fragments. Every real
 * printed Progression Requirements line is either one clause on its own
 * (BAB/skill) or, for Archer alone, two clauses neither of which is
 * parseable anyway — so evaluating the whole string as one unit is both
 * simpler and correct for every case this data actually contains.
 *
 * TWO SKILL SHAPES SINCE 3.568.0, and the difference is the whole gate.
 * Loremaster's and Mastermind's lists are an OR ("Arcana, Culture, ... or
 * Religion +10 ranks" — any one of the seven); Assassin's is an AND
 * ("Perception and Stealth both +10 ranks" — both, and the book says so
 * twice, with "and" and with "both"). Reading the second as the first
 * would halve the requirement and nobody would ever notice, because a
 * gate that opens too early looks exactly like a gate that is satisfied.
 *
 * A STRING CONTAINING BOTH JOINERS IS REFUSED rather than guessed. There
 * is no such line in the book today; if one is ever written, an unparsed
 * clause never blocks, which is this module's standing fail-open choice
 * and far better than picking a reading at random.
 *
 * @param {string} text
 * @returns {{type: "ability"|"bab"|"bsb"|"level"|"grantedClassSkill", key?: string, min: number}
 *   | {type: "skillAny"|"skillAll", keys: string[], min: number} | null}
 */
export function parseProgressionClause(text) {
  // THE BOOKS' OWN PUNCTUATION (3.671.0, Inner Tempest Block 7). Thirteen
  // of Inner Tempest's twenty-one lines failed open on it: "BAB +12." ends
  // in a full stop, four lines join two or three skills with "&"
  // ("Deception & Diplomacy skills +10 ranks"), and those lines say
  // "skills". "&" is "and" (both skills, as Assassin's "and"); the full
  // stop and the plural carry no meaning of their own.
  const trimmed = String(text ?? "").trim().replace(/\.$/, "").replace(/\s*&\s*/g, " and ").trim();
  if (!trimmed) return null;

  // "LEVEL +N" (3.671.0; Inner Tempest's Brawler, "Level +10"). Graham's
  // ruling B7-2: character level N, a total, as every other "+N" line is
  // read ("BAB +10" is BAB 10, "+10 ranks" is 10 ranks). Archer's "+8
  // levels" (gained SINCE taking the archetype) is a different sentence
  // and stays unparsed: "levels" after the number, not "Level" before it.
  const levelPlus = trimmed.match(/^Level\s*\+(\d+)$/i);
  if (levelPlus) return { type: "level", min: Number(levelPlus[1]) };

  // "GAINED CLASS SKILL +N RANKS" (3.671.0; Inner Tempest's Inner Adept:
  // "you may select either Meditation or Mental Focus as a Class skill …
  // Progression Requirements: Gained class skill +10 ranks"). The skill is
  // whichever the archetype's own class-skill grant chose, which the
  // caller supplies (meetsProgressionRequirement's `context.grantedSkill`).
  const gained = trimmed.match(/^Gained class skill\s*\+(\d+)\s*ranks?$/i);
  if (gained) return { type: "grantedClassSkill", min: Number(gained[1]) };

  // BAB/BSB/ability/Level all use the identical text shape prerequisites
  // already parses ("BAB +10", "Str +2", "Level 5") — reused directly.
  // ("skill" clauses are NOT reused from there: prerequisites' own skill
  // regexes require the count to come before "ranks" with no "+" in
  // front, so they never accidentally match this field's "+N ranks"
  // shape — see the module docstring.)
  const reused = parsePrerequisiteClause(trimmed);
  if (reused && reused.type !== "skill") return reused;

  const m = trimmed.match(/^(.+?)\s*\+(\d+)\s*ranks?$/i);
  if (!m) return null;

  // "both" is Assassin's second way of saying AND and carries no names of
  // its own, so it comes off before the list is split. Stripped rather
  // than required: a list of three ending in "both" would be a typo in
  // the book, and refusing it would silently remove the gate — the AND
  // reading is right either way, and "and" already established it.
  const namesPart = m[1].trim()
    .replace(/\s+both$/i, "")
    .replace(/\s+skills?$/i, "");

  const hasOr = /\s+or\s+/i.test(namesPart);
  const hasAnd = /\s+and\s+/i.test(namesPart);
  // Both joiners in one line is a sentence nobody has written and nobody
  // could read confidently. See the docstring.
  if (hasOr && hasAnd) return null;

  const rawNames = namesPart
    .split(/\s*,\s*|\s+or\s+|\s+and\s+/i)
    .map((name) => name.trim())
    .filter(Boolean);
  if (!rawNames.length) return null;

  const keys = rawNames.map((name) => SKILL_LABEL_TO_KEY[name.toLowerCase()]).filter(Boolean);
  // Every extracted name must resolve to a real skill — a partial match
  // (e.g. "Gained class skill +10 ranks", where "Gained class" isn't a
  // skill at all — it means whatever skill THIS archetype granted, an
  // actor-specific value this data doesn't capture) means the whole
  // clause is left unparsed rather than guessed at.
  if (keys.length !== rawNames.length) return null;

  // A SINGLE SKILL IS "ANY" AND IT DOES NOT MATTER — one key satisfies
  // `some` and `every` identically. Named as skillAny so that the one
  // shape the book had before 3.568.0 keeps the type it always had.
  return { type: hasAnd ? "skillAll" : "skillAny", keys, min: Number(m[2]) };
}

/**
 * Whether an actor's stats satisfy a Progression Requirements string.
 * Unparseable text (including empty/no text) always passes — see the
 * module docstring for why "nothing printed" isn't treated as "can never
 * be satisfied."
 *
 * @param {string} progressionRequirements
 * @param {object} [actorStats] Same shape as
 *   module/prerequisites.mjs's meetsParseablePrerequisites expects
 *   (level, bab, bsb, abilities, skillRanks).
 * @param {object} [context] For "Gained class skill" (3.671.0):
 *   `hasGrant` (the archetype has a class-skill grant) and `grantedSkill`
 *   (the skill key it chose, or empty).
 * @returns {boolean}
 */
export function meetsProgressionRequirement(progressionRequirements, actorStats = {}, context = {}) {
  const parsed = parseProgressionClause(progressionRequirements);
  if (!parsed) return true;

  switch (parsed.type) {
    // The skill the archetype's class-skill grant chose (3.671.0). A grant
    // not yet answered is unmet: the choice is the player's own, and the
    // gate opening because it was skipped would let one archetype be
    // traded for the next with nothing chosen. An archetype with no grant
    // at all (`context.hasGrant` false) has nothing to read, so it passes
    // as any unparsed line does.
    case "grantedClassSkill":
      if (!context.hasGrant) return true;
      if (!context.grantedSkill) return false;
      return Number(actorStats.skillRanks?.[context.grantedSkill] ?? 0) >= parsed.min;
    case "level":
      return Number(actorStats.level ?? 0) >= parsed.min;
    case "bab":
      return Number(actorStats.bab ?? 0) >= parsed.min;
    case "bsb":
      return Number(actorStats.bsb ?? 0) >= parsed.min;
    case "ability":
      return Number(actorStats.abilities?.[parsed.key] ?? 0) >= parsed.min;
    case "skillAny":
      return parsed.keys.some((key) => Number(actorStats.skillRanks?.[key] ?? 0) >= parsed.min);
    // AND: every named skill, not the best of them. Assassin's "Perception
    // and Stealth both +10 ranks" is two separate investments, and `some`
    // here would let one of them pay for the other.
    case "skillAll":
      return parsed.keys.every((key) => Number(actorStats.skillRanks?.[key] ?? 0) >= parsed.min);
    default:
      return true;
  }
}
