#!/usr/bin/env node
/**
 * mutate-feat-grants — can verify-feat-grants fail?
 *
 * NEW at 3.421.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 AND #2 ARE THE TWO SHIPPED DEFECTS, restored one at a time. Both
 * were live in Graham's game on 27 August 2026, and both are a grant
 * that no code path anywhere ever applied.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FEATS = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const AUTORUN = path.join(SYSTEM_ROOT, "module", "grant-autorun.mjs");
const GRANTS = path.join(SYSTEM_ROOT, "module", "grants.mjs");
const CLEANUP = path.join(SYSTEM_ROOT, "module", "grant-cleanup.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-feat-grants.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT A, restored as the one line it was.
    file: FEATS,
    name: "THE SHIPPED DEFECT A: the divine aspect stops asking for specialist spells",
    from: "    allowSpecialist: true,\n    filter: (entry) => wanted.has(key(entry.name)) &&",
    to: "    filter: (entry) => wanted.has(key(entry.name)) &&",
    breaks: "A2/A5 — all 44 aspect spells are specialist, so the chooser offers nothing"
  },
  {
    // THE OPPOSITE FIX, and it must also fail. Flipping the default
    // would make the aspect work by letting every free repertoire pick
    // reach all 106 specialist spells — Graham's 15 Aug ruling, undone.
    file: FEATS,
    name: "the exclusion is 'fixed' by flipping the default for everyone",
    from: "  allowSpecialist = false",
    to: "  allowSpecialist = true",
    breaks: "A4 — the aspect would work, and so would taking a school's spell for free"
  },
  {
    // THE SHIPPED DEFECT B, first half.
    file: AUTORUN,
    name: "THE SHIPPED DEFECT B: a feat's grants go back to needing the picker",
    from: '  ...FOUNDATION_ITEM_TYPES, "class", "divine-aspect", "wizard-school",\n  "feat", "creature-type"',
    to: '  ...FOUNDATION_ITEM_TYPES, "class", "divine-aspect", "wizard-school"',
    breaks: "B2/B3/B4 — twelve feats grant a spell and nothing applies any of them"
  },
  {
    file: AUTORUN,
    name: "only the creature type is stranded",
    from: '  "feat", "creature-type"',
    to: '  "feat"',
    breaks: "B2/B4 — one stranded type is as absent a feature as two"
  },
  {
    // THE SHIPPED DEFECT B, second half — the guard that would still
    // have stopped it even with `feat` on the list.
    file: AUTORUN,
    name: "THE SHIPPED DEFECT B: the sweep skips anything that was itself granted",
    // Anchor repointed at 3.563.0 when the specialist-skill flag joined
    // the declaration test.
    from: "      if (item.flags?.[SYSTEM_ID]?.grantedBy\n        && !declaresGrants(item.system, GRANT_FIELDS[item.type])\n        && !declaresSpecialistSkills(item)) continue;",
    to: "      if (item.flags?.[SYSTEM_ID]?.grantedBy) continue;",
    breaks: "C6 — a Priestly Path feat's own spell belongs to nobody again"
  },
  {
    file: AUTORUN,
    name: "the createItem hook skips anything that was itself granted",
    from: "      if (!declaresGrants(item.system, GRANT_FIELDS[item.type]) && !declaresSpecialistSkills(item)) return;",
    to: "      return;",
    breaks: "C7 — either guard alone is enough to lose Lay On Hands"
  },
  {
    // NARROWNESS LOST. Every chained create would earn a pass.
    file: AUTORUN,
    name: "a granted item with nothing to grant earns a pass anyway",
    from: "        && !declaresGrants(item.system, GRANT_FIELDS[item.type])\n        && !declaresSpecialistSkills(item)) continue;",
    to: "        && false) continue;",
    breaks: "C8 — 411 feats that declare nothing back into the sweep"
  },
  {
    file: GRANTS,
    name: "a blank grant field counts as a declaration",
    from: "    ({ field }) => String(itemSystem?.[field] ?? \"\").trim().length > 0",
    to: "    ({ field }) => itemSystem?.[field] !== undefined",
    breaks: "C2 — a half-finished pack entry earns a grant pass it cannot use"
  },
  {
    file: GRANTS,
    name: "a type with no grant fields at all throws",
    from: "  return (Array.isArray(fields) ? fields : []).some(",
    to: "  return fields.some(",
    breaks: "C5 — the guard runs on every create, including a weapon's"
  },
  {
    // A CHECK THAT CANNOT LOCATE ITS SUBJECT MUST SAY SO rather than
    // passing every regex against an empty string.
    file: FEATS,
    name: "useDivineAspect is renamed out from under the check",
    from: "async function useDivineAspect(actor, item) {",
    to: "async function useDivineAspectX(actor, item) {",
    breaks: "A1 — an empty function body satisfies nothing, and must not read as pass"
  },
  {
    file: CLEANUP,
    name: "the removal side stops naming the relationship",
    from: "// 1. Granted embedded items (race → abilities/feats, feat → spells...).",
    to: "// 1. Granted embedded items (race → abilities...).",
    breaks: "D1 — the one place that always knew a feat grants spells"
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

const guard = guardFiles([FEATS, AUTORUN, GRANTS, CLEANUP, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-feat-grants: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-feat-grants: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-feat-grants: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
