# TRG Prime: handover (blocks 39–40, Appendices 1–5; current as of 3.624.0)
## 3.622.3 (tag r36223): a creature's own token

Graham's ruling R1 was "your recommendation". The release notes are `claude/release-notes-3.622.3.md`.

**The change:** five lookups by actor id now use `activeToken(actor)` from `combat/geometry.mjs`:
- `light-shift-workflow.mjs`: the circle's target;
- `cast-workflow.mjs`: the area caster;
- `targeting.mjs`: the picker's self row;
- `aid-bonus.mjs`: the aiding creature;
- `skills.mjs`: the skill-action token.

**Harness:** new pair verify/mutate-drive-36222 (10/6). Its B2 walks every module file for the old lookup. Sweep 471/471 on the first pass. The schema stays 3.622.1.

## Live-test plan, 3.622.3

- **Snapshot:** `__snap36221` is still current.
- **Fairy Fire:** cast it at two unlinked copies of ZZ Plain Foe (F and U) with a third copy elsewhere. Each circle sits on, and follows, its own token.
- **The target picker:** cast a spell that needs a target with W while a second W copy is on the scene. The "(yourself)" row names the caster's own token.
- **An area spell:** an area spell from the second copy of an actor uses that copy's disposition and position.

## 3.622.4 (tag r36224): one cast, one light step

Graham's ruling R1 of 6 October was "your recommendation". The release notes are `claude/release-notes-3.622.4.md`.

**The change:** `regionLightShifts` in `light-workflow.mjs` counts circles that share a `castId` once. Different casts still accumulate, and a circle without a cast id counts on its own.

**Harness:** new pair verify/mutate-drive-36223 (7/4). Sweep 473/473 on the first pass. The schema stays 3.622.1.

## Live-test plan, 3.622.4

- **Snapshot:** `__snap36221` is still current.
- **Fairy Fire** at two adjacent ZZ foes at light level 6: both read **7**, not 8.
- **A second light spell** overlapping one of them (Light, or another cast of Fairy Fire): that creature reads one step more.
- **Separating the foes** (with displace): each still reads 7 on its own circle.

## Block 40 (index 410 to the end: Appendix 4 Divine Aspects, Appendix 5 Luck)

The last block of the core rulebook. **Audit:** `claude/audit-pages-410-end.md`. Graham ruled R1–R17 "your recommendation" on 6 October 2026.

### 3.623.0 (commit 0a4f6a2, tag r3623): divine aspects, R1–R10

The release notes are `claude/release-notes-3.623.0.md`.

- **New modules:**
  - `module/aspect-rules.mjs` (pure): `specialistSpellAccess`, `clericSpecialistAccess`, `pickerSpecialistAllowed`, `divinityCasterSources`, `aspectMissingWarning`, `secondAspectRefusal`, `aspectEthicsChoices`, `bonusSpellsAboveLevel`, `aspectSpellKeys`, `effectiveClassKeys`.
  - `module/aspect-workflow.mjs`: `specialistAccessFor` (reads the federated divine-aspects pack) and `pruneAspectBonusSpells`.
- **Edited:**
  - `feats-workflow.mjs`: the Specialist Spell feat filters through `specialistSpellAccess`; Cloistered Priest allows specialist spells via `clericSpecialistAccess`.
  - `picker-filters.mjs`: the spell slot indexes `system.specialist` and `system.specialistClass` and takes `specialistAccess`.
  - `documents/item.mjs`: `_refusedAsSecondAspect`, option `trgAllowSecondAspect`.
  - `sheets/actor-sheet.mjs` and the hbs: the aspect button from `divinityCasterSources`, the No Divine Aspect banner, ethics from `aspectEthicsChoices` with an off-list banner, and the picker's early refusal of a second aspect.
  - `grant-autorun.mjs`: the level hook calls `pruneAspectBonusSpells`.
  - `proficiency-rules.mjs` `deityWeaponsApply` (the Deific Aspect ability counts), used by `proficiencies.mjs`.
- **Harness:**
  - New pair: verify/mutate-block40-aspects (69/23).
  - `verify-feat-grants` A5 now counts 5.
  - Sweep 475. Ratchet 525. The schema stays 3.622.1.

### 3.624.0 (tag r3624): luck, R11–R17

The release notes are `claude/release-notes-3.624.0.md`.

- **`luck.mjs`:**
  - `LUCK_CHECK_TYPES`, `luckEligibility`, `luckFumbleChoice`, `hasHalflingLuck`;
  - `injuryRegainsLuck`, `naturalTwentyOffersLuck`, `luckOnCreate`;
  - `applyLuckReduction` no longer raises a score below 2.
- **`luck-workflow.mjs`:**
  - `applyLuckToCheck`: flags `luckArmed` and `luckSpent {combatId, round}`;
  - `rollLuckCheck`: the sheet button, which arms, disarms or rolls now;
  - `awardLuck`, `regainLuckFromInjury`, `lastCheckTouchedByLuck`.
- **`dice/check.mjs`:**
  - `config.useLuck`;
  - the luck step in `roll()` before the save reactions and Fateful Temptation;
  - `#rollD20` handles `luckFumble`;
  - the card flag `checkCard.luckUsed`;
  - no Conviction Bonus when `luckUsed`.
- **`check-card-interactions.mjs`:** the Bonus is refused on a luck card, Unbreakable Resolve skips one, and `maybeAddLuckAward` adds the GM's natural-20 button (flag `luckAwarded`).
- **Elsewhere:**
  - `check-dialog.mjs`: the Use Luck tickbox, passed on by the actor sheet and `action-workflow.mjs`.
  - `feats-workflow.mjs`: Small Folk refuses a check luck touched.
  - `attack-workflow.mjs`: `rollCriticalInjury` regains luck when the result is over 90 and not forced.
  - `documents/actor.mjs` `_preCreate`: `luckOnCreate`.
  - `migration.mjs`: schema **3.624.0** and `migrateNpcLuck` (internal).
  - `magic/resurrection.mjs`: luck is left alone.
  - `settings.mjs`: the hint.
  - The sheet shows "Luck (armed)".
- **Harness:**
  - New pair: verify/mutate-block40-luck (59/30).
  - Updated: `verify-resurrection` (P3, P3b, P6, C1b, plus one mutation), `verify-live-3612` A4 (8), `verify-drive-3622` D5 (schema 3.622.1 or later; the mutation is anchored on 3.624.0).

## Live-test plan, 3.623.0 and 3.624.0

**Setup:**
- Loading the world offers a migration: schema 3.622.1 → 3.624.0. It runs only the NPC-luck pass.
- **Expected drift against `__snap36221`:**
  - NPCs, companions and familiars at luck 15 are now 0, and the schema is 3.624.0;
  - take the new snapshot after the migration.
- Use ZZ rig actors only, never unpause, and flush token moves with a screenshot.

**Divine aspects:**
- **R2:** a ZZ Cleric of Dawn's Specialist Spell feat offers Dawn's PP-capped spells and the free four, not Touch of Obedience. A ZZ Crusader of Dawn is offered Dawn's spells.
- **R3:** Cloistered Priest on a ZZ Cleric of Dawn offers Dawn's spells.
- **R4:** a ZZ Fighter with Divine Knight shows the Divine Aspect button and the banner; adding an aspect clears the banner.
- **R5:** a second aspect is refused, from both the picker and a compendium drag.
- **R6:** the Ethics dropdown on a Cleric of Dawn shows three; an off-list ethic shows the banner.
- **R7:** a ZZ Cleric of Dawn at 8 dropped to 5 loses Fireball and Wall of Fire, with a notification.
- **R8:** a ZZ Wizard's Add Spell picker lacks Healer's Grace.
- **R10:** a ZZ Bard with the Champion archetype and Pandemonium is proficient with a Khopesh, and the panel lists it.

**Luck** (turn the Luck setting on, and restore it afterwards):
- **The dialog route:** a skill check with Use Luck ticked posts a Luck Check card, then the check with Advantage, and luck falls by 1.
- **The armed route:** arm luck, make an attack; the attack has Advantage and the button returns to "Luck".
- **A Fumble:** force a low luck die with `__fq`. The check rolls two dice and shows the "Luck fumbled" line.
- **Once a round:** in a combat, a second luck check in the same round is refused.
- **With Conviction:** Conviction Advantage plus Use Luck means luck is refused and nothing is spent.
- **On a luck card:** a failed save shows no Unbreakable Resolve button, no Bonus button, and Small Folk refuses.
- **A natural 20:** force a 20; the GM sees the award button, and pressing it adds 1 luck.
- **A critical injury:** forced over 90 on a ZZ character, it regains 1 luck.
- **Halfling Luck:** a ZZ halfling with Luck of the Small Folk sees DC 18.
- **R16:** a new NPC reads luck 0.
- **R17:** Resurrection on a ZZ corpse leaves its luck.

## Live test of 3.623.0 and 3.624.0 (6 October 2026)

The report is `claude/live-testing-report-3.624.0.md`. Every R1–R17 check passed. The migration drift was exactly as expected: 16 NPCs' luck 15 → 0, plus schema stamps. The snapshot is now **`__snap36240`**, and the world was restored and verified against it.

**Finding awaiting a ruling:**
- **F1:** Resurrection on a creature that died by Dying leaves it Dead. `spell-effects.mjs` clears dead, then dying, then unconscious. Deleting Dead fires the death watch while Dying is still over the Death State, so Dead is put back. The fix is to clear Dying and Unconscious first.

**Observation awaiting a ruling:**
- **O1:** with Pillars of Faith active, R2's "Cleric specialist spells no aspect lists" is worked out over every installed aspect. Reincarnated Embrace leaves the list (three Pillars aspects list it), and Pillars' Communal Litany and Grace beyond Need join it.

**Rig notes:**
- A tool result containing "~=" style text can be blocked as "Cookie/query string data"; pass chat text through `H.clean`.
- The Add Spell picker and the feat choosers are DialogV2.wait, so their option lists can be read from `__pick` with a capture function.

## 3.624.1 (tag r36241): the 3.624.0 drive's fixes

Graham's rulings R1 and R2 were both "your recommendation". The release notes are `claude/release-notes-3.624.1.md`.

- **R1:**
  - `magic/resurrection.mjs` exports `DEATH_CONDITIONS_CLEARED = ["dying", "unconscious", "dead"]`, with Dead last.
  - The resurrect row in `spell-effects.mjs` loops over it before restoring the body.
  - Instant deaths (Fatigue 20, Doomed, Soul Drain) are still not lifted, by the page.
- **R2:** no change. The free Cleric specialist spells are worked out over every installed aspect.
- **Harness:**
  - New pair: verify/mutate-drive-36240 (10/5).
  - Updated: `verify-resurrection` K0b, and `verify-drive-36221` D1, which is no longer vacuous.
  - Sweep 479. Ratchet 525. The schema stays 3.624.0.

**Live-test plan, 3.624.1:**
- Kill a ZZ test character by Dying (for example Dying 7 against Death State 5).
- Resurrect it out of combat, with a Component Pouch: it is alive with 1 HP, no Dead, Dying or Unconscious, and no "Phase 1 — Assessment" card.
- Restore against `__snap36240`.

## Live test of 3.624.1 (6 October 2026)

The report is `claude/live-testing-report-3.624.1.md`. R1 passed: a creature dead by Dying (6 against Death State 5) was raised to 1 HP, with no Dead, Dying or Unconscious and no Assessment card. Restored and verified against `__snap36240`.

**Observation awaiting a ruling:**
- **O1:** the raised creature keeps the Bleeding it died of (Bleeding 4 from the fatal injury), which at 1 HP likely returns it to Dying.
- **The proposed fix:** Resurrection also clears Bleeding, as the death's ongoing damage rather than a "long-term debilitation".
