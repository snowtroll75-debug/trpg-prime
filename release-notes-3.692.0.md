# TRG Prime 3.692.0: the fixes before Eldritch Arts Block 10

15 November 2026. Graham asked for these before Block 10 ("Work through the fixes before moving onto Block 10") and answered the four open questions the same day, taking the recommendation each time. **Eldritch Arts 0.16.0** uses all of this and needs this release.

## Graham's answers

- **"Innate spells aren't stored."** An armed Spell Storing window no longer takes an innate cast (the Mercy of Relief case). The spell takes effect as cast.
- **Catalysts that name a "Spellcraft check" are dropped on a mundane ritual**, whose check is a tradition skill. The core's part: a ritual's cast items are told the skill it rolls, `checkSkill` (`""` for Spellcraft). The module does the dropping.
- **A specialist spell released from an item reads as the releaser's tradition**: kept as built.
- **All five of Block 7's deferred seams**, below.

## The five seams

1. **Thorns whose type is chosen when struck** (Glyph of Retribution: "+4 PP: change the damage type to either acid, cold, electricity or fire each time you are struck").
   - A thorns row may carry `typeChoices`. Each time its wearer is struck, the wearer's player is asked which type this blow deals, before the damage is resolved against the attacker's defences.
   - The question goes through a new owner choice, `askOwnerChoice`. That is the yes/no owner query's sibling: the wearer's player is asked first, then the GM, then this client, with the same one-minute window.
   - Unanswered, the printed type stands and the card says so. A single offer is taken without asking, and nothing is asked when the save left nothing to deal.
2. **A Region that gives off light** (Arcane Mycelium: "emits dim light").
   - A Region flag, `emitsLight: { level, label }`, raises the level inside it to at least that level, as a magical light source does.
   - It is read with the light sources, before the spells that shift the level and the weather.
   - It never dims a brighter place, and Abyssal Darkness still devours it.
3. **An action resolved at a total already rolled** (Spirit Arrow: "treated as a Feint, Grapple (1 round), Shove or Trip action using the attackers attack result").
   - `helpers.resolveBasicActionAtTotal(actor, target, actionKey, { total, label, rounds })`, over the basic and skill actions.
   - It brings the action's own rules, as Graham ruled for Tanglefoot: its DC, its printed difficulty (a Feint is Hard) and its size penalty.
   - It lands the degree's conditions, a Shove's push and the action's clock (or `rounds`, when the caller prints one). It records who holds the grab or made the feint, as the action does.
   - It rolls nothing and spends nothing. A target the client may not write to is resolved on the GM's client, through a new relay action, `ACTION_AT_TOTAL`. The asker must own the acting creature.
   - `trgPrimeStrikeResolved` now carries the attack `total` (the rerolled one, if a reaction rerolled it).
4. **A halved speed** (Eaog Balls: "The target's speed is halved").
   - A new spell row, `speedHalve`, with an optional `duration` of its own (the Critical's "until the end of their next turn").
   - It lays an effect, through the relay, carrying `movementHalved`. The movement derivation halves every speed the creature has, last, after armour, load, forms and grants, rounded down to 5 feet.
   - Two halvings do not quarter it.
5. **A Sustain hook** (Metamagic Resonance: "+2 PP: the caster may change the chosen metamagic feat each time they sustain the spell").
   - `Hooks.callAll("trgPrimeSpellSustained", { actor, entry, castId, spellName })`, after a Sustain is paid and posted, unless it ran the spell out of Power Points.
   - Effortless Spell's free Sustain calls it too, with `effortless: true`.

## Found in the independent review, and fixed

- **A player's Eaog Balls on the GM's creature threw.** The first build created an item on the target, which a player may not do, and the throw unwound the cast before its Result card. The halving now rides a relayed effect.
- **A player's Spirit Arrow wrote to the GM's creature.** The conditions' round stamp, a Shove's token move and the new grab and feint records were direct writes. The whole action now runs on the GM's client for a target the player doesn't own.
- **Spirit Arrow's grapple and feint now record who made them** (`grabbedBy`, `flatFootedFrom`), so Constrict, Swallow and Unseen Assault read them. Out of combat, the card says the clock must be cleared by hand.
- **Emitted light in Abyssal Darkness.** It raised the level there. It now follows the light-source rule.
- **The thorns question** is no longer asked when the save left nothing to deal.
- **Effortless Spell** now fires the Sustain hook.

## The harness

- **New pair `verify-fixes-3692-0`** (41 checks) and **`mutate-fixes-3692-0`** (48 mutations, all caught).
- **Re-anchored**, to the same lines:
  - the Strike hook's new `total` and the ritual's `checkSkill`: `verify-block6-core` C10, `verify-block7-core` C9, `verify-block9b-core` H22, `verify-block9a-core` R2;
  - the six Spell Storing pairs, for `storesThisCast`;
  - `mutate-light-shift` O1 (the sourced level is now `sourced`), `mutate-thorns` R3 (the type printed is this blow's), `verify-block9-core` R2 and `mutate-block9-core` (the yes/no question's late-answer guard, now beside the choice's own).
- `uncalled-exports.json` keeps `resolveBasicActionAtTotal`: a module helper reached by dynamic import.
- Version pins raised to 3.692.0.
- **Full core sweep** (4 shards, 747 verifiers and mutation files): 3 failures, all anchors of the kind above (`mutate-thorns`, `mutate-block9-core`, `mutate-speed-pool`), none in the code. The first two were re-anchored; for the third, the new halving loop was written so the old anchor is unique again. All three rerun clean, and every verifier passes on the final tree.
- **Independent review:** its two blockers (a player's Eaog Balls and Spirit Arrow on the GM's creature) and the other points above are fixed. It confirmed the Spell Storing gate, `checkSkill`, the thorns choices surviving the cast, the light's shape for every caller, the halving's order, the Sustain hook's cast id and the Strike's `total`.
- **Eldritch Arts 0.16.0:** all 27 module verifiers pass against this release, and all 26 of its mutation files catch every mutation.
