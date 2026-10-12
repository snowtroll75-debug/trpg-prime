#!/usr/bin/env node
/**
 * verify-block38-environment — block 38's environment and perils (Chapter 12,
 * pages 394–400), 3.620.0.
 *
 * Graham's rulings of 4 October 2026 (R13, R15–R17: "your recommendation on
 * all") on claude/audit-pages-387-400.md, and the audit's A4.
 *
 *   A  the Environmental Damage Table, as printed (R15)
 *   B  the Exhaustion check: the GM's DC, the environment's damage on top of
 *      the Fatigue (R13), the cold-weather gear in the cold (A4)
 *   C  Quicksand: the suffocation clock, nonlethal (R15)
 *   D  the GM's Environmental Damage tool (R15)
 *   E  Weather: visibility steps are light-level steps (R16)
 *   F  perils: the section, detection, disabling, the relay, smashing (R17)
 *   G  the version
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const ENV = await import("../module/environment.mjs");
const P = await import("../module/peril.mjs");
const { RELAY_ACTIONS, handleRelayMessage, buildRelayRequest } = await import("../module/combat/target-relay.mjs");
const { SKILL_ACTIONS, TRAINED_ACTION_KEYS } = await import("../module/data/skill-actions.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const EXH = strip(read("module", "combat", "exhaustion-workflow.mjs"));
const ENV_WF = strip(read("module", "environment-workflow.mjs"));
const DROWN = strip(read("module", "drowning-workflow.mjs"));
const LIGHT = strip(read("module", "light-workflow.mjs"));
const MAIN = strip(read("scripts", "trg-prime.mjs"));
const ACTION = strip(read("module", "combat", "action-workflow.mjs"));
const DYING = strip(read("module", "combat", "dying-workflow.mjs"));
const PERIL_WF = strip(read("module", "peril-workflow.mjs"));
const RELAY_WF = strip(read("module", "combat", "target-relay-workflow.mjs"));
const SHEET = strip(read("module", "sheets", "actor-sheet.mjs"));
const SHEET_HBS = read("templates", "actor", "actor-sheet.hbs");
const OPTIONS = strip(read("module", "general-skill-options.mjs"));
const TEMPLATE = JSON.parse(read("template.json"));

/* A — the table */
{
  const t = ENV.ENVIRONMENTAL_DAMAGE;
  const row = (k) => `${t[k].type}:${t[k].failure}/${t[k].fumble}`;
  ok("A1 the eight rows, as printed",
    Object.keys(t).join() === "extremeHeat,extremeCold,sandstorm,blizzard,lava,acidPool,quicksand,thunderstorm"
    && row("extremeHeat") === "fire:1d6/2d6" && row("extremeCold") === "cold:1d6/2d6"
    && row("sandstorm") === "bludgeoning:1d4/1d6" && row("blizzard") === "cold:1d4/1d6"
    && row("lava") === "fire:10d6/20d6" && row("acidPool") === "acid:5d6/10d6"
    && row("thunderstorm") === "electricity:4d6/6d6" && t.quicksand.suffocation && t.quicksand.nonlethal);
  ok("A2 the frequencies", t.extremeHeat.frequency === "every hour" && t.sandstorm.frequency === "every 10 minutes"
    && /instant/.test(t.lava.frequency) && /until escape/.test(t.quicksand.frequency));
  ok("A3 a failure deals the Failure column; a fumble or blunder the Fumble column",
    ENV.environmentalDamageFor("lava", "failure")?.formula === "10d6"
    && ENV.environmentalDamageFor("lava", "fumble")?.formula === "20d6"
    && ENV.environmentalDamageFor("blizzard", "blunder")?.formula === "1d6"
    && ENV.environmentalDamageFor("blizzard", "blunder")?.type === "cold");
  ok("A4 a success, a critical, a heroic or a partial deals none",
    ["success", "critical", "heroic", "partial"].every((d) => ENV.environmentalDamageFor("extremeHeat", d) === null));
  ok("A5 Quicksand deals no table damage; a failure starts its suffocation",
    ENV.environmentalDamageFor("quicksand", "failure") === null
    && ENV.environmentSuffocates("quicksand", "failure") && ENV.environmentSuffocates("quicksand", "blunder")
    && !ENV.environmentSuffocates("quicksand", "success") && !ENV.environmentSuffocates("lava", "failure"));
}

/* B — the Exhaustion check */
{
  const furs = { kind: "modifier", value: 2, type: "item", label: "Furs/Pelts (cold weather)", scope: "Checks to resist extreme cold", when: { checkTypes: ["save"], subjects: ["fortitude"] } };
  const bedroll = { kind: "modifier", value: 2, type: "item", label: "Bedroll (environmental cold)", scope: "Checks to resist environmental cold", when: { checkTypes: ["save"], subjects: ["fortitude"] } };
  const compass = { kind: "modifier", value: 5, type: "item", label: "Compass", scope: "Sense Direction", when: { checkTypes: ["skill"] } };
  const best = ENV.coldProtection([compass, furs, bedroll], "fortitude");
  ok("B1 A4 — the cold-weather gear is found, one bonus not two (item bonuses do not stack)",
    best?.value === 2 && /Furs/.test(best.label));
  ok("B2 and only for the save it reaches, and only cold gear",
    ENV.coldProtection([furs], "will") === null && ENV.coldProtection([compass], "fortitude") === null);
  ok("B3 the roll takes it in a cold environment only",
    /if \(row\?\.cold\) \{\s*const gear = coldProtection\(actor\.system\?\.combat\?\.runeConditionals \?\? \[\], saveKey\);/.test(EXH)
    && /if \(gear\) modifiers\.push\(\{ label: gear\.label, value: gear\.value, type: gear\.type \}\);/.test(EXH)
    && ENV.ENVIRONMENTAL_DAMAGE.extremeCold.cold && ENV.ENVIRONMENTAL_DAMAGE.blizzard.cold && !ENV.ENVIRONMENTAL_DAMAGE.extremeHeat.cold);
  ok("B4 R13 — the GM's DC, or Chapter 7's Easy level DC without one",
    /dc: gmDC \?\? levelDC\(Number\(actor\.system\?\.identity\?\.level \?\? 0\)\),/.test(EXH)
    && /\.\.\.\(gmDC \? \{\} : \{ difficulty: "easy" \}\),/.test(EXH));
  ok("B5 R13 — the environment's damage on top of the Fatigue, from the check's degree",
    /const fatigue = exhaustionFatigue\(degree\);[\s\S]*lines\.push\(\.\.\.await applyEnvironment\(actor, environment, degree\)\);/.test(EXH));
  ok("B6 the prompt asks for the environment and the GM's DC, and passes them",
    /name="environment"/.test(EXH) && /name="dc"/.test(EXH)
    && /dc: Number\(result\.dc\) \|\| null,\s*environment: result\.environment \|\| ""/.test(EXH));
  ok("B7 the damage goes through the creature's defences, typed",
    /const dealt = await applyTypedDamage\(actor, \{ amount: roll\.total, type: damage\.type \}\);/.test(ENV_WF));
}

/* C — Quicksand */
{
  ok("C1 Quicksand starts the suffocation clock, nonlethal, named",
    /await startHoldingBreath\(actor, \{ nonlethal: true, source: row\.label \}\);/.test(ENV_WF)
    && /export async function startHoldingBreath\(actor, \{ nonlethal = false, source = "" \} = \{\}\)/.test(DROWN));
  ok("C2 the state keeps it through every rewrite, and the suffocation damage is nonlethal",
    /\.\.\.\(raw\.nonlethal \? \{ nonlethal: true \} : \{\}\)/.test(DROWN)
    && /applyDamageAndCheckDying\(actor, outcome\.damage, \{ isCritical: false, nonlethal: Boolean\(state\.nonlethal\) \}\);/.test(DROWN));
}

/* D — the GM's tool */
{
  ok("D1 a GM button on the token controls", /name: "environmentalDamage",/.test(MAIN)
    && /tokens\.tools\.environmentalDamage = environment;/.test(MAIN) && /onClick: \(\) => promptEnvironmentalDamage\(\)/.test(MAIN));
  ok("D2 an Exhaustion check each, or a column outright, for every selected token",
    /if \(choice\.mode === "check"\) \{[\s\S]*?await rollExhaustionCheck\(actor, \{ dc: choice\.dc, environment: choice\.hazard,/.test(ENV_WF)
    && /const lines = await applyEnvironment\(actor, choice\.hazard, choice\.mode\);/.test(ENV_WF)
    && /if \(!game\.user\?\.isGM\) return null;/.test(ENV_WF));
}

/* E — Weather */
{
  ok("E1 R16 — fog, sandstorm, blizzard; up to four steps, never more",
    Object.keys(ENV.WEATHER_KINDS).join() === "fog,sandstorm,blizzard"
    && ENV.weatherShiftFor({ kind: "fog", steps: 2 }, []).steps === -2
    && ENV.weatherShiftFor({ kind: "blizzard", steps: 9 }, []).steps === -4
    && ENV.weatherShiftFor({ kind: "rain", steps: 2 }, []) === null
    && ENV.weatherShiftFor({ kind: "fog", steps: 0 }, []) === null);
  ok("E2 a region's weather wins over the scene's; never both",
    ENV.weatherShiftFor({ kind: "fog", steps: 1 }, [{ kind: "sandstorm", steps: 3 }]).steps === -3
    && ENV.weatherShiftFor({ kind: "fog", steps: 1 }, [null]).steps === -1
    && ENV.weatherShiftFor(null, []) === null);
  ok("E3 the light level a token stands in takes it",
    /const weather = weatherShiftFor\(/.test(LIGHT)
    && /if \(weather\) level = shiftLightLevel\(level, weather\.steps, weather\.floor\);/.test(LIGHT));
  ok("E4 the fields on the scene's and the region's config, registered at ready",
    /Hooks\.on\("renderSceneConfig"/.test(ENV_WF) && /Hooks\.on\("renderRegionConfig"/.test(ENV_WF)
    && /name="flags\.\$\{SYSTEM_ID\}\.weather\.kind"/.test(ENV_WF) && /^\s*registerWeatherConfig\(\);/m.test(MAIN));
}

/* F — perils */
{
  const gm = TEMPLATE.Actor.templates.creature.gm ?? TEMPLATE.Actor.npc?.gm;
  ok("F1 the Peril section is stored on the GM block", gm?.peril?.enabled === false && gm?.peril?.successes === 1
    && gm?.peril?.detectionSkill === "perception" && gm?.peril?.state === "armed");
  ok("F2 a peril is an NPC with the section on, or tagged trap",
    P.isPeril({ type: "npc", system: { gm: { peril: { enabled: true } } } })
    && P.isPeril({ type: "npc", system: { details: { traits: "Trap, Mechanical" } } })
    && !P.isPeril({ type: "character", system: { gm: { peril: { enabled: true } } } })
    && !P.isPeril({ type: "npc", system: { details: { traits: "" } } }));
  const clean = P.normalisePeril({ disableSkills: "Nature or Survival, cooking", successes: 0, state: "bogus" });
  ok("F3 the section is cleaned: listed skills only, at least one success, a known state",
    clean.disableSkills.join() === "nature,survival" && clean.successes === 1 && clean.state === "armed" && clean.detectionSkill === "perception");
  ok("F4 detection: every PC without a minimum rank; with one, only a Searching PC with the ranks",
    P.perilDetectionEligible({ minRank: 0 }).eligible
    && !P.perilDetectionEligible({ minRank: 5, searching: false, ranks: 9 }).eligible
    && !P.perilDetectionEligible({ minRank: 5, searching: true, ranks: 4 }).eligible
    && P.perilDetectionEligible({ minRank: 5, searching: true, ranks: 5 }).eligible);
  ok("F5 disabling: the listed skill, Thievery by default, Dispel always",
    P.perilDisableSkillAllowed({ disableSkills: "Occultism, Religion" }, "religion").ok
    && !P.perilDisableSkillAllowed({ disableSkills: "Occultism, Religion" }, "thievery").ok
    && P.perilDisableSkillAllowed({}, "thievery").ok && !P.perilDisableSkillAllowed({}, "nature").ok
    && P.perilDisableSkillAllowed({ disableSkills: "nature" }, "powerManipulation").ok);
  const three = { successes: 3, progress: 0, state: "armed" };
  ok("F6 a heroic banks three, a critical two; enough disables it",
    P.perilAfterAttempt(three, "heroic").done && P.perilAfterAttempt(three, "heroic").state === "disabled"
    && P.perilAfterAttempt(three, "critical").progress === 2 && !P.perilAfterAttempt(three, "critical").done);
  ok("F7 a fumble or blunder triggers it, and banks nothing",
    P.perilAfterAttempt({ ...three, progress: 2 }, "fumble").triggered
    && P.perilAfterAttempt({ ...three, progress: 2 }, "blunder").state === "triggered"
    && P.perilAfterAttempt({ ...three, progress: 2 }, "blunder").progress === 2);
  ok("F8 a disabled, broken or destroyed peril takes nothing further",
    P.perilAfterAttempt({ ...three, state: "disabled" }, "fumble").triggered === false
    && P.perilAfterAttempt({ ...three, state: "broken" }, "heroic").earned === 0);
  ok("F9 smashing: broken at 0 HP, destroyed at a negative half",
    P.perilDamageState(1, 20) === "armed" && P.perilDamageState(0, 20) === "broken"
    && P.perilDamageState(-9, 20) === "broken" && P.perilDamageState(-10, 20) === "destroyed");
  ok("F10 a peril struck never dies: the object branch, before any dying machinery",
    /if \(isPeril\(actor\) && actor\.system\?\.gm\?\.peril\?\.enabled\) \{\s*const \{ perilTakesDamage \} = await import\("\.\.\/peril-workflow\.mjs"\);\s*return perilTakesDamage\(actor, incoming\);/.test(DYING)
    && DYING.indexOf("perilTakesDamage(actor, incoming)") < DYING.indexOf("catchWithRespite(actor, incoming"));
  ok("F11 the targeted peril's Disable DC, and its skill, before the roll",
    /const perilTarget = perilForAction\(action, targetActor, invokedSkillKey \?\? action\.skills\?\.\[0\] \?\? null\);/.test(ACTION)
    && /if \(perilTarget\?\.refused\) \{/.test(ACTION) && /resolved\.dc = perilTarget\.dc;/.test(ACTION)
    && /if \(action\.key === "disablePeril" && !perilTarget\) \{/.test(ACTION));
  ok("F12 the outcome is banked on the peril",
    /if \(perilHit && !perilHit\.refused && degree\) \{\s*lines\.push\(\.\.\.await perilDisableAttempt\(perilHit\.peril, disableDegree, \{ mode: perilHit\.mode \}\)\);/.test(ACTION)
    && /const disableDegree = rawDegree \?\? degree;/.test(ACTION)
    && /const DISABLING_ACTIONS = Object\.freeze\(\["disableADevice", "disablePeril", "dispel"\]\);/.test(PERIL_WF));
  const action = SKILL_ACTIONS.find((a) => a.key === "disablePeril");
  // 3.629.0: a haunt's own skills join them — Diplomacy, Linguistics,
  // Performance and a specialist Lore (Pillars of Faith, Chapter 8).
  ok("F13 Disable a Peril: Nature, Survival, Occultism, Religion (and a haunt's Diplomacy, Linguistics, Perform, specialist Lore); Trained; Disable Device's time ladder",
    action?.skills?.join() === "nature,survival,occultism,religion,diplomacy,linguistics,perform" && action?.specialistSkills === true && TRAINED_ACTION_KEYS.has("disablePeril")
    && action?.outcomes?.fumble === "You trigger the peril." && /disablePeril: Object\.freeze\(\{\s*actionKey: "disablePeril",\s*options: THIEVERY_TIME_OPTIONS,/.test(OPTIONS));
  ok("F14 detection is secret, at the peril's DC, and the summary goes to the GM",
    /rollMode: BLIND_ROLL_MODE,/.test(PERIL_WF) && /dc: entry\.dc,/.test(PERIL_WF) && /const entries = perilDetectionEntries\(p\)\.filter\(\(e\) => e\.dc > 0\);/.test(PERIL_WF)
    && /await card\(peril, `\$\{peril\.name\} — Detection`, lines, \{ whisperGM: true \}\);/.test(PERIL_WF));
  ok("F15 the sheet's Peril section and its buttons", /<h2>Peril<\/h2>/.test(SHEET_HBS)
    && /name="system\.gm\.peril\.enabled"/.test(SHEET_HBS) && /data-action="perilDetect"/.test(SHEET_HBS)
    && /perilDetect: TRGActorSheet\.perilDetect,/.test(SHEET) && /context\.perilShown = isPeril\(actor\);/.test(SHEET));

  // F16 — the relay, run: a degree in, the GM's own arithmetic out.
  let applied = null;
  const replies = [];
  const outcome = await handleRelayMessage(
    buildRelayRequest({ action: RELAY_ACTIONS.PERIL, uuid: "Actor.peril", userId: "p1", requestId: "r1", payload: { degree: "heroic", progress: 99 } }),
    {
      user: { id: "gm1", isGM: true }, activeGM: { id: "gm1" },
      deps: {
        fromUuid: async () => ({ name: "Pit" }),
        applyPerilAttempt: async (target, degree, how) => { applied = `${degree}:${how?.mode}`; return { done: true }; },
        reply: (m) => replies.push(m)
      }
    });
  ok("F16 R17 — the relay carries the degree only, and the GM's client applies it",
    RELAY_ACTIONS.PERIL === "target.peril" && applied === "heroic:disable" && outcome.handled && replies[0]?.ok === true
    && /applyPerilAttempt\(target, degree, \{ direct: true, \.\.\.how \}\)/.test(RELAY_WF));
}

/* G — the version */
{
  const sys = JSON.parse(read("system.json"));
  ok("G1 the version is 3.620.0 or later", String(sys.version).localeCompare("3.620.0", undefined, { numeric: true }) >= 0);
}

if (failures.length) {
  console.log(`verify-block38-environment: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block38-environment: OK — ${checks} checks. The environmental damage table, the Exhaustion check's DC, damage and cold gear, Quicksand, the GM's tool, weather, and perils: detection, disabling, the relay and smashing.`);
