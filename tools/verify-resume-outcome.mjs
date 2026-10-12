#!/usr/bin/env node
/**
 * verify-resume-outcome — a degree settled after the roll must still do
 * what it means.
 *
 * NEW at 3.423.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT.
 *
 * Graham, 27 August 2026, on Study Target: "does not allow you to add
 * anything to Studied Targets."
 *
 * Everything an action DOES once its degree is known lived inline at the
 * bottom of `resolveAction` — 852 lines with no name, reachable from
 * exactly one place: the moment of the roll. An action rolled with no DC
 * resolves to `degree: null`, so none of it ran.
 *
 * The chat card offers a "Set DC" box for precisely that case, and it
 * only ever recomputed the degree and re-rendered. Driven live on
 * 3.421.0 the card ended up reading "Heroic — exceeds DC by 21" over an
 * empty studied-target list. A card that states an outcome the system
 * never acted on is the interface form of a check that proves the wrong
 * thing, and it is believed for the same reason.
 *
 * 3.422.0 closed the common half by giving those actions a default DC.
 * This closes the other half.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE PRECEDENT THAT WAS ALREADY THERE.
 *
 * `recomputeAndUpdate` carries Scoundrel's Luck's refund with the note
 * "for the card whose DC arrived AFTER the roll: the refund in
 * TRGCheck.roll never fired because there was no degree to read." One
 * feature had already met this exact problem and solved it for itself.
 * Section D holds that comment in place, because it is the evidence that
 * this was a general gap rather than one action's oversight.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const flow = read("module", "combat", "action-workflow.mjs");
const card = read("module", "dice", "check-card-interactions.mjs");
const check = read("module", "dice", "check.mjs");

/**
 * The body of a named function.
 *
 * PARAMETER LIST FIRST, THEN THE BODY. The first draft took the first
 * `{` after the signature — which, for `applyActionOutcome({ actor,
 * action, ... })`, is the DESTRUCTURING brace. It returned 79 characters
 * of parameter list and A1 caught it; A7, which searches inside that
 * result, had failed for the same reason and would have looked like a
 * separate defect. Paren depth is walked to the end of the argument list
 * before any brace is believed.
 */
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  let i = source.indexOf("(", start);
  if (i < 0) return "";
  let parens = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === "(") parens += 1;
    else if (source[i] === ")") { parens -= 1; if (!parens) { i += 1; break; } }
  }
  const open = source.indexOf("{", i);
  if (open < 0) return "";
  let depth = 0;
  for (let j = open; j < source.length; j += 1) {
    if (source[j] === "{") depth += 1;
    else if (source[j] === "}") { depth -= 1; if (!depth) return source.slice(open, j + 1); }
  }
  return "";
}

/* ================================================================== *
 * A. THE OUTCOME HAS A NAME AND CAN BE CALLED
 * ================================================================== */

const outcomeFn = functionBody(flow, "async function applyActionOutcome({");
ok("A1 the outcome is a function with a name", outcomeFn.length > 5000,
  `${outcomeFn.length} chars — it was 852 inline lines with no name`);
ok("A2 resolveAction calls it rather than inlining it",
  /await applyActionOutcome\(\{/.test(flow));
ok("A3 exactly one call site inside resolveAction",
  (flow.match(/await applyActionOutcome\(\{/g) ?? []).length === 2,
  "one from the roll, one from the resume — no third copy");

// IT MUST NOT READ THE LIVE CHECK. There is no TRGCheck on a resumed
// card; the three reads that existed became parameters.
ok("A4 the outcome no longer reads the live check object",
  !/check\.outcome/.test(outcomeFn),
  "a resumed card has a message flag, not a TRGCheck instance");
ok("A5 the degree arrives as a parameter", /rawDegree/.test(outcomeFn));
ok("A6 and Create's margin with it", /checkMargin/.test(outcomeFn),
  "the only other thing the section read off the check");

// SHADOWBORN STILL REWRITES THE DEGREE FIRST, and must do so on a
// resumed card too — the feat moved with the code.
ok("A7 Shadowborn Agility still rewrites the degree inside the outcome",
  /shadowbornAgilityDegree\(action\.key, rawDegree/.test(outcomeFn),
  "one place that knows the degree, on both paths");

/* ================================================================== *
 * B. THE CONTEXT SURVIVES THE ROUND TRIP
 *
 * The half that decides whether a resumed outcome is the same outcome.
 * A field gathered at the roll and missing on resume is a branch that
 * silently does nothing the second time.
 * ================================================================== */

// AN OBJECT LITERAL, not a function — braced directly, so it is read
// from its own brace rather than through functionBody's paren walk.
const gatheredAt = flow.indexOf("const outcomeContext = {");
const gathered = gatheredAt < 0 ? "" : flow.slice(gatheredAt, flow.indexOf("\n  };", gatheredAt));
const stored = functionBody(flow, "function pendingOutcomeContext(actor, action, ctx)");
const restored = functionBody(flow, "function restoreOutcomeContext(stored)");

ok("B1 all three halves were located",
  gathered.length > 100 && stored.length > 200 && restored.length > 200,
  "an empty region satisfies every claim below");

// THE PLAIN-DATA FIELDS must appear in all three.
for (const field of [
  "invokedSkillKey", "earnIncomeTaskLevel", "createSetup", "createReroll",
  "learnSpellSetup", "runeTransferSetup", "treatWoundsExtraDC",
  "pushSourceTokenId", "pushTargetTokenId", "pushSceneId"
]) {
  // AS A WHOLE KEY, not as a substring. `includes("actorFeatNames")` is
  // satisfied by `actorFeatNamesX`, which is how a rename survived this
  // file's first run — the same prefix trap that bit mutate-rage.
  // The gathered literal uses SHORTHAND (`invokedSkillKey,`); the stored
  // and restored ones spell the key out. Both are whole-key matches.
  const shorthand = new RegExp(`\\b${field}\\s*[,:]`);
  const key = new RegExp(`\\b${field}\\s*:`);
  ok(`B2 ${field} is gathered, stored and restored`,
    shorthand.test(gathered) && key.test(stored) && key.test(restored),
    `gathered:${shorthand.test(gathered)} stored:${key.test(stored)} restored:${key.test(restored)}`);
}

// THE LIVE DOCUMENTS must be stored BY ID and rebuilt, never put into a
// flag whole — a document in a message flag comes back as a dead copy
// with no update() and no identity.
for (const [name, id] of [
  ["targetActor", "targetActorId"], ["bashShield", "bashShieldId"],
  ["repairTarget", "repairTargetId"], ["refocusTarget", "refocusTargetId"]
]) {
  ok(`B3 ${name} is stored as an id, not as a document`,
    new RegExp(`\\b${id}\\s*:`).test(stored) && new RegExp(`${name}\\?\\.id`).test(stored)
    && !new RegExp(`\\b${name}\\s*:`).test(stored),
    "a document in a flag is a lifeless copy of its own fields");
  ok(`B4 ${name} is rebuilt on the way back`,
    new RegExp(`\\b${name}\\s*:`).test(restored) && new RegExp(`\\b${id}\\b`).test(restored));
}

// DERIVED STATE IS RECOMPUTED, NOT STORED — one fewer thing able to
// disagree with the sheet.
ok("B5 the actor's feat names are recomputed rather than stored",
  !/\bactorFeatNames\s*:/.test(stored) && /\bactorFeatNames\s*:/.test(restored),
  "a stored copy of derived state is a second opinion waiting to differ");

/* ================================================================== *
 * C. THE CARD CARRIES IT, AND onSetDC RUNS IT ONCE
 * ================================================================== */

ok("C1 the check card carries the held-over outcome",
  /pendingOutcome: this\.outcome\?\.degree\?\.key \? null : \(this\.pendingOutcome \?\? null\)/.test(check),
  "stored only when the roll did not resolve — otherwise every action is re-runnable");
ok("C1b the check accepts it from its caller",
  /this\.pendingOutcome = config\.pendingOutcome \?\? null;/.test(check),
  "it has to exist on the instance before toMessage writes the flag");

/* ------------------------------------------------------------------ *
 * C2 — ORDERING, WHICH IS THE WHOLE OF IT.
 *
 * THE DEFECT THIS CHECK EXISTS FOR, found by driving 3.423.1 live.
 *
 * The first version built the context AFTER `TRGCheck.roll` returned and
 * assigned `check.pendingOutcome` there. Both halves looked right and
 * both were: the workflow set the field, and check.mjs stored it. What
 * was false is that either happened IN TIME — `toMessage` writes the
 * card's flag DURING the roll, so the card went out carrying
 * `pendingOutcome: null` and "Set DC" had nothing to resume from.
 *
 * The original C2 asserted the field was assigned somewhere in the file.
 * A claim about presence cannot catch a defect about sequence, and this
 * one shipped past a full sweep because of it.
 * ------------------------------------------------------------------ */

const ctxAt = flow.indexOf("const outcomeContext = {");
const payloadAt = flow.indexOf("const pendingOutcome = pendingOutcomeContext(");
const rollAt = flow.indexOf("const check = await TRGCheck.roll({");
ok("C2 the context is built before the roll, not after it",
  ctxAt > 0 && payloadAt > ctxAt && rollAt > payloadAt,
  `context@${ctxAt} payload@${payloadAt} roll@${rollAt} — the flag is written during the roll`);
ok("C2b and is handed to the roll rather than assigned afterwards",
  /await TRGCheck\.roll\(\{\s*\n\s*pendingOutcome,/.test(flow),
  "anything set on the check after roll() returns is already too late");
ok("C2c nothing assigns it to the check after the fact",
  !/check\.pendingOutcome\s*=/.test(flow),
  "that assignment is the defect, restored");

const setDC = functionBody(card, "async function onSetDC(message, raw, dcValue)");
ok("C3 onSetDC was located", setDC.length > 300);
// THE REAL FUNCTION, NOT A NAME THAT LOOKS LIKE IT. The first draft
// asked only whether `resumeActionOutcome(` appeared in onSetDC — and a
// mutation that replaced the import with `const resumeActionOutcome =
// async () => false` sailed straight through it, because the CALL was
// still there. A check that a name is present is not a check that the
// thing behind the name does anything.
ok("C4 setting a DC runs the held-over outcome",
  /resumeActionOutcome\s*\}\s*=\s*await import\("\.\.\/combat\/action-workflow\.mjs"\)/.test(setDC)
  && /await resumeActionOutcome\(/.test(setDC),
  "this is the whole fix: a degree that arrives late must still mean something");
ok("C5 and only once", /pending\.applied/.test(setDC) && /applied: true/.test(setDC),
  "a GM correcting a mistyped DC must not hand out a second studied target");
ok("C6 the outcome runs before the card re-renders",
  setDC.indexOf("resumeActionOutcome(") < setDC.indexOf("recomputeAndUpdate("),
  "the sheet should be written by the time the player reads the degree that wrote it");

const resume = functionBody(flow, "export async function resumeActionOutcome(stored, rawDegree, margin = null)");
ok("C7 resumeActionOutcome refuses a second run itself",
  /stored\.applied/.test(resume),
  "the guard lives at both ends, because the caller is not the only caller it may ever have");
ok("C8 and refuses a still-unresolved degree",
  /if \(!rawDegree\) return false;/.test(resume),
  "setting a DC that still yields no degree must change nothing");
ok("C9 an action or actor that has since gone returns quietly",
  /if \(!actor \|\| !action\) return false;/.test(resume),
  "a deleted item is already handled — every branch is written `&& repairTarget`");

/* ================================================================== *
 * D. THE PRECEDENT THAT PROVED THIS WAS GENERAL
 * ================================================================== */

ok("D1 Scoundrel's Luck's after-the-fact refund is still recorded as such",
  /the card whose DC arrived AFTER\s*(?:\n\s*\/\/)?\s*the roll/.test(card),
  "one feature had already met this problem and solved it only for itself");

/* ================================================================== */

const label = "verify-resume-outcome";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
