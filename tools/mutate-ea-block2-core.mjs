#!/usr/bin/env node
/** mutate-ea-block2-core — the mutation half of verify-ea-block2-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const HM = m("magic", "high-magic.mjs"), CAST = m("magic", "cast-workflow.mjs"), HOOKS = m("magic", "cast-hooks.mjs"),
  CDC = m("magic", "casting-dc.mjs"), API = m("module-api.mjs"), AE = m("documents", "active-effect.mjs"), COND = m("conditionals.mjs"),
  SJ = path.join(SYSTEM_ROOT, "system.json"), AW = m("combat", "action-workflow.mjs"), APW = m("module-api-workflow.mjs"), CIW = m("charged-items-workflow.mjs");

const MUTATIONS = [
  // D1b
  { name: "THE RULING UNDONE: the creature guideline survives Eldritch Arts' rules (save +2)", file: HM, from: "  return isHighMagic(actor) && !printed && !supersededGuideline() ? HIGH_MAGIC_SAVE_DC : 0;", to: "  return isHighMagic(actor) && !printed ? HIGH_MAGIC_SAVE_DC : 0;", breaks: "D1b" },
  { name: "the free Heighten survives", file: HM, from: "  return Boolean(chosen) || (isHighMagic(actor) && !supersededGuideline());", to: "  return Boolean(chosen) || isHighMagic(actor);", breaks: "D1b" },
  { name: "the creature keeps +50", file: HM, from: "  return supersededGuideline() ? ELDRITCH_HIGH_MAGIC_FUMBLE : HIGH_MAGIC_FUMBLE;", to: "  return HIGH_MAGIC_FUMBLE;", breaks: "D1b" },
  { name: "a creature's cast is never High Magic", file: HM, from: "  if (isHighMagic(actor) && supersededGuideline()) return", to: "  if (false && isHighMagic(actor) && supersededGuideline()) return", breaks: "D1b" },
  { name: "the guideline is superseded without Eldritch Arts", file: HM, from: "  return Boolean(registeredHighMagicRules());", to: "  return true;", breaks: "D1b" },
  // D1
  { name: "THE GAP: a Highmagic spell cast by a wizard is low magic", file: HM, from: "  if (spellIsHighmagic(spellData)) return { highMagic: true, source: \"trait\", label: \"Highmagic spell\" };\n", to: "", breaks: "D1" },
  { name: "a High Magic caster's spells are low magic", file: HM, from: "  if (declaresHighMagicCaster(actor)) return { highMagic: true, source: \"caster\", label: \"High Magic caster\" };\n", to: "", breaks: "D1" },
  { name: "High Magic is Very Hard", file: HM, from: "const HIGH_MAGIC_DC_STEP = 2;", to: "const HIGH_MAGIC_DC_STEP = 5;", breaks: "D1" },
  { name: "armour is DR × 2", file: HM, from: "const HIGH_MAGIC_ARMOUR_MULTIPLIER = 4;", to: "const HIGH_MAGIC_ARMOUR_MULTIPLIER = 2;", breaks: "D1" },
  { name: "Q3 undone: a creature's flag brings the armour rule", file: HM, from: "  return Boolean(cast?.highMagic) && cast.source !== \"creature\";", to: "  return Boolean(cast?.highMagic);", breaks: "D1" },
  { name: "Q2 undone: the Archmage loses the focus too", file: HM, from: "  return Boolean(cast?.highMagic) && !highMagicFocusAllowed(actor);", to: "  return Boolean(cast?.highMagic);", breaks: "D1" },
  { name: "the fumble is +50 for a High Magic cast", file: HM, from: "const ELDRITCH_HIGH_MAGIC_FUMBLE = 60;", to: "const ELDRITCH_HIGH_MAGIC_FUMBLE = 50;", breaks: "D1" },
  { name: "Q4 undone: an all-traditions spell fumbles by nothing", file: HM, from: "fumbleTradition: String(casterTradition ?? \"\").trim().toLowerCase() || tradition };", to: "fumbleTradition: ALL_TRADITIONS };", breaks: "D1" },
  { name: "M27 undone: a Highmagic spell is no tradition", file: HM, from: "  return { traditions: ALL_TRADITIONS, fumbleTradition:", to: "  return { traditions: tradition, fumbleTradition:", breaks: "D1" },
  { name: "the DC never takes Hard", file: CDC, from: "  dc += push(parts, \"High Magic, Hard\", int(highMagicDelta));\n", to: "", breaks: "D1" },
  { name: "the armour row is unlabelled", file: CDC, from: "  dc += push(parts, armourLabel || \"Prohibited armour\", Math.max(0, int(armourPenalty)));", to: "  dc += push(parts, \"Prohibited armour\", Math.max(0, int(armourPenalty)));", breaks: "D1" },
  { name: "the cast keeps the tradition's armour rule", file: CAST, from: "    ? highMagicArmourPenalty(equippedArmour)\n", to: "    ? armourCastingPenalty(tradition, penalisingArmour)\n", breaks: "D1" },
  { name: "the cast never passes Hard", file: CAST, from: "    highMagicDelta: highMagicCastingDCStep(hmCast),\n", to: "", breaks: "D1" },
  { name: "the focus is still used", file: CAST, from: "  const focusMod = focusSetAside ? null : focusCheckModifier(system.magic);", to: "  const focusMod = focusCheckModifier(system.magic);", breaks: "D1" },
  { name: "the focus's fumble +10 is still added", file: CAST, from: "      focusPenalty: focusSetAside ? 0 : focusFumblePenalty(system.magic),", to: "      focusPenalty: focusFumblePenalty(system.magic),", breaks: "D1" },
  { name: "the fumble is not told it is High Magic", file: CAST, from: "      highMagic: hmCast,\n", to: "", breaks: "D1" },
  { name: "the fumble ignores the cast", file: CAST, from: "  const highMagicMod = highMagicFumble(actor, highMagic);", to: "  const highMagicMod = highMagicFumble(actor);", breaks: "D1" },
  { name: "the check's traditions are the spell's own", file: CAST, from: "    traditions: hmTraditions.traditions,", to: "    traditions: tradition,", breaks: "D1" },
  // D6
  { name: "THE GAP: High Magic's Resonance rolled once", file: CAST, from: "      if (!worse || drawn++ > 0) return first;", to: "      if (true || drawn++ > 0) return first;", breaks: "D6" },
  { name: "disadvantage keeps the lower", file: CAST, from: "      return keptPercentile(first, second, rollBias);", to: "      return Math.min(first, second);", breaks: "D6" },
  { name: "the open-ended rest is rolled twice too", file: CAST, from: "      if (!worse || drawn++ > 0) return first;", to: "      if (!worse) return first;", breaks: "D6" },
  { name: "the Resonance context forgets High Magic", file: CAST, from: "    ...(hmCast.highMagic ? { highMagic: true } : {}),\n", to: "", breaks: "D1" }, // re-anchored at 3.684.0 (G5's `cast` follows it)
  { name: "a suppressed event is rolled anyway", file: CAST, from: "    if (suppressed) {\n      await postCard(actor, \"Magical Resonance Event\", [", to: "    if (false) {\n      await postCard(actor, \"Magical Resonance Event\", [", breaks: "D6" },
  { name: "a throwing suppressor stops the others", file: HOOKS, from: "      console.error(\"TRG Prime | a module's Resonance suppressor failed\", err);\n", to: "      return \"failed\";\n", breaks: "D6" },
  // D7
  { name: "THE GAP: no module may refuse a casting", file: CAST, from: "    if (refused) {\n      ui.notifications.warn(refused);\n      return null;\n    }\n", to: "", breaks: "D7" },
  { name: "a blank refusal stops the others", file: HOOKS, from: "      if (typeof reason === \"string\" && reason.trim()) return reason.trim();\n    } catch (err) {\n      console.error(\"TRG Prime | a module's cast refusal failed\", err);", to: "      if (typeof reason === \"string\") return reason.trim();\n    } catch (err) {\n      console.error(\"TRG Prime | a module's cast refusal failed\", err);", breaks: "D7" },
  { name: "THE GAP: the degree is never remapped", file: CAST, from: "    degree = remapped.degree;\n", to: "", breaks: "D7" },
  { name: "an unknown degree is accepted", file: HOOKS, from: "      if (CAST_DEGREES.includes(next)) degree = next;", to: "      if (next) degree = next;", breaks: "D7" },
  { name: "remaps each see the rolled degree, not the last one's", file: HOOKS, from: "      const out = await remap({ ...ctx, degree });", to: "      const out = await remap({ ...ctx });", breaks: "D7" },
  { name: "the remap's lines are lost", file: CAST, from: "  const lines = [...reagentLines, ...gateLines, ...degreeRemapLines.map((text) => line(text)),", to: "  const lines = [...reagentLines, ...gateLines,", breaks: "D7" },
  { name: "the hook does not say chaos", file: CAST, from: "    chaos, innate: isInnate, rollsCheck: !isInnate && !noCheckCantrip,\n", to: "    innate: isInnate, rollsCheck: !isInnate && !noCheckCantrip,\n", breaks: "D7" },
  // D14
  { name: "THE GAP: isSuppressed never asks the module", file: AE, from: "    if (effectSuppressedByModule(this)) return true;\n", to: "", breaks: "D14" },
  { name: "the module's answer is ignored", file: HOOKS, from: "      if (suppressed(effect) === true) return true;", to: "      suppressed(effect);", breaks: "D14" },
  { name: "a suppressed effect's conditionals still apply", file: COND, from: "      if (kind === \"effect\" && (document?.disabled || document?.isSuppressed === true)) continue;", to: "      if (kind === \"effect\" && document?.disabled) continue;", breaks: "D14" },
  { name: "the registry drops effect suppressors", file: API, from: "  registry.effectSuppressors.set(k, suppressed);", to: "", breaks: "D14" },
  // A1
  { name: "THE GAP: a module action's own DC is never asked", file: AW, from: "      own = await action.resolveDC({ actor, targetActor });\n", to: "", breaks: "A1" },
  { name: "the module's DC is ignored", file: AW, from: "      resolved.dc = Number(own.dc);\n", to: "", breaks: "A1" },
  { name: "a refusal rolls anyway", file: AW, from: "      ui.notifications.warn(`${action.name}: ${own.refused}`);\n      return null;\n", to: "      ui.notifications.warn(`${action.name}: ${own.refused}`);\n", breaks: "A1" },
  // H and the gate's context
  { name: "the gates are not told High Magic", file: CAST, from: "    highMagic: hmCast.highMagic,\n", to: "", breaks: "D1" },
  { name: "the helpers lose rollResonanceEvent", file: APW, from: "      rollResonanceEvent: async (...args) => (await import(\"./magic/cast-workflow.mjs\")).rollResonanceEvent(...args),\n", to: "", breaks: "H" },
  { name: "the helpers lose regionContains", file: APW, from: "      regionContains: async (...args) => (await import(\"./combat/surfaces.mjs\")).regionContains(...args),\n", to: "", breaks: "H" },
  // D7b
  { name: "THE DEFECT: the settled hook does not say a check was rolled", file: CAST, from: "    chaos, rollsCheck: !isInnate && !noCheckCantrip, ritual: Boolean(ritual), highMagic: hmCast.highMagic, disrupted: castDisrupted,\n    // AND WHAT A SOURCEBOOK ASKED OF IT", to: "    // AND WHAT A SOURCEBOOK ASKED OF IT", breaks: "D7b" },
  { name: "THE GAP: a release check says nothing", file: CIW, from: "  globalThis.Hooks?.callAll?.(\"trgPrimeReleaseRolled\", {", to: "  globalThis.Hooks?.callAll?.(\"trgPrimeReleaseRolledX\", {", breaks: "D7b" },
  { name: "the identification line is lost", file: CAST, from: "it registers simply as magic, and identifying it is Very Hard (DC +5).", to: "it registers simply as magic.", breaks: "D1" },
  // Z
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.687.1\"", to: "\"version\": \"3.677.1\"", breaks: "Z" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block2-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block2-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block2-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block2-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
