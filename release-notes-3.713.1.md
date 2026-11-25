# TRG Prime 3.713.1 — a spell of several traditions is cast in its caster's

25 November 2026. Branch `feature/ea-block11-seams`, on 3.713.0. Not published.

## What changes

Graham's ruling of 25 November 2026, made for Eldritch Arts' Heritage of the First Weave (audit A11-16):

> "The spell should match the caster's tradition when multi-realm is present. So a Brawn spell (has three traditions) cast on an Ascendan by an ethereal caster would not be subject to Forbidden Magic. The same spell cast by a verdant would be subjected to it."

Until now, a save against a spell was told every tradition the spell lists. So Fear (arcane, divinity, ethereal, verdant) cast by a Wizard still gave an Ascendan Forbidden Magic's −2, and still asked Heritage of the First Weave.

From 3.713.1, when a spell lists **two or more** traditions and the **caster's** tradition (`system.magic.tradition`) is one of them, the target's save is told **only the caster's**. A Wizard's Fear is arcane; a Druid's is verdant.

It is unchanged when:
- the spell has one tradition;
- there is no caster (a trap, a scroll's own effect, an unknown source);
- the caster's tradition is not among those the spell lists (an item, a granted spell). It keeps every listed tradition, as before.

**High Magic is unchanged:** it still counts as every tradition (Q58), and Unbound still spares (Q59).

## Where

- `module/magic/high-magic.mjs`: `spellSaveTraditions(target, spellData, cast, caster)` takes the caster. The rule is the internal `castTraditions`.
- `module/magic/cast-workflow.mjs` (a spell's save) and `module/magic/spell-effects.mjs` (a spell's follow-up save) pass the caster.
- Sanctuary and Visage of Horror (`combat/sanctuary-gate.mjs`) pass none, so they are unchanged.

Everything that reads a save's traditions follows: Forbidden Magic's −2, the Ascendan's Will save against beneficial magic, and modules' tradition-scoped reactions (Eldritch Arts' Heritage of the First Weave).

## Also

- `tools/mutate-spellbook-rename.mjs`: one mutation's anchor had been re-pinned to `runIf("3.713.0"…)` with the version. The migration reads `runIf("3.712.4"…)`. Restored.
- Version pins moved to 3.713.1.

## Tests

- `verify-ea11-seams`: 30 checks (new D1–D4).
- `verify-ea-block5a-core`: 67, with H14 new; H11 and H12 accept the caster argument.
- `mutate-ea-block5a-core`: 48 caught, with a new "a multi-tradition spell keeps every tradition again" mutation.
- `verify-no-undefined-names`, `verify-rules-have-callers` and `verify-release-links` are green.
- **The full verify sweep, all 404 files, is green.** In parallel 45 failed from compendium-lock contention; each passed when rerun alone. `verify-checks-read-source` needs about 15 minutes, and passed.
- Inner Tempest 1.1.1 and Pillars of Faith 0.12.6 gave the same results as on 3.713.0: 13 pass, and 10 that cannot run here (book sources absent).
