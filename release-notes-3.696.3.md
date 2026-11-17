# TRG Prime 3.696.3: a Grimward's spells carry Judgement

17 November 2026. One fix, found while live-testing the last two untested Pillars of Faith entries (Graham: "please test them").

## Judgement on a Grimward spell

- **Rule.** Judgement adds +1d6 (2d6 at 9th level, 3d6 at 17th) the first time each round the Grimward damages the Subject "with a Strike or Grimward spell".
- **Found.** 3.696.0 read "Grimward spell" as a spell whose `specialistClass` is Grimward. None of the six Grimward specialist spells deal damage, so the spell half of the rider could never fire. A Grimward is a Divinity caster, and its spells include the Divinity spells it prepares.
  - **Live, 3.696.2:** a level-8 TEMP Grimward under Inquisition and Judgement cast Daze (core, Divinity) at the Subject. It dealt 11 mental damage, and no Judgement dice were added.
- **Fixed.** A new `spellCastingClasses(spellSystem, casterClasses)` in `combat/damage-riders.mjs` decides which classes a spell is cast as:
  - a specialist spell: its specialist class;
  - an innate spell (a race's, a feat's, an item's): no class;
  - any other spell: the caster's classes.
- **How it applies.** A rider with `spellClasses` admits the spell if any of these match. The cast workflow hands it the caster's class items.
- **Limitation.** The core does not record which class prepared a spell. So for a multiclass Grimward, every list spell counts as a Grimward spell.

## Also confirmed live (3.696.2 with Pillars of Faith 0.12.5)

- **Expert Autopsist.** Perform Autopsy (Medicine 8 ranks, fixed DC 5, total 24) gave a Critical. The card read "Expert Autopsist: the circumstance bonus is +4 instead of +2", and +4 was offered on the next roll.

## The harness

- **`verify-fixes-3696-0`:** 44 checks (CD12d–f replace the specialist-only check).
- **`mutate-fixes-3696-0`:** 42 mutations, all caught.
- **Every verify file was re-run on the final tree:** 0 failures.
- **Also passed:** `verify-checks-can-fail`, `mutate-damage-riders` and Pillars of Faith's `verify-audit`.
- **Version pins:** 3.696.3.

No Pillars of Faith change is needed. 0.12.5's Judgement rider already declares `spellClasses: ["Grimward"]`.
