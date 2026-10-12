#!/usr/bin/env node
/**
 * One-shot: the PP 1 spells that hang secondary damage on a Strike.
 * 3.437.0 — group 3 of the PP 1 work plan.
 *
 * GRAVITY WEAPON IS NOT HERE, and that is deliberate. The plan grouped
 * it with these three as an "attack rider", but its printed rule is
 * "the base damage die of the weapon gains a +2 bonus" — the weapon's
 * OWN die, not a secondary packet beside it. Wiring it as a rider would
 * give it a separate damage packet the book never granted, and would
 * make one mechanism claim two rules. Left as its note, named as
 * deferred in the release notes.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const current = {};
const WANT = ["Arrow Of The Wild Hunt", "Talon Strike", "Spoil The Profane"];
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && WANT.includes(value?.name)) current[value.name] = value.system.effects ?? [];
}
await db.close();

const FIXES = [
  {
    name: "Arrow Of The Wild Hunt",
    to: [{
      kind: "strikeRider", target: "self", label: "Arrow Of The Wild Hunt",
      dice: "1d6", damageType: "force", scope: "ranged", once: true
    }],
    reason:
      'Silent, and one of the ten spells whose only record of damage sat in `baseDamage` — the '
      + 'field the item sheet documents as "used for warping and criticals" and which the cast '
      + 'workflow never rolls. "Make a ranged weapon Strike. On a hit, deal normal damage plus 1d6 '
      + 'force damage" is a SECONDARY packet on a Strike, which is the rune chapter\'s own '
      + 'mechanism, so it is declared as a rider and rolled by the same loop. `scope: "ranged"` '
      + 'because the spell says "ranged weapon Strike"; `once` because the arrow is loosed one '
      + 'time. The +4 PP ricochet stays a warp for the GM — a second Strike at the same MAP is an '
      + 'action, not a damage packet.'
  },
  {
    name: "Talon Strike",
    to: [{
      kind: "strikeRider", target: "self", label: "Talon Strike",
      dice: "1d6", damageType: "slashing", scope: "any", once: false, weaponScoped: true
    }],
    reason:
      'Note-only. "Your attacks with the target weapon ... inflicting 1d6 secondary slashing '
      + 'damage", Duration 1 minute — so `once: false`, and every Strike with that weapon carries '
      + 'it until the spell ends. `weaponScoped` because the spell targets "a weapon you are '
      + 'currently wielding": the applier asks which one when more than one is equipped, and '
      + 'refuses the effect out loud when none is. Left unscoped it would arm the whole armoury '
      + 'for a minute, which is a different spell. The +4 PP warp to 2d6 stays a warp.'
  },
  {
    name: "Spoil The Profane",
    to: [{
      kind: "strikeRider", target: "self", label: "Spoil The Profane",
      dice: "1d6", damageType: "aligned", scope: "any", once: true,
      conditional: true, against: "a target with an opposing aura",
      condition: "weakened", conditionValue: 1
    }],
    reason:
      'Note-only, and the spell is two rules in one sentence. The WEAKENED 1 is unconditional — '
      + '"on a hit ... the target becomes weakened 1 until the beginning of your next turn" — and '
      + 'is applied. The 1d6 is conditional on the target having "an opposing aura", a phrase that '
      + 'appears in no module in this system; Radiant Aegis and Wellspring Of Valour are waiting on '
      + 'the same question. So it is declared `conditional` and PRINTED on the strike card rather '
      + 'than applied, which is exactly what the Bane and Aligned runes already do for the same '
      + 'reason: they "depend on WHO is being hit, which nothing here can know". Inventing an aura '
      + 'test to make the number land would be a rule wearing this spell\'s name. The +2 PP warp '
      + 'declares `damageDice: "1d6"` and reaches the die through the same `addDice` the heal rows '
      + 'use; the +3 PP weakened warp stays a warp.'
  }
];

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const fix of FIXES) {
  const id = `rider-${fix.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (file.fixes.some((f) => f.id === id)) continue;
  const from = current[fix.name];
  if (from === undefined) throw new Error(`${fix.name} not found`);
  file.fixes.push({
    id, pack: "spells", name: fix.name, path: "system.effects",
    from, to: fix.to, declaredAt: "2026-08-29", systemVersion: "3.437.0", reason: fix.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-strike-riders: ${added} declared, ${file.fixes.length} total.\n`);
