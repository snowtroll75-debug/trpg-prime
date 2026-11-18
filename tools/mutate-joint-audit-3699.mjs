#!/usr/bin/env node
/** mutate-joint-audit-3699 — the mutation half of verify-joint-audit-3699 (Graham's rulings, joint Codex / Fiends & Fables audit). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AC = M("combat", "ability-collapse.mjs");
const ACW = M("combat", "ability-collapse-workflow.mjs");
const SR = M("skill-sheet-rules.mjs");
const CD = M("conditionals.mjs");
const AD = M("documents", "actor.mjs");
const GW = M("grants-workflow.mjs");
const PR = M("data", "pack-repairs.mjs");
const MG = M("migration.mjs");
const MUTATIONS = [
  { name: "A Wisdom collapses a mindless creature again", file: AC, from: "Object.freeze([\"intelligence\", \"wisdom\", \"charisma\"])", to: "Object.freeze([\"intelligence\", \"charisma\"])" },
  { name: "A the Mindless ethic ignored", file: AC, from: "  return String(actorSystem?.identity?.ethics ?? \"\").trim().toLowerCase() === \"mindless\";", to: "  return false;" },
  { name: "A every creature treated as mindless", file: AC, from: "  if (isMindless(actorSystem)) return true;\n  return String", to: "  if (true) return true;\n  return String" },
  { name: "A Strength excused too", file: AC, from: "Object.freeze([\"intelligence\", \"wisdom\", \"charisma\"])", to: "Object.freeze([\"intelligence\", \"wisdom\", \"charisma\", \"strength\"])" },
  { name: "A gaining a trait does not re-settle", file: ACW, from: "      || foundry.utils.hasProperty(changes, \"system.details\")\n", to: "" },
  { name: "B the Swim row scoped to every Athletics check", file: SR, from: "subjects: [\"athletics\"], actions: [\"swim\"] }", to: "subjects: [\"athletics\"] }" },
  { name: "B the Climb row never made", file: SR, from: "  if (speedValue(movement.climb) > 0) rows.push({", to: "  if (false) rows.push({" },
  { name: "B the Swim row worth +2", file: SR, from: "    kind: \"modifier\", value: 4, type: \"circumstance\", label: \"Swim Speed\"", to: "    kind: \"modifier\", value: 2, type: \"circumstance\", label: \"Swim Speed\"" },
  { name: "B the rows never published", file: AD, from: "  if (movementRows.length && system.combat) {", to: "  if (false) {" },
  { name: "C Keen Sense not pooled", file: AD, from: "  if (hasKeenSense(actor)) {", to: "  if (false) {" },
  { name: "C Keen Sense's roll row still offered (counted twice)", file: CD, from: "        if (keen && String(raw?.kind ?? \"\").toLowerCase() === \"modifier\"", to: "        if (false && keen && String(raw?.kind ?? \"\").toLowerCase() === \"modifier\"" },
  { name: "C Keen Sight treated as Keen Sense", file: SR, from: "=== \"keen sense\";", to: ".startsWith(\"keen s\");" },
  { name: "D a printed range is not the base ability", file: GW, from: "    if (i.type === \"ability\") held.add(abilityBaseName(name));", to: "" },
  { name: "E owned Eternal types never repaired", file: PR, from: "    id: \"rd01-eternal-no-death-state\", pack: \"creature-types\"", to: "    id: \"rd01-eternal-no-death-stateX\", pack: \"creature-types\"" },
  { name: "F owned Ooze effects never repaired", file: PR, from: "    id: \"co02-rd08-ooze-immunities\", itemType: \"creature-type\"", to: "    id: \"co02-rd08-ooze-immunitiesX\", itemType: \"creature-type\"" },
  { name: "F the effect pass not re-gated", file: MG, from: "runIf(\"3.699.0\", \"declared effect repairs on owned items", to: "runIf(\"3.627.1\", \"declared effect repairs on owned items" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-joint-audit-3699.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-joint-audit-3699: verify-joint-audit-3699 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-joint-audit-3699: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-joint-audit-3699: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
