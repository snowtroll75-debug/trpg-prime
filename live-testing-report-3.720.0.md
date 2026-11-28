# Live testing report: TRG Prime 3.720.0

28 November 2026, in the Test world (Foundry 14.367, scene "ZZ SW Sweep"), as the GM (Testing Dude, localhost) and as a player (PC Tester, 127.0.0.1). The game was paused throughout.

**Result:** every test passed. No defect found.

**Cleanup:** the temporary actors (TSTMP Small, TSTMP PC, TSTMP Raft, TSTMP Trap, TSTMP Party), their tokens, the test combat and the 4 chat messages were deleted. ZZ SW Wizard's Power Points were put back to 80. The world has its 15 actors, the scene its 10 tokens (all Medium, 1 × 1 × 1), and the chat log its 2,914 messages.

## The world as installed

The Test world's 15 actors are all Medium, so the first-run correction had nothing to change: no token on either scene and no prototype token disagreed with its Size.

## As the GM

| Test | Result |
|---|---|
| A new Small NPC's prototype token | ✓ 0.8 × 0.8 × 0.8 |
| Tokens created at 1 × 1 for it, linked and unlinked | ✓ Both created at 0.8 × 0.8 × 0.8 |
| A scene opened with a Small creature on a 1 × 1 × 1 token (forced, then the scene redrawn) | ✓ Corrected to 0.8 |
| Distance from a Small token to the Medium token beside it | ✓ 5 feet; each occupies its one square |
| A Tiny token parked at a quarter square (3.5, 12.25) | ✓ Still read as square (3, 12), 5 feet from its neighbour |
| A vehicle (2 × 4), a peril (3 × 3) and a party (2 × 2), then an update to each | ✓ Tokens and prototypes unchanged |

## In combat (TSTMP PC's turn, 2 AP left)

| Test | Result |
|---|---|
| The creature whose turn it is made Large by an effect | ✓ Token 2 × 2 × 2, AP still 2 |
| …then Gargantuan, over squares other tokens stand in | ✓ Token 4 × 4 × 4, AP still 2, nothing refused |
| The effect removed | ✓ Token 1 × 1 × 1, AP still 2 |
| The other combatant made Large, then Small again | ✓ Linked and unlinked tokens 2, then 0.8; no AP charged |
| A real one-square move by the PC | ✓ Charged 1 AP (3 to 2) |
| Chat cards or warnings from any resize | ✓ None |

## A real Size Alteration cast

ZZ SW Wizard cast Size Alteration on TSTMP PC from its sheet's workflow, with no warp, in combat.

- **The cast:** 36 against Casting DC 19, a Critical, 3 PP spent.
- **The Result card:** "TSTMP PC is large — one step larger than medium."
- **The token:** 2 × 2 × 2, in the same place. The target's AP was unchanged.
- **The effect removed:** Medium again, token 1 × 1 × 1.
- **Out of range first:** the first attempt was refused at 35 feet against the spell's 30, as it should be.

## As a player (PC Tester, owner of TSTMP PC)

| Test | Result |
|---|---|
| The player sets their character's Size to Small | ✓ The GM's client resized the token to 0.8; the player sees it |
| …to Huge | ✓ 3 × 3 × 3, drawn 3 squares across on the player's canvas |
| …to Medium | ✓ 1 × 1 × 1 |
| Errors or warnings on the player's client | ✓ None |
| AP charged for any of them, in combat | ✓ None |

## Not tested

- Change Shape, Luna Frenzy and a companion's growth, which keep their own resize.
- A hex or gridless scene.
- A world that already holds Small, Tiny or Diminutive creatures: the Test world has none, so the first-run correction was tested on one forced token only.
