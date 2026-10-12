#!/usr/bin/env node
/**
 * mutate-block37-weapons — can verify-block37-weapons fail?
 *
 * NEW at 3.618.0. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RUNES = at("module", "runes.mjs");
const QUALITY = at("module", "item-quality.mjs");
const DAMAGE = at("module", "rune-damage.mjs");
const USAGE = at("module", "weapon-rune-usage.mjs");
const ACTIONS = at("module", "rune-actions.mjs");
const ACTIONS_WF = at("module", "rune-actions-workflow.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const THROWN = at("module", "combat", "thrown-weapons.mjs");
const PACKET = at("module", "combat", "damage.mjs");
const AMMO = at("module", "combat", "ammunition.mjs");
const BUILDER = at("module", "magic-item-builder.mjs");
const EFFECTS = at("module", "rune-effects.mjs");
const RUNE_WF = at("module", "weapon-rune-workflow.mjs");
const DATA = at("module", "weapon-rune-data.mjs");
const CODEX = at("module", "codex-trait-rules.mjs");
const ACTOR = at("module", "documents", "actor.mjs");
const VERIFY = at("tools", "verify-block37-weapons.mjs");

const MUTATIONS = [
  { file: RUNES, name: "R7 — potency adds no damage", from: "    damage: weaponTier,", to: "    damage: 0,", breaks: "A1" },
  { file: RUNES, name: "R8 — potency adds no weapon HP", from: "    hp: kind === \"weapon\" ? WEAPON_POTENCY_HP_PER_TIER * weaponTier : Number(potency?.hp) || 0,", to: "    hp: kind === \"weapon\" ? 0 : Number(potency?.hp) || 0,", breaks: "A2" },
  { file: QUALITY, name: "an untracked weapon is given potency HP and can now break", from: "    ? (weaponHP > 0 ? weaponHP + potencyHP : 0)", to: "    ? weaponHP + potencyHP", breaks: "A5" },
  { file: ATTACK, name: "the roll leaves potency's damage out", from: "  if (weaponPotencyDamage) formula += ` + ${weaponPotencyDamage}`;", to: "", breaks: "A7" },
  { file: DAMAGE, name: "THE OLD DEFECT: the energy runes are always on", from: "    if (ENERGY_RUNES[chosen.key] && !energyRuneActive(item, chosen.key)) continue;", to: "", breaks: "B1" },
  { file: DAMAGE, name: "Flametooth's flames go out", from: "  if ((flags.specificItem?.alwaysActive ?? []).includes(key)) return true;", to: "", breaks: "B3" },
  { file: ACTIONS_WF, name: "switching an energy rune on is free", from: "    if (!await payRuneActivation(actor, action.apCost ?? 1, `${item.name} — ${action.label}`)) return null;\n  }\n  await setState(item, action.state, !on);", to: "  }\n  await setState(item, action.state, !on);", breaks: "B7" },
  { file: DAMAGE, name: "THE OLD DEFECT: a secondary critical on every hit", from: "  if (!strikeSeverity) return null;", to: "  if (!strikeSeverity) return { severity: \"minor\", modifier: Number(entry.secondaryCritical) || 0 };", breaks: "C1" },
  { file: DAMAGE, name: "THE OLD DEFECT: Disrupting deals 'positive'", from: "    // \"Secondary essence damage\" (block 37, A3): it said \"positive\".\n    type: \"essence\",", to: "    type: \"positive\",", breaks: "D1" },
  { file: DAMAGE, name: "Aligned harms everyone", from: "        applies = alignedDamageAffects(parameter, target);", to: "        applies = true;", breaks: "D4" },
  { file: USAGE, name: "Bane ignores the plural", from: "  if (word.endsWith(\"s\")) forms.add(word.slice(0, -1));", to: "", breaks: "D5" },
  { file: ATTACK, name: "Bane never reaches the roll", from: "      formula += ` + ${bane.dice}`;", to: "", breaks: "D7" },
  { file: USAGE, name: "a bow counts as melee", from: "    melee: mode !== \"missile\",", to: "    melee: true,", breaks: "E2" },
  { file: USAGE, name: "Razor needs no Keen", from: "  if (rule.keen && !usage?.keen) return no(\"this has no Keen trait\");", to: "", breaks: "E4" },
  { file: DAMAGE, name: "a suppressed rune still deals damage", from: "    if (!runeUsageAllows(chosen.key, usage).ok) continue;", to: "", breaks: "E8" },
  { file: EFFECTS, name: "B12 — Courageous reads the tier written", from: "    ? Number(computeRuneModifiers({ kind, runes: item?.system?.runes ?? \"\", quality: item?.system?.quality }).attack) || 0", to: "    ? fieldToRunes(kind, item?.system?.runes ?? \"\").find((r) => r.key === \"potency\")?.tier ?? 0", breaks: "E10" },
  { file: ACTIONS, name: "Called costs nothing again", from: "    apCost: 2,\n", to: "", breaks: "F1" },
  { file: RUNE_WF, name: "R11 — the Level DC is 10 + level", from: "  return levelDC(Math.max(0, Number(weapon?.system?.itemLevel ?? 0) || 0));", to: "  return 10 + Math.max(0, Number(weapon?.system?.itemLevel ?? 0) || 0);", breaks: "F2" },
  { file: ACTIONS, name: "a bow is a Shifting form", from: "    if (String(candidate?.attackMode ?? \"melee\").trim().toLowerCase() === \"missile\") return false;", to: "", breaks: "F5" },
  { file: THROWN, name: "THE OLD DEFECT: a Returning javelin is spent", from: "  if (returnsToHand(weapon)) {", to: "  if (false && returnsToHand(weapon)) {", breaks: "G3" },
  { file: PACKET, name: "Ghost Touch changes nothing", from: "  const nonMagicalImmune = has(immunities, \"non-magical\") && !magical && !incorporealTouch;", to: "  const nonMagicalImmune = has(immunities, \"non-magical\") && !magical;", breaks: "H3" },
  { file: ATTACK, name: "Vicious feeds back past the wielder's defences", from: "          if (fed.taken > 0) await applyDamageAndCheckDying(actor, fed.taken, { isCritical: false });", to: "          await applyDamageAndCheckDying(actor, back, { isCritical: false });", breaks: "H5" },
  { file: AMMO, name: "a runed round adds no attack", from: "  const potency = ammoPotencyTier(ammoSystem);\n  const value", to: "  const potency = 0;\n  const value", breaks: "I2" },
  { file: BUILDER, name: "THE OLD DEFECT: the builder drops the base round", from: "    Object.assign(system, baseRoundProperties(extra.base));\n", to: "", breaks: "I5" },
  { file: ACTIONS, name: "G1 — the card loses its energy", from: "      energy: action.energy ?? \"\"", to: "      energy: \"\"", breaks: "M1" },
  { file: ACTIONS, name: "G2 — a sword becomes a Claw", from: "    if (candidate?.natural) return false;", to: "", breaks: "M2" },
  { file: RUNE_WF, name: "F2 — the weapon's spell asks for a free hand", from: "  source.system.components = { somatic: false, verbal: false, material: false, focus: false };", to: "", breaks: "M3" },
  { file: CODEX, name: "F1 — the ability grants nothing", from: "    if (ABILITY_GRANTED_TRAITS.includes(name)) out.add(name);", to: "", breaks: "N1" },
  { file: ACTOR, name: "F1 — the actor never asks its abilities", from: "    ...new Set([...effectGrantedTraits(actor), ...fromAspects, ...fromAbilities])", to: "    ...new Set([...effectGrantedTraits(actor), ...fromAspects])", breaks: "N2" },
  { file: DATA, name: "a rune goes back to being a note", from: "    automation: \"bonus\",\n    note: \"Applied automatically on a Keen piercing or slashing melee weapon; suppressed on anything else.\"", to: "    automation: \"note\",\n    note: \"Applied automatically on a Keen piercing or slashing melee weapon; suppressed on anything else.\"", breaks: "K1" }
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
    process.stderr.write("mutate-block37-weapons: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-block37-weapons: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block37-weapons: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
