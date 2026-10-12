# TRG Prime 3.564.0 — declared strike riders; conditionals that scale

17 September 2026. Two rulings from Graham on Pillars of Faith 0.3.0's Grimward, both shipped as generic mechanisms.

## Declared strike damage riders

"Judgement secondary damage should be automated." The Ranger's Precision Hunter — once per round, the first time you damage a particular creature with a Strike, extra dice — was wired by name through ranger.mjs and three points in the attack workflow. `combat/damage-riders.mjs` (pure) makes the same shape data: an effect declaring `flags.trg-prime.strikeDamageRider { dice, label, targetUuids?, oncePerRound? }` has its dice added to the damage formula of a Strike that qualifies — against one of the named creatures (or any, when none are named), and not again this round once burnt — in the weapon's own damage type, through the same DR/resistance pipeline, with a card line per rider. The marker map `damageRidersUsed` burns on the hit and clears with the round beside `precisionHunterUsed`. The standalone damage dialog (no target known) does not read riders. Pillars' Judgement is the first user; a spell's or feat's "extra damage against X" can be the next without code.

## Scaled conditional values

"Remove that step (players will forget)." A conditional modifier may say `valueFrom: "classBonus" | "level" | "halfLevel"` (optionally `sign: -1`) instead of `value`, and both collection sites — the roll dialog and the automatic path — hand `collectConditionals` the actor's current figures (`scalingFor(actor)`), so the number is right at every roll and never baked. A `valueFrom` the scaling does not carry drops the entry, as any malformed entry does; a literal `value` is untouched. Pillars' Inquisition ("add your class bonus") is the first user.

## Harness

`verify-damage-riders.mjs` (31): the riders driven on plain objects — target filter, once-per-round burn and reset, formula fragment, disabled/malformed effects — the scaled value under three figures, an unknown source, a zero, a penalty, a literal beside it; the wiring structural and marked. `mutate-damage-riders.mjs` — 10 mutations, all caught. Full sweep green.
