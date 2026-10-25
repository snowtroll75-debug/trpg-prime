#!/usr/bin/env node
/**
 * mutate-damage-riders — nine mutations against verify-damage-riders.mjs:
 * a rider that ignores its target, a marker that never burns or never
 * resets, dice that never reach the formula, a scaled value that reads
 * stale or falls to zero. Each must turn the verify red.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RIDERS = path.join(SYSTEM_ROOT, "module", "combat", "damage-riders.mjs");
const AW = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const COND = path.join(SYSTEM_ROOT, "module", "conditionals.mjs");
const DIALOG = path.join(SYSTEM_ROOT, "module", "apps", "check-dialog.mjs");

const MUTATIONS = [
  { name: "a named rider applies to every creature", file: RIDERS,
    from: "    if (r.targetUuids.length && (!uuid || !r.targetUuids.includes(uuid))) return false;", to: "", breaks: "A5 — Judgement's die lands on the wrong creature" },
  { name: "a burnt rider keeps applying", file: RIDERS,
    from: "    if (r.oncePerRound && used?.[r.id]) return false;", to: "", breaks: "A7 — once per round becomes every strike" },
  { name: "burning never marks anything", file: RIDERS,
    from: "    if (r.oncePerRound && !next[r.id]) { next[r.id] = true; changed = true; }", to: "", breaks: "A10" },
  { name: "a disabled effect's rider still counts", file: RIDERS,
    from: "    if (!effect || effect.disabled) continue;", to: "    if (!effect) continue;", breaks: "A1" },
  { name: "the dice never reach the formula", file: AW,
    from: "  formula += riderFormula(damageRiders);", to: "", breaks: "C3" },
  { name: "the hit never burns the marker", file: AW,
    from: "    if (ridersBurnt) await actor.setFlag(SYSTEM_ID, RIDERS_USED_FLAG, ridersBurnt);", to: "", breaks: "C2" },
  { name: "the round never resets the map", file: COMBAT,
    from: "      [`flags.${SYSTEM_ID}.damageRidersUsed`]: deletionValue(),", to: "", breaks: "C6" },
  { name: "valueFrom is read once as a literal (stale)", file: COND,
    // Re-anchored at 3.668.0: the scaled figure takes its floor first.
    from: "      value = floored * (Number(raw.sign) === -1 ? -1 : 1);", to: "      value = 2;", breaks: "B2 — the Inquisition bonus stops moving with level" },
  { name: "an unknown source is accepted as zero", file: COND,
    from: "      if (scaled === null) return null;", to: "      if (scaled === null) value = 1; else", breaks: "B4" },
  { name: "the dialog stops handing over the scaling", file: DIALOG,
    from: "            scalingFor(actor)\n", to: "            {}\n", breaks: "C7 — Inquisition would vanish from every dialog" }
];

function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-damage-riders.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([RIDERS, AW, COMBAT, COND, DIALOG]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-damage-riders: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-damage-riders: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-damage-riders: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
