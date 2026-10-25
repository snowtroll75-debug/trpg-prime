/**
 * Which skills are CLASS skills, and who says so.
 *
 * "Your class will have a number of skills which gain a special bonus
 * type called a class bonus. Your class bonus is determined by your class
 * level." (Chapter 3.) Until 3.204.0 that was a number you typed into the
 * skill's Class column by hand, and the class item — which prints the
 * list — had no way to say it.
 *
 * The awkward part is that the Class column was doing two jobs at once.
 * "This skill gets my class bonus" is a yes/no that several things can
 * assert; "+2 class bonus to Nature, Perception, Stealth and Survival"
 * (Favoured Terrain) is a flat typed bonus that lands in the same slot.
 * They do not behave the same way, so they are two things now: a
 * `classSkill` tickbox per skill, and the ordinary bonus slot left
 * untouched for everything else.
 *
 * THE STACKING RULE. Appendix 1 gives class bonuses "stack" — but the
 * rule is "stack when gained from DIFFERENT sources", and a character
 * cannot gain a class bonus from the same source twice. So this module
 * collects the sources that call a skill a class skill, dedupes them by
 * source, and contributes one class bonus each. Your class is one source.
 * An archetype that makes a skill a class skill is another. Ticking it
 * yourself is a third. The same class cannot be two of them.
 *
 * Pure, so the harness can run every combination without an actor.
 */

const SYSTEM_ID = "trg-prime";

/**
 * Archetype feats — and Exceptional Training, which is the same shape —
 * that make a CHOSEN skill a class skill. `options` limits the chooser
 * ("any" = every skill).
 *
 * Moved here from feats-workflow.mjs in 3.204.0. It is pure data, the
 * derivation reads it on every prepare, and importing the feat workflow
 * into the actor document to reach it would have dragged the dialog
 * layer into every actor's prepare cycle. feats-workflow re-exports it,
 * so nothing that already imported it from there had to change.
 *
 * The `name` is the feat that must still be ON the sheet for the grant to
 * count. That is the whole reversal mechanism now: the bonus is derived,
 * so removing the feat removes it, with nothing to true up and nothing
 * to unwind.
 */
export const CLASS_SKILL_GRANTS = [
  // Exceptional Training (Human) is the entry the others were
  // generalised FROM, and it belongs in this list for the same reason:
  // the derive reads this table, so a grant missing from it contributes
  // nothing. Left out at first, it became a feat that quietly deleted
  // itself — reconcile took back the number it had written and nothing
  // put a bonus in its place.
  { name: "exceptional training", flag: "exceptionalTraining", label: "Exceptional Training", options: "any" },
  { name: "adventurer", flag: "adventurerClassSkill", label: "Adventurer", options: "any" },
  { name: "alchemist", flag: "alchemistClassSkill", label: "Alchemist", options: ["crafting"] },
  { name: "animist", flag: "animistClassSkill", label: "Animist", options: ["handleAnimal", "meditation", "nature", "survival"] },
  { name: "arcanist", flag: "arcanistClassSkill", label: "Arcanist", options: ["arcana", "linguistics", "planes", "powerManipulation"] },
  { name: "artificer", flag: "artificerClassSkill", label: "Artificer", options: ["crafting"] },
  { name: "champion", flag: "championClassSkill", label: "Champion", options: ["diplomacy", "intimidate", "religion", "senseMotive"] },
  { name: "gleeman", flag: "gleemanClassSkill", label: "Gleeman", options: ["artistry", "culture", "occultism", "perform"] },
  { name: "priest", flag: "priestClassSkill", label: "Priest", options: ["culture", "medicine", "planes", "religion"] },
  { name: "thief", flag: "thiefClassSkill", label: "Thief", options: ["acrobatics", "deception", "stealth", "thievery"] },
  { name: "warden", flag: "wardenClassSkill", label: "Warden", options: ["handleAnimal", "nature", "stealth", "survival"] },
  { name: "warrior", flag: "warriorClassSkill", label: "Warrior", options: ["athletics", "climbing", "handleAnimal", "intimidate"] }
];

/** Comma-separated printed skill names → the keys the sheet uses. */
export function skillKeyFromName(name, skills = {}) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return null;
  for (const [key, skill] of Object.entries(skills)) {
    if (String(skill?.label ?? "").trim().toLowerCase() === wanted) return key;
    if (key.toLowerCase() === wanted) return key;
    // "Handle Animal" → handleAnimal, "Power Manipulation" →
    // powerManipulation: the printed name with its spaces closed up.
    if (key.toLowerCase() === wanted.replace(/[^a-z]/g, "")) return key;
  }
  return null;
}

/**
 * Every source calling each skill a class skill.
 *
 * @param {object} options
 * @param {object} options.skills The actor's prepared skills.
 * @param {object|null} options.classItem
 * @param {object} options.flags The actor's trg-prime flags.
 * @param {Array<{name: string, flag: string, label: string}>} options.grants
 *   CLASS_SKILL_GRANTS, passed in rather than imported so this module
 *   stays free of the feat workflow (which pulls in half of Foundry).
 * @param {Set<string>} options.ownedFeatNames Lower-cased feat names, for
 *   deciding whether a grant's feat is still on the sheet.
 * @param {Array<object>} options.aspects The divine-aspect items on the
 *   sheet. Each names one Class Skill in Appendix 4.
 * @param {Array<object>} options.schools The wizard-school items. Each
 *   grants one additional class skill.
 * @returns {Map<string, Array<{id: string, label: string}>>} skill key →
 *   the sources, deduped by id.
 */
export function classSkillSources({
  skills = {},
  classItem = null,
  flags = {},
  grants = [],
  ownedFeatNames = new Set(),
  aspects = [],
  schools = [],
  declared = []
} = {}) {
  const found = new Map();
  const add = (key, id, label) => {
    if (!key || !skills[key]) return;
    if (!found.has(key)) found.set(key, []);
    const list = found.get(key);
    // Deduped by SOURCE ID. Two entries with the same id are the same
    // source saying the same thing twice, and a character cannot gain a
    // class bonus from one source twice.
    if (list.some((entry) => entry.id === id)) return;
    list.push({ id, label });
  };

  // 1. The class itself.
  if (classItem) {
    const printed = String(classItem.system?.classSkills ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    for (const name of printed) {
      // `_id` as well as `id`: a Foundry document exposes `id`, a plain pack
      // object only `_id`, and the harness runs this against pack objects.
      // Falling through to the NAME would make two different classes with
      // the same name one source, which is the wrong way to be wrong.
      add(skillKeyFromName(name, skills), `class:${classItem.id ?? classItem._id ?? classItem.name}`, classItem.name);
    }
  }

  // 2. Archetype feats that make a chosen skill a class skill, and
  //    Exceptional Training, which is the same shape. Both record their
  //    answer in a flag; the feat must still be on the sheet for it to
  //    count, so removing the feat removes the bonus with no reconcile.
  for (const grant of grants) {
    const record = flags[grant.flag];
    if (!record?.skill) continue;
    if (grant.name && !ownedFeatNames.has(String(grant.name).toLowerCase())) continue;
    add(record.skill, `grant:${grant.flag}`, grant.label);
  }

  // 2b. A class skill a feat simply gives (3.671.0; Inner Tempest's Jade
  //     Physician: "You gain Medicine as a class skill"). Declared on the
  //     item as `flags.trg-prime.classSkills` (names or keys) and derived
  //     while the item is held, so no Use press and nothing to take back.
  //     One source per item.
  for (const entry of declared) {
    for (const name of entry?.skills ?? []) {
      add(skillKeyFromName(name, skills), `feat:${entry.id}`, entry.label);
    }
  }

  // 3. A divine aspect's Class Skill. Appendix 4 gives every aspect one,
  //    and the Cleric's Deific Aspect ability spends a line on it:
  //    "Deific Skill: you gain a bonus class skill based upon your deific
  //    aspect." A separate source from the class, so a Cleric of Dawn
  //    whose class also lists Religion gets the bonus twice — which is
  //    what "class bonuses stack" means, and is why sources are counted
  //    rather than skills.
  for (const aspect of aspects) {
    const printed = aspect?.system?.classSkill;
    if (!printed) continue;
    add(
      skillKeyFromName(printed, skills),
      `aspect:${aspect.id ?? aspect._id ?? aspect.name}`,
      aspect.name
    );
  }

  // 3b. A Wizard school's class skill. "Your school grants you an
  //     additional class skill" — structurally the same statement a
  //     deific aspect makes, so it is the same kind of source, and the
  //     same list handles both.
  for (const school of schools) {
    const printed = school?.system?.classSkill;
    if (!printed) continue;
    add(
      skillKeyFromName(printed, skills),
      `school:${school.id ?? school._id ?? school.name}`,
      school.name
    );
  }

  // 4. The player's own tick — but ONLY where nothing else already says
  //    so. Ticking the box on a skill your class already grants is you
  //    recording the same fact your class does, not a second source, and
  //    counting it twice would hand a Fighter double the class bonus on
  //    all seven of their skills. The 3.204.0 migration converts every
  //    typed Class column into a tick, so that is not a corner case: it
  //    is what every existing character looks like the moment they are
  //    migrated.
  for (const [key, skill] of Object.entries(skills)) {
    if (!skill?.classSkill) continue;
    if (found.get(key)?.length) continue;
    add(key, "manual", "ticked on the sheet");
  }

  return found;
}

/**
 * The bonus entries a skill's class-skill sources contribute.
 *
 * One per source, each worth the character's class bonus. Returned as
 * addBonus-shaped objects so the stacking engine sees them as ordinary
 * class-type bonuses — which means a flat class bonus from somewhere
 * else (Favoured Terrain's +2) stacks on top exactly as Appendix 1 says
 * it should, rather than being folded in or suppressed.
 */
export function classSkillBonuses(sources = [], classBonus = 0) {
  const value = Number(classBonus) || 0;
  if (value === 0) return [];
  return sources.map((source) => ({
    label: `Class skill (${source.label})`,
    value,
    type: "class",
    source: `classSkill:${source.id}`
  }));
}

/**
 * A one-line explanation for the sheet: who made this a class skill.
 */
export function classSkillTooltip(sources = [], classBonus = 0) {
  if (!sources.length) return "";
  const names = sources.map((source) => source.label);
  const value = Number(classBonus) || 0;
  return `Class skill from ${names.join(" and ")} — +${value}${
    names.length > 1 ? ` each, ${value * names.length} in total` : ""
  }.`;
}

export { SYSTEM_ID as CLASS_SKILL_SYSTEM_ID };
