# TRG Prime 3.626.0 — magic items a companion module declares

7 October 2026. Built on 3.625.1, for Pillars of Faith 0.8.0 (Chapter 11: fifteen runes, thirteen specific items, twenty-two wondrous items and relics, eight charged items, twelve magical consumables). The core's magic items are table-coded by key — NUMERIC_RUNES, EVENT_RUNES, RUNE_ACTIONS, DAMAGE_RUNES, WONDROUS_ABILITIES — because the chapter's are a table. A module's cannot be rows the system knows by name, so this release lets an item DECLARE the mechanism it uses, as data, read where the core already applies the same thing. Nothing changes for a core item.

## Runes a module registers (module-api, rune-catalogue, rune-declarations)

`registerRunes([{ key, name, traits, on, tiers | level + price | armourPrice + shieldPrice, activate, effect, note, declares }])`. A registered rune joins `runesFor(kind)` after the two books' own, so it is inscribed, parsed back from the runes field, priced and written out through the one catalogue. What it does is `declares`, read by `module/rune-declarations.mjs` while the item counts (equipped, not clothing under armour):

- `bonuses` / `conditionals` — typed bonuses and scoped offers, gathered with the core runes' (Anchored Soul, Vowkeeper's class bonus to damage, Remembrance's +2).
- `sense` — a sense while worn, through `sensesOf` (Veilwatch's Spirit Sense).
- `strikeRider` — the WEAPON's own secondary damage, with the 3.625.0 gates; a laddered rune takes its dice from the tier's row (Requiem I–III), Banishing's 2d6 on a critical. Joins `strikeRiderPackets` and the burn, keyed by rune and weapon, never spent. New gate `targetTraits` (a word of the traits line — "Undead or Unliving trait") beside `targetTypes`; the attack path hands both.
- `ghostTouch` — Exorcist, on the same path as the core rune.
- `afterStrike` — a save the struck creature makes against the wielder's Level DC after the blow, with a printed ladder and optional conditions per degree, once a round (Soulchain; Banishing on a critical). `module/rune-strike-workflow.mjs`.
- `onCritical.text` — a card line on a critical (Remembrance).
- `stabiliseAtZero` — Merciful: offered when the blow fells a creature with a Death State; a yes clamps Dying to 1 and leaves the Stabilised marker the Dying Check reads.
- `saveReroll` — an ally's shield reaction: offered from the save path after the spells, within its radius, once a day (Intercession).
- `onHealed` — relief after a Healing-trait spell heals the wearer, the steps gated by the spell's PP, only conditions held (Last Vigil).
- `soulDrainReduce` — Soul Drain GAINED is reduced before it combines, 10 under Potency III, once a minute (Soul Ward); the card says "turned aside by".
- `action` — an Activate button on the item: AP, a daily count or a Focus use, a timer effect for the minute carrying the declared `conditionals` for the wearer, and `auras` emitted from the item while its state is on (Sanctuary). A Focus rune is expended by the press and restored by Refocus (`runeState.focusExpended`; `focusRestorableItems` lists it).

Use markers on the item: `runeUsedToday` (cleared by daily preparation beside the wondrous marker) and `runeUsedAt` (world seconds, for "1/minute").

## Items that add to a heal (magic/healing-riders, magic/item-healing-workflow)

`flags.trg-prime.healingRider` on an invested wondrous item or a held rod: `maximiseDice` (Hands of Mercy's Steady Gift, two dice `maximiseDiceWith` the Lifebinder Calling, daily), `extraDice` + `oneTarget` + `ppCost` (Rod of Merciful Channeling's 1d8 for 1 PP). Offered, as the activations they are: the maximise once per cast before the first roll, the rod per healed creature until one is chosen.

## Wondrous items (wondrous-use, wondrous-effects, rune-spell-effect)

A `use` ability — `{ kind: "use", automation, activation, frequency }` — runs the `{ hint, use(actor, item, ability) }` a module registers with `registerItemAutomation`; the AP is paid and the use marked (daily, or `wondrousFocusExpended` for a Focus one, which Refocus clears) once it ran. `requiresTrait` and `requiresFeat` on any ability. A spell grant at `frequency: "focus"` carries the Focus trait so Refocus restores it, and a granted spell is looked for in every spells pack, not only the core's.

## Rods (rod-powers, dice/check)

`checkAdvantage` may name `actions` (Rod of Scholarly Recall's five) or `checkTypes` beside `subjects`; `checkBonus { checkTypes|subjects|actions, cost, value, type, scope }` buys a bonus instead (Rod of Intercession's +2 on a Counteract). Skill and Spellcraft checks both ask.

## Consumables (consumable-use, consumable-use-workflow)

`effect.choose: [{ label, effects }]` asks which before anything is paid (Vial of Sanctified Dew); `effect.requiresTrait` refuses a recipient without it (Embalmer's Black Resin); `consumable.saveReroll` on a worn consumable is offered from the save path and broken by use (Soulguard Talisman).

## Harness

verify/mutate-declared-runes (50/16), verify/mutate-item-mechanisms-3626 (27/11); re-anchored verify-block36b, verify-block37-weapons, verify-block39-conditions, verify-gated-riders. Sweep green.
