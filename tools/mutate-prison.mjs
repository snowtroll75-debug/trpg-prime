#!/usr/bin/env node
/**
 * mutate-prison — can verify-prison fail?
 * NEW at 3.472.0.
 *
 * E1 IS THE ONE THAT MATTERS. "Success escapes, failure does not" is the
 * assumption every other save in this system would teach, and it is
 * WRONG here: a Failure costs 24d6 and a Minor critical and still opens
 * the cage. Only a Fumble keeps you in. That mutation is below.
 *
 * D2 IS THE OTHER. Mapping Partial onto Success rather than Failure
 * hands a roll that missed the DC the outcome for one that beat it.
 *
 * W8 IS THE THIRD. Clearing the marker on every attempt would let a
 * Fumble out — the one degree that must not.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "prison.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const C = path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-prison.mjs");

const MUTATIONS = [
  {
    // THE ASSUMPTION EVERY OTHER SAVE WOULD TEACH.
    file: P,
    name: "E1 THE OBVIOUS WRONG RULE: only a successful save escapes",
    from: "    escapes: spec.escapesOn.includes(d),",
    to: '    escapes: d === "critical" || d === "success",',
    breaks: "E1 — a Failure costs 24d6 and a Minor critical and still opens the cage"
  },
  {
    file: P,
    name: "E4 the escape set is inferred rather than declared",
    from: "  const escapesOn = Array.isArray(raw.escapesOn)",
    to: '  const escapesOn = ["critical", "success", "failure"] && Array.isArray(raw.escapesOn)\n    ? ["critical", "success", "failure"] : Array.isArray(raw.escapesOn)',
    breaks: "E4 — a prison that only opened on a critical could not be expressed"
  },
  {
    file: P,
    name: "R4 a ladder with a missing degree is accepted",
    from: "    if (!DICE.test(dice)) return null;",
    to: '    if (dice && !DICE.test(dice)) return null;',
    breaks: "R4 — a degree nobody decided would cost undefined"
  },
  {
    file: P,
    name: "R6 a cage with no way out is accepted",
    from: "  if (!escapesOn.length) return null;",
    to: "  if (false) return null;",
    breaks: "R6 — nothing would ever open it"
  },
  {
    file: P,
    name: "R7 an unknown severity is trusted",
    from: "    if (PRISON_DEGREES.includes(d) && SEVERITIES.includes(s)) criticalOn[d] = s;",
    to: "    if (PRISON_DEGREES.includes(d)) criticalOn[d] = s;",
    breaks: "R7 — rollCriticalInjury would be handed a severity it does not know"
  },
  {
    // ROUNDING THE WRONG WAY.
    file: P,
    name: "D2 THE GENEROUS ROUNDING: Partial takes the Success line",
    from: "  partial: \"failure\",",
    to: "  partial: \"success\",",
    breaks: "D2 — a roll that missed the DC would get the outcome for one that beat it"
  },
  {
    file: P,
    name: "D1 a rolled degree maps to nothing",
    from: "  blunder: \"fumble\"",
    to: "  blunder: null",
    breaks: "D1 — a Blunder would cost nothing at all"
  },
  {
    file: P,
    name: "C3 a caged prisoner is not told they may try again",
    from: "    : `<em>${name} is still caged, and may try again.</em>`;",
    to: "    : `<em>${name} is still caged.</em>`;",
    breaks: "C3 — a player who just took 24d6 would assume the spell was stuck"
  },
  {
    file: P,
    name: "C2 the line stops admitting defences ate some",
    from: '  const reduced = Number(taken) !== Number(rolled) ? ", reduced by their defences" : "";',
    to: '  const reduced = "";',
    breaks: "C2 — a fire-resistant prisoner would be shown the whole roll as taken"
  },
  {
    file: E,
    name: "W2 the cage stops carrying its ladder and DC",
    from: "              spec, saveDC, castId, casterUuid: caster.uuid, spellName: spell.name",
    to: "              castId, casterUuid: caster.uuid, spellName: spell.name",
    breaks: "W2 — a pack entry edited mid-campaign would change a cage in use"
  },
  {
    file: E,
    name: "W3 the cast offers no button",
    from: '            lines.push(line(`<button type="button" data-action="attemptPrisonEscape" `',
    to: '            if (false) lines.push(line(`<button type="button" data-action="attemptPrisonEscape" `',
    breaks: "W3 — nobody could attempt an escape"
  },
  {
    // THE ONE DEGREE THAT MUST NOT GET OUT.
    file: C,
    name: "W8 THE FUMBLE ESCAPES: the marker clears on every attempt",
    from: "  if (outcome.escapes) await prisoner.unsetFlag(SYSTEM_ID, PRISON_FLAG);",
    to: "  await prisoner.unsetFlag(SYSTEM_ID, PRISON_FLAG);",
    breaks: "W8 — a Fumble would pay 24d6 and a Serious critical and still get out"
  },
  {
    file: C,
    name: "W6 the rolled degree is used unmapped",
    from: "  const degree = prisonDegree(rolled);",
    to: "  const degree = rolled;",
    breaks: "W6 — a heroic or partial roll would find no outcome and cost nothing"
  },
  {
    file: C,
    name: "W9 the button is spent after one attempt",
    from: "        escapeButton.disabled = false;",
    to: "        escapeButton.disabled = true;",
    breaks: "W9 — a fumbling prisoner could never try again"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, E, C, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-prison: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-prison: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-prison: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
