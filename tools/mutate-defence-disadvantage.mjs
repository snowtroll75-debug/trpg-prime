#!/usr/bin/env node
/** mutate-defence-disadvantage — the mutation half of verify-defence-disadvantage. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DD = m("combat", "defence-dc.mjs"), CO = m("conditionals.mjs"), AW = m("combat", "action-workflow.mjs");
const MUTATIONS = [
  { name: "a disadvantage row is refused", file: DD, from: "  if (!(isDefendableDC(dc) || (disadvantage && dc === \"any\"))) return null;", to: "  if (!isDefendableDC(dc)) return null;", breaks: "A1" },
  { name: "a disadvantage row is unscoped", file: DD, from: "  if (!stanceGated && !actions.length && !sourceTypes.length", to: "  if (false && !stanceGated && !actions.length && !sourceTypes.length", breaks: "A2" },
  { name: "a value row may name any DC", file: DD, from: "  if (!(isDefendableDC(dc) || (disadvantage && dc === \"any\"))) return null;", to: "  if (!(isDefendableDC(dc) || dc === \"any\")) return null;", breaks: "A4" },
  { name: "the row is read as a modifier", file: DD, from: "    kind: disadvantage ? \"disadvantage\" : \"modifier\",", to: "    kind: \"modifier\",", breaks: "A1" },
  { name: "\"any\" never matches", file: DD, from: "    if (entry.dc !== \"any\" && !againsts.includes(entry.dc)) return false;", to: "    if (!againsts.includes(entry.dc)) return false;", breaks: "B1" },
  { name: "the action is not checked", file: DD, from: "    if (entry.actions.length && !entry.actions.includes(key)) return false;\n    if (entry.sourceTypes.length", to: "    if (entry.sourceTypes.length", breaks: "B3" },
  { name: "disadvantage rows are summed with the DC rows", file: DD, from: "  const entries = matched.filter((e) => e.kind !== \"disadvantage\");", to: "  const entries = matched;", breaks: "B4" },
  { name: "the bias is applied in two passes", file: CO, from: "  return Array.isArray(kinds) && kinds.length ? resolveBias(chosen, kinds, bias) : chosen;", to: "  return Array.isArray(kinds) && kinds.length ? kinds.reduce((b, k) => resolveBias(b, [k], bias), chosen) : chosen;", breaks: "C2" },
  { name: "no kinds still rewrites the bias", file: CO, from: "  return Array.isArray(kinds) && kinds.length ? resolveBias(chosen, kinds, bias) : chosen;", to: "  return resolveBias(chosen, kinds, bias);", breaks: "C3" },
  { name: "the action forgets the rows", file: AW, from: "    defenceDisadvantages = defence.disadvantages ?? [];", to: "    defenceDisadvantages = [];", breaks: "D1" },
  { name: "the card keeps quiet", file: AW, from: "        `<em>${targetActor.name}: ${entry.label} \u2014 this check is rolled at disadvantage${entry.scope ? ` (${entry.scope})` : \"\"}.</em>`", to: "        ``", breaks: "D2" },
  { name: "the roll ignores the defender", file: AW, from: "      ...(defenceDisadvantages.length ? [\"disadvantage\"] : []),\n", to: "", breaks: "D3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-defence-disadvantage.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-defence-disadvantage: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-defence-disadvantage: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-defence-disadvantage: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
