#!/usr/bin/env node
/**
 * verify-ff30-block13 — 3.643.0, Fiends & Fables 3.0 block 13 (the Draeglir,
 * drakes and dogs; Graham, 14 October 2026: "Please go with your
 * recommendations"). R6: Xithra and Screech — a weapon struck only through
 * its ability (`viaAbility`), the ability's `weaponStrike` action counting
 * its Focus and AP, and a weapon's own alternate damage types.
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
const R = await imp("codex-action-rules.mjs");
const ST = await imp("combat/strike-type-options.mjs");
const src = { at: read("module", "combat", "attack-workflow.mjs"), cx: read("module", "codex-actions-workflow.mjs") };

const xithra = { type: "weapon", name: "Xithra", system: { damageType: "force" }, flags: { "trg-prime": { viaAbility: "Xithra", strikeTypes: ["mental"] } } };
const claw = { type: "weapon", name: "Claw", system: { damageType: "slashing" }, flags: {} };
equal("X1 an ability's weapon is refused when struck directly, and not through its ability; a plain weapon never is",
  [R.weaponStrikeRefused(xithra), R.weaponStrikeRefused(xithra, true), R.weaponStrikeRefused(claw)], ["Xithra", "", ""]);
equal("X2 the action finds its weapon by name, whatever the case; a missing one is null",
  [R.weaponStrikeWeapon([claw, xithra], { weapon: "XITHRA" })?.name, R.weaponStrikeWeapon([claw], { weapon: "Xithra" }), R.weaponStrikeWeapon([{ type: "ability", name: "Xithra" }], { weapon: "Xithra" })], ["Xithra", null, null]);
equal("X3 force or mental: the weapon's own types are offered beside its damage type; a plain weapon offers none",
  [ST.strikeTypeChoices(xithra.system, ST.weaponStrikeTypeOptions(xithra)).map((c) => c.type), ST.weaponStrikeTypeOptions(claw)], [["force", "mental"], []]);
ok("X4 the Strike refuses an ability's weapon before anything else, and asks its types",
  /const viaRefused = weaponStrikeRefused\(weapon, viaAbility\);\n  if \(viaRefused\) \{/.test(src.at) && /\.\.\.weaponStrikeTypeOptions\(weapon\)\];/.test(src.at));
ok("X5 the action counts the use, spends its AP and strikes with the AP paid",
  /if \(counted && left <= 0\) \{ ui\.notifications\?\.warn\(`\$\{item\.name\}: no uses remain/.test(src.cx.slice(src.cx.indexOf("async function weaponStrike")))
  && /rollWeaponAttack\(actor, weapon, \{ apPaid: true, viaAbility: true \}\)/.test(src.cx) && /heldAdvantage, basicAction, weaponStrike(, carrionFeast, sizeShift)?(, strikeBurst, sweepingStrike)?(, toggleEffect)? \}\);/.test(src.cx));

const EXPECTED = 6;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block13: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block13: ${checks} checks — all green.`);
