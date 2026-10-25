# Live testing report: TRG Prime 3.667.0 with Inner Tempest 0.4.0

23 October 2026. Tested in Graham's world "TRG V14" (Foundry 14.367), at 127.0.0.1:30000, in the built-in browser as Testing Dude (GM). Chrome was not reachable this session. No players were connected, so the GM answered every defender prompt.

**Result:** everything Block 3 adds works in play. The test found four defects, two in the core and two in the module, plus one cosmetic slip, and one ordering for Graham to rule on. All are fixed in TRG Prime 3.667.1 and Inner Tempest 0.4.1.

## What was tested, and what happened

**Installation**
- **Versions:** TRG Prime 3.667.0 and Inner Tempest 0.4.0 are active.
- **Registration:** the Disciple and the Mystic are registered, with the Disciple's proficiency (simple and Monastic weapons) and wealth −2. The Technique and Monastic traits are registered. The Technique gate opens with Inner Discipline.
- **Defence offers:** the five registered are Nimble Dodge, Evade, Impact Absorption, Guarded Centre and Echo Form.

**The Disciple** (ZZ Disciple, a new character with the Disciple class dropped on it)
- **Grants at 1st:**
  - Inner Discipline, with its three techniques: Burst Step, Guarded Centre and Disciplined Flurry.
  - Powerful Fists, Disciple's Dodge, Disciple's Resolve, Flurry of Blows, Deep Focus and Monastic Path.
  - Not Incredible Movement, which correctly waits for 4th.
- **Monastic Path:** the Use picker offers the four Paths. Primal was chosen; it arrives with its Nature class-skill effect.
- **Disciple's Dodge:**
  - Unarmoured, Wisdom 3: DB 14, with the +3 dodge applied.
  - Padded armour equipped: DB 11, and the dodge is off.
  - Armour unequipped and a Tower Shield equipped: DB 18, and the dodge is back.
- **Incredible Movement:**
  - It arrives at 4th level, with BAB 4. Speed is 40, or 30 in armour.
  - At 10th level Speed is 45; at 16th, 50.
- **Powerful Fists at BAB 16:**
  - The Strike offers Subdual or Bludgeoning (Versatile).
  - Damage is 4d6 + 5: a 1d6 die, +2 base dice for BAB, a critical die, and the card line "Powerful Fists +5: total unarmed damage".
  - DR 3 applied.
  - A target with a weakness to silver took +50%, so "treated as silver" reaches the defences.
- **Flurry of Blows out of combat, with Disciplined Flurry:**
  - Disciplined Flurry was asked first and answered yes.
  - The first Strike asked for its target; the later Strikes kept it.
  - Three hits. DR was met on the first only: "ZZ Target's DR was applied once, to the first hit — none again here".
  - One critical injury: the later criticals printed "only one critical injury … no injury is rolled" and kept their dice.
  - The card reads "3 hits".
  - Disciplined Flurry's use was spent.
- **Flurry of Blows in combat:**
  - The first Strike took no penalty; the second carried "Multiple Attack Penalty (attack 2) −4".
  - Dragon's Pulse (given to the Disciple for the test) was offered after the first hit. It dealt 5 (Wisdom 3, +2 at 16th) with no DR again, and was expended.
- **Inner Strike at 16th:** 1 AP and the use spent. The effect carries a 4d6 force rider that lasts the turn.
- **Inner Sight at 16th:** Darkvision for 10 minutes.
- **Burst Step:** Speed 50 → 60, until the next turn.
- **Inner Blast (Primal, Con 2, 16th):**
  - DC 28, one damage roll of 8.
  - The target's basic Fortitude Blunder took 16 force and a serious critical.
- **Action Before Thought:** the advantage reaches an initiative check, applied automatically, and no other check.
- **Shadowy Stance on the Primal Disciple:** refused, "needs the Devoted or Illuminator Monastic Path".
- **Technique feat gate:** the class-feat picker hides Inner Strike, Inner Sight and Abundant Step from a character without Inner Discipline. It shows them to the Disciple, and always shows Inner Discipline.

**The Mystic** (ZZ Mystic)
- **Grants at 1st:**
  - Inner Discipline and its techniques.
  - Mystical Power, Mystical Resolve, Mystical Discipline, Alter the Thread and Monastic Path.
- **Mystical Discipline before a Path:**
  - Inner Flame arrives with Flame Within.
  - Orb Of Fire and Circle Of Warmth arrive as innate spells with Focus. They carry the +1 allowance and are marked as waiting for a Path.
- **Monastic Path → Devoted:** both spells are restamped as divinity, cast with Wisdom, and are no longer waiting.
- **Circle Of Warmth (base PP 2) at 1st level:**
  - Not refused (ruling B3-2).
  - It cast as divinity at level 1, and its Focus use was spent (0 of 1).
- **Mystical Power:**
  - The picker offers the 13 divinity cantrips, leaving out Guidance (PP 0, not a cantrip).
  - Daze arrives innate, with Focus, cast as divinity with Wisdom.
  - The card counts "3 more owed".
- **Attacked by the Disciple:**
  - **Before the roll:** the defence offer listed Evade and Guarded Centre. Guarded Centre was taken: +4 dodge (DB 14), with the reaction and use spent.
  - **After the roll:** the attacker's conviction prompt came first. Then Alter the Thread was offered: "rolled 30 against ZZ Mystic's DB 14, which hits".
  - **The reroll:** taken. Conviction went 1 → 0, the card read "30 → 21. The new roll stands", and the attack resolved on 21.
  - **Guarded Centre** expired at the start of the Mystic's next turn.
- **Flame Within:**
  - **Stacking:** the Strike's damage gave +1, then further damage gave +2, +3, and stayed at +3.
  - **In combat (ruling B3-3):** damage taken on the Disciple's turn kept the bonus through the Mystic's next turn end. The following quiet Mystic turn reset it.
- **Shadowy Stance on the Devoted Mystic:**
  - Entered through the core stance.
  - Essence is offered on any Strike, with +2 on Escape.
  - It ends after 1 minute, and its use is spent.

**Console:** no errors from either release. The only errors were Foundry's own combat tracker re-rendering after the test combat was deleted, and the narrow-window warning.

## Defects found, fixed

1. **Techniques arrived with 1 of 2 uses (core).**
   - **What happened:** Deep Focus raises a technique's maximum to 2, but an arriving item was primed to its one default use. Burst Step, Guarded Centre, Disciplined Flurry, Dragon's Pulse and the Technique feats all showed 1 of 2 until a daily preparation.
   - **Fixed in 3.667.1:** an item arrives with every declared extra use. When Deep Focus arrives, the techniques already there gain theirs.
2. **Resolve gave no conviction point (core).**
   - **What happened:** Mystical Resolve read pool 2 and points 1. The grant pass, which gives a `convictionPool` item its one-off point, skipped class-granted abilities with no grants of their own. Disciple's Resolve is the same.
   - **Fixed in 3.667.1.**
3. **Changing Inner Strike's type cost a use (module).**
   - **What happened:** its card said to press Use again. That is another Use, refused when none is left.
   - **Fixed in 0.4.1:** the card's type buttons change it free.
4. **Burst Step's card said "now 70 ft" for a Speed of 60 (module, cosmetic).**
   - **Fixed in 0.4.1.**
5. **Shadowy Stance's card didn't say the 1 minute (module, cosmetic).** The core stance card says the stance lasts until you leave it.
   - **Fixed in 0.4.1.**

## For Graham to rule

- **The order:** when an attack is rolled against a Mystic, the attacker's own conviction (+1d6) prompt comes before Alter the Thread.
- **The consequence:** an attacker who spends conviction there loses it if the Mystic rerolls.
- **The alternative:** offer Alter the Thread first, then the attacker's prompt on the final roll.

## Not tested live

Covered by the harnesses only:
- Echo Form, Centred Awareness and Echoes Beyond (the same offer and declaration paths as Guarded Centre and Action Before Thought);
- Abundant Step, Inner Rush, Bounding Step, Inner Infusion, Inner Stamina and Inner Mind;
- Reflective Mind, Serene Defence and the other Grimoire spells;
- a player answering Alter the Thread from their own client. The socket path is the same one Nimble Dodge's offer passed live on 22 October.

## Cleanup

Removed: the ZZ test folder, the four ZZ actors, the ZZ scene and its combat, and the 58 chat messages the test posted. Chat is back to its 223 messages, and the GM view is on Oldwatch Main.
