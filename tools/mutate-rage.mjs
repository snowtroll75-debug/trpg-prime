#!/usr/bin/env node
/**
 * mutate-rage — can verify-rage fail?
 *
 * NEW at 3.416.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 THROUGH #4 ARE THE FOUR SHIPPED DEFECTS, restored one at a time.
 * Each was live in Graham's session on 26 August 2026, and together they
 * made a rage permanent: nothing ended it on time, a fumbled Revoke
 * refused every later attempt, and switching the effect off left the
 * rules still believing it was running.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RAGE = path.join(SYSTEM_ROOT, "module", "combat", "rage.mjs");
const WORKFLOW = path.join(SYSTEM_ROOT, "module", "combat", "rage-workflow.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const SHEET = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-rage.mjs");

const MUTATIONS = [
  {
    // DEFECT B. The state the system shipped in: no expiry at all.
    file: WORKFLOW,
    name: "THE SHIPPED DEFECT B: nothing expires a rage",
    from: "async function expireRage(actor, { worldTime = null, round = null } = {}) {",
    to: "async function expireRageX(actor, { worldTime = null, round = null } = {}) {",
    breaks: "C2 — the printed minute goes back to being decoration"
  },
  {
    // DEFECT C.
    file: WORKFLOW,
    name: "THE SHIPPED DEFECT C: a disabled rage still counts as raging",
    from: "    (effect) => effect.name === RAGE_EFFECT_NAME && !effect.disabled",
    to: "    (effect) => effect.name === RAGE_EFFECT_NAME",
    breaks: "D1 — the sheet and the rules disagree about the same character"
  },
  {
    // THE ESCAPE HATCH GRAHAM REACHED FOR.
    file: WORKFLOW,
    name: "switching the effect off stops meaning anything",
    from: "async function endRageOnDisable(effect, { fatigue = null } = {}) {",
    to: "async function endRageOnDisableX(effect, { fatigue = null } = {}) {",
    breaks: "C5 — the GM's first instinct leads nowhere again"
  },
  {
    file: BOOT,
    name: "the world clock stops sweeping rage",
    from: '        const { expireRage } = await import("../module/combat/rage-workflow.mjs");',
    to: '        const { expireRageX: expireRage } = await import("../module/combat/rage-workflow.mjs");',
    breaks: "C4 — a rage invoked outside an encounter never ends"
  },
  {
    file: COMBAT,
    name: "the combat clock stops sweeping rage",
    from: 'import { expireRage } from "../combat/rage-workflow.mjs";',
    to: 'import { expireRage as expireRageX } from "../combat/rage-workflow.mjs";',
    breaks: "C3 — a rage in a fight never ends"
  },
  {
    // BOTH CLOCKS, NOT ONE. Requiring both ends no rage anywhere.
    file: RAGE,
    name: "expiry demands both clocks agree",
    from: "  return Boolean(byTime || byRound);",
    to: "  return Boolean(byTime && byRound);",
    breaks: "B4 — only one clock is ever moving, so nothing would expire"
  },
  {
    file: RAGE,
    name: "an unstamped rage is treated as expired",
    from: "  if (!state) return false;",
    to: "  if (!state) return true;",
    breaks: "B6 — a rage predating the stamp ends at a moment nobody chose"
  },
  {
    file: RAGE,
    name: "a minute stops being ten rounds",
    from: "const RAGE_DURATION_ROUNDS = RAGE_DURATION_SECONDS / 6;",
    to: "const RAGE_DURATION_ROUNDS = RAGE_DURATION_SECONDS;",
    breaks: "A2 — the two clocks stop meaning the same minute"
  },
  {
    // DEFECT D's SURVIVABILITY. A ride-out must still hit the clock.
    file: RAGE,
    name: "a ride-out rage is exempt from the clock",
    from: "  if (!state) return false;\n  const stamped =",
    to: "  if (!state || state.mustRideOut) return false;\n  const stamped =",
    breaks: "E4 — one bad Revoke roll becomes a permanent condition again"
  },
  {
    // DEFECT A.
    file: SHEET,
    name: "THE SHIPPED DEFECT A: temporary HP leaves the character sheet",
    from: '                name="system.resources.hp.temp"',
    to: '                name="system.resources.hp.tempX"',
    breaks: "F2 — rage's grant is visible only on somebody else's sheet"
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

const guard = guardFiles([RAGE, WORKFLOW, COMBAT, BOOT, SHEET, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-rage: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-rage: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-rage: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
