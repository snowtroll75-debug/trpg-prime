/**
 * A BONUS WHOSE SLOT IS CHOSEN AT CAST TIME.
 *
 * NEW at 3.507.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * RESISTANCE (PP 2), the spell this was built for:
 *
 *   "granting it a +1 resistance bonus to any one of its saving throws
 *    (SELECTED WHEN CASTING)"
 *      +2 PP: affect all saving throws
 *      +4 PP: increase the bonus by +1 (max +5)
 *
 * It carried `effects: []` and did nothing. Everything it needs existed
 * except the choice: `fortitude`, `reflex` and `will` are already bonus
 * slots that `bonusTargetFor` resolves, `resistance` is already a bonus
 * type in Appendix 1's table, and the +4 PP warp is the `bonusValue`
 * channel every other numeric warp uses.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SHAPE IS CANCEL MAGIC'S, DELIBERATELY.
 *
 * That spell says "select one of the four magical traditions" and is
 * built as a pure declaration plus one prompt, with the count enforced on
 * submission and over-picks trimmed out loud. This is the same sentence
 * about a different list, so it is the same two files rather than a
 * second way of asking a caster to choose something.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE +2 PP WARP HAD `mods: {}` — inert, like the 46 target warps and
 * the two phantom-key clauses before it. "Affect all saving throws" is a
 * FLAG (`allSlots`), not a count: taking it twice does not buy a fourth
 * save. Declared in `emptyWarpMods` with its aggregation line, because a
 * mod key that is not listed there is silently dropped.
 */

/** The saves a caster may choose between. Matches SAVE_KEYS in spell-effects. */
export const SAVE_SLOTS = Object.freeze(["fortitude", "reflex", "will"]);

/**
 * The mental ability scores (3.611.0, block 34). WITS: "a +1 status bonus
 * to one mental ability score (Int, Wis or Cha), selected when casting".
 */
const MENTAL_ATTRIBUTE_SLOTS = Object.freeze(["intelligence", "wisdom", "charisma"]);

/** The lists a `chooseFrom` row may name. */
// THE SAVES, OR A SKILL THE CASTER KNOWS (3.630.0) — Pillars of Faith's
// Exemplar's Grace: "Fortitude; Reflex; Will; or one skill in which you
// possess at least 1 rank". The skills are the CASTER's, read at the cast
// (`withRankedSkills`); the list here is the part every cast shares.
const CHOOSABLE = Object.freeze({ saves: SAVE_SLOTS, mental: MENTAL_ATTRIBUTE_SLOTS, savesorrankedskills: SAVE_SLOTS });

const text = (v) => String(v ?? "").trim().toLowerCase();
const int = (v) => Math.trunc(Number(v) || 0);

/**
 * A choose-a-slot bonus row, or null when it is not one.
 *
 * REFUSED RATHER THAN GUESSED when the list is unknown. A row naming a
 * list nobody implements would prompt with nothing in it, and the caster
 * would be told to choose from an empty dialog.
 *
 * @param {object} raw the authored effect row
 * @returns {object|null}
 */
export function normaliseSlotChoice(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "bonus") return null;
  const from = text(raw.chooseFrom);
  if (!from || !CHOOSABLE[from]) return null;

  const value = int(raw.value);
  // A CHOICE THAT GRANTS NOTHING is a dialog wasting the caster's time.
  if (!value) return null;

  return {
    label: String(raw.label ?? "").trim(),
    chooseFrom: from,
    options: [...CHOOSABLE[from]],
    value,
    bonusType: text(raw.bonusType) || "status",
    target: text(raw.target) || "targets"
  };
}

/**
 * How many slots this casting picks, and whether it picks at all.
 *
 * `allSlots` is the +2 PP warp: every option, no prompt. Returned as a
 * COUNT equal to the whole list rather than as a second flag, so the
 * applier has one number to obey and the prompt is skipped for the same
 * reason it is skipped when there is only one option to begin with.
 *
 * @param {object} spec a normaliseSlotChoice result
 * @param {object} warpMods the aggregated warp mods
 * @returns {{count: number, prompt: boolean}}
 */
export function slotChoiceCount(spec, warpMods = {}) {
  if (!spec) return { count: 0, prompt: false };
  if (warpMods?.allSlots) return { count: spec.options.length, prompt: false };
  // ONE MORE PICK PER WARP (3.630.0) — Exemplar's Grace's "+2 PP: select
  // one additional eligible saving throw or skill".
  const count = Math.min(spec.options.length, 1 + Math.max(0, int(warpMods?.choiceExtra)));
  return { count, prompt: spec.options.length > count };
}

/**
 * The bonus rows this casting applies, once the slots are settled.
 *
 * THE WARPED VALUE IS INJECTED rather than computed here, the shape
 * `warpedGrants` uses: this file stays pure and the same
 * `warpedBonusValue` that caps every other numeric warp caps this one.
 *
 * @param {object} spec a normaliseSlotChoice result
 * @param {string[]} chosen the slots picked (or every option, warped)
 * @param {object} warpMods the aggregated warp mods
 * @param {Function|null} warpValue `warpedBonusValue`, injected
 * @returns {object[]} `bonus` effect rows ready for the applier
 */
export function slotChoiceRows(spec, chosen, warpMods = {}, warpValue = null) {
  if (!spec) return [];
  // ONLY SLOTS THIS SPELL OFFERS. A prompt returning something not on the
  // list is a bonus on a slot the spell never named.
  const slots = (Array.isArray(chosen) ? chosen : [])
    .map((s) => text(s))
    .filter((s) => spec.options.includes(s));
  const unique = [...new Set(slots)];
  if (!unique.length) return [];

  const added = Math.max(0, int(warpMods?.bonusValue));
  const value = added && typeof warpValue === "function"
    ? warpValue(spec.value, added, warpMods?.bonusMax ?? null)
    : spec.value;

  return unique.map((slot) => ({
    kind: "bonus",
    target: spec.target,
    slot,
    value,
    bonusType: spec.bonusType,
    label: spec.label || undefined
  }));
}

/**
 * The caster's skills with at least one rank, added to a `savesOrRankedSkills`
 * choice (3.630.0). Keys as `system.skills` holds them.
 */
export function withRankedSkills(spec, skills = {}) {
  if (!spec || spec.chooseFrom !== "savesorrankedskills") return spec;
  const ranked = Object.entries(skills ?? {})
    .filter(([, skill]) => Number(skill?.ranks ?? 0) >= 1)
    .map(([key]) => key);
  return { ...spec, options: [...spec.options, ...ranked.filter((k) => !spec.options.includes(k))] };
}

/** What the card says when a casting picked nothing. */
export function slotChoiceEmptyLine(spellName, chooseFrom = "saves") {
  return `<em>No ${slotChoiceWords(chooseFrom).single} was chosen for ${spellName} — nothing applied.</em>`;
}

/**
 * WHAT THE LIST IS CALLED, for the prompt and the card (3.611.1, G1 of the
 * 3.611.0 drive). Wits asked "Which saving throw?" with a "Protect" button
 * and reported "No saving throw was chosen" — every word written for
 * Resistance, the list's first user.
 *
 * @param {string} chooseFrom the row's list
 * @returns {{question: string, noun: string, confirm: string, single: string}}
 */
export function slotChoiceWords(chooseFrom = "saves") {
  if (text(chooseFrom) === "savesorrankedskills") {
    return { question: "Which saving throw or skill?", noun: "the saves and the skills you have ranks in", confirm: "Bless", single: "saving throw or skill" };
  }
  if (text(chooseFrom) === "mental") {
    return { question: "Which ability score?", noun: "the target's mental ability scores", confirm: "Enhance", single: "ability score" };
  }
  return { question: "Which saving throw?", noun: "this creature's saving throws", confirm: "Protect", single: "saving throw" };
}

/**
 * What the card says about the choice itself.
 *
 * SAID OUT LOUD WHEN THE WARP MADE THE CHOICE, because a caster who paid
 * 2 PP and saw no prompt would otherwise have no way to tell the warp
 * from a broken dialog.
 */
export function slotChoiceLine(spellName, slots, { warped = false } = {}) {
  if (!slots?.length) return null;
  const named = slots.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ");
  return warped
    ? `<em>${spellName} was warped to cover every saving throw — ${named}.</em>`
    : `<em>${spellName} covers ${named}.</em>`;
}
