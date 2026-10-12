# TRG Prime 3.571.0 — what a module's feats need

18 September 2026. Four generic mechanisms Pillars of Faith 0.4.0 (Chapter 5, feats) asked for, on top of Graham's 3.570.1.

## Registered feat access

Chapter 5 lists, under each new race and class, the *existing* core feats it may take — "Rhevani: Self Aware, Worldly", "the Archivist also gains access to Bardic Lore, Familiar...". The racial-feat picker gates on `sourceRace` and the class-feat picker on class traits, both of which the core items name only for core races and classes, so those lists could not be honoured without editing the core pack. `registerFeatAccess(kind, ownerName, featNames)` on the module API (`kind` "race" or "class") records an access list per owner, merging repeat registrations; `hasRegisteredFeatAccess(kind, owners, featName)` answers for a comma-joined owner list the way the picker carries effective races and classes, case-blind. The `racialFeat` and `classFeat` branches of `buildPickerFilter` consult it beside their own tag test, so a registered feat appears for that owner and for nobody else, by name.

## A feat may grant a natural attack

"You gain the following natural attack: Fangs..." (Hunter's Fangs), Grafted Armament's four. Feats had `grantedSpells`, `grantedAbilities` and `grantedFeats`; `grantedWeapons` joins them in `GRANT_FIELDS.feat`, resolved from the **companions** pack — where the system keeps natural attacks, for the reason the race entry gives — so a module's pack extending `companions` is searched too. The field is on the feat template and the item sheet.

## The class-skill chooser for modules

The Priest's "choose one of these as a class skill" runs through `CLASS_SKILL_GRANTS` and `chooseClassSkill`, which a module could register into (3.5xx) but not run. `helpers.useClassSkillGrant(actor, item)` finds the registered entry by the item's name and runs the same chooser; a module archetype's Use is one line.

## Modifier ally auras

Ally auras (`flags.trg-prime.auras[{kind:"ally", ...}]`) granted advantage only. A grant may now be `kind: "modifier"` with `value` and `type`: `allyAuraConditionals` carries the figure onto the same exact-and-judged rows a traited advantage aura yields (or the single offered row of an untraited one), refuses a modifier with no usable value, and an aura may name the `actions` it reaches ("+1 status to Sense Direction"). Keeper at the Threshold, the two Lanterns and Domain of the Land are the first users.

## Harness

`verify-module-feats.mjs` (44): the access registry and the two pickers driven through the module API; the aura rows driven on plain objects; the weapon grant, the template, the sheet and the chooser structural and marked. `mutate-module-feats.mjs` — 10 mutations, all caught. Full sweep green.
