import {
  SKILLS,
  CORE_SKILL_KEYS,
  SKILL_BONUS_FIELDS,
  SPECIALIST_BONUS_FIELDS,
  blankSkill,
  blankSpecialistSkill,
  slugifyKey,
  uniqueKey
} from "./config.mjs";

/**
 * Shape normalisation for skill collections.
 *
 * TRG Prime 3.1.3 and earlier stored `system.skills` and
 * `system.specialistSkills` as arrays. From 3.2.0 both are objects keyed by a
 * stable slug. These helpers accept either shape and always return the keyed
 * object form, so that documents created before the change continue to load
 * and render correctly until the world migration has been run.
 */

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toKey(entry, index, existing) {
  const named = slugifyKey(entry?.label ?? entry?.name ?? "");
  if (named) return uniqueKey(named, existing);
  return uniqueKey(`skill${index + 1}`, existing);
}

/**
 * Normalise a master skill collection into keyed object form.
 * Every core skill defined by the rules is guaranteed to be present.
 * @param {object|Array|null} source
 * @returns {object}
 */
export function normaliseSkills(source) {
  const result = {};

  const ingest = (entry, key) => {
    if (!entry || typeof entry !== "object") return;

    const definition = SKILLS[key];
    const target = blankSkill(
      entry.ability ?? definition?.ability ?? "intelligence"
    );

    target.label = String(entry.label ?? entry.name ?? definition?.label ?? "");
    target.ability = String(
      entry.ability ?? definition?.ability ?? "intelligence"
    );
    // Carried through normalisation, or every load would untick every
    // class skill on the sheet. This function rebuilds each entry from
    // blankSkill, so anything not copied here does not survive a cycle.
    target.classSkill = Boolean(entry.classSkill);

    for (const field of SKILL_BONUS_FIELDS) {
      target[field] = toNumber(entry[field]);
    }

    result[key] = target;
  };

  if (Array.isArray(source)) {
    source.forEach((entry, index) => {
      const key = toKey(entry, index, result);
      ingest(entry, key);
    });
  } else if (source && typeof source === "object") {
    for (const [key, entry] of Object.entries(source)) {
      if (!key) continue;
      ingest(entry, key);
    }
  }

  // Guarantee that all twenty-six core skills exist.
  for (const key of CORE_SKILL_KEYS) {
    if (result[key]) {
      if (!result[key].label) result[key].label = SKILLS[key].label;
      continue;
    }

    const skill = blankSkill(SKILLS[key].ability);
    skill.label = SKILLS[key].label;
    result[key] = skill;
  }

  return result;
}

/**
 * Normalise a specialist skill collection into keyed object form.
 * Specialist skills are freeform, so nothing is added that was not present.
 * @param {object|Array|null} source
 * @returns {object}
 */
export function normaliseSpecialistSkills(source) {
  const result = {};

  const ingest = (entry, key) => {
    if (!entry || typeof entry !== "object") return;

    const target = blankSpecialistSkill(entry.ability ?? "intelligence");
    target.label = String(
      entry.label ?? entry.name ?? "New Specialist Skill"
    );
    target.ability = String(entry.ability ?? "intelligence");

    for (const field of SPECIALIST_BONUS_FIELDS) {
      target[field] = toNumber(entry[field]);
    }

    result[key] = target;
  };

  if (Array.isArray(source)) {
    source.forEach((entry, index) => {
      const key = toKey(entry, index, result);
      ingest(entry, key);
    });
  } else if (source && typeof source === "object") {
    for (const [key, entry] of Object.entries(source)) {
      if (!key) continue;
      ingest(entry, key);
    }
  }

  return result;
}

