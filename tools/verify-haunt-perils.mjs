#!/usr/bin/env node
/**
 * verify-haunt-perils — 3.629.0, Pillars of Faith Chapter 8 (Spirits &
 * Haunts), Graham's design of 8 October 2026: the core's perils extended so
 * a haunt is one. All of it opt-in; a 3.620.0 peril is untouched.
 *
 *   A  the stat block's Detection and Disable lines
 *   B  which skill disables, at what DC; a Counteract's level and DC
 *   C  suppression, Resolution, what a peril may still do
 *   D  the Effect read: save, reach, ladder, clocks
 *   E  what a degree applies
 *   F  the wiring
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (p) => import(new URL(`../module/${p}`, import.meta.url));

const P = await imp("peril.mjs");
const E = await imp("peril-effect.mjs");
const said = (text) => P.perilDetectionEntries({ detection: text }).map((e) => `${e.skill}:${e.dc}${e.minRank ? `r${e.minRank}` : ""}`).join(" ");

/* A — the lines */
equal("A1 several skills share the DC that closes them; a Rank after it is theirs",
  [said("Perception DC 17; Occultism or Religion DC 17"), said("Perception DC 18; Religion DC 18, Rank 1"), said("Perception DC 26, Occultism or Religion DC 26, Rank 3")],
  ["perception:17 occultism:17 religion:17", "perception:18 religion:18r1", "perception:26 occultism:26r3 religion:26r3"]);
equal("A2 each skill its own DC, prose between passed over",
  [said("Religion DC 18 to recite the chapel's funerary response or Occultism DC 20 to disrupt the supernatural resonance. Success suppresses the haunt until sunrise."),
    said("Occultism DC 21, Religion DC 21 or Sense Motive DC 23"),
    said("Religion DC 23. A creature versed in Linguistics may assist; Occultism DC 25"),
    said("Religion DC 26 to correctly continue the interrupted liturgy, Occultism DC 26 to break part of the repeating supernatural pattern, or Performance DC 28 to establish a competing rhythm.")],
  ["religion:18 occultism:20", "occultism:21 religion:21 senseMotive:23", "religion:23 occultism:25", "religion:26 occultism:26 perform:28"]);
equal("A3 a Lore is a specialist skill, by name; Spirit Sense is not a skill",
  [said("Perception DC 20; Nature, Occultism or Spirit Lore DC 20"), said("Spirit Sense automatically reveals a spiritual presence; Perception DC 24 or Religion/Spirit Lore DC 24 identifies that it is concentrated around the gate.")],
  ["perception:20 nature:20 occultism:20 lore:spiritLore:20", "perception:24 religion:24 lore:spiritLore:24"]);
equal("A4 the successes a pasted Disable line asks for, or the field's", [P.normalisePeril({ disable: "Diplomacy, Religion or Spirit Lore DC 24. Three successes are required" }).successes, P.normalisePeril({ disable: "Five successes are required." }).successes, P.normalisePeril({ disable: "Occultism DC 15", successes: 2 }).successes], [3, 5, 2]);
equal("A5 no line: the 3.620.0 skill and DC stand",
  [P.perilDetectionEntries({ detectionSkill: "perception", detectionDC: 20, minRank: 2 }).map((e) => `${e.skill}:${e.dc}r${e.minRank}`), P.perilDisableSkillAllowed({ disableSkills: "Nature or Survival", disableDC: 22 }, "survival").dc, P.perilDisableSkillAllowed({}, "thievery").ok],
  [["perception:20r2"], 22, true]);

/* B — disabling */
const bell = { enabled: true, disable: "Religion DC 18 to recite … or Occultism DC 20 to disrupt", onDisable: "suppressed", suppressFor: "", successes: 1 };
equal("B1 the skill used sets the DC; one the line does not name is refused, naming the ones it does",
  [P.perilDisableSkillAllowed(bell, "religion").dc, P.perilDisableSkillAllowed(bell, "occultism").dc, P.perilDisableSkillAllowed({ disable: "Occultism DC 26 to break it; Occultism DC 20 to calm it" }, "occultism").dc, P.perilDisableSkillAllowed(bell, "thievery")],
  [18, 20, 20, { ok: false, reason: "this peril is disabled with Religion or Occultism", dc: null }]);
equal("B2 a specialist Spirit Lore answers a Spirit Lore entry, and a numbered duplicate too",
  [P.perilDisableSkillAllowed({ disable: "Religion or Spirit Lore DC 29" }, "specialist:spiritLore").dc, P.perilDisableSkillAllowed({ disable: "Religion or Spirit Lore DC 29" }, "specialist:spiritLore2").ok, P.perilDisableSkillAllowed({ disable: "Religion or Spirit Lore DC 29" }, "specialist:stoneLore").ok],
  [29, true, false]);
equal("B3 Dispel always may: a haunt at its Level DC (level + 14), any other peril at its Disable DC",
  [P.perilDisableSkillAllowed(bell, "powerManipulation", { level: 4 }).dc, P.perilDisableSkillAllowed({ disableDC: 25 }, "powerManipulation", { level: 4 }).dc],
  [18, 25]);
equal("B4 Counteract: the printed level and DC, else the peril's level and Level DC",
  [P.perilCounteract(bell, 4), P.perilCounteract({ ...bell, counteractLevel: 9, counteractDC: 30 }, 4), P.perilCounteractable(bell), P.perilCounteractable({}), P.perilCounteractable({ counteractDC: 20 })],
  [{ level: 4, dc: 18 }, { level: 9, dc: 30 }, true, false, true]);

/* C — suppression */
const farewell = { enabled: true, onDisable: "suppressed", suppressFor: "24 hours", successes: 1 };
const done = P.perilAfterAttempt(farewell, "success", { now: 100 });
equal("C1 a haunt's finished Disable suppresses it for its own span", [done.state, done.suppressedUntil, done.progress], ["suppressed", 86500, 0]);
equal("C2 with no span it is suppressed until its Reset", P.perilAfterAttempt(bell, "critical", { now: 100 }).suppressedUntil, null);
const watchman = { enabled: true, onDisable: "suppressed", successes: 3 };
equal("C3 several successes still bank first: a Critical counts two", [P.perilAfterAttempt(watchman, "critical").progress, P.perilAfterAttempt(watchman, "critical").state, P.perilAfterAttempt({ ...watchman, progress: 2 }, "success").state], [2, "armed", "suppressed"]);
equal("C4 a Counteract is one check, with its effect's own span; a plain peril still disables",
  [P.perilAfterAttempt(watchman, "success", { mode: "counteract", seconds: 3600, now: 5 }).suppressedUntil, P.perilAfterAttempt(watchman, "failure", { mode: "counteract" }).done, P.perilAfterAttempt({ successes: 1 }, "success").state],
  [3605, false, "disabled"]);
equal("C5 a spell whose ladder suppresses on a Failure forces it; a Fumble still triggers",
  [P.perilAfterAttempt(bell, "failure", { mode: "counteract", seconds: 6, force: true, now: 10 }).suppressedUntil, P.perilAfterAttempt(bell, "fumble", { mode: "counteract", force: true }).triggered],
  [16, true]);
equal("C6 suppressed, resolved: nothing further, not even a trigger",
  [P.perilAfterAttempt({ ...bell, state: "suppressed" }, "fumble").triggered, P.perilAfterAttempt({ ...bell, state: "resolved" }, "heroic").earned],
  [false, 0]);
equal("C7 what may act: armed yes; suppressed no until its clock runs out; resolved never",
  [P.perilCanAct({ state: "armed" }).ok, P.perilCanAct({ state: "suppressed", suppressedUntil: 50 }, 40).ok, P.perilCanAct({ state: "suppressed", suppressedUntil: 50 }, 60).rearm, P.perilCanAct({ state: "suppressed", suppressedUntil: null }, 9e9).ok, P.perilCanAct({ state: "resolved" }).reason],
  [true, false, true, false, "it has been resolved and will not return"]);
equal("C8 after a Trigger: 'Reset Immediately' leaves a simple one armed; a complex one stays triggered",
  [P.perilStateAfterTrigger({ reset: "Immediately." }), P.perilStateAfterTrigger({ reset: "Midnight." }), P.perilStateAfterTrigger({ reset: "Immediately", actionType: "complex" })],
  ["armed", "triggered", "triggered"]);
equal("C9 no HP, no body: a Strike cannot reach it; an HP peril still can",
  [P.perilHasNoBody({ type: "npc", system: { gm: { peril: { enabled: true } }, resources: { hp: { max: 0 } } } }), P.perilHasNoBody({ type: "npc", system: { gm: { peril: { enabled: true } }, resources: { hp: { max: 30 } } } }), P.perilHasNoBody({ type: "npc", system: { resources: { hp: { max: 0 } } } }), P.perilHasNoBody({ type: "npc", system: { gm: { peril: { enabled: true, noBody: true } }, resources: { hp: { max: 30 } } } })],
  [true, false, false, true]);
equal("C10 the states", [P.normalisePeril({ state: "suppressed" }).state, P.normalisePeril({ state: "resolved" }).state, P.normalisePeril({ state: "nonsense" }).state], ["suppressed", "resolved", "armed"]);
equal("C11 Disable bonuses, from the sheet's text or a list",
  [P.normalisePeril({ disableBonuses: "+2 circumstance: Speaking a remembered name; -1 status: rushed" }).disableBonuses, P.normalisePeril({ disableBonuses: [{ value: 2, label: "Ledger" }] }).disableBonuses.map((b) => b.type)],
  [[{ value: 2, type: "circumstance", label: "Speaking a remembered name" }, { value: -1, type: "status", label: "rushed" }], ["circumstance"]]);

/* D — the Effect read */
const BELL = "Effect A deafening bell rings from beneath the earth. All living creatures within 30 feet attempt a Will save against DC 18.\nCritical Unaffected.\nSuccess Frightened 1 until the end of the creature's next turn.\nPartial Frightened 2.\nFailure Frightened 3.\nFumble Frightened 3 and Dazed 1 until the end of the creature's next turn.\nBlunder Frightened 4 and Dazed 1 for 1 round.\nA deaf creature is immune to this effect.";
const bellSpec = E.perilEffectSpec(BELL);
equal("D1 the Bell: Will DC 18, everyone living within 30 feet, the deaf immune",
  [bellSpec.save, bellSpec.dc, bellSpec.scope, bellSpec.radiusFeet, bellSpec.livingOnly, bellSpec.immuneIf], ["will", 18, "area", 30, true, ["deafened"]]);
equal("D2 its ladder, each clock where it belongs: Frightened alone takes it; beside Dazed, Dazed does",
  [bellSpec.conditions.success, bellSpec.conditions.fumble, bellSpec.conditions.blunder, bellSpec.conditions.critical],
  [[{ key: "frightened", value: 1, rounds: 2 }], [{ key: "frightened", value: 3 }, { key: "dazed", value: 1, rounds: 2 }], [{ key: "frightened", value: 4 }, { key: "dazed", value: 1, rounds: 1 }], []]);
const chair = E.perilEffectSpec("Every creature within 20 feet that can see the chair attempts a Will save against DC 17.\nFailure Frightened 2 and Weakened 1 for 1 minute as grief overwhelms concentration.");
const door = E.perilEffectSpec("The triggering creature attempts a Will save against DC 23.\nFailure Weakened 2 and Slowed 1 for 1 minute.");
const watch = E.perilEffectSpec("The triggering creature attempts a Will save against DC 24.\nFailure Frightened 2 and unable to move through the gate until the end of its next turn.");
equal("D3 a clock binds the run before it; prose between keeps it for itself",
  [chair.conditions.failure, door.conditions.failure, watch.conditions.failure],
  [[{ key: "frightened", value: 2 }, { key: "weakened", value: 1, minutes: 1 }], [{ key: "weakened", value: 2, minutes: 1 }, { key: "slowed", value: 1, minutes: 1 }], [{ key: "frightened", value: 2 }]]);
const drowned = E.perilEffectSpec("The drowned procession manifests. Every creature within 30 feet attempts a Will save against DC 20. On a Failure or worse, the creature becomes Frightened 2. Roll Initiative.");
equal("D4 an inline 'On a Failure or worse': every rung from Failure down, nothing above; and Initiative",
  [drowned.conditions.partial, drowned.conditions.failure, drowned.conditions.blunder, drowned.initiative], [[], [{ key: "frightened", value: 2 }], [{ key: "frightened", value: 2 }], true]);
const drowning = E.perilEffectSpec("One creature within 30 feet hears water filling its lungs.\nThe target attempts a Basic Will save against DC 20 and suffers 3d6 cold damage.");
equal("D5 a basic save's damage, at the GM's targets", [drowning.basic, drowning.damage, drowning.scope], [true, { formula: "3d6", type: "cold" }, "targets"]);
const verse = E.perilEffectSpec("The volume increases. All creatures able to hear the choir attempt a Will save against DC 26.\nOn a Failure, increase Frightened by 1.\nOn a Fumble, increase Frightened by 2.\nA creature whose Frightened condition would exceed 4 instead becomes Dazed 1 until the end of its next turn for each additional point that could not be applied.");
equal("D6 'increase Frightened by 1', and the overflow past 4 into Dazed",
  [verse.conditions.failure, verse.conditions.blunder, verse.conditions.partial, verse.overflow],
  [[{ key: "frightened", value: null, increase: 1 }], [{ key: "frightened", value: null, increase: 2 }], [], { key: "frightened", cap: 4, into: "dazed", per: 1, rounds: 2 }]);
const watchman2 = E.perilEffectSpec("The triggering creature attempts a Will save against DC 24.\nCritical/Success Unaffected.\nPartial Frightened 1.\nFumble Frightened 3 and unable to cross the threshold for 1 minute.\nBlunder As Fumble and the spirit marks the creature as an enemy.");
equal("D7 'Critical/Success' is two rungs; 'As Fumble' inherits", [watchman2.outcomes.critical, watchman2.outcomes.success, watchman2.conditions.blunder], ["Unaffected.", "Unaffected.", [{ key: "frightened", value: 3 }]]);
const doorBlunder = E.perilEffectSpec("The triggering creature attempts a Will save against DC 23.\nFumble Weakened 3 and Slowed 1 for 1 minute.\nBlunder As Fumble, and the creature is unable to cross the threshold for 24 hours unless the haunt is Counteracted.");
const voice = E.perilEffectSpec("One creature within 60 feet attempts a Will save against DC 26.\nFailure The target is Dazed 1.\nFumble As Failure for 1 minute.");
equal("D9 'As Failure for 1 minute' times what it inherits; 'As Fumble, and … for 24 hours' does not",
  [doorBlunder.conditions.blunder, voice.conditions.fumble], [[{ key: "weakened", value: 3, minutes: 1 }, { key: "slowed", value: 1, minutes: 1 }], [{ key: "dazed", value: 1, minutes: 1 }]]);
equal("D8 an object declaration is taken as given, over its own text", E.perilEffectSpec({ text: "The target attempts a Will save.", conditions: { failure: [{ key: "stunned", value: 1 }] } }).conditions.failure, [{ key: "stunned", value: 1 }]);

/* E — what a degree applies */
const out = E.perilEffectOutcome(bellSpec, "fumble", { combatRound: 3, worldTime: 0 });
equal("E1 the rung's conditions as tags, on the combat's clock", out.tags.map((t) => `${t.key}:${t.value}:${t.expiresRound ?? "-"}`), ["frightened:3:-", "dazed:1:5"]);
equal("E2 a blank rung reads its neighbour (Heroic → Critical)", E.perilEffectOutcome(bellSpec, "heroic").text, "Unaffected.");
equal("E3 Frightened 3, increased by 2, stops at 4 and spills one into Dazed",
  E.perilIncreaseRows(E.perilEffectOutcome(verse, "fumble").rows, () => 3, verse.overflow), [{ key: "dazed", value: 1, rounds: 2 }, { key: "frightened", value: 4 }]);
equal("E4 the sheet's summary", E.perilEffectSummary(bellSpec).startsWith("Will DC 18 · everyone within 30 ft (living) · immune if deafened; Success: Frightened 1 (2 rd)"), true);

/* F — the wiring */
const WF = read("module", "peril-workflow.mjs");
const ACTION = read("module", "combat", "action-workflow.mjs");
ok("F1 the targeted peril's bonuses reach the check dialog, offered", /extraConditionals: perilTarget\?\.bonuses \?\? \[\]/.test(ACTION)
  && /\.\.\.\(Array\.isArray\(extraConditionals\) \? extraConditionals : \[\]\)/.test(read("module", "apps", "check-dialog.mjs")));
ok("F2 Dispel opens on a haunt's Counteract level and DC", /perilDispelDefaults\(firstTargetActor\(\)\) \?\? \{\}/.test(ACTION)
  && /export async function promptDispel\(maxPP, poolPP, \{ level = 0, dc = 0 \} = \{\}\)/.test(read("module", "general-skill-options-workflow.mjs")));
ok("F3 the bank is told a Counteract from a Disable", /perilDisableAttempt\(perilHit\.peril, disableDegree, \{ mode: perilHit\.mode \}\)/.test(ACTION)
  && /mode: action\.key === "dispel" \? "counteract" : "disable"/.test(WF));
ok("F4 an action's resolution is announced for modules, after its card", /Hooks\.callAll\("trgPrimeActionResolved", \{ actor, action, degree: rawDegree \?\? degree, targetActor, invokedSkillKey, total: checkTotal \}\);/.test(ACTION));
ok("F5 a Strike at a bodiless peril is refused before anything is spent", /if \(targetActor && perilHasNoBody\(targetActor\)\) \{/.test(read("module", "combat", "attack-workflow.mjs"))
  && /if \(perilHasNoBody\(peril\)\) \{/.test(WF));
ok("F6 a peril's routine action is rolled and applied from Use", /const routine = await usePerilRoutine\(actor, item\);\s*if \(routine !== null\) return routine;/.test(read("module", "creature-activation-workflow.mjs")));
const SPELL = read("module", "magic", "spell-effects.mjs");
ok("F7 a spell counteracts a haunt on its own ladder; a Fumble triggers", /case "counteractPeril": \{/.test(SPELL)
  && /const ladder = \{ \.\.\.\(effect\.suppress \?\? \{\}\), \.\.\.\(warpMods\?\.perilSuppress \?\? \{\}\) \};/.test(SPELL)
  && /perilDisableAttempt\(target, degree\.key, \{ mode: "counteract", seconds, force: true \}\)/.test(SPELL)
  && (await imp("magic/effect-kinds.mjs")).HANDLED_EFFECT_KINDS.includes("counteractPeril"));
ok("F8 a warp may lengthen the suppression", /if \(m\.perilSuppress && typeof m\.perilSuppress === "object"\) mods\.perilSuppress = \{ \.\.\.m\.perilSuppress \};/.test(read("module", "magic", "spell-warp.mjs")));
ok("F9 the relay carries the mode, the span and the force; the GM's client reads the rest", /force: payload\.force === true/.test(read("module", "combat", "target-relay.mjs"))
  && /mode: how\?\.mode === "counteract" \? "counteract" : "disable",\s*force: how\?\.force === true,/.test(read("module", "combat", "target-relay-workflow.mjs")));
const HBS = read("templates", "actor", "actor-sheet.hbs");
const SHEET = read("module", "sheets", "actor-sheet.mjs");
ok("F10 the sheet: the lines, the Effect, Anchor, Resolution, and Trigger and Resolve",
  ["system.gm.peril.detection", "system.gm.peril.disable", "system.gm.peril.onDisable", "system.gm.peril.suppressFor", "system.gm.peril.effectText", "system.gm.peril.anchor", "system.gm.peril.resolution", "system.gm.peril.disableBonuses", "system.gm.peril.spiritPresence", "system.gm.peril.noBody"].every((n) => HBS.includes(`name="${n}"`))
  && /data-action="perilTrigger"/.test(HBS) && /data-action="perilResolve"/.test(HBS)
  && /perilTrigger: TRGActorSheet\.perilTrigger,/.test(SHEET) && /const view = perilSheetView\(actor, Number\(game\.time\?\.worldTime \?\? 0\)\);/.test(SHEET));
const tpl = JSON.parse(read("template.json"));
const peril = tpl.Actor?.templates?.creature?.gm?.peril ?? tpl.Actor?.templates?.base?.gm?.peril ?? Object.values(tpl.Actor?.templates ?? {}).find((t) => t?.gm?.peril)?.gm?.peril;
equal("F11 the new fields default to a 3.620.0 peril", [peril?.onDisable, peril?.suppressedUntil, peril?.counteractLevel, peril?.spiritPresence, peril?.detection], ["disabled", null, 0, false, ""]);
ok("F12 a suppression's clock is watched from the ready hook", /registerPerilHooks\(\);/.test(read("scripts", "trg-prime.mjs")) && /Hooks\.on\("updateWorldTime"/.test(WF));
const api = await imp("module-api.mjs");
api.resetModuleRegistry();
const fn = async () => [];
equal("F13 a module registers a peril automation; a bad one is refused",
  [api.registerPerilAutomation("Hungry Reliquary", { trigger: fn }), Boolean(api.registeredPerilAutomation("hungry reliquary")?.trigger), api.registerPerilAutomation("x", {})], [true, true, false]);
ok("F14 the API offers it", /registerPerilAutomation: \(name, spec, moduleId\) => registerPerilAutomation\(name, spec, moduleId\)/.test(read("module", "module-api-workflow.mjs")));
const { SKILL_ACTIONS } = await imp("data/skill-actions.mjs");
const dp = SKILL_ACTIONS.find((a) => a.key === "disablePeril");
equal("F15 Disable a Peril under a haunt's skills, and a specialist Lore", [dp.skills.includes("diplomacy"), dp.skills.includes("perform"), dp.specialistSkills], [true, true, true]);
ok("F16 Trigger refuses a peril that may not act, and runs a registered automation in place of the save", /const can = perilCanAct\(raw, now\(\)\);/.test(WF)
  && /if \(automation\?\.trigger\) \{/.test(WF) && /lines\.push\(\.\.\.await runPerilEffect\(peril, spec, \{ title: peril\.name \}\)\);/.test(WF));
ok("F17 a complex peril joins the combat and rolls Initiative", /const complex = p\.actionType === "complex" \|\| Boolean\(spec\?\.initiative\);/.test(WF) && /await combat\.rollInitiative\(\[combatant\.id\]\);/.test(WF));
ok("F18 detection rolls each PC's best eligible skill, and Spirit Sense speaks for a spiritual presence", /const \{ entry, skill \} = options\.sort\(\(a, b\) => b\.edge - a\.edge\)\[0\];/.test(WF) && /if \(p\.spiritPresence\) \{/.test(WF));
ok("F19 a resolved peril does not Reset", /if \(p\.state === "resolved"\) \{/.test(WF));
ok("F20 an automation may name the creatures an effect reaches", /async function runPerilEffect\(peril, spec, \{ title = "", targets = null, results = null \} = \{\}\) \{/.test(WF)
  && /\n  \}\n  const \{ actors, note \} = effectTargets\(peril, spec, targets\);/.test(WF) && /if \(Array\.isArray\(chosen\)\) \{/.test(WF));

/* G — the sheet's reading */
const view = P.perilSheetView({ system: { identity: { level: 4 }, gm: { peril: { enabled: true, detection: "Perception DC 18; Religion DC 18, Rank 1", disable: "Religion DC 18 or Occultism DC 20", onDisable: "suppressed", state: "suppressed", suppressedUntil: 4000, effectText: BELL } } } }, 100);
equal("G1 the sheet says how it read the lines, the Counteract, and the time left",
  [view.entries, view.suppressed], ["Detection read as: Perception DC 18, Religion DC 18 (rank 1). Disable read as: Religion DC 18, Occultism DC 20. Counteract: level 4, DC 18.", "Suppressed for another 1 hour 5 minutes of game time."]);

/* H — the 0.10.0 live test's polish (3.629.1) */
const viewAt = (until, now) => P.perilSheetView({ system: { gm: { peril: { enabled: true, state: "suppressed", suppressedUntil: until } } } }, now).suppressed;
equal("H1 the time left reads as a GM reads it", [viewAt(86400, 0), viewAt(172800, 0), viewAt(5400, 0), viewAt(90, 0)],
  ["Suppressed for another 24 hours of game time.", "Suppressed for another 2 days of game time.", "Suppressed for another 1 hour 30 minutes of game time.", "Suppressed for another 2 minutes of game time."]);
const farewell2 = E.perilEffectSpec("The target attempts a Will save against DC 15.\nFumble Frightened 2 and cannot willingly approach the bed for 1 minute.\nBlunder As Fumble, but the target immediately moves away.");
equal("H2 an 'As Fumble' rung's line says what the Fumble was", E.perilEffectOutcome(farewell2, "blunder").text, "As Fumble (Frightened 2 and cannot willingly approach the bed for 1 minute.), but the target immediately moves away.");
ok("H3 a rung that prints and applies nothing says 'unaffected'", /const unaffected = !outcome\.text && !outcome\.rows\.length && !damageRoll && !rungFormula;/.test(WF) && /unaffected \? " — unaffected\." : ""/.test(WF));
ok("H4 a Reset line keeps one full stop; a bonus row names the peril once", /const sentence = \(text\) => \{ const t = String\(text \?\? ""\)\.trim\(\); return \/\[\.!\?\]\$\/\.test\(t\) \? t : `\$\{t\}\.`; \};/.test(WF)
  && /<strong>Reset<\/strong>\$\{p\.reset \? ` — \$\{sentence\(p\.reset\)\}` : "\."\}/.test(WF) && /scope: `against \$\{targetActor\.name\}`/.test(WF));
ok("H5 the old single skill and DC grey out under a printed line", /\{\{#if perilDetectionByLine\}\}disabled/.test(HBS) && /\{\{#if perilDisableByLine\}\}disabled\{\{\/if\}\}/.test(HBS)
  && /context\.perilDetectionByLine = Boolean\(String\(system\.gm\?\.peril\?\.detection \?\? ""\)\.trim\(\)\);/.test(SHEET));
ok("H6 a Secret action's outcome is whispered to the GM, as its check is rolled blind",
  /\.\.\.\(secret \? \{ whisper: ChatMessage\.getWhisperRecipients\("GM"\)\.map\(\(u\) => u\.id\) \} : \{\}\),/.test(ACTION)
  && /lines, \{ \.\.\.cardOptions, secret: Boolean\(secretRollMode\(action\)\) \}\);/.test(ACTION));

ok("H7 and they look it (3.629.2)", /\.trg-peril-card input:disabled,\s*\.trg-prime \.trg-peril-card select:disabled \{\s*opacity: 0\.45;/.test(read("styles", "trg-prime.css")));

const EXPECTED = 62;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-haunt-perils: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-haunt-perils: ${checks} checks — all green.`);
