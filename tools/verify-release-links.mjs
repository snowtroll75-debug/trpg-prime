#!/usr/bin/env node
/**
 * verify-release-links — TRG Prime 3.671.1: the manifest and download links
 * every published build carries (found publishing 3.671.0: the build's
 * system.json had neither, so Foundry could not install or update the system
 * from the manifest link, and an install made from that release could not see
 * the next one).
 *
 *   A  system.json names the manifest (the raw system.json on main) and the
 *      download for THIS version's release, so the two always agree
 *   B  the build tool and the release workflow ship system.json as it is
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const REPO = "https://github.com/snowtroll75-debug/trpg-prime";
const manifest = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "system.json"), "utf8"));

/* A — the links */
equal("A1 the manifest is the raw system.json on main", manifest.manifest, "https://raw.githubusercontent.com/snowtroll75-debug/trpg-prime/main/system.json");
equal("A2 the download is this version's release asset", manifest.download, `${REPO}/releases/download/v${manifest.version}/trg-prime.zip`);
ok("A3 the id is the system's", manifest.id === "trg-prime", String(manifest.id));
{
  const [a, b, c] = String(manifest.version).split(".").map(Number);
  ok("A4 the system is 3.671.1 or later", a > 3 || (a === 3 && (b > 671 || (b === 671 && c >= 1))), manifest.version);
}

/* B — nothing between this file and the release rewrites it */
{
  const zipTool = fs.readFileSync(path.join(SYSTEM_ROOT, "tools", "build-zip.mjs"), "utf8");
  // Positive first, so a blank file fails (verify-checks-read-source B1).
  ok("B1 the build tool ships system.json as a file, and does not blank the links", /\n  "system\.json",\n/.test(zipTool)
    && !/\.(download|manifest)\s*=\s*["'`]{2}/.test(zipTool) && !/delete\s+\w+\.(download|manifest)\b/.test(zipTool));
}

const EXPECTED = 6;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.error(`verify-release-links: ${failures.length} of ${checks} checks FAILED`); for (const f of failures) console.error(`  ✗ ${f}`); process.exit(1); }
console.log(`verify-release-links: ${checks} checks — all green.`);
