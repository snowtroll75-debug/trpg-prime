#!/usr/bin/env node
/**
 * mutate-weapon-damage-bonus — can verify-weapon-damage-bonus fail?
 *
 * NEW at 3.493.0.
 *
 * W1 IS THE SHIPPED DEFECT: the spell carried a note and nothing else, so
 * the bonus existed only as a sentence for somebody to remember.
 *
 * C3 IS THE ONE THAT MATTERS MOST. "Max +4" is easy to enforce where the
 * warp is applied and forget where two castings meet. A cap on one blade
 * that a second casting walks around is not a cap.
 *
 * S1 IS THE OTHER: an unscoped bonus arms every weapon the character
 * owns, which is exactly the defect Talon Strike's `weaponScoped` was
 * built to prevent, reappearing in a new mechanism.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "weapon-damage-bonus.mjs");
const A = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const SE = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-weapon-damage-bonus.mjs");

const MUTATIONS = [
  /* ── C: the printed cap ────────────────────────────────────────── */
  {
    file: P,
    name: "C1 THE CAP IS LOST WHERE TWO CASTINGS MEET",
    from: "  return Math.min(MAX_WEAPON_DAMAGE_BONUS, total);",
    to: "  return total;",
    breaks: "C3 — two Gravity Weapons on one blade would stack to +8"
  },
  {
    file: P,
    name: "C2 and where a warp is folded in",
    from: "    value: Math.min(MAX_WEAPON_DAMAGE_BONUS, value),",
    to: "    value,",
    breaks: "C2 — \"max +4\" is the spell's own sentence"
  },
  {
    file: P,
    name: "C3 the cap is raised past the printed one",
    from: "const MAX_WEAPON_DAMAGE_BONUS = 4;",
    to: "const MAX_WEAPON_DAMAGE_BONUS = 6;",
    breaks: "C1 — the number is printed, not chosen"
  },

  /* ── S: the scope ──────────────────────────────────────────────── */
  {
    file: P,
    name: "S1 THE UNSCOPED BONUS: every weapon the character owns is armed",
    from: "    if (!ids.includes(id)) continue;",
    to: "    if (false) continue;",
    breaks: "S1 — the defect Talon Strike's weaponScoped exists to prevent"
  },
  {
    file: P,
    name: "S2 the empty-id filter is dropped, so a record can match nothing",
    from: "    weaponIds: Array.isArray(raw.weaponIds) ? raw.weaponIds.filter(Boolean).map(String) : []",
    to: "    weaponIds: Array.isArray(raw.weaponIds) ? raw.weaponIds.map(String) : []",
    breaks: "S1c — the filter is what makes an unnamed weapon unmatchable"
  },

  /* ── D: the declared row ───────────────────────────────────────── */
  {
    file: P,
    name: "D1 a bonus of zero is accepted",
    from: "  if (value <= 0) return null;",
    to: "  if (value < 0) return null;",
    breaks: "D3 — a spell that adds nothing looks like one that is broken"
  },
  {
    file: P,
    name: "D2 a negative bonus becomes a penalty spell",
    from: "  if (value <= 0) return null;",
    to: "  if (value === null) return null;",
    breaks: "D3b — a penalty is a different rule than this spell prints"
  },
  {
    file: P,
    name: "D3 the validator refuses the record it stored itself",
    from: "  if (raw.kind !== undefined && text(raw.kind) !== \"weaponDamageBonus\") return null;",
    to: "  if (text(raw.kind) !== \"weaponDamageBonus\") return null;",
    breaks: "D4 — the stored flag carries no kind, so nothing would read back"
  },

  /* ── W: is it reached ──────────────────────────────────────────── */
  {
    file: A,
    name: "W1 THE SHIPPED DEFECT: the damage builder never asks",
    from: "  if (gravityBonus > 0) formula += ` + ${gravityBonus}`;",
    to: "",
    breaks: "W1b — the spell goes back to being a sentence somebody has to remember"
  },
  {
    file: A,
    name: "W2 it is added outside the flat-bonus list",
    from: "  const gravityBonus = weaponDamageBonusFor(weaponDamageBonusesOn(actor), weapon?.id);",
    to: "  const gravityBonus = 0;",
    breaks: "W1 — computed and thrown away"
  },
  {
    file: SE,
    name: "W3 the effect kind stops being handled",
    from: '        case "weaponDamageBonus": {',
    to: '        case "weaponDamageBonusDisabled": {',
    breaks: "W3 — the spell falls through to the unhandled-kind branch"
  },
  {
    file: SE,
    name: "W4 a cast with no weapon chosen applies silently",
    from: "          if (!chosen.length) {",
    to: "          if (false) {",
    breaks: "W3c — a spell that armed nothing in silence"
  },
  {
    file: SE,
    name: "W5 the warps stop being folded in",
    from: "            value: Number(effect.value ?? 0) + Number(warpMods?.weaponDamageBonus ?? 0),",
    to: "            value: Number(effect.value ?? 0),",
    breaks: "G3c — the 4 PP warp would buy nothing, as it did before this release"
  },

  /* ── R: the card ───────────────────────────────────────────────── */
  {
    file: P,
    name: "R1 a warp paid for and unused is not reported",
    from: "  if (chosen >= spec.weapons) return null;",
    to: "  return null; // eslint-disable-line",
    breaks: "R2 — a caster who bought a second weapon and armed one has no other way to know"
  },
  {
    file: P,
    name: "R2 the shortfall fires even when the count was met",
    from: "  if (chosen >= spec.weapons) return null;",
    to: "  if (chosen > spec.weapons) return null;",
    breaks: "R2b — a line about a shortfall that did not happen"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, A, SE, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-weapon-damage-bonus: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-weapon-damage-bonus: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-weapon-damage-bonus: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
