/**
 * The canonical trait vocabulary.
 *
 * Two separate namespaces live in this project, and conflating them is
 * exactly the bug this file exists to prevent:
 *
 * - APPENDIX_TRAITS — Appendix 3. Carried by actions, spells, feats and
 *   effects, and read by the rules in module/traits.mjs.
 * - WEAPON_TRAITS — Chapter 6. Carried by weapons and ammunition, often
 *   with a value ("AR 1", "Powerful +2", "Range 80"), and read by the
 *   attack pipeline.
 *
 * The two collided on Penetrating, which meant one thing on a weapon
 * ("treats all armour as none within the first range increment") and a
 * different thing in Appendix 3 ("bypasses non-magical barriers and can
 * counteract magical ones"). Per Graham, the weapon trait keeps the name
 * Penetrating and the Appendix 3 trait becomes Penetrate.
 *
 * Kept as data rather than prose so tools/validate-traits.mjs can check
 * every trait string in the project against it — a typo like
 * "Concentration" for "Concentrate" is invisible at runtime and silently
 * disables whatever rule was meant to fire.
 */

/** Appendix 3, in the rulebook's own order. */
export const APPENDIX_TRAITS = Object.freeze([
  "acid", "advantage", "air", "alchemical", "aligned", "archetype", "attack",
  "auditory", "bomb", "bonus", "cantrip", "chance", "class", "cold",
  "composition", "concentrate", "conjured", "consumable", "contact",
  "conviction", "curse", "darkness", "defence", "detection", "dimensional",
  "downtime", "earth", "electricity", "elixir", "energy", "emotion", "essence",
  "explore", "fear", "fire", "flourish", "focus", "force", "healing",
  "heritage", "herb", "ingested", "injury", "invested", "light", "linguistic",
  "magical", "manipulate", "mental", "mindless", "minion", "morph", "movement",
  "open", "penetrate", "poison", "polymorph", "press", "race", "rare",
  "revelation", "ritual", "rod", "rage", "rune", "save", "school", "scrying",
  "secret", "sleep", "sonic", "splash", "staff", "stance", "teleportation",
  "tradition", "uncommon", "utility", "visual", "water", "word"
]);

/**
 * Sub-traits named inside Appendix 3's own entries: the five alignments
 * under ALIGNED, the four traditions under TRADITION, and the eight
 * schools under SCHOOL. All are legitimate trait strings in their own
 * right.
 */
/**
 * The Creature Codex's own traits (Chapter 3), which "expand upon those
 * found in the core rulebook".
 *
 * SIX OF THE SEVEN WERE NOT IN THE VOCABULARY AT ALL — including AURA,
 * which sixteen shipped Codex abilities print on their own trait line.
 * A trait string that is not in this file is a string nothing validates,
 * so a typo in it is invisible: the rule it was meant to reach simply
 * never fires and nothing says so. `mindless` was the only one already
 * here, because the core rulebook has it.
 *
 * Kept as its own list rather than merged into APPENDIX_TRAITS so the
 * provenance survives — Appendix 3 is the core rulebook's, and these are
 * a second book's additions to it. Both are valid; only one is Appendix 3.
 */
export const CODEX_TRAITS = Object.freeze([
  "aquatic", "aura", "elemental", "incorporeal", "spawn", "swarm"
]);

/**
 * What each of them says, and — the part that matters for planning —
 * whether the system does anything about it yet.
 *
 * `mechanised` is deliberately honest rather than aspirational. A trait
 * listed as mechanised must have code that reads it; one listed false is
 * a definition a GM applies by hand, and saying so here is what stops a
 * later reader assuming the system is enforcing something it is not.
 */
export const CODEX_TRAIT_NOTES = Object.freeze({
  aquatic: Object.freeze({
    label: "Aquatic",
    mechanised: false,
    // "do not incur the usual -2 penalty for being submerged" — and the
    // system has NO submerged rule at all, so the exemption exempts you
    // from nothing. V1.4 printed -10; V1.5 corrects it to -2, which is
    // the third of the document's own scale corrections.
    note: "Breathes water, not air. Exempt from the -2 submerged penalty for bludgeoning and slashing Strikes — a penalty this system does not yet apply."
  }),
  aura: Object.freeze({
    label: "Aura",
    mechanised: true,
    note: "An effect emanating from its creator in a radius that moves with them; anything beginning its turn inside, or entering, is subjected to it. Built in 3.255.0-3.270.0 — Regions on the canvas, save prompts, difficult terrain and ally conditionals."
  }),
  elemental: Object.freeze({
    label: "Elemental",
    mechanised: false,
    // Informational by its own wording: "will OFTEN possess immunity or
    // resistance". Often is not a rule, and deriving one from it would be
    // inventing the immunity the page declined to state.
    note: "Affiliated to one or more elemental planes and unharmed moving through them. Often, but not always, immune or resistant to its own element — which the page leaves to the creature."
  }),
  incorporeal: Object.freeze({
    label: "Incorporeal",
    // Its immunities join the shared immunity sets and are enforced by
    // the same code that already enforces an Ooze's. Its RESISTANCE is
    // returned as a note rather than applied: "all damage types except
    // force" needs to know whether the blow was magical, which is a fact
    // about the attack and not about the defender.
    mechanised: true,
    note: "Immune to non-magical attack forms and to precision damage; resistant to every damage type except force; passes through solid objects."
  }),
  spawn: Object.freeze({
    label: "Spawn",
    // DELIBERATELY STILL FALSE. The degree-shift is built and tested —
    // worsenDegree in codex-trait-rules.mjs — but nothing asks it: there
    // is no control-effect pipeline to ask from, and the feeding clause
    // needs Effective Level, which does not exist. A rule that exists and
    // is never called is not mechanised, and saying otherwise here is how
    // a later reader comes to believe the system is enforcing it.
    mechanised: false,
    note: "Forcibly reborn and bound to its creator. Injured 2 until it feeds on a creature of at least half its EL, on a 72-hour cycle; saves against control from its creator are treated one degree worse; lost only if the creator releases it or is destroyed."
  }),
  swarm: Object.freeze({
    label: "Swarm",
    // Same split: the four immunities are enforced; the Resistance to
    // targeted attacks, the Weakness to area effects and the halved DR
    // are returned as notes, because each turns on what the incoming
    // effect was.
    mechanised: true,
    // New in V1.5.
    note: "A mass acting as one creature. Immune to critical hits, precision damage, mental effects and reactions provoked by movement; Resistance to targeted attacks, Weakness to area effects; harms by occupying a creature's space, and halves the target's DR."
  })
});

export const APPENDIX_SUB_TRAITS = Object.freeze([
  "balance", "chaos", "evil", "good", "order",
  "arcane", "divinity", "ethereal", "verdant",
  "alteration", "enchantment", "insight", "invocation",
  "shadow", "soul", "translocation", "warding"
]);

/**
 * Chapter 6 weapon traits. Valued ones are listed by their bare name;
 * the value is parsed separately (see extractTraitValue in
 * combat/attack.mjs).
 */
export const WEAPON_TRAITS = Object.freeze([
  "2-handed", "agile", "ar", "backstab", "brace", "clumsy", "concealable",
  "deadly", "disarm", "double", "exotic", "finesse", "free hand", "free-hand",
  "grapple", "hand & a half", "keen", "load", "mechanical", "mighty",
  "nonlethal", "parry", "penetrating", "powerful", "propulsive", "quick load",
  "range", "reach", "serrated", "shove", "silent", "spin", "sweep", "thrown",
  "trip", "unsteady", "versatile", "versatile p", "versatile s", "volley"
]);

/**
 * Armour and shield traits (Chapter 6). A separate vocabulary again —
 * "Metal" and "Rigid" are material and construction facts, not Appendix 3
 * traits, and neither list should be validated against the other.
 */
export const ARMOUR_TRAITS = Object.freeze([
  "helm", "full helm", "metal", "rigid", "rigid full helm"
]);

/**
 * Gear traits. Free-text descriptors that the gear-uses machinery
 * matches on by pattern (see gear-uses.mjs), rather than a closed list —
 * these are the ones currently in use.
 */
export const GEAR_TRAITS = Object.freeze([
  "healer's tools", "material component pouch", "stores formulae", "stores spells"
]);

/**
 * Race-restricted weapons name their race in the trait string. Race
 * traits are open-ended by Appendix 3's own wording ("there are many
 * race traits"), so these are recognised rather than exhaustive.
 */
export const RACE_TRAITS = Object.freeze(["dwarf", "elf", "gnome", "halfling", "human", "orc"]);

/** Placeholders meaning "no traits", used in the source data. */
export const EMPTY_TRAIT_MARKERS = Object.freeze(["-", "--", "—", "n/a", "none"]);

/**
 * Traits that mean one thing on a weapon and another in Appendix 3, or
 * that are easily typed as each other. Used to turn a silent misfire
 * into a build-time error.
 */
export const CONFUSABLE_TRAITS = Object.freeze([
  {
    weapon: "penetrating",
    appendix: "penetrate",
    note:
      "Penetrating is the Chapter 6 weapon trait (ignores armour within the first range increment); Penetrate is the Appendix 3 trait (bypasses non-magical barriers)."
  }
]);

/** Known misspellings, mapped to what was meant. */
export const TRAIT_MISSPELLINGS = Object.freeze({
  concentration: "concentrate",
  defense: "defence",
  teleport: "teleportation",
  teleporting: "teleportation"
});
