# TRG Prime 3.716.0: Metamagic does what it charges for

26 November 2026. Branch `fix/spell-metamagic-rulings`, on top of 3.715.1 (`fix/skill-tumble`).

- **Install over 3.715.1.** The world is offered one migration: the pack-copy pass, re-gated to 3.716.0. It repairs owned copies of the seven spells whose warps changed (below), and leaves house-ruled copies alone, as always.
- **Modules:** nothing new is needed. Inner Tempest 1.1.1, Eldritch Arts 0.18.3 and Pillars of Faith 0.13.3 run on it. Their metamagic folds after the core's, as before.

## Where this came from

The spell matrix (`tools/spell-matrix`, 26 Nov) checked every core spell's Warping and Metamagic configurations against the book. Three defects were confirmed live from a GM and a Player client at once. Graham then ruled U1 to U12 the same day. This release builds those rulings and the defects that needed no ruling.

## Changed

| | What | Before | Now |
|---|---|---|---|
| U1 | **Temporal Extension** | The card said the duration stepped up; the effect's clock kept the printed duration (Mage Armour still ended after 1 hour). It sold 4 steps from anywhere. | The ladder is Rounds → Minutes → 10 minutes → Hours → 12 hours. 1 round steps to 1 minute, 10 minutes, 1 hour, then 12 hours, and the stepped duration is the one the clock reads. Only the steps left are sold: one from Hours, none from 12 hours. A day, an "until" or a rolled duration is not on the ladder, and is not offered. |
| U2 | **Distant Spell** | Never offered. It asked for a range of "self", which no spell prints. | Offered for every spell that affects only the caster (no Range, Targets or Area). The range becomes touch, and the effect moves to the creature touched, as Invisibility's own touch warp does. |
| U3 | **Heighten Spell** | Save spells only. | Every spell. A heightened cast's effects stand at your maximum PP when somebody counteracts them; the Counteract dialog opens with that number. |
| U4 | **Widen Spell** | Offered on a radius, but only a note. | Doubles the area: a 20-foot radius becomes 40 feet, the template included. |
| U5 | **Extend and Temporal** | Offered on sustained spells. | Not offered: a sustained spell continues regardless. |
| U7 | **Reach Spell** | A note. The range was not doubled, so a cast at 45 ft with a 30-ft range was refused. | Doubles a numeric range before the range check. It is not offered for planetary, unlimited or varies. |
| U8 | **Same-kind pairs** | Both were charged, and the metamagic was silently dropped. | Refused before anything is spent, with a "Not Cast" card: Extend or Temporal beside the spell's own duration warp, Reach or Distant beside its range warp, Widen beside its area warp, and Extend beside Temporal. |
| U10 | **Component Mastery** | A note: "state which at the table". A material spell without a pouch was refused before the warp dialog opened. | Choose which component changes into which (+2 PP). The component gate waits for the dialog, then judges the cast's own components; Still Spell and Silent Spell count as well. The pouch is spent only if material is still needed. |
| U10 | **Lingering Performance** | A note. | A composition that took it lingers for your Cha rounds (+1 with Echoing Performance) when its Sustain lapses or another composition replaces it. Only one lingers at a time (two with Echoing). A Dismiss still ends it. |
| U11 | **NPC saves** | A player's spell rolled the GM's NPC's save with the player's dice. | Rolled on the GM's client, through the relay. With no GM connected, it is rolled on the caster's client at once. If a connected GM does not answer, it is rolled there too, with a warning. |
| U12 | **Shape Of The Wyrm** | The extra natural attack could be taken twice. | Once. |
| RC5 | **Extend Spell** | Offered on unlimited durations (Magic Mouth, Glyph Of Protection, Continual Light, Soul Bind). | Not offered. |
| RC6 | **Split Spell** | Offered on Shatter (utility, no save). | Attack spells only. |
| RC7 | **Selective and Split** | Held to 6 and 4 purchases, which neither feat prints. | Limited by the cast cap alone. |
| RC8 | **Warp ceilings** | Sold past the page. | Forbiddance's uncapped radius can be repeated. Unliving Vitality: five purchases (fast healing 5 to 10). Rapid Repair: four (1 to 5). Gravity Weapon's "+2 (max +4)": once. Magic Stone's "to +2": once. |
| — | **True Seeing, Unshakable** | Their "range becomes touch" warps carried no mods: charged, and only the caster was affected. | Invisibility's touch warp: the touched creature gets the spell. |

## Readings for Graham

- **U1, the Hours step.** Your ladder says hours become 12 hours, so 10 minutes steps to 1 hour and then to 12 hours. Your Shield of Faith example said the second step gives 2 hours. I built the ladder as written, and it is one line to change.
- **U1, counts.** A count is carried up the ladder: 3 rounds steps to 3 minutes and then 30 minutes, and 8 hours to 96 hours (8 × 12). Should the count reset to 1 at each step?
- **U8, damage.** Empower or Intensified beside a spell's own "+1d6 damage" warp is still allowed. Your U8 answer covered duration, range and area. Should damage be refused too?
- **Still open.** Selective, Split, Aligned and Imposing Will still charge PP and add a note only; U10 named Component Mastery and Lingering. Geas's "1 year" and "unlimited" warps and Pass Without Trace's range-and-area warp have no structured mods, so U8 cannot see them; each needs a decision before it is authored. Unshakable's touch warp says "(arcane only)", and that tradition limit is not checked (it never was).
- **Counteract.** Every cast's effects now carry the PP they were cast at, so the Counteract dialog opens with it instead of 0. A cantrip's effects carry the caster's maximum (page 236).

## Harness

- **New: `verify-spell-metamagic-rulings`, 91 checks.** It drives each ruling through the real functions: the ladder against the effect clock, eligibility, the aggregate, U8, the ×2 arithmetic, the counteract PP, lingering, the ceilings and the pack, and the save relay with a stub GM. It also checks the cast workflow's wiring in source.
- **New: `mutate-spell-metamagic-rulings`:** all 54 mutations caught.
- **Spell matrix:** the baseline went from 4,112 failing cases to 8, each explained in the repair log.
- **Moved because the data moved** (each with its reason recorded at the check):
  - `verify-warp-repeats` P2 and P2c;
  - `verify-spell-range` C2 and C3;
  - `verify-warped-healing` F4c;
  - `verify-warp-area` C3 (U9);
  - `verify-stone-shield` B7 and `verify-spellbook-rename` C2 (a gate at or after its release, never ahead of the schema);
  - `verify-block34b` A4 and `verify-ea-block6a`/`6d-core` (anchors on the save and gate lines);
  - `block35-plan`.
- **Version pins:** 3.716.0. The schema and pack-copy gate anchors were re-pinned too, including seven that were already stale at 3.715.1. `mutate-thorns` W5 was re-anchored (its loop had gained `enhancementPackets`, unrelated).
- **The full sweep:** all 813 of `tools/verify.mjs`'s files were run, in three stretches (it takes over three hours). It found four faults of this release, all fixed:
  - an ambiguous anchor in `mutate-ff30-block22`;
  - two component-gate anchors (`verify-strike-riders`, `verify-thorns`);
  - six helpers exported only for the harness, now internal and tested through the public functions.
  
  One structural gap is pre-existing: `verify-ea11-seams` has no `mutate-` file.
