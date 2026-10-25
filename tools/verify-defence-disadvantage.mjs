#!/usr/bin/env node
/**
 * verify-defence-disadvantage — 3.665.0: a defender's row that gives the
 * attacker's check disadvantage (Graham's ruling of 21 October 2026 on
 * Inner Tempest's Tsuchi: "Grant the check disadvantage" for a Shove or a
 * Trip). See module/combat/defence-dc.mjs.
 *
 *   A  the row, normalised
 *   B  which actions it reaches, against a fake defender
 *   C  the bias it produces, reconciled in one pass
 *   D  the wiring in the action workflow
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const dd = await import(new URL("../module/combat/defence-dc.mjs", import.meta.url));
const { biasWithKinds } = await import(new URL("../module/conditionals.mjs", import.meta.url));
const { BIAS } = await import(new URL("../module/dice/check.mjs", import.meta.url));

const TSUCHI = { kind: "disadvantage", label: "Tsuchi", scope: "you resist being knocked prone or moved", when: { actions: ["shoveAttack", "tripAttack"] } };
const n = dd.normaliseDefenceDC(TSUCHI, { name: "Tsuchi" });
equal("A1 a disadvantage row needs no DC and no value", n && [n.kind, n.dc, n.value, n.actions], ["disadvantage", "any", 0, ["shoveattack", "tripattack"]]);
equal("A2 it must still be scoped", dd.normaliseDefenceDC({ kind: "disadvantage", label: "Loose" }, { name: "Loose" }), null);
const storgar = dd.normaliseDefenceDC({ dc: "fortitudeDC", value: 2, label: "Storgar", when: { actions: ["shoveAttack"] } }, { name: "Storgar" });
equal("A3 a value row is unchanged, and named a modifier", storgar && [storgar.kind, storgar.dc, storgar.value], ["modifier", "fortitudeDC", 2]);
equal("A4 a value row still refuses 0 and \"any\"", [dd.normaliseDefenceDC({ dc: "fortitudeDC", value: 0, when: { actions: ["shoveAttack"] } }), dd.normaliseDefenceDC({ dc: "any", value: 2, when: { actions: ["shoveAttack"] } })], [null, null]);

const defender = (rows) => ({ items: [{ id: "h", name: "Heritage", flags: { "trg-prime": { defenceDC: rows } } }], appliedEffects: [] });
const tsuchi = defender([TSUCHI]);
const shove = dd.defenceDCBonus(tsuchi, "fortitudeDC", "shoveAttack");
equal("B1 a Shove against a Tsuchi: disadvantage, and no DC moves", [shove.total, shove.entries.length, shove.disadvantages.map((e) => e.label)], [0, 0, ["Tsuchi"]]);
const trip = dd.defenceDCBonus(tsuchi, ["skillDC:acrobatics", "fortitudeDC"], "tripAttack");
equal("B2 a Trip, rolled against the higher of two DCs, is reached too", trip.disadvantages.length, 1);
equal("B3 a Grapple or a Strike is not", [dd.defenceDCBonus(tsuchi, "fortitudeDC", "grappleAttack").disadvantages.length, dd.defenceDCBonus(tsuchi, "defence", "").disadvantages.length], [0, 0]);
const both = dd.defenceDCBonus(defender([TSUCHI, { dc: "fortitudeDC", value: 2, label: "Storgar", when: { actions: ["shoveAttack"] } }]), "fortitudeDC", "shoveAttack");
equal("B4 the value rows a caller sums are only the value rows", [both.total, both.entries.map((e) => e.label), both.disadvantages.map((e) => e.label)], [2, ["Storgar"], ["Tsuchi"]]);

equal("C1 disadvantage on a Normal roll", biasWithKinds(BIAS.NORMAL, ["disadvantage"], BIAS), BIAS.DISADVANTAGE);
equal("C2 the attack's own advantage and the defender's disadvantage cancel", [biasWithKinds(BIAS.NORMAL, ["advantage", "disadvantage"], BIAS), biasWithKinds(BIAS.ADVANTAGE, ["disadvantage"], BIAS), biasWithKinds(BIAS.DISADVANTAGE, ["advantage", "disadvantage"], BIAS)], [BIAS.NORMAL, BIAS.NORMAL, BIAS.NORMAL]);
equal("C3 nothing to add returns the roll's bias untouched", [biasWithKinds(undefined, [], BIAS), biasWithKinds(BIAS.ADVANTAGE, [], BIAS)], [undefined, BIAS.ADVANTAGE]);

const aw = read("module", "combat", "action-workflow.mjs");
ok("D1 the action keeps the defender's disadvantage rows", /defenceDisadvantages = defence\.disadvantages \?\? \[\];/.test(aw));
ok("D2 …says so on the card", /this check is rolled at disadvantage\$\{entry\.scope \? ` \(\$\{entry\.scope\}\)` : ""\}/.test(aw));
ok("D3 …and rolls at it, in the same pass as the attack's advantage", /bias: rollBiasWith\(tracklessBias\(situational\?\.bias, tracklessQuarry\), \[\s*\.\.\.\(actionAttackTerms\?\.advantage \? \["advantage"\] : \[\]\),\s*\.\.\.\(defenceDisadvantages\.length \? \["disadvantage"\] : \[\]\),\s*\.\.\.\(firstAdvantage \? \["advantage"\] : \[\]\)\s*\]\),/.test(aw) && /return biasWithKinds\(chosen, kinds, BIAS\);/.test(aw));

const EXPECTED = 15;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-defence-disadvantage: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-defence-disadvantage: ${checks} checks — all green.`);
