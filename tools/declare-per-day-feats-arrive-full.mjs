#!/usr/bin/env node
/**
 * One-shot: per-day feats arrive with their uses available.
 *
 * Graham's ruling, 17 September 2026 (Pillars of Faith 0.1.0 live test):
 * "Go as you have stated so the item arrives full." Every core feat with a
 * flat per-day count shipped with `usesValue: 0`, and `itemUsesRemaining`
 * reads a stored 0 as none left — so a freshly granted Bestial Resilience
 * refused its first Use until the next Daily Preparation.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "feats"), { valueEncoding: "json" });
await db.open();
const rows = [];
for await (const [key, value] of db.iterator()) {
  if (!key.startsWith("!items!")) continue;
  const per = Number(String(value.system?.usesPerDay ?? "").trim());
  if (Number.isFinite(per) && per > 0 && Number(value.system?.usesValue ?? 0) !== per) {
    rows.push({ name: value.name, from: value.system.usesValue, to: per });
  }
}
await db.close();

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const row of rows) {
  const id = `arrive-full-${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (file.fixes.some((f) => f.id === id)) continue;
  file.fixes.push({
    id, pack: "feats", name: row.name, path: "system.usesValue", from: row.from, to: row.to,
    declaredAt: "2026-09-17", systemVersion: "3.562.0",
    reason: `Graham's ruling, 17 September 2026: a per-day item arrives with its uses available. Shipped at ${row.from} with usesPerDay ${row.to}, so it read as spent until the first Daily Preparation.`
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-per-day-feats-arrive-full: ${added} declared (${rows.map((r) => r.name).join(", ")}), ${file.fixes.length} total.\n`);
