/**
 * Immunities, Resistances and Weaknesses — one vocabulary, three effects.
 *
 * Per Graham: an immunity to damage means you take no damage and suffer
 * no critical from that type. A condition or trait immunity means you
 * ignore that condition, or any effect carrying that trait. Some words
 * live in more than one of those vocabularies, and that overlap is the
 * whole point rather than a conflict:
 *
 *   "Immunity to Stun"   — Stun is a condition only, so it stops the
 *                          Stunned condition and nothing else.
 *   "Immunity to Mental" — Mental is a damage type AND an Appendix 3
 *                          trait, so it stops mental damage and every
 *                          effect carrying the Mental trait.
 *
 * So a single entry is resolved against all three vocabularies and takes
 * effect in every one it is valid in. A GM writes "Mental" once and gets
 * everything the word means, rather than having to know which of three
 * boxes to type it into and silently granting half an immunity if they
 * pick wrong.
 *
 * Anything that matches nothing is reported as unresolved rather than
 * ignored. A typo in this field would otherwise be indistinguishable
 * from an immunity that simply never came up — which is exactly how
 * "Concentration" for "Concentrate" hid for three releases.
 */
import { DAMAGE_TYPES } from "./config.mjs";
import { CONDITIONS, CONDITION_IDS } from "./conditions/registry.mjs";
import { APPENDIX_TRAITS, APPENDIX_SUB_TRAITS, CODEX_TRAITS } from "./data/appendix-traits.mjs";
import { registeredTraits } from "./module-api.mjs";

/**
 * Damage-type groups, so "physical" or "energy" can be written instead
 * of listing four types. The sheet has always invited this — its
 * placeholder read "Fire 5, physical 2" — while the matcher compared
 * whole words against damage-type keys only, so a group entry silently
 * did nothing.
 */
export const DAMAGE_TYPE_GROUPS = Object.freeze(
  Object.entries(DAMAGE_TYPES).reduce((groups, [key, meta]) => {
    const group = meta.group;
    if (!group) return groups;
    groups[group] = Object.freeze([...(groups[group] ?? []), key]);
    return groups;
  }, {})
);

/**
 * Categories a defence can name that are not damage TYPES (3.547.0).
 *
 * Chapter 7's resistances are mostly typed — fire, cold, slashing — but
 * the bestiary also writes categories describing the SOURCE rather than
 * the type: "resistance to mundane" means non-magical damage of any
 * type. Twenty Fiends & Fables creatures declare `mundane` and eleven
 * `magic`, and until this release both were parsed, matched against the
 * fourteen damage types, found wanting, and dropped in silence.
 *
 * Graham's ruling, 10 Sep 2026: mundane is "non-magical source
 * entirely" — a spell or a weapon carrying a Potency rune is magical,
 * an ordinary blade or a thrown rock is not.
 */
export const DAMAGE_CATEGORIES = Object.freeze(["mundane", "magic"]);

/**
 * Special materials a creature can be weak to (Chapter 6).
 *
 * BOTH ENDS OF THIS WERE ALREADY AUTHORED AND THE MIDDLE WAS MISSING.
 * `item-quality.mjs` gives Cold Iron and Silver an `overcomesResistance`
 * field that nothing has ever read, and 50 creatures between them
 * declare a cold iron, silver or adamantine weakness that nothing has
 * ever applied. This is the vocabulary that joins them.
 *
 * Graham's ruling, 10 Sep 2026: the material triggers the creature's
 * WEAKNESS — +50%, through the same step a damage-type weakness already
 * uses — rather than merely bypassing a resistance.
 */
export const DEFENCE_MATERIALS = Object.freeze(["cold iron", "silver", "adamantine"]);

/**
 * Words a DEFENCE FIELD may name that are not Appendix 3 traits (3.547.1).
 *
 * DELIBERATELY NOT ADDED TO `APPENDIX_TRAITS`, which is a transcription
 * of the rulebook's own appendix — putting bestiary vocabulary in there
 * would make the transcription a lie, and the next person to check it
 * against the book would find words the book does not have.
 *
 * These come from the Fiends & Fables template framework, which is where
 * a creature's defences are actually authored: `disease` on six
 * templates, `charm` on one, `precision` on one. Graham's ruling, 10 Sep
 * 2026 — add them rather than rewrite the pack's wording.
 */
export const DEFENCE_TRAITS = Object.freeze(["disease", "charm", "precision"]);

/**
 * Opaque immunity tokens — words that are not types, conditions, traits,
 * categories or materials, and mean something anyway (3.548.0).
 *
 * MOVED HERE FROM `codex-trait-rules.mjs`, WHICH HAD THEM FIRST and now
 * imports them back. It owned them because the Incorporeal and Swarm
 * traits push them into a creature's immunity set; but a GM may also
 * TYPE them into the immunities field, and until this release the two
 * halves used different vocabularies. `codexTraitImmunities` pushed the
 * token "critical" while a field entry reading "critical hits" resolved
 * to nothing — the same immunity, spelled two ways, one of them silently
 * inert on ten Fiends & Fables swarms.
 *
 * Each is a fact about the ATTACK rather than the defender, which is why
 * none of them can be a damage type: "non-magical" describes where the
 * blow came from, "critical" describes how it landed.
 */
export const IMMUNITY_TOKENS = Object.freeze({
  critical: "critical",
  precision: "precision",
  nonMagical: "non-magical",
  movementReaction: "movement-reaction"
});

export const DEFENCE_TOKENS = Object.freeze([...new Set(Object.values(IMMUNITY_TOKENS))]);

/**
 * Where the damage came from, for a resistance or weakness that turns on
 * the SHAPE of the incoming effect rather than its type (3.548.0).
 *
 * Graham's rulings, 10 Sep 2026:
 *
 *   AREA      "any damage resulting from a spell or effect with an area
 *             (such as fireball) rather than a targeted effect."
 *   TARGETED  "any attack that requires an attack roll to hit (weapon or
 *             spell)."
 *
 * These are the Swarm's printed Resistance and Weakness, and
 * `codex-trait-rules.mjs` has carried both as `appliesWhen` prose since
 * it was written, under a comment explaining they could not be applied
 * because "the defender's own data cannot answer" them. That was true
 * when it was written. It stopped being true at 3.547.0, when the damage
 * packet learned to take facts about the attack — `magical` and
 * `material` — so these two arrive through the same door.
 */
export const DEFENCE_SOURCES = Object.freeze(["area", "targeted"]);

/**
 * Words a defence field may name that this system will never enforce,
 * and prints instead (3.548.0).
 *
 * THE POINT IS THAT THEY RESOLVE. An unresolved word is reported as a
 * mistake, and "death effects" is not a mistake — it is a real immunity
 * no code can apply, because nothing in this system knows which spells
 * kill outright. Leaving it unresolved means a GM re-checking a spelling
 * that was right all along; inventing a mechanism for it means a rule
 * firing on the wrong effects.
 *
 * So it resolves, and it prints, and the printed sentence names who
 * actually enforces it. The same position Runemage's room-to-draw line
 * takes: saying an unimplemented rule out loud is what stops it looking
 * like a working one.
 */
export const PRINTED_DEFENCES = Object.freeze({
  "death effects": "Death effects — an effect that kills outright does not affect this "
    + "creature. The table decides which effects those are."
});

/**
 * "All damage" — a resistance against every type at once.
 *
 * One template (the Incorporeal one) declares it, and it is a category
 * rather than a list because writing out fourteen types would go stale
 * the day a fifteenth is added.
 */
export const ALL_DAMAGE = "all damage";

/**
 * The materials named in brackets after a resistance, which OVERCOME it.
 *
 * `resistances: "mundane (silver)"` means resistant to mundane damage,
 * which a silver weapon ignores — the reading Graham chose on 10 Sep
 * 2026, and the one `item-quality.mjs` has always implied with its
 * `overcomesResistance` field.
 *
 * ONLY A KNOWN MATERIAL COUNTS. `physical (bludgeoning)` uses the same
 * bracket shape for something else entirely — a gloss narrowing the
 * group — so a qualifier that is not a material is left to
 * `parseDefenceList` to strip as before. Guessing at every bracket would
 * turn one parser into two rules that disagree.
 *
 * @param {string} text a whole defence field
 * @returns {Set<string>} material words that bypass this field's resistance
 */
export function bypassMaterialsFor(text) {
  const out = new Set();
  const pattern = /\(([^)]*)\)/g;
  let match;
  while ((match = pattern.exec(String(text ?? "")))) {
    for (const part of match[1].split(/[,;]/).map((p) => p.trim().toLowerCase())) {
      if (DEFENCE_MATERIALS.includes(part)) out.add(part);
    }
  }
  return out;
}

/**
 * What a GM will actually type, mapped to what the system calls it.
 *
 * Condition ids are camelCase and some are spelled differently from the
 * word in play ("stunned" for Stun, "flatFooted" for Flat-Footed), so
 * requiring the internal id would make the field a trap.
 */
const ALIASES = Object.freeze({
  stun: "stunned",
  stuns: "stunned",
  // "stunning" is what fifteen creature entries actually say; `stun` and
  // `stuns` were aliased and this was not (3.547.0).
  stunning: "stunned",
  blind: "blinded",
  blindness: "blinded",
  deafen: "deafened",
  deaf: "deafened",
  dazzle: "dazzled",
  daze: "dazed",
  fright: "frightened",
  frighten: "frightened",
  sicken: "sickened",
  slow: "slowed",
  weaken: "weakened",
  confusion: "confused",
  control: "controlled",
  paralysis: "paralyzed",
  paralyse: "paralyzed",
  paralysed: "paralyzed",
  petrification: "petrified",
  "flat footed": "flatFooted",
  "flat-footed": "flatFooted",
  flatfooted: "flatFooted",
  immobilized: "immobilised",
  immobilise: "immobilised",
  "soul drain": "soulDrain",
  souldrain: "soulDrain",
  "recurring damage": "recurring",
  bleed: "bleeding",
  doom: "doomed",
  fatigue: "fatigued",
  // Damage-type spellings.
  electric: "electricity",
  lightning: "electricity",
  // Trait spellings already known to the trait parser.
  concentration: "concentrate",
  defense: "defence",

  /* ── THE BESTIARY'S LONGHAND (3.548.0) ──────────────────────────────
   *
   * Every word below already had a working mechanism somewhere in the
   * system and no way to reach it from a defence field. These are not
   * new rules; they are the spellings seventeen Fiends & Fables
   * creatures actually use for rules that were already built.
   *
   * The four Swarm words are the Codex note transcribed into the field
   * verbatim — "Immune to critical hits, precision damage, mental
   * effects and reactions provoked by movement" — and every creature
   * carrying them also declares the `swarm` trait, so the trait was
   * doing the work and the typed copy was doing nothing. Aliasing them
   * makes the two agree instead of leaving one silently inert. */
  "critical hit": IMMUNITY_TOKENS.critical,
  "critical hits": IMMUNITY_TOKENS.critical,
  criticals: IMMUNITY_TOKENS.critical,
  "critical injuries": IMMUNITY_TOKENS.critical,
  "precision damage": IMMUNITY_TOKENS.precision,
  "mental effects": "mental",
  "reaction provoked by movement": IMMUNITY_TOKENS.movementReaction,
  "reactions provoked by movement": IMMUNITY_TOKENS.movementReaction,
  "movement reactions": IMMUNITY_TOKENS.movementReaction,
  "non magical": IMMUNITY_TOKENS.nonMagical,
  nonmagical: IMMUNITY_TOKENS.nonMagical,
  // Subdual is the only nonlethal damage type in the game (config.mjs
  // flags it and nothing else), so the two words name one thing.
  nonlethal: "subdual",
  "non-lethal": "subdual",
  "non lethal": "subdual",
  // Graham, 10 Sep 2026: divine is "any damage that results from a
  // divinity spell". `divinity` is already an Appendix 3 sub-trait AND
  // one of this system's four traditions, so the word the bestiary
  // wanted was in the vocabulary the whole time under its formal name.
  divine: "divinity",
  // Area and targeted, in the shapes the templates write them.
  "area damage": "area",
  "area effect": "area",
  "area effects": "area",
  "targeted attack": "targeted",
  "targeted attacks": "targeted"
});

// The Creature Codex's traits count too. Six of its seven were in no
// vocabulary at all — including AURA, which sixteen shipped abilities
// print — so a creature declared immune or resistant to one of them was
// matching against a word this file did not know.
const TRAIT_KEYS = Object.freeze(
  new Set([...APPENDIX_TRAITS, ...APPENDIX_SUB_TRAITS, ...CODEX_TRAITS]));
const DAMAGE_KEYS = Object.freeze(new Set(Object.keys(DAMAGE_TYPES)));
const CONDITION_KEYS = Object.freeze(new Set(CONDITION_IDS));
const CONDITION_BY_LOWER = Object.freeze(
  CONDITION_IDS.reduce((map, id) => {
    map[id.toLowerCase()] = id;
    map[CONDITIONS[id].label.toLowerCase()] = id;
    return map;
  }, {})
);

/** Splits a comma-separated field into normalised, lowercase entries. */
export function parseDefenceList(text) {
  /*
   * A PARENTHETICAL IS STRIPPED BEFORE THE FIELD IS SPLIT (3.547.0),
   * because it is a gloss on the entry and may contain the separator.
   *
   * Found by measurement, 10 Sep 2026: four Fiends & Fables creatures
   * declare `resistances: "all damage (force, essence)"`, which split on
   * the comma INSIDE the brackets into two entries — "all damage (force"
   * and "essence)" — neither of which resolves to anything. Four more
   * carry "physical (bludgeoning)", which failed for the same reason
   * where the bare word "physical" resolves perfectly well.
   *
   * THIS EXACT REPAIR ALREADY EXISTS ONE DIRECTORY AWAY. `parseRunes`
   * strips `\s*\([^)]*\)` before ITS split, under a comment recording
   * the identical failure: "Potency I, Spell Effect (Fireball, 3/day)"
   * split into three entries, one a phantom rune called "3/day)". The
   * fields are different; the mistake is the same one, and the second
   * copy of it went unnoticed because nothing reported an entry that
   * matched nothing.
   */
  return String(text ?? "")
    .replace(/\s*\([^)]*\)/g, "")
    .split(/[,;]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Resolve one written entry into every vocabulary it belongs to.
 *
 * @param {string} entry
 * @returns {{damageTypes: string[], conditions: string[], traits: string[], matched: boolean}}
 */
/**
 * "all damage except essence or force" — a resistance naming its own
 * exceptions (3.548.0).
 *
 * ONE CREATURE WRITES IT LONGHAND (the Human Ghost) and the Incorporeal
 * codex trait states the same rule with a different exception list —
 * force alone. Graham's ruling, 10 Sep 2026: support the longhand, so a
 * record may name its own exceptions and the codex default stays
 * force-only. The alternative was to correct the ghost, which would have
 * made this shape unwriteable for the next creature that needs it.
 *
 * Written as its own parser rather than a special case inside
 * `classifyDefence`, because "except" can only ever follow "all damage":
 * "fire except cold" is not a rule anyone can state.
 */
const ALL_DAMAGE_EXCEPT = /^all damage,?\s+except\s+(.+)$/;

/**
 * A trailing number on an entry — "physical 5", "fire 5" (3.548.0).
 *
 * THE SHEET'S OWN PLACEHOLDER INVITES THIS. It reads "Fire 5, physical 2",
 * and Chapter 7 resistance HALVES rather than subtracting a number, so
 * the value has never meant anything and the placeholder has been asking
 * for it since the field was added. Verdant Muck writes both.
 *
 * Graham's ruling, 10 Sep 2026: strip the number so the word behind it
 * resolves, and report the number as ignored — a GM who types one is
 * told it does nothing, rather than getting a resistance that silently
 * fails to appear.
 */
const TRAILING_VALUE = /^(.*?)[\s-]+(\d+)$/;

export function classifyDefence(entry) {
  const rawInput = String(entry ?? "").trim().toLowerCase();

  // The value is stripped BEFORE the alias lookup, so "precision damage 5"
  // resolves exactly as "precision damage" does.
  const valued = TRAILING_VALUE.exec(rawInput);
  const raw = valued ? valued[1].trim() : rawInput;
  const ignoredValue = valued ? Number(valued[2]) : null;

  const exceptMatch = ALL_DAMAGE_EXCEPT.exec(raw);
  if (exceptMatch) {
    const except = [];
    for (const word of exceptMatch[1].split(/\s*(?:,|;|\bor\b|\band\b)\s*/)) {
      const key = String(word ?? "").trim().toLowerCase();
      if (!key) continue;
      const inner = classifyDefence(key);
      if (inner.damageTypes.length) except.push(...inner.damageTypes);
    }
    return {
      damageTypes: [], conditions: [], traits: [],
      categories: [ALL_DAMAGE], materials: [], tokens: [], sources: [],
      printed: [], except: [...new Set(except)], ignoredValue,
      // A named exception nothing recognises would silently widen the
      // resistance back to everything, so it is a mistake like any other.
      matched: except.length > 0
    };
  }

  const word = ALIASES[raw] ?? raw;
  const lower = word.toLowerCase();

  const damageTypes = [];
  const conditions = [];
  const traits = [];

  if (DAMAGE_TYPE_GROUPS[lower]) damageTypes.push(...DAMAGE_TYPE_GROUPS[lower]);
  if (DAMAGE_KEYS.has(lower)) damageTypes.push(lower);

  // Categories and materials describe the SOURCE, not the type, so they
  // get their own buckets rather than being forced into damageTypes
  // where every consumer would have to know they are not really types.
  const categories = [];
  const materials = [];
  const tokens = [];
  const sources = [];
  const printed = [];
  if (DAMAGE_CATEGORIES.includes(lower)) categories.push(lower);
  if (lower === ALL_DAMAGE) categories.push(ALL_DAMAGE);
  if (DEFENCE_MATERIALS.includes(lower)) materials.push(lower);
  if (DEFENCE_TRAITS.includes(lower)) traits.push(lower);
  if (DEFENCE_TOKENS.includes(lower)) tokens.push(lower);
  if (DEFENCE_SOURCES.includes(lower)) sources.push(lower);
  if (PRINTED_DEFENCES[lower]) printed.push(lower);

  const conditionId = CONDITION_KEYS.has(word) ? word : CONDITION_BY_LOWER[lower];
  if (conditionId) conditions.push(conditionId);

  // Module-registered traits (3.560.0) join the vocabulary — Pillars of
  // Faith's Haunt, Spirit and Unliving are the first.
  if (TRAIT_KEYS.has(lower) || registeredTraits().includes(lower)) traits.push(lower);

  return {
    damageTypes,
    conditions,
    traits,
    categories,
    materials,
    tokens,
    sources,
    printed,
    except: [],
    ignoredValue,
    matched: Boolean(damageTypes.length || conditions.length || traits.length
      || categories.length || materials.length || tokens.length
      || sources.length || printed.length)
  };
}

/**
 * Resolve a whole written field.
 *
 * @param {string} text
 * @returns {{damageTypes: Set<string>, conditions: Set<string>, traits: Set<string>,
 *            entries: object[], unresolved: string[]}}
 */
export function resolveDefenceField(text) {
  const damageTypes = new Set();
  const conditions = new Set();
  const traits = new Set();
  const categories = new Set();
  const materials = new Set();
  const tokens = new Set();
  const sources = new Set();
  const except = new Set();
  const printed = [];
  const entries = [];
  const unresolved = [];
  const ignoredValues = [];

  for (const entry of parseDefenceList(text)) {
    const classified = classifyDefence(entry);
    entries.push({ entry, ...classified });
    if (classified.ignoredValue !== null && classified.ignoredValue !== undefined) {
      ignoredValues.push({ entry, value: classified.ignoredValue });
    }
    if (!classified.matched) {
      unresolved.push(entry);
      continue;
    }
    classified.damageTypes.forEach((key) => damageTypes.add(key));
    classified.conditions.forEach((key) => conditions.add(key));
    classified.traits.forEach((key) => traits.add(key));
    (classified.categories ?? []).forEach((key) => categories.add(key));
    (classified.materials ?? []).forEach((key) => materials.add(key));
    (classified.tokens ?? []).forEach((key) => tokens.add(key));
    (classified.sources ?? []).forEach((key) => sources.add(key));
    (classified.except ?? []).forEach((key) => except.add(key));
    for (const key of classified.printed ?? []) {
      if (!printed.includes(PRINTED_DEFENCES[key])) printed.push(PRINTED_DEFENCES[key]);
    }
  }

  return {
    damageTypes, conditions, traits, categories, materials,
    tokens, sources, except, printed, entries, unresolved, ignoredValues
  };
}

/**
 * Everything an actor is immune to: what a GM typed, plus what the
 * creature is.
 *
 * Derived immunities are merged here rather than written into the field,
 * so the sheet keeps showing what was actually entered and a derived
 * immunity can never be edited away by accident.
 *
 * @param {object} actorSystem
 * @param {{damageTypes?: string[], conditions?: string[], traits?: string[]}} [derived]
 */
export function resolveImmunities(actorSystem, derived = {}) {
  const resolved = resolveDefenceField(actorSystem?.combat?.immunities);
  /*
   * A TYPED TOKEN JOINS THE SAME SET THE TRAIT PUSHES ITS INTO (3.548.0).
   *
   * `codexTraitImmunities` delivers "critical", "precision",
   * "non-magical" and "movement-reaction" through `derived.damageTypes`,
   * and every consumer reads them off `immunities`. A GM typing the same
   * word into the field must land in the same place, or the Ooze whose
   * immunity is typed and the Swarm whose immunity is inherited behave
   * differently while reading identically.
   */
  for (const token of resolved.tokens ?? []) resolved.damageTypes.add(token);
  for (const key of derived.damageTypes ?? []) resolved.damageTypes.add(key);
  for (const key of derived.conditions ?? []) resolved.conditions.add(key);
  for (const key of derived.traits ?? []) resolved.traits.add(key);
  return resolved;
}

/**
 * Resistance and Weakness are damage-only: halving a condition is not a
 * thing, and Chapter 7's worked example is explicit that resistance
 * halves rather than subtracting a number. Groups are honoured here too,
 * so "physical" resists all four physical types.
 */
export function resolveDamageTypeField(text) {
  const resolved = resolveDefenceField(text);
  // An entry that resolved, but not as a damage type, is dropped here —
  // "stun" in the resistances field cannot mean anything, since there is
  // no such thing as halving a condition. Reported alongside the entries
  // that matched nothing at all, so neither kind is silent.
  // A CATEGORY OR A MATERIAL IS APPLICABLE HERE, unlike a condition:
  // "mundane" in the resistances field means something (halve damage
  // from a non-magical source) and "cold iron" in the weaknesses field
  // means something (+50% from that material), so neither is reported as
  // a mistake the way "stun" in a resistance field still is.
  // A SOURCE, A TOKEN OR A TRAIT IS APPLICABLE HERE TOO (3.548.0), for
  // the same reason a category is: each describes the incoming effect
  // rather than the defender. "Resistance to targeted attacks" and
  // "Weakness to divinity" are both rules a creature can have; "stun" in
  // a resistance field still is not, because halving a condition is not
  // a thing. Conditions remain the one kind reported as a mistake.
  const applicable = (entry) => entry.damageTypes.length
    || (entry.categories ?? []).length || (entry.materials ?? []).length
    || (entry.tokens ?? []).length || (entry.sources ?? []).length
    || (entry.traits ?? []).length;
  const inapplicable = resolved.entries
    .filter((entry) => entry.matched && !applicable(entry))
    .map((entry) => entry.entry);
  return {
    damageTypes: resolved.damageTypes,
    categories: resolved.categories,
    materials: resolved.materials,
    tokens: resolved.tokens,
    sources: resolved.sources,
    traits: resolved.traits,
    except: resolved.except,
    printed: resolved.printed,
    ignoredValues: resolved.ignoredValues,
    unresolved: [...resolved.unresolved, ...inapplicable]
  };
}

/** Whether a condition id is immune. */
export function coversCondition(set, conditionId) {
  if (!set || !conditionId) return false;
  const collection = set instanceof Set ? set : new Set(set);
  if (collection.has(conditionId)) return true;
  // Tolerate a caller passing a label or an alias rather than the id.
  const resolved = classifyDefence(conditionId).conditions[0];
  return Boolean(resolved && collection.has(resolved));
}

/**
 * Whether any trait on a subject is immune.
 *
 * @param {Set<string>|string[]} set Immune traits.
 * @param {string[]} traits The subject's own traits, already normalised.
 * @returns {string|null} The trait that granted the immunity, for reporting.
 */
export function immuneTrait(set, traits = []) {
  if (!set) return null;
  const collection = set instanceof Set ? set : new Set(set);
  for (const trait of traits) {
    const key = String(trait ?? "").trim().toLowerCase();
    if (key && collection.has(key)) return key;
  }
  return null;
}

/**
 * A human-readable account of what a written field resolved into, for
 * the sheet. An entry that matched nothing says so.
 */
export function describeDefenceField(text) {
  return resolveDefenceField(text).entries.map((entry) => {
    const parts = [];
    if (entry.damageTypes.length) parts.push("damage");
    if (entry.conditions.length) parts.push("condition");
    if (entry.traits.length) parts.push("trait");
    return {
      entry: entry.entry,
      matched: entry.matched,
      applies: parts,
      summary: entry.matched ? parts.join(" + ") : "not recognised"
    };
  });
}
