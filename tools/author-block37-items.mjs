#!/usr/bin/env node
/**
 * author-block37-items — 3.617.0, block 37 (pages 371–383).
 *
 * Writes `tools/block37-plan.mjs` to the consumables, spells and wondrous
 * packs. The reasoning for every row lives in the plan.
 *
 * IDEMPOTENT: flags and fields are set to the plan's values; a description
 * already rewritten is skipped; the new wondrous items have fixed ids and are
 * replaced wholesale.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { CONSUMABLES, SPELLS, WONDROUS, NEW_WONDROUS } from "./block37-plan.mjs";

const lines = [];
const problems = [];
const clone = (value) => JSON.parse(JSON.stringify(value));

async function edit(pack, apply, after = null) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open();
  const seen = new Set();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!")) continue;
      const next = clone(value);
      const touched = apply(next);
      if (!touched) continue;
      await db.put(key, next);
      seen.add(value.name);
      lines.push(`  ${pack}: ${value.name} — ${touched}`);
    }
    if (after) await after(db);
  } finally {
    await db.close();
  }
  return seen;
}

const consumablesSeen = await edit("consumables", (item) => {
  const plan = CONSUMABLES[item.name];
  if (!plan) return null;
  const touched = [];
  for (const [field, to] of Object.entries(plan.system ?? {})) {
    item.system[field] = clone(to);
    touched.push(field);
  }
  if (plan.consumable) {
    const flags = (item.flags ??= {})["trg-prime"] ??= {};
    const consumable = flags.consumable ??= {};
    for (const [field, to] of Object.entries(plan.consumable)) {
      consumable[field] = clone(to);
      touched.push(`consumable.${field}`);
    }
  }
  return touched.join(", ");
});

const spellsSeen = await edit("spells", (item) => {
  const plan = SPELLS[item.name];
  if (!plan) return null;
  for (const [field, to] of Object.entries(plan)) item.system[field] = clone(to);
  return Object.keys(plan).join(", ");
});

const wondrousSeen = await edit("wondrous", (item) => {
  const plan = WONDROUS[item.name];
  if (!plan) return null;
  const touched = [];
  for (const [field, to] of Object.entries(plan.system ?? {})) {
    item.system[field] = clone(to);
    touched.push(field);
  }
  if (plan.note) {
    const [from, to] = plan.note;
    const text = String(item.system.description ?? "");
    if (!text.includes(to)) {
      if (!text.includes(from)) problems.push(`${item.name}: description no longer reads "${from}"`);
      else { item.system.description = text.replace(from, to); touched.push("description"); }
    }
  }
  for (const key of plan.dropFlags ?? []) {
    const wondrous = item.flags?.["trg-prime"]?.wondrous;
    if (wondrous && Object.hasOwn(wondrous, key)) { delete wondrous[key]; touched.push(`-${key}`); }
  }
  return touched.length ? touched.join(", ") : null;
}, async (db) => {
  for (const row of NEW_WONDROUS) {
    await db.put(`!items!${row._id}`, {
      _id: row._id,
      name: row.name,
      type: "gear",
      img: "icons/svg/mystery-man.svg",
      system: {
        quantity: 1,
        weight: row.weight,
        price: row.price,
        equipped: false,
        invested: false,
        hp: { value: 0, max: 0 },
        traits: row.traits,
        description: row.description,
        slot: row.slot,
        uses: 0,
        itemSize: "medium",
        itemLevel: row.level,
        heldHands: 0,
        formulae: "",
        spellbookContainer: false
      },
      effects: [],
      folder: null,
      sort: 0,
      ownership: { default: 0 },
      flags: { "trg-prime": { wondrous: clone(row.wondrous) } },
      _stats: {
        coreVersion: "14",
        systemId: "trg-prime",
        systemVersion: "3.617.0",
        createdTime: 1791072000000,
        modifiedTime: 1791072000000,
        lastModifiedBy: null,
        compendiumSource: null,
        duplicateSource: null
      }
    });
    lines.push(`  wondrous: ${row.name} — written (${row._id})`);
  }
});

process.stdout.write(lines.sort().join("\n") + "\n");
// Faith's Eye's and the Gloves' rows are skipped once applied, so only the
// rows that always write are required to be seen.
const missing = [
  ...Object.keys(CONSUMABLES).filter((n) => !consumablesSeen.has(n)),
  ...Object.keys(SPELLS).filter((n) => !spellsSeen.has(n)),
  ...Object.entries(WONDROUS).filter(([, plan]) => plan.system).map(([n]) => n).filter((n) => !wondrousSeen.has(n))
];
for (const name of missing) problems.push(`${name}: not found in its pack`);
if (problems.length) {
  process.stderr.write(problems.map((p) => `PROBLEM ${p}`).join("\n") + "\n");
  process.exit(1);
}
