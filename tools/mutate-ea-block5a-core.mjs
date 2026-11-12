#!/usr/bin/env node
/** mutate-ea-block5a-core — the mutation half of verify-ea-block5a-core. NEW at 3.683.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const PQ = m("prerequisites.mjs"), PF = m("picker-filters.mjs"), RW = m("reactions", "reactions-workflow.mjs"), CHK = m("dice", "check.mjs"),
  ATK = m("combat", "attack-workflow.mjs"), OA = m("combat", "one-attack.mjs"), DOF = m("combat", "defence-offer.mjs"), HM = m("magic", "high-magic.mjs"),
  BS = m("magic", "beneficial-save.mjs"), CW = m("magic", "cast-workflow.mjs"), SEF = m("magic", "spell-effects.mjs"), SG = m("combat", "sanctuary-gate.mjs"),
  API = m("module-api.mjs");
const MUTATIONS = [
  // P — C1
  { name: "a heritage clause with alternatives is read as one name (review)", file: PQ, from: "        const keys = (parsed.names ?? [parsed.name]).map(heritageNameKey);", to: "        const keys = [parsed.name].map(heritageNameKey);", breaks: "P4c" },
  { name: "alternatives must all be owned (review)", file: PQ, from: "        if (!keys.some((key) => actorStats.heritageNames?.has?.(key))) return false;", to: "        if (!keys.every((key) => actorStats.heritageNames?.has?.(key))) return false;", breaks: "P4c" },
  { name: "\"Level N only\" is not parsed", file: PQ, from: "  m = text.match(/^Level\\s+(\\d+)\\s+only$/i);\n  if (m) return { type: \"levelMax\", max: Number(m[1]) };\n", to: "", breaks: "P1/P3" },
  { name: "the ceiling is read as a minimum", file: PQ, from: "        if (Number(actorStats.level ?? 0) > parsed.max) return false;", to: "        if (Number(actorStats.level ?? 0) < parsed.max) return false;", breaks: "P3" },
  { name: "the heritage clause is case-sensitive", file: PQ, from: "  m = text.match(/^(.+?)\\s+heritage$/i);", to: "  m = text.match(/^(.+?)\\s+heritage$/);", breaks: "P2/P4" },
  { name: "a name that is no heritage is gated anyway", file: PQ, from: "        if (!keys.every((key) => actorStats.knownHeritages?.has?.(key))) break;\n", to: "", breaks: "P5/P6" },
  { name: "a known heritage never blocks", file: PQ, from: "        if (!keys.some((key) => actorStats.heritageNames?.has?.(key))) return false;\n", to: "", breaks: "P4" },
  { name: "the key keeps \"heritage\"", file: PQ, from: "  prerequisiteNameKey(value).replace(/\\s+heritage$/, \"\");", to: "  prerequisiteNameKey(value);", breaks: "P7" },
  { name: "a heritage-shaped segment stops a join", file: PQ, from: "      if (parsed && parsed.type !== \"heritage\") { limit = scan; break; }", to: "      if (parsed) { limit = scan; break; }", breaks: "P8" },
  { name: "the header still says heritage names are unparsed", file: PQ, from: " * A HERITAGE AND A LEVEL CEILING (3.683.0;", to: " * A HERITAGE AND A LEVEL CEILING (;", breaks: "P12" },
  { name: "the picker supplies no known heritages", file: PF, from: "    knownHeritages: knownHeritageNames(),", to: "    knownHeritages: null,", breaks: "P11" },
  { name: "the picker reads the actor's race, not its heritage", file: PF, from: "      .filter((item) => item?.type === \"heritage\")", to: "      .filter((item) => item?.type === \"race\")", breaks: "P11" },
  { name: "a module's heritages are not known", file: PF, from: "  for (const pack of contentPacksFor(\"heritages\", packs)) {", to: "  for (const pack of contentPacksFor(\"heritages\", packs).slice(0, 1)) {", breaks: "P10/P11" },
  // R — C2
  { name: "a modifier answered is not pushed onto the check", file: RW, from: "        check.modifiers.push(row);\n        check.reactionModifiers.push(row);", to: "        check.reactionModifiers.push(row);", breaks: "R3" },
  { name: "a modifier answered is not recorded", file: RW, from: "        check.modifiers.push(row);\n        check.reactionModifiers.push(row);", to: "        check.modifiers.push(row);", breaks: "R5" },
  { name: "a reroll drops the carried bonuses", file: RW, from: "    for (const row of reactionModifiersOf({ modifiers: check.reactionModifiers ?? [] })) check.modifiers.push(row);\n", to: "", breaks: "R7" },
  { name: "a zero modifier is kept", file: RW, from: "    if (!Number.isFinite(value) || value === 0) continue;", to: "    if (!Number.isFinite(value)) continue;", breaks: "R1" },
  { name: "the bonus type is lost", file: RW, from: "      type: String(row?.type ?? \"\").trim().toLowerCase() || \"untyped\"", to: "      type: \"untyped\"", breaks: "R1/R3" },
  { name: "ctx is not told an area", file: RW, from: "    isArea: Boolean(check.isArea), saveSource:", to: "    isArea: false, saveSource:", breaks: "R6" },
  { name: "ctx is not told the source or the attack's mode", file: RW, from: "    sourceUuid: String(check.sourceUuid ?? \"\"), attackMode: String(check.attackMode ?? \"\")", to: "    sourceUuid: \"\", attackMode: \"\"", breaks: "R4/R8" },
  { name: "any declare value declares", file: RW, from: "=== \"success\" ? \"success\" : \"\";", to: "? \"success\" : \"\";", breaks: "R2" },
  { name: "a declaration sets no degree", file: RW, from: "        check.declaredDegree = declared;\n", to: "", breaks: "R9" },
  { name: "a declaration is not locked", file: RW, from: "        lockCheck(check, String(out.label ?? \"\").trim() || spec.key);\n", to: "", breaks: "R10/R10b" },
  { name: "later reactions are asked after a declaration", file: RW, from: "        lockCheck(check, String(out.label ?? \"\").trim() || spec.key);\n        break;", to: "        lockCheck(check, String(out.label ?? \"\").trim() || spec.key);", breaks: "R9" },
  { name: "a check drops the carried bonuses", file: CHK, from: "    this.reactionModifiers = Array.isArray(config.reactionModifiers) ? config.reactionModifiers.map((m) => ({ ...m })) : [];", to: "    this.reactionModifiers = [];", breaks: "R13" },
  { name: "Alter the Thread's reroll drops them", file: ATK, from: "reactionAdvantages: check.reactionAdvantages ?? [], reactionModifiers: check.reactionModifiers ?? [] });\n      await postRerollCard", to: "reactionAdvantages: check.reactionAdvantages ?? [] });\n      await postRerollCard", breaks: "R14" },
  { name: "the contract does not say a reaction may declare", file: API, from: "racial) and `declare: \"success\"` (the check", to: "racial) and (the check", breaks: "R15" },
  // D — C3
  { name: "a spell-only effect is any attack's", file: OA, from: "    : declared === \"spell\" ? \"spell\"\n", to: "", breaks: "D1/D2" },
  { name: "a spell-only effect is spent by any attack", file: OA, from: "  if (spec.against === \"spell\") return kind === \"spell\";", to: "  if (spec.against === \"spell\") return ATTACK_KINDS.includes(kind);", breaks: "D2" },
  { name: "registerDefenceOffer drops \"spell\"", file: DOF, from: "  const against = declared === \"weapon\" || declared === \"spell\" ? declared : \"attack\";", to: "  const against = declared === \"weapon\" ? declared : \"attack\";", breaks: "D4" },
  { name: "a spell-only offer is asked before a Strike", file: DOF, from: "against === \"weapon\" || against === \"spell\" ? { against } : true", to: "against === \"weapon\" ? { against } : true", breaks: "D5/D6" },
  // H — Q58/Q59
  { name: "THE RULING: a High Magic cast is only its own tradition", file: HM, from: "  if (!forbiddenSparesHighMagic(target)) return ALL_TRADITIONS;", to: "  if (!forbiddenSparesHighMagic(target)) return spellData?.tradition ?? \"\";", breaks: "H2/H4" },
  { name: "an ordinary cast is every tradition", file: HM, from: "  if (!cast?.highMagic) return spellData?.tradition ?? \"\";", to: "  if (!cast) return spellData?.tradition ?? \"\";", breaks: "H1" },
  { name: "Unbound is not spared the -2", file: HM, from: "  return traditionList(ALL_TRADITIONS).filter((t) => !forbidden.has(t)).join(\", \");", to: "  return ALL_TRADITIONS;", breaks: "H3/H5" },
  { name: "Unbound is told no tradition (its tick-box asks)", file: HM, from: "  return traditionList(ALL_TRADITIONS).filter((t) => !forbidden.has(t)).join(\", \");", to: "  return \"\";", breaks: "H3/H5" },
  { name: "a disabled effect spares", file: HM, from: ".some((effect) => effect && !effect.disabled && effect.flags", to: ".some((effect) => effect && effect.flags", breaks: "H6" },
  { name: "an item never spares", file: HM, from: "  if (liveItems(actor).some((item) => item.flags?.[SYSTEM_ID]?.forbiddenSparesHighMagic === true)) return true;", to: "  if (false) return true;", breaks: "H6" },
  { name: "THE RULING: a High Magic heal reaches an Ascendan unchallenged", file: BS, from: "  if (highMagic) {\n    if (!forbidden.length", to: "  if (false) {\n    if (!forbidden.length", breaks: "H8" },
  { name: "Unbound still rolls for a High Magic heal", file: BS, from: "    if (!forbidden.length || forbiddenSparesHighMagic(target)) return", to: "    if (!forbidden.length) return", breaks: "H9" },
  { name: "every creature rolls for a High Magic heal", file: BS, from: "    if (!forbidden.length || forbiddenSparesHighMagic(target)) return", to: "    if (forbiddenSparesHighMagic(target)) return", breaks: "H9" },
  { name: "the caller's word is ignored", file: BS, from: "typeof highMagic === \"boolean\" ? highMagic : highMagicCast(caster, spellData).highMagic", to: "highMagicCast(caster, spellData).highMagic", breaks: "H8/H14" },
  { name: "High Magic is not read off the caster", file: BS, from: "typeof highMagic === \"boolean\" ? highMagic : highMagicCast(caster, spellData).highMagic", to: "typeof highMagic === \"boolean\" ? highMagic : false", breaks: "H10/H14" },
  { name: "the tradition clause is not told", file: BS, from: "  const byTradition = traditionSaveRequired(target, spellData, castIsHighMagic);", to: "  const byTradition = traditionSaveRequired(target, spellData);", breaks: "H8/H14" },
  { name: "THE GAP: the spell save reads only the spell's tradition", file: CW, from: "      traditions: spellSaveTraditions(target, spell.system ?? {}, saveHighMagic),", to: "      traditions: spell.system?.tradition ?? \"\",", breaks: "H11" },
  { name: "the follow-up save reads only the spell's tradition", file: SEF, from: "            traditions: spellSaveTraditions(target, spell.system ?? {}, highMagicCast(caster, spell.system ?? {})),", to: "            traditions: spell.system?.tradition ?? \"\",", breaks: "H12" },
  { name: "Visage Of Horror does not record High Magic", file: SEF, from: "? { horrorHighMagic: true } : {}", to: "? {} : {}", breaks: "H13" },
  { name: "Sanctuary's opponent ignores it", file: SG, from: "{ highMagic: ward.getFlag(SYSTEM_ID, \"sanctuaryHighMagic\") === true }", to: "{ highMagic: false }", breaks: "H13" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block5a-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block5a-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block5a-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block5a-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
