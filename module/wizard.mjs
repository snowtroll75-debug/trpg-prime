/**
 * The Wizard's derived abilities (Chapter 3), and the eight Wizard
 * Schools (their own item type/pack, added at 3.213.0) that sit beside
 * them.
 *
 * Arcane Bond (1st) is a daily choice — "During your daily preparation
 * each day, you can designate a single item you own as your bonded
 * item" — re-picked the same way Hunter's Method's and Blade Ally's
 * choices are, surfaced (not re-prompted) at Daily Preparation. The
 * bonus ladder ("+1... increasing by +1 every 6 levels") is real
 * arithmetic, `arcaneBondBonus` below.
 *
 * WHAT THE BONUS DOES was recorded here, for several releases, as
 * undefined: "'spell adder' is not defined anywhere in this pack's
 * source text outside this one sentence (grepped the whole of
 * classes.txt and magic.txt)". Two of those words did the damage — the
 * grep was real and it covered the wrong two files. The Spell Battery
 * familiar states the mechanic in full: "a +1 Spell Adder allowing you
 * to cast any one spell from your repertoire each day with no power
 * point cost". Four carriers printed the term and none of them did
 * anything. Since 3.332.0 it is one shared mechanic in
 * magic/spell-adder.mjs — N free casts a day, the whole cost including
 * warping (Graham's ruling, 18 Aug 2026).
 *
 * Wizard School (1st) splits into pieces that were ALREADY generic
 * infrastructure before this release, and pieces that needed new code.
 *
 *   Already generic: picking a school (the "Add Wizard School" button,
 *   picker-filters.mjs — the same mechanism Divine Aspect's own Add
 *   button uses), its class skill (class-skills.mjs's `schools` source),
 *   and its two levelled specialist spells (grants-workflow.mjs's
 *   GRANT_FIELDS "wizard-school" entry). None of that needed touching.
 *
 *   New this release: the DC modifiers every school grants ("+2 harder
 *   to resist, -2 easier to cast, for spells of your chosen school") —
 *   wired into cast-workflow.mjs off wizardSchoolCastingDCDelta/
 *   wizardSchoolSaveDCDelta below, matched against the spell's OWN
 *   traits text. This works because every school's name is ALSO a
 *   spell trait in the compendium — Alteration, Enchantment, Insight,
 *   Invocation, Shadow, Soul, Translocation and Warding all appear as
 *   trait words on the spells that belong to them (checked against the
 *   shipped spells pack: 55-119 spells per school), which is exactly
 *   the vocabulary this rule needs and already exists, rather than a
 *   new tagging scheme.
 *
 *   And the eight schools' own unique abilities — see the per-school
 *   notes below each export. Four have a real, computable effect
 *   (Alteration's Enhancement, Enchantment's Enchanting Smile, Insight's
 *   Forewarned, Invocation's Intense Spells, Warding's Resistance — five,
 *   not four); three do not, for reasons specific to each (Shadow, Soul,
 *   Translocation) — flagged rather than guessed at, the same discipline
 *   as Arcane Bond's own gap above.
 */

/** Does this actor carry the named class ability (item type "ability")? */
export function hasClassAbility(actor, name) {
  const wanted = String(name).trim().toLowerCase();
  return Array.from(actor?.items ?? []).some(
    (item) => item.type === "ability" &&
      String(item.name).trim().toLowerCase() === wanted
  );
}

/** The Arcane Bond ability item itself, or null. */
export function arcaneBondItem(actor) {
  return Array.from(actor?.items ?? []).find(
    (item) => item.type === "ability" &&
      String(item.name).trim().toLowerCase() === "arcane bond"
  ) ?? null;
}

/**
 * Arcane Bond's spell-adder ladder: "+1... At 6th level and then every 6
 * levels thereafter, the bonus... increases by +1." 1 at 1st-5th, 2 at
 * 6th-11th, 3 at 12th-17th, 4 at 18th-20th. Zero below 1st (the
 * character does not have the ability yet).
 */
export function arcaneBondBonus(level) {
  const value = Math.floor(Number(level) || 0);
  if (value < 1) return 0;
  return 1 + Math.floor(value / 6);
}

/** The wizard-school items on an actor — in practice at most one. */
export function schoolsOf(actor) {
  return Array.from(actor?.items ?? []).filter((item) => item.type === "wizard-school");
}

/**
 * Does a spell's traits text carry the given school's name as a whole
 * word? The match this pack's own spell data already supports — every
 * school name doubles as a spell trait (Alteration, Enchantment,
 * Insight, Invocation, Shadow, Soul, Translocation, Warding all appear
 * as trait words in the shipped compendium).
 */
export function wizardSchoolTraitMatches(schoolName, traitsText) {
  const word = String(schoolName ?? "").trim();
  if (!word) return false;
  const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return pattern.test(String(traitsText ?? ""));
}

/**
 * "All spells of your chosen school... reduce their Casting DC by 2."
 * Summed across every matching school (in practice a Wizard has one, but
 * the divine-aspect precedent sums sources rather than assuming a cap).
 */
export function wizardSchoolCastingDCDelta(schools = [], spellTraits = "") {
  return Array.from(schools ?? [])
    .filter((school) => wizardSchoolTraitMatches(school?.name, spellTraits))
    .reduce((total) => total - 2, 0);
}

/**
 * "All spells of your chosen school... increase their Save DC by 2."
 */
export function wizardSchoolSaveDCDelta(schools = [], spellTraits = "") {
  return Array.from(schools ?? [])
    .filter((school) => wizardSchoolTraitMatches(school?.name, spellTraits))
    .reduce((total) => total + 2, 0);
}

/**
 * Alteration's unique ability, Enhancement: "You gain a +1-status bonus
 * to either your Strength, Constitution or Dexterity. You may change
 * which ability score this affects during your daily preparation." A
 * real, mechanical, re-pickable choice — wired as an ActiveEffect on the
 * wizard-school item itself (feats-workflow.mjs's TYPE_AUTOMATION
 * "wizard-school" entry), the same `.status` slot Versatile's own
 * ability-score bonus already uses. Persists like Hunter's Method's
 * choice rather than being swept; surfaced at Daily Preparation.
 */
export const ALTERATION_ENHANCEMENT_KEYS = Object.freeze(["strength", "constitution", "dexterity"]);

/**
 * Enchantment's unique ability, Enchanting Smile: "+1 class bonus on
 * Deception, Diplomacy and Intimidate skill checks. This bonus increases
 * to +2 at 10th level and +3 at 20th level." A flat, passive, level-tiered
 * bonus with nothing to choose — wired into documents/actor.mjs's
 * prepareSkills via the addBonus pool, the same "typed bonus into the
 * pool" shape Divine Grace and Song & Dance both already use, gated on
 * owning the Enchantment wizard-school item.
 */
export const ENCHANTING_SMILE_SKILLS = Object.freeze(["deception", "diplomacy", "intimidate"]);

export function enchantingSmileBonus(level) {
  const value = Math.floor(Number(level) || 0);
  if (value < 1) return 0;
  if (value >= 20) return 3;
  if (value >= 10) return 2;
  return 1;
}

/**
 * Insight's unique ability, Forewarned: "a bonus on initiative checks
 * equal to your wizard level +10." Passive — wired into
 * documents/actor.mjs's initiative block via the addBonus pool, gated on
 * owning the Insight wizard-school item.
 */
export function forewarnedBonus(level) {
  const value = Math.floor(Number(level) || 0);
  if (value < 1) return 0;
  return value + 10;
}

/**
 * Invocation's unique ability, Intense Spells: "Any invocation spell
 * that you cast which inflicts damage increases its total damage by half
 * its PP cost." Half of the PP actually CHARGED for the cast (rounded
 * down, this pack's default everywhere), the same reading Conductive
 * Healing's identical "half the PP cost" clause already uses — wired
 * into cast-workflow.mjs, gated on owning the Invocation wizard-school
 * item AND the spell carrying the Invocation trait, folded into the
 * damage formula BEFORE Damage Reduction/resistance resolve (it is the
 * spell's own damage increasing, not a separate untyped packet).
 */
export function intenseSpellsBonus(totalPP) {
  return Math.floor((Number(totalPP) || 0) / 2);
}

/**
 * Warding's unique ability, Resistance: "resistance to an energy type of
 * your choice, chosen when you prepare spells... can be changed each
 * day. At 20th level, this resistance changes to immunity." The five
 * energy-grouped damage types (config.mjs's DAMAGE_TYPES) are exactly
 * "an energy type" as this pack's own vocabulary already defines it —
 * wired as an ActiveEffect appending to system.combat.resistances (or,
 * at 20th level, system.combat.immunities) the same ADD-mode text-list
 * convention every other immunity/resistance source already uses.
 * Persists and is surfaced at Daily Preparation, like Alteration's
 * Enhancement above.
 */
export const WARDING_ENERGY_TYPES = Object.freeze(["acid", "cold", "electricity", "fire", "sonic"]);

export function wardingResistanceField(level) {
  return Math.floor(Number(level) || 0) >= 20 ? "immunities" : "resistances";
}

/**
 * POWERFUL ILLUSION, and how it stopped being a gap.
 *
 * The ability printed "any illusion spell", and "Illusion" is not a
 * trait this pack's spell data carries anywhere. Refusing to guess was
 * right — building an illusion-detection heuristic would have been a
 * plausible-looking mechanism standing in for a real one — but refusing
 * to ASK was not, and the gap sat for several releases.
 *
 * GRAHAM'S RULING, 18 August 2026, restates the ability outright:
 *
 *   "Powerful Illusion: Any Shadow spell that you cast may have a 1 PP
 *    warping option applied to it for free."
 *
 * So the scope is the SCHOOL, which is a trait — 58 spells carry
 * Shadow — and the same axis every other school ability already uses.
 *
 * AND IT IS A CREDIT, NOT A MATCHING PRICE (his ruling on the reading).
 * Taken literally, "a 1 PP warping option" would only ever help the 8
 * Shadow spells that have an option costing exactly 1 PP; 19 more have a
 * cheapest option of 2 PP and would get nothing. As a 1 PP credit toward
 * whatever is warped, it reaches all 34 Shadow spells that have warping
 * options at all.
 *
 * WHY IT IS NOT `warpDiscountSchool`. Furini's heritage discount and
 * Menora's spell discount both floor at 1 — "a discount makes warping
 * cheaper but never free". This one is explicitly free, so it needs its
 * own channel with a floor of 0 rather than a parameter on that one; a
 * shared function with a `floor` argument would put two rules with
 * opposite intent one typo apart.
 */
export const POWERFUL_ILLUSION = Object.freeze({ school: "Shadow", value: 1 });

/**
 * Translocation's Summoner's Charm still names the "conjured" trait,
 * which this pack's spell data does not carry, and still needs a
 * summoning mechanism that does not exist. Flagged, not automated —
 * and now the only school ability that is.
 */
export const WIZARD_SCHOOL_GAPS = Object.freeze({
  Translocation: "Summoner's Charm names the \"conjured\" trait (not in this pack's spell data) and needs a summoning mechanism this pack does not have yet (the same gap Steed Ally's companion carries). Double the duration by hand."
});

/**
 * Soul's unique ability, Necroscope, is flavour with nothing to compute:
 * "you must make a Meditation skill check as if you were gathering
 * information" is exactly the ordinary Meditation check this sheet
 * already offers, themed rather than mechanically distinct — no bonus,
 * no DC, no new roll type. Printed as a reminder rather than built as a
 * redundant button.
 */
export const NECROSCOPE_NOTE =
  "Necroscope: converse with local spirits by making a Meditation check as if gathering information (as Diplomacy) — the ordinary Meditation roll, no separate mechanic.";
