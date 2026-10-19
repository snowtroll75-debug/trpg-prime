#!/usr/bin/env node
/**
 * verify-ff30-block19 — 3.652.0, Fiends & Fables 3.0 block 19 (the Lizards
 * to the Werewolf; Graham, 16 October 2026: "Go with your recommendations").
 *
 *   R4   a Strike that only grabs (the Giant Chameleon's Tongue)
 *   R5   Stealthy Strike with its dice in the name ("Stealthy Strike (2d6)")
 *   R6   Shift Form: one step at a time, an Easy Meditation check that sets
 *        the AP, a Failure that changes nothing, a Fumble that brings Luna
 *        Frenzy
 *   R7   Luna Frenzy: a size larger, Intelligence -5 (min -5), confused and
 *        raging; the delay check one step harder each time
 *   R8   an after-strike only on a target left Bleeding (the Lycanthropic
 *        Curse)
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

const GO = await imp("combat", "grab-only.mjs");
const ROG = await imp("rogue.mjs");
const LY = await imp("lycanthrope.mjs");
const CS = await imp("change-shape.mjs");
const DA = await imp("combat", "declared-after-strikes.mjs");

/* ---- R4 ---- */
equal("B1 a grab-only Strike is read off the weapon; nothing else is",
  [GO.isGrabOnly({ flags: { "trg-prime": { creatureAttack: { grabOnly: true } } } }), GO.isGrabOnly({ flags: { "trg-prime": { creatureAttack: { onlyGrabbedBySelf: true } } } }), GO.isGrabOnly(null)],
  [true, false, false]);
ok("B2 its card says the target is Grabbed and takes no damage", /Grabbed<\/strong> by Chameleon — the Tongue deals no damage and a critical inflicts no injury/.test(GO.grabOnlyLine("Chameleon", "Scout", "Tongue", true)));

/* ---- R5 ---- */
const feat = (name, type = "feat") => ({ type, name });
equal("B3 Stealthy Strike with a bracket is Stealthy Strike; a lookalike is not",
  [ROG.hasSneakDice({ items: [feat("Stealthy Strike (2d6)")] }), ROG.hasSneakDice({ items: [feat("Stealthy Strike")] }), ROG.hasSneakDice({ items: [feat("Stealthy Striker")] }), ROG.hasSneakDice({ items: [feat("Stealthy Strike (2d6)", "weapon")] })],
  [true, true, false, false]);
equal("B4 the printed dice are the dice; without them, the Stealth ladder; Sneak Attack's own ladder wins",
  [ROG.sneakDiceFor({ items: [feat("Stealthy Strike (2d6)")] }, 0), ROG.sneakDiceFor({ items: [feat("Stealthy Strike (1d6)")] }, 9),
    ROG.sneakDiceFor({ items: [feat("Stealthy Strike")] }, 6), ROG.sneakDiceFor({ items: [feat("Stealthy Strike (2d6)"), feat("Sneak Attack", "ability")] }, 0),
    ROG.sneakDiceFor({ items: [feat("Stealthy Strike (see text)")] }, 3)],
  [2, 1, 3, 1, 2]);

/* ---- R6 ---- */
const forms = CS.changeShapeForms({ forms: [{ key: "humanoid", label: "Humanoid", loses: ["Bite", "Claw"] }, { key: "hybrid", label: "Hybrid", own: true }, { key: "animal", label: "Animal" }] });
equal("B5 one step at a time: humanoid and animal reach only hybrid, hybrid reaches both; without oneStep every other",
  [LY.reachableForms(forms, "humanoid", true).map((f) => f.key), LY.reachableForms(forms, "hybrid", true).map((f) => f.key), LY.reachableForms(forms, "animal", true).map((f) => f.key), LY.reachableForms(forms, "humanoid", false).map((f) => f.key)],
  [["hybrid"], ["humanoid", "animal"], ["hybrid"], ["hybrid", "animal"]]);
const check = LY.shiftCheckSpec({ skill: "meditation", difficulty: "easy", ap: { critical: 1, success: 2, partial: 3, failure: 3, fumble: 3 }, noChange: ["failure"], frenzy: ["fumble"] });
equal("B6 the Easy check is DC -2", [check.difficulty, LY.levelCheckDC(18, "easy"), LY.levelCheckDC(18, "veryEasy"), LY.levelCheckDC(18, "hard")], ["easy", 16, 13, 20]);
equal("B7 the ladder: Critical 1, Success 2, Partial 3, Failure 3 and no change, Fumble 3 then Luna Frenzy; Heroic and Blunder fold in",
  ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"].map((d) => { const o = LY.shiftOutcome(check, d); return `${o.ap}${o.changes ? "" : "x"}${o.frenzy ? "F" : ""}`; }),
  ["1", "1", "2", "3", "3x", "3F", "3F"]);
equal("B8 a humanoid form loses the natural Strikes; the hybrid lays nothing", [CS.changeShapeEffectData(forms[0], { itemName: "Shift Form" })?.flags?.["trg-prime"]?.changeShapeForm?.loses, CS.changeShapeEffectData(forms[1], {})], [["Bite", "Claw"], null]);

/* ---- R7 ---- */
const lf = LY.lunaFrenzySpec({ sizeSteps: 1, intPenalty: -5, intMinimum: -5, delay: { skill: "mentalFocus", difficulty: "veryEasy", criticalSeconds: 3600, successSeconds: 600 } });
equal("B9 a size larger, clamped at the ends", [LY.steppedSize("medium", 1), LY.steppedSize("large", 1), LY.steppedSize("colossal", 1), LY.steppedSize("", 1)], ["large", "huge", "colossal", ""]);
equal("B10 Intelligence -5, never below -5, never raised", [1, 0, -2, -5, -6].map((i) => LY.frenzyIntelligenceDelta(i, -5, -5)), [-5, -5, -3, 0, 0]);
{
  const e = LY.lunaFrenzyEffectData(lf, { ownSize: "medium", intelligence: 1 });
  equal("B11 the frenzy's effect: Large and Intelligence -5 (racial)", e.changes.map((c) => `${c.key}=${c.value}`), ["system.identity.size=large", "system.attributes.intelligence.racial=-5"]);
  ok("B12 it is marked as the frenzy, and read as one", e.flags["trg-prime"][LY.LUNA_FRENZY_FLAG].size === "large" && LY.inLunaFrenzy([e]) && !LY.inLunaFrenzy([{ ...e, disabled: true }]) && !LY.inLunaFrenzy([]));
}
equal("B13 the delay: Very Easy, then a step harder each time it held",
  [0, 1, 2, 3].map((n) => LY.lunaDelayDifficulty(lf.delay.difficulty, n)), ["veryEasy", "easy", "medium", "hard"]);
equal("B14 an hour on a Critical, ten minutes on a Success, none below",
  ["heroic", "critical", "success", "partial", "failure", "fumble"].map((d) => LY.lunaDelaySeconds(lf, d)), [3600, 3600, 600, 0, 0, 0]);

/* ---- R8 ---- */
const curse = DA.declaredAfterStrikes([{ flags: { "trg-prime": { afterStrikes: [{ key: "lycanthropic-curse", label: "Lycanthropic Curse", onCriticalInjury: true, targetTypes: ["humanoid"], requiresTargetCondition: ["bleeding"], expose: { affliction: "Lycanthropic Curse", level: "actorLevel" } }] } } }])[0];
equal("B15 the curse: a humanoid left Bleeding by the critical, and nobody else",
  [DA.declaredAfterStrikeFires(curse, { critical: "serious", targetTypes: ["humanoid"], targetConditions: ["bleeding"] }),
    DA.declaredAfterStrikeFires(curse, { critical: "serious", targetTypes: ["humanoid"], targetConditions: ["prone"] }),
    DA.declaredAfterStrikeFires(curse, { critical: null, targetTypes: ["humanoid"], targetConditions: ["bleeding"] }),
    DA.declaredAfterStrikeFires(curse, { critical: "minor", targetTypes: ["animal"], targetConditions: ["bleeding"] }),
    DA.declaredAfterStrikeFires(curse, { critical: "minor", criticalImmune: true, targetTypes: ["humanoid"], targetConditions: ["bleeding"] })],
  [true, false, false, false, false]);

/* ---- source ---- */
const src = { atk: read("module", "combat", "attack-workflow.mjs"), cw: read("module", "codex-actions-workflow.mjs"), dasw: read("module", "combat", "declared-after-strikes-workflow.mjs") };
ok("S1 a grab-only hit Grabs, marks who holds it, and rolls neither injury nor damage",
  /if \(grabOnly && outcome\.hits && targetActor\) \{\n\s+await applyConditionTags\(targetActor, \[\{ key: "grabbed", label: "Grabbed" \}\], \{\}\);\n\s+if \(targetActor\.setFlag\) await targetActor\.setFlag\(SYSTEM_ID, "grabbedBy"/.test(src.atk)
  && /const strikeLands = !grabOnly && !hitCondition && !spellCarried;/.test(src.atk)
  && /if \(strikeLands && outcome\.critical && !outcome\.critical\.injuryImmune && targetActor\) \{/.test(src.atk)
  && /if \(strikeLands && outcome\.critical && !outcome\.critical\.injuryImmune && !injuryReplaced\) \{/.test(src.atk)
  && /if \(outcome\.hits && strikeLands\) \{/.test(src.atk));
ok("S2 both Stealthy Strike dice sites read the printed dice",
  /sneakDice = sneakDiceFor\(actor, system\.skills\?\.stealth\?\.ranks \?\? 0\);/.test(src.atk) && /\? sneakDiceFor\(actor, actor\.system\?\.skills\?\.stealth\?\.ranks \?\? 0\)/.test(src.atk));
ok("S3 Shift Form offers only the neighbouring forms, refuses in a frenzy, and spends the degree's AP",
  /const choices = reachableForms\(forms, currentKey, spec\.oneStep === true\);/.test(src.cw)
  && /buttons: choices\.map\(\(f, i\) =>/.test(src.cw)
  && /if \(inLunaFrenzy\(actor\.effects\)\) \{ ui\.notifications\?\.warn/.test(src.cw)
  && /if \(!\(await spendAp\(actor, shift\.ap, item\.name\)\)\) \{/.test(src.cw));
ok("S4 a Failure stops before the change; a Fumble brings the frenzy after it",
  /if \(!shift\.changes\) \{\n\s+await card\(actor, item\.name, \[line\(`\$\{shift\.label\} against DC \$\{shift\.dc\}: \$\{actor\.name\} expends/.test(src.cw)
  && /if \(shift\?\.frenzy\) \{\n\s+const frenzyItem = /.test(src.cw)
  && /if \(frenzyItem\) await enterLunaFrenzy\(actor, frenzyItem,/.test(src.cw));
ok("S5 the frenzy forces the hybrid form, lays its effect, and rages confused with no minute on it",
  /async function enterLunaFrenzy\(actor, item, rawSpec, why = ""\) \{[\s\S]*?const priorTokenSize = await leaveCurrentForm\(actor\);[\s\S]*?await actor\.createEmbeddedDocuments\("ActiveEffect", \[effect\]\);[\s\S]*?await beginRage\(actor, \{ degree: "success", confused: true \}\);[\s\S]*?endsAtWorldTime: null, endsOnRound: null, mustRideOut: true, lunaFrenzy: true/.test(src.cw)
  && /lunaFrenzy, heldAdvantage,/.test(src.cw));
ok("S6 a successful delay is counted, so the next is harder; a failed one lets the frenzy in",
  /await actor\.setFlag\(SYSTEM_ID, LUNA_DELAY_FLAG, \{ count: prior \+ 1, until: now\(\) \+ seconds \}\);/.test(src.cw)
  && /const difficulty = lunaDelayDifficulty\(spec\.delay\.difficulty, prior\);/.test(src.cw)
  && /await enterLunaFrenzy\(actor, item, rawSpec, `\$\{name\} \$\{label\} against DC \$\{dc\}`\);/.test(src.cw));
ok("S7 the full moon's end removes the frenzy, ends its rage, and gives the token its size back",
  /async function endLunaFrenzy\(actor, item\) \{[\s\S]*?deleteEmbeddedDocuments\("ActiveEffect"[\s\S]*?if \(prior > 0\) await resizeActorTokens\(actor, prior\);[\s\S]*?if \(isRaging\(actor\)\) ended = await endRage\(actor, \{ fatigue: 1 \}\);/.test(src.cw));
ok("S8 the after-strike reads the target's conditions after the injury", /targetConditions: specs\.some\(\(s\) => s\.requiresTargetCondition\?\.length\)\n\s+\? Array\.from\(targetActor\.effects \?\? \[\]\)\.filter\(\(e\) => !e\.disabled\)\.flatMap\(\(e\) => Array\.from\(e\.statuses \?\? \[\]\)\)/.test(src.dasw));

const mv = read("module", "combat", "movement-workflow.mjs");
ok("S9 a resize is not a move: marked for its own update, let through uncharged, written as a displacement (3.652.1)",
  /function onPreMoveToken\(tokenDocument, movement\) \{\n  if \(RESIZING\.has\(tokenDocument\?\.id\)\) return true;/.test(mv)
  && /RESIZING\.add\(tokenDocument\.id\);\n  try \{\n    await tokenDocument\.update\(\{ width: side, height: side \}, \{\n      movement: \{ \[tokenDocument\.id\]: \{ method: "api", waypoints: \[\{ x: tokenDocument\.x, y: tokenDocument\.y, width: side, height: side, action: "displace" \}\] \} \}\n    \}\);\n  \} finally \{\n    RESIZING\.delete\(tokenDocument\.id\);/.test(mv)
  && /if \(doc\?\.update\) await resizeTokenInPlace\(doc, side\);/.test(src.cw));
ok("S10 the frenzy's rage has no minute on it — Foundry 14's duration value cleared (3.652.1)", /await rage\.update\(\{ "duration\.value": null, /.test(src.cw));
ok("S11 the frenzy's way back is the creature's own footprint, not a width read mid-animation (3.652.1)", /\[LUNA_FRENZY_FLAG\]\.priorTokenSize = Number\(priorTokenSize\) \|\| Number\(SIZE_FOOTPRINT\?\.\[ownSize\.toLowerCase\(\)\]\)/.test(src.cw));

const EXPECTED = 27;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block19: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block19: ${checks} checks\n  all pass\n`);
