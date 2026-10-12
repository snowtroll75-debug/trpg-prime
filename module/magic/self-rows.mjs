/**
 * Rows that reach nobody (3.617.3).
 *
 * A spell with no range, no targets and no area is cast on its caster — the
 * target picker never opens, so the cast's `targets` is empty. A row aimed at
 * "targets" on such a spell has nobody to land on, and the card says "finds
 * nobody to affect" after the PP is spent.
 *
 * FOUND LIVE, 4 October 2026, driving 3.617.2: the rebuilt Mage Armour row
 * carried no `target` and did exactly that. Looking for the same shape across
 * the pack found two more that had done it for longer — Invisibility and
 * Shield Of Faith, cast with nothing targeted, made nobody invisible and
 * shielded nobody. Their touch warps now move the self rows onto the touched
 * creature (`retargetSelfRows`), the shape four spells already use.
 *
 * Pure, so the harness asks it of every spell in the pack.
 */

/** Is this spell cast on its caster alone, as printed? */
export function castOnSelfOnly(system = {}) {
  const blank = (v) => !String(v ?? "").trim();
  const range = String(system?.range ?? "").trim();
  return blank(system?.targets) && blank(system?.area) && (!range || /^self$/i.test(range));
}

/** Kinds that print or resolve their own reach, and so name no recipient. */
const NO_RECIPIENT_KINDS = new Set(["note", "damage", "skillLadder", "flatLadder"]);

/**
 * The rows of a self-only spell that would reach nobody: aimed anywhere but
 * "self" and not gated on a save degree (a gated row answers to a roll).
 * @returns {object[]}
 */
export function rowsThatReachNobody(system = {}) {
  if (!castOnSelfOnly(system)) return [];
  return (Array.isArray(system?.effects) ? system.effects : []).filter((row) =>
    row && !NO_RECIPIENT_KINDS.has(row.kind) && String(row.target ?? "") !== "self" && !row.onSave);
}
