#!/usr/bin/env node
/** One-shot: Counter Perform. 3.443.0 — group 4 of the PP 1 work plan. */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
let held = null;
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && value?.name === "Counter Perform") held = value.system;
}
await db.close();
if (!held) throw new Error("Counter Perform not found");

const FIXES = [
  {
    path: "system.effects",
    to: [
      { kind: "counterPerform", target: "targets", label: "Counter Perform" },
      { kind: "note", text: "+1 PP affects an additional target; +2 PP lets you target creatures that are not studied." }
    ],
    reason:
      'Silent. "Your Perform check for casting this spell is compared to the Bonus check table '
      + 'against the Save DC of the incoming spell. Any positive modifier is then granted as a '
      + 'status bonus to the targets saving throw." That is CUTTING WORDS WITH THE SIGN FLIPPED, '
      + "and it reuses that spell's path exactly — Graham's 28 August ruling settled the sequencing "
      + 'for the whole class: the Bard casts at an announced action and selects a target, so the '
      + 'bonus WAITS and is spent by the next save in `dice/check.mjs`, the one place every check '
      + 'passes through. The table is the system\'s own `BONUS_CHECK_TABLE`, reached through '
      + '`buildOutcome` rather than retyped, because the book names it. The incoming Save DC is '
      + 'PROMPTED FOR: it belongs to somebody else\'s spell and has not been rolled, so nothing can '
      + 'derive it and a guess would size every casting off the wrong number. The studied-ally half '
      + 'of the trigger, and both warps, stay a note.'
  },
  {
    path: "system.areaTargeting",
    to: "allies",
    reason:
      'The trigger is "you or a studied ALLY", and the pack said "all" — so the target picker '
      + 'offered enemies for a spell that shields friends. `keepByDisposition` already knows the '
      + 'word, the same way Cutting Words carries "enemies" for the opposite reason.'
  }
];

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const fix of FIXES) {
  const id = `counter-perform-${fix.path.split(".").pop()}`;
  if (file.fixes.some((f) => f.id === id)) continue;
  const from = fix.path.split(".").reduce((o, k) => o?.[k], { system: held });
  file.fixes.push({
    id, pack: "spells", name: "Counter Perform", path: fix.path,
    from, to: fix.to, declaredAt: "2026-08-29", systemVersion: "3.443.0", reason: fix.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-counter-perform: ${added} declared, ${file.fixes.length} total.\n`);
