#!/usr/bin/env node
/**
 * mutate-action-default-dc — can verify-action-default-dc fail?
 *
 * NEW at 3.422.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT: Study Target reaching its roll with no DC,
 * resolving to no degree, and recording nothing — silently, every time.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "combat", "action-default-dc.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const DATA = path.join(SYSTEM_ROOT, "module", "data", "skill-actions.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-action-default-dc.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT.
    file: RULE,
    name: "THE SHIPPED DEFECT: Study Target goes back to having no DC",
    from: '  "studyTarget",\n',
    to: "",
    breaks: "B5/B7 — degree:null, so the target is never recorded and nothing says so"
  },
  {
    file: RULE,
    name: "the fallback list is emptied entirely",
    // ANCHORED ON THE OPENING LINE ALONE since 3.565.0. The whole
    // literal was the anchor, and it broke the moment the list grew from
    // six entries to ten — a mutation that cannot find its target is a
    // mutation that proves nothing, and it reported ANCHOR MISSING
    // rather than failing loudly. A growing list is exactly what
    // verify-mutation-anchors warns about anchoring on.
    from: 'export const DEGREE_GATED_WITHOUT_DC = Object.freeze([\n  "create",',
    to: 'export const DEGREE_GATED_WITHOUT_DC = Object.freeze([]);\nconst UNUSED_DEGREE_GATED = Object.freeze([\n  "create",',
    breaks: "B5/B8 — all ten actions inert again"
  },
  {
    // THE DANGEROUS DIRECTION. A default that overrides a real DC would
    // replace every target's Defence in the game with level + 14.
    file: RULE,
    name: "the default overrides a DC something else already resolved",
    from: "  if (resolvedDC !== null && resolvedDC !== undefined) return resolvedDC;",
    to: "  if (false) return resolvedDC;",
    breaks: "A4 — a target's Defence, a fixed DC and Learn a Spell's band all overwritten"
  },
  {
    // A TRUTHINESS TEST. DC 0 is a legitimate GM decision and falsy.
    file: RULE,
    name: "a resolved DC of zero is treated as no DC",
    from: "  if (resolvedDC !== null && resolvedDC !== undefined) return resolvedDC;",
    to: "  if (resolvedDC) return resolvedDC;",
    breaks: "A5 — right for every DC but the one a GM sets to zero"
  },
  {
    file: RULE,
    name: "the fallback ignores the action's target",
    from: "  return against === \"none\" && DEGREE_GATED_WITHOUT_DC.includes(String(actionKey ?? \"\"));",
    to: "  return DEGREE_GATED_WITHOUT_DC.includes(String(actionKey ?? \"\"));",
    breaks: "A7 — an action that gains a real target keeps being handed level + 14"
  },
  {
    file: RULE,
    name: "Medium becomes Hard",
    from: "const MEDIUM_DIFFICULTY_MODIFIER = 0;",
    to: "const MEDIUM_DIFFICULTY_MODIFIER = 2;",
    breaks: "A2 — Graham's ruling was Medium, and a silent +2 is a rules change"
  },
  {
    file: RULE,
    name: "the DC stops scaling with level",
    from: "  return levelDC(level) + MEDIUM_DIFFICULTY_MODIFIER;",
    to: "  return 15;",
    breaks: "A2/A3 — a flat DC is not a rung on the Difficulty Modifier Table"
  },
  {
    // THE WIRING. Handing it null instead of the resolved DC removes the
    // one guard that keeps this off every targeted action in the game.
    file: FLOW,
    name: "the fallback stops being told what was already resolved",
    from: "    resolvedDC: resolved.dc,\n    level: Number(actor.system?.identity?.level ?? 0)",
    to: "    resolvedDC: null,\n    level: Number(actor.system?.identity?.level ?? 0)",
    breaks: "C2 — every target's Defence becomes overridable by level + 14"
  },
  {
    file: FLOW,
    name: "the workflow stops asking for a fallback at all",
    from: "  const suggestedDC = defaultActionDC({",
    to: "  const suggestedDC = (() => null)({",
    breaks: "C1 — the rule exists and nothing calls it"
  },
  {
    // THE DEFECT THE LIVE TEST FOUND ON 3.423.0, restored: assigning the
    // suggestion means a deliberate "Set by the GM" falls through the
    // `??` onto it and is silently ignored.
    file: FLOW,
    name: "THE LIVE DEFECT: the suggestion is written onto the resolved DC",
    from: "  let finalDC = situational\n    ? situational.dc ?? resolved.dc\n    : resolved.dc ?? suggestedDC;",
    to: "  if (resolved.dc === null && suggestedDC !== null) resolved.dc = suggestedDC;\n  let finalDC = situational?.dc ?? resolved.dc;",
    breaks: "E1/E3 — a GM choosing 'Set by the GM' is overruled without being told"
  },
  {
    file: FLOW,
    name: "the dialog is no longer pre-filled with the suggestion",
    from: "      dc: resolved.dc ?? suggestedDC,",
    to: "      dc: resolved.dc,",
    breaks: "E2 — the dialog opens on 'Set by the GM' again and nothing resolves"
  },
  {
    // THE OTHER HALF. Inside the dialog branch the original `??` must
    // survive, or a deliberate "unknown" erases a target's real Defence.
    file: FLOW,
    name: "a deliberate 'unknown' erases a real target's DC",
    from: "    ? situational.dc ?? resolved.dc",
    to: "    ? situational.dc",
    breaks: "E4 — an attack against a Defence would roll against nothing"
  },
  {
    // RE-AIMED AT THE RULE, NOT THE LINE (3.509.0). Its predecessor
    // anchored on `if (suggestedDC !== null && finalDC === suggestedDC)`
    // — the condition that WAS the defect. The mutation was caught and
    // the check it broke was E5, which grepped for that same text. A
    // mutation and a check agreeing about a wrong line prove only that
    // they agree.
    file: RULE,
    name: "A RESOLVED DC IS CAPTIONED AS THE TABLE'S — 47 cards did this",
    from: "  if (resolvedDC !== null && resolvedDC !== undefined) return false;",
    to: "  ;",
    breaks: "E5b/E5c/E6 — Kip Up's fixed 20 called \"Medium (level 3 + 14)\""
  },
  {
    file: RULE,
    name: "the GM's own number is captioned as the table's",
    from: "  return finalDC === suggestedDC;",
    to: "  return true;",
    breaks: "E5d — the rule the old comment stated and the old condition did not test"
  },
  {
    file: RULE,
    name: "an action with no suggestion is captioned anyway",
    from: "  if (suggestedDC === null || suggestedDC === undefined) return false;",
    to: "  ;",
    breaks: "E5e — a caption for a DC this module never supplied"
  },
  {
    /*
     * THE WORKFLOW MUTATION WAS WRITTEN, SURVIVED, AND WAS DESIGNED OUT.
     *
     * It put the old broken condition back in `action-workflow.mjs` and
     * nothing failed — the harness cannot reach that file. The repair
     * was NOT a grep asserting the call site, because a grep for a
     * condition is exactly what E5 was and exactly how this shipped.
     *
     * The workflow now asks `defaultDCCaption` for a caption and uses
     * one if given. There is no condition there to get wrong, so this
     * mutates the only place the rule still lives.
     */
    file: RULE,
    name: "THE CAPTION IS HANDED OUT REGARDLESS",
    from: "  return labelIsDefault(state) ? defaultDCLabel(level) : null;",
    to: "  return defaultDCLabel(level);",
    breaks: "E7 — every card captioned, which is the defect this release fixes"
  },
  {
    // THE RATCHET'S OWN ANCHOR. If the outcome section cannot be found,
    // every derived claim would pass against an empty string.
    file: FLOW,
    name: "the outcome section is renamed out from under the ratchet",
    from: "async function applyActionOutcome({",
    to: "async function applyActionOutcomeRenamed({",
    breaks: "B1/B2 — a check that cannot locate its subject must fail, not pass"
  },
  {
    file: DATA,
    name: "Study Target stops declaring against:none",
    from: '    skills: ["arcana", "crafting", "culture", "nature", "occultism", "planes", "religion"],\n    traits: "Concentrate",',
    to: '    skills: ["arcana", "crafting", "culture", "nature", "occultism", "planes", "religion"],\n    against: "willDC",\n    traits: "Concentrate",',
    breaks: "B6 — a listed action that gained a target no longer needs the fallback"
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

const guard = guardFiles([RULE, FLOW, DATA, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-action-default-dc: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-action-default-dc: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-action-default-dc: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
