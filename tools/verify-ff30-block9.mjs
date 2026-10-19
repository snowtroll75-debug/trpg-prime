#!/usr/bin/env node
/**
 * verify-ff30-block9 — 3.639.0, Fiends & Fables 3.0 block 9 (Centaur to
 * Akrexe; Graham, 13 October 2026: "all recommendations"):
 *   R4  Constrict's requireCondition and saveAvoidsCriticalOnly (Mandibles)
 *   R5  after-strike dc, stack and thresholds (Petrifying Bite)
 *   R7  the heldAdvantage Codex action (Foresight Gaze)
 *   R8  Trample: the Slam, else the fallback (a Hoof), never any weapon
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const R = await import(new URL("../module/codex-action-rules.mjs", import.meta.url));
const D = await import(new URL("../module/combat/declared-after-strikes.mjs", import.meta.url));
const HB = await import(new URL("../module/magic/held-bonus.mjs", import.meta.url));
const { CODEX_DECLARATIONS } = await import(new URL("./ff30-codex-declarations.mjs", import.meta.url));
const cx = read("module", "codex-actions-workflow.mjs");
const dw = read("module", "combat", "declared-after-strikes-workflow.mjs");

/* R4 */
{ const held = [{ n: "a", c: ["paralyzed"] }, { n: "b", c: [] }]; const has = (t, k) => t.c.includes(k);
  equal("M1 requireCondition narrows the held to the paralyzed; none named keeps all", [R.constrictTargets(held, { requireCondition: "paralyzed" }, has).map((t) => t.n), R.constrictTargets(held, {}, has).map((t) => t.n)], [["a"], ["a", "b"]]); }
equal("M2 a save that avoids only the critical never halves or zeroes the damage; the failure's extra die stays", [
  R.constrictSaveResult({ damageMultiplier: 0.5, bonusBaseDamage: 0 }, { saveAvoidsCriticalOnly: true }).damageMultiplier,
  R.constrictSaveResult({ damageMultiplier: 0, bonusBaseDamage: 0 }, { saveAvoidsCriticalOnly: true }).damageMultiplier,
  R.constrictSaveResult({ damageMultiplier: 1, bonusBaseDamage: 2 }, { saveAvoidsCriticalOnly: true }).bonusBaseDamage,
  R.constrictSaveResult({ damageMultiplier: 0.5, bonusBaseDamage: 0 }, {}).damageMultiplier], [1, 1, 2, 0.5]);
ok("M3 Constrict uses both", /const held = constrictTargets\(grabbedByActor\(actor\), spec,/.test(cx) && /const bs = constrictSaveResult\(basicSavingThrow\(/.test(cx));
/* R5 */
{ const raw = { key: "pb", save: "fortitude", dc: 19, stack: true, thresholds: [{ key: "slowed", atLeast: 3, apply: "petrified" }], conditions: { failure: [{ key: "slowed", value: 1 }] } };
  const [spec] = D.declaredAfterStrikes([{ flags: { "trg-prime": { afterStrikes: [raw] } } }]);
  equal("P1 a printed DC replaces the Level DC; severity still raises it; none keeps the Level DC", [D.declaredAfterStrikeDC(spec, 17, null), D.declaredAfterStrikeDC({ ...spec, dcBySeverity: { serious: 2 } }, 17, "serious"), D.declaredAfterStrikeDC({ dcBySeverity: {} }, 17, null)], [19, 21, 17]);
  equal("P2 stacking adds to the target's own; without it the declared value stands", [D.stackedConditionValue(spec, 1, 1), D.stackedConditionValue(spec, 0, 2), D.stackedConditionValue({}, 2, 1)], [2, 2, 1]);
  equal("P3 Slowed 3 petrifies; Slowed 2 does not", [D.thresholdConditions(spec, { slowed: 3 }), D.thresholdConditions(spec, { slowed: 2 }), D.thresholdConditions(spec, { slowed: 4 })], [["petrified"], [], ["petrified"]]);
  equal("P4 a malformed threshold is dropped", D.declaredAfterStrikes([{ flags: { "trg-prime": { afterStrikes: [{ ...raw, key: "x", thresholds: [{ key: "slowed", atLeast: 0, apply: "petrified" }, { key: "", atLeast: 3, apply: "x" }] }] } } }])[0].thresholds, []); }
ok("P5 the workflow stacks and applies the threshold", /tag\.value = stackedConditionValue\(spec, had, tag\.value\);/.test(dw) && /const reached = thresholdConditions\(spec, Object\.fromEntries/.test(dw));
/* R7 */
{ const row = R.heldAdvantageRow({ name: "Foresight Gaze" });
  const spec = HB.normaliseHeldBonus(row);
  ok("F1 Foresight Gaze's row is a valid held advantage on every d20 check type, not damage", spec && spec.kind === "advantage" && spec.checkTypes.includes("attack") && spec.checkTypes.includes("save") && spec.checkTypes.includes("skill") && !spec.checkTypes.includes("damage"), JSON.stringify(spec)); }
ok("F2 heldAdvantage is a Codex action that spends the use and lays the held flag", /changeShape(, lunaFrenzy)?, heldAdvantage(, basicAction)?(, weaponStrike)?(, carrionFeast, sizeShift)?(, strikeBurst, sweepingStrike)?(, toggleEffect)? \}\);/.test(cx) && /\[HELD_BONUS_FLAG\]: held \}/.test(cx) && /if \(counted\) await item\.update\(\{ "system\.usesValue": left - 1 \}\);/.test(cx.slice(cx.indexOf("async function heldAdvantage"), cx.indexOf("async function weaponStrike"))));
/* R8 */
{ const w = (n) => ({ type: "weapon", name: n });
  equal("T1 Trample: the Slam first, else a Hoof, else nothing — never the bow", [R.trampleWeapon([w("Hoof"), w("Slam")], { weapon: "slam", fallbackWeapons: ["hoof"] })?.name, R.trampleWeapon([w("Composite Longbow"), w("Hoof")], { weapon: "slam", fallbackWeapons: ["hoof"] })?.name, R.trampleWeapon([w("Composite Longbow")], { weapon: "slam", fallbackWeapons: ["hoof"] })], ["Slam", "Hoof", null]); }
equal("T2 the Codex Trample declares the Hoof fallback", CODEX_DECLARATIONS.Trample.flags.creatureAbility.action.fallbackWeapons, ["hoof"]);
ok("T3 the workflow uses the rule", /const weapon = trampleWeapon\(actor\.items \?\? \[\], spec\);/.test(cx));

const EXPECTED = 14;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block9: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block9: ${checks} checks — all green.`);
