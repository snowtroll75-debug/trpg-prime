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
import { TRADITIONS } from "./config.mjs";

/*
 * ───────────────────────────────────────────────────────────────────
 * THREE SHAPES ELDRITCH ARTS PRINTS (3.684.0; Block 6, G8). Graham's Q90 and
 * Q91 of 4 November 2026, as proposed.
 *
 * "+N LEVELS" — the shape the paragraph above leaves unparsed for Archer,
 * "levels gained SINCE taking the archetype, a delta this system has nowhere
 * to store". Q90: the seven Pacts, Hex Weaver, Bloodmage, Blood of the Wyrm,
 * Runeblade and Spell Duellist print "+10 levels", and it means exactly that:
 * ten levels gained since the archetype was taken. The store is now there,
 * but OPT-IN PER ARCHETYPE: an archetype feat declaring
 * `flags.trg-prime.progressionSinceTaken: true` has the character's level
 * stamped on it when it is added (`flags.trg-prime.archetypeTakenAt`,
 * TRGItem._preCreate; see `archetypeTakenAtStamp`), and its line is read
 * against that. The core's Archer declares nothing, so its line stays as the
 * paragraph above describes — unparsed, never blocking — as Q90 asked. A
 * feat that opts in but carries no stamp (taken before this release) passes
 * open, as it did.
 *
 * "CANNOT PROGRESS" — Eternal Vigil's own line (EA-M3), and by Q91 the
 * meaning of Runebreaker's, Shade Master's and Stormcaller's empty ones (the
 * module stores the words): no later archetype, ever. The one shape that
 * never passes; no core archetype prints it.
 *
 * "TRADITION SKILL +N RANKS" — Leyline Weaver. Q91: any one tradition skill
 * (config.mjs TRADITIONS: Arcana, Religion, Occultism, Nature) at N ranks,
 * as its prerequisite's "any one tradition skill". No core archetype prints it.
 * ───────────────────────────────────────────────────────────────────
 */

/** The four tradition skills' keys (config.mjs), for "Tradition skill +N ranks". */
const TRADITION_SKILL_KEYS = Object.freeze([...new Set(Object.values(TRADITIONS).map((t) => t.skill).filter(Boolean))]);

/** The archetype feat's opt-in flag and its stamp (3.684.0, G8). */
export const PROGRESSION_SINCE_TAKEN_FLAG = "progressionSinceTaken";
export const ARCHETYPE_TAKEN_AT_FLAG = "archetypeTakenAt";
/** WHOSE stamp it is (3.684.0, G8 — review): the owning actor's uuid. */
const ARCHETYPE_TAKEN_BY_FLAG = "archetypeTakenBy";

/**
 * The stamp an archetype feat arriving on an actor gets (3.684.0, G8), as an
 * update for `updateSource`, or null: only an Archetype-category feat that
 * opts in, and carries no stamp yet or another actor's.
 *
 * A COPY IS RE-STAMPED (3.684.0, G8 — review, Low). The first version kept
 * any stamp a feat arrived with, so a Pact dragged from a level-12 Warlock's
 * sheet onto a level-3 character's arrived "taken at 12" and its "+10 levels"
 * could not pass for nine levels — or, the other way, opened at once. The
 * owner's uuid is stamped beside the level, and a feat arriving on a
 * different actor than the one it names is stamped afresh. A feat arriving
 * on the actor its stamp names (a duplicate, an undo) keeps it; so does one
 * whose new owner is not yet known (`actorUuid` blank).
 *
 * @param {object} itemData the item's source (`type`, `system`, `flags`)
 * @param {number} level the owner's character level
 * @param {string} [actorUuid] the owner's uuid
 */
export function archetypeTakenAtStamp(itemData, level, actorUuid = "") {
  if (itemData?.type !== "feat" || itemData?.system?.category !== "Archetype") return null;
  const flags = itemData?.flags?.["trg-prime"] ?? {};
  if (flags[PROGRESSION_SINCE_TAKEN_FLAG] !== true) return null;
  const owner = String(actorUuid ?? "").trim();
  const stampedBy = String(flags[ARCHETYPE_TAKEN_BY_FLAG] ?? "").trim();
  const stamped = Number.isFinite(Number(flags[ARCHETYPE_TAKEN_AT_FLAG])) && flags[ARCHETYPE_TAKEN_AT_FLAG] !== null && flags[ARCHETYPE_TAKEN_AT_FLAG] !== "";
  if (stamped && (!owner || stampedBy === owner)) return null;
  const lv = Math.max(0, Math.trunc(Number(level) || 0));
  return {
    [`flags.trg-prime.${ARCHETYPE_TAKEN_AT_FLAG}`]: lv,
    ...(owner ? { [`flags.trg-prime.${ARCHETYPE_TAKEN_BY_FLAG}`]: owner } : {})
  };
}

/**
 * What an archetype feat tells its own progression line (3.684.0, G8): whether
 * it opts in to "+N levels", and the level it was taken at (null unstamped).
 */
export function archetypeProgressionContext(feat) {
  const flags = feat?.flags?.["trg-prime"] ?? {};
  const raw = flags[ARCHETYPE_TAKEN_AT_FLAG];
  const takenAt = raw === null || raw === undefined || raw === "" || !Number.isFinite(Number(raw)) ? null : Math.trunc(Number(raw));
  return { sinceTaken: flags[PROGRESSION_SINCE_TAKEN_FLAG] === true, takenAt };
}

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
 * @returns {{type: "ability"|"bab"|"bsb"|"level"|"grantedClassSkill"|"levelsSince", key?: string, min: number}
 *   | {type: "skillAny"|"skillAll", keys: string[], min: number} | {type: "never"} | null}
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

  // "+N LEVELS", "CANNOT PROGRESS", "TRADITION SKILL +N RANKS" (3.684.0;
  // Block 6, G8, Q90/Q91). See the note at the top of this file. Archer's
  // "Any 3 feats …, +8 levels" is two clauses and matches none of these.
  const since = trimmed.match(/^\+(\d+)\s+levels?$/i);
  if (since) return { type: "levelsSince", min: Number(since[1]) };
  if (/^cannot progress$/i.test(trimmed)) return { type: "never" };
  const tradition = trimmed.match(/^(?:any\s+(?:one\s+)?)?Tradition skills?\s*\+(\d+)\s*ranks?$/i);
  if (tradition) return { type: "skillAny", keys: [...TRADITION_SKILL_KEYS], min: Number(tradition[1]) };

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
 *   (the skill key it chose, or empty). For "+N levels" (3.684.0, G8):
 *   `sinceTaken` (the feat opts in) and `takenAt` (its stamp, or null) —
 *   `archetypeProgressionContext(feat)`.
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
    // "+N levels" (3.684.0, G8, Q90): levels gained since the archetype was
    // taken, for an archetype that opts in (`context.sinceTaken`) and was
    // stamped (`context.takenAt`). Otherwise unparsed, as Archer's always was.
    case "levelsSince":
      if (!context.sinceTaken) return true;
      if (context.takenAt === null || context.takenAt === undefined || !Number.isFinite(Number(context.takenAt))) return true;
      return Number(actorStats.level ?? 0) - Number(context.takenAt) >= parsed.min;
    // "cannot progress" (3.684.0, G8, Q91): no later archetype.
    case "never":
      return false;
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
