# TRG Prime 3.626.1 — the 0.8.0 live test's fixes

7 October 2026. Built on 3.626.0, from the Pillars of Faith 0.8.0 live test (`pillars-of-faith-live-testing-report-0.8.0.md`). Six fixes; two of them are core defects the module happened to be the first to walk into.

## Conditionals on the damage roll (combat/damage-conditionals, damage-conditionals-workflow)

`conditionals.mjs` has listed "damage" as a check type since the axes were written, and nothing read it: a weapon's damage is a Roll, not a TRGCheck, so a conditional scoped to `checkTypes: ["damage"]` matched no roll the system ever made. Found when the Vowkeeper rune's "add your class bonus to damage rolls while pursuing your vow" was declared and offered nowhere — and the module's own Rejuvenating Surge (+N status to attack AND damage) had been applying its attack half only since 0.4.0.

Now, on the hit path before the damage formula is built, `declaredDamageBonus(actor, weapon)` gathers the same sources the check engine reads (items, the actor's effects, the runes' conditionals, the ally auras in force), keeps the modifier rows scoped to damage (advantage has no meaning on a damage roll and is left out), takes the `auto` rows, offers the rest in one dialog — asked only when a row needs a person — and spends a one-shot effect that was ticked as the check dialog does. The total goes INTO the formula with the typed-pool rule (one type takes the higher; penalties of that type still apply; untyped sums), and the card says each row that counted. A Shift-click Strike takes the automatic rows only.

## A rune's secondary damage is magical (combat/attack-workflow)

The blow's `magical` answer is now decided once, as `strikeIsMagical`, and every secondary packet in the rune loop — a Flaming rune's fire, a feat rider's essence, a registered rune's Requiem, a scene's area rider — resolves as a magical source. An unguent's packet (Combustion on the blade) is as magical as the blade. Found live: Requiem II's 8 essence against a ghost "immune to mundane" resolved to 0, which is the one creature the rune is for. Graham had this on the observations list from 0.7.0's test.

## Smaller

- **Soul Ward, partly** (combat/effect-application-workflow): a Soul Drain reduced but not stopped names the ward on the card — "Soul Drain 14 (reduced by Scale (Soul Ward), 12 → 2)". It used to say the full amount was turned aside or nothing at all.
- **Last Vigil asks** (magic/item-healing-workflow): with one qualifying condition the rune's one daily use was spent without a question. It is a yes/no now.
- **A wondrous `use` describes itself** (wondrous-effects): "Past-Life Insight (Free (0 AP), 1/day)" on the sheet, not "+0"; a `note` ability says its note.
- **A wondrous spell grant carries a printed activation** (wondrous-effects, rune-spell-workflow): `castAP` on the ability reaches the granted spell the way a specific item's `activationAP` does (the Lantern of the Veil's "Engage (1 AP)").
- **A consumable's required trait gates every path** (consumable-use-workflow): the 3.626.0 gate sat inside the potion branch; an `other` (Embalmer's Black Resin) healed a living Cleric. The non-potion path now asks the user's traits for the effect's self rows and the targets' for its target rows, before anything is paid.

## Harness

verify/mutate-item-fixes-3626-1 (19/16); verify-block37-weapons I4 re-anchored on `strikeIsMagical`; the rules-have-callers backlog shrank by one (CONDITIONAL_KINDS now has a caller). Sweep green.
