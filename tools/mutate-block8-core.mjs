#!/usr/bin/env node
/** mutate-block8-core — the mutation half of verify-block8-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AS = m("magic", "ability-swap.mjs"), SE = m("magic", "spell-effects.mjs"), EK = m("magic", "effect-kinds.mjs"),
  SR = m("magic", "strike-riders.mjs"), SRW = m("magic", "strike-riders-workflow.mjs"), AM = m("combat", "ammunition.mjs"),
  AW = m("combat", "attack-workflow.mjs"), CA = m("creature-ability-rules.mjs"), MA = m("module-api.mjs"), API = m("module-api-workflow.mjs"),
  GT = m("magic", "spell-check-gates.mjs"), CW = m("magic", "cast-workflow.mjs"), MM = m("magic", "module-mark.mjs"), SA = m("magic", "sanctuary.mjs"),
  RF = m("combat", "refocus.mjs"), ACW = m("combat", "action-workflow.mjs"), FT = m("dice", "foretell.mjs"), FW = m("dice", "foretell-workflow.mjs"),
  CK = m("dice", "check.mjs"), DE = m("magic", "declared-effect.mjs"), AD = m("magic", "attack-degree-rows.mjs"),
  DD = m("combat", "defence-dc.mjs"),
  SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  // C1
  { name: "THE GAP: the kind is not handled", file: EK, from: "  \"abilitySwap\", \"moduleMark\",\n", to: "  \"moduleMark\",\n", breaks: "C1" },
  { name: "a tie is broken here, not asked", file: AS, from: "    highKeys: scores.filter((s) => s.total === high).map((s) => s.key),", to: "    highKeys: scores.filter((s) => s.total === high).map((s) => s.key).slice(0, 1),", breaks: "C1" },
  { name: "all-equal scores still switch", file: AS, from: "  if (high === low) return null;\n", to: "", breaks: "C1" },
  { name: "the gap is written with one sign", file: AS, from: "value: String(-gap) },", to: "value: String(gap) },", breaks: "C1" },
  { name: "the trade goes to a typed slot that does not stack", file: AS, from: "{ key: `system.attributes.${highKey}.untyped`,", to: "{ key: `system.attributes.${highKey}.status`,", breaks: "C1" },
  { name: "a disabled trade still blocks", file: AS, from: "some((e) => !e?.disabled && e?.flags?.[systemId]?.[ABILITY_SWAP_FLAG]);", to: "some((e) => e?.flags?.[systemId]?.[ABILITY_SWAP_FLAG]);", breaks: "C1" },
  { name: "the lowest tie is never asked", file: SE, from: "          const lowKey = highKey ? await chooseTiedAbility(spell.name, target.name, found.lowKeys, \"lowest\", found.low) : \"\";", to: "          const lowKey = found.lowKeys[0];", breaks: "C1" },
  { name: "the changes are ADD, not the pool", file: SE, from: "            changes: abilitySwapChanges(highKey, lowKey, found.high, found.low, CHANGE_TYPE.CUSTOM),", to: "            changes: abilitySwapChanges(highKey, lowKey, found.high, found.low, CHANGE_TYPE.ADD),", breaks: "C1" },
  // C2
  { name: "THE GAP: the ladder is dropped", file: SR, from: "dc: Math.max(0, Math.trunc(Number(raw.conditionSave?.dc) || 0)), ...(ladder ? { ladder } : {}) }", to: "dc: Math.max(0, Math.trunc(Number(raw.conditionSave?.dc) || 0)) }", breaks: "C2" },
  { name: "a negative rung is accepted", file: SR, from: "    if (!Number.isFinite(value) || value < 0) return null;", to: "    if (!Number.isFinite(value)) return null;", breaks: "C2" },
  { name: "an unnamed rung falls to the rider's value", file: SR, from: "  return Math.max(0, Math.trunc(Number(ladder[key]) || 0));", to: "  return Math.max(0, Math.trunc(Number(ladder[key] ?? spec.conditionValue) || 0));", breaks: "C2" },
  { name: "a success takes a ladder's value", file: SR, from: "  if ([\"heroic\", \"critical\", \"success\"].includes(key)) return 0;\n  const ladder = spec?.conditionSave?.ladder;", to: "  const ladder = spec?.conditionSave?.ladder;", breaks: "C2" },
  { name: "THE ROUND TRIP: null reads as one round again", file: SR, from: "    : rawRounds === null\n      ? null\n      : (Math", to: "    : rawRounds === null\n      ? 1\n      : (Math", breaks: "C2" },
  { name: "the Strike applies the rider's value whatever the rung", file: SRW, from: "      value: cond.valued ? value : null", to: "      value: cond.valued ? spec.conditionValue : null", breaks: "C2" },
  { name: "an untouched rung still applies", file: SRW, from: "      if (!value) {\n        lines.push(`${targetActor.name} is unaffected by ${spec.label}", to: "      if (false) {\n        lines.push(`${targetActor.name} is unaffected by ${spec.label}", breaks: "C2" },
  { name: "a rider naming no DC gets none from the spell", file: SE, from: "              ? { ...effect.conditionSave, dc: Number(saveDC ?? rollData?.saveDC) }", to: "              ? effect.conditionSave", breaks: "C2" },
  // C3
  { name: "THE GAP: the multiple is never applied", file: AM, from: "  return Math.max(0, (base + bonus) * times);", to: "  return Math.max(0, base + bonus);", breaks: "C3" },
  { name: "the bow is asked even with a round loaded", file: AM, from: "export function rangeIncrementMultiplierOf(weaponItem, ammoItem, worldTime = 0) {\n  const projectile = ammoItem ?? weaponItem;", to: "export function rangeIncrementMultiplierOf(weaponItem, ammoItem, worldTime = 0) {\n  const projectile = weaponItem ?? ammoItem;", breaks: "C3" },
  { name: "a timed multiple never ends", file: AM, from: "  if (Number.isFinite(ends) && ends > 0 && Number(worldTime) >= ends) return 1;\n", to: "", breaks: "C3" },
  { name: "the Strike's range bands ignore it", file: AW, from: "    rangeIncrement = (effectiveRangeIncrement(weaponData, ammoSystem, {\n      multiplier: rangeIncrementMultiplierOf(weapon, ammo, Number(game.time?.worldTime ?? 0))\n    }) + archerRange) * farShot;", to: "    rangeIncrement = (effectiveRangeIncrement(weaponData, ammoSystem) + archerRange) * farShot;", breaks: "C3" },
  // C4
  { name: "THE GAP: an effect is never asked", file: CA, from: "  return Array.from(effects ?? []).some((e) => !e?.disabled && derivationOf(e)?.cannotBeFlanked === true);", to: "  return false;", breaks: "C4" },
  { name: "a disabled effect still gives it", file: CA, from: "some((e) => !e?.disabled && derivationOf(e)?.cannotBeFlanked === true);", to: "some((e) => derivationOf(e)?.cannotBeFlanked === true);", breaks: "C4" },
  { name: "the Strike passes no effects", file: AW, from: "abilitiesPreventFlanking(Array.from(targetActor.items ?? []), Array.from(targetActor.appliedEffects ?? targetActor.effects ?? []))", to: "abilitiesPreventFlanking(Array.from(targetActor.items ?? []))", breaks: "C4" },
  // C5
  { name: "a gate need not be a function", file: MA, from: "if (!k || typeof gate !== \"function\") { problem(", to: "if (!k) { problem(", breaks: "C5" },
  { name: "the API does not offer it", file: API, from: "    registerSpellCheckGate: (key, gate, moduleId) => registerSpellCheckGate(key, gate, moduleId),\n", to: "", breaks: "C5" },
  { name: "an unknown type is kept", file: GT, from: "type: BONUS_TYPES[type] ? type : \"untyped\" });", to: "type });", breaks: "C5" },
  { name: "a failing gate stops the others", file: GT, from: "      lines.push(\"<em>A module's answer to this casting failed — see the console.</em>\");\n    }", to: "      lines.push(\"<em>A module's answer to this casting failed — see the console.</em>\");\n      break;\n    }", breaks: "C5" },
  { name: "THE GAP: the gate's rows never reach the casting check", file: CW, from: "  modifiers.push(...gated.modifiers);\n  const gateLines", to: "  const gateLines", breaks: "C5" },
  { name: "an innate attack spell misses the gate's rows", file: CW, from: "            // A MODULE'S ANSWER (3.672.0): this roll is the casting's check.\n            ...gated.modifiers\n", to: "", breaks: "C5" },
  { name: "the gate's lines never reach the card", file: CW, from: "  const lines = [...reagentLines, ...gateLines];", to: "  const lines = [...reagentLines];", breaks: "C5" },
  { name: "the settled cast is not announced", file: CW, from: "  Hooks.callAll(\"trgPrimeSpellSettled\", {", to: "  void ({", breaks: "C5" },
  { name: "the settled cast is announced before a refund (review)", file: CW, from: "  /*\n   * THE CASTING, PAID FOR AND OVER", to: "  return { ...outcome, ppSpent, check, spellSave, refunded: castRefunded, warpMods };\n  /*\n   * THE CASTING, PAID FOR AND OVER", breaks: "C5" },
  { name: "a gate's penalty is promised to an item spell that rolls none (review)", file: CW, from: "(isItemCast ? (isAttack && !itemCheck) : isInnate ? isAttack : true)", to: "true", breaks: "C5" },
  { name: "the settled cast carries the spell's printed PP", file: CW, from: "    cast: Boolean(outcome.cast),\n    ppSpent,\n", to: "    cast: Boolean(outcome.cast),\n    ppSpent: basePP,\n", breaks: "C5" },
  // C6
  { name: "THE GAP: the kind is not handled", file: EK, from: "  \"abilitySwap\", \"moduleMark\",\n", to: "  \"abilitySwap\",\n", breaks: "C6" },
  { name: "the system's own namespace is writable", file: MM, from: "  if (!MODULE_ID.test(module) || module === SYSTEM_ID || module === \"core\") return null;", to: "  if (!MODULE_ID.test(module)) return null;", breaks: "C6" },
  { name: "the DC is not recorded", file: MM, from: "    dc: n(dc) && n(dc) > 0 ? n(dc) : null,", to: "    dc: null,", breaks: "C6" },
  { name: "the mark outlives a dropped spell", file: SE, from: "          // ENDS WITH THE SPELL: a sustained curse stops when it is dropped.\n          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;", to: "", breaks: "C6" },
  { name: "THE GAP: the save is rolled on casting", file: SA, from: "\n    || e?.saveAtCast === false);", to: ");", breaks: "C6" },
  { name: "a disabled mark still counts", file: MM, from: "some((e) => !e?.disabled && e?.flags?.[spec.module]?.[spec.key]);", to: "some((e) => e?.flags?.[spec.module]?.[spec.key]);", breaks: "C6" },
  // C7
  { name: "THE GAP: the second is never offered", file: ACW, from: "    refocusSecond = await chooseRefocusSecond(actor, refocusTarget, { event });\n", to: "", breaks: "C7" },
  { name: "a Partial touches the second", file: RF, from: "export function refocusSecondApplies(degree) {\n  return refocusSucceeded(degree);", to: "export function refocusSecondApplies(degree) {\n  return refocusSucceeded(degree) || degree === \"partial\";", breaks: "C7" },
  { name: "the first can be chosen again", file: RF, from: "filter((item) => item && item.id !== firstId);", to: "filter((item) => Boolean(item));", breaks: "C7" },
  { name: "a disabled effect still declares it", file: RF, from: "some((e) => e && !e.disabled && carries(e));", to: "some((e) => e && carries(e));", breaks: "C7" },
  { name: "closing the picker restores the first (review)", file: m("combat", "refocus-workflow.mjs"), from: "  if (picked === null || picked === undefined || picked === \"\") return null;\n", to: "", breaks: "C7" },
  { name: "it is lost when the GM sets the DC later", file: ACW, from: "      refocusSecond: item(stored?.refocusSecondId)\n", to: "      refocusSecond: null\n", breaks: "C7" },
  // C8
  { name: "THE GAP: the roll never tells", file: CK, from: "      await answerForetell(check, { withdrawable: false });", to: "      void answerForetell;", breaks: "C8" },
  { name: "the preview adds every bonus, unstacked", file: FT, from: "  const total = Number(outcome?.total ?? FORETOLD_DIE);", to: "  const total = FORETOLD_DIE + modifiers.reduce((s, x) => s + (Number(x?.value) || 0), 0);", breaks: "C8" },
  { name: "a flat check spends it", file: FT, from: "  if (!check?.actor || check.flat) return false;", to: "  if (!check?.actor) return false;", breaks: "C8" },
  { name: "an unset DC is answered as no DC (a guess)", file: FT, from: "  if (!outcome?.degree) return { known: false, succeeds: null, total, dc: null };", to: "  if (!outcome?.degree) return { known: true, succeeds: false, total, dc: null };", breaks: "C8" },
  { name: "a forced failure is foretold a success", file: FT, from: "  if (forcedFailure) return { known: true, succeeds: false, total, dc };\n", to: "", breaks: "C8" },
  { name: "the GM is never asked", file: FW, from: "    return Boolean(await gm.query(FORETELL_QUERY, payload, { timeout: 5 * 60 * 1000 }));", to: "    return false;", breaks: "C8" },
  { name: "the GM is kept waiting on a check under way", file: FW, from: "  if (!verdict.known && !withdrawable) {", to: "  if (false) {", breaks: "C8" },
  { name: "a skill action is asked after it spends", file: ACW, from: "  const foretellAsked = !presetDice && !exactFirst && !defersApCost", to: "  const foretellAsked = false && !presetDice && !exactFirst && !defersApCost", breaks: "C8" },
  { name: "a called-back skill action is rolled anyway", file: ACW, from: "      await postCard(actor, action.name, [line(`<em>${actor.name} takes a different action instead — nothing was spent.</em>`)]);\n      return null;", to: "      await postCard(actor, action.name, [line(`<em>${actor.name} takes a different action instead — nothing was spent.</em>`)]);", breaks: "C8" },
  { name: "the preview spends the pending rows", file: CK, from: "if (taken.consume.length && !check.previewOnly) await consumePendingModifiers", to: "if (taken.consume.length) await consumePendingModifiers", breaks: "C8" },
  { name: "the preview spends the one-shots", file: CK, from: "of check.previewOnly ? [] : (applied.spent ?? [])) {", to: "of (applied.spent ?? [])) {", breaks: "C8" },
  { name: "the preview asks the tick-boxes", file: CK, from: "if (!check.previewOnly) await offerConditionalsOnRoll(", to: "await offerConditionalsOnRoll(", breaks: "C8" },
  { name: "the preview runs on into the dice", file: CK, from: "    if (check.previewOnly) return check;\n", to: "", breaks: "C8" },
  // C9
  { name: "THE GAP: the terrain flag is not declarable", file: DE, from: "  \"ignoresDifficultTerrain\", \"firstMoveNoReactions\", \"creatureAbility\", \"foretell\", \"refocusExtra\"\n]);", to: "  \"firstMoveNoReactions\", \"creatureAbility\", \"foretell\", \"refocusExtra\"\n]);", breaks: "C9" },
  { name: "any value passes for a true-only flag", file: DE, from: "    } else if (TRUE_ONLY_FLAGS.includes(key)) {\n      if (raw[key] !== true) return null;", to: "    } else if (TRUE_ONLY_FLAGS.includes(key)) {\n      if (!raw[key]) return null;", breaks: "C9" },
  { name: "any derive may be declared", file: DE, from: "names.some((n) => !DECLARABLE_DERIVES.includes(n) || derives[n] !== true)", to: "names.some((n) => derives[n] !== true)", breaks: "C9" },
  { name: "the card is silent about the flank", file: DE, from: "  if (spec.flags.creatureAbility?.derives?.cannotBeFlanked) parts.push(\"it cannot be flanked\");\n", to: "", breaks: "C9" },
  // C10
  { name: "THE GAP: the severity is not handed on", file: CW, from: "critical: Boolean(r?.critical), severity: r?.critical?.severity ?? null }))", to: "critical: Boolean(r?.critical) }))", breaks: "C10" },
  { name: "the floor is never asked", file: AD, from: "  if (critical && floor) return severityRank(severity) >= severityRank(floor);", to: "", breaks: "C10" },
  { name: "the floor is one rung low", file: AD, from: "  if (critical && floor) return severityRank(severity) >= severityRank(floor);", to: "  if (critical && floor) return severityRank(severity) >= severityRank(floor) - 1;", breaks: "C10" },
  // C11
  { name: "THE GAP: the GM's client never ends it", file: m("combat", "target-relay.mjs"), from: "      const ended = await deps.endSpell(target, String(payload.castId ?? \"\"));\n      return { ok: true, result: Boolean(ended) };", to: "      return { ok: false, reason: \"unknown\" };", breaks: "C11" },
  { name: "the owner's client asks the GM anyway", file: m("combat", "target-relay-workflow.mjs"), from: "  if (!needsRelay(caster)) {\n    const { endActiveSpell }", to: "  if (false) {\n    const { endActiveSpell }", breaks: "C11" },
  { name: "an ended spell reads as dismissed", file: m("combat", "target-relay-workflow.mjs"), from: "    return { ok: true, result: Boolean(await endActiveSpell(caster, id, { dismissed: false })) };", to: "    return { ok: true, result: Boolean(await endActiveSpell(caster, id)) };", breaks: "C11" },
  { name: "the module helper is missing", file: API, from: "      endSpellOf: async (caster, castId) => (await import(\"./combat/target-relay-workflow.mjs\")).relayEndSpell(caster, castId),\n", to: "", breaks: "C11" },
  // C12
  { name: "THE GAP: the cap is not counted", file: SE, from: "  if (warpBonusMax === null || warpBonusMax === undefined) return extra;\n  return Math.max(0, Math.min(extra, Math.abs(Number(warpBonusMax) || 0) - Math.abs(Number(value) || 0)));", to: "  return extra;", breaks: "C12" },
  { name: "the row is handed the raw warp", file: SE, from: "defenceDCRowFrom(effect, spell.name, defenceDCWarpExtra(effect.value, warpBonus, warpBonusMax));", to: "defenceDCRowFrom(effect, spell.name, warpBonus);", breaks: "C12" },
  // C13
  { name: "THE GAP: a declared tick never grows", file: SE, from: "            spec.flags.conditionals = declaredConditionalsWarped(spec.flags.conditionals, warpBonus, warpBonusMax);", to: "", breaks: "C13" },
  { name: "every declared row grows", file: SE, from: "(row?.warpBonus === true && Number.isFinite(Number(row.value))", to: "(Number.isFinite(Number(row?.value))", breaks: "C13" },
  { name: "the cap is ignored", file: SE, from: "    ? { ...row, value: warpedBonusValue(Number(row.value), warpBonus, warpBonusMax) }", to: "    ? { ...row, value: warpedBonusValue(Number(row.value), warpBonus, null) }", breaks: "C13" },
  // F1 (3.672.1)
  { name: "LIVE TEST BROKEN AGAIN: a save DC prints its key", file: DD, from: "  fortitudeDC: \"Fortitude DC\", reflexDC: \"Reflex DC\", willDC: \"Will DC\",", to: "  reflexDC: \"Reflex DC\", willDC: \"Will DC\",", breaks: "F1" },
  { name: "a skill DC keeps its prefix", file: DD, from: "SKILL_DC.test(key) ? key.slice(\"skillDC:\".length) : key", to: "key", breaks: "F1" },
  { name: "the card goes back to the raw key", file: SE, from: "            + `${defenceDCKeyText(dcKey)} anyone rolls against to `", to: "            + `${dcKey.replace(/^skillDC:/, \"\")} DC anyone rolls against to `", breaks: "F1" },
  // version
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.673.2\"", to: "\"version\": \"3.671.1\"", breaks: "Z0" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block8-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block8-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-block8-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block8-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
