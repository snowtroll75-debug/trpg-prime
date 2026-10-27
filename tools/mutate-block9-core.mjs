#!/usr/bin/env node
/** mutate-block9-core — the mutation half of verify-block9-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RD = m("rune-declarations.mjs"), DG = m("combat", "death-guard.mjs"), DGW = m("combat", "death-guard-workflow.mjs"),
  CM = m("documents", "combat.mjs"), RAW = m("rune-actions-workflow.mjs"), RA = m("rune-actions.mjs"), RDM = m("rune-damage.mjs"),
  AW = m("combat", "attack-workflow.mjs"), CGW = m("combat", "critical-guard-workflow.mjs"), SR = m("magic", "strike-riders.mjs"),
  CC = m("create-crafting.mjs"), CCW = m("create-crafting-workflow.mjs"), ACW = m("combat", "action-workflow.mjs"), SA = m("data", "skill-actions.mjs"),
  API = m("module-api.mjs"), APIW = m("module-api-workflow.mjs"), CA = m("creature-auras.mjs"), RT = m("rune-timers.mjs"), RTW = m("rune-timers-workflow.mjs"),
  AGE = m("age-modifiers.mjs"), ACT = m("documents", "actor.mjs"), CD = m("class-derive.mjs"), OQ = m("owner-query.mjs"), OQW = m("owner-query-workflow.mjs"),
  BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json"),
  TR = m("combat", "target-relay.mjs"), TRW = m("combat", "target-relay-workflow.mjs"), CAST = m("magic", "cast-workflow.mjs"), WRU = m("weapon-rune-usage.mjs");

const MUTATIONS = [
  // C1
  { name: "THE GAP: the worn runes are never asked", file: DGW, from: "  const effects = [...declarationCarriers(actor), ...runeDeathGuardCarriers(Array.from(actor?.items ?? []))];", to: "  const effects = declarationCarriers(actor);", breaks: "C1" },
  { name: "a rune guard loses its grant's class value", file: RD, from: "        ? { ...raw.grants, conditionals: (Array.isArray(raw.grants.conditionals) ? raw.grants.conditionals : []).map((c) => classValued(c, classes)) }", to: "        ? { ...raw.grants }", breaks: "C1" },
  { name: "a reaction guard is not marked a reaction", file: DG, from: "  if (raw.reaction === true) out.reaction = true;\n", to: "", breaks: "C1" },
  { name: "the grant is dropped", file: DG, from: "  if (grants) out.grants = grants;\n", to: "", breaks: "C1" },
  { name: "the grant lasts a round", file: DG, from: "    spellEffectEnd: Number(worldTime) + grants.seconds\n", to: "    spellEffectEnd: Number(worldTime) + 6\n", breaks: "C1" },
  { name: "a grant with no time still grants", file: DG, from: "  if (!conditionals.length || !seconds) return null;", to: "  if (!conditionals.length) return null;", breaks: "C1" },
  { name: "the guard asks the GM, not the player", file: DGW, from: "      if (spec.askOwner) {", to: "      if (false) {", breaks: "C1" },
  { name: "no reaction is spent", file: DGW, from: "      if (spec.reaction && !await spendReaction(actor, spec.label)) {", to: "      if (false) {", breaks: "C1" },
  { name: "the grant is never laid", file: DGW, from: "    if (spec.grants) lines.push(...await applyGuardGrants(actor, spec));\n", to: "", breaks: "C1" },
  // C2
  { name: "THE GAP: the rune does not ease the Light check", file: CM, from: "        + runeBleed.reduction;", to: "        + 0;", breaks: "C2" },
  { name: "the tier is ignored", file: RD, from: "      return Array.isArray(v) ? v[Math.min(e.tier, v.length) - 1] : v;", to: "      return Array.isArray(v) ? v[0] : v;", breaks: "C2" },
  { name: "Staunching II reaches every band", file: RD, from: "  return reduceCheck.bands === \"any\" || (reduceCheck.bands === \"moderate\" && band === \"moderate\");", to: "  return true;", breaks: "C2" },
  { name: "the Light band takes the reduce check", file: RD, from: "  if (band === \"light\" || !band) return false;\n", to: "", breaks: "C2" },
  { name: "the check lowers the smallest bleed", file: CM, from: "const largest = [...bleeds].sort((a, b) => b.value - a.value)[0];", to: "const largest = [...bleeds].sort((a, b) => a.value - b.value)[0];", breaks: "C2" },
  // C3
  { name: "THE GAP: the class value is never taken", file: RD, from: "  if (!want.some((c) => held.includes(c)) || !Number.isFinite(Number(classValue.value))) return rest;", to: "  return rest;", breaks: "C3" },
  { name: "a worn rune's offer is not read by class", file: RD, from: "      const c = classValued(tierValued(raw, entry.tier), classes);\n      if (!c || typeof c !== \"object\") continue;", to: "      const c = tierValued(raw, entry.tier);\n      if (!c || typeof c !== \"object\") continue;", breaks: "C3" },
  { name: "the action's changes are laid as written", file: RAW, from: "  const changes = Array.isArray(action.effect?.changes) ? byClass(action.effect.changes) : [];", to: "  const changes = Array.isArray(action.effect?.changes) ? action.effect.changes : [];", breaks: "C3" },
  { name: "a feat's name counts as a class", file: RD, from: "    .filter((i) => i?.type === \"class\")\n    .map((i) => String(i?.name ?? \"\").trim().toLowerCase())", to: "    .filter((i) => i?.type === \"class\" || i?.type === \"feat\")\n    .map((i) => String(i?.name ?? \"\").trim().toLowerCase())", breaks: "C3" },
  // C4
  { name: "THE GAP: the critical's dice still land", file: AW, from: "    criticalDice: (drainDice || guardDice) ? 0 : critDiceKept,", to: "    criticalDice: drainDice ? 0 : critDiceKept,", breaks: "C4" },
  { name: "Guarded heals all of it", file: RD, from: "  return Math.ceil(Math.max(0, Number(negated) || 0) / 2);", to: "  return Math.max(0, Number(negated) || 0);", breaks: "C4" },
  { name: "Guarded is every time, not once a day", file: RD, from: "    if (!runeFrequencyAllows(runeMarkersOf(e.item), e.key, frequency, now)) continue;\n    return { key: e.key, label: `${e.item?.name ?? \"\"} (${e.label})`, runeLabel", to: "    return { key: e.key, label: `${e.item?.name ?? \"\"} (${e.label})`, runeLabel", breaks: "C4" },
  { name: "the guard's heal never reaches the target", file: AW, from: "        const healed = await relayHeal(targetActor, heal, {}, () => healActor(targetActor, heal));", to: "        const healed = 0;", breaks: "C4" },
  { name: "the guard's player is never asked", file: CGW, from: "  const yes = await askOwner(target, {", to: "  const yes = await Promise.resolve(true) && ({", breaks: "C4" },
  { name: "the day is never marked", file: CGW, from: "    const updates = runeUseUpdates(runeMarkersOf(item), key, frequency, worldNow());", to: "    const updates = {};", breaks: "C4" },
  // C5
  { name: "THE GAP: Harmony Edge is never asked", file: AW, from: "    const edge = await offerCriticalAdvantage(actor, weapon, bias);\n    if (edge) { bias = edge.bias; edgeLine = edge.line; }", to: "    const edge = null;\n    if (edge) { bias = edge.bias; edgeLine = edge.line; }", breaks: "C5" },
  { name: "advantage does not cancel a minor critical's disadvantage", file: RD, from: "  return bias === \"disadvantage\" ? \"normal\" : \"advantage\";", to: "  return \"advantage\";", breaks: "C5" },
  { name: "a forced re-read is asked too", file: AW, from: "  if (weapon && (forcedResult === null || forcedResult === undefined)) {", to: "  if (weapon) {", breaks: "C5" },
  { name: "the card never says it", file: AW, from: "  if (edgeLine) lines.push(line(edgeLine));\n", to: "", breaks: "C5" },
  // C6
  { name: "THE GAP: a module's energy rune deals nothing", file: RDM, from: "    const registered = DAMAGE_RUNES[chosen.key] ? null : registeredEnergyRune(chosen.key);", to: "    const registered = null;", breaks: "C6" },
  { name: "it deals damage switched off", file: RDM, from: "    if ((ENERGY_RUNES[chosen.key] || registered) && !energyRuneActive(item, chosen.key)) continue;", to: "    if (ENERGY_RUNES[chosen.key] && !energyRuneActive(item, chosen.key)) continue;", breaks: "C6" },
  { name: "its secondary critical is dropped", file: RD, from: "        ? null : Math.trunc(Number(t.secondaryCritical))", to: "        ? null : null", breaks: "C6" },
  { name: "no Command button", file: RA, from: "    const energy = declaredEnergyAction(chosen, kind, item);\n    if (energy) { out.push(energy); continue; }", to: "    const energy = null;\n    if (energy) { out.push(energy); continue; }", breaks: "C6" },
  { name: "the button is pressed as a declared action", file: RAW, from: "  if (action.declaredEnergy) return useEnergyRune(actor, item, action);\n", to: "", breaks: "C6" },
  // C7
  { name: "THE GAP: an action with no minute lays nothing", file: RAW, from: "  } else if (action.effect?.strikeRider || extra.conditionals?.length) {", to: "  } else if (false) {", breaks: "C7" },
  { name: "the rider is not once", file: RA, from: "    ? { ...action.effect.strikeRider, label: action.effect.strikeRider.label ?? action.label, once: true }", to: "    ? { ...action.effect.strikeRider, label: action.effect.strikeRider.label ?? action.label, once: false }", breaks: "C7" },
  { name: "the distance is never gated", file: SR, from: "      if (spec.beyondFeet) {\n        const feet = Number(ctx?.distanceFeet);", to: "      if (false) {\n        const feet = Number(ctx?.distanceFeet);", breaks: "C7" },
  { name: "30 feet is far enough", file: SR, from: "        const far = Number.isFinite(feet) && feet > spec.beyondFeet;", to: "        const far = Number.isFinite(feet) && feet >= spec.beyondFeet;", breaks: "C7" },
  { name: "precision immunity is ignored", file: SR, from: "        if (ctx?.precisionImmune) {\n          packet.resolved = true;", to: "        if (false) {\n          packet.resolved = true;", breaks: "C7" },
  { name: "precision is dealt as the row's type", file: SR, from: "    type: own ? own.type : (spec.precision ? (weaponType || spec.damageType) : spec.damageType),", to: "    type: own ? own.type : spec.damageType,", breaks: "C7" },
  { name: "the unmet packet is not marked conditional, so it is rolled anyway", file: SR, from: "          packet.applies = false;\n          packet.conditional = true;\n          packet.why = Number.isFinite(feet)", to: "          packet.applies = false;\n          packet.why = Number.isFinite(feet)", breaks: "C7" },
  { name: "the Strike never says how far", file: AW, from: "      distanceFeet: await strikeDistanceFeet(actor, targetTokenHere),\n", to: "", breaks: "C7" },
  // C7b
  { name: "THE GAP: Mindful's offer never ends at the next turn", file: RA, from: "      ...(ends !== null ? { conditionExpiresRound: ends } : {})\n", to: "", breaks: "C7b" },
  { name: "every next-Strike effect takes the round", file: RA, from: "  const ends = action.effect?.untilTurnStart === true && Number.isFinite", to: "  const ends = Number.isFinite", breaks: "C7b" },
  { name: "the workflow gives it this round, not the next", file: RAW, from: "    const expiresRound = fighting ? Number(combat.round ?? 0) + 1 : null;", to: "    const expiresRound = fighting ? Number(combat.round ?? 0) : null;", breaks: "C7b" },
  { name: "a combat the wielder is not in still sets a round", file: RAW, from: "    const fighting = Boolean(combat?.started && Array.from(combat.combatants ?? []).some((c) => c.actor?.id === actor.id));", to: "    const fighting = Boolean(combat?.started);", breaks: "C7b" },
  // C8
  { name: "THE GAP: a route's types are not opened", file: CCW, from: "    ? Object.entries(ITEM_TYPES).filter(([key]) => route.itemTypes.includes(key)).map(([key, cfg]) => ({ key, ...cfg }))", to: "    ? itemTypesForSkill(skillKey)", breaks: "C8" },
  { name: "the route opens without its requirement", file: CC, from: "  return (routes ?? []).find((r) => r && r.skill === skillKey && r.requires.some((n) => held.includes(n))) ?? null;", to: "  return (routes ?? []).find((r) => r && r.skill === skillKey) ?? null;", breaks: "C8" },
  { name: "the DC is not raised", file: ACW, from: "  if (action.key === \"create\" && createRouteDC && finalDC !== null) {\n    finalDC += createRouteDC;", to: "  if (action.key === \"create\" && createRouteDC && finalDC !== null) {\n    finalDC += 0;", breaks: "C8" },
  { name: "a later day forgets the DC", file: ACW, from: "      createRouteDC = Math.max(0, Math.trunc(Number(active.routeDC) || 0));\n", to: "", breaks: "C8" },
  { name: "Meditation is never added to Create", file: APIW, from: "registerCreateRoute(route, moduleId, { addSkill: addSkillToAction })", to: "registerCreateRoute(route, moduleId)", breaks: "C8" },
  { name: "the skill is added twice", file: SA, from: "  if (i < 0 || !want || (SKILL_ACTIONS[i].skills ?? []).includes(want)) return false;", to: "  if (i < 0 || !want) return false;", breaks: "C8" },
  { name: "Create through Meditation goes ahead without a route", file: ACW, from: "    if (!createSkillIsNative(skillKey) && !route) {", to: "    if (false) {", breaks: "C8" },
  { name: "the route's ticks are not asked", file: CCW, from: "route.ticks.map((t, i) => req(`reqRoute${i}`, esc(t))).join(\"\")", to: "\"\"", breaks: "C8" },
  // C9
  { name: "THE GAP: an aura runs while unlit", file: CA, from: "      if (raw?.whileState && !item?.flags?.[SYSTEM_ID]?.runeState?.[String(raw.whileState)]) return;\n", to: "", breaks: "C9" },
  { name: "the timer forgets its words", file: RT, from: "      ...(spec?.ending && typeof spec.ending === \"object\" ? { ending: { lapsed: String(spec.ending.lapsed ?? \"\"), manual: String(spec.ending.manual ?? \"\") } } : {})", to: "", breaks: "C9" },
  { name: "the API cannot start a timer", file: APIW, from: "    startItemTimer: async (actor, item, { key, state, label, durationSeconds, ending = null }) => {", to: "    startItemTimerGone: async (actor, item, { key, state, label, durationSeconds, ending = null }) => {", breaks: "C9" },
  // C10
  { name: "THE GAP: age takes Hit Points", file: ACT, from: "    conTotal: withoutAge(system.attributes?.constitution?.total ?? 0, ageShift, \"constitution\"),", to: "    conTotal: system.attributes?.constitution?.total ?? 0,", breaks: "C10" },
  { name: "age gives skill points", file: CD, from: "  const ability = withoutAge(system.attributes?.[abilityKey]?.total ?? 0, ageShiftOf(actor?.appliedEffects ?? actor?.effects ?? []), abilityKey);", to: "  const ability = system.attributes?.[abilityKey]?.total ?? 0;", breaks: "C10" },
  { name: "every effect counts as age", file: AGE, from: "    if (!effect || effect.disabled || !effect.flags?.[SYSTEM_ID]?.age) continue;", to: "    if (!effect || effect.disabled) continue;", breaks: "C10" },
  { name: "a disabled age effect still counts", file: AGE, from: "    if (!effect || effect.disabled || !effect.flags?.[SYSTEM_ID]?.age) continue;", to: "    if (!effect || !effect.flags?.[SYSTEM_ID]?.age) continue;", breaks: "C10" },
  { name: "the shift is added, not taken back", file: AGE, from: "  return (Number(total) || 0) - (Number(shift?.[ability]) || 0);", to: "  return (Number(total) || 0) + (Number(shift?.[ability]) || 0);", breaks: "C10" },
  // C12
  { name: "THE GAP: a tiered value is never read", file: RD, from: "      const c = classValued(tierValued(raw, entry.tier), classes);", to: "      const c = classValued(raw, classes);", breaks: "C12" },
  { name: "every tier takes the first value", file: RD, from: "  const at = Math.min(Math.max(1, Math.floor(Number(tier) || 1)), row.value.length) - 1;", to: "  const at = 0;", breaks: "C12" },
  // C11
  { name: "THE GAP: no helper releases an item's spell", file: APIW, from: "        const out = await releaseItemSpell(actor, item, ref, { apPaid: Boolean(apPaid), fixedDC });", to: "        const out = null;", breaks: "C11" },
  { name: "the item's PP is not passed", file: APIW, from: "pp: Math.max(0, Math.trunc(Number(pp) || 0)), warp: null };", to: "pp: 0, warp: null };", breaks: "C11" },
  // Q
  { name: "THE GAP: the GM is asked before the player", file: OQ, from: "  const player = (owners ?? []).find((u) => u && u.active && !u.isGM);", to: "  const player = null;", breaks: "Q" },
  { name: "an idle player is asked", file: OQ, from: "find((u) => u && u.active && !u.isGM)", to: "find((u) => u && !u.isGM)", breaks: "Q" },
  { name: "the query is never registered", file: BOOT, from: "  registerOwnerQuery();\n", to: "", breaks: "Q" },
  { name: "the guard's step is never registered", file: BOOT, from: "  registerCriticalGuardStep();\n", to: "", breaks: "C4" },
  // R — found in review
  { name: "THE REVIEW'S 1: the GM never says it has the request", file: TR, from: "  deps.acknowledge?.({ action: RELAY_ACTIONS.WORKING, requestId: data.requestId, userId: data.userId });\n", to: "", breaks: "R1" },
  { name: "a WORKING is carried out as a request", file: TR, from: "  if (action === RELAY_ACTIONS.RESULT || action === RELAY_ACTIONS.WORKING) return", to: "  if (action === RELAY_ACTIONS.RESULT) return", breaks: "R1" },
  { name: "the longer wait is shorter than a player's minute", file: TR, from: "export const RELAY_WORKING_TIMEOUT_MS = 90000;", to: "export const RELAY_WORKING_TIMEOUT_MS = 30000;", breaks: "R1" },
  { name: "the asker never hears it", file: TRW, from: "      if (data.userId === game.user?.id) working.get(data.requestId)?.();", to: "", breaks: "R1" },
  { name: "THE REVIEW'S 2: a late yes still counts", file: OQW, from: "  if (windowMs > 0 && !answeredInTime(askedAt, Date.now(), windowMs)) {", to: "  if (false) {", breaks: "R2" },
  { name: "the window is the asker's whole minute", file: OQ, from: "export const ANSWER_WINDOW_MS = ASK_WAIT_MS - 5 * 1000;", to: "export const ANSWER_WINDOW_MS = ASK_WAIT_MS;", breaks: "R2" },
  { name: "an untimed answer counts", file: OQ, from: "  if (askedAt === null || askedAt === undefined || answeredAt === null || answeredAt === undefined) return false;\n", to: "", breaks: "R2" },
  { name: "THE REVIEW'S 3: Harmony Edge is asked at a deadly critical", file: CGW, from: "  if (!edge || !attacker || biasWithAdvantage(bias) === bias) return null;", to: "  if (!edge || !attacker) return null;", breaks: "R3" },
  { name: "THE REVIEW'S 4: an unmeasured distance is 0 feet", file: AW, from: "    if (raw === null || raw === undefined || raw === \"\") return NaN;\n", to: "", breaks: "R4" },
  { name: "THE REVIEW'S 5: a spell's critical is never guarded", file: CAST, from: "    const guarded = await offerCriticalGuard(targetActor, actor, spell);", to: "    const guarded = null;", breaks: "R5" },
  { name: "a guarded spell critical still deals its dice", file: CAST, from: "    if (guarded) guardedNegated = { formula: critFormula, total: critRoll.total };\n    else {", to: "    if (guarded) guardedNegated = { formula: critFormula, total: critRoll.total };\n    {", breaks: "R5" },
  { name: "THE REVIEW'S 6: a registered rune's usage is not read", file: WRU, from: "  const rule = RUNE_USAGE[key] ?? registeredRune(key)?.usage ?? null;", to: "  const rule = RUNE_USAGE[key] ?? null;", breaks: "R6" },
  { name: "a melee weapon is ranged enough", file: WRU, from: "  if (rule.ranged && usage?.melee) return no(\"this is not a ranged weapon\");\n", to: "", breaks: "R6" },
  { name: "the usage is not kept at registration", file: API, from: "      ...(raw.usage && typeof raw.usage === \"object\" ? { usage: registeredRuneUsage(raw.usage) } : {}),\n", to: "", breaks: "R6" },
  { name: "a refused rune keeps its button", file: RA, from: "    if (kind === \"weapon\" && registeredRune(chosen.key) && !runeUsageAllows(chosen.key, weaponUsage(item?.system)).ok) continue;\n", to: "", breaks: "R6" },
  { name: "THE REVIEW'S 7: no timer is ended by hand", file: APIW, from: "      return stopRuneTimer(actor, item, key);", to: "      return false;", breaks: "R7" },
  // version
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.673.3\"", to: "\"version\": \"3.672.1\"", breaks: "Z0" },
  // 3.673.1 (F2, the live test)
  { name: "THE DEFECT: the weapon card's Now X HP is read before Guarded's heal", file: AW, from: "          damageResult.newHP = Number(damageResult.newHP) + Number(healed);\n", to: "", breaks: "L1" },
  { name: "the card's figure is mended but the Strike's result is not", file: AW, from: "          finalHP = damageResult.newHP;\n", to: "", breaks: "L1" },
  { name: "the heal is counted before it is dealt", file: AW, from: "        if (damageResult && Number.isFinite(Number(damageResult.newHP)) && Number(healed) > 0) {", to: "        if (damageResult && Number.isFinite(Number(damageResult.newHP)) && Number(heal) > 0) {", breaks: "L1" },
  { name: "the spell's card no longer counts its heal", file: CAST, from: "      if (newHP !== null && Number.isFinite(Number(newHP))) newHP = Number(newHP) + (Number(healed) || 0);", to: "", breaks: "L1" },
  { name: "the patch version is not raised", file: SJ, from: "\"version\": \"3.673.3\"", to: "\"version\": \"3.673.0\"", breaks: "Z1" },
  // 3.673.2 (the timed rune's two cards)
  { name: "THE DEFECT: the round clock says \"expires\" over the rune's own ending", file: m("combat", "effect-application-workflow.mjs"), from: "      if (!speaksAtItsOwnEnd(effect)) expired.push(label);", to: "      expired.push(label);", breaks: "L2" },
  { name: "the world clock says \"expires\" over the rune's own ending", file: m("combat", "effect-application-workflow.mjs"), from: "      if (!speaksAtItsOwnEnd(effect)) expired.push(statusId", to: "      if (true) expired.push(statusId", breaks: "L2" },
  { name: "no effect speaks for itself", file: m("combat", "effect-expiry.mjs"), from: "  return Boolean(effect?.flags?.[\"trg-prime\"]?.[RUNE_TIMER_FLAG]);", to: "  return false;", breaks: "L2" },
  { name: "every effect speaks for itself, so nothing is announced", file: m("combat", "effect-expiry.mjs"), from: "  return Boolean(effect?.flags?.[\"trg-prime\"]?.[RUNE_TIMER_FLAG]);", to: "  return true;", breaks: "L2" },
  { name: "a silenced timer is not ended", file: m("combat", "effect-application-workflow.mjs"), from: "      if (!speaksAtItsOwnEnd(effect)) expired.push(label);", to: "      if (speaksAtItsOwnEnd(effect)) continue;\n      expired.push(label);", breaks: "L2" },
  { name: "the timer's lapse says the manual ending", file: m("rune-timers-workflow.mjs"), from: "      const lapsed = how !== \"manual\";", to: "      const lapsed = false;", breaks: "L2" },
  { name: "the second patch version is not raised", file: SJ, from: "\"version\": \"3.673.3\"", to: "\"version\": \"3.673.1\"", breaks: "Z2" },
  // 3.673.3 (F3 of the 3.673.2 live test)
  { name: "THE DEFECT: the line is printed on every critical", file: AW, from: "  if (critical && critDiceKept && !drainDice && !guardDice) {", to: "  if (critical) {", breaks: "L3" },
  { name: "the line is printed under Guarded", file: AW, from: "  if (critical && critDiceKept && !drainDice && !guardDice) {", to: "  if (critical && critDiceKept && !drainDice) {", breaks: "L3" },
  { name: "the line is printed under Soul Drain", file: AW, from: "  if (critical && critDiceKept && !drainDice && !guardDice) {", to: "  if (critical && critDiceKept && !guardDice) {", breaks: "L3" },
  { name: "the line is printed against precision immunity", file: AW, from: "  if (critical && critDiceKept && !drainDice && !guardDice) {", to: "  if (critical && !drainDice && !guardDice) {", breaks: "L3" },
  { name: "the third patch version is not raised", file: SJ, from: "\"version\": \"3.673.3\"", to: "\"version\": \"3.673.2\"", breaks: "Z3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block9-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block9-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-block9-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block9-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
