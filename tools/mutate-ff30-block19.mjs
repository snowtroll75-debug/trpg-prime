#!/usr/bin/env node
/**
 * mutate-ff30-block19 — the mutation half of verify-ff30-block19 (3.652.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const GO = m("combat", "grab-only.mjs"), ROG = m("rogue.mjs"), LY = m("lycanthrope.mjs"), DA = m("combat", "declared-after-strikes.mjs"),
  ATK = m("combat", "attack-workflow.mjs"), MV = m("combat", "movement-workflow.mjs"), CW = m("codex-actions-workflow.mjs"), DASW = m("combat", "declared-after-strikes-workflow.mjs");
const MUTATIONS = [
  { name: "nothing grabs only", file: GO, from: "  return weapon?.flags?.[SYSTEM_ID]?.creatureAttack?.grabOnly === true;", to: "  return false;", breaks: "B1" },
  { name: "the card forgets the critical", file: GO, from: "deals no damage${critical ? \" and a critical inflicts no injury\" : \"\"}.`;", to: "deals no damage.`;", breaks: "B2" },
  { name: "a bracket hides Stealthy Strike again (what 3.651 did)", file: ROG, from: "const STEALTHY_NAME = /^stealthy strike(?:\\s*\\(([^)]*)\\))?$/;", to: "const STEALTHY_NAME = /^stealthy strike$()/;", breaks: "B3" },
  { name: "a weapon named so counts", file: ROG, from: "  return Array.from(actor?.items ?? []).filter((item) => [\"feat\", \"ability\"].includes(item.type)\n    && STEALTHY_NAME", to: "  return Array.from(actor?.items ?? []).filter((item) => true\n    && STEALTHY_NAME", breaks: "B3" },
  { name: "the printed dice are ignored", file: ROG, from: "  return printed ?? sneakAttackDice(stealthRanks);", to: "  return sneakAttackDice(stealthRanks);", breaks: "B4" },
  { name: "the printed dice beat Sneak Attack's", file: ROG, from: "  const printed = hasSneakAttack(actor) ? null : printedStealthyDice(actor);", to: "  const printed = printedStealthyDice(actor);", breaks: "B4" },
  { name: "any form is a step away", file: LY, from: "  return forms.filter((_, i) => Math.abs(i - at) === 1);", to: "  return others;", breaks: "B5" },
  { name: "the check is at the plain DC", file: LY, from: " + Number(DIFFICULTY_BY_KEY[difficulty]?.modifier ?? 0);", to: ";", breaks: "B6" },
  { name: "a Blunder is a Failure", file: LY, from: "const FOLD = Object.freeze({ heroic: \"critical\", blunder: \"fumble\" });", to: "const FOLD = Object.freeze({ heroic: \"critical\" });", breaks: "B7" },
  { name: "a Failure still changes form", file: LY, from: "changes: !(check?.noChange ?? []).includes(r)", to: "changes: true", breaks: "B7" },
  { name: "a Fumble brings no frenzy", file: LY, from: "frenzy: (check?.frenzy ?? []).includes(r) };", to: "frenzy: false };", breaks: "B7" },
  { name: "the size does not step", file: LY, from: "  return SIZES[Math.max(0, Math.min(SIZES.length - 1, at + Math.trunc(Number(steps) || 0)))];", to: "  return SIZES[at];", breaks: "B9" },
  { name: "the minimum is ignored", file: LY, from: "  return Math.min(0, Math.max(Math.trunc(Number(penalty) || 0), Math.trunc(Number(minimum) || 0) - now));", to: "  return Math.trunc(Number(penalty) || 0);", breaks: "B10" },
  { name: "the frenzy raises a low Intelligence", file: LY, from: "  return Math.min(0, Math.max(", to: "  return (0, Math.max(", breaks: "B10" },
  { name: "the frenzy lays no size", file: LY, from: "  if (size && size !== String(ownSize).toLowerCase()) changes.push(", to: "  if (false) changes.push(", breaks: "B11" },
  { name: "a disabled frenzy still holds", file: LY, from: "  return Array.from(effects ?? []).some((e) => !e?.disabled && e?.", to: "  return Array.from(effects ?? []).some((e) => e?.", breaks: "B12" },
  { name: "the delay never grows harder", file: LY, from: "  for (let i = 0; i < Math.max(0, Math.trunc(Number(prior) || 0)); i += 1) key = stepDifficultyHarder(key);", to: "", breaks: "B13" },
  { name: "a Partial delays too", file: LY, from: "  if (r === \"success\") return spec.delay.successSeconds;", to: "  if (r === \"success\" || r === \"partial\") return spec.delay.successSeconds;", breaks: "B14" },
  { name: "the curse ignores the bleeding", file: DA, from: "    if (!spec.requiresTargetCondition.some((c) => has.has(c))) return false;", to: "", breaks: "B15" },
  { name: "the condition list is dropped", file: DA, from: "    requiresTargetCondition: list(raw.requiresTargetCondition),", to: "    requiresTargetCondition: [],", breaks: "B15" },
  { name: "a grab-only hit grabs nothing", file: ATK, from: "  if (grabOnly && outcome.hits && targetActor) {\n    await applyConditionTags(targetActor, [{ key: \"grabbed\", label: \"Grabbed\" }], {});\n", to: "  if (grabOnly && outcome.hits && targetActor) {\n", breaks: "S1" },
  { name: "a grab-only critical rolls an injury", file: ATK, from: "  const strikeLands = !grabOnly && !hitCondition && !spellCarried;", to: "  const strikeLands = !hitCondition && !spellCarried;", breaks: "S1" },
  { name: "a grab-only hit rolls damage", file: ATK, from: "  if (outcome.hits && strikeLands) {", to: "  if (outcome.hits) {", breaks: "S1" },
  { name: "the attack's dice ignore the print", file: ATK, from: "sneakDice = sneakDiceFor(actor, system.skills?.stealth?.ranks ?? 0);", to: "sneakDice = 1 + Math.floor((system.skills?.stealth?.ranks ?? 0) / 3);", breaks: "S2" },
  { name: "every form is offered", file: CW, from: "  const choices = reachableForms(forms, currentKey, spec.oneStep === true);", to: "  const choices = forms.filter((f) => f.key !== currentKey);", breaks: "S3" },
  { name: "the frenzy does not hold the form", file: CW, from: "  if (inLunaFrenzy(actor.effects)) { ui.notifications?.warn(`${item.name}: ${actor.name} is in a Luna Frenzy", to: "  if (false) { ui.notifications?.warn(`${item.name}: ${actor.name} is in a Luna Frenzy", breaks: "S3" },
  { name: "the degree's AP is not spent", file: CW, from: "    if (!(await spendAp(actor, shift.ap, item.name))) {", to: "    if (!(await spendAp(actor, 0, item.name))) {", breaks: "S3" },
  { name: "a Failure changes form anyway", file: CW, from: "    if (!shift.changes) {\n", to: "    if (false) {\n", breaks: "S4" },
  { name: "the Fumble brings no frenzy", file: CW, from: "    if (frenzyItem) await enterLunaFrenzy(actor, frenzyItem,", to: "    if (false) await enterLunaFrenzy(actor, frenzyItem,", breaks: "S4" },
  { name: "the frenzy stays in the animal form", file: CW, from: "  // \"FORCED TO ENTER ITS HYBRID FORM\": the creature's own stat block.\n  const priorTokenSize = await leaveCurrentForm(actor);", to: "  const priorTokenSize = 0;", breaks: "S5" },
  { name: "the frenzy's rage lasts a minute", file: CW, from: "endsAtWorldTime: null, endsOnRound: null, mustRideOut: true, lunaFrenzy: true", to: "mustRideOut: true, lunaFrenzy: true", breaks: "S5" },
  { name: "Luna Frenzy is not a Codex action", file: CW, from: "lunaFrenzy, heldAdvantage,", to: "heldAdvantage,", breaks: "S5" },
  { name: "a delay is not counted", file: CW, from: "    await actor.setFlag(SYSTEM_ID, LUNA_DELAY_FLAG, { count: prior + 1, until: now() + seconds });", to: "", breaks: "S6" },
  { name: "the token stays a size larger", file: CW, from: "  if (prior > 0) await resizeActorTokens(actor, prior);", to: "", breaks: "S7" },
  { name: "a resize is charged as a Stride again (what 3.652.0 did)", file: MV, from: "  if (RESIZING.has(tokenDocument?.id)) return true;\n", to: "", breaks: "S9" },
  { name: "the resize is never marked", file: MV, from: "  RESIZING.add(tokenDocument.id);\n", to: "", breaks: "S9" },
  { name: "the resize is written as a walk", file: MV, from: "width: side, height: side, action: \"displace\" }", to: "width: side, height: side }", breaks: "S9" },
  { name: "forms resize as a move", file: CW, from: "    if (doc?.update) await resizeTokenInPlace(doc, side);", to: "    if (doc?.update) await doc.update({ width: side, height: side });", breaks: "S9" },
  { name: "the frenzy's rage keeps its minute (what 3.652.0 did)", file: CW, from: "await rage.update({ \"duration.value\": null, ", to: "await rage.update({ duration: { seconds: null }, ", breaks: "S10" },
  { name: "the frenzy reads the animating width", file: CW, from: "[LUNA_FRENZY_FLAG].priorTokenSize = Number(priorTokenSize) || Number(SIZE_FOOTPRINT?.[ownSize.toLowerCase()]) || Number(own.width) || 1;", to: "[LUNA_FRENZY_FLAG].priorTokenSize = Number(priorTokenSize) || Number(own.width) || 1;", breaks: "S11" },
  { name: "the target's conditions are not read", file: DASW, from: "      ? Array.from(targetActor.effects ?? []).filter((e) => !e.disabled).flatMap((e) => Array.from(e.statuses ?? []))", to: "      ? []", breaks: "S8" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block19.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block19: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block19: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block19: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
