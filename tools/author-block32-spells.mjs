#!/usr/bin/env node
/**
 * author-block32-spells — 3.606.0, the first half of block 32's R1.
 *
 * Writes `tools/block32-plan.mjs` to the spells pack, field for field. The
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
import { PLAN } from "./block32-plan.mjs";

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
    await db.put(key, next);
    seen.add(value.name);
    lines.push(`  ${value.name}: ${Object.keys(plan).join(", ")}`);
  }
} finally {
  await db.close();
}
const missing = Object.keys(PLAN).filter((n) => !seen.has(n));
process.stdout.write(lines.sort().join("\n") + "\n");
process.stdout.write(`author-block32-spells: ${seen.size} of ${Object.keys(PLAN).length} applied.\n`);
// A PLAN THAT NAMES A SPELL THE PACK DOES NOT HOLD IS A FAILURE, not a
// shorter list: it is a row somebody believes is live and is not.
if (missing.length) {
  process.stderr.write(`NOT FOUND in the pack: ${missing.join(", ")}\n`);
  process.exit(1);
}
