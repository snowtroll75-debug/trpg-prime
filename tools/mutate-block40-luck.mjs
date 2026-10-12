#!/usr/bin/env node
/**
 * mutate-block40-luck — can verify-block40-luck fail?
 *
 * NEW at 3.624.0. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const LUCK = at("module", "luck.mjs");
const FLOW = at("module", "luck-workflow.mjs");
const CHECK = at("module", "dice", "check.mjs");
const CARDS = at("module", "dice", "check-card-interactions.mjs");
const FEATS = at("module", "feats-workflow.mjs");
const DIALOG = at("module", "apps", "check-dialog.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const ACTOR = at("module", "documents", "actor.mjs");
const MIGRATION = at("module", "migration.mjs");
const RES = at("module", "magic", "resurrection.mjs");
const VERIFY = at("tools", "verify-block40-luck.mjs");

const MUTATIONS = [
  { file: LUCK, name: "THE OLD DEFECT: the floor raises a score of 0 or 1 to 2", from: "  if (value <= MINIMUM_LUCK) return value;\n", to: "", breaks: "A2" },
  { file: LUCK, name: "R14: THE OLD DEFECT — only an item called \"Halfling Luck\" counts", from: "/^(luck of the small folk|halfling luck)$/i", to: "/^halfling luck$/i", breaks: "A4" },
  { file: LUCK, name: "R11: luck any number of times a round", from: "  if (spent && current && spent.combatId === current.combatId && spent.round === current.round) {", to: "  if (false) {", breaks: "A10/C1" },
  { file: LUCK, name: "R12: luck beside Conviction", from: "  if (convictionTouched) {", to: "  if (false) {", breaks: "A12/C3" },
  { file: LUCK, name: "R12: luck on a check a Chance effect already altered", from: "  if (chanceUsed) {", to: "  if (false) {", breaks: "A13" },
  { file: LUCK, name: "R11: luck reaches a Spellcraft check", from: "export const LUCK_CHECK_TYPES = Object.freeze([\"skill\", \"attack\", \"save\"]);", to: "export const LUCK_CHECK_TYPES = Object.freeze([\"skill\", \"attack\", \"save\", \"spellcraft\"]);", breaks: "A8/B13" },
  { file: LUCK, name: "R11: a Fumble is always Disadvantage, never the worse", from: "  if (minus.total < disadvantaged.total) {", to: "  if (false) {", breaks: "A15/B7" },
  { file: LUCK, name: "R11: a Fumble's Disadvantage ignores an Advantage already on the roll", from: "  const disadvantaged = bias === \"advantage\"\n    ? { index: 0, total: first }\n    : { index: lowIndex, total: low };", to: "  const disadvantaged = { index: lowIndex, total: low };", breaks: "A16" },
  { file: LUCK, name: "R15: a 90 regains luck too", from: "  return Number(modifiedResult) > 90;", to: "  return Number(modifiedResult) >= 90;", breaks: "A18" },
  { file: LUCK, name: "R16: a GM's typed NPC luck is wiped too", from: "  return Number(luck) === INITIAL_LUCK ? 0 : null;", to: "  return 0;", breaks: "A20" },
  { file: FLOW, name: "R11: a successful luck check gives no Advantage", from: "    check.bias = resolveBias(check.bias, [\"advantage\"], BIAS);\n", to: "", breaks: "B1/B10" },
  { file: FLOW, name: "R12: luck leaves the check open to other Chance effects", from: "  check.chanceUsed = \"Luck\";\n", to: "", breaks: "B2" },
  { file: FLOW, name: "R11: a Fumble changes nothing", from: "    check.luckFumble = true;\n", to: "", breaks: "B6" },
  { file: CHECK, name: "R11: the Fumble never rolls the second die", from: "    if (this.bias !== BIAS.NORMAL || this.luckFumble) {", to: "    if (this.bias !== BIAS.NORMAL) {", breaks: "B7/B8" },
  { file: CHECK, name: "R11: a reroll adds a second fumble line", from: "      this.modifiers = this.modifiers.filter((m) => !m.luckFumble);\n", to: "", breaks: "B9" },
  { file: CHECK, name: "R11: THE OLD DEFECT — TRGCheck never applies luck", from: "      const said = await applyLuckToCheck(check, { requested: check.useLuck });", to: "      const said = [];", breaks: "B10/B12" },
  { file: CHECK, name: "R12: the card forgets luck changed it", from: "              luckUsed: Boolean(this.luckUsed),", to: "              luckUsed: false,", breaks: "B11" },
  { file: FLOW, name: "R11: armed luck is never used up", from: "  if (armed) await actor.unsetFlag(SYSTEM_ID, ARMED_FLAG);\n", to: "", breaks: "B12" },
  { file: FLOW, name: "A8: THE OLD DEFECT — the luck check is generic again", from: "    type: \"luck\",\n    dc,", to: "    type: \"generic\",\n    dc,", breaks: "B15" },
  { file: FLOW, name: "R11: the round is never stamped", from: "  const round = currentRound();\n  if (round) await actor.setFlag(SYSTEM_ID, SPENT_FLAG, round);\n  const { outcome, currentLuck, newLuck } = await rollTheLuckCheck(actor, check.label);", to: "  const { outcome, currentLuck, newLuck } = await rollTheLuckCheck(actor, check.label);", breaks: "C1" },
  { file: CARDS, name: "R12: the Conviction Bonus is offered on a luck card", from: "    !raw.bonusUsed &&\n    // LUCK OR CONVICTION, NOT BOTH (3.624.0, block 40's R12).\n    !raw.luckUsed &&", to: "    !raw.bonusUsed &&", breaks: "C6" },
  { file: CARDS, name: "R12: Unbreakable Resolve rerolls a luck card", from: "  if (raw.luckUsed) return;\n", to: "", breaks: "C7" },
  { file: FLOW, name: "R12: the luck check's own card hides the check it was for", from: "    if (!raw || raw.type === \"luck\") return false;", to: "    if (!raw) return false;", breaks: "C8" },
  { file: FEATS, name: "R12: Luck of the Small Folk rerolls a luck-touched check", from: "      if (lastCheckTouchedByLuck(actor)) {", to: "      if (false) {", breaks: "C10" },
  { file: DIALOG, name: "R11: the dialog's Use Luck box is never read", from: "    useLuck: Boolean(result.useLuck),\n", to: "", breaks: "C11" },
  { file: FLOW, name: "R15: an NPC's injury regains luck", from: "  if (!luckEnabled() || struck?.type !== \"character\") return \"\";", to: "  if (!luckEnabled()) return \"\";", breaks: "D2" },
  { file: ATTACK, name: "R15: an Ambush re-read regains luck again", from: "  if (forced === null) {\n    const { regainLuckFromInjury }", to: "  if (true) {\n    const { regainLuckFromInjury }", breaks: "D3" },
  { file: ACTOR, name: "R16: a new NPC keeps the player's 15", from: "    if (luck !== null) update[\"system.resources.luck.value\"] = luck;\n", to: "", breaks: "E1" },
  { file: MIGRATION, name: "R16: the world's NPCs keep the player's 15", from: "    () => migrateNpcLuck(actors, tokenActors))) ?? [];", to: "    () => []) ?? []);", breaks: "E2" },
  { file: RES, name: "R17: THE OLD DEFECT — Resurrection empties luck", from: "  \"system.resources.conviction.value\": 0\n});", to: "  \"system.resources.conviction.value\": 0,\n  \"system.resources.luck.value\": 0\n});", breaks: "F1" }
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
    process.stderr.write("mutate-block40-luck: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-block40-luck: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block40-luck: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
