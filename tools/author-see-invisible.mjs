#!/usr/bin/env node
/**
 * author-see-invisible — R12, the spell that had nothing to counter.
 *
 * Graham, 27 September 2026: "Please go with your recommendation for R12."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT R12 WAS ABOUT.
 *
 * I left See Invisible out of 3.596.0 on purpose, because the `invisible`
 * condition was read by NOTHING: `missChanceAvoidance` asked only about
 * `hidden` and `concealed`, so an invisible creature was, at the moment
 * anybody swung at it, exactly as easy to hit as one standing in daylight.
 * A PP 4 spell whose whole job is to counter that condition had nothing to
 * counter, and authoring it would have produced a card that read correctly
 * and changed nothing.
 *
 * 3.597.0 wires the condition first (combat/invisibility.mjs and the
 * widened `missChanceDC`), and THEN this spell means something.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PRINTED (page 317), with both warps:
 *
 *   "Within the boundaries of your visual perception, the veil of
 *   invisibility is lifted… You view invisible creatures as translucent
 *   shapes and ethereal beings take shape as eerie apparitions, EACH NOW
 *   HAVING THE CONCEALED CONDITION TO YOU."
 *   +2 PP: the spell has a duration of 8 hours.
 *   +4 PP: invisible creatures can be seen clearly and are not concealed.
 *
 * THE SECOND WARP WAS INERT — `mods: {}` — and is now `sightLevel: "clear"`.
 * The first was already live on `durationText` and is left alone.
 */

import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();

let applied = 0;
const notes = [];
try {
  for await (const [key, doc] of db.iterator()) {
    if (!key.startsWith("!items!") || doc?.type !== "spell") continue;
    if (String(doc.name).trim().toLowerCase() !== "see invisible") continue;
    const sys = doc.system;

    sys.effects = [
      {
        kind: "avoidanceSight",
        target: "self",
        sight: "seeInvisible",
        level: "concealed",
        label: "See Invisible"
      },
      {
        kind: "note",
        text: "ETHEREAL BEINGS GET THE SAME TREATMENT: the page gives them the "
          + "concealed condition to you exactly as it does invisible creatures, so a "
          + "creature the GM has marked invisible is covered whichever reason it is "
          + "unseen for. This system does not model the ethereal plane as a separate "
          + "place, so an ethereal creature that is NOT marked invisible is the "
          + "table's to mark."
      },
      {
        kind: "note",
        text: "IT DOES NOT FIND ANYBODY. The spell lifts the veil on creatures you are "
          + "already aiming at — it is read when an attack resolves, not when you look "
          + "for someone. Searching an invisible creature out is still the Search "
          + "(Perception) action against its Stealth DC, which is what makes it hidden "
          + "to you in the first place."
      }
    ];

    // THE INERT HALF. The +2 PP duration warp was already wired to
    // `durationText`; only the +4 PP option had nothing behind it.
    const clear = sys.warps?.find((w) => /seen clearly/i.test(String(w.text ?? "")));
    if (clear) { clear.mods = { sightLevel: "clear" }; notes.push("the +4 PP warp now sets the level"); }

    await db.put(key, doc);
    applied += 1;
    notes.unshift("See Invisible: invisible creatures are concealed to you for 10 minutes");
  }
} finally { await db.close(); }

for (const n of notes) process.stdout.write(`  ${n}\n`);
process.stdout.write(`author-see-invisible: ${applied} of 1 applied.\n`);
process.exit(applied === 1 ? 0 : 1);
