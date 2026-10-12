#!/usr/bin/env node
/**
 * verify-orphaned-spells — the panel row with nothing behind it.
 *
 * NEW at 3.511.0. Graham's ruling of 7 September 2026, on the oldest
 * open item in this project — which turned out never to be a bug.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A sustained spell's registry entry gets no clock ON PURPOSE:
 * `cast-workflow.mjs` refuses to stamp the printed cap because 42 of the
 * 52 sustained spells print one, and stamping it would decide that Bless
 * STOPS at a minute even while its caster keeps sustaining it. That is a
 * rules change nobody made.
 *
 * So the row outlived its effects, and the ruling is to end it when they
 * are gone — no new clock, and no decision about what a sustained spell
 * does.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION N IS THE POINT OF THIS FILE. Three kinds of entry carry no
 * effects and must survive anyway; every one of them would otherwise be
 * swept on the round it was cast. They are checked before anything else
 * because they are the way this ruling goes wrong.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { spellIsOrphaned, orphanedSpellLine } from "../module/magic/orphaned-spells.mjs";
import { castWillRegister, strandedEffectIds, registeredCastIds }
  from "../module/magic/active-spells.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const entry = (over = {}) => ({ id: "cast-1", name: "Bless", targets: ["Actor.a"], ...over });

/* ================================================================== *
 * N. WHAT MUST NEVER BE SWEPT
 * ================================================================== */

// N1 A LOCKED SPELL. The PP stays held whether or not anything is still
// buffed, and sweeping it would hand the caster their points back early.
ok("N1 A LOCKED ENTRY IS NEVER ORPHANED",
  spellIsOrphaned(entry({ lock: "dailyPrep" }), false) === false,
  "the lock is the row's own reason to exist");
ok("N1b including a dismiss-lock", spellIsOrphaned(entry({ lock: "dismissed" }), false) === false);

// N2 AN EMANATION between visitors carries no effects at all.
ok("N2 A LIVE EMANATION IS NEVER ORPHANED",
  spellIsOrphaned(entry({ emanation: { ends: { worldTime: 60 } } }), false) === false,
  "Protective Ward with the area momentarily empty is still standing");

// N3 A SPELL THAT APPLIED NOTHING never lost anything.
ok("N3 AN ENTRY WITH NO TARGETS IS NEVER ORPHANED",
  spellIsOrphaned(entry({ targets: [] }), false) === false,
  "a composition whose whole trace is a conviction point registers with an empty list");
ok("N3b nor one whose target list is missing entirely",
  spellIsOrphaned(entry({ targets: undefined }), false) === false);
ok("N3c nor one whose target list is not a list",
  spellIsOrphaned(entry({ targets: "Actor.a" }), false) === false);

// N4 AND NOTHING WITHOUT AN ID, which would sweep by matching nothing.
ok("N4 an entry with no id is never orphaned",
  spellIsOrphaned(entry({ id: null }), false) === false);

/* ================================================================== *
 * O. WHAT IS SWEPT
 * ================================================================== */

ok("O1 AN ENTRY THAT APPLIED SOMETHING AND HAS NOTHING LEFT",
  spellIsOrphaned(entry(), false) === true,
  "Bless out of combat: its effects expired at the printed minute and the row stayed");
ok("O2 BUT NOT WHILE ANYTHING STILL CARRIES ITS castId",
  spellIsOrphaned(entry(), true) === false,
  "a row whose only survivor is a conjured weapon is not orphaned");
ok("O3 a dismissible entry is swept like any other",
  spellIsOrphaned(entry({ dismissible: true }), false) === true,
  "its stamp ends it first if the duration runs out; this catches the other order");
ok("O4 a sustained entry is swept like any other",
  spellIsOrphaned(entry({ sustained: true, sustainType: "duration" }), false) === true,
  "which is the case the whole ruling is about");

/* ================================================================== *
 * L. THE LINE
 * ================================================================== */

ok("L1 the caster is told, and told why",
  /Bless/.test(orphanedSpellLine("Bless")) && /nothing it applied is left/.test(orphanedSpellLine("Bless")),
  "a row vanishing between glances at the panel is indistinguishable from a bug");

/* ================================================================== *
 * P. THE PACK THIS WAS MEASURED AGAINST
 * ================================================================== */

let sustained = 0, capped = 0;
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  try {
    await db.open();
    for await (const [, v] of db.iterator()) {
      if (v?.type !== "spell") continue;
      const d = String(v.system?.duration ?? "");
      if (!/sustain/i.test(d)) continue;
      sustained += 1;
      if (/\d+\s*(rnd|round|min|minute|hr|hour|day|week|month|year)/i.test(d)) capped += 1;
    }
  } finally { await db.close().catch(() => {}); }
}
// P1 THE MEASUREMENT THE RULING RESTED ON, recorded so a later pack edit
// that changes it is noticed rather than assumed away. The 42 capped
// spells are the ones whose effects expire and whose row now goes with
// them; the other 10 print no cap and are untouched, because nothing
// says they should end.
ok("P1 the sustained spells are still 52", sustained === 52, `${sustained} found`);
ok("P1b of which 42 print a cap", capped === 42, `${capped} capped`);

/* ================================================================== *
 * M. THE MIRROR — effects whose row is gone (3.528.0)
 *
 * `spellIsOrphaned` above ends a ROW that has lost its effects. This is
 * the other direction, and it was found in TRG V14 rather than reasoned
 * about: nine Bless effects on three NPCs and a Light on a fourth, each
 * from a cast no longer registered, none carrying a clock, and nothing in
 * the system that would ever have collected them.
 *
 * SECTION S IS THE ONE THAT MATTERS. The obvious rule — "no clock and no
 * row" — was measured against the pack before anything was built: 96
 * spells produce effects with no clock whose casts are never registered
 * (blank and "varies" durations, Holy Shout and Banishment among them).
 * That rule would have deleted their effects the instant they landed.
 * Stamping at the source is safe by construction; inferring afterwards is
 * not, and these checks pin the difference.
 * ================================================================== */

/* ── which casts get a row, and therefore a stamp ────────────────── */

ok("M1 A SUSTAINED CAST REGISTERS",
  castWillRegister({ durationText: "Sustained (1 minute)", sustained: true }) === true);
ok("M2 SO DOES A DISMISSIBLE ONE",
  castWillRegister({ durationText: "1 minute (D)" }) === true,
  "the (D) is what the Dismiss action reads");
ok("M3 AND A PP-LOCKED ONE",
  castWillRegister({ durationText: "until the next time you make your daily preparations" }) === true);
ok("M4 AND A LIVE EMANATION, WHATEVER ITS DURATION SAYS",
  castWillRegister({ durationText: "1 minute", emanationLive: true }) === true);
ok("M5 AND A SINGLE-CASTING ONE",
  castWillRegister({ durationText: "1 minute", singleCasting: true }) === true);

ok("M6 AN ORDINARY MINUTE DOES NOT",
  castWillRegister({ durationText: "1 minute" }) === false,
  "it ends on its own clock and needs no row");
ok("M7 AND NEITHER DOES A BLANK DURATION",
  castWillRegister({ durationText: "" }) === false,
  "69 spells in the pack print nothing; their effects must never be stamped");
ok("M7b nor \"varies\"", castWillRegister({ durationText: "varies" }) === false,
  "21 more");
ok("M8 nothing at all is not a registration",
  castWillRegister() === false && castWillRegister({}) === false);

/* ── what the sweep will and will not take ───────────────────────── */

const F = (castId, stamped) => ({
  id: `e-${castId}-${stamped ? "s" : "u"}`,
  flags: { "trg-prime": stamped ? { castId, endsWithCast: true } : { castId } }
});

ok("S1 A STAMPED EFFECT WHOSE ROW IS GONE IS STRANDED",
  JSON.stringify(strandedEffectIds([F("gone", true)], new Set(["live"]))) === JSON.stringify(["e-gone-s"]));
ok("S2 A STAMPED EFFECT WHOSE ROW IS STILL THERE IS NOT",
  strandedEffectIds([F("live", true)], new Set(["live"])).length === 0,
  "the spell is running; this is the ordinary case for every sustained buff");
ok("S3 AN UNSTAMPED EFFECT IS NEVER TOUCHED, ROW OR NO ROW",
  strandedEffectIds([F("gone", false)], new Set()).length === 0,
  "THE 96. Holy Shout and Banishment leave effects with no clock and no row "
  + "by design — the naive rule deleted them on landing");
ok("S4 an effect with no cast id at all is not touched",
  strandedEffectIds([{ id: "x", flags: { "trg-prime": { endsWithCast: true } } }], new Set()).length === 0);
ok("S5 an effect with no flags of ours is not touched",
  strandedEffectIds([{ id: "y", flags: {} }, { id: "z" }], new Set()).length === 0,
  "a GM's hand-made effect is none of this sweep's business");
ok("S6 THE WHOLE LIST IS RETURNED, NOT THE FIRST",
  strandedEffectIds([F("a", true), F("b", true), F("live", true)], new Set(["live"])).length === 2,
  "three NPCs were each carrying three of these");
ok("S7 an array is not required to be one",
  strandedEffectIds(null, new Set()).length === 0);
ok("S8 AND A PLAIN LIST OF IDS WORKS AS WELL AS A SET",
  strandedEffectIds([F("live", true)], ["live"]).length === 0,
  "so a caller cannot accidentally pass the wrong shape and have everything "
  + "look stranded");

/* ── the ids come from every actor, not just the one being swept ── */

const actorWith = (ids) => ({ getFlag: () => ids.map((id) => ({ id })) });
{
  const live = registeredCastIds([actorWith(["c1"]), actorWith(["c2", "c3"])]);
  ok("R1 EVERY ACTOR'S ROWS COUNT",
    live.has("c1") && live.has("c2") && live.has("c3") && live.size === 3,
    "the row lives on the CASTER and the effect may sit on an ally — a sweep "
    + "that asked only the actor it is cleaning would call every ally's buff an orphan");
}
ok("R2 an actor with no rows contributes nothing",
  registeredCastIds([{ getFlag: () => null }]).size === 0);
ok("R3 and no actors at all is an empty set",
  registeredCastIds(null).size === 0);

/* ── the two halves cannot disagree ──────────────────────────────── */

ok("X1 EVERY DURATION THAT REGISTERS WOULD ALSO BE STAMPED",
  ["Sustained (1 minute)", "1 minute (D)", "unlimited",
   "until the next time you make your daily preparations"]
    .every((d) => castWillRegister({ durationText: d, sustained: /sustain/i.test(d) })),
  "the stamp and the registry guard call this one function; if they ever "
  + "parted, the sweep would either miss orphans or delete live effects");

if (failures.length) {
  process.stderr.write(`verify-orphaned-spells: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-orphaned-spells: OK — ${checks} checks. A row ends when what it applied is gone, `
  + "and a lock, a live emanation and a spell that applied nothing all survive.\n");
