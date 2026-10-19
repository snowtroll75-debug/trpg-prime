#!/usr/bin/env node
/**
 * verify-ff30-block6 — 3.636.0, Fiends & Fables 3.0 block 6 (Laeleth to
 * Cave Bear; Graham's rulings of 12 October 2026, "your recommendation on
 * all").
 *
 *   A  the pure rules, driven — Change Shape's forms and the effect a form
 *      lays (R10); an aura's immuneIf (R8)
 *   B  the workflows read them where the rule lives (source anchors): the
 *      aura skips the blind and carries a resave; the Codex action
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (p) => import(new URL(`../module/${p}`, import.meta.url));

/* ------------------------------------------------------------ A. R10 Change Shape */
const cs = await mod("change-shape.mjs");
const KNOCK = [{ kind: "modifier", value: 4, label: "Monstrous Knockdown", when: { actions: ["trip"] } }];
const spec = { kind: "changeShape", ap: 1, forms: [
  { key: "goblin", label: "Goblin guise", speed: 20, size: "Small", loses: ["Bite", "Claw"] },
  { key: "wolf", label: "Wolf", speed: 40, conditionals: KNOCK },
  { key: "bad" , size: "planet" }, { label: "no key" }
] };
const forms = cs.changeShapeForms(spec);
equal("A1 the forms: its own form first when undeclared, sizes checked, keyless dropped", [forms.map((f) => f.key), forms[1].size, forms[3].size, forms[1].loses], [["own", "goblin", "wolf", "bad"], "small", "", ["Bite", "Claw"]]);
const gob = cs.changeShapeEffectData(forms[1], { baseLand: 25, itemName: "Change Shape" });
equal("A2 the goblin guise: Speed 20 from 25 into the land pool, Small, the weapons it loses flagged", [gob.name, gob.changes, gob.flags["trg-prime"].changeShapeForm], ["Change Shape: Goblin guise",
  [{ key: "system.combat.movement.land.other", type: "custom", value: "-5", priority: 20 }, { key: "system.identity.size", type: "override", value: "small", priority: 50 }], { key: "goblin", loses: ["Bite", "Claw"] }]);
const wolf = cs.changeShapeEffectData(forms[2], { baseLand: 40 });
equal("A3 the wolf at its own speed changes no speed; it gains the Knockdown conditional with an id", [wolf.changes, wolf.flags["trg-prime"].conditionals.map((c) => [c.id, c.label])], [[], [["changeShape:wolf:0", "Monstrous Knockdown"]]]);
equal("A4 its own form lays nothing; the card says what each form does", [cs.changeShapeEffectData(forms[0]), cs.changeShapeSummary(forms[0]), /Speed 20 feet; Small size; no Bite or Claw Strikes/.test(cs.changeShapeSummary(forms[1], 25))], [null, "returns to its own form.", true]);

/* ------------------------------------------------------------ A. R8 immuneIf */
const ca = await mod("creature-auras.mjs");
equal("A5 an aura names the conditions that put a subject beyond it", [ca.normaliseAura({ radius: 30, save: "fortitude", immuneIf: ["Blinded", ""] }, { id: "g" }).immuneIf, ca.normaliseAura({ radius: 5, save: "will" }, { id: "s" }).immuneIf], [["blinded"], []]);

/* ------------------------------------------------------------ A. 3.637.0 entering is crossing in */
const gaze = ca.normaliseAura({ radius: 30, save: "fortitude", conditions: { failure: [{ key: "petrified" }] } }, { id: "g", name: "Gaze" });
const em = [{ id: "B", centreFeet: { x: 0, y: 0 }, widthFeet: 5, auras: [gaze] }];
const catches = (from, to, trigger = "enter") => ca.aurasCatching({ trigger, subject: { id: "s", centreFeet: { x: to, y: 0 }, fromCentreFeet: from === null ? null : { x: from, y: 0 }, widthFeet: 5 }, emitters: em }).length;
equal("A6 a move from outside to inside enters; within to within does not; an unknown start does; the turn start always asks", [catches(60, 20), catches(25, 20), catches(null, 20), catches(25, 20, "turnStart"), catches(20, 60)], [1, 0, 1, 1, 0]);

/* ------------------------------------------------------------ B. the workflows */
const src = { aura: read("module", "creature-aura-workflow.mjs"), codex: read("module", "codex-actions-workflow.mjs") };
ok("B1 a rolled aura passes over a subject with an immuneIf condition", /const blindedBy = \(aura\.immuneIf \?\? \[\]\)\.find\(\(key\) => actor\?\.hasCondition\?\.\(key\)\);/.test(src.aura) && /if \(blindedBy\) \{\n    return \{ lines: \[/.test(src.aura));
ok("B2 a rolled aura's resave becomes the escape save at its DC", /\(resave\n\s+\? \{ \.\.\.tag, conditionSave: \{ save, onSuccess: "end", label: aura\.name, saveDC: dc \} \}/.test(src.aura));
ok("B3 Change Shape is a Codex action; it re-equips what the last form took and unequips what this one loses", /draconicShifting, harmonize, changeShape(, lunaFrenzy)?(, heldAdvantage)?(, basicAction)?(, weaponStrike)?(, carrionFeast, sizeShift)?(, strikeBurst, sweepingStrike)?(, toggleEffect)? \}\);/.test(src.codex) && /"system\.equipped": lost\.includes\(i\.name\) \}\)\);\n  if \(back\.length\) await actor\.updateEmbeddedDocuments\("Item", back\);/.test(src.codex) && /"system\.equipped": \(form\.equips \?\? \[\]\)\.includes\(i\.name\) \}\)\);\n    if \(swap\.length\) await actor\.updateEmbeddedDocuments\("Item", swap\);/.test(src.codex));
ok("B4 the old form's effect goes before the new one is laid", /  await current\.delete\(\);\n  return priorTokenSize;\n\}/.test(src.codex) && /const priorTokenSize = await leaveCurrentForm\(actor\);\n  const \{ speedBase \} = await import/.test(src.codex));

ok("B5 the move's start is remembered per token and handed to the enter trigger", /const from = lastPlace\.get\(tokenDocument\.id\) \?\? null;\n    remember\(tokenDocument\);/.test(src.aura) && /await resolveAuras\(tokenDocument, "enter", \{ from \}\);/.test(src.aura) && /fromCentreFeet: from \? tokenCentreFeet\(from\) : null/.test(src.aura));

const EXPECTED = 12;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block6: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block6: ${checks} checks — all green.`);
