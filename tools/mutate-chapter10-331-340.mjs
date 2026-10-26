#!/usr/bin/env node
/**
 * mutate-chapter10-331-340 — can the block 33 checks fail?
 *
 * NEW at 3.609.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IN EACH SECTION PUTS BACK THE STATE THAT SHIPPED, where
 * there was one: recurring damage typed fire whatever the table, a Heroic
 * escaping a printed Critical, a Fumble's double paid as full.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RIDERS = at("module", "combat", "critical-riders.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const DEGREES = at("module", "magic", "spell-degrees.mjs");
const LADDER = at("module", "magic", "save-ladder.mjs");
const RECUR = at("module", "magic", "recurring-ladder-workflow.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const WARP = at("module", "magic", "spell-warp.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const KIND = at("module", "kind-targeting.mjs");
const SCOPE = at("module", "magic", "damage-scope.mjs");
const ENCASE = at("module", "magic", "encase.mjs");
const ACTION = at("module", "combat", "action-workflow.mjs");
const FOLLOW = at("module", "magic", "follow-up-save.mjs");
const TURN = at("module", "magic", "turn-save.mjs");
const EMAN = at("module", "magic", "emanation.mjs");
const EFFECT_APP = at("module", "combat", "effect-application-workflow.mjs");
const WARDS = at("module", "magic", "aggression-wards.mjs");
const SANCT = at("module", "magic", "sanctuary.mjs");
const GATE = at("module", "combat", "sanctuary-gate.mjs");
const EDGE = at("module", "magic", "strike-edge.mjs");
const LIFE = at("module", "magic", "life-transfer.mjs");
const ZONE = at("module", "magic", "obscuring-zone.mjs");
const EMAN_FX = at("module", "magic", "emanation-effects.mjs");
const IMMUNE = at("module", "magic", "temp-immunity-row.mjs");
const VERIFY = at("tools", "verify-chapter10-331-340.mjs");

const MUTATIONS = [
  /* ---------------- E. the open questions ---------------- */
  { file: RIDERS, name: "E: THE SHIPPED STATE — a critical's recurring damage is untyped, and so fire",
    from: "tag?.key === \"recurring\" && !tag.damageType ? { ...tag, damageType: type } : tag);", to: "tag);", breaks: "E1" },
  { file: RIDERS, name: "E: any table types the burn, damage type or not",
    from: "if (!type || !Object.prototype.hasOwnProperty.call(damageTypes ?? {}, type)) return tags;", to: "if (!type) return tags;", breaks: "E1d" },
  { file: ATTACK, name: "E: every table is read as fire",
    from: "const tableKey = CRITICAL_TABLES[damageType] ? damageType : \"slashing\";", to: "const tableKey = \"fire\";", breaks: "E1e" },
  { file: DEGREES, name: "E: THE SHIPPED STATE — a Heroic escapes a printed Critical",
    from: "  if (key === \"heroic\" && declared.includes(\"critical\")) return \"critical\";\n", to: "", breaks: "E2" },

  /* ---------------- L. the ladder ---------------- */
  { file: LADDER, name: "L: a Fumble's double is paid as full",
    from: "const fixed = dice === \"half\" ? Math.floor(total / 2) : dice === \"double\" ? total * 2 : total;",
    to: "const fixed = dice === \"half\" ? Math.floor(total / 2) : total;", breaks: "L1f" },
  { file: LADDER, name: "L: \"double\" is not a word a rung may say",
    from: "const RUNG_WORDS = Object.freeze([\"half\", \"full\", \"double\", \"margin\"]);",
    to: "const RUNG_WORDS = Object.freeze([\"half\", \"full\", \"margin\"]);", breaks: "L1" },
  { file: LADDER, name: "L: a basic-save critical is ignored",
    from: "  const severity = spec.basicCriticals\n    ? (basicSeverity || null)", to: "  const severity = false\n    ? (basicSeverity || null)", breaks: "L3b" },
  { file: LADDER, name: "L: the turn ladder forgets it reads basic criticals",
    from: "basicCriticals: raw.basicCriticals === true };", to: "basicCriticals: false };", breaks: "L3" },
  { file: RECUR, name: "L: the turn sweep never works out the severity",
    from: "basicSeverity: spec.basicCriticals ? basicSavingThrow(", to: "basicSeverity: false ? basicSavingThrow(", breaks: "L3d" },
  { file: LADDER, name: "L: a rung carries no recurring rider",
    from: "  const persistent = Number(spec.persistentOn?.[rung] ?? 0) || 0;", to: "  const persistent = 0;", breaks: "L4b" },
  { file: LADDER, name: "L: a rung with only a rider is harmless",
    from: "&& !soulDestroyed && !persistent,", to: "&& !soulDestroyed,", breaks: "L4c" },
  { file: CAST, name: "L: a Fumble's rider is not doubled",
    from: "const rungPersistAmount = Math.floor(rungPersistRoll.total * outcome.persistent);",
    to: "const rungPersistAmount = rungPersistRoll.total;", breaks: "L4d" },
  { file: LADDER, name: "L: the heat stops at the template",
    from: "  return { formula, type, reachFeet: Math.max(0, Math.trunc(Number(raw.reachFeet) || 0)) };",
    to: "  return { formula, type, reachFeet: 0 };", breaks: "L2b" },
  { file: WARP, name: "L: the recurring warp's die is dropped",
    from: "    if (m.persistentDice) mods.persistentDice = addDice(mods.persistentDice, scaleDice(m.persistentDice, times));\n",
    to: "", breaks: "L5" },
  { file: WARP, name: "L: THE SHIPPED STATE — the second pool's warp reaches nothing",
    from: "    if (m.secondaryDice) mods.secondaryDice = addDice(mods.secondaryDice, scaleDice(m.secondaryDice, times));\n",
    to: "", breaks: "L5b" },
  { file: WARP, name: "L: a rung's warp is bought once whatever is paid",
    from: "mods.rungDice[rung] = addDice(mods.rungDice[rung] ?? \"\", scaleDice(dice, times));",
    to: "mods.rungDice[rung] = dice;", breaks: "L5d" },
  { file: WARP, name: "L: Warp Manipulation's second pass replaces the first's dice",
    from: "      secondaryDice: addDice(a.mods?.secondaryDice ?? \"\", b.mods?.secondaryDice ?? \"\"),",
    to: "      secondaryDice: b.mods?.secondaryDice ?? \"\",", breaks: "L5e" },
  { file: CAST, name: "L: the second pool rolls unwarped",
    from: "const secondaryFormula = addDice(secondary.formula, warpMods?.secondaryDice);",
    to: "const secondaryFormula = secondary.formula;", breaks: "L5f" },
  { file: WARP, name: "L: Turn Undead's warp reaches no higher",
    from: "    if (m.levelBump) mods.levelBump += Number(m.levelBump) * times;\n", to: "", breaks: "L5j" },
  { file: APPLIER, name: "L: THE SHIPPED STATE — the beacon's bleed warp never arrives",
    from: "stopsBleeding: Boolean(effect.stopsBleeding || warpMods?.stopsBleeding)", to: "stopsBleeding: Boolean(effect.stopsBleeding)", breaks: "L5h" },
  { file: CAST, name: "L: the heat's ring is the template's",
    from: "feetFromPointToToken(origin, tok) <= Number(areaConfig.distance) + reach)",
    to: "feetFromPointToToken(origin, tok) <= Number(areaConfig.distance))", breaks: "L6b" },

  /* ---------------- K. kinds ---------------- */
  { file: KIND, name: "K: a construct is living",
    // 3.627.0: "unliving" joined the list after construct.
    from: "const NON_LIVING_KINDS = Object.freeze([\"undead\", \"construct\", \"unliving\"]);", to: "const NON_LIVING_KINDS = Object.freeze([\"undead\", \"unliving\"]);", breaks: "K1c" },
  { file: SCOPE, name: "K: THE SHIPPED STATE — the wall of light burns everybody",
    from: "    return scope.kinds.some((kind) => isOfKind(targetSystem ?? {}, kind));", to: "    return true;", breaks: "K2c" },

  /* ---------------- X. the rock ---------------- */
  { file: ENCASE, name: "X: an Escape is rolled against the weakest hold",
    from: "return dcs.length ? Math.max(...dcs) : null;", to: "return dcs.length ? Math.min(...dcs) : null;", breaks: "X1b" },
  { file: ENCASE, name: "X: a Failure breaks free",
    from: "[\"heroic\", \"critical\", \"success\"].includes(", to: "[\"heroic\", \"critical\", \"success\", \"failure\"].includes(", breaks: "X2" },
  { file: ACTION, name: "X: the Escape is rolled against whatever the player types",
    from: "    resolved.dc = escapeHoldDC;\n", to: "", breaks: "X3" },
  { file: APPLIER, name: "X: a creature already slowed loses that slowing too when it climbs out",
    from: ".filter((a) => a && !a.immune && !a.wasAlreadyPresent)", to: ".filter((a) => a && !a.immune)", breaks: "X4" },

  /* ---------------- F. the second save ---------------- */
  { file: FOLLOW, name: "F: THE SHIPPED STATE — the killer's terror kills nobody",
    from: "return { rung: key, rows: rung.rows, slays: rung.slays };", to: "return { rung: key, rows: rung.rows, slays: false };", breaks: "F2" },
  { file: APPLIER, name: "F: everyone the blast caught owes the blinding save, critical or not",
    from: "? ladderResults.filter((r) => r?.critical).map((r) => r?.target).filter(Boolean)",
    to: "? ladderResults.map((r) => r?.target).filter(Boolean)", breaks: "F5" },
  { file: APPLIER, name: "F: the rung reads the first save's margin",
    from: "margin: followCheck?.outcome?.margin ?? null,", to: "margin: null,", breaks: "F5b" },

  /* ---------------- T. Turn Undead ---------------- */
  { file: TURN, name: "T: every undead is turned, whatever its level",
    from: "  return Math.max(0, int(level)) <= record.maxLevel;", to: "  return true;", breaks: "T1b" },
  { file: TURN, name: "T: the warp raises nothing",
    from: "    maxLevel: spec.maxLevel === null ? null : spec.maxLevel + Math.max(0, int(levelBump)),",
    to: "    maxLevel: spec.maxLevel,", breaks: "T1" },
  { file: TURN, name: "T: the critical never climbs",
    from: "  const steps = per > 0 ? Math.floor(gap / per) : 0;", to: "  const steps = 0;", breaks: "T3" },
  { file: TURN, name: "T: the critical climbs past deadly",
    from: "return SEVERITY_STEPS[Math.min(SEVERITY_STEPS.length - 1, from + steps)];", to: "return SEVERITY_STEPS[from + steps];", breaks: "T3b" },
  { file: CAST, name: "T: THE SHIPPED STATE — the cast rolls everyone's Will and does nothing with it",
    from: "      && !spellSavesOnTurnStart(spellData.effects)) {", to: "      ) {", breaks: "T4d" },
  { file: TURN, name: "T: a ladder owed at the start of a turn is rolled at the cast too",
    from: "    || (String(e?.kind ?? \"\").toLowerCase() === \"saveladder\" && !e.ladder", to: "    || (false && !e.ladder", breaks: "T4b" },
  { file: EMAN, name: "T: the circle is never recorded",
    // RE-ANCHORED 3.612.0: the list gained "heldBonus" (Inspire Heroics).
    // RE-ANCHORED 3.613.0: the list gained "defence" (Protector's Sphere).
    from: "Object.freeze([\"bonus\", \"perTurn\", \"antimagic\", \"zone\", \"turnSave\", \"heldBonus\", \"defence\", \"damageHeal\"]);", to: "Object.freeze([\"bonus\", \"perTurn\", \"antimagic\", \"zone\", \"heldBonus\", \"defence\", \"damageHeal\"]);", breaks: "T5" },
  { file: EFFECT_APP, name: "T: a stunned-immune undead stays unstunned",
    from: "    const immune = !tag.ignoreImmunity && (", to: "    const immune = (", breaks: "T6" },

  /* ---------------- A. the gate ---------------- */
  { file: WARDS, name: "A: the immunity ends a turn early",
    from: "  return Number(round) > until;", to: "  return Number(round) >= until;", breaks: "A2" },
  { file: WARDS, name: "A: a roll buys no immunity at all",
    from: "    next[String(attackerId)] = Number(round) + 1;", to: "    next[String(attackerId)] = Number(round) - 1;", breaks: "A2" },
  { file: SANCT, name: "A: the warded creature rolls Will against its own horror",
    // Re-anchored at 3.672.0, where a row's own `saveAtCast: false` follows.
    from: "    || String(e?.kind ?? \"\") === \"horror\"\n", to: "\n", breaks: "A3" },
  { file: GATE, name: "A: THE SHIPPED STATE — the rebuke never bites",
    from: "  if (!horror.blocked) await rebukeCheck(attacker, targetActor, sourceName);\n", to: "", breaks: "A5" },
  { file: WARDS, name: "A: a rebuke bites whoever is attacked",
    from: ".filter((r) => r.spec && r.spec.casterUuid === String(casterUuid ?? \"\"));", to: ".filter((r) => r.spec);", breaks: "A4b" },

  /* ---------------- S. the edge ---------------- */
  { file: EDGE, name: "S: True Target's edge reaches every foe",
    from: "    if (against && against !== String(targetUuid ?? \"\")) continue;\n", to: "", breaks: "S1b" },
  { file: EDGE, name: "S: bonuses are set aside with the penalties",
    from: "=== \"circumstance\" && Number(m?.value) < 0) removed.push(m);", to: "=== \"circumstance\" && Number(m?.value) !== 0) removed.push(m);", breaks: "S2" },
  { file: ATTACK, name: "S: the concealment is rolled anyway",
    from: "  if (targetActor && !strikeEdge?.ignoreConcealment) {", to: "  if (targetActor) {", breaks: "S3" },
  { file: APPLIER, name: "S: True Target's advantage is against everybody",
    from: "            for (const g of granted) g.when = { ...(g.when ?? {}), targetUuids: [edgeAgainst] };\n", to: "", breaks: "S4" },

  /* ---------------- M. life and power ---------------- */
  { file: LIFE, name: "M: the siphon keeps all of it",
    from: "  return Math.max(0, Math.floor(Math.max(0, int(taken)) * (Number(share) || 0)));", to: "  return Math.max(0, int(taken));", breaks: "M1" },
  { file: LIFE, name: "M: the minute takes a pool that was never its",
    from: "  return now > 0 && now <= Math.max(0, int(granted));", to: "  return now > 0;", breaks: "M1c" },
  { file: CAST, name: "M: THE SHIPPED STATE — nothing counts what the touch took",
    from: "      if (siphonRow) siphonTotal += siphonAmount(", to: "      if (false) siphonTotal += siphonAmount(", breaks: "M1d" },
  { file: LIFE, name: "M: the donor goes below nothing",
    from: "    [\"what the donor has\", Math.max(0, int(donorPP))],\n", to: "", breaks: "M2b" },
  { file: LIFE, name: "M: Vigour heals past maximum",
    from: "  return Math.max(0, Math.min(int(spec?.amount), Math.max(0, int(max) - int(hp))));", to: "  return Math.max(0, int(spec?.amount));", breaks: "M3b" },

  /* ---------------- Z. zones and the rest ---------------- */
  { file: ZONE, name: "Z: THE SHIPPED STATE — the creepers slow nobody",
    from: "  const speedPenalty = Math.min(0, Math.trunc(Number(raw.speedPenalty) || 0));", to: "  const speedPenalty = 0;", breaks: "Z1" },
  { file: EMAN_FX, name: "Z: Untamed Journey does not lift the creepers' penalty",
    from: "    if (penalty < 0 && !immune) {", to: "    if (penalty < 0) {", breaks: "Z1c" },
  { file: CAST, name: "Z: the worse of Reflex and Acrobatics is rolled",
    from: "Number(altSkill.total ?? -Infinity) > Number(save?.total ?? 0);", to: "Number(altSkill.total ?? -Infinity) < Number(save?.total ?? 0);", breaks: "Z3e" },
  { file: APPLIER, name: "Z: Wake raises the dying",
    from: "          } else if (hp <= 0 || dying) {", to: "          } else if (false) {", breaks: "Z4" },
  { file: IMMUNE, name: "Z: a month is a day",
    from: "  month: 30 * ONE_DAY, months: 30 * ONE_DAY", to: "  month: ONE_DAY, months: ONE_DAY", breaks: "Z6" }
];

const PACK = [
  { spell: "Wail Of The Banshee", name: "P: the wail falls on the dead too",
    mutate: (sy) => { sy.kindGate = ""; }, breaks: "P1" },
  { spell: "Volcanic Inferno", name: "P: THE SHIPPED STATE — the inferno carries no ladder",
    mutate: (sy) => { sy.effects = []; }, breaks: "P1" },
  { spell: "Turn Undead", name: "P: Turn Undead turns the living",
    mutate: (sy) => { sy.kindGate = ""; }, breaks: "P2c" },
  { spell: "Vampiric Touch", name: "P: the touch loses its Basic save",
    mutate: (sy) => { sy.defence = "Fortitude"; }, breaks: "P2d" },
  { spell: "Umbral Blast", name: "P: the blast loses its essence pool",
    mutate: (sy) => { delete sy.secondaryDamage; }, breaks: "P2e" },
  { spell: "Wall Of Light", name: "P: THE SHIPPED STATE — the wall deals \"positive\" damage",
    mutate: (sy) => { sy.damage.type = "positive"; }, breaks: "P1" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-chapter10-331-340 does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-chapter10-331-340: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-331-340: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
