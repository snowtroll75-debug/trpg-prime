#!/usr/bin/env node
/**
 * mutate-self-target — can verify-self-target fail?
 *
 * NEW at 3.418.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT, restored as the one line it was. It is a
 * plain, reasonable-looking filter — "don't offer yourself as a target"
 * reads like sense until you are the Cleric holding the Cure spell.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TARGETING = path.join(SYSTEM_ROOT, "module", "combat", "targeting.mjs");
const CASTING = path.join(SYSTEM_ROOT, "module", "magic", "casting.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-self-target.mjs");

const MUTATIONS = [
  {
    file: TARGETING,
    name: "THE SHIPPED DEFECT: the caster is filtered out of their own picker",
    from: "    return canvas.tokens.placeables;",
    to: "    return canvas.tokens.placeables.filter((other) => other.id !== actorToken?.id);",
    breaks: "A1/A2 — a Cleric cannot heal himself again"
  },
  {
    // THE PARAMETER IS THE INVITATION. Restoring it is how the filter
    // comes back, so the check refuses the signature too.
    file: TARGETING,
    name: "the candidate builder takes an acting token again",
    from: "function candidateTokens() {",
    to: "function candidateTokens(actorToken) {",
    breaks: "A3 — a parameter it must not use is an invitation to use it"
  },
  {
    file: TARGETING,
    name: "the caster's row stops being marked",
    from: '${isSelf(token) ? " <em>(yourself)</em>" : ""}',
    to: "",
    breaks: "B1 — the row reads like every other and has to be hunted for"
  },
  {
    file: TARGETING,
    name: "the caster stops being listed first",
    from: "  const ordered = [...candidates].sort((a, b) => (isSelf(b) ? 1 : 0) - (isSelf(a) ? 1 : 0));",
    to: "  const ordered = [...candidates];",
    breaks: "B2 — a healer has to scan the list for themselves"
  },
  {
    // PRE-CHECKING SELF WOULD POINT EVERY ATTACK AT ITS OWN CASTER.
    file: TARGETING,
    name: "the caster is pre-selected by default",
    from: '<input type="checkbox" name="target" value="${token.id}" ${currentlyTargeted.has(token.id) ? "checked" : ""}>',
    to: '<input type="checkbox" name="target" value="${token.id}" ${isSelf(token) ? "checked" : currentlyTargeted.has(token.id) ? "checked" : ""}>',
    breaks: "B3/B4 — every attack would open aimed at the attacker"
  },
  {
    file: CASTING,
    name: "a targeted spell stops opening the picker",
    from: "  return Boolean(targets) || category === \"attack\";",
    to: "  return category === \"attack\";",
    breaks: "C1 — Cure never asks who to heal at all"
  },
  {
    // AN AREA SPELL MUST STILL NOT ASK. Its template decides.
    file: CASTING,
    name: "an area spell starts asking for a target",
    from: "  if (area) return false;",
    to: "  if (false) return false;",
    breaks: "C3 — a target is collected that the spell then ignores"
  },
  {
    file: CAST,
    name: "Conductive Healing fires when healing only yourself",
    from: "      effectTargets.some((t) => t && t.id !== actor.id) &&",
    to: "      effectTargets.length > 0 &&",
    breaks: 'D1 — "a target other than yourself" stops meaning anything'
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

const guard = guardFiles([TARGETING, CASTING, CAST, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-self-target: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-self-target: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-self-target: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
