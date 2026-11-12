#!/usr/bin/env node
/**
 * declare-ea-block8a-core — TRG Prime 3.686.0: the two core spells that
 * Eldritch Arts' Block 8a seams change in every world, approved by Graham on
 * 8 November 2026 (17:22, "As recommended": H17's Remove Curse half and H18).
 *
 *   Remove Curse  `effects: []` → a `counteract` row against effects from
 *                 Curse-trait spells, one a casting (H17; Q183). The page:
 *                 "You touch the target and attempt to counteract one curse
 *                 afflicting them."
 *   Insanity      the `note` row ("roll d10 each turn …") → the `turnTable`
 *                 row (H18), and its "+4 PP: the target is insane for 1 round
 *                 per 1 failure" warp gains `turnTablePer: 1`, which it
 *                 printed and never bought.
 *
 * DECLARED, as every pack edit is: each change is a row in tools/data-fixes.json
 * with its old value and a reason, and this writes the spells pack only, from
 * that row, refusing a value that is neither the old nor the new one (the
 * guard apply-data-fixes keeps). Idempotent: a row already there is kept, and
 * a field already at its new value is not written.
 *
 * NOT a migration: copies already on sheets keep their old rows until they are
 * re-added from the pack (no load-time rewrite of owned items).
 *
 *   node tools/declare-ea-block8a-core.mjs [--dry-run] [--apply-only]
 *
 * `--apply-only` writes the pack from the rows already declared (the packs
 * restore routine: `git checkout -- packs` puts the 3.685.3 pack back).
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { BLOCK8A_CORE_FIXES } from "./ea-block8a-core-fixes.mjs";

const dryRun = process.argv.includes("--dry-run");
const applyOnly = process.argv.includes("--apply-only");

function readPath(obj, dotted) { return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function writePath(obj, dotted, value) {
  const keys = dotted.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// 1. DECLARE: the rows join tools/data-fixes.json (kept when already there).
const fixesPath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(fixesPath, "utf8"));
let declared = 0;
if (!applyOnly) {
  for (const fix of BLOCK8A_CORE_FIXES) {
    if (file.fixes.some((f) => f.id === fix.id)) continue;
    file.fixes.push(JSON.parse(JSON.stringify(fix)));
    declared += 1;
  }
  if (declared && !dryRun) fs.writeFileSync(fixesPath, `${JSON.stringify(file, null, 2)}\n`);
}

// 2. APPLY, from the declared rows, to the spells pack only.
const rows = file.fixes.filter((f) => BLOCK8A_CORE_FIXES.some((b) => b.id === f.id));
if (rows.length !== BLOCK8A_CORE_FIXES.length && !dryRun) throw new Error("declare-ea-block8a-core: the rows are not all declared (run without --apply-only first)");
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
let applied = 0, already = 0;
const refused = [];
try {
  const found = new Map();
  for await (const [key, value] of db.iterator()) {
    if (!key.startsWith("!items!") || key.slice(7).includes("!")) continue;
    for (const fix of rows.length ? rows : BLOCK8A_CORE_FIXES) if (value?.name === fix.name) found.set(fix.id, { key, value: found.get(fix.id)?.value ?? value });
  }
  const docs = new Map();
  for (const fix of rows.length ? rows : BLOCK8A_CORE_FIXES) {
    const hit = found.get(fix.id);
    if (!hit) { refused.push(`${fix.id}: "${fix.name}" not in the spells pack`); continue; }
    const doc = docs.get(hit.key) ?? hit.value;
    const current = readPath(doc, fix.path);
    if (same(current, fix.to)) { already += 1; docs.set(hit.key, doc); continue; }
    if (!same(current, fix.from)) { refused.push(`${fix.id}: ${fix.path} is neither the declared old value nor the new one`); continue; }
    writePath(doc, fix.path, JSON.parse(JSON.stringify(fix.to)));
    docs.set(hit.key, doc);
    applied += 1;
  }
  if (!dryRun && applied) for (const [key, doc] of docs) await db.put(key, doc);
} finally {
  await db.close();
}
process.stdout.write(`declare-ea-block8a-core: ${declared} declared, ${applied} applied, ${already} already current${refused.length ? `, REFUSED: ${refused.join("; ")}` : ""}${dryRun ? " (dry run)" : ""}.\n`);
if (refused.length) process.exitCode = 1;
