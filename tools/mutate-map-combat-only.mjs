#!/usr/bin/env node
/** mutate-map-combat-only — the mutation half of verify-map-combat-only. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const TR = m("combat", "turn-records.mjs"), AW = m("combat", "action-workflow.mjs"), MW = m("combat", "mounted-workflow.mjs"), CW = m("magic", "cast-workflow.mjs"), CB = m("documents", "combat.mjs"), AL = m("alchemical-workflow.mjs");
const MUTATIONS = [
  { name: "THE OLD DEFECT: a combat that has not started counts", file: TR, from: "    if (!combat?.started) continue;\n", to: "", breaks: "A1" },
  { name: "everyone in the world is in combat", file: TR, from: "      if (a && (a === actor || (a.uuid && a.uuid === actor.uuid))) return true;", to: "      if (a) return true;", breaks: "A3" },
  { name: "an unlinked token is matched to its base actor", file: TR, from: "      if (a && (a === actor || (a.uuid && a.uuid === actor.uuid))) return true;", to: "      if (a && (a === actor || a.uuid === actor.uuid || a.uuid?.endsWith(actor.uuid.split(\".\").pop()))) return true;", breaks: "A4" },
  { name: "the count is read out of combat", file: TR, from: "  if (!attacksCount(actor, combats)) return 0;\n", to: "", breaks: "A1" },
  { name: "the count is written out of combat", file: TR, from: "  if (!attacksCount(actor, combats)) return false;\n", to: "", breaks: "A5" },
  { name: "a negative count is written", file: TR, from: "  await actor.setFlag(SYSTEM_ID, ATTACK_COUNT_FLAG, Math.max(0, Math.floor(Number(value) || 0)));", to: "  await actor.setFlag(SYSTEM_ID, ATTACK_COUNT_FLAG, Math.floor(Number(value) || 0));", breaks: "A6" },
  { name: "the action path reads the raw flag again", file: AW, from: "    const map = mapPenalty(attackCountOf(actor));", to: "    const map = mapPenalty(Number(actor.getFlag(SYSTEM_ID, \"attackCount\") ?? 0));", breaks: "B" },
  { name: "the action path writes out of combat", file: AW, from: "    await setAttackCount(actor, attackCountOf(actor) + 1);", to: "    await actor.setFlag(SYSTEM_ID, \"attackCount\", attackCountOf(actor) + 1);", breaks: "B" },
  { name: "the mount shares a raw counter", file: MW, from: "  if (partner) await setAttackCount(partner, next);", to: "  if (partner) await partner.setFlag(\"trg-prime\", \"attackCount\", next);", breaks: "B" },
  { name: "a spell ray counts out of combat", file: CW, from: "    await setAttackCount(actor, mapBefore + 1);", to: "    await actor.setFlag?.(SYSTEM_ID, \"attackCount\", mapBefore + 1);", breaks: "B" },
  { name: "a bomb reads the raw counter", file: AL, from: "  const attackIndex = attackCountOf(actor);", to: "  const attackIndex = Number(actor.getFlag?.(SYSTEM_ID, \"attackCount\") ?? 0);", breaks: "B" },
  { name: "a combat starts on yesterday's ladder", file: CB, from: "      for (const c of combatants) if (c.actor) await clearAttackCount(c.actor);\n", to: "", breaks: "C" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-map-combat-only.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-map-combat-only: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-map-combat-only: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-map-combat-only: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
