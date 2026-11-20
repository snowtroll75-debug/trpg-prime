# TRG Prime 3.705.0: reach for every attack action, and Lunge with any of them

20 November 2026. Follows 3.704.1. Branch `fix/feat-lunge`.

## Graham's rulings, 20 November 2026

- **Natural attacks can Lunge** (reading L2): "Yes".
- **Lunge works with any action with the Attack trait** (reading L3), not only Strike: "Yes".
- Trip, Disarm, Shove, Grapple, Shield Bash, Aid and Coup de Grace had **no reach check**: they could be used on a creature any distance away. Asked how to proceed, Graham chose **"Add reach check + Lunge"**.

## The reach check (new)

These actions are now refused, with the reason and before any AP is spent, when the target is out of reach. It works as it does for a Strike.

| Action | Reach (Core 3.7) |
|---|---|
| Trip, Shove, Disarm | Your reach. A held weapon with the Trip, Shove or Disarm trait "uses the weapon's reach (if different from your own)": a whip trips at 15 ft. |
| Grapple | Your reach. A creature you already hold is never refused ("You can Grapple a target you already have grabbed"). |
| Shield Bash | Your reach. |
| Aid Offensive, Aid Defensive | "a melee Strike against the target": your reach, or a held melee weapon's with Reach. |
| Coup de Grace | "an adjacent helpless opponent": adjacent, whatever the reach. |

- **Reach** is your own, or the pair's when mounted, as for a Strike. A Tiny creature (reach 0) must share the square.
- **No targeted token, or positional automation switched off:** nothing is measured, as for a Strike.
- **The Reach trait's −2** now applies to a manoeuvre made at the extended distance with a reach weapon, as it does to a Strike (Graham's earlier ruling). A Trip at 10 ft with a guisarme takes −2. It never applies to a Lunge.
- **Escape is not measured.** Its target is whatever holds you, which may be a Large creature 10 ft away or not a creature at all.
- **Disarm uses reach, as a reaction too** (Graham: "Yes disarm does use reach"). Reactive Disarm and Disarm Block are refused against a creature beyond reach.
- **Not measured: Guardian Defence's Aid and Offensive Parry's Shove.** They answer the creature whose attack triggered them, and their own triggers place it.

## Lunge with any attack action

Lunge's Use now asks **which action**, with Strike first:

- Strike (as before: the weapon, then the Strike);
- Double Slice and Charge;
- Trip, Disarm, Shove and Grapple;
- Shield Bash, Aid Offensive and Aid Defensive;
- Improvised Attack;
- the action feats you have: Vital Strike, Combat Grapple, Distracting Strike and Quick Draw.

The chosen action runs as itself: its own AP, gates, checks and card. While it runs it is a Lunge:

- **Its melee Strikes:** they gain the Reach trait (+5 ft) and Lunge's −1, and never the Reach −2. Double Slice's two Strikes both do.
- **A manoeuvre:** its reach is 5 ft further, unless a reach weapon already gives it more, and its check takes Lunge's −1.
- **Charge:** the Lunge is kept with the charge. Its Strike on arrival reaches 5 ft further at −1.
- **Lunging Stance:** removes the −1, as before.

A short Lunge card follows an action that actually happened. A refused or cancelled action costs nothing and posts no Lunge card.

**Not offered, and why:**

- **Coup de Grace:** needs adjacency, not reach.
- **Escape:** has no reach to extend.
- **Attack of Opportunity and the other reactions:** they are reactions, and Lunging Stance is what gives the Attack of Opportunity its reach.
- **Fight Defensively:** a stance; the Strike made in it can be a Lunge.
- **Swipe and Reverse Strike:** their targets are "adjacent foes" and "the enemies flanking you".
- **Skirmish and Striding Charge:** their Strike comes afterwards, and can be a Lunge Strike then.
- **Double Shot:** ranged.
- **Knife Flurry:** triggered when a knife lands.

**Natural attacks:** the Unarmed Strike, a claw or a bite can now be chosen for a Lunge Strike.

## Data and migration

- **Lunge's note** now reads "Use: choose an action with the Attack trait …". There is one new declared fix (`lunge-note-3705`); the 3.704.1 row is retired to it.
- **Owned copies:** an owned Lunge note from 3.703.1, 3.704.0 or 3.704.1 is repaired straight to the new wording. A GM's own edit is kept.
- **Migration:** the owned-effect migration and the schema are at 3.705.0.

## Code

- **New: `combat/action-reach.mjs`.** `ACTION_REACH`, `actionWeaponExtension`, `actionReachVerdict` and `actionReachRefusal`, all pure.
- **New: `combat/lunge-scope.mjs`.** `withLunge` and `lungeScopeFor`: a Lunge in scope for one action, on this client, always cleared.
- **`combat/action-workflow.mjs` (`resolveAction`):**
  - the reach check, with a new `reachExempt` option;
  - the Reach −2 and Lunge −1 rows;
  - Charge passes its Lunge to `armCharge`.
- **`combat/attack-workflow.mjs` (`rollWeaponAttack`):** a melee Strike made in a Lunge's scope takes the Lunge's terms. A reaction Strike does not.
- **`combat/charge-workflow.mjs`:** the charge record carries the Lunge, and its Strike uses it.
- **`combat/action-feats.mjs`:** `lungeWeapons` admits natural attacks; there is a new `lungeActionOptions`.
- **`combat/action-feats-workflow.mjs`:** `runLunge`.
- **Guardian Defence's Aid and Offensive Parry's Shove** pass `reachExempt`. The Disarm reactions don't.

## Harness

- **New:** `verify-lunge-actions-3705` (65 checks; R reproduces the missing check) and `mutate-lunge-actions-3705` (26 mutations).
- **Updated:** `verify-lunge-3704` (natural attacks, `runLunge`, the third note) and `mutate-lunge-3704`.
- **Pins** raised to 3.705.0.

## Testing

**Core: all 775 scripts run.**

- **First sitting:** 471 passed before it was stopped to make the Disarm change. Its only failures were the pairs of five source checks pinned to the exact shape of `resolveAction`'s options and `rollWeaponAttack`'s opening. Those were widened for `reachExempt` and the Lunge scope:
  - `verify-block5-core` G1;
  - `verify-block6-core` C10;
  - `verify-fixes-3669-1` C4;
  - `verify-ea-block3b-core` W24;
  - `verify-it-fixes-3668-1` C7.
- **Second sitting:** everything not yet run, plus everything touched since. That is every verify/mutate pair reading the reaction workflows, the action-feat files, the migration or the schema, the five re-anchored pairs and the whole-tree checks. **355 of 355 pass**, including `verify-no-undefined-names`, `verify-rules-have-callers` (backlog unchanged at 505), `verify-checks-can-fail` and `verify-checks-read-source`.
- **The two long mutation files:** `mutate-fixes-3685-3b` (56 min) and `mutate-checks-read-source` (51 min) both pass.

**Modules:** Pillars of Faith 0.12.6, Inner Tempest 1.0.4 and Eldritch Arts 0.17.2 give identical results on 3.705.0 and on the untouched 3.703.1, script for script. 90 run, 74 pass on both, and the same 16 fail on both (module version pins, blocked book text, known module-side survivors). No module calls a reach-checked action.

**Pack:** a record diff against 3.703.1 shows exactly the two note effects changed (`description` only), with every ID unchanged. The other 30 packs are byte-identical.

**Live Foundry: not yet run for 3.705.0.** What to check:

- a Trip at 10 ft without a reach weapon is refused, with no AP spent;
- the same Trip with Lunge succeeds at −1;
- Lunge → Double Slice at 10 ft: both Strikes at −1;
- Lunge → Charge: the Strike on arrival at 10 ft;
- a Grapple on a creature you already hold;
- Coup de Grace at 10 ft is refused;
- Reactive Disarm against a fumbler beyond reach is refused;
- the migration updates the Lunge note.
