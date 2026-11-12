# Live test: TRG Prime 3.684.5 with Eldritch Arts 0.9.2

5 November 2026. Graham's world in Chrome, with 3.684.5 and 0.9.2 installed and active. All tests used throwaway "ZZ EA …" actors on a throwaway scene, plus a throwaway combat. Everything was cleaned up afterwards.

## Passes

**Shooting Star against a target with both covers.** The attacker fires a Longbow into melee, so the target has firing-into-melee cover (+4) as well as its own Take Cover. The target's DB is 10.

| Take Cover | Cover stepped down | DC |
|---|---|---|
| Lesser (+2) | firing into melee, to lesser (−2) | 12 |
| Standard (+4), a tie | firing into melee; the card says stepping either gives the same DB | 14 |
| Greater (+8) | Take Cover, to standard (−4) | 14 |

**Lightning Rod's splash card (0.9.2):**
- The next electricity spell after the mark posts its card: "conducts — 6 electricity (1d12, half the dice, no save) to each enemy within 10 feet".
- The enemy 5 ft away took the 6.
- Both mark effects ended, and no error appeared.

**Agile Display's free Step must be the next action**, tested in a throwaway combat on the gymnast's turn.
- **A Strike first:**
  - Agile Display's Use (with no check) took AP from 3 to 2 and readied the free Step.
  - A Greatsword Strike first took AP from 2 to 1. The Step was removed, with the notice "Agile Display: the free Step is removed — it had to be ZZ EA Gymnast's next action."
  - A 5 ft move after that was an ordinary Stride and cost 1 AP (1 → 0).
- **The Step taken next:** a 5 ft drag straight after the Use cost 0 AP, and was recorded against the free Step (0 AP).
- **Note:** moving the token by script on the actor's own turn is charged as a Stride, as it is meant to be. This cost my test 1 AP once.

## Not run

- **Reactions and refused actions before the Step:** Graham ruled on these today, and they go into 3.684.6.
- **The other Block 6 checks:** Steelbinding, Echo of the Ancestors, Hex and Xithra, Absolute Denial and Counter Channel, ley lines, and Symbiotic Witch.

## Cleanup

- **Deleted:**
  - the ZZ actors;
  - the scene ZZ EA Test;
  - the throwaway combat;
  - 26 test chat cards.
- **Dice:** restored.
- **Graham's combat 4jUOgOEHj2DWK6M1:**
  - active again, on round 2, first turn;
  - both combatants are intact;
  - it is the tracker's current combat.
- **View:** back on Oldwatch Approach.
- **The game is still paused,** as it was before the test.
