#!/usr/bin/env node
/**
 * mutate-feat-evidence — can the checks on the measuring tool fail?
 *
 * NEW at 3.569.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT. Removing the composed route puts the tool
 * back exactly where it was when the block-12 audit ran: twelve fully
 * built feats reported as printed notes, with a number beside them. If
 * verify-feat-evidence cannot catch that edit, it is decoration.
 *
 * THE REST ARE THE WAYS A TOOL STOPS BEING HONEST WITHOUT LOOKING
 * BROKEN — a registry quietly emptied, an unreadable table swallowed, a
 * blind spot no longer printed. Every one of them leaves the tool
 * producing confident numbers.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TOOL = path.join(SYSTEM_ROOT, "tools", "feat-evidence.mjs");
const CASTER = path.join(SYSTEM_ROOT, "module", "magic", "caster-tier-feats.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-feat-evidence.mjs");

const MUTATIONS = [
  {
    // THE STATE THE TOOL SHIPPED IN, for three releases.
    file: TOOL,
    name: "THE SHIPPED DEFECT: the composed route is removed",
    from: '    else if (inComposed) tier = "composed";',
    to: "",
    breaks: "B3 — twelve built feats read as printed notes again"
  },
  {
    // The subtler version: the route survives but the registry is empty,
    // so it resolves nothing and every number looks the same as before.
    file: TOOL,
    name: "the registry is emptied but the route remains",
    from: '  ["module/magic/caster-tier-feats.mjs", "CASTER_TIER_FEATS"],',
    to: "",
    breaks: "B3/A6 — the route is decorative and the twelve fall back to note-only"
  },
  {
    // A TABLE THAT CANNOT BE READ IS A SET OF FEATS ABOUT TO BE
    // MISREPORTED. Swallowing the failure is how the tool would go on
    // printing confident numbers over a gap.
    file: TOOL,
    name: "an unreadable table is swallowed instead of named",
    from: "      unreadable.push(`${rel}#${exported} (${error.message})`);",
    to: "      void error;",
    breaks: "C1a — the tool stops reporting the gaps it knows about"
  },
  {
    file: TOOL,
    name: "the remaining blind spot stops being printed with the numbers",
    from: "        `${composedCount} feat names were read from ${COMPOSED_NAME_TABLES.length} registered lookup tables. A feat built\\n` +\n        `under a name composed OUTSIDE those tables would still read as unimplemented here —\\n` +\n        `that is this tool's remaining blind spot, and it is why \"unknown\" exists.\\n`",
    to: '        ""',
    breaks: "C2 — a tool that stops naming its limits is quoted as though it had none"
  },
  {
    // NOTE-ONLY GOES BACK TO MEANING TWO THINGS — the ambiguity that let
    // twelve built feats sit in the same bucket as five deliberate notes.
    file: TOOL,
    name: "note-only reabsorbs the feats the tool cannot classify",
    from: '    else if (notes > 0 && !inProse) tier = "note-only";\n    else if (inProse) tier = "unknown";',
    to: '    else if (notes > 0) tier = "note-only";',
    breaks: "C3 — the tier means two different things again"
  },
  {
    // COMMENTS MUST STILL BE STRIPPED. Without it a feat described in a
    // doc comment and built nowhere reads as wired — the FIRST miss.
    file: TOOL,
    name: "the name match stops stripping comments",
    from: "  const inCode = code.includes(name);",
    to: "  const inCode = code.includes(name) || prose.includes(name);",
    breaks: "C4 — described-but-unbuilt becomes indistinguishable from built"
  },
  {
    // A KEY NAMING NO FEAT never fires — the Improved Combat Reflexes
    // lesson, where the code matched one string and the pack held another.
    file: CASTER,
    name: "a composed key stops matching any feat in the pack",
    from: "        `${tier} ${TRADITIONS[tradition].label.toLowerCase()} caster`,",
    to: "        `${tier} ${TRADITIONS[tradition].label.toLowerCase()} spellcaster`,",
    breaks: "A6/B3 — the lookup is keyed on names no feat has"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const guard = guardFiles([TOOL, CASTER, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-feat-evidence: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-feat-evidence: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-feat-evidence: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
