# TRG Prime 3.668.0

23 October 2026. The core half of Inner Tempest Block 4: the Ghostwalker, the Kensai and the Oathblade. Built to Graham's rulings of 23 October (B4-1 to B4-4, and Black Lotus) and the audit's core items C1 to C9.

- **Install over 3.667.4,** then Inner Tempest 0.5.0, which needs this release.
- **Nothing changes for a game without Inner Tempest 0.5.0.** Every addition here is a new declaration, a new option or a new hook. No existing item declares any of them.
- **Unchanged and still working:** Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.
- **No migration prompt.**

## 1. Scaled values (C2)

A conditional's or a stat row's `valueFrom` could name one figure ("classBonus") or a difference ("intelligence-wisdom"). It can now also do arithmetic with a whole number, as the forms print it:
- **"classBonus-1":** Weapon Discipline and Echoing Crane's "class bonus −1";
- **"intelligence/2":** Flickering Flame and Iron Tortoise's "+1 per 2 Int mod", rounded down;
- **"intelligence\*2"** and **"intelligence\*5":** Rising Phoenix and Steel Viper.

A row's own `valueMin` sets a floor ("min +1"). Stat rows (DB, Speed) read the same grammar and now know the class bonus.

## 2. Three new scopes for a modifier (C1)

A conditional can now be scoped to:
- **the weapon's group** (`attackGroups`: "sword", "axe", "bow" …), on the attack and on its damage. Weapon Discipline uses it.
- **how far the Strike reaches** (`rangeBands`): "adjacent" or "reach" for melee (beyond 5 feet is reach), "first" or "far" for a ranged or thrown Strike against its first range increment. Stone Serpent and Distant Honour use it.
- **the target's state against this attacker** (`targetStates`), read off the board when the Strike is rolled:
  - **"flatfooted":** flat-footed to you, for any reason (Ghost Fox);
  - **"isolated":** none of the target's own allies adjacent to it (Dread Wolf);
  - **"duel":** none of your allies adjacent to it (Oath of Honour).

Every other roll carries none of these, so a modifier scoped to one matches nothing else.

## 3. A trait a weapon group gains, and a penalty to reaction attacks (C1, C8)

- **`weaponTraitGrants`:** "the weapon gains the Finesse trait if wielded in one hand" (Weapon Discipline). Declared with the groups, the trait and whether it needs one hand. The Strike adds the trait before it is rolled, so Weapon Finesse reads it.
- **`reactionAttackPenalty`:** "Enemies suffer a −5 penalty to hit you with reaction attacks" (Flickering Flame). Read from the defender by a reaction Strike against it.

## 4. A defence row against everyone but one creature (C3)

Challenge gives "−2 circumstance to DB against attacks made by all creatures other than your challenged target". A defence row can now exclude one creature (`not.sourceUuids`). The named creature meets nothing; every other attacker, a nameless one included, meets the row.

A defence row also now says when it comes from a stance (its own effect, or a row read only in a stance), for Formless Cut below.

## 5. Armour Rending by declaration (C4)

AR came only from the weapon's trait and the ammunition. An item or effect can now declare it (`strikeRending`), scoped like a conditional:
- **Challenge:** AR equal to the class bonus on melee attacks against the target, and with Distant Honour, bow attacks within the first range increment;
- **Retribution** (Oath of Vengeance): AR +2 on the next melee Strike against the target;
- **Oath of Fealty:** the Sworn Charge's AR 1 against the target.

It adds to the weapon's and the ammunition's AR, as ammunition's does (Graham's ruling for ammunition). A row scoped by nothing is refused.

## 6. Ambush dice: Unseen Assault (C5, B4-3)

"Once per round, when you Strike a creature that is flat-footed to you as a direct result of your own Stealth, Deception or Ghostwalker abilities, you inflict an additional 1d6 precision damage."
- **The weapon:** an agile or finesse melee Strike, a thrown Strike, or a ranged Strike within its first range increment.
- **The cause, as Graham ruled (B4-3):**
  - **applied by itself** when you are hidden from or undetected by the target, or it is flat-footed from your own Feint or Create a Diversion;
  - **asked on the hit** when it is flat-footed for another reason (Shift skips the question);
  - **never** from flanking alone.
- **Who left it flat-footed:** a Feint or Create a Diversion that lands now records its maker on the target, so the core can tell "your own Feint" from anyone else's.
- **The dice by level:** 1d6, 2d6 at 5th, 3d6 at 9th, 4d6 at 13th, 5d6 at 17th. Once per round.
- **What builds on it** (`ambushExtras`): Ghost Blade's AR by level, and Ambusher's Patience's +2d6 against a creature that had not detected you, once per creature per encounter.
- **A new hook, `trgPrimeAmbushDealt`,** fires when the dice have dealt their damage. Vanishing Retreat listens.

## 7. Per-Strike options (C9)

`rollWeaponAttack` takes, for one Strike:
- **`treatAsFlanked`:** "the target of your attack is considered to be flanked, regardless of your actual positioning" (Shadowy Step). It also counts for Sneak Attack.
- **`treatAsFlatFooted`:** "treats the target as flat-footed" (Formless Cut): the Dexterity and dodge it would lose come off, and it counts for Sneak Attack.
- **`ignoreTargetStance`:** "ignores the target's active stance or form bonuses" (Formless Cut): what the target's stances add to its DB is paid back on the attack.
- **`optionLabel`:** the ability's name on the card.

## 8. Flow Strike's penalty, and a resolved Strike announced (C6)

- **A module helper, `mapPenalty(actor, weapon, index)`:** the multiple attack penalty at an attack number, Agile and Agile Strikes included. Flow Strike is made "as if it was your third strike of the turn".
- **A new hook, `trgPrimeStrikeResolved`,** fires once a Strike is done, its damage applied, with the attacker, the target, the weapon, whether it hit, the critical, melee or not, thrown or not, a reaction or not, the option label, whether the blow was held, and the damage taken. Flow Strike, Perfect Tempo, Steel Viper, Echoing Crane, Form Reversal, Shadow Counter and the oaths listen.

## 9. A blow held: Black Lotus (C7; Graham's ruling of 23 October)

"Once per round, may delay your damage and critical rolls until the start of the enemy's turn."
- **`rollWeaponAttack(…, { holdDamage: true })`:** on a hit, nothing more is rolled. The hit is recorded on the attacker.
- **At the start of the target's turn,** Inner Tempest posts a card with **Land the blow**. Pressing it rolls the critical injury, if the hit was a critical, then the damage, against that target (`helpers.landHeldStrike`).
- **What it does not carry:** riders, precision dice and declared AR that the Strike would have added. The damage's own declared bonuses are asked as on any damage roll.

## 10. Found while building Inner Tempest 0.5.0

- **Half damage from a preset.** `rollWeaponDamage` takes a `preset` that rolls with nothing asked. It can now halve the damage, as a glancing blow is halved. Steel Viper's "if you miss with an attack, roll the damage and deal it as half damage" uses it. Modules reach it through `helpers.rollWeaponDamage`.
- **The trait rules, asked quietly.** `helpers.traitCheck` answers whether a Flourish (or any trait) is still open, with no warning. Flow Strike is offered after every hit, and should not be offered, or warn, once a Flourish is spent.
- **A stance entered at once.** `enterStance` takes `waiveWait`. Form Reversal: "A creature misses you with a melee attack. You may immediately change your active Combat Form". The one-round wait between stances is waived, and nothing else: the old stance is still replaced and the round still stamped.
- **A flat strike rider.** A rider's damage had to be dice. Ember Reaver adds "+Int mod secondary fire damage to the second" hit. A rider may now declare `flat: true` with a whole number. A bare number without it is still refused, as a typo.

## Checks

- **New harness pair `verify/mutate-block4-core`:** 54 checks and 56 mutations, all caught. Covered: every item above, the scaled values, the three scopes, the defence row, AR, ambush dice and their cause, the per-Strike options, the held blow, the two hooks, the helpers, the waived wait and the flat rider.
- **Re-anchored, nothing they test changed.** These harnesses read the Strike's code as text, and the code around their anchors moved (the damage's context, the ambush dice, the held blow, a group's trait):
  - `verify/mutate-attack-forms`, `mutate-stance-declarations`, `mutate-strike-riders`, `mutate-damage-riders`;
  - `verify-automation-pass` (H4f), `verify-block2-core` (A6), `verify/mutate-block3-core` (C10, C11), `verify-block39-conditions` (E7);
  - `verify-chapter6-gear-151-160` (H3), `verify-damage-riders` (C2), `verify/mutate-ff30-block19` (S1), `verify-ff30-block22` (S3), `verify-ff30-block34` (F1, F1d), `verify/mutate-item-fixes-3626-1` (B1).
- **Two code moves to keep the anchors honest, no change in behaviour:** the held blow's guard wraps the three injury steps in one `if (!held)`, and the declared AR is handed to the damage step after the riders.
- **The uncalled-export ratchet:** backlog unchanged at 513. Two keeps declared for `held-strike.mjs`, reached through the module helpers.
- **Full sweep (`node tools/verify.mjs` on the staged release): 627 of 629 passed.** The two that failed were harness anchors, not code: one mutation each in `mutate-chapter7-critical-201-210` (D11, moved by the held-blow guard) and `mutate-ward` (its anchor now matched twice, once in the new excluded-creature list). Both were re-anchored and re-run on the stage: 120/120 and 13/13 caught. Two more stale anchors were fixed before the sweep reached them: `mutate-feat-hooks-3625` and `mutate-opposed-aura`, which passed in the sweep.
