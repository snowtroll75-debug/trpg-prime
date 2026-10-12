/**
 * The modifier rows a forced check starts from (3.627.1).
 *
 * `TRGCheck.roll` rolls exactly the modifiers it is handed. Every workflow
 * that rolls a save or a skill on a creature's behalf reads the sheet's
 * prepared `checkModifiers` and hands them over — affliction-workflow.mjs,
 * sanctuary-gate.mjs, the Death critical, falling. The Chapter 9 rolls
 * added at 3.627.0 (a death guard's save, a declared after-strike's save,
 * a rolled aura's save, Drink Blood's Athletics) named the save and passed
 * nothing, so each rolled the bare die: "Modifiers +0" on a 12th-level
 * cleric's Fortitude, found live on 7 October 2026.
 *
 * One place now builds the rows, so the next forced roll cannot forget.
 *
 * Pure: reads a prepared actor system, writes nothing.
 */

const SAVE_KEYS = Object.freeze(["fortitude", "reflex", "will"]);
const lower = (v) => String(v ?? "").trim().toLowerCase();
const title = (s) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s);

/** The prepared rows of one stat, copied; a single untyped total when it has none. */
function rowsOf(stat, fallbackLabel) {
  if (Array.isArray(stat?.checkModifiers)) return stat.checkModifiers.map((m) => ({ ...m }));
  return [{ label: fallbackLabel, value: Number(stat?.total ?? 0) || 0, type: "untyped" }];
}

/**
 * A saving throw's modifiers.
 *
 * @param {object} actorSystem the creature's prepared `system`
 * @param {string} save "fortitude" | "reflex" | "will"
 * @returns {Array<{label: string, value: number, type: string}>}
 */
function saveCheckModifiers(actorSystem, save) {
  const key = lower(save);
  if (!SAVE_KEYS.includes(key)) return [];
  return rowsOf(actorSystem?.combat?.saves?.[key], `${title(key)} save`);
}

/**
 * A skill check's modifiers.
 *
 * @param {object} actorSystem the creature's prepared `system`
 * @param {string} skill a key of `system.skills` ("athletics")
 * @returns {Array<{label: string, value: number, type: string}>}
 */
function skillCheckModifiers(actorSystem, skill) {
  const key = String(skill ?? "").trim();
  if (!key) return [];
  const stat = actorSystem?.skills?.[key];
  return rowsOf(stat, stat?.label ?? title(key));
}

/**
 * A check config made whole: a save named by `save` (the shape the 3.627.0
 * rolls used) gains its `subject`, and a save or skill with no modifiers
 * gains the sheet's. A config that already carries modifiers is returned
 * as it came — the caller knew what it wanted.
 *
 * @param {object} config a `TRGCheck.roll` config
 * @returns {object} a new config
 */
export function withCheckModifiers(config = {}) {
  const out = { ...config };
  const system = out.actor?.system ?? {};
  if (out.type === "save") {
    const save = lower(out.subject || out.save);
    if (SAVE_KEYS.includes(save)) {
      out.subject = save;
      if (!Array.isArray(out.modifiers)) out.modifiers = saveCheckModifiers(system, save);
    }
  } else if (out.type === "skill" && out.subject && !Array.isArray(out.modifiers)) {
    out.modifiers = skillCheckModifiers(system, out.subject);
  }
  return out;
}
