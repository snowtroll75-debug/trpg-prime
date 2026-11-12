#!/usr/bin/env node
/** mutate-ea-block3a-core — the mutation half of verify-ea-block3a-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CM = m("magic", "class-magic.mjs"), HM = m("magic", "high-magic.mjs"), CP = m("class-progression.mjs"), CD = m("class-derive.mjs"),
  SB = m("magic", "spellbook.mjs"), SBW = m("magic", "spellbook-workflow.mjs"), RW = m("magic", "repertoire-workflow.mjs"),
  LSW = m("magic", "learn-spell-workflow.mjs"), MW = m("magic", "memorisation-workflow.mjs"), CAP = m("magic", "cast-cap.mjs"),
  CAST = m("magic", "cast-workflow.mjs"), FAM = m("familiar.mjs"), FM = m("familiar-modifiers.mjs"), ACT = m("documents", "actor.mjs"),
  FW = m("feats-workflow.mjs"), API = m("module-api.mjs"), APW = m("module-api-workflow.mjs"), AB = m("combat", "attack-base.mjs"),
  ATK = m("combat", "attack-workflow.mjs"), HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs"), SJ = path.join(SYSTEM_ROOT, "system.json");

const MUTATIONS = [
  // C — the declarations
  { name: "true is not \"any\"", file: CM, from: "  if (value === true || str(value) === \"any\") return \"any\";\n  const raw", to: "  if (str(value) === \"any\") return \"any\";\n  const raw", breaks: "C" },
  { name: "the book's \"divine\" is not divinity", file: CM, from: "const SYNONYMS = Object.freeze({ divine: \"divinity\" });", to: "const SYNONYMS = Object.freeze({});", breaks: "C" },
  { name: "an empty list closes every pick", file: CM, from: "  return list.length ? list : null;\n}\n\n/** A spell's printed", to: "  return list;\n}\n\n/** A spell's printed", breaks: "C" },
  { name: "THE OLD DEFECT: only a spell's first tradition counts", file: CM, from: "  return printed.some((t) => rule.includes(t));\n}\n\n/** A rule as words", to: "  return rule.includes(printed[0]);\n}\n\n/** A rule as words", breaks: "C" },
  { name: "a universal spell is refused by a list", file: CM, from: "  if (!printed.length) return true;\n  return printed.some", to: "  if (!printed.length) return false;\n  return printed.some", breaks: "C" },
  { name: "a switched-off subclass still answers", file: CM, from: "    !(item.type === \"ability\" && item.system?.active === false) &&\n    item.flags?.[SYSTEM_ID]?.classMagic", to: "    item.flags?.[SYSTEM_ID]?.classMagic", breaks: "C" },
  { name: "an unknown ability is taken", file: CM, from: "    if (MAGICAL_ABILITIES.includes(ability) && !out.ability) out.ability = ability;", to: "    if (ability && !out.ability) out.ability = ability;", breaks: "C" },
  { name: "the Wild's \"\" (no home) is not an answer", file: CM, from: "    if (out.tradition === null && Object.prototype.hasOwnProperty.call(sub, \"tradition\")) {", to: "    if (out.tradition === null && sub.tradition) {", breaks: "C" },
  { name: "a waiting track offers everything", file: CM, from: "    if (track.traditions === \"track\") track.traditions = trackAnswers[track.key] ?? null;", to: "    if (track.traditions === \"track\") track.traditions = trackAnswers[track.key] ?? \"any\";", breaks: "C" },
  { name: "the birthright's ability is not applied", file: CM, from: "  if (magic.ability) progression.magicalAbility = magic.ability;", to: "", breaks: "C" },
  { name: "the birthright's home tradition is not applied", file: CM, from: "  if (magic.tradition !== null && magic.tradition !== undefined) progression.tradition = magic.tradition;", to: "", breaks: "C" },
  { name: "THE GAP: the declarations never reach the progression", file: CD, from: "  if (system.progression) applyClassMagic(system.progression, classMagicOf(classItem, actor?.items ?? []));", to: "", breaks: "C" },
  { name: "a creature's widening is lost beside a class's", file: CM, from: "  const joined = [...new Set([...(a ?? []), ...(b ?? [])])];", to: "  const joined = [...new Set([...(a ?? [])])];", breaks: "C" },
  { name: "the own tradition drops out of a widened rule", file: CM, from: "  const list = [...new Set([...(Array.isArray(widened) ? widened : []), ...(own ? [own] : [])])];", to: "  const list = [...new Set([...(Array.isArray(widened) ? widened : [])])];", breaks: "C" },
  { name: "a track grants at its first level twice", file: CM, from: "  const steps = value < track.pickFrom ? 0 : 1 + Math.floor((value - track.pickFrom) / track.pickStep);", to: "  const steps = value < track.pickFrom ? 0 : 2 + Math.floor((value - track.pickFrom) / track.pickStep);", breaks: "C" },
  { name: "the cantrip slots fill in printed order", file: CM, from: "    .sort((a, b) => restrictiveness(a.slot) - restrictiveness(b.slot));", to: "", breaks: "C" },
  // HM
  { name: "THE GAP: a Witch's list is never read", file: HM, from: "  if (declaresHighMagicFor(actor, spellData)) return { highMagic: true, source: \"caster\", label: \"High Magic caster\" };\n", to: "", breaks: "HM" },
  { name: "a hex does not take the caster's tradition", file: CM, from: "  const own = printed.length ? printed : printedTraditions(casterTradition);", to: "  const own = printed;", breaks: "HM" },
  { name: "a list makes every spell High Magic", file: CM, from: "  if (!Array.isArray(rule)) return false;\n  const printed = printedTraditions(spellTradition);\n  const own", to: "  if (!Array.isArray(rule)) return false;\n  return true;\n  const printed = printedTraditions(spellTradition);\n  const own", breaks: "HM" },
  { name: "the forbidden-tradition gate refuses High Magic", file: CAST, from: "  if (!highMagicCast(actor, spellData).highMagic && !traditionGate(actor, spellData, spell.name)) return null;", to: "  if (!traditionGate(actor, spellData, spell.name)) return null;", breaks: "HM" },
  // PP bonus
  { name: "a High Magic class with no tradition adds no ability to PP", file: CP, from: "  if (!String(tradition ?? \"\").trim() && !highMagicClass) return 0;", to: "  if (!String(tradition ?? \"\").trim()) return 0;", breaks: "PP" },
  { name: "actor.mjs does not say the class is High Magic", file: ACT, from: "        highMagicClass: Boolean(system.progression?.learnTraditions)\n", to: "        highMagicClass: false\n", breaks: "PP" },
  // PK — the pickers
  { name: "THE GAP: the book ladder is two a level for the Archmage", file: SB, from: "  return opening + per * (value - 1);", to: "  return opening + 2 * (value - 1);", breaks: "PK" },
  { name: "the Spell Book card ignores the class's ladder", file: SBW, from: "    perLevel: bookSlotsPerLevel(actor.system?.progression?.classMagic)\n", to: "    perLevel: 2\n", breaks: "PK" },
  { name: "the book's cantrips count as its spells", file: SB, from: "      !item.flags?.[SYSTEM_ID]?.cantripBook\n", to: "      true\n", breaks: "PK" },
  { name: "the book picks ignore the class's traditions", file: SBW, from: "    pickAllowed(pickRule, entry.system?.tradition) &&\n", to: "    true &&\n", breaks: "PK" },
  { name: "the repertoire picks ignore the class's traditions", file: RW, from: "  return (entry) =>\n    !alreadyKnownSpell(known, entry) &&\n    pickAllowed(pickRule, entry.system?.tradition) &&\n", to: "  return (entry) =>\n    !alreadyKnownSpell(known, entry) &&\n    true &&\n", breaks: "PK" },
  { name: "Learn a Spell ignores the class's traditions", file: LSW, from: "    pickAllowed(pickRule, entry.system?.tradition) &&\n", to: "", breaks: "PK" },
  { name: "the class's own count takes a track's picks", file: RW, from: "    picked: tracks.length ? repertoireSpells(actor).filter((s) => !trackOf(s)).length : repertoireSpells(actor).length,", to: "    picked: repertoireSpells(actor).length,", breaks: "PK" },
  { name: "the tracks are left out of the total", file: RW, from: "    allowed: state.allowed + tracks.reduce((n, t) => n + t.allowed, 0),", to: "    allowed: state.allowed,", breaks: "PK" },
  { name: "the birthright track takes any tradition", file: RW, from: "    traditionAllowed(track.traditions, entry.system?.tradition) &&\n", to: "", breaks: "PK" },
  { name: "the slot rules are never asked", file: RW, from: "  if (slots.length) {\n    const index = nextCantripSlot(", to: "  if (false) {\n    const index = nextCantripSlot(", breaks: "PK" },
  { name: "the Witch's cantrips stay her own tradition only", file: RW, from: "  if (!widened) return null;\n  return { rule: actorPickRule(", to: "  return null;\n  return { rule: actorPickRule(", breaks: "PK" },
  { name: "the Archmage's cantrips do not go in the book", file: RW, from: "    fromBook: Boolean(magic?.cantripBook)\n", to: "    fromBook: false\n", breaks: "PK" },
  { name: "the book's prepared cantrips are not counted", file: MW, from: "      ? spellBookCantrips(actor).filter((s) => s.system?.prepared).length\n", to: "      ? 0\n", breaks: "PK" },
  { name: "the Cantrips card does not say the book", file: HBS, from: "{{#if knownCantrips.fromBook}}Kept in your spell book", to: "{{#if false}}Kept in your spell book", breaks: "PK" },
  // CAP
  { name: "a negative raise lowers the cap", file: CAP, from: "    if (!Number.isFinite(value) || value <= 0) continue;", to: "    if (!Number.isFinite(value) || value === 0) continue;", breaks: "CAP" },
  { name: "a throwing raise stops the cast", file: CAP, from: "      console.error(`TRG Prime | cast cap modifier \"${key}\" failed`, err);\n      continue;", to: "      throw err;", breaks: "CAP" },
  { name: "THE GAP: the raised cap is not the one tested", file: CAST, from: "  if (!isInnate && totalPP > castCap) {", to: "  if (!isInnate && totalPP > cap) {", breaks: "CAP" },
  { name: "the raise is not told the cast was warped", file: CAST, from: "      actor, spell, spellData, highMagic: hmCast.highMagic, warped: totalPP > basePP,", to: "      actor, spell, spellData, highMagic: hmCast.highMagic, warped: true,", breaks: "CAP" },
  { name: "THE REVIEW'S DEFECT: Raw Power's PP are charged as overcast", file: m("magic", "casting-dc.mjs"), from: "Math.max(0, overcastDCIncrease(pp, int(casterLevel)) - 2 * Math.max(0, int(capRaise)))", to: "overcastDCIncrease(pp, int(casterLevel))", breaks: "CAP" },
  { name: "the casting DC is not told the raise", file: CAST, from: "    capRaise: capRaise.value\n  });", to: "    capRaise: 0\n  });", breaks: "CAP" },
  // SP
  { name: "THE GAP: the module's opening is not asked", file: FW, from: "          }) && !(s.system?.specialist && opened(s))) return false;", to: "          })) return false;", breaks: "SP" },
  { name: "THE REVIEW'S DEFECT: the opening admits an ordinary spell", file: FW, from: "          }) && !(s.system?.specialist && opened(s))) return false;", to: "          }) && !opened(s)) return false;", breaks: "SP" },
  { name: "a throwing access test is not caught", file: FW, from: "        try { return allows(actor, s) === true; } catch (err)", to: "        { return allows(actor, s) === true; } if (0) (err)", breaks: "SP" },
  { name: "the access test gets no traits", file: FW, from: "        indexFields: [\"system.specialistClass\", \"system.traits\", \"system.ppCost\", \"system.specialist\", \"flags.trg-prime\"],", to: "        indexFields: [\"system.specialistClass\"],", breaks: "SP" },
  { name: "a non-function access is registered", file: API, from: "  if (!k || typeof allows !== \"function\") { problem(", to: "  if (!k) { problem(", breaks: "SP" },
  // FAM
  { name: "the mirror forgets the master's abilities", file: FAM, from: "        .map((key) => [key, Math.trunc(Number(masterSystem?.attributes?.[key]?.total) || 0)])", to: "        .map((key) => [key, 0])", breaks: "FAM" },
  { name: "a changed Charisma never drifts", file: FAM, from: "  if (stored?.abilities && current?.abilities && JSON.stringify(stored.abilities) !== JSON.stringify(current.abilities)) {", to: "  if (false) {", breaks: "FAM" },
  { name: "a number for every save is not spread", file: FM, from: "      saves[save] = typeof got.saves === \"object\" && got.saves !== null ? whole(got.saves[save]) : whole(got.saves);", to: "      saves[save] = typeof got.saves === \"object\" && got.saves !== null ? whole(got.saves[save]) : 0;", breaks: "FAM" },
  { name: "a throwing modifier is not caught", file: FM, from: "      console.error(`TRG Prime | familiar modifier \"${key}\" failed`, err);\n      continue;", to: "      throw err;", breaks: "FAM" },
  { name: "the HP is not summed", file: FM, from: "  return results.reduce((sum, r) => sum + r.hp, 0);", to: "  return 0;", breaks: "FAM" },
  { name: "THE GAP: the saves are not pooled", file: ACT, from: "    for (const [target, entries] of Object.entries(familiarModifierSaveEntries(modified))) {\n      for (const entry of entries) actor.addBonus(target, entry);\n    }\n", to: "", breaks: "FAM" },
  { name: "the module API has no createFamiliarFor", file: APW, from: "      createFamiliarFor: async (master, sourceItem) =>", to: "      createFamiliarForX: async (master, sourceItem) =>", breaks: "FAM" },
  // PP grants
  { name: "THE AUDIT'S DEFECT: the registered racial PP reach no character", file: FW, from: "  for (const [name, per] of registeredRacialPPEntries()) {", to: "  for (const [name, per] of []) {", breaks: "PP" },
  { name: "a core race's registration doubles its PP", file: FW, from: "    if (Object.prototype.hasOwnProperty.call(RACIAL_PP_PER_LEVEL, key) || Object.prototype.hasOwnProperty.call(HERITAGE_PP_PER_LEVEL, key)) continue;", to: "", breaks: "PP" },
  { name: "the grant is flat, not per level", file: FW, from: "      due: (actor) => grant.perLevel * Math.max(0, Number(actor.system.identity?.level ?? 0))", to: "      due: () => grant.perLevel", breaks: "PP" },
  { name: "the reconcile runs the core's rows only", file: FW, from: "  for (const grant of allPPGrants()) {", to: "  for (const grant of PP_GRANTS) {", breaks: "PP" },
  { name: "a zero perLevel grant is registered", file: API, from: "  if (!k || !Number.isFinite(per) || per === 0) { problem(`registerPPGrant", to: "  if (!k || !Number.isFinite(per)) { problem(`registerPPGrant", breaks: "PP" },
  // AB
  { name: "a lower BSB replaces the BAB", file: AB, from: "  if (bsb <= bab) return null;", to: "", breaks: "AB" },
  { name: "the claws are rolled with BAB", file: ATK, from: "    const row = attackBaseRow(weapon, actor.system);\n    if (row) modifiers.push(row);\n", to: "    const row = attackBaseRow(weapon, actor.system);\n", breaks: "AB" },
  { name: "the sheet's own BSB is forgotten", file: AB, from: "  return Math.trunc(Number(system?.magic?.bsb ?? 0) + Number(system?.progression?.bsb ?? 0)) || 0;", to: "  return Math.trunc(Number(system?.magic?.bsb ?? 0)) || 0;", breaks: "AB" },
  // N
  { name: "the settled hook forgets the natural die", file: CAST, from: "    natural: Math.trunc(Number(check?.dice?.unmodified ?? 0)) || 0,\n", to: "", breaks: "N" },
  { name: "THE REVIEW'S DEFECT: the die is read off a `faces` the check does not have", file: CAST, from: "    natural: Math.trunc(Number(check?.dice?.unmodified ?? 0)) || 0,\n", to: "    natural: Math.trunc(Number(check?.dice?.faces?.[0] ?? 0)) || 0,\n", breaks: "N" },
  // API, Z
  { name: "the API does not offer the cap raise", file: APW, from: "    registerCastCapModifier: (key, raise, moduleId) => registerCastCapModifier(key, raise, moduleId),", to: "", breaks: "API" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.687.1\"", to: "\"version\": \"3.679.0\"", breaks: "Z" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block3a-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block3a-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block3a-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block3a-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
