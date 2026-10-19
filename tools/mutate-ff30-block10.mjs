#!/usr/bin/env node
/**
 * mutate-ff30-block10 — the mutation half of verify-ff30-block10 (3.640.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AU = m("creature-auras.mjs"), AW = m("creature-aura-workflow.mjs"), AL = m("ally-aura-effects.mjs"), ALW = m("ally-aura-effects-workflow.mjs");
const TH = m("magic", "thorns.mjs"), THW = m("magic", "thorns-workflow.mjs"), PE = m("peril-effect.mjs"), PW = m("peril-workflow.mjs");
const R = m("codex-action-rules.mjs"), CX = m("codex-actions-workflow.mjs"), CA = m("combat", "compound-action.mjs"), CW = m("combat", "compound-action-workflow.mjs");
const AT = m("combat", "attack-workflow.mjs"), DA = m("combat", "declared-after-strikes.mjs");

const MUTATIONS = [
  { name: "full damage is halved again", file: AU, from: "  if (damage?.fullDamage) m = Math.max(1, m);", to: "", breaks: "A1" },
  { name: "a held creature is not doubled", file: AU, from: "  if (damage?.doubleIfGrabbedBy && grabbedByEmitter) m *= 2;", to: "", breaks: "A1" },
  { name: "the aura never turns", file: AU, from: "  const lessened = Number(ownTaken) < Number(reactiveTaken);", to: "  const lessened = false;", breaks: "A2" },
  { name: "the workflow ignores the hold", file: AW, from: "const multiplier = auraDamageMultiplier(aura.damage, bs.damageMultiplier, { grabbedByEmitter });", to: "const multiplier = bs.damageMultiplier;", breaks: "A3" },
  { name: "the emitter's turn never ends the turn", file: AW, from: "if (trigger === \"turnStart\" && token.actor?.getFlag?.(SYSTEM_ID, AURA_REACTIVE_FLAG)) await token.actor.unsetFlag", to: "if (false) await token.actor.unsetFlag", breaks: "A3" },
  { name: "enemies get the ally's bonus", file: AL, from: "const effect = opposed ? aura.enemyEffect : aura.allyEffect;", to: "const effect = aura.allyEffect;", breaks: "A4" },
  { name: "the enemy grant shares the ally's key", file: AL, from: "${opposed ? \":enemy\" : \"\"}", to: "", breaks: "A4" },
  { name: "an enemy-only aura is never synced", file: ALW, from: "a.kind === \"ally\" && (a.allyEffect || a.enemyEffect)", to: "a.kind === \"ally\" && a.allyEffect", breaks: "A5" },
  { name: "an outcome-only ladder never rolls", file: AU, from: "    || (aura?.rollOutcomes && Object.keys(aura?.outcomes ?? {}).length)));", to: "));", breaks: "A6" },
  { name: "a rolled save is not read", file: TH, from: "saveRoll: raw.save && typeof raw.save === \"object\"", to: "saveRoll: false && typeof raw.save === \"object\"", breaks: "T1" },
  { name: "3d8+10 is refused", file: TH, from: "const DICE_OR_FLAT = /^(?:[1-9]\\d*d[1-9]\\d*(?:[+-]\\d+)?|[1-9]\\d*)$/i;", to: "const DICE_OR_FLAT = /^(?:[1-9]\\d*d[1-9]\\d*|[1-9]\\d*)$/i;", breaks: "T1" },
  { name: "the Balor's flames are halved by the save", file: TH, from: "  return spec?.saveRoll?.avoidsCriticalOnly ? Math.max(1, m) : m;", to: "  return m;", breaks: "T2" },
  { name: "thorns read only the actor's own effects", file: THW, from: "for (const effect of actor?.appliedEffects ?? actor?.effects ?? [])", to: "for (const effect of actor?.effects ?? [])", breaks: "T3" },
  { name: "a death area with no save is offered", file: R, from: "if (area && typeof area === \"object\" && (area.save || area.expose?.affliction)) out.push", to: "if (area && typeof area === \"object\") out.push", breaks: "D1" },
  { name: "the death card can be pressed twice", file: CX, from: "await message.setFlag(SYSTEM_ID, \"deathArea\", { ...spec, used: true });", to: "", breaks: "D2" },
  { name: "a number reads as dice", file: PE, from: "return typeof value === \"string\" && /", to: "return /", breaks: "V1" },
  { name: "nobody is passed over by kind", file: PE, from: "  return want.find((k) => have.has(k)) ?? \"\";", to: "  return \"\";", breaks: "V2" },
  { name: "a recurring row loses its type", file: DA, from: "  if (row?.damageType) tag.damageType = String(row.damageType).trim().toLowerCase();", to: "", breaks: "V3" },
  { name: "the area applies the dice string", file: PW, from: "if (isDiceValue(tag.value)) { const r = await new Roll", to: "if (false) { const r = await new Roll", breaks: "V4" },
  { name: "the cap is ignored", file: R, from: "  return Math.max(0, Math.min(add, cap - Math.max(0, Number(existing) || 0)));", to: "  return add;", breaks: "K1" },
  { name: "Embrace rolls the unarmed attack", file: R, from: "  return { ...base, checkType: \"skill\", skills: [skill],", to: "  return { ...base, skills: [skill],", breaks: "K2" },
  { name: "Constrict forgets its riders", file: CX, from: "    lines.push(...await constrictRiders(actor, item, spec, target, applied));\n", to: "", breaks: "K3" },
  { name: "an unlabelled mode is kept", file: CA, from: "filter((m) => m && typeof m === \"object\" && String(m.label ?? \"\").trim())", to: "filter((m) => m && typeof m === \"object\")", breaks: "S1" },
  { name: "per-target counts one", file: CA, from: "  if (strike?.perTarget) return Math.max(1, Math.trunc(Number(targetCount) || 0));", to: "", breaks: "S2" },
  { name: "the critical does not double", file: CA, from: "  return critical && onCritical ? Math.trunc(n * Math.max(1, Number(onCritical.extraDamageMultiplier) || 1)) : n;", to: "  return n;", breaks: "S2" },
  { name: "the strike forgets its flat damage", file: CA, from: "  if (strike?.extraDamage) options.extraFlatDamage = strike.extraDamage;", to: "", breaks: "S3" },
  { name: "the flat damage never reaches the formula", file: AT, from: "  if (compoundFlatTotal) formula += ` + ${compoundFlatTotal}`;", to: "", breaks: "S4" },
  { name: "the user's footprint is ignored", file: PE, from: "  return radius + emitter / 2 + Math.max(0, target - 5) / 2;", to: "  return radius;", breaks: "L1" },
  { name: "the area rail measures centre to centre", file: PW, from: "distance <= areaReachFeet(spec.radiusFeet, emitterWidth, (Number(t.width) || 1) * squareFeet)", to: "distance <= spec.radiusFeet", breaks: "L2" },
  { name: "Unaffected follows the printed line again", file: AW, from: " && !(aura.rollOutcomes && text)\n", to: "\n", breaks: "L3" },
  { name: "the returned blow hides the raw roll", file: THW, from: "rolled ${rawTotal}${rawTotal !== roll.total ? `, ${roll.total} after the save` : \"\"}", to: "rolled ${roll.total}", breaks: "L4" },
  { name: "modes are never asked", file: CW, from: "  const modes = compoundModes(spec);", to: "  const modes = [];", breaks: "S4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block10.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block10: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block10: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block10: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
