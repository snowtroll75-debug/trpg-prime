#!/usr/bin/env node
/**
 * verify-gated-riders — strike riders the strike resolves itself
 * (3.625.0): a rider gated on the target's creature types, on a Critical
 * hit, on the target being at half HP or fewer, bound to named weapons,
 * and reused once per round rather than spent. Pillars of Faith's
 * Consecrated Armament and Final Sanction.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const { normaliseStrikeRider, riderIsGated, riderGatesHold, riderPacketsFor, ridersBurntBy, ridersSpentBy, riderGateText } = await import(new URL("../module/magic/strike-riders.mjs", import.meta.url));

const armament = normaliseStrikeRider({ label: "Consecrated Armament", dice: "1d6", damageType: "essence", targetTypes: ["Undead"], onCritical: true, weaponNames: ["Oath Hammer"], oncePerRound: true });
const sanction = normaliseStrikeRider({ label: "Final Sanction", dice: "1d6", damageType: "untyped", lowHalfHp: true, oncePerRound: true });
const plain = normaliseStrikeRider({ label: "Talon", dice: "1d6", damageType: "slashing" });
equal("A1 the gates normalise, lower-cased, and a once-per-round rider is never 'once'", [armament.targetTypes, armament.onCritical, armament.weaponNames, armament.oncePerRound, armament.once, sanction.lowHalfHp, plain.once], [["undead"], true, ["oath hammer"], true, false, true, true]);
equal("A2 riderIsGated: the two gated ones, not the plain one", [riderIsGated(armament), riderIsGated(sanction), riderIsGated(plain)], [true, true, false]);
equal("A3 a once-per-round rider is not among those spent", ridersSpentBy([armament, sanction, plain], { attackMode: "melee", name: "Oath Hammer" }).map((s) => s.label), ["Talon"]);

const hammer = { attackMode: "melee", name: "Oath Hammer" };
equal("B1 Consecrated Armament holds on a critical against an undead", riderGatesHold(armament, { targetTypes: ["undead"], critical: true }), true);
equal("B2 …not on a plain hit, nor against a living target, nor with no target", [riderGatesHold(armament, { targetTypes: ["undead"], critical: false }), riderGatesHold(armament, { targetTypes: ["humanoid"], critical: true }), riderGatesHold(armament, { critical: true })], [false, false, false]);
equal("B3 Final Sanction holds at half HP or fewer, not above, not without a maximum", [riderGatesHold(sanction, { targetHp: 10, targetMax: 20 }), riderGatesHold(sanction, { targetHp: 11, targetMax: 20 }), riderGatesHold(sanction, { targetHp: 5, targetMax: 0 })], [true, false, false]);
equal("B4 the gate text names what did not hold", [riderGateText(armament), riderGateText(sanction)], ["undead, a Critical hit", "a target at half HP or fewer"]);

const pk = (specs, weapon, ctx) => riderPacketsFor(specs, weapon, ctx).map((p) => [p.label, p.resolved, p.applies, p.type]);
equal("C1 a gated rider arrives RESOLVED and applied when its gates hold", pk([armament], hammer, { targetTypes: ["undead"], critical: true }), [["Consecrated Armament", true, true, "essence"]]);
equal("C2 …resolved and not applied when they do not (the card prints why)", riderPacketsFor([armament], hammer, { targetTypes: ["undead"], critical: false }).map((p) => [p.resolved, p.applies, p.conditional, p.why]), [[true, false, true, "its condition did not hold on this strike"]]);
equal("C3 a rider bound to named weapons reaches no other weapon", pk([armament], { attackMode: "melee", name: "Dagger" }, { targetTypes: ["undead"], critical: true }), []);
equal("C4 a plain rider is untouched by the gate machinery", riderPacketsFor([plain], hammer, {}).map((p) => [p.resolved, p.applies]), [[false, true]]);
equal("C5 a once-per-round rider whose marker is burnt sits the strike out", pk([armament], hammer, { targetTypes: ["undead"], critical: true, used: { [armament.id ?? armament.label]: true } }), []);
equal("C6 ridersBurntBy: the gated rider that fired, not one whose gate failed, not a plain one", [ridersBurntBy([armament, sanction, plain], hammer, { targetTypes: ["undead"], critical: true, targetHp: 20, targetMax: 20 }).map((s) => s.label), ridersBurntBy([armament, sanction], hammer, { targetTypes: ["undead"], critical: false, targetHp: 5, targetMax: 20 }).map((s) => s.label)], [["Consecrated Armament"], ["Final Sanction"]]);
equal("C7 a burnt marker keeps a rider out of ridersBurntBy too", ridersBurntBy([sanction], hammer, { targetHp: 5, targetMax: 20, used: { [sanction.label]: true } }), []);

const reed = normaliseStrikeRider({ label: "Dragon's Breath Reed", dice: "1d6", damageType: "fire", spendOn: "hit" });
equal("A4 a spendOn:'hit' rider is spent by a hit and kept by a miss; a plain once-rider is spent by either", [ridersSpentBy([reed, plain], hammer, { hit: true }).map((s) => s.label), ridersSpentBy([reed, plain], hammer, { hit: false }).map((s) => s.label)], [["Dragon's Breath Reed", "Talon"], ["Talon"]]);
equal("A5 spendOn:'hit' survives the round trip (3.625.1, the 0.7.0 live defect): the stored, normalised spec normalised again still waits for a hit", [normaliseStrikeRider(reed).spendOnHit, ridersSpentBy([normaliseStrikeRider(reed), plain], hammer, { hit: false }).map((s) => s.label)], [true, ["Talon"]]);
const wf = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "strike-riders-workflow.mjs"), "utf8");
ok("D1 STRUCTURAL: the workflow stamps the effect id on the spec and keys the marker by it", /spec\.id = String\(effect\.id \?\? ""\);/.test(wf) && /next\[spec\.id\] = true;/.test(wf) && /name: String\(weapon\?\.name \?\? ""\),/.test(wf));
const aw = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs"), "utf8");
ok("D1b STRUCTURAL: the attack's miss path says it missed when it spends", /const spentOnMiss = await spendStrikeRiders\(actor, weapon, \{ hit: false \}\);/.test(aw));
ok("D2 STRUCTURAL: the damage path hands the target's kind, the critical and the HP before damage, and burns after", /const riderCtx = \{\s*targetTypes: creatureTypesOf\(targetActor\?\.system \?\? \{\}\),[\s\S]{0,200}targetTraits: creatureTraits\(targetActor\?\.system \?\? \{\}\),\s*critical: Boolean\(critical\),/.test(aw) && /burnStrikeRiders\(actor, weapon, riderCtx\)/.test(aw));
const combat = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs"), "utf8");
ok("D3 STRUCTURAL: the round reset clears the marker", /\.strikeRidersUsed`\]: deletionValue\(\)/.test(combat));

const EXPECTED = 21;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-gated-riders: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-gated-riders: ${checks} checks — all green.`);
