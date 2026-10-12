#!/usr/bin/env node
/**
 * verify-effect-kinds-handled — every effect kind the packs USE, the
 * cast applier HANDLES.
 *
 * NEW at 3.435.1, written the hour a table would have seen the message
 * it exists to prevent.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WENT WRONG.
 *
 * Luminance's first live cast printed, on the chat card, three copies of
 *
 *     Unhandled effect kind "perTurn".
 *
 * — once per creature caught in the area. The effect was not unhandled;
 * it was handled somewhere else (the turn clock owns it), and the
 * applier's `default:` branch could not know that. To the table it read
 * as a spell that was broken.
 *
 * THIS IS NOT A ONE-SPELL PROBLEM. `spell-effects.mjs` says so itself:
 * `note` fell through the same way "on every card that had one, which is
 * what Polymorph Other and Gaseous Form have been doing since they were
 * written" — a hundred and thirty spells carrying an effect the applier
 * announced as broken. That was found by eye, twice. This finds it by
 * measurement, before a cast.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE CHECK IS ASKED OF THE REAL PACKS, not of a list of kinds kept
 * somewhere convenient. A declaration would have to be updated by the
 * same person who forgot the case, and would then agree with the bug.
 *
 * TWO WAYS TO HANDLE ONE. `damage` is taken by an `if (effect.kind ===
 * "damage")` BEFORE the switch, everything else by a `case`. A reader
 * that knew only about `case` would report `damage` as unhandled and be
 * believed — the shape of failure this project has met most often. Both
 * forms count, and C1 proves the reader can see each of them.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const APPLIER = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const raw = fs.readFileSync(APPLIER, "utf8");

/*
 * COMMENTS ARE NOT CODE. This file's own comments name `note`, `perTurn`
 * and `damage` in prose; a reader that did not strip them would find
 * every kind "handled" and never fail. Met six times in this project.
 */
/**
 * The kinds the applier can actually reach, by either route.
 *
 * STRIPS ITS OWN COMMENTS rather than trusting a caller to have done it,
 * so that A3 is a test of this function and not of one line of setup.
 */
function handledKinds(source) {
  const code = String(source)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const byCase = [...code.matchAll(/case\s+"([A-Za-z]+)"\s*:/g)].map((m) => m[1]);
  const byGuard = [...code.matchAll(/effect\.kind\s*===\s*"([A-Za-z]+)"/g)].map((m) => m[1]);
  return new Set([...byCase, ...byGuard]);
}

const handled = handledKinds(raw);

/* ================================================================== *
 * A. THE READER CAN SEE WHAT IS KNOWN TO BE THERE
 * ================================================================== */

// BEFORE REPORTING ANYTHING AS MISSING, PROVE THE READER CAN SEE A THING
// KNOWN TO BE PRESENT. The rule this project wrote after a regex counted
// 30 of 335 tracker items and sent Graham looking for a backup of an
// undamaged file.
ok("A1 the reader sees a switch case", handled.has("note"),
  "case \"note\": is in the applier and must be visible to this check");
ok("A2 the reader sees a pre-switch guard", handled.has("damage"),
  "damage is taken by `if (effect.kind === \"damage\")`, never by a case");
ok("A3 the reader is not fooled by comments",
  !handledKinds("// case \"neverImplemented\":\n/* effect.kind === \"alsoNever\" */").size,
  "a kind named only in prose is not handled");

/* ================================================================== *
 * H. THE DECLARED LIST MATCHES THE APPLIER
 *
 * NEW AT 3.503.0, and it is the check that makes `HANDLED_EFFECT_KINDS`
 * safe to rely on. `spell-narration.mjs` used to decide whether a spell
 * had anything mechanical to say from a hand-written list of NINE kinds,
 * against the fifty here — so 42 spells printed their card lines AND
 * their whole description underneath. The list is declared in one place
 * now, and this is what stops it drifting from the switch statement it
 * describes: drifting is a failing check rather than a quiet Tuesday.
 * ================================================================== */

const declared = [...HANDLED_EFFECT_KINDS].sort();
const parsed = [...handled].sort();
ok("H1 the declared list is not empty", declared.length > 0);
const missingFromList = parsed.filter((k) => !declared.includes(k));
const staleInList = declared.filter((k) => !parsed.includes(k));
ok("H2 EVERY HANDLED KIND IS DECLARED",
  missingFromList.length === 0,
  `${JSON.stringify(missingFromList)} — a kind the applier reaches but the list omits makes `
  + "its spells print their description twice, which is how the last 42 arrived");
ok("H3 AND NOTHING IS DECLARED THAT IS NOT HANDLED",
  staleInList.length === 0,
  `${JSON.stringify(staleInList)} — a kind on the list but not in the applier stands a `
  + "description down for a spell nothing will speak for, leaving a silent card");

/* ================================================================== *
 * B. EVERY KIND THE PACKS CARRY
 * ================================================================== */

const packsDir = path.join(SYSTEM_ROOT, "packs");
const used = new Map();   // kind -> [example names]

if (fs.existsSync(packsDir)) {
  const { ClassicLevel } = await import("classic-level");
  for (const dir of fs.readdirSync(packsDir)) {
    const p = path.join(packsDir, dir);
    if (!fs.statSync(p).isDirectory()) continue;
    const db = new ClassicLevel(p, { valueEncoding: "json" });
    await db.open();
    for await (const [, value] of db.iterator()) {
      for (const effect of value?.system?.effects ?? []) {
        const kind = String(effect?.kind ?? "").trim();
        if (!kind) continue;
        if (!used.has(kind)) used.set(kind, []);
        const seen = used.get(kind);
        if (seen.length < 3) seen.push(`${dir}/${value.name}`);
      }
    }
    await db.close();
  }

  ok("B1 the packs were read", used.size > 0, "no effect kinds found at all");

  for (const [kind, examples] of [...used.entries()].sort()) {
    ok(`B2 "${kind}" is handled by the applier`, handled.has(kind),
      `${examples.join(", ")} would print 'Unhandled effect kind "${kind}"' on its card`);
  }

  // THE ONE THAT SHIPPED. Named explicitly so this cannot be satisfied
  // by a pack that has since lost the entry.
  ok("B3 perTurn is among the kinds in use", used.has("perTurn"),
    "Luminance declares it; if this fails the pack entry has been emptied again");
}

/* ================================================================== */

const label = "verify-effect-kinds-handled";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed over ${used.size} effect kinds in use`);
