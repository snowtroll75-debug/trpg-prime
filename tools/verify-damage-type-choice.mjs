#!/usr/bin/env node
/**
 * verify-damage-type-choice — R9 of block 31 (3.603.0).
 *
 * A damage type the caster picks at cast time, for the three spells whose
 * page says so and which were each authored frozen at one answer.
 *
 * SECTIONS
 *   T  the vocabulary and the offer
 *   C  the choice, and refusing one that was not offered
 *   E  the element facts that survive the widening
 *   D  what Damage Reduction does, which is why the choice matters
 *   S  the source requirement Energy Bolt and Searing Burst print
 *   N  the nexus guard the widening made necessary
 *   W  the cast workflow: asked between the check and the damage
 *   P  the pack
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  ELEMENTS, offeredTypes, chosenType, opposingElement, elementSave,
  isDamageType, isElement, allAreElements, damageTypeLabel, damageReductionNote,
  typeChosenLine, typeRefusal
} from "../module/magic/damage-type-choice.mjs";
import {
  elementSource, hasElementSource, elementSourceLine
} from "../module/magic/element-sources.mjs";
import { nexusIsCastable, nexusUnsupportedLine, nexusSave } from "../module/magic/elemental-nexus.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { DAMAGE_TYPES } from "../module/config.mjs";

let failed = 0;
// COUNTED, NOT TYPED. A hand-written total is a number that goes stale the
// first time a check is added and nobody notices — the same expiry date the
// mutation anchors carried until 3.602.0.
let ran = 0;
const ok = (name, cond, why = "") => {
  ran++;
  if (cond) return;
  failed++;
  console.error(`  FAIL  ${name}${why ? `\n        ${why}` : ""}`);
};
const eq = (name, got, want, why = "") =>
  ok(name, got === want, why || `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const NINE = ["acid", "bludgeoning", "cold", "electricity", "fire", "force",
  "piercing", "slashing", "sonic"];
const FOUR = ["acid", "cold", "electricity", "fire"];

/* ================= T. the vocabulary ================= */

ok("T1 every type Shadow Blast prints is a type the system has",
  NINE.every((t) => isDamageType(t)),
  "a row offering a word config does not know would silently drop it from the picker");
eq("T2 the offer keeps the page's own order", offeredTypes({ damageTypes: NINE }).join(","), NINE.join(","));
eq("T3 a word that is not a damage type is dropped",
  offeredTypes({ damageTypes: ["fire", "custard", "cold"] }).join(","), "fire,cold");
eq("T4 duplicates collapse", offeredTypes({ damageTypes: ["fire", "fire"] }).length, 1);
eq("T5 a row offering none offers none", offeredTypes({}).length, 0);
// THE LEGACY FIELD IS READ, because the two spells built at 3.473.0 carry
// `elements` in the pack and renaming their rows would be a migration for
// no gain — the field name was never the rule.
eq("T6 THE OLD `elements` FIELD STILL READS", offeredTypes({ elements: ["fire", "cold"] }).join(","), "fire,cold");
eq("T7 and `damageTypes` wins when a row carries both",
  offeredTypes({ damageTypes: ["sonic"], elements: ["fire"] }).join(","), "sonic");

/* ================= C. the choice ================= */

const ROW = { damageTypes: NINE };
eq("C1 an offered choice is honoured", chosenType(ROW, "slashing"), "slashing");
eq("C1b and case does not matter", chosenType(ROW, "Slashing"), "slashing");
ok("C2 A CHOICE THAT WAS NOT OFFERED IS REFUSED", chosenType({ damageTypes: FOUR }, "slashing") === null,
  "the row's own offer is the only thing between a four-element Nexus and a save table with no answer");
eq("C3 nothing chosen from many offers is refused", chosenType(ROW, ""), null);
eq("C4 ONE OFFER NEEDS NO CHOICE", chosenType({ damageTypes: ["sonic"] }, ""), "sonic");
eq("C5 and a row offering nothing cannot be chosen from", chosenType({}, "fire"), null);

/* ================= E. the element facts ================= */

eq("E1 the four elements are still exactly four", ELEMENTS.length, 4);
ok("E1b and all four are real damage types", ELEMENTS.every((e) => isDamageType(e)));
ok("E2 an element reads as one", FOUR.every((e) => isElement(e)));
ok("E2b and a physical type does not",
  !isElement("slashing") && !isElement("bludgeoning") && !isElement("force"));
eq("E3 fire opposes cold", opposingElement("fire"), "cold");
eq("E3b and nothing opposes acid", opposingElement("acid"), null);
eq("E4 acid and cold call for Fortitude", `${elementSave("acid")}/${elementSave("cold")}`, "Fortitude/Fortitude");
eq("E4b electricity and fire for Reflex", `${elementSave("electricity")}/${elementSave("fire")}`, "Reflex/Reflex");
// THE WIDENING'S PRICE, STATED: this used to be unreachable because the
// whitelist was these four. It is reachable now, so it is measured.
eq("E5 A TYPE OUTSIDE THE FOUR HAS NO SAVE", elementSave("slashing"), null,
  "widening the whitelist made this reachable — N1 is the guard that catches it");
ok("E6 a four-element offer reads as elements", allAreElements(FOUR));
ok("E6b and the nine do not", !allAreElements(NINE),
  "the dialog asks 'which element?' or 'which damage type?' off this, so a list "
  + "containing piercing must not read as elemental");
ok("E6c nor does an empty offer", !allAreElements([]));

/* ================= D. Damage Reduction ================= */

eq("D1 physical types are reduced in full",
  damageReductionNote("slashing"), "Damage Reduction applies in full");
eq("D2 energy types by half",
  damageReductionNote("fire"), "armour may use only half its Damage Reduction");
eq("D3 AND FORCE NOT AT ALL", damageReductionNote("force"), "Damage Reduction does not apply",
  "this is why authoring Shadow Blast as force made it stronger than the book allows");
ok("D4 every type Shadow Blast offers has a DR rule to print",
  NINE.every((t) => damageReductionNote(t) !== ""),
  "a silent DR line would leave the card claiming the choice was cosmetic");
ok("D5 the DR note comes from config, not from a copy of it",
  NINE.every((t) => {
    const dr = DAMAGE_TYPES[t]?.dr;
    const note = damageReductionNote(t);
    return (dr === "full" && /in full/.test(note))
      || (dr === "half" && /half/.test(note))
      || (dr === "none" && /does not apply/.test(note));
  }),
  "the card must not be able to disagree with what damage.mjs actually does");
eq("D6 the label is the system's own", damageTypeLabel("electricity"), "Electricity");

/* ================= S. the source requirement ================= */

ok("S1 all four elements name a source", FOUR.every((e) => hasElementSource(e)));
ok("S2 acid names packed earth", /packed earth/.test(elementSource("acid")));
ok("S2b cold names snow, ice and the -5 air", /snow or ice/.test(elementSource("cold"))
  && /-5/.test(elementSource("cold")));
ok("S2c electricity names outdoors and overcast", /outdoors/.test(elementSource("electricity"))
  && /overcast/.test(elementSource("electricity")));
ok("S2d fire names an open flame", /open flame/.test(elementSource("fire")));
eq("S3 A TYPE THE BOOK NAMES NO SOURCE FOR GETS NONE", elementSource("slashing"), null,
  "Shadow Blast prints no source rule, so its card must not grow one");
eq("S3b and its line is empty rather than malformed", elementSourceLine("slashing"), "");
ok("S4 THE LINE SAYS WHOSE JOB IT IS", /GM's call/.test(elementSourceLine("fire")),
  "a card stating the condition flatly would claim a fact about a world it cannot see");

/* ================= N. the nexus guard ================= */

ok("N1 AN ELEMENT WITH NO SAVE CANNOT POWER A NEXUS", !nexusIsCastable("slashing"),
  "the zone exists to make everybody inside roll a save; without one it asks nobody anything");
ok("N1b and all four printed elements can", FOUR.every((e) => nexusIsCastable(e)));
ok("N2 the save still comes from the element", nexusSave("cold") === "Fortitude");
ok("N3 the refusal names the type and the four that work",
  /slashing/.test(nexusUnsupportedLine("Nexus", "slashing"))
  && /acid, cold, electricity and fire/.test(nexusUnsupportedLine("Nexus", "slashing")));

/* ================= W. the cast workflow ================= */

const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
// ANCHORED ON THE GUARD, NOT ON WHICH DECLARATION SITS ABOVE IT. The first
// version of this check named the line before the `if`, and adding a second
// declaration between them broke a check that was still measuring the truth.
ok("W1 the choice is made on a successful cast only",
  /damageChoiceRefused = false;\s*\n\s*if \(outcome\.cast\) \{[\s\S]{0,400}?damagetypechoice/.test(cast),
  "asking after a fumble interrupts the table for a choice nobody gets to use");
ok("W2 it reads the row by kind", cast.includes('=== "damagetypechoice"'));
ok("W3 THE FORMULA IS NOT TOUCHED, ONLY THE TYPE",
  cast.includes("{ ...(baseDamageRow ?? {}), type: damageChoice }"),
  "an AP mode answers 'how big' and the choice answers 'of what' — they must not overwrite");
ok("W4 the save path takes the override", cast.includes("damage: damageForCast,"));
ok("W5 the attack path takes it too", cast.includes("damageOverride: damageForCast"));
ok("W5b and honours it", cast.includes("const dmg = damageOverride ?? spellData.damage ?? {};"));
ok("W6 a refused choice is said out loud", cast.includes("lines.push(line(typeRefusal(label)));"));
// W6b IS THE CARD AND THE DICE AGREEING. The refusal line says "nothing
// happens"; before this flag the spell then dealt its damage anyway, in
// whatever type the item carried — force, for Shadow Blast.
ok("W6b AND A REFUSED CHOICE DEALS NOTHING", cast.includes("damageChoiceRefused = true;"),
  "a card that contradicts the dice is worse than either outcome on its own");
ok("W6c the attack path is gated on it",
  cast.includes("if (isAttack && outcome.cast && !damageChoiceRefused) {"));
ok("W6d and so is the save path",
  // RE-READ 3.609.0: a cast mode may carry its own save (effDefence).
  cast.includes("} else if (outcome.cast && !damageChoiceRefused && (effDefence ?? spellData.defence)"));
ok("W7 the source line is printed only when the row asks",
  cast.includes("if (sourceLine && choiceRow.printSource)"),
  "Shadow Blast prints no source rule and must not grow one from a shared mechanism");
ok("W8 the kind is in the handled vocabulary", HANDLED_EFFECT_KINDS.includes("damageTypeChoice"));

/* ================= P. the pack ================= */

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const found = {};
try {
  for await (const [key, v] of db.iterator()) {
    if (!key.startsWith("!items!") || v?.type !== "spell") continue;
    found[String(v.name).trim()] = v.system;
  }
} finally { await db.close(); }

const rowOf = (sy) => (sy?.effects ?? []).find((e) => e.kind === "damageTypeChoice") ?? null;

const SB = found["Shadow Blast"];
ok("P1 Shadow Blast carries a choice row", Boolean(rowOf(SB)));
eq("P1b offering all nine the page prints", offeredTypes(rowOf(SB)).join(","), NINE.join(","));
ok("P1c and no source rule, because the page prints none", !rowOf(SB)?.printSource);
eq("P2 THREE SHAPES, ALL AT THE SAME COST", (SB?.apOptions ?? []).length, 3);
ok("P2b every shape costs the printed 2 AP", (SB?.apOptions ?? []).every((o) => Number(o.ap) === 2),
  "the chooser sets the template; it does not price it");
ok("P2c NO MODE CARRIES AN `effects` KEY",
  (SB?.apOptions ?? []).every((o) => !Object.prototype.hasOwnProperty.call(o, "effects")),
  "3.601.0's lesson: `effects: []` is not nullish, so a mode carrying one wipes the spell's rows");
ok("P2d the cone, the burst and the line are all there",
  (SB?.apOptions ?? []).some((o) => /30-foot cone/.test(o.area))
  && (SB?.apOptions ?? []).some((o) => /15-foot burst/.test(o.area) && /120/.test(o.range))
  && (SB?.apOptions ?? []).some((o) => /50-foot line/.test(o.area)));
ok("P2e the mode chooser calls itself a shape", /shape/i.test(String(SB?.modeLabel ?? "")),
  "'Shadow Blast scales with the actions you spend' is not what a cone and a line are");
ok("P3 the card explains what the frozen type had been doing",
  (SB?.effects ?? []).some((e) => /AUTHORED AS FORCE/.test(e.text ?? "")));

for (const [name, sy] of [["Energy Bolt", found["Energy Bolt"]], ["Searing Burst", found["Searing Burst"]]]) {
  const row = rowOf(sy);
  ok(`P4 ${name} carries a choice row`, Boolean(row));
  eq(`P4b ${name} offers the four the page names`, offeredTypes(row).join(","), FOUR.join(","));
  ok(`P4c ${name} asks for its source requirement`, row?.printSource === true);
  ok(`P4d ${name} still carries its damage formula`, String(sy?.damage?.formula ?? "").length > 0,
    "the choice replaces the TYPE; removing the formula would make the spell deal nothing");
  ok(`P4e ${name} says the source is the table's call`,
    (sy?.effects ?? []).some((e) => /GM settles|judged at the|table's call|TABLE'S CALL/i.test(e.text ?? "")));
}

// THE TWO SPELLS THE WIDENING INHERITED must still declare their elements
// through the legacy field, or the widening quietly broke them.
for (const name of ["Elemental Shield", "Nexus Of Elemental Energy"]) {
  const sy = found[name];
  const row = (sy?.effects ?? []).find((e) => Array.isArray(e.elements)) ?? null;
  ok(`P5 ${name} still declares its elements`, Boolean(row));
  ok(`P5b ${name}'s offer still reads`, offeredTypes(row).length >= 2);
  ok(`P5c and every one of them can still power its spell`,
    offeredTypes(row).every((e) => isElement(e)));
}

/* ================= K. the manifest covers what the author tool wrote ================= */

/*
 * THE GAP THE 3.603.0 LIVE TEST FOUND, TURNED INTO A CHECK.
 *
 * The release repaired `effects` and `apOptions` onto carried copies and
 * forgot `modeLabel` and `modePrompt`. The consequence was visible in the
 * world within a minute: a repaired Shadow Blast offered its three printed
 * shapes under a dialog titled "Action Points".
 *
 * So this reads the AUTHORING TOOL — the one file that knows every field
 * this release wrote — and requires a manifest entry for each. A future
 * field added to the plan without an entry fails here rather than in
 * somebody's game.
 */
const authorSrc = fs.readFileSync(
  path.join(SYSTEM_ROOT, "tools", "author-damage-type-choice.mjs"), "utf8");

const wroteFields = {};
{
  // `"<Spell Name>": (sy) => { ... }` up to the next top-level spell key.
  const blocks = [...authorSrc.matchAll(/"([^"]+)":\s*\(sy\)\s*=>\s*\{([\s\S]*?)\n  \}/g)];
  for (const [, spell, body] of blocks) {
    const fields = new Set();
    for (const [, f] of body.matchAll(/\bsy\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) fields.add(f);
    wroteFields[spell] = [...fields];
  }
}
ok("K0 the author tool's plan could be read at all",
  Object.keys(wroteFields).length === 3
  && Object.values(wroteFields).every((f) => f.length > 0),
  "a check that cannot parse the thing it measures passes for the wrong reason");

const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
for (const [spell, fields] of Object.entries(wroteFields)) {
  for (const field of fields) {
    ok(`K1 ${spell}.${field} has a pack-repair entry`,
      PACK_REPAIRS.some((r) => r.name === spell && r.field === field),
      "a field written by the authoring tool and missing from the manifest is repaired "
      + "on the compendium and left stale on every copy an actor already carries");
  }
}
ok("K2 AND modeLabel IS ONE OF THEM",
  PACK_REPAIRS.some((r) => r.name === "Shadow Blast" && r.field === "modeLabel"),
  "3.603.0 shipped without it and a repaired copy called its three shapes 'Action Points'");
ok("K2b as is modePrompt",
  PACK_REPAIRS.some((r) => r.name === "Shadow Blast" && r.field === "modePrompt"));

ok("P6 the choice line names the type and the DR rule",
  /Bludgeoning/.test(typeChosenLine("Shadow Blast", "bludgeoning"))
  && /in full/.test(typeChosenLine("Shadow Blast", "bludgeoning")));
ok("P6b and the refusal names the spell",
  /Shadow Blast/.test(typeRefusal("Shadow Blast")));

if (failed) {
  console.error(`\nverify-damage-type-choice: FAILED — ${failed} of ${ran} check(s).`);
  process.exit(1);
}
console.log(`verify-damage-type-choice: OK — ${ran} checks. One question, nine answers, `
  + `and a card that says what each one costs the target.`);
