#!/usr/bin/env node
/**
 * verify-ff30-block17 — 3.650.0, Fiends & Fables 3.0 block 17 (the Glimmerwick
 * to the Gryphon; Graham, 15 October 2026: "Okay please implement").
 *
 *   R3  lingering area damage (the Iron Golem's breath)
 *   R4  an area's PP cost; a condition save with a Partial that holds and a
 *       Fumble that is permanent (the Gorgon's Petrifying Breath)
 *   R5  immunity on chosen rungs; a rung's timed penalty; the melee/ranged
 *       conditional axis (Irritating Glamour)
 *   R6  a toggled effect carrying a light and offered bonuses (Luminous Aura)
 *   R7  a reaction move offered on a miss (Gleam-Dart Escape)
 *   R8  a critical's injury traded for a lesser effect; a pending modifier
 *       that waits for one kind of check (Prankster's Cruelty)
 *   R9  a reaction move offered when a creature ends a move adjacent
 *       (Nimble Escape)
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

const CR = await imp("creature-reactions.mjs");
const LD = await imp("magic", "lingering-damage.mjs");
const CS = await imp("magic", "condition-save.mjs");
const CN = await imp("conditionals.mjs");
const DA = await imp("combat", "declared-after-strikes.mjs");
const LS = await imp("light-sources.mjs");

/* ---- R5: the melee/ranged axis ---- */
const ranged = CN.normaliseConditional({ kind: "modifier", value: -1, type: "circumstance", label: "Glamour", auto: true,
  when: { checkTypes: ["attack"], attackModes: ["ranged"] } }, {}, 0);
equal("B1 a ranged-attack penalty meets a ranged attack, not a melee one or a save",
  [CN.matchesCheck(ranged, { checkType: "attack", attackMode: "ranged" }),
    CN.matchesCheck(ranged, { checkType: "attack", attackMode: "melee" }),
    CN.matchesCheck(ranged, { checkType: "save", subject: "will" })],
  [true, false, false]);
const notRanged = CN.normaliseConditional({ kind: "modifier", value: 1, type: "status", label: "N", always: true,
  when: { not: { attackModes: ["ranged"] } } }, {}, 0);
equal("B2 the axis can be excluded",
  [CN.matchesCheck(notRanged, { checkType: "attack", attackMode: "ranged" }), CN.matchesCheck(notRanged, { checkType: "attack", attackMode: "melee" })],
  [false, true]);

/* ---- R4: the Gorgon's ladder ---- */
const gorgon = CS.normaliseConditionSave({ save: "fortitude", condition: "petrified", onSuccess: "end", partialHolds: true, fumblePermanent: true });
const plain = CS.normaliseConditionSave({ save: "fortitude", condition: "petrified", onSuccess: "end" });
equal("B3 the options survive normalising, and only when set",
  [gorgon?.partialHolds, gorgon?.fumblePermanent, plain?.partialHolds, plain?.fumblePermanent],
  [true, true, undefined, undefined]);
equal("B4 the Gorgon's re-save: Critical and Success end it, Partial and Failure hold, Fumble and Blunder make it permanent",
  ["critical", "success", "partial", "failure", "fumble", "blunder"].map((d) => {
    const o = CS.conditionSaveOutcome(gorgon, d);
    return o.permanent ? "permanent" : o.ends ? "ends" : "holds";
  }),
  ["ends", "ends", "holds", "holds", "permanent", "permanent"]);
equal("B5 without the options a Partial still ends it and a Fumble is no worse than a failure",
  [CS.conditionSaveOutcome(plain, "partial").ends, Boolean(CS.conditionSaveOutcome(plain, "fumble").permanent)],
  [true, false]);
equal("B6 a rung's condition carries its escape save to the applier",
  DA.declaredConditionTag({ key: "petrified", minutes: 1, conditionSave: { save: "fortitude", condition: "petrified", onSuccess: "end" } }, { combatRound: 3, worldTime: 100 }),
  { key: "petrified", value: null, expiresTime: 160, resave: false, conditionSave: { save: "fortitude", condition: "petrified", onSuccess: "end" } });

/* ---- R3: lingering damage ---- */
const rec = LD.lingeringRecord({ label: "Breath", amount: 22.7, type: "Poison", save: "Fortitude", dc: 28, rounds: 4, sourceName: "Iron Golem", sourceLevel: 18 });
equal("B7 the record keeps the breath's own roll, its type, the basic save and four rounds",
  rec, { label: "Breath", amount: 22, type: "poison", save: "fortitude", dc: 28, basic: true, roundsLeft: 4, sourceName: "Iron Golem", sourceLevel: 18 });
equal("B8 nothing to record without damage, rounds, a save or a type",
  [LD.lingeringRecord({ amount: 0, type: "poison", save: "fortitude", rounds: 4 }), LD.lingeringRecord({ amount: 5, type: "poison", save: "fortitude", rounds: 0 }),
    LD.lingeringRecord({ amount: 5, type: "poison", save: "luck", rounds: 4 }), LD.lingeringRecord({ amount: 5, type: "", save: "fortitude", rounds: 4 })],
  [null, null, null, null]);
equal("B9 a turn that dealt damage spends a round; the last round, or a turn of nothing, ends it",
  [LD.lingeringAfterTurn(rec, 11)?.roundsLeft, LD.lingeringAfterTurn({ ...rec, roundsLeft: 1 }, 11), LD.lingeringAfterTurn(rec, 0)],
  [3, null, null]);

/* ---- R7, R9: reaction moves ---- */
const glimmer = [
  { name: "Gleam-Dart Escape", flags: { "trg-prime": { creatureAbility: { reactionMove: { trigger: "missed", feet: 10, speedKey: "fly", requiresEffect: "Luminous Aura" } } } } },
  { name: "Nimble Escape", flags: { "trg-prime": { creatureAbility: { reactionMove: { trigger: "adjacent", feet: 5 } } } } },
  { name: "Junk", flags: { "trg-prime": { creatureAbility: { reactionMove: { trigger: "whenever", feet: 5 } } } } }
];
equal("B10 the miss reaction: 10 feet of Fly, no reactions, needing the aura",
  CR.reactionMovesOf(glimmer, "missed").map((m) => m.spec),
  [{ trigger: "missed", feet: 10, speedKey: "fly", provokes: false, requiresEffect: "Luminous Aura", label: "Gleam-Dart Escape" }]);
equal("B11 the adjacency reaction: a 5-foot land step; an unknown trigger or no feet is nothing",
  [CR.reactionMovesOf(glimmer, "adjacent").map((m) => [m.spec.feet, m.spec.speedKey, m.spec.label]),
    CR.reactionMovesOf([{ flags: { "trg-prime": { creatureAbility: { reactionMove: { trigger: "missed", feet: 0 } } } } }], "missed"),
    CR.reactionMovesOf(glimmer, "whenever")],
  [[[5, "land", "Nimble Escape"]], [], []]);
equal("B12 the aura must be on, and not disabled; no requirement is always met",
  [CR.requiredEffectOn([{ name: "Luminous Aura" }], "Luminous Aura"), CR.requiredEffectOn([{ name: "Luminous Aura", disabled: true }], "Luminous Aura"),
    CR.requiredEffectOn([], "Luminous Aura"), CR.requiredEffectOn([], "")],
  [true, false, false, true]);
equal("B13 the leg it arms costs nothing and provokes nothing",
  CR.reactionMoveLeg({ speedKey: "fly", feet: 10, provokes: false, label: "Gleam-Dart Escape" }),
  { speedKey: "fly", maxFeet: 10, provokes: false, label: "Gleam-Dart Escape" });

/* ---- R8: the critical replacement ---- */
const prank = [{ name: "Prankster's Cruelty", flags: { "trg-prime": { creatureAbility: { criticalReplacement: {
  weapons: ["Needleblade", "Acorn Toss"], options: ["dropObject", "flatFooted", "nextAttackPenalty", "explode"], penalty: -2 } } } } }];
equal("B14 offered for the named weapons only, with the known options",
  [CR.criticalReplacementFor(prank, "needleblade"), CR.criticalReplacementFor(prank, "Claw")],
  [{ label: "Prankster's Cruelty", options: ["dropObject", "flatFooted", "nextAttackPenalty"], penalty: -2 }, null]);

/* ---- R6: the toggle ---- */
equal("B15 the toggled effect carries its light, its offered bonuses and its maker",
  CR.toggledEffectData({ name: "Luminous Aura", img: "x.svg" }, { lightSource: "luminous-aura",
    conditionals: [{ kind: "modifier", value: 2, type: "racial", label: "Luminous Aura", when: { subjects: ["deception", "perform"] } }] }),
  { name: "Luminous Aura", img: "x.svg", flags: { "trg-prime": { toggledBy: "Luminous Aura", lightSource: "luminous-aura",
    conditionals: [{ kind: "modifier", value: 2, type: "racial", label: "Luminous Aura", when: { subjects: ["deception", "perform"] } }] } } });
const aura = LS.LIGHT_SOURCES["luminous-aura"];
equal("B16 Luminous Aura is a magical one-step light of 10 feet with no cap",
  [aura?.steps, aura?.cap, aura?.magical, aura?.radiusFeet, aura?.creature, LS.applyLightSource(4, "luminous-aura")],
  [1, null, true, 10, true, 5]);

/* ---- the wiring ---- */
const src = {
  chk: read("module", "dice", "check.mjs"),
  dlg: read("module", "apps", "check-dialog.mjs"),
  pend: read("module", "pending-modifiers.mjs"),
  atk: read("module", "combat", "attack-workflow.mjs"),
  peril: read("module", "peril-workflow.mjs"),
  act: read("module", "creature-activation-workflow.mjs"),
  cbt: read("module", "documents", "combat.mjs"),
  mv: read("module", "combat", "movement-workflow.mjs"),
  boot: read("scripts", "trg-prime.mjs"),
  cw: read("module", "codex-actions-workflow.mjs"),
  csw: read("module", "magic", "condition-save-workflow.mjs"),
  crw: read("module", "creature-reactions-workflow.mjs")
};
ok("S1 a check knows whether its attack is melee or ranged, and conditionals are asked with it",
  /this\.attackMode = config\.attackMode \?\? "";/.test(src.chk) && /attackMode: check\.attackMode/.test(src.chk)
  && /attackMode: isRanged \? "ranged" : "melee",/.test(src.atk));
ok("S2 a pending row scoped to a kind of check is applied only to that kind, and only pre-ticked for it",
  /row\.checkTypes\.includes\(check\.type\)\)\s*&& pendingFitsCheck\(row, check\.actionKey \?\? ""\)\);/.test(src.chk)
  && /entry\.auto && \(!entry\.checkTypes\?\.length \|\| entry\.checkTypes\.includes\(checkType\)\)/.test(src.dlg)
  && /if \(Array\.isArray\(entry\?\.checkTypes\) && entry\.checkTypes\.length\) record\.checkTypes =/.test(src.pend));
ok("S3 immunity is granted only on the listed rungs",
  /\(!immunityRungs \|\| immunityRungs\.includes\(key\)\)/.test(src.peril));
ok("S4 a rung's penalties are laid as conditionals on their own clock",
  /const penaltyRows = spec\.penalties\?\.\[key\][^\n]*\n\s+if \(Array\.isArray\(penaltyRows\) && penaltyRows\.length\) \{/.test(src.peril) && /conditionExpiresRound: Number\(game\.combat\.round \?\? 0\) \+ rounds/.test(src.peril)
  && /flags: \{ \[SYSTEM_ID\]: \{ conditionals: penaltyRows\.map/.test(src.peril));
ok("S5 a rung's escape save is made against the area's DC",
  /for \(const tag of tags\) if \(tag\.conditionSave\) tag\.conditionSave = \{ label: title \|\| peril\.name, \.\.\.tag\.conditionSave, saveDC: dc \};/.test(src.peril));
ok("S6 damage that lingers is recorded on each creature the area hurt",
  /if \(spec\.lingering && record\.damage > 0\) \{/.test(src.peril) && /await recordLingering\(actor, \{/.test(src.peril));
ok("S7 the lingering save is rolled at the start of the creature's turn",
  /for \(const said of await applyLingeringDamage\(actor\)\)/.test(src.cbt));
ok("S8 an area's PP cost is refused when short, and paid",
  /if \(ppCost > 0 && ppHeld < ppCost\) \{/.test(src.act) && /if \(ppCost > 0\) await actor\.update\(\{ "system\.resources\.pp\.value": ppHeld - ppCost \}\);/.test(src.act));
ok("S9 a Fumble on the Gorgon's save takes the clock and the saves away",
  /if \(outcome\.permanent\) \{/.test(src.csw) && /\[`flags\.\$\{SYSTEM_ID\}\.-=\$\{CONDITION_SAVE_FLAG\}`\]: null,/.test(src.csw));
ok("S10 a critical with a declared weapon asks before the injury, and a replacement skips it",
  /injuryReplaced = await offerCriticalReplacement\(actor, weapon, targetActor\);/.test(src.atk)
  // Re-anchored at 3.667.0: a strike series' later criticals roll no injury either.
  && /if \((?:!grabOnly && |strikeLands && )?outcome\.critical && !outcome\.critical\.injuryImmune && !injuryReplaced && !noCriticalInjury\) \{/.test(src.atk));
// Re-anchored at 3.671.0: a Strike its target cannot react to (Drawn Verdict) offers none.
ok("S11 a miss offers the defender its reaction move — every miss, not only a fumble's (3.650.1)",
  /\n  \}\n\n  \/\/ A MISS THE DEFENDER MAY ANSWER BY MOVING[^\n]*\n(  \/\/[^\n]*\n)+  if \(outcome\.resolved && !outcome\.hits && targetActor(?: && !noReactions)?\) \{\n    const \{ offerMissedReactions \}[^\n]*\n    await offerMissedReactions\(targetActor, actor\)/.test(src.atk));
ok("S12 both permitted move paths offer the adjacency reactions",
  (src.mv.match(/maybeOfferSwiftPursuit\(tokenDocument, movement\);\n\s+maybeOfferCreatureReactions\(tokenDocument, movement\);/g) ?? []).length === 2);
ok("S13 the buttons are registered at boot",
  /registerCreatureReactionHooks\(\);/.test(src.boot));
ok("S14 the toggle is a Codex action and attaches its light",
  /sweepingStrike, toggleEffect \}\);/.test(src.cw) && /await attachTokenLight\(actor, spec\.lightSource\);/.test(src.cw));
ok("S15 a replacement's -2 waits for an attack; Flat-Footed lasts to the target's next turn",
  /oneShot: true, auto: true, checkTypes: \["attack"\], turns: pendingTurnsFor\(own\)/.test(src.crw)
  && /Number\(game\.combat\.round \?\? 0\) \+ 1 : null;\n\s+await applyConditionTags\(target, \[\{ key: "flatFooted"/.test(src.crw));
ok("S16 the button spends the reaction before it moves",
  /await spendReaction\(actor, raw\.spec\.label\);[\s\S]*?armCompoundLeg\(actor, reactionMoveLeg\(raw\.spec\)/.test(src.crw));

ok("S17 adjacency is measured from where the move ends, not where the animating token still reads (3.650.1)",
  /offerAdjacentReactions\(doc, destination\)/.test(src.mv) && /const destination = movement\?\.destination \?\? null;/.test(src.mv)
  && /const mover = moverAt\(placed, at\);/.test(src.crw) && /const feet = distanceBetween\(mover, other\);/.test(src.crw));

const EXPECTED = 34;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block17: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block17: ${checks} checks\n  all pass\n`);
