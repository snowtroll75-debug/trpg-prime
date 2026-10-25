#!/usr/bin/env node
/**
 * verify-heritage-derives — 3.664.0: two creature-ability derives Inner
 * Tempest's heritages declare.
 *
 *   A  heatEnvironmentImmune (Zenki): no Exhaustion check in Extreme Heat
 *   B  breathesWater (Zennyo): no breath to hold
 *   C  a heritage grants natural attacks (Kamiri, Suzume)
 *   D  a flat-check increase scoped to a condition (Ethereal Sight, Zen Awareness)
 *   E  Ghost Touch for magical attacks only (Ethereal Sight)
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const car = await import(new URL("../module/creature-ability-rules.mjs", import.meta.url));
const derives = (name, d) => ({ name, flags: { "trg-prime": { creatureAbility: { derives: d } } } });

const zenki = derives("Zenki", { heatEnvironmentImmune: true });
equal("A1 immune in Extreme Heat, named", car.heatEnvironmentImmunity([zenki], "extremeHeat"), "Zenki");
equal("A2 not in the cold, not without the derive, not for a false one", [car.heatEnvironmentImmunity([zenki], "extremeCold"), car.heatEnvironmentImmunity([], "extremeHeat"), car.heatEnvironmentImmunity([derives("x", { heatEnvironmentImmune: "yes" })], "extremeHeat")], [null, null, null]);
const ew = read("module", "combat", "exhaustion-workflow.mjs");
ok("A3 the Exhaustion check asks first and stops with a card", /const heatImmune = heatEnvironmentImmunity\(Array\.from\(actor\?\.items \?\? \[\]\), environment\);\s*if \(heatImmune\) \{\s*await postCard\([^\n]*\);\s*return null;\s*\}/.test(ew));

const zennyo = derives("Zennyo", { breathesWater: true });
equal("B1 breathes water, named", car.breathesWaterSource([{ name: "Sword" }, zennyo]), "Zennyo");
equal("B2 nothing declared, nothing claimed", [car.breathesWaterSource([]), car.breathesWaterSource([derives("x", { breathesWater: 1 })])], [null, null]);
ok("B3 holding breath asks after the marker", /const amphibious = breathesWaterSource\(Array\.from\(actor\?\.items \?\? \[\]\)\);\s*if \(amphibious\) \{\s*await card\([^\n]*\);\s*return 0;\s*\}/.test(read("module", "drowning-workflow.mjs")));

const gw = read("module", "grants-workflow.mjs");
const heritageBlock = /\n  heritage: \[([\s\S]*?)\n  \],/.exec(gw)?.[1] ?? "";
ok("C1 a heritage's grantedWeapons are resolved from the companions pack", /\{ field: "grantedWeapons", pack: "companions" \}/.test(heritageBlock));
equal("C2 the heritage template carries the field", JSON.parse(read("template.json")).Item.heritage.grantedWeapons, "");

const atk = await import(new URL("../module/combat/attack.mjs", import.meta.url));
equal("D1 a scoped increase reaches only the conditions it names, without case", [atk.missCheckIncreaseFor({ value: 2, conditions: ["hidden"] }, "Hidden"), atk.missCheckIncreaseFor({ value: 2, conditions: ["hidden"] }, "Concealed"), atk.missCheckIncreaseFor({ value: 1, conditions: ["hidden", "invisible"] }, "Invisible")], [2, 0, 1]);
equal("D2 a bare number reaches every condition (Osp-Iar); nonsense adds nothing", [atk.missCheckIncreaseFor(2, "Concealed"), atk.missCheckIncreaseFor({ value: 3 }, "Concealed"), atk.missCheckIncreaseFor("x", "Hidden"), atk.missCheckIncreaseFor({ value: -2 }, "Hidden"), atk.missCheckIncreaseFor(undefined, "Hidden")], [2, 3, 0, 0, 0]);
const tg = read("module", "combat", "targeting.mjs");
ok("D3 the avoidance check names the condition first, then asks each declaration", /const condition = invisibleDC === baseDC && invisibleDC !== null[\s\S]{0,200}const attackerIncrease = [\s\S]{0,160}missCheckIncreaseFor\(e\.getFlag\?\.\("trg-prime", "missCheckDCIncrease"\), condition\)/.test(tg));
const aw = read("module", "combat", "attack-workflow.mjs");
ok("E1 Ghost Touch on the attacker can be limited to magical strikes", /if \(raw\.magicalOnly === true && !magical\) continue;/.test(aw) && /\|\| actorGhostTouch\(actor, \{ magical: strikeIsMagical \}\)/.test(aw));

const EXPECTED = 13;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-heritage-derives: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-heritage-derives: ${checks} checks — all green.`);
