#!/usr/bin/env node
/**
 * One-shot: Luminance at 3.435.0.
 *
 * The fourth spell this week whose pack entry disagreed with its own
 * printed text, and the same `sustained: false` flag that made
 * Protective Ward's Sustain unreachable. See magic/luminance.mjs for the
 * rules and for Graham's four rulings of 29 August 2026.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const NAME = "Luminance";
const FIXES = [
  {
    id: "luminance-area", field: "area", to: "10-foot emanation",
    reason:
      'The pack read "" — no area at all — while the spell\'s first sentence is "A bright light '
      + 'emanates from you in a 10-foot radius". `emanationIsLive` asks /emanation/i of this '
      + 'string, so with it empty nothing followed the caster, no Region was placed, and no '
      + 'membership was ever computed. The whole spell had nowhere to happen.'
  },
  {
    id: "luminance-sustained", field: "sustained", to: true,
    reason:
      'The pack read `false`, so no active-spell entry was registered: no Magic-tab row, nothing '
      + 'for Sustain a Spell to target, and no emanation record — the record hangs off that entry. '
      + 'The spell says "At the beginning of each of your turns, you can Sustain the spell".'
  },
  {
    id: "luminance-sustain-type", field: "sustainType", to: "round",
    reason:
      'NOT "duration". Its printed duration is "1 minute (D)" — a flat clock — so `sustainedLapses` '
      + 'would have killed it two rounds after the last Sustain. "round" is the shape Lightning '
      + 'Storm and Spiritual Weapon already carry: the duration is the spell\'s own, and a Sustain '
      + 'buys the thing the text names. Here it buys a die or a point of bleed.'
  },
  {
    id: "luminance-effects", field: "effects",
    to: [
      {
        kind: "perTurn",
        target: "targets",
        formula: "1d8",
        mode: "heal",
        undeadMode: "damage",
        undeadDamageType: "essence"
      },
      { kind: "note", text: "Light within the radius is increased by three steps." }
    ],
    reason:
      'The effects array was EMPTY, so the spell healed nobody. `perTurn` is a fifth effect kind: '
      + 'not a bonus, a save, a floor or a growing circle, but an event on a clock — "all creatures '
      + 'that BEGIN THEIR TURN in the radius". Declared rather than parsed from the sentence, and '
      + 'the undead inversion is declared as a damage MODE with a type rather than as a negative '
      + 'heal, so it goes through the damage pipeline and meets resistances.'
  },
  {
    id: "luminance-sustain-choices", field: "sustainChoices",
    to: [
      { key: "healing", field: "healingDice", step: 1, max: 5 },
      { key: "bleed", field: "bleedRemoved", step: 1, max: null }
    ],
    reason:
      'Graham\'s ruling, 29 August 2026: the Sustain ASKS each time. Declared on the entry so the '
      + 'picker is built from the spell rather than from a list in the workflow, and so the warp '
      + 'that lifts the cap has one place to lift it.'
  }
];

const dir = path.join(SYSTEM_ROOT, "packs", "spells");
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(dir, { valueEncoding: "json" });
await db.open();
let key = null, doc = null;
for await (const [k, v] of db.iterator()) {
  if (k.startsWith("!items!") && v?.name === NAME) { key = k; doc = v; break; }
}
if (!doc) { await db.close(); throw new Error(`${NAME} not found`); }
const before = Object.fromEntries(FIXES.map((f) => [f.field, doc.system[f.field]]));
for (const f of FIXES) doc.system[f.field] = f.to;
await db.put(key, doc);
await db.close();
fs.writeFileSync(
  path.join(SYSTEM_ROOT, "tools", "declare-luminance.json"),
  `${JSON.stringify({ spell: NAME, before, fixes: FIXES }, null, 2)}\n`
);
console.log(`${NAME}: ${FIXES.length} fields declared.`);
for (const f of FIXES) console.log(`  ${f.field}: ${JSON.stringify(before[f.field])} -> ${JSON.stringify(f.to)}`);
