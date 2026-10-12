#!/usr/bin/env node
/**
 * mutate-one-clock — can verify-one-clock fail?
 * NEW at 3.476.0.
 *
 * C1 IS THE SHIPPED BUG, reported from a live table and reproduced by
 * advancing the world clock: giving Foundry a duration for an effect we
 * delete ourselves. The first mutation restores exactly that.
 *
 * L6 IS THE HALF THAT WOULD GO UNNOTICED. If a sheet went back to
 * Foundry's raw label it would read "Ongoing" for every spell effect —
 * no error, no console noise, just a countdown that silently stopped
 * counting.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const A = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const S = path.join(SYSTEM_ROOT, "module", "sheets", "effect-sheet.mjs");
const W = path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-one-clock.mjs");

const MUTATIONS = [
  {
    file: E,
    name: "C1 THE LIVE BUG: the second clock comes back",
    from: "  if (out.spellEffect) out.foundryDuration = undefined;",
    to: "  if (false) out.foundryDuration = undefined;",
    breaks: "C1 — our sweep deletes and Foundry's registry updates what is gone"
  },
  {
    file: E,
    name: "C2 every effect loses Foundry's duration, even ones we never sweep",
    from: "  const out = { spellEffect: false, expiresRound: null, spellEffectEnd: null, foundryDuration: foundryDuration(parsed) };",
    to: "  const out = { spellEffect: false, expiresRound: null, spellEffectEnd: null, foundryDuration: undefined };",
    breaks: "C2 — a duration nobody sweeps is display-only and costs a label for nothing"
  },
  {
    file: E,
    name: "L1 the remaining-time reader is gone",
    from: "function spellEffectRemaining(effect, worldTime = null) {",
    to: "function spellEffectRemainingRenamed(effect, worldTime = null) {",
    breaks: "L1 — nothing outside could read the clock that governs the effect"
  },
  {
    file: E,
    name: "L3 the label stops falling back for effects we do not expire",
    from: '  if (left === null) return effect?.duration?.label ?? "Ongoing";',
    to: '  if (left === null) return "Ongoing";',
    breaks: "L3 — an effect with only Foundry's clock would lose its label"
  },
  {
    file: A,
    name: "L4/L6 the actor sheet reads Foundry's raw label again",
    from: "        duration: spellEffectDurationLabel(effect),",
    to: '        duration: effect.duration?.label ?? "Ongoing",',
    breaks: "L6 — every spell effect would read \"Ongoing\" with no error to show it"
  },
  {
    file: S,
    name: "L5 the effect sheet reads Foundry's raw label again",
    from: "    context.durationSummary = spellEffectDurationLabel(effect);",
    to: '    context.durationSummary = effect.duration?.label ?? "Ongoing";',
    breaks: "L6 — same silent loss on the effect sheet"
  },
  {
    file: W,
    name: "S1 our sweep stops deleting, leaving Foundry to expire",
    // ANCHORED TO THE SWEEP'S OWN LINE — `await effect.delete()` appears
    // twice in this file, and an ambiguous anchor is a mutation that
    // never runs. RE-POINTED at 3.493.0: Delayed Respite's release now
    // sits between the label and the delete, and this runner said so by
    // reporting the anchor missing rather than quietly passing.
    from: "      if (actor.effects.get(effect.id)) await endEffect(effect, actor);",
    to: "      if (false) await endEffect(effect, actor);",
    breaks: "S1 — the effect would linger and the card would report an end that never happened"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([E, A, S, W, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-one-clock: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-one-clock: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-one-clock: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
