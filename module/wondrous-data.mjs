/**
 * What each wondrous item actually DOES (Chapter 11).
 *
 * WHY THIS FILE EXISTS. `wondrous.mjs` has been able to PRICE a wondrous
 * item since 3.239.0 — add up what it does, read the level back off the
 * total. But the shipped items carried none of that structure: each one
 * had a paragraph of prose ending "The status bonus is +1." and nothing
 * a character sheet could read. Graham's report was exact — "wondrous
 * items don't seem to do anything when activated and invested." They
 * didn't. There was nothing there to do anything with.
 *
 * So this is the hand-typed half of a document diff, in the same shape
 * as armour-rune-data.mjs: every ability written out as structured data,
 * and the harness asserts each one against the item's own printed
 * sentence. A bonus recorded here that the prose does not print is a
 * failure, and so is a printed bonus with nothing recorded.
 *
 * WHAT IS APPLIED AND WHAT IS REPORTED. An ability with a `target` is
 * applied through the typed bonus pool the moment the item is invested.
 * An ability with `reported: true` prints on the sheet and is the
 * table's to adjudicate — because this system has nothing to apply it
 * to, not because it was too much trouble. Each one says which.
 *
 * `kind` is the cost table's own vocabulary (WONDROUS_MODIFIERS), so the
 * same entry that drives the sheet also prices the item, and the harness
 * checks the two agree with the level the chapter printed.
 */

const SKILL = (skill) => `system.skills.${skill}`;

/**
 * Keyed by the item's own name, exactly as the pack ships it.
 *
 * Note the curly apostrophe in Faith's Eye: it is the document's, and
 * matching on a straight one silently found nothing.
 */
export const WONDROUS_ABILITIES = Object.freeze({
  // "After wearing the belt (invested) for 24 hours … If you remove the
  // belt, you gain a status penalty to your Dexterity ability score for the
  // next 24 hours equal to the item's bonus" — `removalPenalty` (3.617.0,
  // C8 of block 37), applied by wondrous-use-workflow.mjs.
  "Agile Sash I": [
    { kind: "stat", value: 1, bonusType: "status", stat: "dexterity",
      target: "system.attributes.dexterity", label: "Agile Sash", removalPenalty: true }
  ],
  "Agile Sash II": [
    { kind: "stat", value: 2, bonusType: "status", stat: "dexterity",
      target: "system.attributes.dexterity", label: "Agile Sash", removalPenalty: true }
  ],
  "Agile Sash III": [
    { kind: "stat", value: 3, bonusType: "status", stat: "dexterity",
      target: "system.attributes.dexterity", label: "Agile Sash", removalPenalty: true }
  ],
  "Agile Sash IV": [
    { kind: "stat", value: 4, bonusType: "status", stat: "dexterity",
      target: "system.attributes.dexterity", label: "Agile Sash", removalPenalty: true }
  ],

  // "a +1-resistance bonus to Fortitude Saves and a +1-status bonus to
  // DR" — two abilities on one item, which is exactly the case the
  // pricing calculator was written for.
  "Amulet of Natural Resilience": [
    { kind: "saveBonus", value: 1, bonusType: "resistance", save: "fortitude",
      target: "system.combat.saves.fortitude", label: "Amulet of Natural Resilience" },
    { kind: "drBonus", value: 1, bonusType: "status",
      target: "system.combat.dr", label: "Amulet of Natural Resilience" }
  ],

  // HP is not a pooled target in this system — Tough already had to be
  // special-cased for the same reason — so it is marked and handled
  // where max HP is derived.
  "Belt of Vital Stamina": [
    { kind: "hp", value: 5, bonusType: "item", hp: true,
      label: "Belt of Vital Stamina" }
  ],

  // BRACERS OF ARMOUR are a suit of magical armour, not a bonus: they
  // have their own Base DR and their own HP pool, and go inert for an hour
  // when that pool empties. Graham's R17 of block 37 (3.617.0): the Base DR
  // is ARMOUR — the higher of it and worn armour's DR applies, never both;
  // a critical to an unarmoured location bypasses it; the pool absorbs
  // what the bracers' DR stops. One ability, priced once (two rows of the
  // same kind priced the bracers twice).
  "Bracers of Armour I": bracers(1, 20),
  "Bracers of Armour II": bracers(2, 30),
  "Bracers of Armour III": bracers(3, 40),
  "Bracers of Armour IV": bracers(4, 60),
  "Bracers of Armour V": bracers(5, 80),

  // "Any cleric or crusader that invests this item" — the PREREQUISITES
  // adjustment, and the one worked confirmation the chapter gives for
  // the whole pricing calculator (level 4 ability, ships at level 3).
  "Faith’s Eye": [
    { kind: "skillBonus", value: 1, bonusType: "status", skill: "perception",
      target: SKILL("perception"), label: "Faith’s Eye",
      requiresClass: ["cleric", "crusader"] }
  ],

  // FULL SIGHT (3.617.0, A10 of block 37; Graham's R20): "perceive the
  // world as though under the effects of True Seeing at will" — the spell
  // granted at will, as the other spell items are.
  "Full Sight": [
    { kind: "spell", spell: "True Seeing", frequency: "atWill",
      label: "Full Sight" }
  ],

  "Gloves of Vitality I": gloves(1, "1d4+4"),
  "Gloves of Vitality II": gloves(2, "3d4+12"),
  // THE DOCUMENT ONCE PRINTED "+15" HERE (Graham ruled it a stray digit,
  // 2026-08-10). The 3.7 page prints +3, so the old record of the misprint
  // is gone (3.617.0, A14 of block 37).
  "Gloves of Vitality III": gloves(3, "5d4+20"),

  // The sack's capacity is a container rule, and this system's
  // encumbrance counts what a character carries rather than modelling
  // containers. Reported with its number so the table can hold it.
  "Never-Ending Stash Sack I": sack(50),
  "Never-Ending Stash Sack II": sack(200),
  "Never-Ending Stash Sack III": sack(500),
  "Never-Ending Stash Sack IV": sack(1000),
  "Never-Ending Stash Sack V": sack(2500),

  // THE SPELL ITEMS reuse the Spell Effect rune's machinery exactly: an
  // innate spell granted while the item is invested, at the frequency
  // the entry prints. One mechanism, not a second one beside it.
  "Ring of Animal Friendship": [
    { kind: "spell", spell: "Charm Animal", frequency: "atWill",
      label: "Ring of Animal Friendship" }
  ],
  // RING OF PROTECTION (3.617.0, A10 of block 37): "a status bonus to your
  // DB based upon the items level", the chapter's standard DB item.
  "Ring of Protection I": protection(1),
  "Ring of Protection II": protection(2),
  "Ring of Protection III": protection(3),
  "Ring of Whispering Wind": [
    { kind: "spell", spell: "Whispering Wind", frequency: "daily",
      label: "Ring of Whispering Wind" }
  ],
  "Sash of Soaring": [
    { kind: "spell", spell: "Feather Fall", frequency: "atWill",
      label: "Sash of Soaring" },
    // FIXED AT TEN MINUTES (3.617.0, B16 of block 37): the grant carries
    // the duration and drops the spell's duration warps, so the free innate
    // budget cannot buy the hour.
    { kind: "spell", spell: "Fly", frequency: "daily", duration: "10 minutes",
      label: "Sash of Soaring",
      note: "with a 10-minute duration" }
  ],

  "Wizardry Ring I": wizardry(1),
  "Wizardry Ring II": wizardry(2),
  "Wizardry Ring III": wizardry(3),
  "Wizardry Ring IV": wizardry(4)
});

function bracers(dr, hp) {
  return [
    { kind: "baseDR", value: dr, bonusType: "item", armourHP: hp,
      label: "Bracers of Armour",
      note: `Base DR ${dr} as armour (the higher of it and worn armour's DR). The magical armour has ${hp} HP, drained by the damage its DR stops; at 0 the bracers go inert for 1 hour, then return at full HP.` }
  ];
}

function gloves(bonus, healing) {
  return [
    { kind: "skillBonus", value: bonus, bonusType: "item", skill: "medicine",
      target: SKILL("medicine"), label: "Gloves of Vitality" },
    // USABLE (3.617.0, C8 of block 37): the sheet's use button heals, once a
    // day, through wondrous-use-workflow.mjs. Still reported, so the item
    // card says what it does.
    { kind: "heal", value: 0, reported: true, formula: healing,
      activation: "Engage (1 AP)", frequency: "daily", reach: 5,
      label: "Gloves of Vitality",
      note: `Engage (1 AP), 1/day: heal an adjacent living creature ${healing} (essence; cannot harm undead).` }
  ];
}

function protection(bonus) {
  return [
    { kind: "dbBonus", value: bonus, bonusType: "status",
      target: "system.combat.defence", label: "Ring of Protection" }
  ];
}

function sack(capacity) {
  return [
    { kind: "container", value: 0, reported: true, capacity,
      label: "Never-Ending Stash Sack",
      note: `Holds ${capacity.toLocaleString("en-GB")} lbs and always weighs the same, whatever is in it.` }
  ];
}

function wizardry(bonus) {
  return [
    { kind: "spellAdder", value: bonus, bonusType: "item", reported: true,
      label: "Wizardry Ring",
      note: `Acts as a Spell Adder +${bonus}.` },
    { kind: "skillBonus", value: bonus, bonusType: "item", skill: "arcana",
      target: SKILL("arcana"), label: "Wizardry Ring",
      requiresArcaneCaster: true }
  ];
}
