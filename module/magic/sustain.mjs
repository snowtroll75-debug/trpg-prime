/**
 * Sustain a Spell (Chapter 4, Special Actions) — the decision half.
 *
 * NEW at 3.424.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO KEEP DEAD.
 *
 * Graham, 27 August 2026:
 *
 *   "1. The Sustain a Spell action on the Actions tab deducts an AP,
 *    creates an entry on the chat card but does nothing else.
 *    2. The sustain button on the magic tab actually sustains the spell,
 *    but does not deduct an AP."
 *
 * Two doors onto one rule, each doing the half the other did not. Put
 * together they are a correct Sustain; a player who found only one of
 * them got either a free sustain or a spent action that sustained
 * nothing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HOW IT HAPPENED, because the shape is worth recognising.
 *
 * `sustainASpell` appeared exactly ONCE in the entire system: in its own
 * data entry in `data/special-actions.mjs`. Nothing anywhere read the
 * key. It is a `checkType: "none"` action, so `resolveAction` did what it
 * does for any such action — checked AP, spent it, posted the printed
 * description — and there was no handler to do the rest. The button was
 * real, its cost was real, and its effect had never been written.
 *
 * Meanwhile the Magic tab grew its own button, wired straight to
 * `sustainActiveSpell`, which is the storage primitive and knows nothing
 * about actions or AP.
 *
 * Neither half is wrong on its own. What was missing is the thing that
 * says what a Sustain IS, so that both doors ask it rather than each
 * implementing the part its author was thinking about.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE REFUSAL IS A FUNCTION RATHER THAN AN `if` IN THE HANDLER.
 *
 * The action's printed requirements — "You have at least one spell active
 * with a sustained duration, and you are not fatigued" — were enforced
 * NOWHERE. Not in the action (which had no handler) and not on the Magic
 * tab (which sustained whatever you clicked). Written here as a pure
 * function, both doors ask the same question and a harness can read the
 * answer without a world.
 */

/**
 * The action's printed cost. A string because that is what
 * `spendActionCost` and the rest of the action pipeline speak.
 */
export const SUSTAIN_AP_COST = "1";

/** The action's printed traits, so the spend records the same ones. */
export const SUSTAIN_TRAITS = "Concentrate";

/**
 * The active-spell entries a Sustain may actually target.
 *
 * Only entries flagged `sustained`. An entry that is merely PP-LOCKED —
 * a spell lasting "until your next daily preparations" — is running, and
 * shows on the Magic tab, but there is nothing to sustain: its duration
 * is not measured in turns. The Magic tab already draws its button only
 * for `spell.sustained`, and this is that same rule where the action can
 * reach it too.
 *
 * @param {object[]} entries getActiveSpells(actor)
 * @returns {object[]}
 */
/*
 * NOT EXPORTED. `sustainRefusal` and `resolveSustainTarget` are the two
 * questions callers actually have, and both answer them using this; a
 * third export nothing called was refused by the uncalled-export ratchet
 * the moment it existed. Checking it through those two is also the
 * better test — it exercises the doors rather than the hinge.
 */
function sustainableEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => Boolean(e?.sustained));
}

/**
 * Why this character may not Sustain a Spell right now, or null.
 *
 * A SENTENCE, NOT A BOOLEAN. "You cannot do that" with no reason is the
 * kind of refusal a player retries three times before asking the GM, and
 * both of this action's requirements are things they can act on — cast
 * something sustainable, or shed the fatigue.
 *
 * @param {object} options
 * @param {object[]} options.entries The caster's active spells.
 * @param {number} options.fatigued The Fatigued condition's value (0 = none).
 * @param {string} options.name The caster's name, for the message.
 * @returns {string|null}
 */
export function sustainRefusal({ entries = [], fatigued = 0, name = "This character" } = {}) {
  // FATIGUE FIRST. A fatigued caster with three sustained spells should
  // be told the thing that is actually stopping them, not offered a
  // picker they cannot use the result of.
  if (Number(fatigued) > 0) {
    return `${name} is Fatigued — Sustain a Spell requires that you are not fatigued.`;
  }
  if (!sustainableEntries(entries).length) {
    return `${name} has no spell running with a sustained duration to sustain.`;
  }
  return null;
}

/**
 * Which entry a Sustain should act on, given what the caller knows.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TWO DOORS DIFFER HERE AND ONLY HERE. The Magic tab's button sits
 * on a row and names its spell; the Actions tab's button names nothing.
 * So this answers with either the entry, or `"ask"` when a person has to
 * choose between several.
 *
 * ONE CANDIDATE IS NOT A CHOICE. A caster sustaining their only running
 * spell should not be shown a dialog with one row in it — that is a
 * click that can only be answered one way.
 *
 * @param {object[]} entries
 * @param {string|null} spellId The id the caller already knows, if any.
 * @returns {{entry: object}|{ask: object[]}|null}
 */
export function resolveSustainTarget(entries, spellId = null) {
  const candidates = sustainableEntries(entries);
  if (!candidates.length) return null;
  if (spellId) {
    const named = candidates.find((e) => e.id === spellId);
    return named ? { entry: named } : null;
  }
  if (candidates.length === 1) return { entry: candidates[0] };
  return { ask: candidates };
}
