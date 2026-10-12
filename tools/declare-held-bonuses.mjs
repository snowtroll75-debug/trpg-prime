#!/usr/bin/env node
/** One-shot: Guidance migrated, and the PP 1 spells that share its shape. 3.411.0. */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const current = {};
const WANT = ["Guidance", "Learned Council", "Weapon Surge", "Wizard Strike", "Physical Boost"];
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && WANT.includes(value?.name)) current[value.name] = value.system.effects ?? [];
}
await db.close();

const ANY_CHECK = ["attack", "save", "skill"];

const FIXES = [
  {
    name: "Guidance",
    to: [{
      kind: "heldBonus", target: "targets", label: "Guidance",
      value: 1, bonusType: "status", checkTypes: ANY_CHECK,
      immunitySeconds: 3600,
      spentNote: "Temporarily immune to Guidance for 1 hour."
    }],
    reason:
      'MIGRATED, not rewired. Guidance was built at 3.400.0 as a bespoke marker with its own card '
      + 'button, its own hardcoded +1 and its own hardcoded label. Four PP 1 spells then turned out '
      + 'to share its shape exactly, and four more buttons would have been five copies of one idea. '
      + 'It is now the first HELD BONUS, with its printed hour of immunity expressed as a field '
      + 'rather than as code. Behaviour is unchanged: +1 status to one attack, save or skill check, '
      + 'spent from the card, immunity stamped on spend and not on apply.'
  },
  {
    name: "Learned Council",
    to: [{
      kind: "heldBonus", target: "targets", label: "Learned Council",
      value: 2, bonusType: "circumstance", checkTypes: ANY_CHECK
    }],
    reason:
      'Was a note. "The ally gains a +2 circumstance bonus on any attack roll, saving throw, or '
      + 'skill check made before the beginning of your next turn" is Guidance\'s shape at +2 and a '
      + 'different pool. No immunity — the spell prints none.'
  },
  {
    name: "Weapon Surge",
    to: [{
      kind: "heldBonus", target: "self", label: "Weapon Surge",
      value: 1, bonusType: "status", checkTypes: ["attack"]
    }],
    reason:
      'Was a note. "On your next Strike with that weapon before the start of your next turn, you '
      + 'gain a +1 status bonus to the attack roll." Narrowed to attack checks. NOTE: the spell says '
      + '"with THAT weapon" and a posted check card does not name the weapon, so this reaches the '
      + 'next attack with any of them — flagged rather than fudged, and the remaining damage clause '
      + 'stays with the GM.'
  },
  {
    name: "Wizard Strike",
    to: [{
      kind: "heldBonus", target: "self", label: "Wizard Strike",
      value: 1, bonusType: "status", checkTypes: ["attack"]
    }],
    reason:
      'Unwired. "The next time you make an attack check before the end of your next turn" — attack '
      + 'checks only, one use, spent from the card.'
  },
  {
    name: "Physical Boost",
    to: [{
      kind: "heldBonus", target: "targets", label: "Physical Boost",
      value: 1, bonusType: "status", checkTypes: ["attribute"],
      subjects: ["strength", "dexterity", "constitution"]
    }],
    reason:
      'Unwired. "+1 status bonus to the next Constitution, Strength, or Dexterity based check." '
      + 'Scoped to ATTRIBUTE checks on those three, which is the narrow and defensible reading: a '
      + 'posted card reports a skill check by its SKILL key, so "a Strength based skill" is not '
      + 'identifiable from the card and claiming it would be a scope that matched by accident.'
  }
];

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const fix of FIXES) {
  const id = `held-${fix.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (file.fixes.some((f) => f.id === id)) continue;
  const from = current[fix.name];
  if (from === undefined) throw new Error(`${fix.name} not found`);
  file.fixes.push({
    id, pack: "spells", name: fix.name, path: "system.effects",
    from, to: fix.to, declaredAt: "2026-08-26", systemVersion: "3.411.0", reason: fix.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-held-bonuses: ${added} declared, ${file.fixes.length} total.\n`);
