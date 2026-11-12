#!/usr/bin/env node
/** mutate-fixes-3681-1 — the mutation half of verify-fixes-3681-1. NEW at 3.681.1. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AW = m("combat", "attack-workflow.mjs"), CW = m("magic", "cast-workflow.mjs"), ASK = m("reactions", "reaction-ask-workflow.mjs"),
  SR = m("magic", "spell-range.mjs"), AS = m("aligned-sense-workflow.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "THE DEFECT: the Death critical's save reads the check's own total", file: AW, from: "      const saveTotal = saveRoll?.outcome?.total;", to: "      const saveTotal = saveRoll?.total;", breaks: "T2/D1" },
  { name: "the save's degree is not handed over (review)", file: AW, from: "saveDegree ? { saved: Boolean(saveDegree.success) } : {});", to: "{});", breaks: "D4" },
  { name: "the degree is ignored when given", file: m("combat", "death-state.mjs"), from: "  const passed = typeof saved === \"boolean\" ? saved : (Number.isFinite(total) && Number.isFinite(dc) && total >= dc);", to: "  const passed = Number.isFinite(total) && Number.isFinite(dc) && total >= dc;", breaks: "D2" },
  { name: "the total is ignored when no degree is given", file: m("combat", "death-state.mjs"), from: "  const passed = typeof saved === \"boolean\" ? saved : (Number.isFinite(total) && Number.isFinite(dc) && total >= dc);", to: "  const passed = Boolean(saved);", breaks: "D3" },
  { name: "the card prints the wrong total", file: AW, from: "rolls <strong>${saveTotal ?? \"—\"}</strong>", to: "rolls <strong>${saveRoll?.total ?? \"—\"}</strong>", breaks: "T2/D1" },
  { name: "THE DEFECT: the unwilling touch reads the check's own total", file: CW, from: "touchAttackOutcome(Number(touch?.outcome?.total ?? 0), defence,", to: "touchAttackOutcome(Number(touch?.total ?? 0), defence,", breaks: "T2/U1" },
  { name: "a third misread, elsewhere (the scan must find any)", file: AS, from: "  const total = Number(check?.outcome?.total ?? check?.total ?? 0);", to: "  const total = Number(check?.total ?? 0);", breaks: "T2" },
  { name: "the touch's reading always lands", file: SR, from: "export function touchAttackOutcome(attackValue, defence, { natural = 0 } = {}) {", to: "export function touchAttackOutcome(attackValue, defence, { natural = 0 } = {}) {\n  return { landed: true, by: 0 };", breaks: "U2" },
  { name: "a reactor who leaves is not marked", file: ASK, from: "      entry.resolve({ answer: null, result: null, left: true });", to: "      entry.resolve({ answer: null, result: null });", breaks: "L1" },
  { name: "the notice says they ran out of time", file: ASK, from: "out.left ? `${answererName} left the game — no reaction.` : ", to: "", breaks: "L1" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.686.2\"", to: "\"version\": \"3.681.0\"", breaks: "Z" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-fixes-3681-1.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-fixes-3681-1: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3681-1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3681-1: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
