#!/usr/bin/env node
/** One-shot: Daze's damage, per Graham's ruling 26 August 2026. */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
let system;
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && value?.name === "Daze") system = value.system;
}
await db.close();
if (!system) throw new Error("Daze not found in the pack");

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));

const REASON_BASE =
  'Graham\'s ruling, 26 August 2026: "Daze should have base damage of 1d4." The pack said 1d6 while '
  + 'the printed text says "You cause 1d4 damage to the target" — the only one of the eleven '
  + 'baseDamage spells where the die and the book actually disagreed. `baseDamage` is the PER-DIE '
  + 'value the item sheet documents as "used for warping and criticals", so for the other ten '
  + '(6d6 → 1d6, 2d10 → 1d10) it was right all along.';

const REASON_FORMULA =
  'The cast workflow rolls `system.damage.formula` and never reads `baseDamage`, so Daze — a PP 0 '
  + 'cantrip whose whole printed effect is 1d4 damage — dealt none. Type `mental`, from "you obscure '
  + 'the target\'s thoughts, causing a mental disruption" and matching the vocabulary already used by '
  + 'seven other spells. Category is `save`, so the Basic Save table scales it by degree. Found by '
  + 'tools/spell-automation-census.mjs, written after I told Graham PP 0 was finished when it was not.';

const additions = [
  { id: "daze-base-damage", path: "system.baseDamage", from: system.baseDamage, to: "1d4", reason: REASON_BASE },
  { id: "daze-damage-formula", path: "system.damage",
    from: system.damage, to: { ...system.damage, formula: "1d4", type: "mental" }, reason: REASON_FORMULA }
];

let added = 0;
for (const entry of additions) {
  if (file.fixes.some((f) => f.id === entry.id)) continue;
  file.fixes.push({
    id: entry.id, pack: "spells", name: "Daze", path: entry.path,
    from: entry.from, to: entry.to,
    declaredAt: "2026-08-26", systemVersion: "3.408.0", reason: entry.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-daze-fix: ${added} declared, ${file.fixes.length} total.\n`);
