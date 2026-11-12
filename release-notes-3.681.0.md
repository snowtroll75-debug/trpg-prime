# TRG Prime 3.681.0

3 November 2026. Reaction seams for *Eldritch Arts* Block 3b. Graham approved the proposals on 2 November 2026 ("Go with your proposals"), with rulings Q26–Q35 as written in the module's `docs/ELDRITCH_ARTS_BLOCK3B_AUDIT.md`.

- **Install over 3.680.1.** No migration and no world data changes.
- **Eldritch Arts 0.6.0 needs this release.** Eldritch Arts 0.5.1 and Inner Tempest 1.0.4 run on it unchanged.
- **With no module registering a reaction, play is unchanged.** Every new window is an empty loop over an empty registry. The card's new `locked` flag is only set when a reaction rerolls a check.

## New: five places a module's reaction is asked

Each is a registry in `module-api.mjs`, exposed on the module API. A module adds an offer to it. Each offer is wrapped, so a failing offer is logged and skipped, and one module cannot stop another being asked.

| Registry | When it is asked | What an offer may answer | Used by (Eldritch Arts 0.6.0) |
|---|---|---|---|
| `registerCheckReaction(key, {before, after})`, **before** | An attack, save or skill check, before its dice are rolled. Not for flat checks, or checks with preset dice or preset modifiers. | Advantage, combined with the roll's other advantage and disadvantage in the usual way. | Prophetic Warning |
| `registerCheckReaction`, **after** | The same checks, once the result is final: after the roller's Conviction card and fumble reroll, before the result is used. | **One reroll.** It uses fresh dice and the same modifiers, and drops the first roll's Conviction die (Q27). The second result is **locked**: no Conviction, Lucky Break, rods, held bonuses, Devotion downgrade, natural defence or fumble reroll. | Missed Chance, Second Chance |
| `registerDamageReaction(key, offer)` | Before a packet of typed damage meets the target's defences. That is weapon damage, the five spell-damage sites (attack packet, rung, alternative, basic save, heat), spell effects' damage, and `applyTypedDamage`, plus the missile storm and a spell's triggered strike. Asked once per creature per cast or per strike. | Resistance or immunity, either to that blow alone or until the cast or strike is over. | Resist Magic, Phase Familiar |
| `registerCastReaction(key, offer)` | After a caster's own check, when the degree is Success or better, before anything lands. Every cast counts, innate spells and cantrips included (Q33). | Stop the cast. It then resolves as a failure and nothing lands. The first stop ends the asking. | Disrupting Magic |
| `registerCriticalReaction(key, offer)` | When a critical hit is confirmed, weapon or spell, after Harmony Edge. | Disadvantage on the critical roll, combined with its bias: against a deadly critical's advantage the roll is normal (Q35). The module does its own spending, here a Conviction point. | Eternity Resilience |

**Which client answers.** `registerReactionStep(name, run)` names the work the reactor's own client does once the answer is yes. `askReactor(actor, …)` asks the reactor's player if one is online and otherwise the GM. That is the rule `defenceAnswerer` already uses for defence offers (Q34).
- The ask goes over the socket (`reaction.ask`, `reaction.accepted`, `reaction.answer`) or is shown locally when this client is the answerer.
- **No answer in 30 seconds counts as "no".**
- Once a "yes" is accepted, the step has up to five minutes to finish. A step can take that long when it opens a dialog, such as the Dispel roll.

## New: granted defences (`combat/granted-defences.mjs`)

A damage reaction's resistance or immunity is held as a grant on the asking client, where the damage is worked out. `actorDefences` (in `creature-traits.mjs`) merges the grants in, so every damage path reads them with no change of its own.
- **Instance grants** end when that creature's damage is written: `applyTypedDamage` and `applyDamageAndCheckDying` both call `clearInstanceGrants`. An instance grant whose blow never reaches the HP write lapses after a minute.
- **Cast grants** end when the cast settles, or when the weapon strike they were made in is over: a strike is a scope too. `castSpell` is now a wrapper that opens a cast scope, calls the old body (now `castSpellResolved`), and closes the scope even when the cast throws. Nested casts each have their own scope.
- **`askOnceThisCast`:** a creature hit by several packets of one cast is asked only once.
- **`combat/damage.mjs`:** immunity to "all damage" is honoured, alongside the existing resistance to all damage.

## Changed

- **`dice/check.mjs`:**
  - New fields: `reactionAs` (a spell attack is asked as an attack), `locked`, and `checkReactionsBeforeAsked`. The last is set on rerolls, so a reroll does not ask for advantage again.
  - The before-window sits after the rods and before Conviction's advantage. The after-window covers saves and skills; attacks ask theirs in `attack-workflow` and `cast-workflow`, where the hit is known.
- **`dice/check-card-interactions.mjs`:** a locked card offers no held bonuses, Devotion downgrade or natural defence.
- **`combat/attack-workflow.mjs`:**
  - The hit is decided by `outcomeOf`, so a reroll can decide it again.
  - Critical reactions are asked after Harmony Edge.
  - Damage reactions are asked before the target's defences.
- **`combat/attack-reroll-workflow.mjs`:** a reroll's fresh dice skip the before-window.
- **`magic/cast-workflow.mjs`:**
  - The cast-reaction window comes before `castingOutcome`.
  - A spell attack's after-window rerolls through `rerolledSpellCheck` and drops the Conviction die.
  - `spellDamageReactions` serves the five damage sites.
  - The return carries `warpPP` (warp plus manipulation PP), which Phase Familiar reads.
- **`magic/spell-effects.mjs`:** `applyDamageEffect` asks before each packet.
- **`combat/damage-workflow.mjs`:** `applyTypedDamage` takes `magical` and `spellName`, asks before the defences, and puts the reaction's lines first on the card.
- **`combat/action-workflow.mjs`:** `resolveAction` takes `presetDispel` ({effectValue, dc, what}) for the Dispel dialog's defaults, so a module can roll a Dispel at a cast it is answering.
- **`magic/save-reaction-spells-workflow.mjs`:** `castAsReaction` is exported. The module API exposes it, together with `askReactor`, `convictionState` and `spendConviction`.
- **`scripts/trg-prime.mjs`:** `registerReactionAsk()` is called at ready, after `registerDefenceOffers`.

## Found in review

Two independent reviews found the following: one of the build, and one of the first review's fixes. Each item is fixed, with a check and a mutation.

- **A weapon strike is now a scope, like a cast.** `resolveWeaponDamage` is a wrapper around `resolveWeaponDamageInScope`.
  - **Before:** a grant for the strike was cleared when the weapon's own packet was written. Its runes, riders and typed extras landed after that, with no grant.
  - **Now:** a damage reaction's answer covers the whole strike, and the creature is asked once.
- **A reroll of an already-asked check keeps the advantage the reaction gave.** The check carries a new `reactionAdvantages` field, and Alter the Thread's and Fortune's Reversal's rerolls pass it on.
  - **Before:** Prophetic Warning's advantage, already paid for, was lost on those rerolls.
- **The weapon attack card shows the reaction's lines and its "rerolled (a → b)" line.** The card's own detail lines used to overwrite them.
- **A rerolled attack's fumble is checked afresh.** It no longer reuses the first roll's early confirmation.
- **Every spell-damage site now asks before its packet** (`spellDamageReactionsFor` in `reactions/reactions-workflow.mjs`). The new sites are the missile storm, a triggered strike, a storm, a flat ladder, a spiritual weapon, a directed strike, a recurring ladder, the elemental nexus, an emanation, an area's save (walls), hazard terrain, thorns, a sanctuary's bite and a spell prison's escape.
  - **Inside a cast,** the answer is that cast's.
  - **On a later turn,** the answer is that blow's. So damage a spell goes on dealing (a wall, a storm, an emanation) is now asked about too.
- **An answerer who disconnects counts as "no" at once.** The roll is no longer held for up to five minutes.
- **Live system data points back to its actor** (`documents/actor.mjs`, `prepareBaseData`). The system registers no Actor data model, so `actor.system` had no `parent`. `actorDefences(system)` could not tell whose a grant was, and **every granted defence was ignored outside the harness**.
  - The pointer is set again at each preparation and is not enumerable, so nothing that walks, copies or serialises the data sees it.
  - A data model's own `parent` would be left alone.
- **A question's scope is read when the question begins** and carried through it. Before, it was read when the answer came back, by which time another flow on the same client may have opened a scope (a GM resolving a strike while their cast waits).
  - A grant tied to a scope that has since closed is held as that one blow's.
- **The before-roll line (Prophetic Warning's) reaches the weapon attack card,** through `check.reactionBeforeLines`.
- **A Dispel aimed at a spell being cast** (`presetDispel`) no longer reads the reactor's own target. No peril's DC, refusal or banked counteract can come from it.
- **`castRefusalReason(actor, spell)`** (on the API as `castRefusal`) asks quietly whether a cast would be refused: by Rage, by a module's refusal (an antimagic zone, Magic Suppression), or by a critical's "cannot cast". Eldritch Arts uses it for Disrupting Magic, which is a spell but is rolled as a Dispel.
- **A stopped cast is marked `disrupted: true`** on `trgPrimeSpellCast` and `trgPrimeSpellSettled`.
  - It still resolves as a failure, so a listener that acts on a failure still does.
  - **For Graham:** in an Eldritch Arts Wild Magic area, a disrupted cast therefore surges. That is how the ruling reads ("resolves as a failure"), but it is now a choice that can be reversed.
- **The warp a cast paid for** is put on the outcome that `castSpell` returns, so the return line keeps its old shape.

**Limits, kept and recorded:**
- **One client's scopes form a single stack.** A question is now tied to the scope it began in, but a grant made with no question (none today) would take whatever the top is.
- **An answer that arrives after the 30 seconds** has already done its work (PP and the reaction spent), but the asker has moved on. The answerer's dialog closes at 28 seconds, so this needs more than 2 seconds' lag.
- **`castRefusalReason`** doesn't ask about Force 39's Spell Concentration (a check to pass, not a refusal) or a spell's traits (Utility, Warding: nothing to refuse).

## Not asked

- **A turn's bleeding or burning** (`documents/combat.mjs`), and damage of no type. These are not a spell's damage, and no typed packet is met.

## Harness

- **New pair: `verify-ea-block3b-core` (110 checks) and `mutate-ea-block3b-core` (103 mutations, all caught).** Both counts include both reviews' fixes.
- **Re-anchored** for the new code shapes, with the same assertions:
  - `verify-block3-core` D4/D5 and its mutation file;
  - `verify-block5-core` D4/G1 and its mutation file;
  - `verify-block6-core` C10;
  - `verify-fixes-3669-1` C4;
  - `verify-casting-dc` G5b/G5c and its mutation (`let total = attackTotal.total`);
  - `verify-spell-attack-bonus` F6;
  - `verify-thorns`, `verify-counter-perform` and `verify-strike-riders`: their bodies are now `castSpellResolved` and `resolveWeaponDamageInScope`;
  - `verify-block5-core` D4 and its mutation: the fumble reroll carries the advantages;
  - `verify-block3-core` D4 and its mutation: Alter the Thread's reroll carries them;
  - `mutate-ea-block2-core`: the settled hook's line now names `disrupted`;
  - the four pairs named under the sweep below.
- **Version checks:** `verify-teleport-movement` now reads "3.680.1 or later", and `verify-ea-block3a-core` "3.680.0 or later".
- **Re-pinned to 3.681.0:** the version anchors of fourteen mutation files. `system.json`'s download now names v3.681.0.
- **Uncalled-export ratchet:** keeps were added for `resetGrantedDefences`, `askReactor`, `castAsReaction` and `castRefusalReason`. The last three are reached only through the module API's dynamic import.
- **Full sweep** (the list `tools/verify.mjs` runs, 667 harnesses with the new pair, in two shards on two copies checked identical to the source, after both reviews' fixes): **660 passed as they stood.**
  - The other seven were four older pairs whose anchors this release moved. They were re-anchored with the same assertions and pass, verify and mutation alike: `verify-double-slice-3668-2` A2, `verify-ea-block1-core` C10, `mutate-ff30-block12` and `verify-offered-conditionals` C4.
  - Nothing is unpaired or unrun.
  - After the re-anchoring, `verify-no-undefined-names`, `verify-rules-have-callers` and `verify-checks-can-fail` were run again on the source, and all pass.
- **Inner Tempest 1.0.4 on 3.681.0:** Blocks 1–4, 6–10 and the weapons all green. Block 5's harness reads the book's text, which isn't in this workspace.
- **Eldritch Arts 0.6.0 on 3.681.0:** see its release notes.
- **Packs:** unchanged. The release ships the 3.676.1 pack files byte for byte.
