#!/usr/bin/env node
/**
 * mutate-recurring-vocabulary — can verify-recurring-vocabulary fail?
 * NEW at 3.441.1.
 *
 * V1 IS THE ONE THAT MATTERS AND IT IS AIMED AT THE READER. Putting the
 * old word back into one card line must be caught by the sweep, not by
 * somebody happening to look — and the sweep is only worth anything if
 * it can see a template literal, which is what nearly every card line in
 * this system is.
 *
 * P1 IS ITS OPPOSITE: a careless find-and-replace that eats the
 * Persistence COLUMN. 644 rows carry that word and none of them is about
 * this rule. A rename that fixes the vocabulary and destroys the column
 * is worse than the split vocabulary was.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CT = path.join(SYSTEM_ROOT, "module", "data", "critical-tables.mjs");
const FT = path.join(SYSTEM_ROOT, "module", "data", "fumble-tables.mjs");
const RE = path.join(SYSTEM_ROOT, "module", "rune-events.mjs");
const AW = path.join(SYSTEM_ROOT, "module", "alchemical-workflow.mjs");
const BA = path.join(SYSTEM_ROOT, "module", "data", "basic-actions.mjs");
const CV = path.join(SYSTEM_ROOT, "module", "conviction.mjs");
const REG = path.join(SYSTEM_ROOT, "module", "conditions", "registry.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-recurring-vocabulary.mjs");

const MUTATIONS = [
  {
    file: CW,
    name: "V1 the cast card says the old word again",
    // RE-ANCHORED AT 3.585.0. R10 turned this line from an announcement
    // into an application, so the sentence moved; the RULE it pins — the
    // card says "recurring", never the pack field's old name — did not.
    from: "`Plus <strong>Recurring ${next.value} ${damageType}</strong> on ${targetActor.name}`",
    to: "`Plus <strong>Persistent ${next.value} ${damageType}</strong> on ${targetActor.name}`",
    breaks: "B1/C5 — and it is inside a TEMPLATE literal, which is what the reader had to learn to see"
  },
  {
    file: CT,
    name: "V2 a critical table row goes back",
    from: "Target is taking 1 recurring damage.",
    to: "Target is taking 1 persistent damage.",
    breaks: "B1/C1 — a transcribed row drifting from the book it was transcribed from"
  },
  {
    file: FT,
    name: "V3 a fumble table row goes back",
    from: "1d4 recurring bleed damage",
    to: "1d4 persistent bleed damage",
    breaks: "B1/C4"
  },
  {
    file: RE,
    name: "V4 the Life Stealing rune goes back",
    from: "Bleed from this weapon becomes recurring essence damage.",
    to: "Bleed from this weapon becomes persistent essence damage.",
    breaks: "B1/C6"
  },
  {
    file: AW,
    name: "V5 the alchemical summary goes back",
    from: "`<strong>Recurring ${next.value} ${damageType}</strong>",
    to: "`<strong>Persistent ${next.value} ${damageType}</strong>",
    breaks: "B1/C7 — a template whose interpolation names the FIELD, which must not confuse the reader"
  },
  {
    file: BA,
    name: "V6 the Delay action goes back",
    from: "Recurring damage/effects due at the start",
    to: "Persistent damage/effects due at the start",
    breaks: "B1/C8"
  },
  {
    file: CV,
    name: "V7 the conviction option goes back to its old printed name",
    from: 'label: "Recurring Healing",',
    to: 'label: "Persistent Healing",',
    breaks: 'C9 — "Persistent Healing" appears nowhere in Core 3.7'
  },
  {
    file: CV,
    name: "V8 the conviction action key is renamed with the label",
    from: '  persistentHealing: {\n    label: "Recurring Healing",',
    to: '  recurringHealing: {\n    label: "Recurring Healing",',
    breaks: "C10 — a button on a chat card already posted stops working; the book renamed a rule, not a wire format"
  },
  {
    file: CT,
    name: "P1 a careless find-and-replace eats the Persistence column",
    from: '"persistence": "-"',
    to: '"recurrence": "-"',
    breaks: "C3 — 644 rows that say how long an injury lasts, nothing to do with this rule"
  },
  {
    file: REG,
    name: "P2 the condition is renamed to the old word",
    from: '  recurring: { label: "Recurring Damage"',
    to: '  persistent: { label: "Recurring Damage"',
    breaks: "A1/A3 — the one name the system already had, given away"
  },
  {
    file: REG,
    name: "P3 the condition's label drifts from the book",
    from: '  recurring: { label: "Recurring Damage"',
    to: '  recurring: { label: "Persistent Damage"',
    breaks: "A2"
  },
  {
    file: CHECK,
    name: "R1 the sweep stops stripping comments and reads its own header",
    from: "  let code = stripComments(source);",
    to: "  let code = String(source);",
    breaks: "B1 — this file's own header discusses the old word at length; a reader that "
      + "cannot tell a comment from a sentence would report every file that explains itself"
  },
  {
    file: CHECK,
    name: "R2 an allowance is left without a reason",
    // THE REASON IS SHORTENED, not the guard switched off. Disabling the
    // comparison proved nothing, because every reason was long enough for
    // it to have nothing to say — the mutation has to create the defect,
    // not remove the detector.
    from: '    "The LABEL ALIAS.',
    to: '    "Because. ("',
    breaks: "B3 — 'allowed' degrades into 'listed', which is a shrug with a name"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([CW, CT, FT, RE, AW, BA, CV, REG, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-recurring-vocabulary: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n < 1) { results.push({ name: m.name, state: "ANCHOR MISSING" }); continue; }
    // GLOBAL, because every mutation here simulates a find-and-replace and
    // a one-occurrence swap is not one. P1 survived its first outing for
    // exactly this reason: it renamed ONE of the 644 Persistence rows, the
    // count stayed above the threshold, and a check that was working
    // perfectly looked broken.
    fs.writeFileSync(m.file, original.split(m.from).join(m.to));
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
  ? `\nmutate-recurring-vocabulary: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-recurring-vocabulary: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
