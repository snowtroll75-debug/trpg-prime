#!/usr/bin/env node
/**
 * author-sanctuary — R1 of block 31, the spell with no rows at all.
 *
 * Graham, 26 September 2026: "R1. Build in Full."
 *
 * PRINTED (page 312), PP 2, Will, touch, 1 creature, 1 minute — the whole
 * spell is one mechanism and the pack entry carried `effects: []`:
 *
 *   "Opponents suffer waves of uncertainty when attacking one character of
 *   your choice. The first time each opponent attempts to attack the
 *   protected character, he must first make a Will save. If the target uses
 *   a hostile action, the spell ends."
 *   Success  "can attempt its attack and any other attacks … normally"
 *   Failure  "can't attack the target and wastes the action … not this turn,
 *            but a fresh saving throw on their next turn"
 *   Fumble   "wastes the action and can't attempt to attack the target for
 *            the rest of sanctuary's duration"
 *
 * See magic/sanctuary.mjs for the rule and combat/sanctuary-gate.mjs for the
 * gate. The notes below carry the three things the build DECIDES rather than
 * reads off the page, so the table can see them and overrule.
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
    if (String(doc.name).trim().toLowerCase() !== "sanctuary") continue;
    doc.system.effects = [
      { kind: "sanctuary", target: "targets", label: "Sanctuary" },
      {
        kind: "note",
        text: "THE SAVE IS THE OPPONENT'S, NOT THE PROTECTED CREATURE'S. Nobody rolls "
          + "anything when this is cast; each opponent rolls Will the first time it tries "
          + "to attack the warded creature, against this spell's DC. A creature that "
          + "passes never rolls again."
      },
      {
        kind: "note",
        text: "THE PAGE NAMES THREE RUNGS AND THIS SYSTEM ROLLS SEVEN DEGREES, so the rest "
          + "are read with the rule that already exists: a Heroic save lets the attack "
          + "through, a Partial blocks it for the turn (a non-success is clamped to the "
          + "harsher side rather than rewarded), and a Blunder blocks for the whole "
          + "duration as a worse Fumble."
      },
      {
        kind: "note",
        text: "OUT OF COMBAT EACH ATTEMPT SAVES AFRESH. \"This turn\" needs a round to mean "
          + "anything; with no combat running a failed save would otherwise lock the "
          + "attacker out for ever. The Fumble lockout is unaffected — it is measured by "
          + "the spell's duration, not by turns."
      },
      {
        kind: "note",
        text: "A HOSTILE ACTION BY THE PROTECTED CREATURE ENDS THE SPELL: a Strike, Double "
          + "Slice, any action with the attack trait, and a spell aimed at an enemy. "
          + "Moving, drinking a potion and healing an ally do not."
      }
    ];
    await db.put(key, doc);
    applied += 1;
  }
} finally { await db.close(); }

process.stdout.write(applied
  ? "  Sanctuary: a real ward the attack path reads, with all four degrees accounted for\n"
    + "author-sanctuary: 1 of 1 applied.\n"
  : "author-sanctuary: Sanctuary not found.\n");
process.exit(applied === 1 ? 0 : 1);
