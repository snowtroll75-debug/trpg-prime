#!/usr/bin/env node
/**
 * author-block34-spells — 3.611.0, block 34 (pages 341–350) and Graham's rulings of 2 October 2026.
 *
 * Writes `tools/block34-plan.mjs` to the spells pack, field for field. The
 * reasoning for every row lives in the plan beside the page it quotes;
 * this file only carries it across.
 *
 * WHOLE FIELDS ARE REPLACED, NOT MERGED. Each plan names the complete
 * value a field should hold, because a merge would keep whatever stale
 * rows the pack had — Sound Burst's two notes restating the deafened row
 * are exactly that — and the pack-repair manifest records old → new per
 * field, which only means something if "new" is the whole field.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { PLAN } from "./block34-plan.mjs";

const TEXT_FIXES = {
  // R1: the 3.8.1 rulebook — "otherwise, it drops to 0 HP".
  "Word Of Death": [["otherwise, it drops to -10 HP.", "otherwise, it drops to 0 HP."]],
  // The chapter's next heading had been swept into this description, and
  // R2: "PP 14: the status bonus increases to +3" — automatic at 14 PP.
  "Zealous Conviction": [
    ["\nSPECIALIST SPELLS\nSpecialist spells are granted by your race, character class and archetype feats. Their descriptions follow the same format as normal spells as discussed at the beginning of this chapter with the exception that a magical tradition is not provided as this will always be based upon your primary tradition.\nEach of the spells will have at least one trait relating to a race, class or archetype.\n", "\n"],
    ["PP 14: the status bonus increases to +15", "PP 14: the status bonus increases to +3 (automatic when 14 or more PP are spent on the spell)"]
  ]
};

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const seen = new Set();
const lines = [];
try {
  for await (const [key, value] of db.iterator()) {
    if (!key.startsWith("!items!") || value?.type !== "spell") continue;
    const plan = PLAN[String(value.name).trim()];
    if (!plan) continue;
    const next = JSON.parse(JSON.stringify(value));
    for (const [field, to] of Object.entries(plan)) next.system[field] = JSON.parse(JSON.stringify(to));
    // THE TEXT A PLAYER READS, corrected beside the rows (R1, R2). Display
    // only, so no pack-repair entry: the engine never reads a description.
    for (const [from, to] of TEXT_FIXES[String(value.name).trim()] ?? []) {
      const before = String(next.system.description ?? "");
      // ALREADY CORRECTED IS NOT A FAILURE: a second run must be a no-op.
      if (!before.includes(from) && (!to.trim() || before.includes(to))) continue;
      if (!before.includes(from)) throw new Error(`${value.name}: description no longer reads "${from}"`);
      next.system.description = before.replace(from, to);
    }
    await db.put(key, next);
    seen.add(value.name);
    lines.push(`  ${value.name}: ${Object.keys(plan).join(", ")}`);
  }
} finally {
  await db.close();
}
const missing = Object.keys(PLAN).filter((n) => !seen.has(n));
process.stdout.write(lines.sort().join("\n") + "\n");
process.stdout.write(`author-block34-spells: ${seen.size} of ${Object.keys(PLAN).length} applied.\n`);
// A PLAN THAT NAMES A SPELL THE PACK DOES NOT HOLD IS A FAILURE, not a
// shorter list: it is a row somebody believes is live and is not.
if (missing.length) {
  process.stderr.write(`NOT FOUND in the pack: ${missing.join(", ")}\n`);
  process.exit(1);
}
