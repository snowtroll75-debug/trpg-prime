#!/usr/bin/env node
/**
 * verify-imports-resolve — does every module path this system imports exist?
 *
 * NEW at 3.598.0, and it exists because of a mistake I made an hour before
 * writing it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE HOLE.
 *
 * Writing `combat/sanctuary-gate.mjs` I opened it with
 *
 *     import { SYSTEM_ID } from "../constants.mjs";
 *
 * and there is no `module/constants.mjs` in this system. Every other file
 * declares that id as a local const. A static import of a path that does not
 * exist throws AT LOAD TIME, which in Foundry means the system does not
 * initialise at all — no sheets, no rolls, nothing — the worst failure mode
 * this project can ship.
 *
 * AND NOTHING WOULD HAVE CAUGHT IT. `verify-no-undefined-names` parses all
 * 538 files and was perfectly happy: `SYSTEM_ID` was an imported binding, so
 * the name resolved. The full sweep's 391 checks import a few dozen modules
 * between them and would not have touched this one. I found it by grepping
 * for where `SYSTEM_ID` actually lives, which is luck rather than method.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS CHECKS.
 *
 * Every relative specifier in every `.mjs` under `module/`, from both forms:
 *
 *   import … from "./x.mjs"        — static, throws at load
 *   await import("./x.mjs")        — dynamic, throws when that branch runs
 *
 * The dynamic ones matter as much: this codebase imports lazily almost
 * everywhere, so a wrong dynamic path is a spell that explodes the first
 * time somebody casts it, months after it shipped.
 *
 * Bare specifiers (`classic-level`) and absolute URLs are left alone — they
 * are resolved by the runtime, not by this tree.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ONE LINE THIS FILE CANNOT TEST ITSELF.
 *
 * `if (fixtures.length || …)` at the bottom. A mutation dropping it changes
 * no answer on a clean tree — no fixture is failing — and only matters when
 * paired with a broken scanner, which the mutation runner cannot arrange.
 * Something has to be trusted at the root of any self-checking thing, and
 * here it is the statement that reports a failed fixture. `mutate-imports-
 * resolve` records that rather than pretending otherwise.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const MODULE_ROOT = path.join(SYSTEM_ROOT, "module");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

/*
 * COMMENTS AND STRINGS ARE STRIPPED FIRST. This file's own header quotes the
 * bad import that prompted it, and a scan that read comments would report
 * that quotation as a defect — a check that cannot describe its own reason
 * without failing is a check nobody will keep.
 */
const strip = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const STATIC = /(?:^|[\s;}])(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["'](\.[^"']*)["']/g;
const DYNAMIC = /\bimport\s*\(\s*["'](\.[^"']*)["']\s*\)/g;

/**
 * Every relative specifier in one file's source, both forms, deduplicated.
 *
 * SEPARATED FROM THE WALK so the scanner can be driven against fixtures a
 * few lines below. A scan that only ever runs over a clean tree is a scan
 * nobody has seen find anything: remove the dynamic pattern and the sweep
 * stays green for ever, because there is nothing wrong on disk for it to
 * miss. The fixtures are what make the patterns load-bearing.
 */
export function scanSource(text) {
  const src = strip(String(text ?? ""));
  const found = [];
  const seen = new Set();
  for (const re of [STATIC, DYNAMIC]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      found.push(m[1]);
    }
  }
  return found;
}

/* ================================================================== *
 * F. THE SCANNER, DRIVEN AGAINST PLANTED SOURCE
 * ================================================================== */

const fixtures = [];
/* eslint-disable no-use-before-define */
const fix = (label, cond, detail = "") => {
  fixtureCount += 1;
  if (!cond) fixtures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};
let fixtureCount = 0;

fix("F1 a plain static import is found",
  scanSource('import { a } from "./x.mjs";').includes("./x.mjs"));
fix("F2 a parent-directory import is found",
  scanSource('import { a } from "../y/z.mjs";').includes("../y/z.mjs"));
fix("F3 A MULTI-LINE IMPORT LIST IS FOUND — this codebase is full of them",
  scanSource('import {\n  a, b,\n  c\n} from "./w.mjs";').includes("./w.mjs"));
fix("F4 A DYNAMIC IMPORT IS FOUND, which is how this codebase imports almost everything",
  scanSource('const { a } = await import("./lazy.mjs");').includes("./lazy.mjs"));
fix("F5 a re-export is found",
  scanSource('export { a } from "./re.mjs";').includes("./re.mjs"));
fix("F6 a side-effect import is found",
  scanSource('import "./side.mjs";').includes("./side.mjs"));
fix("F7 a bare specifier is left to the runtime",
  scanSource('import x from "classic-level";').length === 0);
fix("F8 AND A COMMENTED-OUT IMPORT IS NOT A DEFECT — this file's own header quotes one",
  scanSource('// import { S } from "../constants.mjs";').length === 0
  && scanSource('/* import { S } from "../gone.mjs"; */').length === 0);

/**
 * Is this specifier one a browser will fail to resolve?
 *
 * A PURE FUNCTION so the rule can be driven below. Node resolves
 * `./x` from disk; the browser's ES module loader fetches the specifier
 * literally and 404s — so a path that works in this harness and breaks in
 * Foundry is precisely what this file exists to refuse, and the rule needed
 * a test of its own: nothing on disk is extensionless, so removing the rule
 * altogether left the sweep green.
 */
export function extensionlessSpecifier(spec) {
  const s = String(spec ?? "");
  return !s.endsWith(".mjs") && !s.endsWith(".js") && !s.endsWith(".json");
}

/**
 * Does this run fail?
 *
 * ALSO PURE, AND FOR THE SAME REASON. With a clean tree `missing` is always
 * empty, so dropping it from the exit condition changed no answer and the
 * mutation survived — a check that finds a defect and then exits 0 is worse
 * than no check, because the sweep reports it green.
 */
export function shouldFail({ missing = 0, suspicious = 0, fixtures = 0 } = {}) {
  return missing > 0 || suspicious > 0 || fixtures > 0;
}

fix("F7b and a bare specifier in a DYNAMIC import is left alone too",
  scanSource('const x = await import("classic-level");').length === 0);
fix("F9 an extensionless specifier is refused",
  extensionlessSpecifier("./x") && extensionlessSpecifier("../a/b"));
fix("F9b and a real module path is not",
  !extensionlessSpecifier("./x.mjs") && !extensionlessSpecifier("../a/b.mjs"));
fix("F10 A MISSING FILE FAILS THE RUN, not merely gets printed",
  shouldFail({ missing: 1 }) && shouldFail({ suspicious: 1 }) && shouldFail({ fixtures: 1 }));
fix("F10b and a clean run does not fail", !shouldFail({}));

const files = walk(MODULE_ROOT);
/*
 * F11 GUARDS THE WALK ITSELF. Every `.mjs` directly under `module/` resolves
 * its imports, so a walk that stopped recursing still reported green — it
 * simply stopped looking at `module/magic`, `module/combat` and the rest,
 * which is where nearly all of this system lives. Presence measured instead
 * of reachability, one more time.
 */
fix("F11 the walk reaches the subdirectories, which is where the system lives",
  files.some((f) => path.relative(MODULE_ROOT, f).includes(path.sep)));
fix("F11b and it finds the whole tree rather than a corner of it",
  files.length > 400, `${files.length} files`);

let checked = 0;
const missing = [];
const suspicious = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  {
    for (const spec of scanSource(src)) {
      checked += 1;
      const resolved = path.resolve(path.dirname(file), spec);
      if (!fs.existsSync(resolved)) {
        missing.push(`${path.relative(SYSTEM_ROOT, file)} → ${spec}`);
        continue;
      }
      /*
       * AND AN EXTENSIONLESS PATH IS REPORTED TOO. Node resolves it on disk
       * here, but a browser — which is where this system actually runs —
       * does not: the ES module loader fetches the specifier literally. So a
       * path that works in the harness and 404s in Foundry is exactly the
       * kind of "green while broken" this file exists to refuse.
       */
      if (extensionlessSpecifier(spec)) {
        suspicious.push(`${path.relative(SYSTEM_ROOT, file)} → ${spec} (no extension; the browser will not resolve it)`);
      }
    }
  }
}

/*
 * THE FIXTURES GATE THE RUN DIRECTLY, and `shouldFail` gates only the disk
 * findings. Routing the fixtures through it too was self-defeating: a
 * mutation making `shouldFail` return false failed F10, F10 pushed onto
 * `fixtures`, and then the exit asked the sabotaged function whether that
 * mattered and was told no. A function must not be the sole judge of its own
 * test — which is the same lesson as `verify-checks-can-fail` existing at all.
 */
if (fixtures.length || shouldFail({ missing: missing.length, suspicious: suspicious.length })) {
  const total = missing.length + suspicious.length + fixtures.length;
  process.stderr.write(`verify-imports-resolve: ${total} of ${checked + fixtureCount} FAILED\n`);
  for (const f of fixtures) process.stderr.write(`  ✗ ${f}\n`);
  for (const f of missing) process.stderr.write(`  ✗ missing   ${f}\n`);
  for (const f of suspicious) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-imports-resolve: OK — ${checked} relative import paths in ${files.length} `
  + `files all resolve on disk, static and dynamic alike, and ${fixtureCount} scanner fixtures.\n`);
