#!/usr/bin/env node
/**
 * author-inscribed-runes — the two runes of block 31 (3.604.0, R10).
 *
 * BOTH SHIPPED `effects: []`.
 *
 *   RUNE OF WARDING (PP 4, page 311) — "All creatures you designate at the
 *   time of casting gain a +1-status bonus to DB and saving throws whilst
 *   in the spell's radius." Eight hours, 10-foot radius. A PP 4 ritual
 *   that did nothing at all.
 *
 *   RUNE OF WARNING (PP 2, page 311) — "The Rune will glow of a soft
 *   silver light if any creature of that trait type enters the area of
 *   effect." Eight hours, 30-foot radius.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE AREA FIELDS HAD TO BE REPAIRED, AND I NEARLY DID NOT CHECK.
 *
 * The first draft of this file said, in a comment: "the area fields are
 * left alone — '10-radius' and '30-radius centred on the object' both
 * parse". They do not. `parseSpellArea` requires a UNIT word, so both
 * strings return null, no Region is ever drawn, and every rule built above
 * would have run against a rune that cannot exist. The whole release would
 * have shipped doing nothing, with a harness full of green checks measuring
 * a record no cast would ever create.
 *
 * That is the defect this project has found more often than any other: a
 * value believed because it looked right, rather than measured. The comment
 * was written before the measurement; the measurement is what caught it.
 *
 * SO THE UNIT IS RESTORED, and this is a transcription fix rather than a
 * reading: the book writes "Area 10-radius", and every other radius spell
 * in the pack — all 150 of them — writes "10-foot radius". Two spells were
 * transcribed without the unit and nothing had needed to draw them until
 * now.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");

const PLAN = {
  "Rune Of Warding": (sy) => {
    sy.area = "10-foot radius";
    sy.effects = [
      { kind: "runeWard", label: "Rune of Warding" },
      { kind: "note", text: "DESIGNATION IS FIXED AS THE RUNE IS INSCRIBED. The picker lists "
        + "every creature standing inside the radius as the ten-minute ritual finishes, and "
        + "nobody starts ticked: \"all creatures you designate\" names no default set, so a "
        + "Continue nobody read wards nobody rather than silently warding an enemy who "
        + "happened to be standing there. A creature outside the radius at that moment cannot "
        + "be designated at all." },
      { kind: "note", text: "THE BONUS COMES AND GOES WITH THE RADIUS, not with the "
        + "designation. A designated ally who walks out loses the +1 and regains it on "
        + "stepping back in — measured as they cross the edge, so an ally who ducks behind the "
        + "rune is warded for the attack that follows rather than from their next turn." },
      { kind: "note", text: "\"+1-STATUS TO DB AND SAVING THROWS\" IS FOUR BONUSES on this "
        + "system's sheet: Defence, Fortitude, Reflex and Will. All four are status bonuses, "
        + "so they do not stack with another status bonus to the same number." },
      { kind: "note", text: "JUDGED AT THE TABLE: whether the inscribed surface survives eight "
        + "hours, and whether a creature examining the rune recognises what it is." }
    ];
  },
  "Rune Of Warning": (sy) => {
    sy.area = "30-foot radius centred on the object";
    sy.effects = [
      { kind: "runeWarning", label: "Rune of Warning" },
      { kind: "note", text: "THE TRAIT IS TYPED IN AS THE RUNE IS INSCRIBED — the page's "
        + "examples are elf and orc, and this system's trait vocabulary is not a closed list "
        + "of ancestries, so a fixed menu would refuse a rune set for something invented at "
        + "the table. Matched as a whole word and case-insensitively: a rune set for \"elf\" "
        + "does not answer a Half-Elf." },
      { kind: "note", text: "THE GLOW IS TOLD TO THE GM AND NOBODY ELSE. The rune fires "
        + "whether or not a character is standing there to see it, so the GM is told which "
        + "creature crossed the boundary and decides who noticed. A public card would hand the "
        + "players knowledge their characters may not have." },
      { kind: "note", text: "IT FIRES ON ENTERING, not on being inside. A creature of the "
        + "named trait who stands still inside the radius does not set the rune off again "
        + "every time anything else moves; one who walks out and back in sets it off twice." }
    ];
  }
};

const db = new ClassicLevel(SPELLS, { valueEncoding: "json" });
await db.open();
let applied = 0;
try {
  for await (const [key, value] of db.iterator()) {
    if (!key.startsWith("!items!") || value?.type !== "spell") continue;
    const plan = PLAN[String(value.name).trim()];
    if (!plan) continue;
    const next = JSON.parse(JSON.stringify(value));
    plan(next.system);
    await db.put(key, next);
    applied++;
    console.log(`  ${value.name}: ${next.system.effects.length} row(s)`);
  }
} finally {
  await db.close();
}
console.log(`author-inscribed-runes: ${applied} of ${Object.keys(PLAN).length} applied.`);
process.exit(applied === Object.keys(PLAN).length ? 0 : 1);
