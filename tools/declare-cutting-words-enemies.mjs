#!/usr/bin/env node
/**
 * One-shot: declare Cutting Words as enemies-only at 3.434.0.
 *
 * 3.432.0 enforced Graham's "enemies only" ruling by matching the
 * spell's NAME, and recorded that as the weak part of the fix. This
 * moves it onto the pack entry, where every other per-spell behaviour
 * lives — and `areaTargeting` already means "which side is this aimed
 * at", so nothing new had to be invented.
 */
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const dir = path.join(SYSTEM_ROOT, "packs", "spells");
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(dir, { valueEncoding: "json" });
await db.open();
let key = null, doc = null;
for await (const [k, v] of db.iterator()) {
  if (k.startsWith("!items!") && v?.name === "Cutting Words") { key = k; doc = v; break; }
}
if (!doc) { await db.close(); throw new Error("Cutting Words not found"); }
const was = doc.system.areaTargeting;
doc.system.areaTargeting = "enemies";
await db.put(key, doc);
await db.close();
console.log(`Cutting Words: areaTargeting ${JSON.stringify(was)} -> "enemies".`);
