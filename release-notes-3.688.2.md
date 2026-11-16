# TRG Prime 3.688.2

13 November 2026. Two faults found in the live test of 3.688.1, both behind Graham's report: "When an arcane caster casts from an item such as a wand and staff it does not allow them to add their spellcraft mod". Built on 3.688.1. No migration; no world data is touched. Eldritch Arts 0.13.1 runs on it unchanged.

## The Spellcraft path of a release rolled +0

- **Seen live:** a copy of Valmorius (Archmage, Spellcraft +14) released Wand of Cure by Spellcraft. 3.688.1 had opened that path for him. The check read "Spellcraft Untyped +0" against Casting DC 13 (Easy).
- **The cause:** `castFromItemOptions` names the Spellcraft path's skill `"spellcraft"`. The release check (`rollReleaseCheck`) took any named skill as a skill, from `system.skills`, and Spellcraft is not one of those: it is `system.magic.spellcraft`. So every caster's release by Spellcraft, from a wand, staff or scroll, rolled +0, and was recorded as a skill check rather than a Spellcraft check.
- **Now** the Spellcraft path rolls the caster's own Spellcraft, with its modifiers, as a Spellcraft check. A tradition-skill path (Religion, Nature …) is unchanged.
- **Also mended by it:** a release's fumble now says it was a Spellcraft check. Eldritch Arts' Mana Bound reads that, and on a release by Spellcraft it had not been told.

## The released spell was refused after its check passed

- **Seen live:** the release check passed, and then "Cure cannot be cast — you have not studied your Spell Library today — page 235: cantrips only". The wand kept its PP, and nothing was cast.
- **The cause:** `castSpell` asked the spell it was handed `spellCastBlocked`, the library's question: is it prepared today, and is this a cantrips-only day. A spell released from an item is "cast … although you do not need to know it" (Chapter 11). It is not in the caster's library, so neither question applies.
- **Now** a spell built for a release (flagged `itemCast`) is not asked. The caster's own spells still are.
- Valmorius's own sheet shows he has not studied today. Until 3.688.2 that would have refused every spell he released from his wand or staff.

## Also seen in the live test (not changed)

- **The Magic Ritual dialog's six secondary-caster rows all default to Success (+2).** A GM who fills in one row and leaves the rest gets six secondaries (+12). The first test ritual did exactly that. Graham to say whether the rows should default to "not participating".

## The live test of 3.688.1 / 0.13.1

Run in Graham's world with throwaway actors. The world was left as found: test actors and scene deleted, own messages removed, world time unchanged, game paused, Oldwatch Approach in view.

- **Wand of Cure (Divinity, Verdant), released by an Archmage:** the Spellcraft path is offered (3.688.1's High Magic fix). Its +0 is the fault above.
- **Staff of Undeath, Charm Undead (a Wizard specialist spell):** the Spellcraft path is offered.
- **A Magic Ritual (Mage Armour, one secondary):**
  - no Vellum tick in the dialog;
  - the catalyst prompt offered Blood-etched Vellum and Leydust, and not Sands out of combat;
  - Vellum's +2 item was on the ritual check;
  - the catalyst line printed once on the ritual card;
  - the cast settled it ("Blood-etched Vellum is spent");
  - the High Magic cast followed.
- **A ritual whose Partial does not cast (Shield, Leydust):**
  - Leydust's +2 was on the ritual check;
  - "The spell fails, but no PP is lost";
  - no backlash on a Partial;
  - the ritual settled the catalyst itself ("Leydust is spent").

## The harness

- **New pair `verify-fixes-3688-2`** (9 checks) and **`mutate-fixes-3688-2`** (7 mutations, all caught).
- **Re-anchored:** `verify-ea-block6b-core` F13 and its mutation. That check pinned the release fumble's `type: option.skill ? …`, the very line that misread the Spellcraft path.
- **Version pins** raised to 3.688.2.
- **Every `verify-*` on the final tree:** all pass.
- **Run again and passing:** the mutation files of every harness that reads the two changed places: `fixes-3688-1`, `fixes-3688-2`, `ea-block1-core`, `ea-block2-core`, `ea-block2b-core`, `ea-block6b-core`, `ea-block6d-core`, `block9a-core`, `block36`, `casting-feats`, `arcanist-book`.
- **Not repeated for two one-line fixes:** the full mutation sweep, which 3.688.1 passed.
