#!/usr/bin/env node
/** mutate-block5-core — the mutation half of verify-block5-core (TRG Prime 3.669.0, Inner Tempest Block 5's seams). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const API = m("module-api.mjs"), PF = m("picker-filters.mjs"), SHEET = m("sheets", "actor-sheet.mjs"), FW = m("feats-workflow.mjs");
const PW = m("peril-workflow.mjs"), APIW = m("module-api-workflow.mjs"), FR = m("fumble-reroll.mjs"), FRW = m("fumble-reroll-workflow.mjs");
const CK = m("dice", "check.mjs"), CCI = m("dice", "check-card-interactions.mjs"), AW = m("combat", "attack-workflow.mjs");
const DO = m("combat", "defence-offer.mjs"), DOW = m("combat", "defence-offer-workflow.mjs"), FM = m("combat", "forced-movement.mjs"), FMW = m("combat", "forced-movement-workflow.mjs");
const ACW = m("combat", "action-workflow.mjs"), DF = m("daily-firsts.mjs"), LS = m("light-sources.mjs"), LAW = m("light-attach-workflow.mjs");
const ST = m("magic", "spell-template.mjs"), PL = m("magic", "placed-light-workflow.mjs"), CR = m("conviction-refund.mjs");
const AAE = m("ally-aura-effects.mjs"), AC = m("aura-conditionals.mjs"), AAW = m("ally-aura-effects-workflow.mjs");
const SDC = m("magic", "spell-dc-bonus.mjs"), CW = m("magic", "cast-workflow.mjs");

const MUTATIONS = [
  // A — C1
  { name: "a heritage limit opens the feat to the whole race", file: API, from: "    if (!heritages.length || k !== \"race\") { map.set(name, ANY_HERITAGE); continue; }", to: "    map.set(name, ANY_HERITAGE); continue;", breaks: "A1" },
  { name: "a later limit narrows a race-wide opening", file: API, from: "    if (had === ANY_HERITAGE) continue;\n", to: "", breaks: "A3" },
  { name: "the heritage is not asked", file: API, from: "      return open === ANY_HERITAGE || mine.some((h) => open.has(h));", to: "      return true;", breaks: "A1" },
  { name: "the picker forgets the heritage", file: PF, from: "hasRegisteredFeatAccess(\"race\", race, entry.name, heritage)", to: "hasRegisteredFeatAccess(\"race\", race, entry.name)", breaks: "A4" },
  // B — C2
  { name: "a spell without the element's trait is kept", file: FW, from: "    if (traitsAny.length && !hasTrait(s) && !also.has(name)) return false;\n", to: "", breaks: "B1" },
  { name: "the additions are not kept", file: FW, from: "    if (traitsAny.length && !hasTrait(s) && !also.has(name)) return false;", to: "    if (traitsAny.length && !hasTrait(s)) return false;", breaks: "B1" },
  { name: "the printed list is not a limit", file: FW, from: "    if (names && !names.has(name)) return false;\n", to: "", breaks: "B1" },
  // C — C3
  { name: "an area takes in the allies it should leave out", file: PW, from: "      if (spec.enemiesOnly && ally) continue;\n", to: "", breaks: "C1" },
  { name: "the area rail is not handed to modules", file: APIW, from: "        return runDeclaredAreaEffect(actor, perilEffectSpec(spec), opts);", to: "        return [];", breaks: "C2" },
  // D — C4
  { name: "an inactive ability rerolls", file: FR, from: "    if (item.type === \"ability\" && item.system?.active === false) continue;\n", to: "", breaks: "D1" },
  { name: "every reroll is free of the reaction", file: FR, from: "reaction: raw.reaction !== false });", to: "reaction: false });", breaks: "D1" },
  { name: "a fumbled save is never offered", file: CK, from: "!check.presetDice && [\"skill\", \"save\"].includes(check.type)", to: "!check.presetDice && [\"skill\"].includes(check.type)", breaks: "D2" },
  { name: "the reroll is offered again on the reroll", file: CK, from: "        check.fumbleRerolled = true;\n        await check.reroll();", to: "        await check.reroll();", breaks: "D2" },
  { name: "a shared roll's later creature is offered the reroll", file: CK, from: "!check.fumbleRerolled && !check.presetDice && [\"skill\", \"save\"]", to: "!check.fumbleRerolled && [\"skill\", \"save\"]", breaks: "D2" },
  { name: "the attack's fumble is never confirmed early", file: AW, from: "    if (risk && fumbleRerollAvailable(actor, \"attack\")) {", to: "    if (false) {", breaks: "D3" },
  { name: "THE DEFECT: the reroll re-runs the whole Strike", file: AW, from: "          check = await TRGCheck.roll({ ...attackCheckConfig, conditionalChoices: check.conditionalChoices ?? [], allowConviction: false });\n          fumbleRerolled = true;", to: "          return rollWeaponAttack(actor, weapon, { ...callOptions, apPaid: true, fumbleRerolled: true });\n          fumbleRerolled = true;", breaks: "D4" },
  { name: "the reroll may be offered again on the reroll", file: AW, from: "          fumbleRerolled = true;\n          fumbleConfirmedEarly = null;", to: "          fumbleConfirmedEarly = null;", breaks: "D4" },
  { name: "a fumble confirmed early is checked again", file: AW, from: "thrown: thrownAttack, confirmed: fumbleConfirmedEarly });", to: "thrown: thrownAttack });", breaks: "D5" },
  { name: "a fumble averted early is tabled anyway", file: AW, from: "  if (confirmed === false) return null;\n", to: "", breaks: "D5" },
  { name: "the reroll costs no reaction", file: FRW, from: "  if (row.reaction && inCombat && !(await spendReaction(actor, row.label, { traits: String(row.item.system?.traits ?? \"\") }))) return null;\n", to: "", breaks: "D6" },
  // E — C5
  { name: "an ally's reaction reaches 3 feet", file: DO, from: "reachFeet: Math.max(5, Math.trunc(Number(spec.reachFeet) || 5)),", to: "reachFeet: Math.trunc(Number(spec.reachFeet) || 5),", breaks: "E1" },
  { name: "a foe may step in", file: DO, from: "    && Number(t.disposition) === Number(disposition)\n", to: "\n", breaks: "E2" },
  { name: "the attacked one may step in for itself", file: DO, from: "t && t.id !== targetId && t.id !== attackerId && t.actorId", to: "t && t.id !== attackerId && t.actorId", breaks: "E2" },
  { name: "a creature is asked its allies' reactions", file: DOW, from: "  const specs = registeredDefenceOffers().filter((s) => Boolean(s.forAlly) === Boolean(forAlly));", to: "  const specs = registeredDefenceOffers();", breaks: "E3" },
  { name: "the attack keeps its target after a yes", file: AW, from: "      targetToken = interceptor;\n      targetActor = interceptor.actor;\n", to: "", breaks: "E4" },
  { name: "the one who steps in is measured from where they stand", file: AW, from: "      try { targetToken.setTarget?.(true, { user: game.user, releaseOthers: true }); } catch { /* the attack goes on regardless */ }\n    }\n  }\n\n  if (targetActor && !noReactions) {\n    const { offerDefences }", to: "      try { targetToken.setTarget?.(true, { user: game.user, releaseOthers: true }); } catch { /* the attack goes on regardless */ }\n      distanceToTarget = distanceBetween(attackerToken, targetToken);\n    }\n  }\n\n  if (targetActor && !noReactions) {\n    const { offerDefences }", breaks: "E4" },
  { name: "THE DEFECT: the ally is asked before the Strike is committed", file: AW, from: "    const { offerIntercepts } = await import(\"./defence-offer-workflow.mjs\");\n", to: null,
    mutate: (src) => {
      const start = src.indexOf("  if (targetToken && targetActor && !isReaction && !skipTargetPrompt) {\n    const { offerIntercepts }");
      const end = src.indexOf("  if (targetActor && !noReactions) {\n    const { offerDefences }");
      if (start < 0 || end < start) return null;
      const block = src.slice(start, end);
      const cut = src.slice(0, start) + src.slice(end);
      return cut.replace("  let interceptNote = \"\";\n", "  let interceptNote = \"\";\n" + block);
    }, breaks: "E5" },
  // F — C6
  { name: "a declared reduction is ignored", file: FM, from: "    if (Number.isFinite(n) && n > 0) feet += Math.trunc(n);", to: "", breaks: "F1" },
  { name: "a push may go below 0", file: FM, from: "  return Math.max(0, Math.trunc(Number(feet) || 0) - Math.max(0, Math.trunc(Number(reduction) || 0)));", to: "  return Math.trunc(Number(feet) || 0) - Math.trunc(Number(reduction) || 0);", breaks: "F1" },
  { name: "the push never asks the target", file: FMW, from: "  feet = reducedPushFeet(feet, reduction);", to: "", breaks: "F3" },
  // G — C7
  { name: "the DC named is ignored", file: ACW, from: "    finalDC = Number(dcOverride);", to: "    void 0;", breaks: "G2" },
  { name: "the die is rolled again", file: ACW, from: "    ...(presetDice ? { presetDice, presetConvictionDie } : {}),", to: "", breaks: "G3" },
  { name: "the action's immunity still refuses", file: ACW, from: "  if (targetActor && ACTION_IMMUNITIES[action.key] && !ignoreActionImmunity) {", to: "  if (targetActor && ACTION_IMMUNITIES[action.key]) {", breaks: "G4" },
  // H — C8
  { name: "\"without the need for a roll\" keeps a better roll", file: DF, from: "    if (setRow.exact === true) return { degree: DEGREE_ORDER[target], from: rolled, labels: [setRow.label], exact: true };\n", to: "", breaks: "H1" },
  { name: "the day's advantage is never spent", file: DF, from: "      if (dailyFirstSpent(actorFlags, slot)) continue;\n", to: "", breaks: "H2" },
  { name: "the action forgets the day's advantage", file: ACW, from: "      ...(firstAdvantage ? [\"advantage\"] : [])", to: "      ...[]", breaks: "H3" },
  // I — C9
  { name: "a core light can be replaced", file: API, from: "    if (taken.has(key)) {", to: "    if (false) {", breaks: "I1" },
  { name: "a registered light is not looked up", file: LS, from: "  return Object.hasOwn(LIGHT_SOURCES, k) ? LIGHT_SOURCES[k] : registeredLightSource(k);", to: "  return LIGHT_SOURCES[k] ?? null;", breaks: "I2" },
  { name: "the drawn bright ring is always half", file: LS, from: "  const bright = Number.isFinite(Number(entry.brightFeet)) ? Math.min(dim, Number(entry.brightFeet)) : Math.floor(dim / 2);", to: "  const bright = Math.floor(dim / 2);", breaks: "I3" },
  { name: "an ended light only restores", file: LAW, from: "      refreshAttachedLight(actor, { direct: true }).catch((err) => {", to: "      restoreTokenLight(actor, { direct: true }).catch((err) => {", breaks: "I6" },
  { name: "every client redraws the light", file: LAW, from: "      if (!here) return;\n", to: "", breaks: "I6" },
  { name: "the circles are looked for on the scene in view", file: PL, from: "  return (sceneId ? globalThis.game?.scenes?.get?.(sceneId) : null) ?? globalThis.canvas?.scene ?? null;", to: "  return globalThis.canvas?.scene ?? null;", breaks: "I9" },
  { name: "a player writes a Region it may not", file: PL, from: "        if (!writesHere(region)) return askGM(\"lightCircle.move\", {", to: "        if (false) return askGM(\"lightCircle.move\", {", breaks: "I11" },
  { name: "the GM moves any Region it is asked to", file: PL, from: "        if (region?.getFlag?.(SYSTEM_ID, LIGHT_CIRCLE_FLAG)) await moveCircle(region", to: "        if (region) await moveCircle(region", breaks: "I11" },
  { name: "a move is not limited from where the thing is", file: ST, from: "      const o = from ?? center;", to: "      const o = center;", breaks: "I7" },
  { name: "a placed light raises nothing", file: PL, from: "              lightShift: { steps, floor: 1, cap: spec.cap ?? 10 },\n", to: "", breaks: "I8" },
  { name: "a placed light keeps no clock", file: PL, from: "              ...(ends ? { [REGION_EXPIRY_FLAG]: regionExpiryRecord({ castId, spellName: name, ends }) } : {})\n", to: "", breaks: "I8" },
  { name: "a module cannot register lights", file: APIW, from: "    registerLightSources: (entries, moduleId) => registerLightSources(entries, moduleId, Object.keys(LIGHT_SOURCES)),\n", to: "", breaks: "I10" },
  // J — B5-3
  { name: "the refund reaches every skill", file: CR, from: "    if (skills.length && !skills.includes(skill)) continue;\n", to: "", breaks: "J1" },
  { name: "the refund comes on a Partial too", file: CR, from: "    if (!degrees.includes(want)) continue;\n", to: "", breaks: "J1" },
  { name: "the refund stacks on Scoundrel's Luck", file: CK, from: "    } else if (advantageSpent && !advantageKept && check.actor) {", to: "    }\n    if (advantageSpent && !advantageKept && check.actor) {", breaks: "J2" },
  { name: "the card forgets the refund", file: CK, from: "              convictionRefunded: Boolean(this.convictionRefunded),\n", to: "", breaks: "J3" },
  { name: "THE DEFECT: an innate-only DC bonus reaches every spell", file: SDC, from: "      if (row?.innateOnly === true && innate !== true) continue;\n", to: "", breaks: "J4" },
  { name: "the cast never says it is innate", file: CW, from: "spellData.traits, { innate: isInnate })),", to: "spellData.traits)),", breaks: "J5" },
  { name: "an innate spell's attack is nameless", file: CW, from: "          actionKey: \"innateSpellAttack\",\n", to: "", breaks: "J5" },
  // K — the switched ally aura
  { name: "a switched aura lays its effect while off", file: AAE, from: "        if (aura.emitterState && !(emitter.states ?? []).includes(aura.emitterState)) continue;\n", to: "", breaks: "K1" },
  { name: "a switched aura grants at the roll while off", file: AC, from: "      if (aura.emitterState && !(emitter.states ?? []).includes(aura.emitterState)) continue;\n", to: "", breaks: "K2" },
  { name: "the switch never brings the auras into step", file: AAW, from: "    Hooks.on(hook, (effect) => { if (effect?.getFlag?.(SYSTEM_ID, \"auraSwitch\")) syncAllyAuraEffects(); });", to: "", breaks: "K3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block5-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block5-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    const mutated = mu.mutate ? mu.mutate(original) : original.replace(mu.from, mu.to);
    if (mutated == null || mutated === original) { results.push({ name: mu.name, state: "ANCHOR MISSING" }); continue; }
    fs.writeFileSync(mu.file, mutated);
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-block5-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block5-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
