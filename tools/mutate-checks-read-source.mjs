#!/usr/bin/env node
/**
 * mutate-checks-read-source — can the meta-check fail?
 *
 * NEW at 3.427.0. SURVIVED and an unmatched anchor are both failures.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A CHECK ABOUT CHECKS HAS TO BE HELD TO ITS OWN STANDARD, and more
 * strictly than most: everything it asserts is second-hand, so every way
 * it could report a cheerful nothing is a way the whole harness could
 * quietly stop being examined.
 *
 * #1 IS THE ONE THAT MATTERS: a real assertion in a real check is made
 * vacuous on purpose — its regex replaced with one that matches anything
 * — and the meta-check must name it. That is the end-to-end proof that
 * the instrument detects the defect it was built for, rather than merely
 * running without complaint.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const META = path.join(SYSTEM_ROOT, "tools", "verify-checks-read-source.mjs");
const PRELOAD = path.join(SYSTEM_ROOT, "tools", "lib", "blank-read.mjs");
const VICTIM = path.join(SYSTEM_ROOT, "tools", "verify-emanation.mjs");
const CHECK = META;

const MUTATIONS = [
  {
    // THE END-TO-END PROOF, in the exact shape found on 27 August 2026:
    // a check that READS a file and never consults it. That was
    // verify-sustain-spell, which pulled magic/sustain.mjs into a
    // variable nothing used — a scan that could not have failed.
    file: VICTIM,
    name: "THE POINT: a check reads a file it never consults",
    from: 'const cast = read("module", "magic", "cast-workflow.mjs");',
    to: 'const cast = read("module", "magic", "cast-workflow.mjs");\n'
      + 'const unusedProbe = read("module", "magic", "spell-template.mjs");\n'
      + 'void unusedProbe;',
    breaks: "B1 — the new pair is discovered, blanked, and noticed by nobody"
  },
  {
    // THE BLINDFOLD. If blanking does nothing, every check passes and
    // every pair is vacuous — the loudest possible failure, and the one
    // that would otherwise turn this file into decoration.
    file: PRELOAD,
    name: "the blanking preload stops blanking",
    from: "      if (typeof file === \"string\" && path.resolve(file) === target) {",
    to: "      if (false) {",
    breaks: "B1 — nothing is hidden from anything, so no check can notice"
  },
  {
    // DISCOVERY, EMPTIED. A meta-check that finds nothing to test would
    // otherwise pass — precisely the shape it exists to catch.
    file: META,
    name: "the discovery finds nothing and reports success",
    from: "  for (const m of source.matchAll(/\\bread\\(\\s*((?:\"[^\"]+\"\\s*,\\s*)*\"[^\"]+\")\\s*\\)/g)) collect(m[1], \"helper\");",
    to: "",
    // RE-AIMED at 3.604.0: A1 is a floor of 95 and the harness now finds 481
    // pairs, so deleting this pattern left four hundred behind and the
    // mutation SURVIVED. A1b measures the shape instead of the size.
    breaks: "A1b — one whole discovery pattern vanishes, whatever the total"
  },
  {
    // DISCOVERY, NARROWED. Not to zero — to a handful, which is the
    // subtler version: enough pairs to look busy, far too few to be a
    // sweep. The ratchet is the only thing that can tell the difference.
    file: META,
    name: "the scan quietly covers only a few checks",
    from: "  .sort();",
    to: "  .sort()\n  .slice(0, 5);",
    breaks: "A1/A2 — a partial sweep reads as a full one without the count"
  },
  {
    // THE EXCUSE LIST MUST NOT BECOME A SUPPRESSION. Violated directly:
    // an entry with no reason must be refused.
    file: META,
    name: "an excuse is added with no reason",
    from: "const EXCUSED = new Map([",
    to: "const EXCUSED = new Map([\n  [\"verify-ward.mjs :: module/dice/check.mjs\", \"\"],",
    breaks: "B2 — an exception with no reason is a suppression"
  },
];

/*
 * TWO GUARDS ARE COVERED INDIRECTLY, AND DELIBERATELY SO.
 *
 * `vacuous.push(key)` and the `EXCUSED.has(key)` test can only be
 * exercised when something IS vacuous, so a mutation removing either is
 * inert on a clean tree — it changes nothing until there is something to
 * report. Mutation #1 drives exactly that path end to end: it creates a
 * vacuous pair and requires this file to name it, which is the only
 * condition under which either line runs.
 *
 * Five mutations were written against those two lines first, and all
 * five SURVIVED. They were not evidence of a weak check; they were
 * inert mutations. Recorded here because "the mutation was wrong, not
 * the code" is a conclusion worth being able to reach quickly, and this
 * project has reached it before.
 *
 * A SIXTH SURVIVED AND MEANT SOMETHING ELSE. It weakened ONE assertion
 * in verify-emanation and expected the pair to go vacuous — and the pair
 * did not, because that file makes a dozen other claims about the same
 * source and those still bite. That is not a flaw in the mutation: it is
 * the instrument's granularity, stated plainly in the check's own header.
 * A search for a check that consults a file exactly once found none, so
 * there is no honest single-assertion mutation to write here.
 */


function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([META, PRELOAD, VICTIM]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-checks-read-source: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-checks-read-source: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-checks-read-source: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
