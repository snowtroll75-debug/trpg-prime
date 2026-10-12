#!/usr/bin/env node
/**
 * mutate-turn-automation — can verify-turn-automation fail?
 *
 * NEW at 3.430.1. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT, restored exactly: `startCombat` asking the
 * acting-GM question. #2 is the same for `nextTurn`.
 *
 * #4 IS THE OPPOSITE MISTAKE, and it is the one that makes this a split
 * rather than a replacement: dropping `isActingGM` from the BROADCAST
 * side would book every turn twice at a two-GM table. A fix that traded
 * one two-GM bug for another would not be a fix.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "combat", "turn-automation.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-turn-automation.mjs");

const MUTATIONS = [
  {
    file: COMBAT,
    name: "THE SHIPPED DEFECT: startCombat asks which GM Foundry designated",
    from: "    if (!TRGCombat.automatesInvoked) return super.startCombat();",
    to: "    if (!TRGCombat.automates) return super.startCombat();",
    breaks: "D1 — no surprise prompt and no round-1 Flat-Footed for the second GM"
  },
  {
    file: COMBAT,
    name: "THE SHIPPED DEFECT, second half: nextTurn asks it too",
    from: "    if (!TRGCombat.automatesInvoked\n      || !surpriseRoundInEffect(",
    to: "    if (!TRGCombat.automates\n      || !surpriseRoundInEffect(",
    breaks: "D2 — the surprise round stops skipping surprised combatants"
  },
  {
    file: RULE,
    name: "the invoked decision starts consulting the acting GM again",
    from: "function automatesInvoked({ enabled = false, isGM = false } = {}) {\n  return Boolean(enabled) && Boolean(isGM);",
    to: "function automatesInvoked({ enabled = false, isGM = false, isActingGM = false } = {}) {\n  return Boolean(enabled) && Boolean(isGM) && Boolean(isActingGM);",
    breaks: "A4/C1/C3 — the parameter is the whole defect, however it is spelled"
  },
  {
    file: RULE,
    name: "THE OPPOSITE MISTAKE: the broadcast decision stops consulting it",
    from: "  return Boolean(enabled) && Boolean(isActingGM);",
    to: "  return Boolean(enabled) || Boolean(isActingGM);",
    breaks: "B2/B3 — a two-GM table applies every turn's bookkeeping twice"
  },
  {
    file: RULE,
    name: "a player may drive combat",
    from: "  return Boolean(enabled) && Boolean(isGM);",
    to: "  return Boolean(enabled);",
    breaks: "A3 — anyone can begin a combat and prompt everyone for surprise"
  },
  {
    file: RULE,
    name: "the automation setting stops mattering",
    from: "function automatesInvoked({ enabled = false, isGM = false } = {}) {\n  return Boolean(enabled) && Boolean(isGM);",
    to: "function automatesInvoked({ isGM = false } = {}) {\n  return Boolean(isGM);",
    breaks: "A2 — a GM who switched automation off gets it anyway"
  },
  {
    file: COMBAT,
    name: "the turn callbacks stop asking anything",
    from: "    return automatesBroadcast({",
    to: "    return true || automatesBroadcast({",
    breaks: "D5 — the getter no longer answers from the rule it names"
  },
  {
    file: COMBAT,
    name: "the switch is read in two places again",
    from: "      return Boolean(game.settings.get(SYSTEM_ID, \"turnAutomation\"));",
    to: "      if (game.settings.get(SYSTEM_ID, \"turnAutomation\")) return Boolean(game.settings.get(SYSTEM_ID, \"turnAutomation\"));\n      return false;",
    breaks: "D6 — two readings of one switch is how the two uses came to disagree"
  },
  {
    file: COMBAT,
    name: "_onStartTurn is switched to the invoked form",
    from: "  async _onStartTurn(combatant) {\n    await super._onStartTurn(combatant);\n    if (!TRGCombat.automates) return;",
    to: "  async _onStartTurn(combatant) {\n    await super._onStartTurn(combatant);\n    if (!TRGCombat.automatesInvoked) return;",
    breaks: "D3 — a callback that fires on every client must ask which GM is acting"
  },
  {
    file: COMBAT,
    name: "_onEndTurn is switched to the invoked form",
    from: "  async _onEndTurn(combatant, context) {\n    await super._onEndTurn(combatant, context);\n    if (!TRGCombat.automates) return;",
    to: "  async _onEndTurn(combatant, context) {\n    await super._onEndTurn(combatant, context);\n    if (!TRGCombat.automatesInvoked) return;",
    breaks: "D4 — same, at the other end of the turn"
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

const guard = guardFiles([RULE, COMBAT, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-turn-automation: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-turn-automation: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-turn-automation: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
