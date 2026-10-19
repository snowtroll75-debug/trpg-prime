#!/usr/bin/env node
/**
 * verify-ff30-block14 — 3.644.0, Fiends & Fables 3.0 block 14 (the Druharr
 * to the Mammoth; Graham, 14 October 2026: "Please go with all
 * recommendations"):
 *   R4  Molten Blood — the damage-back rail's `criticalOnly`
 *   R5  Aura of Ashes — ally-aura effects lay `statuses` (Concealed)
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (p) => import(new URL(`../module/${p}`, import.meta.url));
const TH = await imp("magic/thorns.mjs");
const AL = await imp("ally-aura-effects.mjs");
const src = { at: read("module", "combat", "attack-workflow.mjs") };

const molten = TH.normaliseThorns({ label: "Molten Blood", damage: "2d6", damageType: "fire", reachFeet: 5, save: { key: "reflex", dc: 18 }, criticalOnly: true });
const slime = TH.normaliseThorns({ label: "Reactive Slime", damage: "2d6", damageType: "acid", reachFeet: 5 });
equal("M1 critical-only is read; others are not", [molten?.criticalOnly, slime?.criticalOnly], [true, false]);
const blow = { hit: true, melee: true, distanceFeet: 5 };
equal("M2 Molten Blood fires on a critical melee blow only; the slime on any; a ranged critical never",
  [TH.thornsTriggered(molten, { ...blow, critical: true }), TH.thornsTriggered(molten, blow), TH.thornsTriggered(slime, blow), TH.thornsTriggered(molten, { ...blow, melee: false, critical: true })], [true, false, true, false]);
ok("M3 the Strike tells the rail whether the blow was a critical", /distanceFeet: meleeDistance,\n      critical: Boolean\(critical\)\n    \}\)\) \{/.test(src.at));

const ashes = AL.allyEffectOf({ statuses: ["Concealed"] });
equal("A1 a statuses-only effect is an effect, its status lower-cased", ashes, { changes: [], conditionals: [], defenceDC: [], versusDamage: null, warpFreeSchool: null, statuses: ["concealed"] });
equal("A2 the grant carries the status; an effect without one carries none",
  [AL.allyGrantEffectData({ key: "y:ashes", aura: { name: "Aura of Ashes", allyEffect: ashes }, emitter: { name: "Yulussil" } }).statuses, "statuses" in AL.allyGrantEffectData({ key: "m:cmd", aura: { name: "Aura of Command", allyEffect: AL.allyEffectOf({ changes: [{ key: "system.combat.attack.circumstance", value: "1" }] }) }, emitter: { name: "Marilith" } })],
  [["concealed"], false]);

const EXPECTED = 6;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block14: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block14: ${checks} checks — all green.`);
