#!/usr/bin/env node
/**
 * mutate-target-count — can verify-target-count fail?
 *
 * NEW at 3.498.0.
 *
 * T2 IS THE ONE THAT WOULD BE FOUND AT A TABLE AS AN ABSURDITY: without
 * the size-unit test, "object weighing up to 30 lbs" parses as thirty
 * targets and one Open/close reaches thirty creatures.
 *
 * G2 IS THE ONE THAT WOULD BE FOUND AS A GRIEVANCE. The warp chooser
 * runs AFTER the picker, so a gate placed above it refuses a selection
 * the caster was one dialog away from paying to make legal.
 *
 * N5 IS THE QUIET ONE. "One more than no limit" is not a number, and a
 * warp that capped an uncapped spell would turn an unparsed line into a
 * restriction the book never printed.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "target-count.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const WARP = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-target-count.mjs");

const MUTATIONS = [
  /* ── T: the trap ───────────────────────────────────────────────── */
  {
    file: P,
    name: "T1 THE SIZE TRAP OPENS: \"up to 30 lbs\" becomes thirty targets",
    from: "  if (SIZE_UNITS.test(m[2])) return null;\n  return n;\n}\n\n/** A number at the very start of the line, digits or word. */",
    to: "  return n;\n}\n\n/** A number at the very start of the line, digits or word. */",
    breaks: "T2/T3 — one Open/close would reach thirty creatures"
  },
  {
    file: P,
    name: "T2 and on the leading-number path, so a cubic foot is a creature",
    from: "  const n = numberAt(m[1]);\n  if (n === null) return null;\n  if (SIZE_UNITS.test(m[2])) return null;\n  return n;",
    to: "  const n = numberAt(m[1]);\n  if (n === null) return null;\n  return n;",
    breaks: "T3b — Purify measures a volume, not a creature"
  },
  {
    file: P,
    name: "T3 the unit list loses its weights",
    from: "(feet|foot|ft|lbs?|pounds?|inches|inch|miles?|squares?|gallons?|cubic)",
    to: "(feet|foot|ft|inches|inch|miles?|squares?|gallons?|cubic)",
    breaks: "T2 — pounds would count as targets"
  },

  /* ── Y: the you-and ruling ─────────────────────────────────────── */
  {
    file: P,
    name: "Y1 THE CASTER SPENDS ONE OF THEIR OWN PLACES",
    from: "    if (upTo !== null) return { max: upTo + 1, self: true, shape: \"youAndUpTo\" };",
    to: "    if (upTo !== null) return { max: upTo, self: true, shape: \"youAndUpTo\" };",
    breaks: "Y1 — Shadow Walk would carry four companions instead of five"
  },
  {
    file: P,
    name: "Y2 \"you and the triggering ally\" becomes one",
    from: "    if (/^\\s*(the|a|an|one)\\b/i.test(rest)) return { max: 2, self: true, shape: \"youAndOne\" };",
    to: "    if (/^\\s*(the|a|an|one)\\b/i.test(rest)) return { max: 1, self: true, shape: \"youAndOne\" };",
    breaks: "Y3 — the ally would have nowhere to stand"
  },
  {
    file: P,
    name: "Y3 the you-and shape stops being reported",
    from: "    if (upTo !== null) return { max: upTo + 1, self: true, shape: \"youAndUpTo\" };",
    to: "    if (upTo !== null) return { max: upTo + 1, self: false, shape: \"youAndUpTo\" };",
    breaks: "Y5/R5 — the picker could not explain where the extra place came from"
  },

  /* ── N: the honest null ────────────────────────────────────────── */
  {
    file: P,
    name: "N1 \"1 or more\" is capped at one",
    from: "  if (/\\bor more\\b/i.test(text)) return { max: null, self: false, shape: \"orMore\" };",
    to: "",
    breaks: "N1 — Magic Missile would be held to a single missile"
  },
  /*
   * TWO MUTATIONS STOOD HERE and both SURVIVED: they deleted guards for
   * "any number" and "all creatures in range". Neither guard did
   * anything — both lines begin with a word that is not a number, so
   * they already fell through every branch and answered null. The
   * guards are deleted; this comment is what is left of them, because a
   * guard nothing can reach is one no mutation can prove.
   */
  {
    file: P,
    name: "N2 an unreadable line claims to have been read",
    from: "  return { max: null, self: false, shape: \"unparsed\" };",
    to: "  return { max: null, self: false, shape: \"all\" };",
    breaks: "N3b — the shape is the parser's own account of what it managed"
  },
  {
    file: P,
    name: "N4 AN UNPARSED LINE BECOMES ONE TARGET",
    from: "  return { max: null, self: false, shape: \"unparsed\" };",
    to: "  return { max: 1, self: false, shape: \"unparsed\" };",
    breaks: "N4/P3 — a line nobody could read would silently become the tightest cap in the game"
  },
  {
    file: P,
    name: "N5 A WARP CAPS AN UNCAPPED SPELL",
    from: "  if (parsed.max === null) return null;\n  return baseCapAfterWarps(parsed.max, warpMods, casterLevel)",
    to: "  return baseCapAfterWarps(parsed.max ?? 0, warpMods, casterLevel)",
    breaks: "N5 — \"one more than no limit\" is not a number"
  },

  /* ── W: the warp ───────────────────────────────────────────────── */
  {
    file: P,
    name: "W1 THE WARP BUYS NOTHING, as it did for 46 spells before this",
    from: "    + Math.max(0, int(warpMods?.extraTargets));",
    to: "    + 0;",
    breaks: "W2 — the gap this whole release closes, reopened"
  },
  {
    file: WARP,
    name: "W2 the key is dropped from the aggregate",
    // RE-ANCHORED AT 3.499.1. This ended on the closing brace of
    // `emptyWarpMods`, and 3.499.1 added two more keys after it — so the
    // anchor went missing and the mutation stopped running rather than
    // failing loudly. Anchored on the comment above the key instead,
    // which is what names it.
    from: "    extraTargets: 0,",
    to: "    extraTargetsUnused: 0,",
    breaks: "W4 — an undeclared mod is dropped between the chooser and the cast"
  },
  {
    file: WARP,
    name: "W3 the warp stops being an increment",
    from: "    if (m.extraTargets) mods.extraTargets += Number(m.extraTargets) * times;",
    to: "    if (m.extraTargets) mods.extraTargets = Number(m.extraTargets);",
    breaks: "W5 — taking it twice would buy one"
  },

  /* ── R: the refusal and the note ───────────────────────────────── */
  {
    file: P,
    name: "R1 THE CAP REFUSES NOTHING",
    from: "  if (chosen <= cap) return null;",
    to: "  return null; // eslint-disable-line",
    breaks: "R2 — the picker would go back to allowing anything"
  },
  {
    file: P,
    name: "R2 it refuses a legal selection too",
    from: "  if (chosen <= cap) return null;",
    to: "  if (chosen < cap) return null;",
    breaks: "R1 — exactly the printed number would be refused"
  },
  {
    file: P,
    name: "R3 an uncapped spell starts refusing",
    from: "  if (cap === null || cap === undefined) return null;",
    to: "",
    breaks: "R3 — the system as it was, for sixteen spells"
  },
  {
    file: P,
    name: "R4 the note is printed even where the number is obvious",
    from: "  if (!parsed.self && !extra) return null;",
    to: "",
    breaks: "R4 — \"Targets: 1 creature. Up to 1 may be chosen.\""
  },

  /* ── G: where the gate sits ────────────────────────────────────── */
  {
    file: CAST,
    name: "G1 THE GATE IS NEVER REACHED",
    from: "  if (!storingNow && spellNeedsTarget(spellData)) {",
    to: "  if (false) {",
    breaks: "G1 — nothing would enforce any of it"
  },
  {
    file: CAST,
    name: "G2 THE GATE MOVES ABOVE THE WARP THAT RAISES IT",
    from: "    const { dispositionRefusal } = await import(\"./cutting-words-workflow.mjs\");",
    to: "    const capRefusal = overTargetRefusal({\n"
      + "      spellName: spell.name,\n"
      + "      cap: targetCapFor(spellData?.targets, {}),\n"
      + "      chosen: Array.from(game.user?.targets ?? []).length\n"
      + "    });\n"
      + "    if (capRefusal) { ui.notifications.warn(capRefusal); return null; }\n"
      + "    const { dispositionRefusal } = await import(\"./cutting-words-workflow.mjs\");",
    breaks: "G2 — a selection the caster was about to pay to legalise"
  },
  {
    file: CAST,
    name: "G3 the gate reads the printed cap and ignores the warp",
    // RE-ANCHORED 2 Oct 2026 (3.611.0): an AP mode may name its own count.
    from: "      cap: targetCapFor(apMode?.targets ?? spellData?.targets, warp.mods, casterLevel),",
    to: "      cap: targetCapFor(apMode?.targets ?? spellData?.targets, {}, casterLevel),",
    breaks: "W2 — the warp would buy nothing at the one place it matters"
  },
  {
    file: CAST,
    name: "G4 a stored spell is judged on stale targets",
    from: "  if (!storingNow && spellNeedsTarget(spellData)) {",
    to: "  if (spellNeedsTarget(spellData)) {",
    breaks: "G1 — storage picks no targets, so whatever was aimed at last would refuse it"
  },
  {
    // G5 IS A PAIRED ASSERTION at 3.498.0. The negative half alone ("no
    // `disabled: true` in targeting.mjs") was vacuous — more true of an
    // empty file, not less — and verify-checks-read-source named it.
    file: path.join(SYSTEM_ROOT, "module", "combat", "targeting.mjs"),
    name: "G5 THE PICKER STARTS DISABLING BOXES",
    from: "  const ordered = [...candidates].sort(",
    to: "  const disabled = true;\n  void disabled;\n  const ordered = [...candidates].sort(",
    breaks: "G5b — the 27 August ruling, overturned one file over"
  },
  {
    file: CAST,
    name: "G6 the picker stops saying the number",
    from: "        targetCapNote(spellData?.targets, {})",
    to: "        null",
    breaks: "G4 — a caster would meet the cap only as a refusal"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const TARGETING = path.join(SYSTEM_ROOT, "module", "combat", "targeting.mjs");
const guard = guardFiles([P, CAST, WARP, TARGETING, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-target-count: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-target-count: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-target-count: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
