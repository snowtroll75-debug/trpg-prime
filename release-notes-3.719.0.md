# TRG Prime 3.719.0: what the companion-module spell sweep found

28 November 2026. Branch `fix/spell-module-sweep`, on top of 3.718.3.

- **Install over 3.718.3.** No data change and no migration: the world is not asked to migrate.
- **Companion modules:** Eldritch Arts 0.18.3, Pillars of Faith 0.13.3 and Inner Tempest 1.1.1 need no update. All three defects below were in the core.

## The sweep

All 230 companion-module spells were cast from the player's seat (PC Tester), with the GM connected:

| Module | Spells | Notes |
|---|---|---|
| Eldritch Arts 0.18.3 | 130 | |
| Pillars of Faith 0.13.3 | 75 | Symbol of Pain is in both PoF and EA; both copies were cast |
| Inner Tempest 1.1.1 | 25 | |

- **Second pass:** 29 touch-range spells were cast again with the foe moved adjacent. The first pass had refused them correctly, as out of range.
- **Third pass:** the 42 spells aimed at an ally were cast again with that ally **not owned by the player**, as when healing another player's character. The test ally had been owned by the player, so the relay paths for a friendly target had never been exercised.
- **Refusals that were correct:**
  - The 10 Ritual spells refused a standard cast.
  - Mimic Spell is offered only as a reaction.
  - Ley Walker needs a ley line within 30 feet.
  - A spell needing a Material Component Pouch refused without one.

## Fixed: Eldritch Arts spells printed their description as raw markup

- **Affected:** Dark Whispers, Observe the Weave and Message Rune.
- **What you saw:** the Result card ended in escaped HTML, for example `<p><strong>AUDITORY SHADOW UTILITY</strong></p> <p><strong>Tradition</strong> divinity, ethereal</p>…`, followed by the stat block and the warping options.
- **Why:** a spell with nothing for the engine to apply prints its own text (your ruling of 25 August 2026). That code was written for the core pack, whose descriptions are plain text. All 130 Eldritch Arts descriptions are HTML paragraphs.
- **Now:** the card shows the spell's own paragraphs as text.
  - **Left out:** the trait banner, and the Tradition, Cast, Range, Area, Targets, Duration and Defence lines. The card header and the Warp dialog already show these.
  - **Kept:** Requirements and Trigger lines, because they are clauses of the spell.
  - **Cut off:** everything from the colon-less WARPING OPTIONS heading onward.
- **Scope:** the core's 692 spells are untouched, since none is HTML. Pillars of Faith and Inner Tempest have no spell that reaches this fallback.

## Fixed: Writ of Restraint left the Judged Subject its Reactions (player's seat)

- **Affected:** Pillars of Faith's Writ of Restraint.
- **What you saw:** "User PC Tester lacks permission to update ActiveEffect". The Slowed landed, but its "cannot use Reactions" stamp was never written.
- **Why:** the 3.718.0 relay covered the escape-save stamp on a condition, but not the no-Reactions stamp beside it.
- **Now:** the stamp goes through the GM, like the others.
- **In combat:** the Slowed 2 → Slowed 1 step-down carries the no-Reactions flag and the escape save across. That carry goes through the GM as well.

## Fixed: Restoration on another player's character posted no Result card

- **Affected:**
  - The core's Restoration.
  - Pillars of Faith's Nine-Herb Restorative, Soul Rebinding and Share Burden, which use the same once-a-day relief row.
- **What you saw:** cast from a player's seat on a character that player does not own, the Fatigued came down, then the cast threw "lacks permission to update Actor". The PP were spent and **no Result card posted**.
- **Why:** the once-a-day record was written straight onto the target.
- **Now:** the record goes through the GM.

## Looked at and left alone

- **Thunderous Strike (Eldritch Arts):**
  - **Shown:** the Strike resolves; the card then says "No target selected — each affected creature rolls a basic Fortitude save vs DC 30 by hand."
  - **Why it stays:** the spell's targets are "each creature in a 15-foot cone behind the target", which has no area to place. The card says plainly that this is by hand.
- **Grace beyond Need (Pillars of Faith):** the offer appears once for each over-healed creature, so an area heal on a full-health party asks seven times. This is as built.

## Still owed

- **Live test of the three fixes**, from the player's seat, once 3.719.0 is installed:
  - Dark Whispers, Observe the Weave and Message Rune.
  - Writ of Restraint on the Foe.
  - Restoration on the unowned ally.

## For developers

- **`magic/spell-narration.mjs`:** `spellNarration` turns an HTML description back into paragraphs (`htmlNarration`) before the warping cut. It drops the banner (`BANNER`) and the stat lines (`STAT_LINE`), and decodes the five common entities.
- **`combat/target-relay.mjs`:**
  - `SPELL_RELAY_FLAGS` gains `reliefUsedToday`.
  - `EFFECT_STAMP_FLAGS` gains `fumbleNoReactions`.
- **`magic/spell-effects.mjs`:**
  - The `conditionRelief` row writes through `setTargetFlag`.
  - The `noReactions` stamp writes through `setEffectFlags`.
- **`combat/linked-conditions-workflow.mjs`:** the follow-on carry writes through `setEffectFlags`.
- **Harness:**
  - **New:** `verify-fixes-3719-0` (12 checks) and `mutate-fixes-3719-0` (5 mutations, all caught).
  - **`verify-spell-narration`:** gains B9–B18, for 72 checks. `mutate-spell-narration` gains 7 mutations, for 20, all caught.
  - **`verify-core-sweep-3718`:** C0 and F0 take the two new keys. One `mutate-core-sweep-3718` anchor was re-anchored.
  - **Version re-pins:** across `tools/`.
- **Battery:** every verify script passed, including `verify-checks-read-source`. All 154 mutate files touching spell effects, the relay, narration, linked conditions or the version anchors caught every mutation.
- **Companion-module regression:** all 54 verify scripts across Inner Tempest 1.1.1, Eldritch Arts 0.18.3 and Pillars of Faith (repository tree) pass on 3.718.3 and on 3.719.0. The results are identical.
