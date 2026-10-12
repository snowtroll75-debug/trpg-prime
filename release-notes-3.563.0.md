# TRG Prime 3.563.0 — what a companion module's class needs

17 September 2026. Shipped with Pillars of Faith 0.3.0 (Chapter 3, the five classes). Every change is a generic mechanism the core classes could have used; none changes what a core class does today.

## A class's spell repertoire schedule is data

The three core instinctive casters share one schedule — two PP 2 picks at 1st, one more at 3rd and every two levels after, a swap at 5th and every two after — and `repertoire.mjs` knew no other. The Grimward, Healer and Shaman print "at 2nd level and every level thereafter" for picks, and two of them "whenever you gain a level" from 5th for swaps. A class item now declares `flags.trg-prime.repertoire: { pickStep, pickFrom, swapStep, swapFrom }`, each field optional and defaulting to the core value, and `repertoirePickCount`, `repertoireSwapCount` and `repertoireState` take the schedule. The Repertoire card, the swap bank and the class's Apply Grants line all read it off the class item. The card's "next pick at" and "next swap at" markers are computed from the schedule rather than from the parity arithmetic that assumed every-two-levels; the core answers are identical.

## A class ability can choose, grant and confer

- **Declared chooser.** An ability carrying `flags.trg-prime.abilityChoices: [names]` gets a Use button (the sheet recognises the flag the way it recognises a Codex activation) that offers the list and grants the chosen *ability* from the federated abilities pack — the copy whose `sourceClass` matches the chooser's — stamped `grantedBy` so it leaves with the chooser, and its own grants run as it lands. A second Use reports the recorded choice. This is the Priestly Path shape for abilities rather than archetype feats, and it needs no code per class: an Archival Discipline, a Folk Tradition, an Inquisitorial Discipline, a Healer's Calling and a Spirit Guide are each one flag.
- **An ability grants.** `GRANT_FIELDS.ability` — `grantedSpells` (levelled, "1: Doctrinal Ward, 7: Word of Censure"), `grantedAbilities`, `grantedFeats` — with `ability` on the autogrant list, so a discipline's specialist spells arrive when the discipline does. The three fields are on the ability template and sheet.
- **A class grants spells.** `GRANT_FIELDS.class` gains `grantedSpells` (levelled): the Healer's "you automatically add Cure and Restoration to your repertoire. These spells do not count against the normal number of spells you learn" — granted, not picked, listed as Granted on the spells table.
- **Specialist skills from any item.** `specialistNamesFor` has read the `grantedSpecialistSkills` flag off any item; only the apply and cleanup gates kept it to foundations. `declaresSpecialistSkills(item)` (pure) opens both to a feat or ability that carries the flag — "You gain Folk Lore as a specialist skill" — and the autogrant sweep counts the flag as a declaration, so a discipline with only a lore skill still earns its pass. The printed `specialistSkill` field on a feat is deliberately *not* read: it was never a grant, and forty feats print one.

## Gates that read a registered class

- `barredClasses` ("Non-Healer") and the archetype-feat branch's class-name gate consult `registeredClassNames()` beside the eight core names, closing the two class-name tables the 3.560.0 registry missed.
- An archetype feat a *class item* grants (Folkwarden: "You gain the Alchemist archetype feat as a bonus feat... does not impose its normal Progression Requirements") is waived from archetype progression the way the three named choosers' grants are — decided by the granting item's type, so no core class moves.
- The name lists behind `requiresFeat`, the skill substitutions and every action-workflow feat gate now hold feats **and abilities**. A class ability that prints a feat-shaped rule (Seasoned Hands: fumble → failure on five named checks; Spirit Speaker: Nature offers the Occultism spirit actions; Folk Rites: Read the Signs and Lay to Rest offered only to their owner) registers exactly as a feat would. No core ability shares a name with a core feat (checked when this widened), so nothing that matched before matches differently.

## Harness

`verify-module-classes.mjs` (58): the schedule driven under the core and both printed variants, the markers and the malformed-flag fallback; the chooser's two pure functions evaluated out of the source with a stamped and an unstamped actor; the specialist declaration's five edges; `barredClasses` before and after a registration; the structural wiring, marked. `mutate-module-classes.mjs` — 13 mutations, all caught. Three anchors repointed (`mutate-feat-grants` ×3) and one narrowed (`mutate-chapter2` I4) where the lines they held grew a clause. Full sweep: 313 of 313.
