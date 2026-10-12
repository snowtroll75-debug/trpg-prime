#!/usr/bin/env node
/**
 * mutate-specialist-tradition — can verify-specialist-tradition fail?
 *
 * NEW at 3.388.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IS THE SHIPPED BUG, restored as one character. `??`
 * for `||` — a fallback that cannot reach itself, written by someone who
 * meant the right rule. It cost six tradition-keyed rules across 106
 * spells and errored nowhere.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "magic", "tradition-gate.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-specialist-tradition.mjs");

const MUTATIONS = [
  {
    name: "THE SHIPPED BUG: cast-workflow coalesces on nullish again",
    file: CAST,
    from: "  const tradition = effectiveSpellTradition(spellData.tradition, system.magic?.tradition);",
    to: '  const tradition = spellData.tradition ?? system.magic?.tradition ?? "";',
    breaks: "E1/E2 — 106 spells cast with no tradition, and six rules go quiet"
  },
  {
    // THE SAME BUG INSIDE THE RULE. `||` and a trim are what make an
    // empty string inherit; `??` here reproduces the defect one level down.
    name: "the resolver itself stops treating an empty string as absent",
    file: RULE,
    from: '  const own = String(spellTradition ?? "").trim();\n  if (own) return own;',
    to: "  const own = spellTradition;\n  if (own !== null && own !== undefined) return own;",
    breaks: "A3/A4/C2 — the empty-string case is exactly what shipped broken"
  },
  {
    name: "a spell's own tradition stops winning",
    file: RULE,
    from: "  if (own) return own;\n  return String(casterTradition ?? \"\").trim();",
    to: "  void own;\n  return String(casterTradition ?? \"\").trim();",
    breaks: "A1/A8 — every spell casts in the caster's tradition, ignoring its own"
  },
  {
    // A CASTER WITH NO TRADITION HAS NOTHING TO GIVE. Inventing one would
    // be worse than the blank, and would hand a Fighter arcane magic.
    name: "a blank caster tradition invents one",
    file: RULE,
    from: '  return String(casterTradition ?? "").trim();',
    to: '  return String(casterTradition ?? "").trim() || "arcane";',
    breaks: "A9 — a caster with no tradition is given one"
  },
  {
    name: "whitespace stops counting as blank",
    file: RULE,
    from: '  const own = String(spellTradition ?? "").trim();',
    to: '  const own = String(spellTradition ?? "");',
    breaks: "A4 — a tradition of spaces is treated as a real one"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RULE, CAST, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-specialist-tradition: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-specialist-tradition: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-specialist-tradition: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
