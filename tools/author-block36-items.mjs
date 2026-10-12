#!/usr/bin/env node
/**
 * author-block36-items — 3.615.0, block 36 (pages 361–370).
 *
 * Writes `tools/block36-plan.mjs` to three item packs: specific-items, runes
 * and charged-items. The reasoning for every row lives in the plan.
 *
 * IDEMPOTENT: a text fix already made is skipped, a text fix whose "from"
 * is missing and whose "to" is not present is a failure.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { SPECIFIC, RUNE_NOTES, RUNE_AUTOMATION, POTENCY_ON, RUNE_TEXT, CHARGED } from "./block36-plan.mjs";

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

// SPECIFIC ITEMS
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

// RUNES
await edit("runes", (item) => {
  const rune = item.flags?.["trg-prime"]?.rune;
  if (!rune) return null;
  const changed = [];
  const note = RUNE_NOTES[rune.key];
  if (note) {
    const before = item.system.description;
    item.system.description = fixText(item.name, before, [note]);
    if (item.system.description !== before) changed.push("note");
  }
  if (RUNE_AUTOMATION[rune.key] && rune.automation !== RUNE_AUTOMATION[rune.key]) {
    rune.automation = RUNE_AUTOMATION[rune.key];
    changed.push("automation");
  }
  for (const [prefix, on] of Object.entries(POTENCY_ON)) {
    if (String(item.name).startsWith(prefix) && JSON.stringify(rune.on) !== JSON.stringify(on)) {
      rune.on = [...on];
      changed.push("on");
    }
  }
  if (RUNE_TEXT[item.name]) {
    const before = item.system.description;
    item.system.description = fixText(item.name, before, RUNE_TEXT[item.name]);
    if (item.system.description !== before) changed.push("text");
  }
  return changed.length ? changed.join(", ") : null;
});

// CHARGED ITEMS
const chargedSeen = await edit("charged-items", (item) => {
  const plan = CHARGED[item.name];
  if (!plan) return null;
  const flags = (item.flags ??= {})["trg-prime"] ??= {};
  const charged = flags.chargedItem ??= {};
  const changed = [];
  for (const [field, to] of Object.entries(plan)) {
    if (field === "text") {
      item.system.description = fixText(item.name, item.system.description, to);
      changed.push("description");
    } else if (field === "conditionals") {
      flags.conditionals = JSON.parse(JSON.stringify(to));
      changed.push("conditionals");
    } else {
      charged[field] = JSON.parse(JSON.stringify(to));
      changed.push(field);
    }
  }
  return changed.join(", ");
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
process.stdout.write(`author-block36-items: ${specificSeen.size} specific, ${chargedSeen.size} charged, runes noted.\n`);
