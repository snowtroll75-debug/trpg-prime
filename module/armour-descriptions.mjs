/**
 * The rules printed in Chapter 6's ARMOUR DESCRIPTIONS rather than its
 * table (pages 152-155). Pure; the actor's data preparation and the
 * attack workflow read them.
 *
 * NEW at 3.575.0. Three of the descriptions carry mechanics the armour
 * table has no column for, and none of the three reached play:
 *
 *   Helmets      "-1 item penalty to perception checks" (leather, metal),
 *                "-2" (full). Graham, 19 Sep 2026: a suit whose traits
 *                include Helm takes the helmet's -1, and Full Helm the -2.
 *   Metal Bracers "treated as gauntlets for attacking purposes."
 *                Graham, 19 Sep 2026: automate it.
 *   Furs/Pelts   "+2 item bonus to resist the chilling effects of wintry
 *                environments" — Graham, 19 Sep 2026: a conditional the
 *                player ticks; "-8 when soaked" stays at the table.
 *
 * WHERE THE FACT LIVES. Each of these is a property of a particular
 * item, so it is declared on that item (a flag, set in the pack by
 * tools/data-fixes.json) rather than recognised by name — a renamed
 * helmet keeps its penalty and a homebrew one can be given one. The
 * suits' Helm/Full Helm is ALSO read off their trait line, because the
 * trait is printed and is already on every copy in every world.
 *
 * ALL THREE ARE GATED ON `wornAndStanding`: equipped, and not destroyed.
 */

import { wornAndStanding } from "./item-quality.mjs";

const SYSTEM_ID = "trg-prime";

/** The printed penalties. */
const HELM_PERCEPTION_PENALTY = -1;
const FULL_HELM_PERCEPTION_PENALTY = -2;

/**
 * The Perception penalty this one piece of armour carries, as a negative
 * number, or 0.
 *
 * @param {object} item
 * @returns {number}
 */
export function armourPerceptionPenalty(item) {
  if (item?.type !== "armour") return 0;
  const flagged = Number(item?.flags?.[SYSTEM_ID]?.perceptionPenalty ?? 0);
  if (flagged) return -Math.abs(flagged);
  const traits = String(item?.system?.traits ?? "");
  if (/\bfull\s+helm\b/i.test(traits)) return FULL_HELM_PERCEPTION_PENALTY;
  if (/\bhelm\b/i.test(traits)) return HELM_PERCEPTION_PENALTY;
  return 0;
}

/**
 * The one Perception penalty a character's worn armour imposes: the
 * worst piece, not a sum. It is an ITEM penalty, and a head wears one
 * helmet — a full helmet over a suit whose own helm is -1 is still -2.
 *
 * @param {Array} items
 * @returns {{value: number, source: string}|null}
 */
export function wornPerceptionPenalty(items = []) {
  let worst = null;
  for (const item of items ?? []) {
    if (!wornAndStanding(item)) continue;
    const value = armourPerceptionPenalty(item);
    if (value < 0 && (!worst || value < worst.value)) worst = { value, source: item.name };
  }
  return worst;
}

/**
 * The Gauntlet's attack profile (Chapter 6 weapon table): 1d4
 * bludgeoning, Agile, Free-Hand, Fumble DC 6, a simple Brawling weapon.
 * Transcribed from the printed row, not read from the pack, so a pack
 * edit cannot silently change what metal bracers hit with.
 */
export const GAUNTLET_PROFILE = Object.freeze({
  damage: "1d4",
  damageType: "bludgeoning",
  traits: "Agile, Free-Hand",
  fumbleDC: 6,
  category: "Simple",
  group: "Brawling",
  // STILL AN UNARMED ATTACK (3.576.0). "A strike with a gauntlet is
  // otherwise considered an unarmed attack" — and 3.575.0's category of
  // Simple, which the proficiency rule needs, took the bracered punch out
  // of Vibrant Thorns, the one unarmed rule that read the profile rather
  // than the Unarmed Strike itself. See combat/unarmed.mjs.
  unarmed: true
});

/** The worn piece of armour that counts as gauntlets, if any. */
function wornGauntletArmour(items = []) {
  return (items ?? []).find(
    (item) => item?.type === "armour"
      && Boolean(item?.flags?.[SYSTEM_ID]?.countsAsGauntlets)
      && wornAndStanding(item)
  ) ?? null;
}

/** Is this the character's own bare-handed Unarmed Strike? */
function isUnarmedStrike(weapon) {
  return weapon?.type === "weapon"
    && Boolean(weapon?.system?.natural)
    && String(weapon?.system?.category ?? "").trim().toLowerCase() === "unarmed";
}

/**
 * METAL BRACERS ARE GAUNTLETS (Chapter 6): "Metal bracers are treated as
 * gauntlets for attacking purposes." So an Unarmed Strike made while
 * wearing them IS a gauntlet attack — the gauntlet's damage type and die,
 * its traits (Agile and Free-Hand, and not the bare fist's Finesse), its
 * fumble DC, and its category for proficiency. Everything else about the
 * strike is unchanged.
 *
 * Returns the weapon data to attack with — the original object when the
 * rule does not apply, so a caller can always use the result.
 *
 * @param {object} weapon The weapon document being attacked with.
 * @param {Array} items The attacker's items.
 * @returns {{data: object, source: object|null}}
 */
export function armouredFistProfile(weapon, items = []) {
  const data = weapon?.system ?? {};
  if (!isUnarmedStrike(weapon)) return { data, source: null };
  const bracers = wornGauntletArmour(items);
  if (!bracers) return { data, source: null };
  return { data: { ...data, ...GAUNTLET_PROFILE }, source: bracers };
}

/**
 * Furs/Pelts' cold-weather bonus as a conditional the check dialog
 * offers. OFFERED, NOT ASSUMED: nothing on a Fortitude save says whether
 * the cold is what it is resisting, so the player ticks it. Scoped to
 * Fortitude, because "Exhaustion checks ... to resist the effects of
 * extreme cold" (Chapter 7) are Fortitude saves here.
 *
 * @param {Array} items
 * @returns {Array} zero or one conditional entry
 */
export function coldWeatherConditionals(items = []) {
  let best = null;
  for (const item of items ?? []) {
    if (item?.type !== "armour" || !wornAndStanding(item)) continue;
    const value = Number(item?.flags?.[SYSTEM_ID]?.coldWeatherBonus ?? 0);
    if (value > 0 && (!best || value > best.value)) best = { value, name: item.name };
  }
  if (!best) return [];
  return [{
    kind: "modifier",
    value: best.value,
    type: "item",
    label: `${best.name} (cold weather)`,
    scope: "Checks to resist extreme cold",
    auto: false,
    when: { checkTypes: ["save"], subjects: ["fortitude"] }
  }];
}
