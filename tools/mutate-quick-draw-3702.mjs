#!/usr/bin/env node
/** mutate-quick-draw-3702 — the mutation half of verify-quick-draw-3702 (Quick Draw draws its weapon). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const ST = M("combat", "strike.mjs");
const AF = M("combat", "action-feats.mjs");
const WF = M("combat", "action-feats-workflow.mjs");
const MUTATIONS = [
  { name: "A a weapon in hand can be drawn again", file: ST, from: "if (item?.type !== \"weapon\" || item.system?.natural || item.system?.equipped) return false;", to: "if (item?.type !== \"weapon\" || item.system?.natural) return false;" },
  { name: "A a natural attack can be drawn", file: ST, from: "if (item?.type !== \"weapon\" || item.system?.natural || item.system?.equipped) return false;", to: "if (item?.type !== \"weapon\" || item.system?.equipped) return false;" },
  { name: "A a bow can be drawn", file: ST, from: "    return mode === \"melee\" || thrown;\n", to: "    return true;\n" },
  { name: "A the Thrown trait is ignored", file: ST, from: "const thrown = mode === \"thrown\" || /\\bthrown\\b/i.test(String(item.system?.traits ?? \"\"));", to: "const thrown = mode === \"thrown\";" },
  { name: "B nothing to draw goes ahead", file: ST, from: "    ui.notifications.warn(`${label}: you have no melee or thrown weapon to draw — every one is already in hand. Use Strike instead.`);\n    return null;", to: "    ui.notifications.warn(`${label}: you have no melee or thrown weapon to draw — every one is already in hand. Use Strike instead.`);" },
  { name: "B one weapon still asks", file: ST, from: "  if (drawable.length === 1) return drawable[0];\n", to: "" },
  { name: "B the chooser offers the held weapons", file: ST, from: "  const drawable = drawableWeapons(Array.from(actor?.items ?? []));", to: "  const drawable = usableAttacks(Array.from(actor?.items ?? []));" },
  { name: "C the AP is paid before the weapon is settled", file: WF, from: "    const drawn = await readyToDraw(actor, entry.label);\n    if (!drawn) return null;\n    await spendActionCost(actor, entry.apCost, entry.label, { traits: entry.traits });", to: "    await spendActionCost(actor, entry.apCost, entry.label, { traits: entry.traits });\n    const drawn = await readyToDraw(actor, entry.label);\n    if (!drawn) return null;" },
  { name: "C the drawing path is never taken", file: WF, from: "  if (entry.draws) {", to: "  if (false) {" },
  { name: "C full hands do not refuse", file: WF, from: "  if (!hands.allowed) {\n    ui.notifications.warn(`${label}: ${hands.reason} Release something first.`);\n    return null;\n  }", to: "  if (!hands.allowed) {\n    ui.notifications.warn(`${label}: ${hands.reason} Release something first.`);\n  }" },
  { name: "C a cancelled grip goes ahead", file: WF, from: "    grip = await promptTwoHandedGrip(weapon.name, Boolean(weapon.system?.twoHandedGrip));\n    if (grip === null) return null;", to: "    grip = await promptTwoHandedGrip(weapon.name, Boolean(weapon.system?.twoHandedGrip));" },
  { name: "D the weapon is never put in hand", file: WF, from: "      await weapon.update(changes);\n", to: "" },
  { name: "D a stowed weapon stays in the sack", file: WF, from: "      if (weapon.system?.stowed) changes[\"system.stowed\"] = false;\n", to: "" },
  { name: "D the grip is dropped", file: WF, from: "      if (drawn.grip !== null && drawn.grip !== undefined) changes[\"system.twoHandedGrip\"] = drawn.grip;\n", to: "" },
  { name: "D a refused Strike is not explained", file: WF, from: "      checks.refused ? line(`<em>${esc(weapon?.name ?? \"The weapon\")} stays in hand: the draw happened even though the Strike did not.</em>`) : \"\"", to: "      \"\"" },
  { name: "D the old fallback to a held weapon returns", file: WF, from: "    const weapon = drawn?.weapon ?? null;", to: "    const weapon = drawn?.weapon ?? meleeWeapon(actor);" },
  { name: "E the table no longer marks Quick Draw as drawing", file: AF, from: "    draws: true,\n    summary: \"Draw a melee or thrown weapon", to: "    summary: \"Draw a melee or thrown weapon" },
  { name: "E Quick Draw back in the held-melee chooser", file: WF, from: "  \"combat grapple\", \"distracting strike\", \"reverse strike\",", to: "  \"combat grapple\", \"distracting strike\", \"quick draw\", \"reverse strike\"," }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-quick-draw-3702.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-quick-draw-3702: verify-quick-draw-3702 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-quick-draw-3702: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-quick-draw-3702: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
