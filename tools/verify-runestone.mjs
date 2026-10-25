#!/usr/bin/env node
/**
 * verify-runestone — 3.666.2: the Runestone in the gear pack (Graham,
 * 22 October 2026). See module/runestone.mjs.
 *
 *   A  the pack item is the printed entry: Magical, level 1, 80 gp, held in
 *      1 hand, 1 lb, the text verbatim, and it says it is a runestone
 *   B  one rune at a time; a cracked stone takes no new rune
 *   C  the rune's school and tradition traits, read from the catalogue
 *   D  the stone gains them, and loses them when the rune leaves
 *   E  wired: the item's create and update, and the sheet's panel
 *   F  and Transfer Runes already treats it as a runestone: a source with no
 *      between-items +5, never a target, and a stored rune never counts
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

const rs = await mod("runestone.mjs");
const rt = await mod("rune-transfer.mjs");
const rb = await mod("rune-bearing.mjs");

/* A */
let packed = null;
const gearDir = path.join(SYSTEM_ROOT, "packs", "gear");
if (fs.existsSync(gearDir)) {
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(gearDir, { valueEncoding: "json" });
  await db.open();
  for await (const [key, value] of db.iterator()) if (key.startsWith("!items!") && value?.name === "Runestone") packed = value;
  await db.close();
}
const sy = packed?.system ?? {};
equal("A1 the gear pack carries a Runestone: Magical, level 1, 80 gp, held in 1 hand, 1 lb, with the goods",
  [packed?.type, sy.traits, sy.itemLevel, sy.price, sy.heldHands, sy.weight, sy.gearCategory], ["gear", "Magical", 1, 80, 1, 1, "Goods"]);
ok("A2 its text is the printed entry, verbatim",
  String(sy.description).includes("This smooth, granite like stone seems to reflect light and is etched with strange circular patterns. Its natural form makes it the perfect conduit for storing magic and be used to store magical runes.")
  && String(sy.description).includes("You can inscribe only one rune upon the stone at any one time. Once the stone is etched, it gains the school and tradition traits of the rune etched upon it. When a rune is transferred from the runestone to another object, the runestone loses these traits.")
  && String(sy.description).includes("If a rune has been inscribed onto a Runestone it may be transferred to an item at a later date. This process incurs no cost but requires a successful Transfer Runes check (see Chapter 4).")
  // "Crafting" was a slip (Graham, 22 October 2026): the action is a magical skill's.
  && !/Transfer Runes Crafting/.test(String(sy.description)));
equal("A3 it declares itself a runestone, holds no rune yet, and is a runestone by the rule Transfer Runes asks",
  [packed?.flags?.["trg-prime"]?.runestone, sy.runes, rt.isRunestone(packed ?? {})], [true, "", true]);

/* B */
equal("B1 one rune may be stored; a second is refused",
  [rs.runestoneRefusal({ after: "Flaming I" }), rs.runestoneRefusal({ after: "Flaming I, Frost I" })], [null, "a runestone holds only one rune at a time"]);
equal("B2 a spell effect's own comma is not a second rune",
  rs.runestoneRefusal({ after: "Spell Effect (Fireball, 3/day)" }), null);
equal("B3 a cracked stone takes no new rune, but may give up the one it holds",
  [rs.runestoneRefusal({ before: "", after: "Flaming I", cracked: true }), rs.runestoneRefusal({ before: "Flaming I", after: "", cracked: true }), rs.runestoneRefusal({ before: "Flaming I", after: "Flaming I", cracked: true })],
  ["this runestone is cracked and can never store a rune again", null, null]);

/* C */
equal("C1 a rune's school (Flaming: Invocation; Reflecting: Warding)", [rs.runeSchoolAndTradition("Flaming II"), rs.runeSchoolAndTradition("Reflecting")], [["Invocation"], ["Warding"]]);
equal("C2 and its tradition (Wildform: Alteration and Verdant); never its other traits",
  rs.runeSchoolAndTradition("Wildform IV"), ["Alteration", "Verdant"]);
equal("C3 a parameter is not part of the name; a rune nobody knows lends nothing",
  [rs.runeSchoolAndTradition("Spell Effect (Fireball, 3/day)"), rs.runeSchoolAndTradition("Nonsense II")], [["Alteration"], []]);
const api = await mod("module-api.mjs");
api.registerRunes?.([{ key: "testglyph", name: "Test Glyph", traits: "Invested, Soul, Divinity", on: ["weapon"], tiers: [{ tier: 1, numeral: "I", price: 1 }] }], "verify-runestone");
equal("C4 a companion module's registered rune lends its traits too", rs.runeSchoolAndTradition("Test Glyph I"), ["Soul", "Divinity"]);

/* D */
equal("D1 etched: the stone gains the rune's school and tradition, beside its own Magical",
  rs.runestoneTraits("Magical", [], ["Alteration", "Verdant"]), "Magical, Alteration, Verdant");
equal("D2 transferred off: it loses them; a trait a GM typed stays",
  rs.runestoneTraits("Magical, Alteration, Verdant, Fragile", ["Alteration", "Verdant"], []), "Magical, Fragile");
equal("D3 a new rune replaces the old rune's traits, and a trait already there is not doubled",
  rs.runestoneTraits("Magical, Invocation", ["Invocation"], ["Warding", "Magical"]), "Magical, Warding");
const stone = (runes, traits = "Magical", added = []) => ({ type: "gear", name: "Runestone", system: { runes, traits }, flags: { "trg-prime": { runestone: true, runestoneTraits: added } } });
equal("D4 the update a stone needs as a rune is etched, and as it is transferred off",
  [rs.runestoneTraitsUpdate(stone(""), "Flaming I"), rs.runestoneTraitsUpdate(stone("Flaming I", "Magical, Invocation", ["Invocation"]), "")],
  [{ traits: "Magical, Invocation", added: ["Invocation"] }, { traits: "Magical", added: [] }]);
equal("D5 nothing for a stone whose traits already match, or for anything that is not a runestone",
  [rs.runestoneTraitsUpdate(stone("Flaming I", "Magical, Invocation", ["Invocation"]), "Flaming II"), rs.runestoneTraitsUpdate({ type: "weapon", name: "Sword", system: {}, flags: {} }, "Flaming I")],
  [null, null]);
equal("D6 traits typed in the same change are the ones the rune's are added to",
  rs.runestoneTraitsUpdate(stone(""), "Flaming I", "Magical, Heavy"), { traits: "Magical, Heavy, Invocation", added: ["Invocation"] });

/* E */
const itemSrc = read("module", "documents", "item.mjs");
ok("E1 an update to a runestone's rune is refused with its reason, or carries the traits and the record with it",
  /if \(changed\?\.system\?\.runes !== undefined\) \{\s*if \(this\._refusedAsRunestone\(changed\.system\.runes, this\.system\?\.runes \?\? ""\)\) return false;\s*const stone = runestoneTraitsUpdate\(this, changed\.system\.runes, changed\.system\.traits\);\s*if \(stone\) \{\s*foundry\.utils\.setProperty\(changed, "system\.traits", stone\.traits\);\s*foundry\.utils\.setProperty\(changed, `flags\.\$\{SYSTEM_ID\}\.\$\{RUNESTONE_TRAITS_FLAG\}`, stone\.added\);/.test(itemSrc));
ok("E2 a stone created with a rune on it is refused or given its traits the same way",
  /if \(this\._refusedAsRunestone\(this\.system\?\.runes \?\? "", ""\)\) return false;\s*const stone = runestoneTraitsUpdate\(this, this\.system\?\.runes \?\? ""\);\s*if \(stone\) \{\s*this\.updateSource\(/.test(itemSrc));
ok("E3 the refusal asks the shared rule, with the stone's crack, and says why",
  /_refusedAsRunestone\(after, before\) \{\s*if \(this\.type !== "gear" \|\| !isRunestone\(this\)\) return false;\s*const reason = runestoneRefusal\(\{ after, before, cracked: isCracked\(this\) \}\);\s*if \(!reason\) return false;\s*ui\.notifications\?\.warn\?\./.test(itemSrc));
const sheet = read("module", "sheets", "item-sheet.mjs");
const hbs = read("templates", "item", "item-sheet.hbs");
ok("E4 the sheet shows a Runestone panel for a runestone, with its stored rune, the traits it lends, and its crack",
  /context\.runestone = context\.isGear && isRunestone\(this\.item\)/.test(sheet)
  && /\{\{#if runestone\}\}[\s\S]{0,200}<h2>Runestone<\/h2>[\s\S]{0,200}name="system\.runes"[\s\S]{0,120}\{\{#if runestone\.cracked\}\}disabled\{\{\/if\}\}/.test(hbs)
  && /\{\{#if runestone\.traitsLabel\}\}/.test(hbs));

/* F */
const packedStone = { ...packed, id: "s", system: { ...sy, runes: "Flaming I" } };
const sword = { id: "w", type: "weapon", name: "Longsword", system: { runes: "" } };
equal("F1 a stored rune can be transferred off it as from a runestone: no between-items +5",
  [rt.transferSources([packedStone, sword]).map((s) => [s.item.name, s.kind, s.entries]), rt.transferDCIncrease({ source: rt.sourceKind(packedStone) })],
  [[["Runestone", "runestone", ["Flaming I"]]], 0]);
equal("F2 a stone already holding a rune is not a target, and its rune never counts for whoever carries it",
  [rt.transferTargets([packedStone, sword]).map((i) => i.name), rb.runesCountFor({ ...packedStone, system: { ...packedStone.system, equipped: true } }, [])],
  [["Longsword"], false]);
// GRAHAM, 22 OCTOBER 2026: "A rune can be transferred onto a runestone from an item."
const emptyStone = { ...packed, id: "e", system: { ...sy, runes: "" } };
const crackedStone = { ...packed, id: "c", system: { ...sy, runes: "" }, flags: { "trg-prime": { runestone: true, runestoneCracked: true } } };
const runedSword = { id: "r", type: "weapon", name: "Flame Tongue", system: { runes: "Potency I, Flaming I" } };
equal("F4 an EMPTY runestone is offered as a target; a cracked one never is",
  rt.transferTargets([emptyStone, crackedStone, packedStone, runedSword], { exclude: runedSword }).map((i) => i.id), ["e"]);
equal("F5 off an item onto a stone is the between-items transfer (+5), and the stone takes the rune's traits",
  [rt.sourceKind(runedSword), rt.transferDCIncrease({ source: rt.sourceKind(runedSword) }), rs.runestoneTraitsUpdate(emptyStone, "Flaming I")],
  ["item", 5, { traits: "Magical, Invocation", added: ["Invocation"] }]);
equal("F3 a Partial cracks it; a Failure loses it", [rt.transferOutcome("partial").crackSource, rt.transferOutcome("failure").destroySource], [true, true]);

const EXPECTED = 26;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-runestone: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-runestone: ${checks} checks — all green.`);
