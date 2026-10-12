#!/usr/bin/env node
/** One-shot: the PP 1 spells that are plain bonuses. 3.410.0. */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const current = {};
const WANT = ["Veiled Presence", "Physical Surge", "Quick Time", "Fluidity", "Spirit Of The Hunt"];
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && WANT.includes(value?.name)) current[value.name] = value.system.effects ?? [];
}
await db.close();

const FIXES = [
  {
    name: "Veiled Presence",
    to: [
      { kind: "bonus", target: "self", slot: "deception", bonusType: "status", value: 2 },
      { kind: "bonus", target: "self", slot: "stealth", bonusType: "status", value: 2 }
    ],
    reason:
      'Unwired. "+2 status bonus to Deception and Stealth checks" — two plain bonus rows, one per '
      + 'skill, because the pool is per-slot. Self, 1 minute. The rest of the spell (blending into a '
      + 'crowd) is narrative and stays so.'
  },
  {
    name: "Physical Surge",
    to: [
      { kind: "bonus", target: "self", slot: "speed", bonusType: "status", value: 10 },
      { kind: "bonus", target: "self", slot: "athletics", bonusType: "status", value: 2 }
    ],
    reason:
      'Unwired. "+10-foot status bonus to your Speed and a +2 status bonus to all Athletics checks." '
      + 'The Speed half is the first user of the movement slot added this release — before it, '
      + '`bonusTargetFor("speed")` pointed at `system.combat.speed`, which no actor has, and this '
      + 'row would have applied nothing at all. The free Stride/Leap/Climb/Swim is an action grant '
      + 'and stays with the GM.'
  },
  {
    name: "Fluidity",
    to: [
      { kind: "bonus", target: "self", slot: "speed", bonusType: "status", value: 5 },
      { kind: "note", text: "You ignore difficult terrain for the duration, and may Stride or Step as part of casting." }
    ],
    reason:
      'Unwired. "+5-foot status bonus to your Speed" is a bonus; "ignore difficult terrain" has no '
      + 'engine to hang on and stays a note rather than being pretended at.'
  },
  {
    name: "Quick Time",
    to: [{ kind: "bonus", target: "targets", slot: "speed", bonusType: "status", value: 10 }],
    reason:
      'Unwired. "Both you and all allies in the area gain a +10-foot status bonus to all Speeds." '
      + 'A 60-foot radius area spell, so the template already picks the recipients out; the row '
      + 'targets them. NOTE: the book says "all Speeds" and this grants land only — the movement '
      + 'slot map can express fly/swim/climb/burrow individually, but a single row cannot yet mean '
      + '"every speed at once", and inventing four rows would claim a precision the mechanism does '
      + 'not have. Flagged rather than fudged.'
  },
  {
    name: "Spirit Of The Hunt",
    to: [{ kind: "note", text: "Advantage on Search (Perception) checks for the duration." }],
    reason:
      'NOT wired to a bonus, deliberately. "Granting advantage on Search (Perception) checks" is '
      + 'ADVANTAGE, not a numeric bonus, and there is no spell-effect kind that grants a conditional. '
      + 'Left as a note that states the rule plainly; wiring it as a +N would be a different rule '
      + 'wearing this one\'s name.'
  }
];

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const fix of FIXES) {
  const id = `pp1-${fix.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (file.fixes.some((f) => f.id === id)) continue;
  const from = current[fix.name];
  if (from === undefined) throw new Error(`${fix.name} not found`);
  file.fixes.push({
    id, pack: "spells", name: fix.name, path: "system.effects",
    from, to: fix.to, declaredAt: "2026-08-26", systemVersion: "3.410.0", reason: fix.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-pp1-bonuses: ${added} declared, ${file.fixes.length} total.\n`);
