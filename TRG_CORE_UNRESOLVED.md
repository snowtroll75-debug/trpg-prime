# TRG Prime Core — Unresolved (3.697.0)

17 November 2026. Everything this audit found and did **not** close, grouped by what it is waiting on: a ruling, a core change, or something only you can do.

## Waiting on your ruling

### U1. A level drop keeps class abilities from above the new level

**Found live** (Test world, `tools/live/advancement-sweep.js`). Lowering XP keeps every class ability and class feat granted above the new level. For example:

- **Fighter** (13 → 8): keeps Weapon Supremacy (13) and Unbreakable Resolve (9).
- **Druid:** Wild Shape (3).
- **Ranger:** Swift Pursuit (6), Terrain Mastery (9).
- **Rogue:** Evasion (2), Pattern Disruption (2), Opportunist's Strike (3).
- **Crusader:** Divine Grace (2), Divine Ally (4).

Cleric, Wizard and Bard grant nothing above 1st and are unaffected. Your block-40 ruling R7 already takes back a divine aspect's bonus spells on a level drop (`pruneAspectBonusSpells`). Core 3.8 has no rule for losing levels (rules audit R6).

**Options:**
1. Take them back with a notification, like R7. Choices recorded on a removed ability are lost.
2. A sheet banner listing abilities above the character's level.
3. Leave as is.

**Recommended:** 1.

### U2. Flame Blade (rules audit R3)

Range, targets, damage die and type need a ruling before it can be built. The `conjuredWeapon` rail exists.

### U3. Inner Focus as a somatic stand-in (rules audit R2)

Implemented as no penalty and no bonus, with no somatic stand-in. Please confirm.

### U4. Ability Enhancement's four-level window (rules audit R7)

At the moment it warns rather than refuses. Please say which levels the window counts from.

## Class C entries: mechanical, not yet automated

These have a mechanic the system could calculate but does not yet. Each says what it needs.

| Entry | What it needs | Core change? |
|---|---|---|
| Magic Volley | An ammunition damage-type override for a duration | Yes |
| Metal To Wood | A timed material change on carried items (-2 attack/damage, DR -2, HP halved) | Yes |
| Misty Step, Dimensional Lock | A core teleport row (the deferred-teleport registry exists; nothing in core uses it) | Yes |
| Moment Of Renewal | A per-target "24 hours of rest" step. The rest macro is party-wide by design. | Yes |
| Divinity Purge, Mind Cleanse | A Charm/Compulsion or mind-affecting trait for the counteract row. This is the same gap as Pillars of Faith U3. | Data + ruling |
| Natural Animosity, Punishing Winds, Reverse Gravity, Telekinetic Haul, Wind Walk, Tree Shape, Dissipate Into Mist, Spectral Hand, Glyph Of Protection, Globe Of Cancellation, Disjunction, Rejoining | Scene, movement or item-level effects; partly reachable with existing rows (forcedMove, counteract, zone) | Mostly data |
| Cantrip Bearer, Spellcaster (familiar) | A familiar casting from the master's repertoire | Yes |
| Rejuvenation (familiar) | Share the master's magical healing. `trgPrimeSpellHealed` (3.696.0) can drive it. | Small |
| Animal Rage | Invoke Rage at a Critical. Held: the rage actions are not to be touched without your go-ahead. | — |
| Flame Blade | U2 | — |

The complete list, with the 79 class D (narrative) entries, is in TRG_CORE_AUTOMATION_AUDIT.md.

## Engine observations: low risk, not changed

### U5. A per-attack hook can outlive an attack that throws

`rollWeaponAttack` (`combat/attack-workflow.mjs`, around line 3540) registers a `trgPrimeDamageApplied` listener. It removes it about 200 lines later, but not in a `finally`. If anything in between throws, the listener stays for the session. It only adds to a dead local, so the result is a small leak, not a wrong number. Wrapping it needs care, because later code reads variables declared in that span.

### U6. `Hooks.once("renderDialogV2")` wiring

Five pickers wire their search and preview by hooking the *next* DialogV2 render: `pickFromPack`, memorisation, item customise, and the magic-item builder (twice). If another DialogV2 renders first (for example a module's), the wiring lands on the wrong dialog. Each handler then finds none of its own controls and returns, so the right dialog opens with its live search or preview not wired. Low likelihood. A shared helper that waits for the dialog carrying a known selector would close it.

### U7. Pack effects still use the legacy numeric `mode`

444 effect changes across the core packs store `mode` (0, 2 or 5), not Foundry 14's `type`. Foundry's data migration converts them on load, and the live world shows them working. If a later Foundry version drops that shim, they would all fall back to ADD. Re-keying the packs (with an owned-copy repair) is a mechanical job for a quiet release.

## Things only you can do

### U8. Live-test 3.697.0

The system folder is shared by every world, including your campaign world, so I haven't installed anything. Install the 3.697.0 ZIP, then run the test plan in TRG_CORE_TEST_REPORT.md in the Test world.

### U9. Inner Tempest 1.0.5 is not on GitHub

Your installed Inner Tempest is 1.0.5. GitHub's `main` and latest release are 1.0.4. The code is byte-identical; only `module.json` differs, and its download URL points at a v1.0.5 release that does not exist. Foundry's update check will therefore fail for anyone installing from the manifest.

### U10. Module checks that need your sourcebook text

These run BLOCKED, not failed, because the book text they compare against is not in the module repositories:

- Inner Tempest `verify-block5` (the IT book markdown);
- Eldritch Arts `verify-block10b`'s two page-boundary mutations and `mutate-book-extract` (`EA_BOOK_MD`).

Put the book files beside the modules, or tell me where they live, and they will run.

### U11. Inner Tempest `mutate-block8`: one mutation the core now absorbs

"Root's Trip is raised twice" no longer fails Inner Tempest's check. The core's stacking rules (one circumstance bonus of a type) now give +2 once, even with the duplicate row. That is correct behaviour, so the mutation has nothing left to catch. The fix belongs in the module's test (check the row count, not only the total). It is not a core regression.
