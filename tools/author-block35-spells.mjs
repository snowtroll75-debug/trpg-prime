#!/usr/bin/env node
/**
 * author-block35-spells — 3.613.0, block 35 part one (R1, R3, R5, R12–R14 and the no-ruling fixes).
 *
 * Writes `tools/block35-plan.mjs` to the spells pack, field for field. The
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
import { PLAN } from "./block35-plan.mjs";

const TEXT_FIXES = {};

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
    // NO TEXT FIXES IN THIS PART: the descriptions already read as printed.
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
process.stdout.write(`author-block35-spells: ${seen.size} of ${Object.keys(PLAN).length} applied.\n`);
// A PLAN THAT NAMES A SPELL THE PACK DOES NOT HOLD IS A FAILURE, not a
// shorter list: it is a row somebody believes is live and is not.
if (missing.length) {
  process.stderr.write(`NOT FOUND in the pack: ${missing.join(", ")}\n`);
  process.exit(1);
}
