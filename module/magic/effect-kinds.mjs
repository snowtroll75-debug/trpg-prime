/**
 * EVERY EFFECT KIND THE APPLIER CAN REACH.
 *
 * NEW at 3.503.0. Pure; no Foundry.
 *
 * ──────────────────────────────────────────────────────────────────
 * WHY THIS IS A LIST AND NOT A GUESS.
 *
 * `spell-narration.mjs` decides whether a spell has nothing mechanical
 * to say, and prints its whole description on the card when it does not.
 * It used to decide with a hand-written list of NINE kinds — against the
 * FIFTY the applier actually handles. Forty-one were missing, so 42
 * spells printed their card lines AND their full description underneath,
 * saying everything twice: Warped Terrain, Vital Beacon, Flaming Weapon,
 * Stabilise, Umbral Veil and Sacrificing Shield among them.
 *
 * IT WAS NOT AN OVERSIGHT THAT ACCUMULATED; IT WAS THE SHAPE. A list
 * maintained by hand beside a switch statement drifts the first time
 * somebody adds a case and does not think about narration — which is
 * every time, because the two files have nothing to do with each other.
 *
 * ──────────────────────────────────────────────────────────────────
 * SO THE LIST IS DECLARED HERE AND PROVED ELSEWHERE.
 * `verify-effect-kinds-handled` parses the applier's own cases and
 * asserts this array is exactly that set. It cannot drift, because
 * drifting is a failing check rather than a quiet Tuesday.
 *
 * ──────────────────────────────────────────────────────────────────
 * SIX OF THESE PUSH NO LINE OF THEIR OWN, and that was measured before
 * the rule changed rather than discovered after: elementalNexus, splash,
 * missileStorm, areaRider, difficultTerrain and hazard are written onto a
 * Region or resolved in `cast-workflow`, which prints for them. So no
 * spell is left with a silent card by standing its description down.
 */

export const HANDLED_EFFECT_KINDS = Object.freeze([
  "areaRider", "attack", "attitude", "bonus", "condition",
  "conditional", "conditionRelief", "conjureItem", "counteract", "counteractPeril", "counterPerform", "damage",
  // NEW at 3.630.0. A timed effect carrying the flags another rail reads —
  // a death guard, a save improvement, a next-damage boost, a declared
  // Success, Death State. See magic/declared-effect.mjs.
  "declare",
  // NEW at 3.630.0. A condition removed outright, and a resource given
  // back — see magic/restore-rows.mjs.
  "conditionRemove", "restore",
  // NEW at 3.630.0. A disease or poison counteracted (Nine-Herb Restorative),
  // a counteract rolled with its rung printed (Exorcise), and a fact read off
  // the target's sheet (Analytical Glance) — see magic/reveal-fact.mjs.
  "counteractAffliction", "counteractRoll", "revealFact",
  // NEW at 3.611.0 (block 34): a critical injury as a rung's own outcome —
  // Woeful Dread's four, one inside its follow-up save.
  "criticalInjury",
  "dcThreshold", "deathResonance", "defence", "defenceDC", "delayedRespite",
  // NEW at 3.599.0. A condition that arms and waits until the creature walks
  // too far from the caster — see magic/distance-trigger.mjs.
  "distanceTrigger",
  "difficultTerrain", "elementalNexus", "elementalShield",
  // NEW at 3.606.0. Snagging Pit drops its victims through the falling
  // rules — see combat/falling-workflow.mjs's `onto`.
  "fall",
  "flatLadder",
  // NEW at 3.606.0. Startle's forced Step — the Shove button's own planner,
  // called by the spell instead of offered. See combat/forced-movement-workflow.
  "forcedMove",
  "freeWarp", "hazard", "heal", "healingEarth",
  "heldBonus", "hideFromAnimals", "hinder", "inspireCompetence",
  "lifeSiphon", "light",
  // NEW at 3.606.0. Shroud dims the light ONE creature sees, wherever it
  // stands — not a Region. See `perceivedLightShift` in light-check.mjs.
  "lightPerception",
  "lightShift", "magicStone", "maneuver", "marker",
  // NEW at 3.606.0. Spirit Trap — heavy ground for one creature, a leash,
  // and a new save each turn. See magic/movement-bind.mjs.
  "movementBind",
  "missileStorm", "note", "perTurn", "prison", "runeGrant", "sacrificingShield",
  // NEW at 3.542.0. A shield a spell makes rather than one you carry —
  // see magic/spell-shield.mjs for why its "1 + BSB" DR cannot be an item.
  "spellShield", "spellArmour",
  // NEW at 3.543.0. Eldritch Weapon makes a weapon out of nothing and
  // lets the caster choose its shape — see magic/conjured-weapon.mjs.
  "conjuredWeapon",
  // NEW at 3.585.0. A save spell that prints its own four outcomes —
  // see magic/save-ladder.mjs. Acid Cloud is the first; 32 more
  // four-degree spells in the pack are still waiting on their pages.
  "saveLadder",
  // NEW at 3.585.0. Abjurers Strike: a weapon that ignores part of
  // what defends against it — see magic/defence-pierce.mjs.
  "defencePierce",
  // NEW at 3.586.0. Antimagic Field: magic switched off rather than
  // taken away — see magic/antimagic.mjs for why the primitive is
  // `disabled` and not deletion.
  "antimagic",
  // NEW at 3.587.0. Disorient's ladder is made of advantage rather than
  // hit points — see magic/spell-pending.mjs for the three axes a rung
  // like that has to state, and pending-modifiers.mjs for the swing
  // channel it needed, which did not exist until this release.
  "pending",
  // NEW at 3.587.0. Death Knell moves hit points on both sides of the
  // table and kills outright — see magic/death-knell.mjs.
  "deathKnell",
  // NEW at 3.587.0. Darkvision says "You gain Darkvision", and the pack
  // already defines it — see magic/granted-ability.mjs.
  "grantAbility",
  // NEW at 3.588.0. Ball Lightning is aimed again at the start of every
  // one of the caster's turns — see magic/directed-strike.mjs.
  "directedStrike",
  // NEW at 3.589.0. A rung that drains Power Points or inflicts Soul
  // Drain rather than damage — see magic/resource-drain.mjs.
  "resource",
  // NEW at 3.602.0. The four printed consequences of coming back — see
  // magic/resurrection.mjs and conditions/sealed.mjs.
  "resurrect",
  "damageTypeChoice",
  "runeWard",
  "runeWarning",
  "skillLadder",
  // NEW at 3.589.0. Fly and Earth Glide grant a speed the creature does
  // not have, which a bonus row cannot do — see combat/granted-speeds.mjs.
  "speedGrant",
  "speedSet",
  "sizeStep",
  // NEW at 3.608.0. Solid Fog's concealment, held by whoever stands in the
  // placed cloud — applied by the live-emanation sweep, not the cast. See
  // magic/obscuring-zone.mjs.
  "zone",
  // NEW at 3.608.0. Stoneskin's duration shortened by each physical hit —
  // see magic/wearing-clock.mjs.
  "wearingClock",
  // NEW at 3.608.0. A force weapon that strikes at the cast and on every
  // Sustain — see magic/spiritual-weapon.mjs.
  "spiritualWeapon",
  // NEW at 3.608.0. Smash's damage bonus against constructs, and its
  // discharge — see magic/versus-damage.mjs.
  "versusDamage",
  // NEW at 3.608.0. Spell Drain's rung, left waiting on the caster it was
  // aimed at — see magic/spell-drain.mjs.
  "spellDrain",
  // NEW at 3.608.0. The ward a casting reads when it names the warded
  // creature — see magic/spell-turning.mjs.
  "spellTurning",
  // NEW at 3.609.0. A second save one outcome of the first calls for —
  // Umbral Blast, Vision Of Havoc, Phantasmal Killer. See
  // magic/follow-up-save.mjs.
  "followUpSave",
  // NEW at 3.609.0. Turn Undead's save at the start of an undead's turn in
  // the sustained circle. See magic/turn-save.mjs.
  "turnSave",
  // NEW at 3.609.0. Visage Of Horror's ward and Painful Rebuke's bite, both
  // read by the attack gate. See magic/aggression-wards.mjs.
  "horror", "rebuke",
  // NEW at 3.609.0. Vampiric Touch's half, Trade Essence's transfer and
  // Vigour's end-of-turn heal. See magic/life-transfer.mjs.
  "siphon", "essenceTrade", "turnHeal",
  // NEW at 3.609.0, block 33's R10. Untamed Journey's freedom, Wake, Time
  // Stop's secret actions and Tangling Creepers' button.
  "terrainFreedom", "wake", "timeStop", "lash",
  // NEW at 3.610.0, R9 and Storm Of Vengeance. Both live on the Region the
  // cast placed — see magic/wall-spell.mjs and magic/storm.mjs.
  "wall", "storm",
  // NEW at 3.612.0, R6. Web's check on moving through it, recorded on the
  // Region the cast placed — see magic/entry-check.mjs.
  "entryCheck",
  // NEW at 3.614.0, block 35's R2. Stasis's Failure and Fumble — see
  // magic/stasis.mjs.
  "stasis",
  // NEW at 3.614.0, block 35's R8. Renewal's Touch's choice at the start of
  // each of the target's turns — see magic/turn-options.mjs.
  "turnOptions",
  // NEW at 3.614.0, block 35's R9. Wellspring Of Valour's heal on the first
  // damage each round — see magic/damage-heal.mjs.
  "damageHeal",
  // NEW at 3.614.0, block 35's R11. Precious Metals' change of an item's
  // metal — see magic/material-shift.mjs.
  "materialShift",
  // NEW at 3.590.0. Keen Edge puts a trait on a WEAPON, which the
  // polymorph `trait` kind cannot do \u2014 see magic/weapon-trait.mjs.
  "weaponTrait",
  // NEW at 3.591.0. Metabolism grants Regeneration 5. Both healing rates
  // have been read by the turn clock and the injury clock for months and
  // no spell could grant either \u2014 see magic/healing-rate.mjs.
  "healingRate",
  // NEW at 3.591.0. Masterwork Item raises an item's quality tier for a
  // duration \u2014 QUALITY_TIERS implemented the tiers long ago and the
  // spell had no row. See magic/item-quality-grant.mjs.
  "itemQuality",
  // NEW at 3.597.0. NOT the `sense` kind two entries along, whose `finds`
  // field is read only by the sheet — this one is read by
  // `missChanceAvoidance` when somebody swings. See
  // magic/avoidance-sight.mjs for the mistake that naming prevents.
  "avoidanceSight",
  // NEW at 3.598.0. A ward the ATTACK path reads: the opponent rolls a Will
  // save the first time it tries to attack the protected creature. See
  // magic/sanctuary.mjs and combat/sanctuary-gate.mjs.
  "sanctuary",
  "seersVision", "sense", "spell", "spellStoring", "splash",
  "strikeRider", "suppress", "tempHP", "tempImmunity", "thorns", "trait",
  "triggeredStrike", "vitalBeacon", "ward", "weaponDamageBonus",
  "wildMorph",
  // NEW at 3.625.0. A spell cast in answer to a save — Lucky Break's shape
  // as a row, so a companion module can print one (Pillars of Faith's
  // Saintly Intercession). Reached from the save, not from the cast; see
  // magic/save-reroll.mjs.
  "saveReroll"
]);
