#!/usr/bin/env node
/**
 * verify-light-sources — the eleven sources, checked against their own
 * printed text, and the two rules that govern them.
 *
 * NEW at 3.396.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION A READS THE FIGURES OUT OF THE PACK, not out of my notes.
 *
 * `LIGHT_SOURCES` is a table of eleven step counts and eleven caps that
 * I typed in by hand from the rulebook. A table typed in by hand is a
 * transcription, and this project has already shipped three wrong values
 * that way — Neutralise Poison's area, duration and save, which were
 * Nexus Of Elemental Energy's, absorbed by a parser that could not see a
 * merged heading. They were caught only once something opened the source
 * and compared.
 *
 * So section A opens each item's own description in the compendium and
 * parses the numbers back out: "increase the illumination level by two
 * steps to a maximum of Step 7". If the table and the book disagree,
 * this fails and names both. The check is worth more than the table.
 *
 * IT ALSO CATCHES THE OPPOSITE MISTAKE. A source whose printed text says
 * nothing about illumination but which appears in the table is a source
 * I invented; a pack item whose text DOES mention illumination but which
 * is absent from the table is one I missed. Both directions, §5.12 —
 * and the second direction is the one that found Stabilise was in the
 * book after a heading grep said it was not.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TWO RULINGS ARE CHECKED AS RULES, NOT AS CONSTANTS.
 *
 * Section C does not assert "torch cap is 7". Section A already proves
 * that against the book. Section C asserts the things that no printed
 * line states and that only a decision can settle — that a mundane
 * source dies at Supernatural Darkness where a magical one lives, that
 * nothing survives Abyssal, that a cap never dims a brighter room, that
 * sources do not stack. Those are Graham's rulings and my readings, and
 * they are what a future edit is most likely to break by accident.
 */

import fs from "node:fs";
import path from "node:path";
import * as walk from "acorn-walk";
import { SYSTEM_ROOT, parseAll, rel, reportParseFailures } from "./lib/sources.mjs";
import {
  LIGHT_SOURCES, lightSource, isLightSourceKey, applyLightSource,
  combinedLightLevel, MUNDANE_NEGATED_AT_OR_BELOW, ALL_NEGATED_AT_OR_BELOW,
  DEFAULT_LIGHT_RADIUS_FT, lightRadiusFeet, lightSourceFlagData, lightSourceKeysOn,
  resolvedLevelWithSources, LIT_FLAG, lightSourceKeyForItem, litGearKeysOn,
  fireStarterWarning, FIRE_STARTER, itemIsLit, brightestSourceKey, foundryLightConfig
} from "../module/light-sources.mjs";
import { LIGHT_LEVELS, raiseLightLevel } from "../module/light.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. The table agrees with the printed text
 * ================================================================== */

const WORD_NUMBERS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7
});

const strip = (html) =>
  String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Pull the step change and the cap/floor out of a printed description.
 *
 * TWO SPELLINGS OF THE SAME RULE, because the book uses both:
 *   "...by two steps to a maximum of Step 7 (Flickering Light)"   gear
 *   "...by two steps (max 8)"                                     spells
 * and one for the lowering: "(min 3)".
 *
 * Returns null when the text says nothing about illumination at all,
 * which is how section A tells "not a light source" apart from "a light
 * source whose numbers I got wrong".
 */
function parsePrinted(text) {
  // THE BASE SPELL ONLY. Everything from "Warping Options" or "Caster
  // Level Modifications" onward describes a MODIFIED casting, and its
  // numbers are not this source's numbers.
  //
  // THIS IS NOT HYPOTHETICAL. The first run of this check reported
  // Continual Light's cap as 9, because the spell reads "...equal to
  // that of a torch (increase illumination by two steps). ... Warping
  // Options: ... +2 PP: +1 illumination level (max 9)" and the search
  // for a cap ran off the end of the base text into the warping clause.
  // The base spell prints no cap at all — which is precisely why
  // Graham's asTorch ruling was needed for it. Same failure as the
  // spell parser absorbing Nexus's merged heading: a pattern that did
  // not know where the entry stopped.
  const full = strip(text);
  const boundary = /(warping options|caster level modifications)/i.exec(full);
  const t = boundary ? full.slice(0, boundary.index) : full;
  // "LIGHT LEVEL" IS THE SAME WORD (3.611.0, block 34). Luminance prints
  // "(increasing the light level by three steps)" and Ember Of Devotion
  // "sheds dim light (+1 light level)" — the two auras that became sources
  // this release. Both read here as the same step count, nothing looser.
  const plus = /\(\+(\d+)\s+light level\)/i.exec(t);
  const m = /(increas\w*|lower\w*|reduc\w*)[^.]{0,60}?(?:illumination|light)(?:\s+level)?\s+by\s+(\w+)\s+steps?/i.exec(t)
    ?? (plus ? [plus[0], "increase", plus[1]] : null);
  if (!m) return null;

  const magnitude = WORD_NUMBERS[m[2].toLowerCase()] ?? Number(m[2]);
  if (!Number.isFinite(magnitude)) return { steps: null, cap: null, floor: null, text: t };
  const lowering = /^(lower|reduc)/i.test(m[1]);
  const steps = lowering ? -magnitude : magnitude;

  // The cap phrase is looked for AFTER the step phrase, so a sentence
  // mentioning another item's ceiling earlier cannot be captured.
  const rest = t.slice(m.index);
  const maxWords = /to a maximum of Step\s+(\d+)/i.exec(rest);
  const maxParen = /\(\s*max\s+(\d+)\s*\)/i.exec(rest);
  const minParen = /\(\s*min\s+(\d+)\s*\)/i.exec(rest);

  return {
    steps,
    cap: maxWords ? Number(maxWords[1]) : maxParen ? Number(maxParen[1]) : null,
    floor: minParen ? Number(minParen[1]) : null,
    asTorch: /(equal to that of|same amount of light as)\s+a\s+torch/i.test(t),
    text: t
  };
}

async function packItems(packName) {
  const dir = path.join(SYSTEM_ROOT, "packs", packName);
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || !value?.name) continue;
      out.set(value.name, value);
    }
  } finally {
    await db.close();
  }
  return out;
}

const gear = await packItems("gear");
const spells = await packItems("spells");
ok("A0a the gear pack could be read", gear !== null);
ok("A0b the spells pack could be read", spells !== null);

const packs = { gear, spells };

/**
 * The printed Goods entries, extracted from the rulebook by
 * tools/parse-light-gear.mjs.
 *
 * WHY GEAR NEEDS A SIDECAR AND SPELLS DO NOT. The spells pack carries
 * each spell's full printed text, so a spell can be checked against its
 * own description. The gear pack is TERSE BY DESIGN — 83 of its 101
 * descriptions are under forty characters, and the Torch's entire entry
 * is "+2 illumination levels". That terse form keeps the step count and
 * drops the cap, and the cap is exactly the half that varies between
 * sources and is most likely to be mistyped. Checking gear against the
 * pack would prove the easy half and skip the hard one.
 *
 * A MISSING FILE IS A FAILURE, NOT A SKIP. Deleting the sidecar must not
 * turn five checks green by making them disappear.
 */
const GEAR_BOOK_PATH = path.join(SYSTEM_ROOT, "tools", "light-gear-book.json");
const gearBook = fs.existsSync(GEAR_BOOK_PATH)
  ? JSON.parse(fs.readFileSync(GEAR_BOOK_PATH, "utf8"))
  : null;
ok("A0c the printed gear figures could be read (tools/light-gear-book.json)",
  gearBook !== null,
  "regenerate with: node tools/parse-light-gear.mjs <rulebook.html>");

for (const [key, entry] of Object.entries(LIGHT_SOURCES)) {
  // A CREATURE'S OWN LIGHT (3.650.0, the Glimmerwick's Luminous Aura) is a
  // module ability core's packs do not hold; its figures are the book's,
  // checked here, and the module's verify checks the item itself.
  if (entry.pack === "creature") {
    ok(`A1 ${key}: a creature source declares itself, its item and its printed radius`,
      entry.creature === true && Boolean(entry.item) && Number(entry.radiusFeet) > 0);
    continue;
  }
  const bag = packs[entry.pack];
  ok(`A1 ${key}: names a real ${entry.pack} item ("${entry.item}")`, Boolean(bag?.has(entry.item)));
  const item = bag?.get(entry.item);
  if (!item) continue;

  // SPELLS ARE CHECKED AGAINST THEIR OWN PACK TEXT; GEAR AGAINST THE
  // BOOK SIDECAR. Two sources of truth for one question would normally
  // be the defect this project has a name for — here they are two
  // different questions, because the two packs store different things.
  let printed = null;
  if (entry.pack === "gear") {
    const row = gearBook?.[entry.item.toUpperCase()];
    if (row) {
      printed = {
        steps: WORD_NUMBERS[row.stepsWord] ?? Number(row.stepsWord),
        cap: row.cap,
        floor: null,
        asTorch: false,
        text: row.text
      };
    }
    // AND THE TERSE PACK LINE MUST STILL AGREE ON THE STEPS. It is the
    // only figure the pack carries, it is what a player reads on the
    // item sheet, and a pack saying "+1" beside a book saying two is a
    // discrepancy whichever one is wrong.
    const terse = /\+\s*(\d+)\s+illumination/i.exec(strip(item.system?.description));
    ok(`A1b ${key}: the pack's terse line states its step count`, Boolean(terse),
      `pack says "${strip(item.system?.description).slice(0, 60)}"`);
    if (terse) {
      ok(`A1c ${key}: the pack's step count matches the table (${entry.steps})`,
        Number(terse[1]) === entry.steps,
        `pack says +${terse[1]}`);
    }
  } else {
    printed = parsePrinted(item.system?.description);
  }

  ok(`A2 ${key}: its printed text describes an illumination change`, printed !== null,
    "the table claims this is a light source and the book does not say so");
  if (!printed) continue;

  ok(`A3 ${key}: steps match the book (table ${entry.steps}, book ${printed.steps})`,
    entry.steps === printed.steps);

  // THE CAP IS THE HALF THAT NEEDED A RULING, so it is checked in two
  // ways depending on which kind of source this is.
  if (printed.cap !== null) {
    ok(`A4 ${key}: cap matches the book (table ${entry.cap}, book ${printed.cap})`,
      entry.cap === printed.cap);
  } else if (entry.steps < 0) {
    ok(`A5 ${key}: floor matches the book (table ${entry.floor}, book ${printed.floor})`,
      entry.floor === printed.floor);
  } else if (printed.asTorch) {
    // GRAHAM'S RULING, 25 August 2026. "Equal to that of a torch" carries
    // the torch's cap. Checked against the TORCH'S OWN ENTRY rather than
    // against the literal 7, so if the torch is ever corrected these
    // follow it instead of quietly disagreeing.
    ok(`A6 ${key}: prints no cap and is declared asTorch`, entry.asTorch === true,
      "a source compared to a torch must say so, or the ruling is invisible");
    ok(`A7 ${key}: inherits the torch's cap (${LIGHT_SOURCES.torch.cap})`,
      entry.cap === LIGHT_SOURCES.torch.cap,
      `table says ${entry.cap}`);
  } else {
    // UNWELCOME HALO, and only it. A null cap must be a DECLARED null —
    // a later editor who fills it in with a guess trips A8 and has to
    // come here and write down why.
    ok(`A8 ${key}: prints no cap, so the table declares null`, entry.cap === null,
      `table says ${entry.cap}; the book prints no ceiling for this source`);
  }
}

// A10. THE TABLE INVARIANTS THAT LET applyLightSource DROP ITS GUARDS.
// `applyLightSource` used to carry a `?? 1` default for a missing floor.
// It was unreachable — Darkness is the only lowering source and it
// declares one — so no mutation could prove it, and an unprovable line
// is what this project's harness rules refuse. These two checks are what
// replaced it: the bad case is made impossible to ship rather than
// survivable at runtime.
for (const [key, entry] of Object.entries(LIGHT_SOURCES)) {
  const steps = Number(entry.steps);
  ok(`A10 ${key}: declares a numeric step count`, Number.isFinite(steps) && steps !== 0);
  if (steps < 0) {
    ok(`A10a ${key}: a lowering source declares a numeric floor`,
      Number.isFinite(Number(entry.floor)),
      "applyLightSource has no fallback — an absent floor would produce NaN");
    ok(`A10b ${key}: does not also declare a cap`, entry.cap === undefined,
      "no source in the book both raises and lowers; two ceilings would be ambiguous");
  } else {
    ok(`A10c ${key}: a raising source declares a cap or a declared null`,
      Object.hasOwn(entry, "cap") && (entry.cap === null || Number.isFinite(Number(entry.cap))),
      "an absent `cap` key is a forgotten field; `null` is a declared absence");
    ok(`A10d ${key}: does not also declare a floor`, entry.floor === undefined);
  }
  ok(`A10e ${key}: declares whether it is magical`, typeof entry.magical === "boolean",
    "the Supernatural Darkness rule turns on this flag; undefined would read as mundane");
}

// THE OTHER DIRECTION. Any pack item whose own text moves the ladder and
// which is NOT in the table is a source nothing implements.
for (const [packName, bag] of Object.entries(packs)) {
  if (!bag) continue;
  const known = new Set(
    Object.values(LIGHT_SOURCES).filter((e) => e.pack === packName).map((e) => e.item)
  );
  for (const [name, item] of bag) {
    if (known.has(name)) continue;
    const printed = parsePrinted(item.system?.description);
    if (!printed) continue;
    ok(`A9 ${packName}: "${name}" moves the illumination ladder but is not in LIGHT_SOURCES`,
      false,
      `book says: "${printed.text.slice(0, 110)}…"`);
  }
}

/* ================================================================== *
 * A11. Every source is either wired or DECLARED unwired
 * ================================================================== */

/**
 * Sources that exist in the table but that nothing applies yet, each
 * with the reason it is waiting.
 *
 * THE ANTI-SILENCE RULE, applied to a half-finished batch. Seven of the
 * eleven sources are not wired at 3.396.0, and the difference between a
 * known gap and a forgotten one is whether it is written down. An entry
 * with an empty reason fails, and a source that BECOMES wired while
 * still listed here also fails — a stale exemption is how a real gap
 * gets hidden behind an old excuse.
 */
const NOT_WIRED = Object.freeze({
  // "unwelcome-halo" WIRED AT 3.609.0 (block 33's R4): its degree-dependent
  // light is two gated `light` rows now — the mechanism the reason said was missing.
  darkness:
    "A 20-foot radius globe at a point up to 120 feet away is an AREA, not "
    + "something carried. It is the one source in the table that genuinely "
    + "wants the Region path Graham ruled against for the others, because "
    + "nothing bears it. Region creation already exists (spell-template.mjs), "
    + "so this is wiring rather than design — but it is not the token-attach "
    + "mechanism this batch built.",
});

{
  const wired = new Set();
  if (spells) {
    for (const item of spells.values()) {
      for (const effect of item.system?.effects ?? []) {
        if (effect?.kind !== "light") continue;
        ok(`A11 the light effect on "${item.name}" names a real source ("${effect.source}")`,
          isLightSourceKey(effect.source),
          "spell-effects.mjs will print 'Unknown light source' and change nothing");
        wired.add(String(effect.source));
      }
    }
  }

  // GEAR IS WIRED BY BEING RESOLVABLE, not by carrying an effect. A
  // torch has no `effects` array entry — it becomes a light because
  // `lightSourceKeyForItem` recognises its name, so the honest test of
  // "is it wired" is to hand the real pack item to the real function.
  //
  // THIS IS THE CHECK THAT WOULD HAVE CAUGHT Continual Flame, aimed at
  // gear: it does not compare two strings I wrote, it asks the lookup
  // whether the compendium's own item resolves.
  if (gear) {
    for (const [key, entry] of Object.entries(LIGHT_SOURCES)) {
      if (entry.pack !== "gear") continue;
      const item = gear.get(entry.item);
      if (!item) continue;             // A1 already failed for this one
      const resolved = lightSourceKeyForItem({ type: "gear", name: item.name });
      ok(`A11b the gear item "${item.name}" resolves to ${key}`, resolved === key,
        `resolved to ${resolved}`);
      if (resolved === key) wired.add(key);
    }
  }

  // A CREATURE SOURCE IS WIRED BY THE CODEX TOGGLE (3.650.0), which lays the
  // effect carrying it and attaches the glow — read from the code itself.
  {
    const codex = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "codex-actions-workflow.mjs"), "utf8");
    const toggles = /async function toggleEffect[\s\S]*?attachTokenLight\(/.test(codex);
    for (const [key, entry] of Object.entries(LIGHT_SOURCES)) {
      if (entry.pack === "creature" && toggles) wired.add(key);
    }
  }

  for (const key of Object.keys(LIGHT_SOURCES)) {
    if (wired.has(key)) {
      ok(`A12 "${key}" is wired and is not also listed as unwired`,
        !Object.hasOwn(NOT_WIRED, key),
        "remove the NOT_WIRED entry — a stale exemption hides the next real gap");
      continue;
    }
    const reason = NOT_WIRED[key];
    ok(`A13 "${key}" is unwired and says why`,
      typeof reason === "string" && reason.trim().length > 20,
      "a source nothing applies is a rule with no caller (§5.1); either wire it "
        + "or declare it in NOT_WIRED with a real reason");
  }
}

/* ================================================================== *
 * B. The ladder this builds on has not moved underneath it
 * ================================================================== */

ok("B1 the ladder still runs 1-10", LIGHT_LEVELS.length === 10
  && LIGHT_LEVELS[0].level === 1 && LIGHT_LEVELS[9].level === 10);
ok("B2 level 1 is Abyssal Darkness", LIGHT_LEVELS[0].name === "Abyssal Darkness",
  "ALL_NEGATED_AT_OR_BELOW is 1 because of what level 1 IS");
ok("B3 level 2 is Supernatural Darkness", LIGHT_LEVELS[1].name === "Supernatural Darkness",
  "MUNDANE_NEGATED_AT_OR_BELOW is 2 for the same reason");
ok("B4 the thresholds are ordered", ALL_NEGATED_AT_OR_BELOW < MUNDANE_NEGATED_AT_OR_BELOW);

/* ================================================================== *
 * C. The rules — the parts no printed line states
 * ================================================================== */

const TORCH = "torch";
const LIGHT = "light";

// C1. MUNDANE VERSUS MAGICAL AT SUPERNATURAL DARKNESS. This is the whole
// point of the `magical` flag and the reason raiseLightLevel could not
// be reused.
ok("C1 a torch is negated by Supernatural Darkness",
  applyLightSource(2, TORCH) === 2,
  `got ${applyLightSource(2, TORCH)}`);
ok("C2 the Light spell penetrates Supernatural Darkness",
  applyLightSource(2, LIGHT) === 4,
  `got ${applyLightSource(2, LIGHT)} — 2 + 2 steps, under the cap of 8`);

// C3. ABYSSAL STOPS EVERYTHING, magical included.
for (const key of Object.keys(LIGHT_SOURCES)) {
  const entry = lightSource(key);
  if (entry.steps <= 0) continue;
  ok(`C3 ${key} is negated by Abyssal Darkness`, applyLightSource(1, key) === 1,
    `got ${applyLightSource(1, key)}`);
}

// C7c. AN UNCAPPED SOURCE STILL RAISES (3.650.0). `cap: null` read as level
// 1 through `Number(null)`, and C7/C7b both passed on a source that did
// nothing — it never exceeded its "ceiling" and never darkened.
for (const [key, entry] of Object.entries(LIGHT_SOURCES)) {
  if (entry.steps <= 0 || entry.cap !== null) continue;
  ok(`C7c ${key} raises Dim Light by its ${entry.steps} step(s)`,
    applyLightSource(4, key) === 4 + entry.steps, `got ${applyLightSource(4, key)}`);
}

// C4. THE CAP APPLIES TO THE RAISE, NOT TO THE ROOM. A torch carried
// into a Radiant cathedral must not dim it.
ok("C4 a torch does not dim a Radiant room", applyLightSource(9, TORCH) === 9,
  `got ${applyLightSource(9, TORCH)}`);
ok("C5 a torch in Pitch Black reaches its cap, not past it",
  applyLightSource(3, TORCH) === 5,
  `got ${applyLightSource(3, TORCH)} — 3 + 2 = 5, under the cap of 7`);
ok("C6 a torch cannot exceed its cap",
  applyLightSource(6, TORCH) === 7,
  `got ${applyLightSource(6, TORCH)} — 6 + 2 clamped to 7`);

// C7. EVERY SOURCE OBEYS ITS OWN CAP, from the table rather than by hand.
for (const [key, entry] of Object.entries(LIGHT_SOURCES)) {
  if (entry.steps <= 0) continue;
  const ceiling = entry.cap ?? 10;
  for (let ambient = 3; ambient <= 10; ambient += 1) {
    const got = applyLightSource(ambient, key);
    ok(`C7 ${key} from ${ambient} respects its ceiling`,
      got <= Math.max(ceiling, ambient),
      `got ${got}, ceiling ${ceiling}`);
    ok(`C7b ${key} from ${ambient} never darkens`, got >= ambient, `got ${got}`);
  }
}

// C8. DARKNESS LOWERS AND FLOORS.
ok("C8 Darkness in bright light drops four steps", applyLightSource(8, "darkness") === 4,
  `got ${applyLightSource(8, "darkness")}`);
ok("C9 Darkness floors at 3 rather than reaching Supernatural",
  applyLightSource(5, "darkness") === 3,
  `got ${applyLightSource(5, "darkness")} — min 3 is printed`);
ok("C10 Darkness cannot manufacture Abyssal Darkness",
  applyLightSource(3, "darkness") === 3 && applyLightSource(4, "darkness") === 3);

// C11. THE FLOOR IS WHAT KEEPS THE MUNDANE RULE UNREACHABLE FROM
// DARKNESS. Worth stating: if the floor ever drops to 2 or below, a
// torch stops working inside a Darkness globe, which is a real rules
// change and should not arrive silently.
ok("C11 Darkness never produces a level that negates a mundane source",
  applyLightSource(10, "darkness") > MUNDANE_NEGATED_AT_OR_BELOW,
  "lower the floor and torches start failing inside Darkness — decide that on purpose");

/* ================================================================== *
 * D. Combination — declared readings, run
 * ================================================================== */

ok("D1 two torches are not brighter than one",
  combinedLightLevel(3, [TORCH, TORCH]) === combinedLightLevel(3, [TORCH]),
  `${combinedLightLevel(3, [TORCH, TORCH])} vs ${combinedLightLevel(3, [TORCH])}`);
ok("D2 the brightest source wins",
  combinedLightLevel(3, ["candle", TORCH]) === applyLightSource(3, TORCH),
  `got ${combinedLightLevel(3, ["candle", TORCH])}`);
ok("D3 order does not matter",
  combinedLightLevel(3, ["candle", TORCH]) === combinedLightLevel(3, [TORCH, "candle"]));
ok("D4 no sources leaves the ambient alone", combinedLightLevel(6, []) === 6);

// D5. DARKNESS FIRST. A torch inside a Darkness globe raises from the
// DARKENED level, not from the room's original brightness.
{
  const got = combinedLightLevel(8, ["darkness", TORCH]);
  ok("D5 a torch inside Darkness raises from the darkened level", got === 6,
    `got ${got} — 8 darkened to 4, then +2 by the torch`);
}
{
  // AND THE MAGICAL/MUNDANE RULE STAYS REACHABLE only from an authored
  // Supernatural Darkness, which is what C11 is about.
  const mundane = combinedLightLevel(2, [TORCH]);
  const magical = combinedLightLevel(2, [LIGHT]);
  ok("D6 in authored Supernatural Darkness the torch fails and the spell does not",
    mundane === 2 && magical === 4, `torch ${mundane}, Light ${magical}`);
}
{
  // THE DEEPEST DARKNESS WINS, same shape as brightest-light-wins.
  const one = combinedLightLevel(8, ["darkness"]);
  const two = combinedLightLevel(8, ["darkness", "darkness"]);
  ok("D7 two Darkness globes are not deeper than one", one === two, `${one} vs ${two}`);
}

/* ================================================================== *
 * E. This is a SECOND answer, deliberately — and still not the sense one
 * ================================================================== */

// THE CHECK THAT EXPLAINS THE MODULE'S EXISTENCE. If these two ever
// agreed on every input, one of them would be redundant and the right
// move would be to delete this module. They must disagree, and they must
// disagree in the two specific places the rulebook says they do.
ok("E1 the source rule and the sense rule differ at Supernatural Darkness",
  applyLightSource(2, TORCH) !== raiseLightLevel(2, LIGHT_SOURCES.torch.steps),
  "if these agree, the mundane-source rule has been lost");
// AT AN AMBIENT WHERE THE CANDLE'S OWN CAP BINDS AND THE SENSE CAP DOES
// NOT. The first version of this check used ambient 3, where a candle
// reaches 4 either way — the two rules agreed, the check passed, and it
// proved nothing. Level 5 is the candle's ceiling: the source rule holds
// it there, the sense rule takes it to 6.
ok("E2 the source rule and the sense rule differ on the cap",
  applyLightSource(5, "candle") === 5 && raiseLightLevel(5, LIGHT_SOURCES.candle.steps) === 6,
  `source ${applyLightSource(5, "candle")}, sense ${raiseLightLevel(5, LIGHT_SOURCES.candle.steps)}`
    + " — if these agree, the per-source cap has been lost");

/* ================================================================== *
 * G. Reading sources off an actor — run against a stub
 * ================================================================== *
 *
 * THE STUB IS BUILT BY THE SYSTEM'S OWN WRITER. Composing
 * `{ lightSource: key }` by hand here would agree with the reader and
 * prove nothing about the applier — which is exactly how the marker
 * flag mutation survived 59 checks three days ago. `lightSourceFlagData`
 * is the single author, so this stub and spell-effects.mjs cannot drift
 * apart without both moving together.
 */

const lightEffect = (key, { disabled = false } = {}) => ({
  disabled,
  flags: { "trg-prime": { spellBuff: true, ...lightSourceFlagData(key) } }
});
const actorWith = (...effects) => ({ effects });

ok("G1 a carried source is found",
  lightSourceKeysOn(actorWith(lightEffect("torch"))).join() === "torch");
ok("G2 a disabled effect sheds nothing",
  lightSourceKeysOn(actorWith(lightEffect("torch", { disabled: true }))).length === 0,
  "unticking the effect is how a GM puts a light out");
ok("G3 an actor with no effects carries nothing",
  lightSourceKeysOn(actorWith()).length === 0);
ok("G4 an unknown key is not carried",
  lightSourceKeysOn(actorWith(lightEffect("lantern"))).length === 0,
  "'lantern' is not a key — the three lanterns are lantern-candle/-bullseye/-hooded");
ok("G5 two sources are both found",
  lightSourceKeysOn(actorWith(lightEffect("torch"), lightEffect("light"))).length === 2);
ok("G6 a non-light spell buff is not mistaken for one",
  lightSourceKeysOn(actorWith({ flags: { "trg-prime": { spellBuff: true } } })).length === 0,
  "every spell buff carries that flag object; only some carry a source");

// AND THE READING FEEDS THE ARITHMETIC. G1-G6 would all pass on a
// function that returned the right keys and was called by nothing.
{
  const carried = lightSourceKeysOn(actorWith(lightEffect("torch")));
  ok("G7 what is carried resolves through combinedLightLevel",
    combinedLightLevel(3, carried) === applyLightSource(3, TORCH),
    `got ${combinedLightLevel(3, carried)}`);
}

/* ================================================================== *
 * J. The RESOLUTION contract — the bug the live pass found
 * ================================================================== *
 *
 * `lightLevelForToken` returns `{level, source}` and three callers
 * destructure `.level` from it. The first version of the 3.396.0 wiring
 * returned a bare NUMBER whenever a source was in reach, so all three
 * read `undefined` exactly when a light was lit — the feature broke the
 * thing it fed, and only while in use.
 *
 * It also passed the whole resolution object into `combinedLightLevel`,
 * where `Number({level: 8, …})` is NaN and the fallback answered 8. On a
 * bright scene that is the right answer for the wrong reason, which is
 * why it survived a first look.
 *
 * NEITHER HALF WAS REACHABLE BY A HARNESS while the decision lived
 * inside a Foundry-only function. `resolvedLevelWithSources` exists so
 * that it is, and these are the checks that would have caught it.
 */

const RESOLUTION = Object.freeze({ level: 4, source: "region" });

{
  const got = resolvedLevelWithSources(RESOLUTION, [TORCH]);
  ok("J1 a resolution in gives a resolution out",
    got !== null && typeof got === "object" && !Array.isArray(got),
    `got ${typeof got} (${JSON.stringify(got)}) — a bare number leaves every caller reading undefined`);
  ok("J2 the level is a real number", Number.isFinite(got?.level), JSON.stringify(got));
  ok("J3 the torch actually raised it", got.level === applyLightSource(4, TORCH),
    `got ${got?.level}, expected ${applyLightSource(4, TORCH)}`);
  ok("J4 the source names what changed it", got.source === "sources",
    `got "${got?.source}" — saying "region" once a torch has raised it is a lie to the player`);
}

// J5. THE SHAPE IS THE SAME WHETHER OR NOT ANYTHING IS IN REACH. This is
// the half that actually broke: the old code returned the object in one
// branch and a number in the other, so the callers worked right up until
// the feature did something.
for (const [label, keys] of [
  ["nothing in reach", []],
  ["a source in reach", [TORCH]],
  ["an unknown key", ["invented"]],
  ["a source that changes nothing", ["candle"]]
]) {
  const got = resolvedLevelWithSources(RESOLUTION, keys);
  ok(`J5 ${label}: still a resolution with a numeric level`,
    got && typeof got === "object" && Number.isFinite(got.level),
    `got ${JSON.stringify(got)}`);
  ok(`J5b ${label}: still names a source`,
    typeof got?.source === "string" && got.source.length > 0);
}

// J6. A SOURCE THAT CHANGES NOTHING RETURNS THE ORIGINAL UNTOUCHED,
// identity and all — the caller may be relying on `source` naming the
// region. A candle cannot raise a level already at 4... it can, so use a
// level where it cannot: 5 is the candle's own ceiling.
{
  const atCap = Object.freeze({ level: 5, source: "scene" });
  ok("J6 a source with nothing to add leaves the resolution alone",
    resolvedLevelWithSources(atCap, ["candle"]) === atCap,
    "a no-op must not relabel the source as 'sources'");
}

// J7. THE NaN PATH. Handing this a malformed ambient must not silently
// answer 8 the way `combinedLightLevel`'s own fallback did.
ok("J7 a resolution with no level is returned unchanged",
  resolvedLevelWithSources({ source: "region" }, [TORCH]).level === undefined,
  "inventing a level here is what made the original bug invisible");

// J8. AND THE DARKNESS DIRECTION, since callers read this for penalties.
{
  const bright = Object.freeze({ level: 8, source: "scene" });
  const got = resolvedLevelWithSources(bright, ["darkness"]);
  ok("J8 a darkness source lowers a resolution", got.level === 4, JSON.stringify(got));
}

/* ================================================================== *
 * K. Lit gear — the state the pack does not have
 * ================================================================== *
 *
 * The gear pack carries `equipped` and nothing else. A torch in your
 * hand that nobody has set fire to sheds no light, so `lit` is a flag
 * this system adds — and both halves have to be true, or a burning
 * torch lights the room from inside a closed backpack.
 *
 * Graham's ruling of 25 August: lit state only, no fuel. The printed
 * burn times stay on the item for the table to judge.
 */

const gearItem = (name, { equipped = true, lit = true } = {}) => ({
  type: "gear",
  name,
  system: { equipped },
  flags: { "trg-prime": { [LIT_FLAG]: lit } }
});
const carrying = (...items) => ({ items, effects: [] });

ok("K1 a lit, equipped torch sheds light",
  litGearKeysOn(carrying(gearItem("Torch"))).join() === "torch");
ok("K2 an unlit torch sheds nothing",
  litGearKeysOn(carrying(gearItem("Torch", { lit: false }))).length === 0,
  "equipped is not burning — this is the whole reason the flag exists");
ok("K3 a lit torch that is not equipped sheds nothing",
  litGearKeysOn(carrying(gearItem("Torch", { equipped: false }))).length === 0,
  "otherwise a burning torch lights the room from inside a closed pack");
ok("K4 an item that is not a light sheds nothing",
  litGearKeysOn(carrying(gearItem("Rope"))).length === 0);
ok("K5 a non-gear item is never a light",
  lightSourceKeyForItem({ type: "weapon", name: "Torch" }) === null,
  "a weapon called Torch is a club with a name, not a light source");
ok("K6 the name match is case- and space-insensitive",
  lightSourceKeyForItem({ type: "gear", name: "  torch  " }) === "torch",
  "a world copy renamed in case must still resolve");
// K6b. THE FLAG HAS ONE READER, and the sheet goes through it. The
// inventory row asks a DIFFERENT question from the ladder — a lit torch
// that has been stowed is still burning, so its flame stays bright on
// the sheet while it sheds nothing.
ok("K6b a stowed but lit torch still reads as lit on the sheet",
  itemIsLit(gearItem("Torch", { equipped: false })) === true
    && litGearKeysOn(carrying(gearItem("Torch", { equipped: false }))).length === 0,
  "greying the flame would tell the player they had put it out");
ok("K6c an unlit item reads as unlit", itemIsLit(gearItem("Torch", { lit: false })) === false);

ok("K7 all five gear lights resolve",
  ["Candle", "Lantern, Candle", "Lantern, Bullseye", "Lantern, Hooded", "Torch"]
    .every((n) => lightSourceKeyForItem({ type: "gear", name: n })),
  "these are the names the pack holds; A1 proves that separately");

// K8. THE ONE FUNCTION ANSWERS FOR BOTH. Everything that asks what an
// actor sheds — the ladder, the token glow, and restoreTokenLight's
// "is anything still lit?" — goes through `lightSourceKeysOn`, so gear
// and spells must arrive by the same door.
{
  const actor = {
    items: [gearItem("Torch")],
    effects: [{ disabled: false, flags: { "trg-prime": { ...lightSourceFlagData("light") } } }]
  };
  const keys = lightSourceKeysOn(actor);
  ok("K8 one call returns both the spell and the gear",
    keys.includes("torch") && keys.includes("light"), keys.join("+"));
  ok("K8b and they combine without stacking",
    combinedLightLevel(3, keys) === Math.max(
      applyLightSource(3, "torch"), applyLightSource(3, "light")),
    `${combinedLightLevel(3, keys)}`);
}

// K9. AND THE MUNDANE/MAGICAL RULE NOW HAS A REAL MUNDANE SOURCE TO
// TEST. Until this batch every wired source was magical, so the half of
// Graham's ruling that negates a torch had nothing live behind it.
{
  const keys = litGearKeysOn(carrying(gearItem("Torch")));
  ok("K9 a lit torch is negated by Supernatural Darkness",
    combinedLightLevel(2, keys) === 2, `${combinedLightLevel(2, keys)}`);
  ok("K9b but works in Pitch Black", combinedLightLevel(3, keys) === 5,
    `${combinedLightLevel(3, keys)}`);
}

/* ================================================================== *
 * M. The glow is derived, never decided separately
 * ================================================================== *
 *
 * THE BUG THE LIVE PASS ON 3.397.0 FOUND. The sheet called
 * `attachTokenLight` the instant a torch was lit, without asking whether
 * that torch was shedding anything — so lighting an UNEQUIPPED torch
 * drew a 20-foot glow while `lightSourceKeysOn` correctly reported the
 * actor as shedding nothing. The rule said dark and the picture said
 * lit, because each was answering its own version of the question.
 *
 * `brightestSourceKey(lightSourceKeysOn(actor))` is now the only way the
 * glow is chosen, so the two cannot disagree. These check the choosing.
 */

ok("M1 nothing shed means no glow to draw",
  brightestSourceKey(litGearKeysOn(carrying(gearItem("Torch", { equipped: false })))) === null,
  "a lit but unequipped torch drew a glow it was not entitled to");
ok("M2 something shed means a glow",
  brightestSourceKey(litGearKeysOn(carrying(gearItem("Torch")))) === "torch");
ok("M3 no keys at all is null", brightestSourceKey([]) === null);
ok("M4 an unknown key is not chosen", brightestSourceKey(["invented"]) === null);

// M5. THE BRIGHTEST OF SEVERAL, matching combinedLightLevel's own
// reading. Only one light can be drawn on a token, so it should be the
// one actually setting the level.
ok("M5 a torch beats a candle", brightestSourceKey(["candle", "torch"]) === "torch");
ok("M5b order does not matter", brightestSourceKey(["torch", "candle"]) === "torch");
ok("M6 more steps wins", brightestSourceKey(["torch", "ghostly-lanterns"]) === "ghostly-lanterns",
  "+3 beats +2");
ok("M7 on equal steps the higher cap wins",
  brightestSourceKey(["torch", "light"]) === "light",
  "both +2; Light caps at 8 and a torch at 7");
ok("M8 a darkness source is never drawn as a glow",
  brightestSourceKey(["darkness"]) === null,
  "it lowers the level; there is no light to draw");

// M9. AND THE CHOICE AGREES WITH THE ARITHMETIC. If the brightest key
// were picked by a different rule from the one that decides the level,
// the glow would show a source that is not the one in force.
for (const ambient of [3, 4, 5, 6]) {
  const keys = ["candle", "torch", "light"];
  const chosen = brightestSourceKey(keys);
  ok(`M9 at ambient ${ambient} the drawn source is the one setting the level`,
    applyLightSource(ambient, chosen) === combinedLightLevel(ambient, keys),
    `drew ${chosen} (${applyLightSource(ambient, chosen)}), level is ${combinedLightLevel(ambient, keys)}`);
}

/* ================================================================== *
 * N. The drawn config is complete — the merge bug
 * ================================================================== *
 *
 * FOUND BY THE LIVE PASS ON 3.397.1. `doc.update({light: config})`
 * MERGES: a key the new config omits keeps whatever the old one had.
 * `angle` was set only for the bullseye lantern, so putting out a
 * bullseye and lighting a torch left the torch shining through the
 * lantern's 53° wedge. Nothing errored, the card's numbers were right,
 * and only a particular ORDER of events revealed it.
 *
 * The rule the config now follows is: anything it can ever set, it
 * always sets. N1 is what enforces that, and it is written against the
 * union of every source's keys rather than a list I typed, so a field
 * added for one source in future must appear for all of them.
 */

const DRAWN = Object.keys(LIGHT_SOURCES)
  .map((k) => [k, foundryLightConfig(k)])
  .filter(([, c]) => c !== null);

ok("N0 something is drawn for every raising source",
  DRAWN.length === Object.values(LIGHT_SOURCES).filter((e) => e.steps > 0).length,
  `${DRAWN.length} configs`);

{
  const union = new Set(DRAWN.flatMap(([, c]) => Object.keys(c)));
  for (const [key, config] of DRAWN) {
    for (const field of union) {
      ok(`N1 ${key}'s config sets ${field}`, Object.hasOwn(config, field),
        "a field one source sets and another omits is inherited by the merge — "
          + "this is exactly how the bullseye's cone stuck to a torch");
    }
  }
}

ok("N2 a source with no printed cone draws a full circle",
  DRAWN.filter(([k]) => !lightSource(k).coneFeet).every(([, c]) => c.angle === 360),
  "omitting the angle is what let the wedge persist");
ok("N3 the bullseye draws its printed cone",
  foundryLightConfig("lantern-bullseye").angle === 53,
  `got ${foundryLightConfig("lantern-bullseye").angle}`);
ok("N4 the drawn radius is the source's reach",
  DRAWN.every(([k, c]) => c.dim === lightRadiusFeet(k)));
ok("N5 bright is inside dim", DRAWN.every(([, c]) => c.bright <= c.dim && c.bright >= 0));
ok("N6 a lowering source draws nothing", foundryLightConfig("darkness") === null);
ok("N7 an unknown source draws nothing", foundryLightConfig("invented") === null);

/* ================================================================== *
 * L. The fire starter — warns, never refuses
 * ================================================================== */

ok("L1 carrying a tinderbox produces no warning",
  fireStarterWarning([FIRE_STARTER]) === null);
ok("L2 not carrying one produces a warning",
  typeof fireStarterWarning(["Rope", "Torch"]) === "string");
ok("L3 the warning names the item", /Flint & Steel\/Tinderbox/
  .test(fireStarterWarning([]) ?? ""), fireStarterWarning([]));
ok("L4 the warning says it was lit anyway", /lit anyway/i.test(fireStarterWarning([]) ?? ""),
  "Graham ruled warn-not-block; a message that reads like a refusal is the "
    + "component-gate mistake in new clothes");
ok("L5 the match is case-insensitive",
  fireStarterWarning(["flint & steel/tinderbox"]) === null);
ok("L6 an empty inventory warns rather than throwing",
  typeof fireStarterWarning(undefined) === "string");
ok("L7 a partial name does not satisfy it",
  typeof fireStarterWarning(["Flint"]) === "string",
  "exact, not contained — otherwise a Flintlock would start fires");

// L8. THE ITEM IS REAL. Same protection every other lookup key here has.
ok(`L8 ${FIRE_STARTER} is a real gear item`,
  Boolean(gear?.has(FIRE_STARTER)),
  "the fire-starter check would silently never be satisfied");

/* ================================================================== *
 * H. Reach — printed where printed, declared where not
 * ================================================================== */

ok("H1 the bullseye lantern uses its printed cone",
  lightRadiusFeet("lantern-bullseye") === 75,
  `got ${lightRadiusFeet("lantern-bullseye")} — the book says "in a 75-ft. cone"`);
ok("H2 Unwelcome Halo uses its printed radius",
  lightRadiusFeet("unwelcome-halo") === 20);
ok("H3 Darkness uses its printed radius", lightRadiusFeet("darkness") === 20);
ok("H4 a torch falls back to the declared default",
  lightRadiusFeet(TORCH) === DEFAULT_LIGHT_RADIUS_FT,
  "the book prints no distance for a torch; the fallback is a declared choice");
ok("H5 every source reaches somewhere",
  Object.keys(LIGHT_SOURCES).every((k) => lightRadiusFeet(k) > 0),
  "a source with zero reach is attached to a token and illuminates nothing");
ok("H6 an unknown source reaches nowhere", lightRadiusFeet("invented") === 0);

/* ================================================================== *
 * F. Nothing else has quietly become a second decider
 * ================================================================== */

const { parsed, failed } = parseAll();
if (reportParseFailures(failed, "verify-light-sources")) process.exit(1);

// THE STEP COUNTS AND CAPS LIVE IN ONE PLACE. A module that reaches for
// `raiseLightLevel` while handling a light SOURCE is the mistake this
// file exists to prevent, and it would not show up in any behavioural
// check because it produces plausible numbers.
const SENSE_RULE_CALLERS = Object.freeze({
  "module/light.mjs": Infinity,           // its own home
  "module/senses.mjs": Infinity,          // senses are what it is for
  "module/light-workflow.mjs": Infinity,
  "tools/verify-light-sources.mjs": Infinity,
  // MEASURED, NOT ASSUMED. F1 flagged this file on its first run and it
  // is a false positive: `bestLightStep` reads
  // `creatureAbility.derives.light.raisesLevelBy` — a Darkvision-style
  // ability on a creature — never a carried torch. The sense rule is the
  // right rule there.
  //
  // WORTH RECORDING WHILE LOOKING AT IT: `lightPenaltyRow` and
  // `visualRangeReport` take a parameter named `items` documented as
  // "read for light steps", and they read creature abilities out of it
  // and nothing else. A character holding a lit torch contributes
  // nothing there. That is not wrong — a torch changes the AMBIENT level
  // these functions are handed, which is this batch's job — but the
  // parameter name promises more than the function does.
  "module/light-check.mjs": Infinity
});

for (const file of parsed) {
  const where = rel(file.file);
  if (SENSE_RULE_CALLERS[where] === Infinity) continue;
  let uses = 0;
  walk.simple(file.ast, {
    Identifier(node) { if (node.name === "raiseLightLevel") uses += 1; }
  });
  ok(`F1 ${where} does not reach for the sense rule`, uses === 0,
    `${uses} use(s) — light SOURCES use applyLightSource; if this really is a `
      + "sense, add the file to SENSE_RULE_CALLERS with the reason");
}

/* ================================================================== */

process.stdout.write(`verify-light-sources: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
