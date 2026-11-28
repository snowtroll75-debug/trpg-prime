# Live testing report: TRG Prime 3.720.1

28 November 2026, in the Test world (Foundry 14.367, scene "ZZ SW Sweep"), as the GM (Testing Dude). The game was paused throughout.

**Result:** every test passed. No defect found.

**Cleanup:** the temporary actors (TSTMP Small, TSTMP Raft, TSTMP Party) and their tokens were deleted. The world has its 15 actors, the scene its 10 tokens (all 1 × 1 × 1), and the chat log its 2,914 messages.

## The tick box on a token

Two linked tokens of one Small NPC, "Kept" and "Free", both created at 0.8.

| Test | Result |
|---|---|
| The box on the token's sheet | ✓ One box, directly under the Size row, labelled "Keep this size", with its hint, unticked |
| Ticked and saved with the size set by hand to 2 × 3 × 1 | ✓ The flag is saved and the token is 2 × 3 × 1 |
| The creature made Large on its sheet | ✓ Kept stays 2 × 3 × 1; Free goes to 2 × 2 × 2 |
| An effect with Size Alteration's change, to Huge | ✓ Kept stays 2 × 3 × 1; Free goes to 3 × 3 × 3 |
| The scene reopened | ✓ Kept stays 2 × 3 × 1 |
| A form's own resize (`resizeTokenInPlace`, to 4) | ✓ Kept stays 2 × 3 × 1 |
| The sheet reopened | ✓ The box is ticked |
| Unticked and saved | ✓ The token goes to 2 × 2 × 2, its creature's Size (Large), at once |

## The tick box on a prototype token

| Test | Result |
|---|---|
| The box on the prototype token's sheet | ✓ Under the Size row, unticked |
| Ticked and saved with the size set by hand to 3 × 1 × 2 | ✓ The flag is saved and the prototype is 3 × 1 × 2 |
| The creature made Tiny | ✓ The prototype stays 3 × 1 × 2; the tokens already on the scene go to 0.6 |
| A token made from the kept prototype | ✓ Created at 3 × 1 × 2, itself ticked |
| The creature made Medium | ✓ That token stays 3 × 1 × 2; the free token goes to 1 |
| The prototype unticked and saved | ✓ The prototype goes to 1 × 1 × 1 |

## Where there is no box

| Test | Result |
|---|---|
| A vehicle's token sheet | ✓ No box; its 2 × 4 token unchanged |
| A party's prototype token sheet | ✓ No box |

## Not tested

- A real Change Shape or Luna Frenzy on a kept token: the function they resize through was called directly instead.
- A player opening a token's sheet.
