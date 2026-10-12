#!/usr/bin/env node
/** One-shot: the attitude spells at 3.409.0. Pariah is deliberately absent. */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const current = {};
const WANT = ["Tame", "Charm Kind", "Charm Animal", "Charm Undead", "Alluring Caress", "Thrall"];
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && WANT.includes(value?.name)) current[value.name] = value.system.effects ?? [];
}
await db.close();

const CHARM_NOTE = "It can't take hostile actions against you, and the spell ends if you use "
  + "hostile actions against it — both GM-adjudicated.";

const FIXES = [
  {
    name: "Tame",
    to: [{ kind: "attitude", target: "targets", steps: 1 },
      { kind: "note", text: "Once the spell ends the target is temporarily immune for 1 day." }],
    reason:
      'Unwired, and the last PP 0 spell with real mechanics. "Improve the target\'s disposition '
      + 'towards you by one step... This effect lasts for the duration of the spell" — so a STEP '
      + 'rather than a charm, and TEMPORARY: it rides the spell\'s own 1 minute (10 at CL 5) in the '
      + 'temporary layer, leaving whatever the creature permanently thought untouched. The day\'s '
      + 'immunity afterwards is left as a note; temporary-immunity.mjs exists but nothing yet reads '
      + 'it for attitude, and wiring half of it would be worse than saying so.'
  },
  {
    name: "Charm Kind",
    to: [{ kind: "attitude", target: "targets", to: "friendly" }, { kind: "note", text: CHARM_NOTE }],
    reason:
      'Was a note that printed the rule and changed nothing. "The target\'s attitude becomes '
      + 'friendly toward you (helpful if already friendly)" is the charm sentence five spells share '
      + '— neither a set (which would DOWNGRADE a helpful creature) nor a shift (which would leave '
      + 'a hostile one merely unfriendly). Temporary, on the spell\'s printed 10 minutes.'
  },
  {
    name: "Charm Animal",
    to: [{ kind: "attitude", target: "targets", to: "friendly" }, { kind: "note", text: CHARM_NOTE }],
    reason: 'As Charm Kind; the spell\'s own duration is 1 hour, which the per-effect duration '
      + 'reader picks up without this row saying anything.'
  },
  {
    name: "Charm Undead",
    to: [{ kind: "attitude", target: "targets", to: "friendly", onSave: ["failure", "fumble", "blunder"] },
      { kind: "note", text: CHARM_NOTE }],
    reason:
      'Unwired. Its ladder is explicit — critical and success are both "unaffected" (differing only '
      + 'in what the target believes, which is GM-facing), and only failure and worse charm it. '
      + 'Gated with onSave so a successful save takes nothing, which is the defect 3.404.0 existed '
      + 'to remove. Sustained, 1 minute.'
  },
  {
    name: "Alluring Caress",
    to: [{ kind: "attitude", target: "targets", to: "friendly", onSave: ["failure"] },
      { kind: "attitude", target: "targets", to: "helpful", onSave: ["fumble", "blunder"] },
      { kind: "note", text: CHARM_NOTE }],
    reason:
      'Unwired, and its two bad degrees differ: failure is the charm sentence ("friendly, or helpful '
      + 'if it was already friendly"), fumble is a flat "becomes helpful". Two gated rows rather '
      + 'than one, because they are genuinely different outcomes. 10 minutes (D).'
  },
  {
    name: "Thrall",
    to: [{ kind: "attitude", target: "targets", to: "friendly", onSave: ["success"], duration: "10 minutes" },
      { kind: "attitude", target: "targets", to: "helpful", onSave: ["failure"], duration: "24 hours" },
      { kind: "attitude", target: "targets", to: "helpful", onSave: ["fumble", "blunder"] },
      { kind: "note", text: CHARM_NOTE }],
    reason:
      'Unwired. THREE DIFFERENT DURATIONS across its degrees — success 10 minutes, failure 24 hours, '
      + 'fumble unlimited — which is exactly what the per-effect duration mechanism from 3.405.0 was '
      + 'built for. The fumble row declares no duration and the spell\'s own is "varies", which '
      + 'parses to nothing, so it lands as a temporary attitude that never lapses. Critical is '
      + '"unaffected" and so gates on nothing.'
  }
];

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const fix of FIXES) {
  const id = `attitude-${fix.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (file.fixes.some((f) => f.id === id)) continue;
  const from = current[fix.name];
  if (from === undefined) throw new Error(`${fix.name} not found in the pack`);
  file.fixes.push({
    id, pack: "spells", name: fix.name, path: "system.effects",
    from, to: fix.to, declaredAt: "2026-08-26", systemVersion: "3.409.0", reason: fix.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-attitude-spells: ${added} declared, ${file.fixes.length} total.\n`);
