# Live test: TRG Prime 3.684.3 with Eldritch Arts 0.9.1

5 November 2026. Graham's world in Chrome (localhost:30000, user Testing Dude), with 3.684.3 and 0.9.1 installed and active. All tests used throwaway "ZZ EA …" actors on a throwaway scene. Everything was cleaned up afterwards.

## Passes

All DCs below are on 10 + the shown bonuses.

**Strike DB bonuses stack by type (3.684.3):**

| Defender has | DC | The card says |
|---|---|---|
| Take Cover (standard, +4) and Aid Defensive +2 | 14 | Aid "not counted" |
| Aid Defensive +2 only | 12 | |
| Firing into melee (standard cover, +4) and Aid +2 | 14 | Aid "not counted" |

**Shooting Star against cover from firing into melee:**

| Defender has | DC | The card says |
|---|---|---|
| Cover only | 12 | the step costs −2 DB |
| Cover and Aid +3 | 13 | the step costs −1 DB; the cover is "not counted" |

**Economic Spell (3.684.3):** Fireball (6 PP) on a level 6 Wizard.

| Cast | DC | PP paid |
|---|---|---|
| Unlowered | 19 | |
| Lowered by 2, cast at 4 PP | 23 (19 + 4) | 4 (24 → 20) |

**Spellblade's Mark (0.9.1, a typed circumstance DB row):**
- The Use names the Mark and spends the Focus use. A second Use is refused until Refocus.
- Against a Strike:

  | Defender has | DC | The card says |
  |---|---|---|
  | The Mark only | 11 | |
  | The Mark and Aid +2 | 12 | the Mark "not counted" |

- Against a spell attack (Scorching Ray):

  | Defender has | DB | The card says |
  |---|---|---|
  | The Mark | 11 | |
  | The Mark and Take Cover (standard) | 14 | the Mark "not counted" |

## Findings

**F1 (bug, since 3.682.0): Shooting Star never steps down a target's own Take Cover.**
- **What happens:** a melee Strike with Shooting Star's trail against a target in Take Cover (standard) gave DC 14, with no step line on the card. It should be 12.
- **Cause:** `coverLossInDefence` (`magic/strike-edge.mjs`) looks for the cover in the DB breakdown entry whose source is `"sheet"` (the sheet's own circumstance slot). In play, Take Cover's +4 is a separate breakdown entry, whose source is the Take Cover effect's UUID. So the function always finds no cover and returns 0.
- **The harnesses missed it:** C6, D19 and D19c all built the entry with `source: "sheet"`.
- **3.684.3's review fixes** (the step made before stacking, and nothing taken from a Paralyzed DB) never run in play for the same reason.
- **Fix:** find the cover by the Take Cover effect (its UUID or name), and keep the `"sheet"` slot as a fallback. Then add a harness built from a real Take Cover entry.

**F2 (cosmetic, since 3.682.0):** when Shooting Star steps down cover from firing into melee, the card's cover line still prints the unstepped "+4 DB". The Edge line beside it gives the real loss, and the DC is right.

**Observation:** the throwaway Wizard was Dead after a test mishap, and could still cast through `castSpell` called from the console. I didn't check whether the sheet's own Cast button stops a dead or unconscious caster.

## Not run this session

The other Block 6 checks that need tokens:

- Absolute Denial and Counter Channel against an innate spell (`castPP`);
- Warlock's Hex and Xithra;
- Eternal Vigil when healed from 0 HP;
- ley lines;
- Echo, Lightning Rod, Thunderclap and Steelbinding;
- Symbiotic Witch.

## Cleanup

- **Deleted:**
  - the six ZZ actors;
  - the scene ZZ EA Test;
  - 58 test chat cards.
- **Dice and hooks:** restored and removed.
- **Graham's combat:** untouched (active, round 2, first turn, both combatants).
- **View:** back on Oldwatch Approach.
- **The game was paused before the test and is still paused.**
