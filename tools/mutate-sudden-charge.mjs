#!/usr/bin/env node
/** mutate-sudden-charge — the mutation half of verify-sudden-charge. NEW at 3.684.7. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const MV = m("combat", "movement.mjs"), MW = m("combat", "movement-workflow.mjs"), FE = m("feats.mjs"), CH = m("combat", "charge-workflow.mjs"), AW = m("combat", "action-workflow.mjs");
const MUTATIONS = [
  { name: "THE DEFECT: the move pays the table's 3 AP", file: MW, from: "      check.apCost = armedApCost(actor, state.armed, check.apCost);\n", to: "", breaks: "C2/C5" },
  { name: "the reduction comes after the AP check", file: MW, from: "    if (!leg && check && Number.isFinite(Number(check.apCost))) {\n      check.apCost = armedApCost(actor, state.armed, check.apCost);\n    }\n\n    if (!check.allowed) {", to: "    if (!check.allowed) {", breaks: "C2/C5" },
  { name: "the arming card says 3", file: MW, from: "    apCost: armedApCost(actor, armed, config.apCost),", to: "    apCost: config.apCost,", breaks: "C3/C5" },
  { name: "a class ability does not count", file: MW, from: ".filter((i) => i.type === \"feat\" || i.type === \"ability\").map((i) => i.name);\n  return Math.max(0, cost - apCostReduction(actionKey, names));", to: ".filter((i) => i.type === \"feat\").map((i) => i.name);\n  return Math.max(0, cost - apCostReduction(actionKey, names));", breaks: "C1" },
  { name: "the cost may go below 0", file: MW, from: "  return Math.max(0, cost - apCostReduction(actionKey, names));", to: "  return cost - apCostReduction(actionKey, names);", breaks: "C1" },
  { name: "every armed action is reduced", file: MW, from: "  return Math.max(0, cost - apCostReduction(actionKey, names));", to: "  return Math.max(0, cost - apCostReduction(\"charge\", names));", breaks: "C1" },
  { name: "a string cost reads as 0", file: MW, from: "  const cost = Math.max(0, Math.trunc(Number(base) || 0));\n  // Feats and class abilities", to: "  const cost = typeof base === \"number\" ? base : 0;\n  // Feats and class abilities", breaks: "C1" },
  { name: "Sudden Charge leaves the table", file: FE, from: "  \"sudden charge\": Object.freeze({ action: \"charge\", reduction: 1 })", to: "  \"sudden charge (removed)\": Object.freeze({ action: \"charge\", reduction: 1 })", breaks: "C1/C2/C3/C5" },
  { name: "the Charge's Strike pays again", file: CH, from: "    apPaid: true,\n    // The target was chosen", to: "    apPaid: false,\n    // The target was chosen", breaks: "C4/C5" },
  // C6 (3.684.8) — the header
  { name: "THE DEFECT: the header keeps the printed 3", file: AW, from: "        ...headerLines(action, armedHeaderCost(action.apCost, armed?.apCost)),", to: "        ...headerLines(action),", breaks: "C6c/C6d" },
  { name: "the header always shows the summary's cost", file: MV, from: "  if (!/^\\d+$/.test(a) || !/^\\d+$/.test(b) || Number(a) === Number(b)) return undefined;", to: "  if (!/^\\d+$/.test(b)) return undefined;", breaks: "C6" },
  { name: "the header never changes", file: MV, from: "  if (!/^\\d+$/.test(a) || !/^\\d+$/.test(b) || Number(a) === Number(b)) return undefined;\n  return b;", to: "  return undefined;", breaks: "C6/C6c" },
  { name: "the card stops printing the summary's cost", file: AW, from: "`, costing <strong>${armed.apCost} AP</strong>.`", to: "`, costing <strong>3 AP</strong>.`", breaks: "C5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-sudden-charge.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-sudden-charge: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-sudden-charge: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-sudden-charge: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
