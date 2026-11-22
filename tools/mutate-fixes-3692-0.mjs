#!/usr/bin/env node
/** mutate-fixes-3692-0 — the mutation half of verify-fixes-3692-0 (3.692.0: innate spells not stored, a ritual's check skill, and Block 7's five seams). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const p = (...x) => path.join(SYSTEM_ROOT, ...x);
const CW = p("module", "magic", "cast-workflow.mjs");
const TH = p("module", "magic", "thorns.mjs");
const TW = p("module", "magic", "thorns-workflow.mjs");
const OQ = p("module", "owner-query-workflow.mjs");
const LI = p("module", "light.mjs");
const LW = p("module", "light-workflow.mjs");
const SM = p("module", "magic", "spell-maneuver.mjs");
const BW = p("module", "combat", "basic-action-at-total-workflow.mjs");
const API = p("module", "module-api-workflow.mjs");
const AW = p("module", "combat", "attack-workflow.mjs");
const GS = p("module", "combat", "granted-speeds.mjs");
const SP = p("module", "combat", "speed-pool.mjs");
const AC = p("module", "documents", "actor.mjs");
const SE = p("module", "magic", "spell-effects.mjs");
const EK = p("module", "magic", "effect-kinds.mjs");
const SW = p("module", "magic", "sustain-workflow.mjs");
const FW = p("module", "feats-workflow.mjs");
const TR = p("module", "combat", "target-relay.mjs");
const TRW = p("module", "combat", "target-relay-workflow.mjs");
const SJ = p("system.json");
const PJ = p("package.json");
const MUTATIONS = [
  { name: "A an innate spell is stored", file: CW, from: "const storesThisCast = castsOwnSpell && !spell?.system?.innate;", to: "const storesThisCast = castsOwnSpell;" },
  { name: "B the ritual's check skill is not passed", file: CW, from: "    checkSkill: String(ritualPlan.skill?.key ?? \"\")", to: "    checkSkill: \"\"" },
  { name: "C the offered types are not kept", file: TH, from: "  if (typeChoices.length) out.typeChoices = typeChoices;\n", to: "" },
  { name: "C the offered types are not lower-cased", file: TH, from: "    const key = text(t).toLowerCase();\n    if (key && !out.includes(key)) out.push(key);", to: "    const key = text(t);\n    if (key && !out.includes(key)) out.push(key);" },
  { name: "C any pick is dealt, offered or not", file: TH, from: "return key && (spec?.typeChoices ?? []).includes(key) ? key : String(spec?.damageType ?? \"\");", to: "return key || String(spec?.damageType ?? \"\");" },
  { name: "C the defender is never asked", file: TW, from: "    if ((spec.typeChoices ?? []).length && Number(roll.total) > 0) {", to: "    if (false) {" },
  { name: "C the printed type is resolved anyway", file: TW, from: "      amount: roll.total,\n      type: damageType,", to: "      amount: roll.total,\n      type: spec.damageType," },
  { name: "C the damage reaction reads the printed type", file: TW, from: "spellDamageReactionsFor(attacker, damageType, {", to: "spellDamageReactionsFor(attacker, spec.damageType, {" },
  { name: "C the choice query is not registered", file: OQ, from: "  CONFIG.queries[OWNER_CHOICE_QUERY] = async (data) => chooseHere(data, { windowMs: ANSWER_WINDOW_MS });\n", to: "" },
  { name: "C a late choice still counts", file: OQ, from: "  if (windowMs > 0 && !answeredInTime(askedAt, Date.now(), windowMs)) {\n    ui.notifications?.warn?.(`${title}: answered too late — the moment has passed.`);\n    return \"\";\n  }\n  return picked;", to: "  return picked;" },
  { name: "C the choice asks the GM before the player", file: OQ, from: "  if (!id) return chooseHere(question);", to: "  if (true) return chooseHere(question);" },
  { name: "D the dimmest Region counts", file: LI, from: "if (!best || level > best.level) best =", to: "if (!best || level < best.level) best =" },
  { name: "D emitted light can darken", file: LI, from: "  return Math.max(base, Number(emitted.level) || 0);", to: "  return Number(emitted.level) || base;" },
  { name: "D a level past 10 is accepted", file: LI, from: "if (!Number.isFinite(level) || level < 1 || level > 10) continue;", to: "if (!Number.isFinite(level) || level < 1) continue;" },
  { name: "D the workflow ignores emitted light", file: LW, from: "  const withSources = emitted && emittedLevel !== Number(sourced?.level ?? DEFAULT_LIGHT_LEVEL)", to: "  const withSources = false && emitted && emittedLevel !== Number(sourced?.level ?? DEFAULT_LIGHT_LEVEL)" },
  { name: "E the difficulty is ignored", file: SM, from: "  const finalDC = own + Number(DIFFICULTY_BY_KEY[difficulty]?.modifier ?? 0);", to: "  const finalDC = own;" },
  { name: "E the size penalty is ignored", file: SM, from: "  const finalTotal = base + sizeModifier;", to: "  const finalTotal = base;" },
  { name: "E a missing DC resolves at 0", file: SM, from: "if (!actionKey || !Number.isFinite(base) || dc === null || dc === undefined || !Number.isFinite(own)) {", to: "if (!actionKey || !Number.isFinite(base)) {" },
  { name: "E the workflow lands no conditions", file: BW, from: "  await applyBasicActionConditionEffects(applied, actor, target, { expiresRound, actionKey: data.key });\n", to: "" },
  { name: "E the workflow reads only basic actions", file: BW, from: "  return SKILL_ACTIONS.find((a) => a.key === actionKey) ?? null;", to: "  return null;" },
  { name: "E the helper is not exposed", file: API, from: "      resolveBasicActionAtTotal: async (actor, target, actionKey, opts = {}) =>\n", to: "      resolveBasicActionAtTotalX: async (actor, target, actionKey, opts = {}) =>\n" },
  { name: "E the Strike hook carries no total", file: AW, from: "      total: Number(check?.outcome?.total ?? check?.total ?? NaN)\n", to: "      total: NaN\n" },
  { name: "F a false flag halves", file: GS, from: "derives?.[HALVED_SPEED_PATH] === true) return true;", to: "derives?.[HALVED_SPEED_PATH] !== undefined) return true;" },
  { name: "F the halving rounds to the nearest", file: SP, from: "pool.total = roundToGrid ? Math.floor(total / 2 / 5) * 5 : Math.floor(total / 2);", to: "pool.total = roundToGrid ? Math.round(total / 2 / 5) * 5 : Math.floor(total / 2);" },
  { name: "F only land is halved", file: SP, from: "      const pool = movement[key];\n      if (!isSpeedPool(pool)) continue;", to: "      const pool = movement[key];\n      if (!isSpeedPool(pool) || key !== \"land\") continue;" },
  { name: "F the derivation is not told", file: AC, from: "      setSpeeds: replaced,\n      halved,\n", to: "      setSpeeds: replaced,\n" },
  { name: "F the row ignores its own duration", file: SE, from: "const halveDuration = ownDuration ? parseSpellDuration(ownDuration) : parsedDuration;", to: "const halveDuration = parsedDuration;" },
  { name: "F the row's effect halves nothing", file: SE, from: "          hvData.flags[SYSTEM_ID][HALVED_SPEED_PATH] = true;\n", to: "" },
  { name: "F an effect's flag is not read", file: GS, from: "if (f?.[HALVED_SPEED_PATH] === true || f?.creatureAbility", to: "if (f?.creatureAbility" },
  { name: "F a disabled effect halves", file: GS, from: "    if (doc?.disabled) continue;\n    const f = doc?.flags?.[\"trg-prime\"];", to: "    const f = doc?.flags?.[\"trg-prime\"];" },
  { name: "F the derivation reads only items", file: AC, from: "speedsHalved([...Array.from(actor.items ?? []), ...Array.from(actor.appliedEffects ?? [])]);", to: "speedsHalved([...Array.from(actor.items ?? [])]);" },
  { name: "F Effortless Spell's Sustain is silent", file: FW, from: "      if (entry) Hooks.callAll(\"trgPrimeSpellSustained\",", to: "      if (false) Hooks.callAll(\"trgPrimeSpellSustained\"," },
  { name: "D Abyssal Darkness is lit", file: LI, from: "  if (!emitted || base <= EMITTED_NEGATED_AT_OR_BELOW) return base;", to: "  if (!emitted) return base;" },
  { name: "D Supernatural Darkness stops it", file: LI, from: "const EMITTED_NEGATED_AT_OR_BELOW = 1;", to: "const EMITTED_NEGATED_AT_OR_BELOW = 2;" },
  { name: "C a blow that deals nothing still asks", file: TW, from: "if ((spec.typeChoices ?? []).length && Number(roll.total) > 0) {", to: "if ((spec.typeChoices ?? []).length) {" },
  { name: "E the target's write is never relayed", file: BW, from: "  if (!direct) {\n    const { relayActionAtTotal }", to: "  if (false) {\n    const { relayActionAtTotal }" },
  { name: "E the grab's holder is not recorded", file: BW, from: "    await target.setFlag(SYSTEM_ID, \"grabbedBy\",", to: "    await target.setFlag(SYSTEM_ID, \"grabbedByX\"," },
  { name: "E the feinter is not recorded", file: BW, from: "    await target.setFlag(SYSTEM_ID, \"flatFootedFrom\",", to: "    await target.setFlag(SYSTEM_ID, \"flatFootedFromX\"," },
  { name: "E out of combat, no word", file: BW, from: "  if (!game.combat?.started && applied.some((e) => e.active) && (printedRounds", to: "  if (false && applied.some((e) => e.active) && (printedRounds" },
  { name: "E the relay runs for anybody", file: TR, from: "      if (deps.userOwns?.(actor, String(request?.userId ?? \"\")) !== true) return { ok: false, reason: \"the asker does not own the acting creature\" };\n      const total = Number(payload.total);", to: "      const total = Number(payload.total);" },
  { name: "E the relay runs with no total", file: TR, from: "      if (!Number.isFinite(total)) return { ok: false, reason: \"no total to resolve at\" };\n", to: "" },
  { name: "E the GM's client asks the relay again", file: TRW, from: "return resolveBasicActionAtTotal(actor, target, actionKey, { ...opts, direct: true });", to: "return resolveBasicActionAtTotal(actor, target, actionKey, { ...opts });" },
  { name: "F speedHalve is not handled", file: EK, from: "  \"speedHalve\",\n", to: "" },
  { name: "G the Sustain is not announced", file: SW, from: "    Hooks.callAll(\"trgPrimeSpellSustained\", {", to: "    Hooks.callAll(\"trgPrimeSpellSustainedX\", {" },
  { name: "G a Sustain that ran out is announced", file: SW, from: "  if (!ranOut) {\n    Hooks.callAll(\"trgPrimeSpellSustained\"", to: "  if (true) {\n    Hooks.callAll(\"trgPrimeSpellSustained\"" },
  { name: "Z the version is not raised", file: SJ, from: "\"version\": \"3.710.2\"", to: "\"version\": \"3.691.0\"" },
  { name: "Z the download names the last release", file: SJ, from: "releases/download/v3.710.2/trg-prime.zip", to: "releases/download/v3.691.0/trg-prime.zip" },
  { name: "Z package.json is left behind", file: PJ, from: "\"version\": \"3.710.2\"", to: "\"version\": \"3.691.0\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3692-0.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-fixes-3692-0: verify-fixes-3692-0 already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-fixes-3692-0: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3692-0: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
