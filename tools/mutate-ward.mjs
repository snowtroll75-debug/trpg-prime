#!/usr/bin/env node
/**
 * mutate-ward — can verify-ward fail?
 *
 * NEW at 3.406.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT, restored as one edit: dropping the uuid test
 * from the defence channel turns every ward back into Stone Shield's
 * +4-against-the-whole-scene. It is a one-line deletion that makes the
 * spell strictly better and breaks nothing that raises an error.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const WARD = path.join(SYSTEM_ROOT, "module", "magic", "ward.mjs");
const DEFENCE = path.join(SYSTEM_ROOT, "module", "combat", "defence-dc.mjs");
const COND = path.join(SYSTEM_ROOT, "module", "conditionals.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-ward.mjs");

const MUTATIONS = [
  {
    name: "THE SHIPPED DEFECT: the DB channel stops checking who is attacking",
    file: DEFENCE,
    from: "    if (entry.sourceUuids.length && !entry.sourceUuids.includes(uuid)) return false;",
    to: "    if (false) return false;",
    breaks: "C2/C3 — every ward becomes +N against the entire scene, as Stone Shield was"
  },
  {
    name: "the save half stops checking who forced the save",
    file: COND,
    from: "  if (wantedSourceUuids && !wantedSourceUuids.some((t) => sourceUuids.includes(t))) return false;",
    to: "  if (false) return false;",
    breaks: "D3/D4 — a ward protects against every save the character ever rolls"
  },
  {
    // A UUID IS CASE-SENSITIVE. Folding it is a silent total failure.
    name: "uuids are lower-cased with the other axes",
    file: COND,
    // RE-AIMED at 3.415.0: the list gained `targetUuids` when the mirror
    // axis landed, so the old one-element anchor no longer exists.
    from: 'const CASE_SENSITIVE_AXES = Object.freeze(["sourceUuids", "targetUuids"]);',
    to: "const CASE_SENSITIVE_AXES = Object.freeze([]);",
    breaks: "C4/D2 — the authored scope no longer matches the live uuid, and nothing says so"
  },
  {
    name: "the defence half folds the uuid's case too",
    file: DEFENCE,
    from: "    .map((u) => String(u ?? \"\").trim())",
    to: "    .map((u) => String(u ?? \"\").trim().toLowerCase())",
    breaks: "C4 — same silent failure on the DB side"
  },
  {
    // AN UNAIMED WARD MUST WRITE NOTHING.
    name: "a ward with no enemy is written unscoped",
    file: WARD,
    from: "  if (!amount || !against.length) return { defenceDC: [], conditionals: [] };",
    to: "  if (!amount) return { defenceDC: [], conditionals: [] };",
    breaks: "B7 — an entry scoped to nobody raises the number against everybody"
  },
  {
    name: "a DB-only ward writes save conditionals anyway",
    file: WARD,
    from: "  const saves = covered.filter((slot) => SAVE_SLOTS.includes(slot));",
    to: "  const saves = [...SAVE_SLOTS];",
    breaks: "B8 — Anticipations starts buffing saves its text never mentions"
  },
  {
    name: "DB leaks into the save half as a subject",
    file: WARD,
    from: "      when: { checkTypes: [\"save\"], subjects: saves, sourceUuids: against }",
    to: "      when: { checkTypes: [\"save\"], subjects: covered, sourceUuids: against }",
    breaks: "B4 — 'defence' is not a save anyone rolls"
  },
  {
    name: "the two halves stop having to agree",
    file: WARD,
    from: "  if (db.value !== save.value) {",
    to: "  if (false) {",
    breaks: "B6b — the one-writer rule loses its grip"
  },
  {
    name: "a ward covering nothing silently covers everything",
    file: WARD,
    from: "  return list.length ? list : [...WARD_SLOTS];",
    to: "  return list;",
    breaks: "A3 — an author who declares no slots gets no ward at all"
  },
  {
    name: "an unknown slot passes validation",
    file: WARD,
    from: "  return wardSlots(effect).filter((slot) => !isWardSlot(slot));",
    to: "  return [];",
    breaks: "A5/E1 — a misspelled defence ships and protects nothing"
  },
  {
    // THE ROLE SPLIT. Warding the enemy against itself.
    //
    // RE-ANCHORED AT 3.552.7: the allies row draws from the area-caught
    // list first from 3.552.6, so the filter it applies moved onto its
    // own line. The mutation is unchanged — drop the friend-or-foe
    // filter and keep everyone the row reached.
    name: "an allies-target ward includes the enemy",
    file: EFFECTS,
    from: '        ? (areaCaught.length ? areaCaught : targets)\n          .filter((t) => t?.uuid && !hostileUuids.includes(t.uuid))',
    to: "        ? (areaCaught.length ? areaCaught : targets)",
    breaks: "F4 — Forbidding Ward's enemy is warded against itself"
  },
  {
    name: "the applier applies a ward it could not aim",
    file: EFFECTS,
    from: "          if (!hostileUuids.length) {",
    to: "          if (false) {",
    breaks: "F2 — the Stone Shield defect, reached from the other side"
  },
  {
    name: "the attack workflow stops naming the attacker",
    file: ATTACK,
    // RE-ANCHORED AT 3.446.0, when the alignment axis added a sixth
    // argument to this call. The old anchor named five and went ANCHOR
    // MISSING — silently ceasing to run, which is the failure mode this
    // project has now met four times. Dropping the uuid still drops it.
    from: '    ? defenceDCBonus(targetActor, "defence", "", attackerTypes, actor?.uuid ?? "", attackerAlignments)',
    to: '    ? defenceDCBonus(targetActor, "defence", "", attackerTypes, "", attackerAlignments)',
    breaks: "F5 — every ward silently stops working, because nothing can name the attacker"
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

const guard = guardFiles([WARD, DEFENCE, COND, EFFECTS, ATTACK, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-ward: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-ward: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-ward: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
