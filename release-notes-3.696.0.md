# TRG Prime 3.696.0: the rest of the Pillars of Faith core proposals

16 November 2026. Graham asked for these: "I would like you to build CD1-CD9 and Cd12". They are the remaining core proposals from the Pillars of Faith automation audit (module 0.12), numbered as in `pillars-of-faith-core-dependencies-0.12.3.md`. Pillars of Faith 0.12.4 requires this release, and uses every addition except CD9.

Every addition is opt-in. A row, rider or reaction that declares none of the new fields behaves exactly as it did in 3.695.0.

Three of the ten were already in the core and needed no new code. They are listed at the end, with the existing seam each one uses.

## CD1: a check reaction can keep the better result

- **The rule.** "Reroll … and use the better result", several with advantage. Examples: Spirit Intercession, Continuity Unbroken, Vowbound Resolve, Revelation in Crisis.
- **Before.** A `registerCheckReaction` `after()` answering `{reroll: true}` always kept the second result.
- **Now.** `after()` may also answer two new fields:
  - `advantage: true` rolls the reroll with advantage;
  - `keepBetter: true` keeps the better of the two results. Better means the higher degree; if the degrees are equal, the higher total. An exact tie keeps the second result.
- **The card.** It names both totals and says which one stands ("the better, 17, stands and cannot be modified or rerolled").
- **Unchanged.** A plain `{reroll: true}` still keeps the second result, with the old wording.
- **An ally's save.** `ctx.token` is already the saver's token, so a module can find a reactor near it. Pillars of Faith 0.12.4 does this for Spirit Intercession: a 7th-level Shaman within 30 feet is asked.

## CD2: filtered strike riders

A `strikeDamageRider` effect may now declare any of these:

- **`weaponNames: ["Bite", "Fangs"]`.** The rider applies only to a weapon of that name. "Bite (Blood Awakened)" counts as Bite.
- **`damageType: "essence"`.** The rider's dice roll as their own packet of that type, against that type's defences. Without it, the dice add to the weapon's own damage, as before.
- **`targetLiving: true`.** The rider skips constructs, undead and anything else `isLivingCreature` reports as not living.
- **`spells: true`.** The rider also reaches a spell's damage. See CD12 below.
- **`spellClasses: ["Grimward"]`** (with `spells`). Only that class's specialist spells are admitted. Judgement's "the first Strike or Grimward spell" is the example.
- **`onCritical: { conditions, effect, label }`.** On a critical against an admitted target, the rider lays these conditions (for example Bleed 1, Hunter's Fangs) and/or this effect. This happens after the injury roll. It is not limited by the once-a-round burn.
- **A critical-only rider.** A rider with `onCritical` may leave out `dice`, as Hunter's Fangs does. It adds nothing to a blow and is read only on a critical. A rider with neither `dice` nor a usable `onCritical` is dropped, as before.

Blood Awakened's "+1d6 essence once a round with a Bite or Fangs against a living creature" is now a single declared rider. Judgement and Restless End are unchanged.

## CD3: a counteract row that always asks, and warps that raise its limit

- **`confirm: true`** on a `counteract` row always prompts the caster, even for a single candidate. The prompt offers a "None of these" button. This covers Break the Evil Eye and Sever Influence against Charm and Compulsion. Those are Enchantment in TRG Prime, a trait Bless and Heroism share, so the caster is asked rather than the row guessing.
- **The new `counteractLimitBonus` warp mod** adds to the row's limit. It covers the "+1 additional effect" warps, for example Break the Evil Eye, Sever Influence and Sever Soulchain.
- **The prompt honours the limit.** When the limit is above 1, the prompt shows checkboxes and returns up to that many effects, in the order they were listed. Before, it always returned one.

## CD4: damage reduction against one damage type

- **The flag.** `flags.trg-prime.drVersus: { slashing: 1 }` on an Active Effect adds that DR against that damage type only, for example Ossuary Lamellar.
- **How it applies.** It joins the armour DR pool before the swarm halving. Disabled and suppressed effects don't count.

## CD6: a shield's bash can carry a maneuver trait

- **The flag.** `flags.trg-prime.bashTraits: ["shove"]` on a shield, for example Ossuary Board: "A Shield Bash … gains the Shove trait".
- **What it does.** When no equipped weapon has the Shove trait, a Shove Attack is made with that shield. This applies only if the shield is equipped and has a Shield Bash damage. The card names it ("Shove Attack with Ossuary Board's Shield Bash (shove trait)").
- **Mechanical effect.** It is small. The trait's rule is "use your attack bonus with the weapon", and a shield's bash usually carries no attack bonus. So the visible result is mostly the named row, plus anything `weaponManeuverModifiers` finds for the shield.
- **Not done.** Brace (the Last-Road Spear) remains a separate rules question.

## CD7: a degree's stated bonus raised by a feat

- **The new field.** `registerDegreeUpgrades(feat, [{ actionKey, degree, bonusValue }])` registers a feat's value for the bonus that a given degree of an action states.
- **The example.** Expert Autopsist makes Perform Autopsy's Critical "+2" a "+4".
- **The card.** It says so ("Expert Autopsist: the circumstance bonus is +4 instead of +2").
- **Safeguard.** The raise is ignored if its sign differs from the stated bonus's.
- **Unchanged.** The existing `{ actionKey, from, to }` degree upgrades work as before.

## CD9: a heal announcement

- **The new hook.** `Hooks.callAll("trgPrimeSpellHealed", { caster, target, spell, healed, excess, dying, ppSpent, castId })` fires for each creature a spell heals, after the overheal hook.
- **What it allows.** A module can offer "when a healing spell you cast restores HP…" abilities, such as Gift of Healing, Healer's Touch, Restorative Hands, Lifebound Ward and Rejuvenating Surge, at the moment they trigger. The amounts and the PP are already known.

## CD12: riders on spell damage, and a critical rider's effect

- **The HP half was already in the core** (3.625.0). `lowHalfExtraDice` grows a rider against a target at half HP or fewer, and the Strike passes the target's HP.
- **Spell damage.** A rider declaring `spells: true` now applies to a spell's damage too (`applySpellStrikeRiders` in `cast-workflow.mjs`). It does so once per cast, after defences, and it burns its once-a-round marker. It rolls in its own `damageType` if it has one, otherwise in the spell's.
- **On a critical.** `onCritical.effect` (CD2) lets a rider such as Final Sanction lay its critical effect without a Use press.

## Also: the Mummy Rot cure steps roll blind

- **The problem.** In 3.695.0 the GM was whispered each step's true result, but the counteract card itself was public. It showed the degree, so the caster could read it.
- **The fix.** The counteract check for an affliction with a cure order (`cureSequence`, or Fiends & Fables' Mummy Rot by name) now rolls blind, per "some GMs may require this to be a secret check".
- **Unchanged.** Other counteracts still roll publicly.

## Already in the core: CD5, CD8 and the HP half of CD12

- **CD5, forced-movement reduction.** `flags.trg-prime.forcedMovementReduction: 5` is already read by `forced-movement-workflow.mjs` before a push, and named on the card. Deep-Rooted Ironcap declares it in the module.
- **CD8, lowering a critical's severity.** `registerCriticalReaction(key, { after })` already answers `{ severitySteps: -1, line }` (3.685.0). The same dice are read one severity lower. Redundant Anatomy registers it in the module.
- **CD12 HP.** See CD12 above.

## The harness

- **New:**
  - `tools/verify-fixes-3696-0.mjs`: 38 checks.
  - `tools/mutate-fixes-3696-0.mjs`: 35 mutations, all caught.
- **Re-pointed:**
  - `verify-block35` G8: the counteract prompt condition is now the row's limit plus warps, or `confirm`.
  - `verify-save-reroll` F3: the Strike's rider call carries more fields, so the window was widened.
  - `mutate-ea-block3b-core`: the "second result stands" anchor follows the new keep-better branch.
  - `mutate-damage-riders`: the named-target filter moved into `riderAdmits`. The duplicate check in `damageRidersFor` was removed, because it left the mutation nothing to break.
  - `degreeBonusFor`'s local was renamed so that `mutate-module-api`'s anchor is unique again.
- **`tools/uncalled-exports.json`.** `keepFirst` and `chosenCandidates` are kept as harness-only pure helpers. `bashTraitShield` and `riderAdmits` are no longer exported.
- **Version pins** were raised to 3.696.0.
- **Full core sweep.** All 751 verify and mutation files were run to completion on shards of the tree, including `mutate-fixes-3685-3b` (56 mutations, about 50 minutes).
  - Every failure was a check this release had to re-point, listed above. Each was fixed and re-run on the final tree.
  - Every verify file was also re-run on the final tree: **0 failures**.
  - `verify-checks-read-source` (the meta check) passed: 1,666 (check, file) pairs.
  - `mutate-checks-read-source` was not run to completion; each pass exceeds the shard limit.
