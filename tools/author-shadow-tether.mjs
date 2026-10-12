#!/usr/bin/env node
/**
 * author-shadow-tether — R8: the one rule this block INVENTED.
 *
 * Graham, 26 September 2026: "R8. Build."
 *
 * PRINTED (page 318), PP 6, Basic Reflex, 2d8 essence, 1 minute:
 *
 *   "The target takes 2d8 essence damage and on a failed save, becomes
 *   immobilised for the duration IF THEY MOVE MORE THAN 30 FEET AWAY FROM
 *   YOU."
 *
 * WHAT WAS THERE: a bare `condition: "immobilised"` with no trigger, so a
 * failed save pinned the target where it stood — and a `note` beside it
 * explaining the rule the row did not implement. A 6 PP spell that
 * immobilises outright is a far better spell than the printed one, which
 * merely stops a creature running away. Everything else this project has
 * found in the Grimoire is a rule MISSING; this was a rule invented.
 *
 * The note is replaced too: it described the gap, and the gap is closed.
 */

import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();

let applied = 0;
try {
  for await (const [key, doc] of db.iterator()) {
    if (!key.startsWith("!items!") || doc?.type !== "spell") continue;
    if (String(doc.name).trim().toLowerCase() !== "shadow tether") continue;
    doc.system.effects = [
      {
        kind: "distanceTrigger",
        target: "targets",
        condition: "immobilised",
        feet: 30,
        from: "caster",
        label: "Shadow Tether"
      },
      {
        kind: "note",
        text: "THE DAMAGE IS DEALT REGARDLESS (Basic Reflex); only the immobilisation waits "
          + "for the tether. A failed save arms it, and it snaps taut the moment the target "
          + "is more than 30 feet from you — measured when the TARGET moves, because \"if they "
          + "move\" is the printed subject: a caster cannot immobilise somebody by retreating."
      },
      {
        kind: "note",
        text: "IF THE TARGET IS ALREADY BEYOND 30 FEET WHEN THE SAVE FAILS, the tether is taut "
          + "as it lands and the condition applies at once — the spell reaches 60 feet, so this "
          + "is a common case rather than a corner. \"More than 30 feet\" is read as the DISTANCE "
          + "from you, not as 30 feet of displacement; at exactly 30 feet the tether is slack."
      },
      {
        kind: "note",
        text: "IT FIRES ONCE. \"Becomes immobilised for the duration\" — so the tether is spent "
          + "when it triggers and the condition then lasts as long as the spell. If the caster's "
          + "token leaves the scene the tether has nothing to measure from and is removed, with a "
          + "line on the card saying so."
      }
    ];
    await db.put(key, doc);
    applied += 1;
  }
} finally { await db.close(); }

process.stdout.write(applied
  ? "  Shadow Tether: the immobilisation now waits for the tether to go taut\n"
    + "author-shadow-tether: 1 of 1 applied.\n"
  : "author-shadow-tether: Shadow Tether not found.\n");
process.exit(applied === 1 ? 0 : 1);
