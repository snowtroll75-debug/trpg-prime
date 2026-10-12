/**
 * The Creature Codex runes' rules — the parts no existing registry owns.
 *
 * Most of what the Codex runes need already existed: Savage Jaw,
 * Skyfeather and Submersible are entries in `rune-events.mjs`, Ancient
 * Echoes' +1 is an entry in `rune-effects.mjs`, and Dreadcarve and
 * Swarmed are entries in `rune-actions.mjs`. That was the point of the
 * build order, and it is why this file is a list of questions rather
 * than a second rules engine.
 *
 * What is left over is what a workflow has to ask at the moment it acts,
 * phrased so the answer carries its own reason:
 *
 *   weaponWaivesProficiency   may I swing this without being trained?
 *   savageJawOffer            an enemy just fumbled at me — and?
 *   skyfeatherCatches         I am falling. Does anything catch me?
 *   dreadcarveAuras           what does this worn item emanate?
 *   thornboundOffer           something just grabbed me — and?
 *   swarmedThrow              what does this weapon do when it is hurled?
 *   wildformOn                what does this armour turn its wearer into?
 *   vorpalInjuryResult        where on the body did that critical land?
 *   donningTimeFor            how long does this armour take to put on?
 *   shellbackOn               did the shield that just blocked carry it?
 *
 * Pure, and no Foundry API: each takes plain items and returns plain
 * data, so a harness can run the actual rule rather than read the code
 * back at itself.
 */

import { fieldToRunes } from "./rune-catalogue.mjs";
import { equippedEventRune } from "./rune-events.mjs";
import { CODEX_ARMOUR_RUNES, CODEX_WEAPON_RUNES } from "./codex-rune-data.mjs";
import { runeStateOf } from "./rune-actions.mjs";
import { isHeadResult, nextHeadResult } from "./combat/head-criticals.mjs";
import { armourCategory, describeAP, donningTime, timeToAP } from "./donning.mjs";
import { abilitiesVorpalWeapons } from "./creature-ability-rules.mjs";

const codexRune = (key) => [...CODEX_ARMOUR_RUNES, ...CODEX_WEAPON_RUNES]
  .find((rune) => rune.key === key);
const codexArmourRune = codexRune;

/**
 * The tier of a Codex rune actually inscribed on an item, with its
 * printed figures — or null if the item does not carry it.
 *
 * ONE PLACE THAT READS A TIER OFF AN ITEM. Three runes now need it and
 * each wanted the same three lines: ask the catalogue what is inscribed,
 * find this rune, and clamp the tier to what the page prints. The clamp
 * is the part worth sharing — a tier above the printed ladder is a data
 * error, and the highest printed tier is the honest reading of it, the
 * same direction `computeRuneModifiers` caps a potency in.
 */
export function inscribedTier(item, key) {
  const rune = codexRune(key);
  if (!rune?.tiers) return null;
  const kind = item?.type === "shield" ? "shield" : item?.type;
  const chosen = fieldToRunes(kind, item?.system?.runes ?? "")
    .find((entry) => entry.key === key);
  if (!chosen) return null;
  const index = Math.min(Math.max(1, chosen.tier), rune.tiers.length) - 1;
  return { rune, tier: rune.tiers[index], numeral: index + 1 };
}

/**
 * DREADCARVE: an aura of fear on a worn item.
 *
 * "When inscribed, this rune emanates an aura of fear which behaves as
 * the Frightful Aura creature ability."
 *
 * THE FIRST AURA IN THIS SYSTEM THAT IS NOT A CREATURE'S. Everything the
 * aura machinery does — the radius that follows the token, the two
 * triggers, the immunity window, the Region drawn on the canvas — was
 * built for abilities on a creature, and this returns the same shape
 * from an item instead. Nothing downstream is taught that runes exist.
 *
 * WHAT IT BORROWS AND WHAT IT DOES NOT. The rune prints its own radius
 * and its own save DC, per tier, and those are its. It prints no
 * outcomes at all, because it does not have any: it behaves as an
 * ability that already exists, whose six degrees are authored once in
 * `packs-source/creature-abilities/Frightful Aura`. So this declares
 * `borrowsOutcomesFrom` and the card fetches them at the moment it is
 * posted. A copy of the six lines here would be a second Frightful Aura,
 * free to drift from the first.
 *
 * The two facts it cannot defer — that the trigger is entering the area,
 * and that the immunity lasts a minute — are stated here and CHECKED
 * against the ability's own entry by the harness, because the machinery
 * needs them synchronously when a token moves and a compendium read is
 * not synchronous.
 *
 * ONLY WHILE IT IS UP. "Activate Command (1 AP); Frequency at will" — so
 * the aura is raised and lowered, not permanent. An item that is not
 * worn, or whose rune has not been commanded, emits nothing.
 */
export const DREADCARVE_BORROWED = Object.freeze({
  // The ability's NAME is the data's, not a second copy: `behavesAs` is
  // checked against the printed page, and a name written again here
  // could point at an ability the rune does not behave as.
  from: codexArmourRune("dreadcarve").behavesAs,
  triggers: Object.freeze(["enter"]),
  immunitySeconds: 60
});

export function dreadcarveAuras(item) {
  // THERE IS NO KIND CHECK HERE, and its absence is deliberate. One
  // stood here and could not be made to fail: `runesFor` refuses a rune
  // whose `on` list does not name the kind it was asked about, so an
  // item that is not armour or a shield finds no Dreadcarve to read and
  // this returns nothing on its own. A second gate in front of a working
  // one is a line no mutation can contradict — the fourth of that shape
  // this rune found. The check that the gating happens is J4e in
  // verify-codex-runes.
  if (!item?.system?.equipped) return [];
  if (!runeStateOf(item, "dreadcarve")) return [];

  const inscribed = inscribedTier(item, "dreadcarve");
  if (!inscribed) return [];
  const { rune, tier } = inscribed;

  return [{
    // The item's id is in the aura id so two runed pieces on one
    // character are two auras rather than one that overwrites the other.
    id: `rune-dreadcarve-${item.id ?? "item"}`,
    name: `Dreadcarve ${tier.tier}`,
    kind: "save",
    radius: tier.radiusFeet,
    dc: tier.dc,
    save: rune.save,
    triggers: [...DREADCARVE_BORROWED.triggers],
    immunitySeconds: DREADCARVE_BORROWED.immunitySeconds,
    borrowsOutcomesFrom: DREADCARVE_BORROWED.from,
    outcomes: {},
    appliesTo: "Creatures that can see the wearer",
    text: `${rune.readFrom} The aura has a ${tier.radiusFeet}' radius and the save DC is ${tier.dc}.`
  }];
}

/**
 * THORNBOUND: "Activate Reaction; Trigger a creature grabs or swallows
 * the wearer."
 *
 * OFFERED, LIKE SAVAGE JAW, and for the same reason: the Reaction is the
 * wearer's to spend, the damage roll is theirs to make, and the two
 * saves belong to the creature that grabbed them. What this returns is
 * everything the card needs to say so.
 *
 * THE REFLEX SAVE HAS NO PRINTED DC. The rune says "(basic Reflex)" and
 * prints dice per tier and no DC at all; the Fortitude DCs at tiers II
 * and III belong to the release clause, which is a different save. Read
 * as the wearer's own Level DC — the Codex's meaning everywhere it says
 * "a level based save" — and RETURNED AS AN INTERPRETATION rather than a
 * number, so the card can say where it came from and a ruling can change
 * it in one place.
 *
 * THE RELEASE IS TIER II AND ABOVE. Tier I prints no Fortitude save at
 * all, and offering one would be granting a rule the page withholds —
 * which is why `releaseDC` is 0 there and checked to be.
 *
 * @param {object[]} items the WEARER's items
 * @returns {object|null}
 */
export function thornboundOffer(items = []) {
  for (const item of items ?? []) {
    if (item?.type !== "armour" || !item?.system?.equipped) continue;
    const inscribed = inscribedTier(item, "thornbound");
    if (!inscribed) continue;
    const { rune, tier, numeral } = inscribed;
    return {
      item,
      label: `Thornbound ${tier.tier}`,
      numeral,
      damage: tier.damage,
      damageType: rune.damageType,
      save: rune.save,
      basicSave: rune.basicSave === true,
      saveDCFrom: rune.saveDCUnprinted,
      releaseDC: tier.releaseDC,
      releases: tier.releaseDC > 0
    };
  }
  return null;
}

/**
 * SWARMED: "it replicates in midair, sweeping across a 30-foot cone.
 * Each creature in the area takes damage equal to twice the weapon's
 * damage dice with a basic Reflex save to avoid."
 *
 * @param {object} weapon the thrown weapon carrying the rune
 * @returns {object|null}
 */
export function swarmedThrow(weapon) {
  // No kind check, for the reason `dreadcarveAuras` records: the
  // catalogue refuses a rune whose `on` list does not name the kind it
  // was asked about, so armour finds no Swarmed to read and this returns
  // null on its own. L5b is the check that it does.
  const inscribed = inscribedTier(weapon, "swarmed");
  if (!inscribed) return null;
  const { rune, tier, numeral } = inscribed;
  return {
    item: weapon,
    label: `Swarmed ${tier.tier}`,
    numeral,
    coneFeet: rune.coneFeet,
    dc: tier.dc,
    save: rune.save,
    basicSave: rune.basicSave === true,
    damage: doubledWeaponDice(weapon?.system?.damage, rune.diceMultiplier)
  };
}

/**
 * "Twice the weapon's damage dice" — the DICE, not the damage.
 *
 * A 1d6 dagger throws 2d6; a 2d4+1 weapon throws 4d4+1, because a flat
 * +1 is not a die and doubling it would be doubling something the rune
 * does not name. Nor does the wielder's Strength or their bonus damage
 * dice come into it: this is the weapon replicating in the air, not a
 * Strike, and nothing about the arm that threw it is in the sentence.
 *
 * An expression this cannot read comes back unchanged rather than
 * mangled — a homebrew "1d6+1d4" is somebody's deliberate weapon, and
 * halving or garbling it would be worse than leaving the rune's own
 * doubling to the person reading the card.
 */
export function doubledWeaponDice(damage, multiplier = 2) {
  const printed = String(damage ?? "").trim();
  const match = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(printed);
  if (!match) return printed;
  const count = Number(match[1] || 1) * Math.max(1, Math.floor(Number(multiplier) || 1));
  return `${count}d${match[2]}${match[3] ?? ""}`;
}

/**
 * WILDFORM: two entirely different runes behind one name.
 *
 * "This rune is especially useful when worn by druids (or any other
 * character that has a Wildshape like ability). RATHER THAN the above
 * effect, a druid gains an additional daily use of Wildshape each day
 * per power level (I-IV) of the rune."
 *
 * "Rather than" is the whole rule. A druid gets a counter and NO animal
 * form; everybody else gets the spell and no extra Wildshape. The two do
 * not stack, and this was carried as an open ruling for weeks before the
 * chapter's own last paragraph answered it.
 *
 * WHICH BRANCH APPLIES IS A FACT ABOUT THE WEARER, not about the item,
 * so it is passed in rather than guessed at here — the same reason
 * `thornboundOffer` takes items and not an actor. `hasWildshape` is the
 * caller's answer to "does this character have a Wildshape like
 * ability", which is deliberately broader than "is a druid": the page
 * says so in its own brackets.
 *
 * THE PP IS SPENT ON THE SPELL'S OWN LIST. The rune's page says "up to
 * 4 PP of wrapping options"; the spell prints a list headed **Warping
 * Options**. One of the two is a typo and the list being pointed at is
 * the spell's, so that is what the allowance buys. Tier I buys nothing
 * — "the base casting" — and a check asserts its paragraph really does
 * print no allowance.
 *
 * @param {object[]} items the wearer's items
 * @param {object} options
 * @param {boolean} options.hasWildshape does the wearer have Wild Shape?
 * @returns {object|null}
 */
export function wildformOn(items = [], { hasWildshape = false } = {}) {
  for (const item of items ?? []) {
    if (item?.type !== "armour" || !item?.system?.equipped) continue;
    const inscribed = inscribedTier(item, "wildform");
    if (!inscribed) continue;
    const { rune, tier, numeral } = inscribed;
    return hasWildshape
      ? {
        item,
        label: `Wildform ${tier.tier}`,
        numeral,
        branch: "wildshape",
        // "an additional daily use of Wildshape each day PER POWER
        // LEVEL" — the tier is the number of extra uses, so a
        // Wildform IV is worth four.
        extraWildshapeUses: numeral * rune.druidUsesPerTier,
        // And no animal form at all. Stated rather than omitted,
        // because "rather than the above effect" is the clause a
        // reader most needs to see on this rune.
        spell: "",
        warpingPP: 0,
        usesPerDay: 0,
        craftRestriction: rune.craftRestriction
      }
      : {
        item,
        label: `Wildform ${tier.tier}`,
        numeral,
        branch: "animalForm",
        extraWildshapeUses: 0,
        spell: rune.spell,
        warpingPP: tier.warpingPP,
        warpingOptionsCalled: rune.warpingOptionsCalled,
        usesPerDay: tier.usesPerDay,
        craftRestriction: rune.craftRestriction
      };
  }
  return null;
}

/**
 * The extra daily Wild Shape uses an equipped Wildform rune is worth.
 *
 * Nothing if the wearer has no Wildshape-like ability, because for them
 * the rune is an animal form instead — asked as one question so a caller
 * cannot accidentally add the counter to a character who is also getting
 * the spell.
 */
export function wildformWildshapeBonus(items = [], { hasWildshape = false } = {}) {
  return wildformOn(items, { hasWildshape })?.extraWildshapeUses ?? 0;
}

/**
 * VORPAL: a critical injury raised to the head, then floored by severity.
 *
 * "When an attack with this trait inflicts a critical hit, the result of
 * the injury is always increased to the next available head result.
 * Furthermore, the minimum result for a critical injury result inflicted
 * by an attack AFTER MODIFICATION with this trait is based upon the
 * severity of the critical."
 *
 * TWO STEPS, AND THE ORDER IS THE PAGE'S. The head result first, the
 * severity minimum second — "after modification with this trait" says so
 * — and the book's own two worked examples only both come out right in
 * that order:
 *
 *   Serious, rolled 14 → next head is 20 → minimum 30 → **30**
 *   Minor, rolled 78   → next head is 80 → minimum 10 → **80**
 *
 * Both are pinned checks. The first is the one that discriminates: run
 * the minimum first and 14 becomes 30, which is a head result, and stays
 * 30 — the same answer by a different route. Run it on a Deadly rolled
 * 20 and the two orders disagree, which is why the examples alone are
 * not enough and the order is taken from the sentence.
 *
 * A ROLL THAT ALREADY STRIKES THE HEAD STILL MOVES. "Be aware that if
 * the result of your initial injury check strikes the head, your result
 * is still increased to the next head critical injury result (effectively
 * +10 to the injury result)." That parenthesis is also the evidence for
 * how the head results are spaced — see `head-criticals.mjs`.
 *
 * @param {object} options
 * @param {number} options.roll the injury roll as made
 * @param {string} options.severity minor | serious | deadly
 * @returns {{result: number, head: number, minimum: number, rolledHead: boolean}}
 */
export function vorpalInjuryResult({ roll, severity } = {}) {
  const rune = codexRune("vorpal");
  const rolled = Math.trunc(Number(roll) || 0);
  const rolledHead = isHeadResult(rolled);
  const head = nextHeadResult(rolled, rolledHead);
  const minimum = Number(rune.minimumBySeverity[String(severity ?? "").toLowerCase()] ?? 0);
  return { result: Math.max(head, minimum), head, minimum, rolledHead };
}

/**
 * The Vorpal rune on the weapon that scored the critical, if any.
 *
 * THE SLASHING RESTRICTION IS THE ONE THIS SYSTEM CAN ANSWER. "Usage any
 * slashing weapon", and a weapon carries its own damage type — so unlike
 * Wildform's non-metal armour or Submersible's underwater penalty, this
 * restriction has a field to check. It is REPORTED rather than enforced
 * all the same: a weapon whose type has been changed at the table (a
 * Versatile grip, a GM's ruling) is not a reason to silently drop the
 * rune, but it is a reason to say so on the card.
 */
export function vorpalOn(weapon) {
  const rune = codexRune("vorpal");
  // THE ITEM'S OWN KIND, not a hard-coded "weapon". Asking the weapon
  // catalogue about a suit of armour is how a rune ends up answering for
  // an item it was never printed for — `runesFor` refuses Vorpal to
  // armour, and it can only do that if it is told what the item is.
  const kind = weapon?.type === "shield" ? "shield" : weapon?.type;
  // VORPAL WEAPONS (Creature Codex; 3.631.0): "any of the creature's melee
  // weapons have the Vorpal trait" — the owner's ability counts as the
  // rune on every melee weapon it wields, and the weapon's own field as
  // ever. The weapon's own trait field saying "vorpal" counts too.
  const owned = weapon?.actor?.items ? Array.from(weapon.actor.items) : [];
  const melee = String(weapon?.system?.attackMode ?? "melee") !== "missile";
  const byAbility = kind === "weapon" && melee && abilitiesVorpalWeapons(owned);
  const byTrait = /\bvorpal\b/i.test(String(weapon?.system?.traits ?? ""));
  const carries = byAbility || byTrait || fieldToRunes(kind, weapon?.system?.runes ?? "")
    .some((entry) => entry.key === "vorpal");
  if (!carries) return null;
  const damageType = String(weapon?.system?.damageType ?? "").trim().toLowerCase();
  return {
    item: weapon,
    label: "Vorpal",
    minimumBySeverity: { ...rune.minimumBySeverity },
    damageTypeRequired: rune.damageTypeRequired,
    // Empty when the weapon's own type is what the rune asks for.
    mismatch: damageType && damageType !== rune.damageTypeRequired
      ? `${weapon?.name ?? "This weapon"} deals ${damageType} damage; Vorpal is for a ${rune.damageTypeRequired} weapon.`
      : ""
  };
}

/**
 * FLEETGUARD: how long this armour takes to don.
 *
 * "When inscribed upon armour, this rune empowers it with magical
 * precision, allowing it to be donned or removed in moments. The exact
 * specifics are determined by the power level of the rune."
 *
 * THE RUNE REPLACES THE CHAPTER'S TIME, it does not reduce it. Every
 * tier prints an absolute — "1 round (3 AP)", "1 minute", "a free action
 * (0 AP)" — and none of them is expressed as a saving, so nothing here
 * subtracts. Both figures come back so the sheet can show what the rune
 * is worth without either of them being computed from the other.
 *
 * A TIER COVERS ONLY THE CATEGORIES IT NAMES. Tier I prints times for
 * light and medium armour and its Usage line says "light or medium
 * armour"; a heavy suit bearing a Fleetguard I takes the chapter's own
 * ten minutes, and the rune says nothing about it. Returning the base
 * time with `improved: false` is how that is said out loud, rather than
 * by a rune that silently does nothing.
 *
 * A FULL SUIT IS STILL DOUBLED when the rune does not cover the
 * category, because that doubling is the chapter's. When the rune DOES
 * cover it, the rune's figure stands: it replaces the printed time, and
 * the printed time is what the doubling applies to.
 *
 * @param {object} item a suit of armour
 * @param {object} options
 * @param {boolean} options.fullSuit
 */
export function donningTimeFor(item, { fullSuit = false } = {}) {
  const category = armourCategory(item?.system?.category);
  const base = donningTime(category, { fullSuit });
  if (!base) return null;

  const inscribed = inscribedTier(item, "fleetguard");
  if (!inscribed) return { ...base, improved: false, rune: "", covers: true };

  const { tier, numeral } = inscribed;
  const printed = tier.donning[category];
  const ap = timeToAP(printed);
  if (ap === null) {
    return {
      ...base,
      improved: false,
      rune: `Fleetguard ${tier.tier}`,
      numeral,
      // The one thing worth saying about a tier that does not reach this
      // armour: which armour it does reach.
      covers: false,
      coversLabel: tier.usage ?? "",
      why: `Fleetguard ${tier.tier} prints no time for ${category} armour.`
    };
  }
  return {
    ap,
    label: describeAP(ap),
    category,
    fullSuit: Boolean(fullSuit),
    // The rune's printed time REPLACES the chapter's and is shown as
    // printed, so it does not carry the full-suit doubling.
    doubled: false,
    improved: ap < base.ap,
    rune: `Fleetguard ${tier.tier}`,
    numeral,
    covers: true,
    baseAP: base.ap,
    baseLabel: base.label
  };
}

/**
 * SHELLBACK: the shield takes half, and you step back.
 *
 * "A rune with this shield halves any HP damage it takes in conjunction
 * with using the Shield Block feat. Furthermore, you can as a Free
 * Action (0 AP) move 5 feet away (as if using the Step action) from the
 * attacking creature without triggering reactions."
 *
 * BOTH CLAUSES HANG OFF A SHIELD BLOCK, which is why this takes the
 * shield that did the blocking rather than a list of items: the rune
 * halves what THAT shield takes, and the step is the shove that
 * follows. A Shellback shield in the other hand halves nothing.
 *
 * THE STEP IS THE CHAPTER'S OWN ACTION. "as if using the Step action",
 * and Step's own text already says it "doesn't trigger reactions" — so
 * the rune grants a free Step rather than inventing a movement that
 * happens to look like one. Offered rather than moved: where a token
 * ends up is a person's decision about a map.
 *
 * @param {object} shield the shield used to Shield Block
 * @returns {object|null}
 */
export function shellbackOn(shield) {
  const rune = codexRune("shellback");
  const kind = shield?.type === "shield" ? "shield" : shield?.type;
  const carries = fieldToRunes(kind, shield?.system?.runes ?? "")
    .some((entry) => entry.key === "shellback");
  if (!carries) return null;
  return {
    item: shield,
    label: "Shellback",
    halvesShieldDamage: rune.halvesShieldDamage === true,
    freeStepFeet: rune.freeStepFeet,
    asAction: rune.asAction
  };
}

/** Every rune-borne aura on the items an actor carries. */
export function runeAurasOf(items = []) {
  const out = [];
  for (const item of items ?? []) out.push(...dreadcarveAuras(item));
  return out;
}

/**
 * ANCIENT ECHOES: "You need no proficiency to use a weapon inscribed
 * with this rune as ancestral allies impart this knowledge to you."
 *
 * THE ONLY RULE IN EITHER BOOK WHERE AN ITEM ANSWERS A QUESTION ABOUT
 * THE CHARACTER. `proficiency-rules.mjs` opens by saying proficiency is
 * not a property of a sword — "the same sword is fine for a Fighter and
 * a mistake for a Wizard" — and that is still true. This rune does not
 * make the character proficient; it makes the proficiency unnecessary,
 * which is why it is asked at the END of the weapon branch, after every
 * genuine grant has had its say. A character who IS proficient keeps
 * their own reason, and the rune never overwrites it.
 *
 * Deliberately NOT `equipped`-gated: a weapon you are swinging is a
 * weapon in your hand, and the question is only ever asked about the
 * weapon being used. `system.equipped` on a weapon means "carried
 * ready", and the attack workflow reaches here with a weapon whose data
 * has already been resolved for the strike.
 *
 * @param {object} item a weapon, with `system.runes`
 * @returns {{waived: boolean, why: string}}
 */
export function weaponWaivesProficiency(item) {
  if (item?.type !== "weapon") return { waived: false, why: "" };
  const carries = fieldToRunes("weapon", item?.system?.runes ?? "")
    .some((rune) => rune.key === "ancientEchoes");
  return carries
    ? { waived: true, why: "an Ancient Echoes rune imparts the knowledge" }
    : { waived: false, why: "" };
}

/**
 * SAVAGE JAW: "Activate Reaction; Trigger an enemy fumbles against you
 * whilst your shield is equipped."
 *
 * THE DEFENDER'S RUNE, READ ON THE ATTACKER'S CARD. Every other event
 * rune in this system is asked of the actor doing the thing; this one is
 * asked of the person it was done to, which is why the items handed in
 * are the TARGET's and not the attacker's.
 *
 * OFFERED, NOT ROLLED. What follows is an Attack Check made by the
 * defender with their own melee bonus, spending their Reaction — a
 * decision and two resources that belong to a player. This system's
 * standing convention is that a fact only a person holds is asked for
 * rather than assumed, and "do you want to spend your Reaction" is the
 * purest case of it.
 *
 * MELEE ONLY. "an enemy fumbles against you whilst your shield is
 * equipped" sits under a Reaction whose answer is a bite at the foe who
 * fumbled — a counterattack at the reach of a shield. A fumbled arrow
 * from sixty feet away does not open a shield to bite it, so the caller
 * passes whether the fumbled attack was melee and a ranged fumble
 * returns nothing.
 *
 * @param {object[]} defenderItems the defender's items
 * @param {object} options
 * @param {boolean} options.melee was the fumbled attack a melee attack?
 * @returns {{item, rune, damage: string, damageType: string}|null}
 */
export function savageJawOffer(defenderItems = [], { melee = true } = {}) {
  if (!melee) return null;
  const found = equippedEventRune(defenderItems, "savageJaw");
  if (!found) return null;
  return {
    item: found.item,
    rune: found.rune,
    damage: found.rune.damage,
    damageType: found.rune.damageType
  };
}

/**
 * SKYFEATHER: "This acts as a Feather Fall spell."
 *
 * And the spell, in this system's own compendium, says: "The speed of
 * the target's fall slows to 60 feet per round, and the target takes no
 * damage upon landing if the spell is still in effect."
 *
 * SO THE DAMAGE IS NIL, AND THAT IS ALL THIS RETURNS. It does not
 * suppress the injury save that Falling From Height rolls afterwards —
 * that save already runs on a fall of no damage today (its DC is the
 * faller's own Level DC plus one per five damage, and five times zero
 * is zero), so suppressing it here would be this rune changing a rule
 * that is not its own. Arrest a Fall reads the same way: it returns
 * `noDamage` and leaves the rest of the fall to the workflow.
 *
 * EQUIPPED, always — through `equippedEventRune`. Armour in your pack
 * does not catch you.
 *
 * @param {object[]} items the faller's items
 * @returns {{item, rune, noDamage: true, spell: string}|null}
 */
export function skyfeatherCatches(items = []) {
  const found = equippedEventRune(items, "skyfeather");
  if (!found) return null;
  return { item: found.item, rune: found.rune, noDamage: true, spell: "Feather Fall" };
}

/**
 * SUBMERSIBLE: stated, not applied.
 *
 * Returns the line to print and the reason it is only a line. Kept as a
 * function rather than a string so the day an underwater penalty exists,
 * the thing that has to change is here and says so.
 */
export function submersibleNote(weapon) {
  const found = equippedEventRune([weapon], "submersible");
  if (!found) return null;
  return {
    label: found.rune.label,
    text: found.rune.description,
    awaiting: "an underwater attack penalty for this to be an exemption from"
  };
}

/**
 * The printed Usage line of every Codex rune inscribed on this item, and
 * whether this system can tell you it is met.
 *
 * WHY THIS EXISTS. Live testing of 3.284.0 inscribed Wildform IV onto
 * Full Platemail — "Usage inscribed into NON-METAL armour" — and the
 * system accepted it in full and said nothing anywhere a person would
 * look. The restriction was in the data and on no screen.
 *
 * THREE ANSWERS, NOT TWO. `met` is:
 *
 *   true   the item carries a field that answers it, and it does.
 *   false  the item carries a field that answers it, and it does not.
 *   null   NOTHING IN THIS SYSTEM CAN ANSWER IT. Wildform's non-metal
 *          armour is the case: armour has no `metal` field at all (a
 *          shield does; armour carries only a free-text `material`, and
 *          the MATERIALS table never says which materials are metals).
 *
 * The third answer is the one worth having. Collapsing it into `false`
 * would put a warning triangle on every legitimately-inscribed Wildform;
 * collapsing it into `true` would say the system had checked something
 * it cannot check. It says "printed, and not checkable here" instead.
 *
 * REPORTED, NOT ENFORCED, in every case — the stance Vorpal already
 * took: "a weapon whose type has been changed at the table is not a
 * reason to silently drop the rune, but it is a reason to say so."
 *
 * @param {object} item
 * @returns {{key: string, label: string, usage: string, met: boolean|null, why: string}[]}
 */
export function runeUsageNotes(item) {
  const kind = item?.type === "shield" ? "shield" : item?.type;
  if (!kind) return [];
  const notes = [];
  for (const entry of fieldToRunes(kind, item?.system?.runes ?? "")) {
    // Only the CODEX runes — Potency, Flaming and the rest of Chapter 11
    // are somebody else's panel. `codexRune` answers nothing for them,
    // which is the whole gate.
    //
    // It used to read `if (!rune?.usage)`, and the `?.usage` half could
    // not be made to fail: every Codex rune carries a printed usage line
    // and U6 asserts it, so a rune that exists always has one. A second
    // guard in front of a working guard — the eighth of that shape this
    // rune work has turned up.
    // INDESTRUCTIBLE IS THE ONE CHAPTER 11 RUNE WITH A CRAFT REQUIREMENT
    // THE ITEM CAN ANSWER (3.615.0, B4 of block 36): "Can only be placed
    // upon adamantine, eaog or mithril armour" — and the armour's material
    // is a field. Reported, like every usage note here.
    if (entry.key === "indestructible") {
      const material = String(item?.system?.material ?? "").trim().toLowerCase();
      const allowed = ["adamantine", "eaog", "mithril"];
      const met = material ? allowed.includes(material) : null;
      notes.push({
        key: entry.key,
        label: "Indestructible",
        usage: "Craft Requirements: can only be placed upon adamantine, eaog or mithril armour.",
        met,
        why: met === false ? `${item?.name ?? "This armour"} is ${material}.` : (met === null ? "No material is recorded on this armour, so it is not checked." : "")
      });
      continue;
    }
    const rune = codexRune(entry.key);
    if (!rune) continue;

    // Fleetguard prints a usage PER TIER, and `donningTimeFor` already
    // says which categories the inscribed tier reaches, on the same
    // panel. Repeating it here would be a second sentence about one
    // rule that could drift from the first.
    if (entry.key === "fleetguard") continue;

    let met = null;
    let why = "";

    if (rune.damageTypeRequired) {
      // Vorpal. The weapon's own damage type answers it — and an item
      // with no type recorded is unanswerable rather than wrong.
      const damageType = String(item?.system?.damageType ?? "").trim().toLowerCase();
      if (damageType) {
        met = damageType === rune.damageTypeRequired;
        why = met ? "" : `${item?.name ?? "This item"} deals ${damageType} damage.`;
      }
    } else if (entry.key === "shellback") {
      // "inscribed onto a shield with a DR value" — the one usage line
      // in the Codex that names a field this system keeps.
      const dr = Number(item?.system?.dr ?? 0);
      met = dr > 0;
      why = met ? "" : `${item?.name ?? "This shield"} has no DR value, so it could not Shield Block to halve anything.`;
    } else if (rune.craftRestriction) {
      // Recorded, unanswerable. See the note above.
      why = `Nothing on a suit of armour says whether it is metal, so this is not checked.`;
    }

    // `name` is what every Codex rune carries; `label` is the shorter
    // form only some were given. Either is the rune as the book prints
    // it, and the panel wants whichever exists.
    notes.push({ key: entry.key, label: rune.name ?? rune.label, usage: rune.usage, met, why });
  }
  return notes;
}
