#!/usr/bin/env node
/**
 * mutate-free-warp — can verify-free-warp fail? NEW at 3.447.0.
 *
 * N1 IS THE DEFECT HEALER'S GRACE SURFACED. The card note names a fixed
 * feat again, so a Cleric is told a Wizard's Powerful Illusion waived
 * their PP. A sentence that asserts something it does not know.
 *
 * G1 IS THE "IS IT REACHED?" ONE. The spell can grant a perfect flag and
 * the cast can consult nobody — this project's most repeated failure.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const F = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-free-warp.mjs");

const MUTATIONS = [
  /* ── N: who the card says waived it ────────────────────────────── */
  {
    file: C,
    name: "N1 THE DEFECT: the note names Powerful Illusion for everyone again",
    from: "        warp.notes.push(`-${free.waived} PP: ${who} (free, no minimum)`);",
    to: "        warp.notes.push(`-${free.waived} PP: Powerful Illusion (free, no minimum)`);",
    breaks: "C1/C2 — a Cleric is told a Wizard feat paid for their warping"
  },
  {
    file: C,
    name: "N2 the grant's own label is ignored",
    from: '          .map(({ effect, scoped }) => String(scoped.label ?? effect.name ?? "").trim())',
    to: '          .map(({ effect }) => String(effect.name ?? "").trim())',
    breaks: "C3 — the label the grant carries is the one it wants shown"
  },
  {
    file: C,
    name: "N3 an unnamed source is called nothing at all",
    from: '        const who = named.length ? named.join(", ") : "a free-warp effect";',
    to: '        const who = named.join(", ");',
    breaks: "C4 — the note reads \"-2 PP:  (free, no minimum)\""
  },
  {
    file: F,
    name: "N4 Powerful Illusion stops labelling its own grant",
    from: '      flags: { [SYSTEM_ID]: { warpFreeSchool: { ...POWERFUL_ILLUSION, label: "Powerful Illusion" } } }',
    to: "      flags: { [SYSTEM_ID]: { warpFreeSchool: { ...POWERFUL_ILLUSION } } }",
    breaks: "C5 — the feat goes unnamed now that the channel no longer names it for everyone"
  },

  /* ── G: is the grant reached? ──────────────────────────────────── */
  {
    file: E,
    name: "G1 the spell grants a flag under a name nothing reads",
    from: "              warpFreeSchool: { school: trait, value: free, label: spell.name }",
    to: "              warpFreeTrait: { trait, value: free, label: spell.name }",
    breaks: "B5 — the flag is written and the cast looks somewhere else"
  },
  {
    file: E,
    name: "G2 a grant with no trait is applied anyway",
    from: "          if (!trait || !free) {",
    to: "          if (false) {",
    breaks: "B7 — a free warp scoped by nothing, applied silently"
  },
  {
    file: E,
    name: "G3 the granted amount stops being warpable",
    from: "            warpedBonusValue(Number(effect.value) || 0, warpBonus, warpBonusMax)));",
    to: "            Number(effect.value) || 0));",
    breaks: "B8 — the +4 PP warp is charged and changes nothing"
  },
  {
    file: C,
    name: "G4 the channel matches on something other than the spell's traits",
    from: "        && spellTraits.includes(String(scoped.school).trim().toLowerCase())",
    to: "        && true",
    breaks: "B1 — every spell gets every free warp, whatever its traits"
  },
  {
    file: C,
    name: "G5 a zero-value grant counts as a source",
    from: "        && (Number(scoped.value) || 0) > 0);",
    to: "        && true);",
    breaks: "B2 — an empty grant is named on the card as having waived nothing"
  },
  {
    file: C,
    name: "G6 only the first source is credited",
    from: "    const freeWarp = freeWarpSources.reduce((sum, { scoped }) => sum + (Number(scoped.value) || 0), 0);",
    to: "    const freeWarp = Number(freeWarpSources[0]?.scoped?.value) || 0;",
    breaks: "B4 — a caster under two grants gets one"
  },
  {
    file: C,
    name: "G7 disabled effects still waive PP",
    from: "    const freeWarpSources = Array.from(actor.appliedEffects ?? actor.effects ?? [])\n      .filter((e) => !e.disabled)",
    to: "    const freeWarpSources = Array.from(actor.appliedEffects ?? actor.effects ?? [])\n      .filter(() => true)",
    breaks: "B3 — a spell that ended keeps paying"
  },

  /* ── A: free is not a discount ─────────────────────────────────── */
  {
    file: W,
    name: "A1 a free warp is floored at 1 like a discount",
    from: "  return { total: total - waived, waived };",
    to: "  return { total: Math.max(1, total - waived), waived };",
    breaks: "A2 — the one thing that separates this from a heritage discount"
  },
  {
    file: W,
    name: "A2 the Metamagic box is waived too",
    from: "  const warpOnly = Math.max(0, total - raw);",
    to: "  const warpOnly = total;",
    breaks: "A4 — PP spent on feats is not warping, and must keep being paid"
  },
  {
    file: W,
    name: "A3 more is waived than was ever spent",
    from: "  const waived = Math.min(warpOnly, free);",
    to: "  const waived = free;",
    breaks: "A3 — a cast that warped 1 PP is credited 5"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([C, E, W, F, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-free-warp: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-free-warp: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-free-warp: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
