#!/usr/bin/env node
/**
 * mutate-warped-duration — can verify-warped-duration fail?
 *
 * NEW at 3.521.0.
 *
 * D1 IS THE ONE THIS FILE EXISTS FOR, and it is the defect itself put
 * back. Stop carrying a printed (D) forward and twenty warps go back to
 * taking it away — a caster pays PP for a longer duration and silently
 * loses the ability to end it early. Nothing errors, the card prints the
 * longer duration, and the Dismiss button is simply not there.
 *
 * D3 IS ITS MIRROR, and the reason the rule is a test rather than an
 * append: make it unconditional and every warped duration becomes
 * dismissible, including Tongues, which the book never says may be
 * dismissed. A rule that only ever adds is not a rule.
 *
 * L3 IS THE QUIET ONE. Stop reading "permanent" as a lock and three
 * warps release PP that the shorter, unwarped duration was holding —
 * the longer the spell lasts, the sooner the caster gets their points
 * back.
 *
 * WHAT THIS FILE DOES NOT COVER: the six call sites in
 * `cast-workflow.mjs`, `spell-effects.mjs` and `wildshape-riders.mjs`
 * that now all route through `warpedDurationText`. That they call it at
 * all is workflow wiring no check here runs — covered by live testing.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const A = path.join(SYSTEM_ROOT, "module", "magic", "active-spells.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-warped-duration.mjs");

const MUTATIONS = [
  /* ── D: the dismissal marker ───────────────────────────────────── */
  {
    file: A,
    name: "D1 THE DEFECT ITSELF — a warp takes the (D) away again",
    from: "  if (isDismissibleDuration(base) && !isDismissibleDuration(override)) {\n    return `${override} (D)`;\n  }",
    to: "",
    breaks: "D1/D8/E1 — twenty warps go back to costing the caster their Dismiss button"
  },
  {
    file: A,
    name: "D3 EVERY WARPED DURATION BECOMES DISMISSIBLE",
    from: "  if (isDismissibleDuration(base) && !isDismissibleDuration(override)) {",
    to: "  if (!isDismissibleDuration(override)) {",
    breaks: "D3 — Tongues would gain a Dismiss the book never gave it"
  },
  {
    file: A,
    name: "D2 THE MARKER IS APPENDED TWICE WHEN THE WARP ALREADY SAYS IT",
    from: "  if (isDismissibleDuration(base) && !isDismissibleDuration(override)) {",
    to: "  if (isDismissibleDuration(base)) {",
    breaks: "D2 — \"10 minutes (D) (D)\""
  },
  {
    file: A,
    name: "D5 A BLANK OVERRIDE ERASES THE PRINTED DURATION",
    from: "  if (!override) return base;",
    to: "  if (false) return base;",
    breaks: "D5 — a spell warped in some other way would lose its duration entirely"
  },
  {
    file: A,
    name: "D4 THE WARP IS IGNORED AND THE PRINTED DURATION STANDS",
    from: "  const override = String(warpMods?.durationText ?? \"\").trim();",
    to: "  const override = \"\";",
    breaks: "D1/N — all eighty-one duration warps would buy nothing, which is where this channel started"
  },

  /* ── L: the PP lock ────────────────────────────────────────────── */
  {
    file: A,
    name: "L3 PERMANENT STOPS LOCKING ANYTHING",
    from: "  if (/unlimited|permanent/.test(t)) return \"unlimited\";",
    to: "  if (/unlimited/.test(t)) return \"unlimited\";",
    breaks: "L3/L6/E3 — the defect this release fixed, put back"
  },
  {
    file: A,
    name: "L1 DAILY PREPARATIONS STOP LOCKING",
    from: "  if (/daily prep/.test(t)) return \"dailyPrep\";",
    to: "  if (false) return \"dailyPrep\";",
    breaks: "L1/L6 — nine spells and five warps would hold no PP and never be released"
  },
  {
    file: A,
    name: "L2 THE TWO LOCKS ARE SWAPPED",
    from: "  if (/daily prep/.test(t)) return \"dailyPrep\";",
    to: "  if (/daily prep/.test(t)) return \"unlimited\";",
    breaks: "L1 — a daily-prep spell would never be released, because the sweep looks for the other word"
  },

  /* ── I: reading the marker at all ──────────────────────────────── */
  {
    file: A,
    name: "I1 THE (D) IS MATCHED CASE-SENSITIVELY",
    from: "  return /\\(\\s*D\\s*\\)/i.test(String(duration ?? \"\"));",
    to: "  return /\\(\\s*D\\s*\\)/.test(String(duration ?? \"\"));",
    breaks: "D7 — a pack entry written \"(d)\" would stop being dismissible"
  }
,
  {
    file: V,
    name: "C-POP THE DURATION PATTERN NARROWS BACK TO WHAT IT MATCHED BEFORE",
    from: "const RE = /duration (becomes|is|increases|changes)|increase (the )?duration|has a duration of|lasts (for )?\\d|until the next time you make your daily|until next daily/i;",
    to: "const RE = /duration (becomes|is|increases)|increase the duration|lasts (for )?\\d|until the next time you make your daily/i;",
    breaks: "C1/C2b — this is the pattern exactly as it stood before 3.537.0, and under it C2 "
      + "reported \"none is left inert\" while four inert duration warps sat outside it and "
      + "nineteen live ones went uncounted"
  },
  {
    file: A,
    name: "S1 THE FLAG STOPS ENDING THE SUSTAINING",
    from: "  return !warpMods?.endsSustain;",
    to: "  return true;",
    breaks: "S3 — every warped duration goes back to printing \"Sustained — Sustain it each "
      + "turn\" underneath \"the duration changes to 1 hour\", which is the contradiction "
      + "found live at 3.537.0"
  },
  {
    file: A,
    name: "S1b THE FLAG ENDS SUSTAINING ON A SPELL THAT NEVER HAD IT",
    from: "  if (!sustained) return false;",
    to: "  if (!sustained) return Boolean(warpMods?.endsSustain);",
    breaks: "S3c — a spell that was never sustained would come back sustained-then-ended, "
      + "and the registry would record a state the spell never had"
  },
  {
    file: V,
    name: "S2-CTRL THE EXCEPTION LIST STOPS BEING CHECKED AGAINST THE TEXT",
    from: 'const saysItKeepsSustaining = (text) => /\\(S\\)|sustain/i.test(String(text ?? ""));',
    to: 'const saysItKeepsSustaining = () => true;',
    breaks: "S2b — the two spells that keep sustaining would be an assertion in this file "
      + "with nothing in the printed text backing it, which is how a pinned list becomes a "
      + "private opinion"
  },
  {
    file: C,
    name: "S4 THE REGISTRATION PREDICATE IS GIVEN THE WARPED ANSWER",
    from: "    sustained: spellData.sustained,",
    to: "    sustained: sustainAfterWarp(spellData.sustained, warpMods),",
    breaks: "S4b — this is the 3.538.0 defect exactly as it shipped: Circle Of Warmth warped "
      + "to an hour fails all four of castWillRegister's conditions at once, registers "
      + "nothing, and leaves an aura on an ally that nothing in the game can ever end"
  },
  {
    file: C,
    name: "S4c THE ENTRY'S OWN FIELD GOES BACK TO THE PRINTED FLAG",
    from: "        sustained: warpedSustained,",
    to: "        sustained: Boolean(spellData.sustained),",
    breaks: "S4c — the banner would vanish while the Spellcasting panel still listed the "
      + "spell as sustained, which is the half-fix that is worse than the contradiction"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([A, C, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-warped-duration: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-warped-duration: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-warped-duration: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
