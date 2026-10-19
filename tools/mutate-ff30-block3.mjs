#!/usr/bin/env node
/**
 * mutate-ff30-block3 — the mutation half of verify-ff30-block3 (3.633.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const IP = m("magic", "innate-printed.mjs"), SEC = m("combat", "creature-secondary.mjs"), DAS = m("combat", "declared-after-strikes.mjs"), CURE = m("affliction-countered.mjs");
const CA = m("creature-auras.mjs"), AREA = m("creature-area.mjs"), PE = m("peril-effect.mjs"), HM = m("magic", "high-magic.mjs"), EL = m("el-adjust.mjs"), EP = m("extraplanar.mjs");
const CR = m("conditions", "condition-rules.mjs"), CAST = m("magic", "cast-workflow.mjs"), SHEET = m("sheets", "actor-sheet.mjs"), ATTACK = m("combat", "attack-workflow.mjs");
const AFTER = m("combat", "declared-after-strikes-workflow.mjs"), SPELLS = m("magic", "spell-effects.mjs"), AURAWF = m("creature-aura-workflow.mjs"), TRAITFX = m("aura-trait-effect-workflow.mjs");
const PERIL = m("peril-workflow.mjs"), ACTOR = m("documents", "actor.mjs"), DEATH = m("combat", "death-state.mjs"), EPWF = m("extraplanar-workflow.mjs");
const INIT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"), TPL = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs"), SETTINGS = m("settings.mjs");

const MUTATIONS = [
  { name: "a printed DC is ignored", file: IP, from: "  if (printed?.dc !== null && printed?.dc !== undefined) return { value: printed.dc, printed: true };", to: "", breaks: "A1" },
  { name: "a printed attack is ignored", file: IP, from: "  if (printed?.attack !== null && printed?.attack !== undefined) return { value: printed.attack, printed: true };", to: "", breaks: "A1" },
  { name: "a plain secondary packet is called magical", file: SEC, from: "      mundane: !magical", to: "      mundane: false", breaks: "A2" },
  { name: "good damage reaches anyone", file: SEC, from: "    const applies = !aligned || (targetSystem ? alignedDamageAffects(type, targetSystem) : false);", to: "    const applies = true;", breaks: "A3" },
  { name: "an aligned packet is typed by its word", file: SEC, from: "      type: aligned ? \"aligned\" : type,", to: "      type,", breaks: "A3" },
  { name: "malformed dice are kept", file: SEC, from: "    if (!DICE.test(dice) || !TYPE.test(type)) continue;", to: "    if (!dice) continue;", breaks: "A4" },
  { name: "a weapon's after-strike fires for any weapon", file: DAS, from: "  return declaredAfterStrikes([weapon]).map((spec) => ({ ...spec, weaponNames: [lower(weapon.name)] }));", to: "  return declaredAfterStrikes([weapon]);", breaks: "A5" },
  { name: "the own affliction is any item of the name", file: DAS, from: "i?.type === \"affliction\" && lower(i?.name) === want", to: "lower(i?.name) === want", breaks: "A6" },
  { name: "a declared cure is not read", file: CURE, from: "  return (Array.isArray(extra) ? extra : []).map(lower).some((k) => want.includes(k));", to: "  return false;", breaks: "A7" },
  { name: "the trait effect lands on a success too", file: CA, from: "  return Boolean(aura?.traitEffect && aura.traitEffect.on.includes(String(degreeKey ?? \"\").toLowerCase()));", to: "  return Boolean(aura?.traitEffect);", breaks: "A8" },
  { name: "an aura with only a trait effect is not rolled", file: CA, from: " || aura?.criticals || aura?.traitEffect\n", to: " || aura?.criticals\n", breaks: "A8" },
  { name: "Mucus Cloud works out of the water", file: CA, from: "      if (aura.emitterState && !(emitter.states ?? []).includes(aura.emitterState)) continue;", to: "", breaks: "A9" },
  { name: "an aquatic creature is caught", file: CA, from: "      if ((aura.exemptTraits ?? []).some((t) => (subject.traits ?? []).includes(t))) continue;", to: "", breaks: "A9" },
  { name: "a breath's second packet is dropped", file: AREA, from: "  if (extraDamage.length) area.extraDamage = extraDamage;", to: "", breaks: "A10" },
  { name: "malformed further packets are kept", file: PE, from: "    .filter((p) => /^\\d+d\\d+([+-]\\d+)?$/i.test(p.formula) && /^[a-z]+$/.test(p.type));", to: "    .filter((p) => p.formula);", breaks: "A11" },
  { name: "High Magic raises a printed DC too", file: HM, from: "  return isHighMagic(actor) && !printed ? HIGH_MAGIC_SAVE_DC : 0;", to: "  return isHighMagic(actor) ? HIGH_MAGIC_SAVE_DC : 0;", breaks: "A12" },
  { name: "High Magic's fumble is unchanged", file: HM, from: "  return isHighMagic(actor) ? HIGH_MAGIC_FUMBLE : 0;", to: "  return 0;", breaks: "A12" },
  { name: "the EL adjustment misses DB", file: EL, from: "    \"system.combat.defence\",\n", to: "", breaks: "A13" },
  { name: "the EL adjustment is unbounded", file: EL, from: "  return Math.max(-EL_ADJUST_LIMIT, Math.min(EL_ADJUST_LIMIT, raw));", to: "  return raw;", breaks: "A13" },
  { name: "the setting does not turn Extraplanar death off", file: EP, from: "  if (!enabled || !isExtraplanar(actor?.system)) return \"\";", to: "  if (!isExtraplanar(actor?.system)) return \"\";", breaks: "A14" },
  { name: "any Extraplanar creature dies at 0 HP", file: EP, from: " && Boolean(actor?.system?.gm?.isMook) && ", to: " && ", breaks: "A14" },
  { name: "conditions print in lower case again", file: CR, from: "  return LABELS[key] ?? CONDITIONS[key]?.label ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : \"\");", to: "  return LABELS[key] ?? key;", breaks: "A15" },
  { name: "the cast derives the innate attack regardless", file: CAST, from: "              value: innateAttackHere.value,", to: "              value: innateAttackBonus(innateAbility, innateLevel),", breaks: "B1" },
  { name: "the sheet derives the innate DC regardless", file: SHEET, from: "row.innateSave = innateSaveFor(item, innateAbility, innateLevel).value;", to: "row.innateSave = 0;", breaks: "B2" },
  { name: "the creature's secondary packets are not rolled", file: ATTACK, from: "    ...creatureSecondaryPackets(weapon, targetActor?.system ?? null),\n", to: "", breaks: "B3" },
  { name: "a weapon's after-strikes are not read", file: AFTER, from: "    if (at < 0) specs.push(spec);\n", to: "", breaks: "B4" },
  { name: "the attacker's own affliction is not looked for", file: AFTER, from: "  const own = ownAfflictionItem(actor, affliction);", to: "  const own = null;", breaks: "B4" },
  { name: "a counteract reads only the type", file: SPELLS, from: "            && afflictionCounteredBy(i, kinds));", to: "            && kinds.includes(String(i.system?.afflictionType ?? \"\").toLowerCase()));", breaks: "B5" },
  { name: "the emitter is never submerged", file: AURAWF, from: "e.getFlag?.(SYSTEM_ID, \"submerged\")) ? [\"submerged\"] : []),", to: "e.getFlag?.(SYSTEM_ID, \"submergedNever\")) ? [\"submerged\"] : []),", breaks: "B6" },
  { name: "the failure lays no Mucus-Bound", file: AURAWF, from: "    lines.push(await applyAuraTraitEffect(actor, aura.traitEffect, { source: emitterToken?.name ?? aura.name }));", to: "", breaks: "B6" },
  { name: "Mucus-Bound grants no trait", file: TRAITFX, from: "grantedTraits: effect.traits, [END_TIME_FLAG]: now + effect.seconds", to: "[END_TIME_FLAG]: now + effect.seconds", breaks: "B7" },
  { name: "Mucus-Bound's end leaves the breath as it was", file: INIT, from: "  registerAuraTraitEffectHooks();\n", to: "", breaks: "B7" },
  { name: "further packets take full damage on a save", file: PERIL, from: "        const extraAmount = Math.floor(extra.roll.total * bs.damageMultiplier);", to: "        const extraAmount = extra.roll.total;", breaks: "B8" },
  { name: "High Magic's +2 never reaches the DC", file: CAST, from: "      + highMagicSaveStep(actor, { printed: innateSaveHere?.printed === true })\n      + harmonyHere;", to: "      + harmonyHere;", breaks: "B9" },
  { name: "the EL adjustment fills no pool", file: ACTOR, from: "    for (const { path, entry } of elAdjustRows(system, elAdjustOf(this))) this.addBonus(path, entry);\n", to: "", breaks: "B10" },
  { name: "the EL adjustment adds no HP", file: ACTOR, from: "  if (elHP) hp.max = Math.max(1, hp.max + elHP);", to: "", breaks: "B10" },
  { name: "the EL field leaves the sheet", file: TPL, from: "                name=\"flags.trg-prime.elAdjust\"", to: "                name=\"flags.trg-prime.elAdjustX\"", breaks: "B10" },
  { name: "death says nothing of the home plane", file: DEATH, from: "    out.extraplanar = await announceExtraplanarDestruction(actor);", to: "", breaks: "B11" },
  { name: "a Large creature is reached only by its centre", file: CA, from: " + Math.max(0, (Number(subject.widthFeet) || 5) - 5) / 2;", to: ";", breaks: "A16" },
  { name: "the aligned label repeats its word", file: SEC, from: "(${aligned ? dice : `${dice} ${type}`})", to: "(${dice} ${type})", breaks: "A17" },
  { name: "the mook is reaped while only dying", file: EPWF, from: "  await actor.toggleStatusEffect(\"dying\", { active: true, value: fatal });\n", to: "", breaks: "B12" },
  { name: "the card hides High Magic's +2", file: CAST, from: " ? \" (+2 High Magic)\" : \"\"", to: " ? \"\" : \"\"", breaks: "B13" },
  { name: "the Extraplanar setting is gone", file: SETTINGS, from: "  game.settings.register(SYSTEM_ID, \"extraplanarDestruction\", {", to: "  game.settings.register(SYSTEM_ID, \"extraplanarDestructionX\", {", breaks: "B11" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block3.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block3: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block3: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block3: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
