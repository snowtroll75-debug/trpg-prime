#!/usr/bin/env node
/**
 * mutate-unliving-mechanisms — the mutation half of verify-unliving-mechanisms: each entry breaks
 * one rule the suite exists to hold, and the suite must go red for every one.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DG = m("combat", "death-guard.mjs"), DY = m("combat", "dying-workflow.mjs"), DGW = m("combat", "death-guard-workflow.mjs");
const DA = m("combat", "declared-after-strikes.mjs"), DAW = m("combat", "declared-after-strikes-workflow.mjs");
const OF = m("combat", "on-fell.mjs"), KT = m("kind-targeting.mjs"), SO = m("combat", "strike-type-options.mjs");
const SR = m("magic", "strike-riders.mjs"), SRW = m("magic", "strike-riders-workflow.mjs"), AW = m("combat", "attack-workflow.mjs");
const SC = m("magic", "save-convert.mjs"), CDC = m("magic", "casting-dc.mjs"), CW = m("magic", "cast-workflow.mjs");
const AF = m("combat", "affliction-workflow.mjs"), EA = m("combat", "effect-application-workflow.mjs"), RL = m("combat", "target-relay.mjs"), JP = m("jumping.mjs"), GW = m("grants-workflow.mjs"), SD = m("magic", "spell-dc-bonus.mjs"), DB = m("drink-blood.mjs"), DBW = m("drink-blood-workflow.mjs");
const MUTATIONS = [
  { name: "an offer is tried before a save guard", file: DG, from: "  return out.sort((a, b) => Number(Boolean(a.spec.offer)) - Number(Boolean(b.spec.offer)));", to: "  return out;", breaks: "A1" },
  { name: "essence is no exception", file: DG, from: "  if (hit) return `the damage is ${hit}`;\n", to: "", breaks: "A3" },
  { name: "weakness is no exception", file: DG, from: "    if (w) return `${w} is a damage type it is weak to`;", to: "    if (false) return w;", breaks: "A4" },
  { name: "a daily guard is never spent", file: DG, from: "  if (spec.frequency === \"daily\" && ctx.usedToday?.[spec.label]) return \"already used today\";\n", to: "", breaks: "A6" },
  { name: "the save is always against the defender's own level", file: DG, from: "  const level = Math.max(0, Math.floor(Number(known ? sourceLevel : ownLevel) || 0));", to: "  const level = Math.max(0, Math.floor(Number(ownLevel) || 0));", breaks: "A7" },
  { name: "a Partial holds", file: DG, from: "  return [\"heroic\", \"critical\", \"success\"].includes(lower(degreeKey));", to: "  return [\"heroic\", \"critical\", \"success\", \"partial\"].includes(lower(degreeKey));", breaks: "A9" },
  { name: "the guard is never asked", file: DY, from: "    if (guarded) return guarded;\n", to: "", breaks: "A11" },
  { name: "the guard leaves the creature at 0", file: DGW, from: "    await actor.update({ \"system.resources.hp.value\": 1 });\n", to: "", breaks: "A14" },
  { name: "the weapon hit reports no type", file: AW, from: "      damageTypes: [String(effectiveDamageType ?? \"\").trim().toLowerCase()].filter(Boolean),\n      sourceLevel: Number(actor.system?.identity?.level ?? 0),\n      sourceName: actor.name\n    });", to: "    });", breaks: "A13" },
  { name: "a plain hit counts as a critical injury", file: DA, from: "  if ((spec.onCritical || spec.onCriticalInjury) && !ctx.critical) return false;\n", to: "", breaks: "B3" },
  { name: "the weapon is not asked", file: DA, from: "  if (spec.weaponNames.length && !spec.weaponNames.includes(lower(ctx.weaponName))) return false;\n", to: "", breaks: "B4" },
  { name: "a crit-immune target still takes the injury's rider", file: DA, from: "  if (spec.onCriticalInjury && ctx.criticalImmune) return false;\n", to: "", breaks: "B5" },
  { name: "severity does not raise the DC", file: DA, from: "  return Math.trunc(Number(baseDC) || 0) + (spec?.dcBySeverity?.[lower(severity)] ?? 0);", to: "  return Math.trunc(Number(baseDC) || 0);", breaks: "B6" },
  { name: "outside combat a round has no clock", file: DA, from: "    else tag.expiresTime = Number(worldTime || 0) + rounds * 6;\n", to: "", breaks: "B8" },
  { name: "the day never closes", file: DA, from: "  return Number.isFinite(at) && now - at < DAY_SECONDS;", to: "  return false;", breaks: "B11" },
  { name: "the disease arrives at its printed level", file: DAW, from: "  data.system.level = spec.expose.level === \"actorLevel\" ? level : spec.expose.level;\n", to: "", breaks: "B13" },
  { name: "the fumble's escape save is not carried", file: DAW, from: "...(resave ? { conditionSave: { save, onSuccess: \"end\", label: spec.label, saveDC: dc } } : {})", to: "...({})", breaks: "B14" },
  { name: "a carried escape save is never stamped", file: EA, from: "    await recordConditionSave(actor, { ...tag.conditionSave, condition: tag.key });\n", to: "", breaks: "B14b" },
  { name: "the exposure skips the relay", file: DAW, from: "  await relayAffliction(targetActor, data, { exposureKey: oncePerDay ? key : \"\", now }, async () => {", to: "  await (async (_t, _d, _o, f) => f())(targetActor, data, {}, async () => {", breaks: "B13" },
  { name: "the GM's client does not mark the day", file: RL, from: "      if (payload.exposureKey) await deps.markExposure(target, String(payload.exposureKey), Number(payload.now) || 0);\n", to: "", breaks: "B14c" },
  { name: "a forged item rides the affliction relay", file: RL, from: "      if (!data || data.type !== \"affliction\") return { ok: false, reason: \"not an affliction\" };", to: "      if (!data) return { ok: false, reason: \"not an affliction\" };", breaks: "B14d" },
  { name: "felling an undead feeds the zombie", file: OF, from: "  if (spec.living && !ctx.targetLiving) return false;\n", to: "", breaks: "C2" },
  { name: "the minimum is dropped", file: OF, from: "  return Math.max(spec?.heal?.min ?? 0, total);", to: "  return total;", breaks: "C3" },
  { name: "an Unliving character is living", file: KT, from: "const NON_LIVING_KINDS = Object.freeze([\"undead\", \"construct\", \"unliving\"]);", to: "const NON_LIVING_KINDS = Object.freeze([\"undead\", \"construct\"]);", breaks: "C4" },
  { name: "the option reaches every weapon", file: SO, from: "  if (option.scope.includes(\"any\")) return true;", to: "  return true;", breaks: "D2" },
  { name: "the weapon's own type is made magical by the option", file: SO, from: "  if (!choice || choice.source === \"normal\" || choice.source === \"Versatile\") return false;", to: "  if (!choice) return false;", breaks: "D3" },
  { name: "the type gate is ignored", file: SR, from: "  if (spec.whenDamageTypes?.length && !spec.whenDamageTypes.includes(String(ctx.damageType ?? \"\").trim().toLowerCase())) return false;\n", to: "", breaks: "D6" },
  { name: "a rider's condition skips its gates again", file: SR, from: "  if (riderIsGated(spec) && !riderGatesHold(spec, ctx)) return false;\n  return true;\n}", to: "  return true;\n}", breaks: "E1" },
  { name: "a rider's condition reaches any weapon again", file: SR, from: "  if (!spec?.condition) return false;\n  if (!riderAppliesTo(spec, weapon)) return false;", to: "  if (!spec?.condition) return false;", breaks: "E1" },
  { name: "feat riders are invisible again", file: SRW, from: "  for (const effect of actor?.appliedEffects ?? actor?.effects ?? []) {", to: "  for (const effect of actor?.effects ?? []) {", breaks: "E3" },
  { name: "a Partial is converted", file: SC, from: "  if (!spec.from.includes(lower(degree))) return null;", to: "  if (lower(degree) === \"success\") return null;", breaks: "F1" },
  { name: "an unconscious mummy hardens its mind", file: SC, from: "  if (CANNOT_ACT.some((c) => held.has(c))) return null;\n", to: "", breaks: "F3" },
  { name: "unknown traits are taken as a yes", file: SC, from: "  if (!known.length) return \"ask\";", to: "  if (!known.length) return \"offer\";", breaks: "F2" },
  { name: "a Faultless cast pays the core +5 too", file: CW, from: "    defensive: defensive && !declaredDefensive,", to: "    defensive,", breaks: "G4" },
  { name: "the declared part is not named", file: CDC, from: "    parts.push({ label: `${declaredDefensive.label || \"Defensive Casting\"}, defensive`, value: add });", to: "", breaks: "G2" },
  { name: "a Long Jump within Speed still costs its action", file: JP, from: "    freeAction: automatic && jump.actionKey === \"longJump\"", to: "    freeAction: false", breaks: "H2" },
  { name: "a High Jump's reach is the whole Speed", file: JP, from: "  const reach = jump.actionKey === \"highJump\" ? Math.floor(speed / 2) : speed;", to: "  const reach = speed;", breaks: "H3" },
  { name: "the run-up still doubles a leaper's DC", file: JP, from: "    dc: jump.base,\n    naturalLeaper: true,", to: "    naturalLeaper: true,", breaks: "H3" },
  { name: "a grant's declared uses are ignored", file: GW, from: "      if (uses !== null) data.system.usesPerDay = uses;\n", to: "", breaks: "I1" },
  { name: "two racial DC bonuses stack", file: SD, from: "    if (!held || row.value > held.value) best.set(row.type, row);", to: "    out.push(row);", breaks: "I3" },
  { name: "a DC bonus ignores the spell's traits", file: SD, from: "      if (wanted.length && !wanted.some((t) => have.has(t))) continue;\n", to: "", breaks: "I3" },
  { name: "a grabbed target is drained without a check", file: DB, from: "  if (held.has(CHECK_CONDITION)) return { ok: true, needsCheck: true, via: CHECK_CONDITION };", to: "  if (held.has(CHECK_CONDITION)) return { ok: true, needsCheck: false, via: CHECK_CONDITION };", breaks: "J1" },
  { name: "Blood Renewal never reaches its 12th-level step", file: DB, from: "      if (lvl >= Number(at)) value = Math.max(value, Math.trunc(Number(v) || 0));", to: "      if (false) value = Number(v);", breaks: "J2" },
  { name: "a stage's type is ignored again", file: AF, from: "  return t || \"poison\";", to: "  return \"poison\";", breaks: "K1" },
  { name: "a disease deals no stage damage again", file: AF, from: "  if (!poison && withDamage && item.system.stages?.[currentStage - 1]?.damage) await dealStageDamage(actor, item);\n", to: "", breaks: "K2" },
  { name: "the drinker heals the full amount whatever landed", file: DBW, from: "  const landed = applied.some((a) => a.immune) ? 0 : Math.max(0, after - before);", to: "  const landed = amount;", breaks: "J3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-unliving-mechanisms.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const files = [...new Set(MUTATIONS.map((x) => x.file))];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-unliving-mechanisms: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-unliving-mechanisms: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-unliving-mechanisms: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
