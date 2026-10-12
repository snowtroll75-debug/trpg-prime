#!/usr/bin/env node
/**
 * mutate-casting-dc — can verify-casting-dc fail?
 *
 * NEW at 3.386.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST TWO ARE THE SHIPPED STATE. M1 makes a contributor move the
 * DC without appearing in `parts` — the exact condition five modifiers
 * were in until this release, and the one section D exists to make
 * impossible. M2 restores the inline nine-term sum in cast-workflow, so
 * the whole assembly goes back to being reachable by nothing.
 *
 * M3 IS THE ONE A READER WOULD CALL A FIX. Runemage reads "-1 to all
 * casting DCs", so `-1 + (defensive ? 2 : 0)` looks like a bug and
 * `-1` looks like the correction. It is not: the second printed sentence
 * adds 2 to Defensive Casting DCs, and losing it makes defensive casting
 * cheaper for a Runemage than for anybody else.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "magic", "casting-dc.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-casting-dc.mjs");

const MUTATIONS = [
  {
    // A CONTRIBUTOR THAT MOVES THE NUMBER IN SILENCE. `push` is what
    // couples "changes the DC" to "appears on the card"; bypassing it for
    // one contributor is precisely the state Eloquence was in.
    name: "THE SILENT MODIFIER: Eloquence moves the DC without joining parts",
    file: RULE,
    from: '  if (eloquence) dc += push(parts, "Eloquence", -1);',
    to: "  if (eloquence) dc += -1;",
    breaks: "D1 — dc no longer equals base + sum(parts), on 128 of 256 rows"
  },
  {
    name: "THE OLD SHAPE: cast-workflow adds the nine terms inline again",
    file: CAST,
    from: "  const dc = castingDCResult.dc;",
    to: "  const dc = castingDCResult.dc + 0 * (runemage ? 1 : 0);\n"
      + "  // + runemageDC + favouredTerrain + mm.dcDelta + eloquence + wizardSchoolCasting",
    breaks: "G2 — the inline sum is back and no harness can reach it"
  },
  {
    name: "THE PLAUSIBLE FIX: Runemage becomes a flat -1",
    file: RULE,
    from: '    dc += push(parts, defensive ? "Runemage, defensive" : "Runemage", -1 + (defensive ? 2 : 0));',
    to: '    dc += push(parts, defensive ? "Runemage, defensive" : "Runemage", -1);',
    breaks: "C2/C3 — defensive casting becomes cheaper for a Runemage than for anyone"
  },
  {
    name: "the Runemage label stops tracking what it did",
    file: RULE,
    from: '    dc += push(parts, defensive ? "Runemage, defensive" : "Runemage", -1 + (defensive ? 2 : 0));',
    to: '    dc += push(parts, "Runemage", -1 + (defensive ? 2 : 0));',
    breaks: "C4 — the card reads 'Runemage' beside a number that went up"
  },
  {
    // THE 3.386.0 COSMETIC FAULT, seen on a live card: a label with its
    // own brackets renders as "(Runemage (defensive) +1)".
    name: "a label grows brackets of its own again",
    file: RULE,
    from: '    dc += push(parts, defensive ? "Runemage, defensive" : "Runemage", -1 + (defensive ? 2 : 0));',
    to: '    dc += push(parts, defensive ? "Runemage (defensive)" : "Runemage", -1 + (defensive ? 2 : 0));',
    breaks: "C4b — nested brackets in the subtitle"
  },
  {
    name: "THE SAVE DC GOES SILENT: Runemage's +1 skips parts",
    file: RULE,
    from: '  if (runemage) dc += push(parts, "Runemage", 1);',
    to: "  if (runemage) dc += 1;",
    breaks: "H13 — the save DC moves with nothing on the card to explain it"
  },
  {
    name: "the Wizard School's save bonus is dropped",
    file: RULE,
    // 3.627.0: the declared-bonus loop now sits between the two lines.
    from: '  dc += push(parts, "Wizard School", int(wizardSchoolDelta));\n  for (const bonus of Array.isArray(declaredBonuses)',
    to: "  void wizardSchoolDelta;\n  for (const bonus of Array.isArray(declaredBonuses)",
    breaks: "H5/H6 — a school's spells stop being harder to resist"
  },
  {
    // A FIXED DC IS BORROWED FROM SOMEWHERE ELSE. Adding a Wizard's
    // school bonus to a number that was never derived from a Wizard is
    // the defect the early return exists to prevent.
    name: "a fixed save DC starts accumulating modifiers",
    file: RULE,
    from: "  if (fixed > 0) return { dc: fixed, parts: [], base: fixed, fixed: true };",
    to: "  if (fixed > 0 && false) return { dc: fixed, parts: [], base: fixed, fixed: true };",
    breaks: "H7/H8 — the Wyrm's breath weapon picks up its breather's feats"
  },
  {
    name: "Heighten Spell becomes a replacement rather than a maximum",
    file: RULE,
    from: "  return Math.max(spent, Math.max(0, int(cap)));",
    to: "  return Math.max(0, int(cap));",
    breaks: "I3 — an overcast spell is dragged back down to the cap"
  },
  {
    name: "THE SAVE LINE GOES BACK TO ONE HAND-PICKED CLAUSE",
    file: CAST,
    from: "${describeParts(saveDCResult.parts)}.`",
    to: "${!fixed && clMods.saveDC ? ` (includes +${clMods.saveDC} caster-level warp)` : \"\"}.`",
    breaks: "G7/G7b — four of five contributors silent again"
  },
  {
    name: "the card stops saying Heighten moved the base",
    file: CAST,
    from: "${!fixed && !isInnate && savePP !== totalPP ? ` (Heighten Spell — as ${savePP} PP)` : \"\"}",
    to: "",
    breaks: "G8b — a DC built from a PP the spell never cost, unexplained"
  },
  {
    // A CANTRIP HAS NO PP. If the base branch is dropped, a cantrip's DC
    // starts scaling with a PP total it never had.
    name: "a cantrip starts paying the PP-based casting DC",
    file: RULE,
    from: "  const base = isCantrip ? CANTRIP_PENALISED_DC : castingDC(pp);",
    to: "  const base = castingDC(pp);",
    breaks: "A2/A3 — a warped cantrip gets a DC it should never have"
  },
  {
    name: "a cantrip becomes overcastable",
    file: RULE,
    from: '  if (!isCantrip) dc += push(parts, "Overcast", overcastDCIncrease(pp, int(casterLevel)));',
    to: '  dc += push(parts, "Overcast", overcastDCIncrease(pp, int(casterLevel)));',
    breaks: "A4/A5 — a 0 PP spell is reported as exceeding a limit"
  },
  {
    // ARMOUR CAN ONLY MAKE CASTING HARDER. A negative penalty becoming a
    // discount is the "a waiver is a discount, never a rebate" shape.
    name: "a negative armour penalty becomes a bonus",
    file: RULE,
    from: '  dc += push(parts, "Prohibited armour", Math.max(0, int(armourPenalty)));',
    to: '  dc += push(parts, "Prohibited armour", int(armourPenalty));',
    breaks: "B9 — rubbish input hands out an easier spell"
  },
  {
    name: "Defensive Casting stops costing 5",
    file: RULE,
    from: '  if (defensive) dc += push(parts, "Defensive Casting", 5);',
    to: '  if (defensive) dc += push(parts, "Defensive Casting", 2);',
    breaks: "B2/C3 — the most-used casting choice in the game is mispriced"
  },
  {
    // ANCHORED ON THE LINE THAT FOLLOWS IT. Both assemblies now push a
    // "Wizard School" part, so the line alone matches twice — and an
    // ambiguous anchor is reported as a failure here rather than silently
    // mutating whichever came first. (3.578.0: the casting assembly's next
    // line is now the Reagent part, not the return.)
    name: "the Wizard School CASTING reduction is dropped",
    file: RULE,
    from: '  dc += push(parts, "Wizard School", int(wizardSchoolDelta));\n  dc += push(parts, "Reagent", int(reagentDelta));',
    to: '  void wizardSchoolDelta;\n  dc += push(parts, "Reagent", int(reagentDelta));',
    breaks: "B5/B8 — a Wizard's own school stops being easier to cast"
  },
  {
    // ZERO IS NOT A PART. Printing "(Metamagic +0)" trains a reader to
    // skim the one list that matters.
    name: "zero-valued contributors start being printed",
    file: RULE,
    from: "  if (Number.isFinite(value) && value !== 0) parts.push({ label, value });",
    to: "  if (Number.isFinite(value)) parts.push({ label, value });",
    breaks: "D3/D4 — the breakdown fills with modifiers that did nothing"
  },
  {
    name: "describeParts drops the sign on a positive contributor",
    file: RULE,
    from: '    .map((p) => ` (${p.label} ${p.value > 0 ? "+" : ""}${p.value})`)',
    to: "    .map((p) => ` (${p.label} ${p.value})`)",
    breaks: "E1 — a penalty and a bonus read identically"
  },
  {
    name: "THE SUBTITLE GOES BACK TO A HAND-WRITTEN LIST",
    file: CAST,
    from: "      describeParts(castingDCResult.parts) +",
    to: '      (armourPenalty ? ` (prohibited armour +${armourPenalty})` : "") +',
    breaks: "G3/G4 — two places describing one number, which is how they drifted"
  },
  {
    name: "the spell attack total stops going through its assembly",
    file: CAST,
    from: "  const total = attackTotal.total;",
    to: "  const total = Number(check.outcome?.total ?? 0) + attackWarp + aggressiveMagic + specialistUplift;",
    breaks: "G5 — attackWarp is silent again"
  },
  {
    name: "the specialist uplift stops reaching the attack",
    file: RULE,
    from: '  total += push(parts, "Specialist spell", int(specialistUplift));',
    to: "  void specialistUplift;",
    breaks: "F4/F5/F6 — half of one printed sentence stops being honoured, again"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RULE, CAST, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-casting-dc: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-casting-dc: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-casting-dc: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
