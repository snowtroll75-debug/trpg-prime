#!/usr/bin/env node
/**
 * build-zip — the shippable system, and nothing else.
 *
 * The exclusion list is IN THIS FILE rather than in whoever's shell
 * history, because a release built with the flags half-remembered is a
 * release that ships a node_modules tree or the pack sources.
 *
 * TOOLS/ IS INCLUDED, ON PURPOSE, AND THAT IS A CHANGE. The original
 * build excluded it. It was excluded on 23 August too, for about ten
 * minutes, until Graham pointed out the obvious: the zip is the only way
 * anything leaves the build environment, and the harness that had to be
 * rebuilt that same morning was lost precisely because it never left.
 * A build artefact that drops the thing you cannot afford to lose is not
 * a tidier build, it is the same accident waiting.
 *
 * It is safe to ship. Foundry loads only what `system.json` declares
 * under `esmodules`, and nothing there points into tools/, so the
 * harness is inert in a player's install — it is carried, not run. It
 * needs `npm install` before it will do anything, which is why
 * package.json travels with it.
 *
 * Excluded, and why:
 *   node_modules/   large, platform-specific, and `npm install` rebuilds it
 *   .git/           history belongs in a remote, not in a release zip
 *   packs-source/   the source form of the compiled packs
 *
 * The archive's single top-level directory is `trg-prime`, which is what
 * Foundry expects to find under Data/systems.
 *
 * Usage: node tools/build-zip.mjs [--out <dir>]
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const EXCLUDE_DIRS = ["node_modules", ".git", "packs-source"];
/*
 * THE HARNESS'S OWN SCRATCH (3.589.0). `tools/.harness.lock` and
 * `tools/.harness.snapshot.json` exist only while a mutation run is in
 * flight — and the snapshot is a base64 copy of every file that run
 * guards, which for a sweep is most of `module/`. Shipping it would add
 * megabytes of duplicated source to every release and would put a
 * half-mutated tree in somebody's install if a run had been killed.
 */
const EXCLUDE_FILES = ["tools/.harness.lock", "tools/.harness.snapshot.json"];

/**
 * Paths that must be PRESENT. The exclusion check below proves that
 * nothing unwanted got in; this proves that nothing wanted got left
 * out — which is the failure that actually happened to this project.
 * A zip missing the harness looks perfectly healthy from the outside.
 */
const REQUIRE_PRESENT = [
  "system.json",
  "template.json",
  "package.json",
  "tools/verify.mjs",
  "tools/README.md",
  "tools/lib/mutation-safety.mjs"
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const version = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "system.json"), "utf8")).version;
const outDir = path.resolve(arg("out", path.join(SYSTEM_ROOT, "..", "..")));
const outFile = path.join(outDir, `trg-prime-${version}.zip`);

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(outFile, { force: true });

// Zipped from the PARENT so the archive contains `trg-prime/...`.
const parent = path.dirname(SYSTEM_ROOT);
const base = path.basename(SYSTEM_ROOT);
const excludes = [
  ...EXCLUDE_DIRS.map((d) => `${base}/${d}/*`),
  ...EXCLUDE_FILES.map((f) => `${base}/${f}`)
];

execFileSync("zip", ["-qr", outFile, base, "-x", ...excludes], { cwd: parent, stdio: "inherit" });

// VERIFY THE EXCLUSIONS RATHER THAN TRUSTING THEM. A silently-wrong -x
// pattern produces a zip that looks right and ships the harness; the
// only way to know is to read back what actually landed in it.
const listing = execFileSync("unzip", ["-Z1", outFile], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const leaked = listing.filter((entry) => {
  const rest = entry.slice(base.length + 1);
  return (
    EXCLUDE_DIRS.some((d) => rest === `${d}/` || rest.startsWith(`${d}/`)) ||
    EXCLUDE_FILES.includes(rest)
  );
});

const present = new Set(listing.map((entry) => entry.slice(base.length + 1)));
const missing = REQUIRE_PRESENT.filter((p) => !present.has(p));

if (leaked.length || missing.length) {
  if (leaked.length) {
    process.stderr.write(
      `build-zip: ${leaked.length} excluded path(s) reached the archive anyway:\n` +
        leaked.slice(0, 20).map((l) => `  ${l}`).join("\n") + "\n"
    );
  }
  if (missing.length) {
    process.stderr.write(
      `build-zip: ${missing.length} required path(s) are NOT in the archive:\n` +
        missing.map((l) => `  ${l}`).join("\n") +
        `\nA zip that quietly drops the harness is how the last one was lost.\n`
    );
  }
  process.stderr.write(`The zip at ${outFile} is NOT shippable.\n`);
  process.exit(1);
}

const bytes = fs.statSync(outFile).size;
process.stdout.write(
  `build-zip: ${path.basename(outFile)} — ${listing.length} entries, ` +
    `${(bytes / 1024 / 1024).toFixed(1)} MB\n` +
    `  excluded: ${EXCLUDE_DIRS.join(", ")} — confirmed absent\n  harness: confirmed present (${REQUIRE_PRESENT.length} required paths)\n` +
    `  ${outFile}\n`
);
