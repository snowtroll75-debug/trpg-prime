# TRG Prime 3.711.0: Party Sheet V2, Stage 4 (shared inventory, transfers and treasury)

23 November 2026. Branch `feature/party-sheet-v2-stage4`, which builds on Stage 3 (3.710.3).

## The Inventory tab

### Party Inventory

- **Columns:** each item's icon, name, type, quantity, weight (each, and in all for a stack), and a line of details from the item's own fields:
  - weapon: damage and type, range
  - armour: DR, category
  - shield: Defence, DR
  - gear and consumables: uses, activation
  - ammunition: damage, weapon group
  - any item: quality if not standard, material, and whether it has runes
- **Search and filter:** search by name, and filter by type (the types present). Filtering happens in place, and the filter is kept when the sheet redraws.
- **Opening an item:** clicking an item opens its own sheet, for a GM or a user who can observe it.
- **Take (players):** goes to one of **your characters in this party**.
- **Give (GM):** goes to any member, or, picked from a separate list marked "Outside the party (GM)", to someone not on the roster.
- **Partial stacks:** you choose how many. Asking for more than there are is refused with the reason, not quietly reduced.
- **Deposit Item:** moves an item from your character into the party. The character no longer has it. It arrives unequipped, unstowed and not invested.
- **Drag to deposit:** dragging an item from a character sheet onto the party sheet is a deposit (a move).
- **Drag to give (GM):** drag an inventory row onto a member in the Inventory's member strip, or onto a character's own sheet, to give it. This is the same validated move as Give. A drag onto someone outside the party asks first.
- **What stays with its owner:**
  - only the six existing inventory types move (weapon, armour, shield, gear, consumable, ammunition);
  - natural and unarmed weapons stay with their owner;
  - items granted by a feature stay with that feature.
- **Stacks:** identical items join one stack, under the existing strict matching rule.

### Treasury

- **Balances:** the five coin balances and their total value in gp.
- **Deposit Coin:** from a member's purse into the treasury. Players can deposit from their own members only.
- **Take Coin (players):** to your own member.
- **Give Coin (GM):** to any member, or outside the party.
- **Split Coin (GM):**
  - a preview shows each share and what stays in the treasury before anything moves, with ticks to choose who shares;
  - each coin is split on its own, and what doesn't divide **stays in the treasury** (Graham's ruling); no coin is broken into change;
  - the shares shown are the shares paid. If the treasury changed in the meantime, the split is refused.
- **Coin rule:** coin is taken as coins, as before. 20 sp from a treasury with 5 sp is refused; the gold is not broken.

### Chat cards

- Every successful transfer posts a public card (Graham's ruling): what moved, how many, from whom, to whom, and who did it.
- A GM override says so on its card.
- A card is posted only once every write has finished.

## Transaction safety

- **One client performs:** every transfer runs on the designated GM's elected connection. Players relay to it. **A GM on another client now relays too**, so all transfers on a party run **one at a time** in one queue.
- **Destination first:** each transfer writes the destination first and the source second. Immediately before the source write, the source is read again. If it no longer has enough, the destination write is undone and the transfer refused.
- **Undo:** a failed write undoes the earlier ones, newest first.
- **Request ids:**
  - every request has an id, and a repeated id is refused by the performing client's memory and by the party's journal (which survives a change of GM);
  - a duplicate gets no second answer.
- **The journal:** each transfer is recorded on the party before its first write and marked done after its last.
  - If the GM's client is cut off in between, or an undo fails, the record stays and the GM sees it under **Unfinished Transfers** on the Inventory tab, with what it was meant to do.
  - The performing GM also gets a notice on the next login.
  - The GM checks both inventories and marks it checked; that moves nothing.
- **Replies:** the requester's button stays locked until the GM's client answers. A refusal is shown in plain words.
  - **No answer:** after 15 seconds the request is reported as *unknown*, never as failed, since it may have happened.
  - **No GM connected:** the player is told so.

**What is not atomic:** Foundry writes one document at a time, so a transfer is never truly atomic. The remaining gaps are listed in the Stage 4 report.

## Changed behaviour

- **The GM's drag of party loot onto a character sheet** used to make a copy and leave the party's. It is now a move (R-0031).
- **A GM's item dragged from a character onto the party** used to make a copy. It is now a deposit (a move) (R-0031).
- **Players** can now only take to, and deposit from, their own characters **in this party**. Before, a take could go to any character the player owned.
- **New loot:** dragging from the sidebar or a compendium is still the GM's alone, and is unchanged.

## Harness

- **New pair:** `verify-party-sheet-stage4` (125 checks) drives the engine on a fake world whose documents can be made to fail, checking that items and coin are conserved after each operation. `mutate-party-sheet-stage4` catches all 39 of its mutations.
- **Re-anchored, with the same meaning:**
  - `verify-party-sheet-stage1` W1–W3, the take through the new engine;
  - `verify-party-sheet-stage2` L5: "no *named* input marked for players". The search and filter are unnamed.
- **Retired:** `performTakeItem`, `performTakeCoin`, `planTake` and `planCoinTake`, replaced by the engine.
- **Merge rule:** `findMergeTarget` now also ignores `invested` (carry state).
- **`uncalled-exports.json`:** 14 keeps with reasons; 7 entries left the backlog.

No data migration. The journal is a new party flag, `flags.trg-prime.transferJournal`, written only when a transfer runs.
