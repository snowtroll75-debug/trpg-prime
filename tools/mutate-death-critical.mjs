#!/usr/bin/env node
/**
 * mutate-death-critical — can verify-death-critical fail?
 * NEW at 3.457.0.
 *
 * R1 IS THE SHIPPED DEFECT. For months the workflow printed the save's DC
 * and applied nothing, so "Skull obliterated. Target dies instantly." left
 * a creature at Dying 1 and still in the initiative order. R1 restores
 * exactly that.
 *
 * O6 IS THE ONE THAT PROTECTS THE RULE FROM ITS OWN FAILURE MODE: a save
 * that could not be rolled must count as failed, or the deadliest row in
 * the game becomes safest whenever something goes wrong.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const D = path.join(SYSTEM_ROOT, "module", "combat", "death-state.mjs");
const W = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const A = path.join(SYSTEM_ROOT, "module", "combat", "attack.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-death-critical.mjs");

const MUTATIONS = [
  /* ── O: the outcome ────────────────────────────────────────────── */
  {
    file: D,
    name: "O1 a failed save no longer kills",
    from: "  return { applies: true, died: true, newResult: null };",
    to: "  return { applies: true, died: false, newResult: result };",
    breaks: "O1 — the row says the target dies instantly"
  },
  {
    file: D,
    name: "O2 a made save kills anyway",
    from: "  if (passed) {",
    to: "  if (false) {",
    breaks: "O2/O3 — the save would buy nothing"
  },
  {
    file: D,
    name: "O3 THE FAILURE MODE: an unrollable save counts as a pass",
    from: "  const passed = Number.isFinite(total) && Number.isFinite(dc) && total >= dc;",
    to: "  const passed = !Number.isFinite(total) || total >= dc;",
    breaks: "O6 — the deadliest row becomes the safest when something goes wrong"
  },
  {
    file: D,
    name: "O4 the save reaches on a tie instead of meeting the DC",
    from: "total >= dc;",
    to: "total > dc;",
    breaks: "O2 — a save that equals its DC is made"
  },
  {
    file: D,
    name: "O5 the lowered result may fall off the table",
    from: "    const lowered = Math.max(1, Math.floor(Number(result) || 0) - Number(save.reduction ?? 10));",
    to: "    const lowered = Math.floor(Number(result) || 0) - Number(save.reduction ?? 10);",
    breaks: "O4 — a result below the table's own range"
  },

  /* ── R: is it reached? ─────────────────────────────────────────── */
  {
    file: W,
    name: "R1 THE SHIPPED DEFECT: the save is printed and never rolled",
    from: "      const saveRoll = await TRGCheck.roll({",
    to: "      const saveRoll = null; void ({",
    breaks: "R1 — months of \"Target dies instantly\" changing nothing"
  },
  {
    file: W,
    name: "R2 a failure stops pushing Dying past the Death State",
    from: '        const deadAt = actorDeathState(targetActor) + 1;',
    to: "        const deadAt = 0;",
    breaks: "R3 — the system's only representation of death"
  },
  {
    file: W,
    name: "R3 the corpse is never reaped",
    from: "        const reaped = targetActor.isOwner ? await reapDead(targetActor, game.combat ?? null) : { removed: false };",
    to: "        const reaped = { removed: false };",
    breaks: "R4 — Graham asked for removal from the initiative tracker"
  },
  {
    file: W,
    name: "R4 the kill lands before the save is consulted",
    from: "      const verdict = deathCriticalOutcome(save, saveRoll?.total, result);",
    to: "      const verdict = { applies: true, died: true, newResult: null }; void deathCriticalOutcome;",
    breaks: "R2/R5 — a result applied before the roll that prevents it"
  },
  {
    file: W,
    name: "R5 a made save stops re-looking-up the lowered row",
    from: "        const lowered = lookupTableRow(table, verdict.newResult);",
    to: "        const lowered = null;",
    breaks: "R6 — the printed rule, back in a GM's hands"
  },

  /* ── K: the race two reapers run for one corpse ────────────────── */
  {
    file: D,
    name: "K1 THE RACE: the stale list is deleted without re-reading",
    from: "  const live = combatants.filter((c) => encounter.combatants?.get?.(c.id));\n  if (!live.length) return out;",
    to: "  const live = combatants;",
    breaks: "K4b — the id was already gone when the second reaper asked"
  },
  {
    file: D,
    name: "K2 a lost race throws into the caller again",
    from: "    // Already reaped by the other caller between the check and the write.\n    // Not an error worth propagating into an attack or a turn change.\n    console.debug(\"TRG Prime | combatant already removed\", error);",
    to: "    throw error; // eslint-disable-line no-useless-catch",
    breaks: "K4c — this abandoned the rest of the critical's card"
  },
  {
    file: D,
    name: "K3 the reaper claims a removal it did not make",
    from: "    await encounter.deleteEmbeddedDocuments(\"Combatant\", live.map((c) => c.id));\n    out.removed = true;",
    to: "    out.removed = true;\n    await encounter.deleteEmbeddedDocuments(\"Combatant\", live.map((c) => c.id));",
    breaks: "K4d — the death card would be announced twice"
  },

  {
    file: D,
    name: "K4 THE SECOND SKULL: the reap is no longer serialised",
    from: "  if (key && reaping.has(key)) {",
    to: "  if (false) {",
    breaks: "K5 — one Death critical drew two skulls"
  },
  {
    file: D,
    name: "K5 the in-flight key is never released",
    from: "    if (key) reaping.delete(key);",
    to: "    void key;",
    breaks: "K5c — every later death for that actor would go silent"
  },

  /* ── D: the data ───────────────────────────────────────────────── */
  {
    file: A,
    name: "D1 Fatal stops offering a save",
    from: "  const isFatal = /fatal/i.test(persistence);",
    to: "  const isFatal = false;",
    breaks: "S1/S2 — four rows would lose their save entirely"
  },
  {
    file: A,
    name: "D2 Death and Fatal become equally resistible",
    from: "    dc: injuryDC + (isDeath ? 5 : 2),",
    to: "    dc: injuryDC + 2,",
    breaks: "S2 — Very Hard against Hard is the difference between them"
  },
  {
    file: A,
    name: "D3 a mental critical is resisted with Fortitude",
    from: '    save: damageType === "mental" ? "will" : "fortitude",',
    to: '    save: "fortitude",',
    breaks: "S3 — the printed rule names Will for mental criticals"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([D, W, A, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-death-critical: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-death-critical: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-death-critical: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
