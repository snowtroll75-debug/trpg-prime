#!/usr/bin/env node
/**
 * mutate-block35 — can verify-block35 fail?
 *
 * NEW at 3.613.0. Each mutation puts back a defect block 35's audit found,
 * or breaks one of the channels built to answer Graham's rulings.
 * SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const ABIL = at("module", "dice", "check-abilities.mjs");
const CHECK = at("module", "dice", "check.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const HELD = at("module", "magic", "held-bonus.mjs");
const HELDF = at("module", "magic", "held-bonus-workflow.mjs");
const CARD = at("module", "dice", "check-card-interactions.mjs");
const EMAN = at("module", "magic", "emanation.mjs");
const EMANFX = at("module", "magic", "emanation-effects.mjs");
const WARP = at("module", "magic", "spell-warp.mjs");
const SPEED = at("module", "combat", "granted-speeds.mjs");
const GRANT = at("module", "magic", "granted-ability.mjs");
const RIDER = at("module", "magic", "strike-riders.mjs");
const ATTROW = at("module", "magic", "attack-degree-rows.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const FX = at("module", "magic", "spell-effects.mjs");
const COUNTER = at("module", "magic", "counteract-row.mjs");
const APPLY = at("module", "combat", "effect-application-workflow.mjs");
const THORNS = at("module", "magic", "thorns.mjs");
const PLANF = at("tools", "block35-plan.mjs");
const VERIFY = at("tools", "verify-block35.mjs");

const MUTATIONS = [
  // A — R1
  { file: ABIL, name: "R1 — a skill no longer reads its governing ability",
    from: "    return clean([system?.skills?.[subject]?.ability ?? SKILLS[subject]?.ability]);",
    to: "    return [];", breaks: "A2/A9" },
  { file: ABIL, name: "R1 — Reflex is read as Wisdom",
    from: '  reflex: "dexterity",', to: '  reflex: "wisdom",', breaks: "A3/A9" },
  { file: ABIL, name: "R1 — a ranged Strike is Strength-based",
    from: '  if (ranged) return ["dexterity"];', to: '  if (ranged) return ["strength"];', breaks: "A6" },
  { file: HELD, name: "R1 — the ability axis stops narrowing",
    from: "    if (!abilities.some((a) => based.includes(a))) return false;", to: "    ;", breaks: "A10" },
  { file: HELD, name: "R1 — the ability axis is dropped on normalising",
    from: "    abilities: list(raw.abilities),", to: "    abilities: [],", breaks: "A9/A11" },
  { file: CHECK, name: "R1 — the card stops carrying the abilities",
    from: "              abilities: this.abilities,\n", to: "", breaks: "A7" },
  { file: ATTACK, name: "R1 — a Strike names no abilities",
    from: "    abilities: weaponAttackAbilities({ ranged: isRanged, finesse }),\n", to: "", breaks: "A8" },
  { file: PLANF, name: "R1 — Physical Boost back to attribute checks only",
    from: "const PHYSICAL_CHECKS = [\"attribute\", \"skill\", \"specialist\", \"save\", \"attack\", \"initiative\"];",
    to: "const PHYSICAL_CHECKS = [\"attribute\"];", breaks: "A9/I1" },

  // B — R3
  { file: EMAN, name: "R3 — a resistance does not travel with an emanation",
    from: '"turnSave", "heldBonus", "defence", "damageHeal"]);', to: '"turnSave", "heldBonus", "damageHeal"]);', breaks: "B1/B2" },
  { file: EMANFX, name: "R3 — a creature walking in gets no resistance",
    from: "      if (field) for (const v of values) changes.push({ key: field.path, type: CHANGE_TYPE.ADD, value: `, ${v}` });",
    to: "      ;", breaks: "B3" },
  { file: WARP, name: "R3 — an emanation's resistance ignores its warps",
    from: "      if (warpMods?.defenceValue) { out.value = String(warpMods.defenceValue); delete out.values; }",
    to: "      ;", breaks: "B4" },

  // C — R4
  { file: HELD, name: "R4 — every casting offers its own advantage",
    from: "    if (spentLabels.has(key) || offered.has(key)) continue;", to: "    if (spentLabels.has(key)) continue;", breaks: "C1" },
  { file: HELD, name: "R4 — a spent casting does not stop the other",
    from: "    if (spentLabels.has(key) || offered.has(key)) continue;", to: "    if (offered.has(key)) continue;", breaks: "C2" },
  { file: HELDF, name: "R4 — the spend ignores a sibling spent this round",
    from: "    if (siblingSpent) return false;\n", to: "", breaks: "C6" },

  // D — R5
  { file: SPEED, name: "R5 — a half Speed is the whole Speed",
    from: "  const share = Number(grant.landFraction) > 0 ? Math.floor((land * Number(grant.landFraction)) / 5) * 5 : land;",
    to: "  const share = land;", breaks: "D2" },
  { file: SPEED, name: "R5 — the share is lost on normalising",
    from: "  return landFraction ? { key, feet, orLand, landFraction } : { key, feet, orLand };",
    to: "  return { key, feet, orLand };", breaks: "D2/D4" },
  { file: GRANT, name: "R5 — the claws' overrides are dropped",
    from: "  return system ? { uuid, label: text(raw.label), system } : { uuid, label: text(raw.label) };",
    to: "  return { uuid, label: text(raw.label) };", breaks: "D5" },
  { file: FX, name: "R5 — the grant ignores the overrides",
    from: "          if (spec.system) payload.system = { ...(payload.system ?? {}), ...spec.system };\n", to: "", breaks: "D6" },

  // E — R12
  { file: RIDER, name: "R12 — the weapon's own die is refused",
    from: "  const weaponDie = raw.weaponDie === true;", to: "  const weaponDie = false;", breaks: "E1/E5" },
  { file: RIDER, name: "R12 — the die is the weapon's whole damage",
    from: "  return { dice: `1d${m[1]}`, type: type || \"untyped\" };", to: "  return { dice: String(weapon.damage), type: type || \"untyped\" };", breaks: "E4" },

  // F — R13
  { file: ATTROW, name: "R13 — a critical is read as a hit",
    // Re-anchored at 3.672.0, where the outcome test gained a severity floor.
    from: '  if (!outcomes.includes(critical ? "critical" : "hit")) return false;', to: '  if (!outcomes.includes("hit")) return false;', breaks: "F2" },
  { file: FX, name: "R13 — the effect engine ignores the outcome",
    from: "    recipients = attackRowRecipients(effect, recipients, attackResults);\n", to: "", breaks: "F5" },
  { file: FX, name: "R13 — the slowed outlasts the sickened",
    from: "            ...(effect.endsWith ? { endsWith: String(effect.endsWith).trim() } : {})", to: "            ...{}", breaks: "F4" },

  // G — R14
  { file: COUNTER, name: "R14 — an effect is counteracted whatever its source",
    from: "    if (!carried.some((t) => spec.traits.includes(t))) continue;", to: "    ;", breaks: "G2" },
  { file: COUNTER, name: "R14 — a named condition is counted twice",
    from: "    if (statuses.some((s) => named.has(String(s).toLowerCase()))) continue;", to: "    ;", breaks: "G2" },
  { file: APPLY, name: "R14 — a condition forgets the spell that caused it",
    from: "        updates[`flags.${SYSTEM_ID}.${SOURCE_TRAITS_FLAG}`] = sourceTraits;\n      }\n      if (effect?.update && Object.keys(updates).length) {\n        await effect.update(updates);\n      }\n      applied.push({ key: tag.key, label: tag.label, value: newValue, wasAlreadyPresent, ...(wardedBy ? { wardedPartly: wardedBy } : {}) });",
    to: "      }\n      if (effect?.update && Object.keys(updates).length) {\n        await effect.update(updates);\n      }\n      applied.push({ key: tag.key, label: tag.label, value: newValue, wasAlreadyPresent, ...(wardedBy ? { wardedPartly: wardedBy } : {}) });", breaks: "G6" },
  { file: FX, name: "R14 — Soothing Words counteracts its own buff",
    from: "              && x.origin !== spell.uuid && !(castId && x.flags?.[SYSTEM_ID]?.castId === castId))) {",
    to: "              )) {", breaks: "G7" },

  // H — the no-ruling fixes
  { file: PLANF, name: "A1 — Wizard Strike back to +1",
    from: '{ kind: "heldBonus", target: "self", label: "Wizard Strike", heldKind: "advantage", checkTypes: ["attack"] }',
    to: '{ kind: "heldBonus", target: "self", label: "Wizard Strike", value: 1, bonusType: "status", checkTypes: ["attack"] }', breaks: "H1/I1" },
  { file: WARP, name: "B6 — Talon Strike's 2d6 can be bought twice",
    from: "  if (m.once) return 1;\n", to: "", breaks: "H6" },
  { file: FX, name: "B7 — the strike rider's condition reads no warp",
    from: "              ? { conditionValue: warpedConditionValue(Math.max(1, Number(effect.conditionValue ?? 1) || 1), warpMods, effect) }",
    to: "              ? { conditionValue: effect.conditionValue }", breaks: "H7" },
  { file: THORNS, name: "B8 — the thorns ignore their warp",
    from: "  if (!raw || !n || !step || typeof step !== \"object\") return raw;", to: "  return raw;", breaks: "H8" },
  { file: FX, name: "B8 — the cast never warps the thorns",
    from: "          const spec = normaliseThorns(warpedThorns(effect, warpBonus));", to: "          const spec = normaliseThorns(effect);", breaks: "H8" },
  { file: PLANF, name: "A2 — Purge The Unlife burns the living again",
    from: '    kindGate: "undead"\n  },\n\n  // A3', to: '    kindGate: ""\n  },\n\n  // A3', breaks: "H2/I1" }
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
    process.stderr.write("mutate-block35: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-block35: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block35: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
