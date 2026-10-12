#!/usr/bin/env node
/**
 * verify-warped-duration — what a warp may do to a duration, and what it
 * must not quietly take away.
 *
 * NEW at 3.521.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * EIGHTEEN LIVE WARPS WERE TAKING THE (D) AWAY.
 *
 * `(D)` on a printed duration means "this spell can be dismissed", and
 * `isDismissibleDuration` reads it straight off the text. A warp that
 * REPLACES that text — "the duration becomes 10 minutes" — dropped it.
 * Measured before the fix: eighteen live warps did this, including
 * Levitate, Cloudkill, Iron Body, Lock and seven of the nine Shape
 * spells. A caster paid PP for a longer duration and lost the ability to
 * end it early: an upgrade that quietly took something away.
 *
 * SECTION D IS THAT RULE. It is carried forward rather than authored
 * eighteen times, because it is a rule and not eighteen coincidences —
 * lengthening a duration says nothing about dismissing it, and a warp
 * that genuinely meant to remove (D) would have to say so. None does.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION L IS THE SECOND DEFECT. Three warps replace a locked duration
 * with the word "permanent" — Antipathy and Sympathy from "Until next
 * daily preparation", Continual Light from "unlimited" — and
 * `ppLockCondition` matched neither, so BUYING A LONGER DURATION
 * RELEASED PP THAT THE SHORTER ONE HELD.
 *
 * SECTION S IS THE ONE ANSWER FOR SIX READERS. The cast card, the effect
 * application, the PP lock, the Region's expiry, the wildshape rider and
 * the effects engine each carried their own copy of
 * `warpMods?.durationText || spellData.duration`.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  isDismissibleDuration, ppLockCondition, warpedDurationText, sustainAfterWarp, castWillRegister} from "../module/magic/active-spells.mjs";
import { parseSpellDuration } from "../module/magic/effect-duration.mjs";
import { aggregateWarpSelection, warpMaxTimes } from "../module/magic/spell-warp.mjs";

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

/* ================================================================== *
 * D. THE (D) IS CARRIED FORWARD
 * ================================================================== */

equal("D1 A WARP KEEPS A PRINTED (D)",
  warpedDurationText("1 minute (D)", { durationText: "10 minutes" }), "10 minutes (D)",
  "Levitate — a longer duration must not cost the caster the ability to end it");
equal("D2 and does not double it when the warp says it too",
  warpedDurationText("1 minute (D)", { durationText: "10 minutes (D)" }), "10 minutes (D)");
equal("D3 A SPELL THAT WAS NEVER DISMISSIBLE DOES NOT BECOME SO",
  warpedDurationText("1 hour", { durationText: "8 hours" }), "8 hours",
  "Tongues — inventing a (D) would be the same defect pointing the other way");
equal("D4 an unwarped duration is untouched",
  warpedDurationText("1 minute (D)", {}), "1 minute (D)");
equal("D5 and so is one warped to nothing",
  warpedDurationText("1 minute (D)", { durationText: "" }), "1 minute (D)",
  "a blank override is not an override");
equal("D6 a spell with no printed duration takes the warp's outright",
  warpedDurationText("", { durationText: "1 minute" }), "1 minute",
  "Deflect Flame declares none at all");
equal("D7 lower case (d) counts too",
  warpedDurationText("1 minute (d)", { durationText: "unlimited" }), "unlimited (D)");
ok("D8 AND THE CARRIED (D) IS READ BACK AS DISMISSIBLE",
  isDismissibleDuration(warpedDurationText("1 minute (D)", { durationText: "10 minutes" })),
  "the whole point — the text has to survive the round trip");

/* ================================================================== *
 * L. WHAT LOCKS THE PP
 * ================================================================== */

equal("L1 daily preparations lock until the next ones",
  ppLockCondition("until the next time you make your daily preparations"), "dailyPrep");
equal("L2 unlimited locks outright", ppLockCondition("unlimited"), "unlimited");
equal("L3 AND SO DOES PERMANENT", ppLockCondition("permanent"), "unlimited",
  "three warps say it, and it matched nothing until 3.521.0");
equal("L4 an ordinary duration locks nothing", ppLockCondition("10 minutes"), null);
equal("L5 nor does a blank one", ppLockCondition(""), null);
ok("L6 A LONGER DURATION NEVER RELEASES PP THAT A SHORTER ONE HELD",
  ["until next daily preparation", "unlimited"].every((printed) =>
    ppLockCondition(warpedDurationText(printed, { durationText: "permanent" })) !== null),
  "Antipathy, Sympathy and Continual Light each bought exactly that");

/* ================================================================== *
 * P. WHAT THE DURATION PARSES TO
 * ================================================================== */

equal("P1 eight hours is real time", parseSpellDuration("8 hours")?.seconds, 28800);
equal("P2 and ten minutes", parseSpellDuration("10 minutes")?.seconds, 600);
equal("P3 UNLIMITED HAS NO TIMED EXPIRY", parseSpellDuration("unlimited"), null,
  "correct: it ends when dismissed or at daily preparation, not on a clock");
equal("P4 and neither does a daily-preparation duration",
  parseSpellDuration("until the next time you make your daily preparations"), null,
  "the LOCK is what ends it, and `releaseDailyPrepAndSustained` is what reads the lock");
equal("P5 A CARRIED (D) DOES NOT BREAK THE PARSE",
  parseSpellDuration(warpedDurationText("1 minute (D)", { durationText: "10 minutes" }))?.seconds, 600,
  "appending the marker must not cost the spell its clock");

/* ================================================================== *
 * A. THROUGH THE AGGREGATOR
 * ================================================================== */

const W = [{ ppCost: 4, text: "the duration is 8 hours", mods: { durationText: "8 hours" } }];
equal("A1 a duration warp survives aggregation",
  warpedDurationText("1 hour", aggregateWarpSelection(W, { "warp-0": 1 }).mods), "8 hours");
equal("A2 and buying it twice says the same thing",
  warpedDurationText("1 hour", aggregateWarpSelection(W, { "warp-0": 2 }).mods), "8 hours");

/* ================================================================== *
 * THE PACK
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) spells.push(v);
await db.close();

const warpOf = (n, i) => spells.find((s) => s.name === n)?.system?.warps?.[i];

/* ── N. THE FOURTEEN ──────────────────────────────────────────────── */

const BUILT = [
  ["Tongues", 2, "8 hours"], ["Deflect Flame", 0, "1 minute"],
  ["Possession", 0, "10 minutes"], ["Possession", 1, "unlimited"],
  ["Invisible Item", 0, "until the next time you make your daily preparations"],
  ["Invisible Item", 1, "unlimited"], ["Mirage Object", 1, "unlimited"],
  ["Dominate", 0, "unlimited"],
  ["Detect Scrying", 0, "until the next time you make your daily preparations"],
  ["Nightvision", 1, "until the next time you make your daily preparations"],
  ["Darkvision", 1, "until the next time you make your daily preparations"],
  ["Mirage Scene", 1, "unlimited"], ["Gentle Repose", 0, "unlimited"],
  ["Teleportation Circle", 2, "unlimited"]
];
for (const [name, i, text] of BUILT) {
  equal(`N ${name} warp ${i}`, warpOf(name, i)?.mods?.durationText, text);
}
ok("N1 EACH SITS UNDER A SENTENCE ABOUT DURATION",
  BUILT.every(([n, i]) => /duration|lasts/i.test(String(warpOf(n, i)?.text ?? ""))),
  "a mod on the wrong index buys the right thing for the wrong option");

/*
 * N2 IS A SET, NOT A DELTA, and the first draft of this release got it
 * wrong. "The spell takes one more action to cast" is phrased
 * relatively, so it was authored as `castApDelta: 1` — and a delta
 * ACCUMULATES, so the chooser drew an uncapped number box for an option
 * whose second purchase buys no extra duration and costs a second extra
 * action. `verify-warp-repeats` P2 moving 145 → 146 is what said so.
 *
 * PINNED AGAINST THE PRINTED CAST TIME rather than against the literal
 * 3. That arithmetic is the cost of using a set, and this is what keeps
 * it honest: change Gentle Repose's printed cast time and this check
 * fails, rather than the warp quietly meaning something else.
 */
const repose = spells.find((s) => s.name === "Gentle Repose");
equal("N2 GENTLE REPOSE ALSO COSTS AN EXTRA ACTION",
  warpOf("Gentle Repose", 0)?.mods?.castApSet, Number(repose.system.castAP) + 1,
  "\"the spell takes one more action to cast\" — one more than its printed cast time");
equal("N2b AND IT IS A SET, SO THE CHOOSER KEEPS IT A CHECKBOX",
  warpMaxTimes(warpOf("Gentle Repose", 0)), 1,
  "a delta here made it an uncapped box whose repeat purchase was a penalty");

ok("N3 POSSESSION'S (D) IS NOT AUTHORED, IT IS CARRIED",
  !/\(D\)/i.test(String(warpOf("Possession", 0)?.mods?.durationText ?? ""))
  && isDismissibleDuration(warpedDurationText(
    spells.find((s) => s.name === "Possession").system.duration, warpOf("Possession", 0).mods)),
  "authoring it here would work and would hide the rule behind one lucky row");

/* ── E. THE EIGHTEEN THAT WERE LOSING IT ──────────────────────────── */

const stripped = [];
for (const s of spells) {
  for (const [i, w] of (s.system?.warps ?? []).entries()) {
    const dt = w?.mods?.durationText;
    if (!dt) continue;
    if (isDismissibleDuration(s.system.duration)
      && !isDismissibleDuration(warpedDurationText(s.system.duration, w.mods))) {
      stripped.push(`${s.name}[${i}]`);
    }
  }
}
equal("E1 NO WARP IN THE PACK STRIPS A PRINTED (D)", stripped.length, 0,
  `losing it: ${JSON.stringify(stripped)}`);

const rawStrip = spells.flatMap((s) => (s.system?.warps ?? [])
  .filter((w) => w?.mods?.durationText
    && isDismissibleDuration(s.system.duration)
    && !isDismissibleDuration(w.mods.durationText))
  .map(() => s.name));
equal("E2 AND TWENTY OF THEM STILL WOULD, WITHOUT THE RULE", rawStrip.length, 20,
  "measured against the AUTHORED text rather than the resolved one. Eighteen were the defect's own "
  + "footprint; the other two are Possession's, added by this very release and deliberately authored "
  + "WITHOUT the (D) — if the rule ever goes, the two newest rows fail with the eighteen old ones "
  + "rather than quietly surviving on a hand-typed marker");

const lockLost = [];
for (const s of spells) {
  for (const [i, w] of (s.system?.warps ?? []).entries()) {
    const dt = w?.mods?.durationText;
    if (!dt) continue;
    const was = ppLockCondition(s.system.duration);
    if (was && !ppLockCondition(warpedDurationText(s.system.duration, w.mods))) {
      lockLost.push(`${s.name}[${i}]`);
    }
  }
}
equal("E3 AND NO WARP RELEASES A LOCK ITS PRINTED DURATION HELD", lockLost.length, 0,
  `losing it: ${JSON.stringify(lockLost)}`);

/* ── C. THE CHANNEL ───────────────────────────────────────────────── */

let live = 0;
let inert = 0;
/* THE REGEX WAS THE POPULATION, AND IT WAS TOO NARROW (3.537.0).
 *
 * C2 has asserted "none is left inert" since the channel was built, and
 * it was true only of the sentences this pattern happened to match. Four
 * inert duration warps sat just outside it — "the duration CHANGES until
 * next daily preparation", "the spell HAS A DURATION OF 10 minutes" —
 * and C2 passed cleanly the entire time by not looking at them.
 *
 * Same failure as the proficiency pack list: a check whose scope is a
 * literal I wrote, reporting completeness over its own blind spot. */
const RE = /duration (becomes|is|increases|changes)|increase (the )?duration|has a duration of|lasts (for )?\d|until the next time you make your daily|until next daily/i;
for (const s of spells) {
  for (const w of (s.system?.warps ?? [])) {
    if (!RE.test(String(w.text ?? ""))) continue;
    if (w?.mods?.durationText) live += 1; else if (!Object.keys(w.mods ?? {}).length) inert += 1;
  }
}
equal("C1 ONE HUNDRED AND FOUR DURATION WARPS ARE LIVE", live, 104,
  "81 under the old pattern, plus the 4 built at 3.537.0 — and 19 that were ALREADY BUILT "
  + "and simply outside the old regex, which is the more useful half of this number: the "
  + "check was reporting on three quarters of its subject and calling it all of it");
equal("C2 AND NONE IS LEFT INERT", inert, 0,
  "every warp in the pack whose sentence talks about duration now carries a durationText");

/* C2 IS A SEARCH THAT FINDS NOTHING, WHICH IS ALSO WHAT A BROKEN SEARCH
 * RETURNS. It passed for the whole life of this channel while four inert
 * warps sat outside its pattern, so it does not get to claim completeness
 * without evidence that it is looking at something. */
ok("C2b AND THE POPULATION IT CHECKED IS THE BULK OF THE CHANNEL",
  live >= 100 && live + inert >= 100,
  `${live} live and ${inert} inert matched the pattern — if this collapses, C2 is passing `
  + "because it stopped looking rather than because the channel is complete");

/* ── S. SUSTAINING, AND WHAT A FIXED DURATION DOES TO IT ──────────
 *
 * NEW at 3.538.0, from a defect found live rather than here — which is
 * the point worth recording. Every check in this file passed while the
 * result card printed "the duration changes to 1 hour" directly above
 * "Sustained — Sustain it each turn to maintain it", because no check
 * had ever asked what the two lines meant together.
 *
 * Graham's ruling, 9 Sep 2026: the fixed duration replaces sustaining. */

/* S4b/S4c READ THE CAST PATH AS TEXT, and that is a compromise this file
 * names rather than hides. The wiring they assert — which of four sites
 * gets the printed flag and which get the warped one — cannot be
 * exercised without a live Foundry, and getting it backwards is exactly
 * what shipped at 3.538.0 and made a one-hour aura permanent. S4 itself
 * RUNS the predicate; these two only check it is being called correctly.
 * A plain top-level `import fs` is used deliberately: reading via a
 * dynamic import dodges verify-checks-read-source's interception, which
 * is how a vacuous section passed at 3.530.0. */
const castSource = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");

const sustainedSpells = spells.filter((sp) => sp.system?.sustained);
const durationWarpsOnSustained = sustainedSpells.flatMap((sp) =>
  (sp.system?.warps ?? [])
    .map((w, i) => ({ spell: sp.name, i, w }))
    .filter(({ w }) => w?.mods?.durationText));

ok("S1 SUSTAINED SPELLS WITH DURATION WARPS EXIST TO CHECK",
  durationWarpsOnSustained.length >= 9,
  `${durationWarpsOnSustained.length} such warps over ${sustainedSpells.length} sustained `
  + "spells — a collapse here makes every check below pass by finding nothing");

/* THE TWO THAT KEEP SUSTAINING SAY SO IN THEIR OWN TEXT, and they are
 * pinned by name because that is a reading of English, not a mechanism.
 * Lifekeeping's "(S)" and Project Image's "the maximum duration you can
 * SUSTAIN the Spell increases" both raise the cap; every other duration
 * warp on a sustained spell replaces it. */
const stillSustains = durationWarpsOnSustained
  .filter(({ w }) => !w.mods.endsSustain)
  .map(({ spell, i }) => `${spell}[${i}]`).sort();

equal("S2 EXACTLY TWO DURATION WARPS LEAVE A SUSTAINED SPELL SUSTAINED",
  JSON.stringify(stillSustains),
  JSON.stringify(["Lifekeeping[1]", "Project Image[0]"]),
  "a third name here is a warp charging PP to change a duration while the caster still "
  + "sustains each turn, which is the contradiction this release exists to end — and "
  + "these two are the ones whose own wording asks for it");

/* S2b ASSERTS THE TEXT AND ONLY THE TEXT. It first read
 * `stillSustains.length === 2 && ...every(text says so)`, and the
 * mutation runner walked straight through it: replacing the text test
 * with `() => true` still passed, because the length clause held the
 * check up on its own. A conjunction where one half can rot unnoticed is
 * two checks wearing one label. The count is S2's job. */
const saysItKeepsSustaining = (text) => /\(S\)|sustain/i.test(String(text ?? ""));

const keepersWithoutWords = durationWarpsOnSustained
  .filter(({ w }) => !w.mods.endsSustain)
  .filter(({ w }) => !saysItKeepsSustaining(w.text))
  .map(({ spell, i }) => `${spell}[${i}]`);
equal("S2b AND EACH OF THEM SAYS SO IN WORDS",
  JSON.stringify(keepersWithoutWords), JSON.stringify([]),
  "the exception has to be visible in the printed text a player reads, not only in this "
  + "file — otherwise a pinned list is a private opinion");

/* AND THE TEST ITSELF STILL WORKS. S2b is a search that finds nothing,
 * which is what a broken search returns too — the mutation runner proved
 * it by emptying the filter and watching S2b pass. So the predicate is
 * asked directly about text it must and must not match. */
ok("S2c AND THAT TEST STILL RECOGNISES BOTH ANSWERS",
  saysItKeepsSustaining("the duration becomes 1 minute (S)")
  && saysItKeepsSustaining("the maximum duration you can Sustain the Spell increases")
  && !saysItKeepsSustaining("the duration changes to 1 hour"),
  "the two real exceptions and a real replacement, run through the same function S2b "
  + "scans with — without this, S2b passes just as well on a test that has stopped "
  + "distinguishing anything");

/* THE RULE ITSELF, RUN — not the data checked against a list. */
equal("S3 A WARP THAT ENDS SUSTAINING ENDS IT",
  sustainAfterWarp(true, { endsSustain: true }), false,
  "the rule the card, the panel, the clock and the orphan sweep all now share");
equal("S3b AND ONE THAT DOES NOT, DOES NOT",
  sustainAfterWarp(true, { durationText: "1 hour" }), true,
  "changing the duration is not by itself the thing that ends sustaining — Lifekeeping "
  + "carries two rungs with identical durations and opposite answers");
equal("S3c AND AN UNSUSTAINED SPELL IS NEVER MADE SUSTAINED",
  sustainAfterWarp(false, { endsSustain: true }), false,
  "the flag only ever takes sustaining away");

/* ── S4: THE ONE THIS RELEASE GOT WRONG ───────────────────────────
 *
 * FOUND LIVE, NOT HERE, and it is the more important half of the rule.
 *
 * `castWillRegister` does not ask "is the cast sustained". It asks "will
 * anything need to clean this up". I passed it the WARPED answer, and
 * for Circle Of Warmth at 1 hour every one of its four conditions went
 * false at once — not sustained, no PP lock, not dismissible, not
 * single-casting. So the cast registered NOTHING: the aura landed on an
 * ally with no entry, no clock, no emanation record, and nothing in the
 * game that could ever end it. The spell worked and became permanent.
 *
 * A spell whose printed line says Sustained always has something to
 * clean up. The warp changes HOW it ends — a stamp instead of a lapse —
 * never WHETHER it is tracked. */

ok("S4 A WARP THAT ENDS SUSTAINING STILL LEAVES A CAST WORTH TRACKING",
  castWillRegister({ durationText: "1 hour", sustained: true,
    emanationLive: false, singleCasting: false }) === true,
  "the printed flag is what this predicate must be given — with the warped answer it "
  + "returns false for exactly the spells this release changed, and their effects are "
  + "never cleaned up");

equal("S4b AND THE CAST PATH GIVES IT THE PRINTED FLAG",
  castSource.includes("    sustained: spellData.sustained,"), true,
  "the registration predicate and the entry's own field ask different questions and must "
  + "be fed differently — this is the line that was wrong live at 3.538.0");

equal("S4c WHILE THE ENTRY, THE STAMP AND THE BANNER TAKE THE WARPED ONE",
  ["        sustained: warpedSustained,",
   "        ends: (lock || warpedSustained) ? null : endsStamp({",
   "      if (warpedSustained) lines.push"].every((l) => castSource.includes(l)), true,
  "three sites that must NOT use the printed flag, against one that must — getting this "
  + "backwards is what made a one-hour aura permanent");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-warped-duration: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-warped-duration: OK — ${checks} checks. `
  + `${live} duration warps live, none inert, and none of them takes the (D) away any more.\n`);
