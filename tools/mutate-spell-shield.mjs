#!/usr/bin/env node
/**
 * mutate-spell-shield — can verify-spell-shield fail?
 *
 * NEW at 3.542.0, beside the verify.
 *
 * E1 IS THE ONE THAT MATTERS. It asserts a caster with a spell shield can
 * block, and the mutation restores the exact line that made that false
 * for the whole life of the Shield spell — the eligibility rule looking
 * only at equipped items. If that ever comes back, the spell silently
 * stops doing the thing it is named for, which is how it shipped.
 *
 * C1 AND C2 PULL IN OPPOSITE DIRECTIONS deliberately: one says a tie
 * goes to the carried shield, the other that a better spell shield wins.
 * A rule that always preferred either would satisfy one and break the
 * other, so neither can rot unnoticed.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "spell-shield.mjs");
const B = path.join(SYSTEM_ROOT, "module", "combat", "shield-block.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-spell-shield.mjs");

const MUTATIONS = [
  {
    file: B,
    name: "E1 ELIGIBILITY GOES BACK TO ITEMS ONLY — the defect exactly as it shipped",
    from: "    if (spellSources.length) {",
    to: "    if (false) {",
    breaks: "E1 — a caster running Shield is told \"no shield is equipped\" again, which is "
      + "true about their inventory and false about whether they can block"
  },
  {
    file: B,
    name: "E1b A SPELL SHIELD WORTH NOTHING STILL LETS YOU BLOCK",
    from: "  const spellSources = (Array.isArray(spellShields) ? spellShields : [])\n    .filter((s) => Number(s?.dr) > 0);",
    to: "  const spellSources = (Array.isArray(spellShields) ? spellShields : []);",
    breaks: "E1b — \"a shield with no DR is not a worse Shield Block, it is no Shield Block\", "
      + "and the rule's own header says so"
  },
  {
    file: R,
    name: "D1 THE BSB STOPS BEING ADDED",
    from: "  return raised + scaled;",
    to: "  return raised;",
    breaks: "D1/D2/D3 — the shield stops scaling with the caster, which is the entire reason "
      + "this could not be a conjured item"
  },
  {
    file: R,
    name: "D2 THE WARP RAISES THE TOTAL INSTEAD OF THE BASE",
    from: "  const raised = cap > 0 ? Math.min(base + bump, cap) : base + bump;",
    to: "  const raised = base;",
    breaks: "D2 — the warp buys nothing, so \"increase shield bonus & base DR by +1\" is back "
      + "to raising only the bonus half"
  },
  {
    file: R,
    name: "D3 THE PRINTED CEILING STOPS BINDING",
    from: "  const raised = cap > 0 ? Math.min(base + bump, cap) : base + bump;",
    to: "  const raised = base + bump;",
    breaks: "D3/D3b — \"(max +5)\" would mean nothing and the base could be bought upward "
      + "without limit"
  },
  {
    file: R,
    name: "N1 A MALFORMED ROW IS ACCEPTED AND DEFAULTED",
    from: "  if (!Number.isFinite(baseDR) || baseDR < 0) return null;",
    to: "  if (false) return null;",
    breaks: "N1/P3 — an authoring mistake becomes invisible: the spell works and nobody "
      + "learns the row was wrong"
  },
  {
    file: R,
    name: "N2 BSB IS READ FROM ONE FIELD ONLY",
    from: "  return Math.max(0, Math.trunc(Number(system?.magic?.bsb ?? 0)))\n    + Math.max(0, Math.trunc(Number(system?.progression?.bsb ?? 0)));",
    to: "  return Math.max(0, Math.trunc(Number(system?.magic?.bsb ?? 0)));",
    breaks: "N2 — the class half of every caster's Base Spell Bonus goes missing, which is "
      + "most of it"
  },
  {
    file: B,
    name: "C1 THE SPELL SHIELD WINS TIES",
    from: "  if (spellBest && Number(spellBest.dr) > bestDR) {",
    to: "  if (spellBest && Number(spellBest.dr) >= bestDR) {",
    breaks: "C1 — a tie would end the spell to stop damage a carried shield was stopping "
      + "for free"
  },
  {
    file: B,
    name: "C2 THE CARRIED SHIELD ALWAYS WINS",
    from: "  if (spellBest && Number(spellBest.dr) > bestDR) {",
    to: "  if (false) {",
    breaks: "C2 — a DR 7 spell shield would lose to a DR 2 steel one, and the PP would have "
      + "bought a worse block"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([R, B, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spell-shield: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-spell-shield: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-spell-shield: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
