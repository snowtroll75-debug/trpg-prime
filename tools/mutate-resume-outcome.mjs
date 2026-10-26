#!/usr/bin/env node
/**
 * mutate-resume-outcome — can verify-resume-outcome fail?
 *
 * NEW at 3.423.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT: setting a DC after the roll resolved the
 * degree, re-rendered the card, and applied nothing — so the card could
 * read "Heroic" over an action that had done nothing at all.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FLOW = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const CARD = path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs");
const CHECK_MJS = path.join(SYSTEM_ROOT, "module", "dice", "check.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-resume-outcome.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT.
    file: CARD,
    name: "THE SHIPPED DEFECT: setting a DC resolves the degree and applies nothing",
    from: "    const { resumeActionOutcome } = await import(\"../combat/action-workflow.mjs\");",
    to: "    const resumeActionOutcome = async () => false;",
    breaks: "C4 — the card reads Heroic over an action that did nothing"
  },
  {
    file: CARD,
    name: "the outcome runs after the card has already re-rendered",
    // RE-ANCHORED AT 3.520.0: this named the list's last entry PLUS its
    // closing delimiter, which is the A3 shape — it dies the day an entry
    // is appended after it. It now names only the line it removes.
    from: "  await recomputeAndUpdate(message, raw);",
    to: "",
    breaks: "C6 — and the card would never update at all"
  },
  {
    // IDEMPOTENCE. A GM correcting a mistyped DC must not pay twice.
    file: CARD,
    name: "the held-over outcome can run more than once",
    from: "  if (pending && !pending.applied) {",
    to: "  if (pending) {",
    breaks: "C5 — a corrected DC hands out a second studied target"
  },
  {
    file: FLOW,
    name: "the resume guard at the far end is dropped too",
    from: "  if (!stored || stored.applied) return false;",
    to: "  if (!stored) return false;",
    breaks: "C7 — the guard must hold at both ends, not just at today's caller"
  },
  {
    file: FLOW,
    name: "an unresolved degree still runs the outcome",
    from: "  if (!rawDegree) return false;",
    to: "  if (false) return false;",
    breaks: "C8 — setting a DC that yields no degree would apply a null outcome"
  },
  {
    file: FLOW,
    name: "a deleted actor or a vanished action is not checked for",
    from: "  if (!actor || !action) return false;",
    to: "  if (false) return false;",
    breaks: "C9 — the outcome would run against nothing and throw mid-card"
  },
  {
    // THE SERIALISATION HAZARD. A document in a message flag comes back
    // as a lifeless copy: no update(), no toggleStatusEffect, no id.
    file: FLOW,
    name: "the target actor is stored as a document rather than an id",
    from: "    targetActorId: ctx.targetActor?.id ?? null,",
    to: "    targetActor: ctx.targetActor ?? null,",
    breaks: "B3/B4 — a dead copy of an Actor cannot be written to"
  },
  {
    file: FLOW,
    name: "the item being repaired is not carried across at all",
    from: "    repairTargetId: ctx.repairTarget?.id ?? null,",
    to: "",
    breaks: "B2/B3 — the repair branch is `&& repairTarget`, so it silently does nothing"
  },
  {
    file: FLOW,
    name: "Create's setup is gathered but never stored",
    from: "    createSetup: ctx.createSetup ?? null,",
    to: "",
    breaks: "B2 — a field present at the roll and absent on resume is a branch that quietly stops"
  },
  {
    file: FLOW,
    name: "the actor's feats are stored instead of recomputed",
    from: "    actorFeatNames: Array.from(actor?.items ?? [])",
    to: "    actorFeatNamesX: Array.from(actor?.items ?? [])",
    breaks: "B5 — Shadowborn Agility stops being read on a resumed card"
  },
  {
    // THE OTHER DIRECTION: storing a pending outcome for a roll that
    // ALREADY applied one would double every resolved action in the game.
    file: CHECK_MJS,
    name: "a pending outcome is stored even when the roll resolved",
    from: "              pendingOutcome: this.outcome?.degree?.key ? null : (this.pendingOutcome ?? null),",
    to: "              pendingOutcome: this.pendingOutcome ?? null,",
    breaks: "C1 — every resolved action becomes re-runnable from its own card"
  },
  {
    // THE LIVE DEFECT FOUND ON 3.423.1: built after the roll, by which
    // time the card and its flag already existed. Both halves read
    // correct; neither happened in time.
    file: FLOW,
    name: "THE LIVE DEFECT: the held-over outcome is assembled after the roll",
    // RE-ANCHORED AT 3.621.0: an attack action's condition terms are worked
    // out between the two (block 39's R7), so the roll's argument is anchored alone.
    // AND AT 3.672.0, where the roll takes `{ pendingOutcome, ...rollConfig }`.
    from: "TRGCheck.roll({ pendingOutcome, ...rollConfig })",
    to: "TRGCheck.roll({ ...rollConfig })",
    breaks: "C2/C2b — the card goes out with pendingOutcome:null and Set DC has nothing to run"
  },
  {
    file: CHECK_MJS,
    name: "the check stops accepting it from its caller",
    from: "    this.pendingOutcome = config.pendingOutcome ?? null;",
    to: "    this.pendingOutcome = null;",
    breaks: "C1b — nothing can reach the instance before toMessage writes the flag"
  },
  {
    file: FLOW,
    name: "the outcome goes back to reading the live check object",
    from: "  const shadowborn = shadowbornAgilityDegree(action.key, rawDegree, actorFeatNames);",
    to: "  const shadowborn = shadowbornAgilityDegree(action.key, check.outcome?.degree?.key ?? null, actorFeatNames);",
    breaks: "A4/A7 — there is no TRGCheck on a resumed card, only a message flag"
  },
  {
    file: CHECK_MJS,
    name: "the card stops carrying the held-over outcome",
    from: "              pendingOutcome: this.outcome?.degree?.key ? null : (this.pendingOutcome ?? null),",
    to: "",
    breaks: "C1 — nothing to resume from, so Set DC has nothing to run"
  },
  {
    // A CHECK THAT CANNOT FIND ITS SUBJECT MUST FAIL rather than pass
    // every regex against an empty string. This is the mistake the
    // extractor itself made on its first run.
    file: FLOW,
    name: "applyActionOutcome is renamed out from under the check",
    from: "async function applyActionOutcome({",
    to: "async function applyActionOutcomeX({",
    breaks: "A1/A2 — an empty function body satisfies nothing and must not read as pass"
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

const guard = guardFiles([FLOW, CARD, CHECK_MJS, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-resume-outcome: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-resume-outcome: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-resume-outcome: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
