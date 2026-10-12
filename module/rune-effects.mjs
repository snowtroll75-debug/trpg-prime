/**
 * What the numeric runes actually do to a character (Chapter 11).
 *
 * Potency has moved a number since 3.239.0. These are the other five
 * whose effect is a plain quantity the bonus pool can carry:
 *
 *   Saving             a RESISTANCE bonus to all three saves, = tier
 *   Shadow             a STATUS bonus to Stealth, = tier
 *   Slick              a STATUS bonus to Escape and Squeeze, = tier
 *   Tough              a STATUS bonus to HP, +20 per tier
 *   Energy Resistance  resistance against one energy type, = tier
 *
 * And one from the Creature Codex's Chapter 3:
 *
 *   Ancient Echoes     a LUCK bonus of +1 to attack and to damage, on
 *                      the weapon bearing it
 *
 * The remaining twenty-four are descriptive — Returning brings a thrown
 * weapon back, Ghost Touch works on the incorporeal — and stay as text
 * on the item, because there is no number to apply.
 *
 * SLICK IS A CONDITIONAL, not a flat skill bonus: it applies to two
 * ACTIONS of Acrobatics rather than to the skill. This system already
 * has a mechanism for exactly that (conditionals.mjs), so the rune
 * declares one rather than inventing a second way to say it.
 *
 * ENERGY RESISTANCE NEEDS ITS TYPE, which the crafter chooses when the
 * rune is inscribed — "Energy Resistance II (fire)". Without one, the
 * rune reports that it needs choosing rather than silently resisting
 * nothing or, worse, everything.
 *
 * Pure functions, no Foundry API: the actor calls `runeBonusesFor` and
 * hands each entry to `addBonus`, so the arithmetic can be run in a
 * harness (section U).
 */

import { computeRuneModifiers } from "./runes.mjs";
import { runeUsageAllows, weaponUsage } from "./weapon-rune-usage.mjs";
import { runeKindOf, runesCountFor } from "./rune-bearing.mjs";
import { runeDeclaredBonuses } from "./rune-declarations.mjs";
import { fieldToRunes, perTierChoices } from "./rune-catalogue.mjs";
// Roman tiers, same ruling as rune-damage.mjs.
import { roman } from "./runes.mjs";
import { CODEX_WEAPON_RUNES } from "./codex-rune-data.mjs";

/**
 * ONE COPY OF ANY FIGURE THAT MUST AGREE WITH ITSELF. A Codex rune's
 * numbers are typed once, in `codex-rune-data.mjs`, where they are
 * checked against the printed page. Read from there rather than written
 * again here — a +1 in two files is a +1 that can become a +1 and a +5.
 */
const codexWeaponRune = (key) => CODEX_WEAPON_RUNES.find((rune) => rune.key === key);

/** The five runes with a number, and how each one spends it. */
export const NUMERIC_RUNES = Object.freeze({
  saving: {
    label: "Saving",
    kind: "saves",
    bonusType: "resistance",
    value: (tier) => tier
  },
  shadow: {
    label: "Shadow",
    kind: "skill",
    skill: "stealth",
    bonusType: "status",
    value: (tier) => tier
  },
  tough: {
    label: "Tough",
    kind: "hp",
    bonusType: "status",
    // "A status bonus to HP: +20 per tier."
    value: (tier) => tier * 20
  },
  slick: {
    label: "Slick",
    kind: "conditional",
    bonusType: "status",
    value: (tier) => tier
  },
  // One energy type per tier (3.615.0, A3) — the tier is a COUNT of types,
  // read by `perTierChoices`, not a size.
  energyResistance: {
    label: "Energy Resistance",
    kind: "resistance",
    value: (tier) => tier
  },
  // "The rune provides CR 1 / 2 / 3 / 4 ... Unfortunately this rune makes
  // the armour bulkier increasing its ACP by -1." TWO effects, and the
  // second one is a cost — a rune that only granted the CR would be
  // strictly better than the book's.
  fortification: {
    label: "Fortification",
    kind: "criticalResistance",
    value: (tier) => tier,
    acpPenalty: 1
  },
  // "You gain a bonus to all saving throws vs effects with the fear
  // trait equal to the bonus provided by the weapons potency rune to AB
  // (minimum +1)." Scoped to a TRAIT rather than a check type, so it is
  // a conditional — and its value comes from a DIFFERENT rune on the
  // same item, which no other rune does.
  courageous: {
    label: "Courageous",
    kind: "fearSaves",
    value: (tier, { potency = 0 } = {}) => Math.max(1, potency)
  },
  // "When activated the armour or shield increases its bonus to DB by +1
  // against missile attacks." Conditional on the attack, not the roll,
  // so it is reported for the defence rather than added to every DB.
  arrowCatching: {
    label: "Arrow Catching",
    kind: "missileDefence",
    value: () => 1
  },
  // "Any attacks made with the weapon inflict a critical if the AV is 3+
  // instead of the usual 4+ for a Keen weapon." Keen already adds 1 to
  // the AV for critical purposes; Razor adds another. ONLY ON A KEEN
  // PIERCING OR SLASHING MELEE WEAPON (3.618.0, B12): its usage line.
  razor: {
    label: "Razor",
    kind: "criticalAV",
    value: () => 1
  },
  // ANCIENT ECHOES (Creature Codex, Chapter 3): "all attacks made with
  // this weapon gain a +1-luck bonus to attack and damage."
  //
  // A LUCK bonus, which no other rune grants, and the type is the whole
  // rule: a character already carrying a luck bonus to attacks gets the
  // higher of the two and not their sum. That is Appendix 1's job, so
  // the type travels with the value rather than the value being added
  // somewhere as an anonymous +1.
  //
  // The rune's OTHER half — "you need no proficiency to use a weapon
  // inscribed with this rune" — is not here, because it is not a
  // quantity. It is answered in `proficiency-rules.mjs`, by the same
  // function that answers every other proficiency question, so the
  // sheet, the attack card and the spellcasting check all agree.
  ancientEchoes: {
    label: "Ancient Echoes",
    kind: "weaponStrike",
    bonusType: codexWeaponRune("ancientEchoes").bonusType,
    value: () => Number(codexWeaponRune("ancientEchoes").attackBonus),
    damageValue: () => Number(codexWeaponRune("ancientEchoes").damageBonus)
  }
});

/** The three saves a Saving rune reaches. */
export const SAVE_KEYS = Object.freeze(["fortitude", "reflex", "will"]);

/**
 * Everything an item's runes give the character wearing it.
 *
 * @param {object} item something with `type`, `name` and `system.runes`
 * @returns {{bonuses: Array<{target: string, entry: object}>,
 *   resistances: string[], conditionals: object[], problems: string[]}}
 */
export function runeBonusesFor(item) {
  // `runeKindOf` (3.577.0) so runed Travellers clothing reads as armour.
  const kind = runeKindOf(item) ?? item?.type;
  const bonuses = [];
  const resistances = [];
  const conditionals = [];
  const problems = [];
  let criticalResistance = 0;
  let acpPenalty = 0;
  let criticalAV = 0;
  let missileDefence = 0;
  // Ancient Echoes' +1 to attack and to damage. Two numbers rather than
  // one, because they are spent in two different places: the attack goes
  // into the typed pool as a luck bonus, and the damage goes into a
  // rolled formula, which has no types to stack (the same split Rage
  // already lives with).
  let strikeAttack = 0;
  let strikeDamage = 0;
  let strikeType = "";
  const empty = {
    bonuses, resistances, conditionals, problems,
    criticalResistance, acpPenalty, criticalAV, missileDefence,
    strikeAttack, strikeDamage, strikeType
  };
  if (!["weapon", "armour", "shield"].includes(kind)) return empty;

  // Courageous is worth its POTENCY rune's bonus, not its own tier — the
  // only rune whose value comes from another rune on the same item. THE
  // BONUS IT PROVIDES (3.618.0, B12 of block 37): the tier the quality lets
  // it reach, not the tier written — a Normal sword marked Potency III gives
  // +1 to attack, and so +1 against fear.
  const potencyTierOnItem = kind === "weapon"
    ? Number(computeRuneModifiers({ kind, runes: item?.system?.runes ?? "", quality: item?.system?.quality }).attack) || 0
    : fieldToRunes(kind, item?.system?.runes ?? "").find((r) => r.key === "potency")?.tier ?? 0;
  // A rune this weapon cannot take is suppressed (B10): Razor without Keen.
  const usage = kind === "weapon" ? weaponUsage(item?.system) : null;

  for (const chosen of fieldToRunes(kind, item?.system?.runes ?? "")) {
    const rune = NUMERIC_RUNES[chosen.key];
    if (!rune) continue;
    if (usage && !runeUsageAllows(chosen.key, usage).ok) continue;
    const tier = Math.max(1, Math.floor(Number(chosen.tier) || 1));
    const value = rune.value(tier, { potency: potencyTierOnItem });
    const source = `${item.name} (${rune.label}${tier > 1 ? ` ${roman(tier)}` : ""})`;

    if (rune.kind === "saves") {
      for (const save of SAVE_KEYS) {
        bonuses.push({
          target: `system.combat.saves.${save}`,
          entry: { type: rune.bonusType, value, source }
        });
      }
      continue;
    }
    if (rune.kind === "skill") {
      bonuses.push({
        target: `system.skills.${rune.skill}`,
        entry: { type: rune.bonusType, value, source }
      });
      continue;
    }
    if (rune.kind === "hp") {
      bonuses.push({
        target: "system.resources.hp.max",
        entry: { type: rune.bonusType, value, source }
      });
      continue;
    }
    if (rune.kind === "conditional") {
      // Escape and Squeeze are Acrobatics ACTIONS, so this is offered as
      // a tickbox on an Acrobatics check rather than added to every one.
      // The shape `normaliseConditional` expects: the scope lives under
      // `when`, and the axes are named as that module names them.
      conditionals.push({
        kind: "modifier",
        value,
        type: rune.bonusType,
        when: { checkTypes: ["skill"], subjects: ["acrobatics"], actions: ["escape", "squeeze"] },
        label: `${source} — Escape and Squeeze only`,
        text: "A status bonus to Escape and Squeeze (Acrobatics) checks equal to the rune's tier."
      });
      continue;
    }
    if (rune.kind === "criticalResistance") {
      criticalResistance += value;
      // The rune's own cost, and the reason it is not simply free CR.
      acpPenalty += rune.acpPenalty ?? 0;
      continue;
    }
    if (rune.kind === "criticalAV") {
      criticalAV += value;
      continue;
    }
    if (rune.kind === "fearSaves") {
      conditionals.push({
        kind: "modifier",
        value,
        type: "untyped",
        when: { checkTypes: ["save"], traits: ["fear"] },
        label: `${source} — against fear`,
        text: "A bonus to saves against fear effects equal to the weapon's potency bonus (minimum +1)."
      });
      continue;
    }
    if (rune.kind === "missileDefence") {
      // ONLY WHILE ACTIVATED (3.615.0, Graham's R6 of block 36): "Activate
      // Engage (1 AP) … When activated". It used to apply always.
      if (item?.flags?.["trg-prime"]?.runeState?.arrowCatching) missileDefence += value;
      continue;
    }
    if (rune.kind === "weaponStrike") {
      // Two numbers, read separately, because the page states two —
      // "a +1-luck bonus to attack and damage". They happen to be equal
      // and a single number would have hidden the day they are not.
      strikeAttack += value;
      strikeDamage += rune.damageValue(tier);
      strikeType = rune.bonusType;
      continue;
    }
    if (rune.kind === "resistance") {
      if (!chosen.parameter) {
        problems.push(
          `${item.name}'s Energy Resistance rune has no energy type chosen — pick one in Customise.`);
        continue;
      }
      // ONE TYPE PER TIER (3.615.0, A3 of block 36). The tier used to be
      // written as a magnitude ("fire 3") that the resolver then ignored,
      // and only ever one type was granted. Now each named type is a
      // resistance of its own, up to the number the tier allows; the
      // first ones named are the ones that count.
      const { types, allowed, unknown } = perTierChoices(chosen.key, chosen.parameter, tier);
      if (unknown.length) {
        problems.push(`${item.name}'s Energy Resistance names ${unknown.join(", ")}, which ${unknown.length === 1 ? "is not an energy type" : "are not energy types"} (acid, cold, electricity, fire, sonic).`);
      }
      if (types.length > allowed) {
        problems.push(`${item.name}'s Energy Resistance ${roman(tier)} protects against ${allowed} type${allowed === 1 ? "" : "s"}; only ${types.slice(0, allowed).join(", ")} count.`);
      }
      for (const type of types.slice(0, allowed)) resistances.push(type);
    }
  }
  return {
    bonuses, resistances, conditionals, problems,
    criticalResistance, acpPenalty, criticalAV, missileDefence,
    strikeAttack, strikeDamage, strikeType
  };
}

/**
 * Every equipped rune-bearing item's contribution, gathered.
 *
 * The scalars are SUMMED rather than maxed: two suits of Fortification
 * cannot be worn at once anyway, and where a character genuinely wears
 * two runed pieces the chapter gives no "highest only" rule to apply.
 * The typed pool still governs the bonuses that go through it.
 */
export function runeBonusesForActor(items = []) {
  const all = {
    bonuses: [], resistances: [], conditionals: [], problems: [],
    criticalResistance: 0, acpPenalty: 0, criticalAV: 0, missileDefence: 0
  };
  for (const item of items ?? []) {
    if (!item?.system?.equipped) continue;
    // RUNED CLOTHING UNDER BODY ARMOUR COUNTS FOR NOTHING (3.577.0, R9).
    if (!runesCountFor(item, items)) continue;
    const result = runeBonusesFor(item);
    all.bonuses.push(...result.bonuses);
    all.resistances.push(...result.resistances);
    all.conditionals.push(...result.conditionals);
    // A REGISTERED RUNE'S DECLARED BONUSES AND OFFERS (3.626.0): Anchored
    // Soul's +2 item against possession, Vowkeeper's class bonus to damage.
    const declared = runeDeclaredBonuses(item, items);
    all.bonuses.push(...declared.bonuses);
    all.conditionals.push(...declared.conditionals);
    all.problems.push(...result.problems);
    all.criticalResistance += result.criticalResistance;
    all.acpPenalty += result.acpPenalty;
    all.criticalAV += result.criticalAV;
    all.missileDefence += result.missileDefence;
    // strikeAttack and strikeDamage are DELIBERATELY NOT GATHERED HERE.
    // Every other scalar in this function is a property of the
    // character — their critical resistance, their armour check penalty
    // — and summing them across worn items is right. Ancient Echoes'
    // +1 belongs to ONE WEAPON: "all attacks made with this weapon".
    // Summed here, a runed dagger in the off hand would sharpen the
    // sword in the main one. The attack workflow asks the weapon it is
    // swinging, through `runeBonusesFor`, and that is the only correct
    // place to ask.
  }
  return all;
}
