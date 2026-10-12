#!/usr/bin/env node
/**
 * mutate-cast-result-line — can verify-cast-result-line fail?
 * NEW at 3.481.0.
 *
 * H1 IS THE SHIPPED DEFECT, restored exactly: the refund check moved
 * below the others, so a refunded cast reads "The spell takes effect.
 * 10 PP spent" again.
 *
 * W3 IS THE ONE THAT LOOKS LIKE A FIX AND IS NOT. Appending the
 * correction instead of rewriting leaves the false headline standing
 * three rows above it — which is precisely what 3.480.0 did, and it
 * would pass any check that only asked whether the corrected sentence
 * appears on the card.
 *
 * W6 IS ORDER, NOT PRESENCE. Building the auto-hit note before counting
 * the caught leaves the promise on an empty card while every string in
 * the file stays exactly where it was.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "cast-result-line.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const S = path.join(SYSTEM_ROOT, "module", "magic", "missile-storm-workflow.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-cast-result-line.mjs");

const MUTATIONS = [
  {
    file: R,
    name: "H1 THE SHIPPED DEFECT: a refunded cast claims to take effect",
    from: '  if (refunded) {\n    return "<strong>The spell is called off.</strong> Nothing was spent.";\n  }',
    to: "",
    breaks: "H1 — \"The spell takes effect. 10 PP spent\" above its own refund"
  },
  {
    file: R,
    name: "H2 the refund is tested AFTER the failed-check branch",
    from: "  if (refunded) {",
    to: "  if (refunded && cast) {",
    breaks: "H2 — a refunded failure would still claim PP was lost"
  },
  {
    file: R,
    name: "H1b the refunded headline still names the PP",
    from: '    return "<strong>The spell is called off.</strong> Nothing was spent.";',
    to: '    return `<strong>The spell is called off.</strong> ${ppSpent} PP spent.`;',
    breaks: "H1b — the refunded card would claim a spend that was returned"
  },
  {
    file: R,
    name: "A1 the auto-hit note applies with nobody hit",
    from: "  return (Number(targetCount) || 0) > 0;",
    to: "  return true;",
    breaks: "A1 — \"the missiles simply land\" on a card that hit nobody"
  },
  {
    file: R,
    name: "N1 the internal kind is printed to the player again",
    from: '  const named = text(effect?.label) || text(spellName) || "The spell";',
    to: '  const named = text(effect?.kind) || text(spellName) || "The spell";',
    breaks: "N1 — \"missileStorm finds nobody\" is an identifier on a card"
  },
  {
    file: R,
    name: "N2 the row's own label is ignored in favour of the spell",
    from: "  const named = text(effect?.label) || text(spellName)",
    to: "  const named = text(spellName) || text(effect?.label)",
    breaks: "N2 — the author's name for the thing is discarded"
  },
  {
    file: R,
    name: "N5 the diagnostic is silenced rather than reworded",
    from: "  return `<em>${named} finds nobody to affect.</em>`;",
    to: '  return "";',
    breaks: "N5 — a spell that affected nobody would say nothing at all"
  },
  {
    file: C,
    name: "W2 the refund asks for a headline that is not refunded",
    from: "castResultHeadline({ ...headlineFacts, refunded: true })",
    to: "castResultHeadline({ ...headlineFacts })",
    breaks: "W2 — the correction would repeat the original sentence"
  },
  {
    file: C,
    name: "W3 THE CORRECTION IS APPENDED INSTEAD OF REWRITTEN",
    from: "            if (lines[headlineIndex] === headlineHtml) {\n              lines[headlineIndex] = corrected;\n              headlineHtml = corrected;\n            } else {\n              lines.push(corrected);\n            }",
    to: "            lines.push(corrected);",
    breaks: "W3 — the false headline stays, exactly as 3.480.0 shipped"
  },
  {
    file: C,
    name: "W4 the rewrite stops verifying its target",
    from: "            if (lines[headlineIndex] === headlineHtml) {",
    to: "            if (true) {",
    breaks: "W4 — a drifted index would overwrite another sentence"
  },
  {
    file: S,
    name: "W5 the storm prints its promise unconditionally",
    from: "  if (automaticHitNoteApplies(caught.length)) lines.push(stormAutomaticLine(spec));",
    to: "  lines.push(stormAutomaticLine(spec));",
    breaks: "W5 — the note returns to every card, hit or not"
  },
  {
    file: S,
    name: "W6 ORDER: the note is built before anything is counted",
    from: "  const lines = [];\n  if (!caught.length) {",
    to: "  const lines = [stormAutomaticLine(spec)];\n  if (!caught.length) {",
    breaks: "W6 — the promise reappears on an empty card, every string intact"
  },
  {
    file: E,
    name: "K1 a missed attack prints \"finds nobody\" under its own miss",
    // RE-ANCHORED 3.614.0: an attack-gated row is excused too (F1 of the 3.613.0 drive).
    from: "      if (!isDegreeGated(effect) && !isAttackGated(effect) && !reportsItsOwnAbsence(effect)) {",
    to: "      if (!isDegreeGated(effect) && !isAttackGated(effect)) {",
    breaks: "W7b — the shipped 3.483.0 noise on every miss"
  },
  {
    file: R,
    name: "K3 the diagnostic is silenced for every kind, not just the five",
    // RE-ANCHORED 3.609.0: the list gained a comment and two kinds after "zone".
    from: '"hazard", "saveLadder", "difficultTerrain", "zone",\n',
    to: '"hazard", "saveLadder", "difficultTerrain", "zone", "condition", "bonus",\n',
    breaks: "K3/K4 — narrowing it must not become removing it"
  },
  {
    file: E,
    name: "W7 the developer text is restored on player cards",
    from: "        lines.push(line(effectNoTargetLine(effect, spell?.name)));",
    to: "        lines.push(line(`<em>${effect.kind} effect — no target to apply to.</em>`));",
    breaks: "W7 — \"hazard effect — no target to apply to\" returns"
  }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
guardFiles(files);

const survivors = [];
let applied = 0;
const verifyPasses = () => {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
};

if (!verifyPasses()) {
  console.error("mutate-cast-result-line: the verifier does not pass BEFORE any mutation");
  process.exit(1);
}

try {
  for (const m of MUTATIONS) {
    const source = originals.get(m.file);
    if (!source.includes(m.from)) {
      console.error(`mutate-cast-result-line: anchor missing for "${m.name}"`);
      process.exit(1);
    }
    if (m.from === m.to) {
      console.error(`mutate-cast-result-line: "${m.name}" changes nothing`);
      process.exit(1);
    }
    applied += 1;
    fs.writeFileSync(m.file, source.replace(m.from, m.to));
    if (verifyPasses()) survivors.push(`${m.name} (should break ${m.breaks})`);
    fs.writeFileSync(m.file, source);
  }
} finally {
  for (const [f, s] of originals) fs.writeFileSync(f, s);
}

if (survivors.length) {
  console.error(`mutate-cast-result-line: ${survivors.length} of ${applied} mutations SURVIVED`);
  for (const s of survivors) console.error(`  ✗ ${s}`);
  process.exit(1);
}
console.log(`mutate-cast-result-line: all ${applied} mutations were caught`);
