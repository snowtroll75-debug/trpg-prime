#!/usr/bin/env node
/** mutate-fixes-3685-1 — the mutation half of verify-fixes-3685-1. NEW at 3.685.1. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const API = m("module-api.mjs"), APIW = m("module-api-workflow.mjs"), TRW = m("trait-rules-workflow.mjs"), CW = m("magic", "cast-workflow.mjs"),
  SR = m("magic", "strike-riders.mjs"), CA = m("magic", "casting.mjs"), MAN = m("conditions", "manager.mjs"), BG = m("magic", "bonus-group.mjs"),
  SE = m("magic", "spell-effects.mjs"), REL = m("combat", "target-relay-workflow.mjs"), CT = m("magic", "cast-targets.mjs");
const MUTATIONS = [
  // T — a teleport later than its cast
  { name: "T the registry keeps no deferral", file: API, from: "  registry.deferredTeleports.set(k, defers);", to: "", breaks: "T3" },
  { name: "T a deferral's answer is ignored", file: TRW, from: "      if ((await defers(ctx)) === true) return true;", to: "      if (false) return true;", breaks: "T3" },
  { name: "T a test that throws stops the cast", file: TRW, from: "      console.warn(\"TRG Prime | a deferred-teleport test threw\", err);", to: "      throw err;", breaks: "T3" },
  { name: "T a second teleport never fails", file: TRW, from: "  return teleportArrival(actor.getFlag?.(SYSTEM_ID, TELEPORTED_FLAG) ?? null, combat).fails === true;", to: "  return false;", breaks: "T5" },
  { name: "T the cast cards a deferred teleport anyway", file: CW, from: "    if (!deferred) {\n      const moved", to: "    if (true) {\n      const moved", breaks: "T7" },
  { name: "T the deferral is asked of every spell", file: CW, from: "    const deferred = spellHasTrait(spell?.system?.traits ?? \"\", \"teleportation\") && await teleportDeferred(", to: "    const deferred = await teleportDeferred(", breaks: "T7" },
  { name: "T the API has no registerDeferredTeleport", file: APIW, from: "    registerDeferredTeleport: (key, defers, moduleId) => registerDeferredTeleport(key, defers, moduleId),\n", to: "", breaks: "T2/T8" },
  { name: "T the helpers have no teleportationFails", file: APIW, from: "      teleportationFails: async (...args) => { const { teleportationFails } = await import(\"./trait-rules-workflow.mjs\"); return teleportationFails(...args); },\n", to: "", breaks: "T4" },
  // R — the rider's cast line
  { name: "R a replacing rider is carded as an addition", file: SR, from: "  const rider = spec.replacesDamage\n", to: "  const rider = false\n", breaks: "R1/R4" },
  { name: "R a replacing rider always says nothing is added", file: SR, from: "      + (spec.flat ? \", with nothing added\" : \" (its other additions still apply)\")", to: "      + \", with nothing added\"", breaks: "R2" },
  { name: "R a lasting replacing rider is carded as the next Strike's", file: SR, from: "    ? `${when} deals <strong>", to: "    ? `your next ${where} deals <strong>", breaks: "R2" },
  // O — an object, not a creature
  { name: "O the mark is ignored", file: CA, from: "  if (spellTargetsObject(spell)) return false;\n", to: "", breaks: "O1" },
  { name: "O any truthy mark counts", file: CA, from: "  return spell?.flags?.[\"trg-prime\"]?.targetsObject === true;", to: "  return Boolean(spell?.flags?.[\"trg-prime\"]?.targetsObject);", breaks: "O2" },
  { name: "O the picker is asked without the spell", file: CW, from: "  if (spellNeedsTarget(spellData, spell) && !storingNow && !reaction?.presetTargets && !presetTargets) {", to: "  if (spellNeedsTarget(spellData) && !storingNow && !reaction?.presetTargets && !presetTargets) {", breaks: "O3" },
  { name: "O the count is asked without the spell", file: CW, from: "  if (!storingNow && spellNeedsTarget(spellData, spell)) {", to: "  if (!storingNow && spellNeedsTarget(spellData)) {", breaks: "O3" },
  { name: "O the range gate measures an object's spell", file: CW, from: "  if (!storingNow && !spellTargetsObject(spell) && (game.user?.targets?.size ?? 0)) {", to: "  if (!storingNow && (game.user?.targets?.size ?? 0)) {", breaks: "O3" },
  // N — an unknown recurring type
  { name: "N an unknown type is left out of the name again", file: MAN, from: "  if (id === \"recurring\" && String(damageType ?? \"\").trim()) {", to: "  if (id === \"recurring\" && damageType && DAMAGE_TYPES[damageType]) {", breaks: "N1" },
  // B — one effect for several slots
  { name: "B every group refreshes", file: BG, from: "refreshKey: row.refresh === true ? (name || slots.join(\"+\")).toLowerCase() : \"\"", to: "refreshKey: (name || slots.join(\"+\")).toLowerCase()", breaks: "B1" },
  { name: "B a key is laid twice", file: BG, from: "      if (!keys.includes(key)) keys.push(key);", to: "      keys.push(key);", breaks: "B2" },
  { name: "B a slot with nowhere to land is silent", file: BG, from: "    if (!placed.length) { refused.push(slot); continue; }", to: "    if (!placed.length) continue;", breaks: "B2" },
  { name: "B a refresh removes any keyed effect", file: BG, from: "filter((e) => e?.id && wanted.has(refreshKeyOf(e)))", to: "filter((e) => e?.id && refreshKeyOf(e))", breaks: "B3" },
  { name: "B the engine ignores the group", file: SE, from: "          if (group) {\n            const groupValue = warpedBonusValue(", to: "          if (false) {\n            const groupValue = warpedBonusValue(", breaks: "B5" },
  { name: "B the group's name is lost", file: SE, from: "    name: group.name || effectName(spell.name, effect.note),", to: "    name: effectName(spell.name, effect.note),", breaks: "B5" },
  { name: "B the group carries no refresh key", file: SE, from: "  if (refreshKey) flags[SYSTEM_ID].refreshKey = refreshKey;\n", to: "", breaks: "B5/B7" },
  { name: "B THE REVIEW'S DEFECT: the refresh ignores the spell", file: SE, from: "  const refreshKey = bonusGroupRefreshKey(group, spell?.name, caster?.uuid);", to: "  const refreshKey = group.refreshKey;", breaks: "B5/B7b" },
  { name: "B the key ignores the spell", file: BG, from: "  return [group.refreshKey, text(spellName).toLowerCase(), text(casterUuid)].filter(Boolean).join(\"@\");", to: "  return [group.refreshKey, text(casterUuid)].filter(Boolean).join(\"@\");", breaks: "B11/B7b" },
  { name: "B THE RE-REVIEW'S DEFECT: the key ignores the caster", file: BG, from: "  return [group.refreshKey, text(spellName).toLowerCase(), text(casterUuid)].filter(Boolean).join(\"@\");", to: "  return [group.refreshKey, text(spellName).toLowerCase()].filter(Boolean).join(\"@\");", breaks: "B11/B7e" },
  { name: "B the engine passes no caster", file: SE, from: "  const refreshKey = bonusGroupRefreshKey(group, spell?.name, caster?.uuid);", to: "  const refreshKey = bonusGroupRefreshKey(group, spell?.name);", breaks: "B5/B7e" },
  { name: "B the group forgets the cast", file: SE, from: "  if (castId) flags[SYSTEM_ID].castId = castId;\n  if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;\n  // SCOPED TO THIS SPELL", to: "  if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;\n  // SCOPED TO THIS SPELL", breaks: "B5" },
  { name: "B THE REVIEW'S DEFECT: the elder is removed before the create", file: REL, from: "  const elders = refreshedEffectIds(target?.effects ?? [], data);\n  const created = await target.createEmbeddedDocuments(\"ActiveEffect\", data);\n  if (elders.length && Array.isArray(created) && created.length) {\n    await target.deleteEmbeddedDocuments(", to: "  const elders = refreshedEffectIds(target?.effects ?? [], data);\n  if (elders.length) await target.deleteEmbeddedDocuments(\"ActiveEffect\", elders);\n  const created = await target.createEmbeddedDocuments(\"ActiveEffect\", data);\n  if (false) {\n    await target.deleteEmbeddedDocuments(", breaks: "B7/B7d" },
  { name: "B the elder is never removed", file: REL, from: "  if (elders.length && Array.isArray(created) && created.length) {", to: "  if (false) {", breaks: "B7" },
  { name: "B the card names the slots' keys", file: SE, from: "${bonusGroupWords(group.slots, SLOT_LABELS)}", to: "${group.slots.join(\", \")}", breaks: "B6" },
  { name: "B a refresh stacks on this client", file: REL, from: "    if (applyDirect) return applyDirect();\n    return createRefreshing(target, data);", to: "    if (applyDirect) return applyDirect();\n    return target.createEmbeddedDocuments(\"ActiveEffect\", data);", breaks: "B7/B10" },
  { name: "B a refresh stacks on the GM's client", file: REL, from: "    createEffects: (target, effects) => createRefreshing(target, effects),", to: "    createEffects: (target, effects) => target.createEmbeddedDocuments(\"ActiveEffect\", effects),", breaks: "B10" },
  // O4 — a marked spell's cast sees no creature target (review)
  { name: "O4 THE REVIEW'S DEFECT: a marked spell's cast keeps the user's targets", file: CW, from: "      return await withTargetsReleased(() => castSpellResolved(actor, spell, options ?? {}));", to: "      return await castSpellResolved(actor, spell, options ?? {});", breaks: "O6" },
  { name: "O4 the targets are never released", file: CT, from: "  for (const token of held) set(token, false);\n", to: "", breaks: "O4" },
  { name: "O4 the targets are not put back", file: CT, from: "      set(token, true);\n", to: "", breaks: "O4/O5" },
  { name: "O7 THE RE-REVIEW'S DEFECT: the held objects are restored, not the canvas's tokens", file: CT, from: "      const token = tokens?.get?.(id) ?? null;", to: "      const token = held.find((t) => t?.id === id) ?? null;", breaks: "O7" },
  { name: "O7 a destroyed token is targeted again", file: CT, from: "      if (!token || token.destroyed) continue;", to: "      if (!token) continue;", breaks: "O7" },
  { name: "O7 the layer defaults to nothing", file: CT, from: "user = globalThis.game?.user, tokens = globalThis.canvas?.tokens) {", to: "user = globalThis.game?.user, tokens = null) {", breaks: "O7b" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-fixes-3685-1.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-fixes-3685-1: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3685-1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3685-1: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
