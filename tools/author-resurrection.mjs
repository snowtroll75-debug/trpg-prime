#!/usr/bin/env node
/**
 * author-resurrection — R6 of block 31: four consequences, none automated.
 *
 * Graham, 26 September 2026: "R6. Build."
 *
 * PRINTED (page 311), PP 12, 10 minutes, a dead creature of 12th level or
 * lower, dead no longer than 7 days. The pack entry carried `effects: []`.
 *
 * See magic/resurrection.mjs for the four consequences and conditions/sealed.mjs
 * for the one new mechanism they needed — a condition nothing can lift.
 *
 * THE +2 PP WARP STAYS INERT, and that is a decision rather than an oversight:
 * "the target can have been dead for up to 1 year" needs a time of death, and
 * nothing in this system holds one. It is on the inert-warp register under the
 * family whose answer is "nothing measures it"; wiring `bonusValue` or any
 * other live key to it would be the `morphForms` mistake — a key that greps as
 * a perfect match and means something else. The card says so instead.
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
    if (String(doc.name).trim().toLowerCase() !== "resurrection") continue;
    doc.system.effects = [
      { kind: "resurrect", target: "targets", label: "Resurrection" },
      {
        kind: "note",
        text: "THE POOLS THIS EMPTIES, and the two it does not. \"No points in any pools or any "
          + "other daily resources\" is read as HP to 1, PP to 0, and endeavour, conviction and "
          + "luck to nothing. Action points and reactions are left alone: they refill every TURN "
          + "rather than every day, and emptying them would stop a creature raised mid-combat from "
          + "acting at all — a punishment the page does not name."
      },
      {
        kind: "note",
        text: "DEATH STATE IS PERMANENT. It falls by 1 every time this spell lands on the same "
          + "creature, and at 0 the soul is destroyed or corrupted (GM discretion). This is the "
          + "only spell in the Grimoire that writes a permanent reduction to a creature's ability "
          + "to survive dying, so the card names the old value and the new one every time."
      },
      {
        kind: "note",
        text: "THE +2 PP WARP IS PRINTED, NOT AUTOMATED: \"the target can have been dead for up to "
          + "1 year\" needs a time of death, and nothing in this system records one. Whether the "
          + "body is whole and present, the soul free and willing, how long they have been dead, "
          + "and the gemstones worth 200 gp × level are all judged at the table — as is the "
          + "personality or appearance change a returned character often carries."
      }
    ];
    await db.put(key, doc);
    applied += 1;
  }
} finally { await db.close(); }

process.stdout.write(applied
  ? "  Resurrection: 1 HP and empty pools, a sealed Injured 2 for a week, Death State -1, and a "
    + "failed check that closes the door\nauthor-resurrection: 1 of 1 applied.\n"
  : "author-resurrection: Resurrection not found.\n");
process.exit(applied === 1 ? 0 : 1);
