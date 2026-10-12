#!/usr/bin/env node
/**
 * mutate-block37 — can verify-block37 fail?
 *
 * NEW at 3.617.0. Each mutation puts back a defect block 37's audit found, or
 * breaks one of the channels built for Graham's R1–R6 and R16–R23. SURVIVED
 * and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const USEC = at("module", "consumable-use.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const BUILDER = at("module", "magic-item-builder.mjs");
const OILS = at("module", "oils.mjs");
const ATTACKC = at("module", "combat", "attack.mjs");
const SPECIALS = at("module", "consumable-specials.mjs");
const SPECIALF = at("module", "consumable-specials-workflow.mjs");
const DROWN = at("module", "drowning-workflow.mjs");
const WEFFECTS = at("module", "wondrous-effects.mjs");
const WDATA = at("module", "wondrous-data.mjs");
const ACTOR = at("module", "documents", "actor.mjs");
const DAMAGE = at("module", "combat", "damage.mjs");
const DAMAGEF = at("module", "combat", "damage-workflow.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const BRACERSF = at("module", "bracers-workflow.mjs");
const WUSE = at("module", "wondrous-use.mjs");
const WUSEF = at("module", "wondrous-use-workflow.mjs");
const WONDROUS = at("module", "wondrous.mjs");
const INNATE = at("module", "item-innate-level.mjs");
const RUNESPELL = at("module", "rune-spell-workflow.mjs");
const STOWAGE = at("module", "stowage.mjs");
const REPAIRS = at("module", "data", "pack-repairs.mjs");
const VERIFY = at("tools", "verify-block37.mjs");

const MUTATIONS = [
  /* A — potions and the builder */
  { file: USEC, name: "R1 — a potion is no longer drunk (it reaches whoever is targeted)",
    from: '  potion: { verb: "Drink", needsCheck: false, past: "drunk", drunk: true },',
    to: '  potion: { verb: "Drink", needsCheck: false, past: "drunk" },', breaks: "A1" },
  { file: USEC, name: "B2 — Water Breathing keeps its 5-ft area in a bottle",
    from: '  return { range: "touch", targets: "1 creature", area: "", areaTargeting: "all" };',
    to: '  return { range: "touch", targets: "1 creature", area, areaTargeting: "all" };', breaks: "A2" },
  { file: CAST, name: "B7 — a potion is gated on its spell's somatic component again",
    from: "  const componentsOK = drunkPotion", to: "  const componentsOK = false", breaks: "A4" },
  { file: BUILDER, name: "A1 — the consumable builder reads one row too high (the shipped defect)",
    from: "  const row = CONSUMABLE_COST_TABLE[level - 1];", to: "  const row = CONSUMABLE_COST_TABLE[level];", breaks: "A5b" },
  { file: BUILDER, name: "R2 — a cantrip is level 0",
    from: "  return Math.max(1, Math.floor(Number(pp) || 0));", to: "  return Math.max(0, Math.floor(Number(pp) || 0));", breaks: "A5" },
  { file: BUILDER, name: "A2 — a built potion is Interact (1 AP) again",
    from: '  potion: { label: "Potion", column: 0, activation: "Interact (2 AP)", hands: 1 },',
    to: '  potion: { label: "Potion", column: 0, activation: "Interact (1 AP)", hands: 1 },', breaks: "A6" },

  /* B — the unguents */
  { file: OILS, name: "R3 — Sharpness's attack bonus is untyped, and stacks with potency",
    from: '  return { label: String(live.name ?? "Unguent"), value: Number(live.attack), type: "item" };',
    to: '  return { label: String(live.name ?? "Unguent"), value: Number(live.attack), type: "untyped" };', breaks: "B3" },
  { file: ATTACKC, name: "R3 — two item bonuses to damage both count",
    from: "  return Math.max(0, Math.floor(Number(bonus) || 0) - Math.max(0, Math.floor(Number(existing) || 0)));",
    to: "  return Math.max(0, Math.floor(Number(bonus) || 0));", breaks: "B4" },
  { file: OILS, name: "R4 — Combustion burns on after its fifth strike",
    from: "  if (live.strikesLeft !== undefined && live.strikesLeft !== null && Number(live.strikesLeft) <= 0) return [];\n",
    to: "", breaks: "B5" },
  { file: OILS, name: "C1 — Sharpness coats a club",
    from: "    const typeOk = (word) => !wanted.length || wanted.includes(damageWord(word));",
    to: "    const typeOk = (word) => true;", breaks: "B2" },

  /* C — specials */
  { file: SPECIALS, name: "C2 — the Pearl lands at any range",
    from: "  if (rangeFeet > 0 && Number.isFinite(distance) && distance > rangeFeet) {",
    to: "  if (false) {", breaks: "C1b" },
  { file: SPECIALF, name: "B4 — the bandage is spent before its check (the shipped defect)",
    from: "  const { TRGCheck } = await import(\"./dice/check.mjs\");\n  const skill = actor.system?.skills?.[special.skill];",
    to: "  await spendOne(item);\n  const { TRGCheck } = await import(\"./dice/check.mjs\");\n  const skill = actor.system?.skills?.[special.skill];", breaks: "C2c" },
  { file: DROWN, name: "B5 — Water Breathing does nothing to breathing",
    from: '  if (findMarker(actor, "waterBreathing")) {', to: '  if (false) {', breaks: "C5" },

  /* D — wondrous */
  { file: WEFFECTS, name: "R16 — investment alone is enough (two Belts in a backpack)",
    from: "  return carriedOnly || Boolean(item?.system?.equipped);", to: "  return true;", breaks: "D1" },
  { file: ACTOR, name: "A13 — the Amulet's DR is skipped from the pool again",
    from: "      if (wondrousBonus.target.startsWith(\"system.attributes.\")) continue;\n      actor.addBonus(wondrousBonus.target, wondrousBonus.entry);",
    to: "      if (wondrousBonus.target.startsWith(\"system.attributes.\")) continue;\n      if (wondrousBonus.target === \"system.combat.dr\") continue;\n      actor.addBonus(wondrousBonus.target, wondrousBonus.entry);", breaks: "D4b" },

  /* E — the Bracers */
  { file: WEFFECTS, name: "A12 — the Bracers add to the DR pool (the shipped defect)",
    from: '    if (ability.kind === "baseDR") {\n      if (ability.reported) continue;',
    to: '    if (ability.kind === "baseDR" && false) {\n      if (ability.reported) continue;', breaks: "E1" },
  { file: WEFFECTS, name: "A12 — two pairs of Bracers: the worse one wins",
    from: "    if (state.effective > best.effective || (!best.itemId && !best.effectId && state.inert)) best = state;",
    to: "    if (!best.itemId || state.effective < best.effective) best = state;", breaks: "E3" },
  { file: WEFFECTS, name: "R17 — the bracers never go inert",
    from: "    : { hp: 0, inertUntil: Number(now) + BRACERS_INERT_SECONDS, inert: true };",
    to: "    : { hp: 0, inertUntil: 0, inert: false };", breaks: "E5" },
  { file: WEFFECTS, name: "R17 — inert bracers still give their DR",
    from: "    return { dr: 0, hp: 0, max, inert: true, inertUntil };", to: "    return { dr: value, hp: 0, max, inert: true, inertUntil };", breaks: "E5b" },
  { file: DAMAGE, name: "R17 — the packet stops more than the damage that reached it",
    from: "      equippedDrStopped = Math.min(Math.max(0, value), equippedShare);", to: "      equippedDrStopped = equippedShare;", breaks: "E6" },
  { file: DAMAGEF, name: "R17 — spells meet worn armour and the bracers together",
    from: "    : Math.max(wornDr, bracersDr);", to: "    : wornDr + bracersDr;", breaks: "E7" },
  { file: ATTACK, name: "R17 — a weapon meets worn armour and the bracers together",
    from: "    const equippedEffectiveDR = Math.max(wornEffectiveDR, Number(targetBracers?.effective ?? 0));",
    to: "    const equippedEffectiveDR = wornEffectiveDR + Number(targetBracers?.effective ?? 0);", breaks: "E8" },
  { file: BRACERSF, name: "R17 — the bracers are drained even under better armour",
    from: "  return Boolean(bracers?.itemId || bracers?.effectId) && Number(bracers?.effective ?? 0) > Math.max(0, Number(armourDr) || 0);",
    to: "  return Boolean(bracers?.itemId);", breaks: "E4" },

  /* F — the Gloves' heal and the Sash */
  { file: WUSE, name: "C8 — the Gloves heal twice a day",
    from: '  if (use.frequency === "daily" && wondrousUsedToday(item)) {\n    return { ok: false,',
    to: '  if (false) {\n    return { ok: false,', breaks: "F2" },
  { file: WUSE, name: "C8 — the Sash bites at once",
    from: "  return Number(now) - since >= REMOVAL_AFTER_SECONDS ? penalty.value : 0;",
    to: "  return penalty.value;", breaks: "F5" },
  { file: WDATA, name: "A14 — the Gloves heal with positive energy again",
    from: "heal an adjacent living creature ${healing} (essence; cannot harm undead).",
    to: "heal an adjacent living creature ${healing} (positive; cannot harm undead).", breaks: "F1" },

  /* G — Ring of Protection */
  { file: WDATA, name: "A10 — Ring of Protection's bonus is an item bonus",
    from: '    { kind: "dbBonus", value: bonus, bonusType: "status",', to: '    { kind: "dbBonus", value: bonus, bonusType: "item",', breaks: "G1" },

  /* H — an item's level */
  { file: INNATE, name: "R23 — an item's spell is cast at the wearer's level (the shipped defect)",
    from: "  if (item && itemLevel > 0) return { level: itemLevel, itemName: item.name ?? null };\n", to: "", breaks: "H1" },
  { file: CAST, name: "R23 — the DC still reads the character's level",
    from: "    const innateSaveHere = isInnate ? innateSaveFor(spell, castingAbility, innateLevel) : null;", to: "    const innateSaveHere = isInnate ? innateSaveFor(spell, castingAbility, characterLevel) : null;", breaks: "H2" },

  /* I — the Sash of Soaring */
  { file: RUNESPELL, name: "B16 — the duration warps are kept (an hour's Fly)",
    from: "    if (mods.durationText || mods.durationMultiplier || mods.duration) return false;\n    return !/\\bduration\\b/i.test(String(warp?.text ?? \"\"));",
    to: "    return true;", breaks: "I3" },

  /* J — the builder */
  { file: BUILDER, name: "B17 — a skill bonus is built as an item bonus again",
    from: '  if (kind === "stat" || kind === "drBonus" || kind === "dbBonus" || kind === "skillBonus") return "status";',
    to: '  if (kind === "stat" || kind === "drBonus" || kind === "dbBonus") return "status";', breaks: "J1" },
  { file: WONDROUS, name: "R18 — a spell's frequency is free",
    from: "  level += surcharge;\n", to: "", breaks: "J4b" },

  /* K — stowage */
  { file: STOWAGE, name: "R22 — the overflow is weightless (the shipped defect)",
    from: "    over: Math.max(0, stowed - capacity),", to: "    over: 0,", breaks: "K1" },

  /* L — the repairs */
  { file: REPAIRS, name: "R6 — an owned Potion of Flying keeps its Engage",
    from: '    id: "potion-of-flying-activation-3617", pack: "consumables", name: "Potion of Flying",',
    to: '    id: "potion-of-flying-activation-3617x", pack: "consumables", name: "Potion of Flying",', breaks: "L8" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-block37: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-block37: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block37: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
