# TRG Prime 3.665.0, with Inner Tempest 0.2.0

21 October 2026. This release builds Graham's rulings of 21 October on the Inner Tempest 0.1.0 live test. **Install both.** Inner Tempest 0.2.0 needs 3.665.0. Fiends & Fables Prime 0.45.1 is unchanged and works with it.

**A migration prompt will appear** when the world loads, because one pass needs to run (below).

## Core 3.665.0

### Focus feats and abilities with no count are one use (D1, approved)

- A feat or ability with the Focus trait and a blank Uses Per Day now has one use.
  - It is spent when used and refused when spent.
  - Refocus offers it, and daily preparation restores it.
  - Innate spells keep their own rule, unchanged since 3.562.0. Other spells and other item types are untouched.
- **What it reaches:**
  - the five core feats in that state: Ebon Bind, Ferocious Charge, Injury Relief, Primal Shape and Void Step;
  - one Fiends & Fables feat, Scaly Resilience;
  - 25 Fiends & Fables creature abilities that carry Focus with no count, mostly breaths and screeches: Abyssal Healing, Acidic Spittle, Banshee Wail, Deafening Screech, Dispelling Strike, Earth Drake Breath, Electricity Breath, Eternal Summons, Fire Breath, Flame Drake Breath, Forge Fire, Frost Drake Breath, Garlic Breath, Horn of Purity, Mountain's Wrath, Necrotic Spew, Nightray Breath, Petrifying Breath, Phase, Radiant Eyes, Scorching Breath, Screech, Thunder Strike, Wind Lash and Wind Rider. Copies sit on 26 creatures in the 0.45.1 bestiary.
- **Behaviour change for monsters:** those creature abilities are now one use until the creature Refocuses, which is what the Focus trait says. Before this they could be used every turn.
- **Arriving with the use:**
  - An item dropped on a sheet arrives with its use, as before.
  - An actor created with its items (a creature imported from a compendium, or a duplicate) now primes them too. Before this, a count stored at 0 would have arrived spent.
- **The migration (the 3.665.0 pass):** feats and abilities already on sheets and on placed tokens get their one use. They were untracked until now, so none of them can have been spent. Innate spells are left alone, because a 0 there may be a real spend. The schema stamp is raised to 3.665.0 so the pass is offered.

### A defender's row that gives the attacker disadvantage

- A `defenceDC` row may be `kind: "disadvantage"`. An action against that defender is then rolled at disadvantage, and the attacker's card says why.
  - The row needs no value. It may name `dc: "any"`, because a Trip is rolled against the higher of two DCs.
  - Like every defence row, it must be scoped by action or by attacker.
- The disadvantage is reconciled in **one pass** with the action's own advantage (an attack against a flat-footed target), so the two cancel to Normal.
- Callers that add up defence rows are unchanged: disadvantage rows come back in their own list.
- **Built for Inner Tempest's Tsuchi**, against a Shove Attack or Trip Attack (Graham: "Grant the check disadvantage").

### An alternative when a specialist skill is granted twice

- A background may declare `specialistAlternative`. When another item on the sheet already confers that background's specialist skill:
  - Apply Grants says so (whichever was added first);
  - the background's Use asks for another skill, through the same chooser the "name your lore" backgrounds use, so the answer leaves with the background.
- A character for whom nothing is duplicated is asked nothing. **No core background declares it,** so core characters are unchanged.
- **Built for** Inner Tempest's Spirit Warrior and Spiritwalker on a Miraku (Graham: "offer an alternative lore").
- **Limit:** if the race is later removed, the alternative stays until it is removed by hand from the Skills tab. The background's Use says so.

## Inner Tempest 0.2.0

- **Tianzhi languages:** Fuukaze Aeolian, Hikari Thanatos, Kasai Ignic, Suiryoku Aqualis, Tsuchi Gaian. The race keeps Low Tongue and loses its open pick.
- **Tsuchi:** a Shove or Trip against it is rolled at disadvantage.
- **Spirit Warrior and Spiritwalker:** another Lore when the race already gives Spirit Lore. Spiritwalker is included because it also grants Spirit Lore.
- Also carries 0.1.1's three live-test fixes:
  - swim and climb Speeds;
  - Ancestral Guidance waits for the GM's DC;
  - a refused Stunning Reflexes keeps the turn.
- **Question for Graham:** the Tianzhi race and the Elemental Guardian and Elemental Harmonist backgrounds all grant Elemental Lore. Should those two backgrounds offer an alternative too?

## Checks

- **New pairs** (every mutation is caught):

  | Pair | Checks | Mutations |
  |---|---|---|
  | `verify/mutate-focus-default` | 15 | 13 |
  | `verify/mutate-defence-disadvantage` | 15 | 12 |
  | `verify/mutate-specialist-alternative` | 11 | 7 |

  The migration is driven against fake actors and tokens. The five core feats are read from the shipped feats pack.
- **Re-anchored to the new code, without changing what they assert:**
  - `verify-focus-innate-uses` B1 and B2;
  - `mutate-focus-innate-uses`' two anchors, which the new rule made ambiguous;
  - `verify-block39-conditions` E9;
  - `mutate-action-degrees` D4;
  - `verify-chapter2` I11a (the choice flags that suppress the generic "press Use" nudge now include `specialistAlternative`);
  - `mutate-drive-3622`'s "the schema is not raised" mutation, anchored to the stamp, now 3.665.0.
- **Inner Tempest:** `verify-block1` 372 checks, `mutate-block1` 51 mutations, all caught.
- **Full sweep: 605 of 605 green** (3.664.0 was 599 of 599; the six new files are the three new pairs). It was run on a clean stage: the 3.664.0 release plus exactly this release's files.
  - The first run found five failures, all fixed before the second:
    - the two re-anchors `verify-chapter2` I11a and `mutate-drive-3622`, listed above;
    - three new exports the uncalled-export ratchet flagged. `rollBiasWith` is now file-local, and `migrateFocusDefaultUses` and `focusInnateDefaultUses` are declared keeps with their reasons: each is reached through its caller and exported for its harness.
