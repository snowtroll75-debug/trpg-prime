#!/usr/bin/env node
/**
 * verify-checks-read-source — a check that scans a file must depend on
 * what is in it.
 *
 * NEW at 3.427.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, in the words of the five times it was needed.
 *
 * On 27 August 2026 five separate source-scanning assertions in this
 * harness were found to be VACUOUS — true statements about the wrong
 * text, passing against code that did not do what they claimed:
 *
 *   - the one-owner check for the d100 zero rule reported five owners,
 *     four of which were the COMMENT PARAGRAPHS explaining that the
 *     copies were gone;
 *   - `verify-resume-outcome`'s C2 asserted a field was assigned
 *     somewhere in the file, when the defect was that it was assigned
 *     too LATE — a claim about presence cannot catch one about sequence;
 *   - `verify-sustain-spell`'s ordering claims compared positions across
 *     the whole file, where every name also appears in the import block,
 *     so they compared the order of IMPORTS;
 *   - `verify-emanation`'s F1 asked only that a `region.update(...)`
 *     block existed — replacing the LOOKUP with null left it intact and
 *     merely unreachable;
 *   - the same file's F4 searched four hundred characters after one hook
 *     for a call and found the NEXT hook's.
 *
 * Two of those guarded shipped defects and both defects survived their
 * own mutation run. Green was not evidence, five times in one day.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE QUESTION THIS ASKS, AND WHY IT IS MECHANICAL.
 *
 * Every one of those checks reads a source file and makes claims about
 * its text. So: blank that text, and see whether the check notices.
 *
 * A check that passes against a file it cannot see is not checking it.
 * That is decidable without anybody thinking of the right mutation
 * first — which is the difference between this and a mutate file, and
 * the reason it can be run over all ninety-nine pairs at once rather
 * than over the cases somebody remembered.
 *
 * NOTHING IS WRITTEN TO DISK. `tools/lib/blank-read.mjs` intercepts the
 * read in the child process, so the module still imports and only the
 * text goes blank — see that file for why blanking the file itself
 * would have measured the wrong thing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS CANNOT SEE, WHICH IS MOST OF WHAT IT WAS BUILT FOR.
 *
 * It works at the granularity of a (check, file) PAIR: it can tell you
 * that a check does not depend on a file at all. It cannot tell you that
 * ONE assertion among a dozen on that file is vacuous, because the other
 * eleven still fail when the file goes blank and the pair looks healthy.
 *
 * Of the five vacuous assertions that prompted this file, it would have
 * caught two — the dead read, and a table read but never depended upon.
 * The other three were single weak claims among strong neighbours, and
 * this instrument is blind to them. A mutation was written to prove
 * otherwise and survived, which is how the limit was established rather
 * than assumed; a search for any check that consults a file exactly once
 * found none, so there is not even a corner where it happens to work.
 *
 * Saying so here because a meta-check that is believed to cover more
 * than it does is worse than no meta-check: it is the same defect it
 * exists to find, one level up. Per-assertion vacuity needs a different
 * instrument, and this is not it.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { SYSTEM_ROOT, rel } from "./lib/sources.mjs";

const TOOLS = path.join(SYSTEM_ROOT, "tools");
const PRELOAD = path.join(TOOLS, "lib", "blank-read.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ------------------------------------------------------------------ *
 * WHICH FILES EACH CHECK SCANS.
 *
 * Read from the checks' own source, because a hand-kept list would rot
 * the first time a check learned to read something new — and rot
 * SILENTLY, in the direction of testing less.
 * ------------------------------------------------------------------ */
function scannedFiles(source, perPattern = null) {
  const found = new Set();
  const collect = (list, pattern) => {
    const parts = list.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (!parts.every((p) => p && !p.includes("${"))) return;
    found.add(parts.join(path.sep));
    if (perPattern) perPattern[pattern] = (perPattern[pattern] ?? 0) + 1;
  };
  // The `read("module", "x.mjs")` helper most checks define.
  for (const m of source.matchAll(/\bread\(\s*((?:"[^"]+"\s*,\s*)*"[^"]+")\s*\)/g)) collect(m[1], "helper");
  // And the longhand it is shorthand for.
  for (const m of source.matchAll(
    /readFileSync\(\s*path\.join\(\s*SYSTEM_ROOT\s*,\s*((?:"[^"]+"\s*,\s*)*"[^"]+")\s*\)/g)) collect(m[1], "longhand");
  return [...found];
}

const verifyFiles = fs.readdirSync(TOOLS)
  .filter((f) => /^verify-.*\.mjs$/.test(f))
  .filter((f) => f !== "verify-checks-read-source.mjs")
  .sort();

const pairs = [];
for (const file of verifyFiles) {
  const source = fs.readFileSync(path.join(TOOLS, file), "utf8");
  for (const scanned of scannedFiles(source)) {
    const abs = path.join(SYSTEM_ROOT, scanned);
    if (fs.existsSync(abs)) pairs.push({ check: file, scanned, abs });
  }
}

/* ------------------------------------------------------------------ *
 * THE DISCOVERY MUST BE ABLE TO FAIL.
 *
 * If the extraction above stops matching, this file would find nothing
 * to test and report a cheerful zero — a check that passes because it
 * looked at nothing, which is the very shape it exists to catch. So the
 * count is a ratchet.
 * ------------------------------------------------------------------ */
ok("A1 the scan discovered the checks that read source",
  pairs.length >= 95, `${pairs.length} (check, file) pairs found`);
/*
 * A1b IS WHY A1 ALONE WAS NOT ENOUGH, found at 3.604.0.
 *
 * A1 is a FLOOR, and a floor set at 95 stopped measuring anything once the
 * harness grew to 481 pairs: deleting one of the two discovery patterns
 * outright still left four hundred, so `mutate-checks-read-source` reported
 * SURVIVED on a mutation that had removed half the discovery.
 *
 * A floor that the truth has outgrown is a check that cannot fail — the same
 * expiry date the mutation anchors carried until 3.602.0. So the claim is now
 * about the SHAPE of the discovery rather than its size: both patterns must
 * find something, which is true of a healthy harness and false the moment
 * either is deleted, whatever the total.
 */
{
  const perPattern = {};
  for (const file of verifyFiles) {
    scannedFiles(fs.readFileSync(path.join(TOOLS, file), "utf8"), perPattern);
  }
  ok("A1b BOTH DISCOVERY PATTERNS FIND SOMETHING",
    (perPattern.helper ?? 0) > 0 && (perPattern.longhand ?? 0) > 0,
    `helper ${perPattern.helper ?? 0}, longhand ${perPattern.longhand ?? 0} — a deleted `
    + "pattern hides whole checks from this file, and the total is far too large for a "
    + "floor to notice");
}
ok("A2 across most of the harness",
  new Set(pairs.map((p) => p.check)).size >= 30,
  `${new Set(pairs.map((p) => p.check)).size} checks scan source`);

/* ------------------------------------------------------------------ *
 * DECLARED EXCEPTIONS.
 *
 * A check whose only claim about a file is that something is ABSENT
 * cannot fail when the file is blank — absence is more true of an empty
 * file, not less. That is a real limit of this instrument rather than a
 * defect in the check, so such pairs are declared here WITH A REASON,
 * exactly as verify-rules-have-callers declares its keeps.
 *
 * Anything not on this list must notice.
 * ------------------------------------------------------------------ */
const EXCUSED = new Map([
  // ── ABSENCE-ONLY CLAIMS ──────────────────────────────────────────
  // Each of these reads a file solely to assert something is NOT in it.
  // An empty file satisfies that more strongly, not less, so no blanking
  // can make them fail. The claim is still worth making; this instrument
  // simply cannot measure it.
  ["verify-percentile-bias.mjs :: module/dice/check.mjs",
    "F3 asserts `chosenTen` is absent — the shape only the wrong d100 rule produces."],
  ["verify-healing-earth.mjs :: module/magic/cast-workflow.mjs",
    "G10 asserts a duplicated caster-level expression is absent."],
  ["verify-opportunity-reach.mjs :: module/combat/opportunity-rules.mjs",
    "D1 asserts no orphaned `movementResumes` rule remains."],
  ["verify-casting-feats.mjs :: module/magic/memorisation.mjs",
    "asserts `canCastSpell` is no longer exported from that module."],

  // ── READ ONLY ON A PATH THIS RUN DOES NOT TAKE ───────────────────
  ["verify-rules-have-callers.mjs :: system.json",
    "read only inside the --update branch, to stamp the version onto the "
    + "rewritten ratchet file; an ordinary run never opens it."]
]);

function runBlanked(check, abs) {
  try {
    const out = execFileSync(process.execPath, ["--import", PRELOAD, path.join(TOOLS, check)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TRG_BLANK_READ: abs }
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const vacuous = [];
const crashed = [];
for (const pair of pairs) {
  const key = `${pair.check} :: ${pair.scanned}`;
  const result = runBlanked(pair.check, pair.abs);
  if (result.code === 0) {
    if (!EXCUSED.has(key)) vacuous.push(key);
    continue;
  }
  // NOTICED, but distinguish HOW. A check that fails an assertion has
  // done its job; one that merely crashed has depended on the file in a
  // way that says nothing about its claims, so it is reported apart
  // rather than counted as evidence.
  if (!/checks FAILED/.test(result.out)) crashed.push(key);
}

ok("B1 every check that scans a file notices when that file goes blank",
  vacuous.length === 0,
  `${vacuous.length} vacuous:\n    ${vacuous.join("\n    ")}`);

// NOT A FAILURE, a note — but a loud one, because a crash is a weaker
// signal than a failed assertion and the difference should be visible.
if (crashed.length) {
  process.stdout.write(
    `  note: ${crashed.length} pair(s) noticed by crashing rather than by failing an assertion:\n`
    + crashed.map((c) => `    ${c}\n`).join(""));
}

ok("B2 the excuse list carries a reason for every entry",
  [...EXCUSED.values()].every((reason) => String(reason ?? "").trim().length > 10),
  "an exception with no reason is a suppression");

/* ------------------------------------------------------------------ */

const label = "verify-checks-read-source";
process.stdout.write(`${label}: ${pairs.length} (check, file) pairs exercised\n`);
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
