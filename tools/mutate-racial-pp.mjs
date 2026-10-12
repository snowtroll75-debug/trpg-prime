#!/usr/bin/env node
/**
 * mutate-racial-pp — can verify-racial-pp fail?
 *
 * NEW at 3.417.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT, restored as the one word it was: `ppLevels`
 * dropped from the racial line, making the grant flat again. It is worth
 * noticing that this edit produces the RIGHT ANSWER at level 1 and a
 * wrong one at every level above — so a check that reads the pair once,
 * at the level a character is built, cannot catch it. That is why
 * section C reads several.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TABLE = path.join(SYSTEM_ROOT, "module", "racial-pp.mjs");
const WORKFLOW = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-racial-pp.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT: racial PP granted once rather than per level.
    file: TABLE,
    name: "THE SHIPPED DEFECT: racial PP goes back to being flat",
    from: "  return per * ppLevels(level);",
    to: "  return per;",
    breaks: "C2/C3 — correct at level 1, a point further out at every level after"
  },
  {
    file: TABLE,
    name: "Sharuk-Xal states its destination instead of its difference",
    from: '  "sharuk-xal": 2,',
    to: '  "sharuk-xal": 1,',
    breaks: "A4/C1 — an Orc Sharuk-Xal nets 0 instead of the printed +1"
  },
  {
    file: TABLE,
    name: "the Orc's penalty is dropped",
    from: "  orc: -1",
    to: "  orc: 0",
    breaks: "C5 — and the pair then nets +2, twice what the book prints"
  },
  {
    // A NEGATIVE LEVEL WOULD PAY AN ORC, because a negative figure times
    // a negative level is positive.
    file: TABLE,
    name: "the level floor is removed",
    from: "  return Math.max(0, Math.trunc(Number(level) || 0));",
    to: "  return Math.trunc(Number(level) || 0);",
    breaks: "B3 — a negative level hands an Orc power points"
  },
  {
    file: TABLE,
    name: "a race printing zero is dropped from the table",
    from: "  dwarf: 0,",
    to: "",
    breaks: "A2/A3 — 'grants nothing' stops being distinguishable from 'unchecked'"
  },
  {
    file: TABLE,
    name: "an unknown name becomes an error instead of nothing",
    // Anchor updated at 3.560.0: a module-registered race answers before
    // the homebrew default, so the line grew a third operand.
    from: "  const per = RACIAL_PP_PER_LEVEL[key] ?? HERITAGE_PP_PER_LEVEL[key] ?? registeredRacialPP(key) ?? 0;",
    to: "  const per = RACIAL_PP_PER_LEVEL[key] ?? HERITAGE_PP_PER_LEVEL[key] ?? registeredRacialPP(key) ?? 1;",
    breaks: "D3 — every homebrew race silently grants a point per level"
  },
  {
    file: TABLE,
    name: "the name is matched case-sensitively",
    from: '  const key = String(name ?? "").trim().toLowerCase();',
    to: '  const key = String(name ?? "");',
    breaks: "D4/D5 — 'Orc' stops matching 'orc' and every grant silently vanishes"
  },
  {
    // ONE OWNER. A second copy of the values in the workflow is how the
    // two would drift apart again.
    file: WORKFLOW,
    name: "the workflow keeps its own copy of the race list",
    from: "  ...Object.entries(RACIAL_PP_PER_LEVEL)\n    .filter(([, value]) => value !== 0)",
    to: '  ...[{ race: "Ascendan", value: 1 }, { race: "Elf", value: 1 }, { race: "Gnome", value: 1 }, { race: "Orc", value: -1 }]\n    .filter(() => true)',
    breaks: "E2/E4 — two copies of a value agree until one of them is edited"
  },
  {
    file: WORKFLOW,
    name: "one grant family stops counting levels like the others",
    // ANCHORED ON types: ["race"] — the identical due-line appears in the
    // Sharuk-Xal block too, and the first draft matched both.
    from: '    types: ["race"],\n    due: (actor) => value * racialPPLevels(actor)',
    to: '    types: ["race"],\n    due: () => value',
    breaks: "E5 — the racial lines go flat while the heritage lines still scale"
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

const guard = guardFiles([TABLE, WORKFLOW, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-racial-pp: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-racial-pp: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-racial-pp: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
