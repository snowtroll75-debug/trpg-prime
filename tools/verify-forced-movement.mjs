#!/usr/bin/env node
/**
 * verify-forced-movement — a push that is printed actually moves someone.
 *
 * NEW at 3.376.0.
 *
 * WHAT THIS IS FOR. Shove's success and critical say the target is
 * "pushed back 5 feet" / "pushed up to 10 feet away". Driven live on 23
 * August 2026 at both degrees: the card printed the sentence and the
 * target's token document did not change by a pixel. No button, no
 * `data-action`, no flag — note-only without being DECLARED note-only,
 * which is the worst of the three states, because a reader cannot tell a
 * decision from an omission.
 *
 * The same sentence sits in fourteen critical-table rows, none of them
 * read either.
 *
 * THE GENERAL RULE THIS FILE DEFENDS — section D. It is not "Shove
 * pushes". It is: **every outcome text in the basic-action data that
 * describes a push must be reachable by the parser that offers the
 * button.** That rule is what catches the next action, or the next
 * critical row, written in a house style nobody thought to handle. A
 * check that only knew about Shove would have to be rewritten each time,
 * and §5.9 was paid for by exactly that.
 *
 * ON THE GUARD CHECKS — section C. Every invalid input must come back
 * `{ok:false}` with a reason, never a benign zero-distance plan. §5.4:
 * `lightConcealment`'s guard turned a caller's mistake into a polite "not
 * concealed" and hid a broken rule for a release. A push that silently
 * declines to move looks exactly like one correctly blocked by a wall,
 * and the two must never be confusable.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { extractPushDistance } from "../module/effect-parser.mjs";
import { describePush, plannedPush, pushDirection, storedPosition } from "../module/combat/forced-movement.mjs";
import { BASIC_ACTIONS } from "../module/data/basic-actions.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ------------------------------------------------------------------ *
 * A. The parser reads both house styles, and nothing else
 * ------------------------------------------------------------------ */

equal("A1 Shove's success, written out", JSON.stringify(extractPushDistance("Your target is pushed back 5 feet.")), JSON.stringify({ feet: 5, upTo: false }));
equal("A2 Shove's critical keeps its 'up to'", JSON.stringify(extractPushDistance("Your target is pushed up to 10 feet away.")), JSON.stringify({ feet: 10, upTo: true }));
equal("A3 the critical tables' abbreviated form", JSON.stringify(extractPushDistance("Target is pushed back 5'.")), JSON.stringify({ feet: 5, upTo: false }));
equal("A4 a push buried in a longer effect line", JSON.stringify(extractPushDistance("Blow to the chest. Target is pushed back 10' and Stunned 2.")), JSON.stringify({ feet: 10, upTo: false }));

// THE NEGATIVES MATTER AS MUCH. A parser that matches everything is as
// wrong as one that matches nothing, and only these tell them apart —
// the §5.12 lesson from the Grapple conditional, which was checked in
// both directions on the same day this was written.
ok("A5 'pushed' with no distance is not a push", extractPushDistance("Target is pushed back") === null);
ok("A6 a zero distance is not a push", extractPushDistance("pushed back 0 feet") === null);
ok("A7 the shover's own Stride is not a push", extractPushDistance("You can Stride after it, but must move the same distance and direction.") === null);
ok("A8 nothing at all", extractPushDistance("") === null && extractPushDistance(null) === null);

/* ------------------------------------------------------------------ *
 * B. Direction — away from the pusher, snapped to the grid
 * ------------------------------------------------------------------ */

equal("B1 target east of source pushes east", JSON.stringify(pushDirection(0, 0, 100, 0)), JSON.stringify({ dx: 1, dy: 0 }));
equal("B2 target west pushes west", JSON.stringify(pushDirection(100, 0, 0, 0)), JSON.stringify({ dx: -1, dy: 0 }));
equal("B3 target south pushes south", JSON.stringify(pushDirection(0, 0, 0, 100)), JSON.stringify({ dx: 0, dy: 1 }));
equal("B4 a diagonal snaps to the diagonal", JSON.stringify(pushDirection(0, 0, 100, 100)), JSON.stringify({ dx: 1, dy: 1 }));
// A near-cardinal angle must snap to the CARDINAL, not the diagonal —
// otherwise a shove along a corridor drifts into the wall.
equal("B5 a shallow angle snaps to the cardinal", JSON.stringify(pushDirection(0, 0, 100, 10)), JSON.stringify({ dx: 1, dy: 0 }));
ok("B6 two creatures on the same point have no 'away'", pushDirection(50, 50, 50, 50) === null);

/* ------------------------------------------------------------------ *
 * C. The guards refuse, and say why — they never return a quiet zero
 * ------------------------------------------------------------------ */

const base = {
  sourceCentreX: 50, sourceCentreY: 50, targetCentreX: 150, targetCentreY: 50,
  targetX: 100, targetY: 0, feet: 10, gridDistance: 5, gridSize: 100
};
for (const [label, patch] of [
  ["C1 no distance", { feet: 0 }],
  ["C2 a negative distance", { feet: -5 }],
  ["C3 a nonsense distance", { feet: "over there" }],
  ["C4 an unusable grid distance", { gridDistance: 0 }],
  ["C5 an unusable grid size", { gridSize: 0 }],
  ["C6 a token with no position", { targetX: NaN }],
  ["C7 both creatures on one point", { sourceCentreX: 150, sourceCentreY: 50 }],
  ["C8 a push shorter than one square", { feet: 5, gridDistance: 10 }]
]) {
  const result = plannedPush({ ...base, ...patch });
  ok(`${label} is refused`, result.ok === false, `got ${JSON.stringify(result).slice(0, 90)}`);
  ok(`${label} says why`, typeof result.reason === "string" && result.reason.length > 10,
    "a refusal with no reason is the silence this project's anti-silence rule exists to stop");
}

/* ------------------------------------------------------------------ *
 * D. The plan itself, including running out of room
 * ------------------------------------------------------------------ */

const clear = plannedPush({ ...base });
ok("D1 a clear 10 ft push moves two squares", clear.ok && clear.movedSquares === 2, JSON.stringify(clear).slice(0, 120));
equal("D2 and reports the distance in feet", clear.movedFeet, 10);
equal("D3 landing two squares east", clear.finalX, 300);
equal("D4 with no drift on the other axis", clear.finalY, 0);
ok("D5 nothing stopped it", clear.stoppedShort === false);

// A wall on the SECOND square: the push must deliver the first and stop,
// not abandon the whole thing and not walk through.
const halted = plannedPush({ ...base, isBlocked: (x) => x >= 300 });
ok("D6 a blocked second square still delivers the first", halted.ok && halted.movedSquares === 1);
equal("D7 and reports the shorter distance honestly", halted.movedFeet, 5);
ok("D8 and says it stopped short", halted.stoppedShort === true);
ok("D9 and names where", Number(halted.blockedAt?.x) === 300);

// Blocked immediately: moved is false, and that is DIFFERENT from a refusal.
const wedged = plannedPush({ ...base, isBlocked: () => true });
ok("D10 a wholly blocked push is still a valid plan", wedged.ok === true,
  "being unable to move is an outcome, not a bad input — collapsing the two would hide real refusals");
ok("D11 that moved nobody", wedged.moved === false && wedged.movedFeet === 0);
ok("D12 and knows it was blocked", wedged.stoppedShort === true);

/* ------------------------------------------------------------------ *
 * E. THE GENERAL RULE — every printed push is reachable by the parser
 * ------------------------------------------------------------------ */

const DEGREES = ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"];
let printedPushes = 0;
for (const action of BASIC_ACTIONS) {
  for (const degree of DEGREES) {
    const text = String(action.outcomes?.[degree] ?? "");
    // "Says a creature is pushed a distance" in ANY wording, tested
    // independently of the parser so this cannot agree with itself.
    if (!/\bpush(?:ed|es)?\b/i.test(text)) continue;
    if (!/\d/.test(text)) continue;
    // The shover's own follow-up Stride is not a forced move.
    if (!/pushed/i.test(text)) continue;
    printedPushes += 1;
    ok(`E ${action.key}.${degree} — its push is readable`,
      extractPushDistance(text) !== null,
      `the outcome names a push the button-maker cannot see: "${text.slice(0, 80)}"`);
  }
}
ok("E0 the sweep actually found the pushes it exists to check", printedPushes >= 2,
  `found ${printedPushes} — a rule that sweeps nothing passes for the wrong reason`);

// Same rule over the critical tables, which are the other fourteen.
const critSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/data/critical-tables.mjs"), "utf8");
const critLines = (critSrc.match(/"effect": "[^"]*pushed[^"]*"/g) ?? []).map((s) => s.slice(11, -1));
ok("E1 the critical tables still contain pushes to check", critLines.length >= 14,
  `found ${critLines.length}; if this fell, the data changed and this check needs re-reading`);
for (const [i, text] of critLines.entries()) {
  ok(`E2.${i} critical row ${i} — its push is readable`, extractPushDistance(text) !== null,
    `"${text.slice(0, 80)}"`);
}

/* ------------------------------------------------------------------ *
 * F. The wiring exists — a rule with no caller is not automation (§5.1)
 * ------------------------------------------------------------------ */

const actionSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/combat/action-workflow.mjs"), "utf8");
const attackSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/combat/attack-workflow.mjs"), "utf8");
const cardSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/dice/check-card-interactions.mjs"), "utf8");
const flowSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/combat/forced-movement-workflow.mjs"), "utf8");

// IMPORTED, not merely named — §5.2, where `shieldedStrideBonus` was
// called and never imported and every weapon attack threw for a release.
ok("F1 the action card imports the button-maker",
  /import \{[^}]*pushButtonsHtml[^}]*\} from "\.\/forced-movement-workflow\.mjs"/.test(actionSrc));
ok("F2 the critical-injury card imports it too",
  /import \{[^}]*pushButtonsHtml[^}]*\} from "\.\/forced-movement-workflow\.mjs"/.test(attackSrc));
ok("F3 both read the push off the outcome text",
  /extractPushDistance\(outcome\.text\)/.test(actionSrc) && /extractPushDistance\(row\.effect\)/.test(attackSrc),
  "reading anything other than the text on the card lets the two disagree");
ok("F4 the button is bound to a handler",
  /querySelectorAll\?\.\('\[data-action="applyForcedPush"\]'\)/.test(cardSrc));
ok("F5 the handler moves the token",
  /await targetToken\.update\(\{ x: plan\.finalX, y: plan\.finalY \}\)/.test(flowSrc),
  "a button that records a push without performing it is the bug this file exists for");
// THE BUG THIS PREVENTS: the spent state being left to the DOM edit made
// at click time. The render hook fires again on the handler's own
// setFlag, rebuilding the card from stored HTML with live-looking
// buttons — how the critical-adjust buttons were caught re-enabling.
ok("F6 the spent state is re-read from the flag on every render",
  /const pushState = message\.getFlag\(SYSTEM_ID, "forcedMovement"\)/.test(cardSrc));
ok("F7 a second press is refused at the handler too",
  /if \(raw\?\.applied\) return/.test(flowSrc),
  "the disabled attribute is a courtesy; the guard is the rule");
// A collision test that throws must count as blocked, never as clear.
// THE 3.376.1 BUG, held down in the file that actually got it wrong. A
// regex is a poor instrument, but the alternative is nothing: the choice
// of field happens inside a Foundry-only function, and H1–H4 above can
// only prove the pure helper is right, not that the workflow calls it.
ok("F9 the workflow plans from stored positions, not drawn ones",
  /storedPosition\(sourceToken\)/.test(flowSrc) && /storedPosition\(targetToken\)/.test(flowSrc)
  && /storedPosition\(movingToken\)/.test(flowSrc),
  "reading token.x plans the push from where the token is being animated to, not where it is");
// NAMES THE SHAPE, NOT THE VARIABLES. The first version of this listed
// `targetToken|movingToken|other` and a mutation that read `Number(t.x)`
// off a differently-named local walked straight through it — §5.3, a
// check pinned to the code as written rather than to the mistake. Any
// `Number(<anything>.x)` in this file is a prepared read.
ok("F10 and no raw prepared read is left in it, whatever the local is called",
  !/Number\(\s*\w+\.[xy]\s*\)/.test(flowSrc),
  "one prepared read is enough to reintroduce the whole defect");
ok("F8 a failed wall test blocks rather than waving the push through",
  /console\.warn\([^)]*forced movement[\s\S]{0,120}return true;/.test(flowSrc),
  "treating an error as 'no wall' would slide tokens through walls nobody tested");

/* ------------------------------------------------------------------ *
 * H. Which of a token's two positions counts
 *
 * ADDED AT 3.376.1 after a live defect, not before one. A TokenDocument
 * carries `_source.x` (stored) and `x` (prepared, following the movement
 * animation). Measured on the live world: stored 800, prepared 600 — two
 * pushes behind. The workflow read the prepared value, planned the push
 * from where the target used to be, and the card announced 10 ft for a
 * move of 5. The §5.9 shape again: the system did one thing and said
 * another, with nothing on screen disagreeing with itself.
 * ------------------------------------------------------------------ */

equal("H1 the stored position wins over the drawn one",
  JSON.stringify(storedPosition({ x: 600, y: 500, _source: { x: 800, y: 500 } })),
  JSON.stringify({ x: 800, y: 500 }));
equal("H2 a token with no _source falls back to its own fields",
  JSON.stringify(storedPosition({ x: 300, y: 200 })),
  JSON.stringify({ x: 300, y: 200 }));
equal("H3 a stored zero is a real position, not a missing one",
  JSON.stringify(storedPosition({ x: 700, y: 700, _source: { x: 0, y: 0 } })),
  JSON.stringify({ x: 0, y: 0 }));
// NOT {x:0,y:0}. A token whose position cannot be read must stop the
// push, not push from the corner of the map — §5.4.
ok("H4 an unreadable position is null, never a silent origin",
  storedPosition({}) === null && storedPosition(null) === null
  && storedPosition({ x: "over there", y: 5 }) === null);

/* ------------------------------------------------------------------ *
 * G. The sentence on the card matches the plan
 * ------------------------------------------------------------------ */

ok("G1 a clear push says the distance", describePush(clear, "Foe").includes("10 ft"));
ok("G2 a shortened push says BOTH distances", (() => {
  const s = describePush(halted, "Foe");
  return s.includes("5 ft") && s.includes("10 ft") && /in the way/.test(s);
})(), "a card that reported only the delivered distance would hide that the push was interrupted");
ok("G3 a wholly blocked push says so", /cannot be pushed/.test(describePush(wedged, "Foe")));
ok("G4 a refusal never masquerades as a push",
  /^No push:/.test(describePush({ ok: false, reason: "no direction" }, "Foe")));

/* ------------------------------------------------------------------ */

if (failures.length) {
  process.stderr.write(`\nverify-forced-movement: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-forced-movement: OK — ${checks} checks.\n`);
