# Party Sheet V2, Stage 4: completion report

23 November 2026. TRG Prime **3.710.3 → 3.711.0 → 3.711.1**. Branch `feature/party-sheet-v2-stage4` (from Stage 3 at `a48074d`), local and not pushed. Package `trg-prime-3.711.1.zip`. Tested live on 3.711.0; its four findings are fixed in 3.711.1, which hasn't been re-tested live.

## 1. Versions

- **Before:** 3.710.3 (Stage 3 and its fixes, live-tested)
- **After:** 3.711.0 (Stage 4), then 3.711.1 (the live test's fixes)
- **Manifest URL:** unchanged

## 2. What was implemented

### Graham's rulings (23 November 2026)

- **Split Coin remainders:** stay in the treasury. Each coin is split on its own and never broken into change.
- **Split Coin and Give Coin:** GM only. Players keep Take Coin for their own character, and can Deposit.
- **Player deposits and withdrawals:** happen at once, through the GM relay, with no approval prompt.
- **Audit cards:** public.

### Inventory page

- **Columns:** icon, name, type, quantity, weight (each and in all), and details read from the item's own fields.
- **Search and filter:**
  - search by name; filter by the item types present;
  - filtering is done in place, and is kept when the sheet redraws;
  - the inputs are unnamed, so they never write to the actor.
- **Opening an item:** clicking a row opens the item's sheet, where the user may observe it.

### Withdraw: Take and Give

- **Destinations:** the party's members the user owns. The GM can choose any member, or someone outside the party from a separate, labelled list (the explicit override).
- **Partial stacks:** supported. Stacks merge under the existing strict rule.
- **Too many:** asking for more than there are is refused with the reason, never quietly reduced.

### Deposit

- **Deposit Item:** with a chooser, or by dragging from a character sheet.
- **What is checked:**
  - the source actor;
  - the item;
  - ownership;
  - party membership, for a player;
  - the item type;
  - the quantity;
  - the party.
- **Restrictions on what moves:**
  - natural and unarmed weapons stay with their owner;
  - items granted by a feature stay with that feature.
- **Carry state:** an item arrives unequipped, unstowed and not invested.

### Distribution

- **Dragging (GM):** drag a row onto a member in the Inventory's member strip, or onto a character's own sheet. It is the same validated move as Give, never Foundry's copy. A drag onto someone outside the party asks first.

### Treasury

- **Balances:** the five balances and the total value (`coinValueInGP`).
- **Actions:** Deposit Coin, Take Coin (players), Give Coin (GM), Split Coin (GM).
- **Split Coin:** a preview that recalculates as members are ticked. The shares shown travel with the request; if the treasury changed since, the split is refused.
- **Coin rule:** coin moves as coins, as before. There is no conversion.

### Audit trail

- **Cards:** a public card for each successful transfer, posted only after its last write, naming the user. A GM override says so.
- **Problems:** an undo that failed is whispered to GMs.

### Transaction safety

`module/party-transfers.mjs` is the engine; `module/party-socket.mjs` is the relay rebuilt around it.

| Concern | What is done |
|---|---|
| Rapid repeated clicks | Every transfer from the sheet, dialogs included, holds one lock per party on that client. Each request also has an id. |
| Concurrent requests | All transfers on a party run one at a time, in one queue on the performing client. |
| Two connected GMs | One client performs: the designated GM's elected connection. Another GM's client now relays to it rather than writing. |
| Duplicate or replayed messages | A repeated id is refused by the performing client's memory and by the party's journal. The journal also covers a hand-over to another GM. A duplicate gets no second reply. |
| Source item deleted before processing | Refused at planning. If it goes while the destination is being written, the source is re-read before its write, the destination write is undone, and the transfer is refused. |
| Destination unavailable | Refused at planning. If it goes later, its write fails and is undone. |
| Partial stacks and merges | Re-read before writing. Undoing a merge subtracts what was added. Undoing a deleted source re-creates it with its old id. |
| Failed updates | Destination first, then source. A failure undoes the earlier steps, newest first, so a failure leaves nothing, never a loss. |
| Disconnects | The journal records the transfer before the first write and marks it done after the last. A cut-off transfer stays listed for the GM (Unfinished Transfers), and the performing GM is told at the next login. The GM marks it checked, which moves nothing. |
| No GM, or no answer | No GM connected: the player is told. No answer within 15 seconds: reported as *unknown*, since it may have happened, never as failed. |

## 3. Files

**Added:**
- `module/party-transfers.mjs`
- `tools/verify-party-sheet-stage4.mjs`
- `tools/mutate-party-sheet-stage4.mjs`
- `release-notes-3.711.0.md`
- `party-sheet-v2-stage4-report.md`

**Changed:**
- `module/party-socket.mjs` (rebuilt around the engine; replies; startup notice)
- `module/party.mjs` (retired `planTake` and `planCoinTake`; `findMergeTarget` now also ignores `invested`)
- `module/sheets/party-sheet.mjs`
- `templates/actor/party-sheet.hbs`
- `styles/trg-prime.css` (palette variables only)
- `system.json`, `package.json`
- `CHANGELOG.md`, `TRG_PRIME_REPAIR_LOG.md` (R-0031)
- `tools/uncalled-exports.json` (14 keeps with reasons; 7 entries left the backlog)
- re-anchored checks, with the same meaning:
  - `verify-party-sheet-stage1` W1–W3 (the take through the engine; the character is now a member);
  - `verify-party-sheet-stage2` L5 (no *named* input is marked for players);
- version pins

## 4. Workflows reused

- **Items:** `isLootItem` and `LOOT_ITEM_TYPES`, `quantityOf`, `findMergeTarget`, `lootSummary` and `carriedWeightOf`.
- **Coin:** `normaliseCoin`, `addCoin`, `coinLine`, `coinIsEmpty` and `coinValueInGP`. No new conversion rule.
- **The relay:** `shouldHandleAsGM` with the GM-connection election (`isGMConnectionWriter`). Players still need only Observer, and nobody is given Owner on the party.
- **Customise on add:** the `trgPartyTransfer` option, so a transfer opens no Customise dialog.
- **Members and locks:** `resolvePartyRoster`, `partyParticipants` and `runOnce`.

## 5. Tests and results

**Automated:**
- **New pair:** `verify-party-sheet-stage4` passes 125 checks, and `mutate-party-sheet-stage4` catches all 39 mutations. The harness drives the engine on a fake world whose documents can be made to fail, and checks after every operation that every item and every copper is accounted for. It covers each item on the stage's test list:
  - full and partial withdrawal; full and partial deposit; onto an existing stack;
  - item types, and the restricted items;
  - player ownership and membership; the GM override;
  - split with a remainder, and a changed treasury refused;
  - insufficient funds;
  - concurrent requests (the last elixir; 2 gp three times from 3 gp);
  - duplicates and replays, including with the journal's writes lost, and a second GM;
  - the multi-GM relay and its reply;
  - failed source and destination writes, an undo that fails, and a failed split share;
  - missing actors and items, before and mid-transfer;
  - repeated drag and drop;
  - the sheet's wiring.
- **Earlier pairs:** Stage 1 (120 checks / 51 mutations caught), Stage 2 (140 / 48), Stage 3 (66 / 25) and `fixes-3686-2` (35 / 44) all pass.
- **Full verify suite:** all 401 scripts pass at `d2a7e4e`, in a clean worktree.
- **Full mutate suite:** all 396 scripts pass. Two were left out: `mutate-checks-read-source` and `mutate-fixes-3685-3b` hang past the runner's limit, and neither touches the party files.
- **Static checks:** `verify-no-undefined-names` and `verify-rules-have-callers` pass.
- **Companion modules:** Pillars of Faith, Inner Tempest and Eldritch Arts give the same results on 3.707.3 and 3.711.0: 51 scripts, 0 differ. The 11 failures are the ones already known, unchanged.
- **Template:** rendered offline as GM and as player.

**Live (3.711.0), GM and player in the Test world:** 19 of 23 passed. See `live-testing-report-3.711.0.md`.
- **Passed:**
  - Give, partial and with the override;
  - the inventory's columns, search and filter;
  - Split Coin's preview and its conservation;
  - Give, Deposit and Take Coin, with insufficient funds refused;
  - the GM's drags to the strip and to a character's sheet;
  - the GM's drag-deposit;
  - a player's take and coin;
  - four requests forged from a player's console, all refused;
  - a player's drag of loot onto their own sheet, refused;
  - a race for the last potion between the player and the GM;
  - the Unfinished Transfers list.
- **Failed, fixed in 3.711.1 (R-0032):**
  - the Deposit Item chooser;
  - a player's drag-to-deposit;
  - the "took" wording on the GM's Give;
  - the item type labels.
- **On 3.711.1:** all 401 verify scripts pass, as do the six mutation scripts that read the changed files.

## 6. Limitations and remaining live testing

**Not atomic.** Foundry writes one document at a time. What remains:

- **A GM editing by hand at the same moment.** A GM typing a quantity or a coin field on a sheet while a transfer runs on the same document can race with it. The re-read narrows the window but doesn't close it.
- **A GM hand-over mid-transfer.** If the GM-connection election changes during one transfer, the old writer may finish while the new one receives a retry. The journal refuses the retry, so the realistic remaining risk is a transfer cut off half-way. That leaves an **extra** item or coin, never a loss (destination first), and it is listed under Unfinished Transfers.
- **A failed undo.** If the undo itself fails (the destination has also become unwritable), the surplus stays. It is recorded and whispered to the GMs; it isn't repaired automatically.
- **Too-short timeouts.** A player whose answer takes longer than 15 seconds is told *unknown*; the chat card is the record.
- **Not covered by the harness:** the held-by-curse or unfinished states as they appear on the live sheet. They need live testing.

**To re-check live on 3.711.1:**
- Deposit Item by the button, for the GM and the player;
- a player's drag of their own item onto the party sheet;
- the GM's Give card wording;
- the Type column labels.

**Not tested live:** a player's request while the GM's tab is in the background, and the curse-held or undo-failed states as they appear on the sheet.

## 7. Regression and security issues found and fixed

**R-0031:** the GM's drags duplicated inventory, in both directions. Both are now moves.

**R-0032 (from the live test):**
- the Deposit Item chooser never deposited;
- a player's drag-to-deposit was ignored;
- the GM's Give card read "took";
- item types had no labels (this predates Stage 4; it also affected item sheet titles).

Also tightened, as Stage 4 requires: players can only take to, and deposit from, their own characters **in this party**. Before, a take could go to any character they owned anywhere.

## 8. Artefact

- **Package:** `trg-prime-3.711.1.zip`
- **Branch:** `feature/party-sheet-v2-stage4` (not pushed; it builds on the Stage 1–3 branches)

Stage 5 has not been started.
