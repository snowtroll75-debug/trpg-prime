#!/usr/bin/env node
/**
 * verify-magical-attacks — an actor's effects may declare that its
 * strikes count as magical for Resistance and Immunity (3.625.0),
 * against named creatures and/or with named weapons: Pillars of Faith's
 * Sanctioned Strike and Consecrated Armament. Driven through the pure
 * module; the damage path structural.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const { declaredMagicalAttacks, magicalAttackSource } = await import(new URL("../module/combat/magical-attacks.mjs", import.meta.url));
const eff = (name, raw, extra = {}) => ({ id: name, name, flags: { "trg-prime": { magicalAttacks: raw } }, ...extra });
const declared = declaredMagicalAttacks([
  eff("Sanctioned Strike", { label: "Sanctioned Strike", targetUuids: ["Actor.subject"] }),
  eff("Consecrated Armament", { weaponNames: ["Oath Hammer"] }),
  eff("Nothing", {}),
  eff("Off", { targetUuids: ["Actor.subject"] }, { disabled: true }),
  { id: "x", flags: {} }
]);
equal("A1 three declarations read (the disabled and the flagless skipped); names lower-cased; the label defaults to the effect's name", declared.map((d) => [d.label, d.targetUuids, d.weaponNames]), [["Sanctioned Strike", ["Actor.subject"], []], ["Consecrated Armament", [], ["oath hammer"]], ["Nothing", [], []]]);
const subjectOnly = declaredMagicalAttacks([eff("Sanctioned Strike", { targetUuids: ["Actor.subject"] })]);
equal("B1 against the Subject with any weapon: magical", magicalAttackSource(subjectOnly, { targetUuid: "Actor.subject", weaponName: "Dagger" })?.label, "Sanctioned Strike");
equal("B2 against anyone else, or nobody: not", [magicalAttackSource(subjectOnly, { targetUuid: "Actor.other", weaponName: "Dagger" }), magicalAttackSource(subjectOnly, { weaponName: "Dagger" })], [null, null]);
const hammerOnly = declaredMagicalAttacks([eff("Consecrated Armament", { weaponNames: ["Oath Hammer"] })]);
equal("B3 with the named weapon against anyone: magical; with another weapon: not", [magicalAttackSource(hammerOnly, { targetUuid: "Actor.other", weaponName: "Oath Hammer" })?.label, magicalAttackSource(hammerOnly, { targetUuid: "Actor.other", weaponName: "Dagger" })], ["Consecrated Armament", null]);
equal("B4 the weapon name matches case-blind", magicalAttackSource(hammerOnly, { weaponName: "oath hammer" })?.label, "Consecrated Armament");
const both = declaredMagicalAttacks([eff("Both", { targetUuids: ["Actor.subject"], weaponNames: ["Oath Hammer"] })]);
equal("B5 both axes named: both must hold", [magicalAttackSource(both, { targetUuid: "Actor.subject", weaponName: "Oath Hammer" })?.label, magicalAttackSource(both, { targetUuid: "Actor.subject", weaponName: "Dagger" }), magicalAttackSource(both, { targetUuid: "Actor.other", weaponName: "Oath Hammer" })], ["Both", null, null]);
equal("B6 a declaration naming neither applies to every strike", magicalAttackSource(declaredMagicalAttacks([eff("All", {})]), {})?.label, "All");
equal("B7 no declarations: null", magicalAttackSource([], { targetUuid: "Actor.subject", weaponName: "Oath Hammer" }), null);
const aw = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs"), "utf8");
ok("C1 STRUCTURAL: the damage packet's `magical` reads the actor's declaration beside the potency rune", /const strikeIsMagical = Boolean\(weapon\?\.system\?\.runeModifiers\?\.potency\) \|\| ammoPotencyTier\(ammo\) > 0\s*(\/\/[^\n]*\n\s*)*\|\| weapon\?\.flags\?\.\[SYSTEM_ID\]\?\.magicalStrike === true\s*(\/\/[^\n]*\n\s*)*\|\| Boolean\(magicalAttackSource\(declaredMagicalAttacks\(Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\)\), \{ targetUuid: targetActor\?\.uuid \?\? "", weaponName: weapon\?\.name \?\? "", targetTraits: creatureTraits\(targetActor\?\.system \?\? \{\}\) \}\)\)\s*(\/\/[^\n]*\n\s*)*\|\| strikeTypeIsMagical\(/.test(aw) && /magical: strikeIsMagical,/.test(aw));

const EXPECTED = 10;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-magical-attacks: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-magical-attacks: ${checks} checks — all green.`);
