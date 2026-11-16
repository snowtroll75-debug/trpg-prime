# TRG Prime 3.688.1

13 November 2026. Two changes after 3.688.0 was installed: Graham's ruling on Q186, and a fault he found live (High Magic casters' releases from wands and staves). Built on 3.688.0. No migration; no world data is touched.

- **Eldritch Arts 0.13.1 needs it.** Eldritch Arts 0.13.0, Inner Tempest and Pillars of Faith run on it unchanged.

## A ritual's primary is offered cast items (Q186)

Graham, 13 November 2026: "Catalysts should be offered for rituals." In 3.688.0 a ritual was excluded, because its check is rolled before `castSpell`.

- **Asked before the ritual check** (`rollMagicRitual`), of the primary, at the PP as cast (the spell's PP plus the PP over). Asked after the dialog, its refusals and the DC, and before the roll. The module is told whether the ritual is a variant (its PP substituted, so no discount reaches them) and whether it claims "Duration unaltered" (so it is not offered a duration stretch). Closing the prompt stops the ritual before anything is rolled or spent. With no module offering anything, nothing is asked, so a ritual is exactly as in 3.688.0.
- **Their check rows and their advantage or disadvantage** go to the ritual check, once. They are then cleared, so the cast does not read them again.
- **The rest is handed to the cast** (`ritual.castItems`). `castSpell` folds it as it folds a cast's own items: dice, Save DC, range or duration, traits and resistance bypass. It then settles them, so they are spent and their backlash answers to the ritual's degree.
- **A ritual that does not cast** settles them itself, with a card of their own: a Partial with no Partial effect, or a cast stopped short. A cast item is "consumed … whether the spell succeeds or fails".
- `settleCastItems` settles a set once. A second call does nothing.

## A High Magic caster's Spellcraft path on a wand or staff (found live)

Graham: "When an arcane caster casts from an item such as a wand and staff it does not allow them to add their spellcraft mod (as they never have the tradition)" — and then: "I meant High Magic caster not Arcane".

- **The cause:** the release (wand, staff, scroll) opens the Spellcraft path only for "a spell from your tradition" (Chapter 11), and compared the spell's traditions with the caster's single tradition field. The Archmage "do[es] not develop spells from a specific tradition and instead treat[s] all traditions as high magic" (Eldritch Arts). So Valmorius (Archmage, recorded as arcane) releasing Wand of Cure (Divinity, Verdant) was told "the spell is not from your tradition".
- **Now** the release asks `highMagicCast` whether the caster casts this spell as a High Magic caster. If so, its traditions are theirs, and the Spellcraft path is open. This covers the Archmage for every tradition, and a Witch for Ethereal and Verdant only. The caster level still caps it. A spell with no tradition at all still has none.
- **And a specialist spell** (the 106 record no tradition) now takes the caster's tradition on release, as it does cast from memory (Chapter 10, `effectiveSpellTradition`). Staff of Undeath's Charm Undead, a Wizard specialist spell, had said "not from your tradition" to everyone.
- **Not changed:** the release check's DC. A High Magic cast's "Hard (+2)" is not added to a release; Eldritch Arts prints it for orbs (Block 9c), not for wands and staves.

## The independent review

An independent review read the changes against the rulings. Fixed:
- a ritual variant (its PP substituted) was offered Resonant Crystal Shard, whose discount cannot reach it;
- a ritual claiming "Duration unaltered" (−10 DC) could then stretch the duration with Starpetal Oil;
- the cast items' lines lacked a check that they print once.

Two questions it raised are Graham's (below). It found the single application of the rows and bias, the cancel path, the order after `prepareRitual` and its refusals, the default-off path and the settle facts correct.

## For Graham

1. **A specialist spell from an item, for a caster of another class.** As built, any caster releasing any specialist spell reads it as their own tradition, so a Cleric releasing a Wizard specialist spell (Charm Undead) gets the Spellcraft path. Cast from memory this never arises, because a specialist spell is gated to its class. The narrower reading — inherit only when the caster has the spell's class — would leave such a spell with no tradition for anyone else, so no Spellcraft path even for a High Magic caster. Which do you want?
2. **A mundane ritual (Eldritch Arts' Chapter 7 variant), whose check is a tradition skill** (Arcana, Religion, Occultism or Nature instead of Spellcraft): a catalyst that says "Spellcraft check" (Leydust +2, Arcanite Powder's advantage) still reaches it. Keep, or drop on a skill check?

## The harness

- **`verify-block9a-core`** (now 86 checks) and **`mutate-block9a-core`** (82 mutations, all caught) cover the ritual's items:
  - the cast takes what the ritual asked;
  - asked before the roll, told it is a ritual, a closed prompt stops it;
  - the rows and bias reach the ritual check, once, and their lines its card, once;
  - the module is told a variant and "Duration unaltered";
  - handed to the cast, and settled by the ritual when the cast did not;
  - settled once.
- **New pair `verify-fixes-3688-1`** (13 checks) and **`mutate-fixes-3688-1`** (9 mutations, all caught):
  - a High Magic caster's release of another tradition's spell opens the Spellcraft path (Wand of Cure); the Archmage counts for every tradition, a Witch for hers, a Wizard never;
  - a specialist spell inherits the caster's tradition, from the compendium and from the caster's own copy;
  - a spell with traditions keeps its own;
  - a non-caster and an unknown spell get none;
  - the Spellcraft path opens for Charm Undead and stays closed for Cure.
- **Version pins** raised to 3.688.1.
- **Re-anchored**, with no change of meaning (the ritual's hand-over to the cast now carries `castItems`, and its card's lines lead with theirs): `verify-chapter9-241-250` I13 and its mutation, `verify-ea-block2b-core` RW (two checks) and its "the ritual's gate answer is not handed in".
- **The full sweep** (`tools/verify.mjs`'s order, in shards on copies of the tree), then **every `verify-*` again on the final tree:** all pass. The failures the sweep found were the two re-anchors above. Each was fixed, and its verify and mutate run again and passing, as were the mutates of every harness reading the changed ritual, release and charged-item code (`block9a-core`, `block8b-core`, `chapter9-241-250`, `ea-block2b-core`, `block36`, `ea-block1-core`, `ea-block2-core`, `fixes-3688-1`).
