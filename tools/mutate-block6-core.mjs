#!/usr/bin/env node
/** mutate-block6-core — the mutation half of verify-block6-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const SO = m("combat", "strike-options.mjs"), AW = m("combat", "attack-workflow.mjs"), STO = m("combat", "strike-type-options.mjs"),
  BB = m("combat", "bleed-bonus.mjs"), DAS = m("combat", "declared-after-strikes-workflow.mjs"), FT = m("feats.mjs"),
  MW = m("combat", "movement-workflow.mjs"), PF = m("combat", "passive-feats.mjs"), PA = m("combat", "pack-attack.mjs"),
  DT = m("difficulty-tradeoffs.mjs"), ACW = m("combat", "action-workflow.mjs"), CK = m("dice", "check.mjs"),
  AS = m("sheets", "actor-sheet.mjs"), SW = m("magic", "spell-warp.mjs"), CW = m("magic", "cast-workflow.mjs"),
  SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  // C1
  { name: "THE GAP: an unarmed scope reaches nothing", file: SO, from: "(scope === \"unarmed\" && unarmed === true) || ", to: "", breaks: "C1" },
  { name: "an any scope reaches nothing", file: SO, from: "const reaches = scope === \"any\" || ", to: "const reaches = ", breaks: "C1" },
  { name: "a weapon with no group reaches nothing again", file: SO, from: "  const added = [];\n  for (const carrier of carriers ?? []) {\n    if (!carrier || carrier.disabled) continue;\n    const raw = carrier.flags?.[\"trg-prime\"]?.weaponTraitGrants;", to: "  if (!wanted) return have;\n  const added = [];\n  for (const carrier of carriers ?? []) {\n    if (!carrier || carrier.disabled) continue;\n    const raw = carrier.flags?.[\"trg-prime\"]?.weaponTraitGrants;", breaks: "C1" },
  { name: "the attack path never says the Strike is unarmed", file: AW, from: "    unarmed: attackFormOf(ammoData) === \"unarmed\" || abilityUnarmed\n", to: "    unarmed: abilityUnarmed\n", breaks: "C1" },
  // C2
  { name: "THE GAP: a replace option is only offered", file: STO, from: "    replace: raw.replace === true\n", to: "    replace: false\n", breaks: "C2" },
  { name: "unarmed-form reaches a claw", file: STO, from: "  if (option.scope.includes(\"unarmed-form\") && attackFormOf(weaponSystem) === \"unarmed\") return true;", to: "  if (option.scope.includes(\"unarmed-form\") && isUnarmedAttack(weaponSystem)) return true;", breaks: "C2" },
  { name: "a set type is asked anyway", file: AW, from: "  if (forcedTypes.length === 1) versatileDamageType = forcedTypes[0].type;\n  else if", to: "  if", breaks: "C2" },
  { name: "the standalone damage ignores a set type", file: AW, from: "      : standaloneForced.length === 1 ? standaloneForced[0].type\n", to: "", breaks: "C2" },
  // C3
  { name: "THE GAP: the bleed bonus is never added", file: BB, from: "  return list.map((t) => (t?.key === \"bleeding\" && t.value !== null && t.value !== undefined ? { ...t, value: Number(t.value) + n } : t));", to: "  return list;", breaks: "C3" },
  { name: "a disabled carrier still gives bleed", file: BB, from: "  for (const carrier of carriers ?? []) {\n    if (!carrier || carrier.disabled) continue;\n    const raw = carrier.flags?.[SYSTEM_ID]?.bleedBonus;", to: "  for (const carrier of carriers ?? []) {\n    if (!carrier) continue;\n    const raw = carrier.flags?.[SYSTEM_ID]?.bleedBonus;", breaks: "C3" },
  { name: "bleed is created where none was", file: BB, from: "  if (!list.some((t) => t?.key === \"bleeding\" && t.value !== null && t.value !== undefined)) return list;\n", to: "  if (!list.some((t) => t?.key === \"bleeding\" && t.value !== null && t.value !== undefined)) return [...list, { key: \"bleeding\", value: n }];\n", breaks: "C3" },
  { name: "a self-inflicted injury's bleed is raised", file: AW, from: "      const bleed = targetActor === actor ? { value: 0, labels: [] }\n        : declaredBleedBonus(", to: "      const bleed = false ? { value: 0, labels: [] }\n        : declaredBleedBonus(", breaks: "C3" },
  { name: "a critical injury's bleed is not raised", file: AW, from: "      if (raised !== tags) {\n        tags = raised;", to: "      if (false) {\n        tags = raised;", breaks: "C3" },
  { name: "an after-Strike bleed is not raised", file: DAS, from: "    if (raised !== tags) { tags.splice(0, tags.length, ...raised);", to: "    if (false) { tags.splice(0, tags.length, ...raised);", breaks: "C3" },
  // C4
  { name: "THE GAP: the Speed condition is ignored", file: FT, from: "if (!Number.isFinite(feet) || feet <= 5 || Number(speed) < min) continue;", to: "if (!Number.isFinite(feet) || feet <= 5) continue;", breaks: "C4" },
  { name: "a declared Step adds to Graceful Step", file: MW, from: "  return Math.max(named, declaredStepBonus(carriers, speed));", to: "  return named + declaredStepBonus(carriers, speed);", breaks: "C4" },
  // C5
  { name: "the whole surcharge comes off", file: PF, from: "  const off = Math.min(surcharge, Math.max(0, Number(square) || 5));", to: "  const off = surcharge;", breaks: "C5" },
  { name: "a disabled effect eases the first square", file: PF, from: "  const carries = (d) => !d?.disabled && d?.flags?.[\"trg-prime\"]?.ignoresFirstDifficultSquare === true;", to: "  const carries = (d) => d?.flags?.[\"trg-prime\"]?.ignoresFirstDifficultSquare === true;", breaks: "C5" },
  { name: "the first square is eased on a Step or a Crawl too", file: MW, from: "if (!eased.eased && (!armedKey || armedKey === \"stride\")) {", to: "if (!eased.eased) {", breaks: "C5" },
  // C6
  { name: "THE GAP: an effect's Pack Attack is ignored", file: PA, from: "  return fromItem || Array.from(effects ?? []).some(", to: "  return fromItem || [].some(", breaks: "C6" },
  // C7
  { name: "anybody's move spends the first", file: MW, from: "    if (carriesFirstMove && actor?.getFlag", to: "    if (actor?.getFlag", breaks: "C7" },
  { name: "every move is free", file: PF, from: "  return Boolean(carries) && Boolean(turnKey) && record !== turnKey;", to: "  return Boolean(carries) && Boolean(turnKey);", breaks: "C7" },
  { name: "a disabled effect frees the first move", file: PF, from: "  return Array.from(actor?.appliedEffects ?? actor?.effects ?? []).some((e) => !e?.disabled && carries(e));", to: "  return Array.from(actor?.appliedEffects ?? actor?.effects ?? []).some((e) => carries(e));", breaks: "C7" },
  { name: "THE GAP: the first move still provokes", file: MW, from: "    const moverImmune = jumpAvoided || firstFree || Boolean(", to: "    const moverImmune = jumpAvoided || Boolean(", breaks: "C7" },
  // C8
  { name: "THE GAP: mapSteps is ignored", file: AW, from: "    const mapSteps = Math.max(powerSteps, Math.max(1, Math.trunc(Number(mapStepsOption) || 1)));", to: "    const mapSteps = powerSteps;", breaks: "C8" },
  // C9
  { name: "THE GAP: a declared waiver is never read", file: ACW, from: "      Object.assign(waivers, declaredTradeoffWaivers(", to: "      Object.assign({}, declaredTradeoffWaivers(", breaks: "C9" },
  { name: "a waiver reaches every action", file: DT, from: "      if (option && actions.includes(wanted)) out[option] = { dc: 0 };", to: "      if (option) out[option] = { dc: 0 };", breaks: "C9" },
  // C10
  { name: "THE GAP: the preset modifiers are ignored", file: CK, from: "      this.modifiers = config.presetModifiers.map((m) => ({ ...m }));\n", to: "", breaks: "C10" },
  { name: "the preset result is asked its tick-boxes again", file: CK, from: "      this.conditionalsResolved = true;\n      this.allowConviction = false;\n    }", to: "      this.allowConviction = false;\n    }", breaks: "C10" },
  { name: "a waiting Inspire Competence is spent on a preset check", file: CK, from: "  async #takeInspireCompetence() {\n    // Not on another check's result met again (3.670.0, found in review):\n    // its total is that check's, and nothing waiting is spent on it.\n    if (!this.actor || this.presetModifiers) return;", to: "  async #takeInspireCompetence() {\n    if (!this.actor) return;", breaks: "C10" },
  { name: "a rod is offered on a preset check", file: CK, from: " && !check.rodAdvantageResolved && !check.presetModifiers) {", to: " && !check.rodAdvantageResolved) {", breaks: "C10" },
  { name: "the Strike never says it missed", file: AW, from: "      resolved: Boolean(outcome?.resolved), missed: Boolean(outcome?.resolved) && !outcome?.hits,\n", to: "      resolved: Boolean(outcome?.resolved),\n", breaks: "C10" },
  { name: "resolveAction drops the preset modifiers", file: ACW, from: "    ...(presetDice && Array.isArray(presetModifiers) ? { presetModifiers } : {}),\n", to: "", breaks: "C10" },
  // C11
  { name: "THE GAP: the picker never sees a feat's class access", file: AS, from: "      traitClasses: declaredClassFeatAccess(items).join(\", \"),\n", to: "", breaks: "C11" },
  { name: "THE REVIEW'S LEAK: a declared class opens its access list too", file: AS, from: "      class: effectiveClasses(items.find((i) => i.type === \"class\")?.name ?? \"\", archetypeFeats),\n", to: "      class: [effectiveClasses(items.find((i) => i.type === \"class\")?.name ?? \"\", archetypeFeats), ...declaredClassFeatAccess(items)].filter(Boolean).join(\", \"),\n", breaks: "C11" },
  { name: "the picker ignores the declared trait classes", file: m("picker-filters.mjs"), from: "        const myClasses = [className, traitClasses].join(\", \")", to: "        const myClasses = [className].join(\", \")", breaks: "C11" },
  { name: "an ability opens a class too", file: FT, from: "    if (item?.type !== \"feat\") continue;\n    const raw = item.flags?.[\"trg-prime\"]?.classFeatAccess;", to: "    const raw = item?.flags?.[\"trg-prime\"]?.classFeatAccess;", breaks: "C11" },
  // C12
  { name: "THE GAP: an innate spell never takes metamagic", file: CW, from: "  const mmOptions = (isCantrip || (isInnate && !innateMetamagic)) ? [] : buildMetamagicOptions({", to: "  const mmOptions = (isCantrip || isInnate) ? [] : buildMetamagicOptions({", breaks: "C12" },
  { name: "the Metamagic box is outside the budget", file: SW, from: "(countRaw ? 0 : (Number(warp?.rawPP) || 0))", to: "(Number(warp?.rawPP) || 0)", breaks: "C12" },
  { name: "the Metamagic box is charged to the pool", file: CW, from: "      warpPP = innateMetamagic ? 0 : warp.rawPP;", to: "      warpPP = warp.rawPP;", breaks: "C12" },
  { name: "THE REVIEW'S CHARGE: the feats ticked go to the pool", file: CW, from: "    (innateMetamagic ? 0 : mm.ppSpent);", to: "    mm.ppSpent;", breaks: "C12" },
  { name: "the feats ticked are outside the budget", file: SW, from: "  const feats = countRaw ? Math.max(0, Number(metamagicPP) || 0) : 0;", to: "  const feats = 0;", breaks: "C12" },
  { name: "the fit is checked without the feats", file: CW, from: "{ countRaw: innateMetamagic, metamagicPP: mm.ppSpent }", to: "{ countRaw: innateMetamagic }", breaks: "C12" },
  { name: "an innate cantrip takes metamagic (the review's)", file: CW, from: " && !innateCantripOf(spellData) && spell", to: " && spell", breaks: "C12" },
  { name: "a cantrip is told from its PP alone", file: SW, from: "=== 0 && /\\bcantrip\\b/i.test(String(spellData?.traits ?? \"\"));", to: "=== 0;", breaks: "C12" },
  { name: "the feats are priced on 0", file: CW, from: "    basePP: innateMetamagic ? Math.max(0, Number(spellData.ppCost ?? 0)) : basePP,", to: "    basePP,", breaks: "C12" },
  { name: "Economic Spell is offered on a marked innate spell", file: CW, from: "  }).filter((o) => !(innateMetamagic && o.kind === \"economic\"));", to: "  });", breaks: "C12" },
  { name: "a cantrip takes metamagic", file: CW, from: "const innateMetamagic = isInnate && !isItemCast && !isCantrip && !innateCantripOf", to: "const innateMetamagic = isInnate && !isItemCast && !innateCantripOf", breaks: "C12" },
  // version
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.673.2\"", to: "\"version\": \"3.669.2\"", breaks: "Z0" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block6-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block6-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-block6-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block6-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
