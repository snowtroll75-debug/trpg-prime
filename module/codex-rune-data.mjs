/**
 * The CREATURE CODEX runes, hand-typed from Chapter 3.
 *
 * "These weapon runes expand upon those found in the core rulebook." The
 * Codex adds eleven runes to Chapter 11's thirty-three, and they are
 * kept in their own file rather than appended to `armour-rune-data.mjs`
 * and `weapon-rune-data.mjs` for one reason: PROVENANCE. Those two are
 * diffed line-by-line against the Chapter 11 transcription, and a Codex
 * rune living in them would be a rune that file's own diff must be
 * taught to forgive. Two documents, two files, two diffs.
 *
 * ALL ELEVEN ARE HERE, which took six releases and two rules that were
 * not runes at all: Chapter 6's donning times, which Fleetguard replaces
 * and which nothing in the tree could state, and Chapter 4's Shield
 * Block, which Shellback halves and which existed only as a derived
 * number nothing spent.
 *
 * `CODEX_RUNES_PENDING` is empty and stays exported: a check asserts
 * every name in it is still a heading in the chapter, and the day a
 * twelfth rune is printed the list is where it goes first.
 *
 * `readFrom` IS NOT DECORATION. Every sentence below is asserted to be
 * present, verbatim, in `tools/transcription-codex-chapter3.txt` before
 * the harness will pass — the same guard `build-codex-feats.mjs` uses,
 * and for the same reason: a number typed by hand from a page nobody
 * re-read is how a V1.4 figure survives into a V1.5 build.
 */

/** Armour and shield runes (Codex Chapter 3). */
export const CODEX_ARMOUR_RUNES = Object.freeze([
  {
    name: "Dreadcarve",
    key: "dreadcarve",
    traits: "Aura, Enchantment, Fear, Invested, Save, Visual",
    on: ["armour", "shield"],
    usage: "inscribed into armour or a shield",
    activate: "Command (1 AP)",
    frequency: "at will",
    // THE RUNE DOES NOT RESTATE THE OUTCOMES, so neither does this. "an
    // aura of fear which behaves as the Frightful Aura creature
    // ability" — the six degrees of that ability are authored once, in
    // the creature-abilities pack, and the rune BORROWS them. A copy
    // here would be a second Frightful Aura, free to drift from the
    // first the day the Codex's chapter 2 is re-transcribed.
    behavesAs: "Frightful Aura",
    save: "will",
    // Radius and DC are the rune's own and are printed per tier, so
    // they are the only figures typed here.
    tiers: [
      { tier: "I", level: 10, price: 8000, radiusFeet: 50, dc: 24 },
      { tier: "II", level: 15, price: 55000, radiusFeet: 75, dc: 29 },
      { tier: "III", level: 20, price: 500000, radiusFeet: 100, dc: 34 }
    ],
    effect: "An aura of fear behaving as Frightful Aura: 50/75/100 ft and Will DC 24/29/34 by tier.",
    automation: "applied",
    readFrom: "this rune emanates an aura of fear which behaves as the Frightful Aura creature ability.",
    note: "Command the item (1 AP) to raise the aura and again to lower it. While it is up the circle is drawn on the canvas and follows you, and anything that steps in or starts its turn inside is asked for the Will save."
  },
  {
    name: "Wildform",
    key: "wildform",
    traits: "Alteration, Invested, Polymorph, Verdant",
    on: ["armour"],
    usage: "inscribed into non-metal armour",
    frequency: "1/day",
    // TWO ENTIRELY DIFFERENT RUNES BEHIND ONE NAME, and the page is
    // explicit that they do not stack: "RATHER THAN the above effect, a
    // druid gains an additional daily use of Wildshape each day per
    // power level". So a wearer with a Wildshape-like ability gets a
    // counter and no animal form at all, and everybody else gets the
    // spell. Which branch applies is a fact about the WEARER, so the
    // rules module is told rather than asked.
    spell: "Shape of the Animal",
    druidUsesPerTier: 1,
    // "you may use up to N PP of wrapping options" — the spell's own
    // list is headed **Warping Options**, and the rune's page says
    // "wrapping". One of the two is a typo and the spell's is the list
    // being pointed at, so that is what the PP is spent on. Recorded
    // here rather than silently corrected.
    warpingOptionsCalled: "Warping Options",
    // "inscribed into NON-METAL armour". This system has no fact about
    // whether a suit of armour is metal — MATERIALS says what dragonhide
    // and eaog do, and says nothing about which of them are metals, and
    // a plain steel breastplate carries no material at all. So the
    // restriction is REPORTED, the way Indestructible's craft
    // requirement is, and not enforced against a field that cannot
    // answer it.
    craftRestriction: "non-metal armour",
    tiers: [
      { tier: "I", level: 6, price: 2000, warpingPP: 0, usesPerDay: 1 },
      { tier: "II", level: 10, price: 8000, warpingPP: 4, usesPerDay: 1 },
      { tier: "III", level: 14, price: 36000, warpingPP: 8, usesPerDay: 1 },
      { tier: "IV", level: 18, price: 180000, warpingPP: 12, usesPerDay: 3 }
    ],
    effect: "Shape of the Animal once a day, with 0/4/8/12 PP of the spell's Warping Options by tier — or, for a wearer with Wildshape, +1 daily use of it per tier instead.",
    automation: "offered",
    readFrom: "this rune allows its wearer to change into the form of a studied animal as if using the spell Shape of the Animal.",
    note: "Press the rune to shift. A druid does not press it at all — their Wild Shape simply has more uses in it."
  },
  {
    name: "Thornbound",
    key: "thornbound",
    traits: "Invested, Invocation, Save",
    on: ["armour"],
    usage: "inscribed into armour",
    activate: "Reaction",
    trigger: "a creature grabs or swallows the wearer",
    damageType: "piercing",
    save: "reflex",
    basicSave: true,
    // THE REFLEX SAVE HAS NO PRINTED DC, and that is the page's, not a
    // transcription fault: "The rune inflicts piercing damage (basic
    // Reflex) based upon its power level" prints dice per tier and never
    // a DC. The Fortitude DCs at tiers II and III are for the RELEASE
    // clause and are a different save entirely.
    //
    // Read as the wearer's own Level DC, which is what the Codex means
    // everywhere it says "a level based save" (Frightful Aura's wording)
    // and the only reading that scales with anything the rune knows
    // about. Recorded as an interpretation rather than presented as
    // settled — see the release notes.
    saveDCUnprinted: "the wearer's Level DC",
    tiers: [
      { tier: "I", level: 5, price: 1250, damage: "2d6", releaseDC: 0 },
      { tier: "II", level: 10, price: 8000, damage: "4d6", releaseDC: 24 },
      { tier: "III", level: 15, price: 55000, damage: "6d6", releaseDC: 29 }
    ],
    effect: "Reaction when grabbed or swallowed: 2d6/4d6/6d6 piercing, basic Reflex; at II and III a Fortitude save or the grabber lets go.",
    automation: "offered",
    readFrom: "this rune attacks any creature that attempts to grab you or restrain you in any way. The rune inflicts piercing damage (basic Reflex) based upon its power level.",
    note: "Offered on the grabber's card the moment they take hold of you. The Reaction, the damage roll and the saves are yours and theirs to make."
  },
  {
    name: "Fleetguard",
    key: "fleetguard",
    traits: "Invested, Translocation",
    on: ["armour"],
    usage: "varies",
    // THE RUNE REPLACES A PRINTED TIME, and until Chapter 6's donning
    // rule arrived there was no printed time to replace. Held in AP, the
    // unit `donning.mjs` holds everything in, because this one rune
    // prints all three: "1 round (3 AP)", "1 minute", "a free action
    // (0 AP)".
    //
    // A TIER COVERS ONLY THE CATEGORIES IT NAMES. Tier I says nothing
    // about heavy armour and its Usage line says "light or medium
    // armour"; a heavy suit bearing a Fleetguard I therefore takes the
    // chapter's own ten minutes, and the missing entry is what says so.
    // Filling the gap with the base time would have been the same
    // sentence written twice.
    tiers: [
      {
        tier: "I", level: 4, price: 750, usage: "light or medium armour",
        donning: { light: { ap: 3 }, medium: { minutes: 1 } }
      },
      {
        tier: "II", level: 9, price: 6000, usage: "any armour",
        donning: { light: { ap: 1 }, medium: { ap: 3 }, heavy: { minutes: 1 } }
      },
      {
        tier: "III", level: 14, price: 36000,
        donning: { light: { ap: 0 }, medium: { ap: 1 }, heavy: { ap: 3 } }
      }
    ],
    effect: "Donning times by armour category, replacing Chapter 6's — down to a free action for light armour at tier III.",
    automation: "applied",
    readFrom: "this rune empowers it with magical precision, allowing it to be donned or removed in moments.",
    note: "The armour's own sheet states how long it takes to don, with and without the rune. Removing armour has no printed time in either the chapter or the rune."
  },
  {
    name: "Savage Jaw",
    key: "savageJaw",
    traits: "Attack, Invested, Invocation",
    on: ["shield"],
    level: 5,
    price: 1250,
    usage: "inscribed onto a shield",
    activate: "Reaction",
    trigger: "an enemy fumbles against you whilst your shield is equipped",
    // The rune's own damage, and the one number in it.
    damage: "2d6",
    damageType: "piercing",
    effect: "Reaction on an enemy's fumble: an Attack Check at your usual melee attack bonus, and 2d6 piercing on a hit.",
    automation: "offered",
    readFrom: "Make an Attack Check against the triggering foe (using your usual melee attack bonus). On a hit, you deal 2d6 piercing damage",
    note: "Offered on the attacker's card the moment they fumble at you. The counterattack is your Reaction and your attack roll, so it is yours to take — the card says it is available, it does not spend it for you."
  },
  {
    name: "Shellback",
    key: "shellback",
    traits: "Invested, Warding",
    on: ["shield"],
    level: 6,
    price: 2000,
    usage: "inscribed onto a shield with a DR value",
    // "a shield with a DR value" — and Shield Block itself says a shield
    // without a DR bonus cannot block at all, so the rune's usage line
    // and the action's own requirement are the same sentence twice. The
    // rune asks nothing extra; a shield that cannot block is a shield
    // this rune has nothing to halve.
    requiresShieldDR: true,
    halvesShieldDamage: true,
    // "you can as a Free Action (0 AP) move 5 feet away (as if using the
    // Step action) from the attacking creature without triggering
    // reactions". The Step action is Chapter 4's, and its own text says
    // the same thing about reactions — so the rune grants Step for free
    // rather than inventing a movement.
    freeStepFeet: 5,
    asAction: "Step",
    effect: "Halves the HP damage the shield takes from a Shield Block, and grants a free 5-foot Step away from the attacker.",
    automation: "applied",
    readFrom: "A rune with this shield halves any HP damage it takes in conjunction with using the Shield Block feat.",
    note: "Shield Block reads the rune itself: the card shows the halved figure and offers the free Step away."
  },
  {
    name: "Skyfeather",
    key: "skyfeather",
    traits: "Invested, Warding",
    on: ["armour"],
    level: 7,
    price: 3000,
    usage: "inscribed into armour",
    activate: "Free (0 AP)",
    trigger: "you are falling",
    // "Frequency Constant" — not a per-day count. Infinity is the
    // honest value, and it compares correctly everywhere a number does.
    frequency: "Constant",
    spell: "Feather Fall",
    effect: "A fall is taken as though under a Feather Fall spell: the descent slows and no damage is taken on landing.",
    automation: "applied",
    readFrom: "the rune wraps you in a soft current of air, slowing your descent and protecting you from impact. This acts as a Feather Fall spell.",
    note: "Falling From Height reads the rune before it rolls: the damage is nil, so nothing is lost and you do not land prone."
  }
]);

/** Weapon runes (Codex Chapter 3). */
export const CODEX_WEAPON_RUNES = Object.freeze([
  {
    name: "Ancient Echoes",
    key: "ancientEchoes",
    traits: "Invested, Invocation, Warding",
    on: ["weapon"],
    level: 10,
    price: 6000,
    usage: "inscribed onto a weapon",
    // TWO effects, and the first is the interesting one: it is the only
    // rule in either book where an ITEM answers a question about the
    // CHARACTER's training.
    grantsProficiency: true,
    attackBonus: 1,
    damageBonus: 1,
    bonusType: "luck",
    effect: "No proficiency is needed with the weapon, and every attack made with it gains a +1 luck bonus to attack and damage.",
    automation: "applied",
    readFrom: "You need no proficiency to use a weapon inscribed with this rune as ancestral allies impart this knowledge to you.",
    note: "The proficiency waiver is answered by the same function that answers every other proficiency question, so the -4 never appears and the sheet agrees with the attack card."
  },
  {
    name: "Swarmed",
    key: "swarmed",
    traits: "Focus, Invested, Translocation",
    on: ["weapon"],
    usage: "inscribed onto a thrown weapon",
    activate: "Command (2 AP)",
    frequency: "varies",
    // A CONE, and the only Codex rune that puts a template on the map.
    coneFeet: 30,
    save: "reflex",
    basicSave: true,
    // "damage equal to twice the weapon's damage dice" — the DICE are
    // doubled, not the damage. A flat modifier on the weapon is not a
    // die and is left alone; see `doubledWeaponDice`.
    diceMultiplier: 2,
    tiers: [
      { tier: "I", level: 9, price: 4300, dc: 24 },
      { tier: "II", level: 13, price: 17000, dc: 28 },
      { tier: "III", level: 17, price: 90000, dc: 32 }
    ],
    effect: "2 AP: the thrown weapon replicates across a 30-foot cone for twice its damage dice, basic Reflex DC 24/28/32 by tier.",
    automation: "offered",
    readFrom: "it replicates in midair, sweeping across a 30-foot cone. Each creature in the area takes damage equal to twice the weapon’s damage dice with a basic Reflex save to avoid.",
    note: "Command the weapon to hurl it. The cone is placed on the map, the doubled dice are rolled once, and every creature caught is named with the DC to save against."
  },
  {
    name: "Vorpal",
    key: "vorpal",
    traits: "Invested, Soul",
    on: ["weapon"],
    level: 16,
    price: 60000,
    usage: "any slashing weapon",
    // "Usage any slashing weapon" — the only Codex rune that restricts
    // itself to a damage type, and the one restriction of the eleven
    // this system CAN answer: a weapon carries its own damageType.
    damageTypeRequired: "slashing",
    // "the minimum result for a critical injury result inflicted by an
    // attack after modification with this trait is based upon the
    // severity of the critical as shown below". A table of three, and
    // the figures V1.4 never printed.
    minimumBySeverity: { minor: 10, serious: 30, deadly: 50 },
    effect: "A critical injury is raised to the next head result, and then to at least 10/30/50 by severity.",
    automation: "applied",
    readFrom: "When an attack with this trait inflicts a critical hit, the result of the injury is always increased to the next available head result.",
    note: "The injury roll is modified before the row is read, so the card shows the roll, the head result it was raised to, and the severity minimum if that lifted it further."
  },
  {
    name: "Submersible",
    key: "submersible",
    traits: "Invested, Warding",
    on: ["weapon"],
    level: 3,
    price: 350,
    usage: "inscribed onto a melee weapon",
    // APPLIED since 3.632.0 (Fiends & Fables 3.0 block 2, ruling 6). Page
    // 201's underwater rules arrived at 3.580.0; the attack path now lifts
    // the melee −2 and the fire failure for a weapon carrying this rune.
    effect: "Ignores the attack penalties and limitations of underwater combat; a weapon that deals fire damage keeps its flames submerged.",
    automation: "applied",
    readFrom: "You ignore the usual attack penalties and limitations associated with underwater combat when wielding it.",
    note: "Underwater, the strike takes no −2 through the water and a fire weapon does not fail."
  }
]);

/** The transcription's heading for each, for the diff. */
export const CODEX_RUNE_SOURCE_NAMES = Object.freeze({
  dreadcarve: "DREADCARVE",
  fleetguard: "FLEETGUARD",
  savageJaw: "SAVAGE JAW",
  shellback: "SHELLBACK",
  thornbound: "THORNBOUND",
  wildform: "WILDFORM",
  swarmed: "SWARMED",
  vorpal: "VORPAL",
  skyfeather: "SKYFEATHER",
  ancientEchoes: "ANCIENT ECHOES",
  submersible: "SUBMERSIBLE"
});

/**
 * The seven not built yet, and what each one is waiting for.
 *
 * Here rather than in a plan document because the harness reads it: a
 * check asserts every name below is a rune heading the transcription
 * actually carries, so the day one of them is built and removed from
 * this list, nothing can quietly drop a rune on the way past.
 */
export const CODEX_RUNES_PENDING = Object.freeze({});
