/**
 * The save-advantage family (Chapter 5): three abilities that buy Advantage
 * on a save, and three upgrades that make them free.
 *
 *   EVASION      Ranger — Advantage, Expert — Acrobatics 6 ranks
 *     Action Reaction; Trigger You attempt a reflex save, before you roll.
 *     You gain advantage on the triggering saving throw.
 *
 *   JUGGERNAUT   Advantage, Martial — Athletics 6 ranks
 *     …the same, on a fortitude save.
 *
 *   RESOLVE      Adept, Advantage — Mental Focus 6 ranks
 *     …the same, on a will save.
 *
 *   SUPERIOR EVASION / JUGGERNAUT / RESOLVE
 *     "When using your [ability], it is treated as a Free (0 AP) action and
 *      not a Reaction."
 *
 * ONE FAMILY, NOT SIX FEATS. All six differ only in which save they name and
 * whether the answer costs anything, so they are one table and one decision.
 * Six separate implementations would be six places for the reaction spend to
 * drift apart.
 *
 * DECLARED BY FLAG, NOT BY NAME. The abilities carry
 * `flags.trg-prime.saveReaction` (see save-reactions.mjs), so a later
 * feature with the same clause works unchanged — the reasoning Gnome
 * Resistance already established. This table exists for the half a flag
 * cannot express: which feat UPGRADES which, and it is keyed by ability
 * name because that is what the upgrade's own text names ("your evasion
 * ability").
 *
 * WHY THIS ISN'T A CONDITIONAL. Juggernaut shipped as a conditional-engine
 * entry — `{kind: "advantage", subjects: ["fortitude"], auto: false}` — and
 * that was the same defect Gnome Resistance had: a conditional marked
 * `auto: false` is offered in the ROLL CONFIGURATION DIALOG, and a save
 * forced by a spell, a trap or a fall never opens one. It also cannot spend
 * the reaction it costs. So the feat was declared automated, appeared in the
 * dialog on the one path that opens one, and did nothing anywhere else.
 * `conditionals.mjs` answers "what modifies this roll" for facts; this is a
 * DECISION costing a resource, and it belongs where decisions live.
 */

/** The three saves this family can be scoped to. */
export const SAVE_KEYS = Object.freeze(["fortitude", "reflex", "will"]);

/**
 * Each base ability, the save it answers, and the feat that makes it free.
 * Keyed by lower-case ability name — the name its upgrade refers to.
 */
export const SAVE_ADVANTAGE_FEATS = Object.freeze({
  evasion:    Object.freeze({ name: "Evasion",    save: "reflex",    superior: "Superior Evasion" }),
  juggernaut: Object.freeze({ name: "Juggernaut", save: "fortitude", superior: "Superior Juggernaut" }),
  resolve:    Object.freeze({ name: "Resolve",    save: "will",      superior: "Superior Resolve" })
});

/** The three upgrades, keyed lower-case, naming the ability each upgrades. */
export const SUPERIOR_FEATS = Object.freeze(
  Object.fromEntries(
    Object.entries(SAVE_ADVANTAGE_FEATS).map(([key, entry]) => [
      entry.superior.toLowerCase(),
      Object.freeze({ name: entry.superior, upgrades: entry.name, save: entry.save })
    ])
  )
);

/** A save key normalised, or "" when the text names no save this family knows. */
export function saveKeyOf(subject) {
  const key = String(subject ?? "").trim().toLowerCase();
  return SAVE_KEYS.includes(key) ? key : "";
}

/**
 * Does a declared save-reaction answer this particular save?
 *
 * AN ENTRY WITH NO `save` ANSWERS ANY OF THEM. Gnome Resistance is written
 * as "when targeted by a spell", with no save named, and narrowing it here
 * would silently switch it off. A missing key is a rule that does not care,
 * not a rule that matches nothing.
 */
export function entryAnswersSave(entry, save) {
  const wanted = saveKeyOf(entry?.save);
  if (!wanted) return true;
  return wanted === saveKeyOf(save);
}

/**
 * Is this save-reaction free for this character?
 *
 * "When using your evasion ability, it is treated as a Free (0 AP) action
 * and not a Reaction." The upgrade is a separate feat, so the entry names
 * the feat that frees it and this asks whether the character has it.
 *
 * @param {object} entry     a declared save-reaction
 * @param {string[]} featNames  every feat the character carries
 */
export function saveReactionIsFree(entry, featNames = []) {
  const needed = String(entry?.freeWith ?? "").trim().toLowerCase();
  if (!needed) return false;
  return Array.from(featNames).some((n) => String(n).trim().toLowerCase() === needed);
}

/**
 * Which declared save-reaction, if any, answers this save — and why each of
 * the others does not.
 *
 * NAMED, NOT DROPPED, which is this project's standing rule for anything
 * held back: a Ranger who expected Evasion on a Will save should be able to
 * see that it was the save type that ruled it out, not a bug.
 *
 * THE FREE ONES SORT FIRST. A character with both a free upgrade and a
 * spendable reaction should be given the one that costs nothing; offering
 * the reaction first and the free one never would charge for something the
 * upgrade explicitly made free.
 *
 * @param {object} state
 * @param {object[]} state.entries    declared save-reactions on the actor
 * @param {string} state.save         the save about to be rolled
 * @param {boolean} state.isArea      the source is an area effect
 * @param {number} state.reactions    reactions left this round
 * @param {string[]} state.featNames  every feat the character carries
 * @returns {{chosen: object|null, cost: string, held: Array<{label: string, reason: string}>}}
 */
export function saveAdvantageDecision({
  entries = [],
  save = "",
  isArea = false,
  isSpell = true,
  reactions = 0,
  featNames = []
} = {}) {
  const held = [];
  const usable = [];
  for (const entry of entries) {
    const label = String(entry?.label ?? "A reaction");
    if (!entryAnswersSave(entry, save)) {
      held.push({ label, reason: `answers ${saveKeyOf(entry?.save)} saves, not ${saveKeyOf(save) || "this one"}` });
      continue;
    }
    if (isArea && entry?.areaExempt) {
      held.push({ label, reason: "does not apply to area effects" });
      continue;
    }
    // WHAT FORCED THE SAVE, NOT JUST WHICH SAVE IT IS (3.552.0).
    //
    // Gnome Resistance prints "when targeted by A SPELL". The offer seam
    // fires on every `type: "save"` roll in the system, and until now the
    // only scoping was the save TYPE and the area exemption — so a Gnome
    // was offered the reaction on a poison affliction, a falling save, an
    // exhaustion save and a trap. `spellOnly` lets an entry say which
    // trigger it actually has; an entry that does not declare it keeps
    // the old any-source behaviour, which is right for Evasion and its
    // kin. Found by the pages 18-30 audit.
    if (entry?.spellOnly && !isSpell) {
      held.push({ label, reason: "only triggers when a spell targets you" });
      continue;
    }
    const free = saveReactionIsFree(entry, featNames);
    if (!free && Number(reactions) < 1) {
      held.push({ label, reason: "no reaction left this round" });
      continue;
    }
    usable.push({ entry, free, label });
  }

  if (!usable.length) return { chosen: null, cost: "", held };
  usable.sort((a, b) => Number(b.free) - Number(a.free));
  const best = usable[0];
  // Anything usable but not taken is still named, so a character with two
  // answers can see that only one was applied.
  for (const other of usable.slice(1)) {
    held.push({ label: other.label, reason: "another answer was applied to this save" });
  }
  return { chosen: best.entry, cost: best.free ? "free" : "reaction", held };
}

/**
 * The saves this system rolls that are deliberately OUTSIDE the family's
 * reach, and why. Named here rather than left as an accident of which call
 * sites happened to declare a `subject` — the harness reads this list and
 * requires every `type: "save"` roll in the tree to be either scoped or
 * exempted.
 */
export const SAVE_SCOPE_EXEMPTIONS = Object.freeze({
  "module/documents/combat.mjs": Object.freeze({
    label: "Dying Check",
    reason:
      "The subtitle calls it a Level-Based Fortitude Save, but a character "
      + "rolling it is unconscious. Both halves of this family are ACTIONS — "
      + "a Reaction, or a Free action once upgraded — and an unconscious "
      + "character takes neither. Flagged to Graham rather than decided in "
      + "silence: reversing it is one line."
  })
});
