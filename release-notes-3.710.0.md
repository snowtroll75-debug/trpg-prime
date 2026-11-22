# TRG Prime 3.710.0: Party Sheet V2, Stage 3 (the Party Actions)

22 November 2026. Branch `feature/party-sheet-v2-stage3`, from `feature/party-sheet-v2-stage2` at 3.709.1.

The Party sheet becomes the launcher for the group workflows the system already has. **No rule is new.** What's new is *who* takes part: the members of this party, each once, and nobody else.

## The toolbar

On every tab, in this order:

| Action | Who | What it runs |
|---|---|---|
| Roll Initiative | everyone (their own members) | `TRGCombat#rollInitiative` (Stage 2) |
| Rest | GM | the existing Rest dialog and `performRest`, given this party's members |
| Travel | GM | the existing Travel dialog and card, given this party's members |
| *Group Check* | — | **reserved, not drawn** until Stage 5 builds it |
| Begin Session | GM | the existing `beginSession` (Hero's Resolve) |
| Award XP | GM | the existing `awardPartyXP`, after a confirmation |

The list lives in `PARTY_TOOLBAR_ACTIONS` (`party-actions.mjs`). Group Check has its place, id and icon there with `implemented: false`, so no button appears until it does something.

## Who takes part

`partyParticipants`:
- **Included:** the roster's members that resolved and may be on a roster (characters and NPCs, the existing eligibility), each actor once.
- **Left out and named:** a missing entry, one that can't be looked up, and a companion or party put on the roster.
- **The dialogs say so:** for example, "Resting the 6 members of Party A. No one outside the party is included. Not included: …".

## Rest

- **Party Rest:** opens the existing Rest dialog listing only this party's participants. Everything after the list (activities, Healing Trance, Power Recovery, food and water, the recovery rolls, the summary cards) is the existing workflow, unchanged.
- **The macro and the API:** `openRestDialog()` with no argument behaves exactly as before: selected tokens, then player-owned characters, then characters you own.
- **No double rest:** an actor in the entries twice now rests once (`performRest`, keyed by UUID).
- **Rows keyed by position:** the dialog's rows are now keyed by position rather than actor id, because an unlinked token's actor shares its base actor's id.

## Travel

- **Party Travel:** opens the existing Travel dialog with this party's members and their land Speeds (`landSpeed` / `speedValue`). The existing card is paced by the slowest of *them*.
- **The scene control's Travel:** unchanged.
- **Rows keyed by position:** as for Rest.

## Award XP

- **Toolbar Award XP:** choose the encounter's total, one of the five Chapter 12 accomplishments, or a custom amount.
- **Confirmation first, for every award from the sheet** (the toolbar's, and the Encounter tab's encounter, accomplishment and custom buttons). It shows:
  - the amount and each share;
  - who is written (characters, with their XP before and after);
  - who is only counted (NPCs, whose level doesn't come from XP);
  - what doesn't divide evenly and isn't awarded.
- **Only on Award** does the existing `awardPartyXP` run, with **the same members** the GM saw.
- **Players are refused**, in the workflow itself (unchanged).

## Begin Session

The existing workflow. It now runs only for a GM, and one at a time.

## One at a time

Rest, Travel, Award XP and Begin Session each run once per party on the pressing GM's client. A double-click, or a second press while a dialog is open, does nothing. These actions aren't relayed, so another client can't start one by accident.

## Harness

- **New:** `verify-party-sheet-stage3` (64 checks) and `mutate-party-sheet-stage3` (23 mutations, all caught). It builds a world with Party A (six members), Party B (four different ones), unassigned actors, and one actor on both rosters. It drives the real Rest and Travel dialogs and the XP award: Party A's actions reach Party A only, and Travel is paced by Party A's slowest, not Party B's or an unassigned actor's.
- **Re-anchored, same meaning:**
  - `verify-chapter8-221-230` M14/M15 and two `mutate-chapter8-221-230` anchors (the food and water fields are keyed by position);
  - `verify-party-sheet-stage2` D7 and G2.
- **Harness seams:** two recorded.
- **Version pins** raised.
- **Shared-workflow mutation checks:** all 10 mutation scripts that read the Rest or Travel files were re-run, and all pass.

No data change and no migration.
