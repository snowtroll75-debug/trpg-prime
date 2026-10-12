#!/usr/bin/env node
/**
 * author-damage-type-choice — the three spells whose damage type the page
 * says the caster picks, and which were each frozen at one answer.
 *
 * NEW at 3.603.0, Graham's R9 of block 31.
 *
 *   SHADOW BLAST (PP 10)  "Select acid, bludgeoning, cold, electricity,
 *                          fire, force, piercing, slashing, or sonic ...
 *                          in the form of a 30-foot cone, a 15-foot burst
 *                          within 120 feet, or a 50-foot line."
 *                          AUTHORED AS: 5d8 force, area "varies".
 *
 *   ENERGY BOLT (PP 1)    "select an element type from the following:
 *   SEARING BURST (PP 7)   acid, cold, electricity or fire."
 *                          AUTHORED AS: fire, both of them.
 *
 * FORCE WAS THE WORST AVAILABLE ANSWER for Shadow Blast, which is why this
 * is a fix and not a refinement: of the nine types on its own list, force
 * is the only one Damage Reduction does not touch at all. The spell has
 * been dealing its 5d8 straight through every suit of armour in the world
 * since it was authored.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");

const NINE = ["acid", "bludgeoning", "cold", "electricity", "fire", "force",
  "piercing", "slashing", "sonic"];
const FOUR = ["acid", "cold", "electricity", "fire"];

const PLAN = {
  "Shadow Blast": (sy) => {
    sy.effects = [
      { kind: "damageTypeChoice", damageTypes: NINE, label: "Shadow Blast" },
      { kind: "note", text: "THE TYPE IS CHOSEN AT CAST, AND IT CHANGES THE SPELL. Damage "
        + "Reduction treats the nine differently: bludgeoning, piercing and slashing are "
        + "reduced in full, the five energy types by half, and force not at all. The card "
        + "names which rule the chosen type brought with it." },
      { kind: "note", text: "THE SHAPE IS CHOSEN AT CAST TOO, from the three the page prints "
        + "— a 30-foot cone, a 15-foot burst within 120 feet, or a 50-foot line. All three "
        + "cost the same 2 AP; the chooser exists to set the template, not to price it." },
      { kind: "note", text: "AUTHORED AS FORCE UNTIL 3.603.0, which was the one answer on "
        + "its own list that ignores Damage Reduction entirely. Anyone comparing old play "
        + "to new should expect this spell to do LESS against armoured targets now." }
    ];
    sy.apOptions = [
      { ap: 2, label: "30-foot cone", range: "", area: "30-foot cone" },
      { ap: 2, label: "15-foot burst within 120 feet", range: "120 feet", area: "15-foot burst" },
      { ap: 2, label: "50-foot line", range: "", area: "50-foot line" }
    ];
    sy.modeLabel = "Shape";
    sy.modePrompt = "Shadow Blast is moulded into one of three shapes. Choose this casting's:";
  },
  "Energy Bolt": (sy) => {
    sy.effects = [
      { kind: "damageTypeChoice", damageTypes: FOUR, label: "Energy Bolt", printSource: true },
      { kind: "note", text: "THE SOURCE IS THE TABLE'S CALL. The page requires an appropriate "
        + "element to draw upon — packed earth for acid, snow or ice for cold, an overcast "
        + "sky for electricity, an open flame for fire. The system models no weather, terrain "
        + "or nearby flames, so the card names the requirement the chosen element carries and "
        + "the GM settles whether one is at hand." }
    ];
  },
  "Searing Burst": (sy) => {
    sy.effects = [
      { kind: "damageTypeChoice", damageTypes: FOUR, label: "Searing Burst", printSource: true },
      { kind: "note", text: "THE SOURCE IS THE TABLE'S CALL — the same requirement Energy Bolt "
        + "prints, word for word, and treated the same way: named on the card, judged at the "
        + "table, never enforced by a system that cannot see the weather." }
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
    console.log(`  ${value.name}: ${next.system.effects.length} row(s)`
      + `${next.system.apOptions?.length ? `, ${next.system.apOptions.length} shape(s)` : ""}`);
  }
} finally {
  await db.close();
}
console.log(`author-damage-type-choice: ${applied} of ${Object.keys(PLAN).length} applied.`);
process.exit(applied === Object.keys(PLAN).length ? 0 : 1);
