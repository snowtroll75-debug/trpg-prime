#!/usr/bin/env node
/**
 * mutate-ff30-block18 — the mutation half of verify-ff30-block18 (3.651.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const GG = m("combat", "grab-gate.mjs"), AM = m("combat", "aura-move-limits.mjs"), CA = m("creature-auras.mjs"), CS = m("change-shape.mjs"),
  DA = m("combat", "declared-after-strikes.mjs"), IF = m("magic", "innate-frequency.mjs"), ATK = m("combat", "attack-workflow.mjs"),
  ROG = m("rogue.mjs"), AW = m("creature-aura-workflow.mjs"), MV = m("combat", "movement-workflow.mjs"), CW = m("codex-actions-workflow.mjs"),
  ACT = m("documents", "actor.mjs"), DASW = m("combat", "declared-after-strikes-workflow.mjs"), CAST = m("magic", "cast-workflow.mjs");
const MUTATIONS = [
  { name: "the Bite strikes anyone", file: GG, from: "  if (!grabbedOnly(weapon)) return \"\";", to: "  return \"\";", breaks: "B1" },
  { name: "anyone's grab will do", file: GG, from: "  if (target.grabbed && String(target.grabbedByUuid ?? \"\") === String(attacker?.uuid ?? \"\")) return \"\";", to: "  if (target.grabbed) return \"\";", breaks: "B1" },
  { name: "the rung limits are not read", file: CA, from: "    moveLimits: normaliseMoveLimits(raw.moveLimits),", to: "    moveLimits: null,", breaks: "B2" },
  { name: "a limits-only aura still does not roll (what 3.650 did)", file: CA, from: "    || aura?.moveLimits\n", to: "", breaks: "B2" },
  { name: "a bogus kind is kept", file: AM, from: "    if (AURA_MOVE_LIMIT_KINDS.includes(k)) out[", to: "    if (k) out[", breaks: "B2" },
  { name: "a Blunder lays no limit", file: AM, from: "  const fallback = { heroic: \"critical\", blunder: \"fumble\" }[key];", to: "  const fallback = undefined;", breaks: "B3" },
  { name: "a limit laid off-turn binds the turn in progress", file: AM, from: "  return Number(ownTurnIndex) > Number(turn) ? r : r + 1;", to: "  return r;", breaks: "B4" },
  { name: "the origin square is charged", file: AM, from: "  for (const d of squareFeet.slice(1))", to: "  for (const d of squareFeet.filter((x) => x !== null))", breaks: "B5" },
  { name: "a square on the radius's edge is free", file: AM, from: "Number(d) <= r) extra += squareSize;", to: "Number(d) < r) extra += squareSize;", breaks: "B5" },
  { name: "a level move is refused too", file: AM, from: "  if (Number(endFeet) >= Number(startFeet)) return \"\";", to: "  if (Number(endFeet) > Number(startFeet)) return \"\";", breaks: "B6" },
  { name: "the approach limit binds every turn", file: AM, from: " && acting && Math.trunc(Number(round) || 0) === record.forRound;", to: " && acting;", breaks: "B6" },
  { name: "an unknown kind is laid", file: AM, from: "  if (!AURA_MOVE_LIMIT_KINDS.includes(kind)) return null;\n  return {", to: "  return {", breaks: "B7" },
  { name: "a form's other speeds are dropped", file: CS, from: "    if (delta) changes.push({ key: `system.combat.movement.${mode}.other`", to: "    if (false) changes.push({ key: `system.combat.movement.${mode}.other`", breaks: "B8" },
  { name: "the form's HP is dropped", file: CS, from: "  if (form.hpBonus > 0) changes.push(", to: "  if (false) changes.push(", breaks: "B8" },
  { name: "the size changes the stats after all", file: CS, from: "    ...(form.size && form.keepStats && SIZES.includes(lower(baseSize)) ? { statSize: lower(baseSize) } : {}) } };", to: "  } };", breaks: "B8" },
  { name: "a disabled form still sets the stats' size", file: CS, from: "    if (e?.disabled) continue;\n    const f = e?.flags?.[SYSTEM_ID]?.[CHANGE_SHAPE_FLAG];\n    if (f?.statSize", to: "    const f = e?.flags?.[SYSTEM_ID]?.[CHANGE_SHAPE_FLAG];\n    if (f?.statSize", breaks: "B9" },
  { name: "the current form is always its own", file: CS, from: "    if (f?.key && !e?.disabled) return String(f.key);", to: "", breaks: "B10" },
  { name: "a form's grants are dropped", file: CS, from: "    grants: names(raw.grants),\n", to: "    grants: [],\n", breaks: "B11" },
  { name: "the Venom fires in every form", file: DA, from: "  if (spec.requiresForm?.length && !spec.requiresForm.includes(lower(ctx.form ?? \"own\"))) return false;\n", to: "", breaks: "B12" },
  { name: "Time Stop never rests", file: IF, from: "  return Math.max(0, Math.ceil(until - Number(now ?? 0)));", to: "  return 0;", breaks: "B13" },
  { name: "a quickened innate costs full AP", file: IF, from: "  return castAP - 1;", to: "  return castAP;", breaks: "B14" },
  { name: "a quickened innate drops to 0 AP", file: IF, from: " || castAP <= 1) return castAP;", to: ") return castAP;", breaks: "B14" },
  { name: "the token keeps its square", file: CS, from: "  return Number.isFinite(side) && side > 0 ? side : null;", to: "  return null;", breaks: "B15" },
  { name: "the token is never resized", file: CW, from: "      await resizeActorTokens(actor, side);\n", to: "", breaks: "S9" },
  { name: "the token stays Large after the form", file: CW, from: "  if (Number(was.priorTokenSize) > 0) { priorTokenSize = Number(was.priorTokenSize); await resizeActorTokens(actor, priorTokenSize); }\n", to: "", breaks: "S9" },
  { name: "the token is judged by its animating width again (what 3.651.1 did)", file: CW, from: "    if (side && own) {", to: "    if (side && own && Number(own.width) !== side) {", breaks: "S9" },
  { name: "the next form forgets the creature's own size", file: CW, from: "[CHANGE_SHAPE_FLAG].priorTokenSize = Number(priorTokenSize) || Number(own.width) || 1;", to: "[CHANGE_SHAPE_FLAG].priorTokenSize = Number(own.width) || 1;", breaks: "S9" },
  { name: "a limiting rung says Unaffected again", file: AW, from: "\n    && !aura.moveLimits?.[String(degree?.key ?? \"failure\")]) {", to: ") {", breaks: "S10" },
  { name: "the gate is never asked", file: ATK, from: "    if (refusal) { ui.notifications.warn(refusal); return null; }\n  }\n", to: "  }\n", breaks: "S1" },
  { name: "Stealthy Strike rolls no dice", file: ATK, from: "  if (hasSneakDice(actor) && sneakTargetQualifies &&", to: "  if (false && sneakTargetQualifies &&", breaks: "S2" },
  { name: "Stealthy Strike is not Sneak Attack's rule", file: ROG, from: "  return hasSneakAttack(actor) || hasStealthyStrike(actor);", to: "  return hasSneakAttack(actor);", breaks: "S2" },
  { name: "no rung lays a limit", file: AW, from: "    if (kind) lines.push(await layAuraMoveLimit(actor, kind, aura, emitterToken));", to: "", breaks: "S3" },
  { name: "the approach is allowed", file: MV, from: "  if (auraLimits.refusal) {\n    ui.notifications.warn(`${auraLimits.refusal}.`);\n    return false;\n  }", to: "", breaks: "S4" },
  { name: "the difficult ground is free", file: MV, from: " + Math.max(0, Number(auraLimits.surcharge) || 0);", to: ";", breaks: "S4" },
  { name: "a flier is charged for the ground", file: MV, from: "record.kind === \"difficult\" && movementAction(movement) !== \"fly\"", to: "record.kind === \"difficult\"", breaks: "S4" },
  { name: "the granted abilities are never cleaned up", file: CW, from: "    if (granted.ids.length) data.flags[SYSTEM_ID].grantedItems = granted.ids;\n", to: "", breaks: "S5" },
  { name: "the form's Strikes are not equipped", file: CW, from: "\"system.equipped\": (form.equips ?? []).includes(i.name)", to: "\"system.equipped\": false", breaks: "S5" },
  { name: "size changes the Huanling's Strength", file: ACT, from: "  const sizeEntry = SIZE_TABLE[statSizeOf(actor?.effects, system.identity?.size)] ?? null;", to: "  const sizeEntry = SIZE_TABLE[system.identity?.size] ?? null;", breaks: "S6" },
  { name: "the after-strike does not know the form", file: DASW, from: "    form: currentFormKey(actor.effects),\n", to: "", breaks: "S7" },
  { name: "the innate's clock never starts", file: CAST, from: "      await spell.update({ [`flags.${SYSTEM_ID}.${INNATE_COOLDOWN_FLAG}`]: innateCooldownUntil(spell, Number(game.time?.worldTime ?? 0)) });", to: "", breaks: "S8" },
  { name: "the quickened AP is not used", file: CAST, from: "  const effCastAP = quickenedInnateAP(spell, apMode?.ap ?? spellData.castAP);", to: "  const effCastAP = apMode?.ap ?? spellData.castAP; void quickenedInnateAP;", breaks: "S8" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block18.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block18: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block18: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block18: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
