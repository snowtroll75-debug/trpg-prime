#!/usr/bin/env node
/**
 * mutate-natural-defence — can verify-natural-defence fail?
 *
 * NEW at 3.399.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE ONE THE GUARD EXISTS FOR. `level >= threshold` with a
 * threshold of 0 is true for everybody, so a spell whose
 * casterLevelMods went missing would hand EVERY caster in the game the
 * improved +2 — silently, and in the player's favour, which is the
 * direction nobody reports as a bug.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SRC = path.join(SYSTEM_ROOT, "module", "magic", "natural-defence.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-natural-defence.mjs");

const MUTATIONS = [
  {
    name: "THE OPEN THRESHOLD: a missing threshold upgrades everybody",
    file: SRC,
    from: "  if (step <= 0) return 1;",
    to: "  if (false) return 1;",
    breaks: "A5/A6 — every caster gets +2, silently and in their own favour"
  },
  {
    name: "the step is off by one",
    file: SRC,
    from: "  return level >= step ? 2 : 1;",
    to: "  return level > step ? 2 : 1;",
    breaks: "A2/C3c — the bonus arrives a level late, exactly at the printed threshold"
  },
  {
    name: "the stepped bonus stops matching the printed text",
    file: SRC,
    from: "  return level >= step ? 2 : 1;",
    to: "  return level >= step ? 3 : 1;",
    breaks: "C3c — the function and the compendium's own sentence disagree"
  },
  {
    name: "an attack roll triggers a saving-throw reaction",
    file: SRC,
    from: '  return String(checkType ?? "").trim().toLowerCase() === "save";',
    to: '  return String(checkType ?? "").trim().toLowerCase() !== "";',
    breaks: "B2 — the button appears on every card in the game"
  },
  {
    // SELF ONLY. Losing this offers the spell on somebody else's save.
    name: "the spell answers another creature's save",
    file: SRC,
    from: '  if (!isSelf) return { eligible: false, reason: "the trigger is your own saving throw" };',
    to: "  if (false) return { eligible: false, reason: \"\" };",
    breaks: "B7 — 'you make saving throw' becomes 'anyone makes a saving throw'"
  },
  {
    name: "the reaction is no longer required in combat",
    file: SRC,
    from: "  if (inCombat && Number(reactions) < 1) {",
    to: "  if (false) {",
    breaks: "B8 — the reaction costs nothing and can be spent every round"
  },
  {
    name: "the reaction is required outside combat too",
    file: SRC,
    from: "  if (inCombat && Number(reactions) < 1) {",
    to: "  if (Number(reactions) < 1) {",
    breaks: "B9 — a spell refused out of combat, where no round is being tracked"
  },
  {
    // THE TYPE DECIDES WHICH POOL. A circumstance bonus would stack
    // against different things entirely and quietly change the maths.
    name: "the bonus changes type",
    file: SRC,
    from: '    type: "resistance"',
    to: '    type: "circumstance"',
    breaks: "D1 — the printed bonus type is what decides whether it lands at all"
  },
  {
    // THE HONESTY OF THE CARD. Reporting the printed bonus rather than
    // the measured movement is a card that lies whenever a larger
    // resistance bonus is already in the pool.
    name: "the report assumes the bonus landed",
    file: SRC,
    from: "  const moved = Math.floor(Number(gain) || 0);",
    to: "  const moved = 1;",
    breaks: "D6/D6b — a swallowed bonus is reported as though it applied"
  },
  {
    name: "a save that already succeeded is reported as turned aside",
    file: SRC,
    from: "    turnedAside: target !== null && before < target && after >= target",
    to: "    turnedAside: target !== null && after >= target",
    breaks: "D7 — every successful save claims the spell saved it"
  },
  {
    name: "a negative bonus is passed through",
    file: SRC,
    from: "  const value = Math.max(0, Math.floor(Number(bonus) || 0));",
    to: "  const value = Math.floor(Number(bonus) || 0);",
    breaks: "D4 — a spell that could penalise the save it is meant to help"
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

const guard = guardFiles([SRC, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-natural-defence: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-natural-defence: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-natural-defence: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
