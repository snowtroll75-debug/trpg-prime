# TRG Prime 3.664.0, with Inner Tempest 0.1.0 and Fiends & Fables Prime 0.45.1

20 October 2026. This release carries the core changes Inner Tempest needs (its rulings of 20 October and v1.2 of the book), the first block of the Inner Tempest module, and the dragon-tail follow-up for Fiends & Fables. **Install all three.** Inner Tempest 0.1.0 needs 3.664.0.

## Core 3.664.0

### Focus and innate casting

- **Extra Focus uses.** A carrier can declare `focusExtraUses` rows: +N uses to every Focus item, to Focus items with a named trait (Deep Focus: Technique), or to named items (Ghost Art Mastery). A row can also say that Refocus restores every use of those items (Graham's IT-M2), not one. Nothing in core declares these yet.
- **Another ability for one action.** `actionAbilityOptions` lets an action use a different ability score when it is higher (Considered Mind: Intelligence for Refocus). The difference is shown as a named row on the roll.
- **One spell's own magical ability.** An innate spell carrying `castingAbilityOverride` now uses that ability for its attack, its save DC and the sheet's figures.
  - **Behaviour change:** Pillars of Faith's Votary already wrote this flag, and core ignored it until now. Votary innate spells will now use the ability the Votary names.
  - A granting item can name the ability for the spells it grants (`grantedSpellAbility`, e.g. the Kitsune's Ghost Sound with Charisma).
  - A `spellChoice` can name one too (`castingAbility`, e.g. Natural Chi's cantrip with Wisdom).
- **The innate PP limit (D16; Graham, 20 Oct).** A character or companion can no longer cast an innate spell whose base PP is above the level it is cast at. The cast is refused before any AP is spent, with a warning. Item casts are exempt, because their PP was paid at the workbench. **Monsters are not gated:** 91 Fiends & Fables innate spells exceed their creature's level, and 66 of them have printed DCs.
- **Daily preparation restores rune and wondrous Focus.** These were only ever cleared by Refocus, which was a core bug.
- **The first time each day.** A carrier can declare `dailyFirst` rows:
  - The day's first Refocus resolves one degree better, to a maximum of Critical (Centred Recovery), or is treated as a Critical (Tianzhi Discipline, from a later block).
  - The day's first Power Recovery during a rest restores double the PP (Centred Recovery).
  - The card says when this happens. Daily preparation starts a new day.

### Stances for modules

- `helpers.enterStance(actor, item, {name, apCost, changes, flags, …})` is the core's own stance entry. It applies the one-round wait, replaces the previous stance, allows Stance Mastery's second stance and Reactive Stance's free entry, and spends the AP. The stance's `flags` (conditionals, defence rows, magical attacks) ride on its effect, so they last exactly as long as the stance. It returns false when a rule refuses the stance. `helpers.activeStances(actor)` lists the stances that are up.
- **Rules that apply only while you are in a stance.** An item can declare `stanceConditionals` and `stanceDefenceDC`, which are read only while a stance is up (Martial Affinity's +1 racial to AB and DB, Tranquil Mind's advantage). A stance is an effect entered through a Stance-trait feat or ability. Fight Defensively and Full Defence are not stances, because their actions carry no Stance trait.

### Creature traits as a scope

- Conditionals have a `targetTraits` axis, filled on weapon attacks and on actions aimed at a target, in both the dialog and the automatic path.
- Defence rows have a `sourceTraits` axis.
- Magical-attack declarations have a `targetTraits` axis.
- This is how Spirit Stance's "+1 against spirits and incorporeal creatures, and your Strikes are magical against them" is applied automatically. A spirit and an incorporeal creature are traits, not creature types.

### Helpers for a module ability that moves and strikes

- `helpers.armMove(actor, {maxFeet, speedKey, provokes}, label)` arms the player's next token drag with no AP, as a compound action's leg is armed.
- `helpers.rollWeaponAttack(actor, weapon, {apPaid: true})` is the Strike workflow itself.
- `helpers.traitGate` and `helpers.recordTraitUsage` apply Flourish's once-a-turn limit (and the other trait rules) to a module ability, as they do to a core action.

### Smaller declarations

- **A heritage can grant a natural attack** (`grantedWeapons`, from the companions pack): the Kamiri's Raptorial Blade and the Suzume's Sting. `template.json` gains the field on heritages.
- **Immune to natural heat** (`derives.heatEnvironmentImmune`, Zenki): an Exhaustion check called for Extreme Heat is not made.
- **Breathes water** (`derives.breathesWater`, Zennyo): holding your breath underwater never starts.
- **Flat-check increases scoped to a condition.** `missCheckDCIncrease` can be `{value, conditions}`. Ethereal Sight adds +2 against a hidden creature and Zen Awareness +1 against a hidden or invisible one. Osp-Iar's bare number still reaches every condition.
- **Ghost Touch for magical attacks only** (`ghostTouch: {magicalOnly: true}`, Ethereal Sight).
- **Conviction, falls and carrying.**
  - `convictionPool` raises the pool's maximum (Fuku), with the point given when the item is added and taken back when it is removed.
  - `fallReduction` shortens a fall (Ren: 20 ft) and says so on the card.
  - `carryStrength` adds carrying Strength (Kabuto: +50 lb).

## Inner Tempest 0.1.0 (Block 1)

- Four races, twenty heritages, thirteen racial abilities, two natural attacks, Scree Cant, eleven backgrounds and twenty-three General feats (Spirit Stance included).
- Ten automations: Fluid Form, Impact Absorption, Predator's Pounce, Wing Burst, Living Lantern, Natural Chi, Spirit Stance, Elemental Balance, Stunning Reflexes and Ancestral Guidance.
- What each feature reaches against its plan is in the module's `docs/INNER_TEMPEST_AUTOMATION_REPORT.md`. Six General feats ship descriptive until the core changes D14, D17, D18 and D19 land.
- **Questions for Graham:**
  - the Tianzhi heritage language;
  - Tsuchi's advantage against a Shove or Trip, which is rolled against a static DC;
  - whether to approve D1.

## Fiends & Fables Prime 0.45.1

- **Sweep on the dragons' tails** (Graham's IT-C5 ruling: "The sweep trait is added to the dragons tail attack"). It is added to the Tail of the Cold, Fire, Sea, Forest, Cave, Guardian and Light Dragon Sovereigns and the Shade Dragon Mature. The Frost Drake's and Earth Drake's tails are unchanged until you say whether drakes count.
- **Wing and tail dice follow the core** ("Wing and Tail damage is covered in the core rulebook"). Every dragon's wing and tail was checked against core Wings (1d6) and Tail Slap (1d8) stepped to the creature's size. Two differed, and both are corrected:
  - Fire Dragon, Sovereign: Wing 1d12 → 1d10 (Huge).
  - Shade Dragon, Talon: Wing 1d8 → 1d6 (Medium).
- **Not changed, for you to rule on:** the Cold Dragon Sovereign's and Cave Dragon Sovereign's tails deal **slashing** damage, where core's Tail Slap is bludgeoning.
- Nothing else in the module changed. A record-by-record diff against 0.45.0 shows 10 changed items, none added or removed.

## Checks

- New pairs:
  - `verify/mutate-focus-declarations`: 52 checks, 48 mutations.
  - `verify/mutate-stance-declarations`: 35 checks, 31 mutations.
  - `verify/mutate-heritage-derives`: 13 checks, 11 mutations.
  - `verify/mutate-daily-firsts`: 16 checks, 13 mutations.
  - Every mutation is caught.
- Re-anchored to the new code, without changing what they assert (the first full sweep found the ones not already done; each was a check pinned to the exact wording of a line this release changed):
  - `verify-magical-attacks` C1
  - `verify-opposed-aura` E1, `mutate-opposed-aura` E1 and D11
  - `mutate-ward`'s uuid mutation
  - `verify-automation-pass` K13
  - `mutate-chapter5-racial-101-110` A21
  - `mutate-ff30-block20` B7
  - `verify-ff30-block3` B2 and its mutation
  - `verify-block37-weapons` H4
  - `verify-block38-rewards` D3 and its mutation
  - `mutate-module-feats` D1
- **A harness defect, fixed.** Fifteen mutation harnesses printed "FAILED" when a mutation survived but still exited 0, so the sweep counted them as passes. The first sweep caught one doing it (`mutate-module-feats`, its anchor made ambiguous by this release). All fifteen now fail the sweep on a survivor. None of the other fourteen had a survivor.
- Inner Tempest: `verify-block1` 352 checks, `mutate-block1` 38 mutations, all caught.
- **Full sweep: 599 of 599 green** (3.663.5's baseline was 591 of 591; the eight new files are the four new pairs), run on a clean copy of the release with the 3.663.5 packs, which this release does not change.
