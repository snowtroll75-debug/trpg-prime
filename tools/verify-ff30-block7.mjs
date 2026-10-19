#!/usr/bin/env node
/**
 * verify-ff30-block7 — 3.637.1, Fiends & Fables 3.0 block 7 (Bears to Boar),
 * found live: a creature's own missile (the Flame Beetle's Fire Mote) is
 * ranged without drawing ammunition.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const am = await import(new URL("../module/combat/ammunition.mjs", import.meta.url));

equal("A1 a bow draws ammunition; a natural missile, a thrown weapon and a sword do not", [
  am.weaponUsesAmmunition({ attackMode: "missile", category: "Martial" }),
  am.weaponUsesAmmunition({ attackMode: "missile", category: "Natural" }),
  am.weaponUsesAmmunition({ attackMode: "missile", category: " natural " }),
  am.weaponUsesAmmunition({ attackMode: "thrown", category: "Simple" }),
  am.weaponUsesAmmunition({ attackMode: "melee", category: "Martial" })
], [true, false, false, false, false]);
equal("A2 so a natural missile offers no rounds even when the creature carries some", am.usableAmmunition([{ type: "ammunition", system: { quantity: 10 } }], { attackMode: "missile", category: "Natural" }), []);
ok("B1 the attack asks for ammunition only through the rule", /const ammoChoice = await selectAmmunition\(actor, weapon,/.test(read("module", "combat", "attack-workflow.mjs")) && /if \(!weaponUsesAmmunition\(weapon\?\.system\)\) return none;/.test(read("module", "combat", "ammunition-workflow.mjs")));

const EXPECTED = 4;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block7: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block7: ${checks} checks — all green.`);
