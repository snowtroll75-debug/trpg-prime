#!/usr/bin/env node
/**
 * mutate-ff30-block5 — the mutation half of verify-ff30-block5 (3.635.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const PR = m("proficiency-rules.mjs"), DAS = m("combat", "declared-after-strikes.mjs"), WF = m("combat", "declared-after-strikes-workflow.mjs");
const ATTACK = m("combat", "attack-workflow.mjs"), ACT = m("creature-activation-workflow.mjs");

const MUTATIONS = [
  { name: "the stat-block mark is ignored", file: PR, from: "  if (type === \"weapon\" && item?.flags?.[SYSTEM_ID]?.statBlockWeapon === true) {", to: "  if (false) {", breaks: "A1" },
  { name: "any truthy mark counts", file: PR, from: "item?.flags?.[SYSTEM_ID]?.statBlockWeapon === true) {", to: "item?.flags?.[SYSTEM_ID]?.statBlockWeapon) {", breaks: "A1" },
  { name: "the mark covers armour too", file: PR, from: "  if (type === \"weapon\" && item?.flags?.[SYSTEM_ID]?.statBlockWeapon === true) {", to: "  if (item?.flags?.[SYSTEM_ID]?.statBlockWeapon === true) {", breaks: "A2" },
  { name: "a self-condition alone is no declaration", file: DAS, from: " && raw.dispel !== true && !selfCondition && !castChoice) return null;", to: " && raw.dispel !== true && !castChoice) return null;", breaks: "A3" },
  { name: "the self-condition lasts until removed", file: DAS, from: "rounds: Math.max(0, Math.trunc(Number(raw.selfCondition.rounds ?? 1) || 0))", to: "rounds: 0", breaks: "A3" },
  { name: "a blow that dealt nothing still raises the haze", file: DAS, from: "  if (spec.selfCondition?.onDamage && !(Number(ctx.damageTaken) > 0)) return false;", to: "", breaks: "A4" },
  { name: "onDamage cannot be switched off", file: DAS, from: "onDamage: raw.selfCondition.onDamage !== false }", to: "onDamage: true }", breaks: "A4" },
  { name: "the attack passes no damage figure", file: ATTACK, from: ", damageTaken: Number(packet?.taken ?? 0) || 0 })) {", to: " })) {", breaks: "B1" },
  { name: "the workflow drops the damage figure", file: WF, from: "      : [],\n    damageTaken\n  };", to: "      : []\n  };", breaks: "B2" },
  { name: "the self-condition is never laid", file: WF, from: "    if (spec.selfCondition) lines.push(...await applySelfCondition(actor, spec));\n", to: "", breaks: "B2" },
  { name: "a spent spittle is used again", file: ACT, from: "    if (counted && usesLeft <= 0) { ui.notifications?.warn(", to: "    if (false) { ui.notifications?.warn(", breaks: "B3" },
  { name: "the use is never spent", file: ACT, from: "      await item.update({ \"system.usesValue\": usesLeft - 1 });\n", to: "", breaks: "B3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block5.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block5: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block5: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block5: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
