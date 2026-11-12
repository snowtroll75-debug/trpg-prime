#!/usr/bin/env node
/** mutate-ea-block6c-core — the mutation half of verify-ea-block6c-core. NEW at 3.684.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const ZH = m("combat", "zero-hp-moment.mjs"), ZHW = m("combat", "zero-hp-moment-workflow.mjs"), DW = m("combat", "dying-workflow.mjs"),
  DG = m("combat", "death-guard.mjs"), DGW = m("combat", "death-guard-workflow.mjs"), CMB = m("documents", "combat.mjs"), API = m("module-api.mjs"),
  AP = m("archetype-progression.mjs"), PF = m("picker-filters.mjs"), ITEM = m("documents", "item.mjs"), PQ = m("prerequisites.mjs"),
  RG = m("combat", "rage.mjs"), RW = m("combat", "rage-workflow.mjs"), CW = m("magic", "cast-workflow.mjs"), AW = m("combat", "action-workflow.mjs"),
  AC = m("magic", "archetype-casting.mjs"), FW = m("feats-workflow.mjs"), SN = m("senses.mjs"), CR = m("conviction-refund.mjs"),
  CHK = m("dice", "check.mjs"), CARD = m("dice", "check-card-interactions.mjs"), XU = m("extra-uses.mjs");
const MUTATIONS = [
  { name: "THE CONTRACT (G7) unsaid: where the offer runs", file: m("module-api.mjs"), from: " * WHERE IT RUNS (3.684.0, G7 — review: the contract did not say). The offer\n * is awaited on THE CLIENT THAT APPLIES THE DAMAGE", to: " * The offer is awaited", breaks: "Z20" },
  // Z — G7, the 0 HP moment
  { name: "a subdual knock-out is not asked when it would be massive", file: ZH, from: "  if (subdual) return true;\n", to: "", breaks: "Z1" },
  { name: "THE RULING (Q109): an outright kill is asked too", file: ZH, from: "  return !massive && !noDeathState;", to: "  return !noDeathState;", breaks: "Z1/Z9" },
  { name: "0 HP counts as standing", file: ZH, from: "  return Number(hp) > 0;", to: "  return Number(hp) >= 0;", breaks: "Z2/Z11" },
  { name: "a waiver outlives its Dying", file: ZH, from: "  if (typeof spec !== \"object\" || String(spec.effect ?? \"\") !== String(dyingEffectId)) return null;", to: "  if (typeof spec !== \"object\") return null;", breaks: "Z4" },
  { name: "THE RULING (Q128): the offer is asked before the blow lands", file: ZHW, from: "  await actor.update({ \"system.resources.hp.value\": 0 });\n  const lines = [];", to: "  const lines = [];", breaks: "Z8/Z11" },
  { name: "every offer is asked, applies or not", file: ZHW, from: "      if (!spec.applies || await spec.applies(ctx)) live.push(spec);", to: "      live.push(spec);", breaks: "Z7" },
  { name: "a creature left standing falls anyway", file: ZHW, from: "      return { case: \"unconscious-offer\", offer: spec.key, newHP: hp };", to: "      return null;", breaks: "Z8/Z10" },
  { name: "the damage path ignores the offers", file: DW, from: "    if (standing) return standing;\n", to: "", breaks: "Z12" },
  { name: "a zero-HP guard cannot leave half", file: DG, from: "  else if (lower(raw.heal) === \"half\") out.heal = \"half\";", to: "", breaks: "Z13/Z14" },
  { name: "a zero-HP guard that held says nothing", file: DGW, from: "    Hooks.callAll(\"trgPrimeDeathGuardHeld\", { actor, label: spec.label, hp: healTo, trigger: \"zeroHp\" });\n", to: "", breaks: "Z14" },
  { name: "a would-die guard that held says nothing", file: DGW, from: "    Hooks.callAll(\"trgPrimeDeathGuardHeld\", { actor, label: spec.label, hp, trigger: \"death\" });\n", to: "", breaks: "Z14b" },
  { name: "a waived Dying Check's waiver is never spent", file: CMB, from: "      await actor.unsetFlag(SYSTEM_ID, DYING_CHECK_WAIVED_FLAG);\n", to: "", breaks: "Z15" },
  { name: "registerUnconsciousOffer takes a non-function applies", file: API, from: "(applies != null && typeof applies !== \"function\")", to: "false", breaks: "Z5" },
  // A — G8, archetype progression
  { name: "\"+N levels\" is not parsed", file: AP, from: "  const since = trimmed.match(/^\\+(\\d+)\\s+levels?$/i);\n  if (since) return { type: \"levelsSince\", min: Number(since[1]) };\n", to: "", breaks: "A1/A2" },
  { name: "THE RULING (Q90): the Archer's line gates without opting in", file: AP, from: "      if (!context.sinceTaken) return true;\n", to: "", breaks: "A3" },
  { name: "an unstamped archetype blocks", file: AP, from: "      if (context.takenAt === null || context.takenAt === undefined || !Number.isFinite(Number(context.takenAt))) return true;\n", to: "", breaks: "A3" },
  { name: "\"+10 levels\" read as character level 10", file: AP, from: "      return Number(actorStats.level ?? 0) - Number(context.takenAt) >= parsed.min;", to: "      return Number(actorStats.level ?? 0) >= parsed.min;", breaks: "A2" },
  { name: "THE RULING (Q91): \"cannot progress\" passes", file: AP, from: "    case \"never\":\n      return false;", to: "    case \"never\":\n      return true;", breaks: "A4/A8" },
  { name: "\"Tradition skill +N ranks\" is not parsed", file: AP, from: "  if (tradition) return { type: \"skillAny\", keys: [...TRADITION_SKILL_KEYS], min: Number(tradition[1]) };", to: "  if (tradition) return null;", breaks: "A1/A4" },
  // RE-ANCHORED AT 3.684.0 (review): the stamp also names its owner.
  { name: "a stamped feat on its own actor is restamped", file: AP, from: "  if (stamped && (!owner || stampedBy === owner)) return null;\n", to: "", breaks: "A5/A5b" },
  { name: "REVIEW FIX REVERTED (G8): a copy from another actor keeps its stamp", file: AP, from: "  if (stamped && (!owner || stampedBy === owner)) return null;", to: "  if (stamped) return null;", breaks: "A5b" },
  { name: "the owner is not stamped", file: AP, from: "    ...(owner ? { [`flags.trg-prime.${ARCHETYPE_TAKEN_BY_FLAG}`]: owner } : {})\n", to: "", breaks: "A5b" },
  { name: "the item passes no owner", file: ITEM, from: "actor.system?.identity?.level, actor.id ? String(actor.uuid ?? \"\") : \"\");", to: "actor.system?.identity?.level);", breaks: "A6" },
  { name: "every archetype is stamped", file: AP, from: "  if (flags[PROGRESSION_SINCE_TAKEN_FLAG] !== true) return null;\n", to: "", breaks: "A5" },
  { name: "the picker's context lacks the stamp", file: PF, from: "  const since = ctx.sinceTaken ? ctx : {};", to: "  const since = {};", breaks: "A7/A9" },
  { name: "the picker does not say \"cannot progress\"", file: PF, from: "  if (parsed?.type === \"never\") {", to: "  if (false) {", breaks: "A8" },
  { name: "nothing stamps the arriving archetype", file: ITEM, from: "    this._stampArchetypeTakenAt();\n", to: "", breaks: "A6" },
  // Q — G9, prerequisites
  { name: "\"A & B\" read as either", file: PQ, from: "  return { type: hasAnd ? \"skillAll\" : \"skillAny\", keys, min: Number(m[2]) };\n}\n\n/**\n * Normalised", to: "  return { type: \"skillAny\", keys, min: Number(m[2]) };\n}\n\n/**\n * Normalised", breaks: "Q1/Q3" },
  { name: "a non-skill name is accepted", file: PQ, from: "  if (keys.some((k) => !k)) return null;\n", to: "", breaks: "Q1" },
  // RE-POINTED AT 3.684.1 (Graham, 4 November 2026: every feat, not an
  // opt-in): the 3.684.0 mutation forced the gate on; the fault now is its
  // opt-in coming back, or `false` no longer opting out.
  { name: "THE RULING (3.684.1) undone: the opt-in is back", file: PQ, from: "  const compoundSkills = actorStats.compoundSkills !== false;", to: "  const compoundSkills = actorStats.compoundSkills === true;", breaks: "Q12/Q13/Q16" },
  { name: "`compoundSkills: false` no longer opts out", file: PQ, from: "  const compoundSkills = actorStats.compoundSkills !== false;", to: "  const compoundSkills = true;", breaks: "Q4" },
  { name: "the book's skill lists are not rejoined", file: PQ, from: "  const clauses = compoundSkills ? foldCompoundSkillLists(split) : split;", to: "  const clauses = split;", breaks: "Q13/Q14/Q16" },
  { name: "Mastermind's \"Either\" is not read", file: PQ, from: ".trim().replace(/^either\\s+/i, \"\").replace(/\\s*&\\s*/g, \" and \")", to: ".trim().replace(/\\s*&\\s*/g, \" and \")", breaks: "Q13/Q14" },
  { name: "an Oxford comma is not read", file: PQ, from: "\n    .replace(/\\s*,\\s*(or|and)\\s+/gi, \" $1 \");", to: ";", breaks: "Q13" },
  { name: "the fold takes a run that does not parse", file: PQ, from: "        if (parseCompoundSkillClause(joined)) { out.splice(", to: "        if (true) { out.splice(", breaks: "Q14" },
  { name: "the fold takes a segment that is no skill", file: PQ, from: "      while (start > 0 && bareSkill(out[start - 1])) {", to: "      while (start > 0) {", breaks: "Q14" },
  { name: "any-of read as all-of", file: PQ, from: "if (compound.type === \"skillAll\" ? !compound.keys.every(has) : !compound.keys.some(has)) return false;", to: "if (!compound.keys.every(has)) return false;", breaks: "Q3" },
  // RE-POINTED AT 3.684.1: the picker no longer reads the flag; the fault is it opting out.
  { name: "the picker opts every feat out", file: PF, from: "    meetsParseablePrerequisites(entry.system?.prerequisites, stats);", to: "    meetsParseablePrerequisites(entry.system?.prerequisites, { ...stats, compoundSkills: false });", breaks: "Q5/Q16" },
  { name: "the class slot does not request the opt-in", file: PF, from: "\"system.sourceClass\", \"system.prerequisites\", \"system.traits\", \"system.repeatable\", \"system.repeatLimit\", \"flags.trg-prime.compoundSkillPrerequisites\"]", to: "\"system.sourceClass\", \"system.prerequisites\", \"system.traits\", \"system.repeatable\", \"system.repeatLimit\"]", breaks: "Q5b" },
  { name: "the picker ignores an eligibility check", file: PF, from: "    if (featEligibilityBlock(entry?.name, actor)) return false;\n", to: "", breaks: "Q10" },
  { name: "a check that throws breaks the asking", file: API, from: "      console.warn(`TRG Prime | a module's eligibility check for ${featName} failed`, err);", to: "      throw err;", breaks: "Q8" },
  { name: "a deliberate script is refused too", file: API, from: "  if (options?.trgAllowIneligibleFeat) return null;\n", to: "", breaks: "Q9" },
  { name: "an ineligible feat is created anyway", file: ITEM, from: "    if (this._refusedAsIneligibleFeat(options)) return false;\n", to: "", breaks: "Q11/A6" },
  // W — G10, casting while raging
  { name: "a disabled effect lets you cast while raging", file: RG, from: "    if (!c || c.disabled) continue;", to: "    if (!c) continue;", breaks: "W1" },
  { name: "THE RULING (Q104): every Concentrate action passes", file: RG, from: "  if (!RAGE_CASTING_ACTIONS.includes(String(action?.key ?? \"\"))) return false;\n", to: "", breaks: "W2" },
  { name: "the Defence bar is lifted too", file: RG, from: "  return /concentrate/i.test(String(blocked.reason ?? \"\"));", to: "  return true;", breaks: "W2" },
  { name: "the flag is ignored", file: RW, from: "  return isRaging(actor) && !castsWhileRaging(actor);", to: "  return isRaging(actor);", breaks: "W3" },
  { name: "the cast's own refusal still refuses a Birthrager", file: CW, from: "  if (rageBarsCasting(actor) && !drunkPotion) {", to: "  if (isRaging(actor) && !drunkPotion) {", breaks: "W4" },
  { name: "the action workflow bars Sustain a Spell", file: AW, from: " && !castingAction) {", to: ") {", breaks: "W5" },
  // B — G11
  { name: "half the level always rounds down", file: AC, from: "  const half = round === \"up\" ? Math.ceil(lv / 2) : Math.floor(lv / 2);", to: "  const half = Math.floor(lv / 2);", breaks: "B1/B3" },
  { name: "the grant forgets its rounding", file: API, from: "const halfLevel = String(spec?.halfLevel ?? \"down\").trim().toLowerCase() === \"up\" ? \"up\" : \"down\";", to: "const halfLevel = \"down\";", breaks: "B2b/B3" },
  { name: "the row ignores the grant's rounding", file: FW, from: "          alreadyGranted: actor.getFlag?.(SYSTEM_ID, flag),\n          round: grant.halfLevel\n", to: "          alreadyGranted: actor.getFlag?.(SYSTEM_ID, flag)\n", breaks: "B3" },
  { name: "the BSB floor is written to the PP pool", file: FW, from: "        path: \"system.magic.bsb\",\n        statLabel: \"BSB\",\n        types: grant.types,", to: "        path: \"system.resources.pp.base\",\n        statLabel: \"BSB\",\n        types: grant.types,", breaks: "B3" },
  // S — G13
  { name: "the declared bonus is ignored", file: SN, from: "      const bonusFeet = base === null ? 0 : (bonuses.get(plainName.toLowerCase()) ?? 0);", to: "      const bonusFeet = 0;", breaks: "S1" },
  { name: "the bonus is added after the doubling", file: SN, from: "      const rangeFeet = enhanced ? raised * 2 : raised;", to: "      const rangeFeet = enhanced ? base * 2 + bonusFeet : raised;", breaks: "S2" },
  { name: "copies of one item stack", file: SN, from: "      if (seen.has(key)) continue;\n", to: "", breaks: "S4" },
  { name: "an unequipped item counts", file: SN, from: "    if (!item || item.system?.equipped === false) continue;", to: "    if (!item) continue;", breaks: "S4" },
  // C — G18
  { name: "a save is never refunded", file: CR, from: "const REFUND_CHECK_TYPES = Object.freeze([\"skill\", \"save\"]);", to: "const REFUND_CHECK_TYPES = Object.freeze([\"skill\"]);", breaks: "C2" },
  { name: "B5-3's row answers saves too", file: CR, from: "    checkTypes: checkTypes.length ? checkTypes : [\"skill\"],", to: "    checkTypes: checkTypes.length ? checkTypes : [\"skill\", \"save\"],", breaks: "C1" },
  { name: "once a day is not kept", file: CR, from: "  if (row.daily && usedToday?.[convictionRefundDailyKey(row.label)]) return false;", to: "  if (false) return false;", breaks: "C2/C3" },
  { name: "the day is used only by a refund", file: CR, from: "    if (!row?.daily || !rowAnswers(row, { checkType, subject, usedToday })) continue;", to: "    if (!row?.daily || !rowAnswers(row, { checkType, subject, usedToday }) || !row.degrees.includes(String(degree).trim().toLowerCase())) continue;", breaks: "C3" },
  { name: "the roll does not mark the day", file: CHK, from: "      if (dailyUsed.length) {\n        await check.actor.setFlag(SYSTEM_ID, \"declaredUsedToday\",", to: "      if (false) {\n        await check.actor.setFlag(SYSTEM_ID, \"declaredUsedToday\",", breaks: "C4" },
  { name: "the card does not mark the day", file: CARD, from: "    if (dailyUsed.length) {\n      await owner.setFlag(", to: "    if (false) {\n      await owner.setFlag(", breaks: "C4" }, // re-anchored at 3.684.0
  { name: "REVIEW FIX REVERTED (G18): the re-ask counts the card's own use against it", file: CR, from: "  for (const key of Array.isArray(takenByCard) ? takenByCard : []) delete out[key];", to: "", breaks: "C5" },
  { name: "the roll does not remember its use on the card", file: CHK, from: "              convictionRefundDaily: Array.isArray(this.convictionRefundDaily) ? [...this.convictionRefundDaily] : [],\n", to: "", breaks: "C5b" },
  { name: "the card's re-ask ignores what its roll took", file: CARD, from: "usedToday: usedTodayForCard(usedToday, takenHere) };", to: "usedToday };", breaks: "C5b" },
  // E — G21
  { name: "a module's extra uses are not read", file: XU, from: "  for (const [key, entry] of registeredExtraUses()) {", to: "  for (const [key, entry] of []) {", breaks: "E2" },
  { name: "a module's row replaces the core's", file: XU, from: "    if (Object.prototype.hasOwnProperty.call(EXTRA_USES_FEATS, key)) continue;\n", to: "", breaks: "E3" },
  { name: "perCopy has no default of 1", file: API, from: "  const perCopy = Math.trunc(Number(spec?.perCopy ?? 1));", to: "  const perCopy = Math.trunc(Number(spec?.perCopy));", breaks: "E1/E2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block6c-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block6c-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block6c-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block6c-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
