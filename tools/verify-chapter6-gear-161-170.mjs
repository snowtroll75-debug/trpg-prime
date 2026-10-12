/**
 * verify-chapter6-gear-161-170 — ranged and exotic weapons, weapon
 * descriptions, ammunition and the Goods (pages 161-170).
 *
 * NEW at 3.576.0, for the pages 161-170 audit. The tables were right
 * (309 of 310 weapon fields, 36 of 36 ammunition fields); the prose was
 * not. Twelve defects, and Graham's fourteen rulings of 19 September 2026:
 *
 *   - three rounds whose own sentences reached nothing (Distance Arrows
 *     kept Deadly, the Fire Bolt's fire arrived as piercing, Blunt Arrows
 *     could not subdue);
 *   - a hand crossbow that reloaded one-handed, a whip that hit next to
 *     you at 10 ft instead of 15;
 *   - four checks for "unarmed" that disagreed, and a gauntlet that was
 *     unarmed for none of them;
 *   - weapon spells that took a bite, and a Shillelagh that took a sword;
 *   - no found rocks, no ammunition recovery, no improvised attacks, no
 *     Mounted state, and not one of the 101 Goods doing anything.
 *
 * EVERY EXPECTED VALUE IS TRANSCRIBED FROM THE PRINTED PAGE or from one of
 * Graham's rulings, never from the module under test. The two tables below
 * are the book's rows as extracted from rulebook 3.8.1, pages 161 and 166.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  traitsAfterAmmunition, ammunitionDamagePackets, ammunitionFormulaExtra, SUBDUAL_SHOT_PENALTY,
  foundAmmunitionPenalty, withShotRecorded, recoverableRounds, recoveryPlan, recoveredAsAmmunition,
  ammunitionFitsWeapon, effectiveRangeIncrement
} from "../module/combat/ammunition.mjs";
import { reachPenalty, weaponReachExtension, extractTraitValue } from "../module/combat/attack.mjs";
import { effectiveReach } from "../module/combat/opportunity-rules.mjs";
import { reloadHandsCheck, itemRequiredHands } from "../module/held-items.mjs";
import { MAGAZINE_RELOAD_AP, extractMagazine } from "../module/combat/reload.mjs";
import { isNaturalAttack, isUnarmedAttack, fumbleTableFor } from "../module/combat/unarmed.mjs";
import { armouredFistProfile, GAUNTLET_PROFILE } from "../module/armour-descriptions.mjs";
import { riderPacketsFor, normaliseStrikeRider, enchantableWeapons } from "../module/magic/strike-riders.mjs";
import { mountedState, mountedAfterSuccess, mountedWeaponRefusal, MOUNTED_FLAG } from "../module/combat/mounted.mjs";
import { proficiencyOf, effectiveWeaponCategory, racialWeaponMatches } from "../module/proficiency-rules.mjs";
import { weaponExemplarBonusFor } from "../module/fighter.mjs";
import { WEAPON_GROUPS } from "../module/config.mjs";
import {
  goodsConditionals, improvisedWeaponProfile, improvisedAttackModifier, improvisedDamagePackets,
  canImproviseWith, improvisesAsNamedWeapon, IMPROVISED_PENALTY, goodsUseLabel, oilPrepared,
  CALTROPS, OIL, caltropsAfterEntry
} from "../module/goods.mjs";
import { carryStrengthBonus, carriesAsAnimal, CARRY_STRENGTH_ITEMS } from "../module/stowage.mjs";
import {
  lightSourceHasHood, itemIsHooded, litGearKeysOn, lightSourceKeyForItem
} from "../module/light-sources.mjs";
import { BASIC_ACTIONS } from "../module/data/basic-actions.mjs";
import { basicSavingThrow } from "../module/dice/resolution.mjs";

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
// Comments are stripped before a source pattern is looked for, so a
// sentence ABOUT the code cannot pass for the code.
const code = (...parts) => read(...parts).split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

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
const WEAPONS = byName(await packItems("weapons"));
const AMMO = byName(await packItems("ammunition"));
const GEAR = byName(await packItems("gear"));
const W = (name) => WEAPONS.get(name);
const G = (name) => GEAR.get(name);
const equip = (item, extra = {}) => ({ ...item, system: { ...item.system, equipped: true, ...extra } });

const attackSrc = code("module", "combat", "attack-workflow.mjs");
const actionSrc = code("module", "combat", "action-workflow.mjs");

/* ================================================================== */
/* THE PRINTED TABLES (rulebook 3.8.1, pages 161 and 166)              */
/* ================================================================== */

// Columns: heading, name, price, level, damage, size, fumble, weight,
// group, traits.
const PRINTED_161 = Object.freeze([
  ["MELEE EXOTIC", "Anar Dhagor", "20 gp", "0", "1d6 B", "M", "10", "4 lbs", "Hammer", "Exotic, Gnome, Double, Hand & a Half, Trip, Versatile P"],
  ["MELEE EXOTIC", "Double-Blade", "110 gp", "1", "1d10 S", "L", "18", "10 lbs", "Sword", "Double, Exotic, Thrown 10 ft, Versatile P"],
  ["MELEE EXOTIC", "Katana", "250 gp", "2", "1d8 S", "M", "8", "6 lbs", "Sword", "Deadly, Exotic, Hand & a Half, Keen, Versatile P"],
  ["MELEE EXOTIC", "Sil’maril", "150 gp", "1", "1d8 S", "M", "6", "4 lbs", "Sword", "Agile, Deadly, Elf, Exotic, Finesse"],
  ["MELEE EXOTIC", "Spiked Chain", "30 gp", "0", "1d8 S", "M", "20", "10 lbs", "Flail", "Clumsy, Disarm, Exotic, Finesse, Trip"],
  ["MELEE EXOTIC", "Tel’dorin", "200 gp", "2", "1d10 S", "L", "8", "7 lbs", "Sword", "Deadly, Elf, Exotic, Finesse"],
  ["MELEE EXOTIC", "Whip", "1 gp", "0", "1d4 S", "M", "20", "2 lbs", "Flail", "Clumsy, Disarm, Exotic, Finesse, Reach, Trip, Versatile S"],
  ["MELEE EXOTIC", "Zokarrin", "40 gp", "0", "1d10 S", "M", "12", "8 lbs", "Axe", "Dwarf, Exotic, Hand & a Half, Sweep, Versatile P"],
  ["RANGED SIMPLE", "Blowgun", "2 gp", "0", "1d3 P", "M", "8", "1 lb", "Dart", "Agile, Load 1, Range 20, 2-Handed, Silent"],
  ["RANGED SIMPLE", "Dart", "5 cp", "0", "1d3 P", "T", "4", "½ lb", "Dart", "Agile, Thrown 20 ft"],
  ["RANGED SIMPLE", "Hand Crossbow", "100 gp", "1", "1d8 P", "S", "6", "2 lbs", "Bow", "AR 1, Load 2, Mechanical, Range 40"],
  ["RANGED SIMPLE", "Heavy Crossbow", "50 gp", "0", "1d12 P", "L", "16", "8 lbs", "Bow", "AR 2, Load 5, Mechanical, Powerful +4, Range 120"],
  ["RANGED SIMPLE", "Javelin", "1 gp", "0", "1d6 P", "M", "10", "2 lbs", "Dart", "Thrown 30 ft"],
  ["RANGED SIMPLE", "Light Crossbow", "35 gp", "0", "1d10 P", "L", "12", "4 lbs", "Bow", "AR 1, Load 3, Mechanical, 2-Handed, Powerful +2, Range 80"],
  ["RANGED SIMPLE", "Sling", "5 cp", "0", "1d4 B", "S", "18", "½ lb", "Sling", "Clumsy, Load 2, Propulsive, Range 40, Spin"],
  ["RANGED MARTIAL", "Composite Longbow", "200 gp", "2", "1d8 P", "L", "16", "3 lbs", "Bow", "AR 2, Deadly, Load 1, Propulsive, Range 100, Volley"],
  ["RANGED MARTIAL", "Composite Shortbow", "140 gp", "1", "1d6 P", "M", "12", "2 lbs", "Bow", "AR 1, Deadly, Propulsive, Quick Load, Range 60"],
  ["RANGED MARTIAL", "Longbow", "75 gp", "1", "1d8 P", "L", "12", "3 lbs", "Bow", "Deadly, Volley, Load 1, Range 100"],
  ["RANGED MARTIAL", "Short Bow", "40 gp", "0", "1d6 P", "M", "8", "2 lbs", "Bow", "Deadly, 2-Handed, Quick Load, Range 60"],
  ["RANGED EXOTIC", "Bola", "5 gp", "0", "1d4 B", "L", "20", "2 lbs", "Sling", "Clumsy, Exotic, Thrown 20 ft, Trip"],
  ["RANGED EXOTIC", "Repeater", "320 gp", "3", "1d10 P", "M", "16", "6 lbs", "Bow", "Exotic, Load 0, Mechanical, 2-Handed, Powerful +10, Range 60"],
  ["RANGED EXOTIC", "Riath-Elenya", "20 gp", "0", "1d6 B", "M", "18", "3 lbs", "Sling", "Exotic, Hand & a Half, Load 2, Range 40’ ,Spin"],
  ["RANGED EXOTIC", "Shuriken", "1 gp", "0", "1d4 P", "T", "4", "½ lb", "Dart", "Agile, Deadly, Exotic, Thrown 20 ft"],
  ["UNARMED", "Bite", "-", "-", "1d8 P", "M", "5", "-", "Brawling", "Finesse"],
  ["UNARMED", "Claw", "-", "-", "1d6 S", "M", "5", "-", "Brawling", "Agile, Finesse, Versatile (P)"],
  ["UNARMED", "Gore", "-", "-", "1d8 P", "M", "5", "-", "Brawling", "Finesse"],
  ["UNARMED", "Slam", "-", "-", "1d8 B", "M", "5", "-", "Brawling", "Agile, Finesse"],
  ["UNARMED", "Sting", "-", "-", "1d6 P", "M", "5", "-", "Brawling", "Agile, Finesse"],
  ["UNARMED", "Tail Slap", "-", "-", "1d8 B", "M", "5", "-", "Brawling", "Agile, Finesse"],
  ["UNARMED", "Unarmed Strike", "-", "-", "1d4 N", "M", "5", "-", "Brawling", "Agile, Finesse"],
  ["UNARMED", "Wings, Hoof, Tentacle", "-", "-", "1d6 B", "M", "5", "-", "Brawling", "Finesse"]
]);

// The three rows the pack now carries differently BY RULING, with why.
const RULED_TRAITS = Object.freeze({
  // R1 (Graham): "Load 0" means five shots before a reload; the pack's
  // Magazine 5 with a full-round (3 AP) reload is that rule.
  Repeater: "Exotic, Magazine 5, Mechanical, 2-Handed, Powerful +10, Range 60",
  // R2 (Graham): "I have removed the propulsive trait from this weapon."
  Sling: "Clumsy, Load 2, Range 40, Spin",
  // R11 (Graham): the Halfling trait; and E3's stray mark and comma.
  "Riath-Elenya": "Exotic, Halfling, Hand & a Half, Load 2, Range 40, Spin"
});

// Page 166. Columns: name, price, level, weight, weapon.
const PRINTED_AMMO = Object.freeze([
  ["Arrows (20)", "1 gp", "0", "3 lbs", "Bows"],
  ["Arrows, Blunt (20)", "2 gp", "0", "3 lbs", "Bows"],
  ["Arrows, Distance (20)", "1 gp", "0", "4 lbs", "Bows"],
  ["Arrows, Penetrating (20)", "5 gp", "0", "3 lbs", "Bows"],
  ["Blowgun Needles (10)", "5 sp", "0", "1 lb", "Blowgun"],
  ["Bolt, Fire", "50 gp", "0", "-", "Crossbows"],
  ["Bolts (10)", "1 gp", "0", "1 lb", "Crossbows"],
  ["Bolts, Penetrating (10)", "5 gp", "0", "1 lb", "Crossbows"],
  ["Sling Bullets (20)", "5 sp", "0", "1 lb", "Sling"]
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
const SIZE = { T: "tiny", S: "small", M: "medium", L: "large" };
const DMG = { B: "bludgeoning", P: "piercing", S: "slashing", N: "subdual" };
const CATEGORY = { "MELEE EXOTIC": "Exotic", "RANGED SIMPLE": "Simple", "RANGED MARTIAL": "Martial", "RANGED EXOTIC": "Exotic", UNARMED: "Unarmed" };

const tableDiffs = [];
let tableFields = 0;
for (const [heading, name, price, lvl, dmg, size, fumble, wt, group, traits] of PRINTED_161) {
  const item = W(name);
  if (!item) { tableDiffs.push(`${name}: not in the pack`); continue; }
  const s = item.system;
  const [die, letter] = String(dmg).split(/\s+/);
  const want = {
    category: CATEGORY[heading], price: gp(price), level: num(lvl), damage: die, damageType: DMG[letter],
    size: SIZE[size], fumble: num(fumble), weight: lbs(wt), group,
    traits: traitSet(RULED_TRAITS[name] ?? traits).join("|")
  };
  const got = {
    category: s.category, price: Number(s.price ?? 0), level: Number(s.itemLevel ?? 0), damage: s.damage,
    damageType: s.damageType, size: s.size, fumble: s.fumbleDC, weight: Number(s.weight ?? 0), group: s.group,
    traits: traitSet(s.traits).join("|")
  };
  for (const key of Object.keys(want)) {
    tableFields++;
    if (JSON.stringify(want[key]) !== JSON.stringify(got[key])) {
      tableDiffs.push(`${name}.${key}: printed ${JSON.stringify(want[key])}, pack ${JSON.stringify(got[key])}`);
    }
  }
}
eq("A1 all 31 printed rows of page 161", PRINTED_161.length, 31);
ok(`A1 every page-161 field matches the book or a ruling (${tableFields} fields)`, tableDiffs.length === 0, tableDiffs.join("; "));
eq("A1b and exactly three rows differ from print, each by ruling", Object.keys(RULED_TRAITS).sort(),
  ["Repeater", "Riath-Elenya", "Sling"]);

const FAMILY = { Bows: "bow", Crossbows: "crossbow", Blowgun: "blowgun", Sling: "sling" };
const ammoDiffs = [];
let ammoFields = 0;
for (const [name, price, lvl, wt, weapon] of PRINTED_AMMO) {
  const item = AMMO.get(name);
  if (!item) { ammoDiffs.push(`${name}: not in the pack`); continue; }
  const s = item.system;
  const want = { price: gp(price), level: num(lvl), weight: lbs(wt), family: FAMILY[weapon] };
  const got = { price: Number(s.price), level: Number(s.itemLevel ?? 0), weight: Number(s.weight), family: String(s.compatibleWeaponGroup).toLowerCase() };
  for (const key of Object.keys(want)) {
    ammoFields++;
    if (JSON.stringify(want[key]) !== JSON.stringify(got[key])) ammoDiffs.push(`${name}.${key}: printed ${want[key]}, pack ${got[key]}`);
  }
}
ok(`A2 every ammunition field matches page 166 (${ammoFields} fields)`, ammoDiffs.length === 0, ammoDiffs.join("; "));

/* A3 — R1, THE REPEATER. Graham: five shots, then a reload that takes a
 * round (3 AP). */
eq("A3 the Repeater holds five", extractMagazine(W("Repeater").system.traits), 5);
eq("A3b and reloading the magazine is a full round, 3 AP", MAGAZINE_RELOAD_AP, 3);

/* A4 — the declared fields, as the rulings put them in the pack. */
eq("A4 Sling: damage as thrown, found rocks at -2",
  [W("Sling").system.thrownDamage, W("Sling").system.foundAmmunitionPenalty], [true, -2]);
// Graham, after 3.576.0: "Riath-Elenya should work like a sling yes."
eq("A4 and the Riath-Elenya works like one",
  [W("Riath-Elenya").system.thrownDamage, W("Riath-Elenya").system.foundAmmunitionPenalty], [true, -2]);
eq("A4b Hand Crossbow: both hands to reload", W("Hand Crossbow").system.reloadHands, 2);
eq("A4c Whip: 15 ft, never adjacent", [W("Whip").system.reachFeet, W("Whip").system.noAdjacent], [15, true]);
eq("A4d the four unarmed weapons (R6)",
  ["Gauntlet", "Brass Knuckles", "Spiked Gauntlet", "Cestus"].map((n) => W(n).system.unarmed), [true, true, true, true]);
eq("A4e Lance only mounted, Composite Longbow never (R4)",
  [W("Lance").system.mountedUse, W("Composite Longbow").system.mountedUse], ["required", "forbidden"]);
eq("A4f Shuriken are recovered as ammunition (R3)", W("Shuriken").system.recoveredAsAmmunition, true);
eq("A4g Distance Arrows remove Deadly (D1)", AMMO.get("Arrows, Distance (20)").system.removesTraits, "Deadly");
eq("A4h Blunt Arrows declare subdual (D3)", AMMO.get("Arrows, Blunt (20)").system.allowsSubdual, true);

/* ================================================================== */
/* B — WHAT THE ROUNDS PRINT (page 166)                                */
/* ================================================================== */

const LONGBOW = W("Longbow").system;
const DISTANCE = AMMO.get("Arrows, Distance (20)").system;
const FIRE_BOLT = AMMO.get("Bolt, Fire").system;
ok("B1 Distance Arrows take Deadly off the bow",
  !/\bdeadly\b/i.test(traitsAfterAmmunition(LONGBOW.traits, DISTANCE)),
  "'and remove the deadly trait'");
eq("B1b and leave the rest of it", traitSet(traitsAfterAmmunition(LONGBOW.traits, DISTANCE)), traitSet("Volley, Load 1, Range 100"));
eq("B1c an ordinary arrow removes nothing", traitsAfterAmmunition(LONGBOW.traits, AMMO.get("Arrows (20)").system), LONGBOW.traits);
eq("B1d a numbered trait goes whole", traitsAfterAmmunition("AR 1, Mighty +2, Keen", { removesTraits: "Mighty" }), "AR 1, Keen");
eq("B1e and the arrows still add their ten feet", effectiveRangeIncrement(LONGBOW, DISTANCE), 110);
/*
 * B1f RE-ANCHORED AT 3.586.3, and the rename that broke it is worth a
 * line because the check was right both times.
 *
 * The claim is unchanged: the round must have had its say before the
 * weapon's Deadly trait is read, or Distance Arrows cannot take it off.
 * What moved is the name — `const deadly` became `const weaponIsDeadly`
 * when the Assassin's mark started granting the trait, so the ordering
 * test is now between the round and the weapon's OWN Deadly rather than
 * the final answer.
 *
 * WHICH IS THE RIGHT COMPARISON ANYWAY. The mark's grant is composed
 * into `deadly` a few lines later, and a round can no more remove that
 * than it can remove a Keen granted by a material. The bow's printed
 * trait line is the thing Distance Arrows edit, and `weaponIsDeadly` is
 * exactly the read of it.
 *
 * BOTH INDEXES ARE CHECKED FOR -1 rather than compared raw: `indexOf`
 * returning -1 twice makes `-1 < -1` false, so this particular test
 * happened to fail safe — but that is luck, and the defect shape (a
 * missing anchor read as a position) has bitten this project before.
 */
{
  const roundAt = attackSrc.indexOf("traitsAfterAmmunition(fistData");
  const deadlyAt = attackSrc.indexOf("const weaponIsDeadly = /\\bdeadly\\b/i.test(String(weaponData.traits");
  ok("B1f the attack reads the bow through the round",
    /traits: traitsAfterAmmunition\(fistData\.traits, ammoSystem\)/.test(attackSrc)
    && roundAt >= 0 && deadlyAt >= 0 && roundAt < deadlyAt,
    "Deadly is read from weaponData, so the round must have had its say first");
}

const fire = ammunitionDamagePackets(FIRE_BOLT, "Bolt, Fire", "piercing");
eq("B2 the Fire Bolt's explosion is its own fire packet, splash included",
  fire.map((p) => [p.label, p.dice, p.type, p.splash]), [["Bolt, Fire", "3 + 1", "fire", 1]],
  "'an additional 3 fire damage and 1 splash damage'");
eq("B2b and none of it rides the bolt's piercing", ammunitionFormulaExtra(FIRE_BOLT, "piercing"), "");
eq("B2c an extra with no type of its own stays in the formula",
  ammunitionFormulaExtra({ extraDamage: "2" }, "piercing"), " + 2");
eq("B2d an extra of the shot's own type stays in the formula",
  [ammunitionDamagePackets({ extraDamage: "2", extraDamageType: "piercing" }, "X", "piercing").length,
    ammunitionFormulaExtra({ extraDamage: "2", extraDamageType: "piercing" }, "piercing")], [0, " + 2"]);
ok("B2e the packets join the secondary-damage loop",
  // 3.617.0: the unguents' packets follow them in the same loop.
  /\.\.\.areaPackets, \.\.\.typedExtras(?:, \.\.\.unguentPackets)?\s*\]\)/.test(attackSrc)
  && /formula \+= ammunitionFormulaExtra\(ammo, effectiveDamageType\);/.test(attackSrc)
  && !/formula \+= ` \+ \$\{ammoDamage\.extraDamage\}`/.test(attackSrc));
ok("B2f the neighbours are named for the splash",
  /if \(extra\.splash\) lines\.push\(line\(splashNeighboursLine\(/.test(attackSrc));

eq("B3 subdual from a Blunt Arrow costs -4", SUBDUAL_SHOT_PENALTY, -4);
ok("B3b asked before the roll, as circumstance, when the round allows it",
  /if \(ammoEffects\.allowsSubdual && !skipDialog\(event\)\) \{/.test(attackSrc)
  && /value: SUBDUAL_SHOT_PENALTY, type: "circumstance"/.test(attackSrc)
  && attackSrc.indexOf("promptSubdualShot(ammo") < attackSrc.indexOf("const check = await TRGCheck.roll({"));
// COUNTED, NOT MERELY FOUND (3.579.0). A stray shot is a second damage
// call and it honours the Blunt Arrow too, so a check that only asked
// whether the phrase appeared anywhere stopped noticing its loss from the
// hit path. Both calls must carry the choice.
ok("B3c and the damage becomes subdual",
  (attackSrc.match(/damageTypeOverride: subdualShot \|\| shiftedSubdual \? "subdual"/g) ?? []).length === 2);

eq("B4 a sling can throw found rocks at -2", foundAmmunitionPenalty(W("Sling").system), -2);
eq("B4b a bow cannot", foundAmmunitionPenalty(LONGBOW), null);
{
  const wf = code("module", "combat", "ammunition-workflow.mjs");
  ok("B4c an empty pouch throws a rock rather than refusing",
    /return found \? \{ \.\.\.none, found \} : \{ \.\.\.none, blocked: true \};/.test(wf));
  ok("B4d and the -2 reaches the roll, untyped as printed",
    /modifiers\.push\(\{ label: "Found rock", value: ammoChoice\.found\.penalty, type: "untyped" \}\);/.test(attackSrc));
}
ok("B5 the sling adds full Strength, as thrown (R2)",
  /: thrownDamage \? strengthMod : propulsiveStrengthBonus\(hasPropulsive, strengthMod\);/.test(attackSrc)
  && /const thrownDamage = !isMelee && weaponData\.thrownDamage === true;/.test(attackSrc));
ok("B5b and has no Propulsive left to halve it", !/propulsive/i.test(W("Sling").system.traits));
ok("B5c sling bullets still fit it", ammunitionFitsWeapon(AMMO.get("Sling Bullets (20)").system, W("Sling").system));

/* ================================================================== */
/* C — RECOVERING AMMUNITION (R3)                                      */
/* ================================================================== */

eq("C1 half, rounded down", [0, 1, 2, 5, 12, 21].map(recoverableRounds), [0, 0, 1, 2, 6, 10]);
{
  let rec = null;
  for (let i = 0; i < 5; i += 1) rec = withShotRecorded(rec, "c1", { id: "a", name: "Arrows (20)" });
  rec = withShotRecorded(rec, "c1", { id: "s", name: "Shuriken", source: { name: "Shuriken" } });
  eq("C2 each stack is counted", [rec.stacks.a.fired, rec.stacks.s.fired], [5, 1]);
  eq("C2b and the plan offers half of each, dropping what rounds to none",
    recoveryPlan(rec, "c1").map((r) => [r.name, r.recover]), [["Arrows (20)", 2]]);
  rec = withShotRecorded(rec, "c1", { id: "s", name: "Shuriken" });
  eq("C2c the last shuriken's copy is kept to put back", recoveryPlan(rec, "c1").find((r) => r.id === "s")?.source, { name: "Shuriken" });
  eq("C3 another combat's count is offered nothing", recoveryPlan(rec, "c2"), []);
  eq("C3b and a new combat starts a new count", withShotRecorded(rec, "c2", { id: "a", name: "Arrows (20)" }).stacks,
    { a: { name: "Arrows (20)", fired: 1, source: null } });
}
ok("C4 shuriken are ammunition after the throw", recoveredAsAmmunition(W("Shuriken").system) && !recoveredAsAmmunition(W("Javelin").system));
{
  const wf = code("module", "combat", "ammunition-workflow.mjs");
  const tw = code("module", "combat", "thrown-weapons.mjs");
  ok("C5 every spent round is counted", /await recordAmmunitionSpent\(ammo\.parent, ammo\);/.test(wf));
  ok("C5b a thrown shuriken is counted, not dropped on the party sheet",
    /const destination = asAmmunition \? "battlefield" : thrownDestination\(actor\?\.type\);/.test(tw)
    && /await recordAmmunitionSpent\(actor, weapon, \{ source: removeItem \? weapon\.toObject\(\) : null \}\);/.test(tw));
  ok("C5c only while a combat runs", /const combatId = game\.combat\?\.started \? game\.combat\.id : null;/.test(wf));
  ok("C6 the offer is made when a combat ends, by one GM",
    /Hooks\.on\("deleteCombat", async \(combat\) => \{\s*if \(!isActingGM\(\)\) return;/.test(wf));
  ok("C6b and registered at init", /registerAmmunitionRecoveryHooks\(\);/.test(code("scripts", "trg-prime.mjs")));
}

/* ================================================================== */
/* D — THE WHIP, AND REACH THAT IS NOT ALWAYS FIVE (D5)                */
/* ================================================================== */

const WHIP = W("Whip").system;
eq("D1 the whip extends reach by ten (15 ft printed)", weaponReachExtension(WHIP), 10);
eq("D1b any other Reach weapon by five", weaponReachExtension(W("Halberd").system), 5);
eq("D1c and a weapon without the trait by nothing", weaponReachExtension(W("Broadsword").system), 0);
eq("D1d even if it declares a reach", weaponReachExtension({ traits: "Keen", reachFeet: 15 }), 0);
const whipAt = (d) => reachPenalty(true, 5, d, { extension: weaponReachExtension(WHIP), noAdjacent: WHIP.noAdjacent });
ok("D2 the whip cannot strike an adjacent creature", whipAt(5).tooClose === true, "'can't be used against adjacent creatures'");
eq("D2b at 10 and 15 ft it strikes, at -2", [whipAt(10).penalty, whipAt(15).penalty, whipAt(15).outOfReach], [-2, -2, false]);
ok("D2c at 20 ft it is out of reach", whipAt(20).outOfReach);
const halberdAt = (d) => reachPenalty(true, 5, d, { extension: 5 });
eq("D3 a halberd is unchanged: adjacent free, 10 at -2, 15 out",
  [halberdAt(5).penalty, halberdAt(10).penalty, halberdAt(15).outOfReach, Boolean(halberdAt(5).tooClose)], [0, -2, true, false]);
eq("D3b and an old caller that passes nothing still gets +5", reachPenalty(true, 5, 10).penalty, -2);
eq("D4 threatened reach counts the whip's 15", [effectiveReach(5, 10), effectiveReach(5, true), effectiveReach(10, 10)], [15, 10, 20]);
ok("D5 the Strike refuses the adjacent target before AP is spent",
  /if \(reach\.tooClose\) \{/.test(attackSrc)
  && /\{ extension: reachExtension, noAdjacent: Boolean\(weaponData\.noAdjacent\) \}/.test(attackSrc)
  && /const meleeReach = \(Number\(system\.combat\?\.reach \?\? 5\) \|\| 5\) \+ reachExtension;/.test(attackSrc));
ok("D5b and the Attack of Opportunity reach reads it too",
  /\.reduce\(\(best, w\) => Math\.max\(best, weaponReachExtension\(w\.system\)\), 0\);/.test(code("module", "combat", "opportunity.mjs")));

/* ================================================================== */
/* E — THE HAND CROSSBOW RELOADS WITH BOTH HANDS (D4)                  */
/* ================================================================== */

const HAND_XBOW = { id: "hx", ...equip(W("Hand Crossbow")) };
eq("E1 the hand crossbow is fired one-handed", itemRequiredHands(HAND_XBOW, "medium"), 1);
const heavyShield = { id: "sh", type: "shield", name: "Heavy Steel Shield", system: { equipped: true, size: "medium", category: "heavy" } };
const buckler = { id: "bk", type: "shield", name: "Buckler", system: { equipped: true, size: "small", category: "buckler" } };
eq("E2 a shield in the other hand stops the reload", reloadHandsCheck([HAND_XBOW, heavyShield], HAND_XBOW, "medium").ok, false,
  "'it necessitates the use of both hands for reloading'");
eq("E2b a free hand allows it", reloadHandsCheck([HAND_XBOW], HAND_XBOW, "medium").ok, true);
eq("E2c a buckler is strapped on, and leaves the hand free", reloadHandsCheck([HAND_XBOW, buckler], HAND_XBOW, "medium").ok, true);
eq("E2d a weapon that declares nothing is never stopped", reloadHandsCheck([{ id: "lb", ...equip(W("Longbow")) }, heavyShield], { id: "lb", ...equip(W("Longbow")) }, "medium").ok, true);
ok("E3 the reload asks before anything is spent",
  (() => {
    const src = code("module", "combat", "reload-workflow.mjs");
    return /const hands = reloadHandsCheck\(/.test(src) && /if \(!hands\.ok\) \{/.test(src)
      && src.indexOf("reloadHandsCheck(") < src.indexOf("extractMagazine(weaponData.traits)");
  })());

/* ================================================================== */
/* F — UNARMED: ONE RULE (R6), AND THE FUMBLE TABLE IT CHOOSES         */
/* ================================================================== */

eq("F1 the gauntlet family and the cestus are unarmed attacks",
  ["Gauntlet", "Brass Knuckles", "Spiked Gauntlet", "Cestus"].map((n) => isUnarmedAttack(W(n).system)), [true, true, true, true],
  "'A strike with a gauntlet is otherwise considered an unarmed attack'");
eq("F1b every natural attack is", ["Bite", "Claw", "Unarmed Strike", "Tail Slap"].map((n) => isUnarmedAttack(W(n).system)), [true, true, true, true]);
eq("F1c a sword is not", isUnarmedAttack(W("Broadsword").system), false);
eq("F1d a gauntlet is a weapon, not a natural attack", [isNaturalAttack(W("Gauntlet").system), isNaturalAttack(W("Bite").system)], [false, true]);
{
  const fist = { type: "weapon", name: "Unarmed Strike", system: { ...W("Unarmed Strike").system, natural: true } };
  const bracers = { type: "armour", name: "Metal Bracers", flags: { "trg-prime": { countsAsGauntlets: true } }, system: { equipped: true, hp: { value: 0, max: 0 } } };
  const swung = armouredFistProfile(fist, [bracers]).data;
  eq("F2 a bracered punch is a Simple gauntlet attack for proficiency", swung.category, "Simple");
  ok("F2b and still an unarmed one (the 3.575.0 regression)", isUnarmedAttack(swung) && GAUNTLET_PROFILE.unarmed === true);
}
eq("F3 the fumble table: melee, missile, thrown or unarmed",
  [fumbleTableFor(W("Broadsword").system), fumbleTableFor(W("Longbow").system), fumbleTableFor(W("Javelin").system),
    fumbleTableFor(W("Gauntlet").system), fumbleTableFor(W("Unarmed Strike").system),
    fumbleTableFor(W("Dagger").system, { thrown: true })],
  ["melee", "missile", "thrown", "unarmed", "unarmed", "thrown"]);
ok("F3b the attack's fumble reads it, with the throw",
  /const category = fumbleTableFor\(swung, \{ thrown \}\);/.test(attackSrc)
  && /rollFumbleCheck\(actor, weapon, \{ dcHalved: outcome\.fumbleDcHalved, weaponData, thrown: thrownAttack \}\)/.test(attackSrc));
/*
 * F4 PINNED TO ITS OWN CALL SITE AT 3.586.3.
 *
 * It matched `unarmed: isUnarmedAttack(weaponData),` ANYWHERE in the
 * file, which was one line until the Assassin's mark started asking the
 * same question of the same helper. With two, `mutate-chapter6-gear`
 * could change the Vibrant Thorns line and this check went on passing —
 * satisfied by an occurrence that has nothing to do with thorns.
 *
 * The claim is unchanged and is about SHARING ONE RULE: both callers ask
 * `isUnarmedAttack` rather than re-reading the category. So it now
 * counts them and ties the thorns one to its neighbour.
 */
ok("F4 Savage Strikes and Vibrant Thorns ask the one rule",
  /const savageIsUnarmed = isUnarmedAttack\(/.test(attackSrc)
  && /      melee: isMelee,\n      unarmed: isUnarmedAttack\(weaponData\),/.test(attackSrc),
  "the thorns call specifically — a second caller must not stand in for it");
ok("F4b and nothing re-reads the category by hand instead",
  !/unarmed: String\(weaponData\.category/.test(attackSrc),
  "which is the rule isUnarmedAttack exists to be the only copy of");
{
  const punch = normaliseStrikeRider({ label: "Force Punch", dice: "1d6", damageType: "force", scope: "unarmed", once: false });
  const gauntletIdentity = { attackMode: "melee", category: "Simple", unarmed: true, natural: false, traits: "Agile, Free-Hand", weaponId: "g" };
  eq("F5 Force Punch rides a gauntleted fist", riderPacketsFor([punch], gauntletIdentity).length, 1);
  eq("F5b and not a sword", riderPacketsFor([punch], { attackMode: "melee", category: "Martial", weaponId: "s" }).length, 0);
  ok("F5c the identity carries what the rule reads",
    /unarmed: weapon\?\.system\?\.unarmed === true,/.test(code("module", "magic", "strike-riders-workflow.mjs")));
}

/* ================================================================== */
/* G — WEAPON SPELLS AND NATURAL ATTACKS (D7)                          */
/* ================================================================== */

{
  const items = [
    { id: "u", type: "weapon", name: "Unarmed Strike", system: { equipped: true, natural: true, category: "Unarmed" } },
    { id: "b", type: "weapon", name: "Bite", system: { equipped: true, natural: true, category: "Unarmed" } },
    { id: "g", type: "weapon", name: "Gauntlet", system: { equipped: true, category: "Simple", unarmed: true } },
    { id: "l", type: "weapon", name: "Longsword", system: { equipped: true, category: "Martial" } },
    { id: "x", type: "weapon", name: "Dagger", system: { equipped: false, category: "Simple" } }
  ];
  eq("G1 a 'weapon you are wielding' is never a natural attack", enchantableWeapons(items).map((i) => i.id), ["g", "l"],
    "page 166: 'natural attacks are not weapons'");
  const src = code("module", "magic", "strike-riders-workflow.mjs");
  ok("G1b the pre-cast gate and the weapon prompt both use it",
    /const wielding = enchantableWeapons\(/.test(src) && /const weapons = enchantableWeapons\(/.test(src));
}

/* ================================================================== */
/* H — BRAWLING REACHES NATURAL ATTACKS (R7)                           */
/* ================================================================== */

ok("H1 Brawling is a printed weapon group", WEAPON_GROUPS.includes("Brawling"));
eq("H2 every pack natural attack is in it",
  [...WEAPONS.values()].filter((w) => w.system.natural).map((w) => w.system.group).filter((g) => g !== "Brawling"), []);
eq("H3 so Weapon Exemplar (Brawling) reaches a Bite", weaponExemplarBonusFor(["Brawling"], 1, W("Bite").system.group), 1,
  "Graham, R7: the group names 'All Unarmed Attacks'");

/* ================================================================== */
/* I — MOUNTED (R4)                                                    */
/* ================================================================== */

{
  const mounted = { flags: { "trg-prime": { [MOUNTED_FLAG]: { mount: "Warhorse" } } } };
  // `steed` since 3.577.0: the creature's handle, for R8's skittish steeds.
  eq("I1 nobody is mounted by default", mountedState({ flags: {} }), { mounted: false, mount: "", steed: null });
  eq("I1b a rider knows what they sit on", mountedState(mounted), { mounted: true, mount: "Warhorse", steed: null });
  eq("I2 Mount / Dismount mounts the unmounted", mountedAfterSuccess(mountedState({}), "Pony"), { mount: "Pony" });
  eq("I2b and dismounts the mounted", mountedAfterSuccess(mountedState(mounted), "Pony"), null);
  ok("I3 the lance is refused on foot", /mounted/i.test(mountedWeaponRefusal(W("Lance").system, false, "Lance") ?? ""));
  eq("I3b and allowed in the saddle", mountedWeaponRefusal(W("Lance").system, true, "Lance"), null);
  ok("I4 the composite longbow is refused in the saddle",
    /whilst mounted/.test(mountedWeaponRefusal(W("Composite Longbow").system, true, "Composite Longbow") ?? ""));
  eq("I4b and allowed on foot", mountedWeaponRefusal(W("Composite Longbow").system, false), null);
  eq("I5 a longbow cares about neither", [mountedWeaponRefusal(LONGBOW, true), mountedWeaponRefusal(LONGBOW, false)], [null, null]);
  ok("I6 the attack asks before a target is chosen",
    /const mountedRefusal = mountedWeaponRefusal\(weapon\?\.system, mountedState\(actor\)\.mounted, weapon\.name\);\s*if \(mountedRefusal\) \{/.test(attackSrc)
    && attackSrc.indexOf("mountedWeaponRefusal(weapon") < attackSrc.indexOf("promptTargetSelection(actor, {"));
  ok("I7 a successful Mount / Dismount sets it, rolled or not",
    /if \(action\.key === "mountDismount"\) \{\s*lines\.push\(line\(await settleMount\(actor, targetActor\)\)\);/.test(actionSrc)
    && /if \(action\.key === "mountDismount" && degree === "success"\) \{/.test(actionSrc));
}

/* ================================================================== */
/* J — RACIAL WEAPONS (R11)                                            */
/* ================================================================== */

// Each weapon whose table row or description names a race, and the race.
const RACIAL = Object.freeze({ Zokarrin: "Dwarf", "Tel’dorin": "Elf", "Sil’maril": "Elf", "Anar Dhagor": "Gnome", "Riath-Elenya": "Halfling" });
eq("J1 every racial weapon carries its race as a trait",
  Object.entries(RACIAL).filter(([name, race]) => !racialWeaponMatches(race, W(name).system.traits)).map(([n]) => n), []);
eq("J2 so a Halfling treats the Riath-Elenya as martial",
  [effectiveWeaponCategory({ race: "Halfling" }, W("Riath-Elenya")), effectiveWeaponCategory({ race: "Elf" }, W("Riath-Elenya"))],
  ["Martial", "Exotic"]);
eq("J3 and its range still reads as 40", extractTraitValue(W("Riath-Elenya").system.traits, "range"), 40);

/* ================================================================== */
/* K — POWERFUL IS CIRCUMSTANCE (R14)                                  */
/* ================================================================== */

ok("K1 Powerful's bonus is typed circumstance",
  /modifiers\.push\(\{ label: "Powerful \(within 20 ft\)", value: powerfulBonus, type: "circumstance" \}\);/.test(attackSrc),
  "the Heavy Crossbow: 'a significant +4 circumstance bonus when targeting foes within 20 feet'");

/* ================================================================== */
/* L — IMPROVISED ATTACKS (R5)                                         */
/* ================================================================== */

// The printed rows the Goods name (pages 157-158): damage, type, fumble.
const PRINTED_AS = Object.freeze({
  Torch: ["1d5", "bludgeoning", 12],          // Club
  "Pole, 10 ft": ["1d6", "bludgeoning", 12],  // Staff
  "Axe, woodsman": ["1d6", "slashing", 8],    // Handaxe
  "Hammer, Tool": ["1d6", "bludgeoning", 6],  // Light Hammer
  Shovel: ["1d4", "piercing", 8]              // Light Pick
});
for (const [name, [die, type, fumble]] of Object.entries(PRINTED_AS)) {
  const item = equip(G(name));
  const p = improvisedWeaponProfile(item);
  eq(`L1 ${name} attacks as the weapon it names`, [p.damage, p.damageType, p.fumbleDC], [die, type, fumble]);
  ok(`L1b ${name} is never thrown here`, !/\bthrown\b/i.test(p.traits));
}
eq("L2 the improvised penalty is -4 circumstance", IMPROVISED_PENALTY, -4);
eq("L2b a torch takes it", improvisedAttackModifier(improvisedWeaponProfile(equip(G("Torch"))), "Torch")?.value, -4);
eq("L2c the pole takes -2, by Graham's ruling", improvisedAttackModifier(improvisedWeaponProfile(equip(G("Pole, 10 ft"))), "Pole")?.value, -2);
eq("L2d and it is circumstance", improvisedAttackModifier(improvisedWeaponProfile(equip(G("Torch"))), "Torch")?.type, "circumstance");
eq("L3 the torch also burns for 1 fire, as its own packet",
  improvisedDamagePackets(improvisedWeaponProfile(equip(G("Torch"))), "Torch").map((p) => [p.dice, p.type]), [["1", "fire"]]);
eq("L3b a pole does not", improvisedDamagePackets(improvisedWeaponProfile(equip(G("Pole, 10 ft"))), "Pole"), []);
{
  const spyglass = equip(G("Spyglass"));
  const p = improvisedWeaponProfile(spyglass, { damageType: "piercing" });
  eq("L4 anything else is 1d4, of the type chosen", [p.damage, p.damageType], ["1d4", "piercing"]);
  eq("L4b bludgeoning unless changed", improvisedWeaponProfile(spyglass).damageType, "bludgeoning");
  eq("L4c and nothing strange can be chosen", improvisedWeaponProfile(spyglass, { damageType: "fire" }).damageType, "bludgeoning");
  ok("L4d it names no weapon", !improvisesAsNamedWeapon(spyglass) && improvisesAsNamedWeapon(equip(G("Torch"))));
}
eq("L5 only something held in the hand",
  [canImproviseWith(equip(G("Torch"))), canImproviseWith(G("Torch")), canImproviseWith(equip(G("Backpack"))),
    canImproviseWith(equip(W("Broadsword")))], [true, false, false, false]);
{
  const verdict = proficiencyOf({ weaponCategories: new Set(), weaponNames: new Set(), weaponGroups: new Set(), weaponRules: [] },
    { type: "weapon", name: "Torch", system: improvisedWeaponProfile(equip(G("Torch"))) });
  // THE REASON IS CHECKED TOO: a profile with no category is also let
  // through by the "predates the proficiency rules" fail-open, which would
  // pass this for the wrong reason.
  ok("L6 no proficiency is asked of an improvised attack, because it is improvised",
    verdict.proficient === true && /improvised/.test(verdict.why), verdict.why);
}
ok("L7 the attack pushes the row and the packet",
  /const improvisedRow = improvisedAttackModifier\(weaponData, weapon\.name\);\s*if \(improvisedRow\) modifiers\.push\(improvisedRow\);/.test(attackSrc)
  && /\.\.\.improvisedDamagePackets\(weaponData, weapon\?\.name \?\? ""\)/.test(attackSrc));
ok("L8 there is an Improvised Attack action, and it is dispatched",
  BASIC_ACTIONS.some((a) => a.key === "improvisedAttack" && a.apCost === "1" && /Attack/.test(a.traits))
  && /if \(action\.key === "improvisedAttack"\) \{/.test(actionSrc));

/* ================================================================== */
/* M — THE GOODS' PRINTED BONUSES (R8)                                 */
/* ================================================================== */

// Transcribed from pages 167-170: item → [value, type] of each bonus.
// THREE AMENDED AT 3.577.0 by Graham's R2 of the block-17 audit: "Table
// has the correct mods." The p.171 Goods table prints Bedroll +2, Compass
// +2 and Earplugs +1 where the descriptions print +4, +5 and +5; the
// table wins. Earplugs keep the description's -2 to hearing, which the
// table does not contradict. verify-chapter6-gear-171-180 pins the table.
const PRINTED_GOODS = Object.freeze({
  Bedroll: [[2, "item"]],
  "Brass Ear": [[5, "untyped"]],
  Compass: [[2, "item"]],
  "Concealed Sheath": [[2, "item"]],
  Earplugs: [[1, "item"], [-2, "item"]],
  "Flag/Standard": [[1, "item"], [1, "item"]],
  "Glasses/Goggles": [[2, "item"]],
  "Grooming Case": [[1, "item"]],
  "Magnifying Glass": [[2, "item"]],
  "Map, Average": [[2, "item"]],
  "Map, Detailed": [[2, "item"], [2, "item"]],
  Pipe: [[1, "circumstance"]],
  "Pole, 10 ft": [[2, "item"]],
  "Ram, Portable": [[4, "item"], ["advantage", null]],
  "Wrist Sheath": [[2, "item"]],
  "Wrist Sheath (Spring)": [[2, "item"]]
});
{
  const diffs = [];
  for (const [name, rows] of Object.entries(PRINTED_GOODS)) {
    const got = goodsConditionals([equip(G(name))]).map((c) => (c.kind === "advantage" ? ["advantage", null] : [c.value, c.type]));
    if (JSON.stringify(got) !== JSON.stringify(rows)) diffs.push(`${name}: printed ${JSON.stringify(rows)}, offered ${JSON.stringify(got)}`);
  }
  ok(`M1 all ${Object.keys(PRINTED_GOODS).length} Goods offer their printed bonuses while equipped`, diffs.length === 0, diffs.join("; "));
}
eq("M2 nothing while it is in the pack", goodsConditionals([G("Compass")]), []);
eq("M2b nor once it is destroyed", goodsConditionals([equip(G("Compass"), { hp: { value: -5, max: 4 } })]), []);
ok("M3 each is ticked by the player, never assumed", goodsConditionals([...Object.keys(PRINTED_GOODS)].map((n) => equip(G(n)))).every((c) => c.auto === false));
eq("M4 the compass scopes itself to Sense Direction (R8b)", goodsConditionals([equip(G("Compass"))])[0].when, { actions: ["senseDirection"] });
eq("M4b earplugs to saves against Auditory", goodsConditionals([equip(G("Earplugs"))])[0].when, { checkTypes: ["save"], traits: ["auditory"] });
ok("M5 the actor offers them in its check dialogs",
  /\.\.\.goodsConditionals\(Array\.from\(actor\.items \?\? \[\]\)\)/.test(code("module", "documents", "actor.mjs")));
ok("M6 and the compass still makes it harder to go without one",
  /tools: Object\.freeze\(\["Compass"\]\)/.test(read("module", "tools-requirement.mjs")));

/* ================================================================== */
/* N — SADDLEBAGS (R8)                                                 */
/* ================================================================== */

ok("N1 both carrying items are real pack items", Boolean(G("Backpack")) && Boolean(G("Saddlebags")));
ok("N1b and both are in the table", Boolean(CARRY_STRENGTH_ITEMS.backpack) && Boolean(CARRY_STRENGTH_ITEMS.saddlebags));
eq("N2 saddlebags on an animal: +1 Strength for carrying",
  carryStrengthBonus({ items: [equip(G("Saddlebags"))], animal: true }), 1, "'an animal's Strength score is considered 1 higher'");
eq("N2b on a person: nothing", carryStrengthBonus({ items: [equip(G("Saddlebags"))], animal: false }), 0);
eq("N2c the backpack is unchanged", carryStrengthBonus({ items: [equip(G("Backpack"))] }), 1);
eq("N2d and carried, not worn, gives nothing", carryStrengthBonus({ items: [G("Saddlebags")], animal: true }), 0);
eq("N3 an animal: a companion, or creature type Animal",
  [carriesAsAnimal("companion", {}), carriesAsAnimal("npc", { details: { creatureType: "Animal" } }), carriesAsAnimal("character", {}),
    carriesAsAnimal("npc", { details: { creatureType: "Humanoid" } })], [true, true, false, false]);
{
  const actor = code("module", "documents", "actor.mjs");
  ok("N4 both places that work out the allowance ask",
    /animal: carriesAsAnimal\(actor\.type, system\)/.test(actor) && /animal: carriesAsAnimal\(actorType, system\)/.test(actor));
}

/* ================================================================== */
/* O — CALTROPS AND OIL (R9)                                           */
/* ================================================================== */

eq("O1 caltrops: DC 20 basic Reflex, 1d6 piercing", [CALTROPS.dc, CALTROPS.save, CALTROPS.damage, CALTROPS.damageType], [20, "reflex", "1d6", "piercing"]);
eq("O2 oil: DC 10 flat to ignite, 5 fire", [OIL.igniteDC, OIL.damage, OIL.damageType], [10, 5, "fire"]);
eq("O3 caltrops are ruined once they draw blood", [caltropsAfterEntry({}, 0).ruined, caltropsAfterEntry({}, 3).ruined, caltropsAfterEntry({ ruined: true }, 0).ruined], [false, true, true]);
eq("O4 the pack's caltrops and oil have a use", [G("Caltrops")?.flags?.["trg-prime"]?.goodsUse, G("Oil (pint)")?.flags?.["trg-prime"]?.goodsUse], ["caltrops", "oil"]);
ok("O4b and say what it does", /Scatter/.test(goodsUseLabel(G("Caltrops"))) && /Prepare/.test(goodsUseLabel(G("Oil (pint)"))));
ok("O4c a prepared flask says Throw", /Throw/.test(goodsUseLabel({ ...G("Oil (pint)"), flags: { "trg-prime": { goodsUse: "oil", oilPrepared: true } } })));
eq("O4d a plain item has none", goodsUseLabel(G("Rope, Hemp (50 ft)") ?? G("Compass")), "");
eq("O5 the basic save: success halves, a critical avoids it", [basicSavingThrow("success").damageMultiplier, basicSavingThrow("critical").damageMultiplier], [0.5, 0]);
{
  const src = code("module", "goods-workflow.mjs");
  ok("O6 the caltrops save is a basic one with its margin",
    /const basic = basicSavingThrow\(degree, margin\);/.test(src) && /dc: CALTROPS\.dc,/.test(src));
  ok("O7 the oil must be prepared before it is thrown", /if \(!oilPrepared\(item\)\) \{/.test(src) && !oilPrepared(G("Oil (pint)")));
  ok("O7b and ignites on a DC 10 flat check", /type: "flat", flat: true, dc: OIL\.igniteDC/.test(src));
  ok("O8 the card's buttons are wired at init", /registerGoodsHooks\(\);/.test(code("scripts", "trg-prime.mjs")));
}

/* ================================================================== */
/* P — THE HOODED LANTERN (R13)                                        */
/* ================================================================== */

{
  const lantern = (flags) => ({ type: "gear", name: "Lantern, Hooded", system: { equipped: true }, flags: { "trg-prime": flags } });
  const torch = (flags) => ({ type: "gear", name: "Torch", system: { equipped: true }, flags: { "trg-prime": flags } });
  ok("P1 only the hooded lantern has a hood", lightSourceHasHood(lantern({})) && !lightSourceHasHood(torch({})));
  eq("P2 lit, hood raised: it sheds light", litGearKeysOn({ items: [lantern({ lit: true })] }), ["lantern-hooded"]);
  eq("P2b lit, hood lowered: still burning, shedding nothing", litGearKeysOn({ items: [lantern({ lit: true, hooded: true })] }), [],
    "'lowered to conceal its light without extinguishing it'");
  ok("P2c and still lit", lantern({ lit: true, hooded: true }).flags["trg-prime"].lit === true && itemIsHooded(lantern({ lit: true, hooded: true })));
  eq("P3 a stray hood flag on a torch conceals nothing", litGearKeysOn({ items: [torch({ lit: true, hooded: true })] }), ["torch"]);
  ok("P4 the sheet offers the hood", /data-action="toggleItemHood"/.test(read("templates", "actor", "actor-sheet.hbs"))
    && lightSourceKeyForItem(lantern({})) === "lantern-hooded");
}

/* ================================================================== */

if (failures) {
  console.error(`verify-chapter6-gear-161-170: FAILED — ${failures} of ${checks}`);
  process.exit(1);
}
console.log(`verify-chapter6-gear-161-170: OK — ${checks} checks. Pages 161-170: the rounds, the whip, the gauntlets, the Goods.`);
