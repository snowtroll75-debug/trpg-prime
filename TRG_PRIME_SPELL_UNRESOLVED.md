# TRG Prime spell testing: unresolved rulings, blockers and unverified areas

26 November 2026, core 3.715.1. These items stay visible until they are ruled or tested.

## Graham's rulings, 26 November 2026 (built in 3.716.0)

| # | Ruling |
|---|---|
| U1 | The steps: Rounds → Minutes → 10 minutes → Hours → 12 hours. 1 round steps to 1 minute, 10 minutes, 1 hour, 12 hours. Each step costs half the base PP. Shield of Faith (2 PP, 10 minutes): one step costs 1 PP and gives 1 hour; a second gives 12 hours (O1). |
| U2 | Distant Spell: only spells that affect the caster. |
| U3 | Heighten Spell: every spell. It also affects dispel and counteract. |
| U4 | Widen Spell: a radius as well. |
| U5 | Extend and Temporal do not affect sustained durations; they continue regardless. |
| U6 | Quicken Spell: as built. |
| U7 | Reach Spell: only for a numeric range. |
| U8 | A metamagic beside the spell's own warp of the same kind: refused. |
| U9 | A unique option that adds a value may be taken repeatedly (Acid Cloud's +1d6); one that does not, once (Anticipate Casting). |
| U10 | Component Mastery and Lingering Performance are automated. |
| U11 | The NPC's save is rolled on the GM's client. |
| U12 | Shape Of The Wyrm's extra attack: once. |

## Graham's answers, 27 November 2026 (built in 3.717.0)

| # | Question | Answer | Now |
|---|---|---|---|
| O1 | U1's Hours step: 12 hours or 2 hours? | "As you have built, my example should have been 12 hours for the second step not 2." | 12 hours. Unchanged. |
| O2 | Is the count carried up the ladder? | As built. | Carried. Unchanged. |
| O3 | U8 and damage. | As built. | Empower or Intensified beside a damage warp is allowed. Unchanged. |
| O4 | Automate Selective, Split, Aligned and Imposing Will? | "Should be automated." | Built: see release-notes-3.717.0.md. |
| O5 | Geas's and Pass Without Trace's warps have no mods. | "Need building." | Built: Geas's warps now roll a Will save and set the duration. Pass Without Trace's warp is now a 20-foot emanation within 20 feet, of up to 10 creatures of the caster's choice. |
| O6 | Unshakable's "(arcane only)". | "Needs checking." | Checked: a caster who is not arcane is refused that warp, and nothing is spent. |
| O7 | Extend on "until", "varies" and "see text" durations. | "Yes." | Offered. Unchanged. |
| O8 | Healer's Grace's "(max +4)". | As built. | Four purchases. The rules model now follows the ruling. |

## Graham's ruling of 27 November 2026 (3.717.0 live test)

| # | Question | Answer |
|---|---|---|
| Q1 | In the "choose who in the area" dialog, should the caster be ticked by default for a helpful area spell such as Pass Without Trace's area warp? | "Leave them unticked." No change: the caster is unticked by default, as for Missile Storm, and can tick themselves. |

## The questions as first asked (26 Nov, before the rulings)

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
| Q2 | **False Health's warp** — answered 27 Nov 2026: "it should increase the multiplier by 1 each time". Built in 3.718.2 (R-0046). | 1 spell | Answered. |
| Q3 | **Which two spells Graham already knew were wrong** — answered 27 Nov 2026: Cure's 3 AP surge and Size Alteration's weapons (both fixed in 3.718.1, R-0045). | — | Answered. |
| Q4 | **A player's Secret spell** waits for the GM to answer its conviction prompt — answered 27 Nov 2026: "Leave the secret spells as they are, that is fine." | Secret-trait spells | Answered: as built. |

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
