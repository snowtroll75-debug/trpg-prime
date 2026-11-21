# Live testing report: TRG Prime 3.706.0 (which includes 3.705.2)

21 November 2026, from about 12:00. World "Test", Foundry V14 build 367.

- **PC Tester** (player, at `localhost:30000`) drove every action from the character's sheet.
- **Testing Dude** (GM, at `127.0.0.1:30000`) set up each test and answered the foe's reactions.
- **Install:** Graham installed 3.706.0 and restarted the server. Both users signed in again.
- **World state at start:** the "Caves" scene was active and the game paused. Both users viewed "ZZ Player Test", and the game was unpaused for the tests.
- **Forced dice** (`CONFIG.Dice.randomUniform` on the player's client) produced a grapple success, a hit, a fumble and a miss by the shield's DB. Each is marked "forced".

## Results

| # | Test | Result |
|---|---|---|
| L1 | Lunge → Vital Strike at 10 ft | **Pass.** Reach −2; 2 AP spent at the Strike; the Lunge card posted (3.705.2 A). |
| L2 | Coup de Grace, adjacent: GM answers "immune", then "not immune" | **Pass.** "AV 11 — no critical (target is immune)", then "AV 11 — minor critical" (3.705.2 B). |
| L3 | Reactive Disarm: the player Lunges and fumbles (forced); the GM presses the button at 10 ft, then again after the foe steps adjacent | **Pass.** At 10 ft: refused, not marked used, round flag unset, button still usable, reaction unspent, the player targeted. Adjacent, the same button: Disarm rolled, reaction spent, "✓ Disarm attempted" (3.705.2 C). |
| L4 | Disarm Block: the player's Lunge misses by the shield's DB (forced); the GM presses | **Pass.** Refused for reach; no "grabbed for the weapon" card (3.705.2 D). |
| L5 | Trip while holding the Whip: adjacent, then at 15 ft | **Pass.** Adjacent: "Unarmed attack check", no Whip −4. At 15 ft: "with Whip", −4 and Reach −2. |
| L6 | Combat Grapple, adjacent hit (forced) | **Pass, with a defect.** ZZ Foe Grabbed (through the GM's client), grabbed-by recorded, no errors. **Defect:** the clock read round 2, where a Grapple Attack's reads round 3. Fixed in 3.706.1. |
| L7 | Grapple Attack success, from the player (forced) | **Pass.** Grabbed with the clock (round 3), grabbed-by recorded, the outcome card posted, no permission error. 3.705.1 threw here. |
| L8 | Vital Strike at 15 ft; Quick Draw at 15 ft (with the Broadsword sheathed) | **Pass.** Vital Strike: refused, AP 3 unchanged, "No AP was spent". Quick Draw: refused, AP unchanged, "Broadsword goes back where it was". The Broadsword is unequipped again. |
| L8b | Quick Draw of a Dagger at 15 ft | **Pass.** Thrown, a valid Strike: 1 AP. |
| L9 | Lunging Stance (1 AP; the card names the AoO reach), then the foe moves from 10 ft to 20 ft on its turn | **Pass.** An Attack of Opportunity was offered to ZZ PC Lunger, whispered to the GMs and PC Tester. The player took it: a melee Strike with no Reach −2, the reaction spent. Without the stance, the same move offers nothing. |
| L10 | Offer cards raised by the player | **Pass.** The Reactive Disarm, Disarm Block and enemy Attack of Opportunity cards were authored by the GM, whispered to the GMs only, not visible and not in the player's chat log. The GM's buttons work on each. |
| L11 | The foe's Attack of Opportunity on the player, who had moved from adjacent to 15 ft | **Defect.** The GM's button made it a thrown Club attack ("thrown 15 ft … Threw Club — that was the last one"). An Attack of Opportunity is a melee Strike. This predates 3.706.0. Fixed in 3.706.1. |

## Not driven live

These are covered by `verify-live-rulings-3706` only:

- Savage Jaw's, Knife Flurry's, Swift Pursuit's and a creature reaction move's offer cards;
- the relay refusing a creature the asking player does not own.

## Console

No error from 3.706.0's code. The only one, on the player's client, was Foundry's own `Scene.view` error, raised by the GM's "pull to scene" while the player was loading.

## Defects found, fixed in 3.706.1

- **Combat Grapple's clock** is one round on, not two.
- **An Attack of Opportunity with a Thrown-trait weapon** against a provoker that has moved beyond reach is made as a throw.
