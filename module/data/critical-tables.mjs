/**
 * GENERATED DATA — extracted from TRG Prime Core, Chapter 7 (pages
 * 206-219). Regenerate from the rulebook rather than editing by hand.
 *
 * Content is verbatim, including two source defects recorded in the
 * development log: the Bludgeoning table's column header reads "d20 roll"
 * where every other table reads "d100 Roll" and the rows plainly run to
 * 100 (Graham, 21 September 2026, R17: "Should be d100"), and eleven
 * tables have no row for a roll of 33 (31-32 then 34-36).
 * lookupTableRow() falls back to the nearest lower row, so a 33 resolves
 * to the 31-32 entry until the rulebook is amended.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ARMOUR CLAUSES, AND WHY THEY ARE A LIST (3.580.0).
 *
 * A row's effect cell can carry more than one armour clause, and they
 * are not interchangeable:
 *
 *   "Bleeding 3 & falls prone. Armoured: Reduce bleeding by 1.
 *    Rigid Armoured: Reduce bleeding by 2."
 *
 * The previous extraction split on the literal "Armoured:" and kept a
 * single `armoured` string with an `armouredKind` of "metal" where it
 * noticed one. That lost two things at once, found in the pages 201-210
 * audit (D6, D7, D8):
 *
 *   - the word "Rigid" was left stranded on the END of the base effect
 *     text ("...Target is Stunned 2 and Injured 1. Rigid.") and printed
 *     on every card as though it were part of the injury;
 *   - the clause itself was filed as an ordinary armoured clause, so
 *     twenty rigid clauses applied to anyone wearing anything, and a
 *     second clause on the same row was concatenated into the first.
 *
 * Each row now carries `armourClauses`: an ORDERED list of
 * `{ kind, text }`, kind being "armoured", "metal", "rigid" or
 * "unarmoured". `selectArmourClause` in effect-parser.mjs picks the one
 * that matches the armour actually covering the struck location, most
 * specific first, and no clause at all when none qualifies.
 *
 * Row fields: min, max (inclusive d100 bounds; lookupTableRow clamps
 * modified results above 100 to the top row), persistence (M, D, UH, FR,
 * P, "-", "Surface Scrape", or a descriptor such as Death or Fatal),
 * effect, and optionally armourClauses.
 */

export const CRITICAL_TABLES = Object.freeze({
  "bludgeoning": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "A glancing strike leaves little more than a bruise. No additional effect."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "M",
      "effect": "Graze to shoulder Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Weakened 1." }
      ]
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "-",
      "effect": "Strong blow to knee throws foe off balance. No reactions for 1 turn.",
      "armourClauses": [
        { "kind": "armoured", "text": "until beginning of next turn." }
      ]
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "-",
      "effect": "Weak swing clangs off his armour. The attack inflicts +5 base damage.",
      "armourClauses": [
        { "kind": "armoured", "text": "+2 base damage." }
      ]
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "-",
      "effect": "Tear into foe leaving a nasty abrasion. Bleeding 1."
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "M",
      "effect": "Do that again; the sound his head made was pretty funny. Dazed 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 1." }
      ]
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "-",
      "effect": "Beat to forearm. Drops weapon or shield. If they aren't holding one, target Stunned 1."
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "D",
      "effect": "Blow to the upper leg, painful bruise. Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Weakened 1." }
      ]
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "-",
      "effect": "Heavy blow to foes chest. Stunned 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 1." }
      ]
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "You would hope that foe is wearing their codpiece. Stunned 2, +5 base damage;",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 1, +2 base damage." }
      ]
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "D",
      "effect": "An impressive sounding blow to the head doesn't faze foe. Dazed 1. +5 base damage."
    },
    {
      "min": 31,
      "max": 33,
      "persistence": "D",
      "effect": "Target attempts to block your attack with their hand and it hurts a bit. Target drops what they are holding and is Injured 1."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "-",
      "effect": "Clever blow to targets lower leg throws them off balance, leaving them on the floor. Target is Prone and Stunned 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "No Stun." }
      ]
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "-",
      "effect": "Your weapon comes down hard upon targets back as they attempt to avoid your attack. Target is Stunned 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 1." }
      ]
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "Oooh, straight in the crown jewels, that brings tears to the target’s eyes. Target is Stunned 1. They are also Flat-Footed until the end of their next turn.",
      "armourClauses": [
        { "kind": "armoured", "text": "No Stun." }
      ]
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "D",
      "effect": "Blow lands on the top of targets head, forcing them to re-evaluate their position. Target Stunned 1 and is Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 1 and Weakened 1." }
      ]
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "UH",
      "effect": "You break the targets fingers with a powerful blow. Target is Injured 1.",
      "armourClauses": [
        { "kind": "metal", "text": "Persistence becomes D." }
      ]
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "UH",
      "effect": "Heavy blow to targets foot breaks a toe or some other bone, target is unimpressed. Targets speed is reduced by 5 until healed and Stunned 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "No Stun." }
      ]
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "Blow to side: broken breath. Target is Stunned 2 and Injured 2 until the end of their next turn.",
      "armourClauses": [
        { "kind": "armoured", "text": "Injured 1." }
      ]
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "UH",
      "effect": "With an astonishing flurry of blows you push foe back 10’. Target is Stunned 1 & Injured 1."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "UH",
      "effect": "Impressive strike to the face removes a couple of targets teeth, target spits blood. Target is Bleeding 2, Dazed 1 & Stunned 1.",
      "armourClauses": [
        { "kind": "metal", "text": "Bleeding 1 & Stunned 1." }
      ]
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "UH",
      "effect": "Blow smashes weapon hand. Stunned 2, drops weapon, Injured 1.",
      "armourClauses": [
        { "kind": "metal", "text": "Ignore the Stunned." }
      ]
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "UH",
      "effect": "Say goodbye to his knee. Foe drops prone. Stunned 2, Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Ignore the Stunned." }
      ]
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "UH",
      "effect": "Side strike breaks ribs. Target is Stunned 2 and Injured 1.",
      "armourClauses": [
        { "kind": "rigid", "text": "Ignore the Stunned." }
      ]
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "-",
      "effect": "Target is caught unaware by your low blow. Target is Stunned 2 and Sickened 2."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "UH",
      "effect": "You hit foe right in their eye and it splits like an over-ripe fruit, Injured 1. Eye can be healed but -1 visual perception until regenerated."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "UH",
      "effect": "A powerful strike breaks foes arm. Bleed 2, Stunned 1, Injured 1 & +5 base damage."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "UH",
      "effect": "Blow to thigh. Stunned 1 Injured 2.",
      "armourClauses": [
        { "kind": "armoured", "text": ", Stunned 1, Injured 1." }
      ]
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "-",
      "effect": "Downward blow connects heavily with targets chest. Target's armour also takes the damage (if target has no armour use '69' result instead) and target is Stunned 2."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "UH",
      "effect": "Seriously cheeky attack lands below targets waist, striking a crucial area. Target is Sickened 3, Stunned 1 and Flat-Footed until the end of their next turn.",
      "armourClauses": [
        { "kind": "armoured", "text": "No Stun." }
      ]
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "-",
      "effect": "Epic strike to targets head leaves them seeing stars. Target is Stunned 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 1." }
      ]
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "P",
      "effect": "Blow to shoulder and upper arm. Arm is broken and useless: Stunned 2 & Injured 1."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "P",
      "effect": "Blow to the knee, makes a sickening noise. Target is knocked Prone & Injured 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "The Injured is lowered to 1." }
      ]
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "-",
      "effect": "Big hit to targets chest pushes them back and makes them squeal in pain. Target is pushed back 10', Stunned 2. +50% critical damage."
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "P",
      "effect": "Abdomen strike. Target is doubled over in pain: Stunned 1, Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "+5 base damage & Injured 1." }
      ]
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "P",
      "effect": "Crack to the side of the head leaves target concussed with ringing ears. Target is Deafened until healed, Injured 2 & Bleeding 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Injured 2, Bleeding 2 and Dazed 1." }
      ]
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "P",
      "effect": "Blow shatters elbow in weapon arm. Arm useless and Injured 2, Stunned 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Injured 1, Stunned 1." }
      ]
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "P",
      "effect": "Blow to hip crushes bones. Stunned 3 and Injured 3. Targets knocked Prone.",
      "armourClauses": [
        { "kind": "armoured", "text": "Ignored the Stunned." }
      ]
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "P",
      "effect": "Mighty blow to chest. Targets knocked Prone and drops any weapons, Stunned 2, Injured 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 2 & Injured 1." }
      ]
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "P",
      "effect": "Powerful blow to lower abdomen crushes a variety of innards. Stunned 1, Bleeding 6, Injured 3.",
      "armourClauses": [
        { "kind": "armoured", "text": "No Bleeding." }
      ]
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "P",
      "effect": "Targets nose is splattered across their face in graphic display of violence. Target Injured 2 & Stunned 1. Target has no sense of smell until healed.",
      "armourClauses": [
        { "kind": "armoured", "text": "Ignored the Stunned." }
      ]
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "Heavy strike drives targets shoulder into their torso, squishy."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "Target leaps to avoid your strike and takes the blow between the legs, it looks messy. Target is prone and dies from shock."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "You crush the target like a bug, smashing their chest and breaking their shield arm. No longer able to breathe or pump blood, target mercifully dies a few seconds later."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "You are pretty sure that your weapon has replaced theirs. Pulling that weapon out will be messy and foe is very dead."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "Skull obliterated. Target dies instantly."
    }
  ],
  "piercing": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "A nick and little else. Target suffers no additional effect."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "-",
      "effect": "Attack stabs the target through the hand drawing some blood, it looks worse than it is. Bleeding 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 1." }
      ]
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "-",
      "effect": "Attack pierces targets leg and draws blood. Bleeding 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 1." }
      ]
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "M",
      "effect": "Strike creates a nice hole in targets side. Target is Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Surface Scrape." }
      ]
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "M",
      "effect": "Attack is very close to striking a vital area. Target stumbles back to avoid. Target is pushed back 5' and Flat-Footed."
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "-",
      "effect": "Blow draws a nasty cut across targets forehead. Bleeding 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 1." }
      ]
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "-",
      "effect": "The attack enters targets shoulder drawing an angry shout of pain. Bleeding 3.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 1." }
      ]
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "D",
      "effect": "Your attack creates a nasty looking hole in targets lower leg. Bleeding 2 & Weakened 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 2." }
      ]
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "D",
      "effect": "The attack grazes targets side, there appears to be some blood. Bleeding 2 & Flat-Footed.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 2." }
      ]
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "That attack was very close to embarrassing the target, it strikes the thigh instead. Target is Stunned 1."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "D",
      "effect": "Blood is not supposed to flow from the target’s ears; target does not seem to be so happy about it. Bleeding 3.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 2." }
      ]
    },
    {
      "min": 31,
      "max": 33,
      "persistence": "-",
      "effect": "Target is horrified at your attempt to disembowel them, your strike is wide however and slashes across the targets lower arm, it bleeds, nonetheless. Bleeding 3."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "D",
      "effect": "Target is extremely concerned with the amount of blood on their foot. Bleeding 3 & Stunned 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Ignore Stunned." }
      ]
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "D",
      "effect": "Target displays an expression of horror at the hole in their chest. Bleeding 2 & Stunned 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 1 & Stunned 1." }
      ]
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "D",
      "effect": "Attack pierces the targets stomach to great effect. Bleeding 1 & Weakened 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Weakened drops to 1." }
      ]
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "D",
      "effect": "Target has a close look at that attack as it nearly takes out an eye. Bleeding 3 & Dazzled until the bleeding has stopped.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding reduced by 1." }
      ]
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "UH",
      "effect": "Your attack drives into targets shoulder and brings forth a surprised cry. Target is Weakened 2 & Bleeding 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce the Bleeding by 1." }
      ]
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "UH",
      "effect": "Target may be limping for a while after that nasty strike to the lower leg. Target is Weakened 1 & has a -5-speed penalty."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "UH",
      "effect": "There should be no blood leaking from targets chest… there is however. Bleeding 3 & Injured 1 until the bleeding stops.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding reduced by 1." }
      ]
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "UH",
      "effect": "Attack drives hard into targets lower back as they twist to avoid it. Target is Injured 2."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "-",
      "effect": "Targets cheek explodes under the impact of the attack. Bleeding 3, Stunned 1 and must make a DC 5 flat check to cast verbal spells until the bleeding stops.",
      "armourClauses": [
        { "kind": "rigid", "text": "Ignore the Stunned" }
      ]
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "UH",
      "effect": "Targets arm looks as if it may not work for a while. Target is Injured 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Injured 1 & +4 base damage." }
      ]
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "-",
      "effect": "Target is thrown off balance and cries out in pain as your attack strikes them in the upper leg. Bleeding 2 & -10-speed penalty until the bleeding ends.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding reduced by 1." }
      ]
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "UH",
      "effect": "The attack creates a jagged line across the target’s chest. Target is Injured 2.",
      "armourClauses": [
        { "kind": "rigid", "text": "Injured 1." }
      ]
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "UH",
      "effect": "Attack drives into targets stomach, causing target to scream out to the heavens. Bleeding 2 & Injured 2 until the bleeding ends.",
      "armourClauses": [
        { "kind": "armoured", "text": "Injured reduced by 1." }
      ]
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "UH",
      "effect": "You are pretty certain that the part of targets head that has just detached with your attack was important…. we shall see! Bleeding 3 & Injured 1.",
      "armourClauses": [
        { "kind": "rigid", "text": "Bleeding reduced by 1." }
      ]
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "UH",
      "effect": "Attack opens a ragged wound in targets shoulder. Bleeding 3 & Injured 2 until the bleeding stops.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding reduced by 1." }
      ]
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "UH",
      "effect": "Attack pierces targets upper leg, causing mobility issues. Target is Injured 2 & Bleeding 1."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "UH",
      "effect": "Attack drives under targets armpit and into their chest…there is a lot of blood. Bleeding 3 & Injured 2 until the bleeding ends.",
      "armourClauses": [
        { "kind": "rigid", "text": "Reduce Bleeding by 1." }
      ]
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "Target deflects your blow and stops it from impaling them, it instead strikes them in the stomach. Bleeding 3 & Flat-Footed until the end of their next turn."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "UH",
      "effect": "Attack streaks across targets face, causing them some problems with their vision. Target is Blinded and Stunned 1.",
      "armourClauses": [
        { "kind": "rigid", "text": "Ignore the Stunned." }
      ]
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "-",
      "effect": "One of targets hands is pinned to their shoulder. Bleeding 4 & cannot use the hand until the bleeding ends.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "-",
      "effect": "Attack appears to have hit an artery in targets leg…so much blood. Bleeding 5.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 4." }
      ]
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "P",
      "effect": "Attack tears into targets chest leaving a ragged wound. Bleeding 4 & Weakened 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "-",
      "effect": "Attack tears into targets stomach producing a lot of blood and guts. Bleeding 4 & Sickened 3.",
      "armourClauses": [
        { "kind": "armoured", "text": "Sickened reduced by 1." },
        { "kind": "rigid", "text": "Sickened reduced by 2." }
      ]
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "P",
      "effect": "One of targets eyes pops like a grape. Target is at a -2 penalty to all ranged and visual actions until the eye is restored. Bleeding 3."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "P",
      "effect": "Clinical strike to targets elbow causes the arm to spasm in a bizarre fashion. Target drops what they are holding and is Injured 2."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "P",
      "effect": "Attack penetrates the targets lower leg causing damage to the muscles and tendons. Target has a -5 penalty to speed and is Injured 2. +5 base damage."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "P",
      "effect": "Attack drives in between targets ribs and opens up a sizeable wound…which bleeds a lot. Bleeding 4 & Stunned 2.",
      "armourClauses": [
        { "kind": "rigid", "text": "Bleeding reduced by 1." }
      ]
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "P",
      "effect": "Attack stabs into the targets hip, damaging something vital. The target limps back in pain. Target is pushed back 5' and Injured 3."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "P",
      "effect": "Your point goes through targets cheek and lodges in the back of their throat. +10 base hits, Bleeding 2, Stunned 2, Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding reduced by 1." }
      ]
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "The attack rips one of targets hands clean off, leaving a trail of blood. Target has lost a hand and has Bleeding 3."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "The target could probably use the knee which you have just shattered. Bone fragments within the target’s bloodstream will prove fatal. Targets speed reduced to 5’."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "Your attack penetrates the targets lungs and heart. Target is dead."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "The attack tears through the targets stomach and straight out of their back. Target drops and is dead."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "Attack passes through eye into brain. Instant death."
    }
  ],
  "slashing": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "A shallow slash leaves a superficial cut. No mechanical effect."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "M",
      "effect": "Attack hacks away at the targets wrist and comes very close to severing the hand, not close enough though. Bleeding 1 & Flat-Footed.",
      "armourClauses": [
        { "kind": "armoured", "text": "Negate bleeding." }
      ]
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "M",
      "effect": "Deft swipe across targets knee causes them to jump back in pain. Target is pushed back 5' and Flat-Footed."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "-",
      "effect": "You attempt to drive your weapon though targets chest. Target avoids your blow at the last second but takes a nasty gash to the side. Bleeding 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 1 +2 base damage." }
      ]
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "M",
      "effect": "As target avoids your main strike, you whack them hard on the buttocks. Damage type changes to Bludgeoning and target is Flat-Footed, +2 base damage"
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "-",
      "effect": "Nick the side of targets face with a precise strike. Bleeding 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 1." },
        { "kind": "rigid", "text": "Surface Scrape." }
      ]
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "-",
      "effect": "Attack catches the target just above the elbow and opens a nasty wound. Bleeding 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 1 & +4 base damage." }
      ]
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "-",
      "effect": "You attempt to sweep targets legs out from them and strike solidly; target must learn to dodge better. Bleeding 1 & +5 base damage"
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "-",
      "effect": "Slash across targets chest produces some blood, target looks unimpressed. Bleeding 2 & Stunned 1.",
      "armourClauses": [
        { "kind": "rigid", "text": "Bleeding reduced by 1." }
      ]
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "Wicked strike to targets groin produces a lot of blood, target is in a lot of pain. Bleeding 3 & +4 base damage."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "M",
      "effect": "If your intent was to give target a shave, then you will have to better. Bleeding 2 & Flat-Footed.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding reduced by 1." }
      ]
    },
    {
      "min": 31,
      "max": 33,
      "persistence": "D",
      "effect": "Target brings their arm up to bear, perhaps thinking that they can stop your blow…. wrong. Bleeding 1 & Weakened 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Negate bleeding." }
      ]
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "D",
      "effect": "The target is certain that you trying to cut off their leg, they may well be right. Target is Injured 1 & Bleeding 1."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "D",
      "effect": "Vicious slash across targets chest creates a lot of blood. Bleeding 3.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 2. Rigid Armour: Bleeding 1." }
      ]
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "D",
      "effect": "Attack drives into targets stomach; this may be serious. Bleeding 2 & Injured 1."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "D",
      "effect": "You take off the top of targets ear with precise attack. Bleeding 2 & Stunned 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "reduce bleeding by 1." }
      ]
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "-",
      "effect": "Was that one of targets fingers that just went flying. Bleeding 2 & Injured 2 until the bleeding has stopped."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "-",
      "effect": "You tear away at the skin above the target’s knees. Bleeding 2 & Injured 2 until the bleeding stops.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "You are certain that the large hole which you have just created in targets chest will hurt a little. Bleeding 3 & Stunned 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "UH",
      "effect": "Your attempt to disembowel target is nearly successful. Bleeding 2 & Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "UH",
      "effect": "Vicious swipe catches the target just below the chin in attempt to slash their throat. Bleeding 2 & Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "-",
      "effect": "Target should not use their arms to shield incoming attacks. Bleeding 1 & Weakened 2 until the bleeding ends.",
      "armourClauses": [
        { "kind": "rigid", "text": "Weakened 1 until the bleeding ends." }
      ]
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "-",
      "effect": "A vicious hack to targets lower leg must open a blood vessel or something. Bleeding 3 & falls prone.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." },
        { "kind": "rigid", "text": "Reduce bleeding by 2." }
      ]
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "-",
      "effect": "A savage attack opens a large flap of skin on targets chest, which bleeds. Bleeding 4 & Injured 1 until the bleeding ends.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." },
        { "kind": "rigid", "text": "Reduce bleeding by 2." }
      ]
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "UH",
      "effect": "Attack comes up between targets legs and then stops with a sudden crunch that is not going to bode well. Target is Injured 2."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "-",
      "effect": "You are pretty sure that you have witnessed the end of targets nose as it flutters to the ground. Bleed 3 & Injured 1 until the bleeding ends.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "UH",
      "effect": "You slice into the targets arm almost severing their hand. Bleeding 3 & Injured 2.",
      "armourClauses": [
        { "kind": "rigid", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "UH",
      "effect": "Attack drives heavily into targets thigh, blood spurts in your face. Bleeding 3 & Injured 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce Injured by 1." }
      ]
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "-",
      "effect": "Attack drives into the target’s chest with some power. Target is left reeling and bleeding.  Target is pushed back 5' and is Bleeding 3.",
      "armourClauses": [
        { "kind": "rigid", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "Target is thrown off balance, allowing you an opening with one of its allies. You may make a free attack with your current MAP against an adjacent target, or against the current one if none are available. The attack inflicts +5 base damage."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "-",
      "effect": "Attack slashes the target across the throat. Bleeding 3, Injured 2 and cannot speak until the bleeding ends.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." },
        { "kind": "rigid", "text": "Reduce bleeding by 2." }
      ]
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "UH",
      "effect": "Attack hacks into the targets arm just above the elbow, the arm hangs limp and useless. Target is Injured 2 and cannot use the arm."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "-",
      "effect": "Punishing slash across targets thigh opens an artery. Bleeding 4."
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "-",
      "effect": "Attack slashes the target from shoulder to stomach. Bleeding 4.",
      "armourClauses": [
        { "kind": "rigid", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "-",
      "effect": "Attack slashes the target from shoulder to stomach. Bleeding 4.",
      "armourClauses": [
        { "kind": "rigid", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "P",
      "effect": "Attack destroys one of targets eyes…brutal. Target is at a -2 penalty to all ranged & visual actions until the eye is restored. Bleeding 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "P",
      "effect": "The target brings their hand up to ward off your blow and loses several fingers for their trouble…ouch. Target is Injured 2 and Bleeding 2.",
      "armourClauses": [
        { "kind": "rigid", "text": "Reduce bleeding by 1." }
      ]
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "P",
      "effect": "Your blow comes down heavily upon targets kneecap…something breaks. Target has a -5 penalty to speed and is Injured 2."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "P",
      "effect": "Bloody slash across the chest, breaks the targets armour straps and leaves a bloody trail.",
      "armourClauses": [
        { "kind": "armoured", "text": "Bleeding 3 and armour falls off." },
        { "kind": "unarmoured", "text": "Bleeding 4." }
      ]
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "-",
      "effect": "Attack is a vicious slash into targets belly which almost disembowels them. Target does not look pleased. Bleeding 3 & Injured 2 until the bleeding ends."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "P",
      "effect": "Attack drives into the corner of targets mouth and cuts deep, slashing tongue. The target cries out in pain and spits blood at your feet. Bleeding 2. Target must also make a DC 25 flat check to cast verbal spells and Injured 2 until."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "Arm severed below the shoulder. Bleeding 5."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "Leg severed at the thigh. Bleeding 4 and speed reduced to 5’. Target collapses."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "You drive your weapon directly through the target’s chest, destroying the heart and other vital organs."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "Your attack cuts the target into two pieces."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "A clean slice through the targets head separates head from body."
    }
  ],
  "subdual": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "No additional effect."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "-",
      "effect": "Solid strike to targets arm forces them to drop one item which they are carrying."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "M",
      "effect": "Your attempt to knock the target prone does not work, target is thrown off balance. Target is Flat-Footed."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "-",
      "effect": "Blow to the chest pushes target back. Target is pushed back 5'."
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "M",
      "effect": "Low blow brings tears to targets eyes; you have a little sympathy. Target is Flat-Footed.",
      "armourClauses": [
        { "kind": "armoured", "text": "Surface Scrape." }
      ]
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "-",
      "effect": "Impressive attack lands upon the top of targets head, ouch. Stunned 1 & +5 damage."
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "M",
      "effect": "A fine blow to the targets shoulder leaves them slightly off balance. Target drops what they are holding and is Flat-Footed.",
      "armourClauses": [
        { "kind": "armoured", "text": "No dropped item." }
      ]
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "D",
      "effect": "You knock targets feet out from under them with this strike. Target is prone.",
      "armourClauses": [
        { "kind": "armoured", "text": "Dazed 1." }
      ]
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "-",
      "effect": "Target is slightly winded by your attack. Target is Fatigued 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 1." }
      ]
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "That is not a nice place to strike your target. Target is Sickened 1."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "M",
      "effect": "Attack catches the target completely unaware and knocks them back. Target is pushed back 5' and Flat-Footed."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "M",
      "effect": "You have either given the target a dead arm, or a broken one, only time will tell. Target is Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 1." }
      ]
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "M",
      "effect": "A well-placed strike finds a vital spot just above the targets knee. Target falls prone and is Weakened 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Weakened reduced by 1." }
      ]
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "-",
      "effect": "That blow certainly takes the breath out of targets lungs, they are winded. Target is Stunned 2 & +4 base damage"
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "That blow takes the target in the stomach and doubles them over. Target is Dazed 2 & Sickened 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce Dazed by 1." }
      ]
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "D",
      "effect": "That strike makes target think a little bit more about your prowess. Target is Dazed 2 and Flat-Footed until the end of their next turn."
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "UH",
      "effect": "Target seems surprised by your expert blow to their shoulder. Target drops what they are holding and is Weakened 1."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "D",
      "effect": "Your clever attack lands heavily upon the targets knee. Target falls prone and drops one item they are holding. Target is Injured 1."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "Target is heavily winded by your strike. Target is Stunned 3.",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 2." }
      ]
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "-",
      "effect": "Hefty attack lands in the vulnerable. Target is Sickened 2, +5 base damage.",
      "armourClauses": [
        { "kind": "armoured", "text": "Stunned 2. +5 base damage." }
      ]
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "M",
      "effect": "Targets eyes roll into the back of their head. Target is Stunned 2 and is Injured 1 until the end of their next turn.",
      "armourClauses": [
        { "kind": "armoured", "text": "Reduce Stunned by 1." }
      ]
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "-",
      "effect": "That blow brings a cry of pain from the target; shoulder may be dislocated. Bleeding 1 & Weakened 2 until bleed ends."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "M",
      "effect": "Your attempt to kneecap your target needs some work. Target is Flat-Footed and Stunned 2. +4 base damage."
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "-",
      "effect": "You knock target back and make them reconsider this conflict. Target is pushed back 5' and Stunned 2."
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "M",
      "effect": "Fighting dirty will get you nowhere, unless of course you connect with targets groin, that looks sore. Target is Flat-Footed and Injured 2 until the end of their next turn"
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "M",
      "effect": "Strong blow makes a solid connection to the bottom of targets jaw. Target is Stunned 2 and is Injured 2."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "M",
      "effect": "Punishing strike disarms target and causes them some discomfort. Target drops one held item, is Stunned 1 and is Injured 2.+4 base damage"
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "UH",
      "effect": "Targets leg breaks just below the knee; target cries out in pain. Target takes a -5-speed penalty and is Stunned 1."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "-",
      "effect": "Impact to targets chest is impressive. Target is Stunned 2 and is Injured 2 until the Stunned condition ends."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "That was a dirty blow to targets groin and they may make you pay for it. Target is Stunned 3."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "UH",
      "effect": "A deft strike to targets head puts them down. Target is Unconscious."
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "-",
      "effect": "One of targets arms breaks under the force of your blow. Arm is broken and useless. +5 base damage."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "-",
      "effect": "Clever feint throws the target off balance, and they end up face down on the floor. Target falls prone and is Stunned 2. +5 base damage"
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "D",
      "effect": "Target is heavily winded by your ingenious manoeuvre. Target is Stunned 2 & Immobilised. +5 base damage"
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "UH",
      "effect": "Target is thrown to the ground by the impact of your strike. Target is Prone & Dazed 2."
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "D",
      "effect": "Wow, that was some strike. Targets feet lift off the ground, and they are out like a light. Target is Unconscious."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "UH",
      "effect": "One of targets arms breaks with your impressive strike. The target is Flat-Footed until the end of their next turn."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "UH",
      "effect": "Crippling strike to targets lower leg leaves them in considerable pain. Target has a -10-speed penalty and Injured 1."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "P",
      "effect": "Something breaks in targets torso…maybe a rib or too. Target is having some breathing issues. Target is Injured 2. +5 base damage."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "UH",
      "effect": "Target is now viewing you as the sneaky opponent that you are…viewing through the tears in their eyes after your low blow to targets groin. Target is Injured 2 & Sickened 2. +5 base damage"
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "-",
      "effect": "Your blow hits targets square on the temple. Bleeding 2 & Unconscious until the bleed ends."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "Overwhelming force crushes the spine. Target becomes Paralyzed until restored to positive HP."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "Severe blunt trauma causes systemic collapse. Target collapses and becomes Unconscious."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "Target falls into a coma from the impact. Target becomes Unconscious and cannot be revived for 1d4 hours."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Fatal",
      "effect": "Brain trauma causes paralysis. Target is Paralyzed."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Fatal",
      "effect": "Skull is fractured and brain damage occurs. Target is Unconscious and Dazed 6."
    }
  ],
  "acid": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "No additional effect."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "-",
      "effect": "A nasty burn on targets upper arm causes them to cry out sharply. Target is taking 1 recurring damage."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "-",
      "effect": "The acid splashes across foes upper legs causing them a sharp intake of breath and making their eyes water. Foe is taking 1 recurring damage."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "-",
      "effect": "Acid scorches the targets chest burning a small hole in their clothing (or leaving a black scorch mark if unclothed). Foe is taking 1 recurring damage."
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "-",
      "effect": "Acid is fine in the stomach, but not on the flesh outside of it. Foe is taking 1 recurring damage."
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "M",
      "effect": "Acid splashes across the targets face and forces them to turn away suddenly. Target is Dazzled."
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "-",
      "effect": "Some very nasty burns appear on targets hands. Target drops one item they are holding and is taking 2 recurring damage."
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "-",
      "effect": "Acid clings to targets legs causing them to lose their balance whilst screaming out in pain. Target falls prone."
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "-",
      "effect": "Target turns to avoid the attack, the acid sprays across their back making them scream. Target is Sickened 1."
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "How did that acid get into targets pants. Target hops around yelping and is Stunned 1."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "M",
      "effect": "Splatter across the top of targets head removes some hair and causes a nasty burn. Target is Flat-Footed. +5 base damage."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "D",
      "effect": "One of targets arms is engulfed by the acid. Target has trouble holding anything held and cries out as the acid burns.  Target must make a Reflex save to avoid dropping item and is Injured 1."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "-",
      "effect": "Acid burns the bottom of targets feet. If target has a foot covering it is broken and target takes 1 recurring damage. With no foot covering the target takes 3 recurring damage."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "M",
      "effect": "Acid strikes squarely in the chest, throwing the target off balance. Target is pushed back 10' and is Flat-Footed."
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "Acid opens up a nasty hole in the targets stomach, something is leaking. Target is Bleeding 3."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "M",
      "effect": "Acid strikes the targets eyes. That must have hurt a little. Target is Blinded & Dazed 1."
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "D",
      "effect": "Severe burns to the target’s hands cause them to cry out in pain. Target is Injured 2."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "-",
      "effect": "Acid knocks target from their feet and sends them sprawling. Target is knocked back 10' and falls prone. +5 base damage."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "Acid assaults the targets ribs, causing noxious smoke to ascend upwards. Target is Sickened 2 and takes 1 recurring damage."
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "-",
      "effect": "I am not sure that the stomach is supposed to burn. Recurring 4.",
      "armourClauses": [
        { "kind": "metal", "text": "Recurring 2." }
      ]
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "M",
      "effect": "Acid strikes the targets face. That must have hurt a lot. Target is Blinded and is taking 1 recurring damage."
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "UH",
      "effect": "Acid lands on one of targets arms and spreads quickly to their shoulders. Target is Injured 1 & Stunned 1."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "UH",
      "effect": "Targets legs smoulder and they gasp in surprise at the unexpected discomfort. Target takes a -5 penalty to speed & Injured 1."
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "-",
      "effect": "Acid burns through the target’s torso, that hurts a lot. Recurring 5.",
      "armourClauses": [
        { "kind": "armoured", "text": "Recurring 3." }
      ]
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "-",
      "effect": "A burning groin is not a pretty sight, as the target learns between screams. Target takes 5 recurring & Stunned 1."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "D",
      "effect": "Is the flesh on targets supposed to drip?. Target takes 5 recurring & Injured 1."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "UH",
      "effect": "Acid assaults the targets forearm, causing severe burn damage. Target takes 2 recurring damage & Injured 2."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "-",
      "effect": "The blast rips through targets legs, taking them off their feet. Target is knocked prone and Stunned 2. +2 base damage."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "-",
      "effect": "Targets chest releases toxic fumes from the acidic burn. Target is Sickened 2 & Stunned 1. All adjacent characters must make a Fortitude save or be Sickened 1."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "Acid splatters across the targets stomach bringing a cry of agony. Target takes 6 recurring damage."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "UH",
      "effect": "Acid burns into an ear destroying it completely. Target takes a -2 penalty to hearing based perception checks and is Injured 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "2 AP to remove helm and avoid Injured." }
      ]
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "UH",
      "effect": "Target brings their hands up to shield themselves from the acid, and it burns. Target takes 6 recurring damage, is Injured 1 & Flat-Footed until the end of their next turn."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "UH",
      "effect": "One of targets feet is burnt beyond recognition by the acid. Target falls prone and takes a -5 penalty to speed. +2 base damage"
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "UH",
      "effect": "Target twists to avoid the attack and the acid tears into their side. Target is Injured 2. +10 base damage."
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "-",
      "effect": "The acid covers the target for a few seconds making them scream. Foe takes 6 recurring damage."
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "UH",
      "effect": "Target loses hair and skin from the top of their head. Target is Injured 2 & Flat-Footed until the end of their next turn."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "P",
      "effect": "Acid burns foes hand away leaving nothing except a stump. Target is Sickened 1 and must regrow the hand!"
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "P",
      "effect": "Acid burns foes foot away leaving nothing except a stump. Target falls prone and takes a -10-foot status penalty to land speed. Target is also Injured 1 until the foot is regrown."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "P",
      "effect": "Acid burns targets chest causing intense pain. Target is Injured 2."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "UH",
      "effect": "Acid burns into targets groin bringing forward many tears an screams. Target is Injured 3."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "P",
      "effect": "Target looks the acid straight in the face, what a mistake. Target is Blinded and Stunned 1."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "Acid melts targets shoulder, arm drops to the floor."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "Acid melts targets upper leg; leg falls away and target falls down. Target is prone."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "Acid causes systemic collapse. Target becomes Unconscious for 1d6 hours."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "The acid prevents target from ever having children as genitals melt. Target is unconcerned by this however due to being dead."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "Foe’s face burns away, while brain boils out of skull through eye and ear holes. This could be serious."
    }
  ],
  "aligned": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "No additional effect."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "-",
      "effect": "Targets hands blister slightly causing minor discomfort. Target drops one item which they are holding."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "M",
      "effect": "Target is lifted off the ground a couple of inches and then drops back down, throwing them off balance. Target is Flat-Footed."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "-",
      "effect": "A tightening sensation in targets chest causes them to become uneasy for a moment. Target is Frightened 1."
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "-",
      "effect": "Internal pain is harsh but subsides quickly. Drained of 2 PP. +2 base damage."
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "-",
      "effect": "Target feels a sharp pain in their head which causes their nose and ears to bleed. Bleeding 1."
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "M",
      "effect": "Target feels a sudden numbness in one of their arms. Target is Weakened 1."
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "-",
      "effect": "One of the targets legs becomes very weak for a moment which throws the target off balance. Target falls prone."
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "-",
      "effect": "Target feels a surge of power within them for a few seconds. It fades just as quickly leaving target Doomed 1 (+5 base damage to a minor NPC)."
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "Target is nauseated by the surge of energy which strikes them. Target is Sickened 1. +2 base damage."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "-",
      "effect": "Targets face glows white for a few seconds, as this light vanishes it washes across targets body inflicting pain. Recurring 2."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "M",
      "effect": "Targets arms feel as if they are being torn from their sockets. Target is Weakened 2."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "M",
      "effect": "Target finds it difficult to move their legs, albeit briefly. Targets speed is reduced by 5."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "M",
      "effect": "Fear washes over target in waves. Target is Frightened 2 & Flat-Footed."
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "Such pain washes over target that it brings tears to their eyes. Recurring 1 & Stunned 1."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "D",
      "effect": "Target's senses are thrown off kilter by the lights that flash across their mind. Target is Confused."
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "-",
      "effect": "Targets hands burn with the power that has assaulted them. Target drops everything they are holding and is Stunned 2."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "-",
      "effect": "Target is lifted into the air and deposited onto their backside with a thud. Target is knocked prone and Stunned 1."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "UH",
      "effect": "Weakness flows through targets body, it glows slightly for a moment as well. Foe is Weakened 1."
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "UH",
      "effect": "Target feels a sense of loss and anguish in the pit of their stomach. Target is Weakened 1."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "-",
      "effect": "Target is overcome by fear and feels the urge to flee. Target is Frightened 2 and gains the Fleeing condition until the end of their next turn."
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "P",
      "effect": "Pain in targets shoulders causes them to convulse slightly. Target is Weakened 1 & Stunned 1."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "-",
      "effect": "Force takes targets legs from under them, and they hit the floor face first. Target is knocked prone and is Stunned 2."
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "-",
      "effect": "Pain in targets chest takes their breath away and prevents them from speaking. Target cannot use verbal components until the end of their next turn and are Stunned 2."
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "M",
      "effect": "Target is not supposed to glow that colour. Target is Paralyzed."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "D",
      "effect": "Bright lights flash before targets eyes making it impossible to tell friend from foe. Target is Confused & Dazed 1."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "UH",
      "effect": "Energy arcs between targets arms. Target is Weakened 2."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "-",
      "effect": "Targets legs are assaulted by the powerful force which you represent. Target has a -5 penalty to speed for 1 minute and is Immobilized until the end of their next turn."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "D",
      "effect": "Your power is incredible; target is considering their options. Foe is Slowed 1."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "The sheer power is overwhelming; target is considering their options. Foe is Stunned 3."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "UH",
      "effect": "Targets eyes glow with immense energy for a few moments. Target is Blinded & Frightened 1."
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "UH",
      "effect": "Energy surges through targets arms and into their body. Recurring 4 & Injured 1."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "-",
      "effect": "Target is lifted off their feet and thrown back some distance. Target is knocked back 10' and falls prone. Target is Stunned 2."
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "D",
      "effect": "Breath is taken from targets lungs, making them see stars. Target is Unconscious. +3 base bludgeoning damage"
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "D",
      "effect": "Whatever target had for their breakfast comes up in a hurry. Target is Sickened 2 and is Injured 1."
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "UH",
      "effect": "The pain in targets head is intense; target is feeling the pressure. Target is Dazed 2."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "UH",
      "effect": "Targets arms glow with energy before erupting in a bright flash causing target to scream. Recurring 3, Dazzled & Weakened1."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "P",
      "effect": "One of targets feet vanishes. Target falls prone and takes a -10-foot status penalty to land speed. Target also is Weakened 2 until the foot is regrown."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "-",
      "effect": "The pain in Targets chest is almost unbearable. Target takes 10 Soul Drain."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "-",
      "effect": "Target may live to regret their choice of alignment, or maybe they won't. Target takes 15 Soul Drain."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "P",
      "effect": "The energy ravages the target’s mind and body. Target suffers Soul Drain 10 and Dazed 3."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "UH/Fatal",
      "effect": "The target’s spiritual essence collapses. Target becomes Paralyzed."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "UH/Fatal",
      "effect": "Alignment energy causes catastrophic spiritual damage. Target becomes Unconscious."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "The energy destroys the target’s spiritual core. Target drops."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "Aligned energy annihilates the target’s essence. Target dies instantly."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "Energy consumes target from head to toe."
    }
  ],
  "cold": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "No additional effect."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "M",
      "effect": "Numbness in targets hands causes a moment of hesitation. Target is Flat-Footed."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "M",
      "effect": "Frost covers the top of targets feet making movement a little difficult. Targets speed is reduced by 5."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "-",
      "effect": "Cold takes targets breath away for a moment. Recurring 1."
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "-",
      "effect": "Target has a very cold feeling down below. Recurring 1. +5 damage"
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "M",
      "effect": "Targets eyelids freeze shut for a moment creating a slight hinderance. Target is Dazzled."
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "M",
      "effect": "Target feels a biting cold in one of their arms. Target is Weakened 1."
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "-",
      "effect": "Blast of cold knocks target from their feet. Target is prone."
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "-",
      "effect": "Ice forms across the targets upper body. Target is Stunned 1."
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "Ice forms across the target’s lower abdomen. Target is Stunned 1."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "D",
      "effect": "Ice forms across the targets head, throwing them off balance. Target is Dazed 1."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "-",
      "effect": "Cold ripples along targets arms invoking a painful experience. Recurring 1 & Stunned 1."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "D",
      "effect": "The cold turns into ice blocks which stops target from moving so well. Targets speed is reduced by 5."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "M",
      "effect": "The cold causes target to gasp for breath. Target is Flat-Footed & Stunned 1."
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "That cold can really get to places other damage types fail to reach. Target is Stunned 1. +3 base damage."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "M",
      "effect": "Cold washes across targets head giving new meaning to the term brain freeze. Target is Injured 1."
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "-",
      "effect": "Target finds it difficult to held onto things with icy hands. Target drops anything held in both hands and the blistering causes Recurring 2.",
      "armourClauses": [
        { "kind": "armoured", "text": "Ignore the dropped items. +2 base damage instead." }
      ]
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "-",
      "effect": "Large icy patches appear under targets feet; target slips to the floor. Target is prone &Stunned 1."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "A solid blast of cold hits target square in the chest. Target is thrown back 10' and falls prone. +1 base bludgeoning damage."
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "M",
      "effect": "The cold assaults the targets stomach causing breakfast to reappear at their feet. Target is Flat-Footed & Sickened 2."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "-",
      "effect": "It is curious to watch cold flames erupt from the targets head; they scream. Recurring 3."
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "-",
      "effect": "One of targets arms freezes for a moment including anything held. Recurring 3 & must make a Fortitude Save (1 AP) to break the ice."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "-",
      "effect": "Cold rips through targets legs making them reconsider their combative options. Target is knocked prone and is Stunned 2"
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "M",
      "effect": "Target gasps for breath as cold assaults their lungs. Target is Injured 4."
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "M",
      "effect": "Cold washes over targets body causing multiple lacerations. Recurring 3 & Flat-Footed. +5 base damage."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "UH",
      "effect": "Cold washes over targets head causing multiple lacerations. Recurring 2 & Injured 1."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "-",
      "effect": "One of the targets shoulders is lacerated with shards of ice. Recurring 3."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "UH",
      "effect": "The blood in targets legs turns to ice for an instant, causing foe to gasp in pain and fall. Target falls prone is Injured 1. +5 base damage."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "-",
      "effect": "Cold punches into targets chest, burning skin and down into lung. Target coughs up mist a few times. Target is Stunned 1 and Fatigued 1."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "Frozen abdomen causes spasm, target falls. Target falls prone, Recurring 3 & Stunned 1."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "UH",
      "effect": "Cold encases targets face and makes speaking difficult. Target is Stunned 2 and must make a DC 5 flat check to cast verbal spells. +5 base damage"
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "-",
      "effect": "Frostbite reaches from targets hand to mid-forearm. Target drops anything in his hand. Target is Stunned 1 and Fatigued 1."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "P",
      "effect": "Frostbite covers whole of targets foot, but two toes are frozen through, and will need to be amputated. Target is Injured 2 until the toes are regenerated."
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "P",
      "effect": "Cold covers targets chest causes not only frostbite but drives the air from targets lungs. Target is Stunned 1 and is Injured 1."
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "M",
      "effect": "Targets groin is frozen, which must be very funny except to target. Target is Stunned 1, Fatigued 2 & Flat-Footed."
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "UH",
      "effect": "Target ducks under the attack and thinks they have avoided the worst of it; they are wrong as the top of their head freezes. Injured 1 and Flat-Footed until the end of their next turn."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "UH",
      "effect": "Cold engulfs the targets arms making it difficult for them to move them. Target is Injured 3. +5 base damage."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "M",
      "effect": "One of targets legs is encased in ice. Target is having trouble moving. Target has a -10 penalty to speed and is Injured 3 until the end of their next turn when the ice melts."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "UH",
      "effect": "Blast of cold to targets chest sends them reeling. Target is knocked back 10' and is Slowed 1. +5 base damage."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "P",
      "effect": "Target is heavily winded as they feel freezing pain in their lower abdomen. Target is Injured 3. +5 base damage."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "-",
      "effect": "Ice forms across targets face, encasing mouth and nose. Target is suffocating and may spend 3 AP each round trying to remove the Ice. This is a DC 15 flat check."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "Roll a d8: 1-6 One of targets hands freezes, 7-8 One of targets arms freezes; and then shatters, leaving a perfectly formed stump. Anything held in the hand is also destroyed. Arm/Hand must be regenerated."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "Cold freezes both of target’s legs and then they shatter a moment later. Target can only crawl until legs are restored."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "Target has a look of horror upon their face as ice enters their lungs and freezes. Foe drops to the floor gasping for breath."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Fatal",
      "effect": "Ice tears through targets lower abdomen, it is messy but very cool!"
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "The cold annihilates the target, leaving nothing but a frozen corpse. Target dies instantly."
    }
  ],
  "electricity": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "No additional effect."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "M",
      "effect": "Targets shoulders arc about a little causing more amusement than discomfort. Target is Flat-Footed."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "-",
      "effect": "Blast to targets legs pushes them backwards. Target is pushed back 5'."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "-",
      "effect": "Nerves are momentarily overwhelmed as arc strikes Target’s chest. Target is knocked back 5'"
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "-",
      "effect": "Target is given a cheap thrill by the electricity passing through groin, they smile for a second, before crying out in pain. Recurring 1. +5 damage."
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "M",
      "effect": "Strike to targets face causes a little disorientation. Target is Dazzled."
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "-",
      "effect": "Target feels a strange burning sensation in one of their arms. Recurring 1. +4 damage"
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "-",
      "effect": "Targets legs spasmodically jerk for a moment knocking them to the floor. Target is prone."
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "-",
      "effect": "Targets chest burns from the attack. Recurring 1. +2 base damage"
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "That really takes the targets breath away and brings tears to their eyes. Target is Stunned 1."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "M",
      "effect": "The electrical energy hits the target square in the face. Target is Dazzled and Flat-Footed."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "M",
      "effect": "The attack pins targets shoulders back painfully, bringing a look of panic to your targets face. Target is Weakened 1."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "-",
      "effect": "Is that a dance that target is performing? Target moves forward 10' which may provoke reactions. +2 base damage."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "M",
      "effect": "Targets heart stops for a fraction of a second. Target is Injured 2."
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "Target spits blood and puke as the attack has a violent effect upon their stomach. Target is Sickened 2."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "D",
      "effect": "Targets eyes are over-stimulated by the power of your attack. Target is Dazzled."
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "-",
      "effect": "Blast to one of targets arms creates a real light show. Recurring 2 & Stunned 1."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "-",
      "effect": "Target jumps, you are not sure if it is from the blast, or just the targets bouncy nature. Target triggers reactions for movement and then falls prone. +4 damage."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "That blast hits the target in the centre of the chest, throwing them backwards. Target is pushed back 10' and falls prone."
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "M",
      "effect": "Is target crying or laughing, difficult to determine but the blast to their stomach was surgical, nonetheless. Target has Injured 2."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "-",
      "effect": "Targets face looks a little burnt. Recurring 2 & Stunned 1.",
      "armourClauses": [
        { "kind": "metal", "text": "Recurring +1." }
      ]
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "D",
      "effect": "Targets arms are badly burnt as they attempt to ward off your attack. Target is Injured 2."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "-",
      "effect": "It is curious to watch as one of targets legs moves forward, whilst the other backwards. Target falls prone and is Stunned 2."
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "-",
      "effect": "You are pretty sure that targets torso was not emitting that much light a moment ago. Target glows, creating bright light in a 20-foot radius (and dim light for the next 20 feet) like a torch. Recurring 3 & the light remains until the recurring damage ends."
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "-",
      "effect": "Tiny shards of flesh are erupting from targets back and making them grit their teeth in pain. Recurring 3 & Stunned 2.",
      "armourClauses": [
        { "kind": "metal", "text": "Stunned +1." }
      ]
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "M",
      "effect": "All of target’s hair stands on end for a few seconds as they absorb the powerful electrical current. Target is Immobilised and then falls prone."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "-",
      "effect": "The electricity runs through targets torso and erupts out of their arms, striking nearby foes. All enemy targets within 15' of the target take half the attacks damage. If there are no enemy targets within range, target takes +50% damage."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "-",
      "effect": "Targets legs are swept out from underneath them by the powerful blast and they hit their head on the way down. Target falls prone and is Stunned 3."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "UH",
      "effect": "Severe shock to targets chest leaves a nasty burn. Target is Injured 1.",
      "armourClauses": [
        { "kind": "metal", "text": "Injured +1." }
      ]
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "Target releases the contents of their stomach violently. Target is Sickened 2 and Stunned 1."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "UH",
      "effect": "Targets eyes bulge and look like they may pop out of their head. Target Injured 1. +5 base damage"
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "UH",
      "effect": "Target jerks about in an almost comical fashion…target is not laughing. Target Injured 2 and drops one item which they are holding."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "M",
      "effect": "Target jumps as the blast strikes between their legs. Target falls prone and is Stunned 3. Target is Injured 2."
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "-",
      "effect": "Target is held in place by the stream of electricity and has an expression of pain on their face. Recurring 4 & Immobilized until the damage ends."
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "-",
      "effect": "Target is held in place by the stream of electricity and has an expression of pain on their face. Recurring 3 & Slowed 1 until recurring ends.",
      "armourClauses": [
        { "kind": "metal", "text": "Recurring +1." }
      ]
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "UH",
      "effect": "A large cracking noise can be heard as the attack strikes the target in the face. Target is Dazzled & Stunned 2. +5 base damage."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "-",
      "effect": "Targets arms raise upwards releasing the electrical energy straight up into the air. Target drops anything held and is Stunned 2."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "P",
      "effect": "The blast runs down targets leg and completely incinerates one of their feet. Target falls prone and takes a -5-foot penalty to land speed. Target is Injured 1 until the foot is regrown."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "P",
      "effect": "Targets nervous system is overloaded by the attack. Target is Injured 2."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "P",
      "effect": "Targets nervous system is overloaded by the attack. Injured 2.",
      "armourClauses": [
        { "kind": "metal", "text": "Injured +1." }
      ]
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "P",
      "effect": "The blast strikes the target square in the face. Target is Blinded. +5 base damage."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "Both of target’s arms have gone in a blinding flash."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "Both of target’s legs have gone in a blinding flash."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Death",
      "effect": "The attack blows a hole straight through targets chest…a big head sized hole. Target is very dead."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "The targets lower abdomen explodes, showering everything within a 10' radius with gore."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "There is a bright flash and targets head is missing, leaving just a smoking neck when the light clears."
    }
  ],
  "essence": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "A harmless ripple of essence flickers across the skin — momentarily warm or cold. No lasting harm."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "-",
      "effect": "A faint flicker in your aura saps vitality. Target Fatigued 1."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "M",
      "effect": "The body trembles as spirit and flesh lose step. Target Dazed 1."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "M",
      "effect": "Your life current weakens briefly. Target Weakened 1."
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "-",
      "effect": "Essence ripples through the gut. Target Sickened 1."
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "M",
      "effect": "Your crown thrums painfully. Target Dazed 1."
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "M",
      "effect": "Threads of life sever in your arm. Target Injured 1."
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "M",
      "effect": "Vitality floods from your legs. Target Fatigued 1 & -5-foot penalty to speed."
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "-",
      "effect": "Your chest buckles with spiritual compression. Target Fatigued 2."
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "A glancing hit disrupts the target’s soul. Target takes Recurring 1."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "D",
      "effect": "The mind fractures slightly. Target Dazed 1."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "D",
      "effect": "Your arm loses structure as essence collapses. Target Injured 1 & is knocked prone."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "D",
      "effect": "Flow through your leg staggers. Target Fatigued 1 & -5-foot penalty to speed."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "-",
      "effect": "A low thrum corrupts your breath. Target Fatigued 1 & Recurring 1."
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "Your abdomen twists with unnatural gravity. Target Sickened 2."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "UH",
      "effect": "A wave of essence overwhelms the mind. Target Dazed 1."
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "D",
      "effect": "The essence flows through the forearm, draining vitality. Target Weakened 1 & Recurring 1."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "D",
      "effect": "Your legs falter, drained of inner spark.  Target Slowed 1 & Fatigued 1."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "Spiritual energy overwhelms the chest. Target Fatigued 1 and takes Soul Drain 5."
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "D",
      "effect": "The essence disrupts the life force. Target Injured 1 and takes Soul Drain 5."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "-",
      "effect": "The essence burns at the soul. Target Stunned 1 and takes Soul Drain 5."
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "UH",
      "effect": "Spiritual fractures erupt through your arm. Target Injured 1."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "UH",
      "effect": "Lifeforce drains from your leg. Target Weakened 1 & -5-foot penalty to speed."
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "D",
      "effect": "An echo bursts behind your ribs. Target is Injured 1 and Fatigued 1."
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "-",
      "effect": "You feel yourself fading from your own body. Target is taking Recurring 1 and is Confused until the end of their next turn."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "UH",
      "effect": "The world fractures around your thoughts. Target Dazed 1 & Stunned 1."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "UH",
      "effect": "The essence burns away the upper arm's vitality. Target Weakened 1 and taking Recurring 2."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "UH",
      "effect": "Spirit lines tear through muscle. Target suffers Speed Pen –5 & Recurring 2."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "UH",
      "effect": "Chest convulses under radiant collapse. Target Weakened 2 & Fatigued 1."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "A parasite of thought feeds briefly. Target Sickened 2 & Confused until the end of their next turn."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "D",
      "effect": "The essence burns through the target’s eyes. Target is Blinded."
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "D",
      "effect": "The essence energy paralyzes the muscles. Target Weakened 2 & Slowed 1."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "P",
      "effect": "Leg hollowed by radiant inversion. Target suffers Speed Pen –5 & Fatigued 1."
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "-",
      "effect": "The soul falters under intense pressure. Target is Stunned 1 & taking Recurring 2."
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "UH",
      "effect": "A massive surge ravages the soul. Target is Injured 2 & takes Soul Drain 5."
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "-",
      "effect": "Spiritual energy overwhelms the body. Target is taking Recurring 4."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "-",
      "effect": "Essence tears through the soul. Target takes Soul Drain 10."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "P",
      "effect": "Lifeforce in your leg convulses. Target suffers Speed Pen –10, Fatigued 1 & 5 Soul Drain."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "P",
      "effect": "Severe spiritual collapse. Target is Injured 2 & takes Soul Drain 10."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "UH",
      "effect": "Spiritual energy incapacitates the target. Target becomes Unconscious."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "-",
      "effect": "Spiritual energy freezes the body. Target takes Recurring 2 and is Paralyzed until it ends."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "The soul collapses completely. Target becomes Unconscious."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "Essence energy causes systemic spiritual failure. Target becomes Paralyzed."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "Essence energy destroys the target’s spiritual core. Target takes Soul Drain 10."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "The soul is pulled from the body like a thread from silk. Target dies."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "The essence annihilates the target’s body and spirit. Target dies instantly."
    }
  ],
  "fire": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "Hot stuff."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "-",
      "effect": "The flames burn the targets hand, causing them to drop one item which they are holding."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "-",
      "effect": "Targets foot ignites and burns away merrily. Recurring 1."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "-",
      "effect": "Flames blast across targets chest causing a lot of pain. Recurring 1.+5 damage."
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "-",
      "effect": "Flames blast across targets lower back causing a lot of pain. Recurring 1. +5 damage"
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "-",
      "effect": "Fire burns top of Targets scalp and leaves him in some pain. Recurring 1. +5 damage"
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "-",
      "effect": "Flames erupt upon targets arms creating a burst of strange smoke, target coughs. Target is Sickened 1."
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "-",
      "effect": "Targets knees are certainly not supposed to be on fire. Recurring 2."
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "M",
      "effect": "Flames smash into targets chest leaving a nasty burn. Target is Flat-Footed. +5 damage"
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "M",
      "effect": "The flames ripple down targets back causing them to gasp in surprise. Target is Flat-Footed. +5 damage"
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "-",
      "effect": "The heat is intense and target is forced to take a breath. Target is Stunned 1."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "-",
      "effect": "Target gains very hot hands and they gasp out in pain. Target drops one held item and is Stunned 1."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "M",
      "effect": "Are the targets pants on fire, there is certainly a lot of smoke. Target is Blinded."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "M",
      "effect": "Flames ripple across the target’s chest and across their shoulders. Recurring 2 & Injured 1."
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "M",
      "effect": "Target brings new meaning to the term 'Hot Pants'. Target is hopping on the spot, Stunned 1 and Flat-Footed."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "-",
      "effect": "Target will need a salve for the burns on their head, and possibly some new hair. Target is Stunned 1 & Recurring 1"
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "-",
      "effect": "One of targets arms erupts into flames which looks painful. Recurring 2 & Injured 1 until the recurring damage stops."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "-",
      "effect": "One of targets legs erupts into flames making moving tricky. Recurring 2 & -5-speed penalty until the recurring damage ends."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "Surgical blast to target chest singes through clothing and causes some serious burns. Recurring 2 & Stunned 1."
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "-",
      "effect": "Stomach flesh is intended to remain on the inside of targets flesh. Recurring 2 & Injured 1 until the recurring damage ends."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "D",
      "effect": "Targets eyebrows and facial hair have gone leaving face badly burnt. Target is Injured 1. +5 base damage."
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "-",
      "effect": "Targets arms ignite as they attempt to ward off your attack. Recurring 2 & Injured 2 until the damage stops."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "-",
      "effect": "A considerable amount of flesh is melting on the side of targets hip, that looks nasty. Recurring 3 & Injured 1 until the damage stops."
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "-",
      "effect": "Target will either need a new shirt or a skin graft as their chest burns like a campfire. Recurring 2 & Slowed 1 until the damage ends."
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "-",
      "effect": "I am pretty sure that the targets stomach is not supposed to bubble on the outside. Recurring 2 & Injured 2 until the damage ends."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "-",
      "effect": "Targets face is a mixture of sunburn and surprise. Recurring 1 & Blinded until the damage ends."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "-",
      "effect": "The fire strikes the targets arms and then spreads across their body. Recurring 2 & Injured 2 until the damage ends."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "UH",
      "effect": "One of targets feet is burnt to a crisp. Target has a -5-speed penalty. Target is also Stunned 1."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "UH",
      "effect": "The flames ripple across the target chest leaving a trail of scorched flesh. Recurring 2 & Injured 1."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "Target inhales a vast amount of fumes produced by the burning of their lower torso. Recurring 1 & Stunned 2."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "UH",
      "effect": "Targets face is badly burnt by the fiery assault. Target is Injured 1. +5 base damage"
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "UH",
      "effect": "All of the flesh is stripped from one of targets hands by the flame. Recurring 1 & hand is useless until healed."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "UH",
      "effect": "The flames race up the back of targets legs with eager anticipation of the carnage they can reap. Recurring 3 & Injured 1."
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "UH",
      "effect": "The attack blasts into targets upper chest with little mercy. Target is burning and screaming. Recurring 3 & Injured 1."
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "-",
      "effect": "The attack blasts into targets stomach with no remorse. Target is burning and screaming. Recurring 4 & Injured 1 until recurring damage ends."
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "UH",
      "effect": "The side of targets face is scorched to the bone. Recurring 2 & Injured 2."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "UH",
      "effect": "One of targets arms is burnt to a crisp by the fire. Recurring 2 & arm is useless until healed."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "P",
      "effect": "One of targets feet is incinerated before your eyes. Target falls prone and takes a -10-foot status penalty to land speed. Target is Injured 1 until the foot is regrown."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "-",
      "effect": "The target looks quite welcoming now that they have constructed a campfire on their chest. Recurring 4 & Stunned 1."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "-",
      "effect": "Children have suddenly become a distant part of the targets future as the flames melt certain vital components for such consideration. Recurring 6."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "-",
      "effect": "Twelve hours spent under a blistering desert sun may have affected targets head in the same way. Target is Fatigued 1, Recurring 3 & Stunned 2."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "Targets shoulder joint is incinerated by the resulting inferno which you produce. Targets arm drops to the ground, and they are taking Recurring 8."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "The flames engulf one of the targets legs and melt it down to the bone completely. Land Speed is halved if they survive."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "Targets ribs are exposed as flame spreads over body. The smell of burnt flesh is not easily forgotten. Recurring 6."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "All of targets torso skin burns away. Foe expires in a heap."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "Targets face burns away, while brain boils out of skull through eye and ear holes. This could be serious."
    }
  ],
  "force": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "The magical blast pushes the target's hair back dramatically. Nothing else happens."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "-",
      "effect": "A ripple of energy numbs the target’s fingers. One held item is dropped."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "M",
      "effect": "The impact sends a twitch through the leg. Target Flat-Footed."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "M",
      "effect": "A chest-punch of arcane energy leaves the target winded. Target Dazed 1."
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "-",
      "effect": "Force reverberates in the lower abdomen. Target Fatigued 1."
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "D",
      "effect": "A sharp pressure rolls over the scalp. Target is Dazed 1. If magically shielded, negate effect."
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "D",
      "effect": "The arcane surge rattles the arm. Target Weakened 1."
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "D",
      "effect": "A pulse rolls through the target’s legs. Target suffers Speed Pen –5."
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "-",
      "effect": "A focused force blast to the sternum. Target Stunned 1 and loses 1 PP."
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "M",
      "effect": "A jolt lingers along the spine. Target is Flat-Footed and loses 1 PP."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "-",
      "effect": "The air bends. Target stutters in place and is Stunned 1."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "-",
      "effect": "A backlash of force erupts in the hands. One held item is dropped. Target is Stunned 1."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "D",
      "effect": "The target's legs vibrate. Target suffers Speed Pen –5 and is Flat-Footed."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "-",
      "effect": "A spiralling blast tears into the chest. Target is Stunned 1 and Fatigued 1."
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "A burst explodes near the pelvis. Target is Stunned 1 and Spellcasting requires a Spell Concentration success next round."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "M",
      "effect": "Force slaps the side of the head. Target is Stunned 1 and Confused."
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "M",
      "effect": "The arm is wrenched back. Target Weakened 2 and drops anything held."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "UH",
      "effect": "One leg twists unnaturally. Target suffers Speed Pen –5."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "The chest caves slightly under pressure. Target Fatigued 2 & Stunned 1."
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "-",
      "effect": "The abdomen ripples with magical feedback. Target loses 2 PP and is Sickened 1."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "M",
      "effect": "The face distorts momentarily. Target Stunned 1 and DC 5 Flat check to cast spells."
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "D",
      "effect": "Both arms seize. Target Weakened 2 and loses 2 PP."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "D",
      "effect": "A massive impact to the hip disorients. Target suffers Speed Pen –5 & Confused."
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "-",
      "effect": "A shockwave across the chest staggers. Target Fatigued 2 & Stunned 1."
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "-",
      "effect": "The gut is impacted with unstable energy. Target Sickened 2 and loses 3 PP."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "M",
      "effect": "Force slaps across the eyes and temples. Target Blinded and DC 10 Flat check to cast spells."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "UH",
      "effect": "The impact sears through the target’s arms. Target Weakened 2."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "UH",
      "effect": "One foot slides out of alignment. Target suffers Speed Pen –5 and is Prone."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "-",
      "effect": "The chest explodes with energy. Target Fatigued 2 and loses 3 PP."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "D",
      "effect": "A wild arcane pulse scrambles the belly. Target Sickened 2 & Confused."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "-",
      "effect": "The head jolts back violently. Target Stunned 2 and loses 4 PP."
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "UH",
      "effect": "One arm is disabled by force backlash. Target suffers Weakened 2 and cannot use that limb until healed."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "P",
      "effect": "Both legs buckle. Target suffers Speed Pen –5 and is Prone."
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "P",
      "effect": "A surge races through the chest. Target Fatigued 1 & Injured 1."
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "UH",
      "effect": "A deep impact in the gut causes severe recoil. Target Injured 2 and loses 5 PP."
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "P",
      "effect": "The side of the face collapses under force. Target Injured 2 & Stunned 1."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "P",
      "effect": "One arm is crushed spiritually. Target Weakened 2 and loses 3 PP."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "D",
      "effect": "One leg is crippled by arcane energy. Target suffers Speed Pen –10 and Prone. Target cannot stand."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "D",
      "effect": "The chest erupts in shimmering pain. Target suffers Recurring 2 and DC 10 Flat check to cast spells."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "-",
      "effect": "A rupture near the core. Target loses 6 PP and gains Soul Drain 10."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "UH",
      "effect": "Head fills with static. Target Confused."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "Force blast vaporizes shoulder. Target’s arm is useless and they lose 8 PP."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "Magical backlash implodes a leg. Target is Prone, Speed Pen –10 and gains 5 Soul Drain."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "The chest bursts inward. Target Injured 3, Fatigued 2, and cannot cast spells for (D)."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "A hole of magic punches through the core. The body collapses in glowing ruin."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "Mystical overload detonates within the skull. Brain and spells vaporize."
    }
  ],
  "mental": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "Weird headache for a moment."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "M",
      "effect": "The mind sends a strange message to the target causing their arms to flap for a moment. Target has a -1 penalty to DB and can't use reactions."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "M",
      "effect": "Target feels a strange ache in both legs. Targets speed takes a -5 penalty."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "-",
      "effect": "Target feels a sudden tightening in their chest, it passes. Target Frightened 1. +5 damage."
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "M",
      "effect": "That pain was not there a moment ago. Target is Weakened 1."
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "M",
      "effect": "Targets remembers a particularly traumatic experienced it once suffered. Target is Frightened 1."
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "M",
      "effect": "Target loses track of which arm is which. Target is Injured 1."
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "-",
      "effect": "Target forgets how to stand for a few seconds and falls over. Target is knocked prone."
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "-",
      "effect": "Target can feel a strange ticking noise in their chest; it distracts them somewhat. Target Stunned 1."
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "Target has a sudden urge to relieve themselves, perhaps caused by the fear of your mighty prowess. Target is Frightened 2."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "M",
      "effect": "Target can see a strange dragon flying towards them which is about to breath fire. Target jumps back 5' and is Injured 1."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "M",
      "effect": "You are not sure why the target is flapping their arms in such a manner, and neither are they. Target Stunned 1 & Flat-Footed."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "M",
      "effect": "Target believes that their legs are encased in stone. Target Immobilised."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "D",
      "effect": "Target is experiencing cold sweats and feels a little out of sorts. Target Injured 1."
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "Targets stomach is bubbling and causes some severe cramping. Target Sickened 1."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "-",
      "effect": "Severe pain in targets head could be a real problem…. for them. Recurring 1 & Stunned 1. Metal Helm: No Stun."
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "M",
      "effect": "Target believes that their arms are in fact large pink tentacles. Target is Injured 2 & Stunned 1."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "UH",
      "effect": "Intense pain runs down both of target’s legs causing severe discomfort. Target is Injured 1."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "Pain erupts in targets chest which persists for some time. Recurring 2 & Stunned 1."
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "-",
      "effect": "An expression of discomfort appears on targets face as their stomach constricts. Target Sickened 2. +4 base damage."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "UH",
      "effect": "Targets head feels as if it is about to explode. Recurring 1 & Injured 1."
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "M",
      "effect": "Target believes that their fingers have become claws and feel the urge to attack with them. Target can only make unarmed attacks. Target is also Stunned 1."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "-",
      "effect": "Target cannot feel their legs. Target falls prone and is Stunned 2."
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "M",
      "effect": "Target performs a strange pirouette and leaves themselves exposed to future attacks. Target is Flat-Footed and triggers reactions from all within 10'. +3 base damage."
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "D",
      "effect": "Target believes that a demonic face is ripping from their chest. Target Injured 1 & Confused."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "D",
      "effect": "A glazed expression descends across the target’s eyes. Target is Controlled by you until the end of their next turn and then Injured 1 when the control ends."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "M",
      "effect": "Target reacts strangely to the attack and attacks their nearest ally. If no target is available, the target is Injured 2."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "D",
      "effect": "Targets legs begin to carry them away from the battle. Target is Fleeing until the end of their next turn, this movement triggers reactions. When the Fleeing ends, target is Confused."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "M",
      "effect": "Target has a look of shock upon their face; it appears that their heart may have stopped for a moment. Target falls unconscious."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "Target begins to vomit and then finds it difficult to stop. Target is Sickened 2 & Stunned 1."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "-",
      "effect": "Targets nose begins to bleed as they see images of madness before them. Recurring 1 & Controlled by you until the bleed damage ends."
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "D",
      "effect": "Target begins to claw at their own arms to kill the imaginary bugs. Target drops anything they are holding and is Slowed 1 & Flat-Footed."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "-",
      "effect": "Target falls to the floor and begins to sob. Target falls prone, Triggers Reactions and is also Frightened 2. +2 damage"
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "UH",
      "effect": "Although there appears to be no visible injury to target, their screams tell another story. Target Injured 2."
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "UH",
      "effect": "Is the target injured or not…only time will tell? Target Injured 2."
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "M",
      "effect": "Target drops as if they have just been hit with a sledgehammer. Target is Unconscious. Metal Helm: Stunned 2 instead."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "M",
      "effect": "Target suddenly moves in an erratic fashion and attacks themselves with their primary weapon. The target must make an attack against themselves and is Flat-Footed."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "-",
      "effect": "Target suddenly kicks out at you. The target must make an unarmed fumble check. The target also Triggers Reactions."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "D",
      "effect": "The target drops one item and places the appendage to their chest, smiling all the time. The target gains the Fixated condition towards you and is Injured 1."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "D",
      "effect": "The target looks surprised to see you vanish…where did you go. You have the undetected condition towards the target."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "D",
      "effect": "The psychic force severs target’s connection to reality. Target suffers Paralyzed & Confused."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "The psychic energy shatters the mind. Target Unconscious."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "A concentrated psychic blast destroys mental faculties. Target Paralyzed."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "The psychic energy obliterates the target’s mind. Dazed 5."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "The target’s mental structure collapses, leaving them brain-dead. Target dies instantly."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "The psychic energy shreds the target’s soul and mind entirely, leaving nothing. Target dies instantly."
    }
  ],
  "poison": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "No additional effect."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "-",
      "effect": "The veins in targets arms bulge with discolour as the poison flows through their veins. +5 damage."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "M",
      "effect": "Targets legs feel a little heavy as the poison spreads. Target has a -5 penalty to speed."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "M",
      "effect": "For a few seconds target becomes a little short of breath, but it passes. Target Flat-Footed."
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "M",
      "effect": "Mild toxin exposure weakens the body. Target Weakened 1."
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "M",
      "effect": "Targets vision goes blurry for a moment. Target is Dazzled."
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "M",
      "effect": "The poison causes a slight numbness, which then disperses in a wave of pain. Target is Injured 1."
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "M",
      "effect": "Toxin slows motor functions. Target Slowed 1."
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "M",
      "effect": "Target feels a surge of pain in their chest. Target Injured 1."
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "A mild poison causes fatigue. Target Fatigued 1."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "D",
      "effect": "Target attempts to cry out in pain but cannot find their voice. Target is unable to speak."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "D",
      "effect": "One of targets arms goes limp dropping to their side. Target cannot use one of their arms."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "M",
      "effect": "Targets legs just won't move. Target Immobilised."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "D",
      "effect": "Target is certain that the black lines spreading across their chest are bad. Target Injured 1."
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "Target looks very pale because of the poison, the vomiting begins. Target Sickened 1."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "-",
      "effect": "Target appears to be a little frothy at the mouth, maybe they are just mad. Target Sickened 1."
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "-",
      "effect": "Should targets fingers turn black and brittle, probably not. Target drops one item which they are holding and is Stunned 1."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "-",
      "effect": "Target falls over and looks very surprised by this turn of events. Target falls prone and is Stunned 1."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "M",
      "effect": "A cramping in foes chest causes them some physical impairment. Target Weakened 2. +5 damage."
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "-",
      "effect": "Target has an extremely unsettled stomach; they look very pale. Target Sickened 1 and takes Recurring 1."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "M",
      "effect": "The back of targets throat constricts and this spreads to their body with haste. Target Immobilised. +5 damage."
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "D",
      "effect": "Target is struggling with the pain spreading through their arms. Target is Weakened 2."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "D",
      "effect": "The venom spreads through targets legs quickly. Target has a -5 penalty to speed and takes Recurring 1."
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "-",
      "effect": "A virulent toxin causes extreme pain. Target Fatigued 2 and takes Recurring 1."
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "-",
      "effect": "Target clutches their stomach and cries out in pain. Target is Sickened 2."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "M",
      "effect": "Targets eyes are watering like crazy; how can they see. Target Blinded and then Dazzled for 1 minute thereafter."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "M",
      "effect": "Targets hands were surely not that big a second ago. Target drops what they are holding in both hands and is Immobilized. +5 damage."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "UH",
      "effect": "Targets legs suddenly feel very heavy; they take a step forward and fall over. Target moves forward 5' and falls prone. Target then has a -5-speed penalty."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "-",
      "effect": "Target does not realise the extent of the damage until they move…or rather don't. Recurring 2 & Paralyzed until the recurring damage ends."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "The pain in targets lower abdomen causes target to stumble backwards sweating. Target is pushed back 5' and falls prone. Target is Stunned 1."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "-",
      "effect": "Target chokes and begins to froth at the mouth. Recurring 1 & Slowed 1 until the damage ends."
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "-",
      "effect": "Targets arms spasm releasing their contents everywhere. Target throws everything they are carrying in random directions 1d4x5 feet. Target is Stunned 1. +10 damage."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "-",
      "effect": "The veins in targets arms are bulging with black venom. Target has Soul Drain 5 & Stunned 1."
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "M",
      "effect": "Targets heart stops for a moment. Target falls Unconscious."
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "P",
      "effect": "A lethal toxin damages the abdomen. Target Injured 1."
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "P",
      "effect": "A strange black substance oozes across targets eyes forcing them to close. Target is Blinded."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "-",
      "effect": "Targets arms have a strange burning sensation running through them. Recurring 2 & cannot use either arm until the recurring damage ends."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "P",
      "effect": "The poison flows freely into the target’s legs, making them extremely unsteady on their feet. Target Weakened 2 & Stunned 1."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "P",
      "effect": "A massive dose of poison incapacitates the target. Target Injured 2 and Unconscious until healed."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "UH",
      "effect": "The poison overwhelms the target’s immune system. Target Unconscious and takes Recurring 4."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "UH",
      "effect": "Some black fluid leaks from the side of targets mouth as they gasp for breath. Target drops and is Suffocating (no holding breath, straight to unconscious)."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "The poison spreads to every vital organ. Target Unconscious."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "A lethal dose paralyzes the entire body. Target Paralyzed."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Fatal",
      "effect": "The poison reaches the targets brain and almost prevents them from functioning. Target is Blinded and Deafened. +5 damage"
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "The venom completely shuts down the target’s body. Target dies instantly."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "The poison destroys the target from the inside, leaving no chance of recovery. Target dies instantly."
    }
  ],
  "sonic": [
    {
      "min": 1,
      "max": 10,
      "persistence": "Surface Scrape",
      "effect": "White noise."
    },
    {
      "min": 11,
      "max": 13,
      "persistence": "-",
      "effect": "Look at those strange bubbles that have just appeared under the targets skin. +5 damage."
    },
    {
      "min": 14,
      "max": 16,
      "persistence": "M",
      "effect": "Targets legs waver under the force of the attack. Target Flat-Footed."
    },
    {
      "min": 17,
      "max": 18,
      "persistence": "-",
      "effect": "Target is pushed back by the sonic energy. Target is pushed back 5'."
    },
    {
      "min": 19,
      "max": 19,
      "persistence": "-",
      "effect": "Target feels a strange emptiness in the pit of their stomach. Target Frightened 1."
    },
    {
      "min": 20,
      "max": 20,
      "persistence": "-",
      "effect": "Targets head throbs with the intense sound for the merest of moments. +5 damage."
    },
    {
      "min": 21,
      "max": 23,
      "persistence": "M",
      "effect": "The vibration splits several of target’s fingernails, which is painfully distracting. Target Flat-Footed. +5 damage."
    },
    {
      "min": 24,
      "max": 26,
      "persistence": "-",
      "effect": "Intense pain in targets legs causes them to momentarily lose their balance. Target is knocked prone."
    },
    {
      "min": 27,
      "max": 28,
      "persistence": "M",
      "effect": "The flesh upon targets back tears and splits slightly. Target Injured 1."
    },
    {
      "min": 29,
      "max": 29,
      "persistence": "-",
      "effect": "Target feels a strange pressure in the stomach and projectile vomits at anyone target within 10'. Target Sickened 1."
    },
    {
      "min": 30,
      "max": 30,
      "persistence": "-",
      "effect": "Target is struggling to deal with your onslaught and turns to run. Target is Fleeing for 1 round."
    },
    {
      "min": 31,
      "max": 32,
      "persistence": "M",
      "effect": "Target is convinced that the strange vibrations in their arms must be harmless, target is mistaken. Target Weakened 2."
    },
    {
      "min": 34,
      "max": 36,
      "persistence": "M",
      "effect": "Targets ankles swell up causing some trauma and discomfort. Recurring 1 & Injured 1."
    },
    {
      "min": 37,
      "max": 38,
      "persistence": "M",
      "effect": "Target looks a little surprised as they are pushed back by the force of the attack. Target is pushed back 10' and is Flat-Footed."
    },
    {
      "min": 39,
      "max": 39,
      "persistence": "-",
      "effect": "Target is thrown off their feet and lands with a thud. Target is knocked prone. +5 damage."
    },
    {
      "min": 40,
      "max": 40,
      "persistence": "D",
      "effect": "Target is a little bewildered by the blood that trickles from their nose and ears. Recurring 1 & Injured 1."
    },
    {
      "min": 41,
      "max": 43,
      "persistence": "M",
      "effect": "Targets hands ripple with unwanted blisters that painfully burst. Target is Injured 2."
    },
    {
      "min": 44,
      "max": 46,
      "persistence": "UH",
      "effect": "Target loses a dangerous amount of flesh on their thighs. Target is Injured 1. +5 damage."
    },
    {
      "min": 47,
      "max": 48,
      "persistence": "-",
      "effect": "The sonic energy reverberates around targets body and remains. Recurring 2 & Stunned 1."
    },
    {
      "min": 49,
      "max": 49,
      "persistence": "-",
      "effect": "The sonic energy passes through targets stomach, causing some discomfort. Target is Sickened 1 & Stunned 1."
    },
    {
      "min": 50,
      "max": 50,
      "persistence": "M",
      "effect": "Target does not appreciate the sound of your music. Target is Stunned 1 & Flat-Footed."
    },
    {
      "min": 51,
      "max": 53,
      "persistence": "-",
      "effect": "Several of target’s fingers split open revealing flesh and bone…. Oooh. Target is Stunned 2. +5 damage."
    },
    {
      "min": 54,
      "max": 56,
      "persistence": "UH",
      "effect": "A powerful vibration distorts the spine. Target Slowed 1 and -5 penalty to speed."
    },
    {
      "min": 57,
      "max": 58,
      "persistence": "D",
      "effect": "A burst of gore comes out of the back of targets upper body. Target is Flat-Footed."
    },
    {
      "min": 59,
      "max": 59,
      "persistence": "-",
      "effect": "Looks like breakfast may be coming back. Target Sickened 2."
    },
    {
      "min": 60,
      "max": 60,
      "persistence": "UH",
      "effect": "A concentrated burst incapacitates the target’s hearing. Target Deafened & Bleeding 1."
    },
    {
      "min": 61,
      "max": 63,
      "persistence": "-",
      "effect": "That attack caused the target a lot of pain from the shoulders down. One item at random which the is currently in the target’s possession is broken."
    },
    {
      "min": 64,
      "max": 66,
      "persistence": "-",
      "effect": "Targets legs are all twisted up as they fall flat on their face. Target is prone and Stunned 1. +5 damage."
    },
    {
      "min": 67,
      "max": 68,
      "persistence": "-",
      "effect": "Targets scream is actually louder than the sonic attack that strikes them. Target Stunned 2."
    },
    {
      "min": 69,
      "max": 69,
      "persistence": "-",
      "effect": "There is a potential that target may never have kids, the pain in their face says it all. Target is Sickened 2. +5 damage."
    },
    {
      "min": 70,
      "max": 70,
      "persistence": "M",
      "effect": "Target sees stars for a few moments as the blast hits them in the head. Target Unconscious."
    },
    {
      "min": 71,
      "max": 73,
      "persistence": "-",
      "effect": "It is unlikely that targets arms should be vibrating like that. Target drops what they are holding in both hands and is Stunned 2."
    },
    {
      "min": 74,
      "max": 76,
      "persistence": "-",
      "effect": "Target is struck as if by the fist of a Storm Giant. Target is knocked back 15' and falls prone. Target is Stunned 1."
    },
    {
      "min": 77,
      "max": 78,
      "persistence": "-",
      "effect": "Force of the attack doubles target over. Target Sickened 3."
    },
    {
      "min": 79,
      "max": 79,
      "persistence": "P",
      "effect": "A massive sonic boom disrupts the abdomen. Target Injured 1.",
      "armourClauses": [
        { "kind": "armoured", "text": "Recurring 2 instead of Injured." }
      ]
    },
    {
      "min": 80,
      "max": 80,
      "persistence": "UH",
      "effect": "Target takes the full sonic blast straight in the head…blood from the ears is not good. Bleeding 2 & Deafened."
    },
    {
      "min": 81,
      "max": 83,
      "persistence": "UH",
      "effect": "The pain in the targets arm is almost unbearable. Target Stunned 2 & Injured 2. +5 damage."
    },
    {
      "min": 84,
      "max": 86,
      "persistence": "P",
      "effect": "The targets kneecap bulges out of their leg, and they scream as they hit the dirt. Target is knocked prone. The target has a -5-speed penalty and is Injured 2."
    },
    {
      "min": 87,
      "max": 88,
      "persistence": "D",
      "effect": "Several of target’s ribs break under the assault. Target stumbles and looks dazed. Target is Flat-Footed & Stunned 2."
    },
    {
      "min": 89,
      "max": 89,
      "persistence": "UH",
      "effect": "The sonic force creates shockwaves through the body. Target Unconscious and taking Recurring 3."
    },
    {
      "min": 90,
      "max": 90,
      "persistence": "UH",
      "effect": "Other than some physical damage the target appears to be untouched by your attack…for now. Each time the target spends more than 1 AP in a round they must make a DC 5 flat check or fall unconscious for 1 minute."
    },
    {
      "min": 91,
      "max": 93,
      "persistence": "Fatal",
      "effect": "Targets arm simply explodes. Target Unconscious."
    },
    {
      "min": 94,
      "max": 95,
      "persistence": "Fatal",
      "effect": "One of targets legs disintegrates. Target half speed if they survive."
    },
    {
      "min": 96,
      "max": 98,
      "persistence": "Death",
      "effect": "The blast hits the target and throws them back 10'. They break their neck as fall."
    },
    {
      "min": 99,
      "max": 99,
      "persistence": "Death",
      "effect": "A sonic shockwave crushes the target’s form entirely."
    },
    {
      "min": 100,
      "max": 100,
      "persistence": "Death",
      "effect": "Targets head begins to vibrate. Brain matter begins to ooze out of their ears, blood from their eyes, ears and mouth. This happens very quickly but leaves their head an empty husk."
    }
  ]
});
