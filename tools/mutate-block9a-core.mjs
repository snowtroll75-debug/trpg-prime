#!/usr/bin/env node
/** mutate-block9a-core — the mutation half of verify-block9a-core. NEW at 3.688.0 (H19, H20). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CI = m("magic", "cast-items.mjs"), CIW = m("magic", "cast-items-workflow.mjs"), CW = m("magic", "cast-workflow.mjs"),
  API = m("module-api.mjs"), APW = m("module-api-workflow.mjs"), IQ = m("item-quality.mjs"), RD = m("rune-damage.mjs"),
  RDE = m("rune-declarations.mjs"), SHEET = m("sheets", "item-sheet.mjs"), OIL = m("oil-workflow.mjs"),
  SJ = path.join(SYSTEM_ROOT, "system.json"), PJ = path.join(SYSTEM_ROOT, "package.json"),
  RR = m("magic", "ritual-rules.mjs"), HBS = path.join(SYSTEM_ROOT, "templates", "item", "item-sheet.hbs");
const MUTATIONS = [
  // H19 — the API
  { name: "H19 a kind with no label registers", file: API, from: "  if (!k || !String(spec?.label ?? \"\").trim() || typeof spec?.offers !== \"function\"", to: "  if (!k || typeof spec?.offers !== \"function\"", breaks: "H19 register" },
  { name: "H19 settle may be anything", file: API, from: "    || (spec.settle !== undefined && typeof spec.settle !== \"function\")) {", to: "    ) {", breaks: "H19 register settle" },
  { name: "H19 the API does not offer it", file: APW, from: "    registerCastItemOption: (key, spec, moduleId) => registerCastItemOption(key, spec, moduleId),\n", to: "", breaks: "H19 API" },
  // H19 — the rules
  { name: "H19 an offer need not name a held item", file: CI, from: "    if (!item) continue;\n    const consume", to: "    const consume", breaks: "H19 offers" },
  { name: "H19 a spent item with none left is offered", file: CI, from: "    if (consume && Number(item.system?.quantity ?? 1) <= 0) continue;\n", to: "", breaks: "H19 offers" },
  { name: "H19 an embedded use needs a quantity too", file: CI, from: "  const consume = o?.consume !== false;", to: "  const consume = true;", breaks: "H19 offers" },
  { name: "H19 the same item twice", file: CI, from: "    if (!itemId || seen.has(seenKey)) continue;", to: "    if (!itemId) continue;", breaks: "H19 offers" }, // RE-ANCHORED AT 3.689.0 (H21: an offer is keyed by item and slot)
  { name: "H19 an item's answer keeps every key", file: CI, from: "  for (const k of CAST_ITEM_ANSWER_KEYS) if (a[k] !== undefined) kept[k] = a[k];", to: "  Object.assign(kept, a);", breaks: "H19 answer" },
  { name: "H19 a check modifier is untyped", file: CI, from: "type: text(m?.type).toLowerCase() || \"item\" }))", to: "type: text(m?.type).toLowerCase() || \"untyped\" }))", breaks: "H19 answer" },
  { name: "H19 a zero check modifier is kept", file: CI, from: "    .filter((m) => m.value);\n  base.attack", to: "    ;\n  base.attack", breaks: "H19 answer" },
  { name: "H19 the ignored resistance is not read", file: CI, from: "  base.ignoreResistance = (Array.isArray(a.ignoreResistance) ? a.ignoreResistance : a.ignoreResistance ? [a.ignoreResistance] : [])", to: "  base.ignoreResistance = (Array.isArray(a.ignoreResistance) ? a.ignoreResistance : [])", breaks: "H19 answer" },
  { name: "H19 a choice not offered is taken", file: CI, from: "    if (offer) out.push({ key: kind.key, label: kind.label, offer });", to: "    out.push({ key: kind.key, label: kind.label, offer: offer ?? { itemId: id } });", breaks: "H19 form" },
  { name: "H19 None is not the default", file: CI, from: "`<option value=\"\" selected>None</option>`", to: "`<option value=\"\">None</option>`", breaks: "H19 prompt" },
  { name: "H19 settle's keep is ignored", file: CI, from: "  return offer?.consume === false || answer?.keep === true;", to: "  return offer?.consume === false;", breaks: "H19 kept" },
  { name: "H19 an embedded use is spent", file: CI, from: "  return offer?.consume === false || answer?.keep === true;", to: "  return answer?.keep === true;", breaks: "H19 kept" },
  { name: "H19 the last one is kept at 0", file: CI, from: "  return q <= 1 ? null : q - 1;", to: "  return q < 1 ? null : q - 1;", breaks: "H19 spent" },
  // H19 — the live half
  { name: "H19 a prompt with no offers", file: CIW, from: "  if (!kinds.length) return out;\n", to: "", breaks: "H19 no prompt" },
  { name: "H19 a closed prompt casts anyway", file: CIW, from: "  if (form === null || form === undefined) return null;", to: "  if (form === null || form === undefined) return out;", breaks: "H19 closed" },
  { name: "H19 a cancelling answer is ignored", file: CIW, from: "    if (answer.cancel) {", to: "    if (false) {", breaks: "H19 cancel" },
  { name: "H19 apply is not told the item", file: CIW, from: "answer = cleanCastItemAnswer(await kind.spec.apply({ ...ctx, actor, item, offer: pick.offer }));", to: "answer = cleanCastItemAnswer(await kind.spec.apply({ ...ctx, actor, offer: pick.offer }));", breaks: "H19 apply" },
  { name: "H19 the answer is not folded", file: CIW, from: "    foldModuleMetamagic(out.agg, { key: `item:${pick.key}`, label, source: \"item\", spec: { payment: { kind: \"pp\" } } }, { times: 1 }, answer);\n", to: "", breaks: "H19 fold" },
  { name: "H19 the check modifiers are dropped", file: CIW, from: "    out.checkModifiers.push(...answer.checkModifiers.map((m) => ({ ...m, label: m.label || label })));\n", to: "", breaks: "H19 check modifier" },
  { name: "H19 the attack is dropped", file: CIW, from: "    if (answer.attack) out.attackRows.push({ label, value: answer.attack, type: answer.attackType });\n", to: "", breaks: "H19 attack" },
  { name: "H19 the item is reported as metamagic", file: CIW, from: "  out.agg.taken = [];\n  out.agg.keys = [];\n", to: "", breaks: "H19 no metamagic" },
  { name: "H19 the card does not say which", file: CIW, from: "  out.lines.push(...out.chosen.map((c) => `<strong>${esc(c.kindLabel)}:</strong> ${esc(c.offer.label)}.`), ...out.agg.lines);", to: "  out.lines.push(...out.agg.lines);", breaks: "H19 card" },
  { name: "H19 settle is not asked", file: CIW, from: "      answer = (await c.spec.settle?.({ ...facts, actor, item: actor?.items?.get?.(c.itemId) ?? null, offer: c.offer })) ?? {};", to: "      answer = {};", breaks: "H19 settle" },
  { name: "H19 nothing is spent", file: CIW, from: "        if (next === null) await item.delete();\n        else await item.update({ \"system.quantity\": next });\n", to: "", breaks: "H19 spend" },
  { name: "H19 the last one is reduced to 0, not deleted", file: CIW, from: "        if (next === null) await item.delete();", to: "        if (next === null) await item.update({ \"system.quantity\": 0 });", breaks: "H19 spend" },
  // H19 — the wiring
  { name: "H19 offered to an item's cast", file: CW, from: "const castItemsOffered = !(isItemCast || isInnate ||", to: "const castItemsOffered = !(isInnate ||", breaks: "H19 gate" },
  { name: "H19 offered to a ritual", file: CW, from: "isInnate || ritual || stored ||", to: "isInnate || stored ||", breaks: "H19 gate" },
  { name: "H19 offered to a non-attack cantrip", file: CW, from: " || threaded || strikeCheck || (isCantrip && !isAttack));", to: " || threaded || strikeCheck);", breaks: "H19 gate" },
  { name: "H19 a closed prompt does not return", file: CW, from: "  if (castItems === null) return null;\n", to: "", breaks: "H19 closed" },
  { name: "H19 not folded into the warp", file: CW, from: "    castItems.lines.push(...foldModuleMetamagicMods(warpMods, castItems.agg, { duration: spellData.duration, range: effRange, area: effArea }).lines);\n", to: "", breaks: "H19 fold" },
  { name: "H19 its bias is not joined", file: CW, from: "    if (castItems.agg.checkBias) mmx.checkBias = joinItemBias(mmx.checkBias, castItems.agg.checkBias) || mmx.checkBias;\n", to: "", breaks: "H19 bias" },
  { name: "H19 its discount is not taken", file: CW, from: "    if (castItems.agg.discounts.length) mmx.discounts = [...(mmx.discounts ?? []), ...castItems.agg.discounts];\n", to: "", breaks: "H19 discount" },
  { name: "H19 its traits are not added", file: CW, from: "    if (castItems.agg.addTraits.length) castContext.traits = withItemTraits(castContext.traits, castItems.agg.addTraits);\n", to: "", breaks: "H19 traits" },
  { name: "H19 its check modifiers are not on the check", file: CW, from: "  for (const mod of castItems.checkModifiers) situational.push({ label: mod.label, value: mod.value, type: mod.type });\n", to: "", breaks: "H19 check modifiers" },
  { name: "H19 its resistance bypass is not set", file: CW, from: "      setResistanceBypass([...new Set([...(boost?.ignoreResistance ? boost.types : []), ...castItems.ignoreResistance])]);", to: "", breaks: "H19 bypass" },
  { name: "H19 its lines are not on the card", file: CW, from: "  const lines = [...castItems.lines.map((text) => line(text)), ...reagentLines,", to: "  const lines = [...reagentLines,", breaks: "H19 card" },
  { name: "H19 it is never settled", file: CW, from: "  const castItemsSettled = castItems.chosen.length\n    ? await settleCastItems(", to: "  const castItemsSettled = false\n    ? await settleCastItems(", breaks: "H19 settled" },
  { name: "H19 the hook does not report them", file: CW, from: "    castItems: castItemsSettled.report,\n", to: "", breaks: "H19 hook" },
  // H20
  { name: "H20 a material with no label registers", file: API, from: "  if (!k || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(k) || !String(spec?.label ?? \"\").trim()) {", to: "  if (!k || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(k)) {", breaks: "H20 register" },
  { name: "H20 a key with a space registers", file: API, from: "  if (!k || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(k) || !String(spec?.label ?? \"\").trim()) {", to: "  if (!k || !String(spec?.label ?? \"\").trim()) {", breaks: "H20 register" },
  { name: "H20 the API does not offer it", file: APW, from: "    registerMaterial: (key, spec, moduleId) => registerMaterial(key, spec, moduleId),\n", to: "", breaks: "H20 API" },
  // (materialOf's core-first order is a second guard: since the review, registerMaterial refuses a core key, so no clash reaches it.)
  { name: "H20 a module's material is never found", file: IQ, from: "  return MATERIALS[k] ?? registeredMaterial(k);", to: "  return MATERIALS[k] ?? null;", breaks: "H20 materialOf" },
  { name: "H20 the pickers miss a module's", file: IQ, from: "  for (const { key, spec } of registeredMaterials()) if (!MATERIALS[key]) out.push([key, spec]);\n", to: "", breaks: "H20 pickers" },
  { name: "H20 the level ignores it", file: IQ, from: "  const materialDelta = material ? (materialOf(material)?.levelDelta ?? 0) : 0;", to: "  const materialDelta = material ? (MATERIALS[material]?.levelDelta ?? 0) : 0;", breaks: "H20 level" },
  { name: "H20 the armour modifiers ignore it", file: IQ, from: "export function computeArmourModifiers(quality, material, traitKeys = [], { category = \"\" } = {}) {\n  const tier = QUALITY_TIERS[quality] ?? QUALITY_TIERS.standard;\n  const mat = material ? materialOf(material) : null;", to: "export function computeArmourModifiers(quality, material, traitKeys = [], { category = \"\" } = {}) {\n  const tier = QUALITY_TIERS[quality] ?? QUALITY_TIERS.standard;\n  const mat = material ? MATERIALS[material] : null;", breaks: "H20 armour" },
  { name: "H20 what it overcomes is not read", file: IQ, from: "  const material = materialOf(key);\n  if (!material) return \"\";", to: "  const material = MATERIALS[key];\n  if (!material) return \"\";", breaks: "H20 overcomes" },
  { name: "H20 the sheet reads the core's table", file: SHEET, from: "context.materialLabel = material ? (materialOf(material)?.label ?? material) : \"None\";", to: "context.materialLabel = material ? (material) : \"None\";", breaks: "H20 sheet" },
  { name: "H20 its damage against a kind is not added", file: RD, from: "  if (!isAmmunition) out.push(...materialDamageFor(item, target));\n", to: "", breaks: "H20 damage" },
  { name: "H20 its damage reaches every creature", file: RD, from: "    const applies = Boolean(target) && words.some((w) => baneMatches(w, target));", to: "    const applies = Boolean(target);", breaks: "H20 damage vs" },
  { name: "H20 \"a die of base damage\" is a d6", file: RD, from: "      dice = `1d${faces}`;", to: "      dice = \"1d6\";", breaks: "H20 base die" },
  { name: "H20 it is a packet beside the strike", file: RD, from: "      addsToStrike: true, against, parameter: against, feedbackOf: null", to: "      addsToStrike: false, against, parameter: against, feedbackOf: null", breaks: "H20 adds" },
  { name: "H20 its declares are not read", file: RDE, from: "  if (declares && typeof declares === \"object\" && Object.keys(declares).length) {", to: "  if (false) {", breaks: "H20 declares" },
  { name: "H20 a material that declares nothing adds an entry", file: RDE, from: "  if (declares && typeof declares === \"object\" && Object.keys(declares).length) {", to: "  if (declares && typeof declares === \"object\") {", breaks: "H20 declares empty" },
  { name: "H20 declaresByType is ignored", file: RDE, from: "const declares = byType !== undefined ? byType : material?.declares;", to: "const declares = material?.declares;", breaks: "H20 by type" },
  { name: "H20 declaresByType ignores the item's type", file: RDE, from: "material.declaresByType[item?.type]", to: "Object.values(material.declaresByType)[0]", breaks: "H20 by type other" },
  // Z
  { name: "R a Strike's check is offered cast items", file: CW, from: "threaded || strikeCheck || (isCantrip && !isAttack));", to: "threaded || (isCantrip && !isAttack));", breaks: "H19 offered" },
  { name: "R a refunded cast spends its items", file: CIW, from: "  if (facts.refunded) {", to: "  if (false) {", breaks: "H19 refunded" },
  { name: "R the refund is not told", file: CW, from: "      spell, spellData, degree, cast: Boolean(outcome.cast), refunded: Boolean(castRefunded), check,", to: "      spell, spellData, degree, cast: Boolean(outcome.cast), check,", breaks: "H19 refund told" },
  { name: "R1 a ritual's cast asks again", file: CW, from: "  const castItems = ritual?.castItems\n    ? ritual.castItems\n    : castItemsOffered", to: "  const castItems = castItemsOffered", breaks: "R1" },
  { name: "R2 a ritual asks nothing", file: CW, from: "  const ritualCastItems = await askCastItems(actor, {", to: "  const ritualCastItems = { chosen: [], checkModifiers: [], lines: [], agg: { checkBias: \"\" } } ?? await askCastItems(actor, {", breaks: "R2" },
  { name: "R2 a closed prompt does not stop the ritual", file: CW, from: "  if (ritualCastItems === null) return null;\n", to: "", breaks: "R2" },
  { name: "R3 the rows miss the ritual check", file: CW, from: "  modifiers.push(...ritualCastItems.checkModifiers);\n", to: "", breaks: "R3" },
  { name: "R3 the bias misses the ritual check", file: CW, from: "    ...(ritualCastItems.agg.checkBias ? { bias: ritualCastItems.agg.checkBias } : {}),\n", to: "", breaks: "R3" },
  { name: "R3 the rows are read again by the cast", file: CW, from: "  ritualCastItems.checkModifiers = [];\n", to: "", breaks: "R3" },
  { name: "R3b the lines go on both cards", file: CW, from: "  ritualCastItems.lines = [];\n", to: "", breaks: "R3b" },
  { name: "R2 the variant is not told", file: CW, from: "variant: String(ritualPlan.variant ?? \"\"), durationUnaltered: Boolean(result.durationUnaltered)", to: "durationUnaltered: Boolean(result.durationUnaltered)", breaks: "R2" },
  { name: "R4 not handed to the cast", file: CW, from: ", castItems: ritualCastItems }", to: " }", breaks: "R4" },
  { name: "R4 a ritual that does not cast never settles them", file: CW, from: "  if (ritualCastItems.chosen.length && !ritualCastItems.settled) {", to: "  if (false) {", breaks: "R4" },
  { name: "R5 settled twice", file: CIW, from: "  if (!castItems || castItems.settled) return { lines, report };\n", to: "  if (!castItems) return { lines, report };\n", breaks: "R5" },
  { name: "R a core material key is accepted", file: API, from: "  if (coreMaterialKeys.has(k)) {", to: "  if (false) {", breaks: "H20 clash" },
  { name: "R the core never tells its keys", file: IQ, from: "setCoreMaterialKeys(Object.keys(MATERIALS));\n", to: "", breaks: "H20 clash told" },
  { name: "R the note is not read", file: SHEET, from: "context.materialNote = material ? String(materialOf(material)?.note ?? \"\").trim() : \"\";", to: "context.materialNote = \"\";", breaks: "H20 note" },
  { name: "R settled is not a ritual-rules function", file: API, from: "\"minSecondaries\", \"settled\"];", to: "\"minSecondaries\"];", breaks: "RITUAL fn" },
  { name: "R settleRitual skips the lines", file: RR, from: "      for (const t of Array.isArray(got?.lines) ? got.lines : []) if (String(t ?? \"\").trim()) lines.push(String(t));\n", to: "", breaks: "RITUAL lines" },
  { name: "R the ritual is not settled", file: CW, from: "  if (ritualSettledLines.length) await postCard(", to: "  if (false) await postCard(", breaks: "RITUAL card" },
  { name: "R the ritual's PP are the base", file: CW, from: "    pp: basePP + ppOver, basePP, ppOver, variant: ritualPlan.variant", to: "    pp: basePP, basePP, ppOver, variant: ritualPlan.variant", breaks: "RITUAL pp" },
  { name: "Z the version is not raised", file: SJ, from: "\"version\": \"3.710.0\"", to: "\"version\": \"3.687.1\"", breaks: "Z1" },
  { name: "Z the download names the last release", file: SJ, from: "releases/download/v3.710.0/trg-prime.zip", to: "releases/download/v3.687.1/trg-prime.zip", breaks: "Z1" },
  { name: "Z package.json is left behind", file: PJ, from: "\"version\": \"3.710.0\"", to: "\"version\": \"3.687.1\"", breaks: "Z2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block9a-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block9a-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-block9a-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block9a-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
