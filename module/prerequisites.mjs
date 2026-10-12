/**
 * Chapter 5 Feat Prerequisites — parses the handful of clause SHAPES in
 * `system.prerequisites` free text that are unambiguous enough to safely
 * gate a picker on: an ability score bonus minimum ("Con +2"), a BAB or
 * BSB threshold ("BAB +4", "BSB +2"), a single named skill's rank minimum
 * ("Diplomacy 5 ranks", "Athletics skill rank 2"), and a character Level
 * minimum ("Level 5").
 *
 * A clause naming a FEAT OR ABILITY that exists ("Weapon Focus", "Wild
 * Shape", "Armour Proficiency, Light") is gated too — but only when the
 * caller supplies the set of names that exist, so that a clause can be
 * told apart from prose. See meetsParseablePrerequisites.
 *
 * Everything else is intentionally left UNPARSED and always passes:
 * race/heritage names, caster-category names
 * ("Learned Caster"), multi-skill OR/AND clauses ("Occultism or Religion 1
 * rank", "Handle Animal & Nature 1 rank"), comparative clauses ("Dex at
 * least 1 higher than Str"), "Level N only", "Caster Level N", proficiency
 * clauses, and any other narrative/GM-adjudicated text. This is the exact
 * same "still on the player to check" boundary barredClasses/
 * meetsClassPrerequisite (picker-filters.mjs) already drew for the
 * Non-Class clause — extended here to the other structured shapes rather
 * than re-invented (lesson 13), not widened to cover everything a human
 * still has to read and judge for themselves.
 *
 * A false EXCLUSION (hiding a feat a player could rightfully take, because
 * a clause was misparsed) is a worse failure than the pre-existing gap
 * (showing one they can't actually take yet) — so every ambiguous or
 * unrecognised clause shape fails OPEN, never blocks.
 *
 * Pure functions only — module/picker-filters.mjs supplies the actor data
 * this needs; nothing here touches Foundry.
 */
import { SKILLS } from "./config.mjs";

const ABILITY_ABBREVIATIONS = Object.freeze({
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma"
});

// "diplomacy" -> "diplomacy", "handle animal" -> "handleAnimal" — built once
// from the system's own 26 master skills (config.mjs), never a second,
// hand-maintained name list. Exported so archetype-progression.mjs's own
// skill-name matching (Progression Requirements text uses the same skill
// labels, just a different "+N ranks" placement) reuses this table rather
// than rebuilding it a second time.
export const SKILL_LABEL_TO_KEY = Object.freeze(
  Object.fromEntries(Object.entries(SKILLS).map(([key, { label }]) => [label.toLowerCase(), key]))
);

/**
 * Parses ONE prerequisite clause (already split on comma and trimmed) into
 * a structured check, or null if it isn't one of the safely-parseable
 * shapes — see the module docstring for what's deliberately excluded.
 *
 * @param {string} clause
 * @returns {{type: "ability"|"bab"|"bsb"|"skill"|"level", key?: string, min: number}|null}
 */
export function parsePrerequisiteClause(clause) {
  const text = String(clause ?? "").trim();
  if (!text) return null;

  let m = text.match(/^(str|dex|con|int|wis|cha)\s*\+(\d+)$/i);
  if (m) return { type: "ability", key: ABILITY_ABBREVIATIONS[m[1].toLowerCase()], min: Number(m[2]) };

  m = text.match(/^BAB\s*\+(\d+)$/i);
  if (m) return { type: "bab", min: Number(m[1]) };

  m = text.match(/^BSB\s*\+(\d+)$/i);
  if (m) return { type: "bsb", min: Number(m[1]) };

  // Deliberately NOT "Level N only" (a maximum, not a minimum — a
  // different rule this doesn't model) and NOT "Caster Level N" (a
  // distinct, per-class-computed stat, not character Level) — both would
  // silently mismatch text->meaning if matched here, so both fall through
  // to the unparsed/pass-open case instead.
  m = text.match(/^Level\s+(\d+)$/i);
  if (m) return { type: "level", min: Number(m[1]) };

  // "Any special visual sense (Darkvision, Nightvision etc)" — the Enhanced
  // sense feats (Fiends & Fables 3.0 block 2, ruling 1). The comma inside
  // the parenthesis splits the clause; the head is what is read, and the
  // tail ("Nightvision etc)") parses as nothing and passes.
  m = text.match(/^Any\s+special\s+(visual|auditory|olfactory|tactile)\s+sense\b/i);
  if (m) return { type: "specialSense", key: m[1].toLowerCase(), min: 1 };

  // A single named skill's rank minimum. The printed text uses three
  // different orderings across the feat list — "Diplomacy 5 ranks",
  // "Athletics skill rank 2", "Religion skill 2 ranks" — all three tried
  // in turn, singular or plural "rank(s)". The name is matched against the
  // system's own skill list — a compound clause like "Occultism or
  // Religion 1 rank" or "Handle Animal & Nature 1 rank" never equals a
  // single skill's label, so it naturally falls through unparsed rather
  // than needing its own or/and/& exclusion check.
  m =
    text.match(/^([A-Za-z][A-Za-z ]*?)\s+(?:skill\s+)?ranks?\s+(\d+)$/i) ||
    text.match(/^([A-Za-z][A-Za-z ]*?)\s+skill\s+(\d+)\+?\s*ranks?$/i) ||
    text.match(/^([A-Za-z][A-Za-z ]*?)\s+(\d+)\+?\s*ranks?$/i);
  if (m) {
    const key = SKILL_LABEL_TO_KEY[m[1].trim().toLowerCase()];
    if (key) return { type: "skill", key, min: Number(m[2]) };
  }

  return null;
}

/**
 * Normalised comparison key for a feat or ability name.
 *
 * Case and surrounding space only. Deliberately NOT the aggressive
 * flattening `proficiency-rules.nameKey` uses — that strips punctuation,
 * which would make "Armour Proficiency, Light" and "Armour Proficiency
 * Light" the same string and, worse, could collapse two different feats
 * onto one key. Here a near-miss must stay a miss, because a wrong match
 * hides a feat a player is entitled to.
 */
export const prerequisiteNameKey = (value) =>
  String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Split a prerequisites string into clauses, rejoining the ones a comma
 * split broke apart.
 *
 * WHY THIS IS NOT JUST `.split(",")`. Feat names contain commas.
 * "Armour Proficiency, Light" is ONE feat; splitting on the comma gives
 * "Armour Proficiency" and "Light", and neither is the name of anything.
 * Six feats in the compendium are named this way (the armour and shield
 * proficiency ladders, "Critical Resilience, Improved", "Tough Hide,
 * Improved" and kin), and every prerequisite naming one of them was
 * silently unreadable.
 *
 * Longest run first, so "Critical Resilience, Improved" is preferred
 * over the "Critical Resilience" that also exists.
 *
 * A run is NEVER joined across a segment that parses as a structured
 * clause on its own. Without that rule a prerequisite reading
 * "Weapon Focus, BAB +6" could in principle be swallowed whole by a feat
 * that happened to be named that, and the BAB requirement would stop
 * being checked. No such name exists today; the guard is here so that
 * adding one cannot quietly disable a gate.
 *
 * @param {string} prerequisites
 * @param {Set<string>|null} knownNames Normalised names of every feat and
 *   ability that exists. Null/absent means no rejoining is attempted and
 *   the behaviour is exactly the plain comma split.
 * @returns {string[]}
 */
export function splitPrerequisiteClauses(prerequisites, knownNames = null) {
  const segments = String(prerequisites ?? "")
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!knownNames?.size) return segments;

  const clauses = [];
  let index = 0;
  while (index < segments.length) {
    let joined = null;
    // Longest first. `end` starts one past the furthest segment that can
    // be joined without crossing a structured clause.
    let limit = segments.length;
    for (let scan = index + 1; scan < segments.length; scan += 1) {
      if (parsePrerequisiteClause(segments[scan])) { limit = scan; break; }
    }
    for (let end = limit; end > index + 1; end -= 1) {
      const candidate = segments.slice(index, end).join(", ");
      if (knownNames.has(prerequisiteNameKey(candidate))) { joined = { candidate, end }; break; }
    }
    if (joined) { clauses.push(joined.candidate); index = joined.end; continue; }
    clauses.push(segments[index]);
    index += 1;
  }
  return clauses;
}

/**
 * Whether an actor's stats satisfy EVERY safely-parseable clause in a
 * prerequisites string. Unparseable clauses never block (see module
 * docstring); no prerequisites text at all always passes.
 *
 * NAMED PREREQUISITES. Graham, 13 Aug 2026: "quite a lot of feats have
 * another feat as one." Fifty-one do, and none of them were enforced —
 * a clause that is a feat's name is not one of the stat shapes above, so
 * it fell through to the pass-open case. Offensive Parry was offered to
 * a Cleric who did not have Shield Block; six feats gated on Wild Shape
 * were offered to characters who could not turn into anything.
 *
 * A clause counts as a named prerequisite ONLY if it exactly matches
 * (case and spacing aside) the name of a feat or ability that exists.
 * That set has to be supplied — `knownNames` — and without it nothing
 * changes: every named clause stays unparsed and passes, which is the
 * behaviour every caller had before. That is deliberate. The set is the
 * only thing that can tell "Shield Block" (a feat, and a real gate) from
 * "Underworld" (a fragment of a compound clause a comma split broke),
 * and guessing from shape alone would hide feats players may take.
 *
 * @param {string} prerequisites The printed `system.prerequisites` text.
 * @param {object} [actorStats]
 * @param {number} [actorStats.level]
 * @param {number} [actorStats.bab]
 * @param {number} [actorStats.bsb]
 * @param {Record<string, number>} [actorStats.abilities] Keyed by full
 *   ability name (strength, dexterity, ...) — the actor's current
 *   resolved bonus total.
 * @param {Record<string, number>} [actorStats.skillRanks] Keyed by the
 *   system's own skill key (diplomacy, handleAnimal, ...).
 * @param {Set<string>} [actorStats.ownedNames] Normalised names of the
 *   feats and abilities this actor HAS.
 * @param {Set<string>} [actorStats.knownNames] Normalised names of every
 *   feat and ability that EXISTS. Absent: named clauses pass open.
 * @returns {boolean}
 */
export function meetsParseablePrerequisites(prerequisites, actorStats = {}) {
  const knownNames = actorStats.knownNames ?? null;
  const ownedNames = actorStats.ownedNames ?? null;
  const clauses = splitPrerequisiteClauses(prerequisites, knownNames);

  for (const clause of clauses) {
    // A named prerequisite is checked BEFORE the stat shapes, because a
    // feat may legitimately be named something a stat pattern would also
    // match, and what the book wrote down is a feat.
    if (knownNames?.has(prerequisiteNameKey(clause))) {
      if (!ownedNames?.has(prerequisiteNameKey(clause))) return false;
      continue;
    }

    const parsed = parsePrerequisiteClause(clause);
    if (!parsed) continue;

    switch (parsed.type) {
      case "level":
        if (Number(actorStats.level ?? 0) < parsed.min) return false;
        break;
      case "bab":
        if (Number(actorStats.bab ?? 0) < parsed.min) return false;
        break;
      case "bsb":
        if (Number(actorStats.bsb ?? 0) < parsed.min) return false;
        break;
      case "ability":
        if (Number(actorStats.abilities?.[parsed.key] ?? 0) < parsed.min) return false;
        break;
      case "skill":
        if (Number(actorStats.skillRanks?.[parsed.key] ?? 0) < parsed.min) return false;
        break;
      case "specialSense":
        // Fails open when the caller did not say what senses the actor has.
        if (actorStats.specialSenseModalities && !actorStats.specialSenseModalities.has(parsed.key)) return false;
        break;
      default:
        break;
    }
  }

  return true;
}
