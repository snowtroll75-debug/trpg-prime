#!/usr/bin/env node
/** mutate-spell-armour-display — the mutation half of verify-spell-armour-display. NEW at 3.684.9. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const DM = path.join(SYSTEM_ROOT, "module", "combat", "damage.mjs");
const SH = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const MUTATIONS = [
  { name: "THE DEFECT: the total reads worn armour only", file: DM, from: "  return Math.max(effectiveDR(armourDr, bdb), nonNegative(baseArmourDr))", to: "  return effectiveDR(armourDr, bdb)", breaks: "D1" },
  { name: "the magical armour adds to worn armour", file: DM, from: "  return Math.max(effectiveDR(armourDr, bdb), nonNegative(baseArmourDr))", to: "  return effectiveDR(armourDr, bdb) + nonNegative(baseArmourDr)", breaks: "D1/D1b" },
  { name: "THE DEFECT: the sheet does not pass it", file: SH, from: "      baseArmourDr: system.combat?.bracers?.effective ?? 0\n", to: "", breaks: "D2" },
  { name: "the sheet passes the unscaled Base DR", file: SH, from: "      baseArmourDr: system.combat?.bracers?.effective ?? 0\n", to: "      baseArmourDr: system.combat?.bracers?.dr ?? 0\n", breaks: "D2" },
  { name: "the Combat tab loses the row", file: HBS, from: "            {{#if system.combat.bracers.itemName}}\n            <label>\n              <span>{{system.combat.bracers.itemName}} DR</span>", to: "            {{#if false}}\n            <label>\n              <span>{{system.combat.bracers.itemName}} DR</span>", breaks: "D3" },
  { name: "the row shows the unscaled Base DR", file: HBS, from: "{{#if system.combat.bracers.inert}} — inert, returning within the hour{{/if}}.\">{{system.combat.bracers.effective}}</output>", to: "{{#if system.combat.bracers.inert}} — inert, returning within the hour{{/if}}.\">{{system.combat.bracers.dr}}</output>", breaks: "D3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-spell-armour-display.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-spell-armour-display: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-spell-armour-display: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-spell-armour-display: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
