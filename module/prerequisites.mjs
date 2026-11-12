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
 * A HERITAGE AND A LEVEL CEILING (3.683.0; Eldritch Arts Block 5, Graham's
 * Q57 of 3 November 2026, "as proposed"). "<Name> Heritage" (the core's own
 * lower-case "Azgar heritage" too) is gated, but ONLY when <Name> is the name
 * of a heritage that exists — the caller supplies that set (`knownHeritages`,
 * read off the federated heritages pack), exactly as `knownNames` tells a
 * feat from prose — and passes when the actor owns a heritage of that name.
 * "Level N only" is a MAXIMUM: it passes only at character level N or lower.
 * Until 3.683.0 both were deliberately unparsed, and eighteen Eldritch Arts
 * feats gated to one heritage were offered to the whole race, and Ember Eyed
 * and Unbound ("Level 1 only") at every level. The core's own Fire-Like Blood
 * ("Azgar heritage"), Arctic Elf, Necrotic Resilience, Tusks and Beastman
 * ("Level 1 only") are gated by the same change, which Graham approved.
 *
 * Everything else is intentionally left UNPARSED and always passes:
 * race names, a heritage clause naming no heritage that exists,
 * caster-category names
 * ("Learned Caster"), multi-skill clauses the compound reader cannot read
 * ("5 or more ranks in any skill that has both the create and research
 * actions", "A total of 10 ranks in …" — "Occultism or Religion 1 rank" and
 * "Handle Animal & Nature 1 rank" ARE read since 3.684.1, Graham's ruling of
 * 4 November 2026; see parseCompoundSkillClause), comparative clauses ("Dex at
 * least 1 higher than Str"), "Caster Level N", proficiency
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
 * @returns {{type: "ability"|"bab"|"bsb"|"skill"|"level"|"levelMax"|"heritage"|"casterStyle"|"specialSense",
 *   key?: string, min?: number, max?: number, name?: string}|null}
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

  // Deliberately NOT "Caster Level N" (a distinct, per-class-computed stat,
  // not character Level) — it would silently mismatch text->meaning if
  // matched here, so it falls through to the unparsed/pass-open case.
  m = text.match(/^Level\s+(\d+)$/i);
  if (m) return { type: "level", min: Number(m[1]) };

  // "LEVEL N ONLY" (3.683.0; Eldritch Arts Block 5, Q57): a MAXIMUM, its own
  // type so it can never be read as the minimum above. Ember Eyed and Unbound
  // ("Level 1 only"); the core's Tusks and Beastman.
  m = text.match(/^Level\s+(\d+)\s+only$/i);
  if (m) return { type: "levelMax", max: Number(m[1]) };

  // "<NAME> HERITAGE" (3.683.0; Eldritch Arts Block 5, Q57): "Wyrmdral
  // Heritage", the core's "Azgar heritage". Parsed for any name; GATED only
  // when the name is a heritage that exists (meetsParseablePrerequisites'
  // `knownHeritages`), so "Any Heritage" or a race read as one passes open.
  //
  // ALTERNATIVES (review): the core's Fire-Like Blood prints "Azgar heritage
  // or Elarni heritage". Read as one name it is "Azgar heritage or Elarni",
  // which names no heritage, and the clause passed open. Each alternative is
  // a heritage of its own; `names` holds them all, and `name` the first.
  m = text.match(/^(.+?)\s+heritage$/i);
  if (m) {
    const names = text.split(/\s+or\s+/i).map((part) => part.trim().replace(/\s+heritage$/i, "").trim());
    if (names.length > 1 && !names.every(Boolean)) return null;
    return names.length > 1 ? { type: "heritage", name: names[0], names } : { type: "heritage", name: names[0] };
  }

  // "LEARNED CASTER" (3.671.0; Inner Tempest's Shugenja). The class's
  // casting style, as the class item records it (Druid, Cleric and Wizard
  // are learned; the Bard, Ranger and Crusader instinctive). Graham's IT-C9:
  // "Shugenja is only available to Learned casters".
  m = text.match(/^(Learned|Instinctive) Caster$/i);
  if (m) return { type: "casterStyle", style: m[1].toLowerCase() };

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
 * "A OR B N RANKS" (3.684.0; Eldritch Arts Block 6, G9). Elemental
 * Exhalation's and Wyrm Ascendant's "Arcana or Nature 8 ranks" (12 for the
 * second): any one of the named skills at N ranks; "A and B N ranks" (or
 * "A & B") is every one of them, as the progression lines already read
 * (archetype-progression.mjs). Every name must be a skill and only one joiner
 * may appear, or the clause stays unparsed.
 *
 * EVERY FEAT, NOT AN OPT-IN (3.684.1; Graham, 4 November 2026: "Yes for the
 * skill rank prerequisites"). 3.684.0 read this shape only for a feat flagged
 * `flags.trg-prime.compoundSkillPrerequisites: true`, and the core's own
 * seventeen lines of it passed open. Now `meetsParseablePrerequisites` reads
 * it for every feat; the flag is still accepted and still requested by the
 * picker, and changes nothing. The book's lines: Scribe Scroll, Brew Potion,
 * Spell Recognition ("Arcana, Nature, Occultism or Religion 1 rank"),
 * Magical Crafting ("… 2 ranks"), Mastermind ("Either Arcana, Crafting,
 * Culture, Nature, Occultism, Planes or Religion 2 ranks"), Alchemical
 * Crafting ("Crafting or Nature 1 rank"), and ten "A & B N rank(s)" lines
 * (Animal Affinity's "Handle Animal & Nature 1 rank" and kin).
 *
 * A LIST, NOT TWO SKILLS. Most of those lines name four or seven skills, and
 * the comma split hands this function only "Occultism or Religion 1 rank";
 * read alone it would hide Scribe Scroll from an Arcana caster.
 * `foldCompoundSkillLists` puts the list back together first. A leading
 * "Either" and an Oxford comma (", or Religion") are read here too.
 * `parsePrerequisiteClause` itself is untouched, so clause splitting is
 * exactly as it was.
 *
 * @param {string} clause
 * @returns {{type: "skillAny"|"skillAll", keys: string[], min: number}|null}
 */
export function parseCompoundSkillClause(clause) {
  const text = String(clause ?? "").trim().replace(/^either\s+/i, "").replace(/\s*&\s*/g, " and ")
    .replace(/\s*,\s*(or|and)\s+/gi, " $1 ");
  const m =
    text.match(/^(.+?)\s+(?:skills?\s+)?(\d+)\+?\s*ranks?$/i) ||
    text.match(/^(.+?)\s+(?:skills?\s+)?ranks?\s+(\d+)$/i);
  if (!m) return null;
  const names = m[1].trim().replace(/\s+skills?$/i, "");
  const hasOr = /\s+or\s+/i.test(names);
  const hasAnd = /\s+and\s+/i.test(names);
  if (hasOr === hasAnd) return null;
  const parts = names.split(/\s*,\s*|\s+or\s+|\s+and\s+/i).map((n) => n.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const keys = parts.map((n) => SKILL_LABEL_TO_KEY[n.toLowerCase()]);
  if (keys.some((k) => !k)) return null;
  return { type: hasAnd ? "skillAll" : "skillAny", keys, min: Number(m[2]) };
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
 * A heritage's comparison key (3.683.0, Q57): the name key above, less a
 * trailing "heritage", so the clause "Wyrmdral Heritage" and an item named
 * either "Wyrmdral" or "Wyrmdral Heritage" meet on "wyrmdral".
 */
export const heritageNameKey = (value) =>
  prerequisiteNameKey(value).replace(/\s+heritage$/, "");

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
      // A HERITAGE-SHAPED SEGMENT IS NOT A BOUNDARY (3.683.0): "<Name>
      // heritage" is a name, not a stat, and splitting stayed exactly as it
      // was before that shape was parsed.
      const parsed = parsePrerequisiteClause(segments[scan]);
      if (parsed && parsed.type !== "heritage") { limit = scan; break; }
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
 * Rejoin a skill list the comma split broke (3.684.1; Graham, 4 November
 * 2026). "Arcana, Nature, Occultism or Religion 1 rank" arrives as "Arcana",
 * "Nature", "Occultism or Religion 1 rank": the bare skill names just before
 * a compound clause (or before an Oxford-comma tail, "or Religion 1 rank")
 * belong to it. Only a run of bare skill names is taken — the first may say
 * "Either" — and only when the rejoined clause parses; anything else is left
 * exactly as it was split, so a clause this cannot read still passes open.
 *
 * @param {string[]} clauses
 * @returns {string[]}
 */
export function foldCompoundSkillLists(clauses) {
  const bareSkill = (segment) => Boolean(SKILL_LABEL_TO_KEY[String(segment).trim().replace(/^either\s+/i, "").toLowerCase()]);
  const out = [];
  for (const clause of clauses) {
    const tail = /^(?:or|and|&)\s+/i.test(clause);
    if (tail || parseCompoundSkillClause(clause)) {
      let start = out.length;
      while (start > 0 && bareSkill(out[start - 1])) {
        start -= 1;
        if (/^either\s+/i.test(out[start])) break;
      }
      if (start < out.length) {
        const joined = [...out.slice(start), clause].join(", ");
        if (parseCompoundSkillClause(joined)) { out.splice(start, out.length - start, joined); continue; }
      }
    }
    out.push(clause);
  }
  return out;
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
 * @param {Set<string>} [actorStats.heritageNames] `heritageNameKey`s of the
 *   heritages this actor HAS (3.683.0).
 * @param {Set<string>} [actorStats.knownHeritages] `heritageNameKey`s of
 *   every heritage that EXISTS (3.683.0). Absent or empty: heritage clauses
 *   pass open.
 * @param {boolean} [actorStats.compoundSkills] "A or B N ranks" (3.684.0, G9)
 *   is read unless this is `false` (3.684.1; Graham, 4 November 2026: every
 *   feat, no longer an opt-in). `false` is the split and pass-open of 3.684.0.
 * @returns {boolean}
 */
export function meetsParseablePrerequisites(prerequisites, actorStats = {}) {
  const knownNames = actorStats.knownNames ?? null;
  const ownedNames = actorStats.ownedNames ?? null;
  const compoundSkills = actorStats.compoundSkills !== false;
  const split = splitPrerequisiteClauses(prerequisites, knownNames);
  const clauses = compoundSkills ? foldCompoundSkillLists(split) : split;

  for (const clause of clauses) {
    // A named prerequisite is checked BEFORE the stat shapes, because a
    // feat may legitimately be named something a stat pattern would also
    // match, and what the book wrote down is a feat.
    if (knownNames?.has(prerequisiteNameKey(clause))) {
      if (!ownedNames?.has(prerequisiteNameKey(clause))) return false;
      continue;
    }

    // "A or B N ranks", for every feat (3.684.0, G9; every feat since
    // 3.684.1, Graham's 4 November 2026 ruling). See
    // `parseCompoundSkillClause` and `foldCompoundSkillLists`.
    if (compoundSkills) {
      const compound = parseCompoundSkillClause(clause);
      if (compound) {
        const has = (key) => Number(actorStats.skillRanks?.[key] ?? 0) >= compound.min;
        if (compound.type === "skillAll" ? !compound.keys.every(has) : !compound.keys.some(has)) return false;
        continue;
      }
    }

    const parsed = parsePrerequisiteClause(clause);
    if (!parsed) continue;

    switch (parsed.type) {
      case "level":
        if (Number(actorStats.level ?? 0) < parsed.min) return false;
        break;
      // "Level N only" (3.683.0, Q57): no higher than N.
      case "levelMax":
        if (Number(actorStats.level ?? 0) > parsed.max) return false;
        break;
      // "<Name> Heritage" (3.683.0, Q57): gated only when <Name> is a
      // heritage that exists; then the actor must own one of that name.
      // With alternatives ("Azgar heritage or Elarni heritage"), gated only
      // when every one is a heritage that exists; then owning any one passes.
      case "heritage": {
        const keys = (parsed.names ?? [parsed.name]).map(heritageNameKey);
        if (!keys.every((key) => actorStats.knownHeritages?.has?.(key))) break;
        if (!keys.some((key) => actorStats.heritageNames?.has?.(key))) return false;
        break;
      }
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
      case "casterStyle":
        // Fails open when the caller did not say how the actor casts.
        if (actorStats.casterStyle !== undefined && actorStats.casterStyle !== parsed.style) return false;
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
