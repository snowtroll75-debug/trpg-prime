#!/usr/bin/env node
/**
 * mutate-opportunity-reach — can verify-opportunity-reach actually fail?
 *
 * NEW at 3.374.0. SURVIVED and an unmatched anchor are both failures.
 *
 * WHERE THESE AIM. The 3.374.0 fix is not arithmetic — it is one flag
 * threaded from the reaction to the reach gate, plus a refund. So the
 * mutations attack the THREADING: remove the flag, stop passing it, put it
 * on the wrong condition, invert the refund, reorder it. Every one of
 * those leaves code that reads perfectly well and reintroduces the exact
 * defect Graham reported.
 *
 * The one that matters most is `default-becomes-true`: it does not break
 * the Attack of Opportunity at all — it silently removes the reach gate
 * from EVERY ordinary Strike in the game. A fix that quietly widens is
 * worse than the bug it fixed, and nothing in the AoO path would notice.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const OPP = path.join(SYSTEM_ROOT, "module", "combat", "opportunity.mjs");

const MUTATIONS = [
  {
    name: "the option is removed from rollWeaponAttack",
    file: ATTACK,
    from: "  reachAlreadyEstablished = false",
    to: "",
    breaks: "A1/A2 — the gate could no longer be told the question was answered"
  },
  {
    name: "the option defaults to TRUE (every Strike loses its reach gate)",
    file: ATTACK,
    from: "reachAlreadyEstablished = false",
    to: "reachAlreadyEstablished = true",
    breaks: "A2 — an ordinary Strike could hit a target on the far side of the map"
  },
  {
    name: "the reach gate stops consulting the flag",
    file: ATTACK,
    from: "reachAlreadyEstablished ? null : distanceToTarget",
    to: "distanceToTarget",
    breaks: "A3/A4b — the original defect, exactly as reported"
  },
  {
    // THE BUG THE FIRST FIX ACTUALLY SHIPPED, reproduced on purpose. Gating
    // the enclosing block leaves `reach` null, and it is dereferenced much
    // later for the attack-roll modifier — so every Attack of Opportunity
    // throws. The first version of the verify file ASSERTED this shape, so
    // the harness went green over a total failure. One live strike found it.
    name: "the flag gates the whole block, leaving reach null",
    file: ATTACK,
    // The reach gate's condition has been named since 3.575.0, which is
    // what makes it a single line to anchor on; it used to share its text
    // with the flanking block's and needed the following line to be unique.
    from: "  const measuresReach = positional && !isRanged;",
    to: "  const measuresReach = positional && !isRanged && !reachAlreadyEstablished;",
    breaks: "A4/A4c — reach would be null when reach.penalty is read, throwing on every AoO"
  },
  {
    name: "the out-of-reach refusal is removed for everyone",
    file: ATTACK,
    from: "    if (reach.outOfReach) {",
    to: "    if (false) {",
    breaks: "A5 — no Strike would ever be refused for range again"
  },
  {
    name: "the Attack of Opportunity stops passing the flag",
    file: OPP,
    from: "    reachAlreadyEstablished: true",
    to: "    reachAlreadyEstablished: false",
    breaks: "B1 — the reported defect returns while the option still exists"
  },
  {
    name: "the AoO stops declaring itself a reaction",
    file: OPP,
    from: "    isReaction: true,",
    to: "    isReaction: false,",
    breaks: "B3 — the strike would take a multiple-attack penalty and cost AP"
  },
  {
    name: "the refund is removed",
    file: OPP,
    from: "  if (!result) {",
    to: "  if (false) {",
    breaks: "C1 — a refused strike would eat the reaction again"
  },
  {
    name: "the refund is uncapped",
    file: OPP,
    from: "Math.min(max, current + 1)",
    to: "current + 1",
    breaks: "C2 — reactors would accumulate reactions they never had"
  },
  {
    name: "the refund happens silently",
    file: OPP,
    from: 'ui.notifications.info(`${reactor.name} kept their reaction — no attack was made.`);',
    to: "",
    breaks: "C3 — a reaction quietly returning looks identical to one quietly lost"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-opportunity-reach.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([ATTACK, OPP]);
const results = [];
try {
  if (!run()) {
    process.stderr.write(
      "mutate-opportunity-reach: verify-opportunity-reach already fails on an unmodified tree.\n"
    );
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
    ? `\nmutate-opportunity-reach: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-opportunity-reach: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
