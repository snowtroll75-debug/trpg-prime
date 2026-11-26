# TRG Prime GM / Player spell testing

26 November 2026, 02:30–03:00 UK. Test world "Test", Foundry 14.367, core 3.715.1. Modules: Eldritch Arts 0.18.3, Inner Tempest 1.1.1, Pillars of Faith 0.13.3, Codex 0.2.2, Fiends & Fables 0.46.2.

## The two sessions, at the same time

| Role | User | Origin | Owns |
|---|---|---|---|
| GM | Testing Dude (role 4) | `http://localhost:30000` | everything |
| Player | PC Tester (role 1) | `http://127.0.0.1:30000` | **only** ZZ SM Wizard |

The two origins keep separate logins in one Chrome, so both clients were connected for the whole run. The targets, ZZ SM Foe Near and Far, are NPCs with default ownership NONE. The player was given **no** extra permission to reach them.

The driver is `tools/spell-matrix/live/matrix-driver.js`, loaded in both clients. It presses the sheet's own Cast button and fills the real Warp dialog. The dice are fixed per die size on whichever client rolls them, and restored after each case.

## What each seat showed

| Check | GM | Player |
|---|---|---|
| Spell on the sheet, Cast button, Select Target, Warp?, Casting Conditions dialogs | Pass | Pass |
| Warp and Metamagic options offered (same list in both seats) | Pass | Pass |
| PP deducted at the figure the cast was charged (12 player casts; the charge itself is wrong for Temporal, see RC1) | Pass | Pass |
| Casting DC on the card | Pass | Pass |
| Save DC; save rolled and degree applied | Pass | Pass. **Note:** the NPC's save was rolled on the player's client (U11). |
| Damage written to a GM-owned actor | Pass (GM writes directly) | **Pass, through the GM relay.** HP read on the GM side: 30 → 21, 26, 8 … |
| Condition (critical injury Flat-Footed) written to a GM-owned actor | — | Pass |
| Effect on the caster with its clock (`spellEffectEnd`) | Pass | Pass |
| Overcast offer over the cap | — | Pass |
| Console errors during casts | none | none |

**No failure was role-specific.** The four failures (Reach, Distant, Temporal ×1, Temporal ×4 / with Extend) fail identically from the GM seat, so they are engine defects, not permission defects.

## Sockets and permissions

A player cast that damages and conditions a GM-owned NPC reached the server and was visible on the GM client within the 1.5 s the driver waits. No permission error or console error occurred on either client. This is the relay path that 3.645.0 F3 repaired for emanations. It is not yet tested here for areas, sustain, or effects with their own clocks on another creature.

## Cleanup

- **Deleted:** the 3 ZZ SM actors, the ZZ SM Pilot scene, and the 62 chat messages written by the two test users (no other author had written any).
- **Restored:** Caves re-activated. Dice restored in both clients; both tabs closed.
- **Unchanged:** the game is paused, there are no combats, and world time is still 96.
