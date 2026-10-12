/**
 * Appendix 4's rules about WHO a divine aspect belongs to and what it
 * lets them learn — pure, so the harness can run every case without a
 * Foundry actor (3.623.0, block 40, Graham's rulings R1–R10 of 6 October
 * 2026).
 *
 * divine-aspect.mjs answers "what does an aspect do to a character";
 * this module answers the questions around it:
 *
 *   - which specialist spells a character may LEARN (R2, R3, R8);
 *   - who must hold an aspect (R4) and how many (R5);
 *   - which ethics an aspect leaves open (R6);
 *   - which bonus spells a level drop takes away (R7).
 *
 * R1 (Chapter 3 over Appendix 4 for the Crusader) needs no code: the
 * class skill, the bonus spells and the 1st-level pick were already
 * handed to whoever holds the aspect, which is what Chapter 3 prints for
 * the Crusader and what the Champion inherits as "the Crusader deity
 * trait".
 */

/** A spell name as the three sources can all agree on it. */
function spellKey(value) {
  return String(value ?? "").replace(/[’‘']/g, "").trim().toLowerCase();
}

const list = (value) => (Array.isArray(value) ? value : String(value ?? "").split(","))
  .map((entry) => String(entry ?? "").trim())
  .filter(Boolean);

const lowerSet = (values) => new Set(Array.from(values ?? []).map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean));

/**
 * A character's effective classes, lower-cased: the class item plus every
 * class list an owned archetype opens (feats.mjs's effectiveClasses, passed
 * in so this module stays free of the registry).
 */
export function effectiveClassKeys(items = [], effectiveClasses = (c) => c) {
  const own = Array.from(items ?? []);
  const archetypes = own
    .filter((i) => i?.type === "feat" && i.system?.category === "Archetype")
    .map((i) => i.name);
  const className = own.find((i) => i?.type === "class")?.name ?? "";
  return String(effectiveClasses(className, archetypes) ?? "")
    .split(/,\s*/).map((n) => n.trim().toLowerCase()).filter(Boolean);
}

/**
 * The specialist spells the given aspects list, as keys.
 *
 * @param {object[]} aspects divine-aspect items (or index entries)
 * @returns {Set<string>}
 */
export function aspectSpellKeys(aspects = []) {
  const out = new Set();
  for (const aspect of Array.from(aspects ?? [])) {
    for (const name of list(aspect?.system?.specialistSpells)) out.add(spellKey(name));
  }
  return out;
}

/**
 * MAY THIS CHARACTER LEARN THIS SPECIALIST SPELL? (R2, the Specialist
 * Spell feat; R8, the Add Spell picker.)
 *
 * - **An aspect's spell** (any aspect in the world lists it) is open to a
 *   character whose own aspect lists it — whatever the spell's class tag
 *   says, which is how a Crusader reaches its aspect's spells and how
 *   Murder's Veiled Secret, tagged Wizard, stays Murder's. Otherwise only
 *   through ANOTHER class's tag: Nature's Bounty is tagged "Cleric,
 *   Druid", and a Druid keeps it, while a Cleric of Dawn does not reach
 *   it through the word "Cleric".
 * - **A Cleric specialist spell no aspect lists** (Bless Water,
 *   Reincarnated Embrace, Moment of Fortune, Dissipate into Mist) is
 *   open to anyone holding an aspect: Chapter 3's Crusader "may learn
 *   additional Cleric Specialist Spells".
 * - **Anything else** follows its class tag, as it always has.
 *
 * @param {object} p
 * @param {string} p.spellName
 * @param {string} p.specialistClass the spell's class tag ("Cleric, Druid")
 * @param {Iterable<string>} p.myClasses the character's effective classes
 * @param {Set<string>} p.myAspectKeys aspectSpellKeys(their aspects)
 * @param {Set<string>} p.allAspectKeys aspectSpellKeys(every aspect)
 * @param {boolean} p.holdsAspect
 */
export function specialistSpellAccess({
  spellName, specialistClass, myClasses = [], myAspectKeys = new Set(), allAspectKeys = new Set(), holdsAspect = false
} = {}) {
  const key = spellKey(spellName);
  const tags = list(specialistClass).map((t) => t.toLowerCase());
  const mine = lowerSet(myClasses);
  if (allAspectKeys.has(key)) {
    if (myAspectKeys.has(key)) return true;
    return tags.some((tag) => tag !== "cleric" && mine.has(tag));
  }
  if (holdsAspect && tags.includes("cleric")) return true;
  return tags.some((tag) => mine.has(tag));
}

/**
 * CLOISTERED PRIEST'S "appropriate Cleric Specialist Spell" (R3): the
 * Cleric half of the R2 list — their own aspect's spells, and the Cleric
 * specialist spells no aspect lists. Another aspect's are not
 * appropriate.
 */
export function clericSpecialistAccess({
  spellName, specialistClass, myAspectKeys = new Set(), allAspectKeys = new Set()
} = {}) {
  const key = spellKey(spellName);
  if (allAspectKeys.has(key)) return myAspectKeys.has(key);
  return list(specialistClass).some((tag) => tag.toLowerCase() === "cleric");
}

/**
 * THE ADD SPELL PICKER (R8). An ordinary spell is untouched. A specialist
 * spell is hidden when the character cannot learn it — another class's,
 * another aspect's. A specialist spell that names no class and no aspect
 * lists is left alone: nothing says whose it is.
 */
export function pickerSpecialistAllowed(entry, access = {}) {
  if (!entry?.system?.specialist) return true;
  const key = spellKey(entry?.name);
  const tagged = list(entry?.system?.specialistClass).length > 0;
  if (!tagged && !(access.allAspectKeys ?? new Set()).has(key)) return true;
  return specialistSpellAccess({
    ...access,
    spellName: entry?.name,
    specialistClass: entry?.system?.specialistClass
  });
}

/**
 * WHO MUST HOLD AN ASPECT (R4). "Any PC or NPC that utilises the
 * Divinity Tradition to cast spells must select a Divine Aspect."
 *
 * The sources, by name, so the banner can say why:
 *   - a class that needs one (Cleric, Crusader, or a registered class
 *     that declares it), or any caster class of the divinity tradition;
 *   - Divine Knight (a divinity PP 2 spell);
 *   - the Priest archetype (divinity cantrips);
 *   - the Champion archetype ("the Crusader deity trait");
 *   - the Cloistered Priest archetype (a Cleric Specialist Spell).
 */
const DIVINITY_FEATS = Object.freeze(["divine knight"]);
const DIVINITY_ARCHETYPES = Object.freeze(["priest", "champion", "cloistered priest"]);

export function divinityCasterSources({
  className = "", classTradition = "", classCasterStyle = "", classNeedsAspect = false,
  classDeclinesAspect = false,
  featNames = [], archetypeNames = []
} = {}) {
  const out = [];
  const cls = String(className ?? "").trim();
  // A CLASS THAT DECLINES (3.625.0): a registered class whose book says
  // it needs no aspect is not inferred into one by its tradition. An
  // explicit need still wins over a decline, because a need is a
  // statement and a decline is the absence of one.
  if (cls && (classNeedsAspect
    || (!classDeclinesAspect && String(classTradition ?? "").trim().toLowerCase() === "divinity" && String(classCasterStyle ?? "").trim()))) {
    out.push(cls);
  }
  const named = (names, wanted) => Array.from(names ?? [])
    .map((n) => String(n ?? "").trim())
    .filter((n) => wanted.includes(n.toLowerCase()));
  for (const name of named(featNames, DIVINITY_FEATS)) if (!out.includes(name)) out.push(name);
  for (const name of named(archetypeNames, DIVINITY_ARCHETYPES)) if (!out.includes(name)) out.push(name);
  return out;
}

/** The banner's text while a divinity caster holds no aspect; null otherwise. */
export function aspectMissingWarning(sources = [], aspectCount = 0) {
  if (!sources.length || aspectCount > 0) return null;
  return `${sources.join(", ")} draws on the Divinity tradition, which requires a Divine Aspect (Appendix 4). ` +
    "Add one from Foundations.";
}

/**
 * ONE ASPECT AT A TIME (R5). The refusal message when another is already
 * held, or null. A migration or repair tool declares itself with
 * `trgAllowSecondAspect` rather than being guessed at.
 */
export function secondAspectRefusal(existing = [], actorName = "This character", options = {}) {
  if (options?.trgAllowSecondAspect) return null;
  const held = Array.from(existing ?? []);
  if (!held.length) return null;
  return `${actorName} already holds a Divine Aspect: ${held.map((i) => i?.name).join(", ")}. ` +
    "A character selects one — remove it first.";
}

/** An aspect's suggested ethics, as printed labels. */
function aspectSuggestedEthics(aspect) {
  const flagged = aspect?.flags?.["trg-prime"]?.suggestedEthics;
  if (Array.isArray(flagged) && flagged.length) return list(flagged);
  return list(aspect?.system?.suggestedEthics);
}

/**
 * THE ETHICS DROPDOWN (R6). "A cleric, crusader or other divinity caster
 * must select one of these ethics."
 *
 * While an aspect is held, the choices are its ethics. An ethic already
 * chosen outside them stays on offer, labelled, with a warning — nothing
 * on the sheet changes by itself. An aspect whose ethics name nothing in
 * the list restricts nothing.
 *
 * @param {object} ethics config.mjs ETHICS ({key: {label}})
 * @param {object[]} aspects
 * @param {string} current the stored key
 * @returns {{choices: object, restricted: boolean, offList: string|null}}
 */
export function aspectEthicsChoices(ethics = {}, aspects = [], current = "") {
  const all = { "": "—", ...Object.fromEntries(Object.entries(ethics).map(([k, e]) => [k, e.label])) };
  const byLabel = new Map(Object.entries(ethics).map(([k, e]) => [String(e.label).toLowerCase(), k]));
  const keys = [];
  for (const aspect of Array.from(aspects ?? [])) {
    for (const label of aspectSuggestedEthics(aspect)) {
      const key = byLabel.get(label.toLowerCase());
      if (key && !keys.includes(key)) keys.push(key);
    }
  }
  if (!keys.length) return { choices: all, restricted: false, offList: null };
  const choices = { "": "—" };
  for (const key of keys) choices[key] = ethics[key].label;
  let offList = null;
  if (current && !keys.includes(current) && ethics[current]) {
    offList = ethics[current].label;
    choices[current] = `${offList} (not your aspect's)`;
  }
  return { choices, restricted: true, offList };
}

/**
 * BONUS SPELLS ABOVE THE CHARACTER'S LEVEL (R7). "Each bonus spell is
 * automatically learnt by a cleric at the level indicated" — so a level
 * drop takes back the ones above it.
 *
 * Only spells the aspect itself granted from its bonus list: stamped
 * `grantedBy` with the aspect's id and requested under a bonus-list name.
 * The aspect's chosen specialist spell (also stamped) is never touched.
 *
 * @param {object} p
 * @param {{id: string, entries: {level: number, name: string}[]}} p.aspect
 * @param {object[]} p.spells [{id, grantedBy, specialistPick}]
 * @param {number} p.level
 * @returns {string[]} spell item ids to remove
 */
export function bonusSpellsAboveLevel({ aspect, spells = [], level = 1 } = {}) {
  const lvl = Number(level) || 1;
  const above = new Set((aspect?.entries ?? [])
    .filter((e) => Number(e.level) > lvl)
    .map((e) => spellKey(e.name)));
  if (!above.size) return [];
  return Array.from(spells ?? [])
    .filter((s) => !s.specialistPick
      && s.grantedBy?.sourceId === aspect.id
      && above.has(spellKey(s.grantedBy?.requested)))
    .map((s) => s.id);
}
