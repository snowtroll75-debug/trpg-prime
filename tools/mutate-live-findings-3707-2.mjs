#!/usr/bin/env node
/** mutate-live-findings-3707-2 — the mutation half of verify-live-findings-3707-2 (3.707.3). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const WD = M("magic", "ward.mjs");
const CW = M("magic", "cast-workflow.mjs");
const SV = M("magic", "seers-vision.mjs");
const SE = M("magic", "spell-effects.mjs");
const EA = M("combat", "effect-application-workflow.mjs");
const AW = M("combat", "attack-workflow.mjs");
const MUTATIONS = [
  { name: "A a printed range no longer counts", file: WD, from: "  if (String(range ?? \"\").trim() || String(area ?? \"\").trim()) return false;", to: "" },
  { name: "A any self row passes", file: WD, from: "  return rows.length > 0 && rows.every((r) => r?.kind === \"ward\" && String(r?.target ?? \"\") === \"self\");", to: "  return rows.length > 0 && rows.some((r) => String(r?.target ?? \"\") === \"self\");" },
  { name: "A the gate ignores it", file: CW, from: "  if (!storingNow && !spellTargetsObject(spell) && !wardFoeOnly && (game.user?.targets?.size ?? 0)) {", to: "  if (!storingNow && !spellTargetsObject(spell) && (game.user?.targets?.size ?? 0)) {" },
  { name: "B the record keeps no stamp", file: SV, from: "      ? { endsAtTurnEndOf: { of: endsAtTurnEndOf.of, castTurn: String(endsAtTurnEndOf.castTurn ?? \"\") } }", to: "      ? {}" },
  { name: "B the cast hands none", file: SE, from: "            endsAtTurnEndOf: spellExpiryTiming(parsedDuration).turnEndOf ?? null\n", to: "            endsAtTurnEndOf: null\n" },
  { name: "B the sweep never drops a glimpse", file: EA, from: "  const lapsed = records.filter((r) => dueAtTurnEnd(r?.endsAtTurnEndOf, { turnOfUuid, endingTurn }));", to: "  const lapsed = [];" },
  { name: "B every record dropped with it", file: EA, from: "    const kept = records.filter((r) => !lapsed.includes(r));", to: "    const kept = [];" },
  { name: "C 'no target' again", file: AW, from: "    compactSummary: struckObject\n      ?", to: "    compactSummary: false\n      ?" }
];
const verify = path.join(SYSTEM_ROOT, "tools", "verify-live-findings-3707-2.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-live-findings-3707-2: verify-live-findings-3707-2 already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-live-findings-3707-2: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-live-findings-3707-2: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
