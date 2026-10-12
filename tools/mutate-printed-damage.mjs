#!/usr/bin/env node
/**
 * mutate-printed-damage — can verify-printed-damage fail?
 * NEW at 3.452.0.
 *
 * A1/A2 ARE THE ONES THAT MATTER, and they are unusual: they do not
 * guard the system, they guard the MEASUREMENT. Three drafts of this
 * sweep each reported a bigger number than the truth — a swallowed entry
 * boundary, a warping option counted as damage, a duration counted as
 * damage — and each would have been reported to Graham as a finding.
 * The mutations below restore each of those three mistakes.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const V = path.join(SYSTEM_ROOT, "tools", "verify-printed-damage.mjs");
const R = path.join(SYSTEM_ROOT, "tools", "rulebook.mjs");

const MUTATIONS = [
  {
    file: V,
    name: "M1 THE THIRD DRAFT: every NdN counts as damage",
    from: '    if (DAMAGE_WORD.test(after) || /\\b(inflicts?|deals?|takes?|healed of)\\b[^.]{0,40}$/i.test(before)) {',
    to: "    if (true) {",
    breaks: "A2c — Time Stop's \"1d6 rounds\" becomes a damage defect"
  },
  {
    file: V,
    name: "M2 THE SECOND DRAFT: warping options count as the spell's damage",
    from: '  return String(entryText ?? "").split(/WARPING OPTIONS/i)[0].replace(/^Base Damage.*$/gm, "");',
    to: '  return String(entryText ?? "").replace(/^Base Damage.*$/gm, "");',
    breaks: "A2b — Ride The Lightning \"cannot cause damage\" and gains an 8d12"
  },
  {
    file: V,
    name: "M3 the Base Damage line is read as the spell's damage",
    from: '  return String(entryText ?? "").split(/WARPING OPTIONS/i)[0].replace(/^Base Damage.*$/gm, "");',
    to: '  return String(entryText ?? "").split(/WARPING OPTIONS/i)[0];',
    breaks: "A2d — Forceful Strike's metamagic base 1d6 read as damage it deals"
  },
  {
    file: V,
    // A RATCHET IS TESTED BY MOVING THE RATCHET. Forcing a condition
    // that is already true proves nothing; a mutation must make the
    // check FAIL, so this drops a genuinely silent spell off the list.
    name: "M4 a silent spell is dropped from the backlog",
    // RE-ANCHORED AT 3.454.0. The old anchor named Spike Stones and
    // Verdant Retribution, which came off the backlog when the
    // hazardous-terrain mechanism was built — the ratchet shrinking is
    // exactly what it is for, and a mutation must follow it.
    // RE-ANCHORED AGAIN AT 3.467.0, when War Cry came off.
    // RE-ANCHORED AGAIN AT 3.470.0, when both healers came off.
    // RE-ANCHORED AGAIN AT 3.610.0, when Wall Of Ice came off.
    from: '  "SLIDE"\n]));',
    to: ']));',
    breaks: "B1 — Slide prints 2d6 the pack cannot roll and would go unnoticed"
  },
  {
    file: V,
    name: "M5 a spell that is not broken is left on the backlog",
    // RE-ANCHORED AT 3.461.0, when Aura Of Vitality came off the backlog
    // — the ratchet shrinking is what it is for, and a mutation must
    // follow it. Second time this anchor has moved for that reason.
    // RE-ANCHORED AT 3.465.0 — third time, and each time because the
    // ratchet SHRANK, which is what it is for. Consecrate, Desecrate and
    // Force Punch came off when area riders and the unarmed scope landed.
    // RE-ANCHORED AT 3.472.0 — fourth time, both prisons off the list.
    // RE-ANCHORED AT 3.473.0 — fifth time, Elemental Shield off the list.
    // RE-ANCHORED AT 3.478.0 — sixth time, Missile Storm off the list.
    from: '  "MIRAGE ENTITY",',
    to: '  "SHATTER", "MIRAGE ENTITY",',
    breaks: "B2 — Shatter was fixed at 3.452.0 and must not sit on the list"
  },
  {
    file: V,
    name: "M7 a utility spell counts as resolving damage",
    from: 'const CATEGORY_RESOLVES_DAMAGE = new Set(["attack", "save"]);',
    to: 'const CATEGORY_RESOLVES_DAMAGE = new Set(["attack", "save", "utility"]);',
    breaks: "C1 — the exact category whose damage never rolled"
  },

  /*
   * TWO MUTATIONS ARE RETIRED HERE, AND THEY FAILED THE SAME WAY.
   *
   * THE GENERAL RULE, learned three times in one day: a mutation that
   * DELETES A CLAUSE WHICH NOTHING CURRENTLY VIOLATES can never fail.
   * The check still passes, so the runner reports SURVIVED, and the only
   * honest responses are to change the data so the clause bites or to
   * retire the mutation. Writing a weaker mutation that happens to fail
   * would be a green tick for nothing.
   *
   * The mutations that DO work on a ratchet move the ratchet (M4, M5) or
   * assert a positive fact the mutation can contradict (M7, against the
   * `CATEGORY_RESOLVES_DAMAGE` set). That is why C1c and C1d were added
   * as positive claims rather than left as "the list is empty" — a
   * list-is-empty check passes just as well when the list can no longer
   * be filled.
   *
   * RETIRED #1 — "the note need not say why the damage is not applied":
   * weakening C1d to `Boolean(shatterNote)` still passes, because
   * Shatter's note does say why. C1d keeps the clause as a tripwire for
   * a future edit that waters the sentence down.
   *
   * RETIRED #2 — the original M6, below.
   *
   * It weakened C2 from `includes("2d6") && !includes("1d6")` to just
   * `includes("2d6")`, and SURVIVED — because the pack holds no 1d6 for
   * this spell, so the clause it deleted is not currently doing any
   * work. That is the same lesson M4 and M5 taught in their first
   * drafts: a mutation that removes a guard nothing violates cannot
   * fail, and a check that cannot fail is not a check.
   *
   * The misreading itself IS covered — by A2d, which drives the printed
   * entry and asserts `Base Damage` is not read as the spell's damage,
   * and by M3, which restores exactly that error. C2's second clause
   * stays as a tripwire for a future data edit; it simply has no
   * mutation of its own, and inventing one would be a green tick for
   * nothing.
   */
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([V, R]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-printed-damage: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-printed-damage: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-printed-damage: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
