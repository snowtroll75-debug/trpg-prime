#!/usr/bin/env node
/**
 * verify-ff30-block31 — 3.662.0, Fiends & Fables 3.0 block 31 (the Storm
 * Crow to the Titan; Graham, 18 October 2026: "Your recommendations and
 * Option A for R2").
 *
 *   R2   a declared condition's duration may be dice ("Deafened for 1d4
 *        rounds"), rolled once as it lands
 *   F1   3.662.1, found live: a Plant takes ordinary damage. Non-critical
 *        blows used never to reach its HP; the type's sentence is about
 *        what a critical injury does to it.
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
const DS = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "combat", "declared-after-strikes.mjs")).href);
const PE = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "peril-effect.mjs")).href);

const deaf = DS.declaredConditionTag({ key: "deafened", rounds: "1d4" }, { combatRound: 3, worldTime: 100 });
equal("D1 a dice duration is carried unrolled, with no clock yet", [deaf.roundsDice, deaf.expiresRound, deaf.expiresTime], ["1d4", undefined, undefined]);
equal("D2 rolled: the combat's round, or six seconds a round outside one; the dice are gone",
  [DS.withRolledRounds(deaf, 3, { combatRound: 3 }).expiresRound, DS.withRolledRounds(deaf, 2, { worldTime: 100 }).expiresTime, "roundsDice" in DS.withRolledRounds(deaf, 2, {})], [6, 112, false]);
equal("D3 a fixed duration is unchanged; a number or nonsense is not dice",
  [DS.declaredConditionTag({ key: "stunned", rounds: 2 }, { combatRound: 1 }).expiresRound, DS.declaredConditionTag({ key: "stunned", rounds: "2" }, { combatRound: 1 }).roundsDice, DS.declaredConditionTag({ key: "stunned", rounds: "d" }, {}).roundsDice, DS.declaredConditionTag({ key: "x", rounds: "2d6+1" }, {}).roundsDice],
  [3, undefined, undefined, "2d6+1"]);
equal("D4 a rolled duration is at least one round", DS.withRolledRounds(deaf, 0, { combatRound: 5 }).expiresRound, 6);
const ts = { save: "fortitude", basic: true, conditions: { failure: [{ key: "deafened", rounds: "1d4" }], fumble: [{ key: "deafened", rounds: "1d4" }] } };
equal("D5 the area ladder carries it on Failure, and Partial and Blunder fall back to it",
  ["partial", "failure", "blunder", "success"].map((d) => PE.perilEffectOutcome(ts, d, { combatRound: 1 }).tags.map((t) => t.roundsDice ?? "-").join()), ["1d4", "1d4", "1d4", ""]);
const pw = read("module", "peril-workflow.mjs");
ok("S1 the area workflow rolls it for each creature and says so on the card",
  /if \(tag\.roundsDice\) \{ const r = await new Roll\(tag\.roundsDice\)\.evaluate\(\); parts\.push\(`\$\{conditionLabel\(t\.key\)\} for \$\{tag\.roundsDice\} → \$\{r\.total\} round[\s\S]{0,60}?tags\.push\(withRolledRounds\(tag, r\.total, clock\)\); continue; \}/.test(pw));
const aw = read("module", "combat", "declared-after-strikes-workflow.mjs");
ok("S2 a strike's declared condition rolls it the same way",
  /if \(tag\.roundsDice\) \{ const r = await new Roll\(tag\.roundsDice\)\.evaluate\(\);[\s\S]{0,160}?tag = withRolledRounds\(tag, r\.total, clock\); \}/.test(aw));

const dw = read("module", "combat", "dying-workflow.mjs");
const direct = dw.slice(dw.indexOf("async function applyDamageDirect("), dw.indexOf("export async function enterDyingAt("));
ok("F1 the damage primitive turns no non-critical blow away from a Plant",
  direct.length > 1000 && !/critOnlyDamage|isCritOnlyDamage|no-damage-not-critical/.test(direct) && !/isCritical\)\s*\{\s*return \{\s*case: "no-damage/.test(dw));
{ const ctr = read("module", "creature-type-rules.mjs");
  ok("F1b the old gate's rule is gone from the creature-type rules, which still say why", !/export function isCritOnlyDamage/.test(ctr) && /REMOVED AT 3\.662\.1: `isCritOnlyDamage`/.test(ctr) && /export function hasNoDeathState\(/.test(ctr)); }
ok("F1c Plant Resistance still filters a critical's other results",
  /const \{ hasPlantResistance, plantResistanceSplit \} = await import\("\.\.\/creature-ability-rules\.mjs"\);/.test(read("module", "combat", "attack-workflow.mjs")));

const EXPECTED = 11;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block31: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block31: ${checks} checks\n  all pass\n`);
