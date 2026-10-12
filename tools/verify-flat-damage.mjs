#!/usr/bin/env node
/**
 * verify-flat-damage — printed damage with no dice in it.
 *
 * NEW at 3.482.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE GAP THIS EXISTS FOR, AND HOW IT WAS FOUND.
 *
 * Graham, 2 September 2026, from his table: "when a caster in my session
 * last night used orb of acid, it reported no splash damage."
 *
 * `verify-printed-damage` — the ratchet built in 3.452.0 for exactly the
 * fault "a spell prints damage the pack cannot roll" — matches
 * `\b(\d+)d(\d+)\b`. DICE. Orb Of Acid prints "1 splash acid damage",
 * which contains no dice expression, so the whole class of FLAT printed
 * damage was invisible to the instrument built to find it.
 *
 * The ratchet had also read Orb Of Acid as SATISFIED, because its `1d6`
 * was present in the pack — a spell can carry one printed number and be
 * missing another, and a per-spell yes/no cannot see that.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SECOND FILE AND NOT A WIDER REGEX.
 *
 * Flat numbers in prose are mostly NOT damage the spell deals, and a
 * regex loose enough to catch "1 splash acid damage" also catches every
 * one of these, all of which are correct as prose:
 *
 *   Web              "an attack that deals at least 5 slashing damage"  → a THRESHOLD for clearing it
 *   Volcanic Inferno "must inflict a total of 50 damage to the rock"    → object HP
 *   Drop Dead        "appears to be slain by 2 damage"                  → a narrative example in GM text
 *   Ethereal Jaunt   "1 damage per foot you were pushed"                → situational, GM-adjudicated
 *
 * So this file carries an EXCUSED list with a reason per entry, exactly
 * as the dice ratchet carries its backlog, rather than being tuned until
 * it goes quiet. A checker tuned until it looks right is the failure
 * `verify-dead-zone-smoke` was written to replace.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BOTH HALVES RATCHET. The backlog may only SHRINK, and a spell that is
 * fixed must be REMOVED from it — the same two-way rule the dice ratchet
 * learned at 3.452.0, so a repaired spell cannot sit on the list making
 * the backlog look permanent.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/*
 * NOT DAMAGE THE SPELL DEALS. Each of these is a flat number in prose
 * that a loose regex reads as damage and that is correct as it stands.
 * A reason per entry, because an exception with no reason is a
 * suppression — `verify-checks-read-source`'s own rule.
 */
const EXCUSED = new Map([
  ["Web", "\"an attack that deals at least 5 slashing damage or 1 fire damage\" is the THRESHOLD for clearing a square of web, not damage the spell deals."],
  ["Volcanic Inferno", "\"must inflict a total of 50 damage to the rock\" is object HP — the amount needed to break free, not damage dealt."],
  ["Drop Dead", "\"appears to be slain by 2 damage\" is a narrative example inside GM guidance about disbelieving the illusion."],
  ["Ethereal Jaunt", "\"1 damage per foot you were pushed\" is situational and depends on a distance only the GM can judge."],
  ["Slay The Soul", "\"1 essence damage per point of failure\" scales off the save margin; the ladder is on the flat-damage backlog below rather than excused as prose."],
  ["Elemental Fury", "\"1 HP damage per PP of the spell you just cast\" scales off another spell's cost; on the backlog below."],
  ["Serenity", "flat degree ladder (5 / 10 / 10 Mental) — BUILT at 3.485.0 as a flatLadder row; the prose still prints the numbers, which is why it stays excused rather than flagged."],
  ["Word Of Death", "flat degree ladder (20 / 50, plus death thresholds) — BUILT at 3.485.0; the prose still prints the numbers."]
]);

/*
 * THE BACKLOG. Spells printing flat damage the pack carries no way to
 * apply. IT MAY ONLY SHRINK.
 *
 * ORB OF ACID AND ACID BOLT CAME OFF AT 3.482.0 — the two splash spells,
 * and the reason this file exists. See magic/splash.mjs and Graham's
 * ruling that the target takes the splash while adjacent creatures are
 * named for the GM, because the book prints no radius anywhere.
 */
const BACKLOG = new Set([
  // SERENITY AND WORD OF DEATH CAME OFF AT 3.485.0 — the two flat degree
  // ladders. I proposed them together believing they shared a mechanism;
  // reading them showed they share only the SHAPE the prisons already
  // established (four printed outcomes, worse rolls costing more) and
  // nothing else. See magic/flat-ladder.mjs.
  //
  // Flat damage that SCALES off something other than caster level.
  "Slay The Soul", "Elemental Fury",
  // A flat number owed only on a trigger, carried nowhere.
  // SURGE OF THE TEMPEST CAME OFF AT 3.613.0 (block 35's B2): its Fumble's
  // "1 recurring electricity damage" is a recurring condition row now.
  "Dark Tendrils",
  // Basic-save damage to two creature types.
  "Magnificent Dawn"
  //
  // FOUR CAME OFF BEFORE THIS FILE EVER SHIPPED, and how is the point.
  // Acid Bolt, Orb Of Fire, Fire Bolt and Shocking Grasp were put on this
  // list from a first scan that asked whether a number appeared anywhere
  // in the entry's JSON — a test the "1" inside `"formula":"1d6"`
  // satisfies. All four carry `damage.persistent: "1"` and always did.
  // B2 refused to let them sit here once the scan asked the right
  // question, which is the ratchet catching its own author rather than a
  // spell. The dice ratchet learned the same lesson at 3.452.0.
]);

const FLAT = /\b(\d+)\s+((?:splash|persistent|recurring|bleed)\s+)?([A-Za-z]+\s+)?(?:damage|HP damage)\b/gi;

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const printsFlat = [];
let orb = null, bolt = null;
try {
  for await (const [k, v] of db.iterator()) {
    if (!k.startsWith("!items!") || v?.type !== "spell") continue;
    if (/^orb of acid$/i.test(v.name)) orb = v;
    if (/^acid bolt$/i.test(v.name)) bolt = v;
    const s = v.system ?? {};
    const body = String(s.description ?? "")
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      .split(/WARPING OPTIONS/i)[0];
    /*
     * WHICH FLAT NUMBERS THE PACK CAN ACTUALLY APPLY.
     *
     * Collected from the VALUES of mechanism fields, not by searching the
     * whole JSON blob. The first draft of this scan tested whether the
     * number appeared anywhere in the serialised entry, and the "1" in
     * `"formula":"1d6"` satisfied a search for a splash of 1 — so Orb Of
     * Acid, the spell this file was written for, read as SATISFIED.
     * Asking a blob whether it contains a digit is not the same question
     * as asking a spell whether it can roll a number.
     */
    const carried = new Set();
    const note = (val) => {
      const n = Math.trunc(Number(val));
      if (Number.isFinite(n) && n > 0 && String(val).trim() === String(n)) carried.add(n);
    };
    for (const row of (s.effects ?? [])) {
      if (!row || typeof row !== "object") continue;
      for (const key of ["amount", "damage", "value", "perStep", "persistent", "bleed", "splash"]) note(row[key]);
    }
    note(s.damage?.persistent);
    for (const m of body.matchAll(FLAT)) {
      const pre = body.slice(Math.max(0, m.index - 14), m.index);
      if (/d\d+\s*\+?\s*$/i.test(pre)) continue;   // part of "1d6 + 3 damage"
      if (carried.has(Number(m[1]))) continue;        // the pack can apply this one
      printsFlat.push(v.name);
      break;
    }
  }
} finally { await db.close(); }

const names = [...new Set(printsFlat)];

/* ── S. SPLASH, THE TWO SPELLS THAT PRINT IT ─────────────────────── */
const splashRow = (v) => (v?.system?.effects ?? []).find((e) => e?.kind === "splash") ?? null;
ok("S1 Orb Of Acid is in the pack", Boolean(orb));
/*
 * S2 IS GRAHAM'S REPORT, TURNED INTO A CHECK. The spell carried
 * `effects: []` and printed "plus 1 splash acid damage".
 */
ok("S2 AND IT CARRIES ITS SPLASH", splashRow(orb)?.amount === 1,
  "reported from a live table as \"no splash damage\"");
ok("S3 with the acid type it prints", splashRow(orb)?.damageType === "acid");
/*
 * S4 — THE CL LADDER CLIMBS TOO. "CL 4+: the damage increases by 1d6 AND
 * THE SPLASH DAMAGE BY 1" — a splash that never grew would be right at
 * caster level 1 and increasingly wrong above it, which is the quietest
 * possible way to be wrong.
 */
ok("S4 AND ITS SPLASH CLIMBS WITH CASTER LEVEL", splashRow(orb)?.perStep === 1,
  "\"CL 4+: … and the splash damage by 1\"");
ok("S5 Acid Bolt carries its own, larger splash",
  splashRow(bolt)?.amount === 2 && splashRow(bolt)?.damageType === "acid");
ok("S6 and Acid Bolt's does NOT climb", splashRow(bolt)?.perStep === 0,
  "its entry prints no caster-level splash ladder");

/* ── B. THE BACKLOG RATCHET ──────────────────────────────────────── */
const unexplained = names.filter((n) => !EXCUSED.has(n) && !BACKLOG.has(n));
ok("B1 NO NEW SPELL PRINTS FLAT DAMAGE THE PACK CANNOT APPLY",
  unexplained.length === 0,
  `${unexplained.length} new: ${unexplained.join(", ")}`);
/*
 * B2 — AND THE BACKLOG MAY ONLY SHRINK. A spell repaired but left on the
 * list makes the backlog look permanent; the dice ratchet learned this
 * at 3.452.0 and it is the half that keeps the number honest.
 */
const stale = [...BACKLOG].filter((n) => !names.includes(n));
ok("B2 and no backlog entry outlives the printed number it names",
  stale.length === 0,
  `fixed or reworded, so remove from the list: ${stale.join(", ")}`);
ok("B3 every excused entry carries a reason",
  [...EXCUSED.values()].every((r) => String(r).trim().length > 30),
  "an exception with no reason is a suppression");
/*
 * B4 — THE TWO SPLASH SPELLS ARE OFF THE BACKLOG FOR SPLASH. Acid Bolt
 * stays ON it for its separate persistent-on-critical clause, and that
 * distinction is the point: a spell can carry one printed number and
 * still be missing another, which is exactly how the dice ratchet read
 * Orb Of Acid as satisfied.
 */
ok("B4 ORB OF ACID IS OFF THE BACKLOG ENTIRELY",
  !BACKLOG.has("Orb Of Acid"),
  "its only flat number was the splash, and it is carried now");
/*
 * B5 — ACID BOLT IS OFF IT TOO, and the reason is worth keeping. I put it
 * on the backlog believing its "1 persistent acid damage" was unbuilt;
 * the entry carries `damage.persistent: "1"` and always has. The claim
 * was mine, not the pack's.
 */
ok("B5 and Acid Bolt is off it as well, carrying both its printed numbers",
  !BACKLOG.has("Acid Bolt") && splashRow(bolt)?.amount === 2,
  "its persistent was already carried in damage.persistent");

/* ── report ──────────────────────────────────────────────────────── */
console.log(`verify-flat-damage: ${names.length} spells print flat damage; `
  + `${EXCUSED.size} excused as prose, ${BACKLOG.size} on the backlog`);
if (failures.length) {
  console.error(`verify-flat-damage: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-flat-damage: ${checks} checks passed`);
