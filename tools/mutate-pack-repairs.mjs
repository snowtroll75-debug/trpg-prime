#!/usr/bin/env node
/**
 * mutate-pack-repairs — can verify-pack-repairs fail?
 *
 * NEW at 3.431.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE MUTATIONS THAT MATTER HERE ARE NOT THE ONES THAT BREAK THE REPAIR.
 * They are the ones that make it write where it should not — because
 * this governs a migration, and the pass that blanked every player sheet
 * in Graham's world on 26 August 2026 also computed everything
 * correctly. Its defect was in HOW it wrote.
 *
 * #2, #3 and #9 are those: repairing a house-ruled copy, repairing a
 * copy that is already current, and swapping a manifest entry's two
 * sides so the migration writes history back over the truth.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "pack-repair.mjs");
const DATA = path.join(SYSTEM_ROOT, "module", "data", "pack-repairs.mjs");
const MIGRATION = path.join(SYSTEM_ROOT, "module", "migration.mjs");

/**
 * The version a line in migration.mjs carries RIGHT NOW.
 *
 * Both of the migration anchors below used to name a version in their own
 * text, and both went stale every time the constant was raised — reporting
 * ANCHOR MISSING, which is a mutation measuring nothing. Reading the value
 * removes the expiry date; the regex still pins the line's SHAPE, and a
 * change to that throws here rather than passing quietly.
 */
function versionIn(label, re) {
  const found = re.exec(fs.readFileSync(MIGRATION, "utf8"));
  if (!found) {
    console.error(`mutate-pack-repairs: cannot find the ${label} line in migration.mjs — `
      + `the anchor below would run against nothing, so this run is stopping instead.`);
    process.exit(1);
  }
  return found[1];
}
const currentSchema = versionIn("schema version", /export const TRG_SCHEMA_VERSION = "([^"]+)";/);
const currentGate = versionIn("stale-pack-copies gate",
  /const packCopies = \(await runIf\("([^"]+)", "stale owned copies of repaired pack items",/);
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-pack-repairs.mjs");

const MUTATIONS = [
  {
    file: RULE,
    name: "THE SHIPPED GAP: nothing is ever stale, so no copy is repaired",
    from: '    if (deepEquals(own, r.from)) state = "stale";',
    to: '    if (false) state = "stale";',
    breaks: "A1/C1 — every pack fix goes on stopping at the compendium"
  },
  {
    file: RULE,
    name: "THE DANGEROUS ONE: a house-ruled copy is repaired anyway",
    from: '    let state = "custom";\n    if (deepEquals(own, r.from)) state = "stale";',
    to: '    let state = "stale";\n    if (deepEquals(own, r.from)) state = "stale";',
    breaks: "A3/B1/B3 — a GM's own version is silently overwritten"
  },
  {
    file: RULE,
    name: "THE SECOND DANGEROUS ONE: an up-to-date copy is written again",
    from: '    else if (deepEquals(own, r.to)) state = "current";',
    to: '    else if (false) state = "current";',
    breaks: "A2/C2/C3 — the pass stops being idempotent and rewrites on every run"
  },
  {
    file: RULE,
    name: "key order decides whether a copy counts as broken",
    from: "  const ka = Object.keys(a);\n  const kb = Object.keys(b);\n  if (ka.length !== kb.length) return false;\n  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEquals(a[k], b[k]));",
    to: "  return JSON.stringify(a) === JSON.stringify(b);",
    breaks: "D1 — a Foundry round-trip reorders keys and a stale copy reads as house-ruled"
  },
  {
    file: RULE,
    name: "the update carries every row, not only the stale ones",
    from: '    if (row?.state !== "stale") continue;',
    to: '    if (row?.state === "neverMatches") continue;',
    breaks: "B1/C2/F4 — current and custom values are written back over"
  },
  {
    file: RULE,
    name: "nothing to do returns an empty update rather than null",
    from: "  return Object.keys(update).length ? update : null;",
    to: "  return update;",
    breaks: "C2/C4 — a caller counts an empty write as a change"
  },
  {
    file: RULE,
    name: "the update writes a whole object instead of dotted keys",
    from: "    update[`system.${row.field}`] = row.to;",
    to: "    update.system = { ...(update.system ?? {}), [row.field]: row.to };",
    breaks: "F3 — the exact shape that blanked every player sheet on 26 August"
  },
  {
    file: MIGRATION,
    name: "unlinked token actors are skipped",
    from: "    () => migrateStalePackCopies([...actors, ...tokenActors], Array.from(game.items ?? []))))",
    to: "    () => migrateStalePackCopies(actors, Array.from(game.items ?? []))))",
    breaks: "F2 — an unlinked token carries its own copies and keeps them stale"
  },
  {
    file: DATA,
    name: "a manifest entry has its two sides the wrong way round",
    from: '    field: "sustained", since: "3.430.0", from: false, to: true,',
    to: '    field: "sustained", since: "3.430.0", from: true, to: false,',
    breaks: "E5/E7 — the migration writes the pre-fix value over a correct copy"
  },
  {
    file: DATA,
    name: "an entry repairs a field to the value it already had",
    // RE-ANCHORED at 3.441.0: the manifest's `to` was hyphenated to follow
    // Core 3.7, so the old anchor's text no longer exists. Same mutation,
    // written against the line that is there now.
    from: '    from: "10-foot-radius centred on you",',
    to: '    from: "10-foot-emanation",',
    breaks: "E3/E7 — a no-op pretending to be a fix"
  },
  {
    file: MIGRATION,
    name: "THE OTHER SILENT FAILURE: the pass lags behind the manifest",
    // SELF-AIMING since 3.602.0, and that is the fix for a real problem. This
    // anchor had been re-typed by hand at 3.441.0, 3.552.1, 3.595.2 and
    // 3.601.0, because the gate moves EVERY time the manifest gains an entry
    // and F1b requires the two to match. Four re-anchors is four chances to
    // leave a mutation running against nothing, which is a check that cannot
    // fail — the exact shape this harness exists to catch. So the anchor now
    // READS the gate instead of repeating it, and `currentGate` throws if the
    // line it is looking for has changed shape.
    from: `  const packCopies = (await runIf("${currentGate}", "stale owned copies of repaired pack items",`,
    to: '  const packCopies = (await runIf("3.435.0", "stale owned copies of repaired pack items",',
    breaks: "F1b — a world past 3.435.0 skips the pass, so the ten new entries never apply"
  },
  {
    file: MIGRATION,
    name: "THE SILENT FAILURE: the schema version is not raised, so the pass never runs",
    // SELF-AIMING since 3.602.0, for the reason given above: the constant is
    // raised every release that adds a pass, and an anchor that repeats a
    // version is an anchor with an expiry date.
    from: `export const TRG_SCHEMA_VERSION = "${currentSchema}";`,
    to: 'export const TRG_SCHEMA_VERSION = "3.412.0";',
    breaks: "F7/F8 — the pass is written, checked, released and dead"
  },
  {
    file: MIGRATION,
    name: "the migration stops reporting what it changed",
    from: "Spells and items brought up to date",
    to: "Migration complete",
    breaks: "F5 — a silent write is the wrong shape whatever it writes"
  },
  {
    file: MIGRATION,
    name: "it reports the repairs but not the copies it refused",
    from: '          (left\n            ? `<p style="margin:6px 0 2px"><strong>Left alone</strong>',
    to: '          (false\n            ? `<p style="margin:6px 0 2px"><strong>Left alone</strong>',
    breaks: "F6 — a GM never learns their house-ruled spell was noticed and kept"
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

const guard = guardFiles([RULE, DATA, MIGRATION, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-pack-repairs: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-pack-repairs: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-pack-repairs: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
