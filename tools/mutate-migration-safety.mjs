#!/usr/bin/env node
/**
 * mutate-migration-safety — can verify-migration-safety fail?
 *
 * NEW at 3.415.2. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE DEFECT ITSELF, restored as the one flag it was. If B1 cannot
 * catch this edit then the check is decoration, and the next migration
 * blanks the sheets again.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const MIGRATION = path.join(SYSTEM_ROOT, "module", "migration.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-migration-safety.mjs");

const MUTATIONS = [
  {
    file: MIGRATION,
    name: "THE DEFECT: the merge is suppressed again",
    // ANCHORED ON THE POOLED-MOVEMENT PASS'S OWN COMMENT (3.433.0). The
    // bare update line stopped being unique when a second pass adopted the
    // same safe shape — which is the shape working, not a problem, but it
    // left this mutation matching two places and therefore neither.
    from: "      // that does is the entire sheet.\n      await actor.update(update, { diff: false });",
    to: "      // that does is the entire sheet.\n      await actor.update(update, { diff: false, recursive: false });",
    breaks: "B1/C3 — every field the update does not name reverts to its template default"
  },
  {
    file: MIGRATION,
    name: "a migration writes a whole system object instead of dotted keys",
    from: "      update[`system.combat.movement.${field}`] = pooled;",
    to: "      update.system = { combat: { movement: { [field]: pooled } } };",
    breaks: "C1/C2 — a whole-object write blanks the sheet with no flag at all"
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

const guard = guardFiles([MIGRATION, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-migration-safety: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-migration-safety: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-migration-safety: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
