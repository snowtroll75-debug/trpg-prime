/**
 * verify-chapter6-gear-151-160 — armour, shields and weapons (pages 151-160).
 *
 * NEW at 3.575.0, for the pages 151-160 audit. The printed tables were all
 * right; what was wrong was whether the TRAITS and DESCRIPTIONS reached
 * play. Eighteen defects, and the worst of them looked healthy:
 *
 *   - a Shield Block made with the Shield spell threw before it asked for
 *     the blow (3.542.0's live test checked eligibility and never took the
 *     reaction), and the spell shield outlived its spell for good;
 *   - seventeen Large weapons never got the printed x1.5 two-handed, so
 *     the book's two-handers hit softer than its hand-and-a-half blades;
 *   - Double made every attack Agile and could not be used to Double Slice;
 *   - Boss, Spikes and weapon Balanced were computed and read by nobody;
 *   - a buckler whose arm was busy took a flat-footed character's DB to -1.
 *
 * EVERY EXPECTED VALUE IS TRANSCRIBED FROM THE PRINTED PAGE or from one of
 * Graham's rulings of 19 September 2026, never from the module under test.
 * The three tables below are the book's rows as extracted from rulebook
 * 3.8.1, pages 151, 156 and 160.
 *
 * ONE CORRECTION TO MY OWN AUDIT, recorded here where it will be re-run:
 * the block-15 report said the armour table matched 260/260. It did so on
 * a numeric coincidence — the Other table's printed "-1" Max Dex (chain
 * and metal greaves, metal bracers) is a MODIFIER, and the pack's -1 is
 * the "no cap" sentinel. A1 below compares the meaning, not the digits.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  twoHandedStrengthApplies, heldInTwoHandGrip, itemRequiredHands, handsOccupied,
  shieldHandCanCarry, hasFreeHandAvailable
} from "../module/held-items.mjs";
import {
  handAndAHalfStrengthBonus, effectiveFumbleDC, maneuverWeapon
} from "../module/combat/attack.mjs";
import {
  isDoubleWeapon, doubleWeaponInBothHands, doubleSliceRequirement, doubleSlicePairValid,
  secondStrikeModifier, OFF_HAND_PENALTY
} from "../module/combat/double-slice.mjs";
import {
  proficiencyProfile, proficiencyOf, racialWeaponMatches, effectiveWeaponCategory,
  SHIELD_CATEGORY_COVERED_BY
} from "../module/proficiency-rules.mjs";
import { WEAPON_GROUPS } from "../module/config.mjs";
import { ammunitionFitsWeapon, weaponAmmunitionFamily } from "../module/combat/ammunition.mjs";
import { shieldBlockEligibility } from "../module/combat/shield-block.mjs";
import { shieldBaseDR } from "../module/items.mjs";
import {
  spellShieldsWithout, withRecastLockout, recastLockoutRemaining
} from "../module/magic/spell-shield.mjs";
import { computeWeaponModifiers, stepUpDieSize } from "../module/item-quality.mjs";
import { spinDamageBonus, spinHeadroom, SPIN_MAX_BONUS } from "../module/combat/reload.mjs";
import { fightDefensivelyAttackPenalty, FIGHT_DEFENSIVELY_ATTACK_PENALTY } from "../module/combat/basic-action-stances.mjs";
import { isBuckler } from "../module/buckler.mjs";
import { concealableWeaponConditionals } from "../module/stealth.mjs";
import {
  armourPerceptionPenalty, wornPerceptionPenalty, armouredFistProfile, coldWeatherConditionals,
  GAUNTLET_PROFILE
} from "../module/armour-descriptions.mjs";
import { adjustedMaxDexCap } from "../module/encumbrance.mjs";

let failures = 0;
let checks = 0;
function ok(label, condition, why = "") {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  FAIL ${label}${why ? ` — ${why}` : ""}`);
}
function eq(label, actual, expected, why = "") {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `${why}${why ? " — " : ""}got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");

async function packItems(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith("!items!") && !key.slice(7).includes("!")) out.push(value);
  }
  await db.close();
  return out;
}
const byName = (items) => new Map(items.map((i) => [i.name, i]));
const armourPack = await packItems("armour");
const shieldPack = await packItems("shields");
const weaponPack = await packItems("weapons");
const ammoPack = await packItems("ammunition");
const ARMOUR = byName(armourPack);
const SHIELDS = byName(shieldPack);
const WEAPONS = byName(weaponPack);
const AMMO = byName(ammoPack);
const equip = (item, extra = {}) => ({ ...item, system: { ...item.system, equipped: true, ...extra } });

/* ================================================================== */
/* THE PRINTED TABLES (rulebook 3.8.1, pages 151, 156, 160)            */
/* ================================================================== */

const PRINTED_ARMOUR = Object.freeze([
  ["LIGHT ARMOUR", "Furs/Pelts", "0", "4", "0", "6", "1", "10", "0", "11", "-"],
  ["LIGHT ARMOUR", "Padded", "0", "10", "0", "8", "0", "10", "0", "5", "-"],
  ["LIGHT ARMOUR", "Leather", "0", "20", "0", "6", "1", "20", "0", "10", "-"],
  ["LIGHT ARMOUR", "Reinforced Leather", "0", "30", "-1", "5", "1", "30", "0", "15", "Rigid"],
  ["LIGHT ARMOUR", "Full Leather", "0", "30", "-1", "6", "1", "30", "0", "15", "--"],
  ["LIGHT ARMOUR", "Full Reinforced Leather", "0", "40", "-2", "5", "1", "40", "0", "22", "Rigid"],
  ["MEDIUM ARMOUR", "Hide", "0", "30", "-2", "4", "2", "20", "0", "15", "-"],
  ["MEDIUM ARMOUR", "Hardened Leather", "1", "100", "-2", "4", "3", "30", "-5", "15", "Rigid"],
  ["MEDIUM ARMOUR", "Scale", "1", "100", "-2", "3", "4", "50", "0", "18", "Metal, Rigid"],
  ["MEDIUM ARMOUR", "Chain", "1", "150", "-2", "4", "4", "40", "-5", "25", "Metal"],
  ["MEDIUM ARMOUR", "Full Hardened Leather", "1", "115", "-3", "4", "3", "45", "-5", "22", "Rigid, Helm"],
  ["MEDIUM ARMOUR", "Full Chainmail", "1", "205", "-4", "3", "4", "70", "-10", "44", "Metal, Helm"],
  ["HEAVY ARMOUR", "Banded", "1", "200", "-2", "2", "4", "50", "-5", "20", "Metal, Rigid"],
  ["HEAVY ARMOUR", "Lamellar", "2", "250", "-4", "1", "5", "50", "-5", "30", "Metal"],
  ["HEAVY ARMOUR", "Splint", "2", "250", "-3", "1", "5", "60", "-5", "25", "Metal, Rigid"],
  ["HEAVY ARMOUR", "Plate", "3", "450", "-5", "3", "6", "60", "-10", "30", "Metal, Rigid"],
  ["HEAVY ARMOUR", "Full Platemail", "3", "580", "-8", "1", "6", "110", "-15", "60", "Metal, Rigid Full Helm"],
  ["OTHER", "Leather Helmet", "0", "5", "0", "-", "-", "5", "-", "2", "-"],
  ["OTHER", "Metal Helmet", "0", "20", "0", "-", "-", "10", "-", "4", "Metal"],
  ["OTHER", "Full Helmet", "1", "100", "0", "-", "-", "20", "-", "6", "Metal, Rigid"],
  ["OTHER", "Chain Greaves", "0", "25", "-1", "-1", "-", "10", "-5", "10", "Metal"],
  ["OTHER", "Leather Greaves", "0", "5", "0", "-", "-", "5", "-", "3", "-"],
  ["OTHER", "Metal Greaves", "0", "30", "-2", "-1", "-", "15", "-5", "20", "Metal, Rigid"],
  ["OTHER", "Chain Bracers", "0", "10", "-1", "-", "-", "10", "-", "5", "Metal"],
  ["OTHER", "Leather Bracers", "0", "5", "-1", "-", "-", "5", "-", "2", "-"],
  ["OTHER", "Metal Bracers", "0", "20", "-1", "-1", "-", "15", "-", "6", "Metal, Rigid"]
]);

const PRINTED_SHIELDS = Object.freeze([
  ["Brazadokur", "300", "2", "2", "-1", "10 lbs", "1", "12"],
  ["Buckler", "10", "0", "1", "-1", "5 lbs", "0", "6"],
  ["Klar - Bone", "20", "0", "1", "-1", "5 lbs", "0", "10"],
  ["Klar - Steel", "40", "0", "1", "-1", "6 lbs", "0", "12"],
  ["Light Steel Shield", "20", "0", "1", "-1", "6 lbs", "0", "12"],
  ["Light Wooden Shield", "10", "0", "1", "-1", "5 lbs", "0", "10"],
  ["Madu - Leather", "80", "1", "1", "-2", "5 lbs", "0", "10"],
  ["Madu - Steel", "120", "1", "1", "-2", "7 lbs", "0", "15"],
  ["Heavy Steel Shield", "40", "0", "2", "-2", "15 lbs", "1", "20"],
  ["Heavy Wooden Shield", "20", "0", "2", "-2", "10 lbs", "1", "15"],
  ["Parrying Scabbard", "5", "0", "1", "-", "2 lbs", "0", "4"],
  ["Tower Shield", "150", "1", "4", "-8", "45 lbs", "2", "30"]
]);

const PRINTED_MELEE = Object.freeze([
  ["MELEE SIMPLE WEAPONS", "Brass Knuckles", "1 gp", "0", "1d4 B", "S", "6", "1 lb", "Brawling", "Agile, Free-Hand, Finesse"],
  ["MELEE SIMPLE WEAPONS", "Club", "1 sp", "0", "1d5 B", "S", "12", "3 lbs", "Club", "Thrown 10ft."],
  ["MELEE SIMPLE WEAPONS", "Dagger", "2 gp", "0", "1d4 P", "T", "5", "1 lb", "Knife", "Agile, Finesse, Thrown 10 ft, Versatile S"],
  ["MELEE SIMPLE WEAPONS", "Gauntlet", "-", "0", "1d4 B", "S", "6", "1 lb", "Brawling", "Agile, Free-Hand"],
  ["MELEE SIMPLE WEAPONS", "Light Mace", "5 gp", "0", "1d6 B", "S", "8", "4 lbs", "Club", "AR 1, Agile, Finesse"],
  ["MELEE SIMPLE WEAPONS", "Long Spear", "5 gp", "0", "1d8 P", "L", "18", "9 lbs", "Spear", "Clumsy, Reach"],
  ["MELEE SIMPLE WEAPONS", "Heavy Mace", "12 gp", "0", "1d8 B", "M", "8", "8 lbs", "Club", "AR 2, Shove"],
  ["MELEE SIMPLE WEAPONS", "Morning Star", "10 gp", "0", "1d8 B", "M", "16", "6 lbs", "Club", "AR 1, Mighty +2, Versatile P"],
  ["MELEE SIMPLE WEAPONS", "Sickle", "2 gp", "0", "1d4 S", "S", "12", "2 lbs", "Knife", "Agile, Finesse, Trip"],
  ["MELEE SIMPLE WEAPONS", "Spear", "1 gp", "0", "1d6 P", "M", "16", "3 lbs", "Spear", "Hand & a Half, Thrown 20 ft"],
  ["MELEE SIMPLE WEAPONS", "Spiked Gauntlet", "3 gp", "0", "1d4 P", "S", "6", "1 lb", "Brawling", "Agile, Free-Hand"],
  ["MELEE SIMPLE WEAPONS", "Staff", "1 gp", "0", "1d6 B", "M", "12", "4 lbs", "Club", "Double, Hand & a Half, Trip"],
  ["MELEE MARTIAL WEAPONS", "Bardiche", "13 gp", "0", "1d12 S", "L", "20", "14 lbs", "Polearm", "Clumsy, Reach, Versatile P"],
  ["MELEE MARTIAL WEAPONS", "Bastard Sword", "40 gp", "0", "1d8 S", "M", "16", "5 lbs", "Sword", "Hand & a Half"],
  ["MELEE MARTIAL WEAPONS", "Battle Axe", "20 gp", "0", "1d8 S", "M", "18", "6 lbs", "Axe", "AR 1, Hand & a Half, Sweep"],
  ["MELEE MARTIAL WEAPONS", "Broadsword", "10 gp", "0", "1d8 S", "M", "10", "4 lbs", "Sword", "-"],
  ["MELEE MARTIAL WEAPONS", "Cestus", "5 gp", "0", "1d5 P", "S", "6", "1 lb", "Brawling", "Agile, Free-Hand"],
  ["MELEE MARTIAL WEAPONS", "Elendaris", "20 gp", "0", "1d4 P", "S", "4", "1 lb", "Knife", "Agile, Deadly, Finesse, Thrown 20 ft, Versatile S"],
  ["MELEE MARTIAL WEAPONS", "Falchion", "75 gp", "1", "1d8 S", "M", "18", "8 lbs", "Sword", "Keen, Sweep"],
  ["MELEE MARTIAL WEAPONS", "Flail", "10 gp", "0", "1d10 B", "M", "18", "6 lbs", "Flail", "AR 1, Clumsy, Disarm, Mighty +2, Sweep, Trip"],
  ["MELEE MARTIAL WEAPONS", "Footman’s Flail", "18 gp", "0", "1d12 B", "L", "20", "10 lbs", "Flail", "AR 1, Clumsy, Disarm, Mighty +2, Reach, Sweep, Trip"],
  ["MELEE MARTIAL WEAPONS", "Footman's Mace", "12 gp", "0", "1d10 B", "L", "18", "10 lbs", "Club", "AR 2, Shove"],
  ["MELEE MARTIAL WEAPONS", "Glaive", "8 gp", "0", "1d10 S", "L", "18", "10 lbs", "Polearm", "Clumsy, Deadly, Reach"],
  ["MELEE MARTIAL WEAPONS", "Greataxe", "20 gp", "0", "1d12 S", "L", "20", "12 lbs", "Axe", "AR 1, Sweep"],
  ["MELEE MARTIAL WEAPONS", "Greatclub", "5 gp", "0", "1d10 B", "L", "20", "8 lbs", "Club", "Shove"],
  ["MELEE MARTIAL WEAPONS", "Greatpick", "20 gp", "0", "1d8 P", "L", "18", "9 lbs", "Pick", "AR 1, Mighty +2"],
  ["MELEE MARTIAL WEAPONS", "Greatsword", "50 gp", "0", "2d6 S", "L", "18", "8 lbs", "Sword", "AR 1, Keen"],
  ["MELEE MARTIAL WEAPONS", "Halberd", "10 gp", "0", "1d12 P", "L", "16", "12 lbs", "Polearm", "AR 1, Clumsy, Reach, Versatile S"],
  ["MELEE MARTIAL WEAPONS", "Handaxe", "6 gp", "0", "1d6 S", "S", "8", "3 lbs", "Axe", "Agile, Sweep, Thrown 10 ft"],
  ["MELEE MARTIAL WEAPONS", "Khopesh", "120 gp", "1", "1d10 S", "L", "18", "10 lbs", "Sword", "Keen, Sweep, Trip"],
  ["MELEE MARTIAL WEAPONS", "Lance", "10 gp", "0", "1d10 P", "L", "20", "10 lbs", "Spear", "AR 2, Clumsy, Deadly, Reach"],
  ["MELEE MARTIAL WEAPONS", "Light Hammer", "1 gp", "0", "1d6 B", "S", "6", "2 lbs", "Hammer", "Agile, Thrown 20 ft."],
  ["MELEE MARTIAL WEAPONS", "Light Pick", "4 gp", "0", "1d4 P", "S", "8", "3 lbs", "Pick", "AR 1, Agile, Mighty +2"],
  ["MELEE MARTIAL WEAPONS", "Main-Gauche", "15 gp", "0", "1d4 P", "T", "4", "1 lb", "Knife", "Agile, Disarm, Finesse, Parry, Thrown 10 ft"],
  ["MELEE MARTIAL WEAPONS", "Mattock", "40 gp", "0", "1d12 B", "L", "18", "14 lbs", "Hammer", "AR 1, Shove"],
  ["MELEE MARTIAL WEAPONS", "Pick", "7 gp", "0", "1d6 P", "M", "14", "6 lbs", "Pick", "AR 1, Mighty +2"],
  ["MELEE MARTIAL WEAPONS", "Ranseur", "10 gp", "0", "1d12 P", "L", "18", "12 lbs", "Polearm", "Clumsy, Disarm, Reach"],
  ["MELEE MARTIAL WEAPONS", "Rapier", "20 gp", "0", "1d6 P", "M", "10", "2 lbs", "Sword", "Deadly, Disarm, Finesse"],
  ["MELEE MARTIAL WEAPONS", "Sap", "1 gp", "0", "1d6 N", "T", "6", "2 lbs", "Club", "Agile, Finesse"],
  ["MELEE MARTIAL WEAPONS", "Scimitar", "15 gp", "0", "1d6 S", "M", "8", "4 lbs", "Sword", "Keen, Sweep"],
  ["MELEE MARTIAL WEAPONS", "Scythe", "18 gp", "0", "2d8 S", "L", "20", "12 lbs", "Polearm", "AR 1, Clumsy, Deadly, Trip"],
  ["MELEE MARTIAL WEAPONS", "Short Sword", "10 gp", "0", "1d6 S", "S", "6", "2 lbs", "Sword", "Agile, Finesse, Versatile P"],
  ["MELEE MARTIAL WEAPONS", "Sword Cane", "45 gp", "0", "1d6 P", "M", "8", "4 lbs", "Sword", "Agile, Concealable, Finesse"],
  ["MELEE MARTIAL WEAPONS", "Trident", "15 gp", "0", "1d8 P", "M", "16", "4 lbs", "Spear", "Thrown 20 ft"],
  ["MELEE MARTIAL WEAPONS", "Warhammer", "12 gp", "0", "1d8 B", "M", "12", "5 lbs", "Hammer", "AR 1, Shove"]
]);

/* ================================================================== */
/* A — THE DATA LAYER                                                  */
/* ================================================================== */

const num = (text) => {
  const raw = String(text ?? "").trim();
  if (!raw || /^-+$/.test(raw)) return 0;
  return Number(raw);
};
const gp = (text) => {
  const raw = String(text ?? "").trim();
  if (!raw || raw === "-") return 0;
  const m = raw.match(/^([\d.,½]+)\s*(gp|sp|cp)?$/i);
  if (!m) return NaN;
  const n = Number(m[1].replace(",", "").replace("½", ".5"));
  return { sp: n / 10, cp: n / 100 }[String(m[2]).toLowerCase()] ?? n;
};
const lbs = (text) => {
  const raw = String(text ?? "").trim().replace(/\s*lbs?\.?$/i, "");
  if (!raw || raw === "-") return 0;
  return raw === "½" ? 0.5 : Number(raw.replace("½", ".5"));
};
const traitSet = (text) => String(text ?? "").split(",")
  .map((t) => t.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, "").replace(/\.$/, "").replace(/ft\.?$/, "ft"))
  .filter((t) => t && !/^-+$/.test(t)).sort();
const SIZE = { T: "tiny", S: "small", M: "medium", L: "large", H: "huge" };
// N is the book's nonlethal, which this system calls subdual (the Sap).
const DMG = { B: "bludgeoning", P: "piercing", S: "slashing", N: "subdual" };

/* A1 — ARMOUR, 26 rows. Columns: Lvl, Price, ACP, Max Dex, DR, HP, Speed,
 * Wt, Traits, plus the category from the table's own heading.
 * SCALE: printed "Metal, Rigid"; Graham, 9 Sep 2026 — the pack's "Rigid"
 * is right and the book is the erratum.
 * MAX DEX on the Other table is a MODIFIER ("-" none, "-1" one less). */
const armourDiffs = [];
let armourFields = 0;
for (const [heading, name, lvl, price, acp, maxDex, dr, hp, speed, wt, traits] of PRINTED_ARMOUR) {
  const item = ARMOUR.get(name);
  if (!item) { armourDiffs.push(`${name}: not in the pack`); continue; }
  const s = item.system;
  const other = heading === "OTHER";
  const printedTraits = name === "Scale" ? "Rigid" : traits;
  const want = {
    category: { "LIGHT ARMOUR": "Light", "MEDIUM ARMOUR": "Medium", "HEAVY ARMOUR": "Heavy", OTHER: "Other" }[heading],
    level: num(lvl), price: gp(price), acp: Math.abs(num(acp)),
    cap: other ? -1 : num(maxDex),
    capModifier: other ? num(maxDex) : 0,
    dr: num(dr), hp: num(hp), speed: Math.abs(num(speed)), weight: lbs(wt),
    traits: traitSet(printedTraits).join("|")
  };
  const got = {
    category: s.category, level: s.itemLevel, price: s.price, acp: Math.abs(Number(s.penalty) || 0),
    cap: s.maxDexBonus, capModifier: Number(s.maxDexModifier ?? 0),
    dr: s.dr, hp: s.hp?.max, speed: Math.abs(Number(s.speedPenalty) || 0), weight: s.weight,
    traits: traitSet(s.traits).join("|")
  };
  for (const key of Object.keys(want)) {
    armourFields++;
    if (JSON.stringify(want[key]) !== JSON.stringify(got[key])) {
      armourDiffs.push(`${name}.${key}: printed ${JSON.stringify(want[key])}, pack ${JSON.stringify(got[key])}`);
    }
  }
}
eq("A1 all 26 printed armour rows are in the pack", PRINTED_ARMOUR.length, 26);
ok(`A1 every armour field matches the printed table (${armourFields} fields)`, armourDiffs.length === 0, armourDiffs.join("; "));
eq("A1b the three Other-table -1s are carried as modifiers",
  ["Chain Greaves", "Metal Greaves", "Metal Bracers"].map((n) => ARMOUR.get(n)?.system?.maxDexModifier), [-1, -1, -1]);

/* A2 — SHIELDS, 12 rows. Columns: Price, Lvl, DB, ACP, Wt, DR, HP. */
const shieldDiffs = [];
let shieldFields = 0;
for (const [name, price, lvl, db, acp, wt, dr, hp] of PRINTED_SHIELDS) {
  const item = SHIELDS.get(name);
  if (!item) { shieldDiffs.push(`${name}: not in the pack`); continue; }
  const s = item.system;
  const want = { price: gp(price), level: num(lvl), db: num(db), acp: Math.abs(num(acp)), weight: lbs(wt), dr: num(dr), hp: num(hp) };
  const got = { price: s.price, level: s.itemLevel, db: s.defenceBonus, acp: Math.abs(Number(s.penalty) || 0), weight: s.weight, dr: s.dr, hp: s.hp?.max };
  for (const key of Object.keys(want)) {
    shieldFields++;
    if (JSON.stringify(want[key]) !== JSON.stringify(got[key])) shieldDiffs.push(`${name}.${key}: printed ${want[key]}, pack ${got[key]}`);
  }
}
eq("A2 all 12 printed shields", PRINTED_SHIELDS.length, 12);
ok(`A2 every shield field matches (${shieldFields} fields)`, shieldDiffs.length === 0, shieldDiffs.join("; "));

/* A3 — MELEE SIMPLE AND MARTIAL WEAPONS, 45 rows. */
const meleeDiffs = [];
let meleeFields = 0;
for (const [heading, name, price, lvl, dmg, size, fumble, wt, group, traits] of PRINTED_MELEE) {
  const item = WEAPONS.get(name);
  if (!item) { meleeDiffs.push(`${name}: not in the pack`); continue; }
  const s = item.system;
  const [die, letter] = String(dmg).split(/\s+/);
  const want = {
    category: heading.includes("SIMPLE") ? "Simple" : "Martial",
    price: gp(price), level: num(lvl), damage: die, damageType: DMG[letter], size: SIZE[size],
    fumble: num(fumble), weight: lbs(wt), group, traits: traitSet(traits).join("|")
  };
  const got = {
    category: s.category, price: s.price, level: s.itemLevel ?? 0, damage: s.damage, damageType: s.damageType,
    size: s.size, fumble: s.fumbleDC, weight: s.weight, group: s.group, traits: traitSet(s.traits).join("|")
  };
  for (const key of Object.keys(want)) {
    meleeFields++;
    if (JSON.stringify(want[key]) !== JSON.stringify(got[key])) meleeDiffs.push(`${name}.${key}: printed ${JSON.stringify(want[key])}, pack ${JSON.stringify(got[key])}`);
  }
}
eq("A3 all 45 printed melee weapons", PRINTED_MELEE.length, 45);
ok(`A3 every melee weapon field matches (${meleeFields} fields)`, meleeDiffs.length === 0, meleeDiffs.join("; "));

/* A4 — THE WEAPON GROUPS, page 157, as printed. R6 (Graham, 19 Sep
 * 2026): follow print, so the crossbows are Bow and the blowgun Dart. */
const PRINTED_GROUPS = {
  Axe: ["Battle Axe", "Greataxe", "Handaxe", "Zokarrin"],
  Brawling: ["Brass Knuckles", "Gauntlet", "Spiked Gauntlet", "Cestus"],
  Club: ["Club", "Light Mace", "Heavy Mace", "Staff", "Footman's Mace", "Greatclub", "Morning Star", "Sap"],
  Knife: ["Dagger", "Sickle", "Elendaris"],
  Spear: ["Long Spear", "Spear", "Lance", "Trident"],
  Polearm: ["Bardiche", "Glaive", "Halberd", "Ranseur", "Scythe"],
  Sword: ["Bastard Sword", "Broadsword", "Falchion", "Greatsword", "Khopesh", "Rapier", "Scimitar", "Short Sword", "Sword Cane", "Double-Blade", "Katana", "Sil’maril", "Tel’dorin"],
  Flail: ["Flail", "Footman’s Flail", "Spiked Chain", "Whip"],
  Hammer: ["Light Hammer", "Mattock", "Warhammer", "Anar Dhagor"],
  Pick: ["Greatpick", "Light Pick", "Pick"],
  Dart: ["Blowgun", "Dart", "Javelin", "Shuriken"],
  Bow: ["Hand Crossbow", "Heavy Crossbow", "Light Crossbow", "Composite Longbow", "Composite Shortbow", "Longbow", "Short Bow", "Repeater"],
  Sling: ["Sling", "Bola", "Riath-Elenya"]
};
eq("A4 WEAPON_GROUPS is the thirteen printed groups", [...WEAPON_GROUPS].sort(), Object.keys(PRINTED_GROUPS).sort());
const groupDiffs = [];
for (const [group, names] of Object.entries(PRINTED_GROUPS)) {
  for (const name of names) {
    const item = WEAPONS.get(name) ?? WEAPONS.get(name.replace("’", "'"));
    if (!item) { groupDiffs.push(`${name}: not in the pack`); continue; }
    if (item.system.group !== group) groupDiffs.push(`${name}: printed ${group}, pack ${item.system.group}`);
  }
}
ok("A4 every printed group member is in that group in the pack", groupDiffs.length === 0, groupDiffs.join("; "));
ok("A4 no pack weapon is in a group the book does not print",
  weaponPack.every((w) => WEAPON_GROUPS.includes(w.system.group)),
  weaponPack.filter((w) => !WEAPON_GROUPS.includes(w.system.group)).map((w) => `${w.name}: ${w.system.group}`).join(", "));

/* ================================================================== */
/* B — WEAPON SIZE AND GRIP (page 157; D1, D2; R1)                     */
/* ================================================================== */

/* PRINTED: "Weapons that are one size category larger can be used ...
 * two-handed (if such a weapon is used two-handed, your melee damage bonus
 * is multiplied by 1.5)." Graham, R1: every one of them; and his earlier
 * clarification stands — such a weapon NEEDS two hands. */
const largeMelee = weaponPack.filter((w) => w.system.attackMode === "melee" && w.system.size === "large");
eq("B1 seventeen Large melee weapons in the pack", largeMelee.length, 17);
ok("B1 every one of them earns the x1.5 for a Medium wielder",
  largeMelee.every((w) => twoHandedStrengthApplies(w, "medium")),
  largeMelee.filter((w) => !twoHandedStrengthApplies(w, "medium")).map((w) => w.name).join(", "));
ok("B1 and needs two hands", largeMelee.every((w) => itemRequiredHands(w, "medium") === 2));
ok("B2 a Large wielder's Large weapon is its own size — no x1.5",
  !twoHandedStrengthApplies(WEAPONS.get("Greatsword"), "large"));
ok("B2 a Medium longsword-class weapon without the grip gets none",
  !twoHandedStrengthApplies(WEAPONS.get("Broadsword"), "medium"));
const bastard = WEAPONS.get("Bastard Sword");
ok("B3 Hand & a Half one-handed: no x1.5", !twoHandedStrengthApplies(equip(bastard, { twoHandedGrip: false }), "medium"));
ok("B3 Hand & a Half two-handed: x1.5", twoHandedStrengthApplies(equip(bastard, { twoHandedGrip: true }), "medium"));
ok("B3 a stale grip flag on a weapon without the trait means nothing",
  !heldInTwoHandGrip(equip(WEAPONS.get("Broadsword"), { twoHandedGrip: true })));
ok("B3 a natural attack never", !twoHandedStrengthApplies({ type: "weapon", system: { natural: true, size: "large" } }, "medium"));
/* D2: the grip takes both hands. */
eq("B4 Hand & a Half one-handed takes one hand", itemRequiredHands(equip(bastard, { twoHandedGrip: false }), "medium"), 1);
eq("B4 two-handed takes two", itemRequiredHands(equip(bastard, { twoHandedGrip: true }), "medium"), 2);
const heavyShield = equip(SHIELDS.get("Heavy Steel Shield"));
eq("B4 two-handed bastard sword and a heavy shield is three hands, not two",
  handsOccupied([equip(bastard, { twoHandedGrip: true }), heavyShield], "medium"), 3);
/* The multiplier itself, rounding down (an interpretation already on record). */
eq("B5 x1.5 of +3 is +4", handAndAHalfStrengthBonus(true, 3), 4);
eq("B5 and not applied, +3", handAndAHalfStrengthBonus(false, 3), 3);

const attackSrc = read("module", "combat", "attack-workflow.mjs");
ok("B6 the attack path asks the shared rule, melee only",
  /const usedTwoHanded = !isRanged &&\s*twoHandedStrengthApplies\(/.test(attackSrc));
ok("B6 the damage roll no longer ANDs the x1.5 with the Hand & a Half trait",
  /handAndAHalfStrengthBonus\(usedTwoHanded, strengthMod\)/.test(attackSrc)
    && !/hasHandAndAHalf && usedTwoHanded/.test(attackSrc));
ok("B6 the standalone damage button uses the same rule",
  /usedTwoHanded: twoHandedHere,/.test(attackSrc));
const sheetSrc = read("module", "sheets", "actor-sheet.mjs");
ok("B7 the grip is asked BEFORE the hand budget is checked",
  sheetSrc.indexOf("grip = await promptTwoHandedGrip(") > 0
    && sheetSrc.indexOf("grip = await promptTwoHandedGrip(") < sheetSrc.indexOf("const result = canEquip(this.actor, asEquipped);"));

/* ================================================================== */
/* C — DOUBLE (page 158; D3; R2)                                       */
/* ================================================================== */

/* PRINTED: "A double weapon may be used to double slice and always treats
 * the second attack as agile." R2: the second attack OF THE DOUBLE SLICE,
 * made with the one weapon; nothing to do with the multiple attack penalty. */
ok("C1 Double is not read as Agile for the MAP any more",
  /const agile = \/\\bagile\\b\/i\.test\(String\(weaponData\.traits/.test(attackSrc)
    && !/\(agile\|double\)/.test(attackSrc));
const doubles = weaponPack.filter(isDoubleWeapon).map((w) => w.name).sort();
eq("C2 the pack's double weapons", doubles, ["Anar Dhagor", "Double-Blade", "Staff"]);
const staff = WEAPONS.get("Staff");
const staffTwo = { ...equip(staff, { twoHandedGrip: true }), id: "staff" };
const staffOne = { ...equip(staff, { twoHandedGrip: false }), id: "staff" };
const dagger = { ...equip(WEAPONS.get("Dagger")), id: "dagger" };
ok("C3 a staff held in both hands meets Double Slice on its own", doubleSliceRequirement([staffTwo]).allowed);
ok("C3 held in one hand it does not", !doubleSliceRequirement([staffOne]).allowed);
ok("C3 and says why", /both hands/.test(doubleSliceRequirement([staffOne]).reason));
ok("C3 a lone ordinary weapon never did", !doubleSliceRequirement([dagger]).allowed);
const doubleBlade = { ...equip(WEAPONS.get("Double-Blade")), id: "db" };
ok("C3 a Large double weapon is in both hands by its size", doubleWeaponInBothHands(doubleBlade, "medium"));
ok("C4 the same double weapon may strike twice", doubleSlicePairValid(staffTwo, staffTwo).ok);
ok("C4 the same ordinary weapon may not", !doubleSlicePairValid(dagger, dagger).ok);
ok("C4 two different weapons may", doubleSlicePairValid(staffOne, dagger).ok);
eq("C5 the double weapon's second end is agile — no -2", secondStrikeModifier(staffTwo, { sameDoubleWeapon: true }), null);
eq("C5 but the staff as a second, different weapon is not agile", secondStrikeModifier(staffOne)?.value, OFF_HAND_PENALTY);
eq("C5 an agile weapon never takes it", secondStrikeModifier(dagger), null);

/* ================================================================== */
/* D — PROFICIENCY (page 159; D4; R7)                                  */
/* ================================================================== */

/* PRINTED: "If your race matches that of the weapon's racial trait, it is
 * considered a martial weapon." */
ok("D1 a dwarf matches the Dwarf trait", racialWeaponMatches("Dwarf", "Dwarf, Exotic, Hand & a Half"));
ok("D1 an elf does not", !racialWeaponMatches("Elf", "Dwarf, Exotic, Hand & a Half"));
ok("D1 no race matches nothing", !racialWeaponMatches("", "Dwarf, Exotic"));
ok("D1 whole entries only", !racialWeaponMatches("Elf", "Elfbane, Exotic"));
const RACIAL = { Zokarrin: "Dwarf", "Tel’dorin": "Elf", "Sil’maril": "Elf", "Anar Dhagor": "Gnome" };
const actorOf = (className, race) => ({ items: [
  { type: "class", name: className, system: {} },
  ...(race ? [{ type: "race", name: race, system: {} }] : [])
] });
for (const [weaponName, race] of Object.entries(RACIAL)) {
  const weapon = WEAPONS.get(weaponName);
  ok(`D2 ${weaponName} is an exotic weapon in the pack`, weapon?.system?.category === "Exotic");
  ok(`D2 a ${race} fighter is proficient with the ${weaponName}`,
    proficiencyOf(proficiencyProfile(actorOf("Fighter", race)), weapon).proficient);
  ok(`D2 a Human fighter is not`,
    !proficiencyOf(proficiencyProfile(actorOf("Fighter", "Human")), weapon).proficient);
  eq(`D2 to a ${race} it is a martial weapon`, effectiveWeaponCategory(proficiencyProfile(actorOf("Wizard", race)), weapon), "Martial");
}
ok("D3 a dwarf WIZARD with no martial proficiency is still not proficient with a zokarrin",
  !proficiencyOf(proficiencyProfile(actorOf("Wizard", "Dwarf")), WEAPONS.get("Zokarrin")).proficient);
ok("D3 and the reason names it as martial, not exotic",
  /martial/i.test(proficiencyOf(proficiencyProfile(actorOf("Wizard", "Dwarf")), WEAPONS.get("Zokarrin")).why));
ok("D3 untrained Clumsy follows the effective category",
  /!proficient && String\(effectiveWeaponCategory\(profile, \{ system: weaponData \}\)\)\.toLowerCase\(\) === "exotic"/.test(attackSrc));
/* R7: the parrying scabbard is its own category, under light-shield proficiency. */
const scabbard = SHIELDS.get("Parrying Scabbard");
eq("D4 the parrying scabbard is a scabbard", scabbard?.system?.category, "scabbard");
eq("D4 light-shield proficiency covers it", SHIELD_CATEGORY_COVERED_BY.scabbard, "light");
ok("D4 a fighter is proficient with it", proficiencyOf(proficiencyProfile(actorOf("Fighter")), scabbard).proficient);
ok("D4 buckler-only proficiency (Bard's) does not reach it",
  !proficiencyOf({ ...proficiencyProfile(actorOf("Wizard")), shieldCategories: new Set(["buckler"]) }, scabbard).proficient);
const profSrc = read("module", "proficiency-rules.mjs");
ok("D5 the Druid list's comment states the Scale ruling", /SCALE IS NOT METAL \(Graham, 9 Sep 2026\)/.test(profSrc));
ok("D5 and the stale claim is gone",
  !/Scale carries it\s*\n\s*\* and is on the printed list anyway/.test(profSrc));

/* ================================================================== */
/* E — GROUPS AND AMMUNITION (R6)                                      */
/* ================================================================== */

const lightCrossbow = WEAPONS.get("Light Crossbow");
eq("E1 a crossbow is in the Bow group", lightCrossbow.system.group, "Bow");
eq("E1 and fires Crossbow ammunition", weaponAmmunitionFamily(lightCrossbow.system), "crossbow");
ok("E2 bolts fit it", ammunitionFitsWeapon(AMMO.get("Bolts (10)").system, lightCrossbow.system));
ok("E2 arrows do not", !ammunitionFitsWeapon(AMMO.get("Arrows (20)").system, lightCrossbow.system));
ok("E2 arrows fit a longbow", ammunitionFitsWeapon(AMMO.get("Arrows (20)").system, WEAPONS.get("Longbow").system));
ok("E2 bolts do not", !ammunitionFitsWeapon(AMMO.get("Bolts (10)").system, WEAPONS.get("Longbow").system));
ok("E2 blowgun needles fit the blowgun, now in Dart",
  WEAPONS.get("Blowgun").system.group === "Dart"
    && ammunitionFitsWeapon(AMMO.get("Blowgun Needles (10)").system, WEAPONS.get("Blowgun").system));
ok("E2 and not a dart", !ammunitionFitsWeapon(AMMO.get("Blowgun Needles (10)").system, WEAPONS.get("Dart").system));
ok("E3 a crossbow copied into a world before 3.575.0 (group Crossbow, no family) still takes bolts",
  ammunitionFitsWeapon(AMMO.get("Bolts (10)").system, { group: "Crossbow" }));
ok("E3 the Repeater fires bolts too", ammunitionFitsWeapon(AMMO.get("Bolts (10)").system, WEAPONS.get("Repeater").system));

/* ================================================================== */
/* F — SHIELDS (pages 155-156; D5, D6, D8, D9, D10, D15, D17, D18; R4, R5, R8) */
/* ================================================================== */

/* D5: the Shield spell's block. */
const spellOnly = shieldBlockEligibility([], [{ label: "Shield", dr: 13, castId: "c1", endsOnBlock: true, lockoutMinutes: 10 }]);
ok("F1 the spell alone can block", spellOnly.able && spellOnly.shield === null && spellOnly.spellShield?.castId === "c1");
const blockSrc = read("module", "combat", "shield-block-workflow.mjs");
const blockCode = blockSrc.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
ok("F1 the workflow's code no longer reads eligibility.shield.name (it threw when the spell blocked)",
  !/eligibility\.shield\.name/.test(blockCode) && !/eligibility\.shield\.system/.test(blockCode));
ok("F1 it names the blocker whichever kind it is",
  /const blockerName = carried\?\.name \?\? spell\?\.label \?\? "Shield";/.test(blockSrc));
ok("F1 a spell block ends the spell and starts the lockout",
  /if \(spell\) \{\s*lines\.push\(\.\.\.await endSpellShieldOnBlock\(actor, spell\)\);/.test(blockSrc)
    && /endActiveSpell\(actor, spell\.castId/.test(blockSrc)
    && /withRecastLockout\(lockouts, spellName/.test(blockSrc));
ok("F1 only a carried shield loses hit points", /if \(carried && outcome\.toShield > 0\)/.test(blockSrc));
/* Weighed at what each actually stops. */
const heavy = equip(SHIELDS.get("Heavy Steel Shield"));
const spell2 = [{ label: "Shield", dr: 2, castId: "c2", endsOnBlock: true, lockoutMinutes: 10 }];
eq("F2 at BDB 0 a DR-2 spell shield beats a DR-1 heavy shield", shieldBlockEligibility([heavy], spell2, { bdb: 0 }).spellShield?.castId, "c2");
eq("F2 at BDB 12 (x3, printed) the heavy shield stops 3 and wins", shieldBlockEligibility([heavy], spell2, { bdb: 12 }).shield?.name, "Heavy Steel Shield");
eq("F2 and blocks for 3", shieldBlockEligibility([heavy], spell2, { bdb: 12 }).dr, 3);
/* D10: one shield blocks, so the base DR is the best, not the sum. */
eq("F3 two shields report the better DR, not both", shieldBaseDR([
  { type: "shield", system: { dr: 1 } }, { type: "shield", system: { dr: 2 } }]), 2);
/* The spell shield ends with its spell. */
eq("F4 a spell's rows go with it", spellShieldsWithout([{ castId: "a" }, { castId: "b" }], "a"), [{ castId: "b" }]);
const locked = withRecastLockout({}, "Shield", 1000, 10);
eq("F4 ten minutes is 600 seconds of lockout", recastLockoutRemaining(locked, "shield", 1000), 600);
eq("F4 and it runs out", recastLockoutRemaining(locked, "Shield", 1600), 0);
ok("F4 ending a cast clears its spell-shield rows",
  /spellShieldsWithout\(rows, castId\)/.test(read("module", "combat", "effect-application-workflow.mjs")));
ok("F4 casting is refused during the lockout",
  /recastLockoutRemaining\(\s*actor\.getFlag\?\.\("trg-prime", SPELL_RECAST_LOCKOUT_FLAG\)/.test(read("module", "magic", "cast-workflow.mjs")));
/* D6 / R8: the bash. */
const { shieldBashProfile } = await import("../module/combat/shield-bash.mjs");
const bashOf = (name, extra = {}) => shieldBashProfile({ ...SHIELDS.get(name).system, ...extra });
eq("F5 a heavy steel shield bashes for 1d6 bludgeoning", [bashOf("Heavy Steel Shield").damage, bashOf("Heavy Steel Shield").types], ["1d6", ["bludgeoning"]]);
eq("F5 BOSS steps the die: 'The attack dice is increased by one step'",
  bashOf("Heavy Steel Shield", { quality: "expert", superiorTraits: "boss" }).damage, "1d8");
eq("F5 SPIKES adds piercing as a choice",
  bashOf("Heavy Steel Shield", { quality: "expert", superiorTraits: "spikes" }).types, ["bludgeoning", "piercing"]);
eq("F5 a madu is already piercing — Spikes adds nothing to choose",
  bashOf("Madu - Steel", { quality: "expert", superiorTraits: "spikes" }).types, ["piercing"]);
eq("F5 R8: a master shield's bash is the shield's die, no weapon quality",
  bashOf("Heavy Steel Shield", { quality: "master" }).damage, "1d6");
ok("F5 R8: the bash roll passes only BAB and critical dice",
  /buildWeaponDamageFormula\(profile\.damage, \{ bab, critical \}\);/.test(read("module", "combat", "shield-bash.mjs")));
eq("F5 the die ladder steps up d4 -> d6 -> d8 and stops at d12", [4, 6, 8, 12].map((f) => stepUpDieSize(f, 1)), [6, 8, 10, 12]);
/* D8 / R4 and D9: DB. */
const actorSrc = read("module", "documents", "actor.mjs");
ok("F6 a destroyed shield gives no DB; a broken one keeps it (R4)",
  /defenceBonus: item\.type === "shield" && itemStatus\(item\.system\?\.hp\?\.value, item\.system\?\.hp\?\.max\) !== "destroyed"/.test(actorSrc));
ok("F7 a busy buckler is left out BEFORE highest-wins",
  /\.filter\(\(piece\) => !\(bucklerArmBusy && piece\.buckler\)\)/.test(actorSrc));
ok("F7 and is no longer subtracted afterwards",
  !/label: `\$\{buckler\.name\} \(shield arm in use\)`/.test(actorSrc));
/* D18. */
ok("F8 Shielded Stride finds a buckler by category", /i\.system\?\.equipped && isBuckler\(i\)/.test(attackSrc)
  && !/\/\\bbuckler\\b\/i\.test\(String\(i\.name/.test(attackSrc));
/* R5: the madu's -3. */
const madu = equip(SHIELDS.get("Madu - Steel"));
eq("F9 the printed Fight Defensively penalty", FIGHT_DEFENSIVELY_ATTACK_PENALTY, -4);
eq("F9 a raised madu eases it to -3 (Graham: the printed -15 is a typo)", fightDefensivelyAttackPenalty([madu]), -3);
eq("F9 an unequipped madu does nothing", fightDefensivelyAttackPenalty([{ ...madu, system: { ...madu.system, equipped: false } }]), -4);
eq("F9 no madu, -4", fightDefensivelyAttackPenalty([heavy]), -4);
eq("F9 both pack madus carry -3", ["Madu - Leather", "Madu - Steel"].map((n) => SHIELDS.get(n).system.fightDefensivelyPenalty), [-3, -3]);
/* D17: a light shield's hand. */
const sword = equip(WEAPONS.get("Broadsword"));
const torch = { type: "gear", system: { equipped: true, heldHands: 1 } };
const lightShield = equip(SHIELDS.get("Light Steel Shield"));
ok("F10 a light shield's hand can carry", shieldHandCanCarry(lightShield));
ok("F10 a madu's cannot ('cannot hold anything else')", !shieldHandCanCarry(madu));
ok("F10 a heavy shield's cannot", !shieldHandCanCarry(heavy));
eq("F10 sword, light shield and torch: two hands", handsOccupied([sword, lightShield, torch], "medium"), 2);
eq("F10 sword, madu and torch: three", handsOccupied([sword, madu, torch], "medium"), 3);
eq("F10 sword, heavy shield and torch: three", handsOccupied([sword, heavy, torch], "medium"), 3);
eq("F10 a weapon is not carried in the shield hand", handsOccupied([sword, lightShield, equip(WEAPONS.get("Dagger"))], "medium"), 3);
ok("F10 'is a hand free' gives the same answer", !hasFreeHandAvailable([sword, lightShield, torch], "medium"));
/* D15. */
ok("F11 the scabbard is not a buckler", !isBuckler(scabbard));
eq("F11 and costs a hand", itemRequiredHands(equip(scabbard), "medium"), 1);

/* ================================================================== */
/* G — WEAPON TRAITS (pages 158-160; D7, D11-D14)                      */
/* ================================================================== */

/* D7: "reduces its Fumble DC by 1 (minimum of 4). This trait may be
 * applied multiple times." */
eq("G1 Balanced once", computeWeaponModifiers("expert", "", ["balanced"]).fumbleDCDelta, -1);
eq("G1 Balanced twice", computeWeaponModifiers("master", "", ["balanced", "balanced"]).fumbleDCDelta, -2);
eq("G2 16 less 1", effectiveFumbleDC(16, { floored: 1 }), 15);
eq("G2 5 less 2 stops at 4", effectiveFumbleDC(5, { floored: 2 }), 4);
eq("G2 the floor never raises a DC already under 4", effectiveFumbleDC(3, { floored: 1 }), 3);
eq("G2 the Archer's -1 has no floor", effectiveFumbleDC(4, { flat: 1 }), 3);
ok("G3 the fumble check reads Balanced", /balancedReduction = -Number\(computeWeaponModifiers\(/.test(attackSrc)
  && /floored: masteryReduction \+ balancedReduction/.test(attackSrc));
const dialogSrc = read("module", "item-customize-workflow.mjs");
ok("G4 a repeatable trait is a count in the dialog", /class="trg-customise-trait-count" data-trait="\$\{key\}"/.test(dialogSrc));
ok("G4 and each time taken is sent", /\.flatMap\(\(el\) => Array\(Math\.max\(0, Math\.floor\(Number\(el\.value\) \|\| 0\)\)\)\.fill\(el\.dataset\.trait\)\)/.test(dialogSrc));
/* D11 */
ok("G5 Volley is a circumstance penalty",
  /label: "Volley \(within 20 ft\)", value: -2, type: "circumstance"/.test(attackSrc));
/* D12 */
// THE REACH IS THE MOUNT'S WHERE THERE IS ONE (3.579.0; page 200, R13),
// so the declaration moved from one line to a ternary. What this check
// is for is unchanged: reach is measured on every melee attack, not only
// against a target that can be flanked.
ok("G6 reach is measured whether or not the target can be flanked",
  /const measuresReach = positional && !isRanged;\s*if \(measuresReach\) \{[\s\S]{0,400}const normalReach/.test(attackSrc));
ok("G6 and its -2 is pushed outside the flanking gate",
  /if \(measuresReach && reach\.penalty\) \{/.test(attackSrc));
/* D13: "1 AP ... +1, 2 AP ... +2". */
eq("G7 Spin stops at +2", SPIN_MAX_BONUS, 2);
eq("G7 however many AP are offered", spinDamageBonus(true, 5), 2);
eq("G7 headroom", [0, 1, 2, 3].map(spinHeadroom), [2, 1, 0, 0]);
ok("G7 the shot takes the spin, hit or miss",
  /const spinCarried = Math\.max\(0, Number\(weaponData\.spinBonus \?\? 0\)\);\s*if \(spinCarried\) await weapon\.update\(\{ "system\.spinBonus": 0 \}\);/.test(attackSrc)
    && /spinBonus: spinCarried,/.test(attackSrc));
/* D14 */
const whip = equip(WEAPONS.get("Whip"));
eq("G8 a trip is made with the whip", maneuverWeapon([sword, whip], "trip")?.name, "Whip");
ok("G8 Shove/Trip use the whole weapon bonus",
  /if \(weapon\) modifiers\.push\(\.\.\.weaponManeuverModifiers\(actor, weapon\)\);/.test(read("module", "combat", "action-workflow.mjs")));
const swordCane = WEAPONS.get("Sword Cane");
const conceal = concealableWeaponConditionals([swordCane, sword]);
eq("G9 Concealable: +2 circumstance to Conceal an Object, one entry per concealable weapon",
  conceal.map((c) => [c.value, c.type, c.when.actions]), [[2, "circumstance", ["concealAnObject"]]]);

/* ================================================================== */
/* H — ARMOUR DESCRIPTIONS (pages 152-155; D16; R9-R11)                */
/* ================================================================== */

/* PRINTED: leather and metal helmets "-1 item penalty to perception
 * checks", full helmet "-2". R9: Helm / Full Helm suits the same. */
eq("H1 the helmets, as printed", ["Leather Helmet", "Metal Helmet", "Full Helmet"].map((n) => armourPerceptionPenalty(ARMOUR.get(n))), [-1, -1, -2]);
eq("H1 the Helm suits (R9)", ["Full Hardened Leather", "Full Chainmail", "Full Platemail"].map((n) => armourPerceptionPenalty(ARMOUR.get(n))), [-1, -1, -2]);
eq("H1 plain armour nothing", armourPerceptionPenalty(ARMOUR.get("Chain")), 0);
eq("H2 worn, the worst applies", wornPerceptionPenalty([equip(ARMOUR.get("Full Chainmail")), equip(ARMOUR.get("Full Helmet"))])?.value, -2);
eq("H2 carried, none", wornPerceptionPenalty([ARMOUR.get("Full Helmet")]), null);
eq("H2 destroyed, none", wornPerceptionPenalty([equip(ARMOUR.get("Full Helmet"), { hp: { value: -20, max: 20 } })]), null);
ok("H2 the actor applies it", /function prepareHelmPerception\(system, actor\)/.test(actorSrc) && /prepareHelmPerception\(system, this\);/.test(actorSrc));
/* R10: "Metal bracers are treated as gauntlets for attacking purposes." */
const unarmed = { type: "weapon", name: "Unarmed Strike", system: { natural: true, category: "Unarmed", damage: "1d4", damageType: "subdual", traits: "Agile, Finesse", fumbleDC: 5 } };
const bracers = equip(ARMOUR.get("Metal Bracers"));
const fist = armouredFistProfile(unarmed, [bracers]);
eq("H3 in metal bracers the unarmed strike is a gauntlet attack",
  [fist.data.damage, fist.data.damageType, fist.data.traits, fist.data.fumbleDC, fist.data.category],
  ["1d4", "bludgeoning", "Agile, Free-Hand", 6, "Simple"]);
const gauntletRow = PRINTED_MELEE.find((r) => r[1] === "Gauntlet");
eq("H3 which is the printed Gauntlet row", [GAUNTLET_PROFILE.damage, GAUNTLET_PROFILE.damageType, GAUNTLET_PROFILE.fumbleDC, GAUNTLET_PROFILE.group],
  [gauntletRow[4].split(" ")[0], DMG[gauntletRow[4].split(" ")[1]], Number(gauntletRow[6]), gauntletRow[8]]);
ok("H3 bracers carried, not worn: a bare fist", armouredFistProfile(unarmed, [ARMOUR.get("Metal Bracers")]).source === null);
ok("H3 leather bracers are not gauntlets", armouredFistProfile(unarmed, [equip(ARMOUR.get("Leather Bracers"))]).source === null);
ok("H3 an ordinary weapon is untouched", armouredFistProfile({ ...sword, type: "weapon" }, [bracers]).source === null);
// 3.576.0: the round then has its say on the traits (Distance Arrows
// remove Deadly) — the profile is still what the attack reads.
// 3.577.0: Fist of Rock sits between the bracers and the round (`fistData`),
// and the bracers' profile still reaches weaponData through it.
ok("H3 the attack reads through it", /const armouredFist = armouredFistProfile\(weapon, Array\.from\(actor\.items \?\? \[\]\)\);[\s\S]{0,900}const fistData = stoneFist \? \{ \.\.\.armouredFist\.data, \.\.\.stoneFist \} : armouredFist\.data;\s*const weaponData = ammoSystem\s*\? \{ \.\.\.fistData, traits: traitsAfterAmmunition\(fistData\.traits, ammoSystem\) \}\s*: fistData;/.test(attackSrc));
/* R11: "+2 item bonus to resist the chilling effects of wintry environments". */
const furs = coldWeatherConditionals([equip(ARMOUR.get("Furs/Pelts"))]);
eq("H4 worn furs offer +2 item on Fortitude", furs.map((c) => [c.value, c.type, c.auto, c.when.subjects]), [[2, "item", false, ["fortitude"]]]);
eq("H4 carried furs offer nothing", coldWeatherConditionals([ARMOUR.get("Furs/Pelts")]), []);
/* The Other table's -1 (A1b). */
eq("H5 body armour's cap 3 less a greave's 1", adjustedMaxDexCap(3, [-1]), 2);
eq("H5 no cap stays no cap", adjustedMaxDexCap(null, [-1]), null);
eq("H5 never below 0", adjustedMaxDexCap(0, [-1, -1]), 0);
ok("H5 the actor applies it", /maxDexCap = adjustedMaxDexCap\(maxDexCap, protectionPieces\.map\(\(piece\) => piece\.maxDexModifier\)\);/.test(actorSrc));

console.log(
  failures
    ? `verify-chapter6-gear-151-160: ${failures} FAILED of ${checks}`
    : `verify-chapter6-gear-151-160: ${checks} checks passed`
);
process.exit(failures ? 1 : 0);
