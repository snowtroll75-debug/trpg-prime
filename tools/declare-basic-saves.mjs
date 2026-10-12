#!/usr/bin/env node
/**
 * One-shot: the two spells that share Surge Of The Tempest's shape.
 * 3.442.0.
 *
 * GRAHAM'S RULING, 29 August 2026: "Surge of the tempest should be basic
 * reflex." Its stat block prints "Saving Throw Reflex" and its prose says
 * "must make a BASIC Reflex save"; the prose wins.
 *
 * THE RULING IS ABOUT A SHAPE, NOT A SPELL. A sweep of Core 3.7 — every
 * entry bounded by the next entry's heading, after a first pass with a
 * loose window reported 91 hits by reading into its neighbours — found
 * exactly two more spells with the same three properties: the header
 * names a save WITHOUT the word basic, the prose says basic, and the pack
 * carries a damage formula for the ladder to scale. Both are fixed here.
 *
 * STORM OF VENGEANCE IS NOT, on Graham's instruction. Its prose says
 * "4d12 electricity damage (basic Reflex)" against a pack that holds
 * Fortitude and 4d8 — a save TYPE and a damage DIE in disagreement, not a
 * missing word — and that is a different question from this one. Held and
 * reported rather than guessed.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const current = {};
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && value?.type === "spell") current[value.name] = value.system;
}
await db.close();

const FIXES = [
  {
    name: "Earthquake", to: "Basic Reflex",
    reason:
      'Header prints "Saving Throw Reflex"; the prose reads "A collapse inflicts a 10d6 bludgeoning '
      + 'damage (basic reflex)". The pack rolls 10d6, so without the word a successful save took the '
      + 'full ten dice. Same shape as Surge Of The Tempest and covered by the same ruling.'
  },
  {
    name: "Flaming Sphere", to: "Basic Reflex",
    reason:
      'Header prints "Saving Throw Reflex"; the prose reads "each creature must attempt a basic '
      + 'Reflex save". The pack rolls 3d6. This is Surge Of The Tempest\'s shape exactly — the '
      + 'header names the save and the body adds the word the header left out.'
  }
];

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const fix of FIXES) {
  const id = `basic-save-${fix.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (file.fixes.some((f) => f.id === id)) continue;
  const held = current[fix.name];
  if (!held) throw new Error(`${fix.name} not found`);
  file.fixes.push({
    id, pack: "spells", name: fix.name, path: "system.defence",
    from: held.defence, to: fix.to,
    declaredAt: "2026-08-29", systemVersion: "3.442.0", reason: fix.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-basic-saves: ${added} declared, ${file.fixes.length} total.\n`);
