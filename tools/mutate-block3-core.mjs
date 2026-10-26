#!/usr/bin/env node
/** mutate-block3-core — the mutation half of verify-block3-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const SR = m("stat-rows.mjs"), ACT = m("documents", "actor.mjs"), UP = m("combat", "unarmed-profile.mjs"), ATK = m("combat", "attack.mjs");
const AW = m("combat", "attack-workflow.mjs"), DMG = m("combat", "damage.mjs"), SS = m("combat", "strike-series.mjs");
const AR = m("combat", "attack-reroll.mjs"), ARW = m("combat", "attack-reroll-workflow.mjs"), CW = m("magic", "cast-workflow.mjs");
const FD = m("focus-declarations.mjs"), DW = m("combat", "dying-workflow.mjs"), DE = m("magic", "declared-effect.mjs");
const API = m("module-api-workflow.mjs"), BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const GA = m("grant-autorun.mjs"), ITEM = m("documents", "item.mjs"), FEW = m("focus-extra-workflow.mjs");

const MUTATIONS = [
  // A
  { name: "an unknown target is kept", file: SR, from: "      if (row && typeof row === \"object\" && STAT_ROW_PATHS[norm(row.target)]) {", to: "      if (row && typeof row === \"object\") {", breaks: "A1" },
  { name: "a disabled effect still counts", file: SR, from: "    if (!c || c.disabled) continue;\n    const raw = c.flags?.[FLAG]?.statBonuses;", to: "    if (!c) continue;\n    const raw = c.flags?.[FLAG]?.statBonuses;", breaks: "A1" },
  { name: "armour does not switch a row off", file: SR, from: "  if (when.unarmoured && wearingArmour) return \"wearing armour\";\n", to: "", breaks: "A3" },
  { name: "encumbrance does not switch a row off", file: SR, from: "  if (when.unencumbered && encumbered) return \"encumbered\";\n", to: "", breaks: "A4" },
  { name: "a negative ability is a penalty", file: SR, from: "    return Math.max(0, Number.isFinite(total) ? total : 0);", to: "    return Number.isFinite(total) ? total : 0;", breaks: "A5" },
  { name: "the last step reached is not the one used", file: SR, from: "      if (Number(level) >= Number(step?.level ?? Infinity)) best = Number(step?.value) || 0;", to: "      best = Math.max(best, Number(step?.value) || 0);", breaks: "A2/A5" },
  { name: "the Defence rows are never added", file: ACT, from: "      if (path === \"system.combat.defence\") actor.addBonus(path, entry);", to: "      if (path === \"system.combat.dodge\") actor.addBonus(path, entry);", breaks: "A6" },
  { name: "the Speed rows are never added", file: ACT, from: "      if (path === \"system.combat.movement.land\") actor.addBonus(path, entry);", to: "", breaks: "A7" },
  { name: "a shield counts as armour", file: ACT, from: "    wearingArmour: items.some((i) => i.type === \"armour\" && i.system?.equipped),", to: "    wearingArmour: items.some((i) => [\"armour\", \"shield\"].includes(i.type) && i.system?.equipped),", breaks: "A8" },
  // B
  { name: "the die is trained on every unarmed weapon", file: UP, from: "    if (fists && row.die) {", to: "    if (row.die) {", breaks: "B4" },
  { name: "the die may shrink", file: UP, from: "      if (sides && (!current || sides > current)) { damage = `1d${sides}`; labels.add(row.label); }", to: "      if (sides) { damage = `1d${sides}`; labels.add(row.label); }", breaks: "B3" },
  { name: "the bonus is per 3 BAB from 0", file: UP, from: "  return Math.floor(Math.max(0, Number(bab) || 0) / every) * value;", to: "  return Math.ceil(Math.max(0, Number(bab) || 0) / every) * value;", breaks: "B1/B2" },
  { name: "counts-as ignores its BAB", file: UP, from: "      if (Math.max(0, Number(bab) || 0) < Math.max(0, Number(at) || 0)) continue;\n", to: "", breaks: "B2" },
  { name: "the Monastic trait is ignored", file: UP, from: "  return isUnarmedStrike(weaponSystem) || weaponSystem?.unarmed === true || hasMonasticTrait(weaponSystem);", to: "  return isUnarmedStrike(weaponSystem) || weaponSystem?.unarmed === true;", breaks: "B4/B5" },
  { name: "a claw is a fist", file: UP, from: "  return Boolean(s.natural) && norm(s.category) === \"unarmed\" && norm(s.damageType) === \"subdual\";", to: "  return Boolean(s.natural) && norm(s.category) === \"unarmed\";", breaks: "B5" },
  { name: "a second Versatile trait is added", file: UP, from: "  if (profile.versatile && !/\\bversatile\\b/i.test(String(out.traits ?? \"\"))) {", to: "  if (profile.versatile) {", breaks: "B7" },
  { name: "Versatile B reads as nothing", file: ATK, from: "  return { S: \"slashing\", P: \"piercing\", B: \"bludgeoning\" }[letter] ?? null;", to: "  return { S: \"slashing\", P: \"piercing\" }[letter] ?? null;", breaks: "B8" },
  { name: "the Strike's fists are untrained", file: AW, from: "  const fistData = stoneFist ? { ...trainedFist, ...stoneFist } : trainedFist;", to: "  const fistData = stoneFist ? { ...armouredFist.data, ...stoneFist } : armouredFist.data;", breaks: "B9" },
  { name: "the trained die overrides another", file: AW, from: "  if (!damageOverride && unarmed?.damage) damageOverride = unarmed.damage;", to: "  if (unarmed?.damage) damageOverride = unarmed.damage;", breaks: "B10" },
  { name: "the flat is never added", file: AW, from: "  if (unarmedFlat) formula += ` + ${unarmedFlat}`;", to: "", breaks: "B11" },
  { name: "trained fists are not magical", file: AW, from: "      || Boolean(unarmed?.magical)\n", to: "      || false\n", breaks: "B12" },
  { name: "the materials never reach the defences", file: AW, from: "...(unarmed?.materials ?? []), ...(bonded?.materials ?? [])]", to: "...(bonded?.materials ?? [])]", breaks: "B13" },
  { name: "the profile is read at BAB 0", file: AW, from: "  return unarmedProfile(weaponSystem, declaredUnarmedRows(carriers), Number(actor?.system?.combat?.bab?.total ?? 0));", to: "  return unarmedProfile(weaponSystem, declaredUnarmedRows(carriers), 0);", breaks: "B14" },
  { name: "a weakness reads only one material", file: DMG, from: "  const materialWeak = materialKeys.some((key) => has(weaknessMaterials, key));", to: "  const materialWeak = Boolean(materialKey) && has(weaknessMaterials, materialKey);", breaks: "B15" },
  // C
  { name: "every Strike meets DR again", file: SS, from: "    drWaived: Boolean(uuid) && (state?.hitTargets ?? []).includes(uuid),", to: "    drWaived: false,", breaks: "C2" },
  { name: "every creature's DR is waived after the first hit", file: SS, from: "    drWaived: Boolean(uuid) && (state?.hitTargets ?? []).includes(uuid),", to: "    drWaived: Boolean(uuid) && (state?.hitTargets ?? []).length > 0,", breaks: "C3" },
  { name: "a miss counts as a hit", file: SS, from: "  if (result?.hits && uuid && !state.hitTargets.includes(uuid)) state.hitTargets.push(uuid);", to: "  if (uuid && !state.hitTargets.includes(uuid)) state.hitTargets.push(uuid);", breaks: "C4" },
  { name: "an immune creature's critical used up the injury", file: SS, from: "  if (result?.hits && result?.critical && !carried?.noCriticalInjury && !result?.injuryImmune) {", to: "  if (result?.hits && result?.critical && !carried?.noCriticalInjury) {", breaks: "C5" },
  { name: "the series does not carry its options", file: SS, from: "      drWaived: options.drWaived,\n      noCriticalInjury: options.noCriticalInjury,", to: "", breaks: "C7" },
  { name: "the MAP override is dropped", file: SS, from: "      ...(strike.mapOverride !== undefined && strike.mapOverride !== null ? { mapOverride: strike.mapOverride } : {}),\n", to: "", breaks: "C7" },
  { name: "the DR is met anyway", file: AW, from: "    const effectiveDrForHit = drWaived ? 0\n", to: "    const effectiveDrForHit = false ? 0\n", breaks: "C9" },
  { name: "the second injury is rolled", file: AW, from: "  if (strikeLands && outcome.critical && !outcome.critical.injuryImmune && !injuryReplaced && !noCriticalInjury) {", to: "  if (strikeLands && outcome.critical && !outcome.critical.injuryImmune && !injuryReplaced) {", breaks: "C10" },
  { name: "the waiver never reaches damage", file: AW, from: "      drWaived,\n      seriesLabel,\n", to: "      seriesLabel,\n", breaks: "C11" },
  // D
  { name: "Chaos may be rerolled", file: AR, from: "  if (chaos) return { offer: false, reason: \"a Chaos result cannot be rerolled\" };\n", to: "", breaks: "D2" },
  { name: "you may reroll your own attack", file: AR, from: "  if (attackerIsDefender) return { offer: false, reason: \"not against your own attack\" };\n", to: "", breaks: "D2" },
  { name: "no conviction needed", file: AR, from: "  if (!conviction?.ok) return { offer: false, reason: String(conviction?.reason ?? \"no conviction to spend\") };\n", to: "", breaks: "D2" },
  { name: "the spell reroll loses its modifiers", file: AR, from: "  return Number(total ?? 0) - Number(oldDice ?? 0) + Number(newDice ?? 0);", to: "  return Number(newDice ?? 0);", breaks: "D3" },
  { name: "a Strike is never offered", file: AW, from: "    const asked = await offerAttackReroll({ attacker: actor, defender: targetActor, check, what: weapon.name, db });", to: "    const asked = { rerolled: false };", breaks: "D4" },
  { name: "the rerolled Strike may spend conviction again", file: AW, from: "      check = await TRGCheck.roll({ ...attackCheckConfig, allowConviction: false, conditionalChoices: check.conditionalChoices ?? [] });", to: "      check = await TRGCheck.roll({ ...attackCheckConfig, conditionalChoices: check.conditionalChoices ?? [] });", breaks: "D4" },
  { name: "only the first ray is offered", file: CW, from: "  if (!check?.rerolledFrom) {\n    const { offerAttackReroll, rerolledSpellCheck, postRerollCard }", to: "  if (!quiet && !check?.rerolledFrom) {\n    const { offerAttackReroll, rerolledSpellCheck, postRerollCard }", breaks: "D5" },
  { name: "the point is spent without re-checking", file: ARW, from: "  if (!getConvictionState(defender).ok) return false;\n  await markConvictionSpent(defender);", to: "  await markConvictionSpent(defender);", breaks: "D6" },
  { name: "the listener is never registered", file: BOOT, from: "  registerAttackRerollOffers();\n", to: "", breaks: "D7" },
  // E
  { name: "the allowance is ignored", file: FD, from: "  if (pp <= level + extra) return null;", to: "  if (pp <= level) return null;", breaks: "E1" },
  { name: "a negative allowance lowers the limit", file: FD, from: "  return Math.max(0, Math.floor(Number(spell?.flags?.[FLAG_SCOPE]?.innatePPAllowance) || 0));", to: "  return Math.floor(Number(spell?.flags?.[FLAG_SCOPE]?.innatePPAllowance) || 0);", breaks: "E2" },
  { name: "casting does not pass the allowance", file: CW, from: "      allowance: innatePPAllowanceOf(spell)\n", to: "      allowance: 0\n", breaks: "E3" },
  // F
  { name: "nothing is announced", file: DW, from: "    Hooks.callAll(\"trgPrimeDamageApplied\", {", to: "    Hooks.callAll(\"trgPrimeDamageNoted\", {", breaks: "F1" },
  { name: "zero damage is announced", file: DW, from: "  if (actor && taken > 0) {", to: "  if (actor) {", breaks: "F1" },
  { name: "a Strike's context is dropped", file: AW, from: "      context: { kind: \"strike\", melee: isMelee, damageType: String(effectiveDamageType ?? \"\"), weaponName: weapon?.name ?? \"\" }", to: "      context: null", breaks: "F2" },
  { name: "one spell call forgets its context", file: CW, from: "            sourceUuid: actor?.uuid ?? \"\", context: { kind: \"spell\", spellName: spell?.name ?? \"\" }\n", to: "            sourceUuid: actor?.uuid ?? \"\"\n", breaks: "F3" },
  // G
  { name: "a declared effect may not carry stat rows", file: DE, from: "  \"statBonuses\",\n", to: "", breaks: "G1" },
  { name: "a declared effect may not carry conditionals", file: DE, from: "  \"conditionals\",\n  // THE GRIMOIRE'S FLAGS", to: "  // THE GRIMOIRE'S FLAGS", breaks: "G2" },
  // H (3.667.1)
  { name: "a given point is owed again", file: FD, from: "  return n > 0 && !item?.flags?.[FLAG_SCOPE]?.convictionGiven;", to: "  return n > 0;", breaks: "H1" },
  { name: "the grant pass skips the owed point again", file: GA, from: "        && !owesConvictionPoint(item)) continue;", to: "        ) continue;", breaks: "H2" },
  { name: "the create watcher skips it again", file: GA, from: "        && !owesConvictionPoint(item)) return;", to: "        ) return;", breaks: "H2" },
  { name: "a spent use is refilled by the top-up", file: FD, from: "    if (extra > 0) out.push({ _id: item.id, \"system.usesValue\": Math.max(0, Math.floor(Number(item.system?.usesValue) || 0)) + extra });", to: "    if (extra > 0) out.push({ _id: item.id, \"system.usesValue\": 1 + extra });", breaks: "H3" },
  { name: "the item arrives with its base use only", file: ITEM, from: "      const full = focusUses + extra;", to: "      const full = focusUses;", breaks: "H5" },
  { name: "every client tops up", file: FEW, from: "    if (userId !== game.user?.id) return;\n", to: "", breaks: "H6" },
  { name: "the top-up is never registered", file: BOOT, from: "  registerFocusExtraTopUps();\n", to: "", breaks: "H6" },
  { name: "the series helper is gone", file: API, from: "      runStrikeSeries: async (...args) => (await import(\"./combat/strike-series.mjs\")).runStrikeSeries(...args),\n", to: "", breaks: "G3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block3-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block3-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-block3-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block3-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
