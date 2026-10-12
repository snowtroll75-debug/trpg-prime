#!/usr/bin/env node
/**
 * mutate-chapter6-gear-181-190 — can the pages 181-190 checks fail?
 *
 * NEW at 3.578.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECTS FIRST, each put back as it stood where one line can
 * put it back: a bomb that counts as a hit whatever the dice say, that
 * costs no AP and adds nothing to the multiple attack penalty; a poison
 * that coats nothing; an unconscious creature that keeps its reaction.
 * Then every new rule, one line at a time.
 *
 * 3.578.1 adds what the 3.578.0 live test found (F1, F3–F7) and Graham's
 * ruling that a bomb meets DR, resistance and immunity by its damage type.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const POISONS = at("poisons.mjs");
const AFFL = at("afflictions.mjs");
const AFF = at("afflictions.mjs");
const AFFWF = at("combat", "affliction-workflow.mjs");
const COMBAT = at("documents", "combat.mjs");
const TURN = at("combat", "turn-economy.mjs");
const CONDWF = at("combat", "conditions-workflow.mjs");
const CONSUMEWF = at("consumable-use-workflow.mjs");
const POISONWF = at("poison-workflow.mjs");
const ATTACK = at("combat", "attack-workflow.mjs");
const BOMBS = at("bombs.mjs");
const BOMBWF = at("alchemical-workflow.mjs");
const OILS = at("oils.mjs");
const OILWF = at("oil-workflow.mjs");
const ITEMS = at("items.mjs");
const ACTOR = at("documents", "actor.mjs");
const ELIXIRS = at("elixirs.mjs");
const REAGENTS = at("reagents.mjs");
const CASTDC = at("magic", "casting-dc.mjs");
const CASTWF = at("magic", "cast-workflow.mjs");
const CREATE = at("create-crafting.mjs");
const SPELLFX = at("magic", "spell-effects.mjs");
const HOOK = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter6-gear-181-190.mjs");

const MUTATIONS = [
  /* ── the defects, put back ─────────────────────────────────────── */
  { file: BOMBWF, name: "D1 THE DEFECT: anything short of an explicit miss is a hit", from: "  const hit = result.hits === true;",
    to: "  const hit = result.hits !== false;", breaks: "E15" },
  { file: BOMBWF, name: "D2 THE DEFECT: the throw costs no AP", from: "  await spendActionPoints(actor, String(BOMB_STRIKE_AP), `${item.name} — Strike`);", to: "", breaks: "E12" },
  { file: BOMBWF, name: "D2 THE DEFECT: the throw adds nothing to the multiple attack penalty",
    from: "  await actor.setFlag?.(SYSTEM_ID, \"attackCount\", attackIndex + 1);", to: "", breaks: "E13" },
  { file: BOMBWF, name: "D3 THE DEFECT: recurring damage is a line, not a condition",
    from: "      await targetActor.toggleStatusEffect(\"recurring\", { value: next.value, damageType: next.damageType });", to: "", breaks: "E16" },
  { file: BOMBWF, name: "D4 THE DEFECT: the riders are never applied",
    from: "    await applyBombRiders(actor, item, targetActor, targetToken, extras, { critical: Boolean(critical), lines });", to: "", breaks: "E20" },
  { file: CONSUMEWF, name: "D7 THE DEFECT: a poison is spent to its description", from: "  if (poisonAfflictionOf(item)) return usePoison(actor, item);", to: "", breaks: "C4" },
  { file: CONSUMEWF, name: "D8 THE DEFECT: an oil is spent to its description", from: "  if (oilOf(item)) return useOil(actor, item);", to: "", breaks: "C4" },
  { file: COMBAT, name: "D10 THE DEFECT: an unconscious creature keeps its reaction",
    from: "    const newReactions = acting.canAct ? reactionState.value : 0;", to: "    const newReactions = reactionState.value;", breaks: "I2" },
  { file: TURN, name: "D10 THE DEFECT: an unconscious creature can act",
    from: "  if (unconscious) return { canAct: false, reason: \"Unconscious\", note: \"\" };", to: "", breaks: "I1" },

  /* ── poisons ───────────────────────────────────────────────────── */
  { file: POISONS, name: "R1: a stage with no interval in a rounds poison waits for the button", from: "  if (poisonRounds) return 1;",
    to: "  if (poisonRounds) return null;", breaks: "B2" },
  { file: POISONS, name: "R13: every poison critical is minor", from: "  const failedBy = Math.max(0, -Math.round(Number(margin)));",
    to: "  const failedBy = 5;", breaks: "B3" },
  { file: POISONS, name: "Kamarsk: a Partial reads as a Success",
    from: "  const key = { heroic: \"critical\", critical: \"critical\", success: \"success\", partial: \"failure\",",
    to: "  const key = { heroic: \"critical\", critical: \"critical\", success: \"success\", partial: \"success\",", breaks: "A2" },
  { file: POISONS, name: "R3: one free hand coats a weapon", from: "  return { ok: free >= 2, free };", to: "  return { ok: free >= 1, free };", breaks: "C1" },
  { file: POISONS, name: "p.183: no free hand needed to apply one", from: "  return { ok: free >= 1, free };", to: "  return { ok: true, free };", breaks: "C1b" },
  { file: POISONS, name: "R2: a coat never dries", from: "  if (Number.isFinite(appliedAt) && Number(worldTime) - appliedAt >= COAT_SECONDS) return false;",
    to: "", breaks: "C2" },
  { file: POISONS, name: "Arsenic locks nothing", from: "    if (locks.includes(conditionKey)) return item.name;", to: "", breaks: "B5" },
  { file: POISONS, name: "a stage takes back everything, not what it added", from: "    const next = Math.max(0, Number(now) - Number(entry.value));",
    to: "    const next = 0;", breaks: "B4" },
  { file: POISONS, name: "the poison critical is lost on the way to the affliction", from: "    criticalOnFailure: Boolean(stage.critical),",
    to: "    criticalOnFailure: false,", breaks: "B1c" },
  { file: POISONS, name: "p.183: the save is not Fortitude", from: "      savingThrow: \"fortitude\",", to: "      savingThrow: \"will\",", breaks: "B1" },
  { file: AFFL, name: "a Fumble against a one-stage poison is a stage that does not exist", from: "  return Math.min(start, cap);",
    to: "  return start;", breaks: "A3b" },
  { file: AFFWF, name: "the exposure ignores the stage cap",
    from: "  const outcome = { ...rolled, startingStage: exposureStartingStage(rolled.startingStage, item.system.maxStage) };",
    to: "  const outcome = rolled;", breaks: "D1" },
  { file: AFFWF, name: "p.190: an interval's damage is not dealt", from: "  if (poison && withDamage) await dealStageDamage(actor, item);", to: "", breaks: "D5" },
  { file: AFFWF, name: "the end phase deals no damage", from: "    if (due) await dealStageDamage(actor, item);", to: "", breaks: "D6" },
  { file: AFFWF, name: "R13: the critical ignores the margin", from: "  const severity = poisonCriticalSeverity(margin);",
    to: "  const severity = \"minor\";", breaks: "D4" },
  { file: COMBAT, name: "the end phase leaves the afflictions alone", from: "    await advanceAfflictionsAtEndPhase(actor);", to: "", breaks: "D7" },
  { file: CONDWF, name: "Arsenic: Retch goes ahead anyway", from: "  if (lockedBy) {", to: "  if (false) {", breaks: "D8" },
  { file: CONSUMEWF, name: "Anti-Plague's new save deals the stage's damage",
    from: "      await rollAfflictionStageSave(recipient, affliction, { withDamage: false });",
    to: "      await rollAfflictionStageSave(recipient, affliction);", breaks: "D9" },
  { file: POISONWF, name: "R3: the hands are not asked", from: "    const hands = coatHandsCheck(actor.items, weapon, item, size);",
    to: "    const hands = { ok: true, free: 2 };", breaks: "C5" },
  { file: POISONWF, name: "R2: the first hit does not spend the coat", from: "  await weapon.unsetFlag(SYSTEM_ID, POISON_COAT_FLAG);", to: "", breaks: "C7" },
  { file: ATTACK, name: "a coated weapon delivers nothing", from: "    await deliverWeaponPoison(actor, weapon, poisonedTarget);", to: "", breaks: "C8" },

  /* ── bombs ─────────────────────────────────────────────────────── */
  { file: BOMBS, name: "a bomb costs nothing", from: "export const BOMB_STRIKE_AP = 1;", to: "export const BOMB_STRIKE_AP = 0;", breaks: "E1" },
  { file: BOMBS, name: "Sulphur and Violet Haze apply both riders on a critical", from: "    if (rider.on === \"hitNotCritical\") return !critical;",
    to: "    if (rider.on === \"hitNotCritical\") return true;", breaks: "E5" },
  { file: BOMBS, name: "R7: an Interact removes nothing", from: "  const after = Math.max(0, before - 1);", to: "  const after = before;", breaks: "E8b" },
  { file: BOMBS, name: "a second flask adds to the recurring damage",
    from: "    return { value: Math.max(Number(existing.value) || 0, value), damageType, replaced: false };",
    to: "    return { value: (Number(existing.value) || 0) + value, damageType, replaced: false };", breaks: "E11" },
  { file: BOMBS, name: "R5: Holy Water does not reach an evil eternal", from: "    if (kind === \"evil eternal\") return isEvilEternal(targetSystem);",
    to: "", breaks: "E10b" },
  { file: BOMBS, name: "R6: the Thunderstone's DC is not its level's", from: "  return levelDC(Math.max(0, Math.floor(Number(itemLevel) || 0)));",
    to: "  return levelDC(0);", breaks: "E9b" },
  { file: BOMBS, name: "R4: a critical adds d6s whatever the bomb", from: "  return `${count}d${dice[2]}`;", to: "  return `${count}d6`;", breaks: "E4" },

  /* ── oils ──────────────────────────────────────────────────────── */
  { file: OILS, name: "a bow takes a blanch", from: "    if (mode === \"missile\" && !thrown) {", to: "    if (false) {", breaks: "F3" },
  { file: OILS, name: "R9: Armourguard never rises with level", from: "  const steps = per ? Math.floor(above / per) : 0;", to: "  const steps = 0;", breaks: "F4b" },
  { file: OILS, name: "R8: the weapon's coat wins over the fired piece's", from: "  for (const coat of [ammoCoat, weaponCoat]) {",
    to: "  for (const coat of [weaponCoat, ammoCoat]) {", breaks: "F6" },
  { file: OILS, name: "a coat never wears off", from: "    && Number(worldTime) >= Number(endsAt)) return false;", to: "    && false) return false;", breaks: "F7" },
  { file: OILS, name: "R8: the whole stack is coated", from: "  return { coated, left: held - coated, split: held > coated };",
    to: "  return { coated: held, left: 0, split: false };", breaks: "F8" },
  { file: OILS, name: "Armourguard's HP stay when it comes off", from: "  const value = Math.min(Math.floor(Number(hp?.value) || 0), max);",
    to: "  const value = Math.floor(Number(hp?.value) || 0);", breaks: "F9" },
  { file: ITEMS, name: "R9: armour gets no DR from Armourguard", from: "  const guard = armourguardBonus(item).dr;", to: "  const guard = 0;", breaks: "F10" },
  { file: ACTOR, name: "R9: a shield gets no DB from Armourguard", from: "        const resin = armourguardBonus(item);", to: "        const resin = { db: 0 };",
    breaks: "F12" },
  { file: ATTACK, name: "the damage reads the weapon's own material", from: "      material: materialDefenceWord(struck.material),",
    to: "      material: materialDefenceWord(weapon?.system?.material),", breaks: "F11" },
  { file: ATTACK, name: "a fired piece's coat is not handed to the damage",
    from: "      ammoCoat: oilCoatOf(ammo),\n      powerAttack: powerAttack && !isRanged,", to: "      powerAttack: powerAttack && !isRanged,", breaks: "F11" },
  // RE-ANCHORED AT 3.617.0: the split is one helper for the oils and the unguents.
  { file: OILWF, name: "R8: the split leaves the stack as it was", from: "  await target.update({ \"system.quantity\": split.left });", to: "", breaks: "F13" },
  { file: OILWF, name: "Nulladir's failed save does nothing", from: "    if (!success && oil.conditions.length) {", to: "    if (false) {", breaks: "F15" },
  { file: OILWF, name: "a dried poison coat stays on", from: "    if (poison && !coatActive(poison, clock)) {", to: "    if (false) {", breaks: "F16b" },
  { file: HOOK, name: "the world clock sweeps no coats", from: "        const { sweepExpiredCoats } = await import(\"../module/oil-workflow.mjs\");", to: "",
    breaks: "F16" },

  /* ── herbs ─────────────────────────────────────────────────────── */
  { file: ELIXIRS, name: "Nightsage reaches incorporeal undead", from: "  if (not && hasCreatureTrait(targetSystem, not)) return false;", to: "", breaks: "G4c" },
  { file: ELIXIRS, name: "Reglen unprepared asks no save", from: "    selfSave: body.selfSave ?? effect.selfSave ?? null,", to: "    selfSave: null,", breaks: "G2b" },
  { file: CONSUMEWF, name: "a saved Reglen still sickens", from: "    resisted = Boolean(check?.outcome?.degree?.success);", to: "    resisted = false;", breaks: "G7" },
  { file: CONSUMEWF, name: "Nightsage reaches everyone within 5 ft",
    from: "        if (nearbyRecipient(token.actor.system, scaled.nearby)) around.push(token.actor);", to: "        around.push(token.actor);", breaks: "G8" },

  /* ── reagents ──────────────────────────────────────────────────── */
  { file: REAGENTS, name: "a save DC reagent on a spell with no save",
    from: "  if (use.effect === \"saveDC\" && !String(spellData.defence ?? \"\").trim()) return { ok: false, why: \"\" };", to: "", breaks: "H2" },
  { file: REAGENTS, name: "two damage reagents add one die", from: "    if (use?.effect === \"damageDie\") dice += Math.max(1, v);",
    to: "    if (use?.effect === \"damageDie\") dice = 1;", breaks: "H7" },
  { file: REAGENTS, name: "Blood-Block's reagent ignores its level", from: "    if (row && Number(row.amount) > 0) value = Math.trunc(Number(row.amount));", to: "",
    breaks: "H9" },
  { file: REAGENTS, name: "Holy Water is never offered", from: "  const traditionHit = use.traditions.find((t) => spellTradition.includes(t));",
    to: "  const traditionHit = null;", breaks: "H3" },
  { file: CASTDC, name: "the Sulphur Bomb moves no casting DC", from: "  dc += push(parts, \"Reagent\", int(reagentDelta));", to: "", breaks: "H11" },
  { file: CASTWF, name: "a damage reagent adds no die",
    from: "  if (reagentBonus.damageDice) warpMods.damageDice = addDice(warpMods.damageDice, reagentBonus.damageDice);", to: "", breaks: "H14" },
  { file: CASTWF, name: "the last reagent is never spent", from: "    if (quantity <= 1) await item.delete();", to: "    if (false) await item.delete();", breaks: "H13" },
  { file: CASTWF, name: "the ticks are thrown away", from: "    reagents: reagents.filter((r) => Boolean(form[`reagent-${r.id}`])).map((r) => r.id)",
    to: "    reagents: []", breaks: "H12b" },

  /* ── 3.578.1: the live test, and the DR ruling ─────────────────── */
  { file: POISONS, name: "F1 THE DEFECT: the affliction's traits are one long word again", from: "      traits: afflictionTraits(item.system?.traits),",
    to: "      traits: String(item.system?.traits ?? \"Poison\"),", breaks: "K1" },
  { file: POISONS, name: "F1: Poison is not guaranteed among them", from: "  if (!words.some((w) => w.toLowerCase() === \"poison\")) words.push(\"Poison\");",
    to: "", breaks: "K1" },
  { file: BOMBWF, name: "THE RULING, UNDONE: a bomb ignores armour DR again", from: "        dr: null,", to: "", breaks: "K2" },
  { file: BOMBWF, name: "F5 THE DEFECT: the injury is rolled before the throw's card", from: "  if (injury) await injury();", to: "", breaks: "K3" },
  { file: BOMBS, name: "F4 THE DEFECT: the card says 'evil eternal'", from: "  const plural = (word) => (/(undead|s)$/i.test(word) ? word : `${word}s`);",
    to: "  const plural = (word) => word;", breaks: "K4b" },
  { file: SPELLFX, name: "F3 THE DEFECT: the card says 'allSpeeds'", from: "  allSpeeds: \"to all Speeds\",", to: "", breaks: "K5" },
  // RE-ANCHORED AT 3.583.0 with the rule it now asks (incubation became a
  // real clock). The defect is the same one: Wyvern Poison and Graveroot
  // told to wait for an incubation neither of them has.
  { file: AFFWF, name: "F6 THE DEFECT: an instant poison 'incubates'",
    from: "  const incubates = incubation?.kind === \"span\" || incubation?.kind === \"open\";",
    to: "  const incubates = true;", breaks: "K6c" },
  { file: AFF, name: "F6: 'Instant' stops being read as already past",
    from: "  if (INSTANT_SPAN.test(raw)) return { kind: \"instant\" };", to: "", breaks: "K6" },
  { file: OILWF, name: "F7 THE DEFECT: a worn-off split stays a second stack", from: "        const home = ammoHome(actor, target, coat.originalName);",
    to: "        const home = null;", breaks: "K7" },

  /* ── R11 ───────────────────────────────────────────────────────── */
  { file: CREATE, name: "R11: vials by Crafting only", from: "  vials: { label: \"Vials\", skills: [\"crafting\", \"nature\"], feat: \"Alchemical Crafting\" },",
    to: "  vials: { label: \"Vials\", skills: [\"crafting\"], feat: \"Alchemical Crafting\" },", breaks: "I3" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const guard = guardFiles([
  POISONS, AFFL, AFFWF, COMBAT, TURN, CONDWF, CONSUMEWF, POISONWF, ATTACK, BOMBS, BOMBWF, OILS, OILWF, ITEMS, ACTOR,
  ELIXIRS, REAGENTS, CASTDC, CASTWF, CREATE, SPELLFX, HOOK, CHECK
]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter6-gear-181-190: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-chapter6-gear-181-190: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-chapter6-gear-181-190: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
