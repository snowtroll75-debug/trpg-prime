#!/usr/bin/env node
/**
 * mutate-block38-rewards — can verify-block38-rewards fail?
 *
 * NEW at 3.619.0. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const REWARDS = at("module", "rewards.mjs");
const WEALTH = at("module", "starting-wealth.mjs");
const WEALTH_WF = at("module", "starting-wealth-workflow.mjs");
const CONV = at("module", "conviction.mjs");
const ACTOR = at("module", "documents", "actor.mjs");
const AP_WF = at("module", "combat", "action-points-workflow.mjs");
const CHECK = at("module", "dice", "check.mjs");
const CARD = at("module", "dice", "check-card-interactions.mjs");
const FEATS_WF = at("module", "feats-workflow.mjs");
const TRAITS = at("module", "traits.mjs");
const AWARD = at("module", "endeavour-award.mjs");
const PARTY_WF = at("module", "party-rewards-workflow.mjs");
const PARTY = at("module", "sheets", "party-sheet.mjs");
const THIEVERY = at("module", "thievery.mjs");
const ACTION = at("module", "combat", "action-workflow.mjs");
const DIALOG = at("module", "apps", "check-dialog.mjs");
const VERIFY = at("tools", "verify-block38-rewards.mjs");

const MUTATIONS = [
  { file: REWARDS, name: "R1 — THE PRINTED DIRECTION: APL − EL", from: "  const difference = whole(el) - whole(apl);", to: "  const difference = whole(apl) - whole(el);", breaks: "A3/A4/A5" },
  { file: REWARDS, name: "a creature nine below is still worth 20 at ten", from: "  if (difference < LOWEST_DIFFERENCE) return { xp: 0, difference, beyond: \"below\" };", to: "", breaks: "A6" },
  { file: REWARDS, name: "the Hard budget is printed wrong", from: "  { key: \"hard\", label: \"Hard\", xp: 300 },", to: "  { key: \"hard\", label: \"Hard\", xp: 250 },", breaks: "A1" },
  { file: REWARDS, name: "APL truncates", from: "  return { apl: Math.floor(exact + 0.5), exact:", to: "  return { apl: Math.floor(exact), exact:", breaks: "A8" },
  { file: REWARDS, name: "Effective Level ignores the GM's box", from: "  if (typed > 0) return typed;", to: "", breaks: "A9" },
  { file: REWARDS, name: "a count is ignored", from: "    return { ...creature, count, xpEach: each.xp, xp: each.xp * count,", to: "    return { ...creature, count, xpEach: each.xp, xp: each.xp,", breaks: "A10" },
  { file: REWARDS, name: "the remainder is shared out", from: "  return { each: Math.floor(xp / n), remainder: xp % n };", to: "  return { each: Math.ceil(xp / n), remainder: 0 };", breaks: "B2" },
  { file: PARTY_WF, name: "an NPC member's share is written too", from: "    if (actor.type !== \"character\") {", to: "    if (false) {", breaks: "B3" },
  { file: WEALTH, name: "R5 — 5th level starts with 1,000", from: "  2: 250, 3: 500, 4: 1000, 5: 2500,", to: "  2: 250, 3: 500, 4: 1000, 5: 1000,", breaks: "C1/C2" },
  { file: WEALTH_WF, name: "the payout ignores the level", from: "  const wealth = startingWealthFor(actor);", to: "  const wealth = wealthScore(actor);", breaks: "C3" },
  { file: REWARDS, name: "Treasure by Level's magic items at APL 20", from: "  20: { gp: 3600000, items: 70 }", to: "  20: { gp: 3600000, items: 64 }", breaks: "C4" },
  { file: CONV, name: "R7 — a level brings no point", from: "  if (!gained) return current;", to: "  return current;", breaks: "D1" },
  { file: ACTOR, name: "the XP update never asks", from: "    this.#convictionOnLevelling(changed, options);", to: "", breaks: "D2" },
  { file: ACTOR, name: "Hero's Fortune adds nothing", from: "        heroesFortuneBonus(this) +", to: "        0 +", breaks: "D3" },
  { file: ACTOR, name: "A3 — a typed −1 persists", from: "    if (typedConviction !== undefined && !(Number(typedConviction) >= 0)) {", to: "    if (false) {", breaks: "D4" },
  { file: CONV, name: "Boost Defence after AP is spent", from: "  if (apSpent && apSpent.combatId === current.combatId && apSpent.round === current.round) {", to: "  if (false) {", breaks: "D5" },
  { file: AP_WF, name: "the AP spend stamps nothing", from: "    [`flags.${SYSTEM_ID}.apSpentRound`]: { combatId: game.combat.id, round: game.combat.round, turn: game.combat.turn }", to: "", breaks: "D6" },
  { file: CONV, name: "Recurring Healing is free", from: "  await spendActionPoints(actor, RECURRING_HEALING_AP, \"Recurring Healing\");", to: "", breaks: "D7" },
  { file: ACTOR, name: "an NPC's pool is derived again", from: "    if (conviction && this.type !== \"npc\") {", to: "    if (conviction) {", breaks: "D8" },
  { file: CONV, name: "THE OLD DEFECT: a maximum of 0 reads as 1", from: "  const max = Math.max(0, Number(resource.max ?? 0) || 0);", to: "  const max = Number(resource.max ?? 0) || 1;", breaks: "D10" },
  { file: CONV, name: "switched off, the point is still spent", from: "  if (!convictionEnabled()) {\n    return {", to: "  if (false) {\n    return {", breaks: "D11" },
  { file: DIALOG, name: "the dialog offers Advantage in a world without Conviction", from: "    if (state.value > 0 && convictionEnabled()) conviction = state;", to: "    if (state.value > 0) conviction = state;", breaks: "D9" },
  { file: FEATS_WF, name: "THE OLD DEFECT: Dramatic Luck skips the gate", from: "      if (!state.ok) {\n        ui.notifications.warn(`Dramatic Luck: ${state.reason}`);\n        return;\n      }", to: "", breaks: "E1" },
  { file: TRAITS, name: "the Conviction trait ignores the round's spend", from: "  if (hasTrait(action, \"conviction\") && convictionSpentThisRound) {", to: "  if (false) {", breaks: "E2" },
  { file: CHECK, name: "Luck of Heroes is never rolled for Advantage", from: "      if (advantageSpent) advantageKept = await luckOfHeroes(check.actor, \"advantage\");", to: "", breaks: "F2" },
  { file: CHECK, name: "a kept point is refunded twice", from: "    if (advantageSpent && !advantageKept && check.actor &&", to: "    if (advantageSpent && check.actor &&", breaks: "F2" },
  { file: CARD, name: "Luck of Heroes is never rolled for the Bonus", from: "  await luckOfHeroes(actor, \"bonus\");", to: "", breaks: "F3" },
  { file: CONV, name: "Luck of Heroes reaches every spend", from: "const LUCK_OF_HEROES_SPENDS = Object.freeze([\"advantage\", \"bonus\"]);", to: "const LUCK_OF_HEROES_SPENDS = Object.freeze([\"advantage\", \"bonus\", \"surge\"]);", breaks: "F1" },
  { file: PARTY_WF, name: "Begin Session overfills the pool", from: "      if (value >= max) {", to: "      if (false) {", breaks: "F5" },
  { file: AWARD, name: "a plain success offers the Heroic rows", from: "  heroic: { amount: 1, label: \"Heroic success without risk\", degrees: [\"heroic\"] },", to: "  heroic: { amount: 1, label: \"Heroic success without risk\", degrees: [\"heroic\", \"success\"] },", breaks: "H2" },
  { file: AWARD, name: "a card awards twice", from: "  if (message.getFlag(SYSTEM_ID, ENDEAVOUR_AWARD_FLAG)) return null;", to: "", breaks: "H4" },
  { file: AWARD, name: "an award is offered with the rule off", from: "  return Boolean(characterCard && enabled && !alreadyAwarded && !flat);", to: "  return Boolean(characterCard && !alreadyAwarded && !flat);", breaks: "H3" },
  { file: PARTY, name: "an adversary dropped on Rewards joins the roster", from: "    if (data?.type === \"Actor\" && this.tabGroups?.primary === \"rewards\") {", to: "    if (false) {", breaks: "I3" },
  { file: ACTOR, name: "F1 — the maximum reads the stored level again", from: "      conviction.max = convictionMax(baseLevel) +", to: "      conviction.max = convictionMax(this.system.identity?.level ?? 0) +", breaks: "L1" },
  { file: AWARD, name: "F2 — the buttons are appended three times", from: "  if (card.querySelector(\".endeavour-award\")) return;\n", to: "", breaks: "L2" },
  { file: ACTION, name: "F3 — the card's degree is counted", from: "    const earned = disableSuccesses(disableDegree);", to: "    const earned = disableSuccesses(degree);", breaks: "L3" },
  { file: THIEVERY, name: "THE OLD DEFECT: a Heroic earns two", from: "  if (key === \"heroic\") return 3;", to: "  if (key === \"heroic\") return 2;", breaks: "J1" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-block38-rewards: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-block38-rewards: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block38-rewards: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
