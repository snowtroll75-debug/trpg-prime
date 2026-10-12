#!/usr/bin/env node
/**
 * mutate-markers — can verify-markers fail?
 *
 * NEW at 3.395.0. SURVIVED and an unmatched anchor are both failures.
 *
 * EVERY MUTATION HERE INTRODUCES A DEFECT. That sounds obvious and it
 * was not: seven of the first eight mutations written for
 * verify-spell-book-fields on 24 August SURVIVED, and all seven were
 * *loosenings* — a check relaxed to accept more cannot fail on a clean
 * tree, because a clean tree is inside the wider net too. A mutation
 * must make the SYSTEM wrong, never make the CHECK kinder.
 *
 * The two most valuable ones below are the quiet kind:
 *
 *   #2  `Math.min(0, v)` → `0`. Still satisfies "does not increase" and
 *       still passes any test that only asks whether Dying went up. It
 *       makes Stabilise cancel a Critical recovery — the buff becomes a
 *       penalty on precisely the roll the player wanted.
 *   #11 the clamp is called and its answer dropped on the floor. Every
 *       "is it wired?" check that greps for a call name passes on this,
 *       which is why E13 asks about the assignment instead.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const ECON = path.join(SYSTEM_ROOT, "module", "combat", "turn-economy.mjs");
const MARK = path.join(SYSTEM_ROOT, "module", "magic", "markers.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-markers.mjs");

const MUTATIONS = [
  {
    name: "the clamp runs the wrong way",
    file: ECON,
    from: "  return Math.min(0, value);",
    to: "  return Math.max(0, value);",
    breaks: "A1/A2 — a Critical recovery is thrown away and an increase still lands"
  },
  {
    // THE PENALTY-DISGUISED-AS-A-BUFF BUG. Passes "does not increase".
    name: "a good Dying Check is held at zero too",
    file: ECON,
    from: "  return Math.min(0, value);",
    to: "  return 0;",
    breaks: "A2 — Stabilise cancels the recovery the player rolled for"
  },
  {
    name: "the marker's presence is read backwards",
    file: ECON,
    from: "  if (!stabilised) return value;",
    to: "  if (stabilised) return value;",
    breaks: "A3/A4 — everyone is stabilised except the person who was"
  },
  {
    // ONE CHARACTER, AND IT SPENDS A ONE-ROUND SPELL ON A PARTIAL.
    name: "the marker is spent on a check it cannot improve",
    file: ECON,
    from: "  return Math.floor(Number(delta) || 0) > 0;",
    to: "  return Math.floor(Number(delta) || 0) >= 0;",
    breaks: "B1/B2 — a Partial burns the marker for no change"
  },
  {
    name: "an unknown marker key resolves anyway",
    file: MARK,
    from: "  return isMarkerKey(key) ? key : null;",
    to: "  return key || null;",
    breaks: "D4/D6 — a misspelled key becomes a live marker nothing implements"
  },
  {
    name: "a disabled marker still counts",
    file: MARK,
    from: "    if (effect?.disabled) continue;",
    to: "    if (false) continue;",
    breaks: "D2 — a GM who unticks the effect cannot turn the spell off"
  },
  {
    name: "an absent marker reports as spent",
    file: MARK,
    from: "  if (!effect) return false;",
    to: "  if (!effect) return true;",
    breaks: "D11 — every dying character is permanently stabilised"
  },
  {
    // A FAILURE TO TIDY UP BECOMES A DOUBLE BENEFIT.
    name: "a delete that throws un-spends the marker",
    file: MARK,
    from: "    console.warn(`${SYSTEM_ID} | could not delete spent marker \"${key}\"`, err);\n  }\n  return true;",
    to: "    console.warn(`${SYSTEM_ID} | could not delete spent marker \"${key}\"`, err);\n    return false;\n  }\n  return true;",
    breaks: "D12 — the marker survives on the sheet AND reports unspent"
  },
  {
    name: "consuming a marker leaves it in place",
    file: MARK,
    from: "    await effect.delete();",
    to: "    void effect;",
    breaks: "D10/D13 — 'once per round' becomes once per casting, for ever"
  },
  {
    // THE MUTATION THAT SURVIVED, and the reason `markerFlagData` exists.
    // It used to edit the object literal in spell-effects.mjs, where
    // nothing could see it. Now there is only one place to change, and
    // changing it moves both ends at once — which is the point.
    name: "the marker is written under a name nothing reads",
    file: MARK,
    from: "  return { marker: String(key) };",
    to: "  return { markerKey: String(key) };",
    breaks: "D1/D9 — the applier and the reader stop agreeing, in silence"
  },
  {
    // AND THE SECOND DECIDER MUST NOT COME BACK. Inlining the literal
    // again restores the exact blind spot, so it has to fail.
    name: "spell-effects hand-writes the flag shape again",
    file: EFFECTS,
    from: "...markerFlagData(effect.marker) } };",
    to: 'marker: String(effect.marker) } };',
    breaks: "E16 — two places deciding one question, which is where this started"
  },
  {
    // THE CALL IS STILL THERE. Only the result is gone.
    name: "the clamp's answer is discarded",
    file: COMBAT,
    from: "        delta = stabilisedDyingDelta(delta, true);",
    to: "        stabilisedDyingDelta(delta, true);",
    breaks: "E13 — the card announces Stabilise and Dying rises anyway"
  },
  {
    name: "combat stops asking for the marker",
    file: COMBAT,
    from: '      const { consumeMarker } = await import("../magic/markers.mjs");',
    to: "      const consumeMarker = async () => true;",
    breaks: "E11/E12/E15 — the spell is free and infinite"
  },
  {
    name: "spell-effects drops the unknown-key guard",
    file: EFFECTS,
    from: "          if (!isMarkerKey(effect.marker)) {",
    to: "          if (false) {",
    breaks: "E3 — a typo'd marker applies in silence instead of saying so"
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

const guard = guardFiles([ECON, MARK, EFFECTS, COMBAT, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-markers: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-markers: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-markers: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
