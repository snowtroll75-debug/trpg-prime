#!/usr/bin/env node
/**
 * mutate-opportunity-doors — can verify-opportunity-doors fail?
 *
 * NEW at 3.430.2. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT: remove the sheet's automation entry and the
 * click falls back to the card that says "resolved by the GM".
 *
 * #2 IS THE FIX DONE BADLY, and it is the one this file exists for. A
 * second implementation on the sheet door would make Graham's click work
 * and leave two rules to drift apart — which is precisely how the Sustain
 * defect arose one release earlier.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const OPP = path.join(SYSTEM_ROOT, "module", "combat", "opportunity.mjs");
const FEATS = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const ACTIONS = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-opportunity-doors.mjs");

const MUTATIONS = [
  {
    file: ACTIONS,
    name: "THE SHIPPED DEFECT: nothing dispatches on the action key",
    from: '    if (action.key === "attackOfOpportunity") {',
    to: '    if (action.key === "attackOfOpportunityDISABLED") {',
    breaks: "A1 — checkType 'none' spends the Reaction and posts the description"
  },
  {
    file: ACTIONS,
    name: "THE FIX IN THE WRONG PLACE: the branch carries its own copy",
    from: '      const { useAttackOfOpportunity } = await import("./opportunity.mjs");\n      await useAttackOfOpportunity(actor);',
    to: '      const { spendReaction } = await import("./action-points-workflow.mjs");\n      await spendReaction(actor, "Attack of Opportunity", { traits: "Attack" });',
    breaks: "A2 — two implementations of one rule, waiting to disagree"
  },
  {
    file: ACTIONS,
    name: "the branch falls through and the Reaction is spent twice",
    from: '      await useAttackOfOpportunity(actor);\n      return null;\n    }',
    to: '      await useAttackOfOpportunity(actor);\n    }',
    breaks: "A3 — the generic checkType 'none' path spends the cost again"
  },
  {
    file: FEATS,
    name: "the wrong door is wired back up alongside the right one",
    from: "const FEAT_AUTOMATION = {",
    to: 'export const FEAT_AUTOMATION = {\n  "attack of opportunity": { hint: "x", async use() {} },',
    breaks: "A5 — an entry keyed on an item name that does not exist in any pack"
  },
  {
    file: OPP,
    name: "the card door reimplements the strike instead of calling it",
    from: "    provokerToken: canvas?.tokens?.get?.(card.provokerTokenId) ?? null,",
    to: "",
    breaks: "C1 — the provoker the card recorded is dropped on the floor"
  },
  {
    file: OPP,
    name: "the sheet door invents a provoker",
    from: "  return performOpportunityStrike(actor, { triggerKind: null });",
    to: "  return performOpportunityStrike(actor, { triggerKind: null, provokerToken: canvas?.tokens?.controlled?.[0] ?? null });",
    breaks: "C2 — whoever the GM happened to have selected becomes the target"
  },
  {
    file: OPP,
    name: "the disruption rule reads a card the sheet door does not have",
    from: "  if (disruptsOnCritical(triggerKind, isCritical)) {",
    to: '  if (disruptsOnCritical("manipulate", isCritical)) {',
    breaks: "C3 — every critical AoO disrupts, whatever provoked it"
  },
  {
    file: OPP,
    name: "Shielded Stride is told every AoO was provoked by movement",
    from: '      provokedByMovement: triggerKind === "movement",',
    to: "      provokedByMovement: true,",
    breaks: "C4 — a manipulate provoke gains the defender's movement-only bonus"
  },
  {
    file: OPP,
    name: "the offer is marked spent even when the strike was refunded",
    from: "  if (!result) return null;\n\n  // MARKED SPENT ONLY IF A STRIKE HAPPENED.",
    to: "  // MARKED SPENT ONLY IF A STRIKE HAPPENED.",
    breaks: "D1 — a cancelled prompt refunds the reaction and disables the button anyway"
  },
  {
    file: OPP,
    name: "the reaction is spent twice, once per door",
    from: '  await spendReaction(reactor, "Attack of Opportunity", { traits: "Attack" });',
    to: '  await spendReaction(reactor, "Attack of Opportunity", { traits: "Attack" });\n  await spendReaction(reactor, "Attack of Opportunity", { traits: "Attack" });',
    breaks: "B4 — the shared rule stops being the only place it happens"
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

const guard = guardFiles([OPP, FEATS, ACTIONS, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-opportunity-doors: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-opportunity-doors: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-opportunity-doors: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
