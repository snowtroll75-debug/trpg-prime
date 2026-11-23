# TRG Prime 3.712.0: Party Sheet V2, Stage 5 (Skills, Group Check, Encounter, Notes)

23 November 2026. Branch `feature/party-sheet-v2-stage5`, which builds on Stage 4 (3.711.1).

The Party sheet now has its five areas: **Overview, Skills, Inventory, Encounter (GM) and Notes.**

## Skills

- **The table:** members in rows, TRG Prime's 26 core skills in columns, in the rules' order.
- **The numbers:** each modifier is the member's prepared skill total, the same number their own sheet prints. No skill arithmetic is added.
- **Telling cases apart:**
  - **+0** is a real modifier.
  - **—** is a skill the member's data doesn't have.
  - **?** is a member whose statistics you can't see (Graham's NPC ruling from Stage 1).
- **Highlighting:** the best visible value in each column is marked, ties included. A hidden number never counts.
- **Sorting, filtering and scrolling:**
  - Member names sort A–Z or Z–A.
  - A filter hides skill columns in place.
  - The table scrolls, with the header and names kept in view.
  - The sort and filter are kept when the sheet redraws.
- **Rolling:** clicking a modifier runs **that member's own skill roll**, the character sheet's `rollSkill` with its action chooser and check dialog. It's offered only to the GM and to whoever owns the member.

## Group Check (GM, on the toolbar)

- **Choices:**
  - the skill and which members roll;
  - a DC, or none;
  - a difficulty from the existing ladder;
  - the chat visibility (public, GM, blind or self);
  - whether to ask about each member's optional bonuses.
- **The rolls:** each member rolls their **own** check through `TRGCheck`, with their own modifiers and the automatic conditionals, as every skill check does. A member without the skill is named and not rolled.
- **The summary card:** each member's total and result, and how many reached each degree, in the same visibility as the rolls.
- **No group result is invented.** Neither the rules nor the automation has a group-success rule; the card says so. No member is changed by the check.

## Encounter (GM)

- **Import Combat (new):** imports the active combat's adversaries, or another combat chosen from the world's.
- **Add Selected Tokens (improved):** goes through the same import list.
- **The import list (Graham's ruling):**
  - party members are never offered;
  - defeated and Friendly combatants start unticked;
  - hidden adversaries are included and marked;
  - tokens that no longer exist are named.
- **Counting creatures:**
  - Each unlinked token is its own creature; a linked actor is one creature however many tokens it has.
  - Importing the same token twice counts it once.
  - A token whose actor you added by hand is flagged, so it isn't counted twice by accident.
  - An import never lowers or replaces a count you set.
- **Storage, version 2:** each creature records the tokens it was imported from. A version 1 encounter reads unchanged and becomes version 2 the next time it's changed. There is no migration.
- **Clear:** asks first, and empties the party's list only. No actor, token or combat is deleted.
- **Unchanged:** the summary, threat, budget, XP, accomplishments, custom XP, treasure guide and Begin Session. A tooltip shows how many tokens each creature was counted from.

## Notes

- **The field:** the party's existing `system.details.notes`, shared (Graham's ruling).
- **Editing:** the GM edits with Foundry v14's editor; players read the enriched text.
- **Secrets:** secret blocks are shown to the GM only. Their text is still stored in the party, and the tab says so.
- **No GM-only field** was added (Graham's ruling). Foundry sends the party's whole data to every player who can see it, so a hidden field wouldn't be secret.

## Integration fixes

- **One changed field, one write:** the sheet submits on change, and used to send every field as last drawn. While the Notes editor was open, a stale treasury could be written back over a transfer made in the meantime. A change now writes only the field that changed.
- **Renders wait for the editor:** live renders now wait while the Notes editor is open, or focus is in an editable field, so typing isn't lost.
- **Toolbar:** Group Check takes the place Stage 3 held for it.

## Harness

- **New pair:** `verify-party-sheet-stage5` (61 checks) and `mutate-party-sheet-stage5` (34 mutations, all caught).
- **Re-anchored, because Stage 5 builds what they held back:**
  - `verify-party-sheet-stage1` T5: five panels now;
  - `mutate-party-sheet-stage1`: the scroll anchor;
  - `verify-party-sheet-stage2` G4: "each tab added when built" now requires Skills and Notes;
  - `mutate-party-sheet-stage2` G4: the defect is now losing the Notes tab;
  - `verify-party-sheet-stage3` B2, B3 and B5: Group Check is implemented and drawn;
  - `mutate-party-sheet-stage3`: the matching mutation, flipped.
- **`uncalled-exports.json`:** 6 keeps with reasons.
