# Live recheck: TRG Prime 3.685.2

This recheck ran on 7 November 2026, in Graham's world, with:
- TRG Prime 3.685.2 on Foundry 14.367;
- Eldritch Arts 0.10.1 and Inner Tempest 1.0.4 active.

I tested in the desktop app's built-in browser, logged in as the only connected GM.

## Results: all pass

| Fix | What was checked | Result |
|---|---|---|
| 1. Two invalid IDs | The Creature Abilities compendium index, and opening both documents from it. | 105 entries, none with an empty ID. "Scorching Breath" opens as `Compendium.trg-prime.creature-abilities.Item.ff30ScorchBreath`. "Wing Buffet" opens as `…Item.ff30WingBuffet01`. The third, empty-ID "Scorching Breath" is gone. Every TRG Prime compendium index entry (2,023) has a valid 16-character ID. |
| 2. Schema snapshot | The snapshot against the running build, and the "Verify Foundry Integration" schema checks (S1 to S5). | The snapshot records 14.367 and shows no drift: no recorded field is missing and none is new. S1 to S4 pass, including "the snapshot was recorded on this build (14.367)". S5 lists the four module-provided Region behaviours and leaves them alone. |
| 3. End-of-combat cleanup | A throwaway combat of two "ZZ EA" Fighters was started (no surprise) and then deleted. | The second combatant's opening Flat-Footed was removed when the combat was deleted, and its per-turn records were cleared. No console errors. |

## Not tested live

- **Two GMs at once.** Only one GM was connected, so the duplicate-deletion case can't be reproduced live. `verify-fixes-3685-2` drives it with two GM clients.
- **Inner Tempest dragons gaining Wing Buffet and Scorching Breath on their next reconcile.** No dragon was levelled. The compendium lookup Inner Tempest relies on (find by name, then open by ID) now returns both documents.

## Cleanup

- **Deleted:**
  - the combat;
  - the "ZZ EA 3852 Recheck" scene and its tokens;
  - the two ZZ actors;
  - 2 test chat cards.
- **Not affected:** no other chat messages had been posted.
- **World state:** the world's active scene is Oldwatch Approach, and the game is still paused. There are no combats.
