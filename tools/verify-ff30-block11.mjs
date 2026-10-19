#!/usr/bin/env node
/**
 * verify-ff30-block11 — 3.641.0, Fiends & Fables 3.0 block 11 (the Cave,
 * Cold, Fire and Forest Dragons; Graham, 13 October 2026: "go with your
 * recommendations"):
 *   R2  Wild Shape's +1 is not a creature's own printed bite and claws
 *   R3  element-named Codex abilities (Freezing Aura, Caustic Blood) inherit their Elemental entry
 *   R5  compound pickOne — Draconic Assault's third strike is the dragon's choice
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (p) => import(new URL(`../module/${p}`, import.meta.url));
const DR = await imp("druid.mjs");
const CI = await imp("codex-inheritance.mjs");
const CA = await imp("combat/compound-action.mjs");
const CR = await imp("creature-ability-rules.mjs");
const src = { at: read("module", "combat", "attack-workflow.mjs"), cw: read("module", "combat", "compound-action-workflow.mjs"), decl: read("tools", "ff30-codex-declarations.mjs"), hooks: read("module", "codex-hooks-workflow.mjs") };

/* R2 */
{ const shaped = (type) => ({ type, items: [{ type: "ability", name: "Wild Shape" }] });
  const b = (actor, extra = {}) => DR.wildShapeAttackBonus({ actor, weaponName: "Bite", weaponNatural: true, ...extra });
  equal("W1 a druid's bite +1; a dragon's own bite 0; a shape's weapon on a creature +1; a punch 0", [b(shaped("character")), b(shaped("npc")), b(shaped("npc"), { shapeWeapon: true }), DR.wildShapeAttackBonus({ actor: shaped("character"), weaponName: "Unarmed Strike", weaponNatural: true }), b({ type: "npc", items: [] }, { shapeWeapon: true })], [1, 0, 1, 0, 0]); }
ok("W2 the Strike reads the weapon's shape mark", /shapeWeapon: Boolean\(weapon\.flags\?\.\["trg-prime"\]\?\.shapeWeapon\)/.test(src.at));
/* R3 */
{ const ix = CI.buildCodexIndex(["Aura", "Blood", "Strikes", "Grasp"].map((k) => ({ pack: "creature-abilities", name: `Elemental ${k}`, flags: { "trg-prime": { entry: k } } })));
  const e = (name) => CI.inheritedCodexFlags({ type: "ability", name, flags: {} }, ix)?.entry ?? "";
  equal("E1 the called names find their Elemental entry; others do not", [e("Freezing Aura"), e("Caustic Blood"), e("Shocking Grasp"), e("Toxic Strikes"), e("Fiery Aura"), e("Frightful Aura"), e("Fiery Breath")], ["Aura", "Blood", "Grasp", "Strikes", "Aura", "", ""]); }
{ const index = CI.buildCodexIndex([{ pack: "creature-abilities", name: "Elemental Aura", flags: { "trg-prime": { auras: [{ id: "aura-elemental-aura", radius: 10, damageTypeFromName: true }] } } }, { pack: "creature-abilities", name: "Elemental Blood", flags: { "trg-prime": { creatureAbility: { derives: { bleedSplash: true } } } } }, { pack: "creature-abilities", name: "Toxic Blood", flags: { "trg-prime": { own: true } } }]);
  const inh = (name, flags = {}) => CI.inheritedCodexFlags({ type: "ability", name, flags: { "trg-prime": flags } }, index);
  equal("E2 Freezing Aura emits the Elemental aura; Caustic Blood splashes; a called name with its own entry keeps it; an opt-out stays out", [inh("Freezing Aura")?.auras?.[0]?.id, inh("Caustic Blood")?.creatureAbility?.derives?.bleedSplash, [inh("Toxic Blood")?.own, inh("Toxic Blood")?.creatureAbility ?? null], inh("Fiery Aura", { codexInherit: false }), inh("Frightful Aura")], ["aura-freezing-aura", true, [true, null], null, null]); }
/* R5 */
{ const weapons = [{ type: "weapon", id: "c", name: "Claw" }, { type: "weapon", id: "w", name: "Wing" }, { type: "weapon", id: "b", name: "Bite" }, { type: "weapon", id: "t", name: "Tail" }, { type: "weapon", id: "u", name: "Unarmed Strike" }, { type: "weapon", id: "s", name: "Longsword", system: { natural: false } }];
  const { strikes } = CA.compoundStrikes({ strikes: [{ weapon: "claw", count: 2 }, { weapon: ".", notWeapon: "claw", count: 1, pickOne: true }] }, weapons);
  equal("P1 two claws, then Wing, Bite or Tail — not the punch or a sword", strikes.map((s) => [s.weaponName, s.count, s.pickGroup]), [["Claw", 2, null], ["Wing", 1, 1], ["Bite", 1, 1], ["Tail", 1, 1]]);
  equal("P2 once the Bite is made, the Wing and Tail are refused; the claws are not", [CA.compoundPickAllowed(strikes, 1, { "2:0": true }), CA.compoundPickAllowed(strikes, 3, { "2:0": true }), CA.compoundPickAllowed(strikes, 2, { "2:0": true }), CA.compoundPickAllowed(strikes, 0, { "2:0": true }), CA.compoundPickAllowed(strikes, 1, {})], [false, false, true, true, true]);
  equal("P3 the action is three strikes, not five; without pickOne the first match only", [CA.compoundStrikeTotal(strikes), CA.compoundStrikes({ strikes: [{ weapon: ".", notWeapon: "claw" }] }, weapons).strikes.map((s) => s.weaponName)], [3, ["Wing"]]); }
ok("P4 the card refuses the rest of the group and counts the group once", /if \(!compoundPickAllowed\(raw\.strikes, strikeIndex, raw\.used\)\)/.test(src.cw) && /!compoundPickAllowed\(raw\.strikes, Number\(button\.dataset\.strike\), raw\.used\)/.test(src.cw) && /const total = compoundStrikeTotal\(raw\.strikes \?\? \[\]\);/.test(src.cw));
ok("P5 Core's Draconic Assault picks one", /"Draconic Assault": \{[^\n]*notWeapon: "claw", count: 1, pickOne: true \}/.test(src.decl));

// 3.641.1, found live.
{ const sov = { x: 4, y: 18, w: 4, h: 4 };
  equal("L1 beside a 4×4 flank off its centre line, at its corner, and one square off", [CR.footprintsAdjacent(sov, { x: 8, y: 18, w: 1, h: 1 }), CR.footprintsAdjacent(sov, { x: 8, y: 22, w: 1, h: 1 }), CR.footprintsAdjacent(sov, { x: 9, y: 18, w: 1, h: 1 }), CR.footprintsAdjacent({ x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 2, w: 1, h: 1 }), CR.footprintsAdjacent({ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 1, w: 1, h: 1 })], [true, true, false, false, true]); }
{ const ix = CI.buildCodexIndex([{ pack: "creature-abilities", name: "Elemental Aura", flags: { "trg-prime": { auras: [{ id: "aura-elemental-aura", name: "Elemental Aura", radius: 10 }] } } }]);
  const f = CI.inheritedCodexFlags({ type: "ability", name: "Freezing Aura", flags: {} }, ix)?.auras?.[0];
  equal("L3 a called aura goes by its called name", [f?.name, f?.id, f?.radius], ["Freezing Aura", "aura-freezing-aura", 10]); }
ok("L2 the elemental blood reads footprints, not centres", /if \(footprintsAdjacent\(box\(token\), box\(other\)\)\) out\.push\(other\.actor\);/.test(src.hooks));

const EXPECTED = 13;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block11: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block11: ${checks} checks — all green.`);
