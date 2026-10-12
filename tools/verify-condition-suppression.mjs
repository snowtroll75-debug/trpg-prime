#!/usr/bin/env node
/**
 * verify-condition-suppression — ignoring a condition, and warping how much.
 *
 * NEW at 3.529.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MIRROR OF THE RELIEF SIDE, ONE RELEASE LATE.
 *
 * The chapter heals conditions two ways. RELIEF reduces one — Restoration,
 * built at 3.517.0, with `reliefConditions` to swap which and `reliefBump`
 * to raise how much. SUPPRESSION ignores points of one while a spell lasts
 * — Banish Fatigue, live since the suppression mechanism itself.
 *
 * The mechanism worked; its WARPS did not. Banish Fatigue's own note said
 * so out loud:
 *
 *   "+4 PP removes the fatigue permanently rather than suppressing it —
 *    apply that by hand."
 *
 * So this adds the two shapes the relief side already had, named to match
 * on purpose: `suppressConditions` swaps, `suppressBump` raises,
 * `suppressMax` carries a printed ceiling.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION B IS THE ONE THAT GUARDS AN ASSUMPTION. `warpMaxTimes` sees the
 * warp and never the row it raises, so `suppressBumpMaxTimes` assumes the
 * row grants one point. B3 pins that against the pack, so a future row
 * starting at 2 fails here rather than quietly selling a purchase that
 * buys nothing.
 *
 * WHAT IS DELIBERATELY NOT BUILT, and each is recorded rather than
 * guessed at:
 *
 *   Banish Fatigue's "+4 PP: removes the fatigue permanently" is a
 *   CONVERSION from suppression to relief, not a bigger suppression. A
 *   different verb needs its own ruling.
 *
 *   Renewal's Touch and Indomitable both keep their base rule in a `note`
 *   — a per-turn 2 AP menu, and a triggered relief that waits for the
 *   condition to arrive and then ends the spell. Warping an unbuilt base
 *   is the trap this project has walked into twice; section X pins that
 *   they were left alone on purpose.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  normaliseSuppression, warpedSuppression, suppressBumpMaxTimes,
  suppressedConditionValues, SUPPRESSION_BASE
} from "../module/conditions/suppression.mjs";
import { emptyWarp, aggregateWarpSelection, warpMaxTimes, WARP_UNLIMITED }
  from "../module/magic/spell-warp.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

const BASE = Object.freeze({ condition: "fatigued", amount: 1, label: "Banish Fatigue" });

/* ================================================================== *
 * W. THE TWO WARP SHAPES
 * ================================================================== */

equal("W1 AN UNWARPED SUPPRESSION IS UNCHANGED",
  JSON.stringify(warpedSuppression(BASE, {})), JSON.stringify(BASE));

equal("W2 A BUMP RAISES HOW MANY POINTS ARE IGNORED",
  warpedSuppression(BASE, { suppressBump: 1 }).amount, 2,
  "\"ignore an additional point of fatigue\"");
equal("W2b and it accumulates with the purchases",
  warpedSuppression(BASE, { suppressBump: 3 }).amount, 4);

equal("W3 A SWAP CHANGES WHICH CONDITION IS IGNORED",
  warpedSuppression(BASE, { suppressConditions: ["injured"] }).condition, "injured",
  "\"instead ignore the injured condition\"");
equal("W3b AND LEAVES THE AMOUNT ALONE",
  warpedSuppression(BASE, { suppressConditions: ["injured"] }).amount, 1,
  "a swap says which, not how many");
equal("W3c the two compose",
  JSON.stringify(warpedSuppression(BASE, { suppressConditions: ["injured"], suppressBump: 2 })),
  JSON.stringify({ condition: "injured", amount: 3, label: "Banish Fatigue" }));

equal("W4 A PRINTED CEILING CLAMPS THE TOTAL",
  warpedSuppression(BASE, { suppressBump: 9, suppressMax: 5 }).amount, 5);
equal("W5 AND NO CEILING IS NOT A CEILING OF ZERO",
  warpedSuppression(BASE, { suppressBump: 9 }).amount, 10,
  "a falsy cap means none was printed; clamping to it would suppress nothing — "
  + "the shape landedTier had to get right at 3.524.0");
equal("W6 a negative bump buys nothing",
  warpedSuppression(BASE, { suppressBump: -3 }).amount, 1);
equal("W7 an empty swap list is not a swap",
  warpedSuppression(BASE, { suppressConditions: [] }).condition, "fatigued");
equal("W8 a missing spec stays missing", warpedSuppression(null, { suppressBump: 2 }), null);

/* ── the chooser's count ─────────────────────────────────────────── */

equal("B1 A max-5 BUMP IS FOUR PURCHASES", suppressBumpMaxTimes(5), 4,
  "the row already ignores one, so the printed total is one more than the buys");
equal("B1b and a max-2 bump is one", suppressBumpMaxTimes(2), 1);
equal("B2 a ceiling the row already meets is bought never", suppressBumpMaxTimes(1), 0);
equal("B2b and neither is a missing one", suppressBumpMaxTimes(0), 0);
equal("B2c SUPPRESSION_BASE is what the rows actually grant", SUPPRESSION_BASE, 1);

ok("B4 THE OFFER AND THE CLAMP AGREE",
  [2, 3, 5, 8].every((cap) =>
    warpedSuppression({ condition: "injured", amount: SUPPRESSION_BASE },
      { suppressBump: suppressBumpMaxTimes(cap), suppressMax: cap }).amount === cap),
  "buying every purchase offered must land exactly on the printed ceiling; if "
  + "these two part, a caster pays for a point that is never ignored");

/* ================================================================== *
 * V. THE VOCABULARY AND THE CHOOSER
 * ================================================================== */

equal("V1 suppressConditions IS DECLARED", emptyWarp().mods.suppressConditions, null,
  "an undeclared mod key is offered, charged, and silently dropped");
equal("V1b suppressBump IS DECLARED", emptyWarp().mods.suppressBump, 0);
equal("V1c suppressMax IS DECLARED", emptyWarp().mods.suppressMax, 0);

const BUMP = [{ ppCost: 2, text: "ignore an additional point of fatigue", mods: { suppressBump: 1 } }];
const CAPPED = [{ ppCost: 2, text: "ignore a further -1 injury (max -5)", mods: { suppressBump: 1, suppressMax: 5 } }];
const SWAP = [{ ppCost: 2, text: "ignore the injured condition", mods: { suppressConditions: ["injured"] } }];

equal("V2 THE BUMP ACCUMULATES",
  aggregateWarpSelection(BUMP, { "warp-0": 3 }).mods.suppressBump, 3);
equal("V2b and charges for each", aggregateWarpSelection(BUMP, { "warp-0": 3 }).ppSpent, 6);
equal("V3 THE SWAP DOES NOT ACCUMULATE",
  JSON.stringify(aggregateWarpSelection(SWAP, { "warp-0": 3 }).mods.suppressConditions),
  JSON.stringify(["injured"]),
  "stating the same condition three times is stating it once");
equal("V4 THE CEILING DOES NOT SCALE",
  aggregateWarpSelection(CAPPED, { "warp-0": 3 }).mods.suppressMax, 5);

equal("V5 AN UNCAPPED BUMP IS AN OPEN COUNT", warpMaxTimes(BUMP[0]), WARP_UNLIMITED,
  "Banish Fatigue prints no ceiling, so the caster's PP is the only limit");
equal("V6 A CAPPED ONE OFFERS EXACTLY ITS PURCHASES", warpMaxTimes(CAPPED[0]), 4);
equal("V7 AND A SWAP IS A CHECKBOX", warpMaxTimes(SWAP[0]), 1);

/* ================================================================== *
 * S. IT STILL REACHES THE SHEET
 * ================================================================== */

{
  const values = new Map([["fatigued", 3]]);
  const after = suppressedConditionValues(values, [warpedSuppression(BASE, { suppressBump: 1 })]);
  equal("S1 TWO IGNORED POINTS LEAVE ONE", after.get("fatigued"), 1,
    "the warp has to reach the same subtraction the base does");
}
{
  const values = new Map([["fatigued", 3], ["injured", 2]]);
  const after = suppressedConditionValues(values,
    [warpedSuppression(BASE, { suppressConditions: ["injured"] })]);
  equal("S2 A SWAP MOVES WHICH ONE IS SUBTRACTED FROM", after.get("injured"), 1);
  equal("S2b and leaves the printed one alone", after.get("fatigued"), 3);
}

ok("S3 EVERY CONDITION THESE WARPS NAME IS ONE THE REGISTRY KNOWS",
  ["injured", "dazed", "weakened", "fatigued"].every((c) => Boolean(CONDITIONS[c])),
  "a suppression of a condition nothing knows subtracts from nothing, for ever, "
  + "silently — the applier refuses it at cast time and this refuses it at build time");

/* ================================================================== *
 * THE PACK
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) spells.push(v);
await db.close();
const spell = (n) => spells.find((s) => s.name === n);

/* ── P. THE TWO THAT WERE BUILT ───────────────────────────────────── */

const voh = spell("Voice Of Healing");
const vohRow = (voh?.system?.effects ?? []).find((e) => e.kind === "suppress");
ok("P1 VOICE OF HEALING HAS A SUPPRESSION AT ALL", Boolean(vohRow),
  "its printed \"may ignore up to -1 of the Dazed or Weakened condition\" lived in a note");
equal("P1b of one point", vohRow?.amount, 1);
equal("P1c on the half that was authored", vohRow?.condition, "dazed",
  "a suppression row carries ONE condition and the book offers a choice; the warp is the swap");
ok("P1d and it normalises", Boolean(normaliseSuppression(vohRow)));

equal("P2 ITS SWAP WARP IS LIVE",
  JSON.stringify(voh?.system?.warps?.[0]?.mods?.suppressConditions), JSON.stringify(["injured"]));
equal("P3 AND ITS BUMP CARRIES THE PRINTED CEILING",
  voh?.system?.warps?.[2]?.mods?.suppressMax, 5);
equal("P3b beside the count it caps", voh?.system?.warps?.[2]?.mods?.suppressBump, 1);
ok("P3c THE CEILING IS THE ONE THE SENTENCE PRINTS",
  /max\s*-?5/i.test(String(voh?.system?.warps?.[2]?.text ?? "")),
  "a mod saying 5 under a sentence saying something else is a mis-authoring "
  + "neither one can reveal alone");

const bf = spell("Banish Fatigue");
equal("P4 BANISH FATIGUE'S EXTRA POINT IS LIVE",
  bf?.system?.warps?.[0]?.mods?.suppressBump, 1);
ok("P4b AND CARRIES NO CEILING, BECAUSE IT PRINTS NONE",
  !bf?.system?.warps?.[0]?.mods?.suppressMax
  && !/max/i.test(String(bf?.system?.warps?.[0]?.text ?? "")));

/* ── B3: THE ASSUMPTION `warpMaxTimes` RESTS ON ─────────────────── */

const cappedRows = [];
for (const s of spells) {
  for (const w of (s.system?.warps ?? [])) {
    if (!w?.mods?.suppressMax) continue;
    const row = (s.system?.effects ?? []).find((e) => e.kind === "suppress");
    cappedRows.push({ spell: s.name, base: row?.amount ?? null });
  }
}
ok("B3 EVERY CAPPED BUMP SITS ON A ROW THAT GRANTS EXACTLY ONE",
  cappedRows.length > 0 && cappedRows.every((r) => r.base === SUPPRESSION_BASE),
  `${JSON.stringify(cappedRows)} — suppressBumpMaxTimes assumes a base of 1 because `
  + "warpMaxTimes never sees the row; a row starting at 2 would sell a purchase that "
  + "buys nothing, and this is what stops that shipping quietly");

/* ── X. LEFT INERT ON PURPOSE ─────────────────────────────────────── */

// BUILT AT 3.611.0 (block 34, "Your recommendation"). It CONVERTS a
// suppression into a relief rather than enlarging one, which is why it
// waited: the different verb is a relief row the warp unlocks.
ok("X1 BANISH FATIGUE'S \"PERMANENTLY\" UNLOCKS A RELIEF ROW",
  JSON.stringify(bf?.system?.warps?.[1]?.mods?.unlocks ?? []) === JSON.stringify(["permanent"])
  && (bf?.system?.effects ?? []).some((e) => e.kind === "conditionRelief" && e.condition === "fatigued" && e.unlockedBy === "permanent"),
  "the +4 PP option must buy the removal and nothing else");

// RENEWAL'S TOUCH CAME OFF AT 3.614.0 (block 35's R8): its base rule is
// built — a `turnOptions` row offered each turn — so the warps feed it now.
// It is a choice of reductions, not a suppression, and still carries none.
{
  const kinds = (spell("Renewal’s Touch")?.system?.effects ?? []).map((e) => e.kind);
  ok("X3 RENEWAL'S TOUCH'S BASE IS BUILT, AS A TURN CHOICE, NOT A SUPPRESSION",
    kinds.includes("turnOptions") && !kinds.includes("suppress"), JSON.stringify(kinds));
}
for (const name of ["Indomitable"]) {
  const s = spell(name);
  const kinds = (s?.system?.effects ?? []).map((e) => e.kind);
  ok(`X2 ${name} KEEPS ITS BASE RULE IN A NOTE, SO ITS WARPS STAY INERT`,
    kinds.includes("note") && !kinds.includes("suppress") && !kinds.includes("conditionRelief"),
    `${JSON.stringify(kinds)} — warping an unbuilt base is the trap this project has `
    + "walked into twice; pinned here so a later release reads a decision");
}

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-condition-suppression: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-condition-suppression: OK — ${checks} checks. `
  + "A suppression can be swapped and raised, and the ceiling is the one printed.\n");
