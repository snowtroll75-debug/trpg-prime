#!/usr/bin/env node
/**
 * verify-block40-luck — Appendix 5 (Luck), 3.624.0.
 *
 * Graham's rulings of 6 October 2026 on claude/audit-pages-410-end.md,
 * R11–R17, all "your recommendation":
 *
 *   A  the pure rules: the floor, Halfling Luck, eligibility, the Fumble's
 *      "whichever is worse", regaining, an NPC's luck
 *   B  luck on the check itself — driven through TRGCheck under stubs
 *   C  one fortune per check; Luck or Conviction
 *   D  regaining: the critical injury, the natural 20
 *   E  NPC luck: creation and the migration
 *   F  Resurrection leaves luck alone; the setting and the sheet
 *   G  the version and the schema
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

/* -- stubs: enough Foundry for TRGCheck to roll and post -- */
const faces = [];
globalThis.foundry = {
  applications: {
    api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c },
    handlebars: { renderTemplate: async () => "<div></div>" }
  },
  utils: { mergeObject: (a, b) => ({ ...a, ...b }), setProperty: () => {}, deepClone: (x) => JSON.parse(JSON.stringify(x)) }
};
globalThis.Roll = class { constructor(f) { this.f = f; } async evaluate() { this.total = faces.length ? faces.shift() : 10; return this; } };
const posted = [];
globalThis.ChatMessage = { create: async (d) => { posted.push(d); return d; }, getSpeaker: () => ({}), applyMode: () => {} };
globalThis.renderTemplate = async () => "<div></div>";
const notes = [];
globalThis.ui = { notifications: { warn: (m) => notes.push(m), info: (m) => notes.push(m) } };
const settings = { enableLuck: true, openEndedChecks: "none", chaosResults: false, messageMode: "public" };
globalThis.game = { settings: { get: (s, k) => settings[k] }, combat: null, user: { id: "u", isGM: true }, messages: { contents: [] } };
globalThis.CONFIG = {};

const L = await import("../module/luck.mjs");
const { applyLuckToCheck, lastCheckTouchedByLuck, regainLuckFromInjury } = await import("../module/luck-workflow.mjs");
const { TRGCheck } = await import("../module/dice/check.mjs");
const { restoredResourceUpdate, restoredLine } = await import("../module/magic/resurrection.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const code = (...p) => read(...p).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

function makeActor({ type = "character", luck = 15, items = [] } = {}) {
  const flags = {};
  const actor = {
    id: "a", uuid: "Actor.a", name: "Tebb", type, items, effects: [], appliedEffects: [],
    system: { resources: { luck: { value: luck } } },
    getFlag: (s, k) => flags[k], setFlag: async (s, k, v) => { flags[k] = v; }, unsetFlag: async (s, k) => { delete flags[k]; },
    update: async (u) => {
      for (const [k, v] of Object.entries(u)) if (k === "system.resources.luck.value") actor.system.resources.luck.value = v;
    }
  };
  return actor;
}
const plainCheck = (actor, extra = {}) => ({ actor, type: "skill", flat: false, label: "Climb", bias: "normal", modifiers: [], chanceUsed: "", ...extra });
const reset = () => { faces.length = 0; notes.length = 0; posted.length = 0; game.combat = null; settings.enableLuck = true; };

/* A — the pure rules */
{
  ok("A1 a luck check costs a point down to the floor of 2", L.applyLuckReduction(15, 1) === 14 && L.applyLuckReduction(3, 1) === 2 && L.applyLuckReduction(2, 1) === 2);
  ok("A2 THE OLD DEFECT, cured: the floor no longer raises a score of 0 or 1", L.applyLuckReduction(0, 1) === 0 && L.applyLuckReduction(1, 1) === 1);
  ok("A3 a Critical costs nothing", L.applyLuckReduction(15, L.luckCheckOutcome("critical").reduceLuck) === 15);
  ok("A4 THE OLD DEFECT, cured: Luck of the Small Folk is Halfling Luck",
    L.hasHalflingLuck(["Luck of the Small Folk"]) && L.hasHalflingLuck(["Halfling Luck"]) && L.hasHalflingLuck(["luck of the small folk"]));
  ok("A5 ...and nothing else is", !L.hasHalflingLuck(["Lucky Break", "More Small Folk Luck", "Daring Fortune"]));
  ok("A6 the DC: 20, or 18 with Halfling Luck", L.luckCheckDC(false) === 20 && L.luckCheckDC(true) === 18);
  const elig = (o) => L.luckEligibility({ enabled: true, checkType: "skill", ...o });
  ok("A7 a skill check, an attack and a save may take luck",
    ["skill", "attack", "save"].every((t) => elig({ checkType: t }).ok));
  ok("A8 a Spellcraft check, a flat check or initiative may not",
    !elig({ checkType: "spellcraft" }).ok && !elig({ flat: true }).ok && !elig({ checkType: "initiative" }).ok);
  ok("A9 not while the rule is off", !elig({ enabled: false }).ok);
  const r1 = { combatId: "c", round: 1 };
  ok("A10 once a round in combat", !elig({ spent: r1, current: r1 }).ok && elig({ spent: r1, current: { combatId: "c", round: 2 } }).ok
    && elig({ spent: r1, current: { combatId: "d", round: 1 } }).ok);
  ok("A11 outside combat, no round limit", elig({ spent: r1, current: null }).ok);
  ok("A12 not on a check Conviction has touched", /Conviction/.test(elig({ convictionTouched: true }).reason ?? ""));
  ok("A13 not on a check another fortune or Chance effect has altered", /Fateful Temptation/.test(elig({ chanceUsed: "Fateful Temptation" }).reason ?? ""));
  const f = L.luckFumbleChoice;
  ok("A14 Fumble, normal roll 15/8: Disadvantage (8) is worse than −5 (10)",
    JSON.stringify(f({ bias: "normal", totals: [15, 8] })) === JSON.stringify({ index: 1, penalty: 0, total: 8, label: "Luck fumbled: disadvantage (worse than −5)" }));
  ok("A15 Fumble, normal roll 15/14: −5 (10) is worse than Disadvantage (14)",
    f({ bias: "normal", totals: [15, 14] }).penalty === -5 && f({ bias: "normal", totals: [15, 14] }).index === 0);
  ok("A16 Fumble on an Advantage roll 15/8: Disadvantage cancels to the first die (15); −5 on the kept 15 gives 10, worse",
    f({ bias: "advantage", totals: [15, 8] }).total === 10 && f({ bias: "advantage", totals: [15, 8] }).index === 0);
  ok("A17 Fumble on a Disadvantage roll 15/8: −5 on the 8 (3)",
    f({ bias: "disadvantage", totals: [15, 8] }).total === 3 && f({ bias: "disadvantage", totals: [15, 8] }).index === 1);
  ok("A18 a critical injury over 90 regains luck; 90 does not", L.injuryRegainsLuck(91) && !L.injuryRegainsLuck(90));
  ok("A19 a natural 20 offers the award; a 19, a luck check, an awarded card or the rule off do not",
    L.naturalTwentyOffersLuck({ enabled: true, checkType: "skill", unmodified: 20 })
      && !L.naturalTwentyOffersLuck({ enabled: true, checkType: "skill", unmodified: 19 })
      && !L.naturalTwentyOffersLuck({ enabled: true, checkType: "luck", unmodified: 20 })
      && !L.naturalTwentyOffersLuck({ enabled: true, checkType: "skill", unmodified: 20, awarded: true })
      && !L.naturalTwentyOffersLuck({ enabled: false, checkType: "skill", unmodified: 20 }));
  ok("A20 an NPC, companion or familiar arriving with the player's 15 gets 0; a character keeps it; a typed score stays",
    L.luckOnCreate("npc", 15) === 0 && L.luckOnCreate("companion", 15) === 0 && L.luckOnCreate("familiar", 15) === 0
      && L.luckOnCreate("character", 15) === null && L.luckOnCreate("npc", 6) === null);
}

/* B — luck on the check itself */
{
  reset();
  let actor = makeActor();
  let check = plainCheck(actor);
  faces.push(10); // 10 + 15 = 25 vs 20: Success
  let said = await applyLuckToCheck(check, { requested: true });
  ok("B1 a successful luck check gives the check Advantage and costs a point",
    check.bias === "advantage" && check.luckUsed === true && actor.system.resources.luck.value === 14 && /Advantage/.test(said.join(" ")),
    `${check.bias} ${actor.system.resources.luck.value} ${said}`);
  ok("B2 ...and closes the check to other Chance effects", check.chanceUsed === "Luck");
  ok("B3 the luck check posts its own card, as type \"luck\"",
    posted.some((p) => p.flags?.["trg-prime"]?.checkCard?.type === "luck"));

  reset();
  actor = makeActor();
  check = plainCheck(actor);
  faces.push(20); // 35: Critical
  await applyLuckToCheck(check, { requested: true });
  ok("B4 a Critical: Advantage, no point lost", check.bias === "advantage" && actor.system.resources.luck.value === 15);

  reset();
  actor = makeActor();
  check = plainCheck(actor);
  faces.push(1); // 16 vs 20: Partial/Failure
  said = await applyLuckToCheck(check, { requested: true });
  ok("B5 a Failure: the check is unchanged, a point lost", check.bias === "normal" && !check.luckFumble && actor.system.resources.luck.value === 14
    && /unchanged/.test(said.join(" ")));

  reset();
  actor = makeActor({ luck: 2 });
  check = plainCheck(actor);
  faces.push(1); // 3 vs 20: Fumble
  said = await applyLuckToCheck(check, { requested: true });
  ok("B6 a Fumble marks the check for the worse of Disadvantage and −5", check.luckFumble === true && /worse of Disadvantage and −5/.test(said.join(" ")));

  // THE FUMBLE ON THE CHECK'S OWN DICE.
  reset();
  actor = makeActor();
  const fumbled = new TRGCheck({ actor, type: "skill", label: "Climb", dc: 15, modifiers: [{ label: "Athletics", value: 3, type: "untyped" }] });
  fumbled.luckFumble = true;
  faces.push(15, 14);
  await fumbled.evaluate();
  ok("B7 the fumble rolls a second die and takes the worse: 15/14 → 15 − 5 (+3 = 13)",
    fumbled.outcome.total === 13 && fumbled.modifiers.some((m) => m.label.startsWith("Luck fumbled: −5")), JSON.stringify(fumbled.outcome.total));
  const again = new TRGCheck({ actor, type: "skill", label: "Climb", dc: 15, modifiers: [] });
  again.luckFumble = true;
  faces.push(15, 8);
  await again.evaluate();
  ok("B8 ...15/8 → the 8, Disadvantage", again.outcome.total === 8 && again.modifiers.some((m) => m.value === 0 && /disadvantage/.test(m.label)));
  faces.push(12, 18);
  await again.reroll();
  ok("B9 a reroll replaces the fumble line rather than adding a second",
    again.modifiers.filter((m) => m.luckFumble).length === 1);

  // THROUGH TRGCheck.roll: the dialog's "Use Luck", and luck armed from the sheet.
  reset();
  actor = makeActor();
  faces.push(10, 4, 17); // the luck die, then the check's two dice under Advantage
  const rolled = await TRGCheck.roll({ actor, type: "skill", label: "Climb", dc: 15, useLuck: true, conditionalsResolved: true, modifiers: [] });
  const card = posted.find((p) => p.flags?.["trg-prime"]?.checkCard?.type === "skill")?.flags?.["trg-prime"]?.checkCard;
  ok("B10 TRGCheck.roll with useLuck: the luck check, then the check with Advantage (4/17 → 17)",
    rolled.luckUsed && rolled.outcome.total === 17 && actor.system.resources.luck.value === 14, `${rolled.outcome.total}`);
  ok("B11 ...and the card records that luck changed it", card?.luckUsed === true);
  reset();
  actor = makeActor();
  await actor.setFlag("trg-prime", "luckArmed", true);
  faces.push(10, 4, 17);
  const armed = await TRGCheck.roll({ actor, type: "attack", label: "Longsword — Attack", dc: 15, conditionalsResolved: true, modifiers: [], toMessage: false });
  ok("B12 luck armed from the sheet reaches an attack, which opens no dialog, and is used up",
    armed.luckUsed && armed.outcome.total === 17 && actor.getFlag("trg-prime", "luckArmed") === undefined);
  reset();
  actor = makeActor();
  await actor.setFlag("trg-prime", "luckArmed", true);
  faces.push(9);
  const init = await TRGCheck.roll({ actor, type: "spellcraft", label: "Spellcraft", dc: 15, conditionalsResolved: true, modifiers: [], toMessage: false });
  ok("B13 an armed luck waits through a check it cannot change", !init.luckUsed && actor.getFlag("trg-prime", "luckArmed") === true);
  reset();
  actor = makeActor();
  faces.push(10);
  const luckOnly = await TRGCheck.roll({ actor, type: "luck", label: "Luck Check", dc: 20, conditionalsResolved: true,
    modifiers: [{ label: "Luck Score", value: 15, type: "untyped" }], toMessage: false });
  ok("B14 THE OLD DEFECT, cured: the luck check follows the world's open-ended setting",
    luckOnly.openEnded === "none" && !/OPEN_ENDED\.NONE/.test(code("module", "luck-workflow.mjs")));
  ok("B15 THE OLD DEFECT, cured: the luck check is its own type, so it takes no conditionals or pending modifiers",
    /type: "luck",\s*dc,\s*conditionalsResolved: true,/.test(code("module", "luck-workflow.mjs")) && !/type: "generic"/.test(code("module", "luck-workflow.mjs")));
}

/* C — one fortune per check; Luck or Conviction */
{
  reset();
  const actor = makeActor();
  game.combat = { started: true, id: "c", round: 3 };
  faces.push(10);
  await applyLuckToCheck(plainCheck(actor), { requested: true });
  faces.push(10);
  const second = plainCheck(actor);
  const said = await applyLuckToCheck(second, { requested: true });
  ok("C1 THE OLD DEFECT, cured: a second luck check in the same round is refused, nothing spent",
    !second.luckUsed && /once per round/.test(said.join(" ")) && actor.system.resources.luck.value === 14);
  game.combat.round = 4;
  faces.push(10);
  const third = plainCheck(actor);
  await applyLuckToCheck(third, { requested: true });
  ok("C2 ...and allowed the next round", third.luckUsed === true);
  reset();
  const actor2 = makeActor();
  const conv = plainCheck(actor2, { convictionAdvantage: true });
  const refused = await applyLuckToCheck(conv, { requested: true });
  ok("C3 luck is refused on a check Conviction's Advantage is on", !conv.luckUsed && /Conviction/.test(refused.join(" ")) && actor2.system.resources.luck.value === 15);
  const roll = code("module", "dice", "check.mjs");
  ok("C4 luck runs before Fateful Temptation, Unity and the save reactions in TRGCheck.roll",
    roll.indexOf("applyLuckToCheck(check, { requested: check.useLuck })") > 0
      && roll.indexOf("applyLuckToCheck(check, { requested: check.useLuck })") < roll.indexOf("offerSaveReaction(check.actor")
      && roll.indexOf("applyLuckToCheck(check, { requested: check.useLuck })") < roll.indexOf("offerFatefulTemptation(check)"));
  ok("C5 Lucky Break, Unity and Seer's Vision ask chanceUsed, which luck sets",
    /&& check\.outcome\?\.degree\?\.key && !check\.chanceUsed\)/.test(roll) && /if \(this\.chanceUsed\) return;/.test(roll));
  const cards = code("module", "dice", "check-card-interactions.mjs");
  ok("C6 the Conviction Bonus is not offered, and refused, on a luck card",
    /!raw\.bonusUsed &&\s*!raw\.luckUsed &&/.test(cards) && /if \(raw\.luckUsed\) \{\s*ui\.notifications\.warn\("Luck already affects this check/.test(cards)
      && /this\.allowConviction && !this\.luckUsed &&/.test(roll));
  ok("C7 Unbreakable Resolve does not reroll a luck card", /if \(!raw \|\| raw\.type !== "save"\) return;\s*if \(raw\.luckUsed\) return;/.test(cards));
  game.messages.contents = [
    { getFlag: (s, k) => (k === "checkCard" ? { type: "save", actorUuid: "Actor.a", luckUsed: true } : undefined) },
    { getFlag: (s, k) => (k === "checkCard" ? { type: "luck", actorUuid: "Actor.a" } : undefined) }
  ];
  ok("C8 the last check luck touched is found past the luck check's own card", lastCheckTouchedByLuck(makeActor()));
  game.messages.contents.push({ getFlag: (s, k) => (k === "checkCard" ? { type: "skill", actorUuid: "Actor.a" } : undefined) });
  ok("C9 ...and a later, untouched check clears it", !lastCheckTouchedByLuck(makeActor()));
  game.messages.contents = [];
  ok("C10 Luck of the Small Folk refuses a luck-touched check",
    /const \{ lastCheckTouchedByLuck \} = await import\("\.\/luck-workflow\.mjs"\);\s*if \(lastCheckTouchedByLuck\(actor\)\) \{/.test(code("module", "feats-workflow.mjs")));
  const dialog = code("module", "apps", "check-dialog.mjs");
  ok("C11 the roll dialog offers Use Luck and returns it", /name="useLuck"/.test(dialog) && /useLuck: Boolean\(result\.useLuck\),/.test(dialog));
  ok("C12 the sheet and the action workflow pass it to the roll",
    /useLuck: Boolean\(situational\?\.useLuck\),/.test(code("module", "sheets", "actor-sheet.mjs"))
      && /useLuck: Boolean\(situational\?\.useLuck\),/.test(code("module", "combat", "action-workflow.mjs")));
}

/* D — regaining */
{
  reset();
  const pc = makeActor({ luck: 7 });
  const line91 = await regainLuckFromInjury(pc, 91);
  ok("D1 a character taking a critical injury over 90 regains 1 luck", pc.system.resources.luck.value === 8 && /regains 1 luck/.test(line91));
  ok("D2 not at 90, not an NPC, not with the rule off",
    (await regainLuckFromInjury(pc, 90)) === "" && (await regainLuckFromInjury(makeActor({ type: "npc", luck: 0 }), 99)) === ""
      && (settings.enableLuck = false, (await regainLuckFromInjury(pc, 99)) === "") && pc.system.resources.luck.value === 8);
  settings.enableLuck = true;
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("D3 rollCriticalInjury awards it once, on the roll and not on a forced re-read, before the row is read",
    /if \(forced === null\) \{\s*const \{ regainLuckFromInjury \} = await import\("\.\.\/luck-workflow\.mjs"\);\s*const regained = await regainLuckFromInjury\(targetActor \?\? actor, result\);\s*if \(regained\) lines\.push\(line\(regained\)\);\s*\}\s*let row = lookupTableRow\(table, result\);/.test(aw));
  const cards = code("module", "dice", "check-card-interactions.mjs");
  ok("D4 the GM's natural-20 award button is wired on every card render",
    /maybeAddLuckAward\(message, html\)\.catch/.test(cards) && /async function maybeAddLuckAward\(message, html\) \{\s*if \(!game\.user\?\.isGM\) return;/.test(cards)
      && /await message\.setFlag\(SYSTEM_ID, "luckAwarded", true\);/.test(cards));
}

/* E — NPC luck */
{
  const actorDoc = code("module", "documents", "actor.mjs");
  ok("E1 an actor's creation applies luckOnCreate",
    /const luck = luckOnCreate\(this\.type, this\.system\?\.resources\?\.luck\?\.value\);\s*if \(luck !== null\) update\["system\.resources\.luck\.value"\] = luck;/.test(actorDoc));
  const mig = code("module", "migration.mjs");
  ok("E2 the migration resets NPCs still at 15, at schema 3.624.0, and says so",
    /runIf\("3\.624\.0", [^)]*\(\) => migrateNpcLuck\(actors, tokenActors\)\)/.test(mig) && /result\.npcLuck\?\.length/.test(mig)
      && /const value = luckOnCreate\(actor\.type,/.test(mig));
}

/* F — Resurrection, the setting, the sheet */
{
  const update = restoredResourceUpdate();
  ok("F1 THE OLD DEFECT, cured: Resurrection leaves luck alone", !("system.resources.luck.value" in update));
  ok("F2 ...and its card says so", /Luck is the player's and is untouched/.test(restoredLine("X")));
  const settingsCode = read("module", "settings.mjs");
  const hint = /register\(SYSTEM_ID, "enableLuck",[\s\S]{0,700}?hint:\s*"([^"]*)"/.exec(settingsCode)?.[1] ?? "";
  ok("F3 the setting's hint no longer mentions Doomed", hint && !/Doomed/.test(hint) && /fortune/.test(hint), hint);
  const hbs = read("templates", "actor", "actor-sheet.hbs");
  ok("F4 the sheet's button says when luck is armed", /\{\{#if luckArmed\}\} \(armed\)\{\{\/if\}\}/.test(hbs)
    && /context\.luckArmed = Boolean\(actor\.getFlag\(SYSTEM_ID, "luckArmed"\)\);/.test(code("module", "sheets", "actor-sheet.mjs")));
}

/* G — the version and the schema */
{
  const sys = JSON.parse(read("system.json"));
  ok("G1 the version is 3.624.0 or later", String(sys.version).localeCompare("3.624.0", undefined, { numeric: true }) >= 0);
  ok("G2 the schema is past the luck pass (3.627.1, the Undead effect repair, is the newest)", /export const TRG_SCHEMA_VERSION = "3\.627\.1";/.test(read("module", "migration.mjs")));
}

if (failures.length) {
  console.log(`verify-block40-luck: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block40-luck: OK — ${checks} checks. Appendix 5: luck changes the check it is for, once a round, alone, and comes back on a natural 20 or a dreadful wound.`);
