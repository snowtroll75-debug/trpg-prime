#!/usr/bin/env node
/**
 * regression-suite — the system-wide regression run (3.697.0).
 *
 * WHY THIS EXISTS. A repair to a shared engine (spellcasting, advancement,
 * Active Effects, the module API) can change the behaviour of features in
 * every companion module. `npm run verify` proves the core against itself;
 * it cannot see Pillars of Faith, Inner Tempest or Eldritch Arts. This
 * runner runs the core sweep AND every installed module's own verify and
 * mutate files against the working core (each module harness already reads
 * the core from TRG_PRIME_ROOT), so a core change is only green when the
 * modules that depend on it are green too.
 *
 * WHY IT IS RESUMABLE. The full core sweep takes well over ten minutes, and
 * a cloud session can lose its processes at any moment (it happened twice
 * while this file was being written). A run that cannot survive that never
 * finishes, and an unfinished sweep is easy to misreport as a green one. So
 * results are written to a state file after every script, keyed by a
 * fingerprint of the sources under test. Running the command again carries
 * on where it stopped; changing any source starts the run over.
 *
 * NOTHING IS COUNTED THAT DID NOT RUN. A module whose folder is missing is
 * reported as NOT RUN, never as passing, and the final verdict is red until
 * every listed suite has run to the end.
 *
 *   node tools/regression-suite.mjs [--modules=<dir>] [--budget=<seconds>]
 *                                   [--only=core,pof,it,ea] [--report] [--reset]
 *
 *   --modules  the folder holding the module checkouts, as
 *              <dir>/trg-pillars-of-faith, <dir>/trg-inner-tempest and
 *              <dir>/trg-eldritch-arts (default: TRG_MODULES_ROOT, else the
 *              core's parent folder).
 *   --budget   stop starting new scripts after this many seconds (default
 *              480), so one invocation fits inside a ten-minute command.
 *   --report   print the summary without running anything.
 *   --reset    forget recorded results.
 *
 * Exit code: 0 only when every suite has finished and every script passed;
 * 2 when the only gaps are BLOCKED checks (sourcebook text not present).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const MODULES_ROOT = path.resolve(args.modules ?? process.env.TRG_MODULES_ROOT ?? path.join(CORE, ".."));
const BUDGET_MS = Number(args.budget ?? 480) * 1000;
const STATE = path.join(CORE, "tools", ".regression-state.json");

/** The suites, in the order they run. The core goes first: a red core makes module results moot. */
const SUITES = [
  { key: "core", label: "TRG Prime core", root: CORE, kind: "core" },
  { key: "pof", label: "Pillars of Faith", root: path.join(MODULES_ROOT, "trg-pillars-of-faith"), kind: "module" },
  { key: "it", label: "Inner Tempest", root: path.join(MODULES_ROOT, "trg-inner-tempest"), kind: "module" },
  { key: "ea", label: "Eldritch Arts", root: path.join(MODULES_ROOT, "trg-eldritch-arts"), kind: "module" }
];

/**
 * The scripts a suite runs. The core list mirrors tools/verify.mjs exactly
 * (generic checks first, each verify followed by its mutate, the self-check
 * last). A module runs every verify file and, where one exists, its mutate.
 */
function suiteScripts(suite) {
  const dir = path.join(suite.root, "tools");
  if (!fs.existsSync(dir)) return null;
  const onDisk = fs.readdirSync(dir).filter((f) => /^(verify|mutate)-.+\.mjs$/.test(f)).sort();
  if (suite.kind === "core") {
    const FIRST = ["verify-no-undefined-names.mjs", "verify-rules-have-callers.mjs"];
    const LAST = ["verify-checks-can-fail.mjs"];
    const perRule = onDisk.filter((f) => f.startsWith("verify-") && !FIRST.includes(f) && !LAST.includes(f));
    return [...FIRST, ...perRule.flatMap((f) => [f, f.replace(/^verify-/, "mutate-")]).filter((f) => onDisk.includes(f)), ...LAST];
  }
  const verifies = onDisk.filter((f) => f.startsWith("verify-"));
  return verifies.flatMap((f) => {
    const m = f.replace(/^verify-/, "mutate-");
    return onDisk.includes(m) ? [f, m] : [f];
  });
}

/**
 * Fingerprint of everything under test: the tracked tree of the paths that
 * can change a check's result, plus any uncommitted change to them. Notes,
 * reports and the live console scripts are left out, so committing a
 * write-up does not throw away an hour of results. LevelDB housekeeping
 * files are left out too: opening a pack rewrites them.
 */
const UNDER_TEST = [".", ":(exclude)*.md", ":(exclude)tools/live", ":(exclude)docs",
  ":(exclude)**/LOG", ":(exclude)**/LOG.old", ":(exclude)**/CURRENT", ":(exclude)**/MANIFEST-*", ":(exclude)**/*.log"];
function fingerprint(roots) {
  const h = crypto.createHash("sha1");
  for (const root of roots) {
    if (!fs.existsSync(root)) { h.update(`absent:${root}`); continue; }
    try {
      const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", maxBuffer: 1 << 28 });
      h.update(git("ls-tree", "-r", "HEAD", "--", ...UNDER_TEST));
      h.update(git("diff", "HEAD", "--", ...UNDER_TEST));
      h.update(git("ls-files", "--others", "--exclude-standard", "--", ...UNDER_TEST, ":(exclude)packs"));
    } catch {
      h.update(`nogit:${root}`);
    }
  }
  return h.digest("hex");
}

/*
 * A KILLED MUTATION IS PUT BACK FIRST. If the last run died while a core
 * mutation file held a sabotaged source, the harness lock is stale and the
 * snapshot beside it holds the originals. Taking and releasing the lock
 * reclaims it and restores them, so the fingerprint below is taken of the
 * real sources rather than of a mutant.
 */
if (!args.report) {
  const { acquireLock } = await import("./lib/mutation-safety.mjs");
  acquireLock().release();
}

/*
 * One fingerprint per suite. The core's covers the core alone; a module's
 * covers the core AND the module, because a module's checks run against the
 * working core. So a core change re-runs everything, and a module change
 * re-runs only that module.
 */
const only = args.only ? String(args.only).split(",") : null;
const suites = SUITES.filter((s) => !only || only.includes(s.key));
const coreFp = fingerprint([CORE]);
const fpOf = (suite) => (suite.kind === "core" ? coreFp : fingerprint([CORE, suite.root]));

const state = (!args.reset && fs.existsSync(STATE)) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
if (!state.suites) state.suites = {};
for (const suite of suites) {
  const fp = fpOf(suite);
  if (state.suites[suite.key]?.fp !== fp) {
    if (state.suites[suite.key]) process.stdout.write(`${suite.label}: sources changed since its last run, so it starts over.\n`);
    state.suites[suite.key] = { fp, results: {} };
  }
}
const resultsOf = (suite) => state.suites[suite.key].results;
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

/*
 * DERIVED INPUTS. Some module checks need the core's compendium content as
 * plain JSON (Eldritch Arts' relic checks resolve granted spells against
 * the core spell pack). Read it fresh from the working core on every run,
 * from a copy of the pack so the core's LevelDB files are never opened in
 * place, and hand it over as TRG_PRIME_DUMP. A missing dump used to make
 * those checks see an empty spell list and fail in a misleading way.
 */
async function coreSpellsDump() {
  const out = path.join(CORE, "tools", ".regression-spells.json");
  const src = path.join(CORE, "packs", "spells");
  if (!fs.existsSync(src)) return null;
  const tmp = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "trg-spells-"));
  fs.cpSync(src, tmp, { recursive: true });
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  const docs = [];
  for await (const [k, v] of db.iterator({ gte: "!items!", lt: "!items!~" })) docs.push(v);
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(out, JSON.stringify(docs));
  return out;
}
const SPELLS_DUMP = args.report ? null : await coreSpellsDump();

/*
 * BLOCKED, NOT FAILED. A few module checks compare against the sourcebook's
 * own text, which is not kept in the module repositories. Without it they
 * cannot run at all; they are reported as BLOCKED, with what they need, and
 * the verdict says so. They are never counted as passing.
 */
const BLOCKED_PATTERNS = [/ENOENT[^\n]*\/book\//, /needs the v1\.6 source/, /book-text[^\n]*ENOENT|ENOENT[^\n]*book-text/];
const isBlocked = (tail) => BLOCKED_PATTERNS.some((re) => re.test(tail ?? ""));

const started = Date.now();
let outOfTime = false;
if (!args.report) {
  for (const suite of suites) {
    const scripts = suiteScripts(suite);
    if (!scripts) continue;
    for (const script of scripts) {
      if (resultsOf(suite)[script]) continue;
      if (Date.now() - started > BUDGET_MS) { outOfTime = true; break; }
      const t0 = Date.now();
      let ok = true, code = 0, tail = "";
      // ONE RETRY, AND ONLY FOR A PACK THAT WAS LOCKED. A check that opens a
      // LevelDB pack in place fails with "Database failed to open" while any
      // other process holds that pack. That says nothing about the rule under
      // test, so it is run again once; anything else is reported as it fell.
      for (let attempt = 0; attempt < 2; attempt++) {
        ok = true; code = 0; tail = "";
        try {
          execFileSync(process.execPath, [path.join(suite.root, "tools", script)], {
            cwd: suite.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28,
            env: { ...process.env, TRG_PRIME_ROOT: CORE, ...(SPELLS_DUMP ? { TRG_PRIME_DUMP: SPELLS_DUMP } : {}) }
          });
        } catch (err) {
          ok = false; code = err.status ?? -1;
          tail = `${err.stdout ?? ""}\n${err.stderr ?? ""}`.trim().split("\n").slice(-25).join("\n");
        }
        if (ok || !/Database failed to open|LEVEL_LOCKED/.test(tail)) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      const blocked = !ok && isBlocked(tail);
      resultsOf(suite)[script] = { ok, blocked, code, ms: Date.now() - t0, ...(tail ? { tail } : {}) };
      save();
      process.stdout.write(`${ok ? "  pass" : blocked ? "  BLKD" : "  FAIL"}  ${suite.key.padEnd(4)} ${script} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
    }
    if (outOfTime) break;
  }
}

// THE VERDICT.
let red = false;
let anyBlocked = false;
process.stdout.write(`\n${"─".repeat(64)}\nRegression suite — core fingerprint ${coreFp.slice(0, 12)}\n`);
for (const suite of suites) {
  const scripts = suiteScripts(suite);
  if (!scripts) {
    red = true;
    process.stdout.write(`  NOT RUN  ${suite.label}: no checkout at ${suite.root}\n`);
    continue;
  }
  const done = scripts.filter((s) => resultsOf(suite)[s]);
  const failed = done.filter((s) => !resultsOf(suite)[s].ok && !resultsOf(suite)[s].blocked);
  const blocked = done.filter((s) => resultsOf(suite)[s].blocked);
  if (blocked.length) anyBlocked = true;
  const unpaired = suite.kind === "module" ? scripts.filter((s) => s.startsWith("verify-") && !scripts.includes(s.replace(/^verify-/, "mutate-"))).length : 0;
  if (done.length < scripts.length || failed.length) red = true;
  process.stdout.write(`  ${done.length === scripts.length ? (failed.length ? "FAIL   " : "pass   ") : "PARTIAL"}  ${suite.label}: ${done.length}/${scripts.length} run, ${failed.length} failed${blocked.length ? `, ${blocked.length} blocked` : ""}`
    + `${unpaired ? ` (${unpaired} verify file(s) have no mutate file)` : ""}\n`);
  for (const s of blocked) process.stdout.write(`      BLOCKED ${s}: ${resultsOf(suite)[s].tail.split("\n").find((l) => /ENOENT|needs/.test(l))?.trim()}\n`);
  for (const s of failed) {
    process.stdout.write(`      FAIL ${s}\n${resultsOf(suite)[s].tail.split("\n").map((l) => `        ${l}`).join("\n")}\n`);
  }
}
if (outOfTime) process.stdout.write("\nTime budget reached: run the same command again to continue.\n");
process.stdout.write(red ? "\nregression-suite: NOT GREEN (incomplete or failing).\n"
  : anyBlocked ? "\nregression-suite: green, EXCEPT the BLOCKED checks above, which need sourcebook text this machine does not have and did not run.\n"
  : "\nregression-suite: every suite ran to the end and passed.\n");
process.exit(red ? 1 : anyBlocked ? 2 : 0);
