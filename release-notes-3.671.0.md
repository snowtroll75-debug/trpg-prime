# TRG Prime 3.671.0

25 October 2026. The seams Inner Tempest's Block 7 (the twenty archetypes of Chapter 5) needs, from its audit (C1–C14, and C15–C16 found while building) and Graham's rulings of 25 October (B7-1 to B7-8).

- **Install over 3.670.1.** Inner Tempest 0.8.0 needs it. Inner Tempest 0.7.1, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2 work on it unchanged.
- **No migration prompt.**
- **Nothing changes for a game that declares none of the new things,** except that Refocus now asks which ability to restore before its check dialog rather than after (so the dialog can offer a bonus for that ability). Two rules are read more widely: a progression line reading "Level +N" or "Gained class skill +N ranks", and a prerequisite reading "Learned Caster" or "Instinctive Caster", were passed over before (the archetype was allowed); they are now checked.

## What a module can now declare

**C1 — two more progression lines.** "Level +10" is character level 10 (B7-2). "Gained class skill +10 ranks" is the class skill the archetype's own choice gave (a `registerClassSkillGrant` entry for the archetype, by name). The parser also reads a trailing full stop, "&" for "and", and "skills" for "skill". A line it cannot read still allows the archetype.

**C2 — core archetypes opened to a class.** `registerFeatAccess("archetype", className, [names])`: the archetype picker offers those archetypes to that class past the class and tier gates. Inner Tempest's "Existing feats" lists (FA-22).

**C3 — an archetype that counts as another.** `registerArchetype(name, { countsAs: ["Archer"] })`: for the class feats an archetype opens, the character has both. Zen Archer.

**C4 — class skills from a feat.** `flags.trg-prime.classSkills: ["Medicine"]` (names or keys) on a feat or ability: those skills are class skills while it is owned, shown with the feat as their source. Jade Physician, Night Lotus, Oathbound, Ronin.

**C5 — named weapons in another category.** `weaponCategoryAs: { names, category }` on an effect: an exotic weapon of that name is that category for the character's proficiency. `weaponProficientName` now takes a list. Oathbound's katana and wakizashi; Zen Archer's bows.

**C6 — unarmed abilities with a weapon.** `unarmedAbilityWeapons: { itemIds, names, groups }`: a Strike with that weapon counts as unarmed for the abilities that ask (traits granted to unarmed attacks, Death Mark, a Strike's set or offered damage type, Savage Strikes, strike riders, the attack form), but keeps the weapon's own damage. Zen Archer's bows (B7-6: abilities, not fist damage), the Soul-Bound Weapon.

**C7 — a weapon's damage scaling with BAB.** `weaponScaling: { itemId, perBAB: { every, value }, countsAs: { magical, "cold iron", silver, adamantine }, label }`: as the Disciple's Powerful Fists, for one weapon. Soul Weapon Master.

**C8 — a sheathed weapon.** A weapon carried, not equipped, not stowed, not natural (B7-5). The conditional axis `sheathedGroups: ["sword"]` matches when one of that group is sheathed; the helper `sheathedWeapons(actor, group)` lists them. Iaijutsu Master.

**C9 — a Strike its target cannot react to.** `rollWeaponAttack(…, { noReactions: true })` offers the target no defence, critical replacement, reactive disarm, Savage Jaw or missed reaction, and says so on `trgPrimeStrikeResolved`. An effect with `noReactions: true` blocks the bearer's reactions, read by the system's reaction refusal. Drawn Verdict.

**C10 — a temporary immunity.** Helpers `temporaryImmunityRefusal(target, key)` and `grantTemporaryImmunity(target, key, seconds)`. Restorative Palm's hour.

**C11 — a new save against an affliction.** Helper `rollAfflictionSave(actor, affliction)`: the stage save, without the stage's damage. Restorative Palm.

**C12 — an innate spell cast once.** Helper `castInnateOnce(actor, spellData, { ability, tradition, allowance })` casts the spell as innate with that ability and tradition, with no uses kept. Harmony Warden's trance.

**C13 — Refocus by what it restores.** The conditional axis `restores: ["Ghost Art"]` matches a Refocus restoring an item of that category or name. Veilborn.

**C14 — a spell's own bonus.** `flags.trg-prime.spellBonus: { attack, dc, type, label }` on an innate spell adds to its attack checks and save DC. Never to an item's cast. Lotus Enchanter and Onmyoji Necromancer.

**C15 — bonuses that do not stack with each other.** `stackGroup` on a conditional modifier or a stat bonus: of the positive modifiers sharing a group only the highest applies. Formbinder's "the greater of the two".

**C16 — learned and instinctive casters.** The prerequisite "Learned Caster" or "Instinctive Caster" is read against the class's caster style (IT-C9). A class with no caster style (a non-caster) is refused; where the style cannot be read at all, the prerequisite is passed over, as unread prerequisites are. Shugenja.

## Found in review

An independent review of the build, before release, found these; all are fixed above.
1. **A class's trait opened by a feat** (`classFeatAccess`) was refused at the class-feat picker's source gate before the trait was read, so Steel Disciple's Kensai feats (all source-tagged Kensai) were never offered, nor Dancing Leaf, Deflect Arrow and Shadowy Step to a Brawler. An opened trait now passes the source gate for a feat that carries it; a feat only tagged for the class stays closed.
2. **Refocus's `restores` reached only a Shift-click.** The check dialog was not told what the Refocus restores, and a dialog roll applies only what the dialog showed. Refocus now names its ability before the dialog opens and hands it on; the dialog also accepts `sheathedGroups` and `restores`, as every axis must be accepted on both paths (`verify-conditionals` F5/F6).
3. **"Learned Caster" read the class's style,** not the resolved one: an Enigma Wizard (instinctive) was offered Shugenja, Spell Substitution and Spontaneous Scholar. It reads the resolved style now.

**Read more widely, by design.** Two core rules that were passed over before are now checked, as the book says: the Adventurer's progression line ("Gained class skill +10 ranks") needs its chosen class skill at 10 ranks before another archetype is taken; and Spell Substitution and Spontaneous Scholar ("Learned Caster") are offered to learned casters only.

## Checks

- **New harness pair `verify/mutate-block7-core`:** 59 checks and 74 mutations, all caught (the review's fixes are section R).
- **Re-anchored to the new code, checks unchanged in meaning:** `verify-ff30-block17` (S11: a Strike its target cannot react to offers no missed reaction), `verify-ff30-block19` (S1: nor a critical replacement), `verify-block2-core` (A6: the resolved hook says so), `verify-unliving-mechanisms` (D4: the strike-type read through the unarmed-ability view), `verify-chapter5-batch` (E3b) and `verify-chapter6-gear-151-160` (H3: the same view beside Savage Strikes and the armoured fist), `mutate-stance-declarations` (the dialog's axis line), `verify-block3-core` (B12, B13), `verify-block4-core` (H3, I4), `verify-block6-core` (C1, C2, C10), `verify-attack-forms` (C1, C2), `verify-chapter6-gear-161-170` (F5c), `verify-chapter6-gear-181-190` (F11), and the mutations `mutate-attack-forms`, `mutate-block3-core`, `mutate-block4-core`, `mutate-block5-core`, `mutate-block6-core`, `mutate-chapter6-gear-161-170`, `mutate-chapter6-gear-181-190` and `mutate-module-feats`, all caught. Version pins moved to 3.671.0 in `mutate-block6-core`, `mutate-fixes-3669-2` and `mutate-fixes-3670-1`.
- `verify-mutation-anchors` and `verify-no-undefined-names` green. `verify-rules-have-callers`: four new exports called in their own file (declaredClassSkills, declaredReactionBlock, sheathedWeapons, archetypeGrantContext) are recorded as deliberate keeps, each with its reason; the backlog is unchanged at 513.
- **Full sweep** on the staged build, after the review's fixes: 645 harnesses. 635 passed; the 10 that failed were five verify/mutate pairs pinned to lines Block 7 changed (above) and that ratchet's four new keeps. Each was re-anchored, unchanged in meaning, and the ten run again on the stage: all green, every mutation caught. `verify-checks-can-fail` green.
