#!/usr/bin/env node
/**
 * mutate-ff30-block2 — the mutation half of verify-ff30-block2 (3.632.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AREA = m("creature-area.mjs"), PE = m("peril-effect.mjs"), ACTIV = m("creature-activation.mjs"), PRE = m("prerequisites.mjs");
const FEATS = m("codex-feat-rules.mjs"), UW = m("combat", "underwater.mjs"), ACT = m("creature-activation-workflow.mjs"), PERIL = m("peril-workflow.mjs");
const DMG = m("combat", "damage-workflow.mjs"), ATTACK = m("combat", "attack-workflow.mjs"), HOOKS = m("codex-hooks-workflow.mjs"), UWWF = m("combat", "underwater-workflow.mjs");
const PICKER = m("picker-filters.mjs"), FEATSWF = m("feats-workflow.mjs"), FAM = m("familiar-workflow.mjs"), SPAWN = m("spawn-workflow.mjs"), SWARM = m("swarm-workflow.mjs");
const RUNES = m("rune-actions-workflow.mjs"), ALIGNED = m("aligned-control-workflow.mjs"), SENSE = m("aligned-sense-workflow.mjs"), ACTOR = m("documents", "actor.mjs"), USES = m("uses-workflow.mjs");
const RUNEDATA = m("codex-rune-data.mjs"), SPACE = m("combat", "space.mjs"), MOVE = m("combat", "movement-workflow.mjs");

const MUTATIONS = [
  { name: "a swarm is blocked by the occupied-space rule again", file: SPACE, from: "  const others = moverIsSwarm ? [] : Array.from(occupants ?? []).filter((o) => !o?.swarm);", to: "  const others = Array.from(occupants ?? []);", breaks: "A16" },
  { name: "a swarm cannot pass through", file: SPACE, from: "  if (swarm) return { allowed: true, needsTumble: false, multiplier: 1, reason: \"a swarm shares the space\" };", to: "", breaks: "A16" },
  { name: "the movement gate forgets the mover is a swarm", file: MOVE, from: "    moverIsSwarm,\n", to: "", breaks: "B20" },
  { name: "the Controlled tag goes back to no label", file: ALIGNED, from: ", label: conditionLabel(\"controlled\") }];", to: " }];", breaks: "B21" },
  { name: "Sense Aligned asks for a DC again", file: SENSE, from: "    suppressDegree: true,\n", to: "", breaks: "B21" },
  { name: "a dragon's breath flag is ignored", file: AREA, from: "  if (flag && typeof flag === \"object\" && flag.damage) {", to: "  if (false) {", breaks: "A1" },
  { name: "a printed breath's AP is lost", file: AREA, from: "  if (Number.isFinite(ap) && ap > 0) area.ap = ap;", to: "", breaks: "A2" },
  { name: "a breath with no basic save is rolled anyway", file: AREA, from: "  if (!formula || !/^\\d+d\\d+([+-]\\d+)?$/i.test(formula) || !save) return null;", to: "  if (!formula) return null;", breaks: "A3" },
  { name: "a printed DC is dropped", file: AREA, from: "  if (dc > 0) area.dc = dc;", to: "", breaks: "A4" },
  { name: "the module's shape overrides the entry's own area", file: AREA, from: "  if (a && typeof a === \"object\") return a;\n  return moduleBreathArea(item) ?? moduleSwarmArea(item);", to: "  return moduleBreathArea(item) ?? moduleSwarmArea(item) ?? (a && typeof a === \"object\" ? a : null);", breaks: "A5" },
  { name: "a swarm bites its friends too", file: AREA, from: "    enemiesOnly: m[1].toLowerCase() === \"enemy\",", to: "    enemiesOnly: false,", breaks: "A6" },
  { name: "the shared space collapses to targets", file: PE, from: ": spec.scope === \"sharedSpace\" ? \"sharedSpace\" : \"targets\";", to: ": \"targets\";", breaks: "A7" },
  { name: "the Use button stays silent on module breaths", file: ACTIV, from: "  if (moduleBreathArea(item) || moduleSwarmArea(item)) return true;", to: "", breaks: "A8" },
  { name: "the special-sense clause is not parsed", file: PRE, from: "  if (m) return { type: \"specialSense\", key: m[1].toLowerCase(), min: 1 };", to: "", breaks: "A9" },
  { name: "Crimson Covenant arms on any bleed", file: FEATS, from: "Number(t?.value) >= 5);", to: "Number(t?.value) >= 1);", breaks: "A10" },
  { name: "the covenant's +4 never goes live", file: FEATS, from: "  if (s === \"armed\") return { modifier: { label: CRIMSON_COVENANT, value: 4, type: \"luck\" }, next: \"live\" };", to: "  if (s === \"armed\") return { modifier: { label: CRIMSON_COVENANT, value: 4, type: \"luck\" }, next: \"armed\" };", breaks: "A11" },
  { name: "Howling Kinship reaches any distance", file: FEATS, from: "  if (!(Number(partnerFeet) <= HOWLING_KINSHIP_FEET)) return null;", to: "", breaks: "A12" },
  { name: "Scaly Resilience costs no reaction", file: FEATS, from: "  if (!ownsFeat || !isBreath || !reactionAvailable) return null;", to: "  if (!ownsFeat || !isBreath) return null;", breaks: "A13" },
  { name: "Submersible stops the fire failure no longer", file: UW, from: "    fireFails: Boolean(submersibleWeapon)", to: "    fireFails: false", breaks: "A14" },
  { name: "Aquatic breathes air", file: UW, from: "  return Boolean(entering) !== Boolean(aquatic) ? \"hold\" : \"restore\";", to: "  return entering ? \"hold\" : \"restore\";", breaks: "A15" },
  { name: "the activation reads only its own area", file: ACT, from: "  const area = declaredArea(item);", to: "  const area = item?.flags?.[SYSTEM_ID]?.creatureAbility?.area;", breaks: "B1" },
  { name: "a breath is not a breath to its targets", file: ACT, from: "      spec.isBreath = true;", to: "", breaks: "B2" },
  { name: "a swarm bites its own side", file: PERIL, from: "      if (spec.enemiesOnly && t.disposition === token.disposition) continue;", to: "", breaks: "B3" },
  { name: "Scaly Resilience's row is not rolled", file: PERIL, from: "    if (scaly) saveConfig.modifiers = [...(saveConfig.modifiers ?? []), scaly.saveModifier];", to: "", breaks: "B4" },
  { name: "the one-blow resistance is dropped", file: DMG, from: "  let packet = resolveAgainstDefences(defenderSystem, {", to: "  let packet = resolveAgainstDefences(targetActor.system, {", breaks: "B5" },
  { name: "a swarm's damage meets full DR", file: PERIL, from: "          area: spec.isCreatureArea === true, attackerIsSwarm: spec.scope === \"sharedSpace\" });\n        if (spec.ignoreResistance) clearResistanceBypass();", to: "          area: spec.isCreatureArea === true });\n        if (spec.ignoreResistance) clearResistanceBypass();", breaks: "B6" },
  { name: "the covenant's +4 is never added", file: ATTACK, from: "    if (covenant.modifier) modifiers.push(covenant.modifier);", to: "", breaks: "B7" },
  { name: "the covenant's crit leaves the bleeding", file: HOOKS, from: "    if (bleeding > 0) await attacker.toggleStatusEffect(\"bleeding\", { active: false });", to: "", breaks: "B7" },
  { name: "Howling Kinship is never measured", file: ATTACK, from: "    if (kinship) modifiers.push(kinship);", to: "", breaks: "B8" },
  { name: "the water's −2 ignores every exemption", file: ATTACK, from: "  const waterMelee = isRanged || waterExempt.meleePenalty ? 0 : underwaterMeleePenalty({", to: "  const waterMelee = isRanged ? 0 : underwaterMeleePenalty({", breaks: "B9" },
  { name: "an Aquatic creature holds its breath in the water", file: UWWF, from: "  if (breathOnWaterline({ entering: true, aquatic: hasCreatureTrait(actor.system, \"aquatic\") }) === \"hold\") {", to: "  if (true) {", breaks: "B10" },
  { name: "the picker forgets the senses", file: PICKER, from: "    specialSenseModalities,\n", to: "", breaks: "B11" },
  { name: "core registers a familiar key over the module's", file: FEATSWF, from: "  \"furry friend\": {", to: "  \"abyssal familiar\": { hint: \"\", async use() {} },\n  \"furry friend\": {", breaks: "B12" },
  { name: "the Spawn's meal may be any level", file: SPAWN, from: "  if (levelOf(meal) < needed) {", to: "  if (false) {", breaks: "B13" },
  { name: "the swarm bites the same creatures again on every shuffle", file: SWARM, from: "  const fresh = now.filter((a) => !before.has(a.id));", to: "  const fresh = now;", breaks: "B14" },
  { name: "Swarmed ignores the rune's DC", file: RUNES, from: "    save: \"reflex\", basic: true, dc: throwing.dc,", to: "    save: \"reflex\", basic: true,", breaks: "B15" },
  { name: "a Spawn saves at full strength against its creator", file: ALIGNED, from: "  const shifted = spawnControlDegree(target.system, degree, { grantsControl: true, fromCreator });", to: "  const shifted = degree;", breaks: "B16" },
  { name: "a Critical leaves no immunity", file: ALIGNED, from: "  if (outcome.immuneUntilPreparation) {", to: "  if (false) {", breaks: "B16" },
  { name: "the hostile-action re-save is never offered", file: ALIGNED, from: "  Hooks.on(\"trgPrimeStrikeRolled\",", to: "  Hooks.on(\"trgPrimeStrikeRolledNever\",", breaks: "B17" },
  { name: "daily preparation keeps the immunity", file: USES, from: "  if (actor.getFlag?.(SYSTEM_ID, \"alignedControlImmune\")) await actor.unsetFlag(SYSTEM_ID, \"alignedControlImmune\");", to: "", breaks: "B17" },
  { name: "active detection gains nothing", file: SENSE, from: "  if (active) config.modifiers = [...(config.modifiers ?? []), { label: \"Active detection\", ...ACTIVE_DETECTION_BONUS }];", to: "", breaks: "B18" },
  { name: "Sense Aligned is never available", file: ACTOR, from: "    system.combat.alignedSense = alignedTraitsOf(system).length;", to: "    system.combat.alignedSense = 0;", breaks: "B18" },
  { name: "Submersible is a note again", file: RUNEDATA, from: "    note: \"Underwater, the strike takes no −2 through the water and a fire weapon does not fail.\"", to: "    note: \"x\"", breaks: "B19" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block2.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block2: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block2: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block2: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
