#!/usr/bin/env node
/**
 * mutate-healing-channel — can verify-healing-channel fail?
 * NEW at 3.475.0.
 *
 * F1 IS THE SHIPPED BUG, reported from a live table: appending the +10
 * instead of substituting it, so a ranged Cure healed 1d10 + 8 + 10. The
 * first mutation below puts exactly that back.
 *
 * F2 IS THE PROOF. If the dice half were an addition too — "1d8 + 1d10"
 * — the reading behind the bug would at least be consistent. It is not,
 * and asserting the dice half is what makes the flat half more than a
 * preference.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const H = path.join(SYSTEM_ROOT, "module", "magic", "healing-channel.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-healing-channel.mjs");

const MUTATIONS = [
  {
    // THE BUG GRAHAM REPORTED.
    file: H,
    name: "F1 THE LIVE BUG: the +10 is appended instead of replacing the +8",
    from: "    return upgraded.replace(FLAT_TERM, ` + ${RANGED_BONUS}`);",
    to: "    return `${upgraded} + ${RANGED_BONUS}`;",
    breaks: "F1 — a ranged Cure would heal 1d10 + 8 + 10 again"
  },
  {
    file: H,
    name: "F2 the dice are added rather than replaced",
    from: '  const upgraded = source.replace(DIE_FROM, DIE_TO);',
    to: '  const upgraded = source.replace(DIE_FROM, "d8 + 1d10");',
    breaks: "F2 — \"increased to d10's\" is not \"roll a d8 and a d10\""
  },
  {
    file: H,
    name: "F3 a touch cast gains the ranged bonus",
    from: "  if (!ranged) return upgraded;",
    to: "  if (!ranged) return `${upgraded} + ${RANGED_BONUS}`;",
    breaks: "F3 — the bracket says \"for ranged\""
  },
  {
    file: H,
    name: "F5 a ranged mode with no flat term gains nothing",
    from: "  return `${upgraded} + ${RANGED_BONUS}`;",
    to: "  return upgraded;",
    breaks: "F5 — the bonus would vanish for any future ranged mode"
  },
  {
    file: H,
    name: "F7 the bonus is not the feat's number",
    from: "const RANGED_BONUS = 10;",
    to: "const RANGED_BONUS = 8;",
    breaks: "F1/F7 — the feat says 10"
  },
  {
    file: H,
    name: "R1 the ranged test stops recognising feet",
    from: '  return /\\b(feet|ft)\\b/i.test(String(range ?? ""));',
    to: '  return /\\bmiles\\b/i.test(String(range ?? ""));',
    breaks: "R1 — the 30 ft mode would stop being ranged"
  },
  {
    file: H,
    name: "R3 every mode counts as ranged",
    from: '  return /\\b(feet|ft)\\b/i.test(String(range ?? ""));',
    to: "  return true;",
    breaks: "R2/R3 — touch and the radius mode would gain +10"
  },
  {
    file: H,
    name: "A3 the feat catches any spell starting with Cure",
    from: '  return Boolean(hasFeat) && /^cure$/i.test(String(spellName ?? "").trim());',
    to: '  return Boolean(hasFeat) && /^cure/i.test(String(spellName ?? "").trim());',
    breaks: "A3 — a Cure Wounds would be upgraded by a feat that names Cure"
  },
  {
    file: H,
    name: "A2 the feat applies without being owned",
    from: "  return Boolean(hasFeat) &&",
    to: "  return true &&",
    breaks: "A2 — every cleric would get it"
  },
  {
    file: C,
    name: "W2 the cast stops using the rule",
    from: "      return { ...effect, formula: healingChannelFormula(effect.formula, ranged) };",
    to: "      return effect;",
    breaks: "W2 — the feat would do nothing at all"
  },
  {
    file: C,
    name: "W5 every effect row is rewritten, not just heals",
    from: '      if (effect?.kind !== "heal" || !effect.formula) return effect;',
    to: "      if (!effect?.formula) return effect;",
    breaks: "W5 — a damage row on a healing spell would have its dice upgraded"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([H, C, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-healing-channel: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-healing-channel: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-healing-channel: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
