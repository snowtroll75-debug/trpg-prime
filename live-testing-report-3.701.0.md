# Live testing report: TRG Prime 3.701.0

19 November 2026, Graham's Test world at localhost:30000, as Testing Dude (GM). Foundry 14.367.

**Installed modules:** Fiends & Fables Prime 0.46.2, TRG Prime Codex 0.2.2, Eldritch Arts 0.17.2, Inner Tempest 1.0.5, Pillars of Faith 0.12.5, and trg-alchemist-maps and Dice So Nice.

**Result: pass.** One presentational point is noted under "Observations".

## Migration

The world reported schema 3.699.0 and offered the TRG Prime World Migration once. Before accepting it, I set up three cases: a stale spell copy, a hand-edited copy, and a stale Storgar note.

| Check | Result |
|---|---|
| Valmorius 2's stale Misty Step ("Teleportation, Translocation") | Repaired to "Movement, Teleportation, Translocation" |
| Valmorius 2's Dimension Door ("Move, Teleportation, Translocation") | Repaired to "Movement, Teleportation, Translocation" |
| A hand-edited Slide ("…, Homebrew") | Left alone, and listed by name under "Left alone" on the migration card |
| Fly and Mage Hand (ruled out) | Unchanged |
| An owned Storgar "rooted" note with the old wording | Updated to "Rolled for you when the spell is cast" |
| Schema after migrating | 3.701.0 |
| Compendium copies | Misty Step, Slide, Teleport and Gust carry Movement |

## The Storgar flat check

The casters were three copies of Valmorius 2 (an Archmage): a friendly Storgar, a friendly ally and a hostile enemy. The flat-check die was forced to a pass or a fail where noted. The Spellcraft roll was left alone.

| Cast | Expected | Result |
|---|---|---|
| Storgar's own Misty Step, no targets, die not forced | Flat check rolled | DC 5 rolled after the Spellcraft success. Passed (17): "passes the DC 5 flat check… The spell takes hold" |
| Storgar's own Misty Step, forced fail | Doesn't work; PP stays spent | Rolled 2: "Misty Step does not work on MT Storgar Mage… Leave the token where it is". 6 PP spent |
| Ally's Slide on the Storgar, forced fail | Rolled by the Storgar; doesn't work on them | Rolled 2: "Slide does not work on MT Storgar Mage". PP spent (2, critical) |
| Enemy's Slide on the Storgar, forced fail | Not rolled | No flat check; the cast resolved normally |
| Storgar's Teleport targeting only the ally ("you and up to 4") | The Storgar caster rolls too | Rolled 2: "Teleport does not work on MT Storgar Mage". The ally stayed targeted |
| A failed Spellcraft cast (Teleport) | No flat check | None rolled ("The spell fails") |

## The Storgar +2 on saves

| Cast | Result |
|---|---|
| Enemy's Gust (60-ft line) catching the Storgar | Fortitude save vs DC 18 carried "Storgar Race +2" automatically. The total was 19, a success; without it, 17 would have failed |

## Quickened "for Move" (the installed code)

`useKindsOf` from the installed system:
- Swim (Movement) → move
- Stand (Movement) → move
- Climb (Move) → move
- a Strike (Attack) → strike

## Skirmish (3.700.0)

Tested in combat on the ally's turn, with an equipped Scimitar and the enemy adjacent.

| Check | Result |
|---|---|
| Use Skirmish | 1 AP spent (3 → 2). The card reads "strikes and steps — both for 1 AP, in either order", with a "Strike: Scimitar" button. A free Step was armed |
| Step 5 ft | No AP charged (still 2). The armed Step was used up |
| Press "Strike: Scimitar" | The target dialog was pre-filled with the enemy. The Strike rolled (a miss) at no further AP, and the button was disabled afterwards |

## Observations

- **A failed flat check shares a card with "The spell takes effect."** On a failure, the result card still opens with that line from the Spellcraft outcome, just before "… does not work on [Storgar]". Every fact on the card is right, but the order may read oddly at the table. This is a possible wording change for later; I've made no change.
- **Fixture setup only:** Teleport (12 PP) needs a component pouch and a caster level of 11 or more. The fixture was raised to level 12 for the test.

## Clean-up

- **Deleted:** the five fixture actors (MT Storgar, MT House, and the three MT mages), their tokens, the combat and Gust's template.
- **Restored:** the flat-check and notification wrappers.
- **The world as left:** Kharon, Valmorius and Valmorius 2, with the scene's original seven tokens, paused on Caves, schema 3.701.0.
- **Valmorius 2:** his Misty Step and Dimension Door copies now carry Movement, from the migration.
