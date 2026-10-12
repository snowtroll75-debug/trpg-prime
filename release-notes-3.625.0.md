# TRG Prime 3.625.0 — what a companion module's rules need to say

7 October 2026. Built on Graham's 3.624.2. Eleven small openings for Pillars of Faith 0.7.0's automation pass (Graham, 6 October: "ensure that the content you are adding from Pillars of Faith is fully automated"), each the shape of something the system already does, each declared as data a module can write rather than a name the system has to know. Nothing core changes behaviour unless a declaration is present.

## A class may decline the Divine Aspect (aspect-rules, config, module-api)

3.623.0 infers "needs a Divine Aspect" from a divinity tradition with a caster style, so the Archivist and the Healer — divinity casters whose book says they need none — got the banner. `registerClass(name, { needsDivineAspect: false })` is now an explicit decline (`declinesDivineAspect` on the record; `classDeclinesDivineAspect` in config); `divinityCasterSources` takes `classDeclinesAspect` and skips the inference, while an explicit need still wins. Pair verify/mutate-aspect-decline (11/4).

## A feat may grant a warping option (magic/granted-warps, module-api)

Swift Mender ("PP Cost +4: a Healing spell for 1 AP less"), Renewed Restoration ("+4 PP: ignore Restoration's daily limit") and Guiding Luminescence ("the innate Guidance takes two targets") are warps that belong to the caster. `registerSpellWarps(featName, [{ match: { name?, traits?, tradition?, innate? }, warp: { ppCost, text, mods, max? } }])`; `grantedSpellWarps` matches the owned feats' entries to the spell, and the cast reads the spell's warps plus the granted ones at the chooser, both aggregations and the Warp Manipulation prompt (`warpSpell`). An innate cast's free budget covers them like any warp. New warp mod `ignoreDailyLimit`, honoured by the conditionRelief case's daily-limit gate. Pair verify/mutate-granted-warps (19/5).

## Riders on the caster's own healing (magic/healing-riders)

`flags.trg-prime.healingRider { lowHalfBonus: "halfLevel"|n, dyingHalf, maximiseOneDie, oncePerRound }` on the caster's effects. The heal case reads them before the roll: +half level (min 1) when the target is at half HP or fewer and is not the caster (No Life Abandoned); one die of the formula maximised as a formula transform, "3d6+6" → "2d6 + 6+6", once per round (Vital Surge); and `healActor({ dyingHalf })` gives a Dying creature half the heal on top of the Dying step rather than nothing (Resurgent Healing), across the relay too. Marker `healingRidersUsed` resets with the round. Pair verify/mutate-healing-riders (19/6).

## Strike riders the strike resolves itself (magic/strike-riders)

A `strikeRider` may now declare `targetTypes`, `onCritical`, `lowHalfHp`, `weaponNames` and `oncePerRound`; `riderPacketsFor(specs, weapon, ctx)` resolves a gated rider from what the damage path knows (creature types, the critical, the target's HP before the blow, the weapon's name) and the packet arrives decided — applied, or printed as not fired with its gate named. A once-per-round rider burns a marker (`strikeRidersUsed`, reset each round) instead of being spent. `spendOn: "hit"` keeps a once-rider through a miss (Dragon's Breath Reed's "next successful Strike"; the core spells keep the resolve-spends-it ruling). Pair verify/mutate-gated-riders (20/7); verify/mutate-strike-riders re-anchored.

## Attacks that count as magical (combat/magical-attacks)

`flags.trg-prime.magicalAttacks { targetUuids?, weaponNames? }` on the attacker's effects makes the damage packet's `magical` true for the strikes it names — Sanctioned Strike against the Judged Subject, Consecrated Armament with the favoured weapon — beside the potency rune and the runed round. Pair verify/mutate-magical-attacks (10/4).

## A rider on the caster's spell damage (magic/caster-damage-riders)

`flags.trg-prime.spellDamageRider { dice, damageType, when: { damageTypes, targetTypes }, oncePerRound }` — Consecrated Flame's "+1d6 secondary Essence the first time each round a fire spell damages an undead". One helper in cast-workflow, reached from the attack path after the holy half and from the save path after the second pool, rolls it, resolves it as its own type and burns a per-creature marker (`spellDamageRidersUsed`, reset each round). Pair verify/mutate-caster-damage-riders (12/5).

## Power Recovery extras, and a companion restore on Refocus (rest/recovery, combat/refocus)

`powerRecoveryExtra { degrees, perCasterLevel, flat }` adds to `powerRecoveryBonus` on the named results (Spiritual Reserve). `refocusAlsoRestores { names }` makes a successful Refocus (Success and better) also restore one of the named spent Focus abilities, chosen when two qualify, on the same timing (Deepened Bond; "you cannot restore the same ability twice"). Pair verify/mutate-recovery-companions (12/5).

## Four small hooks (feats, conditionals, skill-aid, documents/combat)

An action entry may carry `variants: [{ feat, apCost?, outcomes?, note? }]` and `applyActionVariant` swaps in the owned feat's version, named on the card (Guide the Last Road, Waywarden). Conditional `valueFrom` may name an ability or a difference of two figures (`"intelligence-wisdom"`), so an ability swap is an offered modifier (Scholarly Exegesis). `aidBoost { value, max }` raises a successful Aid's circumstance bonus (Practical Counsel). `Hooks.callAll("trgPrimeInitiativeRolled", { actor, combatant, combat })` fires per combatant after the system's own offers (Battle Remembered). Pair verify/mutate-feat-hooks-3625 (17/6).

## A spell cast in answer to a save, as a row (magic/save-reroll)

`{ kind: "saveReroll", degrees, immunity }` with warp mods `rerollDegrees` and `rerollBonus`: the save path offers every creature on the saver's side holding such a spell, in range and able to react, the cast once the degree is known — Lucky Break's shape, cast by somebody else (Saintly Intercession). The saver rerolls (with the bought status bonus), keeps the second result and is immune to that spell for the row's time.

## Relief reaches two more conditions (magic/condition-relief)

Sickened and Frightened join RELIEVABLE (step 1): Bloom of Renewal, Share Burden. Dazzled is not valued and stays out.

## Judgement's rider grows (combat/damage-riders)

`strikeDamageRider.lowHalfExtraDice` adds dice when the struck creature is at half HP or fewer (Final Sanction).

Sweep green; the per-rule pairs are listed above.
