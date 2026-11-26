# TRG Prime spell testing: unresolved rulings, blockers and unverified areas

26 November 2026, core 3.715.1. These items stay visible until they are ruled or tested.

## Rulings needed (they decide how a repair behaves)

| # | Question | Where it bites | Engine today |
|---|---|---|---|
| U1 | **Temporal Extension:** what does a step *be*? Is "1 hour → Hours to Half-Day Intervals" 1 half-day (12 hours), or something else? And can a duration of 8 hours, 1 day or "until your next daily preparations" step at all? | RC1; 444 durations | Steps are text only; the clock is unchanged. |
| U2 | **Distant Spell:** is "a spell that only affects you" every spell with no Range, no Targets and no Area (148 in the pack), or a narrower list? | RC3 | Never offered. |
| U3 | **Heighten Spell** on spells with no save. The feat says "more difficult to dispel (and potentially resist)". Should it be offered for its dispel/counteract effect alone? | 482 spells | Offered only on save spells. |
| U4 | **Widen Spell** on areas printed as "radius". The feat names burst, emanation and spread. Is a radius a burst? | 83 spells | Offered. |
| U5 | **Extend / Temporal** on "until…", "sustained", "varies" and "see text" durations. Limited or not? | 117 / 111 spells | Offered. |
| U6 | **Quicken Spell** on casting times that are not AP (minutes, Reaction, "1-3 AP"). | 122 spells | Offered only where the cast AP is a number above 1. |
| U7 | **Reach Spell** on "planetary", "unlimited", "varies". | 12 spells | Offered. |
| U8 | **"Specific warping options always override the generic"** (l.20042). With a spell warp and a metamagic of the same kind (a duration warp and Extend), should the metamagic be refused, or charged and ignored as now? | 392+ combination cases | Charged, ignored. |
| U9 | **Repeats.** The book says each unique option "may be selected multiple times". The engine draws 134 warps as single checkboxes because a second purchase changes nothing ("the duration becomes …"). Confirm that reading. | 134 warps | Once. |
| U10 | **Which note-only metamagic should be automated** (RC4)? Component Mastery and Lingering Performance read as table rulings by design (see the note-honesty comment in `metamagic.mjs`). Widen, Selective, Split, Aligned and Imposing Will have mechanical effects the cast could apply. | RC4 | Notes. |
| U11 | When a **player's** spell targets a GM-owned NPC, the NPC's save is rolled on the player's client and written through the GM. Intended? | all save spells | As described. |
| U12 | **Shape Of The Wyrm**'s "gain an additional natural attack (available to your type)" prints no ceiling. The engine applies the other Shape spells' "max two". | 1 spell | 2. |

## Blockers

- **Module spells are not yet in the generator.** Eldritch Arts (130), Pillars of Faith (75) and Inner Tempest (25) are installed in the Test world, but their packs are not in this repository. The generator already reads exports from `tools/spell-matrix/data/modules/*.json`; the export step from the running world is next.
- **Long tool calls.** A browser call times out at 45 s. Live cases run one or two per call, which is what bounds live throughput (about 1 case a minute per role). A batch runner that writes its results into the world, to be read afterwards, would lift this.

## Not yet verified (live coverage is a pilot)

Live: **19 role-cases of 298,098**, on 2 spells, one caster profile (Wizard, level 10), out of combat.

The calculation layer covers every generated case, but it proves numbers only, not effects. Untested live:
- **Every other spell.** Every cantrip, specialist, innate and focus cast. Every class other than Wizard.
- **Combat:** AP costs (Economic's +1 AP, Quicken's −1), turn and round advancement, sustaining, expiry and cleanup, dismissal, reloads and scene changes.
- **Damage outcomes:** resistance, immunity and weakness; area spells, multiple targets, friendly targets.
- **The feats that act during or after the roll:** Variable Success, Warp Manipulation, Conductive Healing, Effortless Spell, Component Savant, Echoing Performance.
- **The ability term of the Save DC.** The test Wizard's casting ability read as 0, so that part of the formula is unverified live.
- **The 94 mechanical warps with no structured mods** (RC9).
