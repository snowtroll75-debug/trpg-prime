#!/usr/bin/env node
/**
 * mutate-grapple-critical — can verify-grapple-critical actually fail?
 *
 * NEW at 3.375.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IS THE POINT: it restores the book's printed typo
 * exactly — critical applies `immobilised` instead of `grabbed` — and must
 * be caught by the GENERAL rule in section C, not only by the Grapple-
 * specific assertion. That general rule is what would catch the same
 * mistake transcribed into Trip, Shove or anything added later, and a
 * mutation set that only proved the specific check would say nothing about
 * whether the general one works.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TABLE = path.join(SYSTEM_ROOT, "module", "combat", "basic-action-conditions.mjs");
const ACTIONS = path.join(SYSTEM_ROOT, "module", "data", "basic-actions.mjs");

const MUTATIONS = [
  {
    name: "the printed typo is restored (critical immobilises instead of grabbing)",
    file: TABLE,
    from: '      conditionKey: "grabbed",\n      active: true,',
    to: '      conditionKey: "immobilised",\n      active: true,',
    breaks: "A2 and the general rule C — a critical would be weaker than a success"
  },
  {
    name: "the Escape penalty is dropped entirely",
    file: TABLE,
    from: '      conditionals: [{\n        kind: "modifier",',
    to: '      conditionalsRemoved: [{\n        kind: "modifier",',
    breaks: "A5 — the critical would grab but add nothing, making it identical to a success"
  },
  {
    name: "the penalty becomes a bonus",
    file: TABLE,
    from: "        value: -4,",
    to: "        value: 4,",
    breaks: "A6 — a critical Grapple would make escaping EASIER"
  },
  {
    name: "the penalty loses its type",
    file: TABLE,
    from: '        type: "circumstance",',
    to: '        type: "untyped",',
    breaks: "A7 — untyped would stack where a circumstance penalty must not"
  },
  {
    name: "the scope widens off the Escape action",
    file: TABLE,
    from: '        when: { actions: ["escape"] }',
    to: '        when: { checkTypes: ["skill"] }',
    breaks: "A8 — the -4 would apply to every skill check the target made"
  },
  {
    name: "the penalty becomes optional",
    file: TABLE,
    from: "        auto: true,",
    to: "        auto: false,",
    breaks: "A9 — a stated penalty would arrive unticked, so it applies only if someone remembers"
  },
  {
    name: "a success gains the Escape penalty too",
    file: TABLE,
    from: '    success: [{ target: "target", conditionKey: "grabbed", active: true }],',
    to: '    success: [{ target: "target", conditionKey: "grabbed", active: true, conditionals: [{ kind: "modifier", value: -4, type: "circumstance", label: "x", scope: "x", auto: true, when: { actions: ["escape"] } }] }],',
    breaks: "B2 — the critical would lose its only advantage over a success"
  },
  {
    name: "conditionals are no longer stamped onto the effect",
    file: TABLE,
    from: "      stamped[`flags.${SYSTEM_ID}.conditionals`] = effect.conditionals;",
    to: "      void effect.conditionals;",
    breaks: "D1 — the rule would be declared in the table and never reach the sheet"
  },
  {
    name: "a missing expiry skips the conditional again",
    file: TABLE,
    from: "    if (!effect.active) continue;",
    to: "    if (expiresRound === null || !effect.active) continue;",
    breaks: "D3 — a critical with no stated duration would drop its penalty silently"
  },
  {
    // THE HALF THE FIRST 3.375.0 BUILD MISSED. The table was corrected and
    // the card kept saying "immobilised", so the system applied one thing
    // and described another. Found by driving a critical, not by the
    // harness — which is why section E now exists.
    name: "the card reverts to the printed typo while the table stays correct",
    file: ACTIONS,
    from: 'critical: "Your target is Grabbed and takes a -4 circumstance penalty to checks made to Escape your Grapple until the end of your next turn.",',
    to: 'critical: "Your target is immobilised until the end of your next turn unless you move or your target Escapes.",',
    breaks: "E — the card would describe a different outcome from the one applied"
  },
  {
    name: "the expiry stops being stamped",
    file: TABLE,
    from: "    if (expiresRound !== null) stamped[`flags.${SYSTEM_ID}.conditionExpiresRound`] = expiresRound;",
    to: "    if (false) stamped[`flags.${SYSTEM_ID}.conditionExpiresRound`] = expiresRound;",
    breaks: "D2 — every condition an action applied would become permanent"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-grapple-critical.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([TABLE, ACTIONS]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-grapple-critical: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const file = m.file ?? TABLE;
    const original = fs.readFileSync(file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(file, original);
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
    ? `\nmutate-grapple-critical: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-grapple-critical: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
