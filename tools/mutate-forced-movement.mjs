#!/usr/bin/env node
/**
 * mutate-forced-movement — can verify-forced-movement actually fail?
 *
 * NEW at 3.376.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IS THE POINT: it restores the state the system was
 * ACTUALLY IN before this release — the button's handler records that a
 * push happened and never moves the token. That is precisely the defect
 * driven live on 23 August (card printed "pushed back 5 feet", token
 * document unchanged), and a harness that could not reproduce it would be
 * saying nothing about the bug it was written for.
 *
 * The second is its quieter twin: the guards stop refusing and start
 * returning a benign zero-distance plan instead. That version passes any
 * check that only asks "did it come back without throwing", and it makes
 * a caller's mistake indistinguishable from a wall.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const PURE = path.join(SYSTEM_ROOT, "module", "combat", "forced-movement.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "combat", "forced-movement-workflow.mjs");
const PARSER = path.join(SYSTEM_ROOT, "module", "effect-parser.mjs");
const ACTION = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const CARD = path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs");

const MUTATIONS = [
  {
    name: "THE SHIPPED BUG: the button records a push and never moves the token",
    file: FLOW,
    from: "    await targetToken.update({ x: plan.finalX, y: plan.finalY });",
    to: "    void plan;",
    breaks: "F5 — exactly the state Shove was in before this release"
  },
  {
    name: "the guards return a quiet zero instead of refusing",
    file: PURE,
    from: '    return { ok: false, reason: `a push needs a positive distance, not ${JSON.stringify(feet)}` };',
    to: "    return { ok: true, moved: false, movedFeet: 0, path: [], stoppedShort: false };",
    breaks: "C1 — a caller's mistake would be indistinguishable from a wall"
  },
  {
    name: "a refusal stops explaining itself",
    file: PURE,
    from: '    return { ok: false, reason: `the scene\'s grid distance is unusable (${JSON.stringify(gridDistance)})` };',
    to: "    return { ok: false };",
    breaks: "C4 — the anti-silence rule, applied to the one place a user sees"
  },
  {
    name: "a sub-square push is silently rounded to nothing",
    file: PURE,
    from: "    return {\n      ok: false,\n      reason: `${distance} ft does not divide into this scene's ${perSquare} ft squares`\n    };",
    to: "    return { ok: true, moved: false, movedFeet: 0, path: [], stoppedShort: false, direction: null };",
    breaks: "C8 — a 5 ft shove on a 10 ft grid would look like a blocked one"
  },
  {
    name: "a blocked square aborts the whole push instead of stopping short",
    file: PURE,
    from: "      stoppedShort = true;\n      blockedAt = { x: nextX, y: nextY, step };\n      break;",
    to: "      return { ok: true, moved: false, movedFeet: 0, path: [], stoppedShort: true, blockedAt: null, direction };",
    breaks: "D6/D7 — a wall two squares away would cancel the first square too"
  },
  {
    name: "the push walks through the blocker rather than stopping",
    file: PURE,
    from: "    if (isBlocked(nextX, nextY, step)) {",
    to: "    if (false && isBlocked(nextX, nextY, step)) {",
    breaks: "D6 — tokens would be pushed into walls and through other creatures"
  },
  {
    name: "direction snaps every shallow angle to a diagonal",
    file: PURE,
    from: "  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));",
    to: "  const octant = Math.ceil(Math.atan2(dy, dx) / (Math.PI / 4));",
    breaks: "B5 — a shove along a corridor would drift into the wall"
  },
  {
    name: "two creatures on one point get a direction invented for them",
    file: PURE,
    from: "  if (dx === 0 && dy === 0) return null;",
    to: "  if (dx === 0 && dy === 0) return OCTANTS[0];",
    breaks: "B6/C7 — 'away' would become 'east' by default"
  },
  {
    name: "'up to' is dropped, turning a maximum into a requirement",
    file: PARSER,
    from: "  return { feet, upTo: Boolean(match[1]) };",
    to: "  return { feet, upTo: false };",
    breaks: "A2 — Shove's critical would push a flat 10 ft with no choice"
  },
  {
    name: "the parser stops reading the critical tables' abbreviated form",
    file: PARSER,
    from: "(?:'|ft\\b\\.?|feet\\b)",
    to: "(?:ft\\b\\.?|feet\\b)",
    breaks: "A3 and every E2 row — fourteen critical pushes would go quiet again"
  },
  {
    name: "the parser matches any mention of pushing, distance or not",
    file: PARSER,
    from: "  const match = str.match(/\\bpushed\\s+(?:back\\s+)?(up\\s+to\\s+)?(\\d+)\\s*(?:'|ft\\b\\.?|feet\\b)/i);\n  if (!match) return null;\n  const feet = Math.trunc(Number(match[2]));",
    to: "  const match = str.match(/\\bpushed\\b(?:[^.]*?(\\d+))?/i);\n  if (!match) return null;\n  const feet = Math.trunc(Number(match[1] ?? 5));",
    breaks: "A5/A6 — 'pushed back' with no number would offer a push nobody wrote"
  },
  {
    name: "the card offers a push the outcome text does not describe",
    file: ACTION,
    from: "      pushDetail = extractPushDistance(outcome.text);",
    to: '      pushDetail = extractPushDistance(action.description ?? "");',
    breaks: "F3 — the button and the sentence beside it could disagree, the §5.9 shape"
  },
  {
    name: "the spent state is trusted to the DOM instead of the flag",
    file: CARD,
    from: '    const pushState = message.getFlag(SYSTEM_ID, "forcedMovement");',
    to: "    const pushState = null;",
    breaks: "F6 — the buttons would re-enable on the next render and push twice"
  },
  {
    name: "a second press is refused only by the disabled attribute",
    file: FLOW,
    from: '  if (raw?.applied) return { ok: false, reason: "this push has already been applied" };',
    to: "  void raw;",
    breaks: "F7 — a stale card could apply the same push again"
  },
  {
    name: "a failing wall test is read as 'no wall'",
    file: FLOW,
    from: "        return true;\n      }\n    }\n\n    // Another creature's space.",
    to: "        return false;\n      }\n    }\n\n    // Another creature's space.",
    breaks: "F8 — an error in collision detection would slide tokens through walls"
  },
  {
    // THE 3.376.1 BUG, restored exactly. Shipped in 3.376.0, found by
    // pressing the button twice on a live card: the second push planned
    // itself from the target's PREPARED position, which trails the
    // movement animation, so it announced 10 ft for a move of 5.
    name: "THE 3.376.1 BUG: the push is planned from the drawn position",
    file: FLOW,
    from: "  const targetAt = storedPosition(targetToken);",
    to: "  const targetAt = { x: Number(targetToken.x), y: Number(targetToken.y) };",
    breaks: "F9/F10 — a push mid-animation plans from where the token used to be"
  },
  {
    name: "the blockers are read at their drawn positions",
    file: FLOW,
    from: "    .map((t) => ({ token: t, at: storedPosition(t) }))",
    to: "    .map((t) => ({ token: t, at: { x: Number(t.x), y: Number(t.y) } }))",
    breaks: "F10 — a creature that has just moved would block its old square and not its new one"
  },
  {
    name: "an unreadable position becomes the corner of the map",
    file: PURE,
    from: "  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;\n  return { x, y };",
    to: "  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };",
    breaks: "H4 — a token with no position would be pushed from (0,0)"
  },
  {
    name: "a stored zero is mistaken for a missing position",
    file: PURE,
    from: "  const x = Number(token._source?.x ?? token.x);\n  const y = Number(token._source?.y ?? token.y);",
    to: "  const x = Number(token._source?.x || token.x);\n  const y = Number(token._source?.y || token.y);",
    breaks: "H3 — a token stored at x:0 would fall back to its drawn position"
  },
  {
    name: "the shortened-push sentence hides that it was interrupted",
    file: PURE,
    from: "    return `${targetName} is pushed ${plan.movedFeet} ft of the ${plan.requestedFeet} ft `\n      + \"and stops there — something is in the way.\";",
    to: "    return `${targetName} is pushed ${plan.movedFeet} ft.`;",
    breaks: "G2 — the card would report the short distance as if it were the whole push"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-forced-movement.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([PURE, FLOW, PARSER, ACTION, CARD]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-forced-movement: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const file = m.file ?? PURE;
    const original = fs.readFileSync(file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(file, original);
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
    ? `\nmutate-forced-movement: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-forced-movement: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
