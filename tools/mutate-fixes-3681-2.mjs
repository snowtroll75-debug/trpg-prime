#!/usr/bin/env node
/** mutate-fixes-3681-2 — the mutation half of verify-fixes-3681-2. NEW at 3.681.2. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AW = m("combat", "attack-workflow.mjs"), DS = m("combat", "damage-summary.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "THE DEFECT: the card's line is the old, nameless one", file: AW,
    from: "  const damageCompactSummary = () => damageCardSummary({\n    targetName: finalTaken !== null ? targetActor?.name ?? null : null,\n    taken: finalTaken,\n    total,\n    typeLabel\n  });",
    to: "  const damageCompactSummary = () =>\n    finalTaken !== null ? `${finalTaken} ${typeLabel} taken` : `${total} ${typeLabel}`;", breaks: "W2/W4" },
  { name: "the attacker's name is handed over instead of the target's", file: AW,
    from: "    targetName: finalTaken !== null ? targetActor?.name ?? null : null,", to: "    targetName: finalTaken !== null ? actor?.name ?? null : null,", breaks: "W2" },
  { name: "no name is handed over", file: AW,
    from: "    targetName: finalTaken !== null ? targetActor?.name ?? null : null,", to: "    targetName: null,", breaks: "W2" },
  { name: "the card is posted without the line", file: AW,
    from: "    compactSummary: damageCompactSummary()\n  });", to: "    compactSummary: null\n  });", breaks: "W3" },
  { name: "the line drops the name", file: DS,
    from: "return `${escapeName(name)} takes ${taken} ${type}`;", to: "return `${taken} ${type} taken`;", breaks: "S1/S2/S5" },
  { name: "a stopped blow (0 taken) loses its name", file: DS,
    from: "  if (taken !== null && taken !== undefined && name) return", to: "  if (taken && name) return", breaks: "S2" },
  { name: "no target reads as a bare number again", file: DS,
    from: "return `${total} ${type} — no target`;", to: "return `${total} ${type}`;", breaks: "S3" },
  { name: "the name is printed as HTML", file: DS,
    from: "return `${escapeName(name)} takes", to: "return `${name} takes", breaks: "S5" },
  { name: "the damage step's target is read from somewhere else", file: AW,
    from: "  const targetTokenHere = targetTokenOverride ?? firstTargetToken() ?? null;", to: "  const targetTokenHere = firstTargetToken() ?? targetTokenOverride ?? null;", breaks: "W5" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.687.1\"", to: "\"version\": \"3.681.1\"", breaks: "Z" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-fixes-3681-2.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-fixes-3681-2: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3681-2: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3681-2: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
