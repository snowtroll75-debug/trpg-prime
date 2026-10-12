#!/usr/bin/env node
/**
 * mutate-drive-3614 — can verify-drive-3614 fail?
 *
 * NEW at 3.614.1. Each mutation puts back a defect the 3.614.0 drive found,
 * or breaks the fix in a way that would let it return.
 * SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const STASISF = at("module", "magic", "stasis-workflow.mjs");
const APPLY = at("module", "combat", "effect-application-workflow.mjs");
const COMBAT = at("module", "documents", "combat.mjs");
const FX = at("module", "magic", "spell-effects.mjs");
const USE = at("module", "consumable-use-workflow.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const VERIFY = at("tools", "verify-drive-3614.mjs");

const MUTATIONS = [
  // A — F1
  { file: STASISF, name: "F1 — the stasis goes first and the clocks follow (the shipped race)",
    from: "    const resumed = await resumeFrozenClocks(actor, record, effect.id);\n    if (!actor.effects.get(effect.id)) return false;\n    await effect.delete({ [RESUMED_OPTION]: resumed });",
    to: "    await effect.delete({ [RESUMED_OPTION]: 0 });\n    const resumed = await resumeFrozenClocks(actor, record, effect.id);",
    breaks: "A2" },
  { file: STASISF, name: "F1 — two sweeps release one stasis twice",
    from: "  if (releasing.has(key)) return false;\n", to: "", breaks: "A5" },
  { file: STASISF, name: "F1 — the stasis's own clock is moved with the others",
    from: "    if (other.id === stasisId || other.flags?.[SYSTEM_ID]?.[STASIS_FLAG]) continue;\n", to: "", breaks: "A3" },
  { file: STASISF, name: "F1 — the hook moves the clocks a second time",
    from: "      const resumed = already !== undefined && already !== null\n        ? Number(already) || 0\n        : await resumeFrozenClocks(actor, record, effect.id);",
    to: "      const resumed = await resumeFrozenClocks(actor, record, effect.id);", breaks: "A10" },
  { file: STASISF, name: "F1 — the Fumble's critical deletes the stasis bare",
    from: "  if (outcome === \"end\") {\n    await releaseStasis(effect);", to: "  if (outcome === \"end\") {\n    await effect.delete();", breaks: "A9" },
  { file: APPLY, name: "F1 — the sweeps delete a stasis bare",
    from: "    await releaseStasis(effect);\n    return;\n", to: "    ;\n", breaks: "A7" },
  { file: APPLY, name: "F1 — the world-time sweep bypasses the release",
    from: "if (actor.effects.get(effect.id)) await endEffect(effect, actor);", to: "if (actor.effects.get(effect.id)) await effect.delete();", breaks: "A7" },
  { file: COMBAT, name: "F1 — the turn start deletes a due stasis bare",
    from: "this.round >= ends) await releaseStasis(held);", to: "this.round >= ends) await held.delete();", breaks: "A8" },
  { file: STASISF, name: "F1 — \"1 effect resume where they stood\"",
    from: 'resumed === 1 ? " resumes where it" : "s resume where they"', to: 'resumed === 1 ? " resume where they" : "s resume where they"', breaks: "A11" },

  // B — F2
  { file: FX, name: "F2 — the fruit is asked for a crystal's points (the shipped throw)",
    from: "          if (crystalStamp?.powerCrystal) {", to: "          if (crystalStamp) {", breaks: "B1" },

  // C — F3
  { file: USE, name: "F3 — the released spell charges its own cast time (the shipped cost)",
    from: "  if (printedTime) data.system.castAP = printedTime;\n", to: "", breaks: "C1" },
  { file: USE, name: "F3 — a scroll is read at the item's activation",
    from: 'const printedTime = consumableKind(item) === "scroll" ? null : activationCastTime(item?.system?.activation);',
    to: "const printedTime = activationCastTime(item?.system?.activation);", breaks: "C1" },

  // D — F4
  { file: CAST, name: "F4 — \"0 force damage\" on a spell that deals none",
    from: "  if (damageFormula || packet.taken > 0) lines.push(", to: "  lines.push(", breaks: "D1" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-drive-3614: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-drive-3614: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-drive-3614: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
