#!/usr/bin/env node
/**
 * verify-favoured-weapon-group — an aspect may favour a weapon GROUP
 * (3.572.0), shipped with Pillars of Faith's Chapter 7.
 *
 * DRIVEN, pure (divine-aspect.mjs):
 *   A  favouredWeaponGroupMatches — letters-only equality between the
 *      favoured line and the weapon's group; a name suffix is not a group.
 *   B  favouredWeaponSources / favouredWeaponAttackModifiers /
 *      grantsProficiency reach a weapon by group as well as by name, and
 *      the ten appendix families are unchanged.
 *
 * STRUCTURAL, marked so: the attack workflow hands over the group at
 * both of its sites.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

const da = await import(new URL("../module/divine-aspect.mjs", import.meta.url));
const aspect = (name, favouredWeapon) => ({ name, system: { favouredWeapon } });

// The group rule is driven through favouredWeaponSources with a weapon
// whose NAME cannot match ("Blade"), so only the group can answer.
const byGroup = (favoured, group) => da.favouredWeaponSources([aspect("X", favoured)], "Blade", group).length > 0;
equal("A1 the group matches by letters", byGroup("Knife", "Knife"), true);
equal("A2 ...case- and punctuation-blind", byGroup("knife", "KNIFE "), true);
equal("A3 a different group does not", byGroup("Knife", "Sword"), false);
equal("A4 a name is not a group: Dagger is not the Knife group's name", byGroup("Knife", "Dagger"), false);
equal("A6 the group match is exact, not a prefix or suffix", [byGroup("Sword", "Swordstaff"), byGroup("Staff", "Swordstaff")], [false, false]);
equal("A5 an empty favoured line or group never matches", [byGroup("", "Knife"), byGroup("Knife", ""), byGroup("", "")], [false, false, false]);

const oaths = aspect("Oaths", "Knife");
equal("B1 a Dagger reaches Oaths by its group", da.favouredWeaponSources([oaths], "Dagger", "Knife").map((s) => s.name), ["Oaths"]);
equal("B2 ...and not without the group (the suffix rule alone)", da.favouredWeaponSources([oaths], "Dagger", ""), []);
equal("B3 a Halberd reaches a Polearm aspect by group", da.grantsProficiency([aspect("Sacrifice", "Polearm")], "Halberd", "Polearm"), true);
equal("B4 a weapon of another group is refused", da.grantsProficiency([oaths], "Longsword", "Sword"), false);
equal("B5 the attack modifier is the same +1 class row", da.favouredWeaponAttackModifiers([oaths], "Sickle", "Knife"), [{ label: "Oaths (favoured weapon)", value: 1, type: "class" }]);
equal("B6 name and group both matching is one source, not two", da.favouredWeaponSources([aspect("Endurance", "Hammer")], "Warhammer", "Hammer").length, 1);
equal("B7 the appendix families are unchanged: Dawn's Mace reaches Heavy Mace by name", da.favouredWeaponSources([aspect("Dawn", "Mace")], "Heavy Mace", "Club").map((s) => s.name), ["Dawn"]);
equal("B8 ...and Death's Scythe does not reach a Glaive through the Polearm group", da.favouredWeaponSources([aspect("Death", "Scythe")], "Glaive", "Polearm"), []);
equal("B9 the default group argument is empty (older callers keep their answer)", da.favouredWeaponSources([oaths], "Dagger").length, 0);

const aw = read("module/combat/attack-workflow.mjs");
ok("C0 STRUCTURAL: the group rule is a private helper of divine-aspect.mjs (no uncalled export)", /\nfunction favouredWeaponGroupMatches\(/.test(read("module/divine-aspect.mjs")) && !/export function favouredWeaponGroupMatches/.test(read("module/divine-aspect.mjs")));
ok("C1 STRUCTURAL: the attack bonus site passes the weapon's group", /favouredWeaponAttackModifiers\(aspectsOf\(actor\), weapon\.name, weapon\.system\?\.group\)/.test(aw));
ok("C2 STRUCTURAL: the Devotion site passes the weapon's group", /favouredWeaponSources\(aspects, weapon\.name, weapon\.system\?\.group\)\.length > 0/.test(aw));

const EXPECTED_CHECKS = 19;
equal("Z1 the suite ran every check it is meant to", checks + 1, EXPECTED_CHECKS);
if (failures.length) { console.log(`verify-favoured-weapon-group: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-favoured-weapon-group: ${checks} checks — all green.`);
