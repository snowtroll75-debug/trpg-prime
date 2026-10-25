#!/usr/bin/env node
/**
 * mutate-chapter6-gear-161-170 — can the pages 161-170 checks fail?
 *
 * NEW at 3.576.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECTS FIRST, each put back as it stood: the Fire Bolt's
 * fire added to the bolt's own formula, Deadly read straight off the bow,
 * a whip that reaches like any reach weapon, an unarmed check that reads
 * the category alone, Powerful untyped, weapon spells that take a bite.
 * Then every new rule, one line at a time.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const AMMO = at("combat", "ammunition.mjs");
const AMMOWF = at("combat", "ammunition-workflow.mjs");
const THROWN = at("combat", "thrown-weapons.mjs");
const ATTACKRULES = at("combat", "attack.mjs");
const ATTACK = at("combat", "attack-workflow.mjs");
const OPPRULES = at("combat", "opportunity-rules.mjs");
const OPP = at("combat", "opportunity.mjs");
const HELD = at("held-items.mjs");
const RELOADWF = at("combat", "reload-workflow.mjs");
const UNARMED = at("combat", "unarmed.mjs");
const ARMOURDESC = at("armour-descriptions.mjs");
const RIDERS = at("magic", "strike-riders.mjs");
const RIDERSWF = at("magic", "strike-riders-workflow.mjs");
const MOUNTED = at("combat", "mounted.mjs");
const ACTIONWF = at("combat", "action-workflow.mjs");
const GOODS = at("goods.mjs");
const GOODSWF = at("goods-workflow.mjs");
const PROF = at("proficiency-rules.mjs");
const STOWAGE = at("stowage.mjs");
const LIGHT = at("light-sources.mjs");
const ACTOR = at("documents", "actor.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter6-gear-161-170.mjs");

const MUTATIONS = [
  /* ── B: the rounds ─────────────────────────────────────────────── */
  {
    file: ATTACK, name: "D1 THE DEFECT: Deadly is read straight off the bow again",
    // Re-anchored at 3.577.0: Fist of Rock's `fistData` sits between.
    from: "    ? { ...fistData, traits: traitsAfterAmmunition(fistData.traits, ammoSystem) }",
    to: "    ? fistData",
    breaks: "B1f — Distance Arrows 'remove the deadly trait'"
  },
  {
    file: AMMO, name: "the round removes nothing",
    from: "    .filter((t) => t && !removed.some((name) => t.toLowerCase() === name || t.toLowerCase().startsWith(`${name} `)))",
    to: "    .filter((t) => t)",
    breaks: "B1"
  },
  {
    file: AMMO, name: "a numbered trait survives its own name",
    from: "    .filter((t) => t && !removed.some((name) => t.toLowerCase() === name || t.toLowerCase().startsWith(`${name} `)))",
    to: "    .filter((t) => t && !removed.some((name) => t.toLowerCase() === name))",
    breaks: "B1d"
  },
  {
    file: ATTACK, name: "D2 THE DEFECT: the Fire Bolt's 3 goes back into the piercing formula",
    from: "  formula += ammunitionFormulaExtra(ammo, effectiveDamageType);",
    to: "  if (ammoDamage.extraDamage) formula += ` + ${ammoDamage.extraDamage}`;",
    breaks: "B2e — a creature immune to fire took it, one weak to fire did not notice"
  },
  {
    file: AMMO, name: "the explosion is never its own packet",
    from: "  if (!fx.extraDamage || !type || type === String(shotType ?? \"\").trim().toLowerCase()) return [];",
    to: "  return [];",
    breaks: "B2/B2b"
  },
  {
    file: AMMO, name: "an extra of the shot's own type becomes a packet that skips DR",
    from: "  if (!fx.extraDamage || !type || type === String(shotType ?? \"\").trim().toLowerCase()) return [];",
    to: "  if (!fx.extraDamage || !type) return [];",
    breaks: "B2d"
  },
  {
    file: AMMO, name: "the splash is dropped",
    from: "    dice: fx.splashDamage ? `${fx.extraDamage} + ${fx.splashDamage}` : fx.extraDamage,",
    to: "    dice: fx.extraDamage,",
    breaks: "B2 — 'and 1 splash damage'"
  },
  {
    file: ATTACK, name: "the typed extras never reach the secondary-damage loop",
    from: "      ...strikeRunes.filter((r) => !r.addsToStrike), ...strikeRiderPackets(actor, weapon, riderCtx), ...areaPackets, ...typedExtras",
    to: "      ...strikeRunes.filter((r) => !r.addsToStrike), ...strikeRiderPackets(actor, weapon), ...areaPackets",
    breaks: "B2e"
  },
  {
    file: ATTACK, name: "the neighbours are never told about the splash",
    from: "      if (extra.splash) lines.push(line(splashNeighboursLine({ damageType: extra.type }, extra.splash)));",
    to: "",
    breaks: "B2f"
  },
  {
    file: ATTACK, name: "D3 THE DEFECT: Blunt Arrows cannot subdue",
    from: "  if (ammoEffects.allowsSubdual && !skipDialog(event)) {",
    to: "  if (false) {",
    breaks: "B3b"
  },
  {
    file: ATTACK, name: "the subdual penalty is untyped",
    from: "      modifiers.push({ label: `Subdual (${ammo?.name ?? \"ammunition\"})`, value: SUBDUAL_SHOT_PENALTY, type: \"circumstance\" });",
    to: "      modifiers.push({ label: `Subdual (${ammo?.name ?? \"ammunition\"})`, value: SUBDUAL_SHOT_PENALTY, type: \"untyped\" });",
    breaks: "B3b — '-4-circumstance penalty'"
  },
  {
    file: ATTACK, name: "the subdual choice changes nothing",
    from: "      damageTypeOverride: subdualShot || shiftedSubdual ? \"subdual\"\n        : versatileDamageType ?? (stoneFist || armouredFist.source ? weaponData.damageType : null),",
    to: "      damageTypeOverride: versatileDamageType ?? (stoneFist || armouredFist.source ? weaponData.damageType : null),",
    breaks: "B3c"
  },
  {
    file: AMMO, name: "every weapon can throw found rocks",
    from: "  return Number.isFinite(value) && value < 0 ? value : null;",
    to: "  return -2;",
    breaks: "B4b"
  },
  {
    file: AMMOWF, name: "D8 THE DEFECT: an empty pouch refuses the sling",
    from: "    return found ? { ...none, found } : { ...none, blocked: true };",
    to: "    return { ...none, blocked: true };",
    breaks: "B4c"
  },
  {
    file: ATTACK, name: "the found rock's -2 never reaches the roll",
    from: "    modifiers.push({ label: \"Found rock\", value: ammoChoice.found.penalty, type: \"untyped\" });",
    to: "",
    breaks: "B4d"
  },
  {
    file: ATTACK, name: "R2 the sling is propulsive again",
    from: "    : thrownDamage ? strengthMod : propulsiveStrengthBonus(hasPropulsive, strengthMod);",
    to: "    : propulsiveStrengthBonus(hasPropulsive, strengthMod);",
    breaks: "B5"
  },

  /* ── C: recovery ───────────────────────────────────────────────── */
  {
    file: AMMO, name: "half rounds up",
    from: "  return Math.floor(Math.max(0, Math.floor(Number(fired) || 0)) / 2);",
    to: "  return Math.ceil(Math.max(0, Math.floor(Number(fired) || 0)) / 2);",
    breaks: "C1 — Graham's R3: rounded down"
  },
  {
    file: AMMO, name: "last night's arrows are offered again",
    from: "  const fresh = !record || record.combatId !== combatId;",
    to: "  const fresh = !record;",
    breaks: "C3b"
  },
  {
    file: AMMO, name: "the plan offers stacks that round to nothing",
    from: "    .filter((row) => row.recover > 0);",
    to: "    .filter((row) => row.recover >= 0);",
    breaks: "C2b"
  },
  {
    file: AMMO, name: "shuriken are never ammunition",
    from: "  return weaponSystem?.recoveredAsAmmunition === true;",
    to: "  return false;",
    breaks: "C4"
  },
  {
    file: AMMOWF, name: "spent rounds are not counted",
    from: "  await recordAmmunitionSpent(ammo.parent, ammo);",
    to: "",
    breaks: "C5"
  },
  {
    file: THROWN, name: "a thrown shuriken goes to the party sheet",
    from: "  const destination = asAmmunition ? \"battlefield\" : thrownDestination(actor?.type);",
    to: "  const destination = thrownDestination(actor?.type);",
    breaks: "C5b"
  },

  /* ── D: the whip ───────────────────────────────────────────────── */
  {
    file: ATTACKRULES, name: "D5 THE DEFECT: the whip hits an adjacent creature",
    from: "  if (options?.noAdjacent === true && distance <= ADJACENT_FEET) {",
    to: "  if (false) {",
    breaks: "D2"
  },
  {
    file: ATTACKRULES, name: "D5 THE DEFECT: every reach weapon reaches five",
    from: "  const extension = Number.isFinite(Number(options?.extension)) ? Number(options.extension) : 5;",
    to: "  const extension = 5;",
    breaks: "D2b"
  },
  {
    file: ATTACKRULES, name: "the printed reach is ignored",
    from: "  return printed > ADJACENT_FEET ? printed - ADJACENT_FEET : 5;",
    to: "  return 5;",
    breaks: "D1"
  },
  {
    file: ATTACKRULES, name: "a weapon without the trait still reaches",
    from: "  if (!/\\breach\\b/i.test(String(weaponSystem?.traits ?? \"\"))) return 0;",
    to: "",
    breaks: "D1c/D1d"
  },
  {
    file: OPPRULES, name: "threatened reach is a yes/no again",
    from: "  const extra = extension === true ? 5 : Math.max(0, Number(extension) || 0);",
    to: "  const extra = extension ? 5 : 0;",
    breaks: "D4"
  },
  {
    file: ATTACK, name: "the Strike ignores the whip's adjacency",
    from: "    if (reach.tooClose) {",
    to: "    if (false) {",
    breaks: "D5"
  },
  {
    file: ATTACK, name: "the thrown-by-distance reach forgets the whip",
    from: "  const meleeReach = (Number(system.combat?.reach ?? 5) || 5) + reachExtension;",
    to: "  const meleeReach = (Number(system.combat?.reach ?? 5) || 5) + (hasReachTrait ? 5 : 0);",
    breaks: "D5"
  },
  {
    file: OPP, name: "Attacks of Opportunity reach five past a whip",
    from: "    .reduce((best, w) => Math.max(best, weaponReachExtension(w.system)), 0);",
    to: "    .reduce((best, w) => Math.max(best, weaponReachExtension(w.system) ? 5 : 0), 0);",
    breaks: "D5b"
  },

  /* ── E: the hand crossbow ──────────────────────────────────────── */
  {
    file: HELD, name: "D4 THE DEFECT: reloading never asks for hands",
    from: "  return { ok: needed === 0 || free >= needed, needed, free };",
    to: "  return { ok: true, needed, free };",
    breaks: "E2"
  },
  {
    file: HELD, name: "the crossbow counts against its own reload",
    from: "    .filter((item) => item?.system?.equipped && item !== weapon && (!weapon?.id || item?.id !== weapon.id));",
    to: "    .filter((item) => item?.system?.equipped);",
    breaks: "E2b"
  },
  {
    file: RELOADWF, name: "the workflow never refuses",
    from: "  if (!hands.ok) {",
    to: "  if (false) {",
    breaks: "E3"
  },

  /* ── F: unarmed ────────────────────────────────────────────────── */
  {
    file: UNARMED, name: "D6 THE DEFECT: a gauntlet is not unarmed",
    from: "  if (weaponSystem.unarmed === true) return true;",
    to: "",
    breaks: "F1"
  },
  {
    file: UNARMED, name: "a gauntlet becomes a natural attack",
    from: "  if (weaponSystem.natural) return true;",
    to: "  if (weaponSystem.natural || weaponSystem.unarmed) return true;",
    breaks: "F1d / G1 — a gauntlet would be refused by Magic Weapon"
  },
  {
    file: ARMOURDESC, name: "D6 MY 3.575.0 REGRESSION: the bracered punch stops being unarmed",
    from: "  unarmed: true",
    to: "  unarmed: false",
    breaks: "F2b"
  },
  {
    file: ATTACK, name: "Vibrant Thorns reads the category again",
    // WIDENED AT 3.586.3 when the Assassin's mark asked the same question;
    // NARROWED AGAIN AT 3.671.0, when the mark began asking it of the
    // holder's abilities' view (`isUnarmedAttack(abilityData)`, B7-6) and
    // this line became Vibrant Thorns' alone.
    from: "      unarmed: isUnarmedAttack(weaponData),",
    to: "      unarmed: String(weaponData.category ?? \"\").trim().toLowerCase() === \"unarmed\",",
    breaks: "F4"
  },
  {
    file: UNARMED, name: "the Unarmed Fumble Table is never rolled",
    from: "  if (isUnarmedAttack(weaponSystem)) return \"unarmed\";",
    to: "",
    breaks: "F3"
  },
  {
    file: UNARMED, name: "a thrown dagger fumbles on the melee table",
    from: "  if (options?.thrown === true || mode === \"thrown\") return \"thrown\";",
    to: "  if (mode === \"thrown\") return \"thrown\";",
    breaks: "F3"
  },
  {
    file: ATTACK, name: "the fumble is chosen by attack mode again",
    from: "  const category = fumbleTableFor(swung, { thrown });",
    to: "  const category = FUMBLE_TABLES[swung.attackMode] ? swung.attackMode : \"melee\";",
    breaks: "F3b"
  },
  {
    file: RIDERS, name: "Force Punch asks the category alone",
    from: "  if (spec.scope === \"unarmed\" && !isUnarmedAttack(weapon)) return false;",
    to: "  if (spec.scope === \"unarmed\" && String(weapon.category ?? \"\").toLowerCase() !== \"unarmed\") return false;",
    breaks: "F5"
  },
  {
    file: RIDERSWF, name: "the rider identity drops the gauntlet's declaration",
    from: "    unarmed: weapon?.system?.unarmed === true || abilityUnarmed,",
    to: "    unarmed: abilityUnarmed,",
    breaks: "F5c"
  },

  /* ── G: weapon spells ──────────────────────────────────────────── */
  {
    file: RIDERS, name: "D7 THE DEFECT: Flaming Weapon can go on your fist",
    from: "    .filter((item) => item?.type === \"weapon\" && item?.system?.equipped && !isNaturalAttack(item?.system));",
    to: "    .filter((item) => item?.type === \"weapon\" && item?.system?.equipped);",
    breaks: "G1"
  },

  /* ── I: mounted ────────────────────────────────────────────────── */
  {
    file: MOUNTED, name: "Mount / Dismount never dismounts",
    from: "  if (current?.mounted) return null;",
    to: "",
    breaks: "I2b"
  },
  {
    file: MOUNTED, name: "the lance works on foot",
    from: "  if (use === \"required\" && !mounted) {",
    to: "  if (false) {",
    breaks: "I3"
  },
  {
    file: MOUNTED, name: "the composite longbow works in the saddle",
    from: "  if (use === \"forbidden\" && mounted) {",
    to: "  if (false) {",
    breaks: "I4"
  },
  {
    file: ATTACK, name: "the attack never asks",
    from: "  if (mountedRefusal) {",
    to: "  if (false) {",
    breaks: "I6"
  },
  {
    file: ACTIONWF, name: "a rolled Mount leaves nobody mounted",
    from: "      if (action.key === \"mountDismount\" && degree === \"success\") {",
    to: "      if (false) {",
    breaks: "I7"
  },

  /* ── K: Powerful ───────────────────────────────────────────────── */
  {
    file: ATTACK, name: "R14 Powerful is untyped again",
    from: "        modifiers.push({ label: \"Powerful (within 20 ft)\", value: powerfulBonus, type: \"circumstance\" });",
    to: "        modifiers.push({ label: \"Powerful (within 20 ft)\", value: powerfulBonus, type: \"untyped\" });",
    breaks: "K1"
  },

  /* ── L: improvised ─────────────────────────────────────────────── */
  {
    file: GOODS, name: "improvising costs nothing",
    from: "  const penalty = typeof declared.penalty === \"number\" && Number.isFinite(declared.penalty) ? declared.penalty : IMPROVISED_PENALTY;",
    to: "  const penalty = typeof declared.penalty === \"number\" && Number.isFinite(declared.penalty) ? declared.penalty : 0;",
    breaks: "L2b"
  },
  {
    file: GOODS, name: "the pole's own -2 is ignored",
    from: "  const penalty = typeof declared.penalty === \"number\" && Number.isFinite(declared.penalty) ? declared.penalty : IMPROVISED_PENALTY;",
    to: "  const penalty = IMPROVISED_PENALTY;",
    breaks: "L2c — Graham: -2 for the pole"
  },
  {
    file: GOODS, name: "the torch stops burning",
    from: "  if (!dice || !type) return [];",
    to: "  return [];",
    breaks: "L3"
  },
  {
    file: GOODS, name: "the chosen damage type is ignored",
    from: "  const chosenType = DAMAGE_TYPES.includes(String(choice?.damageType ?? \"\")) ? String(choice.damageType) : \"bludgeoning\";",
    to: "  const chosenType = \"bludgeoning\";",
    breaks: "L4"
  },
  {
    file: GOODS, name: "anything can be swung, held or not",
    from: "  return Math.trunc(Number(item?.system?.heldHands) || 0) >= 1;",
    to: "  return true;",
    breaks: "L5"
  },
  {
    file: PROF, name: "an improvised attack asks for proficiency",
    from: "  if (type === \"weapon\" && system.improvised === true) {",
    to: "  if (false) {",
    breaks: "L6 — and it would pass on the fail-open for the wrong reason, which is why L6 reads the reason"
  },
  {
    file: ATTACK, name: "the improvised penalty never reaches the roll",
    from: "  if (improvisedRow) modifiers.push(improvisedRow);",
    to: "",
    breaks: "L7"
  },
  {
    file: ATTACK, name: "the torch's fire never reaches the damage",
    from: "    ...improvisedDamagePackets(weaponData, weapon?.name ?? \"\")",
    to: "",
    breaks: "L7"
  },

  /* ── M: the Goods ──────────────────────────────────────────────── */
  {
    file: GOODS, name: "a compass in the pack still helps",
    from: "    if (item?.type !== \"gear\" || !wornAndStanding(item)) continue;",
    to: "    if (item?.type !== \"gear\") continue;",
    breaks: "M2/M2b"
  },
  {
    file: GOODS, name: "every Goods bonus is assumed",
    from: "    auto: false,",
    to: "    auto: true,",
    breaks: "M3 — Graham's R8: the player ticks it"
  },
  {
    file: ACTOR, name: "the actor never offers them",
    from: "      ...goodsConditionals(Array.from(actor.items ?? []))",
    to: "",
    breaks: "M5"
  },

  /* ── N: saddlebags ─────────────────────────────────────────────── */
  {
    file: STOWAGE, name: "saddlebags help a person carry",
    from: "    if (CARRY_STRENGTH_ITEMS[key].animalOnly && animal !== true) continue;",
    to: "",
    breaks: "N2b"
  },
  {
    file: STOWAGE, name: "a companion is not an animal",
    from: "  if (String(actorType ?? \"\") === \"companion\") return true;",
    to: "",
    breaks: "N3"
  },

  /* ── O: caltrops and oil ───────────────────────────────────────── */
  {
    file: GOODS, name: "caltrops never ruin",
    from: "  return { ruined: Boolean(state?.ruined) || Number(taken) > 0 };",
    to: "  return { ruined: Boolean(state?.ruined) };",
    breaks: "O3"
  },
  {
    file: GOODSWF, name: "the caltrops save forgets how badly it failed",
    from: "  const basic = basicSavingThrow(degree, margin);",
    to: "  const basic = basicSavingThrow(degree);",
    breaks: "O6 — the basic-save ladder's critical bonus needs the margin (3.549.0)"
  },

  /* ── P: the hood ───────────────────────────────────────────────── */
  {
    file: LIGHT, name: "R13 a lowered hood still sheds light",
    from: "  if (itemIsHooded(item)) return false;",
    to: "",
    breaks: "P2b"
  },
  {
    file: LIGHT, name: "a stray hood flag hides a torch",
    from: "  return lightSourceHasHood(item) && item?.flags?.[\"trg-prime\"]?.[HOODED_FLAG] === true;",
    to: "  return item?.flags?.[\"trg-prime\"]?.[HOODED_FLAG] === true;",
    breaks: "P3"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const guard = guardFiles([
  AMMO, AMMOWF, THROWN, ATTACKRULES, ATTACK, OPPRULES, OPP, HELD, RELOADWF, UNARMED, ARMOURDESC, RIDERS, RIDERSWF,
  MOUNTED, ACTIONWF, GOODS, GOODSWF, PROF, STOWAGE, LIGHT, ACTOR, CHECK
]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter6-gear-161-170: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-chapter6-gear-161-170: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-chapter6-gear-161-170: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
