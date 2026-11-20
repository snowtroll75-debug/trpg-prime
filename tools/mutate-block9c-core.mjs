#!/usr/bin/env node
/** mutate-block9c-core — the mutation half of verify-block9c-core (3.690.0: H23 the Orb kind, H24 trait-scoped option rows and rod helpers, H25 one invested per trait, H26 held spells). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const API = M("module-api.mjs"), APW = M("module-api-workflow.mjs"), CIW = M("charged-items-workflow.mjs"), MIW = M("magic-items-workflow.mjs"),
  AW = M("combat", "action-workflow.mjs"), GSO = M("general-skill-options-workflow.mjs"), WE = M("wondrous-effects.mjs"), ACT = M("documents", "actor.mjs"),
  SA = M("magic", "spell-adder.mjs"), CW = M("magic", "cast-workflow.mjs"), CON = M("conditionals.mjs"), CO = M("magic", "cast-options.mjs"),
  TR = M("trait-rules.mjs"), HM = M("magic", "high-magic.mjs"), SS = M("magic", "spell-storing.mjs"), SSW = M("magic", "spell-storing-workflow.mjs"),
  SJ = path.join(SYSTEM_ROOT, "system.json"), PJ = path.join(SYSTEM_ROOT, "package.json");
const MUTATIONS = [
  // H23 — the kind
  { name: "a core kind may be registered over", file: API, from: "  if (!k || [\"staff\", \"rod\", \"wand\", \"scroll\", \"other\"].includes(k)) {", to: "  if (!k) {" },
  { name: "a kind never warps as a staff", file: API, from: "    warp: String(spec?.warp ?? \"\").trim().toLowerCase() === \"staff\" ? \"staff\" : \"none\",", to: "    warp: \"none\"," },
  { name: "every kind recharges naturally", file: API, from: "    naturalRecharge: spec?.naturalRecharge !== false,", to: "    naturalRecharge: true," },
  { name: "a kind's Recharge Item price is lost", file: API, from: "    rechargeItemPP: Number.isFinite(pp) && pp > 0 ? pp : null,", to: "    rechargeItemPP: null," },
  { name: "a kind is read by its exact case only", file: API, from: "  const k = String(kind ?? \"\").trim().toLowerCase();\n  return k ? registry.chargedKinds", to: "  const k = String(kind ?? \"\").trim();\n  return k ? registry.chargedKinds" },
  { name: "the kind's ladder not handed the spell's traits", file: CIW, from: "    raw = await spec.releaseOptions({ ...ctx, spellTraits: String(doc?.system?.traits ?? \"\") });", to: "    raw = await spec.releaseOptions({ ...ctx, spellTraits: \"\" });" },
  { name: "an option with no key kept", file: CIW, from: "    if (!key || !label) continue;\n    out.push({\n      key, label,\n      skill: String(option.skill", to: "    out.push({\n      key, label,\n      skill: String(option.skill" },
  { name: "a zero DC part kept", file: CIW, from: "        .filter((p) => p.value),\n      available: option.available === true,", to: "\n      available: option.available === true," },
  { name: "a throwing kind breaks the release", file: CIW, from: "    console.error(`TRG Prime | the \"${spec.key}\" kind's release ladder failed`, err);\n    return [];", to: "    throw err;" },
  { name: "the kind's ladder not used", file: CIW, from: "  const options = kindOptions.length ? kindOptions : [", to: "  const options = [" },
  { name: "the DC parts not on the DC", file: CIW, from: "    dc: castingDC(cost) + partsTotal,", to: "    dc: castingDC(cost)," },
  { name: "Cast from Item forgets the kind", file: CIW, from: "      chargedKind: charged.kind ?? \"\",\n      item,", to: "      item," },
  { name: "a staff-warping kind not warped", file: CIW, from: "    kind: kindSpec?.warp === \"staff\" ? \"staff\" : charged.kind,", to: "    kind: charged.kind," },
  { name: "a non-recharging kind recharges at daily preparation", file: CIW, from: "    if (kindSpec && !kindSpec.naturalRecharge) {", to: "    if (false) {" },
  { name: "the kind's depletion answer ignored", file: MIW, from: "    if (answer?.replaces === true) {", to: "    if (false) {" },
  { name: "the kind's depletion still breaks the item", file: MIW, from: "      return { roll: kept, row, replaced: true, ...(second ? { rolls: [roll.total, second.total], bias } : {}) };", to: "" },
  { name: "Recharge Item at 2 PP for every kind", file: AW, from: "        if (kindSpec?.rechargeItemPP) {\n          ppCost = kindSpec.rechargeItemPP;", to: "        if (false) {\n          ppCost = kindSpec.rechargeItemPP;" },
  { name: "the picker hides an item's own price", file: GSO, from: "    + `${r.kindPP ? ` — costs ${r.kindPP} PP` : \"\"}${r.immune", to: "    + `${r.immune" },
  // H23 — abilities that stop with the charge
  { name: "a wondrous ability works below its PP floor", file: WE, from: "    if (minPP > 0 && Math.trunc(Number(item?.system?.uses ?? 0) || 0) < minPP) {", to: "    if (false) {" },
  { name: "a wondrous resistance not gathered", file: WE, from: "      if (type && abilityApplies(ability, context) && !out.resistances.includes(type)) out.resistances.push(type);", to: "" },
  { name: "a scoped adder loses its scope", file: WE, from: "        out.spellAdders.push({ label: ability.label ?? item.name, value, ...(spellTraits.length ? { spellTraits } : {}) });", to: "        out.spellAdders.push({ label: ability.label ?? item.name, value });" },
  { name: "an arcane-or-High-Magic adder needs arcane", file: WE, from: "    if (!/\\barcane\\b/i.test(String(tradition ?? \"\")) && !highMagicCaster) return false;", to: "    if (!/\\barcane\\b/i.test(String(tradition ?? \"\"))) return false;" },
  { name: "a High Magic caster of some traditions is none", file: HM, from: "    return flag === true || (Array.isArray(flag) && flag.length > 0);", to: "    return flag === true;" },
  { name: "the actor never says the caster is High Magic", file: ACT, from: "      highMagicCaster: isHighMagicCasterAtAll(actor)\n    });", to: "      highMagicCaster: false\n    });" },
  { name: "a wondrous resistance not joined to the actor's", file: ACT, from: "      system.combat.resistances = [String(system.combat.resistances ?? \"\"), ...wondrousEffects.resistances].filter(Boolean).join(\", \");", to: "" },
  { name: "the pool drops a scope", file: SA, from: "      ...(Array.isArray(w?.spellTraits) && w.spellTraits.length ? { spellTraits: w.spellTraits.map((t) => String(t).toLowerCase()) } : {})", to: "" },
  { name: "a scoped adder pays for any spell", file: SA, from: "  const sources = (rated?.sources ?? []).filter((s) => !Array.isArray(s?.spellTraits) || !s.spellTraits.length\n    || s.spellTraits.some((t) => have.includes(String(t).toLowerCase())));", to: "  const sources = rated?.sources ?? [];" },
  { name: "the cast offers every adder", file: CW, from: "    const rated = spellAdderFor(withWondrousAdders(withWondrousAdders(spellAdderSources(actor), wondrous), battery), spellData.traits ?? \"\");", to: "    const rated = withWondrousAdders(withWondrousAdders(spellAdderSources(actor), wondrous), battery);" },
  { name: "an item conditional read below its PP floor", file: CON, from: "        if (minPP > 0 && itemPP < minPP) return;", to: "" },
  // H24
  { name: "a trait row dropped", file: CO, from: "  if (traits.length) return { traits, value, label: str(label) || \"Casting option\" };", to: "" },
  { name: "a trait row read by case", file: CO, from: "    .map((t) => str(t).toLowerCase()).filter(Boolean);\n  if (traits.length) return", to: "    .map((t) => str(t)).filter(Boolean);\n  if (traits.length) return" },
  { name: "a target's traits not read", file: CO, from: "  const traits = typeof target === \"string\" ? [] : creatureTraits(target?.system ?? {}).map((t) => str(t).toLowerCase());", to: "  const traits = [];" },
  { name: "only one row taken", file: CO, from: "    out.saveDCTargets.push(...castOptionTargetDCs(got?.saveDCTarget, label));", to: "    out.saveDCTargets.push(...castOptionTargetDCs(got?.saveDCTarget, label).slice(0, 0));" },
  { name: "the save hands only the uuid", file: CW, from: "    const targetShift = castOptionDCFor(saveDCTargets, target ?? \"\");", to: "    const targetShift = castOptionDCFor(saveDCTargets, target?.uuid ?? \"\");" },
  { name: "no rod helper", file: APW, from: "      spendFromRod: async (actor, item, pp, opts = {}) =>", to: "      spendFromRodX: async (actor, item, pp, opts = {}) =>" },
  // H25
  { name: "a second item with the trait allowed", file: TR, from: "    if (other) return `only one item with the ${key[0].toUpperCase()}${key.slice(1)} trait may be invested at a time — ${other.name} already is`;", to: "" },
  { name: "the trait not lower-cased", file: API, from: "  const list = (Array.isArray(traits) ? traits : [traits]).map((t) => String(t ?? \"\").trim().toLowerCase()).filter(Boolean);", to: "  const list = (Array.isArray(traits) ? traits : [traits]).map((t) => String(t ?? \"\").trim()).filter(Boolean);" },
  { name: "Invest Item's refusal skips the module trait", file: MIW, from: "  const one = await oneInvestedTraitRefusal(actor, item);\n  if (one) return one;", to: "" },
  { name: "Invest Item skips the module trait", file: MIW, from: "Array.from(actor.items ?? [])) || await oneInvestedTraitRefusal(actor, item)\n      || await moduleInvestRefusal(actor, item);", to: "Array.from(actor.items ?? []))\n      || await moduleInvestRefusal(actor, item);" }, // 3.693.0 (H27)
  // H26
  { name: "a held record loses its die", file: SS, from: "    natural: Math.max(0, int(natural)),", to: "    natural: 0," },
  { name: "a held store's room forgets what it holds", file: SS, from: "  const room = Math.max(0, int(capacityPP) - Math.max(0, int(used)));", to: "  const room = Math.max(0, int(capacityPP));" },
  { name: "a held spell may be overcast", file: SS, from: "  if (Number.isFinite(Number(cap)) && cost > int(cap)) return", to: "  if (false) return" },
  { name: "a held check may be rerolled", file: SS, from: "    rerolledFrom: \"held\",", to: "" },
  { name: "a held check carries chaos", file: SS, from: "    dice: { unmodified: Math.max(0, int(record.natural)), chaos: false },", to: "    dice: { unmodified: Math.max(0, int(record.natural)), chaos: true }," },
  { name: "a held release not threaded", file: CW, from: "  if (heldRelease) thread = { degree: String(held.degree), check: held.check ?? null, warp: held.warp ?? null };", to: "" },
  { name: "a held release's targets preset", file: CW, from: "  const presetTargets = presetTargetsGiven || woven;", to: "  const presetTargets = presetTargetsGiven || threaded;" },
  { name: "a held release loses its die", file: CW, from: "unmodified: heldRelease ? Math.trunc(Number(thread.check.dice?.unmodified ?? 0)) || 0 : 0 }", to: "unmodified: 0 }" },
  { name: "a held release's Save DC recomputed", file: CW, from: " || (heldRelease ? Math.max(0, Math.trunc(Number(held?.saveDC) || 0)) : 0);", to: ";" },
  { name: "a held release stored again", file: CW, from: "!ritual && !heldRelease && storesThisCast && Boolean(readArmed(actor));", to: "!ritual && storesThisCast && Boolean(readArmed(actor));" },
  { name: "a hold window not read", file: CW, from: "  const holdingNow = Boolean(holdWindow);", to: "  const holdingNow = false;" },
  { name: "a held cast takes Spell Storing's exit", file: CW, from: "  if (storingNow && !holdingNow) {", to: "  if (storingNow) {" },
  { name: "a spell too big is held", file: CW, from: "    if (refused) {\n      ui.notifications.warn(`${spell.name} is not held: ${refused}.`);\n      return null;\n    }", to: "" },
  { name: "a failed held cast is kept", file: CW, from: "    if (outcome.cast && host) {\n      const record = await addHeldSpell(host, {", to: "    if (host) {\n      const record = await addHeldSpell(host, {" },
  { name: "the held record has no Save DC", file: CW, from: "        saveDC: Number(nominalSaveDC ?? 0) || 0,", to: "        saveDC: 0," },
  { name: "the release pays its AP before it casts", file: SSW, from: "  if (!result || result.refunded) return null;", to: "  await spendActionCost(actor, String(ap), what, { traits: \"Command\" });\n  if (!result || result.refunded) return null;" },
  { name: "a called-off release loses its spell", file: SSW, from: "  if (!result || result.refunded) return null;\n  // WHAT THE STAFF HOLDS NOW", to: "  // WHAT THE STAFF HOLDS NOW" }, // RE-ANCHORED (re-review)
  { name: "a hold window not marked", file: SSW, from: "    hold: { capacityPP: Math.max(0, Math.trunc(Number(capacityPP) || 0)), label: String(label ?? \"\").trim() },", to: "" },
  { name: "no hold helper", file: APW, from: "      armHold: async (actor, item, opts = {}) =>", to: "      armHoldX: async (actor, item, opts = {}) =>" },
  { name: "the hooks say a held release is woven", file: CW, from: "      metamagic: [...castMetamagic.keys], threaded: woven, held: heldRelease,", to: "      metamagic: [...castMetamagic.keys], threaded,  held: heldRelease," },
  // REVIEW (3.690.0)
  { name: "REVIEW: a wand's spell falls into the window", file: CW, from: "  const castsOwnSpell = !itemCheck && Boolean(spell?.id && actor?.items?.has?.(spell.id));", to: "  const castsOwnSpell = true;" },
  { name: "REVIEW: a scroll copy falls into the window", file: CW, from: "  const castsOwnSpell = !itemCheck && Boolean(spell?.id && actor?.items?.has?.(spell.id));", to: "  const castsOwnSpell = !itemCheck;" },
  { name: "REVIEW: the host is looked up again at the exit", file: CW, from: "    const host = holdHost;\n    await disarmStoring(actor);", to: "    const host = (await import(\"./spell-storing-workflow.mjs\")).storeHostFor(actor, readArmed(actor));\n    await disarmStoring(actor);" },
  { name: "REVIEW: the held record forgets its options' target rows", file: CW, from: "        saveDCTargets: castOptionsApplied.saveDCTargets ?? [],\n", to: "" },
  { name: "REVIEW: the release forgets them", file: CW, from: "    castOptionsApplied.saveDCTargets.push(...(Array.isArray(held?.saveDCTargets) ? held.saveDCTargets : []));", to: "" },
  { name: "REVIEW: the release hands them in", file: SSW, from: "      saveDCTargets: record.saveDCTargets,\n", to: "" },
  { name: "REVIEW: the held hook names no options", file: CW, from: "host, record, castOptions: [...castOptionsApplied.keys] });", to: "host, record });" },
  { name: "REVIEW: a spell being held names the stray targets", file: CW, from: "    targets: holdingNow && outcome?.cast ? [] : Array.from", to: "    targets: Array.from" },
  { name: "REVIEW: a woven spell is offered options", file: CW, from: "noCheckCantrip || ritualFailed || threaded) ? [] : await offeredCastOptions(castOptionContext);", to: "noCheckCantrip || ritualFailed) ? [] : await offeredCastOptions(castOptionContext);" },
  { name: "REVIEW: Spellhold overwrites a Spell Storing window", file: SSW, from: "  if (open && !open.hold) {", to: "  if (false) {" },
  { name: "REVIEW: one held spell released twice", file: SSW, from: "  if (RELEASING.has(key)) {", to: "  if (false) {" },
  { name: "REVIEW: a release's lock never freed", file: SSW, from: "  } finally {\n    RELEASING.delete(key);", to: "  } finally {\n    void key;" },
  { name: "REVIEW: a record drops its option keys", file: SS, from: "    castOptions: (Array.isArray(castOptions) ? castOptions : []).map(text).filter(Boolean),", to: "    castOptions: []," },
  { name: "REVIEW: a record keeps a row with no target", file: SS, from: "      .filter((t) => t.uuid || t.traits?.length),", to: "" },
  // RULINGS (14 November 2026)
  { name: "RULING: a held spell takes no cost cut", file: CW, from: "  const costCut = (isItemCast || stored || storingUnpaid || threaded", to: "  const costCut = (isItemCast || stored || storingNow || threaded" },
  { name: "RULING: a held spell takes no PP source", file: CW, from: "isItemCast || stored || storingUnpaid || threaded || ritualSubstitutes || payablePP <= 0)", to: "isItemCast || stored || storingNow || threaded || ritualSubstitutes || payablePP <= 0)" },
  { name: "RULING: Spell Storing takes cuts", file: CW, from: "  const storingUnpaid = storingNow && !holdingNow;", to: "  const storingUnpaid = false;" },
  { name: "RULING: a hold's sources never settled", file: CW, from: "          totalPP, ppSpent, metamagicPP, warpMods, threaded: false, held: false, holding: true,", to: "          totalPP, ppSpent, metamagicPP, warpMods, threaded: false, held: false," },
  { name: "RULING: a held spell's chaos rolls nothing", file: CW, from: "      if (chaos) await rollResonanceEvent(actor, { reason: \"Chaos on the casting check\", modifiers: resonanceContext });", to: "" },
  { name: "RULING: a forced Resonance skipped at storing", file: CW, from: "        for (const event of forced) {\n          await rollResonanceEvent(actor, { reason: `${esc(event.reason)} — a Resonance event after storing", to: "        for (const event of []) {\n          await rollResonanceEvent(actor, { reason: `${esc(event.reason)} — a Resonance event after storing" },
  { name: "RULING: the release rolls the named natural again", file: CW, from: "if (resonanceFace > 0 && !heldRelease && Number(", to: "if (resonanceFace > 0 && Number(" },
  { name: "RE-REVIEW: a held spell's lent option not spent", file: CW, from: "      if (lentCut.effectIds.length && lentRoundKey) {", to: "      if (false) {" },
  { name: "RE-REVIEW: a release writes back a stale list", file: SSW, from: "  const left = heldSpellsIn(host).filter((r) => r.id !== record.id);", to: "  const left = rest;" },
  // Z
  { name: "Z the version is not raised", file: SJ, from: "\"version\": \"3.703.1\"", to: "\"version\": \"3.689.0\"" },
  { name: "Z the download names the last release", file: SJ, from: "releases/download/v3.703.1/trg-prime.zip", to: "releases/download/v3.689.0/trg-prime.zip" },
  { name: "Z package.json is left behind", file: PJ, from: "\"version\": \"3.703.1\"", to: "\"version\": \"3.689.0\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-block9c-core.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-block9c-core: verify-block9c-core already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-block9c-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block9c-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
