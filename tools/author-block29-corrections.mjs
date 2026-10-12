#!/usr/bin/env node
/**
 * author-block29-corrections — what the full sweep said about block 29.
 *
 * Run once at 3.591.0, after `author-block29-spells.mjs`. Four
 * corrections, three of them to my own work, all four found by checks
 * that already existed:
 *
 *  1. NATURAL DEFENCE goes back to carrying no effect rows at all.
 *     `verify-natural-defence` C5 has said since 3.560.0 that this is
 *     CORRECT RATHER THAN MISSING: the spell has its own workflow, its
 *     own 52-check harness, a reaction cast, a somatic component, a
 *     typed resistance modifier that reports whether it actually landed,
 *     and — the part that matters — `naturalDefenceSaveBonus`, a real
 *     caster-level step. I added a `heldBonus` row with a note saying
 *     the CL 10 step had to be "raised by hand". The step was already
 *     automated, by a better mechanism, and the note was wrong about the
 *     system it was written into.
 *
 *     THIRD TIME. Heal's warp and Indomitable's base were the same
 *     mistake in block 28: an absent row is often a finished decision
 *     whose evidence lives in a check nobody re-read.
 *
 *  2. WITHDRAWN. This slot held a "correction" to MANA DRAIN's warp,
 *     taking `rangeOverride: "unlimited"` back to inert on the argument
 *     that the LINK range is not the spell's targeting range. It was
 *     wrong twice over.
 *
 *     Wrong on the merits: `spellRangeFeet(warpedRange("30 feet",
 *     { rangeOverride: "unlimited" }))` is null, which is the range gate
 *     REMOVED, and that is what the warp's 2 PP buys. The spell's
 *     "NOT AUTOMATED" note is about spending another creature's PP, not
 *     about reaching them.
 *
 *     And wrong on the method, which is the part worth recording: the
 *     warp is one of the TEN BUILT in `verify-spell-range` section P,
 *     and W8 cites it BY NAME as the example of a warp removing the gate
 *     entirely. It was a finished decision with a check standing over it,
 *     and I overturned it without reading either \u2014 while writing the
 *     correction to Natural Defence, which is the same mistake.
 *
 *     Fourth time in two blocks. The rule, restated: before changing any
 *     authored row or warp mod that looks wrong, grep the tools/
 *     directory for the spell's name. An absent row and an inert warp
 *     are both common shapes for a decision; so is a live one.
 *
 *  3. LULLABY's sustain warp gains `endsSustain`. Its text is "you no
 *     longer have to Sustain the Spell"; setting only `durationText`
 *     bought a duration and left the caster sustaining anyway, which is
 *     the contradiction `verify-warped-duration` S2 exists to end.
 *
 *  4. MASTERWORK ITEM's two warps keep `qualityTier` — that key is
 *     correct — but the AGGREGATOR had never heard of it, which is
 *     fixed in magic/spell-warp.mjs rather than here. Recorded in this
 *     header because the two belong together.
 */

import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();

const CORRECTIONS = {
  "natural defence": (sy) => {
    sy.effects = [];
    return "effects cleared — the workflow was always the mechanism";
  },
  lullaby: (sy) => {
    sy.warps[0].mods = { durationText: "1 minute", endsSustain: true };
    return "warp 0 now ends the sustain it buys out of";
  }
};

let done = 0;
for await (const [key, value] of db.iterator()) {
  if (!key.startsWith("!items!") || value?.type !== "spell") continue;
  const fix = CORRECTIONS[String(value.name).trim().toLowerCase()];
  if (!fix) continue;
  const next = JSON.parse(JSON.stringify(value));
  const what = fix(next.system);
  await db.put(key, next);
  process.stdout.write(`  ${value.name}: ${what}\n`);
  done += 1;
}
await db.close();
process.stdout.write(`author-block29-corrections: ${done} of ${Object.keys(CORRECTIONS).length} applied.\n`);
