# Live testing report: TRG Prime 3.708.0 (Party Sheet V2, Stage 1)

22 November 2026, about 13:10–14:00. World "Test", Foundry V14 build 367. Graham installed 3.708.0, and the system reported 3.708.0.

**Who:**
- **Testing Dude (GM):** in Chrome, through the extension. A second GM tab was opened for the two-connection test.
- **PC Tester (player):** in the Claude desktop app's built-in browser, a separate browser profile.

**Starting state:** 5 actors (Character, Kharon, Syn, Valmorius, Valmorius 2), no parties, 1 scene (Caves), 209 chat messages, paused. With no Party sheet open there were 23 `updateActor` hooks.

**Set-up, all throwaway:**
- in a "ZZ Party V2 test" folder: ZZ Wizard, ZZ Bard (owned by PC Tester), ZZ Ally (an NPC), ZZ Rogue and ZZ Hound (a companion);
- **ZZ Party A:** Wizard, Bard and Ally;
- **ZZ Party B:** Bard and Rogue;
- PC Tester had Observer on both parties.

## Results

| # | Test | Result |
|---|---|---|
| L1 | Both sheets open | **Pass.** `updateActor` hooks went from 23 to 24: one set for both sheets. |
| L2 | The Bard (on both rosters) takes damage, 30 → 12 | **Pass.** Both sheets read 12 / 30; one render each. |
| L3 | The Wizard's PP changes (Party A only) | **Pass.** A rendered once and B didn't. |
| L4 | An unrelated actor (Kharon) is updated | **Pass.** No render on either sheet. The probe flag was removed. |
| L5 | The Bard is renamed and given a new portrait | **Pass.** Both sheets show the new name and image. |
| L6 | Five rapid HP updates | **Pass.** One render per sheet, ending on the final value. |
| L7 | Conditions: Weakened 2 on the Bard, Blinded on the Ally, then Weakened removed | **Pass.** "Weakened 2" appears on both sheets. "Blinded" brings its granted "Flat-Footed". Removal clears it. |
| L8 | Level: the Wizard's XP 10,000 → 40,000 | **Pass.** "Level 4" appears on the roster, and the Rewards APL becomes "2 (2 across 3)". Its class change also showed live. |
| L9 | An item created, changed and deleted on the Wizard | **Pass.** A rendered once each time; B never did. |
| L10 | The GM is typing in the custom XP box when the Bard is damaged | **Pass.** A held its render, kept "123" and kept focus; B rendered. On blur, A rendered once and stayed on Rewards. |
| L11 | A member is deleted from the world | **Pass.** The row says "deleted from the world, or is no longer available". The stored roster is not pruned. |
| L12 | A companion on the roster (put on by data, not by drop) | **Pass.** "A companion cannot be a party member. Remove it from the roster." It isn't counted: the header said 3 members. The GM's note appears. |
| L13 | **Remove on any row** | **FAIL, then fixed in 3.708.1.** No row had a Remove button, for the GM either (finding A). With the fix applied to an in-memory copy of the template, Remove cleared the deleted and the ineligible entries, and the note went away. |
| L14 | An unlinked token's actor on Party B, then its token deleted | **Pass.** The row became missing on B. |
| L15 | **The base actor behind an unlinked adversary token is renamed** | **FAIL, fixed in 3.708.1 (finding B).** No render; the row kept the old name until the next render. Watching the token's base actor, as the fix does, gave one render and the new name. |
| L16 | Open and close: both closed, then 10 cycles, then reopened | **Pass.** Hooks: 23 with both closed and 23 after the 10 cycles, then 24 on reopening. The roster persisted. A closed sheet didn't render when a member changed. |
| L17 | GM drops: a spell, a feat, an affliction, a rope with quantity 0 and an active effect | **Pass.** Each refused with its reason, and the party had 0 items and 0 effects. The affliction's message read "is a affliction" (finding D, wording). |
| L18 | GM drops a sword | **Pass.** Added. The system's existing Customise dialog opened, as for any GM item drop; I cancelled it. |
| L19 | Tabs: a mouse click on the Loot tab's icon, and on the Rewards label | **Pass.** Both switched. `aria-selected` and `aria-hidden` followed. The nav looks as before. |
| L20 | The player's view | **Pass.** PCs show HP, PP and level. The Ally shows name and portrait only (no bars, no conditions). Tabs are Roster and Loot only. The context has `rewards: null` and no `system`. There are no Remove buttons, and `_canDragStart` is false. |
| L21 | The GM grants the player Observer on the Ally | **Pass.** The player's open sheet filled the Ally row in live, with Blinded and Flat-Footed. |
| L22 | The player takes 2 of 5 rope, then 3 gp, through the relay | **Pass.** Rope: party 3, Bard 2. Coin: party 7 gp, Bard 3 gp. |
| L23 | The player drops party loot on their own sheet (`dropActorSheetData`) | **Pass.** Refused: "Use the party sheet's Take button…". |
| L24 | The player calls Award XP and Begin Session | **Pass.** Both refused; nothing written. |
| L25 | The GM's custom Award of 300 XP (button) | **Pass.** 100 each across 3. The Wizard 40,000 → 40,100, the Bard 10,000 → 10,100. The Ally's share is reported, not written. |
| L26 | Begin Session (button), the Wizard with Hero's Resolve | **Pass.** At 1/1: "already at 1/1". At 0/1: "conviction 0 → 1". |
| L27 | Add Selected Tokens (a ZZ Orc token on a throwaway scene) | **Pass.** It joined the encounter at EL 1, 300 XP each. |
| L28 | Two connections of the GM, and the player takes 1 rope | **Pass for the relay.** It moved once: party 3 → 2, one card. **But** the Bard got a second "ZZ Rope" row (2 and 1) instead of a stack of 3 (finding C). The total was conserved. |

## Findings, all fixed in 3.708.1

- **A. The roster's Remove button never appeared** (R-0023). Inside `{{#each members as |m|}}` the template tested a bare `isGM`, which is read from the member and is always false. This predates 3.708.0 (the line is unchanged since the roster was built). Stage 1 requires that a missing member can be removed. Now `../isGM`.
- **B. The base actor of an unlinked token wasn't watched** (R-0024). In v14 a synthetic actor has no `baseActor`; the token has it. A change to the world actor behind an unlinked token (rename, level) left the row stale until the next render. Changes to the token's own actor were fine. Now read from `actor.token.baseActor`.
- **C. A taken stack didn't join the character's stack** (R-0025). `findMergeTarget` compared the incoming item's stored data with the existing item's prepared data, which carries a derived `totalWeight` that depends on the quantity. Every take after the first added a new row. Nothing was lost or duplicated. This also predates 3.708.0. Now both sides compare stored data.
- **D. "is a affliction"** in the refusal message. Now "an".

## Not covered live

- **The console:** neither browser's console captured errors, but tracking only began when it was first read, which was at the end, so this doesn't prove the session was error-free. None of my scripted steps threw.
- **A player's real mouse drag** of a loot row wasn't tried. `_canDragStart` returns false for them, and the guard refuses the drop (L23).

## Clean-up

- **Deleted:**
  - the 8 ZZ actors (both parties included);
  - the 5 ZZ world items;
  - the ZZ scene and the folder;
  - the 7 chat cards the test posted.
- **Restored:** the in-memory template copy was put back.
- **Now:** 5 actors as before, 209 messages, no world items, Caves viewed and active, no combats, still paused. `updateActor` hooks are back to 23. Kharon's probe flag is gone.
- **Browsers:** PC Tester's session was closed with the built-in browser's tab. Both Chrome tabs were closed.
