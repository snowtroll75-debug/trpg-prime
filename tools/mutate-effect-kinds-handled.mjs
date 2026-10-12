#!/usr/bin/env node
/**
 * mutate-effect-kinds-handled — can verify-effect-kinds-handled fail?
 *
 * NEW at 3.435.1. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE STATE THAT SHIPPED. #2 and #3 are the two ways the READER
 * could go blind — the failure this project has met more often than any
 * defect, and the reason A1/A2 exist at all: a check that cannot see
 * `damage` would report it unhandled, and a check that could not see a
 * `case` would pass no matter what was deleted.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-effect-kinds-handled.mjs");

const MUTATIONS = [
  {
    file: EFFECTS,
    name: "THE STATE THAT SHIPPED: perTurn falls through to the default",
    from: '        case "perTurn":\n          break;\n',
    to: "",
    breaks: 'B2 — Luminance prints \'Unhandled effect kind "perTurn"\' once per creature'
  },
  {
    file: EFFECTS,
    name: "the hundred and thirty notes go back to printing as broken",
    // THE REACHABLE ROUTE, not the pretty one. `case "note":` further
    // down is DEAD CODE — the guard here `continue`s before the switch
    // is ever reached — and a mutation aimed at the case survived,
    // correctly: deleting unreachable code breaks nothing. The check was
    // right and the mutation was wrong, which is the only way round of
    // those two that is any good.
    from: '    if (effect.kind === "note") {',
    to: "    if (false) {",
    breaks: "A1/B2 — Polymorph Other and Gaseous Form, exactly as they were"
  },
  {
    file: EFFECTS,
    name: "the pre-switch guard is the one deleted",
    from: '    if (effect.kind === "damage") {',
    to: "    if (false) {",
    breaks: "A2/B2 — the route a case-only reader cannot see"
  },
  {
    file: CHECK,
    name: "THE BLIND READER: only switch cases are counted",
    from: '  const byGuard = [...code.matchAll(/effect\\.kind\\s*===\\s*"([A-Za-z]+)"/g)].map((m) => m[1]);',
    to: "  const byGuard = [];",
    breaks: "A2 — damage would be reported unhandled, and believed"
  },
  {
    file: CHECK,
    name: "THE CREDULOUS READER: comments count as code",
    from: '  const code = String(source)\n    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, " ")\n    .replace(/(^|[^:])\\/\\/[^\\n]*/g, "$1 ");',
    to: "  const code = String(source);",
    breaks: "A3 — this file's own prose names every kind, so nothing could ever fail"
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

const guard = guardFiles([EFFECTS, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-effect-kinds-handled: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-effect-kinds-handled: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-effect-kinds-handled: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
