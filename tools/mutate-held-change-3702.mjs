#!/usr/bin/env node
/** mutate-held-change-3702 — the mutation half of verify-held-change-3702 (drawing and putting away in combat). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const HC = M("combat", "held-change.mjs");
const HW = M("combat", "held-change-workflow.mjs");
const AW = M("combat", "action-workflow.mjs");
const AS = M("sheets", "actor-sheet.mjs");
const IS = M("sheets", "item-sheet.mjs");
const BA = M("data", "basic-actions.mjs");
const MUTATIONS = [
  { name: "A out of combat is an action too", file: HC, from: "  if (!combatStarted || !actorInCombat || !item) return false;", to: "  if (!item) return false;" },
  { name: "A anything at all is an action", file: HC, from: "  return Number(hands ?? 0) > 0;", to: "  return true;" },
  { name: "B the sack is not emptied", file: HC, from: "  if (item?.system?.stowed) changes[\"system.stowed\"] = false;\n", to: "" },
  { name: "B the grip is dropped", file: HC, from: "  if (grip !== null && grip !== undefined) changes[\"system.twoHandedGrip\"] = grip;\n", to: "" },
  { name: "C 'just set it' still charges", file: HW, from: "    if (how === \"set\") return { handled: false, changed: false };\n", to: "" },
  { name: "C a GM is never asked", file: HW, from: "  if (game.user?.isGM) {", to: "  if (false) {" },
  { name: "C a draw is free", file: HW, from: "  if (!isAction) return { handled: false, changed: false };", to: "  return { handled: false, changed: false };" },
  { name: "C a drop is charged as an Interact", file: HW, from: "    await resolveAction(actor, release, { heldChange: { item, equip: false } });", to: "    await resolveAction(actor, interact, { heldChange: { item, equip: false, changes: { \"system.equipped\": false } } });" },
  { name: "C a sheathe is the free Release", file: HW, from: "    await resolveAction(actor, interact, { heldChange: { item, equip: false, changes: { \"system.equipped\": false } } });", to: "    await resolveAction(actor, release, { heldChange: { item, equip: false } });" },
  { name: "C a cancel still changes it", file: HW, from: "  } else {\n    return { handled: true, changed: false };\n  }", to: "  } else {\n    await resolveAction(actor, release, { heldChange: { item, equip: false } });\n  }" },
  { name: "D Release asks again which item", file: AW, from: "    if (action.key === \"release\" && heldChange?.item) {\n      releaseChoice = { item: heldChange.item };\n    } else if", to: "    if" },
  { name: "D Interact never changes the item", file: AW, from: "      await heldChange.item.update(heldChange.changes);\n", to: "" },
  { name: "D the card says nothing", file: AW, from: "      lines.push(line(heldChangeLine(heldChange.item.name, Boolean(heldChange.equip))));\n", to: "" },
  { name: "D Interact made exempt from provoking", file: BA, from: "    name: \"Interact\",\n    traits: \"Manipulate\",\n", to: "    name: \"Interact\",\n    traits: \"Manipulate\",\n    provokeExempt: true,\n" },
  { name: "E the character sheet changes freely in combat", file: AS, from: "    if (routed.handled) {\n      if (routed.changed && lightSourceKeyForItem(item)) {", to: "    if (false) {\n      if (routed.changed && lightSourceKeyForItem(item)) {" },
  { name: "E the grip is not passed on", file: AS, from: "      grip: changes[\"system.twoHandedGrip\"] ?? null", to: "      grip: null" },
  { name: "E the item sheet's box stays free", file: IS, from: "      if (isAction) {\n        if (flat)", to: "      if (false) {\n        if (flat)" },
  { name: "E the item sheet skips the hands", file: IS, from: "        if (wanted) {\n          const { canEquip }", to: "        if (false) {\n          const { canEquip }" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-held-change-3702.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-held-change-3702: verify-held-change-3702 already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-held-change-3702: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-held-change-3702: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
