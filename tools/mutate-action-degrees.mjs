#!/usr/bin/env node
/**
 * mutate-action-degrees — can verify-action-degrees fail?
 *
 * NEW at 3.506.0.
 *
 * G2 IS THE ONE THAT MATTERS MOST. A gate that fails open turns "a check
 * only in an encounter" back into "always a check", which is the state
 * this release exists to leave — and it would look perfectly normal on
 * every card, because rolling DC 20 to get on a horse in a quiet village
 * is only wrong if you know the rule.
 *
 * D1 IS THE SILENT ONE. Self Mirage on the wrong side of the roll is a
 * spell that applies, prints, and protects nobody — which is exactly how
 * it shipped in 3.504.0.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const DEG = path.join(SYSTEM_ROOT, "module", "combat", "action-degrees.mjs");
const DDC = path.join(SYSTEM_ROOT, "module", "combat", "defence-dc.mjs");
const TPL = path.join(SYSTEM_ROOT, "templates", "chat", "check-card.hbs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-action-degrees.mjs");

const MUTATIONS = [
  /* ── G: the encounter gate ─────────────────────────────────────── */
  {
    file: DEG,
    name: "G1 THE GATE FAILS OPEN — every action rolls out of combat again",
    from: "  const inEncounter = state?.inEncounter === true;\n  return inEncounter;",
    to: "  return true;",
    breaks: "G2 — Mount/Dismount would roll DC 20 in a quiet village"
  },
  {
    file: DEG,
    name: "G2 THE GATE FAILS SHUT — 96 actions stop being checks",
    from: "  if (!action?.checkInEncounterOnly) return true;",
    to: "  if (false) return true;",
    breaks: "G3 — every declared action would be gated, not just the one"
  },
  {
    file: DEG,
    name: "G3 a missing encounter flag is read as an encounter",
    from: "  const inEncounter = state?.inEncounter === true;",
    to: "  const inEncounter = state?.inEncounter !== false;",
    breaks: "G2b — the default must be the safe one"
  },
  {
    file: DEG,
    name: "G4 the card stops saying why there was nothing to roll",
    from: "  if (!action?.checkInEncounterOnly) return null;",
    to: "  if (true) return null;",
    breaks: "G4 — a card with no roll on it and no explanation reads as a broken button"
  },

  {
    file: DEG,
    name: "G5 THE AUTOMATIC-SUCCESS CARD OFFERS ITS FAILURE LINE AGAIN",
    from: "  if (!action?.checkInEncounterOnly) return rows;\n  return rows.filter((entry) => entry?.key === \"success\");",
    to: "  return rows;",
    breaks: "G6 — a Failure line printed under 'succeeds automatically', which is how it shipped"
  },
  {
    file: DEG,
    name: "G6 every no-check card is cut down to its success line",
    from: "  if (!action?.checkInEncounterOnly) return rows;",
    to: "  if (false) return rows;",
    breaks: "G6b — 21 actions list their degrees on purpose"
  },

  /*
   * ── B: THE TWO DEGREES — SECTION RETIRED AT 3.510.0 ──────────────
   *
   * Its four mutations all aimed at `collapsedDegree`, which no longer
   * exists. Graham's "please follow the rulebook" on Kip Up made the
   * general rule do that job: Mount prints Success and Failure, so
   * `declaredDegree` already answers `success` for the three better
   * degrees and `failure` for the four worse ones — verified across all
   * seven before the function was deleted.
   *
   * The behaviour those mutations protected is protected by section A
   * now, and `verify-action-degrees` B1-B5 assert the same mapping
   * through the surviving rule. Nothing was weakened; one of two rules
   * that agreed was removed, because two rules that agree can one day
   * disagree.
   */

  /* ── A: the banner ─────────────────────────────────────────────── */
  {
    file: DEG,
    name: "A1 THE BANNER SHOWS A RESULT THE ACTION DOES NOT HAVE",
    from: "  const found = chain.find((step) => listed.has(step));",
    to: "  const found = listed.has(key) ? key : undefined;",
    breaks: "A4 — the ladder stops walking: a degree the action does not declare is shown as "
      + "itself again, which is Mount's \"Heroic\" card and 102 others"
  },
  /*
   * A2 WAS WRITTEN AND DELETED, along with the guard it aimed at.
   *
   * It neutered a `listed.has(key)` fast path and SURVIVED — because a
   * declared degree is already its own nearest neighbour at distance
   * zero, so the guard changed no answer anywhere. A guard that can be
   * removed without moving a single result is a dead guard, and the
   * repair was to delete it rather than to write a check that could not
   * have caught it either. The fourth this project has removed.
   */
  {
    // THE WORST VERSION OF THIS RULE. A fumble shown as a Success is a
    // card the table would act on.
    file: DEG,
    name: "A3 THE BANNER CROSSES THE SUCCESS/FAILURE LINE",
    from: "  return found ?? chain[chain.length - 1];",
    to: "  return found ?? \"success\";",
    breaks: "A5 — every undeclared failure lands on success. The old rule filtered by side; "
      + "the ladder guarantees it by construction, so this is what proves it still holds"
  },
  {
    file: DEG,
    name: "A4 the nearest declared degree stops being the nearest",
    from: "  partial: Object.freeze([\"partial\", \"failure\"]),",
    to: "  partial: Object.freeze([\"partial\", \"fumble\", \"failure\"]),",
    breaks: "A4c — a Partial would fall to a declared Fumble one rank away, which is exactly "
      + "what the distance rule did to nineteen actions"
  },
  {
    file: DEG,
    name: "A5 a tie is broken toward the harsher degree",
    from: "  blunder: Object.freeze([\"blunder\", \"fumble\", \"failure\"])",
    to: "  blunder: Object.freeze([\"blunder\", \"fumble\", \"partial\", \"failure\"])",
    breaks: "A4c2 — a Blunder would be announced as a Partial, the worst result in the game "
      + "shown as the mildest"
  },
  {
    // RE-AIMED at the guard that survived the cull. Its predecessor,
    // `if (!declared.length) return key`, was the SECOND dead guard in
    // this one function: with nothing declared there is nothing on either
    // side of the line, so this line was already returning the key.
    file: DEG,
    name: "A6 an action declaring nothing has its banner cut down",
    from: "  if (!listed.size) return key;",
    to: "  if (false) return key;",
    breaks: "A6 — every check rolled outside the action workflow carries no list, and an empty "
      + "list means \"not asked\" rather than \"declares none of them\""
  },

  {
    file: DEG,
    name: "A11 THE FAILURE CARD GOES BACK TO OFFERING THE SUCCESS LINES",
    from: '    return { line: "The action fails and nothing happens.", showList: false };',
    to: '    return { line: "The action lists no failure outcome:", showList: true };',
    breaks: "A4e/A4e2 — THIS IS WHAT 3.545.0 SHIPPED. A failed Treat Wounds printed "
      + "\"Critical: regains 20 / Success: regains 10 / Partial: regains 5\" beneath a "
      + "banner reading Failure, and the table would have healed on a failed check"
  },
  {
    file: DEG,
    name: "A11b A SUCCESS WITH NO TEXT RECITES THE FAILURE LINES",
    from: '    return { line: "The action succeeds.", showList: false };',
    to: '    return { line: "The action succeeds:", showList: true };',
    breaks: "A4e3 — the same defect mirrored: Disguise and Conceal an Object would list "
      + "their failure text at a player who passed"
  },
  {
    file: DEG,
    name: "A11c AN ACTION DECLARING NOTHING GETS A LINE ANYWAY",
    from: "  if (!Array.isArray(listed) || !listed.length) return { line: null, showList: false };",
    to: "  if (false) return { line: null, showList: false };",
    breaks: "A4e4 — those actions fall through to their description; a bare \"nothing "
      + "happens\" would replace text that says more"
  },

  {
    // THE DEFECT THE LIVE TEST FOUND ON THE BANNER RELEASE ITSELF.
    file: DEG,
    name: "A8 THE BANNER LOSES ITS WORD AND KEEPS ONLY THE COLOUR",
    from: "  return { key: key ?? null, label: found?.label ?? \"\" };",
    to: "  return { key: key ?? null, label: \"\" };",
    breaks: "A8 — the card was coloured Success and read \"Heroic\""
  },
  {
    file: DEG,
    name: "A9 the label is taken from the achieved degree, not the banner's",
    from: "  const found = table.find((d) => d.key === key);",
    to: "  const found = table.find((d) => d.key === String(degree ?? \"\"));",
    breaks: "A8 — exactly the wiring that shipped: right colour, wrong word"
  },
  {
    file: TPL,
    name: "A10 THE TEMPLATE GOES BACK TO THE RAW DEGREE'S LABEL",
    from: "<span class=\"degree-label\">{{degreeLabel}}</span>",
    to: "<span class=\"degree-label\">{{outcome.degree.label}}</span>",
    breaks: "A9/A9b — the binding that printed \"Heroic\" over a Success"
  },

  /* ── D: the DC side ────────────────────────────────────────────── */
  {
    file: DDC,
    name: "D1 A SKILL DC STOPS BEING DEFENDABLE — Self Mirage goes inert again",
    from: "  return DEFENCE_DC_KEYS.includes(key) || SKILL_DC.test(key);",
    to: "  return DEFENCE_DC_KEYS.includes(key);",
    breaks: "D6/D7 — the row would normalise to null and protect nobody"
  },
  {
    file: DDC,
    name: "D2 ANY STRING BECOMES A DEFENDABLE DC",
    from: "  return DEFENCE_DC_KEYS.includes(key) || SKILL_DC.test(key);",
    to: "  return true;",
    breaks: "D7c — a typo would become a DC bonus against nothing, silently"
  },
  {
    file: DDC,
    name: "D3 the skill-DC shape stops being checked",
    from: "const SKILL_DC = /^skillDC:[A-Za-z][A-Za-z0-9]*$/;",
    to: "const SKILL_DC = /^skillDC:/;",
    breaks: "D7c — \"skillDC:\" names no skill and would be accepted"
  },
  {
    file: DDC,
    name: "D4 THE NORMALISER STOPS CHECKING THE DC KEY",
    // Re-anchored at 3.665.0, which let a disadvantage row name "any".
    from: "  if (!(isDefendableDC(dc) || (disadvantage && dc === \"any\"))) return null;",
    to: "  if (false) return null;",
    breaks: "N3b — a typo becomes a DC bonus against nothing, silently"
  },
  {
    // THE MUTATION THAT SURVIVED THE FIRST TIME. It was aimed at three
    // `if`s inside `spell-effects.mjs`, and the check covering them
    // grepped the source for their error text — which the mutation left
    // untouched. The guard moved into a pure function so it can be run.
    file: DDC,
    name: "D5 A DC BONUS THAT NAMES NOTHING IS WRITTEN ANYWAY",
    from: "  if (!actions.length) {\n    return { row: null, error: `${spellName} raises a DC without naming what against — nothing applied.` };\n  }",
    to: "  ;",
    breaks: "N4/N4b — a DC raised against every action resolved against that skill"
  },
  {
    file: DDC,
    name: "D6 an unknown DC is accepted by the row builder",
    from: "  if (!isDefendableDC(dc)) {\n    return { row: null, error: `${spellName} names an unknown defended DC \"${dc}\".` };\n  }",
    to: "  ;",
    breaks: "N4c/N4d — a typo would be filed as a real defence"
  },
  {
    file: DDC,
    name: "D7 the warp stops raising the DC bonus",
    from: "    value: Math.trunc(Number(effect?.value ?? 0)) + Math.trunc(Number(extra) || 0),",
    to: "    value: Math.trunc(Number(effect?.value ?? 0)),",
    breaks: "N4g — a warp paid for and not applied, the shape this system keeps finding"
  },
  /*
   * D8 WAS WRITTEN AND RETIRED IN THE SAME HOUR, and the reason is worth
   * more than the mutation was.
   *
   * It neutered the applier's `if (built.error)` branch, and survived —
   * `verify-action-degrees` runs pure functions and cannot reach glue
   * inside `spell-effects.mjs`. The obvious repair was a check that
   * greps the source for that branch, and that is precisely the
   * assertion D5 exists because I had to delete: a guard whose only
   * witness is a grep for its own text cannot be caught being neutered.
   *
   * So it is not replaced by a weaker check. It is retired, because the
   * branch is NOT silently neuterable: with the guard gone, `built.row`
   * is null and the next line reads `dcRow.dc`, which throws. The defect
   * that mutation describes cannot ship quietly — it fails loudly on the
   * first cast, which is what a guard is for.
   *
   * If that line ever stops dereferencing the row, this needs writing
   * again in a form that can be run.
   */
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([DEG, DDC, TPL, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-action-degrees: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-action-degrees: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-action-degrees: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
