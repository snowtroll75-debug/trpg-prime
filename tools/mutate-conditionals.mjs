#!/usr/bin/env node
/**
 * mutate-conditionals — can verify-conditionals fail?
 *
 * NEW at 3.415.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 AND #2 ARE THE SHIPPED DEFECT, restored one call site at a time.
 * Deleting `sourceUuid` from a context object is the exact state the
 * system was in from 3.406.0 to 3.415.0: the axis is still declared, the
 * matcher still reads it, every authored ward still normalises perfectly
 * — and no roll can ever match one. If F3/F4 cannot catch this edit then
 * this file's whole reachability section is decoration.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const COND = path.join(SYSTEM_ROOT, "module", "conditionals.mjs");
const CHECK_MJS = path.join(SYSTEM_ROOT, "module", "dice", "check.mjs");
const DIALOG = path.join(SYSTEM_ROOT, "module", "apps", "check-dialog.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-conditionals.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT, on the path that matters most: a save forced by
    // a spell never opens a dialog, so the automatic path is the only one
    // a ward's save half can arrive by.
    file: CHECK_MJS,
    name: "THE SHIPPED DEFECT: the automatic path stops supplying sourceUuid",
    from: "          sourceUuid: check.sourceUuid,",
    to: "",
    breaks: "F3 — every uuid-scoped conditional silently matches nothing again"
  },
  {
    file: CHECK_MJS,
    name: "the automatic path stops supplying targetUuid",
    from: "          targetUuid: check.targetUuid",
    to: "          targetUuidX: check.targetUuid",
    breaks: "F3 — the new mirror axis is dead on arrival, exactly as sourceUuids was"
  },
  {
    file: DIALOG,
    name: "the dialog stops supplying both uuid axes",
    from: "            sourceTypes, targetTypes, sourceUuid, targetUuid",
    to: "            sourceTypes",
    breaks: "F4 — the state the dialog shipped in"
  },
  {
    file: CHECK_MJS,
    name: "the check stops carrying the target at all",
    from: '    this.targetUuid = config.targetUuid ?? "";',
    to: '    this.targetUuidX = config.targetUuid ?? "";',
    breaks: "F5 — the context can only pass on what the check was given"
  },
  {
    file: DIALOG,
    name: "the dialog cannot be handed a target",
    from: '  targetUuid = "",',
    to: "",
    breaks: "F6 — an axis no caller can supply is one nobody can fix from outside"
  },
  {
    // THE AXIS TABLE MUST STAY HONEST. An axis with no context key is one
    // the reachability check cannot even ask about.
    file: COND,
    name: "an axis loses its context key",
    from: '  targetUuids: "targetUuid"',
    to: '  targetUuidsX: "targetUuid"',
    breaks: "A1 — the reachability check goes blind to that axis"
  },
  {
    file: COND,
    name: "the mirror axis stops narrowing",
    from: "  if (wantedTargetUuids && !wantedTargetUuids.some((t) => targetUuids.includes(t))) return false;",
    to: "  if (false) return false;",
    breaks: "B2/B3 — a penalty meant for one creature hits every swing at everybody"
  },
  {
    // THE TEMPTING LENIENCY: "we do not know the target, so let it
    // through". That is how a penalty meant for one creature reaches
    // every roll the enemy makes.
    file: COND,
    name: "an unknown target is treated as a match",
    from: "  if (wantedTargetUuids && !wantedTargetUuids.some((t) => targetUuids.includes(t))) return false;",
    to: "  if (wantedTargetUuids && targetUuids.length && !wantedTargetUuids.some((t) => targetUuids.includes(t))) return false;",
    breaks: "B3 — an unattributed roll starts matching a scoped entry"
  },
  {
    // A UUID IS CASE-SENSITIVE. Folding it is a silent total failure.
    file: COND,
    name: "the mirror axis is folded to lower case",
    from: 'const CASE_SENSITIVE_AXES = Object.freeze(["sourceUuids", "targetUuids"]);',
    to: 'const CASE_SENSITIVE_AXES = Object.freeze(["sourceUuids"]);',
    breaks: "B4 — the authored scope stops matching the live uuid, and nothing says so"
  },
  {
    file: COND,
    name: "the two uuid axes are read from the same context key",
    from: '    : String(context.targetUuid ?? context.targetUuids ?? "").split(/[,;]/)',
    to: '    : String(context.sourceUuid ?? context.targetUuids ?? "").split(/[,;]/)',
    breaks: "B5 — a rule naming both stops being able to tell them apart"
  },
  {
    file: COND,
    name: "a target exclusion is ignored",
    from: "  if (excludes(excluded.targetUuids, targetUuids)) return false;",
    to: "",
    breaks: "B8 — 'everywhere except that one' applies there too"
  },

  /* ---- THE TYPE MIRROR (3.567.0) ---- */

  {
    file: COND,
    name: "the type mirror stops narrowing",
    from: "  if (wantedTargetTypes && !wantedTargetTypes.some((t) => targetTypes.includes(t))) return false;",
    to: "  if (false) return false;",
    breaks: "H2/H3 — Dracoris's Wyrm bonus becomes a flat +1 to every social check"
  },
  {
    // THE SAME TEMPTING LENIENCY AS ABOVE, one axis over. "We do not
    // know what they are talking to, so allow it" is how a scoped racial
    // bonus turns into an unconditional one.
    file: COND,
    name: "an untargeted check is treated as a match",
    from: "  if (wantedTargetTypes && !wantedTargetTypes.some((t) => targetTypes.includes(t))) return false;",
    to: "  if (wantedTargetTypes && targetTypes.length && !wantedTargetTypes.some((t) => targetTypes.includes(t))) return false;",
    breaks: "H3 — a check aimed at nobody starts collecting the bonus"
  },
  {
    // THE DEFECT THE AXIS EXISTS TO PREVENT, written out. Reading the
    // target's type off the SOURCE key is the one mistake that produces
    // a bonus which appears at the table and is therefore never doubted.
    file: COND,
    name: "the two type axes are read from the same context key",
    from: "  const targetTypes = (Array.isArray(context.targetTypes)\n    ? context.targetTypes\n    : String(context.targetTypes ?? \"\").split(/[,;]/)",
    to: "  const targetTypes = (Array.isArray(context.sourceTypes)\n    ? context.sourceTypes\n    : String(context.sourceTypes ?? \"\").split(/[,;]/)",
    breaks: "H4 — a Wyrm attacking a Dracoris counts as a Dracoris talking to a Wyrm"
  },
  {
    file: COND,
    name: "a target-type exclusion is ignored",
    from: "  if (excludes(excluded.targetTypes, targetTypes)) return false;",
    to: "",
    breaks: "H9 — 'everywhere except that kind' applies there too"
  },
  {
    file: COND,
    name: "the type mirror loses its place in the axis table",
    from: '  "targetTypes", "sourceUuids", "targetUuids"',
    to: '  "sourceUuids", "targetUuids"',
    breaks: "A4/F3/F4 — the axis is authored, read nowhere, and silently matches nothing"
  },
  {
    file: CHECK_MJS,
    name: "the check stops carrying the target's type",
    from: '    this.targetTypes = config.targetTypes ?? "";',
    to: '    this.targetTypesX = config.targetTypes ?? "";',
    breaks: "F3 — the context can only pass on what the check was given"
  },
  {
    file: DIALOG,
    name: "the dialog cannot be handed a target type",
    from: '  targetTypes = "",',
    to: "",
    breaks: "F4 — the row is never offered, so the bonus exists only without the dialog"
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

const guard = guardFiles([COND, CHECK_MJS, DIALOG, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-conditionals: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-conditionals: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-conditionals: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
