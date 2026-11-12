# TRG Prime 3.684.4

5 November 2026. The two findings from the live test of 3.684.3. Built on 3.684.3.

- **Install over 3.684.3.** No migration, and no world data changes.
- **Modules:** nothing new for modules. Eldritch Arts 0.9.1, Eldritch Arts 0.9.0 and Inner Tempest 1.0.4 run on it.

## Fixed

- **Shooting Star now steps down a target's own Take Cover** (the 3.684.3 live test's F1, there since 3.682.0).
  - **Before:** a Strike with Shooting Star's trail against a target in standard Take Cover was against the full +4 (DC 14 on a DB of 10), and the card had no step line.
  - **Why:** the core looked for the cover in the sheet's own circumstance slot. Take Cover's +4 is its own entry in the DB breakdown, made by the Take Cover effect, so the cover was never found. The tests built the cover in the sheet slot, so they passed.
  - **Now:** the cover is found by the Take Cover effect itself (its ID, or its name). The sheet slot is still read when no Take Cover entry is found. The same target is now DC 12, and the card says "standard cover is lesser cover (−2 DB)".
  - **3.684.3's two fixes for this case now work in play:**
    - another circumstance bonus counts against the stepped cover. With Aid Defensive +4 the DC stays 14; with Aid +3 it is 13.
    - a Paralyzed or Unconscious target loses nothing to the step.
- **The firing-into-melee cover line on the Strike card** (F2, there since 3.682.0). When Shooting Star steps that cover down, the line now gives the stepped value: "+2 DB (Standard cover, firing into melee, stepped down to lesser cover, circumstance)". It used to print the unstepped +4. The DC was already right.

## Harnesses

- **`verify-ea-block6d-core`:**
  - **D19d:** builds the Take Cover entry through the core's own route (the Take Cover effect's changes, `applyCustomBonusChange`, the bonus pool and `resolveBonuses`), so its source is the effect's ID, as in play. It checks:
    - the cover is found by the effect's ID, by its ID on a token's actor, and by its name;
    - with no effect given, only the sheet slot is read;
    - the DB comes out 12, 14 with Aid +4, and 13 with Aid +3.
  - **D19e:** checks how `coverEntryIn` chooses the cover's entry.
  - **D19f:** pins the card line.
- **Pins re-pointed:** D19 and `verify-ea-block4-core` C6.
- **`mutate-ea-block6d-core`:** five new mutations.

## For Graham

- **A target with both kinds of cover** (from review). If a target has its own Take Cover and also has cover because the attacker is firing into melee, Shooting Star steps down only the Take Cover. The firing-into-melee cover (+4) then holds the DB up, so the step changes nothing. That is how 3.682.0 built it. Should "reduces the target's cover by one degree" step whichever cover is higher instead?

- **Still open from 3.684.2: a Strike before Agile Display's Step.** The default stands: the Step stays ready until your next turn or another basic action, so you can Strike first and still take the free Step. Should using anything else forfeit it?
