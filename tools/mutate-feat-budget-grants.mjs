#!/usr/bin/env node
/** mutate-feat-budget-grants — the mutation half of verify-feat-budget-grants. NEW at 3.684.8. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const FE = m("feats.mjs"), SH = m("sheets", "actor-sheet.mjs");
const PAID = "  const paid = (rows = []) => rows.filter((row) => !row?.bonusFeat && String(row?.type ?? \"\") !== \"ability\").length;";
const MUTATIONS = [
  { name: "THE DEFECT: an ability row spends a pick", file: FE, from: PAID + "\n  // An Archetype-only pick", to: "  const paid = (rows = []) => rows.filter((row) => !row?.bonusFeat).length;\n  // An Archetype-only pick", breaks: "G3b" },
  { name: "a companion's ability row spends a pick", file: FE, from: PAID + "\n  const spent = COMPANION_FEAT_GROUPS", to: "  const paid = (rows = []) => rows.filter((row) => !row?.bonusFeat).length;\n  const spent = COMPANION_FEAT_GROUPS", breaks: "G3b" },
  { name: "a bonus feat spends a pick", file: FE, from: PAID + "\n  // An Archetype-only pick", to: "  const paid = (rows = []) => rows.filter((row) => String(row?.type ?? \"\") !== \"ability\").length;\n  // An Archetype-only pick", breaks: "G2/G3" },
  { name: "spendsNoFeatPick: an ability is a feat", file: FE, from: "  if (String(item?.type ?? \"\") === \"ability\") return true;\n  const from = item?.flags?.[systemId]?.grantedBy?.sourceId;", to: "  const from = item?.flags?.[systemId]?.grantedBy?.sourceId;", breaks: "G1" },
  { name: "THE DEFECT: only a foundation grant is free", file: FE, from: "  return foundationIds.has(from) || ownedIds.has(from);", to: "  return foundationIds.has(from);", breaks: "G1/G2" },
  { name: "a foundation grant is no longer free", file: FE, from: "  return foundationIds.has(from) || ownedIds.has(from);", to: "  return ownedIds.has(from);", breaks: "G1/G3" },
  { name: "any grant is free, its source gone or not", file: FE, from: "  return foundationIds.has(from) || ownedIds.has(from);", to: "  return true;", breaks: "G1/G3" },
  { name: "a self-reference is free", file: FE, from: "  if (!from || from === item?.id) return false;", to: "  if (!from) return false;", breaks: "G1" },
  { name: "the sheet passes no owned items", file: SH, from: "        row.bonusFeat = spendsNoFeatPick(item, { ownedIds, foundationIds });", to: "        row.bonusFeat = spendsNoFeatPick(item, { foundationIds });", breaks: "G4" },
  { name: "the sheet's owned set is empty", file: SH, from: "    const ownedIds = new Set(Array.from(items ?? []).map((i) => i?.id).filter(Boolean));", to: "    const ownedIds = new Set();", breaks: "G4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-feat-budget-grants.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-feat-budget-grants: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-feat-budget-grants: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-feat-budget-grants: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
