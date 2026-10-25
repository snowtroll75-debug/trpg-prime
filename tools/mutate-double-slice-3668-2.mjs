#!/usr/bin/env node
/** mutate-double-slice-3668-2 — the mutation half of verify-double-slice-3668-2. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AW = m("combat", "attack-workflow.mjs"), DS = m("combat", "double-slice-workflow.mjs"), PURE = m("combat", "double-slice.mjs");
const MUTATIONS = [
  // A
  { name: "the Strike forgets noCritical", file: AW, from: "\n  noCritical = false,\n  beforeDamage = null,\n", to: "\n  beforeDamage = null,\n", breaks: "A1" },
  { name: "THE DEFECT: a second critical is still inflicted", file: AW, from: "  if (criticalDowngraded) outcome.critical = null;", to: "", breaks: "A2" },
  { name: "the card never says the critical was downgraded", file: AW, from: "    lines.push(line(`<em>${optionLabel || \"Only one critical\"}: this critical counts as an ordinary hit — no bonus dice and no injury.</em>`));\n", to: "", breaks: "A3" },
  { name: "the pair is asked after the damage", file: AW, from: "  if (typeof beforeDamage === \"function\") {", to: "  if (false) {", breaks: "A4" },
  { name: "THE DEFECT: a voided hit still lands", file: AW, from: "      outcome.hits = false;\n      outcome.critical = null;\n    }", to: "      outcome.critical = null;\n    }", breaks: "A5" },
  { name: "a voided hit keeps its critical", file: AW, from: "      outcome.hits = false;\n      outcome.critical = null;\n    }", to: "      outcome.hits = false;\n    }", breaks: "A5" },
  { name: "the caller is not told", file: AW, from: "  check.voidedByPair = voidedByPair;\n", to: "", breaks: "A6" },
  // B
  { name: "the second swing keeps its critical", file: DS, from: "    noCritical: Boolean(firstOutcome?.hits && firstOutcome?.critical),\n", to: "", breaks: "B1" },
  { name: "the second swing meets DR again", file: DS, from: "    drWaived: Boolean(firstOutcome?.hits),\n", to: "", breaks: "B1" },
  { name: "DR waived even when the first missed", file: DS, from: "    drWaived: Boolean(firstOutcome?.hits),\n", to: "    drWaived: true,\n", breaks: "B1" },
  { name: "the second's fumble does not void the first", file: DS, from: "      return { void: Boolean(secondCheck?.attackFumbled) };", to: "      return null;", breaks: "B2" },
  { name: "a first swing that may fumble waits anyway", file: DS, from: "      if (firstOutcome?.fumbleRisk) return null;\n", to: "", breaks: "B2" },
  { name: "the second is made after a fumbled first", file: DS, from: "if (!secondRolled && !firstCheck.attackFumbled) secondCheck", to: "if (!secondRolled) secondCheck", breaks: "B3" },
  { name: "the count reads the raw roll", file: DS, from: "{ weaponSystem: pair.second.system, hits: outcome.secondHits,", to: "{ weaponSystem: pair.second.system, hits: Boolean(secondCheck?.attackOutcome?.hits),", breaks: "B5" },
  // C
  { name: "the card asks for damage rolls again", file: DS, from: "      ? \"<em>The damage above has been applied.</em>\"", to: "      ? \"<em>Roll damage from both cards and combine the totals.</em>\"", breaks: "C1" },
  { name: "the card says nothing when neither hit", file: DS, from: "      : \"<em>Neither swing deals damage.</em>\"", to: "      : \"\"", breaks: "C2" },
  { name: "the card hides what each swing dealt", file: DS, from: "${Number(check.damageTaken ?? 0) || 0} damage taken", to: "a hit", breaks: "C3" },
  { name: "the card prints every note again", file: DS, from: "...outcome.notes.filter((note) => /fumbled/.test(note))", to: "...outcome.notes", breaks: "C4" },
  { name: "the card does not say why the second was not made", file: DS, from: " — the first fumbled, so it automatically misses", to: "", breaks: "C5" },
  // D
  { name: "the pure rules let both criticals stand", file: PURE, from: "  if (firstCritical && secondCritical) {", to: "  if (false) {", breaks: "D1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-double-slice-3668-2.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-double-slice-3668-2: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-double-slice-3668-2: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-double-slice-3668-2: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
