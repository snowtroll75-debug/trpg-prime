#!/usr/bin/env node
/**
 * verify-ff30-block35 — 3.663.4, Fiends & Fables 3.0 block 35 (the Wraith,
 * Wysp and Xort). The module needed no core change; the live test found one.
 *
 *   F1   the Plant creature type is Plant Resistance: a critical injury on a
 *        plant keeps its damage, bleed and recurring results, and offers the
 *        rest to the GM's anatomy call
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const R = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "creature-ability-rules.mjs")).href);
const plantType = { type: "creature-type", name: "Plant", system: { critOnlyDamage: true } };
const undeadType = { type: "creature-type", name: "Undead", system: { critOnlyDamage: false } };
const declared = { type: "ability", name: "Plant Resistance", flags: { "trg-prime": { creatureAbility: { derives: { plantResistance: true } } } } };
equal("F1 the Plant type alone is Plant Resistance; another type is not; the declared ability still is",
  [R.hasPlantResistance([plantType]), R.hasPlantResistance([undeadType]), R.hasPlantResistance([declared]), R.hasPlantResistance([]), R.hasPlantResistance([{ type: "ability", name: "x", system: { critOnlyDamage: true } }])],
  [true, false, true, false, false]);
equal("F1b the split keeps bleeding and recurring, and offers the rest",
  (({ keep, gm }) => [keep.map((t) => t.key), gm.map((t) => t.key)])(R.plantResistanceSplit([{ key: "bleeding", value: 2 }, { key: "stunned", value: 1 }, { key: "recurringFire", recurring: true }, { key: "prone" }])),
  [["bleeding", "recurringFire"], ["stunned", "prone"]]);
const EXPECTED = 3;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block35: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block35: ${checks} checks\n  all pass\n`);
