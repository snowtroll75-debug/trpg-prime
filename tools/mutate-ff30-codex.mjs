#!/usr/bin/env node
/**
 * mutate-ff30-codex — the mutation half of verify-ff30-codex (3.631.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RULES = m("creature-ability-rules.mjs"), INH = m("codex-inheritance.mjs"), CA = m("creature-auras.mjs"), AREA = m("creature-area.mjs");
const BM = m("breath-memory.mjs"), COMP = m("combat", "compound-action.mjs"), DAS = m("combat", "declared-after-strikes.mjs"), PACK = m("combat", "pack-attack.mjs");
const FLY = m("combat", "fly.mjs"), MV = m("combat", "movement.mjs"), EP = m("effect-parser.mjs"), CARRIERS = m("declaration-carriers.mjs");
const FLYW = m("combat", "fly-workflow.mjs"), COMBAT = m("documents", "combat.mjs"), MVW = m("combat", "movement-workflow.mjs"), ATTACK = m("combat", "attack-workflow.mjs");
const ACTOR = m("documents", "actor.mjs"), AURAW = m("creature-aura-workflow.mjs"), ACT = m("creature-activation-workflow.mjs"), PERIL = m("peril-workflow.mjs");
const TURN = m("creature-turn-start-workflow.mjs"), ITEM = m("documents", "item.mjs"), DROWN = m("drowning-workflow.mjs"), RIDERS = m("magic", "strike-riders-workflow.mjs");
const CAST = m("magic", "cast-workflow.mjs"), DYING = m("combat", "dying-workflow.mjs"), HOOKS = m("codex-hooks-workflow.mjs"), DGW = m("combat", "death-guard-workflow.mjs");
const DASW = m("combat", "declared-after-strikes-workflow.mjs"), INHW = m("codex-inheritance-workflow.mjs"), PE = m("peril-effect.mjs"), DMG = m("combat", "damage-workflow.mjs"), ACTION = m("combat", "action-workflow.mjs"), CODEX = m("codex-actions-workflow.mjs");

const MUTATIONS = [
  { name: "Hover is never read", file: RULES, from: "  return abilityDerives(items).some(({ derives }) => derives.hover === true);", to: "  return false;", breaks: "A1" },
  { name: "Slow (II) counts as Slow (I)", file: RULES, from: "Math.max(0, Math.floor(Number(derives.apPenalty) || 0)), 0);", to: "(derives.apPenalty ? 1 : 0), 0);", breaks: "A2" },
  { name: "Smoke Form exempts every move", file: RULES, from: "      if (speedFeet > 0 && Number(movedFeet) >= speedFeet) return true;", to: "      return true;", breaks: "A3" },
  { name: "Fire Healing heals from any type", file: RULES, from: "    if (rule && typeof rule === \"object\" && String(rule.type ?? \"\").toLowerCase() === type) {", to: "    if (rule && typeof rule === \"object\") {", breaks: "A6" },
  { name: "Regeneration's lockout needs more than its amount", file: RULES, from: "  return regen > 0 && dmg >= regen;", to: "  return regen > 0 && dmg > regen;", breaks: "A10" },
  { name: "the shifted form is subdual whether or not it is shifted", file: RULES, from: "&& item?.flags?.[\"trg-prime\"]?.shifted === true);", to: ");", breaks: "A12" },
  { name: "Plant Resistance keeps every tag", file: RULES, from: "    if (key === \"bleeding\" || /^recurring/.test(key) || tag?.recurring) keep.push(tag);\n    else gm.push(tag);", to: "    keep.push(tag);", breaks: "A13" },
  { name: "Spell Resilience is a flat +1", file: RULES, from: "  const value = Math.max(0, Math.floor(Number(actor?.system?.identity?.classBonus ?? 0) || 0));", to: "  const value = 1;", breaks: "A14" },
  { name: "the base name keeps its range", file: INH, from: "  n = n.replace(/\\s+\\d+\\s*ft\\.?\\s*$/, \"\");\n", to: "", breaks: "A17" },
  { name: "a Partial that prints its own line borrows the Failure's conditions again", file: PE, from: "  const ownLine = spec?.outcomes?.[key] !== undefined;", to: "  const ownLine = false;", breaks: "A16b" },
  { name: "an ambiguous name inherits the last entry", file: INH, from: "      if (seen.get(`${memberOf(entry)}::${key}`) > 1) { ambiguous.add(key); continue; }\n", to: "", breaks: "A18" },
  { name: "a module's duplicate of a system entry makes both ambiguous", file: INH, from: "    const memberOf = (entry) => `${pack}::${entry?.member ?? \"\"}`;", to: "    const memberOf = () => pack;", breaks: "A18b" },
  { name: "the index reads the system pack by literal id again", file: INHW, from: "    for (const pack of contentPacksFor(name)) {", to: "    for (const pack of [game.packs?.get(`${SYSTEM_ID}.${name}`)].filter(Boolean)) {", breaks: "A18c" },
  { name: "the printed range is lost to the entry", file: INH, from: "    merged.creatureAbility.derives.sense.fixedFeet = Number(fixed);\n", to: "", breaks: "A19" },
  { name: "the opt-out is ignored", file: INH, from: "  if (own.codexInherit === false) return null;\n", to: "", breaks: "A20" },
  { name: "a damage aura without a type still rolls", file: CA, from: "  if (!type) return null;\n  return { formula, type, basic: raw.basic !== false };", to: "  return { formula, type, basic: raw.basic !== false };", breaks: "A22" },
  { name: "a damage aura does not roll", file: CA, from: "  return Boolean(aura?.save && ((aura?.conditions && Object.keys(aura.conditions).length) || aura?.damage || aura?.traitEffect));", to: "  return Boolean(aura?.save && ((aura?.conditions && Object.keys(aura.conditions).length) || aura?.traitEffect));", breaks: "A23" },
  { name: "a switched-off ability still emits", file: CA, from: "    if (item?.type === \"ability\" && item?.system?.active === false) continue;\n", to: "", breaks: "A24" },
  { name: "the cooldown never refuses", file: AREA, from: "  if (cooldownSeconds > 0 && Number.isFinite(last) && worldTime - last < cooldownSeconds) {", to: "  if (false) {", breaks: "A25" },
  { name: "the borrowed breath keeps no type", file: AREA, from: "  if (source) out.damage = { formula: areaOf(source).damage.formula, type: areaOf(source).damage.type ?? \"\" };", to: "  if (source) out.damage = { formula: areaOf(source).damage.formula };", breaks: "A26" },
  { name: "the extra base die is dropped", file: AREA, from: "  const dice = Number(m[1] || 1) + bonusDamageDice(bab) + Math.max(0, extraDice);", to: "  const dice = Number(m[1] || 1) + bonusDamageDice(bab);", breaks: "A27" },
  { name: "half the dice rounds down", file: BM, from: "  const n = Math.ceil(Number(m[1]) * fraction);", to: "  const n = Math.floor(Number(m[1]) * fraction);", breaks: "A28" },
  { name: "the next-turn rider fires the same round", file: BM, from: "  if (record.round !== null && round !== null) return round === record.round + 1;", to: "  if (record.round !== null && round !== null) return round >= record.round;", breaks: "A29" },
  { name: "a leg's limit ignores times", file: COMP, from: "      maxFeet: Math.max(Math.max(0, Number(leg?.minFeet) || 0), speed * times),", to: "      maxFeet: Math.max(Math.max(0, Number(leg?.minFeet) || 0), speed),", breaks: "A31" },
  { name: "the fixed MAP is not frozen", file: COMP, from: "  if (mapRule?.kind === \"fixed\") { options.mapOverride = mapRule.fixed; options.mapFrozen = true; }", to: "  if (mapRule?.kind === \"fixed\") { options.mapOverride = mapRule.fixed; }", breaks: "A32" },
  { name: "notWeapon is ignored", file: COMP, from: "&& !(not && not.test(String(w.name ?? \"\"))));", to: ");", breaks: "A33" },
  { name: "Life Drain does not escalate", file: DAS, from: "  return { value: drain.base + drain.perHit * hits, hits: hits + 1 };", to: "  return { value: drain.base, hits: hits + 1 };", breaks: "A35" },
  { name: "a dispel-only after-strike is dropped", file: DAS, from: "  if (!expose && !save && !raw.selfHeal && raw.dispel !== true) return null;", to: "  if (!expose && !save && !raw.selfHeal) return null;", breaks: "A36" },
  { name: "Pack Attack counts allies that cannot threaten", file: PACK, from: "  return Array.from(allies ?? []).filter((a) => allyThreatens(a).threatens).length;", to: "  return Array.from(allies ?? []).length;", breaks: "A37" },
  { name: "a hovering creature falls", file: FLY, from: "  if (hover) return { falls: false, distance: 0, reason: \"hovers (Hover)\" };\n", to: "", breaks: "A38" },
  { name: "a compound leg may use any Speed", file: MV, from: "  if (leg.speedKey && speedKey && leg.speedKey !== speedKey) {", to: "  if (false) {", breaks: "A39" },
  { name: "Skewering adds nothing", file: EP, from: "  return list.map((tag) => (tag.key === \"bleeding\" && tag.value !== null ? { ...tag, value: tag.value + level } : tag));", to: "  return list;", breaks: "A40" },
  { name: "an inactive ability carries declarations", file: CARRIERS, from: "    (i) => i?.type === \"ability\" && i?.system?.active !== false", to: "    (i) => i?.type === \"ability\"", breaks: "A41" },
  { name: "the fall never asks about Hover", file: FLYW, from: "    hover: abilitiesHover(Array.from(actor.items ?? []))\n", to: "    hover: false\n", breaks: "B1" },
  { name: "the Slow ability is not read at AP regain", file: COMBAT, from: "slowed: slowed + abilitySlow,", to: "slowed,", breaks: "B2" },
  { name: "Gallop never engages", file: MVW, from: "  const galloping = gallop > 0 && stridePool.movedCost + cost > speed;", to: "  const galloping = false;", breaks: "B4" },
  { name: "Eternal Essence keeps the armour penalties", file: ACTOR, from: "    if (abilitiesIgnoreArmourPenalties(Array.from(items ?? []))) {\n      penalty = 0;", to: "    if (false) {\n      penalty = 0;", breaks: "B6" },
  { name: "Fire Healing is asked after the defences", file: DMG, from: "  const healing = healsFromDamage(targetItems, type);\n  if (healing) {", to: "  const healing = null;\n  if (healing) {", breaks: "B7" },
  { name: "the rolled aura never applies its damage", file: AURAW, from: "  if (aura.damage) {\n    lines.push(await applyAuraDamage(", to: "  if (false) {\n    lines.push(await applyAuraDamage(", breaks: "B8" },
  { name: "the area effect is a card again", file: ACT, from: "  const area = declaredArea(item);", to: "  const area = null;", breaks: "B10" },
  { name: "Penetrating Breath keeps resistance", file: ACT, from: "        spec.drBypassed = true; spec.ignoreResistance = true;", to: "        spec.drBypassed = true;", breaks: "B12" },
  { name: "the breath is forgotten", file: ACT, from: "    await recordBreath(actor, item, use, results);\n", to: "", breaks: "B13" },
  { name: "Regeneration is offered again", file: TURN, from: "    if (a.kind === \"regeneration\" && autoRegen) {", to: "    if (false) {", breaks: "B15" },
  { name: "inheritance never runs", file: ITEM, from: "    applyCodexInheritance(this);\n", to: "", breaks: "B16" },
  { name: "death guards read effects only", file: DGW, from: "  const effects = declarationCarriers(actor);", to: "  const effects = Array.from(actor?.appliedEffects ?? actor?.effects ?? []);", breaks: "B17" },
  { name: "Life Drain never heals", file: DASW, from: "    if (spec.selfHeal > 0) {", to: "    if (false) {", breaks: "B18" },
  { name: "Elemental Strikes ride nothing", file: RIDERS, from: ", ...elementalStrikeRiders(actor, weapon)]", to: "]", breaks: "B19" },
  { name: "Pack Attack adds no die", file: ATTACK, from: "  const packDice = packAttackDice(actor, targetToken, { attackerToken });", to: "  const packDice = 0;", breaks: "B20" },
  { name: "the grapple is not recorded", file: ACTION, from: "        await targetActor.setFlag(SYSTEM_ID, \"grabbedBy\", { uuid: actor.uuid, name: actor.name, round: Number(game.combat?.round ?? 0) });", to: "        void 0;", breaks: "B21" },
  { name: "MAP is charged on Monstrous Grab", file: ACTION, from: "  if (countsTowardMAP(action.traits) && !mapExempt) {", to: "  if (countsTowardMAP(action.traits)) {", breaks: "B22" },
  { name: "Fearful Strength never swaps", file: ACTOR, from: "      skill.ability = swap;\n", to: "", breaks: "B23" },
  { name: "the kill is announced to nobody", file: DYING, from: "    Hooks.callAll(\"trgPrimeCreatureSlain\", { victim: actor, sourceName, sourceLevel, deathCase: result.case });\n", to: "", breaks: "B24" },
  { name: "Souldrinker heals from any kill", file: HOOKS, from: "      if (levelOf(victim) >= levelOf(killer) - below) {", to: "      if (true) {", breaks: "B25" },
  { name: "Spell Resilience leaves DB alone", file: CAST, from: "  const defendedDB = Number.isFinite(baseDB) ? baseDB + dragonhideDB + resilienceDB : NaN;", to: "  const defendedDB = Number.isFinite(baseDB) ? baseDB + dragonhideDB : NaN;", breaks: "B26" },
  { name: "Arcadian casts are not Specialist", file: CAST, from: "|| Boolean(spell.getFlag?.(SYSTEM_ID, \"bookOfNotationsPick\")) || castDerives.specialistAll;", to: "|| Boolean(spell.getFlag?.(SYSTEM_ID, \"bookOfNotationsPick\"));", breaks: "B27" },
  { name: "Corrode never splits with a shield", file: HOOKS, from: "    const half = Math.floor(Number(amount) / 2);", to: "    const half = 0;", breaks: "B29" },
  { name: "Trample provokes", file: CODEX, from: "provokes: false }, item.name);", to: "provokes: true }, item.name);", breaks: "B30" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-codex.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-codex: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-codex: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-codex: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
