#!/usr/bin/env node
/**
 * verify-condition-floors — a floor carried on the creature, and the
 * inflictor's declaration (3.561.0; Pillars of Faith's Korath).
 *
 * DRIVEN: `effectConditionFloor` over fake actors; `inflictedFloorsOf` /
 * `inflictedFloorsFor` over fake sources. STRUCTURAL (marked): that the
 * three reducers — frightened recovery, Rally, the reduceCondition card —
 * ask `conditionFloorFor` before they write, and that both outcome
 * appliers pass the action key through.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0; const failures = [];
const ok = (l, c, d = "") => { checks += 1; if (!c) failures.push(`${l}${d ? ` — ${d}` : ""}`); };
const equal = (l, a, e) => ok(l, a === e, `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

const eman = await import(new URL("../module/magic/emanation-workflow.mjs", import.meta.url));
const bac = await import(new URL("../module/combat/basic-action-conditions.mjs", import.meta.url));

const fx = (floors, disabled = false) => ({ disabled, flags: { "trg-prime": { conditionFloors: floors } } });
equal("A1 no effects → 0", eman.conditionFloorFor({ appliedEffects: [], getActiveTokens: () => [] }, "frightened"), 0);
equal("A2 a floor of 1 is read", eman.conditionFloorFor({ appliedEffects: [fx({ frightened: 1 })], getActiveTokens: () => [] }, "frightened"), 1);
equal("A3 the highest of several wins", eman.conditionFloorFor({ appliedEffects: [fx({ frightened: 1 }), fx({ frightened: 2 })], getActiveTokens: () => [] }, "frightened"), 2);
equal("A3b …whichever order they come in", eman.conditionFloorFor({ appliedEffects: [fx({ frightened: 2 }), fx({ frightened: 1 })], getActiveTokens: () => [] }, "frightened"), 2);
equal("A4 a disabled effect is ignored", eman.conditionFloorFor({ appliedEffects: [fx({ frightened: 3 }, true)], getActiveTokens: () => [] }, "frightened"), 0);
equal("A5 another condition's floor does not leak", eman.conditionFloorFor({ appliedEffects: [fx({ sickened: 2 })], getActiveTokens: () => [] }, "frightened"), 0);
equal("A6 falls back to .effects when appliedEffects is absent", eman.conditionFloorFor({ effects: [fx({ frightened: 1 })], getActiveTokens: () => [] }, "frightened"), 1);
equal("A7 conditionFloorFor with no token returns the effect floor", eman.conditionFloorFor({ appliedEffects: [fx({ frightened: 1 })], getActiveTokens: () => [] }, "frightened"), 1);

const korath = { name: "Korath", flags: { "trg-prime": { inflictedFloors: [{ action: "demoralise", condition: "frightened", value: 1, rounds: 2 }] } } };
const actor = { items: [korath], appliedEffects: [] };
equal("B1 inflictedFloorsOf reads the heritage", bac.inflictedFloorsOf(actor).length, 1);
equal("B2 …naming its source", bac.inflictedFloorsOf(actor)[0].sourceName, "Korath");
equal("B3 matches Demoralise + frightened", bac.inflictedFloorsFor(bac.inflictedFloorsOf(actor), "demoralise", "frightened").length, 1);
equal("B4 …case-insensitively", bac.inflictedFloorsFor(bac.inflictedFloorsOf(actor), "Demoralise", "Frightened").length, 1);
equal("B5 not Intimidating Glare", bac.inflictedFloorsFor(bac.inflictedFloorsOf(actor), "intimidatingGlare", "frightened").length, 0);
equal("B6 not another condition", bac.inflictedFloorsFor(bac.inflictedFloorsOf(actor), "demoralise", "sickened").length, 0);
equal("B7 a zero-value declaration is dropped", bac.inflictedFloorsOf({ items: [{ flags: { "trg-prime": { inflictedFloors: [{ action: "demoralise", condition: "frightened", value: 0 }] } } }] }).length, 0);
equal("B8 an effect may declare one too", bac.inflictedFloorsOf({ items: [], appliedEffects: [korath] }).length, 1);
equal("B9 nothing declared → nothing", bac.inflictedFloorsOf({ items: [{ flags: {} }] }).length, 0);

const cw = read("module/combat/conditions-workflow.mjs");
const aw = read("module/combat/action-workflow.mjs");
const cc = read("module/dice/check-card-interactions.mjs");
ok("C1 frightened recovery asks the floor", /conditionFloorFor\(actor, "frightened"\)/.test(cw));
ok("C2 Rally asks the floor and honours it", /rally[\s\S]{0,600}conditionFloorFor\(targetActor, "frightened"\)[\s\S]{0,200}Math\.max\(currentFrightened - reduction, floor\)/.test(aw));
ok("C3 the reduceCondition card asks the floor", /reduceCondition[\s\S]{0,400}conditionFloorFor\(target, raw\.conditionKey\)/.test(cc));
ok("C4 the automatic-success applier passes the action key", /basicActionConditionEffects\(action\.key, "success"\),\s*actor,\s*targetActor,\s*\{ actionKey: action\.key \}/.test(aw));
ok("C5 the rolled applier passes the action key", aw.includes("{ expiresRound, actionKey: action.key }"));
ok("C6 the applier stamps floors only on target-facing active conditions", /effect\.active && effect\.target === "target" && actionKey/.test(read("module/combat/basic-action-conditions.mjs")));
ok("C7 the floor effect expires by conditionExpiresRound in combat", /conditionExpiresRound = Number\(globalThis\.game\.combat\.round/.test(read("module/combat/basic-action-conditions.mjs")));

const EXPECTED = 25;
equal("Z1 the suite ran every check", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-condition-floors: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-condition-floors: ${checks} checks — all green.`);
