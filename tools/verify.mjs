#!/usr/bin/env node
/**
 * verify — the sweep.
 *
 * REBUILT 23 August 2026 at 3.368.1. What it runs is a fraction of what
 * the original ran, and the missing part is named below rather than left
 * to be discovered: the anti-silence rule applies to the harness's own
 * coverage as much as to a rule that was held back.
 *
 * PRESENT:
 *   verify-no-undefined-names   a real no-undef over all sources
 *   verify-rules-have-callers   the uncalled-export ratchet
 *   verify-checks-can-fail      proof that the two above go red
 *   verify-death-watch          the death threshold and Phase 3 labelling
 *   mutate-death-watch          13 mutations against that verify file
 *   verify-opportunity-reach    an AoO is provoked AT reach, and refunded
 *   mutate-opportunity-reach    10 mutations against that verify file
 *   verify-grapple-critical     a better degree is never weaker (all actions)
 *   mutate-grapple-critical     10 mutations against that verify file
 *
 * ABSENT, AND THIS MATTERS:
 *   - 98 of the 99 per-rule verify files. Gone with the container. They
 *     encoded what each rule is supposed to do, chapter by chapter, and
 *     nothing here replaces them. Three have been written back, for the
 *     3.373.0, 3.374.0 and 3.375.0 batches; the rest of the chapters
 *     remain uncovered.
 *   - The 91 mutation files, and with them verify-driven-coverage and
 *     the driven-coverage budgets. Nothing here measures whether a rule
 *     is tested by DRIVING it rather than reading it.
 *   - verify-feat-coverage and the 436-row feat register.
 *
 * So a green run of this sweep means "no undefined names, and no new
 * uncalled exports". It does NOT mean the rules are correct, and it must
 * not be reported as though it does. Until the per-rule corpus exists
 * again, live testing in Graham's world carries the proof burden — which
 * is what it was already doing for everything the harness could not see.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

/*
 * THE LIST IS DISCOVERED, NOT WRITTEN DOWN, and 3.384.0 changed it to
 * that after finding out what a written-down list costs.
 *
 * It held three per-rule pairs. ELEVEN WERE ON DISK. The eight built
 * since 3.376.0 — forced movement, two Chapter 5 batches, riding and
 * reflexes, stale notes, skill Aid, Improved Reposition, casting feats,
 * effect grouping — had never been added, so they ran once each, in the
 * session that wrote them, and never again. Every "full sweep green"
 * reported since 3.376.0 was a sweep of a third of the harness.
 *
 * Nothing was broken by it. That is luck, not a defence: a regression in
 * any of those eight would have gone unreported, and the sweep would
 * have said green while saying nothing about them.
 *
 * It is §5.1 landing on the harness — a check with no caller is not a
 * check — and §5.5, measure before you claim. The fix is not to write a
 * longer list, because a longer list drifts the same way the moment
 * somebody adds a twelfth pair. Discovery plus the two assertions below
 * means a new check joins the sweep by EXISTING, and a check that cannot
 * be paired or run is a named failure rather than a quiet absence.
 */

/** Runs before the per-rule checks, in this order. */
const FIRST = ["verify-no-undefined-names.mjs", "verify-rules-have-callers.mjs"];
/** Runs last, because it drives the two generic checks above. */
const LAST = ["verify-checks-can-fail.mjs"];

const toolsDir = path.join(SYSTEM_ROOT, "tools");
const onDisk = fs.readdirSync(toolsDir).filter((f) => /^(verify|mutate)-.+\.mjs$/.test(f)).sort();

const perRule = onDisk
  .filter((f) => f.startsWith("verify-"))
  .filter((f) => !FIRST.includes(f) && !LAST.includes(f));

// EVERY PER-RULE VERIFY MUST HAVE A MUTATION FILE BESIDE IT. A verify
// nobody has seen fail is an opinion — the lesson the harness was
// rebuilt around — so an unpaired check is reported here rather than
// run and counted as proof.
const unpaired = perRule.filter((f) => !onDisk.includes(f.replace(/^verify-/, "mutate-")));

const CHECKS = [
  ...FIRST,
  ...perRule.flatMap((f) => [f, f.replace(/^verify-/, "mutate-")]),
  ...LAST
];

// AND NOTHING ON DISK MAY BE LEFT OUT. This is the assertion whose
// absence cost eight checks: it compares what will run against what
// exists, and names anything missed.
const missed = onDisk.filter((f) => !CHECKS.includes(f));

const results = [];
for (const script of CHECKS) {
  process.stdout.write(`\n── ${script}\n`);
  try {
    const out = execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", script)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    process.stdout.write(out);
    results.push({ script, ok: true });
  } catch (err) {
    process.stdout.write(`${err.stdout ?? ""}`);
    process.stderr.write(`${err.stderr ?? ""}`);
    results.push({ script, ok: false, code: err.status });
  }
}

const failed = results.filter((r) => !r.ok);
process.stdout.write(`\n${"─".repeat(60)}\n`);
for (const r of results) process.stdout.write(`${r.ok ? "  pass" : "  FAIL"}  ${r.script}\n`);

// THE TWO STRUCTURAL FAILURES, REPORTED WHETHER OR NOT ANY CHECK FAILED.
// A sweep that ran everything it knew about and stayed silent about what
// it did not know about is precisely how eight checks went missing.
for (const f of unpaired) {
  process.stdout.write(`  UNPAIRED  ${f} — no mutate- file beside it; unproven\n`);
}
for (const f of missed) {
  process.stdout.write(`  MISSED    ${f} — on disk and not run by this sweep\n`);
}

const structural = unpaired.length + missed.length;
process.stdout.write(
  failed.length || structural
    ? `\nverify: ${failed.length} of ${results.length} check(s) failed`
        + `${structural ? `, and ${structural} file(s) on disk are unpaired or unrun` : ""}.\n`
    : `\nverify: all ${results.length} checks pass — undefined names, the uncalled-export ratchet,\n`
        + `and every per-rule verify on disk with its mutation file beside it. Chapters with no\n`
        + `file of their own are still uncovered; this says nothing about those rules.\n`
);
process.exit(failed.length || structural ? 1 : 0);
