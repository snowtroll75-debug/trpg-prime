#!/usr/bin/env node
/**
 * mutate-temporary-immunity — can verify-temporary-immunity fail?
 *
 * NEW at 3.400.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #2 IS THE QUIET ONE. Re-stamping an immunity that is already running
 * must not SHORTEN it, and the naive `until` assignment does exactly
 * that. It is invisible while every rule uses the same interval — which
 * today they nearly do — and wrong the moment two rules name one key
 * with different spans. A defect that only appears once a second caller
 * exists is the kind this project keeps finding late.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SRC = path.join(SYSTEM_ROOT, "module", "temporary-immunity.mjs");
const MARKERS = path.join(SYSTEM_ROOT, "module", "magic", "markers.mjs");
const WORKFLOW = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-temporary-immunity.mjs");

const MUTATIONS = [
  // NEW at 3.597.0, pinning the units the live drive asked for.
  { file: SRC,
    name: "A WEEK GOES BACK TO PRINTING AS 168 HOURS",
    from: `  if (s >= ONE_WEEK) {
    const weeks = Math.floor(s / ONE_WEEK);
    return \`\${weeks} week\${weeks === 1 ? "" : "s"}\`;
  }`, to: `  ;`, breaks: "B4a" },
  { file: SRC,
    name: "and a day as 24 hours",
    from: `  if (s >= ONE_DAY) {
    const days = Math.floor(s / ONE_DAY);
    return \`\${days} day\${days === 1 ? "" : "s"}\`;
  }`, to: `  ;`, breaks: "B4c" },
  { file: SRC,
    name: "six days round up to a week",
    from: `  if (s >= ONE_WEEK) {`, to: `  if (s >= ONE_WEEK * 0.8) {`, breaks: "B4d" },
  {
    name: "an expired immunity still blocks",
    file: SRC,
    from: "  return until > Number(now);",
    to: "  return until >= Number(now);",
    breaks: "A8 — the boundary tick, hit every time somebody waits a duration out on purpose"
  },
  {
    name: "an immunity never expires",
    file: SRC,
    from: "  return until > Number(now);",
    to: "  return true;",
    breaks: "A9 — a rule blocked for ever after one use"
  },
  {
    // THE QUIET ONE.
    name: "re-stamping shortens a running immunity",
    file: SRC,
    from: "  const kept = Number.isFinite(existing) ? Math.max(existing, until) : until;",
    to: "  const kept = until;",
    breaks: "C1 — a 10-minute rule cuts an hour-long immunity down to ten"
  },
  {
    name: "re-stamping cannot extend",
    file: SRC,
    from: "  const kept = Number.isFinite(existing) ? Math.max(existing, until) : until;",
    to: "  const kept = Number.isFinite(existing) ? Math.min(existing, until) : until;",
    breaks: "C2/C3 — spending Guidance again never moves the end later"
  },
  {
    name: "the record is mutated in place",
    file: SRC,
    from: "  return { ...(record ?? {}), [key]: kept };",
    to: "  record[key] = kept;\n  return record;",
    breaks: "C4 — a caller can half-write a flag it then fails to save"
  },
  {
    name: "the key stops being normalised",
    file: SRC,
    from: '  return String(name ?? "").trim().toLowerCase();',
    to: '  return String(name ?? "");',
    breaks: "A2/E2 — 'Guidance' and 'guidance' become two different immunities"
  },
  {
    // AIMED AT THE WRITER, where the invariant is reachable. The reader
    // carried a guard for this and no input could reach it; the guard
    // is gone and this is what proves its replacement works.
    name: "an empty key is written into the record",
    file: SRC,
    from: "  if (!key) return { ...(record ?? {}) };",
    to: "  if (false) return { ...(record ?? {}) };",
    breaks: "C6 — a nameless immunity is stored, and then blocks something"
  },
  {
    name: "remaining time goes negative",
    file: SRC,
    from: "  return Math.max(0, until - Number(now));",
    to: "  return until - Number(now);",
    breaks: "B3 — a card offering to wait out a negative number of seconds"
  },
  {
    name: "pruning drops what is still running",
    file: SRC,
    from: "    if (Number(until) > Number(now)) out[key] = Number(until);",
    to: "    if (Number(until) < Number(now)) out[key] = Number(until);",
    breaks: "C5b — housekeeping that deletes live immunities"
  },
  {
    name: "an interval rounds up rather than down",
    file: SRC,
    from: "    const minutes = Math.floor(s / 60);",
    to: "    const minutes = Math.ceil(s / 60);",
    breaks: "B11 — 59 minutes becomes '60 minutes' where the rule printed an hour"
  },
  // TWO MUTATIONS WERE REMOVED HERE AT 3.411.0, and the reason is worth
  // keeping. They used to edit the MARKER registry's `immunitySeconds`;
  // Guidance became a held bonus and the field moved into its PACK ROW.
  //
  // Repointing them at the checks made both SURVIVE, correctly: a
  // mutation that edits an assertion cannot be caught by that assertion.
  // And the underlying facts — "Guidance declares an hour" — now live in
  // compiled LevelDB, which no source mutation can reach.
  //
  // So the guard on those facts is `apply-data-fixes`, which refuses to
  // run if a pack value is neither the declared `from` nor `to`, and
  // `mutate-held-bonus`, which proves the code that READS the field can
  // fail. Pretending a source mutation covers pack data would have been
  // a check that could not fail wearing one that could.
  {
    file: SRC,
    name: "D-LIST: a wired immunity is quietly dropped from the table",
    from: '  rally: Object.freeze({',
    to: '  rallyDisabled: Object.freeze({',
    breaks: "D7 — Rally is the rule the old gap list called Calm; losing it loses the fix"
  },
  {
    file: SRC,
    name: "Demoralise's ten minutes becomes an assumed hour",
    from: "    seconds: 600,",
    to: "    seconds: ONE_HOUR,",
    breaks: "D8 — the mechanism takes a span precisely because this one is not an hour"
  },
  {
    file: SRC,
    name: "THE PERFORMER LEAVES THE KEY: one bard's failure becomes everybody's",
    from: "  return spec.perActor\n    ? immunityKey(`${actionKey}:${performer}`)\n    : immunityKey(actionKey);",
    to: "  return immunityKey(actionKey);",
    breaks: "D9 — 'immune to YOUR attempts to encourage', so a second bard may still try"
  },
  {
    file: WORKFLOW,
    name: "D13 THE ONE LIVE TESTING FOUND: the immunity is stamped only on a matched outcome",
    from: "  if (targetActor && rawDegree && ACTION_IMMUNITIES[action.key] && !ignoreActionImmunity) {",
    to: "  if (targetActor && rawDegree && outcomeMatchedOnly && ACTION_IMMUNITIES[action.key] && !ignoreActionImmunity) {",
    breaks: "D13 — a failed Demoralise would stamp nothing, and page 84 says 'regardless of your result'"
  },
  {
    file: SRC,
    name: "D11b THE FOUNDRY BOUNDARY AGAIN: the uuid's dots go back into the key",
    from: '  const performer = String(actorUuid ?? "").trim().replaceAll(".", "_");',
    to: '  const performer = String(actorUuid ?? "").trim();',
    breaks: "D11b — setFlag would nest it, every read would miss, and the target would be immune to nothing"
  },
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([SRC, MARKERS, WORKFLOW, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-temporary-immunity: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-temporary-immunity: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-temporary-immunity: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
