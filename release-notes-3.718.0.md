# TRG Prime 3.718.0: What casting every core spell as a player found

27 November 2026. Branch `fix/spell-core-sweep`, on top of 3.717.1.

- **Install over 3.717.1.**
- **Migration:** the world migrates once more (schema 3.718.0). Owned copies of Nightvision and Conjuration Shield are brought up to date, and a house-ruled copy is left alone.

All 692 core spells were cast from the **player's** seat (PC Tester), with the GM's session connected, against test creatures the player does not own. The spells that went wrong were then cast again from the **GM's** seat. The full findings are in `live-testing-report-3.718.0-core-sweep.md`.

## The main defect: 34 spells failed when a player cast them on somebody else's creature

A GM can write to any document, so none of these failed when the GM cast them. When a player cast them, Foundry refused one write on the target ("User PC Tester lacks permission to update Actor", or "…create Item", "…create RegionBehavior", "…update ActiveEffect", "…update Token"). The refusal stopped the spell partway through: **the PP were spent, the save was rolled, and no Result card was posted.**

Each of these writes now goes to the GM's client when the player does not own the target, as damage, conditions and effects already do. The GM's client checks every request before carrying it out (see *For developers*).

| What was refused | Spells caught by the sweep | Now |
|---|---|---|
| A charm's attitude on the target | Alluring Caress, Charm Undead, Thrall (also Charm, Charm Animal, Charm Kind, Tame, which use the same code) | New `ATTITUDE` relay action |
| A conjured item given to an ally | Bless Water, Power Crystal | New `CONJURE_ITEM` relay action. The card also used to say "Holy Water is not in the compendium", which was wrong: it was a refused write, and the card now says so |
| A spell's record on the target | Doubt, Disorient (an owed penalty); False Arrogance, Warp Mind, Word Of Blinding, Word Of Stunning (temporary immunity); Flame Prison, Force Prison (the cage); Cutting Words, Spell Drain, Serenity | New `SPELL_FLAG` relay action, limited to those six records |
| A granted Speed or ability on an ally | Fly, Earth Glide, Spider Climb | New `SPELL_ITEMS` relay action, for spell-granted abilities only |
| Difficult terrain on the spell's area | Entangle, False Mire, Ice Slick, Portal Maelstrom, Solid Fog, Stone Call, Verdant Snare, Warped Terrain, Web (also Wall Of Thorns, Wall Of Wind, and the storm's rain) | New `REGION_BEHAVIOURS` relay action, for movement-cost behaviours only, on a Region the player placed |
| A stamp on a condition just applied | Petrification (slowed), Speed (quickened), Vision Of Havoc (stunned), Volcanic Inferno (the rock) | New `EFFECT_STAMP` relay action, limited to five named stamps |
| Stasis's effect | Stasis | Now created through the existing effects relay |
| A forced Step | Startle | New `FORCED_MOVE` relay action. The GM's client works out the move itself |
| Blocking wall segments | Wall Of Stone, Wall Of Force, Wall Of Ice, Wall Of Thorns. These did not throw an error, but their card said "block movement and sight by hand" | New `SPELL_WALLS` relay action |

The same fix also covers three other writes on a target that the sweep did not reach directly: an alchemical item's temporary immunity, a flat-ladder spell's temporary immunity, and the module API's `grantTemporaryImmunity`.

## Two spells with data defects

- **Nightvision granted nothing.** Every cast said "Nightvision declares a malformed ability grant". Its row named the ability by name, but the grant reads only a uuid. The row now uses the pack's own Nightvision ability, as Darkvision does. Its touch warp ("targets 1 willing creature") is now capped at one creature, as Darkvision's is.
  - A harness check (`verify-chapter10-291-300` F1b) had pinned the broken name-only row. It now checks the uuid, and a new check confirms that every `grantAbility` row in the pack is well-formed.
- **Conjuration Shield rolled a Will save for everyone in its radius when it was cast, allies included.** The book says the save is made by a creature that is later conjured inside the area, against "the conjuring caster". The spell is now a warding that rolls nothing when cast, as Rune Of Warding is. A card note gives the conjurer's Will save, which is rolled by hand when it happens.

## Found, and not changed

- **False Health's warp** ("+2 PP: increase the ability score multiplier by x1 (max x5)") is charged but has no effect. It is one of 220 warps in the pack with no mechanics attached. I have not changed it; see the report.
- **The sweep could not judge some results**, because of the test setup rather than the spells:
  - 24 high-level spells failed their casting check, because the d20 was fixed at 19 against a DC above 39.
  - 26 spells were refused by the test creatures, for example "not an animal", "beyond range", or "no material pouch".
  - Some spells that print a note and nothing else showed no visible change.

## For developers

- **New `combat/relayed-writes.mjs`:**
  - `setTargetFlag`, `createTargetSpellItems`, `createSpellRegionBehaviours`, `setEffectFlags` and `removeSpellEffect` each write directly when this client may.
  - Otherwise they ask the GM's client. A document whose `isOwner` is not exactly `false`, such as a harness mock, is always written directly.
- **`target-relay.mjs`:**
  - Eight new actions: `ATTITUDE`, `CONJURE_ITEM`, `SPELL_FLAG`, `SPELL_ITEMS`, `REGION_BEHAVIOURS`, `EFFECT_STAMP`, `FORCED_MOVE` and `SPELL_WALLS`.
  - Each one is bounded:
    - The asker must own the caster or the source creature.
    - Flags and stamps must be on an allow-list (`SPELL_RELAY_FLAGS`, `EFFECT_STAMP_FLAGS`).
    - Items must be abilities stamped `spellItem`.
    - Behaviours must be `modifyMovementCost` only, so a player's script behaviour is never run.
    - Walls are rebuilt from their coordinates and four senses (`relayableWallSegments`).
    - A forced move may not exceed `FORCED_MOVE_MAX_FEET`.
  - The matching wrappers and handler dependencies are in `target-relay-workflow.mjs`.
- **Call sites:**
  - `spell-effects` (attitude, conjureItem, tempImmunity, prison, speedGrant, grantAbility, the held condition, `stampEscapable`)
  - `cast-workflow` (difficult terrain)
  - `storm-workflow`
  - `pending-modifiers`
  - `cutting-words-workflow`
  - `spell-drain-workflow`
  - `flat-ladder-workflow`
  - `condition-save-workflow`
  - `end-save-workflow`
  - `stasis-workflow`
  - `forced-movement-workflow` (`forceMoveAway(…, { direct })`)
  - `wall-spell-workflow`
  - `alchemical-workflow`
  - `module-api-workflow`
- **The pack:** in `packs/spells`, Nightvision's `effects` and its warp 0, and Conjuration Shield's `category`, `defence` and `effects`, were changed through `tools/declare-spell-matrix-fixes.mjs`. Five new `PACK_REPAIRS` entries (`*-3718`) update owned copies.
- **Migration:** the pack-copy pass is re-gated to 3.718.0, and so is `TRG_SCHEMA_VERSION`.
- **Harness:**
  - New `verify-core-sweep-3718`: 96 checks.
  - New `mutate-core-sweep-3718`: 44 mutations, all caught.
  - **Re-anchored to the new code:**
    - `verify-prison` W1
    - `verify-live-3609` D3
    - `verify-chapter10-281-290` J4
    - `verify-chapter10-261-270` B6
    - `verify-block7-core` C10
    - `verify-pp1-batch` C-E2
    - `mutate-attitude` (the "a spell's step is permanent" mutation)
  - **Recounted:** `verify-target-cap` C1 (12 flat totals).
  - **Corrected:** `verify-chapter10-291-300` F1b.
  - **Version re-pins:** across the version, schema and runIf anchors in `tools/`.
  - **Now private:** three helpers in `target-relay.mjs` that only the relay calls.
