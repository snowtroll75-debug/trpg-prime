#!/usr/bin/env node
/** One-shot: wire Healing Earth, the last PP 0 spell. */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const dir = path.join(SYSTEM_ROOT, "packs", "spells");
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(dir, { valueEncoding: "json" });
await db.open();
let from;
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && value?.name === "Healing Earth") from = value.system.effects ?? [];
}
await db.close();
if (from === undefined) throw new Error("Healing Earth not found in the pack");

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
const id = "healing-earth-item";
if (!file.fixes.some((f) => f.id === id)) {
  file.fixes.push({
    id, pack: "spells", name: "Healing Earth", path: "system.effects",
    from,
    to: [{ kind: "healingEarth", target: "self" }],
    declaredAt: "2026-08-25", systemVersion: "3.407.0",
    reason:
      'Unwired — the last PP 0 spell. The spell makes a THING rather than granting a bonus, so it '
      + 'creates a piece of gear carrying the "Healer\'s Tools" trait: `consumeGearUse` already spends '
      + 'one use of the first equipped gear matching that trait on Treat Wounds, so the substitution '
      + 'happens in code that was already there rather than by teaching the Medicine workflow about '
      + 'spells. `target: "self"` because the earth is made at the caster\'s feet; it is ordinary gear '
      + 'from that moment and can be handed to anyone, which is Graham\'s ruling ("anyone who has it") '
      + 'and the book\'s own CL 5 wording ("grants ANYONE using it"). One use, ten minutes, and a '
      + 'recast reverts the earlier earth. The CL 5 +1 item bonus rides as a conditional on the item '
      + 'itself, scoped to Administer First Aid and Treat Wounds.'
  });
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-healing-earth: ${file.fixes.length} fixes total.\n`);
