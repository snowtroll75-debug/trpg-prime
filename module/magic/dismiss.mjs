/**
 * Dismiss (Chapter 4, Special Actions) — the decision half.
 *
 * NEW at 3.434.0. Pure; no Foundry.
 *
 *   Dismiss   1 AP (Concentrate)
 *   "Bring an end to a spell effect or magic item effect that can be
 *    dismissed according to its own description."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO KEEP DEAD — AND IT IS THE THIRD OF ITS KIND.
 *
 * Found on 29 August 2026 by a sweep, not by a report: every action key
 * that appears ONLY in its own data entry is a candidate for this shape,
 * and `dismiss` was one of twelve orphans the sweep turned up.
 *
 * It is the Sustain defect word for word:
 *
 *   - The MAGIC TAB's button called `endActiveSpell` directly — the
 *     storage primitive — so it ended the spell correctly and FOR FREE.
 *   - The ACTIONS TAB's button is `checkType: "none"`, so `resolveAction`
 *     did what it does for any such action: checked the AP, spent it,
 *     posted the printed description, and ended nothing.
 *
 * Two doors onto one rule, each doing the half the other did not. A
 * player who found only the Magic tab dismissed for free; one who found
 * only the Actions tab paid an action point to read a paragraph.
 *
 * `magic/sustain.mjs` records the identical story about `sustainASpell`
 * and `combat/opportunity.mjs` about `attackOfOpportunity`. Three times
 * is a pattern, so the sweep that found this one is now a permanent
 * check — see tools/verify-action-keys-dispatched.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE AP LIVES IN THE ACTION AND NOT IN `endActiveSpell`.
 *
 * `endActiveSpell` is also called by the lapse sweep, by daily
 * preparations and by the emanation expiry. None of those is a character
 * spending an action — a spell running out of time costs nobody
 * anything. So the cost belongs to the DISMISS, and the primitive stays
 * free for everything that is not a person choosing to end it.
 */

/** The action's printed cost and traits, so both doors spend the same. */
export const DISMISS_AP_COST = "1";
export const DISMISS_TRAITS = "Concentrate";

/**
 * Which running spells a Dismiss may end.
 *
 * EVERY ACTIVE ENTRY, unlike Sustain's. Sustain can only touch a spell
 * with a sustained duration; Dismiss reaches anything still running that
 * the character chose to keep running — including a PP-locked spell,
 * where dismissing is the ONLY way to get the points back before the
 * next daily preparation.
 *
 * @param {object[]} entries getActiveSpells(actor)
 * @returns {object[]}
 */
function dismissableEntries(entries) {
  return Array.isArray(entries) ? entries.filter(Boolean) : [];
}

/**
 * Why this character may not Dismiss anything right now, or null.
 *
 * A SENTENCE, NOT A BOOLEAN — the rule `sustainRefusal` records: "you
 * cannot do that" with no reason is the kind of refusal a player retries
 * three times before asking the GM.
 *
 * @param {object} options
 * @param {object[]} options.entries the caster's active spells
 * @param {string} options.name the caster's name, for the message
 * @returns {string|null}
 */
export function dismissRefusal({ entries = [], name = "This character" } = {}) {
  if (!dismissableEntries(entries).length) {
    return `${name} has no spell or effect running that can be dismissed.`;
  }
  return null;
}

/**
 * Which entry a Dismiss should end, given what the caller knows.
 *
 * THE TWO DOORS DIFFER HERE AND ONLY HERE, exactly as Sustain's do: the
 * Magic tab's button sits on a row and names its spell, the Actions
 * tab's names nothing. So this answers with either the entry, or `ask`
 * when a person has to choose between several.
 *
 * ONE CANDIDATE IS NOT A CHOICE — a dialog with one row in it is a click
 * that can only be answered one way.
 *
 * @param {object[]} entries
 * @param {string|null} spellId the id the caller already knows, if any
 * @returns {{entry: object}|{ask: object[]}|null}
 */
export function resolveDismissTarget(entries, spellId = null) {
  const candidates = dismissableEntries(entries);
  if (!candidates.length) return null;
  if (spellId) {
    const named = candidates.find((e) => e.id === spellId);
    return named ? { entry: named } : null;
  }
  if (candidates.length === 1) return { entry: candidates[0] };
  return { ask: candidates };
}

/**
 * What the card should say about the Power Points a dismissal releases.
 *
 * WORTH ITS OWN SENTENCE, because it is the whole reason a player
 * dismisses a PP-locked spell rather than leaving it up: those points
 * are unavailable until the spell ends, and "until your next daily
 * preparations" is a long time to lose them by accident.
 *
 * @param {object|null} entry the entry that was ended
 * @returns {string} a sentence, or "" when nothing was locked
 */
export function dismissReleaseNote(entry) {
  const locked = entry?.lock ? Number(entry.pp) || 0 : 0;
  if (!locked) return "";
  return `<strong>${locked} PP</strong> released.`;
}
