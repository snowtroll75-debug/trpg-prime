#!/usr/bin/env node
/**
 * verify-ff30-block21 — 3.654.0, Fiends & Fables 3.0 block 21 (the Mystaron
 * to the Ochre Jelly; Graham, 16 October 2026: "Go with your recommendations").
 *
 *   R7   an after-strike that offers a choice of spells cast at the struck
 *        creature (the Fancalia's Enchanting Touch)
 *   R8   a damage packet's type to use instead against a creature immune to
 *        it (the Somnichan's Dream Weave Breath: mental, else force)
 *   R9   a creature's own jump price, provoking nothing (Ether Leap); a second
 *        Constrict packet (the Ochre Jelly's "plus 1d6 acid")
 *   R10  regeneration the GM presses (the Nightray's "Moonlight only")
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

const DA = await imp("combat", "declared-after-strikes.mjs");
const PE = await imp("peril-effect.mjs");
const CAR = await imp("creature-ability-rules.mjs");
const CR = await imp("codex-action-rules.mjs");
const TS = await imp("creature-turn-start.mjs");

/* ---- R7 ---- */
const touch = DA.declaredAfterStrikes([{ flags: { "trg-prime": { afterStrikes: [{ key: "e", label: "Enchanting Touch", onCritical: true, castChoice: { spells: ["Sleep", " ", "Hold Kind", "Confusion"], dc: "25" } }] } } }])[0];
equal("B1 the choice of spells is read, blanks dropped, the DC a number", touch?.castChoice, { spells: ["Sleep", "Hold Kind", "Confusion"], dc: 25 });
equal("B2 a choice alone is an after-strike; an empty one is nothing",
  [Boolean(touch), DA.declaredAfterStrikes([{ flags: { "trg-prime": { afterStrikes: [{ key: "x", label: "X", castChoice: { spells: [" "], dc: 25 } }] } } }]).length],
  [true, 0]);
equal("B3 only on a critical", [DA.declaredAfterStrikeFires(touch, { critical: true }), DA.declaredAfterStrikeFires(touch, { critical: false })], [true, false]);

/* ---- R8 ---- */
const breath = { type: "mental", ifImmune: "force" };
equal("B4 mental to the rest, force to the mentally immune; no swap declared, no change",
  [PE.damageTypeAgainst(breath, ["poison"]), PE.damageTypeAgainst(breath, new Set(["Mental"])), PE.damageTypeAgainst({ type: "mental" }, ["mental"]), PE.damageTypeAgainst(breath, [])],
  ["mental", "force", "mental", "mental"]);
ok("B5 the swap survives the area's normalising", PE.perilEffectSpec({ save: "will", basic: true, damage: { formula: "20d10", type: "mental", ifImmune: "force" } })?.damage?.ifImmune === "force");

/* ---- R9 ---- */
const leap = [{ name: "Ether Leap", flags: { "trg-prime": { creatureAbility: { derives: { jump: { ap: 1, noProvoke: true } } } } } }];
equal("B6 Ether Leap's jump: 1 AP, provoking nothing; none declared, none",
  [CAR.abilityJump(leap), CAR.abilityJump([]), CAR.abilityJump([{ name: "X", flags: { "trg-prime": { creatureAbility: { derives: { jump: { ap: "x" } } } } } }])],
  [{ ap: 1, noProvoke: true, source: "Ether Leap" }, null, null]);
equal("B7 Constrict's further packets, junk dropped",
  CR.constrictExtraPackets({ extraDamage: [{ dice: "1d6", type: "Acid" }, { dice: "lots", type: "fire" }, { dice: "1d4", type: "" }] }), [{ dice: "1d6", type: "acid" }]);
equal("B8 none declared, none", [CR.constrictExtraPackets({}), CR.constrictExtraPackets(null)], [[], []]);

/* ---- R10 ---- */
const moon = TS.turnStartAnnouncements([{ name: "Regeneration 8 (Moonlight only)", flags: { "trg-prime": { creatureAbility: { derives: { turnStart: { kind: "regeneration", auto: false, condition: "Only in moonlight." } } } } } }], 8)[0];
equal("B9 the regeneration's stated condition and amount reach the card", [moon?.amount, moon?.condition], [8, "Only in moonlight."]);
ok("B10 no condition stated, none printed", !("condition" in TS.turnStartAnnouncements([{ name: "R", flags: { "trg-prime": { creatureAbility: { derives: { turnStart: { kind: "regeneration" } } } } } }], 8)[0]));

/* ---- source ---- */
const src = { pw: read("module", "peril-workflow.mjs"), cw: read("module", "codex-actions-workflow.mjs"), daw: read("module", "combat", "declared-after-strikes-workflow.mjs"),
  aw: read("module", "combat", "action-workflow.mjs"), mw: read("module", "combat", "movement-workflow.mjs"), tw: read("module", "creature-turn-start-workflow.mjs") };
ok("S1 an area's damage is dealt as the type the creature is not immune to, and the card says so",
  /const takenType = damageTypeAgainst\(spec\.damage, actorDefences\(actor\.system \?\? \{\}, ownedCreatureTypeSystem\(actor\)\)\.immunities\);\n\s+if \(takenType !== spec\.damage\.type\) parts\.push\(`Immune to/.test(src.pw)
  && /applyTypedDamage\(actor, \{ amount, type: takenType, /.test(src.pw));
ok("S2 Constrict rolls each further packet under the same save, and its card names them",
  /for \(const extra of constrictExtraPackets\(spec\)\) \{\n\s+const xr = await new Roll\(extra\.dice\)\.evaluate\(\);\n\s+const xAmount = Math\.floor\(xr\.total \* bs\.damageMultiplier\);/.test(src.cw)
  && /applyTypedDamage\(target, \{ amount: xAmount, type: extra\.type,/.test(src.cw)
  && /\$\{constrictExtraPackets\(spec\)\.map\(\(x\) => ` plus <strong>/.test(src.cw));
ok("S3 the choice is offered after the strike, and the spell released free at the printed DC",
  /if \(spec\.castChoice\) lines\.push\(\.\.\.await castChoiceFromStrike\(actor, targetActor, spec\)\);/.test(src.daw)
  && /await releaseItemSpell\(actor, holder, \{[^}]*\}, \{\n\s+data: source, apPaid: true, presetTargets: Boolean\(token\), fixedDC: dc \|\| null/.test(src.daw)
  && /source\.system\.components = \{ somatic: false, verbal: false, material: false, focus: false \};/.test(src.daw));
ok("S4 a creature's own jump sets the AP, skips the +2 trade, and leaves its move unprovoking",
  /const ownJump = \["highJump", "longJump"\]\.includes\(action\.key\) \? abilityJump\(Array\.from\(actor\.items \?\? \[\]\)\) : null;\n\s+if \(ownJump\) effectiveApCost = String\(ownJump\.ap\);/.test(src.aw)
  && /if \(hasTradeoffs\(action\.key\) && !ownJump && !skipDialog\(event\)\) \{/.test(src.aw)
  && /if \(ownJump\?\.noProvoke && game\.combat\?\.started\) await actor\.setFlag\(SYSTEM_ID, "jumpReactionsAvoided", true\);/.test(src.aw)
  && /const jumpAvoided = Boolean\(actor\?\.getFlag\?\.\(SYSTEM_ID, "jumpReactionsAvoided"\)\);\n\s+if \(jumpAvoided\) actor\?\.unsetFlag/.test(src.mw)
  && /const moverImmune = jumpAvoided (?:\|\| firstFree )?\|\| Boolean\(/.test(src.mw));
ok("S5 a regeneration that is not automatic carries a button that heals once",
  /const regenButton = a\.kind === "regeneration" && a\.amount > 0;/.test(src.tw)
  && /\(regenButton \? `<button type="button" data-trg-regenerate>/.test(src.tw)
  && /if \(!spec \|\| spec\.used\) \{ button\.disabled = true; return; \}[\s\S]{0,400}?await message\.setFlag\(SYSTEM_ID, "regenerate", \{ \.\.\.spec, used: true \}\);\n\s+const \{ healActor \}/.test(src.tw)
  && /html\.querySelector\?\.\("\[data-trg-regenerate\]"\)/.test(src.tw));

const EXPECTED = 16;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block21: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block21: ${checks} checks\n  all pass\n`);
