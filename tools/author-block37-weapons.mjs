#!/usr/bin/env node
/**
 * author-block37-weapons — 3.618.0, block 37's weapons (pages 377–380).
 *
 * Writes `tools/block37w-plan.mjs` to two item packs: specific-items and
 * runes. The reasoning for every row lives in the plan.
 *
 * IDEMPOTENT: a text fix already made is skipped, a text fix whose "from"
 * is missing and whose "to" is not present is a failure.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { SPECIFIC, RUNE_NOTES, RUNE_AUTOMATION, RUNE_TEXT } from "./block37w-plan.mjs";

const lines = [];
const problems = [];

function fixText(name, description, fixes) {
  let text = String(description ?? "");
  for (const [from, to] of fixes ?? []) {
    if (text.includes(from)) { text = text.replace(from, to); continue; }
    if (to && text.includes(to)) continue;
    if (!to && !text.includes(from)) continue;
    problems.push(`${name}: description no longer reads "${from.slice(0, 60)}…"`);
  }
  return text;
}

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

// SPECIFIC WEAPONS
const specificSeen = await edit("specific-items", (item) => {
  const plan = SPECIFIC[item.name];
  if (!plan) return null;
  const changed = [];
  for (const [field, to] of Object.entries(plan.system ?? {})) {
    if (JSON.stringify(item.system[field]) === JSON.stringify(to)) continue;
    item.system[field] = JSON.parse(JSON.stringify(to));
    changed.push(field);
  }
  if (plan.specificItem) {
    item.flags ??= {};
    item.flags["trg-prime"] ??= {};
    const before = JSON.stringify(item.flags["trg-prime"].specificItem ?? {});
    item.flags["trg-prime"].specificItem = { ...(item.flags["trg-prime"].specificItem ?? {}), ...JSON.parse(JSON.stringify(plan.specificItem)) };
    if (JSON.stringify(item.flags["trg-prime"].specificItem) !== before) changed.push("specificItem");
  }
  return changed.length ? changed.join(", ") : "(already)";
});

// RUNES
const runeSeen = new Set();
await edit("runes", (item) => {
  const rune = item.flags?.["trg-prime"]?.rune;
  if (!rune) return null;
  const changed = [];
  const note = RUNE_NOTES[rune.key];
  if (note) {
    runeSeen.add(rune.key);
    const before = item.system.description;
    item.system.description = fixText(item.name, before, [note]);
    if (item.system.description !== before) changed.push("note");
  }
  if (RUNE_AUTOMATION[rune.key] && rune.automation !== RUNE_AUTOMATION[rune.key]) {
    rune.automation = RUNE_AUTOMATION[rune.key];
    changed.push("automation");
  }
  if (RUNE_TEXT[item.name]) {
    runeSeen.add(item.name);
    const before = item.system.description;
    item.system.description = fixText(item.name, before, RUNE_TEXT[item.name]);
    if (item.system.description !== before) changed.push("text");
  }
  return changed.length ? changed.join(", ") : null;
});

process.stdout.write(lines.sort().join("\n") + "\n");
const missing = [
  ...Object.keys(SPECIFIC).filter((n) => !specificSeen.has(n)),
  ...Object.keys(RUNE_NOTES).filter((k) => !runeSeen.has(k)),
  ...Object.keys(RUNE_TEXT).filter((n) => !runeSeen.has(n))
];
if (missing.length) problems.push(`NOT FOUND: ${missing.join(", ")}`);
if (problems.length) {
  process.stderr.write(problems.join("\n") + "\n");
  process.exit(1);
}
process.stdout.write(`author-block37-weapons: ${specificSeen.size} specific weapons, ${runeSeen.size} runes noted.\n`);
