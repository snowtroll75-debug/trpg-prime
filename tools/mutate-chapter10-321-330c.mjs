#!/usr/bin/env node
/**
 * mutate-chapter10-321-330c — can the block 32 R3–R8 checks fail?
 *
 * NEW at 3.608.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE F SECTION'S FIRST MUTATION IS THE DEFECT THE 3.606.0 LIVE TEST FOUND:
 * a condition granted by another (Blinded, from Dying) read as already
 * present, so a Sunburst Fumble's permanent blindness was never written.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RIDERS = at("module", "magic", "attack-riders.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const DAMAGE = at("module", "combat", "damage-workflow.mjs");
const WARP = at("module", "magic", "spell-warp.mjs");
const SIZE = at("module", "magic", "size-step.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const MANEUVER = at("module", "magic", "spell-maneuver.mjs");
const DRAIN = at("module", "magic", "spell-drain.mjs");
const TURN = at("module", "magic", "spell-turning.mjs");
const ZONE = at("module", "magic", "obscuring-zone.mjs");
const EMAN = at("module", "magic", "emanation.mjs");
const EMAN_FX = at("module", "magic", "emanation-effects.mjs");
const TARGETING = at("module", "combat", "targeting.mjs");
const CLOCK = at("module", "magic", "wearing-clock.mjs");
const SPIRIT = at("module", "magic", "spiritual-weapon.mjs");
const SUSTAIN = at("module", "magic", "sustain-workflow.mjs");
const VERSUS = at("module", "magic", "versus-damage.mjs");
const EFFECT_APP = at("module", "combat", "effect-application-workflow.mjs");
const RESULT = at("module", "magic", "cast-result-line.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const VERIFY = at("tools", "verify-chapter10-321-330c.mjs");

const MUTATIONS = [
  /* ---------------- R. the riders ---------------- */
  { file: RIDERS, name: "R: metal armour in the pack counts",
    from: "    && item.system?.equipped\n", to: "\n", breaks: "R1b" },
  { file: RIDERS, name: "R: a creature made of metal is not metal",
    from: "  return Boolean(madeOfMetal) || wearsMetalArmour(items);", to: "  return wearsMetalArmour(items);", breaks: "R1c" },
  { file: RIDERS, name: "R: the rider burns anybody again (the shipped defect)",
    from: "  if (spec.recurringOnlyVsMetal && !isMetal) return { applies: false, amount: 0, doubled: false };",
    to: "", breaks: "R3b" },
  { file: RIDERS, name: "R: a critical does not double the rider",
    from: "  const doubled = Boolean(spec.doubleOnCritical && critical);", to: "  const doubled = false;", breaks: "R3c" },
  { file: CAST, name: "R: the metal row never reaches the pool",
    from: "    spellAttackBonusRows(actor.system?.combat?.attack?.checkModifiers).concat(metalRow ? [metalRow] : [])\n",
    to: "    spellAttackBonusRows(actor.system?.combat?.attack?.checkModifiers)\n", breaks: "R4" },
  { file: CAST, name: "R: the non-metal gate on the rider goes",
    from: "    } else if (metalSpec?.recurringOnlyVsMetal && !targetIsMetal) {", to: "    } else if (false) {", breaks: "R4b" },
  { file: CAST, name: "R: the rolled rider is taken raw",
    from: "      const amount = metalRider.amount;", to: "      const amount = persistRoll.total;", breaks: "R4c" },
  { file: RIDERS, name: "R: the arc rounds up",
    from: "  return Math.max(0, Math.floor((Number(rolled) || 0) * spec.fraction));",
    to: "  return Math.max(0, Math.ceil((Number(rolled) || 0) * spec.fraction));", breaks: "R5b" },
  { file: RIDERS, name: "R: the arc reaches ten feet",
    from: "  if (feet === null || !Number.isFinite(d) || d > spec.reachFeet) return false;",
    to: "  if (feet === null || !Number.isFinite(d) || d > spec.reachFeet * 2) return false;", breaks: "R5d" },
  { file: RIDERS, name: "R: the arc ignores the metal",
    from: "  if (spec.requires === \"metalArmour\" && !wearsMetal) return false;", to: "", breaks: "R5e" },
  { file: RIDERS, name: "R: the struck creature is its own neighbour",
    from: "  if (!spec || isStruck) return false;", to: "  if (!spec) return false;", breaks: "R5f" },
  { file: CAST, name: "R: any critical arcs, injury or not",
    from: "  if (critSplash && outcome.critical && spellInflictsCriticalInjury(spellData)) {",
    to: "  if (critSplash && outcome.critical) {", breaks: "R6" },
  { file: CAST, name: "R: the arc saves at DC 0",
    from: "        saveDC: Number(splashSaveDC ?? 0) || 0,", to: "        saveDC: 0,", breaks: "R6c" },
  { file: CAST, name: "R: the arc takes half of the critical's extra too",
    from: "    const amount = critSplashAmount(critSplash, boltRolled);", to: "    const amount = critSplashAmount(critSplash, dealt);", breaks: "R6d" },
  { file: RIDERS, name: "R: the warp's steps are thrown away",
    from: "  const top = Math.min(ARMOUR_STEPS.length - 1, start + extra);", to: "  const top = start;", breaks: "R7" },
  { file: RIDERS, name: "R: the bypass reads nothing",
    from: "  return categories.includes(lower(item.system?.category));", to: "  return false;", breaks: "R7d" },
  { file: CAST, name: "R: the bypass never leaves the attack",
    from: "      armourBypass: ray.armourBypass ?? [],", to: "      armourBypass: [],", breaks: "R8b" },
  { file: ATTACK, name: "R: the table reads every piece again",
    from: "withWholeBodyArmour(armourAtLocation(seenItems, hitLocation),", to: "withWholeBodyArmour(armourAtLocation(Array.from(targetActor.items ?? []), hitLocation),",
    breaks: "R8c" },
  { file: WARP, name: "R: the armour step warp buys nothing",
    from: "    if (m.armourStep) mods.armourStep += Number(m.armourStep) * times;", to: "", breaks: "R8d" },
  { file: WARP, name: "R: a split purchase loses a step",
    from: "      armourStep: Number(a.mods?.armourStep ?? 0) + Number(b.mods?.armourStep ?? 0),",
    to: "      armourStep: Number(b.mods?.armourStep ?? 0),", breaks: "R8e" },
  { file: CAST, name: "R: the bleed is not scaled by the save",
    from: "        const value = Math.floor(baseDamage * bs.damageMultiplier);", to: "        const value = baseDamage;", breaks: "R10" },
  { file: CAST, name: "R: the bleed-immune take the bleed they are immune to",
    from: "      const spared = immuneAlternate && target.isImmuneToCondition?.(immuneAlternate.immuneTo);",
    to: "      const spared = false;", breaks: "R10b" },
  { file: CAST, name: "R: the vibration stops at a sonic immunity",
    from: "          ignoreImmunityTo: immuneAlternate.ignoresImmunity ? immuneAlternate.type : \"\"",
    to: "          ignoreImmunityTo: \"\"", breaks: "R10c" },
  { file: CAST, name: "R: every creature in the cone rolls its own vibration",
    from: "        if (alternateBase === null) {", to: "        if (true) {", breaks: "R10d" },
  { file: DAMAGE, name: "R: the named immunity is not struck out",
    from: "    immunities: withoutIgnored(defences.immunities),", to: "    immunities: defences.immunities,", breaks: "R11b" },
  { file: DAMAGE, name: "R: every immunity is struck out",
    from: "    const kept = Array.from(list ?? []).filter((k) => String(k).trim().toLowerCase() !== ignored);",
    to: "    const kept = [];", breaks: "R11c" },

  /* ---------------- S. Size Alteration ---------------- */
  { file: SIZE, name: "S: the ceiling is ignored — a Large creature grows",
    from: "  const over = ceiling < 0 ? 0 : Math.max(0, at - ceiling);", to: "  const over = 0;", breaks: "S2" },
  { file: SIZE, name: "S: the +6 PP option buys nothing",
    from: "  const base = Math.max(0, int(spec.steps ?? 1)) + Math.max(0, int(reach));",
    to: "  const base = Math.max(0, int(spec.steps ?? 1));", breaks: "S3" },
  { file: SIZE, name: "S: no tiny minimum",
    from: "  const lowest = floor < 0 ? 0 : floor;", to: "  const lowest = 0;", breaks: "S4b" },
  { file: SIZE, name: "S: reduce grows instead",
    from: "  return room > 0 ? { steps: -Math.min(count, room), why: \"\" } : { steps: 0, why: \"at the floor\" };",
    to: "  return room > 0 ? { steps: Math.min(count, room), why: \"\" } : { steps: 0, why: \"at the floor\" };", breaks: "S4" },
  { file: APPLIER, name: "S: the applier never reads the reversal",
    from: "              reverse: Boolean(effect.reversible && warpMods?.sizeReverse)", to: "              reverse: false", breaks: "S5" },
  { file: WARP, name: "S: the reduce warp buys nothing",
    from: "    if (m.sizeReverse) mods.sizeReverse = true;", to: "", breaks: "S6" },

  /* ---------------- G. Spectral Grasp ---------------- */
  { file: MANEUVER, name: "G: the chooser offers only the first maneuver",
    from: "    return effect.actions.map((a) => String(a ?? \"\").trim()).filter(Boolean);",
    to: "    return [String(effect.actions[0] ?? \"\").trim()];", breaks: "G1" },
  { file: MANEUVER, name: "G: a critical shove moves five",
    from: "  shoveAttack: Object.freeze({ heroic: 10, critical: 10, success: 5 })",
    to: "  shoveAttack: Object.freeze({ heroic: 5, critical: 5, success: 5 })", breaks: "G2" },
  { file: MANEUVER, name: "G: a Heroic reads nothing",
    from: "  const ladder = [\"heroic\", \"critical\", \"success\"];", to: "  const ladder = [\"heroic\"];", breaks: "G3" },
  { file: APPLIER, name: "G: every maneuver rolls against Fortitude again",
    from: "            ? actionTargetDC(actionData.against, target.system ?? null).dc",
    to: "            ? Number(target.system?.combat?.saves?.fortitude?.dc ?? 0) || null", breaks: "G4" },
  { file: APPLIER, name: "G: the shove moves nobody",
    from: "            const moved = await forceMoveAway(caster, target, pushFeet);",
    to: "            const moved = { text: \"\" };", breaks: "G5" },

  /* ---------------- D. Spell Drain ---------------- */
  { file: DRAIN, name: "D: a drain lifts a Blunder to a Failure",
    from: "  return a > b ? rolled : forced;", to: "  return forced;", breaks: "D5" },
  { file: DRAIN, name: "D: the drainer is filled past the maximum",
    from: "  return Math.max(0, Math.min(int(spent), room));", to: "  return Math.max(0, int(spent));", breaks: "D6" },
  { file: CAST, name: "D: the penalty never reaches the check",
    from: "  if (drain?.penalty) {\n    modifiers.push({", to: "  if (false) {\n    modifiers.push({", breaks: "D7" },
  { file: CAST, name: "D: the dice stand",
    from: "    degree = drainedDegree(drain, degree);", to: "", breaks: "D7b" },
  { file: APPLIER, name: "D: nothing is left waiting",
    from: "          const drainRecorded = await recordSpellDrain(target, effect, caster);",
    to: "          const drainRecorded = null;", breaks: "D8" },

  /* ---------------- T. Spell Turning ---------------- */
  { file: TURN, name: "T: an area spell is turned",
    from: "  return Boolean(text(spellData?.targets)) && !text(spellData?.area);",
    to: "  return Boolean(text(spellData?.targets));", breaks: "T1b" },
  { file: TURN, name: "T: a spell with no targets is offered",
    from: "  return Boolean(text(spellData?.targets)) && !text(spellData?.area);",
    to: "  return !text(spellData?.area);", breaks: "T1c" },
  { file: APPLIER, name: "T: the ward records the printed PP, not this casting's",
    from: "          const tSpec = normaliseSpellTurning({ ...effect, pp: Number(rollData?.pp ?? 0) });",
    to: "          const tSpec = normaliseSpellTurning({ ...effect, pp: 14 });", breaks: "T3" },
  { file: CAST, name: "T: the casting never offers it",
    from: "  if (outcome.cast && !isItemCast) {\n    const { castCanBeTurned }",
    to: "  if (false) {\n    const { castCanBeTurned }", breaks: "T4" },

  /* ---------------- Z. Solid Fog ---------------- */
  { file: ZONE, name: "Z: the fog follows its caster",
    from: "  return !/emanation/i.test(text(spellData?.area));", to: "  return false;", breaks: "Z1" },
  { file: EMAN, name: "Z: the fog is not live",
    from: "  if (effects.some((e) => PLACED_LIVE_KINDS.includes(String(e?.kind ?? \"\")))) return true;",
    to: "", breaks: "Z2" },
  { file: ZONE, name: "Z: creatures in the same cloud cannot see each other either",
    from: "  return (attackerZones ?? []).find((z) => z?.obscuresOutward && text(z.castId) && !theirs.has(text(z.castId)))",
    to: "  return (attackerZones ?? []).find((z) => z?.obscuresOutward && text(z.castId))", breaks: "Z4b" },
  { file: TARGETING, name: "Z: the avoidance check ignores the attacker's cloud",
    // Re-anchored 3.610.0: a wall or storm's screen joins the expression.
    from: "  const concealed = !ignoreConcealed && (Boolean(targetActor.hasCondition(\"concealed\")) || byLight.concealed || Boolean(fogged)\n",
    to: "  const concealed = !ignoreConcealed && (Boolean(targetActor.hasCondition(\"concealed\")) || byLight.concealed\n", breaks: "Z5" },
  { file: CAST, name: "Z: the placed circle is anchored to the caster",
    from: "        ...(zoneIsPlaced(spellData) ? { anchorTokenId: null } : {}),", to: "", breaks: "Z6" },
  { file: EMAN_FX, name: "Z: the membership effect conceals nobody",
    from: "      statuses: zone.statuses,", to: "      statuses: [],", breaks: "Z7" },

  /* ---------------- W. Stoneskin ---------------- */
  { file: CLOCK, name: "W: fire wears the skin",
    from: "  return damageTypes?.[text(damageType).toLowerCase()]?.group === spec.on;",
    to: "  return Boolean(damageTypes?.[text(damageType).toLowerCase()]);", breaks: "W1b" },
  { file: CLOCK, name: "W: the round clock is left alone",
    from: "  const expiresRound = has(clocks?.expiresRound) ? Number(clocks.expiresRound) - rounds : null;",
    to: "  const expiresRound = has(clocks?.expiresRound) ? Number(clocks.expiresRound) : null;", breaks: "W2" },
  { file: CLOCK, name: "W: THE LIVE DEFECT — an empty duration is written back",
    from: "  if (clocks?.duration && Number.isInteger(v) && Number.isFinite(off)) {",
    to: "  if (clocks?.duration) {", breaks: "W2b" },
  { file: at("module", "magic", "wearing-clock-workflow.mjs"), name: "W: a refused update is reported as worn",
    from: "        if (Object.keys(update).length && !(await effect.update(update))) failed = true;",
    to: "        if (Object.keys(update).length) await effect.update(update);", breaks: "W2d" },
  { file: CLOCK, name: "W: a worn-out skin keeps going",
    from: "  const spentByTime = remainingSeconds !== null && remainingSeconds <= 0;", to: "  const spentByTime = false;", breaks: "W3" },
  { file: ATTACK, name: "W: nothing is worn by a blow",
    from: "    await wearOnHit(damageOutcome.targetActor, damageOutcome.damageType);", to: "", breaks: "W4" },
  { file: WARP, name: "W: the adamantine warp buys nothing",
    from: "    if (m.defenceValue) mods.defenceValue = String(m.defenceValue);", to: "", breaks: "W6" },

  /* ---------------- X. Spiritual Weapon and Smash ---------------- */
  { file: SPIRIT, name: "X: a bow is a melee weapon",
    from: "    && text(i.system?.attackMode || \"melee\") !== \"missile\"\n", to: "\n", breaks: "X1" },
  { file: SPIRIT, name: "X: THE LIVE DEFECT — a fist is a held weapon",
    from: "    && !isNaturalAttack(i.system));", to: ");", breaks: "X1b" },
  { file: RIDERS, name: "R: THE LIVE DEFECT — an arc to nobody prints its damage",
    from: "  if (!caught.length) {\n", to: "  if (false) {\n", breaks: "R5g" },
  { file: APPLIER, name: "G: THE LIVE DEFECT — a push reads as no effect",
    from: "              : after.length ? \".\" : \" — no effect.\")", to: "              : \" — no effect.\")", breaks: "G7" },
  { file: SPIRIT, name: "X: the warp's item bonus is lost",
    from: "    itemBonus: spec.itemBonus + Math.max(0, int(warpBonus)),", to: "    itemBonus: spec.itemBonus,", breaks: "X2" },
  { file: SPIRIT, name: "X: the magical ability is not added",
    from: "  return a ? `${record.dice} ${a > 0 ? \"+\" : \"-\"} ${Math.abs(a)}` : record.dice;",
    to: "  return record.dice;", breaks: "X3" },
  { file: SUSTAIN, name: "X: a Sustain strikes nothing",
    from: "  const strikeLines = ranOut ? [] : await strikeOnSustain(actor, entry.id);", to: "  const strikeLines = [];",
    breaks: "X4" },
  { file: VERSUS, name: "X: Smash is uncapped",
    from: "    value: max ? Math.min(max, value) : value,", to: "    value,", breaks: "X5" },
  { file: VERSUS, name: "X: the discharge doubles nothing",
    from: "  const multiplier = discharge && best.discharge > 1 ? best.discharge : 1;", to: "  const multiplier = 1;",
    breaks: "X7" },
  { file: ATTACK, name: "X: the formula never takes the bonus",
    from: "  if (versus.value > 0) formula += ` + ${versus.value}`;", to: "", breaks: "X8" },

  /* ---------------- F. the findings ---------------- */
  { file: EFFECT_APP, name: "F: THE LIVE DEFECT — a granted condition reads as applied",
    from: "    const wasAlreadyPresent = directConditionEffect(actor, tag.key) !== null;",
    to: "    const wasAlreadyPresent = Boolean(actor.hasCondition?.(tag.key));", breaks: "F1" },
  { file: RESULT, name: "F: a ladder whose targets all saved finds nobody again",
    // RE-ANCHORED 3.609.0: the list now continues past "zone".
    from: "\"hazard\", \"saveLadder\", \"difficultTerrain\", \"zone\",\n", to: "\"hazard\", \"difficultTerrain\", \"zone\",\n",
    breaks: "F2" },
  { file: APPLIER, name: "F: the owed save is lower case again",
    from: "              const saveWord = String(stamped.save ?? \"\").charAt(0).toUpperCase() + String(stamped.save ?? \"\").slice(1);",
    to: "              const saveWord = String(stamped.save ?? \"\");", breaks: "F3" },
  { file: at("module", "pack-repair.mjs"), name: "H: a copy repaired at 3.606.0 reads as house-ruled",
    from: "    else if ((Array.isArray(r.alsoFrom) ? r.alsoFrom : []).some((f) => deepEquals(own, f))) state = \"stale\";\n",
    to: "", breaks: "H5b" },
  { file: KINDS, name: "F: the drain is undeclared",
    from: "  \"spellDrain\",\n", to: "", breaks: "K spellDrain" }
];

const PACK = [
  { spell: "Shocking Grasp", name: "P: the metal affinity is dropped",
    mutate: (sy) => { delete sy.damage.metal; }, breaks: "P1" },
  { spell: "Sonic Rupture", name: "P: the rupture loses its save",
    mutate: (sy) => { sy.defence = ""; }, breaks: "P2" },
  { spell: "Spell Drain", name: "P: the drain becomes a Fortitude",
    mutate: (sy) => { sy.defence = "Fortitude"; }, breaks: "P2b" },
  { spell: "Stone Call", name: "P: the rubble deals nothing",
    mutate: (sy) => { sy.damage.formula = ""; }, breaks: "P2c" },
  { spell: "Spiritual Weapon", name: "P: the weapon stops being sustained",
    mutate: (sy) => { sy.sustained = false; }, breaks: "P2d" },
  { spell: "Speak With Dead", name: "H: a Heroic corpse escapes again (the ruling undone)",
    mutate: (sy) => { sy.effects.find((e) => e.marker === "haunted").onSave = ["critical"]; }, breaks: "H1" },
  { spell: "Speak With Dead", name: "H: a Heroic haunts but hears nothing of the Critical's words",
    mutate: (sy) => { sy.effects.find((e) => /deceive/.test(e.text ?? "")).onSave = ["critical"]; }, breaks: "H2" },
  { spell: "Solid Fog", name: "P: the fog's zone is dropped",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "zone"); }, breaks: "P1" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-chapter10-321-330c does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
try {
  for (const m of MUTATIONS) {
    const original = originals.get(m.file);
    const n = original.split(m.from).length - 1;
    if (n !== 1) {
      console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`);
      unmatched++;
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const stillPasses = run();
    fs.writeFileSync(m.file, original);
    if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
    else console.log(`  caught    ${m.name}`);
  }
} finally {
  for (const [file, original] of originals) fs.writeFileSync(file, original);
}

const { ClassicLevel } = await import("classic-level");
const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");
async function withSpell(name, fn) {
  const db = new ClassicLevel(SPELLS, { valueEncoding: "json" });
  await db.open();
  let key = null;
  let pristine = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() !== name.toLowerCase()) continue;
      key = k; pristine = JSON.parse(JSON.stringify(v)); break;
    }
    if (!key) return "ANCHOR MISSING";
    const mutated = JSON.parse(JSON.stringify(pristine));
    fn(mutated.system);
    await db.put(key, mutated);
  } finally { if (db.status === "open") await db.close(); }
  try {
    return run() ? "SURVIVED" : "caught";
  } finally {
    const db2 = new ClassicLevel(SPELLS, { valueEncoding: "json" });
    await db2.open();
    try { await db2.put(key, pristine); } finally { await db2.close(); }
  }
}
for (const m of PACK) {
  let state;
  try { state = await withSpell(m.spell, (sy) => m.mutate(sy)); }
  catch (err) { state = `ERROR ${err.message}`; }
  if (state === "caught") console.log(`  caught    ${m.name}`);
  else if (state === "SURVIVED") { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
  else { console.error(`  ${state}  ${m.name} (${m.spell})`); unmatched++; }
}

const TOTAL = MUTATIONS.length + PACK.length;
process.stdout.write(survived + unmatched
  ? `\nmutate-chapter10-321-330c: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-321-330c: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
