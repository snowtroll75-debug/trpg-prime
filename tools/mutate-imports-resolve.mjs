#!/usr/bin/env node
/**
 * mutate-imports-resolve — can the import check fail?
 *
 * NEW at 3.598.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IS THE MISTAKE THAT PROMPTED THE CHECK, restored
 * exactly: `import { SYSTEM_ID } from "../constants.mjs";` at the top of
 * `combat/sanctuary-gate.mjs`, where there is no such module. In Foundry
 * that throws at load and the system does not initialise at all.
 *
 * THE REST EARN THE SCANNER. Its patterns cannot be tested by a clean tree —
 * remove the dynamic pattern and a green sweep says nothing, because there
 * is no bad dynamic path on disk to miss. So the fixtures are mutated too.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const GATE = at("module", "combat", "sanctuary-gate.mjs");
const SANCT = at("module", "magic", "sanctuary.mjs");
const CHECK = at("tools", "verify-imports-resolve.mjs");

const MUTATIONS = [
  { file: GATE,
    name: "THE MISTAKE THAT PROMPTED THIS CHECK: a static import of a module that does not exist",
    from: `// The system id, as every other module in this tree declares it: a local`,
    to: `import { SYSTEM_ID_UNUSED } from "../constants.mjs";
// The system id, as every other module in this tree declares it: a local`,
    breaks: "the tree scan" },
  { file: GATE, name: "a DYNAMIC import of a module that does not exist",
    from: `    const { TRGCheck } = await import("../dice/check.mjs");`,
    to: `    const { TRGCheck } = await import("../dice/checks.mjs");`,
    breaks: "the tree scan, dynamic half" },
  { file: GATE, name: "AN EXTENSIONLESS PATH, which Node resolves and a browser does not",
    from: `} from "../magic/sanctuary.mjs";`, to: `} from "../magic/sanctuary";`,
    breaks: "the extension rule" },
  { file: SANCT, name: "and a bad relative path one directory up",
    from: `import { effectAppliesOnDegree, effectiveSaveDegree } from "./spell-degrees.mjs";`,
    to: `import { effectAppliesOnDegree, effectiveSaveDegree } from "../spell-degrees.mjs";`,
    breaks: "the tree scan" },

  /* ---- the scanner's own patterns ---- */
  { file: CHECK, name: "THE DYNAMIC PATTERN IS DROPPED, so every lazy import goes unchecked",
    from: `  for (const re of [STATIC, DYNAMIC]) {`, to: `  for (const re of [STATIC]) {`,
    breaks: "F4" },
  { file: CHECK, name: "the static pattern is dropped",
    from: `  for (const re of [STATIC, DYNAMIC]) {`, to: `  for (const re of [DYNAMIC]) {`,
    breaks: "F1" },
  { file: CHECK, name: "a multi-line import list stops being matched",
    from: `const STATIC = /(?:^|[\\s;}])(?:import|export)\\s+(?:[\\s\\S]*?\\sfrom\\s+)?["'](\\.[^"']*)["']/g;`,
    to: `const STATIC = /(?:^|[\\s;}])(?:import|export)\\s+(?:[^\\n]*?\\sfrom\\s+)?["'](\\.[^"']*)["']/g;`,
    breaks: "F3" },
  { file: CHECK, name: "COMMENTS ARE SCANNED, so this file's own header becomes a defect",
    from: `  const src = strip(String(text ?? ""));`, to: `  const src = String(text ?? "");`,
    breaks: "F8" },
  { file: CHECK, name: "a bare specifier is treated as a relative path, dynamically",
    from: `["'](\\.[^"']*)["']\\s*\\)/g;`, to: `["']([^"']*)["']\\s*\\)/g;`, breaks: "F7b" },
  { file: CHECK, name: "THE EXTENSION RULE STOPS LOOKING — nothing on disk is extensionless, so only a fixture can catch this",
    from: `  return !s.endsWith(".mjs") && !s.endsWith(".js") && !s.endsWith(".json");`,
    to: `  return false;`, breaks: "F9" },
  { file: CHECK, name: "and it refuses a real module path as well",
    from: `  return !s.endsWith(".mjs") && !s.endsWith(".js") && !s.endsWith(".json");`,
    to: `  return true;`, breaks: "F9b" },
  /*
   * DELIBERATELY NOT MUTATED: `if (extensionlessSpecifier(spec))` → `if
   * (false)`. Nothing on disk is extensionless, so that mutation cannot
   * change an answer on a clean tree — and the call site is already
   * exercised by "AN EXTENSIONLESS PATH" above, which plants one and is
   * caught. A mutation that cannot fail is not evidence.
   */
  { file: CHECK, name: "A MISSING FILE IS PRINTED AND THE RUN EXITS 0 — the sweep would call it green",
    from: `  return missing > 0 || suspicious > 0 || fixtures > 0;`,
    to: `  return suspicious > 0 || fixtures > 0;`, breaks: "F10" },
  { file: CHECK, name: "AND NOTHING FAILS THE RUN AT ALL — which used to hide its own failure",
    from: `  return missing > 0 || suspicious > 0 || fixtures > 0;`, to: `  return false;`,
    breaks: "F10, now that the fixtures gate the run directly" },
  /*
   * DELIBERATELY NOT MUTATED: dropping `fixtures.length` from the exit gate.
   * On a clean tree no fixture is failing, so that line changes no answer
   * unless it is paired with a broken scanner — two mutations at once, which
   * this runner cannot do. It is the ONE line this file cannot test itself:
   * something has to be trusted at the root, and here it is the statement
   * that reports a failed fixture. Recorded rather than papered over.
   */
  { file: CHECK, name: "THE WALK STOPS RECURSING, so module/magic and module/combat go unscanned",
    from: `    if (entry.isDirectory()) out.push(...walk(full));`, to: `    if (entry.isDirectory()) ;`,
    breaks: "F11" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [CHECK], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-imports-resolve does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const m of MUTATIONS) {
  const original = originals.get(m.file);
  const n = original.split(m.from).length - 1;
  if (n !== 1) {
    console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(m.file, original.replace(m.from, m.to));
  const stillPasses = run();
  fs.writeFileSync(m.file, original);
  if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
  else console.log(`  caught    ${m.name}`);
}
for (const [file, original] of originals) fs.writeFileSync(file, original);

process.stdout.write(survived + unmatched
  ? `\nmutate-imports-resolve: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-imports-resolve: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
