#!/usr/bin/env node
/**
 * mutate-general-feats-131-140 — can the block-13 checks fail?
 *
 * NEW at 3.570.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 AND #2 ARE THE TWO RULINGS, EDITED AWAY. Graham ruled Feather Step
 * SCOPED and Questionable Source ALWAYS-INCLUDING-FUMBLE; each of those
 * is one small edit away from being silently reversed, and neither
 * reversal would throw or look broken. If the checks cannot catch these
 * two, they are not guarding the rulings, they are describing them.
 *
 * THE REST ARE THE QUIETER FAILURES: the armed key never reaching the
 * pricer (a scoped flag nothing ever hands an action to is inert), the
 * note printed for everyone, and feat-evidence's item-flag route being
 * closed again — the blind spot that would have hidden Feather Step for
 * ever.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const PASSIVE = path.join(SYSTEM_ROOT, "module", "combat", "passive-feats.mjs");
const MOVEMENT = path.join(SYSTEM_ROOT, "module", "combat", "movement-workflow.mjs");
const SOURCE = path.join(SYSTEM_ROOT, "module", "questionable-source.mjs");
const ACTION = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const EVIDENCE = path.join(SYSTEM_ROOT, "tools", "feat-evidence.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-general-feats-131-140.mjs");
const UNDERWATER = path.join(SYSTEM_ROOT, "module", "combat", "underwater.mjs");
const UNDERWATER_WF = path.join(SYSTEM_ROOT, "module", "combat", "underwater-workflow.mjs");

const MUTATIONS = [
  {
    file: UNDERWATER,
    name: "Underwater Marauder no longer lifts the −2",
    from: "    meleePenalty: Boolean(aquaticAttacker || submersibleWeapon || marauder),",
    to: "    meleePenalty: Boolean(aquaticAttacker || submersibleWeapon),",
    breaks: "K39"
  },
  {
    file: UNDERWATER_WF,
    name: "Underwater Marauder is flat-footed in the water again",
    from: "  const flatFooted = !marauder && underwaterFlatFooted(",
    to: "  const flatFooted = underwaterFlatFooted(",
    breaks: "K40"
  },
  {
    // RULING 1 REVERSED. The scope is read and then ignored, so every
    // scoped carrier eases everything — Feather Step becomes Wild Stride
    // and no error is raised anywhere.
    file: PASSIVE,
    name: "THE RULING REVERSED: a scoped carrier eases every move",
    from: "    return Array.isArray(scope) && Boolean(wanted) && scope.includes(wanted);",
    to: "    return Array.isArray(scope);",
    breaks: "K8 — Feather Step silently becomes Wild Stride"
  },
  {
    // The opposite reversal: the scope is honoured but an unidentified
    // move is treated as easeable, which is the same grant by the back
    // door — an ordinary Stride carries no armed key.
    file: PASSIVE,
    name: "an unidentified move is eased by a scoped carrier",
    from: "    return Array.isArray(scope) && Boolean(wanted) && scope.includes(wanted);",
    to: "    return Array.isArray(scope) && (!wanted || scope.includes(wanted));",
    breaks: "K9 — an ordinary Stride gets the relief through the default"
  },
  {
    // THE FEAT MADE INERT. The mechanism is intact; nothing ever tells
    // it which action is being taken, so the scope never matches.
    file: MOVEMENT,
    name: "the armed key never reaches the terrain relief",
    from: "    const easedBy = terrainReliefName(actor, armedKey);",
    to: "    const easedBy = terrainReliefName(actor);",
    breaks: "K16 — every scoped carrier is inert and the feat does nothing"
  },
  {
    // RULING 2 REVERSED, and this is the shape it would really take: a
    // reader deciding a Fumble is too generous and excluding it.
    file: SOURCE,
    name: "THE RULING REVERSED: a Fumble no longer yields the true fact",
    from: "  if (degree.success) return null;",
    to: '  if (degree.success || degreeKey === "fumble") return null;',
    breaks: "K24/K26 — 'always' stops meaning always"
  },
  {
    // The feat handed to everyone. Nothing throws; every character who
    // Recalls Knowledge simply gains a feat they never took.
    file: ACTION,
    name: "the note is printed without checking the feat is carried",
    from: "    if (action.key === QUESTIONABLE_SOURCE_ACTION && degree && hasQuestionableSource(actor)) {",
    to: "    if (action.key === QUESTIONABLE_SOURCE_ACTION && degree) {",
    breaks: "K32 — every character gets Questionable Source"
  },
  {
    // The caveat dropped. The feat reads as an unqualified truth-teller
    // rather than the hedged thing the book prints.
    file: SOURCE,
    name: "the printed caveat is dropped from the card",
    from: '    + "information about the target that is true</strong> — although not necessarily useful, "',
    to: '    + "information about the target that is true</strong>, "',
    breaks: "K30 — the balance of the feat stops being stated"
  },
  {
    // THE LIVE DEFECT OF 3.570.0, put back. The card named Wild Stride
    // whatever had actually eased the ground — hard-coded when Wild
    // Stride was the only carrier, wrong for three of the four by the
    // time live testing found it.
    file: MOVEMENT,
    name: "THE LIVE DEFECT: the card hard-codes Wild Stride as the carrier",
    from: '        + (eased ? ` ${easedBy ?? "Your terrain training"} eased the terrain.` : "")',
    to: '        + (eased ? " Wild Stride eased the terrain." : "")',
    breaks: "K16e — a Feather Step character is told a feat they do not have eased the ground"
  },
  {
    // The naming stops distinguishing carriers: everything answers with
    // the generic label, so the card is vague rather than wrong. Quieter,
    // and still a regression.
    file: PASSIVE,
    name: "the carrier's own name is dropped for the generic label",
    from: '  const named = (document) => String(document?.name ?? "").trim() || "Your terrain training";',
    to: '  const named = () => "Your terrain training";',
    breaks: "K16a/K16b — the card stops naming which feat did it"
  },
  {
    // THE BLIND SPOT REOPENED. Exactly the state the tool shipped in:
    // item-level mechanical flags invisible, so a feat automated that
    // way reads as a printed note.
    file: EVIDENCE,
    name: "feat-evidence stops reading mechanical flags off the item",
    from: "      mechFlags.add(key);\n    }\n    const name = item.name.toLowerCase();",
    to: "      void key;\n    }\n    const name = item.name.toLowerCase();",
    breaks: "K35/K37 — Feather Step reads as unimplemented again"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const guard = guardFiles([PASSIVE, MOVEMENT, SOURCE, ACTION, EVIDENCE, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-general-feats-131-140: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-general-feats-131-140: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-general-feats-131-140: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
