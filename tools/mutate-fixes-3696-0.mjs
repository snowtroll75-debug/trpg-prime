#!/usr/bin/env node
/** mutate-fixes-3696-0 — the mutation half of verify-fixes-3696-0 (3.696.0: CD1–CD9 and CD12 of the Pillars of Faith audit). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RX = M("reactions", "reactions-workflow.mjs");
const DR = M("combat", "damage-riders.mjs");
const AW = M("combat", "attack-workflow.mjs");
const CW = M("magic", "cast-workflow.mjs");
const CR = M("magic", "counteract-row.mjs");
const CH = M("magic", "counteract-workflow-choice.mjs");
const SFX = M("magic", "spell-effects.mjs");
const DV = M("combat", "dr-versus.mjs");
const DW = M("combat", "damage-workflow.mjs");
const AT = M("combat", "attack.mjs");
const SF = M("skill-feats.mjs");
const AC = M("combat", "action-workflow.mjs");
const CURE = M("affliction-countered.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "CD1 the tie keeps the first", file: RX, from: "  return Number(first?.total ?? -Infinity) > Number(second?.total ?? -Infinity);", to: "  return Number(first?.total ?? -Infinity) >= Number(second?.total ?? -Infinity);" },
  { name: "CD1 the degree is ignored", file: RX, from: "  if (rank(first) !== rank(second)) return rank(first) > rank(second);\n", to: "" },
  { name: "CD1 advantage never set", file: RX, from: "      check.bias = resolveBias(check.bias, [\"advantage\"], BIAS);\n    }\n    let next = check;", to: "    }\n    let next = check;" },
  { name: "CD1 the first never restored", file: RX, from: "        check.outcome = first;\n", to: "" },
  { name: "CD2 a critical-only rider is refused", file: DR, from: "    if (!match && !critOnly) continue;", to: "    if (!match) continue;" },
  { name: "CD2 a critical-only rider joins the blow", file: DR, from: "    if (r.count === 0) return false;\n", to: "" },
  { name: "CD2 a rider with neither dice nor critical is kept", file: DR, from: "    if (critOnly && !row.onCritical) continue;\n", to: "" },
  { name: "CD12 the spell-class filter ignored", file: DR, from: "    if (!rider.spellClasses.some((c) => by.includes(c))) return false;", to: "" },
  { name: "CD12 a list spell counted as nobody's", file: DR, from: "  return (casterClasses ?? []).map((c) => String(c ?? \"\")).filter(Boolean);", to: "  return [];" },
  { name: "CD12 an innate spell counted as the class's", file: DR, from: "  if (spellSystem?.innate) return [];\n", to: "" },
  { name: "CD12 the cast hands no classes", file: path.join("module", "magic", "cast-workflow.mjs"), from: "spellClass: spellCastingClasses(spell?.system ?? {}, Array.from(actor?.items ?? []).filter((i) => i.type === \"class\").map((i) => i.name)),", to: "spellClass: \"\"," },
  { name: "CD12 the spell-class list dropped", file: DR, from: "    if (classes.length) row.spellClasses = classes;", to: "" },
  { name: "CD6 a shield's maneuver read as a weapon's proficiency", file: path.join("module", "combat", "attack-workflow.mjs"), from: '{ type: weapon.type === "shield" ? "shield" : "weapon", name: weapon.name, system: weaponData, flags: weapon.flags }', to: '{ type: "weapon", name: weapon.name, system: weaponData, flags: weapon.flags }' },
  { name: "L1 a typed rider's line reads as the weapon's", file: path.join("module", "combat", "attack-workflow.mjs"), from: '${rider.damageType ? ` — ${rider.damageType}, rolled as its own packet` : ""}.`));', to: '.`));' },
  { name: "L2 the critical effect named twice", file: path.join("module", "combat", "attack-workflow.mjs"), from: "said.push(effectName.startsWith(labelled) ? effectName.slice(labelled.length) : effectName || rider.onCritical.label);", to: "said.push(effectName || rider.onCritical.label);" },
  { name: "L3 the title says unarmed", file: path.join("module", "combat", "action-workflow.mjs"), from: "label: `${action.name} — ${madeWith || kind.label}`,", to: "label: `${action.name} — ${kind.label}`," },
  { name: "CD2 the weapon filter ignored", file: DR, from: "  if ((rider.weaponNames ?? []).length && (spell || !rider.weaponNames.some((n) => name === n || name.startsWith(`${n} `) || name.startsWith(`${n}(`)))) return false;\n", to: "" },
  { name: "CD2 the living filter ignored", file: DR, from: "  if (rider.targetLiving && !living) return false;\n", to: "" },
  { name: "CD2 a typed rider joins the weapon's formula", file: DR, from: "  return (riders ?? []).filter((r) => !r.damageType).map((r) => ` + ${r.dice}`).join(\"\");", to: "  return (riders ?? []).map((r) => ` + ${r.dice}`).join(\"\");" },
  { name: "CD2 the Strike does not say the weapon", file: AW, from: "      weaponName: weapon?.name ?? \"\",\n      living: targetActor ? isLivingCreature(targetActor.system ?? {}) : true", to: "      living: targetActor ? isLivingCreature(targetActor.system ?? {}) : true" },
  { name: "CD2 typed riders never packeted", file: AW, from: "    ...(replacingFlat ? [] : typedRiderPackets(damageRiders ?? []))\n", to: "" },
  { name: "CD2 criticals lay nothing", file: AW, from: "        if (rider.onCritical.conditions.length) {", to: "        if (false) {" },
  { name: "CD12 the spell path never asks the strike riders", file: CW, from: "  const strikeHP = taken > 0 ? await applySpellStrikeRiders(actor, spell, target, { damageType, rolls, lines }) : null;", to: "  const strikeHP = null;" },
  { name: "CD12 a spell takes every strike rider", file: DR, from: "  if (spell && !rider.spells) return false;\n", to: "" },
  { name: "CD12 the spell spends no marker", file: CW, from: "  const burnt = ridersBurnUpdate(joining, used);", to: "  const burnt = null;" },
  { name: "CD3 confirm not read", file: CR, from: "confirm: raw.confirm === true };", to: "confirm: false };" },
  { name: "CD3 the warp ignored", file: CR, from: "  return base + Math.max(0, Math.trunc(Number(bonus) || 0));", to: "  return base;" },
  { name: "CD3 an unlimited row capped", file: CR, from: "  if (!base) return 0;\n", to: "" },
  { name: "CD3 a confirming row with one candidate is not asked", file: SFX, from: "if (held.length && (spec.confirm || (rowLimit && held.length > rowLimit))) {", to: "if (held.length && (rowLimit && held.length > rowLimit)) {" },
  { name: "CD3 the cap ignored", file: CH, from: "    if (out.length >= Math.max(1, cap)) break;\n", to: "" },
  { name: "CD3 no 'none of these'", file: CH, from: "      ...(confirm ? [{ action: \"none\", label: \"None of these\", callback: () => [] }] : []),\n", to: "" },
  { name: "CD4 any type", file: DV, from: "      if (String(key).trim().toLowerCase() !== want) continue;\n", to: "" },
  { name: "CD4 suppressed effects count", file: DV, from: "    if (!effect || effect.disabled || effect.isSuppressed) continue;", to: "    if (!effect || effect.disabled) continue;" },
  { name: "CD4 the damage path does not read it", file: DW, from: "  const swarmDr = attackerIsSwarm ? swarmReducedDR(penalisedDr + versusDr) : penalisedDr + versusDr;", to: "  const swarmDr = attackerIsSwarm ? swarmReducedDR(penalisedDr) : penalisedDr;" },
  { name: "CD6 shields never considered", file: AT, from: "  ) ?? bashTraitShield(weapons, traitName);", to: "  ) ?? null;" },
  { name: "CD6 an unequipped shield bashes", file: AT, from: "  return (items ?? []).find((item) => item.type === \"shield\" && item.system?.equipped", to: "  return (items ?? []).find((item) => item.type === \"shield\"" },
  { name: "CD7 the degree ignored", file: SF, from: "    const match = (declared ?? []).find((u) => u.actionKey === key && u.degree === rolled && Number.isFinite(u.bonusValue));", to: "    const match = (declared ?? []).find((u) => u.actionKey === key && Number.isFinite(u.bonusValue));" },
  { name: "CD7 the outcome keeps its own value", file: AC, from: "        const raised = degreeBonusFor(action.key, degree, featNames);", to: "        const raised = null;" },
  { name: "CD9 no announcement", file: SFX, from: "            globalThis.Hooks?.callAll?.(\"trgPrimeSpellHealed\",", to: "            globalThis.Hooks?.callAll?.(\"trgPrimeSpellHealedX\"," },
  { name: "BL the cure step rolled openly", file: SFX, from: "...(cureIsOrdered(chosen) ? { rollMode: BLIND_ROLL_MODE } : {})", to: "...({})" },
  { name: "BL any affliction is ordered", file: CURE, from: "  return Boolean(cureSequenceOf(item));", to: "  return true;" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.706.0\"", to: "\"version\": \"3.695.0\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3696-0.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-fixes-3696-0: verify-fixes-3696-0 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3696-0: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3696-0: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
