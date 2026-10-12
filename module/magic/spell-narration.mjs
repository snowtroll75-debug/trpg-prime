/**
 * What the card says when the system did nothing.
 *
 * NEW at 3.392.0, and it closes a gap that had never been named: the
 * cast card has NEVER printed a spell's own text. Measured 25 August
 * 2026 — `spellData.description` appears exactly once in the whole of
 * cast-workflow.mjs, in a regex looking for the word "disbelieve".
 *
 * For a spell the engine automates, that is fine: the card reports what
 * was applied, and the text is a click away on the sheet. For the
 * EIGHTY-FOUR spells whose printed text IS their implementation — Click
 * toggles a switch, Message whispers to one creature, Scribers Chant
 * copies a page a minute — the card said the spell was cast and then
 * nothing at all. A player reading it learned only that they had spent
 * an action.
 *
 * Graham's ruling, 25 August 2026, choosing between three options: post
 * the spell's text. Not a "no mechanical effect" disclaimer, which reads
 * as a system failure to anybody who does not know it is deliberate.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DERIVED, NOT FLAGGED, and that is the whole design.
 *
 * There is no `narrative: true` on these spells and this file does not
 * add one. It asks whether the engine had ANYTHING to apply, and prints
 * the text when the answer is no. So:
 *
 *   - a spell that gains a `damage` or `condition` entry tomorrow stops
 *     falling back to its text on the same day, with nothing to update;
 *   - a spell nobody has got to yet says something useful in the
 *     meantime rather than nothing;
 *   - and the list cannot rot, because there is no list.
 *
 * It is §5.9 applied to Chapter 10: the card must say what the system
 * did, and "nothing, here is what the spell says" is an honest answer
 * where silence is not.
 */

import { HANDLED_EFFECT_KINDS } from "./effect-kinds.mjs";

/**
 * Effect kinds that DO something. `note` is deliberately absent: a note
 * is printed text, which is exactly the state this file exists to
 * improve on, so a spell carrying only notes still gets its description.
 */
/*
 * THE NINE-NAME LIST THAT STOOD HERE WAS WRONG BY FORTY-ONE (3.503.0).
 *
 * It read `["heal", "tempHP", "condition", "bonus", "defence", "spell",
 * "trait", "attack", "damage"]` against the FIFTY kinds the applier
 * actually handles, so 42 spells printed their card lines and their whole
 * description underneath — Warped Terrain, Vital Beacon, Flaming Weapon,
 * Stabilise, Umbral Veil, Sacrificing Shield. Every one of them said
 * everything twice, and had since its kind was added.
 *
 * IT WAS THE SHAPE, NOT AN OVERSIGHT. A list maintained by hand beside a
 * switch statement in another file drifts the first time somebody adds a
 * case without thinking about narration, which is every time. Graham
 * ruled on 5 September 2026: DERIVE IT. The question is no longer "is
 * this kind one of the mechanical ones" but "does the applier reach this
 * spell's effects at all", and the answer lives in one declared list that
 * `verify-effect-kinds-handled` proves against the applier's own cases.
 *
 * `note` NEEDS NO SPECIAL CASE ANY MORE, and the branch that gave it one
 * is gone. It is a handled kind like the rest, so it stands the fallback
 * down by the same rule — which is the outcome its old comment argued
 * for: "the note reaches the card already, so printing the text
 * underneath it says everything twice."
 */

const filled = (v) => Boolean(String(v ?? "").trim());

/**
 * Did the engine have anything to apply for this spell?
 *
 * READ FROM THE SPELL, NOT FROM THE OUTCOME, deliberately. Asking "did
 * any line get pushed" would be a different question and a fragile one —
 * a refusal pushes lines too, and a cast that fizzles applies nothing
 * without the spell being narrative. This asks whether the spell carries
 * anything the engine COULD apply, which is a property of the spell and
 * is the same before and after the dice.
 *
 * @param {object} spellSystem A spell's `system`.
 * @returns {boolean} True when the engine has nothing to do.
 */
export function spellHasNoMechanics(spellSystem = {}) {
  const effects = Array.isArray(spellSystem?.effects) ? spellSystem.effects : [];
  if (effects.some((e) => HANDLED_EFFECT_KINDS.includes(String(e?.kind ?? "")))) return false;
  if (filled(spellSystem?.damage?.formula) || filled(spellSystem?.baseDamage)) return false;
  if ((spellSystem?.casterLevelMods ?? []).length > 0) return false;
  // A SAVE OR AN ATTACK IS MECHANICAL EVEN WITH NO EFFECTS. `castSpell`
  // resolves both and reports each on the card, so a spell carrying
  // either is not silent and must not be given the fallback.
  if (filled(spellSystem?.defence)) return false;
  if (String(spellSystem?.category ?? "").trim().toLowerCase() === "attack") return false;
  return true;
}

/**
 * The spell's text as the card should carry it.
 *
 * THE WARPING OPTIONS ARE CUT. They are appended to every description in
 * the pack as a trailing block, and the player has just been shown them
 * — and chosen from them — in the Warp dialog two steps earlier.
 * Reprinting the list underneath the result is the kind of noise that
 * teaches a reader to skim a card, which is the opposite of what this
 * change is for.
 *
 * @param {string} description
 * @returns {string} "" when there is nothing worth printing.
 */
export function spellNarration(description) {
  const text = String(description ?? "")
    .split(/Warping Options:/i)[0]
    .trim();
  return text;
}

/**
 * The card lines for a spell that did nothing mechanical, or [].
 *
 * RETURNS LINES, NOT HTML, so the caller's own `line()` wrapper decides
 * the markup and this stays checkable without Foundry — the same split
 * every other card sentence in this system now uses.
 *
 * @param {object} spellSystem
 * @returns {string[]} Paragraph texts, in order.
 */
export function narrationLines(spellSystem = {}) {
  if (!spellHasNoMechanics(spellSystem)) return [];
  const text = spellNarration(spellSystem?.description);
  // NO `if (!text) return []` GUARD, and its absence is deliberate. One
  // was written and no mutation could kill it: `filter(Boolean)` below
  // already drops every empty paragraph, so an empty description yields
  // [] with or without it. extra-uses.mjs made the same call for the same
  // reason — "a guard nothing can reach is a guard no mutation can
  // prove, and an unprovable line is exactly what this harness refuses".
  // ONE PARAGRAPH PER PRINTED PARAGRAPH. Several of these spells carry a
  // second paragraph that is a real clause — Scribers Chant's "You must
  // concentrate upon the material" is a requirement, not a flourish —
  // and running them together buries it.
  return text.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
}
