#!/usr/bin/env node
/**
 * mutate-ff30-block20 — the mutation half of verify-ff30-block20 (3.653.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CS = m("change-shape.mjs"), DA = m("combat", "declared-after-strikes.mjs"), TS = m("creature-turn-start.mjs"), CAR = m("creature-ability-rules.mjs"),
  CW = m("codex-actions-workflow.mjs"), AW = m("creature-aura-workflow.mjs"), EX = m("combat", "exhaustion-workflow.mjs"),
  CK = m("dice", "check.mjs"), CSW = m("magic", "condition-save-workflow.mjs");
const MUTATIONS = [
  { name: "the set-aside names are not read", file: CS, from: "    suppresses: names(raw.suppresses)\n", to: "    suppresses: []\n", breaks: "B1" },
  { name: "a bracketed name is missed", file: CS, from: "    return n === w || n.startsWith(`${w} (`);", to: "    return n === w;", breaks: "B2" },
  { name: "a lookalike is caught", file: CS, from: "    return n === w || n.startsWith(`${w} (`);", to: "    return n.startsWith(w);", breaks: "B2" },
  { name: "a weapon is set aside", file: CS, from: "filter((i) => [\"ability\", \"feat\"].includes(i?.type) && want.some(", to: "filter((i) => want.some(", breaks: "B2" },
  { name: "the card is silent about it", file: CS, from: "  if (form.suppresses?.length) bits.push(`without ${form.suppresses.join(\", \")}`);\n", to: "", breaks: "B4" },
  { name: "the venom fires on a blow that did nothing", file: DA, from: "  if (spec.requiresDamage && !(Number(ctx.damageTaken) > 0)) return false;\n", to: "", breaks: "B6" },
  { name: "the damage gate is not read", file: DA, from: "    requiresDamage: raw.requiresDamage === true,", to: "    requiresDamage: false,", breaks: "B6" },
  { name: "every Exhaustion check is advantaged", file: CAR, from: "  if (String(environment ?? \"\") !== \"extremeHeat\") return null;\n  for (const { item, derives } of abilityDerives(items)) if (derives.heatExhaustionAdvantage === true)", to: "  for (const { item, derives } of abilityDerives(items)) if (derives.heatExhaustionAdvantage === true)", breaks: "B7" },
  { name: "the level always heals", file: TS, from: "      const amount = printed ?? regenerationHealing(level);", to: "      const amount = regenerationHealing(level);", breaks: "B8" },
  { name: "a zero amount is printed", file: TS, from: "  return Number.isFinite(n) && n > 0 ? n : null;", to: "  return Number.isFinite(n) ? n : null;", breaks: "B8" },
  { name: "the card says the level anyway", file: TS, from: "(${printed !== null ? \"as printed\" : `level ${", to: "(${false ? \"as printed\" : `level ${", breaks: "B9" },
  { name: "the abilities are never set aside", file: CW, from: "    if (aside.length) await actor.deleteEmbeddedDocuments(\"Item\", aside.map((i) => i.id));\n", to: "", breaks: "S1" },
  { name: "nothing is kept to give back", file: CW, from: "    if (aside.length) data.flags[SYSTEM_ID][CHANGE_SHAPE_FLAG].stashed = aside.map((i) => i.toObject());\n", to: "", breaks: "S1" },
  { name: "leaving the form gives nothing back", file: CW, from: "  await restoreStashedItems(actor, current);\n", to: "", breaks: "S2" },
  { name: "the form is not marked as left", file: CW, from: "  await current.update({ [`flags.${SYSTEM_ID}.${CHANGE_SHAPE_FLAG}.left`]: true });\n", to: "", breaks: "S2" },
  { name: "saves roll a bare die again (what 3.653.0 did)", file: CK, from: "      config = withCheckModifiers(config);\n", to: "", breaks: "S6" },
  { name: "a stated modifier replaces the save", file: CSW, from: "modifiers: [...saveRowsFor(actor, spec.save), { label: spec.label", to: "modifiers: [{ label: spec.label", breaks: "S6" },
  { name: "the hook undoes the next form's Strikes", file: CW, from: "    if (!was || was.left) return;", to: "    if (!was) return;", breaks: "S7" },
  { name: "a form removed by hand leaves the Bite off", file: CW, from: "    if (back.length) await actor.updateEmbeddedDocuments(\"Item\", back);\n    if (Number(was.priorTokenSize) > 0) await resizeActorTokens(actor, Number(was.priorTokenSize));", to: "    if (Number(was.priorTokenSize) > 0) await resizeActorTokens(actor, Number(was.priorTokenSize));", breaks: "S7" },
  { name: "the permanent condition keeps its minute", file: CSW, from: "          \"duration.value\": null\n", to: "          duration: { seconds: null, rounds: null }\n", breaks: "S8" },
  { name: "they come back twice", file: CW, from: "  const missing = stashed.filter((d) => !actor.items?.get?.(d._id));", to: "  const missing = stashed;", breaks: "S2" },
  { name: "the flag is not cleared first", file: CW, from: "  if (effect.id && actor.effects?.get?.(effect.id)) await effect.update({ [`flags.${SYSTEM_ID}.${CHANGE_SHAPE_FLAG}.stashed`]: [] });\n", to: "", breaks: "S2" },
  { name: "the hand-removed effect keeps them", file: CW, from: "    if (Array.isArray(stashed) && stashed.length) await restoreStashedItems(actor, effect);\n", to: "", breaks: "S3" },
  { name: "the aura's ladder re-save has no DC", file: AW, from: "    : tag.conditionSave ? { ...tag, conditionSave: { save, label: aura.name, ...tag.conditionSave, saveDC: dc } } : tag));", to: "    : tag));", breaks: "S4" },
  { name: "the heat gives no advantage", file: EX, from: "    ...(heatAdvantage ? { bias: \"advantage\" } : {}),\n", to: "", breaks: "S5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block20.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block20: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block20: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block20: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
