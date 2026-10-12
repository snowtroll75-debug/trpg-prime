# TRG Prime 3.561.0 — inflicted floors, rank gates, degree upgrades

17 September 2026. Three small generic mechanisms Pillars of Faith 0.2.0 needed, each declared as data by the content that uses it and each with its own harness. Graham's rulings from the 0.1.0 live test are what drove the first.

## Inflicted condition floors

Korath (Pillars of Faith heritage): "When you successfully Demoralise a creature, its frightened condition cannot be reduced below 1 until the end of your next turn." Graham ruled it enforced, not noted.

The system already had one floor — Song Of Despair's, read from where a token stands. `conditionFloorFor` now also reads a floor CARRIED ON THE CREATURE: any active effect with `flags.trg-prime.conditionFloors: { frightened: 1 }`. Every frightened reducer asks it before writing — the recovery save already did; Rally and the Medicine card's `reduceCondition` now do too, and each says on the card when the floor is what stopped it.

The inflicting side is declarative. An item or effect on the inflictor declares `flags.trg-prime.inflictedFloors: [{ action, condition, value, rounds }]`; when a Basic or Skill Action's outcome lands that condition on a target, `applyBasicActionConditionEffects` stamps the floor on the target as its own effect (through the GM relay when the player does not own the target), with `conditionExpiresRound` set in combat. The floor and the condition have different lifetimes, which is why it is a separate document. Both outcome appliers now pass the action key through.

## `minRank` on a skill action

The core book gates actions at "trained" (1 rank). Pillars of Faith's Chapter 4 prints Rank 2 and Rank 3 on eight actions. An entry may declare `minRank: N`; `resolveAction` refuses with the skill named when the invoked skill's ranks are below it. Read from the invoked skill, so a substitution feat's "use your Perform ranks to meet the action's Rank requirement" is the ordinary case. Specialist skills, which have no rank ladder, are not gated.

## Degree upgrades from a module feat

Shadowborn Agility's "treat a Fumble as a Failure" table was the only degree rewrite. `registerDegreeUpgrades(featName, [{ actionKey, from, to }])` lets a module feat declare the same shape; `shadowbornAgilityDegree` consults the registry for every feat the actor owns after its own table, and the card's note names whichever feat did it. Keeper of Records (Compare Testaments, Partial → Success) is the first.

## Harness

`verify-condition-floors.mjs` (25) + `mutate-condition-floors.mjs` (8, all caught — two survived the first run, on a disabled-effect floor and Rally's max, and the checks were tightened). `verify-module-api.mjs` grows to 86 with the degree-upgrade registry; its mutation battery to 13. Full sweep: 311 of 311 (two mutate-chapter5-batch anchors moved with the resolver and were repointed).

## 3.561.1 (same day)

Live testing of the Korath floor: a Critical Rally (reduce by 2) against a frightened 1 target was correctly held at 1, but the card said "cannot be reduced below 1" and then "Reduces Frightened by 2 (now 1)". The card now reports the reduction actually applied ("by 0 of 2"). No rule change.
