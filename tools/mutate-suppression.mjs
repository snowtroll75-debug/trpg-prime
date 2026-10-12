#!/usr/bin/env node
/**
 * mutate-suppression — can verify-suppression fail? NEW at 3.439.0.
 *
 * THE D-SECTION MUTATIONS ARE THE POINT. This is the quietest mechanism
 * in the system: the whole spell is a number going down somewhere else,
 * so an effect on the sheet, a flag with the right number in it and a
 * perfect cast card can all be present while the penalty is unchanged.
 * W1 and W2 break exactly that — the subtraction still happens, and the
 * penalties are still built from the raw numbers.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SU = path.join(SYSTEM_ROOT, "module", "conditions", "suppression.mjs");
const AC = path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs");
const FX = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-suppression.mjs");

const MUTATIONS = [
  /* ── W: is it WIRED, and is the wiring REACHED? ────────────────── */
  {
    file: AC,
    name: "W1 derived data stops suppressing at all",
    from: "  const values = suppressedConditionValues(rawValues, suppressions);",
    to: "  const values = rawValues;",
    breaks: "E3 — the effect sits on the sheet with the right number in it and changes nothing"
  },
  {
    file: AC,
    name: "W2 the modifiers are built from the raw values",
    from: "    values,",
    to: "    values: rawValues,",
    breaks: "E4 — the subtraction happens, is published, and the penalties ignore it"
  },
  {
    file: AC,
    name: "W3 the suppressed map is never published",
    // RE-ANCHORED AT 3.621.0: the conditions as applied travel too (block 39's A3).
    from: "  actor._trgConditions = { effective, granted, values, rawValues, suppressions, direct };",
    to: "  actor._trgConditions = { effective, granted, values: rawValues, rawValues, suppressions, direct };",
    breaks: "E5 — getConditionValue and the sheet disagree with the maths"
  },
  {
    file: AC,
    name: "W4 a disabled effect keeps suppressing",
    from: "  const suppressions = [];\n  for (const effect of actor.effects ?? []) {\n    if (effect.disabled) continue;",
    to: "  const suppressions = [];\n  for (const effect of actor.effects ?? []) {\n    if (false) continue;",
    breaks: "E2 — a GM switches it off and it keeps happening"
  },
  {
    file: AC,
    name: "W5 the raw values stop being kept",
    from: "  actor._trgConditions = { effective, granted, values, rawValues, suppressions, direct };",
    to: "  actor._trgConditions = { effective, granted, values, suppressions, direct };",
    breaks: "E6 — nothing can ask what the character actually has any more"
  },

  /* ── S: what the subtraction does ──────────────────────────────── */
  {
    file: SU,
    name: "S1 the subtraction goes below zero",
    from: "    out.set(condition, Math.max(0, Number(out.get(condition) ?? 0) - amount));",
    to: "    out.set(condition, Number(out.get(condition) ?? 0) - amount);",
    breaks: "C3 — a negative condition value becomes a BONUS everywhere it is read"
  },
  {
    file: SU,
    name: "S2 a fully suppressed condition is removed outright",
    from: "    out.set(condition, Math.max(0, Number(out.get(condition) ?? 0) - amount));",
    to: "    const left = Math.max(0, Number(out.get(condition) ?? 0) - amount);\n"
      + "    if (left === 0) out.delete(condition); else out.set(condition, left);",
    breaks: "C4/D4 — you stop HAVING the condition, which is not what ignoring a point means"
  },
  {
    file: SU,
    name: "S3 suppressing a condition nobody has invents it",
    from: "    if (!out.has(condition)) continue;",
    to: "    if (false) continue;",
    breaks: "C5 — a spell that ignores fatigue gives its target fatigue"
  },
  {
    file: SU,
    name: "S4 two suppressions of one condition add up",
    from: "    const current = strongest.get(spec.condition) ?? 0;\n    if (spec.amount > current) strongest.set(spec.condition, spec.amount);",
    to: "    strongest.set(spec.condition, (strongest.get(spec.condition) ?? 0) + spec.amount);",
    breaks: "C7 — two PP 1 spells ignore three points between them"
  },
  {
    file: SU,
    name: "S5 the input map is mutated in place",
    from: "  const out = new Map(values ?? []);",
    to: "  const out = values ?? new Map();",
    breaks: "C6 — derived data runs constantly and the subtraction would compound every pass"
  },
  {
    file: SU,
    name: "S6 an empty suppression list still copies nothing",
    from: "  if (!list.length) return new Map(values ?? []);",
    to: "  if (!list.length) return new Map();",
    breaks: "C9 — every condition in the game silently disappears when nothing is suppressed"
  },

  /* ── N: what a suppression IS ──────────────────────────────────── */
  {
    file: SU,
    name: "N1 a suppression of zero is accepted",
    from: "  if (!Number.isFinite(amount) || amount <= 0) return null;",
    to: "  if (!Number.isFinite(amount)) return null;",
    breaks: "B4 — an effect on the sheet that changes nothing"
  },
  {
    file: SU,
    name: "N2 a suppression naming no condition is accepted",
    from: "  if (!condition) return null;",
    to: "  if (false) return null;",
    breaks: "B3"
  },
  {
    file: SU,
    name: "N3 authoring case starts mattering",
    from: "  const condition = text(raw.condition).toLowerCase();",
    to: "  const condition = text(raw.condition);",
    breaks: "B5 — \"Fatigued\" would subtract from nothing"
  },
  {
    file: SU,
    name: "N4 the round trip breaks",
    from: "  const amount = Math.trunc(Number(raw.amount ?? raw.value));",
    to: "  const amount = Math.trunc(Number(raw.value));",
    breaks: "B1/B6 — the stored spec spells it `amount`, so it dies on the way back in"
  },
  {
    file: SU,
    name: "N5 the cast line stops naming the number",
    from: "  const points = spec.amount === 1 ? \"1 point\" : `${spec.amount} points`;",
    to: "  const points = \"1 point\";",
    breaks: "F7 — a 2-point suppression announces itself as 1"
  },

  /* ── A: the applier ────────────────────────────────────────────── */
  {
    file: FX,
    name: "A1 the applier accepts a malformed suppression",
    // THE APPLIER GAINED A WARP STEP at 3.529.0 — the row is normalised
    // and THEN warped, so a swapped condition is validated exactly as an
    // authored one is. The anchor moves with it; what A1 asserts is
    // unchanged. Anchored on the guard alone rather than on the line
    // above it too, so the next change to that line leaves this intact.
    from: "          if (!spec) {\n            lines.push(line(`<em>${spell.name} declares a malformed suppression.</em>`));",
    to: "          if (false) {\n            lines.push(line(`<em>${spell.name} declares a malformed suppression.</em>`));",
    breaks: "F1 — a spell grants an unusable suppression and says nothing"
  },
  {
    file: FX,
    name: "A2 an unknown condition is applied anyway",
    from: "          if (!CONDITIONS[spec.condition]) {",
    to: "          if (false) {",
    breaks: "F2 — it subtracts from nothing, for ever, silently"
  },
  {
    file: FX,
    name: "A3 the effect is written under a flag nothing reads",
    from: "          const flags = { [SYSTEM_ID]: { [SUPPRESSION_FLAG]: spec } };",
    to: "          const flags = { [SYSTEM_ID]: { suppressionSpec: spec } };",
    breaks: "F4 — the applier and derived data stop agreeing on where it lives"
  },
  {
    file: FX,
    name: "A4 the card reads the value only after the change",
    from: "          const before = Number(target.getConditionValue?.(spec.condition) ?? 0);\n          const timing = spellExpiryTiming(parsedDuration);",
    to: "          const timing = spellExpiryTiming(parsedDuration);\n          const before = 0;",
    breaks: "F5 — the card can no longer report what the number moved from"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([SU, AC, FX, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-suppression: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-suppression: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-suppression: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
