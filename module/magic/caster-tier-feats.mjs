/**
 * The Minor / Major / Master Caster feats — twelve feats, one shape.
 *
 * Minor, Major and Master × Arcane, Divinity, Ethereal and Verdant. Each
 * says the same thing about a different tradition: *"you may memorise and
 * cast an additional <tradition> spell"*, growing on a fixed level ladder.
 *
 * THE SENTENCE THAT DECIDED THE DESIGN is printed once, under Minor
 * Verdant Caster, and governs the whole family:
 *
 * > Caster Feats: these grant spells of a DIFFERENT tradition. You still
 * > cannot cast spells above your caster level, and if you have gained
 * > spells from a second tradition, your Spellcraft checks use the ability
 * > score of the NEW tradition.
 *
 * A different tradition. So these are NOT extra room in the caster's own
 * memorisation pool — a wizard who takes Minor Divinity Caster may memorise
 * more DIVINITY spells, and not one more arcane one. Feeding them into
 * `memorisationState`'s existing `bonusLeveled`, which is a single
 * tradition-agnostic number, would have quietly handed a wizard three more
 * arcane slots. Graham's ruling, 20 August 2026: separate per-tradition
 * slots.
 *
 * AND THE SPELLCRAFT CLAUSE, on his second ruling the same day: each
 * tradition's own ability score for its own spells. A wizard casting a
 * granted divinity spell rolls it off Wisdom; their arcane spells stay on
 * Intelligence. The sentence is about the granted spells, not a wholesale
 * replacement of the character's casting ability.
 *
 * WHY THE SCHEDULES ARE A TABLE AND NOT THREE `if`s. They are irregular —
 * Master grants TWO slots at 18th and one more at 20th, where the other
 * two tiers grant one at a time. An `if (level >= x) count++` chain reads
 * as though every step were worth one, which is exactly the kind of
 * plausible-looking arithmetic this project keeps having to prove wrong.
 */

import { TRADITIONS } from "../config.mjs";

/**
 * Each tier's ladder, as [level, slotsGrantedAtThatLevel].
 *
 * Printed:
 *   Minor  (4th) — one additional spell, another at 6th, another at 8th.
 *   Major  (12th) — one additional, another at 14th, another at 16th.
 *   Master (18th) — an additional TWO, and another at 20th.
 */
export const CASTER_TIER_SCHEDULES = Object.freeze({
  minor: Object.freeze([[4, 1], [6, 1], [8, 1]]),
  major: Object.freeze([[12, 1], [14, 1], [16, 1]]),
  master: Object.freeze([[18, 2], [20, 1]])
});

export const CASTER_TIERS = Object.freeze(["minor", "major", "master"]);

/**
 * Feat name (lowercased) → what it grants.
 *
 * Built rather than written out, so a tradition added to `config.mjs` can
 * never be silently missing from this table.
 */
export const CASTER_TIER_FEATS = Object.freeze(
  Object.fromEntries(
    CASTER_TIERS.flatMap((tier) =>
      Object.keys(TRADITIONS).map((tradition) => [
        `${tier} ${TRADITIONS[tradition].label.toLowerCase()} caster`,
        Object.freeze({ tier, tradition })
      ])
    )
  )
);

/**
 * How many slots one tier is worth at a given level.
 *
 * Below the tier's first rung this is zero — the feat has a level
 * prerequisite, but a character can hold a feat their level no longer
 * qualifies for (an imported actor, a GM's hand-built NPC), and reporting
 * slots they cannot yet use would be worse than reporting none.
 *
 * @param {"minor"|"major"|"master"} tier
 * @param {number} level
 * @returns {number}
 */
export function tierSlots(tier, level) {
  const ladder = CASTER_TIER_SCHEDULES[String(tier ?? "").toLowerCase()];
  if (!ladder) return 0;
  const at = Math.floor(Number(level) || 0);
  return ladder.reduce((sum, [rung, slots]) => (at >= rung ? sum + slots : sum), 0);
}

/**
 * What a set of feat names grants, by tradition.
 *
 * Pure and name-based so the harness can drive every tier and level
 * combination without an actor. Duplicated copies of the same feat count
 * once: the tiers are a ladder with prerequisites, not a stack.
 *
 * @param {string[]} featNames
 * @param {number} level
 * @returns {Record<string, number>} tradition → slots, omitting zeroes
 */
export function casterTierSlots(featNames, level) {
  const seen = new Set();
  const out = {};
  for (const raw of featNames ?? []) {
    const key = String(raw ?? "").trim().toLowerCase();
    const entry = CASTER_TIER_FEATS[key];
    if (!entry || seen.has(key)) continue;
    seen.add(key);
    const slots = tierSlots(entry.tier, level);
    if (slots > 0) out[entry.tradition] = (out[entry.tradition] ?? 0) + slots;
  }
  return out;
}

/**
 * "A DIFFERENT TRADITION" MEANS DIFFERENT FROM YOUR CLASS'S.
 *
 * Graham's ruling, 20 August 2026, after driving 3.345.1 turned up that
 * the whole family was dead.
 *
 * All twelve caster feats are trait-gated in the pack to their OWN
 * tradition's archetype — Arcane to Arcanist, Divinity to Priest,
 * Ethereal to Gleeman, Verdant to Animist. So the only character the
 * picker ever offers Minor Arcane Caster to is one holding Arcanist. If
 * "different" were measured against the ARCHETYPE's tradition, that
 * character would be excluded by the very feat that qualified them.
 * Driven live: a 20th-level Fighter/Arcanist holding Minor, Major AND
 * Master Arcane Caster had NINE arcane slots in the raw count, zero
 * after the exclusion, and no card at all. Three feats, nothing.
 *
 * Measured against the CLASS's tradition instead, the family coheres:
 * the archetype opens a second tradition and these feats deepen THAT
 * one. A Wizard who somehow held Arcanist still gets nothing, which is
 * the outcome the printed note exists to prevent.
 *
 * USE THIS AT EVERY CALL SITE rather than `system.magic.tradition`. That
 * field is the RESOLVED one, and since 3.344.1 an archetype writes to
 * it — which is precisely how the exclusion came to fire on the
 * archetype's own tradition and killed twelve feats at once.
 *
 * @param {{tradition?: string}} progression `system.progression`
 * @returns {string} the class's tradition, or "" for a non-caster
 */
export function classTradition(progression) {
  return String(progression?.tradition ?? "").trim().toLowerCase();
}

/**
 * The traditions this character has been granted BEYOND their class's.
 *
 * The CLASS's tradition is excluded even if a feat names it, because the
 * printed note is explicit that these grant a DIFFERENT tradition. A
 * wizard holding Minor Arcane Caster is a data error rather than a rules
 * case, and silently widening their own pool is the one outcome the
 * ruling rules out.
 *
 * @param {string[]} featNames
 * @param {number} level
 * @param {string} ownTradition the CLASS's — see `classTradition`
 * @returns {Array<{tradition: string, label: string, slots: number}>}
 */
export function grantedTraditions(featNames, level, ownTradition) {
  const own = String(ownTradition ?? "").trim().toLowerCase();
  return Object.entries(casterTierSlots(featNames, level))
    .filter(([tradition]) => tradition !== own)
    .map(([tradition, slots]) => ({
      tradition,
      label: TRADITIONS[tradition]?.label ?? tradition,
      slots
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Which ability score a Spellcraft check uses for a spell of this
 * tradition.
 *
 * Graham's ruling: each tradition's own ability score for its own spells.
 * Returns null when nothing should change — the caster's own tradition,
 * an unknown tradition, or a tradition they were never granted — so a
 * caller can tell "no swap" from "swap to the ability that happens to
 * match".
 *
 * @param {string} spellTradition
 * @param {Array<{tradition: string}>} granted from `grantedTraditions`
 * @returns {string|null} an attribute key, or null
 */
export function spellcraftAbilityFor(spellTradition, granted) {
  // A SPELL'S TRADITION IS A LIST, not a word. Guidance ships as
  // "divinity, ethereal, verdant" and an equality test against the whole
  // string matched none of the three — a granted Guidance would have kept
  // rolling off the caster's own ability with nothing to show it had been
  // considered.
  const wanted = String(spellTradition ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!wanted.length) return null;
  const hit = (granted ?? []).find((g) => wanted.includes(g.tradition));
  if (!hit) return null;
  return TRADITIONS[hit.tradition]?.ability ?? null;
}
