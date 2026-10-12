#!/usr/bin/env node
/**
 * verify-scorching-ray — R5, built at last on R13's ruling.
 *
 * NEW at 3.600.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SPELL FIRED ONE RAY AND CHARGED FOR THREE.
 *
 * `castAP` read "1-3 AP" and there were NO `apOptions`, so the extra actions
 * bought nothing; `resolveSpellAttack` took `targets[0]` and no other; and the
 * penalty counter advanced immediately, so a second Strike in the same turn was
 * penalised as though three rays had already flown. Both halves of the printed
 * rule were wrong, in opposite directions.
 *
 * SECTION V IS A TRAP I WALKED INTO AND MEASURED. See V5.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  MAX_RAYS, raysForAP, volleyClosingLine, volleyMapAdvance, volleyNoTargetsLine,
  volleyOpeningLine, volleyTargets
} from "../module/magic/ray-volley.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => {
  checks += 1;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};
const eq = (label, got, want, detail = "") =>
  ok(label, String(got) === String(want), `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${detail ? ` — ${detail}` : ""}`);

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const cast = strip(read("module", "magic", "cast-workflow.mjs"));

/* ================================================================== *
 * A. ONE RAY PER ACTION, TO A MAXIMUM OF THREE
 * ================================================================== */

eq("A1 one action is one ray", raysForAP(1), 1);
eq("A2 two actions are two rays", raysForAP(2), 2);
eq("A3 three actions are three rays", raysForAP(3), 3);
eq("A4 AND THREE IS THE CAP — \"to a maximum of three rays\"", raysForAP(9), 3);
eq("A4b the cap is the printed one", MAX_RAYS, 3);
eq("A5 A CAST OF NOTHING STILL FIRES ONE RAY", raysForAP(0), 1,
  "a volley of nothing would be a spell that does nothing");
eq("A5b and so does a nonsense AP", raysForAP("banana"), 1);
eq("A5c and a negative one", raysForAP(-3), 1);

/* ================================================================== *
 * T. AT A DIFFERENT TARGET EACH
 * ================================================================== */

const A = { uuid: "a" };
const B = { uuid: "b" };
const C = { uuid: "c" };
const D = { uuid: "d" };
eq("T1 three marked creatures and three rays fire at all three",
  volleyTargets([A, B, C], 3).length, 3);
eq("T2 THE LIST IS DEDUPLICATED, not truncated",
  JSON.stringify(volleyTargets([A, A, B, C], 3).map((x) => x.uuid)), JSON.stringify(["a", "b", "c"]),
  "\"three different targets\" — two tokens of one creature are one target");
eq("T2b so a caster who marked one creature twice fires at two, not three",
  volleyTargets([A, A, B], 3).length, 2);
eq("T3 more marked than bought takes the first few",
  JSON.stringify(volleyTargets([A, B, C, D], 2).map((x) => x.uuid)), JSON.stringify(["a", "b"]));
eq("T4 nothing marked is no targets", volleyTargets([], 3).length, 0);
eq("T4b and a bad argument is no targets", volleyTargets(null, 3).length, 0);
eq("T5 nulls in the list are skipped rather than counted",
  JSON.stringify(volleyTargets([null, A, null, B], 3).map((x) => x.uuid)), JSON.stringify(["a", "b"]),
  "an untargeted token has no actor and must not consume a ray");
eq("T6 a ray count of zero still asks for one target", volleyTargets([A, B], 0).length, 1);

/* ================================================================== *
 * M. THE PENALTY, DEFERRED AND THEN PAID IN FULL
 * ================================================================== */

eq("M1 THE ADVANCE IS THE NUMBER OF RAYS FIRED", volleyMapAdvance(3), 3);
eq("M1b two rays advance it by two", volleyMapAdvance(2), 2);
eq("M2 AND BY WHAT FLEW, NOT BY WHAT WAS BOUGHT",
  volleyMapAdvance(2), 2,
  "a caster who paid three actions and found two targets has made two attacks");
eq("M3 nothing fired advances nothing", volleyMapAdvance(0), 0);
eq("M3b and a nonsense count does not go negative", volleyMapAdvance(-5), 0);

ok("M4 THE COUNT IS FROZEN BEFORE THE FIRST RAY",
  /const mapBefore = Number\(actor\.getFlag\?\.\(SYSTEM_ID, "attackCount"\) \?\? 0\);\s*lines\.push\(line\(volleyOpeningLine/
    .test(cast),
  "every ray must roll at the penalty as it stood before the volley");
ok("M4b and passed to each ray as `mapCount`", /mapCount: mapBefore,/.test(cast));
ok("M5 EACH RAY DEFERS THE ADVANCE", /deferMapAdvance: true,/.test(cast));
ok("M5b and the single-ray path still advances it",
  /if \(!deferMapAdvance && spellCountsTowardMAP\(spellData\)\) \{/.test(cast),
  "every other attack spell in the pack must behave exactly as it did");
ok("M6 THE VOLLEY ADVANCES IT ONCE, AFTER THE RAYS",
  /const advance = volleyMapAdvance\(results\.length\);[\s\S]{0,200}setFlag\?\.\(SYSTEM_ID, "attackCount", mapBefore \+ advance\)/
    .test(cast));
ok("M6b and only for a spell that counts toward the penalty at all",
  /if \(advance && counts\(spell\.system\)\) \{/.test(cast));

/* ================================================================== *
 * V. THE VOLLEY IN THE WORKFLOW
 * ================================================================== */

ok("V1 the call site resolves a volley",
  /spellAttack = await resolveSpellVolley\(actor, spell, check, lines, clMods, warpMods, \{/.test(cast));
ok("V1b and the ray count comes from the AP mode the caster picked",
  /rays: Number\(apMode\?\.rays \?\? 0\)/.test(cast));
ok("V2 A VOLLEY OF ONE TAKES THE ORDINARY PATH",
  /if \(rays <= 1\) return resolveSpellAttack\(actor, spell, check, lines, clMods, warpMods, opts\);/.test(cast),
  "689 other attack spells must be untouched by this release");
ok("V3 each ray resolves against its OWN creature",
  /targetOverride: targetActor,/.test(cast)
  && /const targetActor = targetOverride \?\? Array\.from\(game\.user\?\.targets \?\? \[\]\)\[0\]\?\.actor \?\? null;/.test(cast));
ok("V4 THE PER-CAST LINES ARE PRINTED ONCE, on the first ray",
  /quiet: index > 0/.test(cast),
  "three copies of the penalty note would bury the three attacks");
ok("V4b and the lines that describe the cast honour it",
  ["if (spellMap && !quiet) {", "if (aggressiveMagic && !quiet) {",
    "if (specialistUplift > 0 && !quiet) {", "if (attackWarp && !quiet) {",
    "for (const row of quiet ? [] : poolRows) {"].every((s) => cast.includes(s)),
  "each of the five per-cast lines describes the CAST, not the ray");
ok("V6 a volley with nothing marked says so rather than firing into nothing",
  /if \(!picked\.length\) \{[\s\S]{0,160}volleyNoTargetsLine/.test(cast));

/* ================================================================== *
 * D. WHAT THE RAYS FEED DOWNSTREAM
 * ================================================================== */

ok("D1 EVERY RAY'S TARGET RECEIVES THE SPELL'S ROWS",
  /spellAttack\.rays\.map\(\(r\) => r\.targetActor\)\.filter\(Boolean\)/.test(cast),
  "a rider on a three-ray volley applies to all three creatures");
ok("D1b and a one-ray cast still passes its single target",
  /: \(spellAttack\?\.targetActor \? \[spellAttack\.targetActor\] : \[\]\);/.test(cast));
ok("D2 ONE CRITICAL INJURY PER RAY THAT CRITTED",
  /for \(const ray of injuryRays\) \{/.test(cast)
  && /severity: ray\.critical\.severity,/.test(cast),
  "reading only the first crit would drop two injuries from a three-ray volley");
ok("D2b and a one-ray cast is its own list",
  /: \(spellAttack \? \[spellAttack\] : \[\]\);/.test(cast));
ok("D3 every ray's dice reach the card",
  /rolls: results\.flatMap\(\(r\) => r\.rolls \?\? \[\]\),/.test(cast));

/* ================================================================== *
 * C. THE CARD
 * ================================================================== */

eq("C1 a volley of one says nothing about rays", volleyOpeningLine("X", 1, 1), "");
ok("C2 a volley of three names the rays and the frozen penalty",
  /3 rays, one per action, each at a different target/.test(volleyOpeningLine("X", 3, 3))
  && /before the volley/.test(volleyOpeningLine("X", 3, 3)));
ok("C3 AND SAYS WHEN FEWER TARGETS WERE MARKED THAN RAYS BOUGHT",
  /only 2 targets were marked, so 2 rays fly/.test(volleyOpeningLine("X", 3, 2)),
  "a caster who paid three actions should see why only two rays flew");
ok("C3b in the singular when it is one",
  /only 1 target was marked, so one ray flies/.test(volleyOpeningLine("X", 3, 1)));
eq("C4 the closing line is silent for one ray", volleyClosingLine(1, 0), "");
ok("C5 and names the whole jump for a volley",
  /advances by 3 &mdash; from 1 to 4 attacks this turn/.test(volleyClosingLine(3, 1))
  && /only now that every ray has resolved/.test(volleyClosingLine(3, 1)));
ok("C6 an empty volley says what to do about it",
  /mark one or more creatures and cast again/.test(volleyNoTargetsLine("X")));

/* ================================================================== *
 * P. THE PACK
 * ================================================================== */

{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  let sys = null;
  const emptyModeRows = [];
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() === "scorching ray") sys = v.system;
      /*
       * V5 IS THE TRAP I WALKED INTO, swept across the whole pack.
       *
       * The workflow reads `apMode?.effects ?? spellData.effects`, and `[]` is
       * NOT nullish — so an AP option carrying an empty effects array replaces
       * the spell's own rows with nothing. My first draft of Scorching Ray's
       * three modes each had `effects: []`, which would have wiped its three
       * notes off the card the moment anybody picked a mode. Measured: it was
       * the only spell in the pack with that shape, which is why nothing had
       * ever caught it.
       */
      const rows = (v.system?.effects ?? []).length;
      for (const mode of v.system?.apOptions ?? []) {
        if (Array.isArray(mode.effects) && mode.effects.length === 0 && rows > 0) {
          emptyModeRows.push(`${v.name} @ ${mode.ap} AP`);
        }
      }
    }
  } finally { await db.close(); }
  ok("P0 Scorching Ray is in the pack", Boolean(sys));
  const modes = sys?.apOptions ?? [];
  eq("P1 THE EXTRA ACTIONS NOW BUY SOMETHING", modes.length, 3,
    "`castAP` read \"1-3 AP\" and there were no apOptions at all");
  eq("P1b one ray per action", JSON.stringify(modes.map((m) => [m.ap, m.rays])),
    JSON.stringify([[1, 1], [2, 2], [3, 3]]));
  ok("P2 every mode keeps the printed range", modes.every((m) => m.range === "30 feet"));
  eq("P3 the damage is the spell's, not the mode's",
    `${sys?.damage?.formula}/${sys?.damage?.type}`, "2d6/fire",
    "\"the target takes 2d6 fire damage\" — every ray deals it");
  eq("P3b and it is still an attack spell", sys?.category, "attack");
  eq("P4 the +2 PP warp still grows every target's damage",
    JSON.stringify(sys?.warps?.map((w) => w.mods)), JSON.stringify([{ damageDice: "1d6" }]),
    "\"the damage to EACH target increases by 1d6\"");
  ok("V5 NO AP MODE IN THE PACK CARRIES AN EMPTY effects ARRAY",
    emptyModeRows.length === 0,
    `${emptyModeRows.join(", ")} would replace the spell's own rows with nothing — `
    + "`[]` is not nullish, so the `?? spellData.effects` fallback never fires");
  const notes = (sys?.effects ?? []).filter((r) => r.kind === "note").map((r) => String(r.text ?? "")).join(" ");
  ok("P5 the card says to mark the targets first",
    /ONE RAY PER ACTION, EACH AT A DIFFERENT TARGET/.test(notes)
    && /Two tokens of one creature count as one target/.test(notes));
  ok("P6 and explains the one-check reading, which is a ruling",
    /ONE CAST A SPELL CHECK, COMPARED AGAINST EACH TARGET SEPARATELY/.test(notes)
    && /the only thing they would add is three chances at the dice/.test(notes));
  ok("P7 and that the penalty is paid afterwards",
    /THE PENALTY CLIMBS AFTERWARDS, BY THE NUMBER OF RAYS/.test(notes));
}

if (failures.length) {
  process.stderr.write(`verify-scorching-ray: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-scorching-ray: OK — ${checks} checks. Up to three rays at three `
  + `different creatures, one check between them, and the penalty paid once at the end.\n`);
