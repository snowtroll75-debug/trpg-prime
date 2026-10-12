/**
 * Grant resolution: the core mechanism that lets a Background, Class,
 * Race, Heritage, or Divine Aspect reference another compendium item
 * (a feat, a spell, an ability) by name only, resolved at the moment
 * the grant is actually applied rather than baked in when either side
 * was authored.
 *
 * This is deliberately the fix for the specific problem that caused
 * trouble in an earlier build of this system: cross-references between
 * compendium categories were tightly coupled to build order and to
 * each other's internal IDs. Storing a plain name and resolving it
 * lazily means the two sides of a grant can be built in any order, and
 * a renamed or not-yet-built target fails loudly (a reported mismatch)
 * rather than silently (a dangling ID, or duplicated data drifting out
 * of sync).
 *
 * Pure logic only — no Foundry API calls. matchGrants is given a list
 * of requested names and a plain index of available {name, ...} entries
 * (however they were fetched), and reports which resolved and which
 * didn't. The Foundry-side workflow (grants-workflow.mjs) is
 * responsible for actually querying compendium packs and creating
 * embedded items from what this function says should be granted.
 */
import { preferredBySourcebook } from "./sourcebooks.mjs";

/**
 * Parses a comma-separated field (e.g. Background.system.grantedFeats)
 * into a trimmed array of names. Grant fields are stored as plain
 * strings rather than array fields — this project has no precedent for
 * array-of-string schema fields anywhere else (every other "list of
 * names" field, like resistances/immunities/weaknesses, is a
 * comma-separated string), and testing confirmed an empty-array default
 * in template.json doesn't reliably infer a usable Foundry schema field
 * for holding plain strings, silently breaking item creation. Matching
 * the proven convention avoids the problem entirely rather than
 * fighting it.
 */
export function parseGrantList(text) {
  return String(text ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Parses a bonusSpells-style field: "1: Cure Light Wounds, 3: Bless"
 * into [{level, name}, ...]. Malformed entries (no ":" separator, or a
 * non-numeric level) are skipped rather than thrown on, since a typo in
 * source data should surface as a validator warning, not a crash.
 */
export function parseLevelledGrantList(text) {
  return parseGrantList(text)
    .map((entry) => {
      const [levelPart, ...nameParts] = entry.split(":");
      const level = Number(levelPart);
      const name = nameParts.join(":").trim();
      if (!Number.isFinite(level) || !name) return null;
      return { level, name };
    })
    .filter(Boolean);
}

/**
 * The same "level: name" list, but tolerant of entries with no level.
 *
 * A class's abilities arrive at different levels — a Fighter's Weapon
 * Supremacy is a 13th-level ability — and the field they live in
 * (`classAbilities`) has existed since 3.175.0 as a plain comma-separated
 * list that a GM may well have typed into by hand. `parseLevelledGrantList`
 * DROPS any entry without a colon, so reading a hand-typed list through it
 * would grant nothing at all and report nothing missing.
 *
 * An entry with no level is treated as level 1 — available from the
 * start, which is what someone who wrote a bare name meant.
 */
export function parseMaybeLevelledGrantList(text) {
  return parseGrantList(text)
    .map((entry) => {
      const at = entry.indexOf(":");
      if (at < 0) return { level: 1, name: entry.trim() };
      const level = Number(entry.slice(0, at));
      const name = entry.slice(at + 1).trim();
      // A colon that is not a level prefix belongs to the NAME —
      // "Channels: Greater" is a plausible ability and must not become
      // level NaN and vanish.
      if (!Number.isFinite(level)) return { level: 1, name: entry.trim() };
      if (!name) return null;
      return { level, name };
    })
    .filter((entry) => entry && entry.name);
}

/**
 * @param {string[]} requestedNames Names as stored on the granting item
 *   (e.g. Background.system.grantedFeats).
 * @param {Array<{name: string, [key: string]: any}>} availableIndex
 *   Every candidate entry from the target pack(s), by name.
 * @returns {{
 *   resolved: Array<{requested: string, entry: object}>,
 *   unresolved: string[]
 * }}
 */
export function matchGrants(requestedNames, availableIndex, { sourceClass = "", preferPackage = "" } = {}) {
  const names = Array.isArray(requestedNames) ? requestedNames : [];
  const index = Array.isArray(availableIndex) ? availableIndex : [];

  // Case-insensitive, trimmed comparison: authors shouldn't have to get
  // capitalization byte-for-byte identical between "grants Weapon Focus"
  // on a background and the feat actually named "Weapon Focus" for the
  // grant to resolve — but an exact match (after normalising case/
  // whitespace) is still required, not a fuzzy/partial one, since a
  // silent wrong-match is worse than a loud non-match.
  // Apostrophes are STRIPPED, both curly and straight.
  //
  // The spells pack writes "Death’s Defiance" with a typographic
  // apostrophe; Appendix 4 writes the same spell with a straight one, and
  // writes "Renewals Touch" for the pack's "Renewal’s Touch" with no
  // apostrophe at all. All three are the same spell to a reader and were
  // three different strings here, so a divine aspect promised spells that
  // could never be granted. An apostrophe carries no meaning for matching
  // a name, and dropping it costs nothing: two entries differing only by
  // one would now be a tie, which this function reports loudly rather
  // than guessing at.
  const normalise = (s) =>
    String(s ?? "").replace(/[’‘']/g, "").trim().toLowerCase();

  // Grouped by name rather than keyed by it, because a name is NOT
  // unique: the Rogue and the Ranger each print a class ability called
  // Trap Finder, and a Map keyed on the name silently kept whichever
  // happened to come last out of the compendium index. A Rogue was then
  // handed the RANGER's copy — stamped "Ranger 1st level", invisible to
  // the Rogue's own class filter — and which class won depended on
  // LevelDB key order, so it would have flipped on any future rebuild.
  const byName = new Map();
  for (const entry of index) {
    const key = normalise(entry.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(entry);
  }

  // When several entries share a name, the one belonging to the class
  // asking for it wins. With no class to go on — a race, a background, a
  // feat — a single candidate still resolves and a genuine tie does not:
  // a silent wrong match is worse than a loud non-match, which is the
  // rule this function was written around.
  const wanted = normalise(sourceClass);
  const pick = (candidates) => {
    if (candidates.length === 1) return candidates[0];
    if (wanted) {
      const mine = candidates.filter((c) => normalise(c.system?.sourceClass) === wanted);
      if (mine.length === 1) return mine[0];
    }
    // TWO BOOKS, ONE NAME (3.628.0). With Fiends & Fables in the federated
    // abilities, Pillars of Faith's Unliving Vampire asks for "Fast Healing"
    // and both books print one; the core's Constrict has an F&F twin. The
    // granting item's own book wins, then the core's — still null, and
    // reported, when that leaves a tie.
    return preferredBySourcebook(candidates, preferPackage);
  };

  const resolved = [];
  const unresolved = [];

  for (const requested of names) {
    const entry = pick(byName.get(normalise(requested)) ?? []);
    if (entry) resolved.push({ requested, entry });
    else unresolved.push(requested);
  }

  return { resolved, unresolved };
}

/**
 * Duplicate-grant detection: if an actor already has an embedded item
 * flagged as granted by this exact source, applying the same grant
 * again should not create a second copy. Compares the source item's id
 * (not name — a source could be renamed) against each embedded item's
 * own grant-tracking flag.
 *
 * @param {Array<{flags?: object}>} existingItems Actor's current items.
 * @param {string} sourceId The granting item's own id.
 * @returns {Set<string>} The set of already-granted target names for
 *   this specific source, so matchGrants' resolved list can be filtered
 *   before creating anything.
 */
export function alreadyGrantedNames(existingItems, sourceId) {
  const names = new Set();
  for (const item of existingItems ?? []) {
    const grant = item.flags?.["trg-prime"]?.grantedBy;
    if (grant?.sourceId === sourceId) names.add(String(grant.requested ?? "").toLowerCase());
  }
  return names;
}

/**
 * Does this item actually declare any of the grant fields its type has?
 *
 * NEW at 3.421.0, and it exists so that "a granted item's own grants"
 * can be asked as a question rather than assumed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE PREMISE THAT WAS FALSE.
 *
 * `grant-autorun` skipped any item carrying a `grantedBy` stamp, on the
 * stated grounds that "a granted item's own grants belong to whatever
 * granted it". Nothing anywhere applied them on that item's behalf, so
 * they belonged to nobody and were never applied at all. The comment
 * warned that a chain would otherwise "run its own grants a SECOND
 * time"; there was no first time.
 *
 * Graham, 27 August 2026: "the Archetype feat Blessed by Gods is not
 * applying the Lay on Hands Specialist Spell." Blessed By the Gods
 * arrives from the Cleric's Priestly Path chooser, which stamps
 * `grantedBy` — and Priestly Path does not list Lay On Hands anywhere,
 * so the chain simply stopped.
 *
 * Asking whether the item declares anything keeps the change narrow:
 * of 436 feats only 25 declare a grant field, so the other 411 are
 * skipped exactly as before and no extra pass or card appears for them.
 *
 * @param {object} itemSystem The item's `system` object.
 * @param {Array<{field: string}>} fields That type's GRANT_FIELDS entry.
 * @returns {boolean}
 */
export function declaresGrants(itemSystem, fields) {
  return (Array.isArray(fields) ? fields : []).some(
    ({ field }) => String(itemSystem?.[field] ?? "").trim().length > 0
  );
}
