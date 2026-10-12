#!/usr/bin/env node
/**
 * verify-feat-evidence — the measuring instrument, measured.
 *
 * NEW at 3.569.0, and overdue: `feat-evidence.mjs` is what this project
 * consults to answer "does anything implement this feat", its answers go
 * into audit reports, and until now nothing checked it at all.
 *
 * ───────────────────────────────────────────────────────────────────
 * THE FOURTH MISS IS WHY THIS FILE EXISTS.
 *
 * The block-12 audit reported twelve note-only feats — the entire Minor /
 * Major / Master × Arcane / Divinity / Ethereal / Verdant Caster family.
 * All twelve were fully built. The tool could not see them because it
 * decides "in code" with `code.includes(name)`, and those names are never
 * written down: they are composed from CASTER_TIERS × TRADITIONS so a new
 * tradition cannot be silently missing from the table.
 *
 * Good code, invisible to a text search. Every "note-only" figure quoted
 * since that family was built was inflated by twelve — 17 reported where
 * the truth was 5 — and the tool whose whole purpose is to stop false
 * "nothing implements this" claims was making one, twelve times over.
 *
 * WHAT THIS FILE GUARDS, therefore, is not the tool's arithmetic but its
 * HONESTY ABOUT WHAT IT CANNOT SEE:
 *
 *   A  the composed-name registry is real — every table imports, and
 *      every key in it names a feat that actually exists
 *   B  the twelve are classified by the route that explains them, and
 *      note-only means one thing again
 *   C  the tool still refuses to be quiet about a table it cannot read
 *
 * THE RATCHET IN SECTION B IS A CEILING ON `note-only` AND `NOTHING`.
 * Those two tiers are the ones that become written claims about
 * unimplemented rules, and the cost of this cycle was a claim of that
 * shape being wrong. The number may fall freely; it may not rise without
 * somebody looking at what was added and why.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { analyseFeats, COMPOSED_NAME_TABLES } from "./feat-evidence.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const toolSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "tools", "feat-evidence.mjs"), "utf8");
const { rows, unreadable, composedCount } = await analyseFeats();

/* ================================================================== *
 * A. THE REGISTRY IS REAL
 * ================================================================== */

ok("A1 the tool ran and classified every feat", rows.length > 400,
  `${rows.length} feats — if this collapses, every count below is meaningless`);

// EVERY TABLE MUST HAVE BEEN READ. `unreadable` is the tool's own report
// of registered tables it could not import; anything in it is a set of
// feats about to be misreported as unimplemented.
equal("A2 every registered name table was readable", unreadable.length, 0);
ok("A3 and the registry actually holds names", composedCount > 0,
  "an empty registry would make the composed route decorative");

/**
 * EVERY KEY MUST NAME A REAL FEAT. A lookup keyed on a name no feat has
 * is a rule the system will never apply — the Improved Combat Reflexes
 * lesson, where the code matched one string and the pack held another,
 * and the code and its test agreed with each other.
 *
 * Read out of the pack rather than restated, and the tables are imported
 * from the tool's own registry so this cannot check a different list
 * from the one the tool uses.
 */
{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "feats"), { valueEncoding: "json" });
  await db.open();
  const featNames = new Set();
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!") && value?.name) {
        featNames.add(String(value.name).trim().toLowerCase());
      }
    }
  } finally { await db.close(); }

  // THE REGISTRY ITSELF, IMPORTED. An earlier draft scanned it out of the
  // tool's source with a regex, and the check it fed compared a number to
  // itself — it could not fail. Reading the exported array means this
  // cannot check a different list from the one the tool uses, which was
  // the whole point of the check.
  ok("A4 the registry is exported and non-empty", COMPOSED_NAME_TABLES.length > 0,
    "if this is empty, A6 checks nothing");
  ok("A5 and every entry names a module and an export",
    COMPOSED_NAME_TABLES.every(([rel, exported]) =>
      typeof rel === "string" && rel.endsWith(".mjs") && typeof exported === "string" && exported.length > 0));

  const orphans = [];
  for (const [rel, exported] of COMPOSED_NAME_TABLES) {
    const module = await import(`file://${path.join(SYSTEM_ROOT, rel)}`);
    const table = module[exported];
    for (const key of Object.keys(table ?? {})) {
      if (!featNames.has(String(key).trim().toLowerCase())) orphans.push(`${exported}: "${key}"`);
    }
  }
  ok("A6 every key in every registered table names a feat that exists",
    orphans.length === 0,
    `${JSON.stringify(orphans)} — a lookup keyed on a name no feat has never fires`);
}

/* ================================================================== *
 * B. THE TWELVE, AND WHAT note-only MEANS NOW
 * ================================================================== */

const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r]));
const CASTER_FAMILY = [];
for (const tier of ["minor", "major", "master"]) {
  for (const tradition of ["arcane", "divinity", "ethereal", "verdant"]) {
    CASTER_FAMILY.push(`${tier} ${tradition} caster`);
  }
}
equal("B1 the family is twelve feats", CASTER_FAMILY.length, 12);

for (const name of CASTER_FAMILY) {
  const row = byName.get(name);
  ok(`B2 ${name} is in the pack`, Boolean(row));
  // COMPOSED, specifically — not merely "not note-only". If one of these
  // ever reads as `code` that is news: it would mean somebody wrote the
  // name out as a literal, and the table stopped being the single source.
  equal(`B3 ${name} is classified by the route that explains it`, row?.tier, "composed");
  ok(`B4 ${name} is not reported as a printed note`, row?.tier !== "note-only",
    "the state the tool shipped in, for twelve feats, for three releases");
}

// AND THE TIER MEANS ONE THING. Before 3.569.0 `note-only` meant both "a
// deliberate printed reminder" and "built under a name I cannot see".
const noteOnly = rows.filter((r) => r.tier === "note-only");
const nothing = rows.filter((r) => r.tier === "NOTHING");
ok("B5 no caster-family feat is left in note-only",
  !noteOnly.some((r) => CASTER_FAMILY.includes(r.name.toLowerCase())));

/**
 * THE RATCHET. These two tiers are the ones that turn into written claims
 * that a rule is unimplemented, and this cycle's cost was exactly such a
 * claim being wrong. Lower is fine and expected as more is built; higher
 * means either a real regression or a new blind spot, and both deserve a
 * person rather than a passing build.
 */
const UNIMPLEMENTED_CEILING = 5;
ok(`B6 no more than ${UNIMPLEMENTED_CEILING} feats read as unimplemented`,
  noteOnly.length + nothing.length <= UNIMPLEMENTED_CEILING,
  `${noteOnly.length} note-only + ${nothing.length} NOTHING = ${noteOnly.length + nothing.length}: `
  + JSON.stringify([...noteOnly, ...nothing].map((r) => r.name))
  + " — lower this ceiling when it falls; raising it needs a reason");

/* ================================================================== *
 * C. THE TOOL STILL DECLARES WHAT IT CANNOT SEE
 *
 * Every check above would pass on a tool that had quietly stopped
 * reporting its own gaps, which is the failure that produced them.
 * ================================================================== */

// THE RECORDING, NOT THE MESSAGE. A first draft checked only that the
// warning TEXT was present in the source — and a mutation that emptied
// the catch block survived it, because the message stayed where it was
// while nothing was left to put in it. The failure has to be RECORDED
// for the message to have anything to say.
ok("C1a a failed import is recorded, not swallowed",
  /catch \(error\) \{\s*unreadable\.push/.test(toolSrc),
  "an empty catch is how a table it cannot read becomes silence");
ok("C1b an export that is missing or not a table is recorded too",
  /unreadable\.push\(`\$\{rel\}#\$\{exported\} \(no such export/.test(toolSrc),
  "a name that resolves to undefined is the same gap without an exception");
ok("C1c and what was recorded is printed before any number",
  /registered name table\(s\) could not be read/.test(toolSrc)
  && /unreadable\.length/.test(toolSrc),
  "a table it cannot read is a set of feats it is about to misreport");
ok("C2 the remaining blind spot is printed with the numbers",
  /composed OUTSIDE those tables would still read as unimplemented/.test(toolSrc),
  "a tool that stops naming its limits is quoted as though it had none");
ok("C3 the `unknown` tier exists, so note-only cannot mean two things again",
  /tier = "unknown"/.test(toolSrc) && /else if \(notes > 0 && !inProse\)/.test(toolSrc),
  "a feat discussed in comments with no mechanism is unclassifiable, not a note");
ok("C4 comments are still stripped before the name match",
  /splitCodeAndComments/.test(toolSrc) && /const inCode = code\.includes\(name\)/.test(toolSrc),
  "without stripping, a feat described and never built reads as wired");

if (failures.length) {
  process.stderr.write(`\nverify-feat-evidence: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-feat-evidence: OK — ${checks} checks. ${composedCount} composed names read; `
  + `${noteOnly.length + nothing.length} feats read as unimplemented (ceiling ${UNIMPLEMENTED_CEILING}).\n`
);
