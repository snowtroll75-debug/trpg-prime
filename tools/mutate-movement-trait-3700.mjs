#!/usr/bin/env node
/** mutate-movement-trait-3700 — the mutation half of verify-movement-trait-3700 (the Movement trait on spells, and the Storgar). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RM = M("magic", "rooted-movement.mjs");
const WF = M("magic", "rooted-movement-workflow.mjs");
const CW = M("magic", "cast-workflow.mjs");
const AD = M("documents", "actor.mjs");
const RA = M("combat", "restricted-ap.mjs");
const PR = M("data", "pack-repairs.mjs");
const MG = M("migration.mjs");
const MUTATIONS = [
  { name: "R the Storgar is not recognised", file: RM, from: "Object.freeze({ storgar: 5 })", to: "Object.freeze({ storgarx: 5 })" },
  { name: "R the DC is 10, not 5", file: RM, from: "Object.freeze({ storgar: 5 })", to: "Object.freeze({ storgar: 10 })" },
  { name: "R any item named Storgar counts", file: RM, from: "    const named = item.type === \"heritage\"\n", to: "    const named = true\n" },
  { name: "R an enemy's spell is rolled too", file: RM, from: "  return Boolean(isSelf || sameSide);", to: "  return true;" },
  { name: "R a creature caught in an area is rolled", file: RM, from: "  if (!dc || !chosen) return false;", to: "  if (!dc) return false;" },
  { name: "R a spell without Movement is rolled", file: RM, from: "  if (!hasTrait(spellTraits, \"movement\")) return false;\n  return Boolean", to: "  return Boolean" },
  { name: "R a self-only spell asks nobody", file: RM, from: "  return caster ? [caster] : [];", to: "  return [];" },
  { name: "R an area spell asks the caster", file: RM, from: "  if (isArea) return [];\n", to: "" },
  { name: "R Teleport's caster is not asked", file: RM, from: "    return withCaster ? [caster, ...chosen] : chosen;", to: "    return chosen;" },
  { name: "R the caster asked twice", file: RM, from: " && !chosen.some((a) => same(a, caster));", to: ";" },
  { name: "R every spell asks the caster beside its targets", file: RM, from: "/^\\s*you\\b/i.test(String(targetsText ?? \"\"))", to: "true" },
  { name: "W the targets line not passed", file: WF, from: "{ isArea, targetsText: spell?.system?.targets ?? \"\" }", to: "{ isArea }" },
  { name: "S the save row is a tick, not automatic", file: RM, from: "    auto: true,\n    when: { checkTypes: [\"save\"], traits: [\"movement\"] }", to: "    auto: false,\n    when: { checkTypes: [\"save\"], traits: [\"movement\"] }" },
  { name: "S the save row reaches every save", file: RM, from: "    when: { checkTypes: [\"save\"], traits: [\"movement\"] }", to: "    when: { checkTypes: [\"save\"] }" },
  { name: "S the save row is +1", file: RM, from: "    value: 2,\n    type: \"race\",\n    label: \"Storgar\",", to: "    value: 1,\n    type: \"race\",\n    label: \"Storgar\"," },
  { name: "S the actor never publishes it", file: AD, from: "  if (storgarRows.length && system.combat) {", to: "  if (false) {" },
  { name: "W the check is never rolled", file: CW, from: "  if (outcome.cast && !storingNow) {\n    const { rootedMovementChecks }", to: "  if (false) {\n    const { rootedMovementChecks }" },
  { name: "W a rooted target is never pruned", file: CW, from: "      if (!notRooted(token.actor)) token.setTarget(false, { releaseOthers: false, groupSelection: true });", to: "" },
  { name: "W a lone rooted caster is still carded as teleported", file: CW, from: "  if (outcome.cast && !rootedNobodyMoved) {", to: "  if (outcome.cast) {" },
  { name: "W every target rooted still reads as moved", file: CW, from: "    ? rootedTargeted.every((t) => !notRooted(t.actor))", to: "    ? false" },
  { name: "W a rooted target still gets the effects", file: CW, from: "    effectTargets = effectTargets.filter(notRooted);\n", to: "" },
  { name: "W a rooted caster's self rows still land", file: CW, from: "    if (rooted.casterFailed) selfShapeBlocked = true;\n", to: "" },
  { name: "W the workflow ignores the side", file: WF, from: "sameSide(casterSide, dispositionOf(actor))", to: "true" },
  { name: "Q Movement is not a Move again", file: RA, from: "if (/\\bmove(?:ment)?\\b/i.test(traitText)) add(\"move\");", to: "if (/\\bmove\\b/i.test(traitText)) add(\"move\");" },
  { name: "Q any move- word is a Move", file: RA, from: "if (/\\bmove(?:ment)?\\b/i.test(traitText)) add(\"move\");", to: "if (/\\bmove/i.test(traitText)) add(\"move\");" },
  { name: "P an owned-copy repair dropped", file: PR, from: "    id: \"movement-trait-misty-step\", pack: \"spells\"", to: "    id: \"movement-trait-misty-step\", pack: \"spellsX\"" },
  { name: "N the Storgar note repair dropped", file: PR, from: "    id: \"movement-trait-storgar-rooted-note\", itemType: \"heritage\"", to: "    id: \"movement-trait-storgar-rooted-note\", itemType: \"heritageX\"" },
  { name: "G the pack-copy pass not re-gated", file: MG, from: "runIf(\"3.707.0\", \"stale owned copies of repaired pack items\"", to: "runIf(\"3.699.0\", \"stale owned copies of repaired pack items\"" },
  { name: "G the effect pass not re-gated", file: MG, from: "runIf(\"3.705.1\", \"declared effect repairs on owned items", to: "runIf(\"3.699.0\", \"declared effect repairs on owned items" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-movement-trait-3700.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-movement-trait-3700: verify-movement-trait-3700 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-movement-trait-3700: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-movement-trait-3700: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
