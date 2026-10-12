#!/usr/bin/env node
/**
 * mutate-song-and-dance — can verify-song-and-dance fail? NEW at 3.443.3.
 *
 * D1 IS THE DEFECT. It puts the raw Spellcraft total back into the Save
 * DC, which is exactly what shipped from the day Bardic Performance was
 * wired until 3.443.3: the CHECK gave the class bonus up and the DC kept
 * it, because a Specialist Spell's Save DC is
 * `max(10 + ability + level, 10 + spellcraft)` and nobody thought of that
 * formula as a Spellcraft check.
 *
 * D4 IS THE SAME DEFECT ONE STEP UP, and the more dangerous shape: the
 * cast reads the Bardic Performance total unconditionally, so every
 * ORDINARY Bard cast loses a bonus the book gives them. A rule that is
 * wrong in one direction is usually wrong in the other if nobody asks.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const B = path.join(SYSTEM_ROOT, "module", "bard.mjs");
const A = path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const R = path.join(SYSTEM_ROOT, "module", "dice", "resolution.mjs");
const D = path.join(SYSTEM_ROOT, "module", "magic", "casting-dc.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-song-and-dance.mjs");
// SOME MUTATIONS ARE CAUGHT BY THE OTHER PAIR. The Song & Dance term is
// assembled in casting-dc.mjs, whose own suite owns the "nothing moves a
// DC in silence" invariant — so a mutation of it must be run against BOTH
// checks rather than quietly counted as surviving.
const DC_CHECK = path.join(SYSTEM_ROOT, "tools", "verify-casting-dc.mjs");

const MUTATIONS = [
  /* ── G: the grant ──────────────────────────────────────────────── */
  {
    file: B,
    name: "G1 the grant loses the source the exclusion recognises",
    from: "    source: SONG_AND_DANCE_SOURCE",
    to: '    source: "songDance"',
    breaks: "A3/B1 — a bonus the filter cannot see can never be taken away"
  },
  {
    file: B,
    name: "G2 anyone gets the class bonus",
    from: '  if (!hasClassAbility(actor, "song & dance")) return null;',
    to: "  if (false) return null;",
    breaks: "A4 — a Wizard's Spellcraft grows a Bard's class bonus"
  },

  /* ── F: the filter ─────────────────────────────────────────────── */
  {
    file: B,
    name: "F1 the filter keeps everything",
    from: '    (bonus) => String(bonus?.source ?? "") !== SONG_AND_DANCE_SOURCE',
    to: "    () => true",
    breaks: "B1/C1 — the Bardic Performance total becomes the ordinary one"
  },
  {
    file: B,
    name: "F2 the filter takes the neighbours with it",
    from: '    (bonus) => String(bonus?.source ?? "") !== SONG_AND_DANCE_SOURCE',
    to: '    (bonus) => String(bonus?.source ?? "") === SONG_AND_DANCE_SOURCE',
    breaks: "B1b/B2 — every other Spellcraft bonus dropped along with it"
  },
  {
    file: B,
    name: "F3 the filter mutates the pool it was handed",
    from: "  return Array.from(pool ?? []).filter(",
    to: "  if (Array.isArray(pool)) { for (let i = pool.length - 1; i >= 0; i -= 1) { if (String(pool[i]?.source ?? \"\") === SONG_AND_DANCE_SOURCE) pool.splice(i, 1); } }\n  return Array.from(pool ?? []).filter(",
    breaks: "B4 — the ordinary total is resolved from the same pool object"
  },

  /* ── D: the derived numbers ────────────────────────────────────── */
  {
    // THE DEFECT ITSELF.
    file: C,
    name: "D1 THE DEFECT: the Save DC reads the raw total again",
    from: "        ? specialistSaveDC(castingAbility, characterLevel, spellcraftForCast)",
    to: "        ? specialistSaveDC(castingAbility, characterLevel, system.magic?.spellcraft?.total ?? 0)",
    breaks: "F3/F6 — a Bardic Performance cast sets a DC one point too high"
  },
  {
    file: C,
    name: "D2 the Disbelieve DC reads the raw total",
    from: "      ? specialistSaveDC(abilityForDisbelief, characterLevel, spellcraftForCast)",
    to: "      ? specialistSaveDC(abilityForDisbelief, characterLevel, system.magic?.spellcraft?.total ?? 0)",
    breaks: "F4/F6 — the same defect in the illusion's own DC"
  },
  {
    file: C,
    name: "D3 the specialist attack uplift reads the raw total",
    from: "        ? specialistAttackUplift(castingAbility, characterLevel, spellcraftForCast)",
    to: "        ? specialistAttackUplift(castingAbility, characterLevel, system.magic?.spellcraft?.total ?? 0)",
    breaks: "F5/F6"
  },
  {
    // THE DEFECT POINTED THE OTHER WAY, and the worse of the two.
    file: C,
    name: "D4 every ordinary Bard cast loses the bonus too",
    from: "  const songAndDanceForCast = castWithSpellcraft",
    to: "  const songAndDanceForCast = false",
    breaks: "H1/H5 — the book gives a Bard this bonus on every Spellcraft cast"
  },
  {
    file: C,
    name: "D5 a sheet prepared before this existed loses its Spellcraft",
    from: "    system.magic?.spellcraft?.bardicPerformanceTotal ?? spellcraftWhole",
    to: "    system.magic?.spellcraft?.bardicPerformanceTotal ?? 0",
    breaks: "F2b — an unmigrated actor's every specialist DC collapses to the ability floor"
  },

  /* -- N: the bonus is ADDED, not merely carried (3.444.0) --------- */
  {
    // THE DEFECT GRAHAM RULED ON. The base keeps the bonus inside it, so
    // the Specialist max REPLACES the Bard's number instead of adding to
    // it, and every non-specialist save DC never sees it at all.
    file: C,
    name: "N1 THE DEFECT: the bonus rides inside the base again",
    from: "  const spellcraftForCast = Number(\n    system.magic?.spellcraft?.bardicPerformanceTotal ?? spellcraftWhole\n  );",
    to: "  const spellcraftForCast = spellcraftWhole;",
    breaks: "F2/H2 — a max is not a sum, and the bonus is one of two candidates rather than a bonus"
  },
  {
    file: C,
    name: "N2 the save DC assembly stops being told about it",
    from: "      songAndDance: songAndDanceForCast",
    to: "      songAndDance: 0",
    breaks: "H3 — every Bard save DC silently loses the class bonus"
  },
  {
    file: C,
    name: "N3 the Disbelieve DC forgets it",
    from: "      + songAndDanceForCast;",
    to: "      + 0;",
    breaks: "H4"
  },
  {
    file: C,
    name: "N4 an innate spell-like collects it too",
    from: "  const castWithSpellcraft = !usePerform && !isInnate && !isItemCast;",
    to: "  const castWithSpellcraft = !usePerform;",
    breaks: "H5 — \"this only applies when casting spells using Spellcraft\""
  },
  {
    file: C,
    name: "N5 the amount becomes the raw class bonus",
    from: "    ? Math.max(0, spellcraftWhole - spellcraftForCast)",
    to: "    ? Number(system.identity?.classBonus ?? 0)",
    breaks: "H1b — a third place deciding what Song & Dance is worth"
  },
  {
    file: C,
    name: "N6 a negative difference becomes a penalty",
    from: "    ? Math.max(0, spellcraftWhole - spellcraftForCast)",
    to: "    ? (spellcraftWhole - spellcraftForCast)",
    breaks: "H1c — a grant that could subtract from somebody's save DC"
  },
  {
    file: D,
    name: "N7 the assembly drops the bonus on the floor",
    from: '  dc += push(parts, "Song & Dance", Math.max(0, int(songAndDance)));',
    to: "  ;",
    breaks: "H17 (casting-dc) — the term is passed in and never added"
  },
  {
    file: D,
    name: "N8 the bonus is added without being named",
    from: '  dc += push(parts, "Song & Dance", Math.max(0, int(songAndDance)));',
    to: "  dc += Math.max(0, int(songAndDance));",
    breaks: "H13/H15 (casting-dc) — dc === base + sum(parts) is what stops a silent contributor"
  },
  {
    file: D,
    name: "N9 a fixed DC collects the Bard's bonus",
    from: "  if (fixed > 0) return { dc: fixed, parts: [], base: fixed, fixed: true };",
    to: "  if (fixed > 0) return { dc: fixed + Math.max(0, int(songAndDance)), parts: [], base: fixed, fixed: true };",
    breaks: "H20 (casting-dc) — a potion's DC is not the drinker's spellcasting"
  },

  /* ── P: what the actor publishes ───────────────────────────────── */
  {
    file: A,
    name: "P1 the second total is resolved from the unfiltered pool",
    from: '        pool: withoutSongAndDance(actor.getBonusPool("system.magic.spellcraft")),',
    to: '        pool: actor.getBonusPool("system.magic.spellcraft"),',
    breaks: "E2 — the same number published twice under two names"
  },
  {
    file: A,
    name: "P2 the second resolution forgets the flat term",
    from: "        extra: spellcraftExtra",
    to: "        extra: 0",
    breaks: "E3/E3b — a Bard's BSB vanishes from every Bardic Performance DC"
  },
  {
    file: A,
    name: "P3 the flat term is retyped instead of hoisted",
    from: "      extra: spellcraftExtra,",
    to: "      extra: Number(system.magic.bsb ?? 0) + Number(system.progression?.bsb ?? 0),",
    breaks: "E3b — two copies of one expression, and one place for a BSB to go missing"
  },
  {
    file: A,
    name: "P4 a non-Bard publishes nothing at all",
    from: "      : resolved.total;",
    to: "      : null;",
    breaks: "E4 — the cast's fallback becomes the thing carrying the rule"
  },

  /* ── S: the fact the design rests on ───────────────────────────── */
  {
    file: R,
    name: "S1 class bonuses quietly become highest-wins",
    from: '  class: { label: "Class", stacking: "stack" },',
    to: '  class: { label: "Class", stacking: "highest" },',
    breaks: "C0 — the pin that makes the day this changes a failing check"
  },

  /* ── B: the offer ──────────────────────────────────────────────── */
  {
    file: C,
    name: "B1 Bardic Performance is offered for any spell at all",
    from: "  if (actor && hasCompositionTrait(spell)) {",
    to: "  if (actor) {",
    breaks: "G2b — \"a spell which has the composition trait\""
  },
  {
    file: B,
    name: "B2 the composition gate answers yes to everything",
    from: '  return /\\bcomposition\\b/i.test(String(spell?.system?.traits ?? ""));',
    to: "  return true;",
    breaks: "G2"
  },
  {
    file: B,
    name: "B3 the substituted roll keeps a class type",
    from: '  return [{ label: "Perform (Bardic Performance)", value: Number(performTotal) || 0, type: "untyped" }];',
    to: '  return [{ label: "Perform (Bardic Performance)", value: Number(performTotal) || 0, type: "class" }];',
    breaks: "G1b — the swapped list must not smuggle the class bonus back in"
  }
];

function runOne(check) {
  try { execFileSync(process.execPath, [check], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}
// SURVIVED MEANS BOTH ARE STILL GREEN.
function run() {
  return runOne(CHECK) && runOne(DC_CHECK);
}

const guard = guardFiles([B, A, C, R, D, CHECK, DC_CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-song-and-dance: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-song-and-dance: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-song-and-dance: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
