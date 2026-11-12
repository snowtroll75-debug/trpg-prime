# TRG Prime 3.686.0

8 November 2026. The seams Eldritch Arts' Block 8a needs: **H12**, **H17** and **H18** of `ELDRITCH_ARTS_BLOCK8_AUDIT.md` §6, as Graham answered it the same day (17:22: "As recommended", Q167–Q184 as each row recommends, H12–H18 approved). With them, **Q170**'s reading of "Until dismissed". Block 8a is the Grimoire's second half, first part: the eight Bindings, the Symbols and the utilities (Eldritch Arts 0.11.0). H13–H16 belong to Block 8b (3.687.0) and are not here. Built on 3.685.3.

**Confirmed by Graham, 9 November 2026 (10:01–10:02):** the "until dismissed" lock may go in 3.686.0 ("Yes"), and every reading listed under "For Graham" is kept as built ("happy with all eight as built"). That includes Insanity's per-turn conditions lasting their turn, the hold not stopping the GM, the pre-existing general-path issue left unchanged for a later release, and the core's eight walls left without the height choice.

- **Install over 3.685.3.** No migration. **Two core spells change in every world** (below): Remove Curse and Insanity. Their compendium entries change; copies already on sheets keep their old rows until they are re-added from the pack (nothing rewrites an owned item at load).
- **Eldritch Arts 0.11.0 needs it.** Eldritch Arts 0.10.1, Inner Tempest and Pillars of Faith run on it unchanged: every other seam here is default-off.

## For every world

**Remove Curse counteracts curses** (H17's second half; Graham approved it knowing it changes a core spell in every world).
- **Before:** the spell had no effect rows (`effects: []`). It ended nothing, so "can only be removed with a Remove Curse spell" had nothing to gate on.
- **Now:** one `counteract` row: `{ traits: ["curse"], limit: 1 }`. It finds any effect whose source carried the Curse trait (a condition a spell laid has carried its spell's traits since 3.613.0), and one casting addresses one ("one curse afflicting them"; the caster picks when there are several). The check is the core's own counteract check. It is prefilled with the effect's level and DC when the effect carries `counteractAs` (Eldritch Arts' symbols: "against the symbol's PP", Q183); otherwise it asks, as it always has. The item clause stays on the card.

**Insanity rolls its d10 each turn** (H18; approved knowing it automates the core spell in every world).
- **Before:** a `note` row. The table was rolled by hand every turn.
- **Now:** a `turnTable` row. Each creature that fails its Will save is marked insane for 1 round per 2 points it failed by (rounded down, at least one: Holy Shout's rule). At the start of each of its turns, before AP are regained, the d10 is rolled: 1 unaffected, 2–4 stunned 1d3, 5–7 slowed 1d3, 8–10 confused. Each roll's condition is that turn's behaviour. It is removed when the next roll is made, and when the insanity ends. Stunned's value is spent by the turn's AP, as stunned always is.
- **Only the roll's own** (the turn table's own bookkeeping; the general condition path is unchanged): a condition the creature does not have is laid as any spell row is, stamped with the roll's own id and a 1-round clock, and goes at the next roll or when the marker ends. One it already has is left to its source: its cast id, its clock and its duration are never touched. A valued one (slowed 1 rolled slowed 2) has only its value raised, by the condition's own stacking rule. The rise is recorded on the marker and taken back at the next roll or when the marker ends, by that same rule:
  - **A condition that keeps the higher value** (slowed, stunned) goes back to what it was only while it still stands at the roll's value. Slowed 1 → 3 by the roll, then 4 from a Slow spell, is left at 4.
  - **One that adds** (injured, bleeding, fatigued, if a table lays one) loses the roll's rise from what stands, never below what it was. An unvalued one (confused, already confused) is left as it is and nothing is recorded, so nothing of it is removed later.
- **Its counted turns, or the clock.** A creature that is itself a combatant in a started combat gets no world-clock end on its marker, so even a 1-round insanity is never swept at the round change before its first roll. Any other creature gets rounds × 6 seconds on the world clock (`spellEffectEnd`), as every round-based spell effect in the core does. That covers a creature marked from another scene, one not in the tracker, and one whose combat has not started. A clock laid before combat goes when the creature joins a started combat (`createCombatant`), when a combat it is in starts or turns a round (`updateCombat`), and at its first roll, each on the acting GM. When its combatant is removed from the tracker, the acting GM gives the marker its remaining turns × 6 seconds, unless another combatant of the creature still counts: only the deleted combatant is ignored, so a linked actor's second combatant in the same combat keeps its turns counted. When its combat is deleted, the marker is clocked the same way. A marker that ends any other way (its clock, its spell, the GM) has its last roll undone on the creature's acting client.
- **The +4 PP warp** ("insane for 1 round per 1 failure") carried `mods: {}` and bought nothing. It now carries `turnTablePer: 1`.
- **Reading, said so (for Graham):** "Target is unaffected **this round**" is read as the table's frame, so each roll lasts its turn. The page prints no separate duration for the slowed or confused.

Both are declared as rows in `tools/data-fixes.json`. They are applied to the spells pack by `tools/declare-ea-block8a-core.mjs`, which keeps apply-data-fixes' old-or-new guard.

**"Until dismissed" locks PP** (Q170, Graham: "'Until dismissed' and 'Permanent' are both 'unlimited': the PP stays locked until the spell ends").
- `ppLockCondition` reads "until dismissed" (and "until dismissed or broken") as `"unlimited"`.
- A spell printing it is registered, so Dismiss reaches it and its PP are held until it ends.
- **Measured on the 3.685.3 pack:** no core spell prints it (every core "dismiss" is a "(D)", which stays merely dismissible). So no core spell changes. Only Eldritch Arts' eight Bindings print it.
- **For Graham:** this is a one-line change to a core reader. The audit did not list it among H12–H18; it is built because Q170's ruling needs it. Without it the Bindings would lock no PP and Dismiss could not reach them.

## Fixed by the Block 8a review (before release)

- **A counteract on a creature the caster does not own** (every counteract row; Remove Curse on the GM's NPC): the effect delete threw "lacks permission" on a player's client. It now goes through the GM by a named relay action, `target.counteract`, whose GM side (`magic/counteract-relay-workflow.mjs`) re-reads the effect's own traits and deletes it only when the row's traits reach it. A row with no traits reaches no effect. A condition's toggle already crossed by itself (`Actor#toggleStatusEffect` relays an unowned removal, 3.666.1), so it is unchanged. A relay that fails says so on the card, not as a failed check.
- **Three relief paths ignored a curse's hold:** Renewal's Touch's turn option (refused before its AP are spent), the healing rune's reduction (the held condition not offered; no use spent) and a `conditionRemove` row (Sunveil, Divine Nectar, Greysap). Each refuses out loud with the hold's line. Because nothing lowers a held condition, the hold's end takes its share off once, not twice.
- **A held fatigue's card** said "Fatigue reduces by 1, to 2" while it stayed at 3. It now says the hold and the value it stays at, and `rollFatigueRecovery` returns that value (`delta: 0, held: true`).
- **`wallHeight`** (a warp key, default 0): "+2 PP: increase the length of the wall by 10 feet **or its height by 5 feet**" can be offered as its two choices. Read by the aggregator, the merge and the wall (a wall that prints a height gains it; one that prints none gains none). Eldritch Arts' Wall of Sand uses it. **The core's own eight walls are unchanged** (Wall Of Stone, Fire, Ice, Force, Thorns, Blades, Light, Dispelling all print the same option and offer only the length): changing them changes every world, so they wait for Graham's word.

## New for modules

Each seam is additive and default-off: a row, flag, entry or module that does not use it behaves exactly as before.

| # | Seam | Contract | Where |
|---|---|---|---|
| **H12** | **The control register for modules** | `helpers.recordControlled(controller, { target, token, level, name, source, castId, data })` records page 242's controlled creature. `source` is a key of `CONTROL_SOURCES`, which gains `bound` ("Bound": a creature a spell binds, summoned and not a conjured facsimile, Q168). `castId` is the cast that holds it, and `data` is the module's own facts (copied). An entry naming neither is the shape it always was. `helpers.releaseControlled(controller, id, { reason })`, `helpers.controlledOf(controller)`, `helpers.controlledCreature(entry)` (the creature an entry's handle names, or null for a level-only entry). **Every release fires `trgPrimeControlReleased({ controller, entry, creature, degree, reason })`** on the client that released it: `reason` is `"overflow"` when the DC 20 Will save at the controller's turn start freed it (with the save's `degree` and the creature), and "released" otherwise (Aligned Control's included). Before, a release by the sweep told nobody. | `magic/control-register.mjs` `CONTROL_SOURCES`, `CONTROL_RELEASED_HOOK`; `magic/control-register-workflow.mjs` `recordControlled`, `releaseControlled`, `controlledCreature`, `sweepControlOverflow`; `module-api-workflow.mjs` helpers. Eldritch Arts' Bindings, Versatile Binder, Ley Line Effects 25–27; Block 8b's Army of the Grave. |
| **H17** | **Conditions held by a curse** | An ActiveEffect with `flags["trg-prime"].heldConditions = { keys, values, endWith, label }` holds the conditions it names, while it stands: condition relief (Restoration and its kin) refuses out loud; a rest's or recovery's lowering skips it (the injury rest clock, Fast Healing and Regeneration, fatigue's hourly save — a Fumble's rise still lands — and a night's clearing of fatigue, Soul Drain and Doomed); `reduceCondition` and every reducer that asks `conditionFloorFor` (frightened recovery, Rally, card buttons) see a floor at its current value; a creature ability's healing of injured or bleeding refuses; a counteract that names the condition itself skips it. **When the effect goes** (its time, Remove Curse, the GM), with `endWith` the conditions it added (`values`) are lowered, never below another standing hold's share. That runs on one client (`isActingClientFor`). `flags["trg-prime"].counteractAs = { pp, dc }` prefills the counteract check against that effect. `helpers.conditionHeld(actor, key)`. **Not stopped:** the GM's own sheet or token HUD (as Resurrection's seal). | `conditions/held-conditions.mjs`, `held-conditions-workflow.mjs` (the end hook, registered at init); `magic/spell-effects.mjs` (relief, counteract); `feats-workflow.mjs` `reduceCondition`; `magic/emanation-workflow.mjs` `conditionFloorFor`; `injury-workflow.mjs`; `rest/rest-workflow.mjs`; `combat/exhaustion-workflow.mjs`; `codex-actions-workflow.mjs`. Symbols of Pain and Weakness (Q183). |
| **H18** | **A table rolled at each of a creature's turns** | A `turnTable` row: `{ kind, label, die: "1dN", per, rows: [{ min, max, rows, unaffected, text }] }`. It is reached like any ungated row on a save spell (the failures), and marks each creature for `roundsFromMargin(margin, per)` rounds. A warp's `turnTablePer` (a set: the smaller rate wins; read by the aggregator and the merge) replaces `per`. Rolled in the turn-start pass beside the turn ladders, on the acting GM's client. A roll's effects are stamped `turnTable:<marker id>` and removed at the next roll, at the end, and if the marker is deleted by hand. `helpers.markTurnTable(target, row | "insanity", { margin, per, dc, castId, casterUuid, spellName, img })` lets a module mark a creature with core Insanity's own table (`INSANITY_TURN_TABLE`). | `magic/turn-table.mjs`, `turn-table-workflow.mjs`; `magic/spell-effects.mjs` case `turnTable`; `documents/combat.mjs` (the turn start); `magic/spell-warp.mjs`; `magic/effect-kinds.mjs`. Core Insanity; Eldritch Arts' Symbol of Insanity (m134). |

**The §6 checks this release needed** (the others belong to 8b):
- **`createEffectsOn` relays to the GM for an NPC the caster's client does not own:** holds. The module's bound effect, the curse's hold and core Insanity's marker go through it.
- **A module-created Region can carry Foundry V14's Teleport Token behaviour (Harmonic Rift):** not used. The module moves the token itself on a move that ends in an opening, as Block 2's areas are read on token movement, so a passage's teleport card, its second-teleport failure and its sonic save are each driven in the harness. No core seam.

## Harnesses

- **`verify-control-register-api` (new, 26 checks):**
  - The source, the entry's shape with and without a module's facts.
  - The hook on every release, driven: the real overflow sweep's release says "overflow", the degree and the creature; a failed save fires nothing; a release of nothing fires nothing.
  - The four helpers, driven through the real module API.
  - Q170's lock and registration, and the measurement that no core spell prints "until dismissed".
  - The version.
- **`mutate-control-register-api` (new):** 17 mutations, all caught.
- **`verify-held-conditions` (new, 45 checks):**
  - The pure rule.
  - Driven: `reduceCondition`, the condition floor, the injury rest clock, fatigue's hourly save (a Fumble still rises), the end hook on the acting client only, and a creature with no hold unchanged.
  - The wiring the drive cannot reach.
  - Remove Curse: the declared row, in `data-fixes.json` and in the shipped pack, read by the core's own counteract reader against a curse's effect.
  - The review's findings: the counteract relay driven (an owned creature deleted here; the GM's NPC asked of the GM with the effect and the traits; the GM's side refusing an effect the traits do not reach); a `conditionRemove` row driven through the spell engine (refused, said, and no "had no"); a refused relief then the hold's end (once, not twice); a held fatigue's card and result; Renewal's Touch and the healing rune by their source.
- **`mutate-held-conditions` (new):** 37 mutations, all caught.
- **`verify-turn-table` (new, 50 checks):**
  - Insanity's table as printed; the rounds from the margin (and per 1).
  - Refusals.
  - The marker, driven.
  - The turn-start pass, driven: the last roll's effects and a stranded one go, the d10, a turn spent, the end.
  - The wiring: the case, the turn start before AP, the warp key through the real aggregator and merge, the helper, the kind.
  - Insanity's declared rows in the pack.
  - The reviews' findings, driven through the turn table itself:
    - A standing Confusion (another spell's, ending at T+60) rolled "confused" keeps its cast id, its end and its duration, survives the round change and the next roll, and is never removed by Insanity.
    - A clockless standing slowed rolled slowed 2 rises for the turn: the rise is recorded, taken back at the next roll and at the marker's end (on the acting client only), and the slowed stays clockless.
    - A new condition is stamped with the roll's id and goes at the next roll.
    - The marker's clock: none for a combatant of a started combat; rounds × 6 for a creature not in the tracker or in a combat not started; a combatant removed, or its combat deleted, clocked on the acting GM only.
    - The take-back by stacking rule (slowed 1 → 3 then 4 from elsewhere is left at 4; injured 1 + 2, then +1, loses the roll's 2). A clocked marker joining a started combat, or its combat starting, loses its clock. A linked actor's second combatant still counts when the first is deleted.
  - **The general path is 3.685.3's:** a check that `applyConditionTags` still writes a later cast's id and clock on a standing condition, as 3.685.3 does, and that none of the reverted general changes are in its source.
- **`mutate-turn-table` (new):** 64 mutations, all caught.
- **`verify-walls-storm`:** two checks for `wallHeight` (the wall, the aggregator, the merge); `mutate-walls-storm` four mutations for it.
- **Re-pinned, 3 verifies:**
  - `verify-block39-conditions` C9: a night's fatigue clearing now asks the hold.
  - `verify-chapter10-311-320b` C3c and C7: the counteract candidates skip a held condition, and the check is prefilled.
  - `verify-fixes-3685-3b` Z1: "3.685.3 or later".
  - Their mutations are re-anchored: `mutate-block39-conditions`, `mutate-chapter10-311-320b`.
- **Re-anchored:** the version anchors of 22 mutate files point at 3.686.0, and the download anchors at v3.686.0.
- **`verify-effect-kinds-handled`:** `turnTable` is declared.
- **`verify-rules-have-callers`:** no new keeps. Internal helpers are not exported; every new export has a caller.
- **`verify-checks-read-source`:** every file the three new verifies read is depended upon.
- **Run** (8 November):
  - Every `verify-*` in the main tree: 362 files (359 before, plus the three new ones), all green.
  - The packs were then restored by the routine below, and `verify-pack-ids` is green (18 checks, 2,613 records in 43 pack directories).
  - Every `mutate-*` whose files this release touches, run in a scratch copy: 231 files, 7,528 mutations, all caught.
  - **After the review's fixes** (the same evening): every `verify-*` again in the main tree, 362 files, all green (`verify-item-mechanisms-3626` E3 re-pinned to the rune's renamed list). Every `mutate-*` whose files the fixes touch, in a fresh scratch copy: 136 files, 4,470 mutations, all caught. Two anchors in `mutate-session-fixes-0829` moved with the cast-id change and were re-anchored; three survivors were closed (an equivalent K4 replaced; R1 given a falling value; R4 drives a recorded rise through the spell engine). The packs were restored by the four-step routine, and `verify-pack-ids` is green.
  - **After the re-review's fixes** (A–C, and the hook moved into `scripts/trg-prime.mjs`): every `verify-*` again in the main tree, 362 files, all green. Every `mutate-*` whose files those fixes touch, in fresh scratch copies: 62 files, 2,589 mutations, all caught. `mutate-block35`'s R14 and two `mutate-turn-table` anchors were re-pointed, and one obsolete mutation was dropped (the per-roll refresh the combat rule replaced). `verify-checks-read-source` was run on its own with no time limit: 5 checks over 1,538 (check, file) pairs, green, in 507 seconds; the reviewer's 300-second limit was too short for it.
  - **After the third review's change of direction** (G and H: the general condition path reverted to 3.685.3, Insanity keeping its own books, the marker clocked unless its creature is a combatant of a started combat):
    - `effect-application-workflow.mjs` and `condition-timing.mjs` are byte-for-byte 3.685.3's (compared with `cmp` against the 3.685.3 zip). So are `verify-session-fixes-0829`, `mutate-session-fixes-0829` and `mutate-block35`, whose earlier re-pins were for the reverted change.
    - Every `verify-*` was run again in the main tree: 362 files, all green.
    - Every `mutate-*` touching the changed files was run in a fresh scratch copy: 59 files, 2,419 mutations, all caught.
    - In `mutate-turn-table`, the mutations of the reverted code were dropped and replaced by mutations of the turn table's own books, the marker's clock (H) and the general path's 3.685.3 behaviour.
  - **After the fourth review's two items** (I, J; turn table only, the general path still byte-for-byte 3.685.3's): every `verify-*` again in the main tree, 362 files, all green; every `mutate-*` touching the changed files (`turn-table.mjs`, `turn-table-workflow.mjs`, `scripts/trg-prime.mjs`) in a fresh scratch copy, 39 files, 1,768 mutations, all caught; `effect-application-workflow.mjs` and `condition-timing.mjs` checked again with `cmp`: identical to 3.685.3's.
  - During the build, four survivors were found and fixed. Two were closed in the code: R1's redundant default and R8. T4 now tests a die the table refuses. D7 was an equivalent mutation and was removed.

## Packs

`packs/spells` legitimately differs from git HEAD now (Remove Curse, Insanity), as `packs/creature-abilities` already did. **The packs restore routine gains a fourth step:**
1. `git checkout -- packs && git clean -fdq packs`
2. `node tools/declare-ff30-codex.mjs`
3. `git checkout -- packs/abilities packs/feats && git clean -fdq packs/abilities packs/feats`
4. `node tools/declare-ea-block8a-core.mjs --apply-only`

Then `node tools/verify-pack-ids.mjs` is green, and `git status --short packs` shows only creature-abilities and spells.

## For Graham

- **Q170's lock is a core reader change** the audit did not list as a seam (above). Without it the Bindings lock nothing and cannot be dismissed.
- **Insanity's per-turn conditions** last the turn they were rolled for (above). If they should last longer (stunned 1d3 is spent by AP anyway; slowed and confused print no length), it is one line.
- **Remove Curse and an owned copy:** a character who already has Remove Curse or Insanity on the sheet keeps the old (empty or note) rows until the spell is re-added from the compendium. Nothing rewrites it at load (`PACK_REPAIRS` was not extended, on purpose).
- **A hold does not stop the GM** clicking the condition off on the sheet or the HUD, as Resurrection's seal does not.
- **A pre-existing issue in the general condition path, not changed in this release.** When a later cast re-applies a condition that already stands, `applyConditionTags` overwrites the condition's cast id and its clock with the later cast's. Ending that later cast can therefore end the other source's condition, and a short cast can cut a longer condition short. This is 3.685.3's behaviour, kept exactly; the file is byte-for-byte 3.685.3's. Two attempts to change it for every world opened new problems: the review's fix left a timed spell's rise on a clockless condition with nothing to end it. So 3.686.0 keeps Insanity's turn table out of the general path instead. Changing the general path is left for your decision.
- **The core's eight walls** could offer "or its height by 5 feet" with the new `wallHeight` key. Not done without your word.
