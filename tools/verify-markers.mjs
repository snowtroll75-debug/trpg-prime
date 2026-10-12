#!/usr/bin/env node
/**
 * verify-markers — the marker vocabulary, the clamp it feeds, and the
 * wiring between them.
 *
 * NEW at 3.395.0, for Stabilise (Chapter 10, PP 0).
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT A MARKER IS AND WHY IT NEEDS ITS OWN CHECK
 *
 * Every other spell effect kind changes something the sheet displays, so
 * a broken one is visible: no bonus appears, no condition lands, no HP
 * moves. A MARKER IS INVISIBLE BY CONSTRUCTION. It sets a flag that only
 * one rule in one other subsystem ever reads, at the end of a dying
 * character's turn. If the key is misspelled at either end, Stabilise
 * applies cleanly, prints a confident line on the card, shows an effect
 * in the Effects tab — and does nothing, for ever, with no symptom.
 *
 * That is the exact failure this project has already paid for twice:
 * Improved Combat Reflexes (code said one name, pack said another, the
 * test agreed with the code) and the six tradition rules silently
 * disabled across 106 spells. Both were green until Graham pressed a
 * button. So this file is written to fail on the DAY the key diverges
 * rather than on the day somebody happens to be dying.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D RUNS THE FUNCTIONS. It does not grep for them.
 *
 * Four separate checks in the 24 August batch passed by finding a string
 * and calling that evidence — one of them matched the module's own
 * comment about the thing it was looking for. `findMarker` and
 * `consumeMarker` want a Foundry actor, so section D builds a stub with
 * the three properties they actually touch (`effects`, `disabled`,
 * `delete`) and asks them real questions. A stub is not Foundry, but a
 * stub that can record a deletion can prove a deletion happened, and
 * that is the whole claim.
 */

import fs from "node:fs";
import path from "node:path";
import * as walk from "acorn-walk";
import { SYSTEM_ROOT, parseAll, rel, reportParseFailures } from "./lib/sources.mjs";
import { MARKERS, isMarkerKey, markerKeyOf, findMarker, consumeMarker, markerFlagData }
  from "../module/magic/markers.mjs";
import { stabilisedDyingDelta, stabiliseWouldHelp, dyingCheckOutcome }
  from "../module/combat/turn-economy.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. The clamp — run, with the printed degrees as the inputs
 * ================================================================== */

// NOT HAND-WRITTEN DELTAS. Feeding this `+1` and `-2` would test my
// memory of Chapter 7's table, not the system's. `dyingCheckOutcome` is
// the thing that decides what a degree is worth, so the degrees are the
// inputs and the table is consulted, not copied — the same reason
// verify-wildshape-vocabulary opens the packs instead of trusting names.
const DEGREES = ["heroic", "critical", "success", "partial", "failure", "fumble"];

for (const degree of DEGREES) {
  const { delta } = dyingCheckOutcome(degree);
  const clamped = stabilisedDyingDelta(delta, true);

  ok(`A1 ${degree}: stabilised never increases Dying (delta ${delta} → ${clamped})`,
    clamped <= 0,
    "the printed effect is that the condition does not increase");

  if (delta <= 0) {
    // THE HALF THAT IS EASY TO GET WRONG. A clamp written as `return 0`
    // satisfies "does not increase" and turns Stabilise into a spell
    // that CANCELS a Critical recovery — a penalty disguised as a buff.
    ok(`A2 ${degree}: a good roll is not held at zero (delta ${delta} → ${clamped})`,
      clamped === delta,
      "Stabilise must not cost the target a recovery it rolled for itself");
  } else {
    ok(`A3 ${degree}: an increase becomes no change (delta ${delta} → ${clamped})`,
      clamped === 0);
  }

  // UNSTABILISED IS UNTOUCHED. Without this, a clamp that ignored its
  // second argument entirely would pass every check above.
  ok(`A4 ${degree}: without the marker the delta is unchanged`,
    stabilisedDyingDelta(delta, false) === delta,
    `${stabilisedDyingDelta(delta, false)} !== ${delta}`);
}

ok("A5 a blunder is not reachable by the clamp",
  dyingCheckOutcome("blunder").dead === true && dyingCheckOutcome("blunder").delta === 0,
  "if a Blunder ever carries a positive delta, the declared reading in "
    + "turn-economy.mjs (Stabilise does not save a Blunder) silently stops "
    + "being true and Deathless is no longer the only thing that can");

/* ================================================================== *
 * B. When the marker is worth spending
 * ================================================================== */

for (const degree of DEGREES) {
  const { delta } = dyingCheckOutcome(degree);
  const wouldHelp = stabiliseWouldHelp(delta);

  ok(`B1 ${degree}: asked for only when it changes the result`,
    wouldHelp === (stabilisedDyingDelta(delta, true) !== delta),
    `stabiliseWouldHelp said ${wouldHelp}, but the clamp ${
      stabilisedDyingDelta(delta, true) !== delta ? "does" : "does not"} change this delta`);
}

// B1 IS A RELATIONSHIP, NOT A CONSTANT, and that is the point: it says
// "we spend the marker exactly when spending it does something". Change
// either function alone and it breaks; change the rules coherently and
// it still holds. A pair of hard-coded booleans would have to be edited
// by hand on the day the ruling changed, which is how a check ends up
// asserting last year's rules.

ok("B2 a partial does not spend the marker", stabiliseWouldHelp(0) === false,
  "no change is not an increase — spending here would waste a one-round spell");

/* ================================================================== *
 * C. The registry and the packs agree, in both directions
 * ================================================================== */

async function packMarkerKeys() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const used = new Map(); // marker key → [spell names]
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      for (const effect of value.system?.effects ?? []) {
        if (effect?.kind !== "marker") continue;
        const k = String(effect.marker ?? "");
        if (!used.has(k)) used.set(k, []);
        used.get(k).push(value.name);
      }
    }
  } finally {
    await db.close();
  }
  // AND THE ALCHEMICAL PACK (3.577.0). Fist of Rock, Angelstep and Dream
  // Lichen leave markers from a bottle rather than a spell, through the
  // same `applySpellEffects`. Their rows live under
  // `flags.trg-prime.consumable.effect` — in `effects`, or in a mode's
  // `effects` — and a key there is exactly as silent when misspelled.
  const alch = path.join(SYSTEM_ROOT, "packs", "alchemical");
  if (fs.existsSync(alch)) {
    const adb = new ClassicLevel(alch, { valueEncoding: "json" });
    await adb.open();
    try {
      for await (const [key, value] of adb.iterator()) {
        if (!key.startsWith("!items!")) continue;
        const block = value?.flags?.["trg-prime"]?.consumable?.effect;
        if (!block) continue;
        const rows = [...(block.effects ?? []), ...(block.modes ?? []).flatMap((m) => m.effects ?? [])];
        for (const effect of rows) {
          if (effect?.kind !== "marker") continue;
          const k = String(effect.marker ?? "");
          if (!used.has(k)) used.set(k, []);
          used.get(k).push(value.name);
        }
      }
    } finally {
      await adb.close();
    }
  }
  return used;
}

const used = await packMarkerKeys();
ok("C0 the spells pack could be read", used !== null);

if (used) {
  // PACK → REGISTRY. A misspelled key in the compendium is the silent
  // failure this whole file exists for.
  for (const [key, spells] of used) {
    ok(`C1 the marker "${key}" is in MARKERS (used by ${spells.join(", ")})`,
      isMarkerKey(key),
      "spell-effects.mjs will print 'Unknown marker' and change nothing");
  }

  // REGISTRY → PACK, which is §5.12 — scope tested in both directions.
  // An entry here that no spell uses is a mechanism with no caller, and
  // §5.1 says that is not automation.
  for (const key of Object.keys(MARKERS)) {
    ok(`C2 the MARKERS entry "${key}" is used by at least one spell or alchemical item`,
      (used.get(key) ?? []).length > 0,
      "a marker no spell applies is dead vocabulary — delete it or wire it");
  }

  // AND THE SPELL THIS WAS BUILT FOR, named. C1 and C2 would both pass
  // on an empty pack and an empty registry; this one will not.
  ok("C3 Stabilise carries the stabilised marker",
    (used.get("stabilised") ?? []).includes("Stabilise"),
    `stabilised is on: ${(used.get("stabilised") ?? []).join(", ") || "nothing"}`);
}

/* ================================================================== *
 * D. The lookup and the spend, run against a stub actor
 * ================================================================== */

const SYSTEM_ID = "trg-prime";

// THE STUB IS BUILT BY THE SYSTEM'S OWN WRITER, not by hand. Writing
// `{ marker: key }` here is the version this file shipped with, and
// mutate-markers #10 walked straight through it: change spell-effects to
// write the flag under a different name and every one of these checks
// still passed, because the stub agreed with the READER and nobody had
// asked the APPLIER. Going through `markerFlagData` is what makes D1–D13
// a test of the shape the live cast actually produces.
const markerEffect = (key, { disabled = false } = {}) => {
  const effect = {
    disabled,
    flags: { [SYSTEM_ID]: { spellBuff: true, ...markerFlagData(key) } },
    deleted: false,
    async delete() { this.deleted = true; }
  };
  return effect;
};
const stubActor = (...effects) => ({ effects });

{
  const e = markerEffect("stabilised");
  ok("D1 findMarker finds an applied marker", findMarker(stubActor(e), "stabilised") === e);
}
{
  const e = markerEffect("stabilised", { disabled: true });
  ok("D2 findMarker ignores a disabled effect",
    findMarker(stubActor(e), "stabilised") === null,
    "a GM who unticks the effect has turned the spell off");
}
ok("D3 findMarker on an actor with no effects is null",
  findMarker(stubActor(), "stabilised") === null);
ok("D4 findMarker refuses a key the registry does not know",
  findMarker(stubActor(markerEffect("stabilised")), "stabilized") === null,
  "the American spelling is the likeliest typo and must not resolve");

ok("D5 markerKeyOf reads a known key", markerKeyOf({ marker: "stabilised" }) === "stabilised");
ok("D6 markerKeyOf rejects an unknown key", markerKeyOf({ marker: "invented" }) === null);
ok("D7 markerKeyOf on flagless data is null", markerKeyOf(undefined) === null);
ok("D8 markerKeyOf on a non-marker effect is null",
  markerKeyOf({ spellBuff: true }) === null,
  "every spell buff carries this flag object; only some carry a marker");

{
  const e = markerEffect("stabilised");
  const spent = await consumeMarker(stubActor(e), "stabilised");
  ok("D9 consumeMarker reports the marker was there", spent === true);
  ok("D10 consumeMarker actually deletes it", e.deleted === true,
    "a marker that reports spent but stays on the sheet is a permanent Stabilise");
}
{
  const spent = await consumeMarker(stubActor(), "stabilised");
  ok("D11 consumeMarker on a bare actor reports false", spent === false);
}
{
  // A FAILED DELETE MUST STILL CHARGE. The player has had the benefit by
  // the time this returns; reporting false would grant it twice.
  const e = markerEffect("stabilised");
  e.delete = async () => { throw new Error("locked"); };
  // The warning it logs is the CORRECT behaviour under test — swallowing
  // it silently is the thing markers.mjs refuses to do — but printing it
  // in a green sweep trains the eye to ignore stderr. Captured, and
  // asserted on, so it is checked rather than merely hidden.
  const warned = [];
  const realWarn = console.warn;
  console.warn = (...args) => warned.push(args);
  const spent = await consumeMarker(stubActor(e), "stabilised");
  console.warn = realWarn;
  ok("D12 a delete that throws still counts as spent", spent === true);
  ok("D12b and says so rather than swallowing it", warned.length === 1,
    `${warned.length} warnings — a failure to tidy up must be visible`);
}
{
  // TWO MARKERS, ONE SPEND — "a creature can only benefit from Stabilise
  // once per round". Two casts land two effects; the first check must
  // take exactly one.
  const a = markerEffect("stabilised");
  const b = markerEffect("stabilised");
  const actor = stubActor(a, b);
  await consumeMarker(actor, "stabilised");
  ok("D13 one spend removes one marker", a.deleted === true && b.deleted === false,
    `a=${a.deleted} b=${b.deleted}`);
}

/* ================================================================== *
 * E. The wiring is imported and used, not merely mentioned
 * ================================================================== */

const { parsed, failed } = parseAll();
if (reportParseFailures(failed, "verify-markers")) process.exit(1);

const fileNamed = (where) => parsed.find((f) => rel(f.file) === where);

/** Names imported from a module whose path contains `needle`, plus use counts. */
function importedAndUsed(ast, needle, names) {
  const imported = new Set();
  const used = new Map(names.map((n) => [n, 0]));
  walk.simple(ast, {
    ImportDeclaration(node) {
      if (!String(node.source.value).includes(needle)) return;
      for (const s of node.specifiers ?? []) {
        if (s.imported?.name) imported.add(s.imported.name);
      }
    },
    // A DYNAMIC IMPORT IS STILL AN IMPORT, and combat.mjs uses one for
    // markers.mjs deliberately — the Dying Check runs inside a Foundry
    // document class and the static graph there is already heavy. A
    // check that only understood static imports would report this
    // correct wiring as missing.
    ImportExpression(node) {
      if (node.source?.type !== "Literal") return;
      if (!String(node.source.value).includes(needle)) return;
      for (const n of names) imported.add(n);
    },
    Identifier(node) {
      if (used.has(node.name)) used.set(node.name, used.get(node.name) + 1);
    }
  });
  return { imported, used };
}

{
  const where = "module/magic/spell-effects.mjs";
  const file = fileNamed(where);
  ok(`E0 ${where} was parsed`, Boolean(file));
  if (file) {
    const { imported, used } = importedAndUsed(file.ast, "markers.mjs", ["isMarkerKey", "MARKERS"]);
    ok("E1 spell-effects imports isMarkerKey", imported.has("isMarkerKey"));
    ok("E2 spell-effects imports MARKERS", imported.has("MARKERS"));
    ok("E3 spell-effects calls isMarkerKey", used.get("isMarkerKey") >= 1,
      "the guard against an unknown key is what stops a silent no-op");
    ok("E4 spell-effects reads MARKERS", used.get("MARKERS") >= 1);

    // THE CASE ITSELF. E1–E4 would all pass if the import stayed and the
    // `case "marker"` were deleted, because both names are referenced
    // inside it — remove the case and the references go too, but a
    // half-edit that left one behind would not be caught by counts alone.
    let hasCase = false;
    walk.simple(file.ast, {
      SwitchCase(node) {
        if (node.test?.type === "Literal" && node.test.value === "marker") hasCase = true;
      }
    });
    ok("E5 spell-effects has a `case \"marker\"`", hasCase,
      "without it a marker effect falls through to `Unhandled effect kind`");

    // THE FLAG SHAPE HAS ONE AUTHOR. This is the check that closes the
    // gap mutate-markers #10 walked through: the applier must go through
    // markers.mjs's writer rather than composing the flag object itself,
    // because a second author is a second spelling waiting to happen.
    const fd = importedAndUsed(file.ast, "markers.mjs", ["markerFlagData"]);
    ok("E16 spell-effects builds the flag with markerFlagData",
      fd.imported.has("markerFlagData") && fd.used.get("markerFlagData") >= 1,
      "an inlined `marker:` literal here is a second place deciding the key");
  }
}

{
  const where = "module/documents/combat.mjs";
  const file = fileNamed(where);
  ok(`E6 ${where} was parsed`, Boolean(file));
  if (file) {
    const te = importedAndUsed(file.ast, "turn-economy.mjs",
      ["stabilisedDyingDelta", "stabiliseWouldHelp"]);
    ok("E7 combat imports stabilisedDyingDelta", te.imported.has("stabilisedDyingDelta"));
    ok("E8 combat imports stabiliseWouldHelp", te.imported.has("stabiliseWouldHelp"));
    ok("E9 combat calls stabilisedDyingDelta", te.used.get("stabilisedDyingDelta") >= 1);
    ok("E10 combat calls stabiliseWouldHelp", te.used.get("stabiliseWouldHelp") >= 1);

    const mk = importedAndUsed(file.ast, "markers.mjs", ["consumeMarker"]);
    ok("E11 combat imports consumeMarker", mk.imported.has("consumeMarker"));
    ok("E12 combat calls consumeMarker", mk.used.get("consumeMarker") >= 1);
    // STABILISE'S OWN ASK, by its own line (3.577.0). Combat now imports
    // the marker functions twice — Angelstep's pigment is spent by the
    // same Dying Check — so "combat imports consumeMarker" would still be
    // true with Stabilise's import gone. mutate-markers proved it.
    const combatSrc = file.source.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    ok("E12b Stabilise asks for its own marker",
      /const \{ consumeMarker \} = await import\("\.\.\/magic\/markers\.mjs"\);\s*if \(await consumeMarker\(actor, "stabilised"\)\)/.test(combatSrc));

    // THE RESULT IS USED, not just produced. This is the G5 lesson from
    // 24 August: a check that a function is CALLED passes happily on
    // `stabilisedDyingDelta(delta, true);` as a bare statement, where the
    // clamp runs, returns the right number, and the number is thrown
    // away. What matters is that the call feeds an assignment.
    let assigned = false;
    walk.simple(file.ast, {
      AssignmentExpression(node) {
        if (node.right?.type !== "CallExpression") return;
        if (node.right.callee?.name === "stabilisedDyingDelta") assigned = true;
      },
      VariableDeclarator(node) {
        if (node.init?.type !== "CallExpression") return;
        if (node.init.callee?.name === "stabilisedDyingDelta") assigned = true;
      }
    });
    ok("E13 the clamp's result is assigned, not discarded", assigned,
      "a call whose return value goes nowhere is a call that changes nothing");
  }
}

// AND THE REGISTRY'S OWN CLAIM ABOUT WHO READS IT. `MARKERS[key].reader`
// is documentation, and documentation that nothing checks is the thing
// this project keeps finding out of date. This makes it load-bearing:
// name a module there and it must really consume markers.
for (const [key, entry] of Object.entries(MARKERS)) {
  const file = fileNamed(entry.reader);
  ok(`E14 the reader declared for "${key}" exists (${entry.reader})`, Boolean(file));
  if (!file) continue;
  // A LASTING MARKER IS FOUND, NOT SPENT (3.577.0). Fist of Rock holds for
  // its hour; `consumed: false` says so, and its reader must ask with
  // `findMarker` — a reader that consumed it would end the hour on the
  // first punch.
  const reads = entry.consumed === false ? "findMarker" : "consumeMarker";
  const { imported } = importedAndUsed(file.ast, "markers.mjs", [reads]);
  ok(`E15 the reader declared for "${key}" imports ${reads}`, imported.has(reads),
    `${entry.reader} is named as the reader but never asks for the marker`);
  // AND IT NAMES THE KEY — the registry could otherwise name a module that
  // reads some other marker.
  ok(`E17 the reader declared for "${key}" names "${key}"`, file.source.includes(`"${key}"`),
    `${entry.reader} imports the marker functions but never asks for "${key}"`);
}

/* ================================================================== */

process.stdout.write(`verify-markers: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
