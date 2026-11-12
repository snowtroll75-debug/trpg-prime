#!/usr/bin/env node
/** mutate-ea-block2b-core — the mutation half of verify-ea-block2b-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RR = m("magic", "ritual-rules.mjs"), CO = m("magic", "cast-options.mjs"), CAST = m("magic", "cast-workflow.mjs"),
  CDC = m("magic", "casting-dc.mjs"), API = m("module-api.mjs"), APW = m("module-api-workflow.mjs"),
  SJ = path.join(SYSTEM_ROOT, "system.json");

const MUTATIONS = [
  // R — the registry and the rules
  { name: "a spec with a non-function field is taken", file: API, from: "    && fns.every((f) => spec[f] === undefined || typeof spec[f] === \"function\");", to: "    && true;", breaks: "R" },
  { name: "a variant is not keyed by its module", file: RR, from: "        out.push({ key: `${key}${SEP}${vk}`, label, hint: str(v?.hint) });", to: "        out.push({ key: vk, label, hint: str(v?.hint) });", breaks: "R" },
  { name: "an unlabelled variant is offered", file: RR, from: "        if (!vk || !label) continue;", to: "        if (!vk) continue;", breaks: "R" },
  { name: "a failing module's variants stop the others", file: RR, from: "      console.error(`TRG Prime | ritual rules \"${key}\": variants failed`, err);", to: "      throw err;", breaks: "R" },
  { name: "THE GAP: another module's DC is taken for the ritual", file: RR, from: "    if (mine) {\n      out.variant = chosen;", to: "    if (true) {\n      out.variant = chosen;", breaks: "R" },
  { name: "the seats are not counted", file: RR, from: "    out.seats += Math.max(0, num(got.seats));", to: "", breaks: "R" },
  { name: "a zero DC row is kept", file: RR, from: "      if (value && str(row?.label)) out.dcRows.push({ label: str(row.label), value });", to: "      if (str(row?.label)) out.dcRows.push({ label: str(row.label), value });", breaks: "R" },
  { name: "a refusal is dropped", file: RR, from: "    if (typeof got.refused === \"string\" && got.refused.trim() && !out.refused) out.refused = got.refused.trim();", to: "", breaks: "R" },
  { name: "THE DEFECT: a vanished variant is paid for free", file: RR, from: "  if (chosen && !out.variant && !out.refused) out.refused = `the way of paying chosen (${chosen}) is no longer offered`;", to: "", breaks: "R" },
  { name: "a variant with no skill goes ahead", file: RR, from: "  if (out.variant && (!out.dc || !out.skill) && !out.refused) out.refused = \"the ritual variant gave no check to roll\";", to: "", breaks: "R" },
  { name: "a failing owner lets the ritual go ahead", file: RR, from: "      if (mine) out.refused = \"the ritual's rules failed (see the console)\";", to: "", breaks: "R" },
  { name: "M30 undone: any truthy answer lifts the cap", file: RR, from: "      if ((await spec.liftsCap(ctx)) === true) return true;", to: "      if (await spec.liftsCap(ctx)) return true;", breaks: "R" },
  { name: "a lifted ritual does not cast on a Critical", file: RR, from: "  return [\"success\", \"critical\", \"heroic\"].includes(str(degree));", to: "  return str(degree) === \"success\";", breaks: "R" },
  // RW — the ritual wired
  { name: "THE GAP: the ritual is not refused (rolled, then refused)", file: CAST, from: "    if (ritualRefused) {\n", to: "    if (false) {\n", breaks: "RW" },
  { name: "the variant select is never shown", file: CAST, from: "        ${ritualVariants.length ? `<hr><div class=\"form-group\">", to: "        ${false ? `<hr><div class=\"form-group\">", breaks: "RW" },
  { name: "a refused plan still rolls", file: CAST, from: "  if (ritualPlan.refused) {\n", to: "  if (false) {\n", breaks: "RW" },
  { name: "the seats do not count", file: CAST, from: "  const secondaryCount = degrees.length + ritualPlan.seats;", to: "  const secondaryCount = degrees.length;", breaks: "RW" },
  { name: "the variant's DC is ignored", file: CAST, from: "  const ritualBase = ritualPlan.dc ? ritualPlan.dc.value : castingDC(basePP);", to: "  const ritualBase = castingDC(basePP);", breaks: "RW" },
  { name: "Q14 undone: High Magic's Hard is not on the ritual", file: CAST, from: "    ...(highMagicCastingDCStep(hmCast) ? [{ label: \"High Magic, Hard\", value: highMagicCastingDCStep(hmCast) }] : []),\n", to: "", breaks: "RW" },
  { name: "Q5 undone: the core's ritual modifiers leave the variant", file: CAST, from: "  const dc = ritualBase + dcModifiers + ritualDCRows.reduce((sum, row) => sum + row.value, 0);", to: "  const dc = ritualPlan.dc ? ritualBase : ritualBase + dcModifiers + ritualDCRows.reduce((sum, row) => sum + row.value, 0);", breaks: "RW" },
  { name: "Spellcraft is rolled for a variant", file: CAST, from: "    ...(ritualPlan.skill ? { type: \"skill\", subject: ritualPlan.skill.key } : { type: \"spellcraft\" }),", to: "    type: \"spellcraft\",", breaks: "RW" },
  { name: "the modules' check rows are dropped", file: CAST, from: "  modifiers.push(...ritualPlan.modifiers);\n", to: "", breaks: "RW" },
  { name: "THE GAP: suppression's penalty misses the ritual check", file: CAST, from: "  modifiers.push(...ritualGated.modifiers);\n", to: "", breaks: "RW" },
  { name: "the cap is lifted for every ritual", file: CAST, from: "  const degree = capLifted ? rawDegree : capRitualDegree(rawDegree);", to: "  const degree = rawDegree;", breaks: "RW" },
  { name: "the cast is not told the variant (the primary pays PP)", file: CAST, from: "      ritual: { degree, ppOver, secondaryCount, check, variant: ritualPlan.variant, gated:", to: "      ritual: { degree, ppOver, secondaryCount, check, gated:", breaks: "RW" },
  { name: "Q10 undone: a non-caster primary must have prepared it", file: CAST, from: "  const castBlocked = ritualNonCaster ? \"\" : spellCastBlocked(spell);", to: "  const castBlocked = spellCastBlocked(spell);", breaks: "RW" },
  { name: "Q10 widened: a caster leading a variant is not asked either", file: CAST, from: "  const ritualNonCaster = ritualSubstitutes && Number(system?.magic?.casterLevelValue ?? 0) <= 0;", to: "  const ritualNonCaster = ritualSubstitutes;", breaks: "RW" },
  { name: "the pool is tested for substituted PP", file: CAST, from: "  if ((ritualSubstitutes ? 0 : totalPP) + surcharge.pp > ppPool + rodDraw) {", to: "  if (totalPP + surcharge.pp > ppPool + rodDraw) {", breaks: "RW" },
  { name: "THE DEFECT: the primary pays the PP as well", file: CAST, from: "  const casterPPSpent = ritualSubstitutes ? 0 : ppSpent - rodPaid - sourcesPaid;", to: "  const casterPPSpent = ppSpent - rodPaid - sourcesPaid;", breaks: "RW" },
  { name: "the substituted PP are capped by the pool", file: CAST, from: "    : ritualSubstitutes ? paidOutcome.ppSpent + variableSuccessPP\n", to: "", breaks: "RW" },
  { name: "the settled hook does not say what to substitute", file: CAST, from: "ppSubstituted: ritualSubstitutes && !castRefunded ? ppSpent : 0,", to: "ppSubstituted: 0,", breaks: "RW" },
  { name: "REVIEW: a refunded variant still owes its sacrifice", file: CAST, from: "ppSubstituted: ritualSubstitutes && !castRefunded ? ppSpent : 0,", to: "ppSubstituted: ritualSubstitutes ? ppSpent : 0,", breaks: "RW" },
  { name: "REVIEW: a held rod pays as well as the sacrifice", file: CAST, from: "stored || totalPP <= 0 || ritualSubstitutes)", to: "stored || totalPP <= 0)", breaks: "RW" },
  { name: "REVIEW: a ritual's casting may be stored", file: CAST, from: "  const storingNow = !stored && !isStoringSpell && !ritual && Boolean(readArmed(actor));", to: "  const storingNow = !stored && !isStoringSpell && Boolean(readArmed(actor));", breaks: "RW" },
  { name: "REVIEW: the gates are asked twice per ritual", file: CAST, from: "  const gated = ritual?.gated ?? await runSpellCheckGates({", to: "  const gated = await runSpellCheckGates({", breaks: "RW" },
  { name: "REVIEW: the ritual's gate answer is not handed in", file: CAST, from: "variant: ritualPlan.variant, gated: { modifiers: ritualGated.modifiers, lines: [] } }", to: "variant: ritualPlan.variant }", breaks: "RW" },
  { name: "REVIEW: a failed ritual's prompt can be cancelled away", file: CAST, from: "  const conditions = (isItemCast || isInnate || noCheckCantrip || ritualFailed)", to: "  const conditions = (isItemCast || isInnate || noCheckCantrip)", breaks: "RW" },
  { name: "REVIEW: an unprepared spell is found only after a Success", file: CAST, from: "    if (leaderCL > 0) {\n      const blocked = spellCastBlocked(spell);", to: "    if (false) {\n      const blocked = spellCastBlocked(spell);", breaks: "RW" },
  { name: "REVIEW: the cap is found only after the roll", file: CAST, from: "    if (basePP > capNow) {", to: "    if (false) {", breaks: "RW" },
  { name: "REVIEW: a stopped failed ritual is silent", file: CAST, from: "    if (castResult === null && consequences) {", to: "    if (false) {", breaks: "RW" },
  { name: "REVIEW: goldOf is not offered", file: APW, from: "      goldOf: async (actor) => (await import(\"./items.mjs\")).coinValueInGP(actor?.system?.currency),\n", to: "", breaks: "H" },
  // O — casting options
  { name: "an option with no apply is taken", file: API, from: "  if (!k || typeof spec?.offer !== \"function\" || typeof spec?.apply !== \"function\") {", to: "  if (!k || typeof spec?.offer !== \"function\") {", breaks: "O" },
  { name: "an unlabelled option is offered", file: CO, from: "      if (!offer || !str(offer.label)) continue;", to: "      if (!offer) continue;", breaks: "O" },
  { name: "a required option is offered as a tick", file: CO, from: "required: offer.required === true });", to: "required: false });", breaks: "O" },
  { name: "a required option is not applied", file: CO, from: "  return (offered ?? []).filter((o) => o.required || Boolean(form?.[castOptionField(o.key)])).map((o) => o.key);", to: "  return (offered ?? []).filter((o) => Boolean(form?.[castOptionField(o.key)])).map((o) => o.key);", breaks: "O" },
  { name: "the Save DCs are not summed", file: CO, from: "    out.saveDC += num(got?.saveDC);", to: "    out.saveDC = num(got?.saveDC);", breaks: "O" },
  { name: "a zero casting DC part is kept", file: CO, from: "    if (dc) out.castingDC.push({ label, value: dc });", to: "    out.castingDC.push({ label, value: dc });", breaks: "O" },
  { name: "a failing apply stops the others", file: CO, from: "      console.error(`TRG Prime | cast option \"${key}\": apply failed`, err);", to: "      throw err;", breaks: "O" },
  { name: "the casting DC ignores the module's parts", file: CDC, from: "    dc += push(parts, String(part?.label ?? \"\").trim() || \"Module\", int(part?.value));", to: "    push(parts, String(part?.label ?? \"\").trim() || \"Module\", int(part?.value));", breaks: "O" },
  { name: "THE GAP: the true name's +4 never reaches the Save DC", file: CAST, from: "  if (castOptionsApplied.saveDC) warpMods.saveDC = (Number(warpMods.saveDC) || 0) + castOptionsApplied.saveDC;", to: "", breaks: "O" },
  { name: "Spell Trickery's +2 never reaches the casting DC", file: CAST, from: "    moduleParts: castOptionsApplied.castingDC,\n", to: "    moduleParts: [],\n", breaks: "O" },
  { name: "an item cast is offered options", file: CAST, from: "  const castOptionOffers = (isItemCast || isInnate || noCheckCantrip || ritualFailed) ? [] : await offeredCastOptions(castOptionContext);", to: "  const castOptionOffers = await offeredCastOptions(castOptionContext);", breaks: "O" },
  { name: "the settled hook forgets the saves", file: CAST, from: "    saveResults: (spellSave?.results ?? []).map((r) => ({ target: r.target, degree: r.degree, saved: Boolean(r.saved) })),\n", to: "", breaks: "O" },
  { name: "the ticks never come back", file: CAST, from: "    castOptions: takenCastOptions(castOptions, form)\n", to: "    castOptions: []\n", breaks: "O" },
  // H
  { name: "a short purse is debited anyway", file: APW, from: "        if (out.success) await actor.update({ \"system.currency\": out.purse });", to: "        await actor.update({ \"system.currency\": out.purse });", breaks: "H" },
  { name: "the rarity raise is forgotten", file: APW, from: "        return learnSpellCost(spell?.system?.ppCost).dc + rarityDCIncrease(spell?.system ?? {});", to: "        return learnSpellCost(spell?.system?.ppCost).dc;", breaks: "H" },
  { name: "the API does not offer cast options", file: APW, from: "    registerCastOption: (key, spec, moduleId) => registerCastOption(key, spec, moduleId),", to: "", breaks: "H" },
  { name: "THE GAP: vital sacrifice's damage is reduced by DR and resistance", file: m("magic", "area-save-workflow.mjs"), from: "    const packet = ignoreDefences ? { taken: dealt, immune: false } : resolveAgainstDefences(target.system ?? {}, {", to: "    const packet = resolveAgainstDefences(target.system ?? {}, {", breaks: "H" },
  { name: "the bypass ignores the save", file: m("magic", "area-save-workflow.mjs"), from: "    const packet = ignoreDefences ? { taken: dealt, immune: false }", to: "    const packet = ignoreDefences ? { taken: base, immune: false }", breaks: "H" },
  // Z
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.686.2\"", to: "\"version\": \"3.678.0\"", breaks: "Z" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block2b-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block2b-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block2b-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block2b-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
