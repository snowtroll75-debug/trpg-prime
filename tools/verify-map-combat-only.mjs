#!/usr/bin/env node
/**
 * verify-map-combat-only — 3.666.0: the multiple attack penalty counts only
 * in combat (Graham's ruling of 21 October 2026, "Combat only"). Out of
 * combat no turn starts, so the counter had climbed for ever: in the 3.665.0
 * live test a Shove took no penalty, the next attack -5 and the one after -10.
 * See attacksCount / attackCountOf / setAttackCount in combat/turn-records.mjs.
 *
 *   A  the rule, against fake actors and combats
 *   B  every reader and writer goes through it
 *   C  a combat starts with a fresh ladder
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const tr = await import(new URL("../module/combat/turn-records.mjs", import.meta.url));

function fakeActor(uuid, count = 0) {
  const flags = { "trg-prime": { attackCount: count } };
  return { uuid, getFlag: (s, k) => flags[s]?.[k], setFlag: async (s, k, v) => { flags[s][k] = v; }, _flags: flags };
}
const hero = fakeActor("Actor.hero", 2);
const tokenCopy = fakeActor("Scene.s.Token.t.Actor.hero", 1);
const bystander = fakeActor("Actor.by", 3);
const fight = (started, ...actors) => ({ started, combatants: actors.map((a) => ({ actor: a })) });

equal("A1 out of combat the count reads 0, whatever is stored", [tr.attackCountOf(hero, []), tr.attackCountOf(hero, [fight(false, hero)])], [0, 0]);
equal("A2 in a started combat it reads the stored count", tr.attackCountOf(hero, [fight(true, hero)]), 2);
equal("A3 a creature not in the fight is out of combat", tr.attackCountOf(bystander, [fight(true, hero)]), 0);
equal("A4 an unlinked token's actor is matched by its own uuid", [tr.attacksCount(tokenCopy, [fight(true, { uuid: "Scene.s.Token.t.Actor.hero" })]), tr.attacksCount(tokenCopy, [fight(true, hero)])], [true, false]);
const wroteOut = await tr.setAttackCount(hero, 5, []);
const wroteIn = await tr.setAttackCount(hero, 3, [fight(true, hero)]);
equal("A5 nothing is written out of combat; in combat the count is written", [wroteOut, wroteIn, hero._flags["trg-prime"].attackCount], [false, true, 3]);
equal("A6 a written count is a whole number, never negative", [await tr.setAttackCount(hero, -2, [fight(true, hero)]) && hero._flags["trg-prime"].attackCount], [0]);

const SITES = [
  ["combat/action-workflow.mjs", [/mapPenalty\(attackCountOf\(actor\)\)/, /await setAttackCount\(actor, attackCountOf\(actor\) \+ 1\);/]],
  ["combat/action-feats-workflow.mjs", [/const before = attackCountOf\(actor\);/, /await setAttackCount\(actor, before \+ owed\);/, /await setAttackCount\(actor, attackCountOf\(actor\) \+ 1\);\s*return true;/]],
  ["combat/double-slice-workflow.mjs", [/const mapBefore = attackCountOf\(actor\);/, /await setAttackCount\(actor, mapBefore \+ counted\);/]],
  ["alchemical-workflow.mjs", [/const attackIndex = attackCountOf\(actor\);/, /await setAttackCount\(actor, attackIndex \+ 1\);/]],
  ["magic/cast-workflow.mjs", [/const mapBefore = attackCountOf\(actor\);\s*lines\.push/, /await setAttackCount\(actor, mapBefore \+ advance\);/, /const mapBefore = mapCount \?\? attackCountOf\(actor\);/, /await setAttackCount\(actor, mapBefore \+ 1\);/]],
  ["magic/spiritual-weapon-workflow.mjs", [/const mapBefore = attackCountOf\(caster\);/, /await setAttackCount\(caster, mapBefore \+ 1\);/]],
  ["combat/mounted-workflow.mjs", [/const own = attackCountOf\(actor\);/, /return Math\.max\(own, attackCountOf\(partner\)\);/, /await setAttackCount\(actor, next\);/, /if \(partner\) await setAttackCount\(partner, next\);/]]
];
for (const [file, patterns] of SITES) {
  const src = read("module", ...file.split("/"));
  ok(`B ${file} reads and writes the counter through the combat-only helpers`, patterns.every((p) => p.test(src)), patterns.filter((p) => !p.test(src)).map(String).join(" | "));
}
// No other reader or writer of the raw flag outside the two that are combat
// by construction (a turn's own record, the encounter's "acted violently").
const ALLOWED = new Set(["combat/turn-records.mjs", "migration.mjs", "traits-workflow.mjs", "documents/combat.mjs"]);
const strays = [];
const walk = (dir, rel = "") => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name), r = rel ? `${rel}/${name}` : name;
    if (fs.statSync(full).isDirectory()) walk(full, r);
    else if (name.endsWith(".mjs") && !ALLOWED.has(r) && /(get|set)Flag\??\.?\(\s*SYSTEM_ID,\s*"attackCount"/.test(fs.readFileSync(full, "utf8"))) strays.push(r);
  }
};
walk(path.join(SYSTEM_ROOT, "module"));
equal("B no other code touches the raw counter", strays, []);
ok("B the two raw readers left are combat-only already", /attacksThisTurn: ownTurn \? Number\(actor\?\.getFlag\?\.\(SYSTEM_ID, "attackCount"\) \?\? 0\) : 0,/.test(read("module", "traits-workflow.mjs")) && /actedViolently: Number\(actor\.getFlag\?\.\(SYSTEM_ID, "attackCount"\) \?\? 0\) > 0/.test(read("module", "documents", "combat.mjs")));

ok("C a combat clears every combatant's counter before the first turn", /const \{ clearAttackCount \} = await import\("\.\.\/combat\/turn-records\.mjs"\);\s*for \(const c of combatants\) if \(c\.actor\) await clearAttackCount\(c\.actor\);\s*\}[\s\S]{0,2500}const result = await super\.startCombat\(\);/.test(read("module", "documents", "combat.mjs")));

const EXPECTED = 17;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-map-combat-only: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-map-combat-only: ${checks} checks — all green.`);
