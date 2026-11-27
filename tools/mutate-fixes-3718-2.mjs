#!/usr/bin/env node
/**
 * mutate-fixes-3718-2 — can verify-fixes-3718-2 fail? NEW at 3.718.2.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const WARP = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const PR = path.join(SYSTEM_ROOT, "module", "pack-repair.mjs");
const MIG = path.join(SYSTEM_ROOT, "module", "migration.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3718-2.mjs");

const MUTATIONS = [
  { file: WARP, name: "the multiplier is sold without a ceiling",
    from: "    return Math.max(1, Math.floor((Number(m.abilityMultiplierMax) - Number(m.abilityMultiplierFrom)) / Number(m.abilityMultiplierBump)));",
    to: "    return 99;", breaks: "A1" },
  { file: WARP, name: "a purchase adds nothing",
    from: "    if (m.abilityMultiplierBump) mods.abilityMultiplierBump += Number(m.abilityMultiplierBump) * times;", to: "", breaks: "A2" },
  { file: WARP, name: "the formula is not raised",
    from: "  return text.replace(/@castingAbility\\s*\\*\\s*(\\d+)/, (_m, n) => `@castingAbility * ${Number(n) + add}`);",
    to: "  return text;", breaks: "A4" },
  { file: EFFECTS, name: "the row ignores the multiplier",
    from: "          const rowFormula = multipliedAbilityFormula(effect.formula, warpMods?.abilityMultiplierBump);",
    to: "          const rowFormula = effect.formula;", breaks: "A7" },
  { file: PR, name: "a spell's repair reaches an ability again",
    from: "    .filter((r) => type === null || (r?.pack === \"spells\") === (type === \"spell\"));", to: "    ;", breaks: "B2" },
  { file: MIG, name: "the migration forgets the type",
    from: "repairsForName(PACK_REPAIRS, item?.name, item?.type ?? null)", to: "repairsForName(PACK_REPAIRS, item?.name)", breaks: "B5" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([WARP, EFFECTS, PR, MIG, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-fixes-3718-2: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-fixes-3718-2: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-fixes-3718-2: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
