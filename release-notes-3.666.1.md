# TRG Prime 3.666.1

22 October 2026. This release fixes the three defects Graham reported after his game on the night of 21–22 October.

- **Install over 3.666.0.**
- **Inner Tempest 0.3.2** needs this release. It offers Evade and Impact Absorption the same way as Nimble Dodge; see its own notes.
- **No other module needs changing.** Inner Tempest 0.3.1, Pillars of Faith 0.11.1 and Fiends & Fables Prime 0.45.2 work with it unchanged.
- **One migration prompt.** It updates the Hurling cantrip on every sheet that has it: see below.

## Orb of Fire dealt no damage when a player cast it

Graham: "The spell orb of fire is inflicting no damage (and not adding its critical effect)."

**What happened.** In the session log, Lewi's critical Orb of Fire posted its Spellcraft card and then nothing more: no Result card, no damage, no recurring fire, no injury.

**Cause.**
- On a critical hit, Orb of Fire puts recurring fire on its target. The cast did this by writing straight to the target's sheet.
- A player cannot write to a creature the GM owns. Foundry refused the write, and the error stopped the whole cast before the Result card.
- The GM's own casts worked, because the GM can write to anything. That is why the defect only showed up at the table.
- Every spell, bomb and strike that lays recurring damage made the same direct write. So did some death effects.

**The fix.**
- **Conditions go through the GM.** When a player's client applies a condition to a creature it does not own, the request now goes to the GM's client, as damage already does. This is handled once, in the condition code itself, so every spell, bomb, strike, critical and death effect is covered.
- **Some conditions can't go through the GM.** A condition with a value, but no value given, would open its value box on the GM's screen. Instead, the player is told to ask the GM to set it.
- **A missing GM is reported.** If no GM answers, the player is told so.
- **The other direct writes in a player's cast also go through the GM now:**
  - Word of Death or Slay the Soul dropping a creature to a stated HP below zero;
  - Soul Destruction marking the body for a later Resurrection.
- **Removing a dead creature from the turn order** (and marking it dead) is now left to the GM's client. Before, a player's client tried it on the GM's creature and failed. The GM's death watch already does this the moment the Dying condition arrives, so it is no longer attempted from a player's client.

## Hurling did not add the magical ability score

Graham: "The spell Hurling is not adding magical ability score to its damage."

The book says: "it inflicts 1d6 + magical ability score bludgeoning damage." The spell rolled a bare 1d6, with a note saying to add the ability by hand.

- **The new damage setting.** A spell's damage row can now say "add your casting ability". The ability added is the one the cast's Spellcraft check rolled off:
  - the tradition's own ability for a spell from a granted tradition;
  - the archetype's ability for an archetype cantrip;
  - the spell's own ability for an innate spell;
  - otherwise, the sheet's casting ability.
- **Hurling now uses it, and the note is gone.**
- **Characters who already have Hurling.** Characters carry their own copy of each spell, so fixing the compendium alone would not reach them.
  - The migration prompt updates each character's copy: the damage gains the ability, and the note is removed.
  - A copy that someone has edited by hand is left alone.
  - The migration pass and the schema stamp are now 3.666.1.

## Nimble Dodge was never offered to the player

Graham: "Nimble Dodge still isn't giving any option for the player to use."

**Cause.** 3.666.0 made Nimble Dodge spend its reaction and last one attack. But the only way to take it was the Use button on the defender's own sheet. The attack is rolled on the attacker's screen, so the defender's player was never asked before the roll.

**The fix:** a defence offer.

- **When it asks.** Before an attack is rolled, the system asks whether the defender takes a reaction. This happens on all four kinds of attack: a Strike, a spell attack, a bomb, or a spiritual weapon.
- **Who is asked:**
  - the defender's own player first;
  - then any other connected player who owns it;
  - and the GM for a creature nobody connected plays.
- **What is offered.** Only reactions the defender could take right now. Nimble Dodge is not offered:
  - in combat, with no reaction left;
  - while a condition forbids reactions (flat-footed, confused, Full Defence, a fumble's "no reactions");
  - with an ACP or while encumbered;
  - while it is already up.
- **No prompt otherwise.** If there is nothing to offer, nobody is asked, so ordinary attacks are not slowed down.
- **On a yes:**
  - the feat's own Use runs on the defender's player's screen, which owns the sheet;
  - the reaction is spent and the +2 dodge goes on;
  - then the attack is rolled against the raised DB, which the attack spends as before.
- **If nobody answers.** A player who doesn't answer within 30 seconds counts as a no. The attacker is told so.
- **For companion modules:** `registerDefenceOffer(name, {summary, against: "attack"|"weapon", find, requires, use}, moduleId)`. Inner Tempest 0.3.2 uses it for Evade and Impact Absorption.

## Checks

- **New harness pair:** `verify/mutate-session-fixes-1022`, 44 checks and 36 mutations, all caught.
- **Shipped late:** `verify-natural-ready`'s E1 and E2 (a natural attack is the "other weapon" for Double Slice and Parry), with their two mutations. They were written after the 3.666.0 zip was built.
- **Re-anchored, without changing what they test:**
  - chapter10-321-330 W5: the soul mark is written through the GM;
  - focus-default D3: the stamp has moved on past its pass;
  - drive-3622's stamp mutation.
- **The uncalled-export ratchet:**
  - `defenceOffersAgainst` is no longer exported;
  - `reapsHere` and `defenceAnswersAttack` are kept for their harnesses, with reasons;
  - `oneAttackSpec` and `oneAttackUsedBy` left the keep list because the defence offer now calls them.
- **Companion modules:** Inner Tempest 0.3.2 ran against this release: `verify-block1` 374 and `verify-block2` 202 checks, all green; `mutate-block1` 54 and `mutate-block2` 87 mutations, all caught.
- **Full sweep: 613 of 613 green.** It ran on a clean stage: the 3.666.0 release plus exactly this release's changed files and the spells pack.
