#!/usr/bin/env node
/**
 * mutate-drive-36221 — can verify-drive-36221 fail?
 *
 * NEW at 3.622.2. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const LS = at("module", "magic", "light-shift.mjs");
const WF = at("module", "magic", "light-shift-workflow.mjs");
const ACTIVE = at("module", "magic", "active-spells.mjs");
const SHEET = at("module", "sheets", "actor-sheet.mjs");
const MAIN = at("scripts", "trg-prime.mjs");
const ACTION = at("module", "combat", "action-workflow.mjs");
const TREC = at("module", "combat", "turn-records.mjs");
const VERIFY = at("tools", "verify-drive-36221.mjs");

const MUTATIONS = [
  // A — R1
  { file: LS, name: "F1 — THE OLD DEFECT: no circle follows its creature", from: "    if (!flags.lightShift || flags[LIGHT_SHIFT_ANCHOR_FLAG] !== tokenId) continue;", to: "    if (true) continue;", breaks: "A1" },
  { file: LS, name: "every circle follows every token", from: "    if (!flags.lightShift || flags[LIGHT_SHIFT_ANCHOR_FLAG] !== tokenId) continue;", to: "    if (!flags.lightShift) continue;", breaks: "A1" },
  { file: LS, name: "the move loses the radius", from: "    out.push({ _id: region.id, shapes: [{ ...shape, x: centre.x, y: centre.y }] });", to: "    out.push({ _id: region.id, shapes: [{ type: shape.type, x: centre.x, y: centre.y }] });", breaks: "A1" },
  { file: LS, name: "the centre is the token's corner", from: "    x: Number(doc?.x ?? 0) + (Number(doc?.width ?? 1) * size) / 2,", to: "    x: Number(doc?.x ?? 0),", breaks: "A2/A6" },
  { file: LS, name: "a cast's circles include another cast's", from: "    return Boolean(flags.lightShift) && flags.castId === castId;\n", to: "    return Boolean(flags.lightShift);\n", breaks: "A3" },
  { file: WF, name: "the circle carries no clock", from: "          ...(ends ? { [REGION_EXPIRY_FLAG]: regionExpiryRecord({ castId, spellName: spell.name, ends }) } : {})\n", to: "", breaks: "A4" },
  { file: WF, name: "the decoy is not written onto the circle", from: "          [LIGHT_SHIFT_DROPPABLE_FLAG]: spec.droppable === true,\n", to: "", breaks: "A4" },
  { file: ACTIVE, name: "F1 — THE OLD DEFECT: ending the spell leaves its circles", from: " || circles.has(r.id))", to: ")", breaks: "A5" },
  { file: WF, name: "every client moves the circle", from: "    if (gm ? gm.id !== game.user?.id : !game.user?.isGM) return;\n", to: "", breaks: "A6" },
  { file: WF, name: "a rename moves the circle", from: "    if (!(\"x\" in (changes ?? {})) && !(\"y\" in (changes ?? {})) && !(\"width\" in (changes ?? {}))) return;\n", to: "", breaks: "A6" },
  { file: WF, name: "the drop clears nothing", from: "  for (const region of held) await region.setFlag(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG, null);\n", to: "", breaks: "A7" },
  { file: WF, name: "a cast with nothing to drop still reports", from: "  if (!held.length) return null;\n", to: "  if (!held.length) return lightShiftDroppedLine(\"The shadows\", actor.name);\n", breaks: "A7" },
  { file: SHEET, name: "the button is always offered", from: "      canDrop: lightShiftCanDrop(entry.id),", to: "      canDrop: true,", breaks: "A8" },
  { file: MAIN, name: "the follow hook is never registered", from: "  registerLightShiftFollow();\n", to: "", breaks: "A8" },
  // B — R2
  { file: ACTION, name: "F2 — THE OLD DEFECT: the resume reads the id only", from: "  const actor = (stored?.actorHandle ? await resolveActorHandle(stored.actorHandle) : null)\n    ?? (stored?.actorId ? game.actors.get(stored.actorId) : null);", to: "  const actor = stored?.actorId ? game.actors.get(stored.actorId) : null;", breaks: "B2" },
  { file: ACTION, name: "the pending outcome stores no handle", from: "    actorHandle: actor ? actorHandle(actor, actor.token ?? null) : null,\n", to: "", breaks: "B1" },
  { file: ACTION, name: "the target is still read by id", from: "  const restoredTarget = (stored?.targetHandle ? await resolveActorHandle(stored.targetHandle) : null)\n", to: "  const restoredTarget = (null)\n", breaks: "B2" },
  // C — R3
  { file: TREC, name: "F3 — THE OLD DEFECT: the combat's end leaves the opening Flat-Footed", from: "        await clearOpeningFlatFooted(actor);\n", to: "", breaks: "C1" },
  { file: TREC, name: "every Flat-Footed is taken", from: "    .filter((e) => e?.flags?.[systemId]?.initialFlatFooted === true)", to: "    .filter((e) => e?.id !== \"spell\")", breaks: "C1" }
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
    process.stderr.write("mutate-drive-36221: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-drive-36221: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-drive-36221: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
