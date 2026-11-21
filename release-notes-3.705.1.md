# TRG Prime 3.705.1: Lunge, revised

20 November 2026. Follows 3.705.0. Branch `fix/feat-lunge`.

## Graham's revised feat

> **LUNGE** · MARTIAL ROGUE. You can strike foes that would normally be out of reach. Prerequisites BAB +2. Requirements You are wielding a melee weapon. Using your melee weapon, you may take an action with the attack trait. This action gains the reach trait for that Strike.

Graham, 20 November 2026: "the Lunge feat should apply the reach trait rather than a -1 circumstance penalty."

Asked whether the Reach trait's own −2 at the extended distance then applies, he chose **"Reach −2 at extra 5 ft"**. Lunge is exactly the Reach trait. This replaces the earlier ruling "-1 only for lunge" (3.704.1 to 3.705.0).

## What changed

- **No −1.** A Lunge has no penalty of its own.
- **The Reach trait, whole:**
  - against a foe within your normal reach, no penalty;
  - in the extra 5 ft, the trait's **−2**, as for a glaive.
  - This applies to every action a Lunge is made with: a Strike, both Strikes of a Double Slice, a Charge's Strike on arrival, Trip, Disarm, Shove, Grapple, Shield Bash, Aid and the action feats.
- **Lunging Stance negates the −2.** It's the penalty "associated with performing standard Lunge strikes", so a Lunge in the stance has no penalty at all.
- **Cards and notes** say so:
  - Lunge's card: "The Reach trait's -2 applies when the target is in the extra 5 ft".
  - Lunging Stance's card: "Lunge: no Reach -2 while this stance is up".

**Example:** a Medium fighter with a longsword Lunges at a foe 10 ft away. The Strike is at −2 (Reach). In Lunging Stance it's at 0. Against an adjacent foe it's at 0 either way.

## Data and migration

- **The feat's own text:** Graham's revised wording. "This strike is subject to a -1-circumstance penalty" is removed:
  - in the pack, by a declared fix (`lunge-description-3705-1`);
  - on owned copies, by a `PACK_REPAIRS` row. Old values are matched, so a GM's own edit is kept.
- **The notes:** Lunge's ("It gains the Reach trait: 5 ft further, at the trait's -2 when the target is in that extra 5 ft (none in Lunging Stance)") and Lunging Stance's ("a Lunge's Reach -2 is negated"):
  - new fixes `lunge-note-3705-1` and `lunging-stance-note-3705-1`, with the earlier rows retired to them;
  - owned copies at any earlier wording go straight to the new one.
- **Migration:** both the pack-copy pass and the owned-effect pass are re-gated to 3.705.1, and the schema is stamped 3.705.1. A world at 3.705.0 is offered the migration once.

## Code

- **`combat/action-feats.mjs`:** `lungeStrikeTerms` returns no modifier row, and waives the Reach −2 only in Lunging Stance.
- **`combat/action-reach.mjs`:** the Reach −2 at the extended distance applies to a Lunge as to a reach weapon.
- **`combat/action-workflow.mjs`:** the −2 row is skipped when the Lunge's stance waives it.
- **`combat/attack-workflow.mjs` and `combat/charge-workflow.mjs`:** the Lunge's waiver is passed on, and no longer always set.
- **Wording:** cards and comments in `action-feats-workflow.mjs`, `feats-workflow.mjs` and `lunge-scope.mjs`.

## Harness

- `verify-lunge-3704`: 72 checks (E: no −1, −2 outside the stance; H0, H0b: the new chains and the feat's text). `mutate-lunge-3704`: 24 mutations.
- `verify-lunge-actions-3705`: 66 checks (A4, A5, A5b; E5, E9, E10). `mutate-lunge-actions-3705`: 27 mutations.
- Pack-copy gate anchors in three mutation files, and the version, schema and gate pins, raised to 3.705.1.

## Testing

- **Core: 495 scripts.** That is every verify/mutate pair reading a changed file (the action-feat files, `action-reach`, `lunge-scope`, the action, attack and charge workflows, `feats-workflow`, the pack repairs, the migration and the data fixes) or carrying a 3.705.1 pin, plus `verify-no-undefined-names`, `verify-rules-have-callers`, `verify-checks-can-fail` and `verify-checks-read-source`. **495 of 495 pass.**
- **The two long mutation files:** `mutate-fixes-3685-3b` (56 min) and `mutate-checks-read-source` (50 min) both pass.
- **Not re-run:** the other 278 core scripts, which read nothing this change touched. They passed on 3.705.0.
- **Modules:** not re-run. Nothing a module calls changed since 3.705.0, whose results were identical to 3.703.1.
- **Pack:** a record diff against 3.703.1 shows exactly three changes: the Lunge feat's `system.description`, and the two note effects' `description`. Every ID is unchanged, and the other 30 packs are byte-identical.
- **Live Foundry: not yet run for 3.705.1.** What to check:
  - a Lunge Strike at 10 ft shows "Reach (attacking at 10 ft) −2" and no Lunge row;
  - the same against an adjacent foe shows no penalty;
  - in Lunging Stance at 10 ft, no penalty;
  - a Lunge Trip at 10 ft takes −2;
  - after the migration, an owned Lunge shows the new text and note.
