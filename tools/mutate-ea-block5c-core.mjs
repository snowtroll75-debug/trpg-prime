#!/usr/bin/env node
/** mutate-ea-block5c-core — the mutation half of verify-ea-block5c-core. NEW at 3.683.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const SDB = m("magic", "spell-damage-bonus.mjs"), CW = m("magic", "cast-workflow.mjs"), API = m("module-api.mjs"), APIW = m("module-api-workflow.mjs"),
  DG = m("combat", "death-guard.mjs"), DGW = m("combat", "death-guard-workflow.mjs"), DS = m("combat", "death-state.mjs"),
  COMBAT = m("documents", "combat.mjs"), SEF = m("magic", "spell-effects.mjs"), CCI = m("dice", "check-card-interactions.mjs");
const MUTATIONS = [
  // C6
  { name: "the pool's type is not read", file: SDB, from: "      if (types.length && !types.includes(pool)) continue;\n", to: "", breaks: "C6-2" },
  { name: "THE GAP: the flat reader takes a per-die row as flat", file: SDB, from: "      if (row.perDie !== undefined && row.perDie !== null) continue;\n", to: "", breaks: "C6-7b" },
  { name: "the per-die reader takes a flat row's value as per die", file: SDB, from: "      if (!row || typeof row !== \"object\" || row.perDie === undefined || row.perDie === null) continue;\n      const perDie = Math.trunc(Number(row.perDie) || 0);", to: "      if (!row || typeof row !== \"object\") continue;\n      const perDie = Math.trunc(Number(row.perDie ?? row.value) || 0);", breaks: "C6-7" },
  { name: "a disabled effect still adds per die", file: SDB, from: "    if (!effect || effect.disabled) continue;\n    const declared", to: "    if (!effect) continue;\n    const declared", breaks: "C6-8" },
  { name: "Fury and Apotheosis do not stack (Q70)", file: SDB, from: "    if (row[field] < 0 || STACKING[row.type] !== \"highest\") { kept.push(row); continue; }", to: "    if (row[field] < 0) { kept.push(row); continue; }", breaks: "C6-3" },
  { name: "two status rows both count", file: SDB, from: "    if (!held || row[field] > held[field]) best.set(row.type, row);\n  }\n  return [...best.values(), ...kept];", to: "    kept.push(row);\n  }\n  return [...best.values(), ...kept];", breaks: "C6-10" },
  { name: "a die with no count is not counted", file: SDB, from: "    n += m[1] === \"\" ? 1 : Math.trunc(Number(m[1]) || 0);", to: "    n += Math.trunc(Number(m[1]) || 0);", breaks: "C6-4" },
  { name: "the bonus is once per pool, not per die", file: SDB, from: "  const total = count * perDie;", to: "  const total = count ? perDie : 0;", breaks: "C6-3/C6-5" },
  { name: "a negative per die is taken", file: SDB, from: "      if (perDie <= 0) continue;\n", to: "", breaks: "C6-11" },
  { name: "the per-die row's traits are ignored", file: SDB, from: "      if (wanted.length && !wanted.some((t) => have.has(t))) continue;\n      const type = STACKING[String(row.type ?? \"\").trim()] ? String(row.type).trim() : \"untyped\";\n      rows.push({ label: String(row.label ?? effect.name ?? \"\").trim() || \"Spell damage bonus\", perDie,", to: "      const type = STACKING[String(row.type ?? \"\").trim()] ? String(row.type).trim() : \"untyped\";\n      rows.push({ label: String(row.label ?? effect.name ?? \"\").trim() || \"Spell damage bonus\", perDie,", breaks: "C6-12" },
  { name: "the asker matches the spell's type, not the pool's", file: CW, from: "    { damageType: String(type ?? \"\"), traits: spell?.system?.traits ?? \"\" }));", to: "    { damageType: String(spell?.system?.damage?.type ?? \"\"), traits: spell?.system?.traits ?? \"\" }));", breaks: "C6-15" },
  { name: "THE GAP: the bolt takes nothing per die", file: CW, from: "  if (boltPerDie.total && surged.formula) surged.formula = `${surged.formula} + ${boltPerDie.total}`;\n", to: "", breaks: "C6-16" },
  { name: "a critical's dice take nothing", file: CW, from: "      else { critBonus += critPerDie.total; dealt += critPerDie.total; }", to: "      else { critBonus += 0; }", breaks: "C6-17" },
  { name: "the attack's second pool takes nothing", file: CW, from: "        amount: secondRoll.total + secondPerDie.total,", to: "        amount: secondRoll.total,", breaks: "C6-18" },
  { name: "a ladder is read as the spell's type", file: CW, from: "    const primaryType = saveLadder ? (saveLadder.damageType || damageType) : damageType;", to: "    const primaryType = damageType;", breaks: "C6-19" },
  { name: "Bleed as a condition takes per-die damage", file: CW, from: "  if (damageFormula && ((isBasic && !asCondition) || (saveLadder", to: "  if (damageFormula && ((isBasic) || (saveLadder", breaks: "C6-19" },
  { name: "the save's second pool takes nothing", file: CW, from: "      secondaryBase += secondaryPerDie.total;\n", to: "", breaks: "C6-20" },
  { name: "a rung's dice take nothing", file: CW, from: "          rungTotal += rungPerDie.total;\n", to: "", breaks: "C6-21" },
  { name: "the immune alternate takes nothing", file: CW, from: "          alternateBase += altPerDie.total;\n", to: "", breaks: "C6-22" },
  { name: "a basic save's critical dice take nothing", file: CW, from: "          amount += saveCritPerDie.total;\n", to: "", breaks: "C6-23" },
  { name: "the helper ignores the pool's type", file: APIW, from: "Array.from(actor?.appliedEffects ?? actor?.effects ?? []), { damageType: String(type ?? \"\"), traits }));", to: "Array.from(actor?.appliedEffects ?? actor?.effects ?? []), { traits }));", breaks: "C6-26" },
  // C7
  { name: "THE GAP: healTo is not kept", file: DG, from: "  if (healTo) out.healTo = healTo;\n", to: "", breaks: "C7-1/C7-2" },
  { name: "the ability is not added", file: DG, from: "    const hp = Math.max(1, lv + ab);", to: "    const hp = Math.max(1, lv);", breaks: "C7-2" },
  { name: "a negative total heals to 0", file: DG, from: "    const hp = Math.max(1, lv + ab);", to: "    const hp = Math.max(0, lv + ab);", breaks: "C7-3" },
  { name: "the maximum is not a ceiling", file: DG, from: "    return max > 0 ? Math.min(max, hp) : hp;", to: "    return hp;", breaks: "C7-4" },
  { name: "an unknown ability is accepted", file: DG, from: "  const ability = ABILITIES.includes(lower(raw.ability)) ? lower(raw.ability) : \"\";", to: "  const ability = lower(raw.ability);", breaks: "C7-6" },
  { name: "the zero-HP guard still writes 1", file: DGW, from: "    await actor.update({ \"system.resources.hp.value\": healTo });", to: "    await actor.update({ \"system.resources.hp.value\": 1 });", breaks: "C7-9" },
  { name: "the zero-HP guard is not told the level", file: DGW, from: "    const healTo = deathGuardHealTo(spec, actor.system?.resources?.hp?.max, {\n      level: actor.system?.identity?.level, attributes: actor.system?.attributes\n    });", to: "    const healTo = deathGuardHealTo(spec, actor.system?.resources?.hp?.max);", breaks: "C7-9" },
  { name: "the question still says 1 HP", file: DGW, from: "and stay at ${healTo} HP?</p>", to: "and stay at 1 HP?</p>", breaks: "C7-10" },
  // C8
  { name: "a non-function modifier is accepted", file: API, from: "if (!k || typeof modify !== \"function\") { problem(`registerDyingRecoveryModifier", to: "if (!k) { problem(`registerDyingRecoveryModifier", breaks: "C8-1" },
  { name: "the asking goes on after a waiver", file: DS, from: "      if (answer.noFatigue === true) { out.noFatigue = true; out.key = String(key ?? \"\"); break; }", to: "      if (answer.noFatigue === true) { out.noFatigue = true; out.key = String(key ?? \"\"); }", breaks: "C8-3" },
  { name: "a throwing modifier stops the recovery", file: DS, from: "      console.error(`TRG Prime | dying recovery modifier \"${key}\"`, error);", to: "      throw error;", breaks: "C8-3" },
  { name: "THE GAP: the waiver is not applied", file: DS, from: "    if (waiver.noFatigue) noFatigue = true;\n", to: "", breaks: "C8-6" },
  { name: "the waiver's line is lost", file: DS, from: "    if (Array.isArray(lines)) lines.push(...said);", to: "    if (Array.isArray(lines)) lines.push();", breaks: "C8-6" },
  { name: "the route is not handed on", file: DS, from: "      actor, route: String(route ?? \"\"), hp, fatigued: current, unconscious: recovered.unconscious", to: "      actor, route: \"\", hp, fatigued: current, unconscious: recovered.unconscious", breaks: "C8-7" },
  { name: "asked even when Death's Defiance already waived it", file: DS, from: "  if (!noFatigue && mayLeaveDying(actor)) {", to: "  if (mayLeaveDying(actor)) {", breaks: "C8-8" },
  { name: "asked even when a fatal injury holds them", file: DS, from: "  if (!noFatigue && mayLeaveDying(actor)) {", to: "  if (!noFatigue) {", breaks: "C8-9" },
  { name: "the API forgets the registration", file: APIW, from: "    registerDyingRecoveryModifier: (key, modify, moduleId) => registerDyingRecoveryModifier(key, modify, moduleId),\n", to: "", breaks: "C8-10" },
  { name: "the recovery check does not say its route", file: COMBAT, from: "applyDyingRecovery(actor, { route: \"recoveryCheck\", lines: waived })", to: "applyDyingRecovery(actor, { lines: waived })", breaks: "C8-11" },
  { name: "Resuscitation does not say its route", file: CCI, from: "applyDyingRecovery(target, { route: \"medicine\" })", to: "applyDyingRecovery(target)", breaks: "C8-11" },
  { name: "the relief does not say its route", file: SEF, from: "applyDyingRecovery(target, { route: \"relief\", lines })", to: "applyDyingRecovery(target, { lines })", breaks: "C8-11" },
  { name: "the card claims the fatigue it waived", file: COMBAT, from: "const fatigue = state.fatigueWaived ? \"No Fatigued for leaving it.\" : `Fatigued rises to ${state.fatigued}.`;", to: "const fatigue = `Fatigued rises to ${state.fatigued}.`;", breaks: "C8-12" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block5c-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block5c-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block5c-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block5c-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
