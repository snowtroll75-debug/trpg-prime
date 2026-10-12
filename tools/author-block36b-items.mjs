#!/usr/bin/env node
/**
 * author-block36b-items — 3.616.0, block 36 part two (pages 361–370).
 *
 * Writes `tools/block36b-plan.mjs` to the specific-items, charged-items and
 * runes packs. The reasoning for every row lives in the plan.
 *
 * IDEMPOTENT: a note already rewritten is skipped; a note whose "from" is
 * missing and whose "to" is not present is a failure.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { SPECIFIC, CHARGED, RUNE_NOTES } from "./block36b-plan.mjs";

const lines = [];
const problems = [];

async function edit(pack, apply) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open();
  const seen = new Set();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!")) continue;
      const next = JSON.parse(JSON.stringify(value));
      const touched = apply(next);
      if (!touched) continue;
      await db.put(key, next);
      seen.add(value.name);
      lines.push(`  ${pack}: ${value.name} — ${touched}`);
    }
  } finally {
    await db.close();
  }
  return seen;
}

const specificSeen = await edit("specific-items", (item) => {
  const plan = SPECIFIC[item.name];
  if (!plan) return null;
  for (const [field, to] of Object.entries(plan.system ?? {})) item.system[field] = JSON.parse(JSON.stringify(to));
  if (plan.specificItem) {
    item.flags ??= {};
    item.flags["trg-prime"] ??= {};
    item.flags["trg-prime"].specificItem = { ...(item.flags["trg-prime"].specificItem ?? {}), ...plan.specificItem };
  }
  return Object.keys(plan.system ?? {}).concat(plan.specificItem ? ["specificItem"] : []).join(", ");
});

const chargedSeen = await edit("charged-items", (item) => {
  const plan = CHARGED[item.name];
  if (!plan) return null;
  const flags = (item.flags ??= {})["trg-prime"] ??= {};
  const charged = flags.chargedItem ??= {};
  for (const [field, to] of Object.entries(plan)) charged[field] = JSON.parse(JSON.stringify(to));
  return Object.keys(plan).join(", ");
});

await edit("runes", (item) => {
  const rune = item.flags?.["trg-prime"]?.rune;
  const note = rune ? RUNE_NOTES[rune.key] : null;
  if (!note) return null;
  const [from, to] = note;
  const text = String(item.system.description ?? "");
  if (text.includes(to)) return null;
  if (!text.includes(from)) {
    problems.push(`${item.name}: description no longer reads "${from.slice(0, 60)}…"`);
    return null;
  }
  item.system.description = text.replace(from, to);
  return "note";
});

process.stdout.write(lines.sort().join("\n") + "\n");
const missing = [
  ...Object.keys(SPECIFIC).filter((n) => !specificSeen.has(n)),
  ...Object.keys(CHARGED).filter((n) => !chargedSeen.has(n))
];
if (missing.length) problems.push(`NOT FOUND: ${missing.join(", ")}`);
if (problems.length) {
  process.stderr.write(problems.join("\n") + "\n");
  process.exit(1);
}
process.stdout.write(`author-block36b-items: ${specificSeen.size} specific, ${chargedSeen.size} charged, runes noted.\n`);
