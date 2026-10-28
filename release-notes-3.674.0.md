# TRG Prime 3.674.0

27 October 2026. The seams Inner Tempest's Block 10 needs: the Dragon Companions and Dragon Tamer. They come from its audit (C1–C9; C10 to C12 and F were found while building) and Graham's rulings of 27 October (B10-1 to B10-14).

- **Install over 3.673.3.** Inner Tempest 1.0.0 needs it.
- **No migration prompt.**
- **Nothing changes for a game that declares none of the new things.** An Animal Companion is created, levelled, sized and shown exactly as before.

## What a module can now declare

**C1 — kinds of companion.** `registerCompanionKind({ key, label, className, creatureType, pack, levelFrom, sizeAbilityMods, abilityPoints, command })`.
- `createCompanionFor(master, feat, { kind, only, title, intro, flags })` creates a companion of that kind. Its chooser lists only that kind's base creatures, from its own pack.
- A master may have **one companion of each kind** (B10-12): a ranger who becomes a Dragon Tamer keeps the wolf.
- `companionsOf(master, kind)` lists them.
- The sheet's label, the creation card and the level-sync card all follow the kind.
- `system.companion.kind` records it; it is blank for an animal.

**C2 — a kind's own level.** `levelFrom(master, companion)` decides the companion's level, which `syncCompanionLevels` then keeps in step. For a dragon it is its base level plus the master's levels since it hatched (B10-1). An answer below 1, or a thrown error, falls back to the master's level.

**C3 — a companion that grows with its level.** A module records the size the companion has grown to in `system.companion.grownSize`.
- The companion's size is the larger of that and its Increase Size picks.
- Its natural attacks resize to it.
- Its tokens and prototype token are resized when the size changes.

**C4 — a companion feat for its own kind.** `flags.trg-prime.companionKind` names the kind a feat belongs to. The picker offers it only to that kind. A feat with the Companion trait and no kind stays the Animal Companion's.

**C5 — area damage dice by level.** `damage: { perLevel: "d8", type }` rolls a die of that size per level of the user ("6d8" at 6th). This is a dragon's breath. An ability that borrows the breath's dice reads them at the user's level too.

**C6 — no size Str/Dex.** A kind declaring `sizeAbilityMods: false` takes no Strength or Dexterity change from its size steps (B10-2).

**C7 — no ability-point pool.** A kind declaring `abilityPoints: false` shows no PC ability-point banner.

**C8 — Soul Drain held by a source.** Module API `holdSoulDrain(actor, source, amount)` and `releaseSoulDrain(actor, source, { amount, heal })`.
- While held, no rest, cure or player's hand takes Soul Drain below the amount held. Only a GM's direct edit can.
- A release lowers the hold first. With `heal`, the released points are also healed (a dragon's death: "1 point … each week"). Without it, they simply heal normally from then on (a reunion).
- A hold never outlasts drain the GM has already healed below it, so a release cannot raise Soul Drain back up.
- The Soul Drain card shows the value after the hold. The rest card counts only what was really healed.

**C9 — Animal Soul finds the companions.** Found in passing: it looked under a flag that companion creation never sets. It now reads `system.companion.masterId`.

**C10 — an owner's own repertoire schedule.** `flags.trg-prime.repertoire` on the actor overrides the class's.
- `firstPicks` sets the opening count: each base dragon's printed spells, then one a level (B10-6).
- `firstPickExact: false` lifts the PP 2 limit on the first picks.
- A schedule declaring neither reads exactly as before.

**C11 — a rung's fallback weapon.** A declared area's `damageByRung` row may carry `fallback: { name, damage, size, damageType }`. It is used, resized to the creature, when the creature has no matching weapon. This is Wing Buffet before the dragon's Wings arrive (B10-5).

**C12 — the death question for a module.** The module helpers gain `isDead(actor)`: the system's own test, covering Dying past the Death State, instant deaths and Constitution −5.

**F — the flanking partner.** A bound companion counts as a flanking partner only when it stands beside the target, whichever kind it is.

## Fixed: Hurling's magical ability score on copies that never had the row

Graham, 28 October: "The spell Hurling should add the casters magical ability score to total damage inflicted, this is not currently working."

- **Why it still failed after 3.666.1:** the repair reached only the world's own casters. These copies kept rolling a bare 1d6:
  - every Fiends & Fables creature with Hurling (Balor, the Dao, the Human Ghost and eight more);
  - a caster kept in a compendium (Grokash in the PCs pack);
  - any of them brought into a world later.
- **The fix:** a damage row that declares no ability now reads the spell's printed sentence.
  - Hurling: "inflicts 1d6 + magical ability score".
  - Guiding Stone: "equal to 2d6 plus your melee damage modifier".
  - Those two sentences only. Spiritual Weapon's "modified by your magical ability score" is a different rule and is left alone.
- **A row that declares its ability is followed as it says.** That includes one the GM has blanked.
- **Still nothing to add for four creatures:** Balor, Hantya, Thel and Khavar declare no casting ability. Their printed attack does not settle one (Hantya's +16 at level 13 is not its Charisma 6). Setting their magical ability on the sheet makes Hurling add it.
- **Harness:** `verify-session-fixes-1022` 47 checks; `mutate-session-fixes-1022` 41 mutations, all caught.

## Correction to the Block 10 audit

The audit said the light dragon's DB from the rules would be 23. It is **24**, which is what the book prints. Only the fire dragon differs (22 against 23).

## Harness

- **`verify-block10-core`:** 39 checks; **`mutate-block10-core`:** 66 mutations, all caught.
- **Re-anchored:** the Block 6–9 core mutations' version pins, the module-classes pair's repertoire anchors, and the release-link mutation.
- **`tools/uncalled-exports.json`:** keeps added for `holdSoulDrain`, `releaseSoulDrain`, `perLevelDamage`, `normaliseCompanionKind` and `companionFeatKind`.
