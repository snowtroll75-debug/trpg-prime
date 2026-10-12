#!/usr/bin/env node
/**
 * Ball Lightning — the turn-by-turn half, settled by Graham's three
 * rulings of 24 September 2026.
 *
 * IDEMPOTENT: replaces the fields it owns.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS THERE BEFORE, AND WHY IT WAS NOT AUTOMATION.
 *
 * The cast worked: an ordinary basic-Reflex damage spell, 6d8
 * electricity at one target within 40 feet. Everything after the cast
 * was this note —
 *
 *   "At the start of each of your turns you may, as a FREE action,
 *    direct the ball at a new target within range or have it strike the
 *    current target again: 6d8 electricity, basic Reflex. Cast the
 *    strike again from the spell card each turn — the turn clock does
 *    not yet offer it."
 *
 * — which is an instruction to a player, printed by a system that could
 * have done it. Nine rounds of a ten-round spell were manual.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE WARP KEEPS `targetCap: 2` AND GAINS NOTHING ELSE.
 *
 * "+4 PP: create an additional ball which must have a different target,
 * you may direct both balls each turn." The cap IS the ball count here —
 * two balls, two creatures, and the "different target" half is enforced
 * by `targetsAreDistinct` at the moment the turn's aims are collected
 * rather than by a second key. Block 25 corrected this warp from
 * `extraTargets: 1` (which multiplied, so the ball count was uncapped)
 * to `targetCap: 2`, and that is still the right key.
 */

import { ClassicLevel } from "classic-level";

const db = new ClassicLevel("packs/spells", { valueEncoding: "json" });
await db.open();
let done = false;
for await (const [key, value] of db.iterator()) {
  if (value?.name !== "Ball Lightning") continue;
  const y = value.system;
  y.effects = [
    {
      kind: "directedStrike",
      target: "targets",
      label: "Ball Lightning",
      formula: "6d8",
      damageType: "electricity",
      save: "reflex",
      // MEASURED FROM THE CASTER — Graham's third ruling. The number is
      // the spell's printed Range, repeated here because the ball's
      // reach is a property of the ball and a warp that changed the
      // spell's range would not be saying anything about where a ball
      // already in flight may be sent.
      rangeFeet: 40
    },
    {
      kind: "note",
      text: "The ball is aimed at the start of each of your turns. Directing it at a new "
        + "target within 40 feet OF YOU costs a free action; spend none and it strikes its "
        + "current target again. Each strike is its own basic Reflex save."
    }
  ];
  await db.put(key, value);
  done = true;
}
await db.close();
if (!done) { console.error("Ball Lightning not found in the pack"); process.exit(1); }
console.log("authored Ball Lightning");
