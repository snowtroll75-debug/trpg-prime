#!/usr/bin/env node
/**
 * verify-ff30-block16 — 3.649.0, Fiends & Fables 3.0 block 16 (the giants;
 * Graham, 15 October 2026: "Okay apply all recommendations").
 *
 *   R4  Thundering Strike: `strikeBurst` — a Strike with an extra damage
 *       packet, then a basic-save burst round the striker, Air passed over
 *   R5  Lightning Strike: `sweepingStrike` — one attack roll met by every
 *       creature's DB within reach + 5 feet, one damage roll, one attack
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const R = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "codex-action-rules.mjs")).href);
const C = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "combat", "creature-secondary.mjs")).href);

const THUNDER = { kind: "strikeBurst", ap: 2, weapon: "Ranseur", extraDamage: [{ dice: "2d12", type: "bludgeoning" }],
  burst: { radiusFeet: 20, save: "fortitude", basic: true, damage: { formula: "4d8", type: "sonic" }, excludeKinds: ["Air"] } };

// R4
equal("G1 Thundering Strike's burst is a 20-foot basic Fortitude area of 4d8 sonic that passes over Air",
  R.strikeBurstArea(THUNDER),
  { save: "fortitude", basic: true, damage: { formula: "4d8", type: "sonic" }, radiusFeet: 20, scope: "area", excludeKinds: ["air"] });
equal("G2 no radius, no burst; a printed DC is carried",
  [R.strikeBurstArea({ burst: { save: "fortitude" } }), R.strikeBurstArea({ burst: { radiusFeet: 10, save: "reflex", dc: 30 } })?.dc],
  [null, 30]);
equal("G3 the action's extra damage rows, cleaned",
  [R.actionExtraDamage(THUNDER), R.actionExtraDamage({ extraDamage: { dice: "3d12", type: "Electricity" } }), R.actionExtraDamage({ extraDamage: [{ dice: "lots", type: "fire" }] })],
  [[{ dice: "2d12", type: "bludgeoning" }], [{ dice: "3d12", type: "electricity" }], []]);
// R5
equal("G4 Lightning Strike's range: reach, the Reach trait's extension, and its +5",
  [R.sweepingStrikeRangeFeet({ reach: 15, weaponHasReach: true, extension: 5, plusFeet: 5 }),
    R.sweepingStrikeRangeFeet({ reach: 15, weaponHasReach: false, extension: 5, plusFeet: 5 }),
    R.sweepingStrikeRangeFeet({ reach: 0, plusFeet: 5 })],
  [25, 20, 5]);
equal("G5 the later creatures are struck at the first's multiple attack penalty",
  [R.mapOfCheck([{ label: "BAB", value: 20 }, { label: "Multiple Attack Penalty (attack 2)", value: -5 }]), R.mapOfCheck([{ label: "BAB", value: 20 }])],
  [-5, 0]);
equal("G6 an action's extra damage is a typed packet, magical with a magical weapon",
  C.actionDamagePackets([{ dice: "2d12", type: "bludgeoning" }], { name: "Ranseur", system: { traits: "Disarm, Magical, Reach" } }),
  [{ label: "Ranseur (2d12 bludgeoning)", dice: "2d12", type: "bludgeoning", secondaryCritical: null, conditional: false, resolved: false, applies: true, why: "", parameter: "", against: "", mundane: false }]);
equal("G7 and nothing for an unreadable or aligned row",
  C.actionDamagePackets([{ dice: "x", type: "fire" }, { dice: "1d6", type: "good" }], null), []);

const src = {
  cw: read("module", "codex-actions-workflow.mjs"),
  chk: read("module", "dice", "check.mjs"),
  atk: read("module", "combat", "attack-workflow.mjs")
};
ok("S1 both are Codex actions", /sizeShift, strikeBurst, sweepingStrike(, toggleEffect)? \}\);/.test(src.cw));
ok("S2 Thundering Strike strikes with its packet, pays once the Strike happened, then bursts round the striker",
  /const check = await rollWeaponAttack\(actor, weapon, \{ apPaid: true, extraTypedDamage: actionExtraDamage\(spec\) \}\);\n  if \(check === null \|\| check === undefined\) return false;\n  await spendActionPoints\(actor, ap, item\.name\);/.test(src.cw)
  && /const rolled = await runDeclaredAreaEffect\(actor, burst, \{ title: item\.name \}\);/.test(src.cw));
ok("S3 Lightning Strike hands the first die and its penalty to every later creature, and pays after the first",
  /\.\.\.\(later \? \{ presetDice: dice, mapFrozen: true, mapOverride: map \} : \{\}\)/.test(src.cw)
  && /dice = check\.dice;\n      map = mapOfCheck\(check\.modifiers\);\n      await spendActionPoints\(actor, ap, item\.name\);/.test(src.cw)
  && /return feet !== null && feet <= range;/.test(src.cw));
ok("S4 a check handed a die rolls nothing",
  /this\.presetDice = config\.presetDice \?\? null;/.test(src.chk)
  && /this\.dice = this\.presetDice\n      \? this\.presetDice\n      : this\.die === "d100"/.test(src.chk));
ok("S5 the strike takes the shared die without a second conviction offer, and carries the action's packets to the damage",
  /\.\.\.\(presetDice \? \{ presetDice, allowConviction: false \} : \{\}\),/.test(src.atk)
  && /extraTypedDamage,\n      sharedDamage,/.test(src.atk)
  && /\.\.\.actionDamagePackets\(extraTypedDamage, weapon\)/.test(src.atk));
ok("S6 the damage dice are shared by formula, the strike's and each packet's",
  /const roll = await sharedRoll\(sharedDamage, "strike", formula\);/.test(src.atk)
  && /const runeRoll = await sharedRoll\(sharedDamage, String\(rune\.type \?\? ""\), rune\.dice\);/.test(src.atk)
  && /if \(shared\[slot\]\) return Roll\.fromData\(shared\[slot\]\);/.test(src.atk));

ok("S7 (3.649.1) one swing fumbles once: the later creatures roll no fumble check of their own",
  /if \(outcome\.fumbleRisk && !presetDice\) \{/.test(src.atk));

const EXPECTED = 15;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block16: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block16: ${checks} checks — all green.`);
