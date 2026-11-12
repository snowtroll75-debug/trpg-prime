# TRG Prime 3.680.0

2 November 2026. The seams Eldritch Arts Block 3a needs: the Archmage, the Sorcerer and its birthrights, and the Witch with her Soulbound Familiar. Built from the Block 3 audit (`claude/eldritch-arts-block3-audit.md` in the module's docs), answered by Graham on 2 November 2026 ("your proposals all work").

- **Install over 3.679.0.** Install Eldritch Arts 0.5.0 with it.
- **No migration prompt.**
- **A fix that reaches existing characters: a module's racial Power Points.** `registerRacialPP` stored a module's races since 3.560.0, but nothing read them, so Eldritch Arts' Aetherial, Emberkin and Scaelyn (+1 PP a level) and Nyrinn (−1) gave nothing. They are now stored deltas like the core's races. An existing character catches up at the next daily preparation, item deletion or Apply Grants.
- **What else changes without a module:**
  - **A spell of several traditions can be picked by any of them** when a pick is widened (a Creature Codex Arcadian or True Caster). Until now only its first tradition was tried.
  - **A High Magic casting is not refused by a forbidden tradition.** The Sorcerer's text: "Some races have restrictions … These restrictions are irrelevant when it comes to high magic" (Eldritch Arts L839). Nothing in the core makes a casting High Magic for a character, so a world without the module sees no change.
  - Everything else is asked only when a class or a module declares it.

## New

**A class's own magic (D4): `flags.trg-prime.classMagic`,** on the class item and on a live class ability (a subclass chosen with `abilityChoices`). See `magic/class-magic.mjs`. Every field is optional.
- **`traditions: "any"` or a list:** the traditions the class learns from: the Spell Book, the repertoire, Learn a Spell, the cantrips. A spell is admitted by any tradition it names.
- **A subclass's `ability` and `tradition`:** they replace the class's own magical ability and home tradition. So caster level, Spellcraft and PP read the subclass's answer through the fields they always read ("Your magical ability score is determined by your birthright"). A tradition of "" is an answer: none. Before a subclass is chosen, a class that names no ability does not cast, as before.
- **The PP ability bonus for a class of every tradition:** "You add your magical ability score … as a static bonus to your PP" stands even with no single tradition (the Wild birthright).
- **`bookPerLevel`:** the Spell Book's slots after the opening batch. It defaults to 2; the Archmage's is 1.
- **`cantripBook: true`:** the class's known cantrips go in the book, castable once memorised. `cantripsPerDay` of them are memorised from it each day (the Archmage's "6 high magic cantrips in your spell book … memorise any three"). They are not the book's levelled spells and not its ladder's slots.
- **`tracks`:** repertoire schedules beside the class's own, each with its own traditions, and one that defers to the subclass. This is the Sorcerer's birthright spell "at 2nd level and every two levels".
  - **On the Repertoire card:** the card sums the schedules and names each restriction.
  - **When picking:** Pick asks which schedule when more than one owes a pick, and a swap stays in its track.
- **`cantrips`:** one filter per known cantrip, filled most restrictive first. This is the Sorcerer's "One of these cantrips must be selected from the tradition granted by your birthright, the other can be selected from any tradition".
- **High Magic for some traditions:** `highMagicCaster: ["ethereal", "verdant"]` makes only those spells High Magic, and a spell that names none (a hex) takes the caster's. This is the Witch's "treat the Ethereal and Verdant traditions as high magic". `true` and "any" are every spell, as before.

**A raise of the PP cap per cast (D5's cap half).** `registerCastCapModifier(key, raise)`. It is asked only when a casting would otherwise be over its cap, and before the Overcasting by Sacrifice prompt. It is told whether the casting is High Magic and whether it was warped. A raise is never negative. This is the Sorcerer's Raw Power: "When warping high magic spells, you may increase the total PP cost of the spell to 1 higher than that normally allowed".

**A specialist spell opened to a character.** `registerSpecialistAccess(key, allows)`, asked by the Specialist Spell feat beside the core's own rule. It can only open, and the feat's PP cap and "not already known" still apply. The feat's index now carries the spells' traits and PP. This covers the birthrights' "additional specialist spells from those available to the Wizard class", the Umbral's "specialist spells that have the shadow trait" and the Archmage's "any Specialist Spell, from any class".

**A familiar's modifiers (D8).** `registerFamiliarModifier(key, modify)` returns `{ label, hp, saves, type }`.
- **Hit points** are added after the familiar's own half-the-master's.
- **Saves** are pooled, as a class bonus by default.
- **The master's snapshot now carries their ability totals,** so the Witch's "your Charisma ability score as a class bonus to all saving throws" has a number. An existing familiar's snapshot is caught up at the next sync that finds anything else.
- **New helpers:** `createFamiliarFor` and `familiarsOf`, so the Soulbound Familiar is made as the core's Familiar feat makes one.

**A Power Point grant by feature name.** `registerPPGrant(name, { perLevel, label, types })`: a stored delta of `perLevel` × character level, trued up and handed back as the core's own are. This is the Wild birthright's "+1 PP per level". The registered racial PP use the same rows.

**An attack with BSB in place of BAB (D17).** A weapon's `flags.trg-prime.attackBase: "bsb"` adds one named row, the BSB less the BAB, when the BSB is higher ("may"). This is the Dragon birthright's claws: "you may use BSB rather than your BAB when determining your attack bonus". Damage is untouched.

**The settled hook carries the casting's unmodified die** (`natural`): the Wild birthright's "roll an unmodified 13".

**The Cantrips card** says when a class's cantrips are kept in its spell book, and names the next cantrip's slot.

**Found in an independent review before release, and fixed.**
- **Shadow Walk's "a Resonance Event occurs if you roll a 13" never fired.** The cast read its die from `check.dice.faces[0]`, but the check's d20 result has no `faces`: its die is `dice.unmodified`. The same mistake would have kept the new `natural` at 0, so Wild Power would never have surged. Both now read `dice.unmodified`. The harness checks the check's result shape, not only the line.
- **The Specialist Spell feat would have offered ordinary spells.** A module's opening now opens only a specialist spell, so an Archmage is not offered Invisibility and an Umbral Sorcerer not Blur. The feat's index now carries the spells' module flags too, so a module can tell its hexes apart.
- **Raw Power's extra PP would still have been charged as overcast** (+2 DC a PP, labelled "Overcast"). The casting DC and the Sacrifice prompt's wording now count from the raised cap.
- **What else changes for a True Caster or Arcadian Caster creature:** its known-cantrip picker is widened like its other picks. Before, it offered its own tradition only.

## Harness

- **New pair: `verify-ea-block3a-core` (85 checks) and `mutate-ea-block3a-core` (66 mutations, all caught).** They cover:
  - C, the declarations: the traditions rule, a subclass's answers, the ladder, the tracks, the cantrip slots;
  - HM, High Magic per tradition and the tradition gate;
  - PP, the ability bonus;
  - PK, the pickers run with an Archmage, a Sorcerer before and after its birthright, a Witch and a Wizard;
  - CAP, the cap raise;
  - SP, the specialist opening;
  - FAM, the familiar's modifiers and the snapshot;
  - PP, the grant rows and the racial PP;
  - AB, the attack base;
  - N, the natural die;
  - Z, the version.
- **Re-anchored to lines this release moved:**
  - `verify-block8-core` (C5): the settled hook's new `natural` line.
  - `verify-block40-aspects` (J1): the Specialist Spell filter's module opening.
  - `verify-chapter10-311-320` (W1b) and `mutate-chapter10-311-320`: Shadow Walk reads `dice.unmodified`. W1b had pinned the defect.
  - `mutate-ea-block2b-core`: the casting DC's arguments gained `capRaise`.
  - `mutate-casting-dc` and `mutate-classes` (B18, N1, N1b): the overcast line, the book ladder and the PP ability bonus took their new forms.
  - `mutate-ea-block2-core`'s "a High Magic caster's spells are low magic" is caught again: the new list test answers lists and "any" only, leaving `true` to Block 2's line.
- **The uncalled-export ratchet:** five helpers used only in their own files are no longer exported. Nine that the new harness drives are declared keeps, each with its reason.
- **Re-pinned to 3.680.0:** the version anchors of fourteen mutation files and the release link (`system.json`'s download now names v3.680.0).
- **Full sweep on the staged 3.680.0** (the list `tools/verify.mjs` runs: all 663 harnesses, in two shards on two copies checked identical to the source, after the review's fixes and the re-anchoring above): **all 663 pass**, with `verify-rules-have-callers`, `verify-no-undefined-names` and `verify-checks-can-fail`. None is unpaired or unrun.
- **Inner Tempest 1.0.4 on 3.680.0:** Blocks 1–4, 6–10 and the weapons all green.
- **Packs:** unchanged. The release ships the 3.676.1 pack files byte for byte.
