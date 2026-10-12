#!/usr/bin/env node
/**
 * mutate-use-before-declaration — can the TDZ check fail?
 *
 * NEW at 3.393.1. SURVIVED and an unmatched anchor are both failures.
 *
 * M1 IS THE ACTUAL BUG, PUT BACK. It reintroduces the 3.393.0 defect
 * verbatim — a push onto `lines` from above where `lines` is declared —
 * in the real file, and the check must go red. That is the only thing
 * that shows this check would have caught it, rather than being written
 * to describe a bug already fixed.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-use-before-declaration.mjs");

const MUTATIONS = [
  {
    // THE 3.393.0 BUG, VERBATIM. Moving the push back above `lines`.
    name: "THE REAL BUG: a push onto `lines` from above its declaration",
    file: CAST,
    from: "  const chaos = (isInnate || noCheckCantrip) ? false : Boolean(check?.dice?.chaos);",
    to: "  const chaos = (isInnate || noCheckCantrip) ? false : Boolean(check?.dice?.chaos);\n"
      + "  if (noCheckCantrip) lines.push(\"x\");",
    breaks: "B1 — every cantrip threw 'Cannot access lines before initialization'"
  },
  {
    // ANCHORED ABOVE THE DECLARATION, and the first attempt was not:
    // it inserted the read BELOW `const lines = []`, where reading it
    // is perfectly legal, and the mutation survived because the code
    // was fine. Four functions in this file declare `const lines = []`,
    // so the anchor is the unique line above the one in castSpell.
    name: "a const read one line above itself",
    file: CAST,
    from: "    await innateSpend.item.update({ \"system.usesValue\": innateSpend.value });",
    to: "    await innateSpend.item.update({ \"system.usesValue\": innateSpend.value });\n    void lines;",
    breaks: "B1 — the simplest possible instance of the same fault"
  },
  {
    // THE DEAD-ZONE KINDS ARE THE POINT. `var` hoists and initialises;
    // widening this to include it would report legal code everywhere.
    name: "the check stops distinguishing let/const from var",
    file: CHECK,
    from: '      if (!["let", "const", "class"].includes(kind)) continue;',
    to: "      if (false) continue;",
    breaks: "A6 — `var` has no dead zone and must not be reported"
  },
  {
    // THE CONSERVATISM IS LOAD-BEARING. Without it every callback defined
    // above a binding it closes over is reported, the check cries wolf,
    // and it gets switched off.
    name: "closures stop being exempt",
    file: CHECK,
    from: "        if (functionScopeOf(ref.from) !== declScope) continue;",
    to: "        if (false) continue;",
    breaks: "A4/A5 — legal deferred reads reported as errors"
  },
  {
    name: "position stops mattering",
    file: CHECK,
    from: "        if (at == null || at >= declaredAt) continue;",
    to: "        if (at == null) continue;",
    breaks: "A3 — a read BELOW the declaration reported as a dead-zone read"
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

const guard = guardFiles([CAST, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-use-before-declaration: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-use-before-declaration: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-use-before-declaration: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
