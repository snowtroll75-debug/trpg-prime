/**
 * Skill Specialties (Core, Chapter 4) for Artistry, Crafting and Perform.
 * Pure data and logic; the Foundry side (per-actor selection, the feat-based
 * cap, the manager dialog) lives in skill-specialties-workflow.mjs, and the
 * check gate in action-workflow.mjs.
 *
 * These are DISTINCT from the system's "Specialist Skills" (`system.
 * specialistSkills`), which are whole player-defined skills. A specialty is a
 * sub-focus *within* one of these three skills: you pick one when you first
 * develop the skill, may only make the skill's trained checks in a specialty
 * you hold, and gain more only through the matching Specialist feat.
 *
 * Per Graham's rulings: a missing specialty **blocks** the check before any
 * cost; the number you may hold is **1 + one per matching Specialist feat**;
 * and only **trained** actions are gated (Artistry is treated like Crafting —
 * its untrained Recall Knowledge is not gated, despite the book omitting the
 * word "trained").
 */

/**
 * The three skills that have specialties. For each: the ability it keys off
 * (for reference), the name pattern that identifies its "additional
 * specialty" feat, the set of *trained* action keys whose checks require a
 * specialty, and the fixed specialty list (key, label, and the items/works
 * the book says it applies to — descriptive, adjudicated by the GM).
 *
 * `featNames` lists the feats whose presence raises the cap, matched
 * case-insensitively against feat item names, so the cap rises automatically
 * once one is added.
 *
 * IT WAS A "|"-SEPARATED STRING UNTIL 3.362.0, and that shape had already
 * caused one live bug: crafting's "specialist crafter|artificer" was
 * consumed with String#includes, so it was tested as one literal and matched
 * neither feat — no crafting feat in the game could raise the crafting cap.
 * The consumer was fixed and the shape was left. An array cannot be misread
 * that way, and it also lets the feat register see the feat name as a
 * quoted string, which a packed alternation hid.
 */
export const SKILL_SPECIALTIES = Object.freeze({
  artistry: {
    label: "Artistry",
    ability: "intelligence",
    featNames: Object.freeze(["Artistic Specialist"]),
    // Untrained: Recall Knowledge (not gated). Trained: Earn Income, Research.
    trainedActions: Object.freeze(["earnIncome", "research"]),
    options: Object.freeze([
      { key: "choreography", label: "Choreography", items: "Dance routines" },
      { key: "criticism", label: "Criticism", items: "Evaluation & discussion of art" },
      { key: "literature", label: "Literature", items: "Writing literature & poetry" },
      { key: "musicalComposition", label: "Musical Composition", items: "Writing music and song" },
      { key: "philosophy", label: "Philosophy", items: "Theory and purpose" },
      { key: "playwriting", label: "Playwriting", items: "Writing plays and theatre" }
    ])
  },
  crafting: {
    label: "Crafting",
    ability: "intelligence",
    // The Artificer archetype also grants one (common) crafting specialty,
    // so it raises the cap exactly as a Specialist Crafter pick does.
    featNames: Object.freeze(["Specialist Crafter", "Artificer"]),
    // Untrained: Evaluate, Recall Knowledge (not gated).
    // Trained: Create, Identify Alchemy, Repair, Research, Study Target.
    trainedActions: Object.freeze([
      "create",
      "identifyAlchemy",
      "repair",
      "research",
      "studyTarget"
    ]),
    options: Object.freeze([
      { key: "blacksmithing", label: "Blacksmithing", items: "Durable metal goods, including metal armour and weapons" },
      { key: "bookmaking", label: "Bookmaking", items: "Books and paper" },
      { key: "cooking", label: "Cooking", items: "Baking, brewing and meal prep" },
      { key: "fletching", label: "Fletching", items: "Bows, crossbows and their ammunition" },
      { key: "glassmaking", label: "Glassmaking", items: "Glass, including glassware and windows" },
      { key: "jeweller", label: "Jeweller", items: "Fine art, including jewellery" },
      { key: "leatherworking", label: "Leatherworking", items: "Leather goods, including leather armour" },
      { key: "pottery", label: "Pottery", items: "Ceramic goods" },
      { key: "shipbuilding", label: "Shipbuilding", items: "Ships and boats" },
      { key: "snares", label: "Snares", items: "Snares & traps" },
      { key: "stonemasonry", label: "Stonemasonry", items: "Stone goods and structures" },
      { key: "tailoring", label: "Tailoring", items: "Clothing" },
      { key: "weaving", label: "Weaving", items: "Textiles, baskets, and rugs" }
    ])
  },
  perform: {
    label: "Perform",
    ability: "charisma",
    featNames: Object.freeze(["Perform Specialist"]),
    // Chapter 4 table: Perform's only Trained action is Earn Income; Entertain
    // is Untrained. Earn Income is specialty-gated here to match Artistry
    // (which gates its own Earn Income), since performing for pay uses a known
    // form. Entertain is kept gated too — performing to an audience is the
    // whole of the skill, so it always draws on a specialty — even though it's
    // Untrained for the proficiency (rank) gate. That one exception is a
    // ruling, not the strict "trained only" rule; drop "entertain" here to make
    // Perform follow the strict tier rule instead.
    trainedActions: Object.freeze(["entertain", "earnIncome"]),
    options: Object.freeze([
      { key: "acting", label: "Acting", items: "Comedy, drama, pantomime" },
      { key: "comedy", label: "Comedy", items: "Buffoonery, limericks, joke-telling" },
      { key: "dancing", label: "Dancing", items: "Ballet, waltz, jig" },
      { key: "keyboard", label: "Keyboard", items: "Harpsichord, piano, organ" },
      { key: "percussion", label: "Percussion", items: "Bells, chimes, drums" },
      { key: "stringedInstruments", label: "Stringed Instruments", items: "Fiddle, harp, lute, mandolin" },
      { key: "windInstruments", label: "Wind Instruments", items: "Flute, pan pipes, trumpet" },
      { key: "singing", label: "Singing", items: "Ballad, chant, melody" },
      { key: "tales", label: "Tales", items: "Epic, storytelling" }
    ])
  }
});

/** The specialty option list for a skill, or []. */
export function specialtyOptions(skillKey) {
  return SKILL_SPECIALTIES[skillKey]?.options ?? [];
}

/** The label for a specialty key within a skill, or the key itself. */
export function specialtyLabel(skillKey, specialtyKey) {
  return specialtyOptions(skillKey).find((o) => o.key === specialtyKey)?.label ?? specialtyKey;
}

/**
 * Whether making `actionKey` through `skillKey` requires one of the skill's
 * specialties. True only for the skill's *trained* actions — a skill without
 * specialties, or one of its untrained actions, is never gated.
 *
 * @param {string} skillKey The skill the action was invoked through.
 * @param {string} actionKey The skill action being taken.
 * @returns {boolean}
 */
export function requiresSpecialty(skillKey, actionKey) {
  const config = SKILL_SPECIALTIES[skillKey];
  if (!config) return false;
  return config.trainedActions.includes(actionKey);
}

/**
 * How many specialties a character may hold in a skill: one for developing
 * the skill, plus one for each matching Specialist feat.
 *
 * @param {number} featCount Number of matching Specialist feat items held.
 * @returns {number}
 */
export function specialtyCap(featCount) {
  return 1 + Math.max(0, Math.trunc(Number(featCount) || 0));
}
