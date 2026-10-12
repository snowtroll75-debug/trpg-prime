#!/usr/bin/env node
/**
 * verify-elemental-shield — an element chosen at cast, and what follows.
 *
 * NEW at 3.473.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ELEMENTAL SHIELD.
 *
 *   "You enshroud yourself in either fire or cold which grants you
 *    resistance to the OPPOSING element (fire grants cold resistance and
 *    cold grants fire). Furthermore, any adjacent creature that attacks
 *    you with a melee attack must make a Basic Reflex saving throw or
 *    take 2d6 damage."
 *
 * ─────────────────────────────────────────────────────────────────────
 * O1 IS THE ONE THAT MATTERS: THE RESISTANCE IS TO THE OTHER ELEMENT.
 *
 * A fire shield resists COLD. Getting it the obvious way round — a fire
 * shield resisting fire — is the reading anybody would reach for, and it
 * is exactly backwards. The book puts its own parenthesis in to stop it.
 *
 * R1 IS THE RULING. Graham, 2 September 2026: "Resistance halves the
 * damage, this is a core rule and thus has no value." damage.mjs already
 * halves once on resistance, so this spell grants a resistance TYPE and
 * this file asserts no number exists anywhere in it.
 *
 * S1 IS THE REUSE. The rider is `thorns` — Vibrant Thorns' mechanism —
 * with a printed save, rather than a second mechanism that would decide
 * again how damage meets a defence.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  ELEMENTS, offeredTypes, chosenType, opposingElement, elementSave,
  typeChosenLine, typeRefusal
} from "../module/magic/damage-type-choice.mjs";
import { normaliseThorns, thornsSaveNote, thornsTriggered } from "../module/magic/thorns.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const ROW = {
  kind: "elementalShield", label: "Elemental Shield", elements: ["fire", "cold"],
  damage: "2d6", intensified: "", reachFeet: 5, save: "Basic Reflex"
};

/* ── E. THE OFFER ────────────────────────────────────────────────── */
ok("E1 the row offers what it declares", offeredTypes(ROW).join(",") === "fire,cold");
ok("E2 an unknown element is not offered",
  offeredTypes({ elements: ["fire", "custard"] }).join(",") === "fire");
ok("E3 duplicates collapse", offeredTypes({ elements: ["fire", "fire"] }).length === 1);
ok("E4 a row offering none offers none", offeredTypes({}).length === 0);
ok("E5 the four elements are the book's", ELEMENTS.join(",") === "acid,cold,electricity,fire");

/* ── C. THE CHOICE ───────────────────────────────────────────────── */
ok("C1 an offered choice is honoured", chosenType(ROW, "cold") === "cold");
// A CHOICE THAT WAS NOT OFFERED IS NOT HONOURED. The picker only shows
// what the row declares, but a stale flag could carry anything — and a
// fire Nexus that quietly became acid changes which save everybody rolls.
ok("C2 A CHOICE THAT WAS NOT OFFERED IS REFUSED", chosenType(ROW, "acid") === null,
  "a stale or hand-edited pick must not change the element");
ok("C3 nothing chosen from two offers is refused", chosenType(ROW, "") === null);
// ONE OFFER IS NOT A CHOICE, and refusing it for want of a pick would
// break a spell nobody was asked about.
ok("C4 but a single offer needs no choice",
  chosenType({ elements: ["fire"] }, "") === "fire");

/* ── O. THE OPPOSITE ─────────────────────────────────────────────── */
ok("O1 A FIRE SHIELD RESISTS COLD", opposingElement("fire") === "cold",
  "the obvious reading — fire resisting fire — is exactly backwards");
ok("O2 and a cold shield resists fire", opposingElement("cold") === "fire");
// ACID AND ELECTRICITY HAVE NO PRINTED OPPOSITE. Nexus names them and
// this spell does not, so asking returns nothing rather than inventing a
// pairing the book never made.
ok("O3 acid and electricity have no opposite",
  opposingElement("acid") === null && opposingElement("electricity") === null);
ok("O4 nor does nonsense", opposingElement("custard") === null);

/* ── V. THE SAVE EACH ELEMENT CALLS FOR (for Nexus, next) ────────── */
ok("V1 Fortitude for acid and cold",
  elementSave("acid") === "Fortitude" && elementSave("cold") === "Fortitude");
ok("V2 Reflex for electricity and fire",
  elementSave("electricity") === "Reflex" && elementSave("fire") === "Reflex");
ok("V3 and nothing for anything else", elementSave("custard") === null);

/* ── S. THE RIDER IS THORNS ──────────────────────────────────────── */
const spec = normaliseThorns({ ...ROW, damageType: "fire" });
ok("S1 the shield normalises as thorns", spec?.damage === "2d6" && spec?.damageType === "fire");
ok("S2 reaching five feet", spec?.reachFeet === 5);
ok("S3 and carrying its printed save", spec?.save === "Basic Reflex");
ok("S4 which the card prints", /Basic Reflex/.test(thornsSaveNote(spec)));
// VIBRANT THORNS HAS NO SAVE and must not grow one. Its behaviour since
// August is untouched by this release.
ok("S5 A ROW WITH NO SAVE ADDS NO LINE",
  thornsSaveNote(normaliseThorns({ damage: "1", damageType: "piercing" })) === "",
  "Vibrant Thorns passes nothing and must keep saying nothing");
// THE TRIGGER IS UNCHANGED — a landed, adjacent, melee blow.
ok("S6 it fires on an adjacent melee blow",
  thornsTriggered(spec, { hit: true, melee: true, distanceFeet: 5 }) === true);
ok("S7 and not at reach", thornsTriggered(spec, { hit: true, melee: true, distanceFeet: 10 }) === false);

/* ── W. AND IT IS REACHED ────────────────────────────────────────── */
const effects = strip(read("module", "magic", "spell-effects.mjs"));
ok("W1 the applier handles the shield", effects.includes('case "elementalShield": {'));
ok("W2 it asks which element", effects.includes("await promptTypeChoice(effect.label || spell.name, offered)"));
ok("W3 and refuses when nothing was chosen",
  effects.includes("if (!element) {") && effects.includes("typeRefusal(effect.label || spell.name)"));
/*
 * W4 IS THE RULING IN CODE. Graham: resistance halves and has no value.
 * The effect must therefore add a TYPE to the actor's resistances and
 * never a number — damage.mjs does the halving.
 */
ok("W4 THE RESISTANCE IS A TYPE, NOT A NUMBER",
  effects.includes('key: "system.combat.resistances", mode: 2, value: resists'),
  "damage.mjs halves once on resistance; a number here would be a second rule");
ok("W5 and it is the OPPOSING element that is granted",
  effects.includes("const resists = opposingElement(element);"));
ok("W6 the rider takes the CHOSEN element as its damage",
  effects.includes("normaliseThorns({ ...effect, damageType: element })"),
  "a fire shield burns and resists cold");
ok("W7 the shield is worn for the spell's duration",
  effects.includes("shieldData.duration = { ...shieldTiming.foundryDuration,"));
const flow = strip(read("module", "magic", "thorns-workflow.mjs"));
ok("W8 the printed save reaches the card", flow.includes("const saveNote = thornsSaveNote(spec);")
  && flow.includes("if (saveNote) lines.push("));

/* ── P. THE PACK ─────────────────────────────────────────────────── */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const pack = new Map();
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") pack.set(String(v.name), v);
  }
} finally { await db.close(); }
ok("P1 the pack was read", pack.size > 600, `${pack.size} spells`);
const row = (pack.get("Elemental Shield")?.system?.effects ?? [])
  .find((r) => r?.kind === "elementalShield") ?? null;
ok("P2 Elemental Shield carries its 2d6", row?.damage === "2d6");
ok("P3 offering fire or cold", offeredTypes(row).join(",") === "fire,cold");
ok("P4 with its printed save", String(row?.save ?? "") === "Basic Reflex");
ok("P5 and names its recipient", String(row?.target ?? "") === "self");
/*
 * P6 — `Base Damage 1d6` IS NOT THE DAMAGE. The entry prints it, and it
 * is the per-die base Empower multiplies. Reading it as the spell's
 * damage is the misreading Graham corrected on 1 September 2026, and the
 * row must not carry it as one.
 */
ok("P6 AND THE ROW DOES NOT MISTAKE Base Damage FOR THE DAMAGE",
  row?.damage !== "1d6",
  "1d6 is the Empower multiplier; 2d6 is what the shield deals");
// VIBRANT THORNS IS UNTOUCHED.
const vibrant = (pack.get("Vibrant Thorns")?.system?.effects ?? [])
  .find((r) => r?.kind === "thorns") ?? null;
ok("P7 Vibrant Thorns still carries no save",
  !String(vibrant?.save ?? "").trim(),
  "its behaviour since August must be untouched");

if (failures.length) {
  process.stderr.write(`verify-elemental-shield: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-elemental-shield: OK — ${checks} checks. A fire shield burns, and resists cold.\n`);
