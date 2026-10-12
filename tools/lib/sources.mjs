/**
 * Source discovery and parsing, shared by the verify tools.
 *
 * REBUILT 23 August 2026 at 3.368.1, alongside the checks that use it.
 *
 * THE ONE RULE THIS FILE ENFORCES: a file that cannot be parsed is a
 * FAILURE, never a skip. Lesson 5.4 in the 23 August handover records
 * what the alternative costs — the previous lint "reported 'no undefined
 * names (warnings only)' on seven files it could not parse. A checker
 * that cannot read a file has not checked it." So `parseAll` collects
 * parse errors and hands them back as first-class results, and every
 * caller is expected to fail on them rather than filter them out.
 *
 * It is deliberately thin. §5.3 warns that a helper can encode the very
 * mistake it is meant to catch — the example on record is a check that
 * looked for a missing doc comment through a helper that strips
 * comments. So this file finds files and turns them into ASTs, and makes
 * no judgements of its own about what is in them.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as acorn from "acorn";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SYSTEM_ROOT = path.resolve(HERE, "..", "..");

/** Directories that hold shipped source. `tools/` checks itself too. */
export const SOURCE_ROOTS = ["module", "scripts"];

const SKIP_DIRS = new Set(["node_modules", ".git", "packs", "assets", "styles", "templates", "lang"]);

/**
 * Every .mjs/.js file under the given roots, as absolute paths, sorted
 * so that every run reports in the same order — an unstable order turns
 * a diff of two runs into noise and hides the one line that changed.
 *
 * @param {string[]} [roots] Relative to the system root.
 * @returns {string[]}
 */
export function findSourceFiles(roots = SOURCE_ROOTS) {
  const out = [];
  for (const root of roots) {
    const abs = path.resolve(SYSTEM_ROOT, root);
    if (!fs.existsSync(abs)) continue;
    walk(abs, out);
  }
  return out.sort();
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (/\.(mjs|js)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

/** A path as it should appear in a report — relative, forward slashes. */
export function rel(absPath) {
  return path.relative(SYSTEM_ROOT, absPath).split(path.sep).join("/");
}

/**
 * Parse one file.
 *
 * Returns `{file, rel, source, ast}` on success and `{file, rel, source,
 * error}` on failure. It does not throw, because a single unparseable
 * file should produce a named failure in the report rather than killing
 * the run before the other 303 files are looked at.
 */
export function parseFile(absPath) {
  const source = fs.readFileSync(absPath, "utf8");
  const base = { file: absPath, rel: rel(absPath), source };
  try {
    const ast = acorn.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
      // eslint-scope reads node.range when it decides whether a
      // declaration is visible at a reference. acorn emits start/end by
      // default and range only when asked, and without it the scope
      // analyser throws part-way through the tree — which would have
      // looked like an unparseable file rather than a missing option.
      ranges: true,
      allowHashBang: true
    });
    return { ...base, ast };
  } catch (err) {
    return {
      ...base,
      error: {
        message: err.message,
        line: err.loc?.line ?? null,
        column: err.loc?.column ?? null
      }
    };
  }
}

/**
 * Parse every file, keeping the failures.
 *
 * @returns {{parsed: object[], failed: object[]}}
 */
export function parseAll(files = findSourceFiles()) {
  const parsed = [];
  const failed = [];
  for (const f of files) {
    const result = parseFile(f);
    (result.error ? failed : parsed).push(result);
  }
  return { parsed, failed };
}

/**
 * The standard "some files could not be read" report.
 *
 * Every check calls this and exits non-zero if it returns true. It is a
 * shared function precisely so that no individual check can quietly
 * decide to tolerate an unparseable file.
 */
export function reportParseFailures(failed, checkName) {
  if (!failed.length) return false;
  process.stderr.write(
    `\n${checkName}: ${failed.length} file(s) could not be parsed. ` +
      `This is a failure, not a skip — an unparsed file has not been checked.\n`
  );
  for (const f of failed) {
    const where = f.error.line ? `${f.error.line}:${f.error.column}` : "?";
    process.stderr.write(`  ${f.rel}:${where}  ${f.error.message}\n`);
  }
  return true;
}
