#!/usr/bin/env node
/** mutate-fixes-3670-1 — the mutation half of verify-fixes-3670-1. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const OP = m("combat", "opportunity.mjs"), ACW = m("combat", "action-workflow.mjs"), DT = m("difficulty-tradeoffs.mjs"),
  SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  // A
  { name: "THE DEFECT: the origin is left out of the path", file: OP, from: "    const waypoints = [...(startsElsewhere ? [origin] : []), ...passed]", to: "    const waypoints = [...passed]", breaks: "A1" },
  { name: "the origin is counted twice when it is already first", file: OP, from: "    const startsElsewhere = origin && !(first && first.x === origin.x && first.y === origin.y);", to: "    const startsElsewhere = origin;", breaks: "A4" },
  { name: "an origin that is not a point is taken", file: OP, from: "      .filter((w) => Number.isFinite(w?.x) && Number.isFinite(w?.y))\n      .map((w) => ({ x: w.x + halfW, y: w.y + halfH }));", to: "      .map((w) => ({ x: w.x + halfW, y: w.y + halfH }));", breaks: "A5" },
  // B
  { name: "THE DEFECT: a preset result is asked for training", file: ACW, from: "      const exempt = presetResult || Array.from(actor.items ?? [])", to: "      const exempt = Array.from(actor.items ?? [])", breaks: "B1" },
  { name: "shared dice alone skip training", file: ACW, from: "      const presetResult = Boolean(presetDice) && Array.isArray(presetModifiers);", to: "      const presetResult = Boolean(presetDice);", breaks: "B2" },
  // C
  { name: "THE DEFECT: the card shows the printed price", file: DT, from: "    c.description = describeTradeoff(c.option, c.count, { paidDC: perUnit * paidFor });", to: "    c.description = describeTradeoff(c.option, c.count);", breaks: "C1" },
  { name: "a waived price is not named as waived", file: DT, from: "  const cost = dc === 0 && option.dc > 0 ? \" (waived)\" : ` (+${dc} DC)`;", to: "  const cost = ` (+${dc} DC)`;", breaks: "C1" },
  { name: "the paid figure is ignored", file: DT, from: "  const dc = paidDC === null || paidDC === undefined ? option.dc * count : Math.max(0, Number(paidDC) || 0);", to: "  const dc = option.dc * count;", breaks: "C2" },
  // version
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.672.1\"", to: "\"version\": \"3.670.0\"", breaks: "Z0" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-fixes-3670-1.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-fixes-3670-1: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3670-1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3670-1: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
