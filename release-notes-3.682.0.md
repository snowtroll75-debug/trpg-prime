# TRG Prime 3.682.0

3 November 2026. The seams Eldritch Arts' Block 4 needs (the Spellblade and the Warlock), from the Block 4 audit, as Graham answered it the same day. Also his ruling on the unwilling touch: "The touch attack should always miss on a 1 and hit on a 20". Built on Graham's own 3.681.2.

- **Install over 3.681.2.** No migration, and no world data changes.
- **Runs unchanged on it:** Eldritch Arts 0.6.1 and Inner Tempest 1.0.4. Eldritch Arts 0.7.0 needs it.
- **Nothing changes for a world that uses none of it,** except the two changes listed under "For every world".

## For every world

- **The unwilling touch (page 240):** an unmodified 1 always misses and an unmodified 20 always lands, as every attack check does (Graham, 3 November). The card says when the die decided it.
- **A disease's stage damage now carries the disease trait,** whatever its type (Ghoul Fever's essence, say), so a resistance to disease halves it. A poison's damage carries the poison trait, as it always has, even when a stage names another type. A curse's damage is unchanged.
  - **Why:** Graham's Q43, "any damage sustained from a disease would also be halved".
  - **Where:** `stageDamageTraits` (`combat/affliction-workflow.mjs`).

## New seams (for modules)

- **A class's daily memorisation budget:** `classMagic.memorisedPerDay`, `"2+2L"` (the default) or `"L+1"` (the Spellblade's "equal to your level +1"). Read by the memorisation dialog.
- **A spell attack on BAB (Battle Mage):** an item or live effect flagged `spellAttackBase: "bab"` adds BAB less BSB, as one row, to a spell attack with the Attack trait, when BAB is the higher. The casting check and its degree are untouched. It is not used for an innate spell, an ability that is switched off, or a Strike's roll (below).
- **Levels on an innate cast:** `registerInnateLevelBonus(key, ctx => n)`. It covers the Warlock's bonded souls: "treated as one level higher when using spells with the Fire or Healing traits".
  - **What it raises:** the innate PP limit, attack, save DC and free warp budget.
  - **Not raised:** a spell an item grants or an item's cast. The item fixes those.
- **Runes infused for their wielder (Infuse Weapon):** an actor flag, `infusedRunes = {weaponId, runes, magical}`.
  - **The weapon:** carries the runes while that actor owns it, without its own field being written. They are prepared as `system.effectiveRunes`.
  - **Outside the allowance:** the runes don't count against the weapon's rune allowance or the potency prerequisite (Q45), as Blade Ally's rune doesn't. Where a rune is both etched and infused, the higher tier applies.
  - **Magical:** its strikes are magical for resistances and DR (Q44).
  - **Readers:** every rune reader now reads through `runeFieldOf`. That covers damage, declarations, effects, actions, events, spell effects, thrown weapons and the Codex runes (Vorpal, Ancient Echoes, tiers, usage notes).
  - **When it clears:** a cleared flag clears the prepared fields at the next preparation.
- **A Strike inside a spell:**
  - **`helpers.castSpell(actor, spell, options)`,** with the core's own options.
  - **`strikeCheck`:** a Strike's check whose roll is the casting check (Thunderous Strike, Q48). Its dice and modifiers, with the casting's own gate rows, are read against the casting DC, with no second Conviction.
  - **`rollWeaponAttack`'s `reachOverrideFeet`:** a melee Strike at a spell's reach (Shooting Star's 30 ft). Within it, a weapon that could be thrown stays a melee Strike.
- **A cast's prelude:** `registerCastPrelude(key, ctx => {handled, result} | null)`, asked before anything is spent when a spell is cast from the sheet with none of the core's own options. Thunderous Strike's Strike goes first. A prelude is never asked twice for one spell at once, so it may fall back on `castSpell` itself.
- **Cover stepped down a degree:** a `strikeEdge` may carry `reduceCover: n` (Shooting Star: "greater → standard, standard → lesser, lesser → none").
  - **Which cover:** the target's own Take Cover (only while it is switched on), else the cover of firing into melee.
  - **What is lost:** what the DB actually loses. Circumstance bonuses don't stack, so another circumstance bonus can hold part of it up. Said on the roll.
- **`trgPrimeSpellSettled` carries `spellHits`:** one `{target, critical}` for each ray that hit. Xithra's riders need it: "This effect only applies if the initial blast hits".
- **More helpers:**
  - `learnSpellTerms(pp)`: Learn a Spell's price, DC and hours. The Book of Infusions' runes use it (Q46).
  - `learnSpellOutcome(degree)`: what a Learn a Spell check's degree means, learned or not and the materials consumed.
  - `runesFor(kind)` and `runesToField(kind, selection)`.
  - `addRecurringDamage(target, amount, type)`: the core's rule for a second source, through the GM when the client doesn't own the creature.
- **`registerPPGrant` takes `stat: "hp"`.** It covers Natural Resilience's "+1 HP per level", as the core's Stone-Like Endurance is granted.

## Found in review (independent, before release)

- **The Strike-as-check dropped the casting's gate rows.** A Null Aura's DC, a distraction's penalty and a Ley Bond's −1 never reached Thunderous Strike's casting. They do now.
- **Battle Mage could be laid on a Strike's roll,** which already holds BAB. Not any more. It also now reads the Attack trait ("spells that have the Attack trait") and ignores a switched-off ability.
- **A throwable melee weapon inside Shooting Star's 30 ft was thrown.** It is a melee Strike now.
- **The cover step took the table's difference,** even when another circumstance bonus held the DB up, or when the Take Cover effect was switched off. It now takes what the DB loses.
- **An item's innate cast could take the souls' levels.** It doesn't now.
- **A prelude that called `castSpell` bare would have met itself forever.** There is a guard now.
- **Two cosmetic fixes:** two doc comments had been separated from their functions.
- **Noted, not changed:**
  - A rune both etched and infused spares the etched copy from the allowance too, as Blade Ally's always has.
  - An infused rune with an aura refreshes at the next actor change, not at the moment of infusion.

## Harness

- **New pair: `verify-ea-block4-core` (93 checks) and `mutate-ea-block4-core` (67 mutations, all caught).** It covers the memorisation budget, Battle Mage, the innate level bonus, infused runes, the Strike inside a spell, the cover step, the affliction traits, the touch's natural 1 and 20, the prelude, the spell hits and the HP grant.
- **Re-anchored, not weakened:**
  - `verify-chapter6-gear-181-190` D2: the stage damage's traits.
  - `verify-fixes-3681-1` U1 and its mutations: the touch passes its die.
  - `verify-opportunity-reach` A4b and its mutation: a spell's reach joins the flag.
  - `mutate-classes` A15: the budget is a rule table now.
  - `mutate-chapter9-231-240` I: the touch's tie, beside its die.
  - `mutate-block37-weapons` B12: Courageous reads `runeFieldOf`.
  - `verify-block8-core` C5: the settled hook's `spellHits` rides with the rest.
  - `verify-ea-block1-core` C10: the Strike's casting check carries the casting's gate rows; no innate or item attack does, as before.
  - `verify-ea-block3b-core` W14: the prelude is asked before the cast's scope begins.
  - The infused line in `strikeIsMagical` sits just before the bonded weapon's, so `verify-magical-attacks` C1, `verify-block39-traits` G10, `verify-block37-weapons` I4 and `verify-block7-core` C7 read the expression they always did.
- **Version pins** moved to 3.682.0 in seventeen mutation files. `system.json`'s download names v3.682.0.
- **Uncalled-export ratchet:** seven new keeps, each with its reason. The backlog is unchanged at 512.
- **Full sweep** (the list `tools/verify.mjs` runs, 673 harnesses with the new pair, in two shards on two copies checked identical to the source): **673 of 673 passed.** The earlier runs found the anchors listed above, each re-pointed at the moved code and run again on the source with its mutation half; the final run is clean.
- **Eldritch Arts on 3.682.0:** 0.7.0's `verify-block1`–`4` all green, and the earlier blocks' mutations all caught.
- **Inner Tempest 1.0.4 on 3.682.0:** Blocks 1–4, 6–10 and the weapons all green. Block 5's harness reads the book's text, which isn't in this workspace.

## Packs

- Unchanged. The release ships the 3.676.1 pack files byte for byte.
