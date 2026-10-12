/**
 * A SECOND DAMAGE POOL ON ONE SAVE.
 *
 * NEW at 3.591.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE SPELLS PRINT TWO NUMBERS AND THE PACK CARRIED ONE.
 *
 *   METEOR SWARM   6d10 bludgeoning in a 10-foot radius, then
 *                  14d6 FIRE in the 40-foot radius. "The saving throw
 *                  applies to both."
 *   SUNBURST       8d10 fire, and 8d4 ESSENCE to undead creatures.
 *   UMBRAL BLAST   8d10 cold, and 8d4 secondary ESSENCE.
 *
 * All three are Basic Reflex, and the basic-save path rolls exactly one
 * `damage` formula of exactly one type. So Meteor Swarm — an 18 PP
 * spell — delivered roughly a third of what it prints, and the two 8d4
 * pools had never been rolled at all.
 *
 * THE DATA WAS ALREADY TRYING TO SAY IT. Sunburst and Umbral Blast both
 * carry `baseDamage: "1d10/1d4"` — two base dice in one field, separated
 * by a slash, which nothing reads. Whoever entered them knew there were
 * two pools and had nowhere to put the second.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ROLLED ONCE AND SCALED BY THE SAME SAVE, which is what "the saving
 * throw applies to both" means: one save, two pools, each halved or
 * doubled by the degree that save reached. Not a second save, and not a
 * flat rider — a `damage` effect row would have ignored the save
 * entirely and handed a critical success the full 14d6.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SCOPE IS PER-POOL, WHICH `damageScope` IS NOT. Sunburst's 8d4
 * lands only on undead while its 8d10 lands on everyone, and
 * `damageScope` restricts a whole spell — it is the field that spares
 * everyone but fire creatures from Quench. So a pool may name creature
 * types of its own, and a pool that names none reaches everyone the
 * primary reaches.
 */

const text = (v) => String(v ?? "").trim();
const DICE = /^\d+(d\d+)?(\s*\+\s*\d+)?$/i;

/**
 * A secondary-damage declaration, or null when there is none.
 *
 * MALFORMED IS NULL AND THE CALLER SAYS SO. A pool whose dice do not
 * parse is a data error, and resolving it to zero damage would hide the
 * error behind a spell that quietly does two thirds of its job — which
 * is the state this file exists to end.
 *
 * @param {object} spellSystem the spell's `system`
 * @returns {{formula:string, type:string, onlyCreatureTypes:string[]}|null}
 */
export function normaliseSecondaryDamage(spellSystem) {
  const raw = spellSystem?.secondaryDamage;
  if (!raw || typeof raw !== "object") return null;

  const formula = text(raw.formula);
  if (!formula || !DICE.test(formula)) return null;

  // A POOL MUST NAME ITS TYPE, the rule every damage row in this system
  // follows: an empty type means "the weapon's own" elsewhere, and a
  // pool that forgot one must not inherit that meaning.
  const type = text(raw.type).toLowerCase();
  if (!type) return null;

  return {
    formula,
    type,
    onlyCreatureTypes: (Array.isArray(raw.onlyCreatureTypes) ? raw.onlyCreatureTypes : [])
      .map((t) => text(t).toLowerCase())
      .filter(Boolean)
  };
}

/**
 * Does this creature take the secondary pool?
 *
 * @param {object} spec a normalised secondary pool
 * @param {string[]} targetTypes the creature's types, lower case
 * @returns {boolean}
 */
export function secondaryReaches(spec, targetTypes = []) {
  if (!spec) return false;
  if (!spec.onlyCreatureTypes.length) return true;
  const theirs = new Set((targetTypes ?? []).map((t) => String(t ?? "").trim().toLowerCase()));
  return spec.onlyCreatureTypes.some((t) => theirs.has(t));
}

/** What the card says about the second pool, before any save. */
export function secondaryDamageLine(spec) {
  if (!spec) return "";
  const who = spec.onlyCreatureTypes.length
    ? ` against ${spec.onlyCreatureTypes.join(", ")} creatures`
    : "";
  return `Secondary damage: <strong>${spec.formula}</strong> ${spec.type}${who}`
    + " &mdash; the same save scales both pools.";
}
