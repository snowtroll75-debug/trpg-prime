import { ATTRIBUTE_KEYS, SKILLS, SIZE_TABLE, DAMAGE_TYPES } from "../config.mjs";
import { BONUS_TYPES, applyStacking } from "../dice/resolution.mjs";
import { CONDITIONS, VALUED_CONDITION_IDS } from "../conditions/registry.mjs";

/**
 * The semantic target registry (Universal Modifier spec, Sections 8 and 25).
 *
 * Every statistic the Universal Modifier can touch is a registered entry that
 * names the REAL data path in the installed system — nothing here guesses a
 * document path. Entries carry enough metadata for the interface to know:
 *
 *   - kind: how the value is legitimately modified
 *       "pool"      A derived total fed by the Appendix 1 typed-bonus pools.
 *                   Modified by creating an Active Effect whose CUSTOM change
 *                   key is `<path>.<bonusType>` — never by writing the total.
 *       "field"     A stored source value (current HP, a movement speed, a
 *                   sheet slot). Modified by a direct, audited document update.
 *       "select"    A stored string with a fixed option list (size).
 *       "condition" A TRG condition, applied through Actor#toggleStatusEffect
 *                   so immunity, valued-condition handling and status icons
 *                   all behave exactly as the rest of the system.
 *   - derived: true marks values calculated from constituents. The engine
 *     refuses to write these silently; the UI warns and offers the legitimate
 *     source instead (spec: "Source versus derived values").
 *
 * Modules extend this via game.trgPrime.modifier.registerTarget(entry) —
 * see registerModifierTarget below.
 */

const ATTRIBUTE_LABELS = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma"
};

const SAVE_LABELS = {
  fortitude: "Fortitude",
  reflex: "Reflex",
  will: "Will"
};

/** Additional registry entries contributed by modules at runtime. */
const MODULE_TARGETS = new Map();

/**
 * Register an additional semantic target. Modules call this through
 * game.trgPrime.modifier.registerTarget. Entries must name a real path;
 * the engine never invents document structure.
 *
 * @param {object} entry {key, label, category, kind, path, ...}
 * @returns {boolean} whether the entry was accepted
 */
export function registerModifierTarget(entry) {
  if (!entry?.key || !entry?.label || !entry?.kind) return false;
  if (["pool", "field", "select"].includes(entry.kind) && !entry.path) return false;
  if (entry.kind === "pool" && !entry.slotType) return false;
  MODULE_TARGETS.set(entry.key, { category: "Module", ...entry });
  return true;
}

/** Remove a module-registered target (module clean-up). */
export function unregisterModifierTarget(key) {
  return MODULE_TARGETS.delete(key);
}

function poolEntry(key, label, category, path, slotType, extras = {}) {
  return { key, label, category, kind: "pool", path, slotType, ...extras };
}

function fieldEntry(key, label, category, path, extras = {}) {
  return { key, label, category, kind: "field", valueType: "number", ...extras, path };
}

/**
 * Build the core registry. Static — per-actor targets (specialist skills,
 * embedded items) are appended by listTargets(actor).
 * @returns {Map<string, object>}
 */
export function buildRegistry() {
  const map = new Map();
  const add = (entry) => map.set(entry.key, entry);

  // ---- Ability scores -----------------------------------------------------
  for (const key of ATTRIBUTE_KEYS) {
    add(poolEntry(
      `attribute.${key}`,
      ATTRIBUTE_LABELS[key] ?? key,
      "Ability Scores",
      `system.attributes.${key}`,
      "attribute",
      { refreshes: "Dependent totals refresh automatically (derived data)." }
    ));
  }

  // ---- Combat statistics --------------------------------------------------
  add(poolEntry("combat.attack", "Attack Bonus", "Combat", "system.combat.attack", "attack"));
  add(poolEntry("combat.defence", "Defensive Bonus (DB)", "Combat", "system.combat.defence", "defence"));
  add(poolEntry("combat.initiative", "Initiative", "Combat", "system.combat.initiative", "initiative"));
  add(poolEntry("combat.naturalArmourFlat", "Natural Armour (flat)", "Combat",
    "system.combat.naturalArmourFlat", "naturalArmourFlat",
    { note: "Highest of flat and scaled Natural Armour applies — they do not stack." }));
  add(poolEntry("combat.naturalArmourBase", "Natural Armour (scaled)", "Combat",
    "system.combat.naturalArmourBase", "naturalArmourBase",
    { note: "Scaled by BDB band, then compared with the flat form; highest wins." }));
  add(poolEntry("combat.dr", "Damage Reduction (bonus)", "Combat",
    "system.combat.dr", "dr",
    { note: "Flat DR that always adds on top of armour and natural armour (Dracoris, Iron Hide — Graham's ruling)." }));
  add(fieldEntry("combat.bab", "Base Attack Bonus (misc)", "Combat", "system.combat.bab.other",
    { note: "Feeds BAB total; attack bonus and BAB damage dice refresh." }));
  add(fieldEntry("combat.bdb", "Base Defence Bonus (misc)", "Combat", "system.combat.bdb.other",
    { note: "Feeds BDB total; DB and DR multiplier band refresh." }));
  add(fieldEntry("combat.armourRending", "Armour Rending", "Combat", "system.combat.armour.rending"));
  add(fieldEntry("combat.deathState", "Death State", "Combat", "system.combat.deathState",
    { min: 0, note: "Base Death State. Doomed reduces the effective value separately." }));
  add(fieldEntry("combat.map", "Multiple Attack Penalty counter", "Combat", "system.combat.map",
    { min: 0, note: "The current attack counter this turn (0 = first attack)." }));

  // ---- Saving throws ------------------------------------------------------
  for (const [key, label] of Object.entries(SAVE_LABELS)) {
    add(poolEntry(`save.${key}`, `${label} Save`, "Saving Throws",
      `system.combat.saves.${key}`, "save"));
  }

  // ---- Skills -------------------------------------------------------------
  for (const [key, def] of Object.entries(SKILLS)) {
    add(poolEntry(`skill.${key}`, def.label ?? key, "Skills", `system.skills.${key}`, "skill"));
  }

  // ---- Magic --------------------------------------------------------------
  add(poolEntry("magic.spellcraft", "Spellcraft", "Magic", "system.magic.spellcraft", "spellcraft"));
  add(fieldEntry("magic.casterLevel", "Caster Level (override)", "Magic", "system.magic.casterLevel",
    { min: 0, note: "0 means: use character level." }));
  add(fieldEntry("magic.bsb", "Base Spell Bonus", "Magic", "system.magic.bsb"));
  add(fieldEntry("magic.controlBonusPerLevel", "Control Bonus per Level", "Magic",
    "system.magic.controlBonusPerLevel"));

  // ---- Resources ----------------------------------------------------------
  add(fieldEntry("resource.hp", "Hit Points (current)", "Resources", "system.resources.hp.value",
    { min: 0, maxPath: "system.resources.hp.max", resource: true }));
  add(fieldEntry("resource.hpTemp", "Temporary HP", "Resources", "system.resources.hp.temp",
    { min: 0, resource: true }));
  add(fieldEntry("resource.hpOther", "Maximum HP (misc bonus)", "Resources", "system.resources.hp.other",
    { note: "Feeds maximum HP. Current damage is preserved (current HP is untouched)." }));
  add(fieldEntry("resource.pp", "Power Points (current)", "Resources", "system.resources.pp.value",
    { min: 0, maxPath: "system.resources.pp.max", resource: true }));
  // The BASE, not the maximum. Maximum PP is derived — base + your
  // class's PP column + your magical ability score — so a modifier
  // written onto `max` was overwritten on the next prepare and read back
  // as though it had never been applied.
  add(fieldEntry("resource.ppMax", "Power Points (base maximum)", "Resources", "system.resources.pp.base",
    { min: 0, note: "Your own base. Your class's PP column and your magical ability score are added on top." }));
  add(fieldEntry("resource.ap", "Action Points (current)", "Resources", "system.resources.ap.value",
    { min: 0, resource: true, note: "Current turn only; AP regain at turn start is governed by conditions." }));
  add(fieldEntry("resource.reactions", "Reactions (current)", "Resources", "system.resources.reactions.value",
    { min: 0, resource: true }));
  add(fieldEntry("resource.conviction", "Conviction", "Resources", "system.resources.conviction.value",
    { min: 0, maxPath: "system.resources.conviction.max", resource: true }));
  add(fieldEntry("resource.luck", "Luck", "Resources", "system.resources.luck.value",
    { min: 0, resource: true }));

  // ---- Movement -----------------------------------------------------------
  const speeds = [
    ["land", "Land Speed", "Armour, encumbrance and grid rounding still apply to the effective value."],
    ["fly", "Fly Speed", null],
    ["swim", "Swim Speed", "A positive Swim Speed grants +4 circumstance to Athletics."],
    ["climb", "Climb Speed", "A positive Climb Speed grants +4 circumstance to Climbing."],
    ["burrow", "Burrow Speed", null]
  ];
  for (const [key, label, note] of speeds) {
    add(fieldEntry(`movement.${key}`, label, "Movement",
      `system.combat.movement.${key}`, { min: 0, ...(note ? { note } : {}) }));
  }
  add({
    key: "identity.size",
    label: "Size Category",
    category: "Movement",
    kind: "select",
    path: "system.identity.size",
    options: Object.keys(SIZE_TABLE),
    note: "Reach and size ability adjustments recalculate from the size table."
  });

  // ---- Identity / progression --------------------------------------------
  // For a PLAYER CHARACTER, Level is now derived from XP every prepare
  // (config.mjs's levelForXP, 3.218.0) — a write here is overwritten on
  // the very next data prepare. The entry stays registered because it is
  // still the legitimate way to set an NPC's level, which is untouched.
  add(fieldEntry("identity.level", "Level", "Identity", "system.identity.level",
    {
      min: 1,
      derivedImpact: "Class bonus, ability point pool, skill rank caps and Level DC all recalculate.",
      note: "Player characters: Level is derived from XP (10,000 per level) and a write here will be overwritten on the next prepare — target XP (system.identity.xp.value) instead. NPCs still take a direct write."
    }));
  // The legitimate source for a player character's Level (above): 10,000
  // XP per level. Untyped for NPCs too, since it costs nothing to have —
  // it just does not drive their Level.
  add(fieldEntry("identity.xp", "XP", "Identity", "system.identity.xp.value",
    {
      min: 0,
      maxPath: "system.identity.xp.max",
      derivedImpact: "Player characters: Level, Class Bonus and everything Level feeds recalculate."
    }));

  // ---- Conditions ---------------------------------------------------------
  for (const [id, def] of Object.entries(CONDITIONS)) {
    map.set(`condition.${id}`, {
      key: `condition.${id}`,
      label: def.label,
      category: "Conditions",
      kind: "condition",
      conditionId: id,
      valued: def.valued,
      damageTyped: id === "recurring"
    });
  }

  // Module contributions last so they can never silently shadow a core entry
  // (a clash is reported instead).
  for (const [key, entry] of MODULE_TARGETS) {
    if (map.has(key)) continue;
    map.set(key, entry);
  }

  return map;
}

/**
 * List targets for an actor, appending per-actor dynamic entries
 * (specialist skills).
 * @param {Actor|null} actor
 * @returns {object[]}
 */
export function listTargets(actor = null) {
  const entries = Array.from(buildRegistry().values());
  const specialist = actor?.system?.specialistSkills ?? {};
  for (const [slug, skill] of Object.entries(specialist)) {
    entries.push(poolEntry(
      `specialistSkill.${slug}`,
      `${skill.label ?? slug} (specialist)`,
      "Skills",
      `system.specialistSkills.${slug}`,
      "specialistSkill"
    ));
  }
  return entries;
}

/** Find one target entry by key, including per-actor entries. */
export function getTarget(key, actor = null) {
  return listTargets(actor).find((entry) => entry.key === key) ?? null;
}

/** The categories in display order. */
export const TARGET_CATEGORIES = [
  "Ability Scores",
  "Combat",
  "Saving Throws",
  "Skills",
  "Magic",
  "Resources",
  "Movement",
  "Identity",
  "Conditions",
  "Module"
];

/** Read a plain value at a dotted path off a (possibly plain) object. */
export function readPath(root, path) {
  let node = root;
  for (const part of String(path ?? "").split(".")) {
    if (node === null || node === undefined) return undefined;
    node = node[part];
  }
  return node;
}

/**
 * Read a target's current state from an actor.
 * @returns {{value: *, max: number|null, tooltip: string|null, derivedTotal: number|null}}
 */
export function readTarget(actor, entry) {
  if (!actor || !entry) return { value: null, max: null, tooltip: null, derivedTotal: null };

  if (entry.kind === "condition") {
    const has = actor.hasCondition?.(entry.conditionId) ?? false;
    const value = entry.valued ? (actor.getConditionValue?.(entry.conditionId) ?? null) : null;
    return { value: has ? (value ?? true) : false, max: null, tooltip: null, derivedTotal: null };
  }

  if (entry.kind === "pool") {
    const node = readPath(actor, entry.path) ?? {};
    return {
      value: node.total ?? 0,
      max: null,
      tooltip: node.tooltip ?? null,
      derivedTotal: node.total ?? 0
    };
  }

  const value = readPath(actor, entry.path);
  const max = entry.maxPath ? Number(readPath(actor, entry.maxPath) ?? 0) : null;
  return { value: value ?? 0, max, tooltip: null, derivedTotal: null };
}

/**
 * Preview what a new typed bonus would do to a pool target, using the
 * actor's already-resolved breakdown plus Appendix 1 stacking. Pure — no
 * mutation, exact for every stacking rule because it re-runs the same
 * applyStacking the preparation step uses.
 *
 * @param {Actor} actor
 * @param {object} entry A "pool" registry entry.
 * @param {{value: number, type: string, label?: string}} bonus
 * @returns {{before: number, after: number, applied: boolean, suppressedBy: string|null,
 *   suppresses: string[], error?: string}}
 */
export function previewPoolBonus(actor, entry, bonus) {
  const node = readPath(actor, entry.path);
  const breakdown = node?.breakdown;
  if (!breakdown) {
    return { before: node?.total ?? 0, after: node?.total ?? 0, applied: false, suppressedBy: null, suppresses: [], error: "No resolved breakdown on this target." };
  }

  const existing = (breakdown.entries ?? []).map((e) => ({
    label: e.label, value: e.value, type: e.type, source: e.source
  }));
  const candidate = {
    label: bonus.label || "Universal Modifier",
    value: Number(bonus.value) || 0,
    type: BONUS_TYPES[bonus.type] ? bonus.type : "untyped",
    source: "universal-modifier-preview"
  };

  const beforeStack = applyStacking(existing);
  const afterStack = applyStacking([...existing, candidate]);

  const before = breakdown.additive + beforeStack.total;
  const after = breakdown.additive + afterStack.total;

  const mine = afterStack.modifiers.find((m) => m.source === "universal-modifier-preview");
  const suppresses = afterStack.modifiers
    .filter((m) => !m.applied && beforeStack.modifiers.find(
      (b) => b.label === m.label && b.value === m.value && b.type === m.type && b.applied
    ))
    .map((m) => `${m.label} ${m.value >= 0 ? "+" : ""}${m.value} (${m.type})`);

  return {
    before,
    after,
    applied: mine?.applied ?? false,
    suppressedBy: mine?.applied ? null : (mine?.suppressed ?? "stacking"),
    suppresses
  };
}

/**
 * Compute the outcome of a field operation without applying it.
 * @param {object} entry A "field" registry entry.
 * @param {number|null} current
 * @param {number|null} max Resolved max (entry.maxPath) or null.
 * @param {"add"|"set"} operation
 * @param {number} value
 * @returns {{before: number, after: number, clamped: boolean}}
 */
export function previewFieldChange(entry, current, max, operation, value) {
  const before = Number(current ?? 0);
  let after = operation === "set" ? Number(value) : before + Number(value);
  let clamped = false;

  if (entry.min !== undefined && after < entry.min) { after = entry.min; clamped = true; }
  if (max !== null && max !== undefined && Number.isFinite(max) && max > 0 && after > max && entry.resource) {
    after = max; clamped = true;
  }
  return { before, after, clamped };
}

/** Damage type keys for the resources tab. */
export const DAMAGE_TYPE_KEYS = Object.keys(DAMAGE_TYPES);

/** Bonus types offered by the UI, in rulebook order. */
export const BONUS_TYPE_KEYS = Object.keys(BONUS_TYPES);

/** Valued conditions, re-exported for the UI. */
export { VALUED_CONDITION_IDS };
