#!/usr/bin/env node
/**
 * One-shot: Protective Ward at 3.430.0.
 *
 * Graham handed the printed spell over on 28 August 2026:
 *
 *   PROTECTIVE WARD                                    PP 1
 *   UTILITY WARDING WIZARD
 *   Cast 1 AP (somatic)
 *   Area 10-foot-emanation
 *   Duration 1 minute
 *   You emit a radiant aura of protective magic that envelops you and
 *   your allies. Within the area, you all benefit from a +1-status bonus
 *   to your DB. You can Sustain the Spell each round to extend the
 *   radius of the aura by 5 feet, up to a maximum of 30 feet.
 *   WARPING OPTIONS
 *   +2 PP: status bonus increases by 1 (max +5).
 *
 * FOUR THINGS ON THE PACK ENTRY DISAGREED WITH THAT, and each of them
 * disabled a different part of the spell.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const NAME = "Protective Ward";

const FIXES = [
  {
    id: "protective-ward-area",
    field: "area",
    to: "10-foot emanation",
    reason:
      'The pack read "10-foot-radius centred on you", which places the circle correctly and is '
      + 'invisible to everything else. `emanationIsLive` asks `/emanation/i` of the area string, so '
      + 'the one word that was missing is the word that decides whether the area follows its caster '
      + 'and whether standing in it is what grants the bonus. Cast it and the ward stayed on the '
      + 'square you cast it from while you walked away — the exact defect Graham reported against '
      + 'Bless on 27 August, surviving in a spell nobody had cast yet. The printed line is "Area '
      + '10-foot-emanation".'
  },
  {
    id: "protective-ward-sustained",
    field: "sustained",
    to: true,
    reason:
      'The pack read `false`, and that single flag closed three doors at once. `resolveAction` only '
      + 'registers an active-spell entry when a spell is sustained or PP-locked, so Protective Ward '
      + 'left NO record of having been cast: no entry on the Magic tab, nothing for the Sustain a '
      + 'Spell action to target, and — since the emanation record hangs off that entry — no live '
      + 'emanation either. The spell says "You can Sustain the Spell each round" in its own second '
      + 'sentence.'
  },
  {
    id: "protective-ward-sustain-type",
    field: "sustainType",
    to: "round",
    reason:
      'NOT "duration", which is the one that would have been wrong in the dangerous direction. A '
      + '"duration" sustain is what keeps its spell alive, and `sustainedLapses` ends such a spell '
      + 'two rounds after the last Sustain — which would have killed a ward whose printed duration '
      + 'is a flat minute. Lightning Storm and Spiritual Weapon already carry "round" for exactly '
      + 'this shape: the duration is the spell\'s own, and a Sustain buys the thing the text names. '
      + 'Here it buys five feet. Graham\'s ruling, 28 August 2026: the minute runs regardless.'
  },
  {
    id: "protective-ward-growth",
    field: "sustainGrowth",
    to: { stepFeet: 5, maxFeet: 30 },
    reason:
      'DECLARED, because it was prose. "Sustain each round to extend the aura\'s radius by 5 ft '
      + '(max 30 ft)" sat in a note effect — text for a person to read, wired to nothing, so '
      + 'sustaining the ward could never have widened it. The sentence stays as a note; the two '
      + 'numbers now live where `spellGrowth` can read them and an author can change them without '
      + 'a regex learning to parse English.'
  },
  {
    id: "protective-ward-warp",
    field: "warps",
    to: [{
      ppCost: 2,
      text: "status bonus increases by 1 (max +5)",
      mods: { bonusValue: 1, bonusMax: 5 }
    }],
    reason:
      'The pack sold "+2 PP: status bonus increases by 5 (max +25)" — five times the printed '
      + 'option, and unlike the other three faults this one was LIVE: `aggregateWarpSelection` '
      + 'reads bonusValue and bonusMax, so eight Power Points bought a +25 status bonus to DB. '
      + 'That is not a spell being weaker than the book says, it is the best defensive effect in '
      + 'the game hiding behind a typo. Graham confirmed the printed reading on 28 August 2026: '
      + '+1 per 2 PP, capped at +5.'
  },
  {
    id: "protective-ward-description",
    field: "description",
    to:
      "You emit a radiant aura of protective magic that envelops you and your allies. Within the "
      + "area, you all benefit from a +1 status bonus to your DB. You can Sustain the Spell each "
      + "round to extend the radius of the aura by 5 feet, up to a maximum of 30 feet.\n\n"
      + "Warping Options:\n+2 PP: status bonus increases by 1 (max +5).",
    reason:
      'The description repeated the wrong warp in words, so the card and the tooltip agreed with '
      + 'each other and both disagreed with the book. Corrected alongside the mods rather than '
      + 'after them: two copies of a number are the hazard this project keeps meeting, and leaving '
      + 'the prose behind would have left one.'
  }
];

const dir = path.join(SYSTEM_ROOT, "packs", "spells");
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(dir, { valueEncoding: "json" });
await db.open();

let key = null;
let doc = null;
for await (const [k, v] of db.iterator()) {
  if (k.startsWith("!items!") && v?.name === NAME) { key = k; doc = v; break; }
}
if (!doc) { await db.close(); throw new Error(`${NAME} not found in packs/spells`); }

for (const fix of FIXES) doc.system[fix.field] = fix.to;
await db.put(key, doc);
await db.close();

const log = path.join(SYSTEM_ROOT, "tools", "declare-protective-ward.json");
fs.writeFileSync(log, `${JSON.stringify({ spell: NAME, fixes: FIXES }, null, 2)}\n`);
console.log(`${NAME}: ${FIXES.length} fields declared. Reasons written to ${path.basename(log)}.`);
