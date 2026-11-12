#!/usr/bin/env node
/**
 * verify-spell-armour-display — TRG Prime 3.684.9: the sheet's Damage
 * Reduction counts Mage Armour and the Bracers of Armour.
 *
 * Graham, 6 November 2026: "I have just cast a warped Mage Armour spell and
 * did not apply any DR to my character." Measured in his world: the blows
 * WERE reduced (damage-workflow's `Math.max(wornDr, bracersDr)`; a 12-point
 * Greatsword hit was cut by Mage Armour's 6 less Armour Rending's 1), but the
 * sheet's Damage Reduction read worn armour only and showed 0.
 *
 *   D1  totalDamageReduction: the higher of worn armour (after BDB) and the
 *       magical armour's Base DR, never both; Natural and Bonus DR still add
 *   D2  the sheet passes system.combat.bracers.effective, the same figure the
 *       damage workflow reads
 *   D3  the Combat tab shows the magical armour's own row, and the tooltips say
 *       "whichever is higher"
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const dm = await import(new URL("../module/combat/damage.mjs", import.meta.url));
const t = (o) => dm.totalDamageReduction(o);
const worn4bdb0 = dm.effectiveDR(4, 0), worn4bdb6 = dm.effectiveDR(4, 6);
equal("D1 Mage Armour 6 with no armour: 6; with Natural 2 and Bonus 1: 9; worn armour 4 (BDB 0) below it: 6; worn armour above it (BDB 6): the armour's; nothing at all: 0",
  [t({ baseArmourDr: 6 }), t({ baseArmourDr: 6, naturalArmourDr: 2, bonusDr: 1 }), t({ armourDr: 4, bdb: 0, baseArmourDr: 6 }), t({ armourDr: 4, bdb: 6, baseArmourDr: 2 }), t({})],
  [6, 9, Math.max(worn4bdb0, 6), Math.max(worn4bdb6, 2), 0]);
ok("D1b the magical armour never adds to worn armour (the higher, not the sum)", t({ armourDr: 4, bdb: 6, baseArmourDr: 2 }) === worn4bdb6 && worn4bdb6 > 2, `worn ${worn4bdb6}`);
ok("D1c the damage workflow applies the same rule (higher of worn and the bracers' effective DR)",
  /Math\.max\(wornDr, bracersDr\)/.test(read("module", "combat", "damage-workflow.mjs"))
  && /const bracersDr = Number\(targetSystem\?\.combat\?\.bracers\?\.effective \?\? 0\);/.test(read("module", "combat", "damage-workflow.mjs")));

const sheet = read("module", "sheets", "actor-sheet.mjs");
ok("D2 the sheet's total passes the magical armour's effective DR", /context\.totalDR = totalDamageReduction\(\{[\s\S]{0,500}?baseArmourDr: system\.combat\?\.bracers\?\.effective \?\? 0\s*\}\);/.test(sheet));

const hbs = read("templates", "actor", "actor-sheet.hbs");
ok("D3 the Combat tab has the magical armour's row (its name, its effective DR, its pool), shown only when one is in force",
  /\{\{#if system\.combat\.bracers\.itemName\}\}\s*<label>\s*<span>\{\{system\.combat\.bracers\.itemName\}\} DR<\/span>\s*<output data-tooltip="[^"]*\{\{system\.combat\.bracers\.hp\}\}\/\{\{system\.combat\.bracers\.max\}\}[^"]*">\{\{system\.combat\.bracers\.effective\}\}<\/output>/.test(hbs));
ok("D3b both Damage Reduction tooltips say the magical armour counts when higher",
  (hbs.match(/Mage Armour \/ Bracers/g) ?? []).length >= 2);

if (failures.length) {
  process.stdout.write(`verify-spell-armour-display: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-spell-armour-display: OK — ${checks} checks.\n`);
