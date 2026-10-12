#!/usr/bin/env node
/**
 * One-shot: the PP 1 spells that ignore a point of a condition, plus
 * Surge Of The Tempest's data repair. 3.439.0 — group 6 of the PP 1
 * work plan.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const current = {};
const WANT = ["Banish Fatigue", "Confident Veil", "Surge Of The Tempest"];
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && WANT.includes(value?.name)) {
    current[value.name] = {
      effects: value.system.effects ?? [],
      defence: value.system.defence ?? "",
      damage: value.system.damage ?? {}
    };
  }
}
await db.close();

const FIXES = [
  {
    name: "Banish Fatigue",
    path: "system.effects",
    to: [
      { kind: "suppress", target: "targets", condition: "fatigued", amount: 1, label: "Banish Fatigue" },
      { kind: "note", text: "+4 PP removes the fatigue permanently rather than suppressing it — apply that by hand." }
    ],
    reason:
      'Note-only. "You reinvigorate the target causing them to ignore 1 point of fatigue for the '
      + 'duration" (1 hour) is a standing suppression, not a removal: the target still HAS the '
      + 'fatigue and ignores a point of it, which is exactly what the new `suppress` kind '
      + 'expresses — see conditions/suppression.mjs. The +2 PP warp is one more point and is a '
      + 'warp; the +4 PP warp REMOVES the fatigue permanently, which is a different operation from '
      + 'ignoring it and is left as a note for the GM rather than pretended at by a suppression '
      + 'that would end with the spell.'
  },
  {
    name: "Confident Veil",
    path: "system.effects",
    to: [
      { kind: "suppress", target: "self", condition: "frightened", amount: 1, label: "Confident Veil" },
      { kind: "note", text: "If you fumble a saving throw against fear while this runs, the spell ends and your frightened increases by 1." }
    ],
    reason:
      'Note-only, and its first TWO printed clauses are one rule. "This lowers your existing '
      + 'frightened condition by 1, AND whenever you would normally become frightened during the '
      + "spell's duration, effect is reduced by 1\" — a standing -1 to the EFFECTIVE value of "
      + 'frightened does both, because it is not an event that fires once but a subtraction that '
      + 'is always true while the effect lives. One row, not two. The third clause — a fumbled '
      + 'fear save ends the spell and raises frightened by 1 — stays a NOTE: this system has no '
      + 'hook for "the save you just fumbled had the fear trait" (searched for before writing '
      + 'this), and inventing one to serve a single PP 1 spell would be a mechanism built in the '
      + 'wrong order.'
  },
  {
    name: "Surge Of The Tempest",
    path: "system.defence",
    to: "Basic Reflex",
    reason:
      'The book says "The target must make a BASIC Reflex save to partially avoid the effects", '
      + 'and the pack said only "Reflex". `parseSpellDefence` reads the word "basic" out of this '
      + 'string to decide whether damage is scaled by degree — so as written the spell would have '
      + 'dealt full damage on a success. A one-word data fault that the damage repair below would '
      + 'otherwise have shipped on top of.'
  },
  {
    name: "Surge Of The Tempest",
    path: "system.damage",
    to: { formula: "1d12", type: "electricity", persistent: "" },
    reason:
      'One of the ten spells whose only record of damage sat in `baseDamage`, the field nothing '
      + 'rolls. "The storm unleashes a surge of electrical energy, dealing 1d12 damage" now lives '
      + 'in `damage.formula`, where the cast workflow reads it. '
      + '**`persistent` IS CLEARED, DELIBERATELY.** It held "1", and the book gives that persistent '
      + 'electricity only "in the event of a fumble" — but `system.damage.persistent` is printed '
      + 'unconditionally by the damage path, on every degree, with no gate of any kind. Filling '
      + 'the formula while leaving it would have handed every target of every cast a point of '
      + 'persistent damage the spell never grants. Moved to a note until a degree-gated persistent '
      + 'damage exists; the +2 PP warp that raises it is unaffected and stays a warp.'
  },
  {
    name: "Surge Of The Tempest",
    path: "system.effects",
    to: [
      { kind: "condition", target: "targets", condition: "dazzled", onSave: ["fumble"], duration: "1 round" },
      { kind: "note", text: "On a fumble the target also takes 1 persistent electricity damage (+1 per 2 PP warped) — apply by hand." }
    ],
    reason:
      'Note-only. The dazzled half is a plain degree-gated condition and is now wired the way '
      + "Luminous Flare's ladder already is. The persistent half is NOT, and the reason is written "
      + 'beside the damage fix above: nothing in this system can make persistent damage depend on '
      + 'the save degree. Stated in a note that says what to do rather than dropped.'
  }
];

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const fix of FIXES) {
  const slug = fix.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const field = fix.path.split(".").pop();
  const id = `suppress-${slug}-${field}`;
  if (file.fixes.some((f) => f.id === id)) continue;
  const held = current[fix.name];
  if (!held) throw new Error(`${fix.name} not found`);
  const from = fix.path === "system.effects" ? held.effects
    : fix.path === "system.defence" ? held.defence
      : held.damage;
  file.fixes.push({
    id, pack: "spells", name: fix.name, path: fix.path,
    from, to: fix.to, declaredAt: "2026-08-29", systemVersion: "3.439.0", reason: fix.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-suppression: ${added} declared, ${file.fixes.length} total.\n`);
