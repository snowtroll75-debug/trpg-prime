#!/usr/bin/env node
/**
 * verify-proficiency — is this character proficient with this item?
 *
 * NEW at 3.535.0, and it is the file `proficiency-rules.mjs` has twice
 * claimed already existed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE HEADER LIED ABOUT ITS OWN COVERAGE, TWICE.
 *
 * `proficiency-rules.mjs` used to say the printed class lists lived in
 * `tools/source/proficiency-lines.txt` and that `tools/verify-proficiency.mjs`
 * diffed the table against them. Its own header records what happened
 * next: "NEITHER FILE EXISTED. The table shipped unchecked, and the
 * sixteen creature classes below were missing from it for sixteen
 * releases without a single complaint from anything."
 *
 * That paragraph then ends: "The harness exists now." IT DID NOT. There
 * was no verify-proficiency.mjs and no mutate-proficiency.mjs when this
 * one was written — the module was named in no check in the tools
 * directory at all. A claim of coverage was corrected by a paragraph
 * making the same claim.
 *
 * So this file is written to be the thing that was described, and its
 * first job is that the claim stops being false.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IT CAN AND CANNOT ASSERT.
 *
 * The old design was to diff the table against each class's PRINTED
 * SENTENCE. That sentence is prose — "You are proficient with any
 * non-metal armour or shield" — and a structured table cannot be
 * diffed against prose without inventing a parser whose failures would
 * be indistinguishable from the defects it was looking for.
 *
 * So the prose is used where it is decidable and nowhere else: section C
 * asks whether a class HAS an entry, not whether its entry matches its
 * paragraph. What replaces the diff is section S, which drives the real
 * predicate over every class against every item in the packs — 24 × 273
 * — because the module was deliberately written pure so that could be
 * done: "so the harness can put all 114 items past all 24 classes
 * without a world."
 *
 * MEASURED BEFORE WRITING, and all of it currently passes. Nothing here
 * repairs a defect; it stops sixteen releases of silence happening
 * twice.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  CLASS_PROFICIENCY, CREATURE_CLASS_PROFICIENCY, OTHER_ARMOUR_TIERS,
  UNIVERSAL_WEAPON_CATEGORIES, classProficiencyEntry, nameKey,
  proficiencyProfile, isProficientWith, proficiencyOf, isProficientWithAlchemical
} from "../module/proficiency-rules.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

/* ── loading the packs, once ─────────────────────────────────────── */

/* EVERY PACK, DISCOVERED — NOT A LIST I MAINTAIN.
 *
 * 3.535.0 shipped this as a hardcoded list of seven, and the list was
 * the defect. It omitted `specific-items`, `test-items`,
 * `creature-attacks` and `companions`, so 31 weapons, armour and shields
 * — every named magic item in the game among them — were never once put
 * past a class, while this file reported "6,576 pairs" and a clean pass.
 *
 * I then wrote in two sets of release notes that no pack weapon carried
 * an Ancient Echoes rune. Thirteen runed items existed the whole time,
 * in the two packs I was not reading. The claim was true of the packs I
 * loaded and false of the system, which is the same failure as the
 * module header that started this work: confidence scoped to what was
 * measured, stated as though it covered everything.
 *
 * So the directory is walked instead. A new pack of weapons is in the
 * cross-product the day it appears, and P1 below fails if this ever
 * silently stops being true. */
const CLASS_PACKS = ["classes", "creature-classes", "companions"];

async function readPack(name) {
  const dir = path.join(SYSTEM_ROOT, "packs", name);
  if (!fs.existsSync(dir)) return [];
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [, v] of db.iterator()) if (v?.name) out.push(v);
  await db.close();
  return out;
}

const GEAR_TYPES = new Set(["weapon", "armour", "shield"]);
const allPackNames = fs.readdirSync(path.join(SYSTEM_ROOT, "packs"))
  .filter((d) => fs.statSync(path.join(SYSTEM_ROOT, "packs", d)).isDirectory());
const packContents = new Map(
  await Promise.all(allPackNames.map(async (n) => [n, await readPack(n)])));
const gear = [...packContents.values()].flat();
const gearPacksFound = allPackNames
  .filter((n) => packContents.get(n).some((i) => GEAR_TYPES.has(i.type))).sort();
const classItems = (await Promise.all(CLASS_PACKS.map(readPack))).flat()
  .filter((v) => v.type === "class");

const gearByKey = new Map(gear.map((i) => [nameKey(i.name), i]));
const byName = (n) => gearByKey.get(nameKey(n));

/* A profile needs an actor; the module flattens one to plain data, so a
 * literal with the one item it reads is enough — and is what lets this
 * run without a world at all. */
const profileFor = (className) =>
  proficiencyProfile({ items: [{ type: "class", name: className, system: {} }] });

/* ================================================================== *
 * C. EVERY CLASS IS IN THE TABLE, AND EVERY ENTRY IS A CLASS
 * ================================================================== *
 *
 * This is the drift that went unnoticed for sixteen releases: the table
 * simply did not mention the creature classes, and nothing anywhere
 * compared the two lists.
 */

ok("C0 THE PACKS AND THE TABLE ARE BOTH NON-EMPTY",
  classItems.length > 0 && gear.length > 0,
  `${classItems.length} class items, ${gear.length} gear items — a zero here would make `
  + "every check below pass by finding nothing, which is the failure mode this harness "
  + "has shipped twice");

const unmatchedClasses = classItems
  .filter((c) => !classProficiencyEntry(c.name))
  .map((c) => c.name);

/* ANIMAL COMPANION IS THE ONE DELIBERATE EXCEPTION, and it is
 * distinguishable rather than merely excused: its printed proficiencies
 * sentence is EMPTY, where all 24 real classes print one. A companion
 * is not a class that grants proficiency, and the blank field says so
 * in the data rather than in this comment. */
equal("C1 EXACTLY ONE CLASS ITEM HAS NO TABLE ENTRY",
  JSON.stringify(unmatchedClasses), JSON.stringify(["Animal Companion"]),
  "a second name here is a class nobody has written proficiencies for — which is what "
  + "happened to all sixteen creature classes, silently, for sixteen releases");

const companion = classItems.find((c) => c.name === "Animal Companion");
equal("C1b AND IT IS THE ONE THAT PRINTS NO PROFICIENCIES EITHER",
  String(companion?.system?.proficiencies ?? "").trim(), "",
  "so the exception is visible in the data, not only asserted here");

const tableKeys = [...Object.keys(CLASS_PROFICIENCY), ...Object.keys(CREATURE_CLASS_PROFICIENCY)];
const matchedKeys = new Set(classItems.map((c) => classProficiencyEntry(c.name)?.key).filter(Boolean));
const orphanEntries = tableKeys.filter((k) => !matchedKeys.has(k));

equal("C2 AND NO TABLE ENTRY DESCRIBES A CLASS THAT DOES NOT EXIST",
  JSON.stringify(orphanEntries), JSON.stringify([]),
  "an entry for a deleted or renamed class is a rule nothing can ever reach");

equal("C3 THE TWO TABLES COVER TWENTY-FOUR CLASSES BETWEEN THEM",
  tableKeys.length, 24,
  "8 player classes and 16 creature classes — the sixteen are the ones that were missing");

/* EVERY REAL CLASS PRINTS ITS SENTENCE. The prose is not diffed, but a
 * class with no printed proficiencies at all cannot be checked by
 * anybody, including a human reading the sheet. */
const silent = classItems
  .filter((c) => c.name !== "Animal Companion")
  .filter((c) => !String(c.system?.proficiencies ?? "").trim())
  .map((c) => c.name);
equal("C4 AND EVERY ONE OF THEM PRINTS WHAT IT GRANTS",
  JSON.stringify(silent), JSON.stringify([]),
  "the printed sentence is the only thing a person can check the table against");

/* ================================================================== *
 * P. THE PACKS THEMSELVES — THE DEFECT THIS FILE SHIPPED
 * ================================================================== *
 *
 * Everything in section S is only as true as the set of items it runs
 * over, and at 3.535.0 that set was a hardcoded list of seven packs that
 * omitted four. These checks exist so the gap cannot reopen quietly, and
 * so the two defects it was hiding cannot come back.
 *
 * BOTH OF THOSE DEFECTS WERE SILENT IN OPPOSITE DIRECTIONS, which is why
 * neither had ever been noticed:
 *
 *   - Six named magic armours carried `category: "armour"` — a string
 *     that is not a tier — so no lookup matched and NOBODY could wear
 *     them. Not a caster problem: a Fighter with proficiency in all
 *     armour took -4 and doubled check penalties in his own magic plate.
 *     The error message read "not proficient with armour armour", and
 *     the doubled word was the only thing in the system saying so.
 *
 *   - Seven named magic weapons and shields carried NO category, which
 *     is the fail-open branch: "this item predates the proficiency rules".
 *     That branch is right for an item already on a character before
 *     3.215.0 and wrong for pack content, so a Wizard swung Scourge of
 *     the Unlife with no -4 at all.
 *
 * P2 IS THE ONE THAT MATTERS. The fail-open branch is deliberately not
 * mutation-tested — removing it would penalise every existing character
 * — so nothing was ever going to notice pack items falling into it.
 * P2 asks the question the mutation runner cannot. */

const gearItems = gear.filter((i) => GEAR_TYPES.has(i.type));

ok("P1 THE PACK WALK FINDS MORE GEAR PACKS THAN THE OLD LIST NAMED",
  gearPacksFound.length >= 6 && gearItems.length >= 140,
  `${gearItems.length} gear items across ${gearPacksFound.length} packs `
  + `(${gearPacksFound.join(", ")}) — the hardcoded list this replaced found 114 across 3, `
  + "and reported a clean pass over the 31 items it could not see");

/* NAMED, BECAUSE P2b HAS TO RUN THE SAME FUNCTION. P2 is a search that
 * now finds nothing, and "nothing" is what a broken search returns too —
 * the vacuity that survived at 3.533.0, 3.534.0 and again here when the
 * mutation runner weakened this very predicate and the file still passed. */
const fallsOpen = (item) => !String(item?.system?.category ?? "").trim();

const noCategory = gearItems.filter(fallsOpen)
  .map((i) => `${i.name} (${i.type})`).sort();
equal("P2 AND NO PACK ITEM FALLS INTO THE FAIL-OPEN BRANCH",
  JSON.stringify(noCategory), JSON.stringify([]),
  "an empty category means \"this item predates the proficiency rules\" and every class "
  + "uses it freely — correct for a character's existing gear, never for pack content");

ok("P2b AND THAT TEST STILL RECOGNISES ONE WHEN IT SEES IT",
  fallsOpen({ type: "weapon", name: "Fixture", system: { category: "" } })
  && fallsOpen({ type: "weapon", name: "Fixture", system: {} })
  && !fallsOpen({ type: "weapon", name: "Fixture", system: { category: "Martial" } }),
  "the same function P2 scans with, asked about a categoryless item directly — without "
  + "this, P2 passes just as well on a predicate that has stopped detecting anything");

ok("P2c AND THE RULE STILL FAILS OPEN WHEN IT SHOULD",
  proficiencyOf(profileFor("Wizard"),
    { type: "weapon", name: "Fixture Heirloom", system: {} }).proficient === true,
  "the branch itself must survive — an item already on a character from before 3.215.0 "
  + "must keep working, which is why P2 polices the PACKS rather than the rule");

const ARMOUR_TIERS = new Set(["Light", "Medium", "Heavy", "Other"]);
// "scabbard" since 3.575.0 (Graham, 19 Sep 2026, R7): the parrying
// scabbard's own category, which light-shield proficiency covers through
// SHIELD_CATEGORY_COVERED_BY — so it is reached by a rule, which is what
// this set is standing in for.
const SHIELD_CATS = new Set(["buckler", "light", "heavy", "tower", "scabbard"]);
const badCategory = gearItems.filter((i) => {
  const c = String(i.system?.category ?? "").trim();
  if (!c) return false;
  if (i.type === "armour") return !ARMOUR_TIERS.has(c);
  if (i.type === "shield") return !SHIELD_CATS.has(c.toLowerCase());
  return false;
}).map((i) => `${i.name}: ${i.system.category}`).sort();
equal("P3 AND EVERY ARMOUR AND SHIELD CATEGORY IS ONE THE TABLE KNOWS",
  JSON.stringify(badCategory), JSON.stringify([]),
  "a category outside the set matches no rule in either direction, so the item becomes "
  + "unusable by every class at once — which is what \"armour\" as a tier did to six of them");

ok("P4 AND THE CATEGORIES ACTUALLY DIVIDE THE POPULATION",
  new Set(gearItems.filter((i) => i.type === "armour")
    .map((i) => i.system.category)).size >= 3,
  "all one tier would satisfy P3 perfectly while meaning the tiers had stopped "
  + "distinguishing anything");

/* ================================================================== *
 * K. THE NAME NORMALISER, ASSERTED AS A CONTRACT
 * ================================================================== *
 *
 * MEASURED, and it is the reason this section exists: strip
 * `.toLowerCase()` out of `nameKey` and NOT ONE of the 6,576 pairs in
 * section S changes its answer. Not a defect the harness missed — an
 * equivalent mutation. Every comparison in the module puts BOTH sides
 * through this function, so a normaliser that stops normalising still
 * agrees with itself, and no amount of cross-product proves otherwise.
 *
 * `nameKey` is exported, so its consumers are not all in this module and
 * not all in this repository's future. An exported normaliser is worth
 * asserting as a contract rather than by its consequences.
 *
 * NOTED WHILE WRITING IT: the curly-apostrophe and en-dash replacements
 * inside `nameKey` are dead as the chain currently stands — the final
 * `[^a-z0-9]` strip removes those characters anyway. They are harmless
 * and they document intent, so they stay; K3 pins the behaviour they
 * were written for so that reordering the chain cannot lose it. */

equal("K1 CASE IS NORMALISED AWAY", nameKey("Full Chainmail"), nameKey("FULL CHAINMAIL"),
  "the only assertion in the file that fails when nameKey stops lowercasing — the "
  + "cross-product cannot see it because both sides of every comparison use nameKey");
equal("K1b AND THE RESULT IS THE LOWERCASE FORM", nameKey("Full Chainmail"), "fullchainmail",
  "so a table entry can be written the way the book prints it");
equal("K2 SPACES AND PUNCTUATION ARE NORMALISED AWAY",
  nameKey("Klar - Bone"), nameKey("Klar—Bone"),
  "the pack and the table spell the separator differently in several places");
equal("K3 AND SO ARE TYPOGRAPHIC APOSTROPHES",
  nameKey("Hunter\u2019s Cloak"), nameKey("Hunter's Cloak"),
  "a name pasted from the book carries a curly apostrophe and one typed here does not");
ok("K4 BUT IT STILL DISTINGUISHES DIFFERENT ITEMS",
  nameKey("Chain") !== nameKey("Full Chainmail")
  && nameKey("Light Wooden Shield") !== nameKey("Heavy Wooden Shield"),
  "a normaliser that collapsed everything would satisfy K1 to K3 perfectly and grant "
  + "every class every item whose name it had ever heard of");

/* ================================================================== *
 * N. EVERY NAME IN THE TABLE IS A REAL ITEM
 * ================================================================== *
 *
 * The table names individual items in five places — the Other armour
 * tiers, and each entry's armourNames, armourExclude, shieldNames and
 * weaponNames. A typo in any of them is silent in both directions: a
 * misspelt grant grants nothing, and a misspelt EXCLUSION excludes
 * nothing and hands out an item the class should not have.
 *
 * The Bard's `armourExclude: ["Leather Helmet"]` is the one that shows
 * why this matters. It encodes a ruling — "Helmets block ethereal
 * spellcasting" — and if that string ever stopped matching, the Bard
 * would quietly gain a helmet and the ruling would be gone with no
 * error anywhere.
 */

const named = [];
const missingNames = [];
const collect = (label, list) => {
  for (const n of list ?? []) {
    named.push(`${label}: ${n}`);
    if (!byName(n)) missingNames.push(`${label}: ${JSON.stringify(n)}`);
  }
};
for (const [tier, list] of Object.entries(OTHER_ARMOUR_TIERS)) collect(`OTHER_ARMOUR_TIERS.${tier}`, list);
for (const [key, e] of Object.entries(CLASS_PROFICIENCY)) {
  collect(`${key}.armourNames`, e.armourNames);
  collect(`${key}.armourExclude`, e.armourExclude);
  collect(`${key}.shieldNames`, e.shieldNames);
  collect(`${key}.weaponNames`, e.weaponNames);
}
for (const [key, e] of Object.entries(CREATURE_CLASS_PROFICIENCY)) {
  collect(`${key}.armourNames`, e.armourNames);
  collect(`${key}.shieldNames`, e.shieldNames);
  collect(`${key}.weaponNames`, e.weaponNames);
}

/* THE POSITIVE CONTROL FIRST — "no missing names" is also what an empty
 * search returns, a lesson this harness learned twice in three releases. */
ok("N0 THE TABLE NAMES INDIVIDUAL ITEMS AT ALL",
  named.length >= 20,
  `${named.length} names collected — near zero means the fields moved or were renamed, and `
  + "the clean result below would be an empty search rather than a healthy table");

equal("N1 AND EVERY ONE OF THEM MATCHES A PACK ITEM",
  JSON.stringify(missingNames), JSON.stringify([]),
  "a name that matches nothing grants nothing — or, in armourExclude, EXCLUDES nothing "
  + "and quietly hands the class an item a ruling took away");

/* ── N2: the nine Other-armour names are the nine in the packs ────── */

const otherArmour = gear.filter((i) => i.type === "armour"
  && String(i.system?.category ?? "").toLowerCase() === "other").map((i) => i.name);
const tiered = Object.values(OTHER_ARMOUR_TIERS).flat();
equal("N2 THE OTHER ARMOUR TABLE IS TIERED IN FULL",
  JSON.stringify([...tiered].map(nameKey).sort()),
  JSON.stringify([...otherArmour].map(nameKey).sort()),
  "the split is written down rather than derived, so an Other armour added to the packs "
  + "and not tiered here would belong to no class at all");

/* ================================================================== *
 * R. THE RULINGS THE TABLE ENCODES
 * ================================================================== *
 *
 * Four spot rules, each recorded in the module as a decision rather than
 * a mechanism, and each therefore unable to be re-derived if it broke.
 */

{
  const bard = profileFor("Bard");
  equal("R1 A BARD GETS NO LEATHER HELMET", isProficientWith(bard, byName("Leather Helmet")), false,
    "\"Helmets block ethereal spellcasting\" (Graham) — encoded as an exclusion, and this "
    + "is the only thing that would notice it silently lapsing");
  equal("R1b BUT DOES GET THE REST OF THE LIGHT TIER",
    isProficientWith(bard, byName("Leather Greaves")) && isProficientWith(bard, byName("Leather Bracers")),
    true, "so R1 is an exclusion and not a missing tier");
  equal("R1c AND NOTHING FROM THE MEDIUM TIER",
    isProficientWith(bard, byName("Metal Helmet")), false);
}

{
  const druid = profileFor("Druid");
  equal("R2 A DRUID MAY USE A WOODEN SHIELD",
    isProficientWith(druid, byName("Light Wooden Shield")), true);
  equal("R2b AND A BONE ONE", isProficientWith(druid, byName("Klar - Bone")), true,
    "the name carries an en dash in the packs and a hyphen elsewhere — nameKey is what "
    + "makes that not matter");
  equal("R2c BUT NOT A STEEL ONE", isProficientWith(druid, byName("Heavy Steel Shield")), false,
    "\"any non-metal armour or shield\" — the printed sentence, encoded as a name list");
}

{
  const beast = profileFor("Beast (Creature Class)");
  equal("R3 A BEAST IS PROFICIENT WITH NO ARMOUR",
    isProficientWith(beast, byName("Leather Helmet")), false);
  equal("R3b NOR ANY SHIELD", isProficientWith(beast, byName("Light Wooden Shield")), false,
    "\"A beast is not proficient with any armour or shields\" — its printed sentence");
}

{
  const fighter = profileFor("Fighter");
  equal("R4 A FIGHTER REACHES THE HEAVY TIER",
    isProficientWith(fighter, byName("Full Helmet")) && isProficientWith(fighter, byName("Metal Greaves")),
    true, "the three Rigid pieces nobody but an all-armour class gets");
}

/* R5 IS THE ONE THE MUTATION RUNNER ASKED FOR. Killing the armourNames
 * branch outright — every "named specifically" grant in the table gone —
 * changed nothing that any check noticed, because sections C and N ask
 * whether the names RESOLVE and never whether they GRANT.
 *
 * The Ranger is the clean case: it prints "non-metal light armour,
 * medium armour and shields" and carries `armourCategories: ["Light"]`,
 * so the whole of its medium armour arrives through DRUIDIC_MEDIUM by
 * name. Four of the six medium armours in the packs; the two it does not
 * get are the metal ones, which is the printed sentence exactly. */
{
  const ranger = profileFor("Ranger");
  const medium = gear.filter((i) => i.type === "armour"
    && String(i.system?.category ?? "") === "Medium");
  const worn = medium.filter((i) => isProficientWith(ranger, i)).map((i) => i.name).sort();
  ok("R5 A RANGER'S MEDIUM ARMOUR ARRIVES BY NAME, NOT BY CATEGORY",
    worn.length > 0 && worn.length < medium.length,
    `${worn.length} of ${medium.length} medium armours — all of them would mean the `
    + "category was granted after all, none would mean the named grants stopped working");
  /* THIS ASSERTED TWO NAMES UNTIL THE PACK WALK FOUND FOUR. Elven
   * Chainmail and Air Drake Armour joined Chain and Full Chainmail the
   * moment `specific-items` was actually read, and both are correctly
   * denied — both ship `material: "metal"` and the Metal trait. The
   * check was pinned to a population that grows with content, so it now
   * asserts the RULE the printed sentence states instead of the four
   * names that happen to satisfy it today. */
  const isMetal = (i) => String(i.system?.material ?? "").toLowerCase() === "metal"
    || /\bmetal\b/i.test(String(i.system?.traits ?? ""));
  const wrongWay = medium
    .filter((i) => isProficientWith(ranger, i) === isMetal(i))
    .map((i) => `${i.name} (${isMetal(i) ? "metal, granted" : "non-metal, denied"})`).sort();
  equal("R5b AND WHAT SEPARATES THEM IS METAL, WHICH IS WHAT THE SENTENCE SAYS",
    JSON.stringify(wrongWay), JSON.stringify([]),
    "every medium armour the Ranger may wear must be non-metal and every one denied must "
    + "be metal — the only place in this file the table is held to that word, and it now "
    + "covers armour added after it was written");
  ok("R5c AND BOTH SIDES OF THAT ARE POPULATED",
    medium.some((i) => isMetal(i)) && medium.some((i) => !isMetal(i)),
    `${medium.filter(isMetal).length} metal of ${medium.length} medium armours — all or `
    + "none on either side and R5b passes without separating anything");
}

/* ================================================================== *
 * S. THE WHOLE CROSS-PRODUCT, BECAUSE THE MODULE WAS BUILT FOR IT
 * ================================================================== *
 *
 * "so the harness can put all 114 items past all 24 classes without a
 * world" — the module's own header. Nothing had ever done it.
 */

const allClassNames = classItems.filter((c) => classProficiencyEntry(c.name)).map((c) => c.name);
const profiles = new Map(allClassNames.map((n) => [n, profileFor(n)]));

let pairs = 0;
const crashes = [];
const nonBoolean = [];
for (const [name, profile] of profiles) {
  for (const item of gear) {
    pairs += 1;
    try {
      const answer = isProficientWith(profile, item);
      if (typeof answer !== "boolean") nonBoolean.push(`${name} × ${item.name}: ${typeof answer}`);
      proficiencyOf(profile, item);
    } catch (e) {
      crashes.push(`${name} × ${item.name}: ${e.message}`);
    }
  }
}

ok("S0 THE CROSS-PRODUCT IS ACTUALLY LARGE",
  pairs >= 24 * 200,
  `${pairs} (class, item) pairs — far fewer means a pack stopped loading and everything `
  + "below is checking almost nothing");
equal("S1 NO CLASS AND ITEM COMBINATION THROWS",
  JSON.stringify(crashes.slice(0, 5)), JSON.stringify([]),
  `${crashes.length} of ${pairs} pairs threw`);
equal("S2 AND EVERY ANSWER IS A YES OR A NO",
  JSON.stringify(nonBoolean.slice(0, 5)), JSON.stringify([]),
  "an undefined here reads as 'not proficient' at the call site and would apply a -4 "
  + "penalty nobody authored");

/* ── S3: unarmed is universal, which is the one grant nobody prints ── */

const unarmed = gear.find((i) => i.type === "weapon"
  && UNIVERSAL_WEAPON_CATEGORIES.some((c) => nameKey(c) === nameKey(i.system?.category)));
ok("S3 THE UNIVERSAL WEAPON CATEGORY EXISTS IN THE PACKS",
  Boolean(unarmed),
  `${JSON.stringify(UNIVERSAL_WEAPON_CATEGORIES)} matched no pack weapon — the constant is `
  + "granted to every profile ever built, so a category nothing uses is a silent no-op");
if (unarmed) {
  const deniers = [...profiles].filter(([, p]) => !isProficientWith(p, unarmed)).map(([n]) => n);
  equal("S3b AND EVERY CLASS HAS IT", JSON.stringify(deniers), JSON.stringify([]),
    "UNIVERSAL_WEAPON_CATEGORIES seeds every profile at construction; a class missing it "
    + "means the seed stopped being applied");
}

/* ── S4: WHO IS PROFICIENT WITH NO ARMOUR AT ALL ──────────────────
 *
 * MY FIRST VERSION OF THIS ASSERTED THAT ONLY CREATURE CLASSES CAN BE,
 * AND IT WAS WRONG ON ITS FIRST RUN: the Wizard prints "You are not
 * proficient in any armour", which is the rule working, not a table
 * entry that lost its categories.
 *
 * The second idea was to read the printed sentence for it. That fails
 * too, and measurably: five of the nine say so outright ("no armour
 * proficiency", "and no armour") while four say it by omission ("an Ooze
 * creature is proficient with natural weapons only"). Deciding between
 * those needs a parser whose mistakes would look exactly like the
 * defects it was hunting — the reason section C does not diff prose.
 *
 * SO THE POPULATION IS PINNED BY NAME. It is nine, it is listed, and a
 * tenth is a class somebody should look at rather than a rule this file
 * can settle on its own. */

const armourItems = gear.filter((i) => i.type === "armour");
const noArmour = [...profiles]
  .filter(([, p]) => !armourItems.some((i) => isProficientWith(p, i)))
  .map(([n]) => n).sort();

equal("S4 NINE CLASSES ARE PROFICIENT WITH NO ARMOUR, AND THESE ARE THEY",
  JSON.stringify(noArmour),
  JSON.stringify(["Aberration (Creature Class)", "Animal (Creature Class)",
    "Beast (Creature Class)", "Caster (Creature Class)", "Construct (Creature Class)",
    "Ooze (Creature Class)", "Plant (Creature Class)", "Undead (Creature Class)",
    "Wizard"]),
  "the Wizard is the only PLAYER class here and belongs — \"You are not proficient in "
  + "any armour\". A tenth name is either a new creature class or a table entry that "
  + "lost its categories, and the two are not distinguishable from here");

/* ── S5: THE TOWER SHIELD IS THE ONE PLACE PROSE IS DECIDABLE ─────
 *
 * I expected to have to pin this one too, and measuring said otherwise.
 * The tower shield is opt-in: five classes take a shield list that stops
 * at heavy. The two that reach tower — Fighter and Tough — are exactly
 * the two whose printed sentence carries the parenthetical "(including
 * tower shields)", and the five that do not, do not.
 *
 * That is a substring, not a parser, so it is checkable in both
 * directions and it is the only place in this file where the table is
 * held against its own prose.
 *
 * THE CRUSADER QUESTION WENT TO GRAHAM AND CAME BACK RULED, 9 Sep 2026:
 * "Crusader does not have proficiency with Tower Shield, only the
 * fighter core class does." The data already implemented it, so 3.535.1
 * changes no behaviour — it moves the fact out of a reading of prose and
 * into R6 below, where it is a ruling with a name on it.
 *
 * NOTE THE WORD *CORE*. Tough is a creature class, not a core class, and
 * it keeps its tower shield — its printed sentence carries the same
 * "(including tower shields)" the Fighter's does. So S5b (the coupling)
 * and R6 (the ruling) assert different things and both are true: the
 * coupling covers all 24 classes, the ruling covers the 8 core ones. */

const towerShield = gear.find((i) => i.type === "shield"
  && String(i.system?.category ?? "").toLowerCase() === "tower");

ok("S5a THERE IS A TOWER SHIELD IN THE PACKS TO BE PROFICIENT WITH",
  Boolean(towerShield),
  "without one every class below is trivially not proficient with it and S5b passes on "
  + "an empty question");

const towerCapable = [...profiles]
  .filter(([, p]) => towerShield && isProficientWith(p, towerShield))
  .map(([n]) => n).sort();
const towerPrinted = classItems
  .filter((c) => /tower/i.test(String(c.system?.proficiencies ?? "")))
  .map((c) => c.name).sort();

equal("S5b A CLASS USES A TOWER SHIELD EXACTLY WHEN ITS SENTENCE SAYS SO",
  JSON.stringify(towerCapable), JSON.stringify(towerPrinted),
  "the printed lists and the table disagree about who may raise a tower shield, and "
  + "whichever side is wrong the player and the roll are reading different rules");

ok("S5c AND IT IS OPT-IN RATHER THAN UNIVERSAL",
  towerCapable.length > 0 && towerCapable.length < profiles.size,
  `${towerCapable.length} of ${profiles.size} classes — all or none would mean the `
  + "category had stopped distinguishing anything, and S5b would still pass");

/* ── R6: GRAHAM'S RULING, PINNED BY NAME ──────────────────────────
 *
 * S5b would still pass if somebody added the parenthetical to the
 * Crusader's printed sentence — the coupling would simply follow. This
 * does not follow. It is the ruling itself, and it is the check that has
 * to be argued with rather than satisfied. */

const CORE = new Set(Object.keys(CLASS_PROFICIENCY));
const coreWithTower = [...profiles]
  .filter(([n]) => CORE.has(classProficiencyEntry(n)?.key))
  .filter(([, p]) => towerShield && isProficientWith(p, towerShield))
  .map(([n]) => n).sort();

equal("R6 THE FIGHTER IS THE ONLY CORE CLASS WITH A TOWER SHIELD",
  JSON.stringify(coreWithTower), JSON.stringify(["Fighter"]),
  "Graham, 9 Sep 2026: \"Crusader does not have proficiency with Tower Shield, only "
  + "the fighter core class does.\" Creature classes are outside this ruling — Tough "
  + "has one and keeps it");

equal("R6b AND THE CRUSADER IS REFUSED BY NAME",
  proficiencyOf(profileFor("Crusader"), towerShield).proficient, false,
  "the class this ruling was actually about, asked directly rather than inferred from "
  + "a set that happens not to contain it");


/* ================================================================== *
 * F. TWO GRANTS THE PACKS CANNOT REACH, RUN AGAINST FIXTURES
 * ================================================================== *
 *
 * MEASURED, AND IT IS WHY THIS SECTION EXISTS: no weapon in any pack
 * carries the Alchemical group, and none carries an Ancient Echoes rune.
 * So the cross-product never once reaches the group branch or the rune
 * waiver. Deleting either from the module changed no answer anywhere and
 * the whole file passed, twice, until the mutation runner said so.
 *
 * I FIRST WROTE THAT AS "no pack weapon carries a rune", AND IT WAS
 * WRONG — measured against the seven packs 3.535.0 was reading, not the
 * system. Five runed weapons existed the whole time, in packs the
 * hardcoded list omitted. Re-measured across every pack: 145 gear items,
 * 13 of them runed, and still zero Ancient Echoes and zero Alchemical.
 * The fixtures were right; the sentence justifying them was not.
 *
 * The fixtures below are synthetic items, and they run THE SAME
 * `proficiencyOf` the pack scan runs. That is the distinction that
 * matters: this is not a second implementation of the rule agreeing with
 * itself, it is the real predicate asked a question the packs cannot ask
 * it yet.
 *
 * WHEN AN ALCHEMICAL WEAPON OR A RUNED ONE IS ADDED TO THE PACKS, these
 * stay. A fixture that became redundant is cheaper than a branch that
 * goes back to being unreachable the next time the pack changes. */

{
  /* THE ALCHEMIST IS A FEAT, NOT A CLASS — I built this fixture from a
   * class named "Alchemist" first and it granted nothing, because no
   * such class exists. Which makes the control exact: the same character
   * with the feat and without it, differing in one item. */
  const withFeat = proficiencyProfile({ items: [
    { type: "class", name: "Wizard", system: {} },
    { type: "feat", name: "Alchemist", system: {} }] });
  const without = profileFor("Wizard");
  const bomb = { type: "weapon", name: "Fixture Bomb",
    system: { category: "Exotic", group: "Alchemical" } };

  equal("F1 THE ALCHEMIST FEAT REACHES AN ALCHEMICAL WEAPON",
    isProficientWith(withFeat, bomb), true,
    "this feat grants a weapon GROUP and nothing else in either table does; no pack "
    + "weapon carries the group, so this branch is otherwise never executed");
  equal("F1b AND THE SAME CHARACTER WITHOUT THE FEAT IS REFUSED",
    isProficientWith(without, bomb), false,
    "one item apart — if this came out true the fixture would be proving nothing "
    + "about the grant");
  equal("F1c AND THE ANSWER SAYS WHICH RULE ANSWERED",
    proficiencyOf(withFeat, bomb).why, "proficiency with the Alchemical group",
    "the sheet and the attack card both print this sentence");
  ok("F1d AND THE VIAL HELPER AGREES WITH THE PREDICATE",
    isProficientWithAlchemical(withFeat) === true
    && isProficientWithAlchemical(without) === false,
    "the vial workflow asks this shortcut instead of building an item, and the two "
    + "answering differently is a character who may throw a vial but not the weapon "
    + "it becomes");

  const runed = { type: "weapon", name: "Fixture Greatpick",
    system: { category: "Martial", runes: "ancientEchoes" } };
  const plain = { type: "weapon", name: "Fixture Greatpick",
    system: { category: "Martial", runes: "" } };

  equal("F2 AN ANCIENT ECHOES RUNE WAIVES THE PROFICIENCY",
    isProficientWith(without, runed), true,
    "\"You need no proficiency to use a weapon inscribed with this rune\" — no pack "
    + "weapon carries one, so nothing else in this file executes the waiver");
  equal("F2b AND THE SAME WEAPON WITHOUT IT IS STILL REFUSED",
    isProficientWith(without, plain), false,
    "without this pair F2 would pass just as well on a module that had stopped "
    + "refusing anybody anything");
  equal("F2c AND A CHARACTER WHO WAS ALREADY PROFICIENT KEEPS THEIR OWN REASON",
    proficiencyOf(profileFor("Fighter"), runed).why, "martial weapon proficiency",
    "the module asks the rune LAST for exactly this reason — it makes proficiency "
    + "unnecessary, it does not grant it, and the card should not credit the rune for "
    + "a Fighter's own training");
}

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-proficiency: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-proficiency: OK — ${checks} checks over ${pairs} (class, item) pairs. `
  + "Every class has an entry, every name is a real item, and the rulings still hold.\n");
