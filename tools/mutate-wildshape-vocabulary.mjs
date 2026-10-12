#!/usr/bin/env node
/**
 * mutate-wildshape-vocabulary — can verify-wildshape-vocabulary fail?
 *
 * NEW at 3.384.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IS THE POINT, and it is not hypothetical: it
 * restores the Improved Combat Reflexes bug of 23 August 2026 in its
 * exact shape — a plausible, wrong name that the pack does not hold. On
 * that day the feat did nothing for a whole release and every test was
 * green, because the harness and the code shared the invented spelling
 * and neither had opened the pack.
 *
 * THE FOURTH IS THE ONE THAT WOULD ACTUALLY HAPPEN. Crusader's Mercy is
 * printed in the rulebook as "Crusaders Mercy", without the apostrophe.
 * Somebody typing the table from the page gets it wrong in the direction
 * this mutation goes, and the feat quietly feeds nothing.
 *
 * SEVERAL MUTATIONS EDIT THE VERIFY FILE RATHER THAN A RULE, which is a
 * departure from the other mutation files here and is deliberate. This
 * check's substance IS its allowlist and its AST walk; a mutation set
 * that only touched the rules would leave the parts most likely to be
 * silently wrong — the ones that decide what gets looked at — entirely
 * unproven. M8 and M9 exist because both of those parts WERE wrong on
 * this file's first run.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FEATS = path.join(SYSTEM_ROOT, "module", "magic", "wildshape-feats.mjs");
const EXTRA = path.join(SYSTEM_ROOT, "module", "extra-uses.mjs");
const DRUID = path.join(SYSTEM_ROOT, "module", "druid.mjs");
const USESW = path.join(SYSTEM_ROOT, "module", "uses-workflow.mjs");
const RUNEW = path.join(SYSTEM_ROOT, "module", "rune-actions-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-wildshape-vocabulary.mjs");

const MUTATIONS = [
  {
    name: "THE COMBAT REFLEXES BUG: the ability is given a name the pack does not hold",
    file: FEATS,
    from: 'export const WILD_SHAPE_ABILITY = "Wild Shape";',
    to: 'export const WILD_SHAPE_ABILITY = "Wildshape";',
    breaks: "A1 — four lookups find nothing and the ability silently does not exist"
  },
  {
    name: "the pool spell is renamed out from under the daily allowance",
    file: FEATS,
    from: 'export const WILD_SHAPE_POOL_SPELL = "Shape Of The Animal";',
    to: 'export const WILD_SHAPE_POOL_SPELL = "Shape of the Animal Form";',
    breaks: "A2 — usesPoolNameFor redirects onto an item that is not there"
  },
  {
    name: "a form feat is misnamed",
    file: FEATS,
    from: '  "wyrm shape": "Shape Of The Wyrm"',
    to: '  "shape of the wyrm": "Shape Of The Wyrm"',
    breaks: "A5 — the feat name is matched against the actor's feats and never matches"
  },
  {
    name: "THE APOSTROPHE: the rulebook's own spelling of Crusaders Mercy",
    file: EXTRA,
    from: '"extra mercy": Object.freeze({ ability: "Crusader\'s Mercy", perCopy: 2 })',
    to: '"extra mercy": Object.freeze({ ability: "Crusaders Mercy", perCopy: 2 })',
    breaks: "A4 — the feat feeds an ability that does not exist, and adds nothing"
  },
  {
    name: "an extra-uses FEAT is misnamed",
    file: EXTRA,
    from: '"extra channels": Object.freeze({ ability: "Channels", perCopy: 2 })',
    to: '"extra channel": Object.freeze({ ability: "Channels", perCopy: 2 })',
    breaks: "A3 — the feat on the sheet never matches the table key"
  },
  {
    name: "THE STATE 3.384.0 FIXED: druid.mjs writes the name out by hand again",
    file: DRUID,
    from: "extraUsesBonus(featNames, WILD_SHAPE_ABILITY)",
    to: 'extraUsesBonus(featNames, "Wild Shape")',
    breaks: "B1 — an undeclared literal, and the constant is back to guarding nothing"
  },
  {
    name: "uses-workflow open-codes hasClassAbility again",
    file: USESW,
    from: "  if (!hasClassAbility(actor, WILD_SHAPE_ABILITY)) return null;",
    to: "  if (!Array.from(actor?.items ?? []).some((i) => i.type === \"ability\"\n"
      + "    && String(i.name).trim().toLowerCase() === \"wild shape\")) return null;",
    breaks: "B1/C2 — the lowercased copy the triage missed, restored"
  },
  {
    name: "rune-actions stops reading the constant",
    file: RUNEW,
    from: "hasClassAbility(actor, WILD_SHAPE_ABILITY)",
    to: 'hasClassAbility(actor, "Wild Shape")',
    breaks: "B1/C2 — imported and never read, which is what the release was fixing"
  },
  {
    // THE BLIND SPOT. `walk.simple` does not descend into a non-computed
    // property key, so FEAT_AUTOMATION's `"wild shape":` was invisible
    // and the first run of this file counted one literal where there are
    // two. Without the Property visitor the check silently exempts every
    // registry keyed on an item name.
    name: "THE WALKER'S BLIND SPOT: property keys stop being counted",
    file: CHECK,
    from: '      if (!node.computed && node.key?.type === "Literal") count(node.key.value);',
    to: "      void node;",
    breaks: "B2 — a registry key looking a feat up by name becomes invisible"
  },
  {
    // THE ALLOWLIST ROTS UPWARDS. A slot declared but no longer used is
    // a free pass for the next literal somebody adds, which is why B2
    // checks the count is exact rather than merely under the cap.
    name: "the allowlist is left with a free slot",
    file: CHECK,
    from: '  "module/magic/wildshape-riders.mjs": 2,  // display fallbacks',
    to: '  "module/magic/wildshape-riders.mjs": 3,  // display fallbacks',
    breaks: "B2 — an undeclared literal could then arrive unnoticed"
  },
  {
    // A CHECK THAT CANNOT READ THE PACKS HAS NOT CHECKED THEM. This is
    // lib/sources.mjs's one rule applied to a binary database: the whole
    // of section A is worthless if a missing pack reads as a pass.
    name: "the packs cannot be found and it is treated as a skip",
    file: CHECK,
    from: '  if (!fs.existsSync(dir)) return null;',
    to: '  if (!fs.existsSync(dir)) return new Map();\n  if (true) return new Map();',
    breaks: "A0/A1 — every name check passes vacuously against an empty pack"
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

const guard = guardFiles([FEATS, EXTRA, DRUID, USESW, RUNEW, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-wildshape-vocabulary: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-wildshape-vocabulary: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-wildshape-vocabulary: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
