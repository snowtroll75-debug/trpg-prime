# TRG Prime 3.630.0 — the machinery for Pillars of Faith's automation pass

8 October 2026. Requires nothing new. Pillars of Faith 0.11.0 needs this release.

Graham asked for the last of Pillars of Faith's card-only rules to be automated where the system could carry them, and for the Undead Lords campaign's bonus Archetype feat as a checkbox. This release is the core half of that. Everything here is opt-in data or a hook, so a world without the module behaves exactly as before.

## Extra feat picks a module grants
- **`registerFeatPickBonus(key, picks(actor))`** is a new module API call.
  - It is asked every time the sheet draws the feat banner, so a world setting it reads takes effect at once.
  - `picks` returns `{ label, racial?, class?, general?, archetype? }`.
- **An Archetype-only pool.**
  - `archetype` picks are spent first by Archetype feats. Any further Archetype feats draw on Class picks as before.
  - The banner shows **Bonus Archetype: x / 1** and names the campaign.
- A module function that throws is skipped. It never breaks the banner.

## Death guards, v2
- **Unconditional guards** (`auto: true`) hold with no save and no question.
- **One-use guards** (`once: true`) delete the effect that carries them when they fire.
- **"Would die" guards** (`trigger: "death"`, `heal: "1" | "half"`).
  - The reaper asks them before the skull goes on. Every death in the system passes through the reaper, including Dying past Death State, massive damage, destruction at 0 and the dying check.
  - Dying drops to 0 by the ordinary recovery (Fatigued +1), and the creature heals 1 HP or half its maximum.
  - An instant death from Doomed, Fatigue 20, Soul Drain or Constitution is not answered: its cause would still be there.
  - The damage card reads "the blow would have killed, but X answers it". The dying check card adds the same line.
- **Exceptions for 0-HP guards:**
  - `notOutright` refuses a massive-damage blow.
  - `needsDeathState` refuses a creature with no Death State.

## The declared effect (`kind: "declare"`)
- **A spell or consumable row that puts a timed effect on its target.** It carries flags from a closed list:
  - deathGuard, saveConvert, strikeRider, nextSpellDamage, fateDeclare, fumbleNoReactions.
- **A Death State bonus** (`deathState: N`).
  - When the effect ends, the death watch trims Dying to the normal Death State instead of killing.
  - `noStack` refuses a second copy.
- `rounds` gives a row a shorter life than the spell (one round for "until the end of its next turn").

## Taking away and giving back
- **`conditionRemove`** removes conditions outright, valued or not.
  - Dazzled, Stunned, Bleeding, Fatigued and others.
  - Or N Recurring Damage sources of one type (`recurringType`).
- **`restore`** gives back `hp` (through healActor), `pp` (to max less locked) or `conviction` (capped), either `all` or by a number.
- **The relief rail now accepts Dying.**
  - Relieved to 0 is a recovery.
  - A dead creature is not relieved.
- **Relief amounts may be rolled.**
  - `amount: "1d6"`, and per-choice `choiceAmounts`.
  - `targetItems` limits relief to creatures holding a named item.
- **An alchemical re-save may name either of two afflictions** (`resave: "disease|poison"`), once.
- **A `nearby` item may include its user** (`includeSelf`).
- **`counteractAffliction`** counteracts a disease or poison on the target, against its level and save DC, and deletes it on a success.
- **`counteractRoll`** rolls a Counteract (the GM enters the level) and prints the row's rung for the degree.

## Damage
- **The next spell of a type, boosted** (`nextSpellDamage`).
  - It is spent at the cast, beside the reagents.
  - It adds one of the spell's own dice (`extraDie`) or a fixed die.
  - With `ignoreResistance`, the cast's damage ignores the target's resistance to that type. This uses a cast-scoped bypass in `resolveAgainstDefences`, cleared when the cast ends and capped by a clock.
- **Condition-only weapon riders.**
  - A strike rider may carry a condition and no die.
  - `conditionRounds: 0` means until removed.
  - `conditionSave` gives a save at a stamped DC, or at a level's DC via `dcLevel`.
- **A gated once-rider is no longer spent by a blow its gate refuses.**
- **Judgement-style riders grow against a kind of creature** (`extraVs`).
- **Spell damage riders:**
  - They gain a tradition gate (`when.traditions`) and a once-a-round-overall marker (`oncePerRoundAny`).
  - A rider that lands is announced (`trgPrimeSpellRiderLanded`).
- **`registerDamageShare(key, share)`** lets a module move part of an incoming blow elsewhere. It is asked below Sacrificing Shield and above the dying machinery.

## Saves and checks
- **Save conversion may improve by one degree** (`improve: true`) using the printed list: Failure→Partial, Partial→Success, Fumble→Failure, Blunder→Fumble.
  - It may be counted (`uses`). The last use deletes the effect.
- **A declared Success** (`fateDeclare`).
  - It is offered once the dice are in and before anyone sees them.
  - It is exactly Success, and it spends the effect.
  - Rerolls are then skipped.
- **Every check's final degree is announced** (`trgPrimeCheckResolved`).
- **An escape save may carry a modifier** (`conditionSave.modifier`; warp `resaveModifier`).

## Thresholds
- **An entry check may roll a save instead of a skill.** It can also:
  - ask only creatures crossing in from outside (`crossingOnly`);
  - ask once a round (`oncePerRound`);
  - stop only hostile creatures (`hostileOnly`);
  - stop only creatures matching a gate (creature types, traits or incorporeal, any clause).
- **A rung may put the creature back outside** (`pushBack`) and bar it for the turn, N seconds or the spell (`bar`).

## Smaller things
- **Conditions:**
  - A condition row may step down after N rounds (`thenValue`, `firstRounds`). The follow-on queue now carries the escape save and no-Reactions across.
  - `noReactions` stamps the reaction gate's flag on a condition.
- **Spells and warps:**
  - `lightShift.byCasterLevel` grows the circle by caster level.
  - `chooseFrom: "savesOrRankedSkills"` offers the three saves plus the caster's ranked skills.
  - Warp `choiceExtra` buys one more pick.
  - Pending entries may be counted (`uses`) and given a span in turns. The dialog shows how many are left.
  - **`revealFact`** whispers one fact read off the target's sheet: lowest save, a resistance, weakness or immunity, its speeds, or its most unusual sense. Capability is left to the GM.
  - New warp counts: `choiceExtra`, `declareUses`, `heldUses`, `resaveModifier`.
- **Attacks and the sheet:**
  - An attacker's own effect may grant Ghost Touch while a named stance is up.
  - Spell Substitution reads `spellSubstitution: { count }` and asks for the higher Casting DC.
  - A feat may open an action to a specialist skill, registered as substitution skill `specialist:<slug>`. It is offered when that skill is rolled from the sheet.
- **Module hooks and helpers:**
  - A healing spell that overflows the target's maximum announces it (`trgPrimeOverheal`), but not for a Dying target.
  - A module may refuse an action before anything is spent (`trgPrimeActionAttempt`).
  - `trgPrimeActionResolved` now carries the check `total`.
  - New module helpers: `grantTempHP`, `activeRunesOn`, `runeMarkersOf`, `runeFrequencyAllows`, `runeUseUpdates`, `activeToken`, `distanceBetween`.

## Harness
- **New suites:**
  - `verify-automation-pass`: 88 checks.
  - `mutate-automation-pass`: 49 mutations, all caught.
- **Re-anchored to the new shapes.** The first sweep was 505/519; each failure was an anchor on a line this release changed.
  - verify-condition-relief V2: ten relievable conditions.
  - verify-save-reroll D1: Dying is relievable. F3: the rider call passes the target's kinds.
  - verify-death-watch C6 and C7: the trim is a pure `dyingTrimmedTo`, and the reap's own GM gate is pinned.
  - verify-haunt-perils F4: the resolved hook carries the total.
  - verify-strike-riders F4–F6: the spend is handed the strike's facts.
  - verify-unliving-mechanisms A11: the guard call names its new arguments.
  - verify-block37-weapons H4: the attacker's own Ghost Touch.
  - verify-chapter4 I10: a feat may add actions to the specialist row.
  - Mutation anchors in mutate-chapter4, -gated-riders, -slot-choice, -strike-riders and -unliving-mechanisms.
  - Two lines rewritten so that existing mutations stay unambiguous:
    - Writ of Restraint's escape-save modifier no longer duplicates Ball Lightning's `saveDC` anchor.
    - The declared-Success guard no longer repeats Chance's.
- **The confirming sweep is recorded in the build state.**
