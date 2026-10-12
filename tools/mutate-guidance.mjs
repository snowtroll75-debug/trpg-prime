#!/usr/bin/env node
/**
 * mutate-guidance — can verify-guidance fail?
 *
 * NEW at 3.400.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE PLAUSIBLE LIE. "Until the start of your next turn" invites
 * being written as six seconds — a round IS six seconds — and it is
 * wrong: a bonus granted halfway through a turn does not last six
 * seconds, it lasts until a specific event. Returning a number there
 * would look right in every code review and expire the spell at the
 * wrong moment every single time.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SRC = path.join(SYSTEM_ROOT, "module", "magic", "guidance.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-guidance.mjs");

const MUTATIONS = [
  {
    name: "THE PLAUSIBLE LIE: a turn boundary becomes six seconds",
    file: SRC,
    from: "  if (step <= 0) return null;\n  return level >= step ? 60 : null;",
    to: "  if (step <= 0) return 6;\n  return level >= step ? 60 : 6;",
    breaks: "C1/C4 — the spell expires on a clock instead of on the turn it names"
  },
  {
    name: "an absent caster-level threshold upgrades everyone",
    file: SRC,
    from: "  if (step <= 0) return null;",
    to: "  if (false) return null;",
    breaks: "C4 — every caster gets the minute-long version"
  },
  {
    name: "the duration step is off by one",
    file: SRC,
    from: "  return level >= step ? 60 : null;",
    to: "  return level > step ? 60 : null;",
    breaks: "C2 — the longer duration arrives a level late"
  },
  {
    name: "the bonus changes type",
    file: SRC,
    from: '    type: "status"',
    to: '    type: "circumstance"',
    breaks: "A3 — the printed type decides whether it lands at all"
  },
  {
    name: "a negative bonus is passed through",
    file: SRC,
    from: "    value: Math.max(0, Math.floor(Number(bonus) || 0)),",
    to: "    value: Math.floor(Number(bonus) || 0),",
    breaks: "A5 — a spell that could penalise the roll it is meant to help"
  },
  {
    // THE SPELL NAMES THREE KINDS OF ROLL. Widening it lets the bonus be
    // spent on initiative, flat checks and recovery rolls.
    name: "any check may spend the bonus",
    file: SRC,
    from: "  return GUIDANCE_CHECK_TYPES.includes(String(checkType ?? \"\").trim().toLowerCase());",
    to: "  return String(checkType ?? \"\").trim() !== \"\";",
    breaks: "B2 — initiative and flat checks start offering the button"
  },
  {
    name: "a kind of roll is dropped from the list",
    file: SRC,
    from: 'export const GUIDANCE_CHECK_TYPES = Object.freeze(["attack", "save", "skill"]);',
    to: 'export const GUIDANCE_CHECK_TYPES = Object.freeze(["attack", "save"]);',
    breaks: "B1/B4 — the printed sentence names skill checks too"
  },
  {
    name: "the type match stops normalising",
    file: SRC,
    from: '  return GUIDANCE_CHECK_TYPES.includes(String(checkType ?? "").trim().toLowerCase());',
    to: "  return GUIDANCE_CHECK_TYPES.includes(checkType);",
    breaks: "B3 — a card type with different casing silently offers nothing"
  },
  {
    name: "a target already holding one may be given another",
    file: SRC,
    from: '    return { eligible: false, reason: "already carries an unspent Guidance" };',
    to: '    return { eligible: true, reason: "" };',
    breaks: "D3 — a waiting bonus is silently replaced, or two of a type stack"
  },
  {
    name: "the immunity stops refusing",
    file: SRC,
    from: '      reason: "is temporarily immune to Guidance",',
    to: '      eligible: true,\n      reason: "is temporarily immune to Guidance",',
    breaks: "D2 — the hour the spell prints stops meaning anything"
  },
  {
    name: "the immunity is reported ahead of the nearer reason",
    file: SRC,
    from: "  if (alreadyHeld) {\n    return { eligible: false, reason: \"already carries an unspent Guidance\" };",
    to: "  if (false) {\n    return { eligible: false, reason: \"\" };",
    breaks: "D3/D4 — the less useful of the two reasons is shown"
  },
  {
    name: "the report assumes the bonus landed",
    file: SRC,
    from: "  const moved = Math.floor(Number(gain) || 0);",
    to: "  const moved = 1;",
    breaks: "E2 — a swallowed bonus is reported as though it applied"
  },
  {
    name: "a check that already succeeded claims to have been saved",
    file: SRC,
    from: "    turnedAside: target !== null && before < target && after >= target",
    to: "    turnedAside: target !== null && after >= target",
    breaks: "E3 — every success credits the spell"
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
    process.stderr.write("mutate-guidance: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-guidance: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-guidance: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
