#!/usr/bin/env node
/**
 * mutate-block36 — can verify-block36 fail?
 *
 * NEW at 3.615.0. Each mutation puts back a defect block 36's audit found,
 * or breaks one of the channels built to answer Graham's rulings.
 * SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RUNES = at("module", "runes.mjs");
const CATALOGUE = at("module", "rune-catalogue.mjs");
const QUALITY = at("module", "item-quality.mjs");
const ACTOR = at("module", "documents", "actor.mjs");
const AID = at("module", "combat", "aid-bonus.mjs");
const EFFECTS = at("module", "rune-effects.mjs");
const ACTIONS = at("module", "rune-actions.mjs");
const RAW = at("module", "rune-actions-workflow.mjs");
const TIMERS = at("module", "rune-timers.mjs");
const TIMERSF = at("module", "rune-timers-workflow.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const CODEX = at("module", "codex-runes.mjs");
const COMBAT = at("module", "documents", "combat.mjs");
const SPELLFX = at("module", "rune-spell-effect.mjs");
const SPELLWF = at("module", "rune-spell-workflow.mjs");
const CUSTOMADD = at("module", "customise-on-add.mjs");
const REFRESH = at("module", "compendium-refresh.mjs");
const CHARGED = at("module", "charged-items.mjs");
const CHARGEDF = at("module", "charged-items-workflow.mjs");
const SKILLOPT = at("module", "general-skill-options-workflow.mjs");
const BUILDER = at("module", "magic-item-builder.mjs");
const GATE = at("module", "magic", "component-gate.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const VERIFY = at("tools", "verify-block36.mjs");

const MUTATIONS = [
  // A — potency
  { file: RUNES, name: "R1 — a shield's Potency VI finds no row again (the shipped defect)",
    from: "const ceiling = ladderTop ? Math.min(limits.maxPotency, ladderTop) : limits.maxPotency;",
    to: "const ceiling = limits.maxPotency;", breaks: "A1/A2" },
  { file: CATALOGUE, name: "R1 — the dialog stops saying IV at most",
    from: "const maxPotency = ladderTop ? Math.min(limits.maxPotency, ladderTop) : limits.maxPotency;",
    to: "const maxPotency = limits.maxPotency;", breaks: "A4" },
  { file: ACTOR, name: "R2 — a shield's potency leaves its own bonus (the shipped defect)",
    from: "        ? shieldDefenceWithPotency(item.system)\n        : 0,", to: "        ? Number(item.system.defenceBonus ?? 0)\n        : 0,", breaks: "A6" },
  { file: ACTOR, name: "R2 — shields go back into the item-bonus pool",
    from: '      if (runeKind !== "armour") continue;', to: '      if (runeKind !== "armour" && runeKind !== "shield") continue;', breaks: "A7" },
  { file: AID, name: "R2 — Benevolent reads the base DB only",
    from: "if (found) benevolent = shieldDefenceWithPotency(found.item.system);", to: "if (found) benevolent = Number(found.item.system?.defenceBonus ?? 0);", breaks: "A8" },
  { file: QUALITY, name: "A1 — potency's hit points are worked out and never added (the shipped defect)",
    from: ": computeItemHP(baseData.hp, modifiers) + potencyHP;", to: ": computeItemHP(baseData.hp, modifiers);", breaks: "A9/A10" },

  // B — Energy Resistance
  { file: EFFECTS, name: "A3 — every named type is granted, whatever the tier",
    from: "for (const type of types.slice(0, allowed)) resistances.push(type);", to: "for (const type of types) resistances.push(type);", breaks: "B3" },
  { file: EFFECTS, name: "A3 — the tier is written as a magnitude again",
    from: "for (const type of types.slice(0, allowed)) resistances.push(type);", to: "for (const type of types.slice(0, allowed)) resistances.push(`${type} ${tier}`);", breaks: "B4" },
  { file: CATALOGUE, name: "A3 — the parameter is one select again",
    from: "    choices: [\"acid\", \"cold\", \"electricity\", \"fire\", \"sonic\"],\n    perTier: true", to: "    choices: [\"acid\", \"cold\", \"electricity\", \"fire\", \"sonic\"]", breaks: "B6/B8" },

  // C — timed runes
  { file: ACTIONS, name: "R5 — Animated has no duration again",
    from: "    apCost: 1,\n    durationSeconds: 60,\n    cooldownSeconds: 60\n", to: "    apCost: 1,\n    durationSeconds: 0,\n    cooldownSeconds: 60\n", breaks: "C1" },
  { file: EFFECTS, name: "R6 — Arrow Catching is always on (the shipped defect)",
    from: 'if (item?.flags?.["trg-prime"]?.runeState?.arrowCatching) missileDefence += value;', to: "missileDefence += value;", breaks: "C5" },
  { file: TIMERS, name: "C — the timer has no end round in combat",
    from: "    ...(now?.round !== null && now?.round !== undefined ? { conditionExpiresRound: Number(now.round) + rounds } : {})\n", to: "", breaks: "C6" },
  { file: RAW, name: "R5 — the cooldown is never asked",
    from: '  if (!runeReady(item, "animated", action.label)) return null;\n', to: "", breaks: "C9" },
  { file: RAW, name: "R10 — Glamoured costs nothing",
    from: "    if (!await payRuneActivation(actor, action?.apCost ?? 0, `${item.name} — Glamoured`)) return null;\n", to: "", breaks: "C11" },
  { file: TIMERSF, name: "R5 — the shield floats on the ground's behalf: never drops",
    from: '      if (lapsed && ending.dropsOnLapse) updates["system.equipped"] = false;\n', to: "", breaks: "C12" },

  // D — Indestructible and the rest
  { file: ATTACK, name: "R8 — Indestructible is asked too late again (the shipped defect)",
    from: "  const indestructiblePiece = targetActor && criticalAmendmentApplies(row, targetArmour)", to: "  const indestructiblePiece = false && criticalAmendmentApplies(row, targetArmour)", breaks: "D2" },
  { file: CODEX, name: "B4 — Indestructible's metal goes unchecked",
    from: '      const met = material ? allowed.includes(material) : null;', to: "      const met = null;", breaks: "D4" },
  { file: COMBAT, name: "B6 — Deathless is offered on a Heroic",
    from: 'if (deathless && degree !== DEATHLESS_DEGREE && degree !== "heroic"', to: "if (deathless && degree !== DEATHLESS_DEGREE", breaks: "D7" },
  { file: SPELLFX, name: "B7 — runed clothing's Spell Effect is not read",
    from: "  const kind = runeKindOf(item) ?? item?.type;", to: "  const kind = item?.type;", breaks: "D8" },
  { file: SPELLWF, name: "B7 — runed clothing grants under body armour",
    from: "    if (!runesCountFor(item, items)) continue;\n", to: "", breaks: "D9" },

  // E — specific armour
  { file: CUSTOMADD, name: "A10 — Customise re-prices a specific item (the shipped defect)",
    from: "  if (item?.flags?.[SYSTEM_ID]?.specificItem) return false;\n", to: "", breaks: "E2" },
  { file: REFRESH, name: "A10 — a refresh re-prices a specific item",
    from: "    const customised = !specific && (", to: "    const customised = (", breaks: "E3" },
  { file: SPELLWF, name: "R10 — Quick Plate's Haste costs the spell's AP",
    from: "        ...(activationAP > 0 ? { castAP: activationAP } : {})\n", to: "", breaks: "E4" },

  // F — charged items
  { file: CHARGED, name: "R20 — the Spellcraft gate is one too strict again (the shipped defect)",
    from: "if (pp > maxPPPerCast(level))", to: "if (level < pp)", breaks: "F1" },
  { file: CHARGED, name: "A13 — the DC level is recomputed again",
    from: "  return printed > 0 ? printed : chargedItemLevel(item?.flags?.[\"trg-prime\"]?.chargedItem);", to: "  return chargedItemLevel(item?.flags?.[\"trg-prime\"]?.chargedItem);", breaks: "F2" },
  { file: BUILDER, name: "A14 — a built rod holds its spells' cost again",
    from: "    maximumPP = ROD_POWER_POINTS;", to: "    maximumPP = costs.reduce((total, pp) => total + pp, 0);", breaks: "F3" },
  { file: CHARGED, name: "A15 — a flexible wand warps to its whole pool again",
    from: "      ? { allowed: true, ceiling: Math.floor(pool / 3), reason: \"\" }", to: "      ? { allowed: true, ceiling: pool, reason: \"\" }", breaks: "F5" },
  { file: CHARGED, name: "R18 — the printed recharge is ignored",
    from: "  return printed > 0 ? printed : dailyRecharge(flag?.maximumPP, { invested });", to: "  return dailyRecharge(flag?.maximumPP, { invested });", breaks: "F6" },
  { file: CHARGEDF, name: "B10 — the item warps past its limit",
    from: "  if (total > ceiling) {", to: "  if (false) {", breaks: "F7" },
  { file: CHARGEDF, name: "R19 — a flexible wand starts at its printed PP again",
    from: "  const base = flexible && spell ? Math.max(0, Math.floor(Number(spell.system?.ppCost ?? listed) || 0)) : listed;", to: "  const base = listed;", breaks: "F8" },
  { file: GATE, name: "R17 — a held staff is only an occupied hand (the shipped defect)",
    from: "    !(implementHand && focusSatisfiesHand(components)) &&\n", to: "", breaks: "F9" },
  { file: SKILLOPT, name: "A13 — Recharge Item reads the recomputed level",
    from: "      const level = chargedItemLevelOf(item);", to: "      const level = 0;", breaks: "F2" }
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
    process.stderr.write("mutate-block36: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-block36: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block36: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
