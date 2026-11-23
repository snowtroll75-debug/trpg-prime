# Party Sheet V2, Stage 5 and final verification report

23 November 2026. TRG Prime **3.711.1 → 3.712.0 → 3.712.1**. Branch `feature/party-sheet-v2-stage5`, local and not pushed. It builds on the Stage 1–4 branches; `main` is still 3.707.3. Package `trg-prime-3.712.1.zip`.

**Status: built, verified automatically, and live-tested.** 3.712.0 passed 21 of 22 live checks. The one finding, the Group Check summary's DC wording, is fixed in 3.712.1, which passed every remaining live check, two connected GMs included. The sheet is **not** claimed to be regression-free beyond what the tests below support.

## 1. Versions

| Stage | Versions | Live-tested |
|---|---|---|
| 1. Foundation, live sync, security | 3.708.0, 3.708.1 | yes |
| 2. Overview dashboard | 3.709.0, 3.709.1 | yes |
| 3. Party Actions | 3.710.0 to 3.710.3 (with the rest ruling) | yes |
| 4. Inventory, transfers, treasury | 3.711.0, 3.711.1 | yes |
| 5. Skills, Group Check, Encounter, Notes | **3.712.0**, 3.712.1 | yes (3.712.0; `live-testing-report-3.712.0.md`) |

The manifest URL is unchanged.

## 2. What Stage 5 implemented

### Your rulings (23 November 2026)

- **Notes:** shared notes only. The GM edits and players read.
- **Encounter import:** defeated and Friendly start unticked; hidden adversaries are included.

### Skills

- **The table:** members by the 26 core skills (`SKILLS` in `config.mjs`), read from the prepared `system.skills.<key>.total`, the number each character sheet prints.
- **The three marks:**
  - **+0** is a real modifier;
  - **—** is a skill not in the member's data;
  - **?** is a member hidden by the NPC visibility ruling.
- **Best value:** marked per column, ties included.
- **Sort, filter, scroll:** sorting by name, a column filter and a sticky scrolling table. The sort and filter persist across redraws.
- **Rolling:** clicking a modifier calls the member's own character-sheet `rollSkill`. It's offered to the GM and the member's owner only.

### Group Check

- **Choices (GM):** the skill, the members, a DC or none, the existing difficulty ladder, the chat visibility, and whether to ask about optional bonuses.
- **The rolls:** each member's own `TRGCheck`, with their own rows and the automatic conditionals.
- **The summary card:** in the same visibility. It reports individual results and how many reached each degree.
- **No group rule:** none exists in the rules or the code (searched), so none is invented, and the card says so.
- **Members:** unchanged.

### Encounter

- **Import Combat:** the active combat or one chosen.
- **Add Selected Tokens:** rebuilt on the same import list.
- **Who is offered:**
  - party members are never offered;
  - missing tokens are named;
  - defeated and Friendly start unticked;
  - hidden adversaries are included and marked.
- **Counting:**
  - each unlinked token is its own creature;
  - a linked actor is one creature;
  - the same token never counts twice;
  - a creature you added by hand is flagged;
  - an import never lowers a count.
- **Storage version 2:** each creature now records the tokens it was imported from. Version 1 encounters read unchanged; there is no migration.
- **Clear:** asks first, and touches only the party's list.
- **Unchanged:** XP, threat, APL, accomplishments, custom XP, treasure and Begin Session.

### Notes

- **Field and editor:** `system.details.notes`, with Foundry v14's `prose-mirror` editor for the GM and an enriched read-only view for players.
- **Secrets:** shown to the GM only. The tab tells the GM the text is still stored in the party.

### Integration fix (R-0033)

- **The problem:** the sheet's whole-form submit could write stale coin back over a transfer while another field was being edited.
- **The fix:** a change now writes only its own field, and live renders wait for an open editor.

## 3. Files (Stage 5)

**Added:**
- `module/party-skills.mjs`
- `tools/verify-party-sheet-stage5.mjs`
- `tools/mutate-party-sheet-stage5.mjs`
- `release-notes-3.712.0.md`
- `party-sheet-v2-final-report.md`

**Changed:**
- `module/sheets/party-sheet.mjs`
- `templates/actor/party-sheet.hbs`
- `module/party-rewards-workflow.mjs` (encounter version 2, the import)
- `module/party-actions.mjs` (Group Check implemented)
- `styles/trg-prime.css`
- `system.json`, `package.json`
- `CHANGELOG.md`, `TRG_PRIME_REPAIR_LOG.md` (R-0033)
- `tools/uncalled-exports.json` (6 keeps with reasons)
- re-anchored checks where Stage 5 builds what they held back:
  - Stage 1: T5, and the scroll mutation;
  - Stage 2: G4, and its mutation;
  - Stage 3: B2, B3 and B5, and the Group Check mutation;
- version pins

## 4. Workflows reused

- **Skill rolls:** the character sheet's `rollSkill`.
- **Group Check:** `TRGCheck.roll`, `withCheckModifiers` (implicit), `DIFFICULTIES` and `applyMessageMode`.
- **Encounter:** `rewardsContext`, `encounterSummary`, `splitXP`, `awardPartyXP` and `beginSession`.
- **Members:** `resolvePartyRoster`, `partyParticipants`, `canSeeMemberDetails` and `runOnce`.
- **Notes:** `TextEditor.enrichHTML`.
- **Unchanged since Stages 1–4:** the transfer engine, the relay, live sync and the rest and travel workflows.

## 5. Tests and results

### Automated, at `b77f887` (3.712.0, in clean worktrees); 3.712.1 re-run at `a409137`: all 402 verify scripts pass, and the Stage 5 pair is 62 checks / 35 mutations

- **New pair:** `verify-party-sheet-stage5` passes 61 checks. `mutate-party-sheet-stage5` catches all 34 mutations.
- **Earlier party pairs:**
  - Stage 1: 120 checks, 51 mutations caught;
  - Stage 2: 140 checks, 48 caught;
  - Stage 3: 66 checks, 25 caught;
  - Stage 4: 130 checks, 43 caught;
  - block38 rewards: 59 checks, 37 caught;
  - `fixes-3686-2` (multi-GM): 35 checks, 44 caught;
  - `rest-single-check`: 34 checks, 18 caught.
- **Full verify suite:** all 402 scripts pass.
- **Full mutate suite:** all 397 scripts pass. Two scripts were left out because they hang past the runner's limit: `mutate-checks-read-source` and `mutate-fixes-3685-3b`. Neither touches party code.
- **Static checks:** `verify-no-undefined-names` (839 files) and `verify-rules-have-callers` both pass.
- **Companion modules:** Pillars of Faith, Inner Tempest and Eldritch Arts give identical results on 3.707.3 and 3.712.0: 51 scripts, 0 differ. The 11 failures already known are unchanged: Pillars' stale version pins and two module-side crashes.
- **Template:** rendered offline as GM and as player.

### The §8 regression list

| Area | Covered by |
|---|---|
| Character and NPC sheets | the full verify suite (402); live in Stages 1–4; on 3.712.0, the character sheet's own skill roll from the Party sheet |
| Party membership | Stage 1 harness, and live in Stages 1–4 |
| Live member sync | Stage 1 harness (live-sync), live in Stages 1–2; the editor guard is new in Stage 5 (N5) |
| HP and PP display | Stage 2 harness, live in Stage 2 |
| Conditions and effects | Stage 2 harness, live in Stage 2 |
| Skill rolls | Stage 5 K12 and K13; live (3.712.0) |
| Group Checks | Stage 5 G1–G15; live (3.712.0) |
| Initiative | Stage 2 harness, live in Stage 2 |
| Rest and Travel | Stage 3 harness and `rest-single-check`, live in 3.710.x |
| Begin Session | Stage 3 harness and block38, live in Stage 3 |
| XP and accomplishments | Stage 3 harness and block38, live in Stage 3 |
| Encounter import | Stage 5 E1–E19; live (3.712.0) |
| Inventory deposits and withdrawals | Stage 4 harness, live in 3.711.0 and 3.711.1 |
| Coin transfers | Stage 4 harness, live in 3.711.0 |
| Multi-GM security | Stage 4 M1–M9, `fixes-3686-2`; live on 3.712.1 with two GMs: relay, simultaneous last-item race, and hand-over |
| Notes persistence | Stage 5 N1–N5; live (3.712.0) |
| Party permissions | Stage 1–4 harnesses (player context), live with PC Tester in Stages 1–4 |
| Multiple Party actors | Stage 3 harness (Party A and Party B), live in Stage 3 |
| Existing standalone macros | Stage 3 (`openRestDialog()`, Travel), live in Stage 3 |
| Six-character and mixed PC/NPC parties | Stage 3 harness (six members, NPCs); live (3.712.0): 5 characters and a temporary NPC |

## 6. Limitations and remaining live testing

**Live-tested on 3.712.0** (see the live report):
- the Skills page: all 156 cells against the actors, the best value, sort, filter, and a click opening the member's own roll;
- Group Check: GM-only visibility as the player sees it, and a Conviction prompt;
- Import Combat and Add Selected Tokens: linked, unlinked, defeated, hidden and friendly tokens, a party member's token, and a second import;
- Clear, with No and Yes;
- Notes: editing, saving, reopening, the player's view without secrets, the editor guard and the stale-coin fix;
- a six-member mixed party, and two parties.

**Checked live on 3.712.1** (`live-testing-report-3.712.1.md`):
- Award Encounter XP from an imported encounter;
- the summary's DC wording;
- **two GMs connected:** the second GM's transfer was relayed to the designated GM and carried out once; both GMs giving the last potion at the same second gave one potion; and after the designated GM left, the other GM's client took over and performed.

**Still unverified live:** a disconnect in the middle of one transfer. It can't be forced reliably here; the harness covers it (Stage 4, F5–F9), and the Unfinished Transfers list was checked live in 3.711.0.

**Known limits (disclosed, not resolved):**
- **Not true secrets:** the party's data, notes included, is sent to every player who can see the party. A secret block or any GM-only text is hidden by the sheet, not by Foundry.
- **Specialist skills** are not columns. They differ per character; the matrix shows the 26 core skills.
- **The Group Check is GM-run.** The GM's client rolls for every member, so Conviction and optional-bonus prompts appear for the GM.
- **Stage 4's limits stand:** transfers are not atomic across documents, and the recovery is the journal plus undo.

## 7. Code quality audit (§9)

| Check | Result |
|---|---|
| Unused imports | None, in any of the ten party modules (a script check). |
| Unresolved names and imports | `verify-no-undefined-names`: none. |
| Exports with no caller | None new without a reason (`verify-rules-have-callers`). |
| Duplicate business logic | None added. Skill totals, checks, coin, XP and transfers each come from one place. The Group Check doesn't re-implement the check dialog; it uses `TRGCheck.roll` as non-dialog checks do. |
| Hooks and cleanup | Live sync installs hooks with the first sheet and removes them with the last (Stage 1, re-checked: 23 `updateActor` hooks at baseline after each live test). Filters and the editor listener are attached to the sheet's own element and go with it. The startup notice is a single timer. |
| Rerendering | Live renders coalesced (50 ms), and deferred while a field or the editor is in use. Filters work in place without renders. |
| Socket mutations | Only the transfer relay, unchanged from Stage 4 (every field re-validated on the performing client). Stage 5 adds no socket messages. |
| Deprecated APIs | None found. ApplicationV2, `prose-mirror`, `TextEditor.implementation` and `ForcedDeletion` are the v14 forms. The editor deliberately avoids the old `{{editor}}` helper. |
| Templates and styles | Rendered offline; every new class is styled from the palette variables. A Font Awesome Pro-only icon (`fa-swords`) was caught and replaced. |
| Unintended migrations | None. Encounter version 2 is read-compatible and written only on change; the transfer journal is a new flag written only when a transfer runs. |
| Regressions in other components | Full suites and modules: as section 5. The only shared-file changes outside the party: item type labels in `lang/en.json` (3.711.1), and the rest and fatigue changes (3.710.2 and 3.710.3), each with its own pair and live test. |

## 8. Artefact

- **Package:** `trg-prime-3.712.1.zip`
- **Branch:** `feature/party-sheet-v2-stage5` (not pushed)
- **To ship:** merge to `main` and publish the release. Neither is done; both wait for your authorisation.
