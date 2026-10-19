#!/usr/bin/env node
/**
 * verify-ff30-block20 — 3.653.0, Fiends & Fables 3.0 block 20 (the Manticore
 * to the Mummy; Graham, 16 October 2026: "Go with your recommendations").
 *
 *   R0a  a form sets aside named abilities, and gives them back (lycanthrope
 *        humanoid form)
 *   R2   an after-strike only when the Strike dealt damage (Snake Venom,
 *        Mummy Rot); an aura's ladder re-save at the aura's DC (the Medusa's
 *        Petrifying Gaze)
 *   R4   advantage on an Exhaustion check in Extreme Heat (Enduring Reserves)
 *   R6   a regeneration's printed amount (Regeneration 5 (Fire))
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
const imp = (...p) => import(pathToFileURL(path.join(SYSTEM_ROOT, "module", ...p)).href);

const CS = await imp("change-shape.mjs");
const DA = await imp("combat", "declared-after-strikes.mjs");
const TS = await imp("creature-turn-start.mjs");
const CAR = await imp("creature-ability-rules.mjs");

/* ---- R0a ---- */
const form = CS.changeShapeForms({ forms: [{ key: "humanoid", label: "Humanoid", suppresses: ["Scent", "Nightvision", " "], speeds: { fly: 0 } }, { key: "hybrid", own: true }] })[0];
equal("B1 a form's set-aside names are read, blanks dropped; its fly speed 0 is kept", [form.suppresses, form.speeds], [["Scent", "Nightvision"], { fly: 0 }]);
const items = [{ type: "ability", name: "Scent (35 ft.)" }, { type: "ability", name: "Nightvision (120 ft.)" }, { type: "ability", name: "Scenting Wind" },
  { type: "weapon", name: "Scent" }, { type: "feat", name: "Nightvision" }, { type: "ability", name: "Shift Form" }];
equal("B2 the named abilities and feats are found, with or without a bracket — not a lookalike, not a weapon",
  CS.suppressedItems(items, form.suppresses).map((i) => i.name), ["Scent (35 ft.)", "Nightvision (120 ft.)", "Nightvision"]);
equal("B3 nothing named, nothing set aside", CS.suppressedItems(items, []), []);
ok("B4 the card says what the form is without", /without Scent, Nightvision/.test(CS.changeShapeSummary(form, 30)));
{
  const e = CS.changeShapeEffectData(form, { baseLand: 30, baseSpeeds: { fly: 25 }, itemName: "Shift Form" });
  ok("B5 the form's fly speed comes off", e.changes.some((c) => c.key === "system.combat.movement.fly.other" && c.value === "-25"));
}

/* ---- R2 ---- */
const venom = DA.declaredAfterStrikes([{ flags: { "trg-prime": { afterStrikes: [{ key: "v", label: "Snake Venom", requiresDamage: true, expose: { affliction: "Snake Venom" } }] } } }])[0];
const struck = DA.declaredAfterStrikes([{ flags: { "trg-prime": { afterStrikes: [{ key: "p", label: "Paralytic Venom", expose: { affliction: "Paralytic Venom" } }] } } }])[0];
equal("B6 the venom only when the bite dealt damage; a struck-only venom either way",
  [DA.declaredAfterStrikeFires(venom, { damageTaken: 3 }), DA.declaredAfterStrikeFires(venom, { damageTaken: 0 }), DA.declaredAfterStrikeFires(venom, {}), DA.declaredAfterStrikeFires(struck, { damageTaken: 0 })],
  [true, false, false, true]);

/* ---- R4 ---- */
const camel = [{ name: "Enduring Reserves", flags: { "trg-prime": { creatureAbility: { derives: { heatExhaustionAdvantage: true } } } } }];
equal("B7 advantage in Extreme Heat only, and only with the ability",
  [CAR.heatExhaustionAdvantage(camel, "extremeHeat"), CAR.heatExhaustionAdvantage(camel, "extremeCold"), CAR.heatExhaustionAdvantage(camel, ""), CAR.heatExhaustionAdvantage([], "extremeHeat")],
  ["Enduring Reserves", null, null, null]);

/* ---- R6 ---- */
const regen = (t) => [{ name: "Regeneration", flags: { "trg-prime": { creatureAbility: { derives: { turnStart: { kind: "regeneration", auto: true, ...t } } } } } }];
equal("B8 a printed amount wins over the level; none, a zero or junk heals the level",
  [TS.turnStartAnnouncements(regen({ amount: 5 }), 6)[0].amount, TS.turnStartAnnouncements(regen({}), 6)[0].amount, TS.turnStartAnnouncements(regen({ amount: 0 }), 6)[0].amount, TS.turnStartAnnouncements(regen({ amount: "x" }), 6)[0].amount],
  [5, 6, 6, 6]);
ok("B9 the card says which", /\(as printed\)/.test(TS.turnStartAnnouncements(regen({ amount: 5 }), 6)[0].lines[0]) && /\(level 6\)/.test(TS.turnStartAnnouncements(regen({}), 6)[0].lines[0]));

/* ---- source ---- */
const src = { cw: read("module", "codex-actions-workflow.mjs"), aw: read("module", "creature-aura-workflow.mjs"), ex: read("module", "combat", "exhaustion-workflow.mjs") };
ok("S1 entering a form keeps what it sets aside on the effect, then takes it off the creature",
  /const aside = suppressedItems\(actor\.items, form\.suppresses\);\n\s+if \(aside\.length\) data\.flags\[SYSTEM_ID\]\[CHANGE_SHAPE_FLAG\]\.stashed = aside\.map\(\(i\) => i\.toObject\(\)\);\n\s+await actor\.createEmbeddedDocuments\("ActiveEffect", \[data\]\);\n\s+if \(aside\.length\) await actor\.deleteEmbeddedDocuments\("Item", aside\.map\(\(i\) => i\.id\)\);/.test(src.cw));
ok("S2 leaving it gives them back — cleared from the effect first, made with their own ids, none twice",
  /await restoreStashedItems\(actor, current\);\n[\s\S]{0,200}?await current\.update\(\{ \[`flags\.\$\{SYSTEM_ID\}\.\$\{CHANGE_SHAPE_FLAG\}\.left`\]: true \}\);\n  await current\.delete\(\);/.test(src.cw)
  && /await effect\.update\(\{ \[`flags\.\$\{SYSTEM_ID\}\.\$\{CHANGE_SHAPE_FLAG\}\.stashed`\]: \[\] \}\);/.test(src.cw)
  && /const missing = stashed\.filter\(\(d\) => !actor\.items\?\.get\?\.\(d\._id\)\);\n\s+if \(missing\.length\) await actor\.createEmbeddedDocuments\("Item", missing, \{ keepId: true \}\);/.test(src.cw));
ok("S3 a form's effect removed by hand gives them back too",
  /Hooks\.on\("deleteActiveEffect", async \(effect\) => \{[\s\S]{0,400}?if \(Array\.isArray\(stashed\) && stashed\.length\) await restoreStashedItems\(actor, effect\);/.test(src.cw));
ok("S4 an aura's ladder re-save is made at the aura's DC", /: tag\.conditionSave \? \{ \.\.\.tag, conditionSave: \{ save, label: aura\.name, \.\.\.tag\.conditionSave, saveDC: dc \} \} : tag\)\);/.test(src.aw));
ok("S5 the Exhaustion check rolls with advantage in natural heat", /const heatAdvantage = heatExhaustionAdvantage\(Array\.from\(actor\.items \?\? \[\]\), environment\);\n\s+const check = await TRGCheck\.roll\(\{\n\s+\.\.\.\(heatAdvantage \? \{ bias: "advantage" \} : \{\}\),/.test(src.ex));

// 3.653.1 — found live testing 3.653.0.
const ck = read("module", "dice", "check.mjs"), cs = read("module", "magic", "condition-save-workflow.mjs");
ok("S6 a save or skill check with no modifiers rolls the creature's own (the escape save rolled a bare die)",
  /if \(config\?\.actor && !Array\.isArray\(config\.modifiers\) && \(config\.type === "save" \|\| config\.type === "skill"\)\) \{\n\s+config = withCheckModifiers\(config\);/.test(ck)
  && /modifiers: \[\.\.\.saveRowsFor\(actor, spec\.save\), \{ label: spec\.label, value: spec\.modifier/.test(cs));
ok("S7 a form removed by hand gives back its Strikes and its space; one left normally is skipped",
  /if \(!was \|\| was\.left\) return;/.test(src.cw)
  && /\.map\(\(i\) => \(\{ _id: i\.id, "system\.equipped": lost\.includes\(i\.name\) \}\)\);\n\s+if \(back\.length\) await actor\.updateEmbeddedDocuments\("Item", back\);\n\s+if \(Number\(was\.priorTokenSize\) > 0\) await resizeActorTokens\(actor, Number\(was\.priorTokenSize\)\);\n  \}\);/.test(src.cw));
ok("S8 a permanent condition clears Foundry 14's duration value", /"duration\.value": null\n\s+\}\);\n\s+lines\.push\(`<strong>\$\{spec\.label\}<\/strong> — \$\{actor\.name\} fumbles/.test(cs));

const EXPECTED = 18;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block20: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block20: ${checks} checks\n  all pass\n`);
