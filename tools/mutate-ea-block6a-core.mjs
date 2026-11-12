#!/usr/bin/env node
/** mutate-ea-block6a-core — the mutation half of verify-ea-block6a-core. NEW at 3.684.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const MM = m("magic", "module-metamagic.mjs"), MMW = m("magic", "module-metamagic-workflow.mjs"), CW = m("magic", "cast-workflow.mjs"),
  CAST = m("magic", "casting.mjs"), CDC = m("magic", "casting-dc.mjs"), CLM = m("magic", "caster-level-mods.mjs"), SD = m("magic", "spell-degrees.mjs"),
  RP = m("rod-powers.mjs"), API = m("module-api.mjs"), APIW = m("module-api-workflow.mjs"), CPP = m("magic", "cast-pp.mjs");
const MUTATIONS = [
  { name: "a metamagic's after() is not told the Save DC", file: CW, from: "      saveDC: nominalSaveDC ?? null, innateSaveDC: isInnate ? innateSaveDCBase : null,\n", to: "", breaks: "M21d" },
  // Review fixes (3.684.0)
  { name: "REVIEW FIX REVERTED (G1): a preset option finds no feat", file: MMW, from: "    const owner = opened ?? (spec.preset ? metamagicOpenedBy(spec, { featNames, granted: [], rods: [] }) : null);", to: "    const owner = opened;", breaks: "M21b/M21c" },
  { name: "a preset's feat name is not reported", file: MMW, from: "      feat: owner?.feat ?? \"\", source: opened?.source ?? \"\",", to: "      feat: opened?.feat ?? \"\", source: opened?.source ?? \"\",", breaks: "M21b" },
  { name: "REVIEW FIX REVERTED (Q130): the ceiling counts only the pool-paid PP", file: MM, from: "  const taken = (agg?.taken ?? []).reduce((sum, t) => sum + whole(t?.pp), 0);", to: "  const taken = whole(agg?.ppSpent);", breaks: "X1" },
  { name: "the cast's ceiling ignores the helper", file: CW, from: "metamagicPP: itemCeilingMetamagicPP(mmx), ceiling: itemMetamagicCeiling", to: "metamagicPP: mmx.ppSpent + mmx.basePPAdd, ceiling: itemMetamagicCeiling", breaks: "X1b" },
  { name: "the G3 payments taken are not named", file: MM, from: "    if (n === 1) out.paymentKeys.push(payment.key);", to: "", breaks: "A4b" },
  { name: "the settled hook drops metamagicPayments", file: CW, from: "    // THE G3 PAYMENTS TAKEN (3.684.0, review), as on trgPrimeSpellCast.\n    metamagicPayments: [...mmAP.paymentKeys],\n", to: "", breaks: "A4c" },
  { name: "the cast-option ctx is not told the PP sources", file: CW, from: "    ppSources: ppSources.draws.map((d) => ({ key: d.key, label: d.label, drawn: Number(d.drawn ?? 0) }))\n  };", to: "  };", breaks: "X2" },
  // M — G1, the spec and its scope
  { name: "a core id may be a module key", file: MM, from: "  if (CORE_IDS_LOWER.has(k)) return { problem:", to: "  if (false) return { problem:", breaks: "M1/M2" },
  { name: "a negative cost is accepted (Q93: a discount is not a cheaper cast)", file: MM, from: "&& !(Number(spec.ppCost) >= 0)) {", to: "&& false) {", breaks: "M1" },
  { name: "THE RULING (Q94): a scroll's or potion's spell takes metamagic", file: MM, from: "    : { allowed: false, kind: \"\", reason: \"an item's spell takes no metamagic (Q94)\" };", to: "    : { allowed: true, kind: \"item\", reason: \"\" };", breaks: "M3" },
  { name: "a cantrip takes metamagic", file: MM, from: "  if (cantrip || innateCantrip) return", to: "  if (false) return", breaks: "M3" },
  { name: "a threaded spell takes metamagic of its own", file: MM, from: "  if (thread) return { allowed: false", to: "  if (false) return { allowed: false", breaks: "M3" },
  { name: "a spec's innate scope is ignored", file: MM, from: "  if (kind === \"innate\") return spec?.scope?.innate !== false;", to: "  if (kind === \"innate\") return true;", breaks: "M4" },
  { name: "an effect's grant opens nothing", file: MM, from: "  if ((granted ?? []).map((g) => text(g).toLowerCase()).includes(spec?.key)) return { source: \"grant\" };", to: "", breaks: "M5" },
  { name: "a disabled effect grants", file: MM, from: "    if (!effect || effect.disabled) continue;\n    const raw = effect.flags?.[\"trg-prime\"]?.grantedMetamagic;", to: "    if (!effect) continue;\n    const raw = effect.flags?.[\"trg-prime\"]?.grantedMetamagic;", breaks: "M5b" },
  { name: "a module rod's kind is read case-sensitively", file: RP, from: "    const kind = String(mm?.kind ?? \"\").trim().toLowerCase();\n    if (!kind || [\"extend\", \"quicken\"]", to: "    const kind = String(mm?.kind ?? \"\").trim();\n    if (!kind || [\"extend\", \"quicken\"]", breaks: "M5c" },
  // M — the dialog and the form (S-M4)
  { name: "a preset is ignored", file: MM, from: "    if (preset) {\n      taken.push(", to: "    if (false) {\n      taken.push(", breaks: "M6" },
  { name: "a hidden option is taken from the form", file: MM, from: "    if (o.hidden || o.preset) continue;", to: "    if (o.preset) continue;", breaks: "M6" },
  { name: "the chooser shows an unowned option", file: MM, from: "const shown = (offers ?? []).filter((o) => !o.hidden && !o.preset);", to: "const shown = (offers ?? []).filter((o) => !o.preset);", breaks: "M7" },
  // M — the totals
  { name: "a resource payment is charged as PP", file: MM, from: "  } else if (pay.kind === \"resource\") {", to: "  } else if (false) {", breaks: "M8" },
  { name: "an AP payment's PP are not counted by the DC", file: MM, from: "    if (pay.dcAsIfPP) agg.dcPP += pp;", to: "", breaks: "M8" },
  { name: "Quicken twice (Unfettered Mastery stacks with Quicken Spell)", file: MM, from: "    if (!coreQuickened && !agg.quicken) agg.apDelta -= 1;", to: "    agg.apDelta -= 1;", breaks: "M8b" },
  { name: "advantage and disadvantage do not cancel", file: MM, from: "  if (adv && dis) return \"normal\";\n  if (adv) return \"advantage\";", to: "  if (adv) return \"advantage\";", breaks: "M8c" },
  { name: "a typed pool without dice is kept", file: MM, from: ".filter((d) => DICE_TERM.test(d.dice) && d.type),", to: ".filter((d) => d.type),", breaks: "M9" },
  // M — the effects
  { name: "typed Save DC rows of one type add", file: MM, from: "    if (!prior || value > prior.value) best.set(type, { value, label: r.label || \"metamagic\" });", to: "    best.set(type, { value: (prior?.value ?? 0) + value, label: r.label || \"metamagic\" });", breaks: "M10" },
  { name: "×1.5 range is never written", file: MM, from: "    if (to) { warpMods.rangeOverride = to;", to: "    if (to) {", breaks: "M10" },
  { name: "a fraction of a minute is not carried down to rounds", file: MM, from: "  while (!Number.isInteger(value) && DOWN[unit]) { value *= DOWN[unit][1]; unit = DOWN[unit][0]; }", to: "", breaks: "M10/M10b" },
  { name: "duration changes stack", file: MM, from: "const to = warpMods.durationText ? null : scaledDurationText(", to: "const to = scaledDurationText(", breaks: "M10d" },
  { name: "×1.5 area never grows", file: MM, from: "    if (grow) { warpMods.areaGrowth =", to: "    if (false) { warpMods.areaGrowth =", breaks: "M10" },
  { name: "the die step never reaches the row", file: MM, from: "    warpMods.dieStep = (Number(warpMods.dieStep) || 0) + agg.dieStep;", to: "", breaks: "M10" },
  { name: "Harmony's recipient is dropped", file: MM, from: "  if (agg.share.length) warpMods.selfRowAlso =", to: "  if (false) warpMods.selfRowAlso =", breaks: "M10" },
  { name: "the row's own dice are not stepped", file: CLM, from: "const text = steppedDiceFormula(String(formula ?? \"\"), Number(warpMods?.dieStep) || 0);", to: "const text = String(formula ?? \"\");", breaks: "M11" },
  { name: "a d12 steps off the ladder", file: CLM, from: "DIE_LADDER[Math.max(0, Math.min(DIE_LADDER.length - 1, i + n))]", to: "(DIE_LADDER[i + n] ?? 20)", breaks: "M11" },
  { name: "Spellthread's saving step is ignored", file: CAST, from: "  if (step && (degree === \"critical\" || degree === \"heroic\")) {", to: "  if (false) {", breaks: "M12" },
  { name: "a self-only spell reaches no added recipient", file: SD, from: "  if (added.length && !warpMods?.shareSelfRows) return caster ? [caster, ...added] : added;", to: "", breaks: "M13" },
  { name: "a token's uuid is not resolved to its actor", file: SD, from: "    return doc?.actor ?? doc ?? null;", to: "    return doc ?? null;", breaks: "M13b" },
  // M — Q96, Q130, the catalogue
  { name: "THE RULING (Q96): a Partial spends the Focus use", file: MM, from: "[\"heroic\", \"critical\", \"success\", \"failure\", \"fumble\", \"blunder\"].includes(text(degree).toLowerCase());", to: "true;", breaks: "M15/M19b" },
  { name: "a refunded cast spends the Focus use", file: MM, from: "  if (refunded) return false;", to: "", breaks: "M15" },
  { name: "THE RULING (Q130): no ceiling on an item cast", file: MM, from: "const cap = whole(ceiling) || release * 2;", to: "const cap = whole(ceiling) || Infinity;", breaks: "M16" },
  { name: "the catalogue lists a preset-only entry", file: MM, from: "    if (spec.preset) continue;\n    const opened = metamagicOpenedBy(spec, { ...owned, rods: [] });", to: "    const opened = metamagicOpenedBy(spec, { ...owned, rods: [] });", breaks: "M17" },
  // M — the workflow half
  { name: "a Focus option is offered with no use left", file: MMW, from: "      if (Number.isFinite(left) && left <= 0) continue;", to: "", breaks: "M18" },
  { name: "a spec's applies() is not asked", file: MMW, from: "    if (spec.applies && !(await guarded(`metamagic \"${spec.key}\" applies()`, () => spec.applies(ctx), false))) continue;", to: "", breaks: "M18b" },
  { name: "two options of one group are both taken", file: MMW, from: "    if (groups.has(offer.group)) {", to: "    if (false) {", breaks: "M20" },
  { name: "a resource the caster lacks is not refused", file: MMW, from: "      if (!(available >= amount)) {", to: "      if (false) {", breaks: "M20b" },
  { name: "the settle spends on every degree", file: MMW, from: "  if (metamagicPaidOn(facts.degree, { refunded: facts.refunded, innate: facts.innate })) {", to: "  if (true) {", breaks: "M19b" },
  { name: "`after` is never run", file: MMW, from: "  for (const a of agg.after ?? []) {", to: "  for (const a of []) {", breaks: "M21" },
  // M — the cast
  { name: "THE RULING (Q94): any truthy itemMetamagic opens an item cast", file: CW, from: "const itemTakesMetamagic = isItemCast && itemMetamagic === true && ", to: "const itemTakesMetamagic = isItemCast && Boolean(itemMetamagic) && ", breaks: "M22" },
  { name: "THE GAP: the dialog opens only for the warp chooser", file: CW, from: "  if (warpChooserOpen || mmxShown) {", to: "  if (warpChooserOpen) {", breaks: "M23" },
  { name: "THE RULING (Q95): a module option's PP are not paid", file: CW, from: "  const metamagicPP = mmx.ppSpent + (componentSwap", to: "  const metamagicPP = (componentSwap", breaks: "M24" },
  { name: "Spellthread's woven PP are not in the total", file: CW, from: "basePP + mmx.basePPAdd + warpPP + metamagicPP + mm.ppDelta - signatureDiscount", to: "basePP + warpPP + metamagicPP + mm.ppDelta - signatureDiscount", breaks: "M24" },
  { name: "Focused Spell's advantage never reaches the check", file: CW, from: "    castContext.bias = joinedBias(castContext.bias, mmx.checkBias) || \"normal\";", to: "    void joinedBias;", breaks: "M25" },
  { name: "Echo's second creature never saves", file: CW, from: "      extraTargets: mmxExtraTargets,", to: "      extraTargets: [],", breaks: "M26" },
  { name: "the added pool never lands on an attack", file: CW, from: "  await applyMetamagicAddedDamage(actor, spell, targetActor, warpMods, { taken: packet.taken, scale: damageFactor, rolls, lines });", to: "", breaks: "M27" },
  { name: "the cast hook does not say the metamagic's PP", file: CW, from: "metamagicPP,\n    // THE G3 PAYMENTS TAKEN (3.684.0, review): the registry keys of each", to: "metamagicPP: 0,\n    // THE G3 PAYMENTS TAKEN (3.684.0, review): the registry keys of each", breaks: "M28" }, // re-anchored at 3.684.0 (metamagicPayments sits between)
  { name: "THE RULING (Q130): the item's ceiling is not the one handed in", file: CW, from: "metamagicPP: itemCeilingMetamagicPP(mmx), ceiling: itemMetamagicCeiling", to: "metamagicPP: itemCeilingMetamagicPP(mmx), ceiling: 0", breaks: "M32" }, // re-anchored at 3.684.0 (review)
  { name: "a threaded spell pays for itself as well", file: CW, from: "const ppSpent = (isCantrip || spellAdderUsed || threaded)", to: "const ppSpent = (isCantrip || spellAdderUsed)", breaks: "M30" },
  { name: "the PP sources are never settled", file: CW, from: "await mmxWorkflow.settleModuleMetamagic(actor, mmx, ppSources.draws, {", to: "await mmxWorkflow.settleModuleMetamagic(actor, mmx, [], {", breaks: "M31" },
  { name: "helpers.metamagicCatalogue is not offered", file: APIW, from: "      metamagicCatalogue: async (actor, options = {}) =>", to: "      metamagicCatalogueX: async (actor, options = {}) =>", breaks: "M33" },
  // P — G2
  { name: "a source pays all it drew, whatever the degree spends", file: MM, from: "    const share = Math.min(left, whole(d));", to: "    const share = whole(d);", breaks: "P1" },
  { name: "a source with no offer() is registered", file: API, from: "typeof spec?.offer !== \"function\" || (spec.settle !== undefined && typeof spec.settle !== \"function\")) {", to: "false) {", breaks: "P2" },
  { name: "a refunded cast settles what was drawn", file: MMW, from: "{ drawn: d.drawn, paid: facts.refunded ? 0 : whole(d.paid) }", to: "{ drawn: d.drawn, paid: whole(d.paid) }", breaks: "P4" },
  { name: "the availability test ignores what a source draws", file: CW, from: "> ppPool + rodDraw + ppSources.total) {", to: "> ppPool + rodDraw) {", breaks: "P5" },
  { name: "the caster pays the source's share as well", file: CW, from: "  const casterPPSpent = ritualSubstitutes ? 0 : ppSpent - rodPaid - sourcesPaid;", to: "  const casterPPSpent = ritualSubstitutes ? 0 : ppSpent - rodPaid;", breaks: "P5" },
  // A — G3
  { name: "Metamagic Adept pays any number of options", file: MM, from: "    if (n > Math.max(1, whole(payment.max) || 1)) {", to: "    if (false) {", breaks: "A2" },
  { name: "THE GAP: the DC forgets the PP paid in AP", file: MM, from: "    if (payment.dcAsIfPP !== false) out.dcPP += pp;", to: "", breaks: "A1/A3" },
  { name: "the DC-only PP are not read", file: CDC, from: "  if (!isCantrip && asIfPaid) dc += push(", to: "  if (false) dc += push(", breaks: "A5/A6" },
  { name: "a payment with no options is registered", file: API, from: "if (!k || !options.length || (spec.applies", to: "if (!k || (spec.applies", breaks: "A7" },
  { name: "a payment's applies() is not asked", file: MMW, from: "    if (p.applies && !(await guarded(", to: "    if (false && !(await guarded(", breaks: "A8" },
  { name: "the core's PP are paid as well as the AP", file: CW, from: "  if (mmAP.corePP) mm.ppSpent = Math.max(0, mm.ppSpent - mmAP.corePP);", to: "", breaks: "A9" },
  { name: "the cast's DC is not told the DC-only PP", file: CW, from: "    dcOnlyPP: mmx.dcPP,", to: "    dcOnlyPP: 0,", breaks: "A9" },
  // D — G4
  { name: "a discount ignores its floor", file: MM, from: "    const next = Math.max(d.floor, payable - d.pp);", to: "    const next = Math.max(0, payable - d.pp);", breaks: "D1" },
  { name: "the discount that may reach 0 is taken first", file: MM, from: ".sort((a, b) => b.floor - a.floor);", to: ".sort((a, b) => a.floor - b.floor);", breaks: "D1" },
  { name: "a discount comes off the base first (a Critical halves it)", file: MM, from: "  const offWarp = Math.min(warp, r);", to: "  const offWarp = 0;", breaks: "D2" },
  { name: "a cost modifier need not be a function", file: API, from: "if (!k || typeof modify !== \"function\") { problem(`registerCastCostModifier", to: "if (!k) { problem(`registerCastCostModifier", breaks: "D3" },
  { name: "a registered cost modifier's discount is dropped", file: MMW, from: "    if (delta < 0) discounts.push(", to: "    if (false) discounts.push(", breaks: "D4" },
  // RE-ANCHORED AT 3.684.1: the payment's reduction is `paidReduction` (G4's and the Chapter 5 feats').
  { name: "THE RULING (Q93) undone: nothing paid is discounted", file: CW, from: "  const paidOutcome = paidReduction > 0", to: "  const paidOutcome = false", breaks: "D5" },
  { name: "THE RULING (Q93) undone: the cap reads the discounted price", file: CW, from: "  if (!isInnate && totalPP > castCap) {", to: "  if (!isInnate && payablePP > castCap) {", breaks: "D5" },
  { name: "the core's own test is never asked", file: CW, from: "const mmxPaysOtherwise = threaded || costCut.reduction > 0 || ppSources.total > 0;", to: "const mmxPaysOtherwise = true;", breaks: "D6" },
  // D — 3.684.1, Economic Spell and Signature Spell reduce what is paid (Graham, 4 November 2026)
  { name: "THE DEFECT RESTORED: Economic and Signature do not reach the payment", file: CW, from: "  const paidReduction = coreCostCut + costCut.reduction;", to: "  const paidReduction = costCut.reduction;", breaks: "D5/D10" },
  { name: "the cut is read off the floored total wrongly (a negative cut)", file: MM, from: "  const cut = Math.max(0, whole(partsPP) - whole(totalPP));", to: "  const cut = whole(partsPP) - whole(totalPP);", breaks: "D7" },
  { name: "Signature's PP labelled as Economic's", file: MM, from: "  const signature = Math.min(whole(signaturePP), cut);", to: "  const signature = 0;", breaks: "D7" },
  { name: "the cast's cut ignores the parts", file: CW, from: "chapter5CostCut(basePP + mmx.basePPAdd + warpPP + metamagicPP, totalPP, signatureDiscount);", to: "chapter5CostCut(totalPP, totalPP, signatureDiscount);", breaks: "D10" },
  { name: "the card does not say the cut", file: CW, from: "  if (coreCostLabels.length) mmx.notes.push(`Cost: ", to: "  if (false) mmx.notes.push(`Cost: ", breaks: "D10" },
  // E — 3.684.3, Economic's Casting DC a net +2 per PP lowered (Graham, 5 November 2026)
  { name: "THE DEFECT RESTORED: the Casting DC reads the lowered PP", file: CDC, from: "  if (lowered) dc += push(parts, `Economic Spell, the DC of", to: "  if (false) dc += push(parts, `Economic Spell, the DC of", breaks: "E1/E1b/E2" },
  { name: "Metamagic Adept's as-if PP sit on the lowered PP", file: CDC, from: "castingDC(unlowered + asIfPaid) - castingDC(unlowered));", to: "castingDC(pp + asIfPaid) - castingDC(pp));", breaks: "E1" },
  { name: "a cantrip's DC is moved by Economic", file: CDC, from: "  const lowered = isCantrip ? 0 : Math.max(0, int(economicPP));", to: "  const lowered = Math.max(0, int(economicPP));", breaks: "E1" },
  { name: "the cast does not hand the DC Economic's PP", file: CW, from: "    economicPP: economicLowered,\n", to: "", breaks: "E2b" },
  { name: "Signature's PP are restored to the DC too", file: CW, from: "  const economicLowered = Math.max(0, coreCostCut - signatureDiscount);", to: "  const economicLowered = coreCostCut;", breaks: "E2b" },
  // R — 3.684.3, a ritual variant's price lowered by Economic and Signature (Graham, 5 November 2026)
  { name: "THE OLD DEFAULT RESTORED: a ritual variant's price is not lowered", file: CW, from: "    : ritualSubstitutes ? paidOutcome.ppSpent + variableSuccessPP\n", to: "    : ritualSubstitutes ? outcome.ppSpent + variableSuccessPP\n", breaks: "R1b" },
  // M — 3.684.1, `castPP` in apply(ctx) (Graham, 4 November 2026, Wellspring Conduit)
  { name: "castPP leaves out the metamagic", file: CPP, from: "whole(basePP) + whole(warpPP) + whole(metamagicPP) - whole(economicPP)", to: "whole(basePP) + whole(warpPP) - whole(economicPP)", breaks: "M20" },
  { name: "castPP ignores Economic Spell", file: CPP, from: " - whole(economicPP) - whole(signaturePP));", to: " - whole(signaturePP));", breaks: "M20" },
  { name: "castPP reads an innate's 0 base, not its printed PP", file: CPP, from: "  return castRiderPP({ cantrip, innate, itemCast, spellPP, itemPP, warpPP, metamagicPP, totalPP: asCast });", to: "  return cantrip ? 0 : asCast;", breaks: "M20" },
  { name: "a rod-paid option's PP counts", file: MM, from: "    return offer && offer.source !== \"rod\" ? sum + takenPP(offer, t) : sum;", to: "    return offer ? sum + takenPP(offer, t) : sum;", breaks: "M21" },
  { name: "apply(ctx) is not handed castPP", file: CW, from: "    ...mmxBase,\n    castPP: applyCastPP,", to: "    ...mmxBase,", breaks: "M23" },
  { name: "castPP counts the core's PP after G3 moved some to AP", file: CW, from: "  const applyMetamagicPP = mm.ppSpent + moduleTakenPP(mmxOffers, mmxTaken);", to: "  const applyMetamagicPP = mm.ppSpent - mmAP.corePP + moduleTakenPP(mmxOffers, mmxTaken);", breaks: "M23" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block6a-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block6a-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block6a-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block6a-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
