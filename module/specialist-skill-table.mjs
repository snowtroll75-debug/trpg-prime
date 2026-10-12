/**
 * The Specialist Skill Table (Core 3.1, Chapter 4 — Specialist Skills).
 *
 * Thirty-three named skills with their printed governing ability. The
 * chapter prints them as a table and then says, in as many words, that
 * the list is "by far from comprehensive" and that GMs should invent
 * their own.
 *
 * SO THIS IS A SEED, NOT A SCHEMA. Nothing here constrains what a
 * specialist skill may be; picking a row only fills in a label and an
 * ability that the player would otherwise have to look up in the book.
 * Free text remains the primary route and the picker offers it first.
 *
 * The ability matters more than the label. A new specialist skill
 * defaults to Intelligence, and FIFTEEN OF THE THIRTY-THREE ARE NOT
 * INTELLIGENCE — Hunting is Dexterity, Labourer and Mining are Strength,
 * eight are Wisdom and four are Charisma. A GM granting Hunting from a
 * background and not noticing the default is how a ranger ends up
 * tracking off their Intelligence.
 *
 * Pure and Foundry-free; the dialog lives in
 * specialist-skill-table-workflow.mjs.
 */

/** @typedef {{label:string, ability:string, description:string}} SpecialistSkillRow */

/** The thirty-three printed rows, in the chapter's own order. */
export const SPECIALIST_SKILL_TABLE = Object.freeze([
  Object.freeze({ label: "Animal Lore", ability: "wisdom", description: "Knowledgeable about animal behaviour, habitats, and care." }),
  Object.freeze({ label: "Archaeology", ability: "intelligence", description: "Skilled in uncovering and studying ancient artifacts and ruins." }),
  Object.freeze({ label: "Arena Lore", ability: "intelligence", description: "Knowledge of the history, rules, and traditions of gladiatorial combat." }),
  Object.freeze({ label: "Barkeeping", ability: "charisma", description: "Expert in bartending, customer service, and managing a bar." }),
  Object.freeze({ label: "Bureaucracy", ability: "intelligence", description: "Skilled in navigating complex administrative and governmental systems." }),
  Object.freeze({ label: "Circus Lore", ability: "intelligence", description: "Expertise in the traditions, performances, and inner workings of traveling circuses, including acrobatics, showmanship, and carnival culture." }),
  Object.freeze({ label: "Combat Styles", ability: "wisdom", description: "Understanding of various fighting techniques and combat disciplines." }),
  Object.freeze({ label: "Creature Lore", ability: "intelligence", description: "Expertise in identifying, a specific creature type, their habits, strengths, and weaknesses." }),
  Object.freeze({ label: "Culinary Lore", ability: "intelligence", description: "Knowledge of foods, drinks and other culinary details." }),
  Object.freeze({ label: "Deity Lore", ability: "intelligence", description: "Knowledge of a specific deity and its religious customs." }),
  Object.freeze({ label: "Etiquette", ability: "charisma", description: "Knowledgeable about proper social behaviour and customs in various cultures." }),
  Object.freeze({ label: "Farmer", ability: "wisdom", description: "Proficiency in cultivating crops, tending livestock, and understanding agricultural practices and rural living." }),
  Object.freeze({ label: "Fortune Telling", ability: "wisdom", description: "The ability to interpret omens, read cards, or use other divinatory tools to predict possible futures or uncover hidden truths." }),
  Object.freeze({ label: "Gambling", ability: "charisma", description: "Skilled in games of chance and calculating odds." }),
  Object.freeze({ label: "Heraldry", ability: "intelligence", description: "Identifying and interpreting coats of arms, emblems, and symbols to discern noble lineages, affiliations, and historical significance." }),
  Object.freeze({ label: "Herb Lore", ability: "intelligence", description: "Identifying, harvesting, and utilizing plants and herbs for medicinal, culinary, and alchemical purposes." }),
  Object.freeze({ label: "Hunting", ability: "dexterity", description: "Proficient in tracking and capturing or killing game." }),
  Object.freeze({ label: "Labourer", ability: "strength", description: "Experienced in performing heavy physical work and manual labour." }),
  Object.freeze({ label: "Law Enforcement", ability: "wisdom", description: "Skilled in policing techniques and maintaining public order." }),
  Object.freeze({ label: "Legal Lore", ability: "intelligence", description: "Knowledgeable about legal systems, procedures, and laws." }),
  Object.freeze({ label: "Logistics", ability: "intelligence", description: "Expert in planning and managing the efficient movement of goods and services." }),
  Object.freeze({ label: "Mining", ability: "strength", description: "Skilled in extracting minerals and resources from the earth or asteroids." }),
  Object.freeze({ label: "Racial Lore", ability: "intelligence", description: "Knowledgeable about a certain race or society." }),
  Object.freeze({ label: "Sailing", ability: "wisdom", description: "Navigating and managing watercraft, including handling sails, steering, and understanding maritime conditions." }),
  Object.freeze({ label: "Spell Lore", ability: "intelligence", description: "Knowledge of magical spells, their origins, effects, and intricate workings, enabling deeper understanding and mastery of arcane or divine incantations." }),
  Object.freeze({ label: "Stone Lore", ability: "intelligence", description: "The specialized knowledge of stones, minerals, and geological formations, including their properties, uses, and significance in crafting, construction, and magical applications." }),
  Object.freeze({ label: "Terrain Lore", ability: "wisdom", description: "Expertise in navigating, surviving, and understanding the unique features, hazards, and resources of a specific terrain type, such as forests, deserts, mountains, or swamps." }),
  Object.freeze({ label: "Theology", ability: "intelligence", description: "Deep knowledge of religious doctrines, practices, and deities, enabling understanding of faiths, rituals, and divine philosophies." }),
  Object.freeze({ label: "Trading", ability: "charisma", description: "Proficient in buying, selling, and bartering goods and services." }),
  Object.freeze({ label: "Undead Lore", ability: "intelligence", description: "Specialized knowledge of undead creatures, their origins, weaknesses, and behaviours, aiding in identification and strategies for confronting them." }),
  Object.freeze({ label: "Underworld", ability: "wisdom", description: "Knowledgeable about criminal activities and the black market." }),
  Object.freeze({ label: "Urban Lore", ability: "intelligence", description: "Expert in the history, culture, and secrets of cities and urban environments." }),
  Object.freeze({ label: "Warfare", ability: "intelligence", description: "Skilled in large-scale military operations and combat." })
]);

/** The key the picker uses for "not from the table". */
export const SPECIALIST_CUSTOM_KEY = "__custom__";

/**
 * A row by its printed label, case-insensitively.
 *
 * @param {string} label
 * @returns {SpecialistSkillRow|null}
 */
export function specialistSkillRow(label) {
  const wanted = String(label ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return (
    SPECIALIST_SKILL_TABLE.find((row) => row.label.toLowerCase() === wanted) ?? null
  );
}


/* ==================================================================== *
 * INVOKING AN ACTION THROUGH A SPECIALIST SKILL
 *
 * GRAHAM'S AMENDMENT, 16 September 2026, to Identify Power (page 70):
 *
 *   "Using either Arcana, Nature, Occultism, Religion OR AN APPROPRIATE
 *    SPECIALIST SKILL, you can attempt to identify power in an item,
 *    location, or effect."
 *
 * The printed tradition-to-skill table stays — it is the ordinary route.
 * This is the second one, and it needed a channel because the two live in
 * different places on the actor: the sixteen skills are `system.skills`,
 * and a specialist skill is `system.specialistSkills`, granted by a
 * background rather than bought with ranks.
 *
 * A PREFIXED KEY, NOT A SECOND PARAMETER. `invokedSkillKey` is already
 * threaded through the whole action workflow and read in nine places; a
 * parallel `invokedSpecialistKey` would have to be carried past every one
 * of them and would be dropped by the first that forgot. A prefix rides
 * the existing channel, and the three places that must tell the two apart
 * ask here rather than matching on a string shape of their own.
 * ==================================================================== */

/** What marks an invoked key as naming a SPECIALIST skill. */
const SPECIALIST_PREFIX = "specialist:";

/** Build the invoked key for a specialist skill. */
export function specialistInvokedKey(key) {
  const bare = String(key ?? "").trim();
  return bare ? `${SPECIALIST_PREFIX}${bare}` : "";
}

/**
 * Read an invoked key back.
 *
 * @param {string} invokedKey
 * @returns {{specialist: boolean, key: string}} `key` is the BARE key
 *   either way, so a caller that only wants the subject of the check —
 *   for conditional matching, say — can use it without asking which
 *   kind it is. A conditional scoped to "arcana" must NOT match a
 *   Herb Lore roll, and one scoped to "herbLore" must.
 */
export function readInvokedSkillKey(invokedKey) {
  const raw = String(invokedKey ?? "").trim();
  if (!raw.startsWith(SPECIALIST_PREFIX)) return { specialist: false, key: raw };
  return { specialist: true, key: raw.slice(SPECIALIST_PREFIX.length) };
}

/**
 * The actions that may be attempted through a specialist skill: those
 * declaring `specialistSkills: true` in the action tables.
 *
 * DECLARED ON THE ACTION, so the next one the book opens up needs no
 * change here — the same reasoning `requiresFeat` and `untrainedActions`
 * already use.
 */
export function specialistSkillActions(actions = []) {
  return (Array.isArray(actions) ? actions : []).filter((a) => a?.specialistSkills === true);
}
