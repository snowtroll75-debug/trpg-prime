# Live testing report: TRG Prime 3.706.1

21 November 2026, about 14:55. World "Test", Foundry V14 build 367. The 3.706.1 build was confirmed installed.

- **PC Tester** (player, at `localhost:30000`) drove the actions.
- **Testing Dude** (GM, at `127.0.0.1:30000`) answered the foe's Attack of Opportunity.
- **Setting:** the ZZ scene from the 3.706.0 test, round 2, ZZ PC Lunger's turn.
- **Forced dice:** a hit and a grapple success, on the player's client.

## Results

| # | Test | Result |
|---|---|---|
| T1 | Combat Grapple hit, adjacent (forced), round 2 | **Pass.** ZZ Foe Grabbed, clock round 4; grabbed-by ZZ PC Lunger. |
| T1b | Grapple Attack success, adjacent (forced), round 2, for comparison | **Pass.** Grabbed, clock round 4: the same as Combat Grapple's (R-0012). |
| T2 | The player moves from adjacent to 15 ft; the foe's Attack of Opportunity offer (hidden from the player) is taken by the GM | **Pass.** "Club — Attack vs ZZ PC Lunger": a melee Strike, with no throw, no range increment and no "Threw Club". The Club stays in hand. Reaction spent (R-0013). |

**Console:** no error from the system.

## Clean-up

- **Deleted:**
  - the "ZZ Player Test" scene;
  - the ZZ Foe, ZZ Guard and ZZ PC Lunger actors;
  - the test combat;
  - the 197 chat messages posted by Testing Dude and PC Tester since 03:30 today.
- **Left as found:**
  - Graham's 14 messages (Gamemaster, building Syn) and Player4's 2;
  - every older message;
  - the actors Character, Kharon, Syn, Valmorius and Valmorius 2;
  - the Caves scene, active.
- **Paused:** the game is paused again, as it was when the world was launched.
- **Not used:** no party actor exists, so the two thrown weapons of the 3.706.0 test (the Dagger and the Club) left nothing on a party sheet.
- **Browser:** both test sessions were closed.
