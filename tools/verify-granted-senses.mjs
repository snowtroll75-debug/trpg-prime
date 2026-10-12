#!/usr/bin/env node
/**
 * verify-granted-senses — a spell that grants a sense grants a real one.
 *
 * NEW at 3.398.0, for Detect Life and Detect Undead (Chapter 10, PP 0).
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE FAILURE THIS EXISTS TO PREVENT IS SILENT AND TOTAL.
 *
 * `senseOf` returns null for any block whose `category` is not one of the
 * four real ones. So a compendium entry reading `"teritary"` produces a
 * spell that applies cleanly, prints a confident line on its card, adds
 * an item to the sheet — and grants no sense at all, for ever, with no
 * error anywhere. One transposed letter.
 *
 * That is the same shape as the marker key at 3.395.0 and the light key
 * at 3.396.0, and the answer is the same: the block is built by a
 * function that validates, the pack is checked against the builder, and
 * a mutation proves the check can fail.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D IS ABOUT WHAT IS *NOT* AUTOMATED, and it is the part I would
 * most want a reader to see.
 *
 * Both spells say "using your Power Manipulation skill in place of
 * Perception checks". That is not wired, because there is nothing to
 * wire it to: `actorSenses` feeds `system.details.senses`, a DISPLAY
 * line, and no check anywhere in this system rolls "for a sense". The
 * existing SKILL_SUBSTITUTION_FEATS machinery is keyed on a feat name
 * and a named skill ACTION — a different axis entirely.
 *
 * So the phrase is carried onto the sense as text the player can read,
 * and D3 asserts that it is carried rather than quietly dropped. If a
 * per-sense check is ever built, D4 is the check that should start
 * failing, and it says so.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  grantedSenseBlock, senseOf, sensesOf, senseRangeFeet,
  SENSE_CATEGORIES, SENSE_CATEGORY_NAMES
} from "../module/senses.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. The builder makes blocks the reader accepts
 * ================================================================== */

// THE TWO FUNCTIONS ARE ASKED ABOUT EACH OTHER, which is the only
// question that matters: a builder whose output `senseOf` rejects is a
// spell that grants nothing.
for (const category of SENSE_CATEGORY_NAMES) {
  const block = grantedSenseBlock({ category, detects: "x" });
  ok(`A1 ${category}: the builder produces a block`, block !== null);
  ok(`A2 ${category}: senseOf accepts what the builder produced`,
    senseOf({ flags: { "trg-prime": { creatureAbility: { derives: { sense: block } } } } }) !== null,
    "the builder and the reader disagree, which is a spell that grants nothing");
}

ok("A3 an unknown category is refused", grantedSenseBlock({ category: "teritary" }) === null,
  "the transposition that would otherwise ship a silent no-op");
ok("A4 an empty category is refused", grantedSenseBlock({ category: "" }) === null);
ok("A5 no argument at all is refused", grantedSenseBlock() === null);
ok("A6 the category is normalised", grantedSenseBlock({ category: " TERTIARY " })?.category === "tertiary");

/* ================================================================== *
 * B. The range is derived, not stored
 * ================================================================== */

// A GRANTED SENSE MUST NOT CARRY A NUMBER. `senseRangeFeet` computes a
// tertiary sense as 30 + 5 per Wisdom off whoever holds it, so the same
// spell reaches further for a wiser caster — and a stored range would
// freeze it at whatever the author typed.
{
  const block = grantedSenseBlock({ category: "tertiary", detects: "living creatures" });
  ok("B1 the block stores no range", block.rangeFeet === undefined && block.baseFeet === undefined,
    JSON.stringify(block));

  const item = { name: "Detect Life", flags: { "trg-prime": { creatureAbility: { derives: { sense: block } } } } };
  const atWis = (w) => sensesOf([item], w)[0]?.rangeFeet;
  const spec = SENSE_CATEGORIES.tertiary;

  // B2 IS GRAHAM'S RULING OF 25 AUGUST, and the first version of this
  // file failed it. `grantedSenseBlock` carried `special: true`, copied
  // from Blindsight without asking what the flag did — and Chapter 8's
  // "All special senses (except Nightvision) have half the range of a
  // normal sense" is implemented, so every Detect Life would have
  // reached 15 feet instead of 30. Nothing would have errored; the sheet
  // would simply have shown half.
  //
  // The ruling: a spell-granted sense takes FULL range. The book's
  // special senses are a list of innate creature abilities and a spell
  // is not among them.
  ok(`B2 the range is a full tertiary sense, not halved (${spec.base} at Wisdom 0)`,
    atWis(0) === spec.base,
    `${atWis(0)} — half means the block has picked up the special flag, which halves it`);
  ok("B2b and the block does not claim to be a special sense",
    grantedSenseBlock({ category: "tertiary" }).special === undefined,
    "`special` halves the range; `fullRange` would exempt it again and say "
      + "something the ruling did not");
  ok("B3 the range grows with Wisdom", atWis(4) === senseRangeFeet("tertiary", 4),
    `${atWis(4)} vs ${senseRangeFeet("tertiary", 4)}`);
  ok("B4 a wiser caster senses further", atWis(6) > atWis(2), `${atWis(6)} vs ${atWis(2)}`);
}

/* ================================================================== *
 * C. The pack agrees with the builder — both directions
 * ================================================================== */

async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.set(value.name, value);
    }
  } finally {
    await db.close();
  }
  return out;
}

const spells = await spellsPack();
ok("C0 the spells pack could be read", spells !== null);

/** Spells the book gives a granted sense, and what each should detect. */
const EXPECTED = Object.freeze({
  "Detect Life": "living creatures",
  "Detect Undead": "undead creatures"
});

const found = new Map();
if (spells) {
  for (const item of spells.values()) {
    for (const effect of item.system?.effects ?? []) {
      if (effect?.kind !== "sense") continue;
      found.set(item.name, effect);

      // THE PACK'S OWN CATEGORY THROUGH THE REAL BUILDER. Not a string
      // compared against a string I also wrote — the actual entry handed
      // to the actual function that will build from it at cast time.
      const block = grantedSenseBlock(effect);
      ok(`C1 "${item.name}"'s sense category is real ("${effect.category}")`, block !== null,
        "senseOf will reject this and the spell will grant nothing, silently");
      ok(`C2 "${item.name}" says what it detects`,
        typeof effect.detects === "string" && effect.detects.trim().length > 0,
        "a sense that detects nothing in particular is not what either spell prints");
      ok(`C3 "${item.name}" targets the caster`, effect.target === "self",
        `target is "${effect.target}" — neither spell prints a Range or Targets line`);
    }
  }
}

// BOTH DIRECTIONS, §5.12. A spell in the table that the pack does not
// carry is one I failed to wire; a pack entry not in the table is one I
// did not expect and should look at.
for (const [name, detects] of Object.entries(EXPECTED)) {
  ok(`C4 "${name}" carries a sense effect`, found.has(name));
  if (found.has(name)) {
    ok(`C5 "${name}" detects ${detects}`, found.get(name).detects === detects,
      `detects "${found.get(name).detects}"`);
  }
}
for (const name of found.keys()) {
  ok(`C6 the sense-granting spell "${name}" is one this file expects`,
    Object.hasOwn(EXPECTED, name),
    "add it to EXPECTED, or find out why it grants a sense");
}

// C7. AND THE TWO ARE THE SAME SPELL WITH ONE WORD CHANGED, which is
// what the book prints. If they ever diverge in category or target,
// one of them has been edited and the other forgotten.
if (found.has("Detect Life") && found.has("Detect Undead")) {
  const a = found.get("Detect Life"); const b = found.get("Detect Undead");
  ok("C7 both spells share a category", a.category === b.category, `${a.category} vs ${b.category}`);
  ok("C7b both spells share a target", a.target === b.target);
  ok("C7c both spells share the substitution", a.rollWith === b.rollWith);
  ok("C7d and they differ in what they detect", a.detects !== b.detects);
}

/* ================================================================== *
 * D. What is displayed and what is NOT automated
 * ================================================================== */

{
  const block = grantedSenseBlock({
    category: "tertiary", detects: "living creatures", rollWith: "Power Manipulation"
  });
  ok("D1 the note says what it detects", /living creatures/.test(block.note), block.note);

  // D1b IS THE GAP A MUTATION FOUND. Dropping the field left the NOTE
  // intact — the note is built from the argument, not from the field —
  // so every check still passed while the block lost data. Testing the
  // note tested the sentence, not the record.
  ok("D1b the block records what it finds as a field, not only in prose",
    block.finds === "living creatures", JSON.stringify(block));

  // D1c IS WHY IT IS CALLED `finds`. `sensesOf` already returns a field
  // named `detects`, meaning the detection QUALITY — observed, hidden or
  // undetected. Two layers using one word for two things is a trap, and
  // it was invisible here because `sensesOf` builds a fresh object and
  // never reads this one.
  ok("D1c the field does not collide with the output's own `detects`",
    block.detects === undefined,
    "`detects` in a resolved sense means the detection quality, not the quarry");
  {
    const item = { name: "X", flags: { "trg-prime": { creatureAbility: { derives: { sense: block } } } } };
    const resolved = sensesOf([item], 0)[0];
    ok("D1d and the resolved sense still reports a real detection quality",
      ["observed", "hidden", "undetected", "touch"].includes(resolved.detects),
      `got "${resolved.detects}"`);
  }
  ok("D2 the note names the skill to roll", /Power Manipulation/.test(block.note), block.note);
  ok("D3 the substitution is carried, not dropped", block.rollWith === "Power Manipulation",
    "the player has to be told what to roll, since nothing rolls it for them");

  // D4 IS A CHECK ABOUT THE SYSTEM, NOT ABOUT THIS SPELL, and it is
  // deliberately phrased so that BUILDING the missing machinery breaks
  // it. Right now no skill action exists for using a sense, so
  // "Power Manipulation in place of Perception" has nothing to
  // substitute into and is displayed instead. On the day somebody adds
  // one, this fails and points here.
  const actions = await import("../module/data/skill-actions.mjs");
  const names = Object.keys(actions).flatMap((k) => {
    const v = actions[k];
    return Array.isArray(v) ? v.map((a) => a?.key).filter(Boolean) : [];
  });
  ok("D4 no skill action rolls a sense yet — so the substitution stays displayed",
    !names.some((n) => /^(useSense|senseWith|detectWith)/.test(String(n))),
    "a sense-rolling action now exists: wire rollWith into it and delete this check");
}

{
  // A SENSE WITH NO SUBSTITUTION STILL WORKS. Detect Life and Detect
  // Undead both have one, but the mechanism must not require it.
  const bare = grantedSenseBlock({ category: "secondary", detects: "heat" });
  ok("D5 rollWith is optional", bare !== null && bare.rollWith === undefined);
  ok("D6 the note still says what it detects", /heat/.test(bare.note), bare.note);
  const none = grantedSenseBlock({ category: "primary" });
  ok("D7 a sense with neither is still a valid block", none !== null && none.note === "");
}

// D8. NO MODALITY, and it is a decision rather than an omission.
ok("D8 a granted sense records no modality",
  grantedSenseBlock({ category: "tertiary", detects: "x" }).modality === undefined,
  "the book names no organ for either spell; Life Sense and Blight Sense set the "
    + "precedent of not inventing one, and the cost — no Enhanced feat reaches it — is intended");

/* ================================================================== */

process.stdout.write(`verify-granted-senses: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
