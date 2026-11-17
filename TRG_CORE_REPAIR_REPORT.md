# TRG Prime Core — Repair Report (3.697.0)

17 November 2026. Branch `audit/fixes` (from `main` at 3.696.3, commit c1c33d9). Rules reference: TRG Prime Core 3.8.

Every defect below was found by this session's audit, checked against the Core 3.8 text, repaired at the shared mechanism where one existed, and covered by `tools/verify-audit-3697.mjs` (35 checks) and `tools/mutate-audit-3697.mjs` (32 mutations, all caught).

## How the defects were found

- **`tools/audit-inventory.mjs`** (new) measured the machinery behind all 1,992 core compendium entries. 118 had none. Each was read against its pack text and Core 3.8; most are narrative (class D, see the automation audit). The rest are below or in TRG_CORE_UNRESOLVED.md.
- **The familiars pack's own notes** were then compared with the code. Five items said "Applied automatically" or "press Use", and no code answered.
- **A live advancement sweep** (`tools/live/advancement-sweep.js`, Test world) levelled every core class 1→20→1. It found one design question (U1 in TRG_CORE_UNRESOLVED.md) and no defect.

## Repairs

### R1. Fast Movement (familiar ability) did nothing

| | |
|---|---|
| **Rule** | "Your familiar's movement types increase their speeds by 15 feet." (Core 3.8, Familiar abilities) |
| **Found** | The item's note says "Applied automatically", but its effect has no change and no rule reads it. A familiar with Fast Movement moved at 25 ft. |
| **Root cause** | Engine: nothing reads the ability. The familiar derivation reads Tough and Resilience by name, and nothing else. |
| **Repair** | `familiarSpeedEntries(abilityNames, movement)` in `familiar-derive.mjs` adds +15 untyped to each speed the familiar has (`speedBase > 0`). Actor preparation pools it with the familiar's other bonuses, before movement resolves. It gives no speed the familiar lacks. |
| **Test** | verify-audit-3697 A1–A6. Mutations: no base check, wrong value, wrong name, typed bonus, never pooled. |

### R2. Four familiar abilities promised a Use button that did not exist

| | |
|---|---|
| **Rule** | Energy Resistant ("resistance to one energy type"); Ability Enhancement ("increase any one ability score by 1 … selected multiple times but never more than once every four levels"); Speak in Tongues ("any one language that you know"); General Adeptness ("any one general feat … GM discretion"). |
| **Found** | Each item tells the player to "press Use to choose". `FEAT_AUTOMATION` had no entry for any of them, so Use did nothing. Confirmed live against the 3.696.3 client's `FEAT_AUTOMATION` table. |
| **Root cause** | Data and code disagreed: the notes were written, the handlers never were. |
| **Repair** | Four `FEAT_AUTOMATION` entries in `feats-workflow.mjs`, built from existing patterns (Warding's resistance chooser, `replaceFeatEffect`, `pickFromPack`, `actorLanguageState`):<br>• **Energy Resistant:** a resistance effect on the familiar (acid, cold, electricity, fire or sonic). It can be changed.<br>• **Ability Enhancement:** +1 into the chosen score's untyped slot, one effect per copy of the ability. A card warns when the number of copies needs checking against the four-level limit.<br>• **Speak in Tongues:** picks from the master's known languages and replaces its own earlier pick.<br>• **General Adeptness:** a federated general-feat picker. The feat carries `grantedBy`, so it leaves with the ability. |
| **Test** | verify-audit-3697 B1–B5. Mutations: each name, immunity for resistance, base for other, the old pick kept, any feat offered, no `grantedBy`. |

### R3. Spell Battery never paid for a cast

| | |
|---|---|
| **Rule** | "Your familiar acts as a +1 Spell Adder allowing you to cast any one spell from your repertoire each day with no power point cost. Your familiar must be within 30 feet of you." |
| **Found** | The ability that defines the Spell Adder was never read. It sits on the familiar actor, and `spellAdderSources` reads only the caster's own items. |
| **Root cause** | Engine: the carrier list stopped at the caster's own items. |
| **Repair** | `familiarSpellAdders(familiars, {distanceTo})` in `magic/spell-adder.mjs` rates each familiar carrying Spell Battery at +1. It joins the caster's other adders through `withWondrousAdders`. The cast measures token to token (`distanceBetween`); more than 30 ft gives nothing. When no distance can be measured, the familiar counts and the label says the range is the table's to check. |
| **Test** | verify-audit-3697 F1–F5. The block 9c check H23 was re-anchored to the new line. |

### R4. Changing Lungs did not stop drowning

| | |
|---|---|
| **Rule** | "You can breathe freely when underwater or in areas with a poisonous or toxic atmosphere for the duration of the spell." |
| **Found** | The spell had no rows, so the caster's breath clock still ran. Water Breathing has automated the same rule since 3.617.0, with the `waterBreathing` marker the drowning workflow reads. |
| **Root cause** | Data: the existing rail was never used. |
| **Repair** | Pack `system.effects`: `[{marker waterBreathing, self}, {note: the toxic-atmosphere half}]`. Declared in `tools/data-fixes.json` (pack) and `module/data/pack-repairs.mjs` (owned copies), as the pack-repairs header requires. |

### R5. Long Arm could not raise reach

| | |
|---|---|
| **Rule** | "Your arms temporarily grow in length, increasing your reach with those limbs by 5 feet." The only core entry that raises reach. |
| **Found** | No rows. And no rail: actor preparation sets `combat.reach` from size **after** effects, so an effect on reach is overwritten. |
| **Root cause** | Engine (reach was not poolable) and data. |
| **Repair** | A new marker, `longArm`, registered in `magic/markers.mjs` with its reader. The size line adds `LONG_ARM_FEET` (5) while the marker lasts. The pack row and the owned-copy repair are declared as in R4. |

### R6. Inner Focus did not waive the no-focus penalties

| | |
|---|---|
| **Rule** | "You do not need to provide focus spell components and take no penalty for not using your Spell Focus item." Casting Focus (p.239): -2 circumstance to casting without the focus, and +10 to the Fumble Roll. |
| **Found** | No rows. A focus caster without the focus took both penalties anyway. |
| **Repair** | A new marker, `innerFocus`. Actor preparation sets `magic.focusIllusory`; `focusCheckModifier` returns no modifier and `focusFumblePenalty` returns 0. No +1 is given, because no focus is held (rules audit R2). |

### Shared consequences of R4–R6

- **The migration.** `TRG_SCHEMA_VERSION` and the pack-copy pass are re-gated to 3.697.0. A world past 3.666.1 still repairs owned copies of the three spells. `verify-pack-repairs` F1b holds this. `verify-session-fixes-1022` C8 now accepts a gate at 3.666.1 **or later**; it had pinned exactly 3.666.1.
- **Version pins.** 54 harness files move from 3.696.3 to 3.697.0, as at every release. The four mutation anchors on the schema stamp, and `package-lock.json` (which had stayed at 3.694.0), move too.

## Harness and tooling added

| File | What it does |
|---|---|
| `tools/regression-suite.mjs` | **The system-wide regression suite** (Graham's requirement 2). It runs the whole core sweep, then every Pillars of Faith, Inner Tempest and Eldritch Arts verify and mutate file against the working core (`TRG_PRIME_ROOT`). Results are kept per suite, so it carries on after a killed process, and a core change re-runs every module. It feeds modules a fresh core spell dump, retries once on a locked pack, and reports checks that need sourcebook text as BLOCKED, never as passing. |
| `tools/audit-inventory.mjs` | The measurement behind the automation audit. |
| `tools/live/advancement-sweep.js` | A console script for a **test** world: every class levelled 1→20→1 and compared with its table. It refuses to run in a world whose title does not say test or audit. |
| `tools/declare-audit-3697.mjs` | The three pack corrections, declared old → new. |
| `tools/verify-audit-3697.mjs` / `mutate-audit-3697.mjs` | 35 checks / 32 mutations. |

## Not changed, deliberately

- **Class abilities kept after a level drop:** awaiting Graham's ruling (U1).
- **Rage:** Animal Rage depends on the Invoke Rage action, which is held from changes by Graham's standing instruction.
- **The 23 `apply-data-fixes` refusals:** each is a later, deliberate change superseding an earlier declared fix (for example Word of Death's flat ladder). They are unchanged from 3.696.3 and are reported, not forced.
