#!/usr/bin/env node
/** mutate-ea-block5d-core — the mutation half of verify-ea-block5d-core. NEW at 3.683.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DM = m("combat", "dispel-modifiers.mjs"), AW = m("combat", "action-workflow.mjs"), GSO = m("general-skill-options-workflow.mjs"),
  API = m("module-api.mjs"), APIW = m("module-api-workflow.mjs"), FW = m("feats-workflow.mjs"), CAST = m("magic", "casting.mjs"),
  ACTOR = m("documents", "actor.mjs"), MEM = m("magic", "memorisation.mjs"), MW = m("magic", "memorisation-workflow.mjs"),
  CO = m("magic", "cast-options.mjs"), CW = m("magic", "cast-workflow.mjs"), SN = m("magic", "spell-sniping.mjs");
const MUTATIONS = [
  // D — Dispel modifiers (C9)
  { name: "a modifier with no offer is accepted", file: API, from: "  if (!k || typeof spec?.offer !== \"function\" || (spec.onResult !== undefined && typeof spec.onResult !== \"function\")) {", to: "  if (!k) {", breaks: "D1/D2" },
  { name: "a throwing offer stops the Dispel", file: DM, from: "      console.error(`TRG Prime | dispel modifier \"${key}\": offer failed`, err);", to: "      throw err;", breaks: "D4" },
  { name: "an unlabelled offer is offered", file: DM, from: "  if (!raw || typeof raw !== \"object\" || !str(raw.label)) return null;", to: "  if (!raw || typeof raw !== \"object\") return null;", breaks: "D4" },
  { name: "any number is a factor", file: DM, from: "    ppFactor: Number.isFinite(factor) && factor > 0 && factor < 1 ? factor : null,", to: "    ppFactor: Number.isFinite(factor) ? factor : null,", breaks: "D6" },
  { name: "an unreadable replacement is a free Dispel", file: DM, from: "    || !Number.isFinite(Number(raw.ppReplace)) ? null : int(raw.ppReplace);", to: "    ? null : int(raw.ppReplace);", breaks: "D6" },
  { name: "an optional offer applies unticked", file: DM, from: "(o) => o && !o.unavailable && (!o.optional || ticked.has(o.key))", to: "(o) => o && !o.unavailable", breaks: "D8" },
  { name: "a spent Focus use still applies", file: DM, from: "(o) => o && !o.unavailable && (!o.optional || ticked.has(o.key))", to: "(o) => o && (!o.optional || ticked.has(o.key))", breaks: "D9" },
  { name: "factors compound (the largest wins)", file: DM, from: "    ppFactor: factors.length ? Math.min(...factors) : null,", to: "    ppFactor: factors.length ? Math.max(...factors) : null,", breaks: "D11" },
  { name: "the easiest step wins", file: DM, from: ".sort((a, b) => difficultyIndex(b) - difficultyIndex(a))[0]", to: ".sort((a, b) => difficultyIndex(a) - difficultyIndex(b))[0]", breaks: "D11" },
  { name: "page 91's half rounds down", file: DM, from: "  const own = halves ? Math.ceil(base / 2) : base;", to: "  const own = halves ? Math.floor(base / 2) : base;", breaks: "D12" },
  { name: "THE RULING (Q63): the halves compound", file: DM, from: "  const factored = Number.isFinite(factor) && factor > 0 && factor < 1 ? Math.ceil(base * factor) : null;", to: "  const factored = Number.isFinite(factor) && factor > 0 && factor < 1 ? Math.ceil(own * factor) : null;", breaks: "D13" },
  { name: "a factor dearer than the degree's half is paid", file: DM, from: "  if (factored !== null && factored < own) {", to: "  if (factored !== null) {", breaks: "D14" },
  { name: "Runebreaker's minimum of 1 is lost", file: DM, from: "  const base = reduction > 0 && declared > 0 ? Math.max(1, declared - reduction) : declared;", to: "  const base = reduction > 0 && declared > 0 ? Math.max(0, declared - reduction) : declared;", breaks: "D15" },
  { name: "THE RULING (Q84): Dispel Power still spends PP", file: DM, from: "    return { pp: 0, label: `Dispel${by} — no PP` };", to: "    return { pp: declared, label: `Dispel${by} — no PP` };", breaks: "D16" },
  { name: "an own ladder still halves", file: DM, from: "  const halves = !setup?.outcomes && (degree === \"critical\" || degree === \"partial\");", to: "  const halves = degree === \"critical\" || degree === \"partial\";", breaks: "D17" },
  { name: "the replacement is not the counteract value", file: DM, from: "    ? Math.max(0, int(replace))\n    : Math.max(0, int(setup?.pp));", to: "    ? Math.max(0, int(setup?.pp))\n    : Math.max(0, int(setup?.pp));", breaks: "D19" },
  { name: "a Partial counts as countered", file: DM, from: "const SUCCESSES = Object.freeze([\"heroic\", \"critical\", \"success\"]);", to: "const SUCCESSES = Object.freeze([\"heroic\", \"critical\", \"success\", \"partial\"]);", breaks: "D20" },
  { name: "the ladder replaces another action's rows", file: DM, from: "  if (action?.key !== \"dispel\" || !setup?.outcomes", to: "  if (!setup?.outcomes", breaks: "D21" },
  { name: "every modifier rides, applied or not", file: DM, from: "    if (!wanted.has(key) || typeof spec.onResult !== \"function\") continue;", to: "    if (typeof spec.onResult !== \"function\") continue;", breaks: "D22" },
  { name: "a throwing rider stops the rest", file: DM, from: "      console.error(`TRG Prime | dispel modifier \"${key}\": onResult failed`, err);", to: "      throw err;", breaks: "D22" },
  { name: "a function is stored with the request", file: DM, from: "(k, v) => (typeof v === \"function\" ? undefined : v)", to: "(k, v) => (typeof v === \"function\" ? \"fn\" : v)", breaks: "D24" },
  { name: "the prompt forgets the ticks", file: GSO, from: "    taken: Array.isArray(result.taken) ? result.taken : []", to: "    taken: []", breaks: "D25" },
  { name: "a spent offer is still a tick", file: GSO, from: "      if (o.unavailable) return `<p class=\"hint\" style=\"margin:4px 0\"><s>${esc(o.label)}</s> &mdash; ${esc(o.unavailable)}</p>`;\n", to: "", breaks: "D26" },
  { name: "a required offer is shown as a tick", file: GSO, from: "      if (o.optional) {\n        return `<label", to: "      if (true) {\n        return `<label", breaks: "D26" },
  { name: "the prompt is never told the offers", file: AW, from: "        offers: dispelOffers\n", to: "        offers: []\n", breaks: "D28" },
  { name: "Disrupting Magic is not a counter", file: AW, from: "const counterSpell = presetDispel ? presetDispel.counterSpell !== false : Boolean(action.counterSpell);", to: "const counterSpell = Boolean(action.counterSpell);", breaks: "D28" },
  { name: "a spent Focus use is offered", file: AW, from: "        else if (left !== null && !(left > 0)) offer.unavailable = ", to: "        else if (false) offer.unavailable = ", breaks: "D29" },
  { name: "what applied never joins the setup", file: AW, from: "      ...combinedDispelModifiers(applied),\n", to: "", breaks: "D30" },
  { name: "Counter Spell's Dispel is not a counter", file: FW, from: "        counterSpell: true,\n", to: "", breaks: "D31" },
  { name: "Dispel Power's Very Hard is not the default", file: AW, from: "  if (action.key === \"dispel\" && dispelSetup?.difficulty) actionDifficulty = dispelSetup.difficulty;\n", to: "", breaks: "D32" },
  { name: "a replacement is compared as the PP", file: AW, from: "    const acting = dispelCounteractValue(dispelSetup);\n    const value = counteractModifier(acting, dispelSetup.effectValue);", to: "    const acting = dispelCounteractValue(dispelSetup);\n    const value = counteractModifier(dispelSetup.pp, dispelSetup.effectValue);", breaks: "D33" },
  { name: "Threadbreaker's +2 never reaches the check", file: AW, from: "      if (Number(row?.value)) dispelRows.push(", to: "      if (false) dispelRows.push(", breaks: "D34" },
  { name: "a resumed card forgets the ladder", file: AW, from: "  if (isDispel) action = dispelActionWithLadder(action, dispelSetup);\n", to: "", breaks: "D35" },
  { name: "the PP paid is page 91's whatever the modifiers", file: AW, from: "      const paidFor = dispelPPPaid(degree, dispelSetup);", to: "      const paidFor = { pp: dispelSetup.pp, label: \"Dispel\" };", breaks: "D36" },
  { name: "Dispel Power's Focus use is never spent", file: AW, from: "          await (usesPoolItem(item) ?? item).update({ \"system.usesValue\": Math.max(0, left - 1) });\n", to: "", breaks: "D37" },
  { name: "the riders are told nothing countered", file: AW, from: "      countered: dispelCountered(dispelSetup.counterSpell, degree),", to: "      countered: false,", breaks: "D38" },
  { name: "the roll never reaches the riders", file: AW, from: "    ctx: outcomeContext,\n    check\n  });", to: "    ctx: outcomeContext\n  });", breaks: "D39" },
  { name: "the API forgets the registration", file: APIW, from: "    registerDispelModifier: (key, spec, moduleId) => registerDispelModifier(key, spec, moduleId),\n", to: "", breaks: "D40" },
  // R — the resolved degree (C10)
  { name: "the hook carries only the raw degree", file: AW, from: "degree: rawDegree ?? degree, resolvedDegree: degree, targetActor,", to: "degree: rawDegree ?? degree, resolvedDegree: rawDegree ?? degree, targetActor,", breaks: "R1" },
  // S — Spell Recognition (C11)
  { name: "THE DEFECT: Spell Recognition names no action", file: FW, from: "        actionKey: \"spellRecognition\",\n", to: "", breaks: "S1" },
  { name: "THE DEFECT: Spell Recognition names no skill", file: FW, from: "        subject: skillKey,\n        actionKey: \"spellRecognition\",", to: "        actionKey: \"spellRecognition\",", breaks: "S1" },
  // L — control levels (C12)
  { name: "a feat's control-level bonus is ignored", file: CAST, from: "    if (item.type === \"feat\") total += read(item);", to: "    if (item.type === \"feat\") total += 0;", breaks: "L1" },
  { name: "an unequipped weapon still binds", file: CAST, from: "    else if (item.system?.equipped === true) total += read(item);", to: "    else total += read(item);", breaks: "L2" },
  { name: "a switched-off ability still binds", file: CAST, from: "    else if (item.type === \"ability\") { if (item.system?.active !== false) total += read(item); }", to: "    else if (item.type === \"ability\") { total += read(item); }", breaks: "L2" },
  { name: "a disabled effect still binds", file: CAST, from: "    if (effect && !effect.disabled) total += read(effect);", to: "    if (effect) total += read(effect);", breaks: "L3" },
  { name: "the actor never adds it", file: ACTOR, from: "    system.magic.controlLevels += system.magic.controlLevelBonus;\n", to: "", breaks: "L5" },
  // M — a free prep (C13)
  { name: "a free prep counts", file: MEM, from: "  return spell?.flags?.[SYSTEM_ID]?.memorisationFree !== true;", to: "  return true;", breaks: "M1/M2/M3" },
  { name: "a book caster's free prep fills a slot", file: MW, from: "spellBookSpells(actor).filter((s) => s.system?.prepared && countsTowardMemorisation(s)).length", to: "spellBookSpells(actor).filter((s) => s.system?.prepared).length", breaks: "M2" },
  { name: "a list caster's free prep fills a slot", file: MW, from: "  for (const spell of dailyMemorisedLeveled(actor).filter(countsTowardMemorisation)) {", to: "  for (const spell of dailyMemorisedLeveled(actor)) {", breaks: "M3" },
  { name: "the checklist offers the free prep", file: MW, from: "Number(s.system?.ppCost ?? 0) <= cap && countsTowardMemorisation(s));", to: "Number(s.system?.ppCost ?? 0) <= cap);", breaks: "M5" },
  // O — Runic Stabiliser (C14)
  { name: "an option's AP is dropped", file: CO, from: "    if (ap > 0) { out.ap += ap; out.apParts.push({ label, value: ap }); }", to: "", breaks: "O1" },
  { name: "a negative option AP makes a cast cheaper", file: CO, from: "    if (ap > 0) { out.ap += ap;", to: "    if (ap) { out.ap += ap;", breaks: "O1" },
  { name: "the pool is asked for the cast alone", file: CO, from: "  return { cast: castAP, option, total: own + option };", to: "  return { cast: castAP, option, total: own };", breaks: "O2" },
  { name: "a reaction cast is folded into the AP", file: CO, from: "  const own = typeof castAP === \"number\" && Number.isFinite(castAP) ? castAP : 0;", to: "  const own = Number(castAP) || 1;", breaks: "O2" },
  { name: "the remap is not told the options", file: CW, from: "      castOptions: [...castOptionsApplied.keys]\n", to: "      castOptions: []\n", breaks: "O4" },
  { name: "the remap is not told High Magic", file: CW, from: "      highMagic: Boolean(hmCast.highMagic),\n      castOptions", to: "      highMagic: false,\n      castOptions", breaks: "O4" },
  { name: "the pool is never asked for the rune", file: CW, from: "    if (!apPaid && !alreadyShort && !(await ensureActionPoints(actor, owed.total, ", to: "    if (false && !(await ensureActionPoints(actor, owed.total, ", breaks: "O5" },
  { name: "a short pool is asked twice (review)", file: CW, from: "    const alreadyShort = Number(actor.system?.resources?.ap?.value ?? 0) < castAlone;", to: "    const alreadyShort = false;", breaks: "O5" },
  { name: "the rune's AP is never spent", file: CW, from: "  if (!apPaid && castAPOwed.option > 0) {\n    optionReceipt = await spendActionCost(", to: "  if (false) {\n    optionReceipt = await spendActionCost(", breaks: "O6" },
  { name: "a refunded cast keeps the rune's AP", file: CW, from: "            if (!apPaid && castAPOwed.option > 0) await refundActionCost(actor, castAPOwed.option, { receipt: optionReceipt });\n", to: "", breaks: "O6" },
  // N — Sniping with a spell (C15)
  { name: "a switched-off feat still snipes", file: SN, from: "s && !s.disabled && s.system?.active !== false && s.flags?.[SYSTEM_ID]?.spellSniping === true", to: "s && !s.disabled && s.flags?.[SYSTEM_ID]?.spellSniping === true", breaks: "N1" },
  { name: "THE RULING (Q86): beyond the spell's range is within", file: SN, from: "  const within = measured && !outOfSpellRange(Number(distanceFeet), spellRangeFeet(t, reach));", to: "  const within = measured;", breaks: "N3" },
  { name: "an unmeasured critical is within", file: SN, from: "  const within = measured && !outOfSpellRange(", to: "  const within = !outOfSpellRange(", breaks: "N3" },
  { name: "a touch spell is ranged", file: SN, from: "  const ranged = Boolean(t) && !/^(touch|self|personal)$/i.test(t);", to: "  const ranged = Boolean(t);", breaks: "N4/N7" },
  { name: "every caster snipes with spells", file: SN, from: "  if (!declared) return null;", to: "", breaks: "N6" },
  { name: "the critical never records the facts", file: CW, from: "      ...(sniping ?? {})\n", to: "", breaks: "N8" },
  { name: "the critical reads the printed range, unwarped", file: CW, from: "        rangeText: effectiveRangeText(warpedRange(effRange, warpMods), warpedAreaText(effArea, warpMods)),", to: "        rangeText: effRange,", breaks: "N8" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block5d-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block5d-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, () => mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-ea-block5d-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block5d-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
