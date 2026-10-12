#!/usr/bin/env node
/**
 * mutate-automation-pass — the mutation half of verify-automation-pass
 * (3.630.0). Each mutation breaks one rule of the pass; the verify suite
 * must notice every one. The tree is guarded and restored.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const FEATS = m("feats.mjs"), API = m("module-api.mjs"), DG = m("combat", "death-guard.mjs"), DGW = m("combat", "death-guard-workflow.mjs");
const DS = m("combat", "death-state.mjs"), DW = m("combat", "dying-workflow.mjs"), DE = m("magic", "declared-effect.mjs"), RR = m("magic", "restore-rows.mjs");
const CR = m("magic", "condition-relief.mjs"), NSD = m("magic", "next-spell-damage.mjs"), DMG = m("combat", "damage-workflow.mjs"), CW = m("magic", "cast-workflow.mjs");
const SR = m("magic", "strike-riders.mjs"), SC = m("magic", "save-convert.mjs"), SCW = m("magic", "save-convert-workflow.mjs"), CHK = m("dice", "check.mjs");
const EC = m("magic", "entry-check.mjs"), ECW = m("magic", "entry-check-workflow.mjs"), RF = m("magic", "reveal-fact.mjs"), SL = m("magic", "slot-choice.mjs");
const SP = m("magic", "spell-pending.mjs"), PM = m("pending-modifiers.mjs"), DRD = m("combat", "damage-riders.mjs"), CDR = m("magic", "caster-damage-riders.mjs");
const ARL = m("magic", "area-region-life.mjs"), CCW = m("combat", "counteract-workflow.mjs"), AWK = m("combat", "attack-workflow.mjs"), CEW = m("conditions", "condition-events-workflow.mjs"), CUW = m("consumable-use-workflow.mjs"), SE = m("magic", "spell-effects.mjs"), WATCH = m("combat", "death-watch-workflow.mjs"), FD = m("dice", "fate-declare-workflow.mjs");
const MUTATIONS = [
  { name: "an Archetype feat spends a Class pick despite the bonus", file: FEATS, from: "  const archetypeSpent = Math.min(archetypePaid, extra.archetype);", to: "  const archetypeSpent = 0;", breaks: "A2" },
  { name: "the archetype pool is never shown", file: FEATS, from: "  if (extra.archetype > 0) out.archetype = { spent: archetypeSpent, available: extra.archetype };", to: "", breaks: "A2" },
  { name: "a throwing bonus breaks the banner", file: FEATS, from: "      const row = picks(actor);\n      if (row && typeof row === \"object\") rows.push(row);\n    } catch (err) {", to: "      const row = picks(actor);\n      if (row && typeof row === \"object\") rows.push(row);\n    } finally {", breaks: "A6" },
  { name: "a pick bonus without a function is accepted", file: API, from: "  if (!k || typeof picks !== \"function\") { problem(", to: "  if (!k) { problem(", breaks: "A5" },
  { name: "an unconditional guard is no guard", file: DG, from: "  const auto = raw.auto === true && !save && !offer;", to: "  const auto = false;", breaks: "B1" },
  { name: "would-die guards answer the 0-HP blow", file: DG, from: "      if (!spec || (spec.trigger ?? \"zeroHp\") !== want) continue;", to: "      if (!spec) continue;", breaks: "B1" },
  { name: "Second Heart answers massive damage", file: DG, from: "  if (spec.notOutright && ctx.massive) return \"the blow kills outright (massive damage)\";", to: "", breaks: "B4" },
  { name: "Prism Lotus heals 1", file: DG, from: "  if (spec?.heal === \"half\") return Math.max(1, Math.floor((Number(maxHP) || 0) / 2));", to: "", breaks: "B5" },
  { name: "a one-use guard stays", file: DGW, from: "    if (spec.once) lines.push(...await spendGuard(actor, effect, spec));\n    await postGuardCard(actor, spec.label, lines);\n    return { case: \"death-guard\"", to: "    await postGuardCard(actor, spec.label, lines);\n    return { case: \"death-guard\"", breaks: "B7" },
  { name: "the reaper never asks a would-die guard", file: DS, from: "      const spared = await trySparingGuards(actor);", to: "      const spared = null;", breaks: "B9" },
  { name: "a guard is told nothing of massive damage", file: DW, from: "      massive: massiveDamageInstantDeath(amount, hpBefore, maxHP),", to: "      massive: false,", breaks: "B10" },
  { name: "the end of Worldroot kills", file: DS, from: "  return d > limit && limit > 0 ? limit : null;", to: "  return null;", breaks: "B13" },
  { name: "any flag may be declared", file: DE, from: "  for (const key of DECLARABLE_FLAGS) {", to: "  for (const key of Object.keys(raw)) {", breaks: "C1" },
  { name: "the end of a Death State bonus is not marked", file: DE, from: "    if (spec.deathState > 0) flags[DEATH_STATE_CLAMP_FLAG] = true;", to: "", breaks: "C3" },
  { name: "Worldroot stacks", file: DE, from: "  if (!spec?.noStack) return false;", to: "  return false;", breaks: "C4" },
  { name: "every acid source ends", file: RR, from: "    .slice(0, spec.count);", to: "    ;", breaks: "D2" },
  { name: "locked PP are restored too", file: RR, from: "(spec.resource === \"pp\" ? Math.max(0, Number(pool.locked) || 0) : 0)", to: "0", breaks: "D4" },
  { name: "Dying is not relievable", file: CR, from: "  dying: Object.freeze({ label: \"Dying\", step: 1 })", to: "", breaks: "D5" },
  { name: "a per-choice formula is ignored", file: CR, from: "  const per = spec.choiceAmounts?.[condition];\n  if (per) return DICE_AMOUNT.test(per) ? per : \"\";", to: "", breaks: "D5" },
  { name: "the resin reaches everyone", file: CR, from: "  if (!spec?.targetItems?.length) return true;", to: "  return true;", breaks: "D7" },
  { name: "Blackfire's die is a d6 always", file: NSD, from: "    if (m) return `1d${m[2]}`;", to: "    if (m) return \"1d6\";", breaks: "E2" },
  { name: "any spell takes the fire boost", file: NSD, from: "    if (!b.damageTypes.some((t) => types.includes(t))) continue;", to: "", breaks: "E2" },
  { name: "the bypass ignores every resistance", file: DMG, from: "    const kept = Array.from(list ?? []).filter((k) => !bypassed.includes(String(k).trim().toLowerCase()));", to: "    const kept = [];", breaks: "E3" },
  { name: "the trait-keyed copy is not lifted", file: DMG, from: "    resistanceTraits: withoutBypassed(defences.resistanceTraits),", to: "    resistanceTraits: defences.resistanceTraits,", breaks: "E3b" },
  { name: "a threshold's Region is deleted at the cast", file: ARL, from: "  \"entryCheck\"\n]);", to: "]);", breaks: "H4b" },
  { name: "the push back walks back across", file: ECW, from: "waypoints: [{ x: back.x, y: back.y, action: \"displace\" }]", to: "waypoints: [{ x: back.x, y: back.y, action: \"walk\" }]", breaks: "H4c" },
  { name: "the push back's action goes back on the option", file: ECW, from: "{ method: \"api\", waypoints: [{ x: back.x, y: back.y, action: \"displace\" }] }", to: "{ method: \"api\", action: \"displace\" }", breaks: "H4c" },
  { name: "the Death State's clear throws again", file: DS, from: "  } catch (_e) {\n    return !actor.hasCondition?.(\"unconscious\");\n  }", to: "  } finally {\n    void 0;\n  }", breaks: "B10b" },
  { name: "a blank DC is DC 0 again", file: CCW, from: "  let dc = Number.isFinite(rawDC) && rawDC > 0 ? rawDC : null;", to: "  let dc = Number(result.dc);", breaks: "H4d" },
  { name: "the circumstance box is read by nothing", file: CCW, from: "  if (circ) modifiers.push({ label: \"Circumstance\", value: circ, type: \"circumstance\" });", to: "", breaks: "H4e" },
  { name: "the sheet's Damage roll forgets the conditionals", file: AWK, from: "    declaredBonus: standaloneDeclared.bonus,\n", to: "", breaks: "H4f" },
  { name: "the second reaper is told nothing", file: DS, from: "    const spared = takeRecentlySpared(key);\n    return spared ? { ...out, spared } : out;", to: "    return out;", breaks: "B9" },
  { name: "a spare is never remembered", file: DS, from: "    if (result?.spared) rememberSpared(key, result.spared);\n", to: "", breaks: "B9" },
  { name: "a declared Success still offers Conviction", file: FD, from: "  check.luckUsed = true;\n", to: "", breaks: "G7" },
  { name: "a declared Success shows the dice's margin", file: CHK, from: "      outcome.declared\n        ? \"Declared — the dice do not count\"\n        : outcome.margin === null", to: "      outcome.margin === null", breaks: "G7" },
  { name: "the wake deletes a vanished effect", file: CEW, from: "    if (!actor.effects?.get?.(effect.id)) continue;\n", to: "", breaks: "B10" },
  { name: "a coating with no weapon is spent anyway", file: CUW, from: "The dose is kept.`);\n      return null;", to: "The dose is kept.`);", breaks: "F7" },
  { name: "the level difference swallows the circumstance again", file: CCW, from: "      type: \"untyped\"\n    });\n  }\n  // A CIRCUMSTANCE", to: "      type: \"circumstance\"\n    });\n  }\n  // A CIRCUMSTANCE", breaks: "H4g" },
  { name: "the bypass never ends", file: DMG, from: "  return resistanceBypass.types.length && Date.now() < resistanceBypass.until ? resistanceBypass.types : [];", to: "  return resistanceBypass.types;", breaks: "E3" },
  { name: "a condition-only rider is malformed", file: SR, from: "  const conditionOnly = !weaponDie && !text(raw.dice) && Boolean(text(raw.condition));", to: "  const conditionOnly = false;", breaks: "F1" },
  { name: "Bleeding ends after a round", file: SR, from: "    : (Math.max(0, Math.trunc(Number(rawRounds) || 0)) || null);", to: "    : 1;", breaks: "F1" },
  { name: "a refused gate spends the rider", file: SR, from: "    .filter((spec) => !ctx || !riderIsGated(spec) || riderGatesHold(spec, ctx));", to: "    ;", breaks: "F4" },
  { name: "Communal Litany converts to a Success", file: SC, from: "  return spec?.improve ? (IMPROVE_ONE_DEGREE[lower(degreeKey)] ?? null) : \"success\";", to: "  return \"success\";", breaks: "G1" },
  { name: "the uses are dropped", file: SC, from: "  if (uses > 0) out.uses = uses;", to: "", breaks: "G2" },
  { name: "the last use never deletes", file: SCW, from: "    if (left <= 0) await effect.delete();", to: "    if (false) await effect.delete();", breaks: "G4" },
  { name: "a declared Success still offers rerolls", file: CHK, from: "        check.saveReactionResolved = true;\n      }\n    }\n\n    // LUCKY BREAK", to: "      }\n    }\n\n    // LUCKY BREAK", breaks: "G5" },
  { name: "a declared Success keeps the shift", file: FD, from: "shiftedFrom: undefined, declared: true", to: "declared: true", breaks: "G6" },
  { name: "a threshold has no save", file: EC, from: "  if (save) out.save = save;", to: "", breaks: "H1" },
  { name: "the gate lets anything through", file: EC, from: "  if (!spec?.gate?.length) return true;", to: "  return true;", breaks: "H2" },
  { name: "a minute's bar never lifts", file: EC, from: "  if (Number(bar.until) > 0) return now < Number(bar.until);", to: "  if (Number(bar.until) > 0) return true;", breaks: "H5" },
  { name: "Web's outcome gains keys", file: EC, from: "    ...(rung?.pushBack ? { pushBack: true } : {}),", to: "    pushBack: Boolean(rung?.pushBack),", breaks: "H4" },
  { name: "a creature inside is asked", file: ECW, from: "        if (startedInside || !enteredInside) continue;", to: "        if (!enteredInside) continue;", breaks: "H6" },
  { name: "the lowest save is the highest", file: RF, from: "    const low = Math.min(...rows.map(([, v]) => v));", to: "    const low = Math.max(...rows.map(([, v]) => v));", breaks: "I1" },
  { name: "a resistance before a weakness", file: RF, from: "    const weak = first(d.weaknesses);\n    if (weak)", to: "    const weak = first(d.resistances);\n    if (weak)", breaks: "I1" },
  { name: "an unranked skill is offered", file: SL, from: "    .filter(([, skill]) => Number(skill?.ranks ?? 0) >= 1)", to: "", breaks: "I3" },
  { name: "the warp buys no extra pick", file: SL, from: "  const count = Math.min(spec.options.length, 1 + Math.max(0, int(warpMods?.choiceExtra)));", to: "  const count = 1;", breaks: "I4" },
  { name: "Portents are one", file: SP, from: "  if (uses > 1) grant.uses = uses;", to: "", breaks: "I5" },
  { name: "a Portent spent takes them all", file: PM, from: "    if (Number.isFinite(left) && left > 1) remaining.push({ ...entry, usesLeft: left - 1 });", to: "", breaks: "I6" },
  { name: "Restless End grows against anything", file: DRD, from: "    return hits ? { ...r, dice: `${r.dice} + ${vs.dice}`, grown: true, ...(vs.label ? { grownBy: vs.label } : {}) } : r;", to: "    return { ...r, dice: `${r.dice} + ${vs.dice}`, grown: true };", breaks: "J1" },
  { name: "the grown die goes unnamed", file: DRD, from: ", grown: true, ...(vs.label ? { grownBy: vs.label } : {}) } : r;", to: ", grown: true } : r;", breaks: "J1b" },
  { name: "the Mantle rides any tradition", file: CDR, from: "    if (r.traditions?.length && !r.traditions.some((t) => traditions.includes(t))) return false;", to: "", breaks: "J2" },
  { name: "the Mantle once per creature", file: CDR, from: "  if (rider?.oncePerRoundAny) return `${rider?.id ?? \"\"}:any`;", to: "", breaks: "J2" },
  { name: "a damage share without a function is accepted", file: API, from: "  if (!k || typeof share !== \"function\") { problem(", to: "  if (!k) { problem(", breaks: "K3" },
  { name: "a Dying heal announces an overflow", file: SE, from: "if (excess > 0 && !wasDying) globalThis.Hooks?.callAll?.(\"trgPrimeOverheal\"", to: "if (excess > 0) globalThis.Hooks?.callAll?.(\"trgPrimeOverheal\"", breaks: "K5" },
  { name: "the watch reaps before it trims", file: WATCH, from: "      trimDyingToDeathState(actor).finally(() => scheduleReap(actor));\n      return;", to: "      scheduleReap(actor);\n      return;", breaks: "B14" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-automation-pass.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-automation-pass: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-automation-pass: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-automation-pass: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
