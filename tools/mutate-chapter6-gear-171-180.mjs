#!/usr/bin/env node
/**
 * mutate-chapter6-gear-171-180 — can the pages 171-180 checks fail?
 *
 * NEW at 3.577.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECTS FIRST, each put back as it stood: a kit spent to
 * nothing that still counted, alchemy without its feat or its kit, a
 * rider who fell and stayed mounted, an elixir whose level was never read.
 * Then every new rule, one line at a time.
 *
 * 3.577.1 adds Graham's R5 (herbs by Crafting or Nature, DC +5 without the
 * feat, ruined on a Fumble) and the three things the 3.577.0 live test
 * found: F1 an alchemist without a Crafting specialty refused, F2 an empty
 * Set DC box read as DC 0, F3 "Tester is Fist of Rock".
 *
 * 3.577.2 adds the vehicle sheet's hidden creature numbers (Graham's ruling
 * after 3.577.1) and F4, the ruined herb's card printing Chapter 4's
 * Fumble row above its own.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const GOODS = at("goods.mjs");
const GOODSWF = at("goods-workflow.mjs");
const TOOLS = at("tools-requirement.mjs");
const CRAFTFEATS = at("crafting-feats.mjs");
const CREATEWF = at("create-crafting-workflow.mjs");
const CREATE = at("create-crafting.mjs");
const ACTIONWF = at("combat", "action-workflow.mjs");
const ELIXIRS = at("elixirs.mjs");
const REGISTRY = at("conditions", "registry.mjs");
const CONSUMEWF = at("consumable-use-workflow.mjs");
const ATTACK = at("combat", "attack-workflow.mjs");
const COMBAT = at("documents", "combat.mjs");
const REST = at("rest", "rest-workflow.mjs");
const MOUNTED = at("combat", "mounted.mjs");
const RUNEBEAR = at("rune-bearing.mjs");
const RUNEFX = at("rune-effects.mjs");
const ACTOR = at("documents", "actor.mjs");
const ITEMSHEET = at("sheets", "item-sheet.mjs");
const VEHICLES = at("vehicles.mjs");
const VEHICLESWF = at("vehicles-workflow.mjs");
const BUILDER = path.join(SYSTEM_ROOT, "tools", "build-vehicles.mjs");
const MARKERSF = at("magic", "markers.mjs");
const RESOLUTION = at("dice", "resolution.mjs");
const CARDINT = at("dice", "check-card-interactions.mjs");
const ACTORSHEET = at("sheets", "actor-sheet.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter6-gear-171-180.mjs");

const MUTATIONS = [
  /* ── the defects, put back ─────────────────────────────────────── */
  { file: TOOLS, name: "D4 THE DEFECT: an exhausted kit still counts", from: "  if (isToolExhausted(item)) return false;", to: "", breaks: "C2" },
  { file: TOOLS, name: "D4 THE DEFECT: only an equipped kit is spent", from: "  const usable = (items ?? []).filter((item) => isToolAvailable(item) && toolMatches(item, requirement, actionKey));",
    to: "  const usable = (items ?? []).filter((item) => item?.system?.equipped && isToolAvailable(item) && toolMatches(item, requirement, actionKey));", breaks: "C4" },
  { file: CRAFTFEATS, name: "D1 THE DEFECT: Alchemical Crafting is a tick again", from: "  const feat = singleNamedFeat(requiredFeat);", to: "  const feat = \"\";", breaks: "C10" },
  { file: CREATEWF, name: "D2 THE DEFECT: the kit is a tick again", from: "    t.key, { checked: Boolean(CREATE_KITS[t.key]), shortfall: createKitShortfall({ itemTypeKey: t.key, items }) }",
    to: "    t.key, { checked: false, shortfall: null }", breaks: "C13" },
  { file: ACTIONWF, name: "D9 THE DEFECT: a fall leaves the rider mounted", from: "        if (fallsFromSaddle(action.key, degree) && mountedState(actor).mounted) {", to: "        if (false) {", breaks: "E3" },
  { file: ELIXIRS, name: "D7 THE DEFECT: the elixir's level is never read", from: "    const times = levelSteps(item, spec.perLevels);", to: "    const times = 0;", breaks: "D1b/D2d/D4/D5/D6" },
  { file: CONSUMEWF, name: "D7/D8 THE DEFECT: an elixir goes back to being text", from: "  if (isAlchemicalConsumable(item) && !isBomb(item)) return useAlchemical(actor, item);", to: "", breaks: "D18" },

  /* ── B: the Goods ──────────────────────────────────────────────── */
  { file: GOODS, name: "a fumbled hook is seen to fail", from: "  const dislodges = [\"fumble\", \"blunder\"].includes(key);", to: "  const dislodges = false;", breaks: "B9e" },
  { file: GOODS, name: "a fumbled hook does not seem to hold", from: "  return { secure, seemsToHold: secure || dislodges, dislodges };", to: "  return { secure, seemsToHold: secure, dislodges };", breaks: "B9e" },
  { file: GOODSWF, name: "the anchoring throw is not secret", from: "    rollMode: BLIND_ROLL_MODE,", to: "", breaks: "B10" },
  { file: GOODSWF, name: "the hook's button reaches nothing", from: "  if (use === GRAPPLING_HOOK.use) return anchorGrapplingHook(actor, item);", to: "", breaks: "B10d" },

  /* ── C: kits and tools ─────────────────────────────────────────── */
  { file: TOOLS, name: "a kit is never exhausted", from: "  return Number(item?.system?.uses?.value ?? 0) <= 0;", to: "  return false;", breaks: "C1" },
  { file: TOOLS, name: "Healing Earth no longer counts as healer's tools", from: "  if (requirement?.trait instanceof RegExp && requirement.trait.test(String(item?.system?.traits ?? \"\"))) {", to: "  if (false) {", breaks: "C5" },
  { file: TOOLS, name: "the kit you paid for is spent before the earth", from: "  return usable.find(isTemporaryGear)", to: "  return usable.find((item) => !isTemporaryGear(item))", breaks: "C5b" },
  { file: TOOLS, name: "a Disguise spends nothing", from: "  \"treatDisease\", \"treatInjury\", \"treatToxin\", \"treatWounds\", \"disguise\"", to: "  \"treatDisease\", \"treatInjury\", \"treatToxin\", \"treatWounds\"", breaks: "C6/C7b" },
  { file: TOOLS, name: "herbs need no kit", from: "  herbs: Object.freeze({ tools: Object.freeze([\"Herbalism Kit\"]), label: \"a herbalism kit\" }),", to: "", breaks: "C11d" },
  { file: TOOLS, name: "no kit is ever missing", from: "  if (has) return null;", to: "  return null;", breaks: "C11" },
  { file: CRAFTFEATS, name: "an alternation is read as one feat", from: "  if (!text || /\\bor\\b|,|\\//i.test(text)) return \"\";", to: "  if (!text) return \"\";", breaks: "C10c" },
  { file: CRAFTFEATS, name: "a missing kit does not block Begin", from: "  const kitMissing = Boolean(checked && shortfall);", to: "  const kitMissing = false;", breaks: "C12" },
  { file: CRAFTFEATS, name: "the tools tick stays for a checked kit", from: "    showToolsTick: !checked,", to: "    showToolsTick: true,", breaks: "C12" },
  { file: ACTIONWF, name: "a day's work no longer needs the kit", from: "      const kitShort = createKitShortfall({ itemTypeKey: active.itemTypeKey, items: Array.from(actor.items ?? []) });", to: "      const kitShort = null;", breaks: "C13c" },
  { file: CREATE, name: "an alchemical Create is not alchemical", from: "  if (actionKey === \"create\" && CONSUMABLE_ITEM_TYPES.includes(String(itemTypeKey ?? \"\"))) return \"alchemical\";", to: "", breaks: "C14b" },
  { file: CREATE, name: "Identify Alchemy is not alchemical", from: "  if (actionKey === \"identifyAlchemy\") return \"alchemical\";", to: "", breaks: "C14c" },
  // The DIALOG's line: its six spaces keep the roll's four-space line from matching inside it.
  { file: ACTIONWF, name: "the dialog is not told what is being made", from: "      traits: alchemicalCheckTraits(action.key, createItemTypeKey),", to: "", breaks: "C14g" },
  { file: ACTIONWF, name: "the Treat actions spend nothing", from: "    await spendToolUse(actor, action.key);", to: "", breaks: "C8" },

  /* ── D: elixirs and herbs ──────────────────────────────────────── */
  { file: ELIXIRS, name: "the healing ladder is one step short", from: "  if (base === extra) return scaleAmount(base, times + 1);", to: "  if (base === extra) return scaleAmount(base, times);", breaks: "D1b" },
  { file: ELIXIRS, name: "a part-step counts", from: "  return Math.floor(Math.max(0, level - base) / per);", to: "  return Math.ceil(Math.max(0, level - base) / per);", breaks: "D2d" },
  { file: ELIXIRS, name: "Soothe Syrup's five-hour cap is gone", from: "  if (Number.isFinite(max) && max > 0) total = Math.min(total, max);", to: "", breaks: "D6" },
  { file: ELIXIRS, name: "a Speed elixir forgets its plan's bonus", from: "    for (const row of out.effects) if (row.kind === \"bonus\") row.value = plan.bonus;", to: "", breaks: "D7e" },
  { file: ELIXIRS, name: "a fed elixir is drunk by the feeder", from: "  for (const row of out.effects) row.target = fed || out.nearby ? \"targets\" : \"self\";", to: "  for (const row of out.effects) row.target = out.nearby ? \"targets\" : \"self\";", breaks: "D17e" },
  { file: ELIXIRS, name: "an elixir can be fed across the room", from: "  if (Number.isFinite(distance) && distance > Math.max(FEED_REACH_FEET, Number(reach) || 0)) {", to: "  if (false) {", breaks: "D17c" },
  { file: ELIXIRS, name: "a bite turns to stone", from: "  if (String(s.damageType ?? \"\").trim().toLowerCase() !== \"subdual\") return null;", to: "", breaks: "D8c" },
  { file: ELIXIRS, name: "the salts wake every later Dying too", from: "  return dyingEffectId && woke && woke === dyingEffectId ? [\"unconscious\"] : [];", to: "  return woke ? [\"unconscious\"] : [];", breaks: "D11e" },
  { file: ELIXIRS, name: "a minute fits in an encounter", from: "  if (inCombat && !combatLegal) {", to: "  if (false) {", breaks: "D16c" },
  { file: REGISTRY, name: "Dying includes Unconscious whatever the salts did", from: "    if (source && withheld.has(id)) return;", to: "", breaks: "D11c" },
  { file: REGISTRY, name: "a directly applied Unconscious is withheld too", from: "    if (source && withheld.has(id)) return;", to: "    if (withheld.has(id)) return;", breaks: "D11f" },
  // RE-ANCHORED AT 3.617.0: potions and description items pay their AP too,
  // so the alchemical spend is named by the import beside it.
  { file: CONSUMEWF, name: "drinking costs no AP", from: "    const { spendActionPoints } = await import(\"./combat/action-points-workflow.mjs\");\n    await spendActionPoints(actor, cost.ap, item.name);", to: "", breaks: "D18c" },
  { file: CONSUMEWF, name: "a waiting bonus is never recorded", from: "    await addPendingModifier(actor, { ...scaled.pending, oneShot: true });", to: "", breaks: "D18d" },
  { file: ATTACK, name: "stone fists hit with the old die", from: "      damageOverride: stoneFist?.damage ?? extraBaseDiceOverride(weaponData.damage, extraBaseDice),", to: "      damageOverride: extraBaseDiceOverride(weaponData.damage, extraBaseDice),", breaks: "D8e" },
  { file: ATTACK, name: "the damage roll ignores the override", from: "  let formula = buildWeaponDamageFormula(damageOverride ?? weaponData.damage, {", to: "  let formula = buildWeaponDamageFormula(weaponData.damage, {", breaks: "D8e" },
  { file: COMBAT, name: "Angelstep adds nothing to the Dying Check", from: "        ...(angelstep ? [{ label: \"Angelstep\", value: ANGELSTEP_DYING_BONUS, type: \"item\" }] : [])", to: "", breaks: "D9d" },
  { file: REST, name: "Dream Lichen heals Soul Drain once", from: "      ? soulDrainRecovery(soulDrainRecovery(soulDrainBefore))", to: "      ? soulDrainRecovery(soulDrainBefore)", breaks: "D13b" },

  /* ── E: mounts ─────────────────────────────────────────────────── */
  { file: MOUNTED, name: "Stay in Saddle's Failure keeps you in it", from: "  if (actionKey === \"stayInSaddle\") return [\"failure\", \"fumble\", \"blunder\"].includes(d);", to: "  if (actionKey === \"stayInSaddle\") return [\"fumble\", \"blunder\"].includes(d);", breaks: "E1" },
  { file: MOUNTED, name: "Guide with Knees' Fumble keeps you in the saddle", from: "  if (actionKey === \"guideWithKnees\") return [\"fumble\", \"blunder\"].includes(d);", to: "", breaks: "E2" },
  { file: MOUNTED, name: "a military mount panics", from: "  if (military) return false;", to: "", breaks: "E4b" },
  { file: MOUNTED, name: "an animal companion panics", from: "  if (String(actorType).trim().toLowerCase() === \"companion\") return false;", to: "", breaks: "E4c" },
  { file: MOUNTED, name: "every animal is of animal intelligence", from: "  return Number(intelligence) <= ANIMAL_INTELLIGENCE_MAX;", to: "  return true;", breaks: "E4e" },
  { file: MOUNTED, name: "Command an Animal calms any frightened creature", from: "  if (!panicked || actionKey !== \"commandAnAnimal\") return false;", to: "  if (actionKey !== \"commandAnAnimal\") return false;", breaks: "E6b" },
  { file: MOUNTED, name: "the steed is not remembered", from: "    ...(steedHandle ? { steed: steedHandle } : {})", to: "", breaks: "E7" },
  { file: COMBAT, name: "no steed is asked when combat begins", from: "    await TRGCombat.#spookSteeds(combatants);", to: "", breaks: "E8" },

  /* ── F: runed clothing ─────────────────────────────────────────── */
  { file: RUNEBEAR, name: "Travellers cannot take runes", from: "  if (type === \"gear\" && item?.flags?.[SYSTEM_ID]?.[RUNE_BEARING_FLAG] === \"armour\") return \"armour\";", to: "", breaks: "F1" },
  { file: RUNEBEAR, name: "runed clothing counts under body armour", from: "  if (isRunedClothing(item) && wearsBodyArmour(items)) return false;", to: "", breaks: "F2b" },
  { file: RUNEBEAR, name: "a helmet is body armour", from: "  return [\"light\", \"medium\", \"heavy\"].includes(String(item?.system?.category ?? \"\").trim().toLowerCase());", to: "  return true;", breaks: "F2c" },
  { file: RUNEFX, name: "the rune bonuses ignore the body armour", from: "    if (!runesCountFor(item, items)) continue;", to: "", breaks: "F3" },
  { file: ACTOR, name: "potency reaches DB from under the armour", from: "      if (!runesCountFor(item, Array.from(actor.items ?? []))) continue;", to: "", breaks: "F6" },
  { file: ITEMSHEET, name: "the clothing's sheet has no Runes panel", from: "    if (context.isGear && isRunedClothing(this.item)) this._runeContext(context);", to: "", breaks: "F5" },

  /* ── G: vehicles ───────────────────────────────────────────────── */
  { file: BUILDER, name: "the builder forgets the Codex's NPC scaling (the Galley at DB 32)", from: "      defence: { base: 10, other: Number(v.db) - 10 - dex - codex.defenceOther - codex.defenceStatus },", to: "      defence: { base: 10, other: Number(v.db) - 10 - dex },", breaks: "G2" },
  { file: BUILDER, name: "Easy and Hard stop moving the pilot DC", from: "  return levelDC(Number(v.level) || 0) + (Number(v.dcMod) || 0);", to: "  return levelDC(Number(v.level) || 0);", breaks: "G4" },
  { file: VEHICLES, name: "a ship names no choice of skill", from: "    choose: skills.length !== 1", to: "    choose: false", breaks: "G5" },
  { file: VEHICLESWF, name: "the pilot rolls against nothing", from: "    dc: view.dc,", to: "    dc: null,", breaks: "G8" },

  /* ── 3.577.1: R5, and the three things the live test found ─────── */
  { file: CRAFTFEATS, name: "F1 THE DEFECT: no feat opens a type without a specialty", from: "      return Boolean(feat) && has(featNames, feat.toLowerCase());",
    to: "      return false;", breaks: "H4" },
  { file: ACTIONWF, name: "F1: the gate refuses before asking the feat", from: "      if (!featTypes.length) {", to: "      if (true) {", breaks: "H4d" },
  { file: CREATEWF, name: "F1: the dialog offers mundane items to a feat-only crafter", from: "    .filter((t) => !Array.isArray(onlyTypes) || onlyTypes.includes(t.key));", to: "    ;", breaks: "H4e" },
  { file: RESOLUTION, name: "F2 THE DEFECT: an empty box is DC 0", from: "  if (!text) return null;", to: "", breaks: "H5" },
  { file: CARDINT, name: "F2: the card reads Number() again", from: "  const parsed = parseEnteredDC(dcValue);", to: "  const parsed = Number(dcValue);", breaks: "H5c" },
  { file: MARKERSF, name: "F3 THE DEFECT: 'is Fist of Rock'", from: "  const phrase = entry.applied", to: "  const phrase = false", breaks: "H6" },
  { file: CREATE, name: "R5 THE OLD RULE: herbs are Nature only", from: "    skills: [\"crafting\", \"nature\"],", to: "    skills: [\"nature\"],", breaks: "H1" },
  { file: CRAFTFEATS, name: "R5: a featless herbalist is refused outright", from: "  if (type === \"herbs\") {", to: "  if (false) {", breaks: "H1c" },
  { file: CRAFTFEATS, name: "R5: a featless herbalist may use Crafting", from: "    if (String(skillKey).trim().toLowerCase() === \"crafting\") {", to: "    if (false) {", breaks: "H1e" },
  { file: CRAFTFEATS, name: "R5: Very Hard is +2", from: "export const FEATLESS_HERB_DC = 5;", to: "export const FEATLESS_HERB_DC = 2;", breaks: "H1d" },
  { file: CRAFTFEATS, name: "R5: the dialog keeps the +5 to itself", from: "      allowed ? String(gate?.note ?? \"\") : String(gate?.reason ?? \"\"),", to: "      allowed ? \"\" : String(gate?.reason ?? \"\"),", breaks: "H1g" },
  { file: CREATEWF, name: "R5: the gate is not told the skill", from: "    t.key, craftingFeatGate({ itemTypeKey: t.key, requiredFeat: t.feat, featNames, skillKey })",
    to: "    t.key, craftingFeatGate({ itemTypeKey: t.key, requiredFeat: t.feat, featNames })", breaks: "H3" },
  { file: ACTIONWF, name: "R5: the +5 never reaches the DC", from: "    finalDC += createHerbDC;", to: "    finalDC += 0;", breaks: "H3b" },
  { file: CREATE, name: "R5: a Fumble dooms a herb on the 1d6 clock", from: "const RUINED_ON_FUMBLE = Object.freeze([\"herbs\"]);", to: "const RUINED_ON_FUMBLE = Object.freeze([]);", breaks: "H2" },
  { file: CREATEWF, name: "R5: the project is not ruined on the day", from: "  if (outcome === \"fumble\" && fumbleRuinsAtOnce(project.itemTypeKey)) {", to: "  if (false) {", breaks: "H2c" },
  /* ── 3.577.2: vehicle sheets, and F4 ───────────────────────────── */
  { file: VEHICLES, name: "a vehicle from the pack is not a vehicle", from: "  if (vehicleOf(actor)) return true;", to: "  if (false) return true;", breaks: "I1" },
  { file: VEHICLES, name: "the printed trait is not read", from: "  return /(^|,)\\s*vehicle\\s*(,|$)/i.test(String(actor?.system?.details?.traits ?? \"\"));", to: "  return false;", breaks: "I1" },
  { file: ACTORSHEET, name: "the sheet is never told", from: "    context.isVehicle = isVehicleActor(this.actor);", to: "    context.isVehicle = false;", breaks: "I1b" },
  { file: HBS, name: "the attribute medallions slip out of the wrapper", from: "          <div class=\"attribute-medallions\">",
    to: "          {{/unless}}<div class=\"attribute-medallions\">{{#unless isVehicle}}", breaks: "I2" },
  { file: HBS, name: "Critical Resistance slips out of the wrapper", from: "              <strong>{{system.combat.criticalResistance}}</strong>",
    to: "              {{/unless}}<strong>{{system.combat.criticalResistance}}</strong>{{#unless isVehicle}}", breaks: "I2" },
  { file: HBS, name: "the Defence Bonus is hidden too", from: "              <strong>{{system.combat.defence.total}}</strong>",
    to: "              {{#unless isVehicle}}<strong>{{system.combat.defence.total}}</strong>{{/unless}}", breaks: "I2b" },
  { file: CREATE, name: "F4 THE DEFECT: nothing is ruined on the day, for the card", from: "  return fumbleRuinsAtOnce(itemTypeKey) && [\"fumble\", \"blunder\"].includes(String(degreeKey ?? \"\"));",
    to: "  return false;", breaks: "I3" },
  { file: ACTIONWF, name: "F4: a re-roll reads the day-one setup, which it does not have", from: "    ? String((createReroll ? activeCreateProject(actor)?.itemTypeKey : createSetup?.itemTypeKey) ?? \"\")",
    to: "    ? String(createSetup?.itemTypeKey ?? \"\")", breaks: "I3b" },
  { file: ACTIONWF, name: "F4: the table's Fumble row prints anyway", from: "      if (!(action.key === \"create\" && ruinedOnTheDay(createTypeKey, degree))) {", to: "      if (true) {", breaks: "I3b" },
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const guard = guardFiles([
  GOODS, GOODSWF, TOOLS, CRAFTFEATS, CREATEWF, CREATE, ACTIONWF, ELIXIRS, REGISTRY, CONSUMEWF, ATTACK, COMBAT, REST,
  MOUNTED, RUNEBEAR, RUNEFX, ACTOR, ITEMSHEET, VEHICLES, VEHICLESWF, BUILDER, MARKERSF, RESOLUTION, CARDINT, ACTORSHEET, HBS,
  CHECK
]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter6-gear-171-180: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-chapter6-gear-171-180: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-chapter6-gear-171-180: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
