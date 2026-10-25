#!/usr/bin/env node
/**
 * verify-block38-rewards — block 38's Conviction, XP and rewards (Chapter 12,
 * pages 389–393), 3.619.0.
 *
 * Graham's rulings of 4 October 2026 (R1–R12, R14: "your recommendation on
 * all") on claude/audit-pages-387-400.md, and the audit's A1–A3.
 *
 *   A  the encounter tables: Threat Level, the XP budget, APL, Effective
 *      Level, EL − APL → XP (R1–R3)
 *   B  experience awards, split evenly; the accomplishments (R2)
 *   C  starting wealth above 1st level (R5); Treasure by Level (R6)
 *   D  Conviction: a point a level (R7), Hero's Fortune (R8), never below 0
 *      (A3), the use conditions (R10), NPCs and the switch (R11)
 *   E  the one-per-round gate: Dramatic Luck (A2), the trait (R10)
 *   F  Luck of Heroes and Hero's Resolve (R8)
 *   G  the three feats in the pack (R8)
 *   H  Endeavour awarded from the card (R12)
 *   I  the Party sheet's Rewards tab (R2, R6, R8)
 *   J  Heroic disabling earns three (A1, R14)
 *   K  the version
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const R = await import("../module/rewards.mjs");
const SW = await import("../module/starting-wealth.mjs");
const C = await import("../module/conviction.mjs");
const E = await import("../module/endeavour-award.mjs");
const { traitRestriction, emptyTraitUsage } = await import("../module/traits.mjs");
const { disableSuccesses, disableProgress } = await import("../module/thievery.mjs");
const { normaliseEncounter } = await import("../module/party-rewards-workflow.mjs");
const { BLOCK38_FEATS } = await import("./author-block38-feats.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ACTOR = strip(read("module", "documents", "actor.mjs"));
const CONV = strip(read("module", "conviction.mjs"));
const CHECK = strip(read("module", "dice", "check.mjs"));
const CARD = strip(read("module", "dice", "check-card-interactions.mjs"));
const FEATS_WF = strip(read("module", "feats-workflow.mjs"));
const TRAITS_WF = strip(read("module", "traits-workflow.mjs"));
const AP_WF = strip(read("module", "combat", "action-points-workflow.mjs"));
const SETTINGS = strip(read("module", "settings.mjs"));
const SHEET = strip(read("module", "sheets", "actor-sheet.mjs"));
const SHEET_HBS = read("templates", "actor", "actor-sheet.hbs");
const PARTY = strip(read("module", "sheets", "party-sheet.mjs"));
const PARTY_HBS = read("templates", "actor", "party-sheet.hbs");
const PARTY_WF = strip(read("module", "party-rewards-workflow.mjs"));
const WEALTH_WF = strip(read("module", "starting-wealth-workflow.mjs"));
const DIALOG = strip(read("module", "apps", "check-dialog.mjs"));
const TEMPLATE = JSON.parse(read("template.json"));

/* A — the encounter tables */
{
  ok("A1 the seven Threat Levels and their budgets, as printed",
    R.THREAT_LEVELS.map((t) => t.xp).join() === "50,100,150,200,300,400,500"
    && R.THREAT_LEVELS.map((t) => t.label).join() === "Incredibly Easy,Very Easy,Easy,Medium,Hard,Very Hard,Incredibly Hard");
  ok("A2 the XP column, as printed (−9 … +7)",
    Array.from({ length: 17 }, (_, i) => R.creatureXP(i - 9, 0).xp).join() === "20,40,60,80,100,150,200,250,300,400,500,600,800,1000,1200,1400,1600");
  ok("A3 R1 — read as EL − APL: a creature at the party's level is 400",
    R.creatureXP(5, 5).xp === 400);
  ok("A4 R1 — seven levels ABOVE the party is worth 1,600, nine BELOW 20",
    R.creatureXP(12, 5).xp === 1600 && R.creatureXP(1, 10).xp === 20, `${R.creatureXP(12, 5).xp} / ${R.creatureXP(1, 10).xp}`);
  ok("A5 THE PRINTED DIRECTION WOULD INVERT IT: one above is worth more than one below",
    R.creatureXP(6, 5).xp === 500 && R.creatureXP(4, 5).xp === 300);
  ok("A6 off the table: more than nine below is worth nothing; more than seven above is flagged at the top row",
    R.creatureXP(0, 10).xp === 0 && R.creatureXP(0, 10).beyond === "below"
    && R.creatureXP(13, 5).xp === 1600 && R.creatureXP(13, 5).beyond === "above" && R.creatureXP(12, 5).beyond === null);
  ok("A7 the page's own example: four PCs, Very Easy, a 400 XP budget — one creature at their level",
    R.encounterSummary({ creatures: [], apl: 3, threat: "veryEasy", members: 4 }).budget === 400
    && R.encounterSummary({ creatures: [{ el: 3 }], apl: 3, threat: "veryEasy", members: 4 }).total === 400);
  const apl = R.averagePartyLevel([4, 5, 5, 6]);
  ok("A8 APL is the average of the members' levels, rounded half up", apl.apl === 5 && apl.members === 4
    && R.averagePartyLevel([4, 5]).apl === 5 && R.averagePartyLevel([4, 4, 5]).apl === 4 && R.averagePartyLevel([]).apl === 0);
  ok("A9 R3 — Effective Level is the GM's box, or the level while it is blank",
    R.effectiveLevelOf({ gm: { challenge: 7 }, identity: { level: 3 } }) === 7
    && R.effectiveLevelOf({ gm: { challenge: 0 }, identity: { level: 3 } }) === 3);
  const built = R.encounterSummary({ creatures: [{ el: 5, count: 2 }, { el: 7 }], apl: 5, threat: "medium", members: 4 });
  ok("A10 an encounter totals each creature × its count against the budget",
    built.total === 400 * 2 + 600 && built.budget === 800 && built.over && built.actualThreat === "Hard",
    `${built.total} / ${built.budget} / ${built.actualThreat}`);
  ok("A11 the GM tab's box is labelled Effective Level", /<span>Effective Level<\/span>/.test(SHEET_HBS)
    && /name="system\.gm\.challenge"/.test(SHEET_HBS));
}

/* B — experience awards */
{
  ok("B1 the five accomplishments, as printed",
    R.ACCOMPLISHMENT_AWARDS.map((a) => `${a.label} ${a.xp}`).join() === "Minor 100,Moderate 200,Major 500,Epic 800,Legendary 1000");
  ok("B2 XP splits evenly; what does not divide is reported, not invented",
    R.splitXP(400, 4).each === 100 && R.splitXP(500, 3).each === 166 && R.splitXP(500, 3).remainder === 2 && R.splitXP(100, 0).each === 0);
  ok("B3 the award writes each character's share to XP, and only a character's",
    /if \(actor\.type !== "character"\) \{/.test(PARTY_WF)
    && /await actor\.update\(\{ "system\.identity\.xp\.value": before \+ each \}\);/.test(PARTY_WF)
    && /const \{ each, remainder \} = splitXP\(xp, members\.length\);/.test(PARTY_WF));
  ok("B4 only the GM awards", /if \(!game\.user\?\.isGM\) \{\s*ui\.notifications\?\.warn\("Only the GM awards experience\."\);/.test(PARTY_WF));
}

/* C — wealth */
{
  ok("C1 R5 — the Starting Wealth Table, as printed",
    Array.from({ length: 19 }, (_, i) => SW.startingWealthFor({ system: { identity: { level: i + 2 } }, items: [] }).gp).join()
      === "250,500,1000,2500,4000,6000,10000,15000,22000,30000,42000,60000,85000,125000,185000,275000,400000,600000,900000");
  const pc = (level) => ({ system: { identity: { level }, attributes: { charisma: { total: 2 } } }, items: [] });
  const five = SW.startingWealthFor(pc(5));
  const one = SW.startingWealthFor(pc(1));
  ok("C2 a new 5th-level character takes 2,500 gp; a 1st-level one keeps the Chapter 6 score",
    five.byLevel && five.gp === 2500 && !five.indebted && !one.byLevel && one.gp === one.score * SW.GP_PER_WEALTH_POINT, `${five.gp} / ${one.gp}`);
  ok("C3 the actor derives it and the payout pays it",
    /system\.wealth = startingWealthFor\(this\);/.test(ACTOR)
    && /const wealth = startingWealthFor\(actor\);/.test(WEALTH_WF)
    && /"system\.currency": purseAfterGrant\(actor\.system\?\.currency, wealth\.gp\)/.test(WEALTH_WF)
    && /await postCard\(actor, "Starting Wealth", wealth\.byLevel/.test(WEALTH_WF));
  ok("C4 R6 — Treasure by Level, as printed",
    Array.from({ length: 19 }, (_, i) => R.treasureGuide(i + 2).gp).join() === "1000,2000,4000,10000,16000,24000,40000,60000,88000,120000,168000,240000,340000,500000,740000,1100000,1600000,2400000,3600000"
    && Array.from({ length: 19 }, (_, i) => R.treasureGuide(i + 2).items).join() === "4,8,10,12,14,16,18,20,24,28,32,36,40,44,48,52,56,60,70");
  ok("C5 the guide begins at APL 2", R.treasureGuide(1) === null && R.treasureGuide(6).gp === 16000 && R.treasureGuide(25).apl === 20);
}

/* D — Conviction */
{
  ok("D1 R7 — a point for each level gained, never above the new maximum",
    C.convictionAfterLevelling({ fromLevel: 4, toLevel: 5, value: 0, max: 2 }) === 1
    && C.convictionAfterLevelling({ fromLevel: 4, toLevel: 6, value: 1, max: 2 }) === 2
    && C.convictionAfterLevelling({ fromLevel: 4, toLevel: 5, value: 2, max: 2 }) === 2
    && C.convictionAfterLevelling({ fromLevel: 5, toLevel: 4, value: 1, max: 1 }) === 1);
  ok("D2 written into the XP update itself, with a card after",
    /this\.#convictionOnLevelling\(changed, options\);/.test(ACTOR)
    && /const toLevel = levelForXP\(incomingXP\);/.test(ACTOR)
    && /foundry\.utils\.setProperty\(changed, "system\.resources\.conviction\.value", after\);/.test(ACTOR)
    && /const levelled = options\?\.trgConvictionLevelled;/.test(ACTOR));
  const holder = { items: [{ type: "feat", name: "Hero’s Fortune" }] };
  ok("D3 R8 — Hero's Fortune raises the maximum (either apostrophe)", C.heroesFortuneBonus(holder) === 1 && C.heroesFortuneBonus({ items: [] }) === 0
    && /scoundrelsLuckBonus\(this\) \+\s*heroesFortuneBonus\(this\)(?: \+\s*(?:\/\/[^\n]*\n\s*)?declaredConvictionBonus\(this\.items \?\? \[\]\))?;/.test(ACTOR));
  ok("D4 A3 — a typed negative conviction is written as 0",
    /if \(typedConviction !== undefined && !\(Number\(typedConviction\) >= 0\)\) \{\s*foundry\.utils\.setProperty\(changed, "system\.resources\.conviction\.value", 0\);/.test(ACTOR));
  const current = { combatId: "c1", round: 3 };
  ok("D5 R10 — Boost Your Defence only in combat, and before any AP this round",
    !C.boostDefenceTiming({ inCombat: false, apSpent: null, current: null }).ok
    && C.boostDefenceTiming({ inCombat: true, apSpent: { combatId: "c1", round: 2 }, current }).ok
    && !C.boostDefenceTiming({ inCombat: true, apSpent: { combatId: "c1", round: 3 }, current }).ok);
  ok("D6 every AP spend stamps the round", /\[`flags\.\$\{SYSTEM_ID\}\.apSpentRound`\]: \{ combatId: game\.combat\.id, round: game\.combat\.round(?:, turn: game\.combat\.turn)? \}/.test(AP_WF)
    && /const timing = boostDefenceTiming\(\{/.test(CONV) && /if \(!timing\.ok\) return ui\.notifications\.warn\(timing\.reason\);/.test(CONV));
  ok("D7 R10 — Recurring Healing costs 1 AP; Cancel Fatigue is not for combat",
    /const RECURRING_HEALING_AP = 1;/.test(CONV)
    && /if \(!await ensureActionPoints\(actor, RECURRING_HEALING_AP, "Recurring Healing"\)\) return;/.test(CONV)
    && /await spendActionPoints\(actor, RECURRING_HEALING_AP, "Recurring Healing"\);/.test(CONV)
    && /if \(await actorRoundContext\(actor\)\) \{\s*return ui\.notifications\.warn\("Cancel Fatigue requires 10 minutes of rest — not in combat\."\);/.test(CONV));
  ok("D8 R11 — an NPC's pool is typed, not derived; a new NPC starts at 0/0",
    /if \(conviction && this\.type !== "npc"\) \{/.test(ACTOR)
    && /if \(this\.type === "npc" && !this\.flags\?\.\["trg-prime"\]\?\.convictionGranted\) \{\s*update\["system\.resources\.conviction"\] = \{ value: 0, max: 0 \};/.test(ACTOR)
    && /\{\{#if isNPC\}\}data-tooltip="An NPC's pool is the GM's to give/.test(SHEET_HBS));
  ok("D9 R11 — the world may switch Conviction off, and then nothing offers it",
    /game\.settings\.register\(SYSTEM_ID, "useConviction", \{[\s\S]*?default: true/.test(SETTINGS)
    && /if \(!convictionEnabled\(\)\) \{\s*return \{[\s\S]*?ok: false,/.test(CONV)
    && /context\.useConviction = /.test(SHEET) && /\{\{#if useConviction\}\}\s*<div class="resource conviction"/.test(SHEET_HBS)
    && /if \(state\.value > 0 && convictionEnabled\(\)\) conviction = state;/.test(DIALOG));
  {
    const saved = globalThis.game;
    let written = null;
    globalThis.game = { settings: { get: () => true } };
    await C.awardConviction({ system: { resources: { conviction: { value: 0, max: 0 } } }, update: async (u) => { written = u; } }, 1);
    const zero = written?.["system.resources.conviction.value"];
    globalThis.game = { settings: { get: () => false } };
    const off = C.getConvictionState({ system: { resources: { conviction: { value: 1, max: 1 } } }, getFlag: () => null });
    globalThis.game = saved;
    ok("D10 a pool of nothing is awarded nothing (it read a maximum of 0 as 1)", zero === 0, String(zero));
    ok("D11 switched off, no point may be spent", off.ok === false && /not used/.test(off.reason));
  }
}

/* L — the 3.619.0 drive (3.620.0) */
{
  const AWARD = strip(read("module", "endeavour-award.mjs"));
  ok("L1 F1 — the maximum is read from the level XP gives, not the stored field",
    /const baseLevel = this\.type === "character" && this\.system\.identity\?\.xp\s*\? levelForXP\(this\.system\.identity\.xp\.value\)/.test(ACTOR)
    && /conviction\.max = convictionMax\(baseLevel\) \+/.test(ACTOR));
  ok("L2 F2 — one set of award buttons: asked again after the last await",
    /if \(!awards\.length\) return;\s*if \(card\.querySelector\("\.endeavour-award"\)\) return;/.test(AWARD));
  ok("L3 F3 — a disable banks the rolled degree, not the card's",
    /const disableDegree = rawDegree \?\? degree;/.test(strip(read("module", "combat", "action-workflow.mjs")))
    && /const earned = disableSuccesses\(disableDegree\);/.test(strip(read("module", "combat", "action-workflow.mjs"))));
}

/* E — one per round */
{
  ok("E1 A2 — Dramatic Luck goes through the gate and counts as the round's point",
    /const state = getConvictionState\(actor\);\s*if \(!state\.ok\) \{\s*ui\.notifications\.warn\(`Dramatic Luck: \$\{state\.reason\}`\);/.test(FEATS_WF)
    && /await markConvictionSpent\(actor\);/.test(FEATS_WF)
    && !/"system\.resources\.conviction\.value": conviction - 1/.test(FEATS_WF));
  ok("E2 R10 — the Conviction trait asks the round's spend, not a per-turn count",
    traitRestriction({ traits: "Conviction" }, emptyTraitUsage(), { convictionSpentThisRound: true }).blocked
    && !traitRestriction({ traits: "Conviction" }, emptyTraitUsage(), { convictionSpentThisRound: false }).blocked
    && !("conviction" in emptyTraitUsage())
    && /convictionSpentThisRound: Boolean\(spent && combat && spent\.combatId === combat\.id && spent\.round === combat\.round\)/.test(TRAITS_WF));
}

/* F — Luck of Heroes and Hero's Resolve */
{
  ok("F1 R8 — Luck of Heroes: DC 15, Advantage and Bonus only", /const LUCK_OF_HEROES_DC = 15;/.test(CONV)
    && /const LUCK_OF_HEROES_SPENDS = Object\.freeze\(\["advantage", "bonus"\]\);/.test(CONV));
  ok("F2 rolled at the Advantage spend, and a kept point is not refunded again by Scoundrel's Luck",
    /if \(advantageSpent\) advantageKept = await luckOfHeroes\(check\.actor, "advantage"\);/.test(CHECK)
    && /if \(advantageSpent && !advantageKept && check\.actor &&/.test(CHECK)
    && /label: advantageKept \? "Conviction: Advantage \(kept, Luck of Heroes\)" : "Conviction: Advantage",/.test(CHECK));
  ok("F3 and at the Bonus", /await markConvictionSpent\(actor\);\s*await recomputeAndUpdate\(message, raw, \{ extraRoll: roll \}\);\s*const \{ luckOfHeroes \} = await import\("\.\.\/conviction\.mjs"\);\s*await luckOfHeroes\(actor, "bonus"\);/.test(CARD));
  ok("F4 the flat check keeps the point but not the round",
    /if \(!check\?\.outcome\?\.degree\?\.success\) return false;/.test(CONV)
    && /dc: LUCK_OF_HEROES_DC/.test(CONV) && !/luckOfHeroes[\s\S]{0,1500}unsetFlag\(SYSTEM_ID, SPENT_FLAG\)/.test(CONV));
  ok("F5 Hero's Resolve: Begin Session gives each holder a point, capped",
    /if \(!hasConvictionFeat\(actor, CONVICTION_FEATS\.resolve\)\) continue;/.test(PARTY_WF)
    && /if \(value >= max\) \{/.test(PARTY_WF)
    && /await actor\.update\(\{ "system\.resources\.conviction\.value": value \+ 1 \}\);/.test(PARTY_WF));
}

/* G — the feats in the pack */
{
  // Read through a copy: opening the pack itself writes its LOG and LOCK.
  const found = {};
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "b38feats-"));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "feats"), tmp, { recursive: true });
  const copy = new ClassicLevel(tmp, { valueEncoding: "json" });
  await copy.open();
  for (const row of BLOCK38_FEATS) {
    try { found[row.name] = await copy.get(`!items!${row._id}`); } catch { found[row.name] = null; }
  }
  await copy.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  const f = found["Hero's Fortune"], r = found["Hero's Resolve"], l = found["Luck of Heroes"];
  ok("G1 Hero's Fortune is in the pack: General, Conviction", f?.system?.category === "General" && f?.system?.traits === "Conviction");
  ok("G2 Hero's Resolve: Hero's Fortune, Level 8", r?.system?.prerequisites === "Hero's Fortune, Level 8" && r?.system?.traits === "Conviction");
  ok("G3 Luck of Heroes: Class, Conviction Martial; Hero's Fortune, Level 5",
    l?.system?.category === "Class" && l?.system?.traits === "Conviction, Martial" && l?.system?.prerequisites === "Hero's Fortune, Level 5");
  ok("G4 the code reads the names the pack holds",
    Object.values(C.CONVICTION_FEATS).join() === "Hero's Fortune,Hero's Resolve,Luck of Heroes");
}

/* H — Endeavour from the card */
{
  ok("H1 R12 — the reward table, as printed",
    E.ENDEAVOUR_AWARDS.heroicRisk.amount === 2 && E.ENDEAVOUR_AWARDS.heroic.amount === 1
    && E.ENDEAVOUR_AWARDS.blunderRisk.amount === 1 && E.ENDEAVOUR_AWARDS.challenge.amount === 1);
  ok("H2 offered by the degree: Heroic two rows and a challenge; Blunder one; a plain success only the challenge; a failure nothing",
    E.endeavourAwardsFor("heroic").join() === "heroicRisk,heroic,challenge"
    && E.endeavourAwardsFor("blunder").join() === "blunderRisk"
    && E.endeavourAwardsFor("success").join() === "challenge"
    && E.endeavourAwardsFor("failure").length === 0);
  ok("H3 one amount per check, a character's, with the rule on",
    E.endeavourAwardOpen({ characterCard: true, enabled: true, alreadyAwarded: false })
    && !E.endeavourAwardOpen({ characterCard: true, enabled: true, alreadyAwarded: true })
    && !E.endeavourAwardOpen({ characterCard: false, enabled: true, alreadyAwarded: false })
    && !E.endeavourAwardOpen({ characterCard: true, enabled: false, alreadyAwarded: false }));
  const AWARD = strip(read("module", "endeavour-award.mjs"));
  ok("H4 the card records its award before the character's Endeavour rises; a second click finds it",
    /if \(message\.getFlag\(SYSTEM_ID, ENDEAVOUR_AWARD_FLAG\)\) return null;/.test(AWARD)
    && /await message\.setFlag\(SYSTEM_ID, ENDEAVOUR_AWARD_FLAG,[\s\S]*?\);\s*await actor\.update\(\{ "system\.resources\.endeavour\.value": before \+ row\.amount \}\);/.test(AWARD)
    && /if \(!game\.user\?\.isGM\) return;/.test(AWARD));
  ok("H5 wired to every rendered card", /maybeAddEndeavourAward\(message, html, cardActor\)/.test(CARD));
}

/* I — the Party sheet */
{
  ok("I1 a Rewards tab, with its panel", /\{ id: "rewards", icon: "fa-solid fa-trophy", label: "Rewards" \}/.test(PARTY)
    && /data-tab="rewards"/.test(PARTY_HBS) && /rewards: await rewardsContext\(actor\),/.test(PARTY));
  ok("I2 the encounter is stored on the party", TEMPLATE.Actor.party.encounter?.threat === "medium" && Array.isArray(TEMPLATE.Actor.party.encounter?.creatures));
  ok("I3 on that tab, a dropped actor is an adversary, not a member",
    /if \(data\?\.type === "Actor" && this\.tabGroups\?\.primary === "rewards"\) \{/.test(PARTY));
  const enc = normaliseEncounter({ threat: "bogus", creatures: [{ uuid: "A", count: 2 }, { uuid: "A" }, { uuid: "" }, { uuid: "B", count: 0 }] });
  ok("I4 the stored encounter is cleaned: duplicates merge, blanks drop, a bad threat is Medium",
    enc.threat === "medium" && enc.creatures.length === 2 && enc.creatures[0].count === 3 && enc.creatures[1].count === 1);
  ok("I5 the buttons: award the encounter, the accomplishments, a custom amount, Begin Session",
    ["awardEncounterXP", "awardAccomplishment", "awardCustomXP", "beginSession", "addSelectedTokens"].every((a) => PARTY_HBS.includes(`data-action="${a}"`) && PARTY.includes(`${a}: TRGPartySheet.${a}`)));
  ok("I6 the counts and the custom amount are unnamed, so the form never submits them",
    /data-encounter-count/.test(PARTY_HBS) && /data-custom-xp/.test(PARTY_HBS) && !/name="encounterCount"|name="customXP"/.test(PARTY_HBS));
}

/* J — Heroic disabling */
{
  ok("J1 A1/R14 — a Heroic earns three successes; a Critical two", disableSuccesses("heroic") === 3 && disableSuccesses("critical") === 2 && disableSuccesses("success") === 1);
  ok("J2 and progress banks it", disableProgress(0, 3, "heroic").done && disableProgress(0, 4, "heroic").banked === 3);
}

/* K — the version */
{
  const sys = JSON.parse(read("system.json"));
  const atLeast = (v) => String(v ?? "").localeCompare("3.619.0", undefined, { numeric: true }) >= 0;
  ok("K1 the version is 3.619.0 or later", atLeast(sys.version));
}

if (failures.length) {
  console.log(`verify-block38-rewards: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block38-rewards: OK — ${checks} checks. Threat Levels, EL − APL, XP awards, starting wealth by level, treasure, Conviction's levels, feats, timing, NPC pools and switch, Luck of Heroes, Hero's Resolve, Endeavour from the card, and Heroic disabling.`);
