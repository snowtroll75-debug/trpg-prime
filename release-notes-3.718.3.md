# TRG Prime 3.718.3: the migration now recognises copies that carry a newer default

28 November 2026. Branch `fix/spell-core-sweep`, on top of 3.718.2.

- **Install over 3.718.2.**
- **Migration:** the world migrates once more (schema 3.718.3). No new repairs are declared. The pass runs again because the way it compares copies has changed (see below).

## 3.718.2, live (installed, from the player's seat with the GM connected)

- **False Health:** the warp is a count box with a maximum of 3. With the test Wizard's Intelligence set to 3, the temporary HP were:

  | Warps bought | Multiplier | Temporary HP |
  |---|---|---|
  | none | ×2 | 6 |
  | one | ×3 | 9 |
  | three | ×5 | 15 |

  Each purchase cost 2 PP, and the card read "Warped — +6 PP: increase the ability score multiplier by x1 (max x5) (×3)".
- **The migration report** no longer lists Kharon's or Valmorius's Nightvision *ability* as a house-ruled spell. It also no longer lists the Druid's Animal Staff spell against the Animal Staff magic item's repair.

## Fixed: the migration misread copies that carry a newer default

The 3.718.2 migration still listed nine copies as "left alone — somebody's own version", for example "ZZ SW Wizard — Shock Bolt: damage". That copy is identical to the compendium.

- **Why:** Foundry's data model added a `persistentOn: ""` default to spell damage after those repairs were written. Every copy now carries the field, but the repair records don't, so a copy matched neither the old value nor the new one.
- **The harm:** not just a misleading report. A copy that really was out of date, but carried the new default, was also left unrepaired.
- **The rule now:** a key that only one side has counts as equal when its value is an empty default: an empty string, null, an empty list or an empty object.
  - A `0` or a `false` is still a value, and still has to match.
  - Any filled-in extra key is still treated as somebody's own edit.
- **What you'll see:** every world runs the pass once more. Copies misread before are repaired, or recognised as already current.

## For developers

- **`pack-repair.mjs`:** `deepEquals` walks the union of keys and passes over a one-sided key whose value `isEmptyDefault`.
- **`migration.mjs`:** the pack-copy pass and `TRG_SCHEMA_VERSION` are re-gated to 3.718.3, with no new manifest entry.
  - `verify-pack-repairs` F1b now also accepts a pass gated to `MATCHER_REVISED` (3.718.3), provided that is newer than the newest entry.
- **Harness:**
  - New `verify-fixes-3718-3`: 12 checks.
  - New `mutate-fixes-3718-3`: 6 mutations, all caught.
  - **Re-anchored:** `mutate-pack-repairs` ("key order decides").
  - **Version re-pins:** across `tools/`.
