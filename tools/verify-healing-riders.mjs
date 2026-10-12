#!/usr/bin/env node
/**
 * verify-healing-riders — riders on the caster's own healing (3.625.0):
 * No Life Abandoned (+half level when the target is at half HP or fewer,
 * never on yourself), Resurgent Healing (a Dying creature regains half),
 * Vital Surge (one die maximised, once a round). Driven through the pure
 * module; the heal case, healActor and the relay structural.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const { declaredHealingRiders, applyHealingRiders, maximiseFirstDie, healingRidersBurnUpdate, HEALING_RIDERS_USED_FLAG } = await import(new URL("../module/magic/healing-riders.mjs", import.meta.url));
const eff = (id, rider, extra = {}) => ({ id, name: id, flags: { "trg-prime": { healingRider: rider } }, ...extra });

equal("A1 well-formed riders are read; malformed and empty ones are not", declaredHealingRiders([eff("a", { label: "NLA", lowHalfBonus: "halfLevel" }), eff("b", { dyingHalf: true }), eff("c", { maximiseOneDie: true, oncePerRound: true }), eff("d", {}), eff("e", "x"), { id: "f", flags: {} }]).map((r) => r.id), ["a", "b", "c"]);
equal("A2 a disabled effect's rider is skipped", declaredHealingRiders([eff("a", { dyingHalf: true }, { disabled: true })]), []);
equal("A3 a numeric lowHalfBonus is kept; a bad one is 0", declaredHealingRiders([eff("a", { lowHalfBonus: 3 }), eff("b", { lowHalfBonus: "lots", dyingHalf: true })]).map((r) => r.lowHalfBonus), [3, 0]);

equal("B1 maximiseFirstDie: 3d6+6 → 2d6 + 6+6; 1d8 → 8; a flat number untouched", [maximiseFirstDie("3d6+6"), maximiseFirstDie("1d8"), maximiseFirstDie("12")], ["2d6 + 6+6", "8", "12"]);

const riders = declaredHealingRiders([eff("nla", { label: "No Life Abandoned", lowHalfBonus: "halfLevel" }), eff("res", { label: "Resurgent Healing", dyingHalf: true }), eff("vs", { label: "Vital Surge", maximiseOneDie: true, oncePerRound: true })]);
const plan = (p) => applyHealingRiders(riders, { formula: "2d8", casterLevel: 7, targetHp: 10, targetMax: 30, ...p });
equal("C1 a target at half HP or fewer: +3 (half of 7, floor), one die maximised, Vital Surge burnt", [plan({}).extra, plan({}).formula, plan({}).burn, plan({}).dyingHalf], [3, "1d8 + 8", ["vs"], false]);
equal("C2 a target above half: no bonus, the die still maximised", [plan({ targetHp: 16 }).extra, plan({ targetHp: 16 }).formula], [0, "1d8 + 8"]);
equal("C3 exactly half is 'half or fewer'", plan({ targetHp: 15 }).extra, 3);
equal("C4 the caster healing itself gets no No Life Abandoned", plan({ self: true }).extra, 0);
equal("C5 the minimum is 1 at low level", applyHealingRiders(riders, { formula: "1d6", casterLevel: 1, targetHp: 1, targetMax: 10 }).extra, 1);
equal("C6 a Dying target: dyingHalf set and said", [plan({ targetDying: true }).dyingHalf, plan({ targetDying: true }).lines.some((l) => /half the healing/.test(l))], [true, true]);
equal("C7 Vital Surge already used this round: formula untouched, nothing burnt", [plan({ used: { vs: true } }).formula, plan({ used: { vs: true } }).burn], ["2d8", []]);
equal("C8 a flat heal cannot be maximised and burns nothing", applyHealingRiders(riders, { formula: "10", casterLevel: 4, targetHp: 20, targetMax: 20 }).burn, []);
equal("C9 the burn update marks the id and keeps the rest", healingRidersBurnUpdate(["vs"], { other: true }), { other: true, vs: true });
equal("C10 no riders: the heal is untouched", applyHealingRiders([], { formula: "2d8", casterLevel: 7, targetHp: 1, targetMax: 30, targetDying: true }), { formula: "2d8", extra: 0, dyingHalf: false, lines: [], burn: [] });

const effects = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");
ok("D1 STRUCTURAL: the heal case reads the caster's riders before the roll and adds the extra after", /const healingRiders = declaredHealingRiders\(Array\.from\(caster\?\.appliedEffects/.test(effects) && /const amount = \(await rollAmount\(formula, rollData, rolls\)\) \+ riderPlan\.extra;/.test(effects));
ok("D2 STRUCTURAL: the heal hands dyingHalf to healActor, which halves rather than refuses", /dyingHalf: riderPlan\.dyingHalf \}\);/.test(effects) && /if \(!rule\.healsHP && !dyingHalf\) return 0;\n\s*if \(!rule\.healsHP && dyingHalf\) amount = Math\.floor\(Math\.max\(0, Number\(amount\) \|\| 0\) \/ 2\);/.test(effects));
const combat = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs"), "utf8");
ok("D3 STRUCTURAL: the round reset clears the marker", new RegExp(`\\$\\{SYSTEM_ID\\}\\.${HEALING_RIDERS_USED_FLAG}\`\\]: deletionValue\\(\\)`).test(combat));
ok("D5 STRUCTURAL: outside a started combat the marker is neither read nor written (3.625.1 — every cast is its own round)", /const ridersClocked = Boolean\(game\.combat\?\.started && caster\?\.inCombat\);\s*const ridersUsed = ridersClocked \? \(caster\?\.getFlag\?\.\(SYSTEM_ID, HEALING_RIDERS_USED_FLAG\) \?\? \{\}\) : \{\};/.test(effects) && /if \(ridersClocked && riderPlan\.burn\.length && caster\?\.setFlag\)/.test(effects));
const relay = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "target-relay.mjs"), "utf8") + fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "target-relay-workflow.mjs"), "utf8");
ok("D4 STRUCTURAL: dyingHalf crosses the relay", /dyingHalf: options\?\.dyingHalf === true/.test(relay) && /dyingHalf: payload\.dyingHalf === true/.test(relay));

const EXPECTED = 20;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-healing-riders: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-healing-riders: ${checks} checks — all green.`);
