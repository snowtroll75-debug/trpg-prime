/**
 * A MODULE'S OWN MARK ON A SPELL'S TARGET (3.672.0; Block 8's C6). Pure; no
 * Foundry.
 *
 * Inner Tempest's Spiritual Distraction and Disrupt Soul are curses that
 * answer later: "Each time the target casts a spell they must make a saving
 * throw". What answers is the module's (a spell-check gate and the
 * settled-cast hook, both 3.672.0). What the module could not do was leave
 * the curse ON the creature, carrying who laid it and at what DC, timed and
 * ended as every spell effect of the system's own is.
 *
 *   { kind: "moduleMark", module: "trg-inner-tempest", key: "spiritualDistraction",
 *     label: "Spiritual Distraction", saveAtCast: false }
 *
 * The effect carries `flags[module][key]`:
 *
 *   { casterUuid, casterName, level, casterLevel, dc, castId, spellUuid, spellName }
 *
 * `dc` is the cast's own save DC — the nominal one, so a spell whose save is
 * rolled later still records the number it was cast at (Graham's B8-4: "the
 * DC of the casting that laid the spell").
 *
 * ONLY A MODULE'S NAMESPACE. A row naming the system's own id is refused:
 * the system's flags are written by the system's own rows, each validated,
 * and a door that wrote any of them would be an editor, not a rule.
 *
 * A SAVE ROLLED LATER, NOT NOW. `saveAtCast: false` on any row tells the
 * cast not to roll the spell's printed save when it is cast (see
 * sanctuary.mjs `spellDefersItsSave`) — the save is real, it simply belongs
 * to a later moment.
 */

const SYSTEM_ID = "trg-prime";
const MODULE_ID = /^[a-z0-9][a-z0-9_-]*$/;
const MARK_KEY = /^[A-Za-z][A-Za-z0-9_-]*$/;

const text = (v) => String(v ?? "").trim();

/**
 * @returns {null|{module: string, key: string, label: string}}
 */
export function normaliseModuleMark(row, { spellName = "" } = {}) {
  if (!row || row.kind !== "moduleMark") return null;
  const module = text(row.module);
  const key = text(row.key);
  if (!MODULE_ID.test(module) || module === SYSTEM_ID || module === "core") return null;
  if (!MARK_KEY.test(key)) return null;
  return { module, key, label: text(row.label) || text(spellName) || key };
}

/**
 * The module's data for the mark.
 * @param {object} ctx
 */
export function moduleMarkRecord({ caster = null, level = null, casterLevel = null, dc = null, castId = "", spell = null } = {}) {
  const n = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
  return {
    casterUuid: text(caster?.uuid) || null,
    casterName: text(caster?.name) || null,
    level: n(level),
    casterLevel: n(casterLevel),
    dc: n(dc) && n(dc) > 0 ? n(dc) : null,
    castId: text(castId) || null,
    spellUuid: text(spell?.uuid) || null,
    spellName: text(spell?.name) || null
  };
}

/** Does the creature already carry this module's mark under this key? */
export function moduleMarkOn(effects = [], spec) {
  if (!spec) return false;
  return Array.from(effects ?? []).some((e) => !e?.disabled && e?.flags?.[spec.module]?.[spec.key]);
}

/** The cast card's line. */
export function moduleMarkLine(targetName, spec, record) {
  return `${targetName}: <strong>${spec.label}</strong>${record?.dc ? ` (DC ${record.dc})` : ""}`;
}
