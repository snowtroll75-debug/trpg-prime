#!/usr/bin/env node
/** mutate-ea-block1-core — the mutation half of verify-ea-block1-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const API = m("module-api.mjs"), APIW = m("module-api-workflow.mjs"), SDB = m("magic", "spell-damage-bonus.mjs"), CAST = m("magic", "cast-workflow.mjs"),
  CAR = m("creature-ability-rules.mjs"), SUR = m("magic", "cast-surcharge.mjs"), FR = m("fumble-reroll.mjs"), FRW = m("fumble-reroll-workflow.mjs"),
  CHK = m("dice", "check.mjs"), GSO = m("general-skill-options.mjs"), AW = m("combat", "action-workflow.mjs"), CIW = m("charged-items-workflow.mjs"),
  CUW = m("consumable-use-workflow.mjs"), PROF = m("proficiency-rules.mjs"), CLM = m("magic", "caster-level-mods.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json");

const GATES = m("magic", "spell-check-gates.mjs"), MIW = m("magic-items-workflow.mjs");
const BS = m("magic", "beneficial-save.mjs"), EW = m("magic", "emanation-workflow.mjs");
const MUTATIONS = [
  // C12 (3.677.0)
  { name: "THE GAP: a named degree is ignored (Esoteric Insight never answers a Failure)", file: FR, from: "    if (!(named.length ? named : DEFAULT_REROLL_DEGREES).includes(result)) continue;\n", to: "    if (!DEFAULT_REROLL_DEGREES.includes(result)) continue;\n", breaks: "C12" },
  { name: "every reroll answers a Failure", file: FR, from: "export const DEFAULT_REROLL_DEGREES = Object.freeze([\"fumble\", \"blunder\"]);", to: "export const DEFAULT_REROLL_DEGREES = Object.freeze([\"failure\", \"fumble\", \"blunder\"]);", breaks: "C12" },
  { name: "the check never offers on a Failure", file: CHK, from: "      || ([\"partial\", \"failure\"].includes(rerollDegree) && check.actor", to: "      || ([].includes(rerollDegree) && check.actor", breaks: "C12" },
  { name: "the offer is made for a Fumble whatever was rolled", file: FRW, from: "  const row = fumbleRerollAvailable(actor, kind, subject, degree);", to: "  const row = fumbleRerollAvailable(actor, kind, subject);", breaks: "C12" },
  { name: "a failure is called a fumble", file: FR, from: "  if (k === \"failure\") return { verb: \"failed\", noun: \"failure\" };\n", to: "", breaks: "C12" },
  // C13 (3.677.0)
  { name: "THE GAP: a martial racial weapon stays martial", file: PROF, from: "export const RACIAL_STEP = Object.freeze({ exotic: \"Martial\", martial: \"Simple\" });", to: "export const RACIAL_STEP = Object.freeze({ exotic: \"Martial\" });", breaks: "C13" },
  { name: "the step goes two categories", file: PROF, from: "export const RACIAL_STEP = Object.freeze({ exotic: \"Martial\", martial: \"Simple\" });", to: "export const RACIAL_STEP = Object.freeze({ exotic: \"Simple\", martial: \"Simple\" });", breaks: "C13" },
  { name: "the reason still says martial", file: PROF, from: "why: `${category.toLowerCase()} weapon proficiency (a ${who || profile.race} weapon, ${category.toLowerCase()} for a ${who || profile.race})`", to: "why: `martial weapon proficiency (a ${who || profile.race} weapon, martial for a ${who || profile.race})`", breaks: "C13" },
  // C14 (3.677.0)
  { name: "THE GAP: the declared save is never asked", file: BS, from: "  if (declared) return { required: true, traditions: [], source: declared.label, kind: \"declared\" };\n", to: "", breaks: "C14" },
  { name: "the Nyrinn rolls against its own spells", file: BS, from: "  const declared = declaredBeneficialSaves(target).find((d) => !(d.otherCastersOnly && own));", to: "  const declared = declaredBeneficialSaves(target).find(() => true);", breaks: "C14" },
  { name: "a harmful spell asks the save too", file: BS, from: "export function beneficialSaveRequired(target, spellData, caster = null, { highMagic } = {}) {\n  if (!isBeneficialSpell(spellData)) return { required: false, traditions: [], source: \"\" };", to: "export function beneficialSaveRequired(target, spellData, caster = null, { highMagic } = {}) {", breaks: "C14" },
  { name: "a switched-off ability still declares", file: BS, from: "    if (item.type === \"ability\" && item.system?.active === false) continue;\n    const raw = item.flags?.[\"trg-prime\"]?.beneficialSpellSave;", to: "    const raw = item.flags?.[\"trg-prime\"]?.beneficialSpellSave;", breaks: "C14" },
  { name: "the cast never names the caster", file: BS, from: "    const need = beneficialSaveRequired(target, spellData, caster);", to: "    const need = beneficialSaveRequired(target, spellData);", breaks: "C14" },
  // C15 (3.677.1, found live)
  { name: "THE DEFECT: the circle forgets who refused (the Nyrinn gets the bonus anyway)", file: EW, from: "    inside = benefitMembers(caught, accepted);\n", to: "", breaks: "C15" },
  { name: "a refusal is not recorded", file: BS, from: "    if (outcomes instanceof Map) outcomes.set(target, passed);", to: "", breaks: "C15" },
  { name: "the cast passes no record", file: CAST, from: "        benefit: benefitRecord(spellData, nominalSaveDC, benefitOutcomes,", to: "        benefit: null && benefitRecord(spellData, nominalSaveDC, benefitOutcomes,", breaks: "C15" },
  { name: "a latecomer is asked again on every step", file: BS, from: "  return inside.filter((id) => !Object.prototype.hasOwnProperty.call(accepted ?? {}, id));", to: "  return inside.slice();", breaks: "C15" },
  { name: "everyone inside rolls, owed or not", file: EW, from: "      if (!t?.actor || !beneficialSaveRequired(t.actor, benefit.spell, actor).required) continue;", to: "      if (!t?.actor) continue;", breaks: "C15" },
  { name: "the answers are lost on a re-record", file: EW, from: "benefit: entry.emanation?.benefit ?? null, ...descriptor };", to: "...descriptor };", breaks: "C15" },
  { name: "the snapshot drops the tradition (the Ascendan is never asked)", file: BS, from: "    tradition: spellData?.tradition ?? \"\",\n", to: "", breaks: "C15" },
  { name: "a harmful circle carries a record", file: BS, from: "  if (!isBeneficialSpell(spellData)) return null;\n  const effects", to: "  const effects", breaks: "C15" },
  // C10 (found in review)
  { name: "THE DEFECT: a casting-DC row lowers the attack against DB", file: CAST, from: "    checkTotal: Number(c.outcome?.total ?? 0) - Number(c.castingOnlyTotal ?? 0),", to: "    checkTotal: Number(c.outcome?.total ?? 0),", breaks: "C10" },
  { name: "the gate reader drops castingOnly", file: GATES, from: ", ...(row?.castingOnly === true ? { castingOnly: true } : {}), ...(attackOnly", to: ", ...(attackOnly", breaks: "C10" },
  { name: "an innate attack takes a casting-DC row", file: CAST, from: "            // Not a casting-DC row (3.675.0): an innate attack has no casting DC.\n            ...gateAttackRows", to: "            ...gated.modifiers", breaks: "C10" },
  { name: "the total is never carried on the check", file: CAST, from: "  if (check && castingOnlyTotal && !isItemCast && !isInnate) check.castingOnlyTotal = castingOnlyTotal;", to: "", breaks: "C10" },
  // C11 (found in review)
  { name: "a second Staff may be quickbound", file: MIW, from: "  if (staff) return staff;\n", to: "", breaks: "C11" },
  { name: "the slot limit is ignored", file: MIW, from: "  if (invested >= slots) return `${actor.name} is already invested in ${invested} of ${slots} items`;", to: "", breaks: "C11" },
  { name: "the helper is not offered", file: APIW, from: "      investRefusal: async (actor, item) =>", to: "      investRefusalX: async (actor, item) =>", breaks: "C11" },
  // C1
  { name: "THE GAP: valueFrom is ignored", file: SDB, from: "        : ABILITIES.includes(from)\n        ? Math.trunc(Number(attributes?.[from]?.total ?? 0) || 0)\n        : Math.trunc(Number(row.value) || 0);", to: "        : Math.trunc(Number(row.value) || 0);", breaks: "C1" },
  { name: "a disabled effect still adds", file: SDB, from: "    if (!effect || effect.disabled) continue;\n    const raw = effect.flags?.[SYSTEM_ID]?.spellDamageBonus;", to: "    if (!effect) continue;\n    const raw = effect.flags?.[SYSTEM_ID]?.spellDamageBonus;", breaks: "C1" },
  { name: "the traits scope is ignored", file: SDB, from: "      if (!value) continue;\n      const wanted = traitList(row.traits);\n      if (wanted.length && !wanted.some((t) => have.has(t))) continue;\n", to: "      if (!value) continue;\n      const wanted = traitList(row.traits);\n", breaks: "C1" },
  { name: "two status bonuses stack", file: SDB, from: "    if (row.value < 0 || STACKING[row.type] !== \"highest\") { out.push(row); continue; }", to: "    { out.push(row); continue; }", breaks: "C1" },
  { name: "the formula gains nothing", file: SDB, from: "  return { formula: `${base} ${total < 0 ? \"-\" : \"+\"} ${Math.abs(total)}`, total, text };", to: "  return { formula: base, total, text };", breaks: "C1" },
  { name: "the attack path does not add it", file: CAST, from: "  const damageFormula = surged.formula;", to: "  const damageFormula = abilityFormula;", breaks: "C1" },
  { name: "the save path does not add it", file: CAST, from: "      damageFormula = surged.formula;\n      lines.push(line(`<em>Spell damage bonus: ${surged.text}.</em>`));\n    }\n  }", to: "      lines.push(line(`<em>Spell damage bonus: ${surged.text}.</em>`));\n    }\n  }", breaks: "C1" },
  // C2
  { name: "THE GAP: only `true` is Spell Resilience", file: CAR, from: "    if (raw !== true && !(raw && typeof raw === \"object\")) continue;", to: "    if (raw !== true) continue;", breaks: "C2" },
  { name: "Null Aura is called Spell Resilience", file: CAR, from: "    const label = raw === true ? \"Spell Resilience\" : (String(raw.label ?? item?.name ?? \"\").trim() || \"Spell Resilience\");", to: "    const label = \"Spell Resilience\";", breaks: "C2" },
  { name: "the same ability counts twice", file: CAR, from: "    if (!byLabel.has(label.toLowerCase())) byLabel.set(label.toLowerCase(), { label, value, type });", to: "    byLabel.set(label.toLowerCase() + byLabel.size, { label, value, type });", breaks: "C2" },
  { name: "THE GAP: the caster lowers nothing", file: CAR, from: "      return cut ? { ...row, value: Math.max(0, row.value - cut), reducedBy: cut } : row;", to: "      return row;", breaks: "C2" },
  { name: "a reduction lowers every name", file: CAR, from: "      const cut = cuts.filter((c) => c.labels.includes(row.label.toLowerCase())).reduce((sum, c) => sum + c.value, 0);", to: "      const cut = cuts.reduce((sum, c) => sum + c.value, 0);", breaks: "C2" },
  { name: "a row lowered to 0 is kept", file: CAR, from: "    .filter((row) => row.value > 0);", to: "    .filter((row) => row.value >= 0);", breaks: "C2" },
  { name: "an effect's reduction is not read", file: CAR, from: "  const sources = [...Array.from(caster?.items ?? []), ...Array.from(caster?.appliedEffects ?? caster?.effects ?? [])];", to: "  const sources = [...Array.from(caster?.items ?? [])];", breaks: "C2" },
  { name: "the save path does not hand in the caster", file: CAST, from: "        ...spellResilienceModifiers(target, actor)", to: "        ...spellResilienceModifiers(target)", breaks: "C2" },
  { name: "the attack path does not hand in the caster", file: CAST, from: "  const resilienceRows = spellResilienceModifiers(targetActor, actor);", to: "  const resilienceRows = spellResilienceModifiers(targetActor);", breaks: "C2" },
  // C3
  { name: "a surcharge registers without a function", file: API, from: "  if (!k || typeof surcharge !== \"function\") { problem(", to: "  if (!k) { problem(", breaks: "C3" },
  { name: "a negative surcharge refunds", file: SUR, from: "  const pp = Math.max(0, Math.floor(Number(out.pp) || 0));", to: "  const pp = Math.floor(Number(out.pp) || 0);", breaks: "C3" },
  { name: "a failing surcharge is silent", file: SUR, from: "      failed.push(\"<em>A module's surcharge on this casting failed — see the console.</em>\");", to: "", breaks: "C3" },
  { name: "THE GAP: the affordability test ignores the surcharge", file: CAST, from: "  if ((ritualSubstitutes ? 0 : totalPP) + surcharge.pp > ppPool + rodDraw) {", to: "  if ((ritualSubstitutes ? 0 : totalPP) > ppPool + rodDraw) {", breaks: "C3" },
  { name: "the surcharge is never paid", file: CAST, from: "  if (surcharge.pp > 0) {\n    const poolAfterCast = Number(actor.system?.resources?.pp?.value ?? 0);", to: "  if (false) {\n    const poolAfterCast = Number(actor.system?.resources?.pp?.value ?? 0);", breaks: "C3" },
  { name: "an item's spell is surcharged", file: CAST, from: "  const surcharge = isItemCast\n    ? { pp: 0, labels: [], lines: [] }\n    : await", to: "  const surcharge = false\n    ? { pp: 0, labels: [], lines: [] }\n    : await", breaks: "C3" },
  { name: "the card says nothing", file: CAST, from: "line(`<strong>Surcharge:</strong> ${surcharge.labels.join(\", \")}, paid on top of the casting's own PP.`)", to: "line(\"\")", breaks: "C3" },
  { name: "the API does not register surcharges", file: APIW, from: "    registerCastSurcharge: (key, surcharge, moduleId) => registerCastSurcharge(key, surcharge, moduleId),\n", to: "", breaks: "C3" },
  // C4
  { name: "THE GAP: the subjects are ignored", file: FR, from: "    if (subjects.length && !subjects.includes(about)) continue;", to: "", breaks: "C4" },
  { name: "the workflow drops the subject", file: FRW, from: "fumbleRerollRows(Array.from(actor.items ?? []), kind, subject, degree)", to: "fumbleRerollRows(Array.from(actor.items ?? []), kind, \"\", degree)", breaks: "C4" },
  { name: "the check does not say its subject", file: CHK, from: "{ degree: firstDegree, subject: check.subject }", to: "{ degree: firstDegree }", breaks: "C4" },
  // C5
  { name: "THE GAP: the feat's ladder is never asked", file: AW, from: "(featTimeLadder(action, actorFeatNames) ?? timeLadder(action.key, action))", to: "(timeLadder(action.key, action))", breaks: "C5" },
  { name: "the feat's name is matched case-sensitively", file: GSO, from: "  const owned = new Set((featNames ?? []).map((n) => String(n ?? \"\").trim().toLowerCase()));", to: "  const owned = new Set((featNames ?? []).map((n) => String(n ?? \"\").trim()));", breaks: "C5" },
  { name: "any feat's ladder is given", file: GSO, from: "    if (!owned.has(String(feat).trim().toLowerCase())) continue;", to: "", breaks: "C5" },
  // C6
  { name: "THE GAP: the ladder adds no module path", file: CIW, from: "    ...(await moduleReleaseOptions(kind, { spellPPCost: cost, spellTradition, spellName, ...context }))", to: "", breaks: "C6" },
  { name: "a wand is offered the scroll's path", file: CIW, from: "  if (String(kind ?? \"\") !== \"scroll\") return [];", to: "", breaks: "C6" },
  { name: "the scroll read does not say it is one", file: CUW, from: "    kind: \"scroll\",", to: "", breaks: "C6" },
  { name: "the API does not register release paths", file: APIW, from: "    registerReleasePath: (key, path, moduleId) => registerReleasePath(key, path, moduleId),\n", to: "", breaks: "C6" },
  // C7, C8
  { name: "THE GAP: the heritage is not read for a racial weapon", file: PROF, from: "    || racialWeaponMatches(profile?.heritage, item?.system?.traits);\n  const racial = ownRace", to: ";\n  const racial = ownRace", breaks: "C7" },
  { name: "the profile has no heritage", file: PROF, from: "    heritage: String(items.find((item) => item.type === \"heritage\")?.name ?? \"\").trim(),", to: "    heritage: \"\",", breaks: "C7" },
  { name: "THE GAP: no trait rule is read", file: PROF, from: "  const byTrait = traitRuleCategory(profile, item);\n  const friendlier", to: "  const byTrait = \"\";\n  const friendlier", breaks: "C8" },
  { name: "the racial clause beats a friendlier trait rule", file: PROF, from: "    .sort((a, b) => CATEGORY_RANK[norm(a)] - CATEGORY_RANK[norm(b)])[0] ?? \"\";", to: "[0] ?? \"\";", breaks: "C8" },
  { name: "a Bard is not an Adept", file: PROF, from: "      .flatMap((item) => String(item.system?.classType ?? item.system?.tier ?? \"\").split(/[/,]/))", to: "      .map((item) => String(item.system?.classType ?? item.system?.tier ?? \"\"))", breaks: "C8" },
  { name: "the class type is not checked", file: PROF, from: "    if (!rule.classTypes.some((t) => types.has(t))) continue;", to: "", breaks: "C8" },
  { name: "a rule for Exotic is accepted", file: API, from: "if (!k || ![\"simple\", \"martial\"].includes(categoryAs.toLowerCase()) || !classTypes.length) {", to: "if (!k || !classTypes.length) {", breaks: "C8" },
  // C9
  { name: "THE GAP: the attack path rolls no secondary", file: CAST, from: "    const second = warpedDamageRow(normaliseSecondaryDamage(spellData), warpMods);", to: "    const second = null;", breaks: "C9" },
  { name: "the secondary is rolled as the spell's own type", file: CAST, from: "        type: second.type,\n        ...spellDamageSource(spell, { targeted: true }),\n        sourceTraits: spellSourceTraits(spell)", to: "        type: damageType,\n        ...spellDamageSource(spell, { targeted: true }),\n        sourceTraits: spellSourceTraits(spell)", breaks: "C9" },
  { name: "the caster-level step is not added", file: CAST, from: "      const flat = Math.max(0, Math.floor(Number(clMods?.secondary ?? 0)));", to: "      const flat = 0;", breaks: "C9" },
  { name: "the caster-level step is not counted", file: CLM, from: "    if (mod?.secondary) out.secondary += Number(mod.secondary) * steps;", to: "", breaks: "C9" },
  // Z
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.686.2\"", to: "\"version\": \"3.674.2\"", breaks: "Z" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block1-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block1-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block1-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block1-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
