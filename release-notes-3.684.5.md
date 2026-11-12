# TRG Prime 3.684.5

5 November 2026. Graham's two answers of 5 November to the 3.684.4 questions: Shooting Star against a target with two covers, and Agile Display's Step. Built on 3.684.4.

- **Install over 3.684.4.** No migration, and no world data changes.
- **Modules:** nothing new for modules. Eldritch Arts 0.9.1, Eldritch Arts 0.9.0 and Inner Tempest 1.0.4 run on it.

## For every world

- **Shooting Star steps down the higher of a target's two covers** (Graham, asked "Should it step whichever cover is higher instead?": "Yes").
  - **Before:** when a target had Taken Cover and also had Standard cover (+4) from the attacker firing into melee, Shooting Star always stepped the Take Cover. The firing-into-melee +4 then held the DB up, so the step changed nothing.
  - **Now:** the higher of the two covers is stepped, one degree, once. The DB is the two stacked by type after that step, with Aid Defensive and the other circumstance bonuses beside them, as in 3.684.3.
    - **Lesser Take Cover (+2):** the firing-into-melee cover is stepped to lesser. DB 14 is now DB 12. The cover line says "+2 DB (Standard cover, firing into melee, stepped down to lesser cover, circumstance)", and the Edge line says "standard cover (firing into melee, the higher of its two covers) is lesser cover (−2 DB)".
    - **Greater Take Cover (+8):** the Take Cover is stepped to standard, as before. DB 18 is DB 14 (−4). The Edge line says "(Take Cover, the higher of its two covers)".
    - **Both standard:** stepping either gives the same DB (14). The firing-into-melee cover is the one stepped, so the step shows on the card's own cover line, and the card says so: "…are both standard cover; the firing-into-melee cover is the one stepped down (stepping the Take Cover gives the same DB), and the DB loses nothing."
  - **A Take Cover the DB doesn't keep is not weighed.** A Paralyzed or Unconscious target's DB keeps no Take Cover (3.684.3), so its firing-into-melee cover is the one stepped.
  - **Unchanged:** a target with only one of the two covers is stepped as before.
- **Agile Display's Step must be your next action** (Graham: "The step must be the next action, if the character does something else, the free step is removed").
  - **Before:** the free Step stayed ready until your next turn or another basic action, so you could Strike first and still take it.
  - **Now:** if you do anything else first, the Step is removed and a notice says "Agile Display: the free Step is removed — it had to be [name]'s next action." That covers:
    - anything that spends AP: a Strike, a spell, another feat's Use, a Step or Charge armed from its button;
    - any basic action, a free one too;
    - a Strike, a free one too;
    - using Agile Display again, which removes the first Step and readies a new one;
    - a feat that writes its own AP (some do, without the core's spender), when the write takes your AP below what you had after Agile Display.
  - **Unchanged:** dragging the token up to the Step's 5 ft (10 with Graceful Step or Tiger Stance) takes the Step, at no AP, provoking no reactions. A drag beyond it is refused, as before.
  - **Other compound legs are unchanged.** Only Agile Display's leg is marked as "the next action".
  - **Not caught:** a feat Use or spell that costs no AP and isn't a Strike or basic action, and a reaction that isn't a Strike or basic action. These leave the Step ready. A reaction Strike (an attack of opportunity) and a reaction-cost basic action do remove it.
  - **A basic action that is then refused still removes the Step,** as it already clears Aim. For example, a Flat-Footed character who clicks a reaction-cost basic action is refused, and the Step is gone. So is a spell whose targeting you cancel (its AP comes back, the Step doesn't).
  - **Through another feat's own AP write** (a feat that changes AP directly rather than through the core's spend), the Step goes when AP falls below what you had after Agile Display. If something has given you AP in between, such a spend can leave the Step ready.
  - **A mount and rider sharing AP:** the mount's move spends the shared AP, so it removes the rider's Step.

## Harnesses

- **`verify-ea-block6d-core`:**
  - **D19g:** `coverToStep` picks the higher cover, the firing-into-melee one on a tie.
  - **D19h–D19i:** the DB with both covers, through the real helpers and a real Take Cover entry: lesser 12, standard 14, greater 14; with Aid +3, 13, 14, 14; a Paralyzed target 12.
  - **D19j:** the Strike's wiring and the card's lines.
- **`verify-agile-display`:** N1–N10. The lapse rule; a Strike's 1 AP removes the Step but the Step's own 0-AP drag doesn't; the AP-write hook; a second Use; the wiring. L1 re-pointed for the leg's new mark.
- **Pins re-pointed:** D19, and `verify-ea-block4-core` C6 and C7.
- **Mutations:** 11 new in `mutate-ea-block6d-core`, 16 new in `mutate-agile-display`. Two anchors in 6d re-pointed.
- **`uncalled-exports.json`:** `coverEntryIn` comes off the keep list, since the Strike now calls it. `onApWriteLapse` is kept as a harness seam, because its caller is the hook in its own file.

## For Graham

- **Before Agile Display's Step:**
  - **A reaction that isn't a Strike or basic action, or a feat or spell that costs no AP.** These don't remove the Step today, since nothing in the core marks them as "an action taken". Should they?
  - **A refused or cancelled action.** As built, the Step is removed even when the action is then refused, as Aim is. Should a refused action keep the Step?
