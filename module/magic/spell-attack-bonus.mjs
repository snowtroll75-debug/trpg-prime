/**
 * Which of a character's attack bonuses reach a SPELL attack.
 *
 * NEW at 3.425.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO KEEP DEAD.
 *
 * Graham, 27 August 2026: "bless seems to add its bonus to attack checks
 * but not those created by attack spells."
 *
 * Bless writes a `+1 status` bonus into `system.combat.attack.status`.
 * A WEAPON attack reads that pool — it builds its modifiers from
 * `system.combat.attack.checkModifiers`, which carries every typed entry
 * the pool resolved. A SPELL attack never looked at it: it is built from
 * the Cast a Spell check's total (Spellcraft, or an innate ability plus
 * level) with three named extras added by `assembledSpellAttackTotal`.
 * Nothing in that path had ever heard of the attack pool.
 *
 * So the bonus was applied, visible on the Effects tab, correct on the
 * sheet — and read by exactly one of the two things the rulebook calls
 * an attack roll.
 *
 * EIGHT SPELLS aim at that pool: Bless, Bane, Aid, Heroism, Prayer,
 * Divine Favour, Inspire Courage and Bless Weapon. So do Rage, Aim, the
 * two attack stances, and the Prone and Fixated conditions. Graham
 * reported the one he happened to cast.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A FILTER AND NOT "ADD THE ATTACK TOTAL".
 *
 * The pool's resolved total also contains BAB and the attacking
 * attribute — the additive half, labelled "BAB and ability". Handing
 * that to a spell attack would give a Fighter's base attack bonus to a
 * Wizard's Fire Bolt on top of the Spellcraft the roll is already built
 * from. The two halves of that node answer different questions, and only
 * one of them is "what else is modifying attack rolls right now".
 *
 * GRAHAM'S RULING, 27 August 2026: STATUS and CIRCUMSTANCE only.
 *
 * That is the line between "something is happening to this creature" and
 * "this is how this creature attacks with a weapon":
 *
 *   - `status` and `circumstance` — Bless, Bane, Aid, Heroism, Divine
 *     Favour, Rage, Aim, Prone, Fixated. Blessings, curses, postures and
 *     conditions. These reach a spell attack.
 *   - `item` — Bless Weapon's +2. Named for a weapon, granted to a
 *     weapon; a Fire Bolt is not holding it. Excluded.
 *   - `class` — the weapon-attack progression. Excluded.
 *   - the additive half (BAB, ability, and the Wound Threshold penalty
 *     that rides with them) — excluded by the same reasoning, and
 *     Graham ruled the wound penalty weapon-only explicitly.
 *
 * A rules change disguised as a bug fix is the thing to avoid here: the
 * narrow reading leaves Bless Weapon and the Fighter's class bonus doing
 * exactly what they did yesterday.
 */

/**
 * The bonus types that reach a spell attack.
 *
 * DECLARED, so the rule is one line a reader can check against the
 * paragraph above rather than a predicate they have to run in their
 * head. Adding a type here is a rules decision and should look like one.
 */
export const SPELL_ATTACK_BONUS_TYPES = Object.freeze(["status", "circumstance"]);

/**
 * The rows from an attack node's `checkModifiers` that a spell attack
 * should also receive.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ADDITIVE ROW IS EXCLUDED BY ITS TYPE, not by its position.
 *
 * `toCheckModifiers` puts the additive total first, typed `untyped`, and
 * every pooled entry after it with its own type. Filtering on the type
 * therefore drops BAB and ability without needing to know that they came
 * first — which matters, because a node with no additive total does not
 * emit that row at all, and an index-based rule would then eat a real
 * bonus instead.
 *
 * SUPPRESSED ENTRIES ARE KEPT. The pool hands over losers as well as
 * winners so the card can show what was discarded and why; the caller
 * re-applies the stacking rules. Dropping them here would silently
 * change which of two status bonuses wins.
 *
 * @param {Array<{label: string, value: number, type: string}>} checkModifiers
 * @returns {Array<{label: string, value: number, type: string}>}
 */
export function spellAttackBonusRows(checkModifiers) {
  return (Array.isArray(checkModifiers) ? checkModifiers : []).filter((row) =>
    SPELL_ATTACK_BONUS_TYPES.includes(String(row?.type ?? "").trim().toLowerCase())
  );
}
