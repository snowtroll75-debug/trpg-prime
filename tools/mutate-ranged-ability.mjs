#!/usr/bin/env node
/**
 * mutate-ranged-ability — can verify-ranged-ability fail?
 *
 * NEW at 3.489.0.
 *
 * R1 IS THE SHIPPED DEFECT, restored literally: `!isRanged` on the
 * Finesse line was the only gate, so every missile and thrown Strike
 * rolled with Strength. It shipped for the life of the project because
 * core contains no printed ranged attack line to check against.
 *
 * C1 IS THE ONE WORTH READING TWICE. The tempting "tidy" here is to make
 * the ranged rule clamp like Finesse does, so neither ever applies a
 * penalty. That is a one-character change, it looks like consistency, and
 * it quietly reinstates half the bug — a Strength archer keeps the better
 * number. Finesse clamps because it is an OPTION a weapon grants; this is
 * what the ability IS.
 *
 * D1/D2 ATTACK THE HALF THAT WAS ALREADY CORRECT, because the obvious way
 * to "finish" this change is to make ranged damage match the attack roll.
 * The book gives Dexterity the ranged attack ROLL and gives damage to
 * melee weapons; making them symmetrical breaks a rule that was right.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const A = path.join(SYSTEM_ROOT, "module", "combat", "attack.mjs");
const W = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const B = path.join(SYSTEM_ROOT, "module", "alchemical-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-ranged-ability.mjs");

const MUTATIONS = [
  /* ── R: the rule ───────────────────────────────────────────────── */
  {
    file: A,
    name: "R1 THE SHIPPED DEFECT: a ranged attack keeps the configured ability",
    from: "  if (!isRanged) return 0;",
    to: "  if (true) return 0;",
    breaks: "R2 — every bow, sling and javelin goes back to rolling with Strength"
  },
  {
    file: A,
    name: "R2 the swap fires on melee attacks too",
    from: "  if (!isRanged) return 0;",
    to: "  if (false) return 0;",
    breaks: "R1 — a longsword would roll with Dexterity"
  },
  {
    file: A,
    name: "R3 the delta is inverted",
    from: "  return Number(dexMod) - Number(currentAbilityMod);",
    to: "  return Number(currentAbilityMod) - Number(dexMod);",
    breaks: "R2 — the swap would move away from Dexterity"
  },

  /* ── C: THE TEMPTING TIDY ──────────────────────────────────────── */
  {
    file: A,
    name: "C1 THE TIDY: the ranged rule is made to clamp like Finesse",
    from: "  return Number(dexMod) - Number(currentAbilityMod);",
    to: "  const delta = Number(dexMod) - Number(currentAbilityMod);\n  return delta > 0 ? delta : 0;",
    breaks: "R4/F2/F3 — a Strength-built archer would keep the better number, which is "
      + "half the original bug wearing the word 'consistency'"
  },
  {
    file: A,
    name: "C2 or Finesse is made to stop clamping, to match the ranged rule",
    from: "  const delta = Number(dexMod) - Number(currentAbilityMod);\n  return delta > 0 ? delta : 0;",
    to: "  return Number(dexMod) - Number(currentAbilityMod);",
    breaks: "F1/F2 — Finesse is an option a weapon grants; nobody chooses the lower one"
  },

  /* ── W: is it reached ──────────────────────────────────────────── */
  {
    file: W,
    name: "W1 the rule is imported and never called",
    from: "  const rangedAbilityBonus = rangedAbilityAdjustment(",
    to: "  const rangedAbilityBonus = 0 * rangedAbilityAdjustment(",
    breaks: "W1/W2 — the project's most-repeated defect, in its purest form"
  },
  {
    file: W,
    name: "W2 THE SILENT PENALTY: only a benefit reaches the roll",
    from: "  if (rangedAbilityBonus) {",
    to: "  if (rangedAbilityBonus > 0) {",
    breaks: "W2 — a Strength archer keeps the better number and the card never says so"
  },
  {
    file: W,
    name: "W3 the penalty stops naming what it replaced",
    from: '      label: `Ranged (Dexterity)${rangedAbilityBonus < 0 ? " — replaces Strength" : ""}`,',
    to: '      label: "Ranged (Dexterity)",',
    breaks: "W2b — a negative number on a card with no reason is the original complaint"
  },
  {
    file: W,
    name: "W4 Finesse is widened to ranged weapons, so both swaps stack",
    from: 'const finesse = !isRanged && /\\bfinesse\\b/i.test(String(weaponData.traits ?? ""));',
    to: 'const finesse = /\\bfinesse\\b/i.test(String(weaponData.traits ?? ""));',
    breaks: "W3 — a finesse thrown dagger would take the Dexterity swap twice"
  },

  /* ── B: the bomb ───────────────────────────────────────────────── */
  {
    file: B,
    name: "B1 THE OTHER SHIPPED DEFECT: the bomb adds Dexterity twice again",
    from: "    total: resolved + swap + penalty,",
    to: "    total: resolved + dexterity + penalty,",
    breaks: "B1b — `attack.total` already contains an ability, so this is BAB + Str + Dex"
  },
  {
    file: B,
    name: "B2 the bomb switches to the raw BAB instead of the resolved total",
    from: "  const resolved = Number(system.combat?.attack?.total ?? system.combat?.bab ?? 0);",
    to: "  const resolved = Number(system.combat?.bab?.total ?? 0);",
    breaks: "B2 — every magic, feat and effect attack bonus would silently vanish"
  },

  /* ── S: the sheet ──────────────────────────────────────────────── */
  {
    file: path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs"),
    name: "S1 the sheet's ranged total is derived from its own arithmetic",
    from: "    combat.attack.ranged = combat.attack.total + rangedAbilityAdjustment(",
    to: "    combat.attack.ranged = combat.attack.base + Number(\n      system.attributes?.dexterity?.total ?? 0\n    ) + 0 * rangedAbilityAdjustment(",
    breaks: "S1 — a second answer to the same question drifts from the roll's"
  },
  {
    file: path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs"),
    name: "S2 the sheet goes back to showing one attack number",
    from: "            <div class=\"hero-stat\">\n              <span class=\"hero-stat-label\">Ranged Attack</span>\n              <strong>{{system.combat.attack.ranged}}</strong>",
    to: "            <div class=\"hero-stat\" hidden>\n              <span class=\"hero-stat-label\">Hidden</span>\n              <strong>{{system.combat.attack.base}}</strong>",
    breaks: "S3/S3b — a Dexterous character reads their melee total and rolls higher"
  },

  /* ── D: the half that was already right ────────────────────────── */
  {
    file: W,
    name: "D1 THE FALSE SYMMETRY: ranged damage is given Dexterity too",
    // Narrowed to the one line it changes at 3.575.0, when the line above
    // it changed (the x1.5 now takes `usedTwoHanded` whole) and the old
    // three-line anchor stopped matching.
    from: "    : thrownDamage ? strengthMod : propulsiveStrengthBonus(hasPropulsive, strengthMod);",
    to: "    : dexterityMod;",
    breaks: "D3 — the book gives Dexterity the ranged attack ROLL, never the damage"
  },
  {
    file: A,
    name: "D2 or Strength is added back to ranged damage for symmetry",
    from: "  if (!hasPropulsive) return 0;",
    to: "  if (!hasPropulsive) return Number(strengthMod) || 0;",
    breaks: "D1 — \"damage dealt with MELEE weapons\"; this half was always correct"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const D = path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs");
const S = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const guard = guardFiles([A, W, B, D, S, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-ranged-ability: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-ranged-ability: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-ranged-ability: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
