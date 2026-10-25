#!/usr/bin/env node
/**
 * mutate-favoured-weapon-group — five mutations against
 * verify-favoured-weapon-group.mjs: a group match that accepts a suffix,
 * one that ignores the group, a source list that stops asking, and the
 * two workflow sites that stop handing the group over.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const DA = path.join(SYSTEM_ROOT, "module", "divine-aspect.mjs");
const AW = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");

const MUTATIONS = [
  { name: "a group match accepts a suffix like a name does", file: DA,
    from: "  return Boolean(want && group && want === group);", to: "  return Boolean(want && group && (want === group || group.startsWith(want)));", breaks: "A6 — a prefix passes as the group" },
  { name: "the group is never consulted", file: DA,
    from: "      || favouredWeaponGroupMatches(aspect?.system?.favouredWeapon, weaponGroup))", to: ")", breaks: "B1 — a Dagger never reaches Oaths" },
  { name: "an empty favoured line matches every group", file: DA,
    from: "  return Boolean(want && group && want === group);", to: "  return Boolean(group && (!want || want === group));", breaks: "A5" },
  { name: "the attack bonus site drops the group", file: AW,
    from: "  for (const bonus of favouredWeaponAttackModifiers(aspectsOf(actor), weapon.name, weapon.system?.group)) {", to: "  for (const bonus of favouredWeaponAttackModifiers(aspectsOf(actor), weapon.name)) {", breaks: "C1" },
  { name: "the Devotion site drops the group", file: AW,
    from: "  const isFavouredWeapon = favouredWeaponSources(aspects, weapon.name, weapon.system?.group).length > 0;", to: "  const isFavouredWeapon = favouredWeaponSources(aspects, weapon.name).length > 0;", breaks: "C2" }
];

function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-favoured-weapon-group.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([DA, AW]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-favoured-weapon-group: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-favoured-weapon-group: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-favoured-weapon-group: OK — all ${results.length} mutations caught, tree restored.\n`);
// A SURVIVOR FAILS THE SWEEP (3.664.0): this harness reported FAILED and exited 0.
if (bad.length) process.exitCode = 1;
