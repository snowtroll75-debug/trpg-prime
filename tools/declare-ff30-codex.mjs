#!/usr/bin/env node
/**
 * declare-ff30-codex — 3.631.0, Fiends & Fables 3.0 block 1 (Chapter 2,
 * Creature Abilities; Graham's ruling of 9 October 2026: "all automated").
 *
 * The DATA half of the release: every Creature Codex entry that the audit
 * found "card only" or "text only" gains the declaration its rail reads.
 * The code half is in module/ (creature-ability-rules.mjs lists the
 * derives; codex-actions-workflow.mjs, creature-area.mjs,
 * combat/compound-action.mjs, breath-memory.mjs, codex-hooks-workflow.mjs
 * the rest). Two entries new in 3.0 — Scorching Breath and Wing Buffet —
 * are authored.
 *
 * WRITTEN DIRECTLY, AND DECLARED HERE. `apply-data-fixes` sets one field
 * with a from/to guard; these are sixty-odd object-valued flags and two
 * whole items, so the declaration IS this file (as declare-luminance.mjs
 * is for Luminance) and `verify-ff30-codex.mjs` reads the packs back and
 * checks each one is there. Idempotent: the same flags land the same way
 * on every run, and the two authored items keep fixed ids.
 *
 *   node tools/declare-ff30-codex.mjs [--dry-run]
 */
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { CODEX_DECLARATIONS, NEW_ENTRIES, FEAT_DECLARATIONS, MODULE_OWNED_FEATS } from "./ff30-codex-declarations.mjs";

const { ClassicLevel } = await import("classic-level");
const dryRun = process.argv.includes("--dry-run");

async function openPack(name) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  await db.open();
  return db;
}

function mergeFlags(current, declared) {
  // The declared block REPLACES each top-level key it names (auras, the
  // creatureAbility sub-keys), and keeps everything else the entry had.
  const flags = structuredClone(current ?? {});
  const trg = { ...(flags["trg-prime"] ?? {}) };
  for (const [key, value] of Object.entries(declared)) {
    if (key === "creatureAbility") {
      trg.creatureAbility = { ...(trg.creatureAbility ?? {}), ...value };
      if (value.derives !== undefined) trg.creatureAbility.derives = { ...(trg.creatureAbility?.derives ?? {}), ...value.derives };
    } else {
      trg[key] = value;
    }
  }
  flags["trg-prime"] = trg;
  return flags;
}

let written = 0, unchanged = 0, missing = 0, authored = 0, removed = 0;
for (const pack of ["creature-abilities", "abilities"]) {
  const db = await openPack(pack);
  try {
    const byName = new Map();
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!")) byName.set(String(value?.name ?? "").trim().toLowerCase(), { key, value });
    }
    for (const [name, declared] of Object.entries(CODEX_DECLARATIONS)) {
      const hit = byName.get(name.toLowerCase());
      if (!hit) continue;
      const next = mergeFlags(hit.value.flags, declared.flags);
      const nextValue = { ...hit.value, flags: next };
      if (declared.description) nextValue.system = { ...nextValue.system, description: declared.description };
      if (declared.system) nextValue.system = { ...nextValue.system, ...declared.system };
      if (JSON.stringify(nextValue) === JSON.stringify(hit.value)) { unchanged++; continue; }
      if (!dryRun) await db.put(hit.key, nextValue);
      written++;
      process.stdout.write(`  ${dryRun ? "would declare" : "declared"}  ${pack}: ${hit.value.name} — ${Object.keys(declared.flags).join(", ")}\n`);
    }
    if (pack === "creature-abilities") {
      for (const entry of NEW_ENTRIES) {
        const key = `!items!${entry._id}`;
        const exists = byName.get(entry.name.toLowerCase());
        if (exists && exists.key !== key) { process.stdout.write(`  SKIP ${entry.name}: already present under another id (${exists.key})\n`); continue; }
        const current = exists?.value ?? null;
        const doc = { ...entry, _key: key };
        if (current && JSON.stringify({ ...current, _key: key }) === JSON.stringify(doc)) { unchanged++; continue; }
        if (!dryRun) await db.put(key, doc);
        authored++;
        process.stdout.write(`  ${dryRun ? "would author" : "authored"}   ${pack}: ${entry.name}\n`);
      }
    }
  } finally {
    await db.close();
  }
}
// BLOCK 2 (3.632.0): the feats pack — Chapter 3's declarations and its
// three feats the pack lacked. `flags` replace the keys they name.
{
  const db = await openPack("feats");
  try {
    const byName = new Map();
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!") && value?.type === "feat") byName.set(String(value?.name ?? "").trim().toLowerCase(), { key, value });
    }
    for (const [name, declared] of Object.entries(FEAT_DECLARATIONS)) {
      const hit = byName.get(name.toLowerCase());
      if (!hit) { missing++; process.stdout.write(`  MISSING feats: ${name}\n`); continue; }
      const nextValue = { ...hit.value };
      if (declared.flags) nextValue.flags = { ...(hit.value.flags ?? {}), "trg-prime": { ...(hit.value.flags?.["trg-prime"] ?? {}), ...declared.flags } };
      if (declared.system) nextValue.system = { ...nextValue.system, ...declared.system };
      if (JSON.stringify(nextValue) === JSON.stringify(hit.value)) { unchanged++; continue; }
      if (!dryRun) await db.put(hit.key, nextValue);
      written++;
      process.stdout.write(`  ${dryRun ? "would declare" : "declared"}  feats: ${hit.value.name}\n`);
    }
    // The module owns these (3.632.1): a core copy is a duplicate in the picker.
    for (const entry of MODULE_OWNED_FEATS) {
      const key = `!items!${entry._id}`;
      if ((await db.get(key).catch(() => undefined)) === undefined) { unchanged++; continue; }
      if (!dryRun) await db.del(key);
      removed++;
      process.stdout.write(`  ${dryRun ? "would remove" : "removed"}    feats: ${entry.name} (Fiends & Fables Prime ships it)\n`);
    }
  } finally {
    await db.close();
  }
}
for (const name of Object.keys(CODEX_DECLARATIONS)) {
  // Reported, not thrown: a name the packs lack is a typo here, and the
  // verify file is what makes it loud.
  void name;
}
process.stdout.write(`\ndeclare-ff30-codex: ${written} declared, ${authored} authored, ${removed} removed, ${unchanged} already current${missing ? `, ${missing} missing` : ""}${dryRun ? " (dry run)" : ""}.\n`);
