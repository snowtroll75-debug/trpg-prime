/**
 * Languages (Chapter 2).
 *
 * The sheet used to show a race's languages by echoing the prose line off
 * the race item — "Core: Dengaris, Low Tongue. Additional: choose from
 * any common language and Gaian." That is the rulebook's sentence, not
 * the character's languages, and it never changed: a Dwarf with
 * Intelligence +3 and eight ranks of Linguistics saw exactly the same
 * string as one with neither, and nothing anywhere said how many more
 * languages either of them could still take.
 *
 * The rules underneath are entirely countable:
 *
 *   - Your race gives you a fixed set of CORE languages, free.
 *   - "With a positive Intelligence score, you gain an extra number of
 *     languages equal to its value."
 *   - "For every 5 skill ranks you have in the Linguistics skill, you
 *     may learn an additional language."
 *   - Four feats and (from 3.194.0) one heritage add more.
 *   - Those extra picks come "from your character's racial list or from
 *     those offered by your region" — an allowed SET, not a free choice.
 *
 * So this module is the arithmetic and the vocabulary; nothing here
 * touches Foundry, so the harness can check the awkward cases (a Gnome's
 * Gaelic exception, Polyglot Savant stacking with Linguist) without a
 * browser.
 *
 * TWO RULINGS FROM GRAHAM, 2 August 2026.
 *
 * The first: the racial restriction on WHICH languages may be chosen
 * binds only at 1st level. Picks earned later — through Linguistics
 * ranks, or a feat taken at eighth level — are free choice, subject to
 * whatever the GM restricts by campaign. So the allowance is not one
 * number but two: slots that must come from the race's list, and slots
 * that may come from anywhere. Only the first kind is ever policed, and
 * even then only when a character has more off-list picks than their
 * free slots could account for.
 *
 * The second: the Intelligence allowance TRACKS the score rather than
 * locking at 1st level. The rules say "at 1st level your race determines… any
 * additional languages that you may select from having a high
 * Intelligence", but a stored 1st-level snapshot is a thing nothing else
 * on this sheet keeps, and it silently goes wrong the moment a character
 * is rebuilt or retrained. A derived count is self-correcting.
 */

/**
 * The 32 named languages of Chapter 2, with the rarity group that
 * governs whether a given race may select them and the typical speakers
 * the book lists (shown in the picker, since "Sharuk — Orcs, Half Orcs"
 * is the thing that actually tells a player what a language is for).
 */
// NOT FROZEN since 3.560.0: `addLanguage` below lets a companion module
// register its own (Pillars of Faith's Vesperic, Mycelic, Rhevic). Nothing
// else may write to it, and a core name is never overwritten.
export const LANGUAGES = ({
  // Common — "widely spoken languages that bridge the gaps between
  // different societies and races".
  Aelvish: { rarity: "common", speakers: "Elves, Half-Elves" },
  Gantish: { rarity: "common", speakers: "Giants, Ogres, Trolls" },
  Glimbol: { rarity: "common", speakers: "Gnomes" },
  "High Tongue": { rarity: "common", speakers: "Humans" },
  "Low Tongue": { rarity: "common", speakers: "Humans, Other Humanoids" },
  Mesnic: { rarity: "common", speakers: "Catkin and Bestial Races" },
  Munblish: { rarity: "common", speakers: "Halflings" },
  Nyxian: { rarity: "common", speakers: "Kornargon" },

  // Uncommon — "less widespread… spoken by specific groups or
  // communities".
  Aeolian: { rarity: "uncommon", speakers: "Air Elementals" },
  Aqualis: { rarity: "uncommon", speakers: "Water Elementals" },
  Dengaris: { rarity: "uncommon", speakers: "Dwarves" },
  Faechant: { rarity: "uncommon", speakers: "Fey, Centaurs, Plants" },
  Gaian: { rarity: "uncommon", speakers: "Earth Elementals" },
  Ignic: { rarity: "uncommon", speakers: "Fire Elementals" },
  Sharuk: { rarity: "uncommon", speakers: "Orcs, Half Orcs" },
  Wargle: { rarity: "uncommon", speakers: "Goblins, Hobgoblins" },
  Wyrmish: { rarity: "uncommon", speakers: "Ascendan, Dragons" },

  // Rare — "known by only a select few… ancient or esoteric".
  Abyssal: { rarity: "rare", speakers: "Demons" },
  Aesirian: { rarity: "rare", speakers: "Asgardian" },
  Aklo: { rarity: "rare", speakers: "Aberrations" },
  Arboran: { rarity: "rare", speakers: "Mystaron" },
  Druidic: { rarity: "rare", speakers: "Druids" },
  Eudaimonic: { rarity: "rare", speakers: "Maelstrum" },
  Ferric: { rarity: "rare", speakers: "Eldravi" },
  Gaelic: { rarity: "rare", speakers: "Agothians" },
  Harmonian: { rarity: "rare", speakers: "Angels" },
  Luminal: { rarity: "rare", speakers: "Thrae" },
  Nefari: { rarity: "rare", speakers: "Infernus" },
  Pyroclan: { rarity: "rare", speakers: "Vexora" },
  Solari: { rarity: "rare", speakers: "Serenith" },
  Stygian: { rarity: "rare", speakers: "Soulaess" },
  Thanatos: { rarity: "rare", speakers: "Undead" }
});

/**
 * The rarity groups, in book order. "regional" is a fourth group that
 * has no fixed membership — the book leaves it to the GM ("Your GM will
 * determine what regional languages are available") — so it is filled
 * from a world setting plus whatever a player types.
 */
export const LANGUAGE_GROUPS = Object.freeze(["common", "uncommon", "rare", "regional"]);

export const LANGUAGE_GROUP_LABELS = Object.freeze({
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  regional: "Regional"
});

const CANONICAL = new Map(
  Object.keys(LANGUAGES).map((name) => [name.trim().toLowerCase(), name])
);

/**
 * Register a language a module ships (3.560.0). Additive only: a name the
 * catalogue already has is left exactly as printed and `false` comes back.
 */
export function addLanguage(name, { rarity = "uncommon", speakers = "" } = {}) {
  const clean = String(name ?? "").trim();
  if (!clean || CANONICAL.has(clean.toLowerCase())) return false;
  LANGUAGES[clean] = { rarity, speakers };
  CANONICAL.set(clean.toLowerCase(), clean);
  return true;
}

/** Comma-separated field → trimmed entries, matching parseGrantList. */
export function parseLanguageList(text) {
  if (Array.isArray(text)) return text.map((e) => String(e ?? "").trim()).filter(Boolean);
  return String(text ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The catalogue's spelling of a language, or the name as written if it
 * isn't one of the 32 — a regional or campaign language is a perfectly
 * valid thing to know, it just isn't in the book's tables.
 */
export function canonicalLanguage(name) {
  const clean = String(name ?? "").trim();
  if (!clean) return "";
  return CANONICAL.get(clean.toLowerCase()) ?? clean;
}

/** "common" | "uncommon" | "rare" | "regional" (the fallback). */
export function languageRarity(name) {
  const canonical = canonicalLanguage(name);
  return LANGUAGES[canonical]?.rarity ?? "regional";
}

/** Every named language in the catalogue, in book order. */
export function allLanguageNames() {
  return Object.keys(LANGUAGES);
}

/** Every catalogue language in a group, in book order. */
export function languagesInGroup(group) {
  return Object.keys(LANGUAGES).filter((name) => LANGUAGES[name].rarity === group);
}

/**
 * Resolves a race's `additionalLanguages` spec into the set of names it
 * permits.
 *
 * The spec is a comma-separated mix of GROUP names and specific
 * languages, because that is exactly how Chapter 2 words it: the Dwarf
 * gets "any common language and Gaian" (a group plus one uncommon), the
 * Gnome "any common language and Gaelic" (a group plus one RARE — the
 * kind of exception that a groups-only model would have quietly
 * dropped), and the Ascendan "any other language that is not rare"
 * (two groups).
 *
 * Regional is always permitted on top, since the Bonus Languages rule
 * says the extra picks come "from your character's racial list or from
 * those offered by your region".
 *
 * @param {string} spec e.g. "common, Gaian"
 * @param {string[]} regional Names from the GM's world setting.
 * @returns {{groups: string[], names: Set<string>}}
 */
export function resolveAllowedLanguages(spec, regional = []) {
  const groups = [];
  const names = new Set();

  for (const entry of parseLanguageList(spec)) {
    const lower = entry.toLowerCase();
    if (LANGUAGE_GROUPS.includes(lower)) {
      groups.push(lower);
      for (const name of languagesInGroup(lower)) names.add(name);
      continue;
    }
    names.add(canonicalLanguage(entry));
  }

  // Region is always on the table for bonus languages.
  if (!groups.includes("regional")) groups.push("regional");
  for (const name of regional) {
    const clean = String(name ?? "").trim();
    if (clean) names.add(canonicalLanguage(clean));
  }

  return { groups, names };
}

/**
 * A race or heritage's own extra picks, written as "<count> <groups>":
 * the Human's "one Regional Language" is `"1 regional"`, and the
 * Lys-Fod halfling's two from common or uncommon is
 * `"2 common|uncommon"`. Returns null for an empty or malformed spec, so
 * a typo costs that one grant rather than the whole panel.
 */
export function parseLanguageChoice(spec) {
  const clean = String(spec ?? "").trim();
  if (!clean) return null;
  const match = /^(\d+)\s+(.+)$/.exec(clean);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return null;
  const from = match[2]
    .split(/[|,]/)
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
  if (!from.length) return null;
  return { count, from };
}

/**
 * Feats that grant flat extra languages, by normalised name.
 *
 * Linguist is deliberately NOT here: it grants "an additional language
 * for every 5 ranks you have in the Linguistics skill (in addition to
 * the one you normally get)", which is a rate, not a number, and is
 * computed alongside the base rate in languageAllowance.
 */
export const LANGUAGE_FEAT_GRANTS = Object.freeze({
  "language master": Object.freeze({
    label: "Language Master",
    count: 2,
    // "Additionally, you may select two additional languages" — no
    // restriction stated, so these two are not held to the race's list.
    unrestricted: true
  }),
  "polyglot savant": Object.freeze({
    label: "Polyglot Savant",
    count: 2,
    // "which must be chosen from common languages and uncommon languages"
    from: Object.freeze(["common", "uncommon"])
  })
});

/** Ranks per bonus language, before Linguist doubles the rate. */
export const RANKS_PER_LANGUAGE = 5;

/**
 * Every source of language picks a character has, and the total.
 *
 * Returned as itemised sources rather than a bare number so the panel
 * and its tooltip can show WHY a character has seven language slots —
 * which is the question a player actually asks, and the one a single
 * total can never answer.
 *
 * @param {object} options
 * @param {number} options.intelligence The Intelligence TOTAL.
 * @param {number} options.linguisticsRanks
 * @param {string[]} options.featureNames Names of feat and ability items.
 * @param {Array<{label: string, spec: string}>} options.choiceGrants
 *   Race/heritage `languageChoices` entries.
 * @param {Array<{label: string, count: number}>} [options.linguistBonuses]
 *   Features granting extra languages only once Linguist is held (Lys-Fod).
 * @returns {{sources: Array<{label: string, count: number, from?: string[]}>, total: number}}
 */
export function languageAllowance({
  intelligence = 0,
  linguisticsRanks = 0,
  featureNames = [],
  choiceGrants = [],
  linguistBonuses = []
} = {}) {
  const owned = new Set(
    featureNames.map((name) => String(name ?? "").trim().toLowerCase())
  );
  const sources = [];

  // Race, heritage and background choice slots (the Human's regional
  // language; the Diplomat's two).
  for (const grant of choiceGrants) {
    const parsed = parseLanguageChoice(grant?.spec);
    if (!parsed) continue;
    // A race or heritage's own slots are 1st-level allocations tied to
    // what the character IS, so they are held to the list they name.
    //
    // A BACKGROUND's are not (Graham's ruling, 3 August): a background is
    // upbringing rather than bloodline, and the Diplomat's whole trade is
    // foreign tongues. Its slots are free picks, so they are never
    // flagged as off-list — hence `scope` coming off the grant itself
    // rather than being assumed here.
    sources.push({
      label: grant.label,
      count: parsed.count,
      from: parsed.from,
      scope: grant.scope === "free" ? "free" : "racial",
      unrestricted: Boolean(grant.unrestricted)
    });
  }

  // "With a positive Intelligence score, you gain an extra number of
  // languages equal to its value." A negative Intelligence takes none
  // away — the rule only ever adds.
  const int = Math.max(0, Math.trunc(Number(intelligence) || 0));
  // Chapter 2 ties the Intelligence languages to 1st level ("at 1st
  // level your race determines… any additional languages that you may
  // select from having a high Intelligence"), so these are the racially
  // restricted ones.
  if (int > 0) sources.push({ label: `Intelligence +${int}`, count: int, scope: "racial" });

  // "For every 5 skill ranks you have in the Linguistics skill, you may
  // learn an additional language."
  const ranks = Math.max(0, Math.trunc(Number(linguisticsRanks) || 0));
  const perRate = Math.floor(ranks / RANKS_PER_LANGUAGE);
  // Ranks are earned in play — a level-1 character can hold at most one —
  // so every language they buy is a post-1st-level pick, and free.
  if (perRate > 0) sources.push({ label: `Linguistics ${ranks} ranks`, count: perRate, scope: "free" });

  // Linguist: "in addition to the one you normally get for every 5
  // ranks" — so it doubles the rate rather than adding a flat language,
  // and is worth nothing until the fifth rank.
  const hasLinguist = owned.has("linguist");
  if (hasLinguist && perRate > 0) {
    sources.push({ label: "Linguist", count: perRate, scope: "free" });
  }

  for (const [key, grant] of Object.entries(LANGUAGE_FEAT_GRANTS)) {
    if (!owned.has(key)) continue;
    sources.push({
      label: grant.label,
      count: grant.count,
      // A feat's own stated range still binds — Polyglot Savant's two are
      // "chosen from common languages and uncommon languages" whenever
      // they are taken — but the RACE's list no longer does.
      from: grant.from ? [...grant.from] : undefined,
      unrestricted: Boolean(grant.unrestricted),
      scope: "free"
    });
  }

  // "Furthermore, if you select the Linguist feat, you automatically
  // gain an additional language." — Polyglot Savant, and the Lys-Fod
  // heritage words its own the same way.
  if (hasLinguist && owned.has("polyglot savant")) {
    sources.push({ label: "Polyglot Savant + Linguist", count: 1, scope: "free" });
  }

  // The same "…and if you take the Linguist feat, you gain another new
  // language" clause, carried on a feature rather than hard-coded:
  // Lys-Fod (Chapter 2). Free scope — it is contingent on a feat the
  // character may take at any level, so no racial list binds it.
  if (hasLinguist) {
    for (const bonus of linguistBonuses) {
      const count = Math.max(0, Math.trunc(Number(bonus?.count) || 0));
      if (!count) continue;
      sources.push({ label: `${bonus.label ?? "Heritage"} + Linguist`, count, scope: "free" });
    }
  }

  const total = sources.reduce((sum, entry) => sum + entry.count, 0);
  return { sources, total };
}

/**
 * The whole language state of a character, ready to render.
 *
 * Core languages are kept apart from chosen ones rather than merged into
 * one list, for the same reason granted items are: they belong to the
 * race, they cost nothing, and they should leave with it. Only the
 * chosen ones are stored on the actor.
 *
 * Over-allowance is reported, never prevented — Chapter 2 says "Your GM
 * may allow you to select different languages based upon the campaign",
 * so a hard cap would fight the text, and a GM-granted language would
 * need a workaround instead of just working.
 *
 * @returns {{
 *   core: Array<{name: string, rarity: string, source: string}>,
 *   chosen: Array<{name: string, rarity: string, allowed: boolean}>,
 *   known: string[], allowance: object, spent: number, remaining: number,
 *   over: number, unknown: string[]
 * }}
 */
export function coverOffListPicks(picks = [], sources = [], resolveRange = () => null) {
  // Capacity buckets from every non-racial source: a free slot takes
  // anything, a slot with a stated range takes only what it names.
  const buckets = sources
    .filter((source) => source.scope !== "racial")
    .map((source) => ({
      capacity: source.count,
      accepts: source.unrestricted || !source.from?.length ? null : resolveRange(source.from)
    }))
    // Most restrictive first. Because the ranges here nest — common and
    // uncommon inside "anything" — spending the tightest bucket that can
    // take a pick is optimal, not merely a heuristic.
    .sort((a, b) => (a.accepts?.size ?? Infinity) - (b.accepts?.size ?? Infinity));

  const uncovered = [];
  for (const pick of picks) {
    const bucket = buckets.find(
      (entry) => entry.capacity > 0 && (!entry.accepts || entry.accepts.has(pick))
    );
    if (bucket) bucket.capacity -= 1;
    else uncovered.push(pick);
  }
  return uncovered;
}

export function languageState({
  coreGrants = [],
  chosen = [],
  allowance = { sources: [], total: 0 },
  allowedNames = new Set(),
  racialNames = null,
  resolveRange = () => null
} = {}) {
  const coreSeen = new Set();
  const core = [];
  for (const grant of coreGrants) {
    for (const raw of parseLanguageList(grant?.languages)) {
      const name = canonicalLanguage(raw);
      if (!name || coreSeen.has(name.toLowerCase())) continue;
      coreSeen.add(name.toLowerCase());
      core.push({ name, rarity: languageRarity(name), source: grant.label ?? "Race" });
    }
  }

  const chosenSeen = new Set();
  const chosenRows = [];
  for (const raw of parseLanguageList(chosen)) {
    const name = canonicalLanguage(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    // A language already granted for free isn't a second language.
    if (coreSeen.has(key) || chosenSeen.has(key)) continue;
    chosenSeen.add(key);
    chosenRows.push({
      name,
      rarity: languageRarity(name),
      allowed: allowedNames.has(name)
    });
  }

  const spent = chosenRows.length;
  const total = Number(allowance.total ?? 0);
  const sources = allowance.sources ?? [];
  const racialSlots = sources
    .filter((source) => source.scope === "racial")
    .reduce((sum, source) => sum + source.count, 0);

  // Which picks fall outside the RACE's own list. Off the racial list is
  // not the same as wrong: a character with free slots is entitled to
  // them, so the flag is raised only for the ones no free slot could
  // account for.
  const racial = racialNames ?? allowedNames;
  const offRacial = chosenRows.filter((row) => !racial.has(row.name)).map((row) => row.name);
  const uncovered = coverOffListPicks(offRacial, sources, resolveRange);
  const uncoveredSet = new Set(uncovered);
  for (const row of chosenRows) row.flagged = uncoveredSet.has(row.name);

  return {
    core,
    chosen: chosenRows,
    known: [...core.map((c) => c.name), ...chosenRows.map((c) => c.name)],
    allowance,
    spent,
    remaining: Math.max(0, total - spent),
    over: Math.max(0, spent - total),
    racialSlots,
    freeSlots: Math.max(0, total - racialSlots),
    offRacial,
    // Only the picks that genuinely have no slot to sit in.
    unknown: uncovered
  };
}
