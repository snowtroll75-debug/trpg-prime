#!/usr/bin/env node
/**
 * verify-inscribed-runes — R10 of block 31 (3.604.0).
 *
 * Two PP-priced rituals that shipped with `effects: []`: a ward centred on
 * an inscribed point, and a rune that tells the GM who walked past it.
 *
 * SECTIONS
 *   R  the record, and what it refuses
 *   D  designation
 *   T  the trait the warning watches
 *   X  crossings — the edge trigger
 *   G  geometry
 *   B  the bonus rows, measured against the sheet they land on
 *   C  the card
 *   W  the workflow: placed, watched, and tidied up
 *   P  the pack
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  RUNE_FLAG, RUNE_KINDS, WARD_BONUS_ROWS, normaliseRune, runeRecord, runeIsLive,
  runeDesignates, runeWatchesTrait, runeCrossings,
  wardInscribedLine, wardDesignatesNobodyLine, wardEnteredLine, wardLeftLine,
  warningInscribedLine, warningNoTraitLine, warningGlowsLine, runeJudgedAtTheTableLine
} from "../module/magic/inscribed-rune.mjs";
import { pointInRune, wardAsEmanation, runesOn } from "../module/magic/inscribed-rune-workflow.mjs";
import { bonusTargetFor } from "../module/magic/spell-effects.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { parseSpellArea } from "../module/magic/spell-template.mjs";

let failed = 0;
let ran = 0;
const ok = (name, cond, why = "") => {
  ran++;
  if (cond) return;
  failed++;
  console.error(`  FAIL  ${name}${why ? `\n        ${why}` : ""}`);
};
const eq = (name, got, want, why = "") =>
  ok(name, got === want, why || `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const WARD = { kind: "runeWard", label: "Rune of Warding" };
const WARN = { kind: "runeWarning", label: "Rune of Warning" };
const seed = (over = {}) => runeRecord({
  kind: "runeWard", label: "Rune of Warding", castId: "cast1",
  centre: { x: 1000, y: 1000 }, radiusFeet: 10, ...over
});

/* ================= R. the record ================= */

eq("R1 both kinds are declared", RUNE_KINDS.join(","), "runeWard,runeWarning");
ok("R1b and both are handled", RUNE_KINDS.every((k) => HANDLED_EFFECT_KINDS.includes(k)));
ok("R2 a ward row normalises", Boolean(normaliseRune(WARD)));
ok("R2b so does a warning row", Boolean(normaliseRune(WARN)));
eq("R3 ANOTHER KIND IS NOT A RUNE", normaliseRune({ kind: "elementalNexus" }), null,
  "the nexus is the shape this was built from; it must not be mistaken for one");
eq("R3b nor is nothing", normaliseRune(null), null);
eq("R4 a row with no label gets the spell's own name",
  normaliseRune({ kind: "runeWarning" }).label, "Rune of Warning");
ok("R5 a record needs a centre", runeRecord({ kind: "runeWard", radiusFeet: 10 }) === null,
  "a rune with nowhere to be is a Region that can never be measured");
eq("R5b and a radius", runeRecord({ kind: "runeWard", centre: { x: 1, y: 1 }, radiusFeet: 0 }), null);
eq("R5c and a kind it knows", runeRecord({ kind: "bonus", centre: { x: 1, y: 1 }, radiusFeet: 10 }), null);
// MEASURED ON A RECORD THAT HAS DESIGNATED MEMBERS. The first version asked
// this of a record designating nobody, where `inside: []` and `inside:
// [...designated]` are the same empty list — a check that could not fail.
eq("R6 a fresh record remembers nobody inside",
  seed({ designated: ["Token.a", "Token.b"] }).inside.length, 0,
  "the edge trigger reads this; a record that starts full would fire nothing");
ok("R7 a rune with no expiry is always live", runeIsLive(seed({ until: null }), 99999));
ok("R7b one inside its eight hours is live", runeIsLive(seed({ until: 1000 }), 999));
ok("R7c and one past them is not", !runeIsLive(seed({ until: 1000 }), 1000));
ok("R7d a missing record is not live", !runeIsLive(null, 0));

/* ================= D. designation ================= */

const warded = seed({ designated: ["Token.a", "Token.b", "Token.a", ""] });
eq("D1 duplicates and blanks are dropped", warded.designated.join(","), "Token.a,Token.b");
ok("D2 a designated creature is designated", runeDesignates(warded, "Token.a"));
ok("D2b AND A BYSTANDER IS NOT", !runeDesignates(warded, "Token.c"),
  "the whole rule is that the caster chose; a rune that wards everybody inside it "
  + "would ward the enemy standing in the doorway");
ok("D3 a rune designating nobody designates nobody", !runeDesignates(seed(), "Token.a"));

/* ================= T. the trait ================= */

const watcher = runeRecord({
  kind: "runeWarning", label: "Rune of Warning", castId: "c",
  centre: { x: 0, y: 0 }, radiusFeet: 30, trait: "Elf"
});
eq("T1 the trait is folded to lower case on the record", watcher.trait, "elf");
ok("T2 a matching creature matches", runeWatchesTrait(watcher, "Humanoid, Elf"));
ok("T2b whatever the case", runeWatchesTrait(watcher, ["HUMANOID", "elf"]));
// ASKED OF A HAND-BUILT RECORD, because `runeRecord` lowers what it stores and
// a check going through it can never see this fold happen.
ok("T2c and a record built by hand is folded too", runeWatchesTrait({ trait: "Elf" }, "elf"),
  "the function is exported; a caller with a trait and no cast behind it must work");
ok("T3 A HALF-ELF IS NOT AN ELF", !runeWatchesTrait(watcher, "Humanoid, Half-Elf"),
  "a substring test would also fire on a Selfsame Horror — the word is the unit");
ok("T3b and an orc is not", !runeWatchesTrait(watcher, "Humanoid, Orc"));
ok("T4 A RUNE WITH NO TRAIT WATCHES FOR NOTHING", !runeWatchesTrait(seed(), "Elf"),
  "it must not fall through to matching everybody");
ok("T4b nor does an empty trait string", !runeWatchesTrait({ trait: "" }, "Elf"));
// T4c IS THE GUARD THAT ACTUALLY DOES THE WORK. A creature whose trait string
// ends in a comma splits to an empty entry, and an unset rune wants "" — so
// without the filter the rune fires on punctuation.
ok("T4c AND NOT ON A TRAILING COMMA", !runeWatchesTrait({ trait: "" }, "Humanoid,"),
  "the empty entry a split leaves behind must not match an unset rune");
ok("T4d nor on nothing but punctuation", !runeWatchesTrait({ trait: "" }, ",;,"));
ok("T5 a creature with no traits matches nothing", !runeWatchesTrait(watcher, ""));

/* ================= X. the edge trigger ================= */

{
  const before = { inside: ["a", "b"] };
  const x = runeCrossings(before, ["b", "c"]);
  eq("X1 who entered", x.entered.join(","), "c");
  eq("X2 who left", x.left.join(","), "a");
  eq("X3 and who the record should now remember", x.inside.join(","), "b,c");
  const still = runeCrossings(before, ["a", "b"]);
  ok("X4 NOBODY STANDING STILL CROSSES ANYTHING",
    still.entered.length === 0 && still.left.length === 0,
    "without this the ward re-applies on every movement anywhere and the warning "
    + "announces the same motionless elf for ever");
  eq("X5 an empty scene empties the record", runeCrossings(before, []).left.join(","), "a,b");
  eq("X5b and a first sweep is all arrivals", runeCrossings({}, ["a"]).entered.join(","), "a");
}

/* ================= G. geometry ================= */

const G = 5;                                    // 5 px per foot
eq("G1 the centre is inside", pointInRune(seed(), { x: 1000, y: 1000 }, G), true);
eq("G2 the edge is inside", pointInRune(seed(), { x: 1050, y: 1000 }, G), true,
  "10 feet at 5 px per foot is 50 px — 'whilst in the radius' includes its edge");
eq("G3 A FOOT BEYOND IS OUTSIDE", pointInRune(seed(), { x: 1055, y: 1000 }, G), false);
eq("G4 measured diagonally too", pointInRune(seed(), { x: 1040, y: 1040 }, G), false,
  "a square test would ward a creature 14 feet away on the diagonal");
eq("G5 no scale means no answer", pointInRune(seed(), { x: 1000, y: 1000 }, 0), false);
eq("G5b and no point means no answer", pointInRune(seed(), null, G), false);
eq("G6 a bigger radius reaches further",
  pointInRune(seed({ radiusFeet: 30 }), { x: 1140, y: 1000 }, G), true);

/*
 * G7 IS THE CHECK THIS RELEASE MOST NEEDED, and the one I nearly wrote as a
 * comment instead.
 *
 * `parseSpellArea` requires a UNIT word. Both runes were transcribed as
 * "10-radius" and "30-radius centred on the object", with no unit, so both
 * returned null — no Region, no rune, and every rule above measuring a
 * record no cast would ever create. The release would have shipped doing
 * nothing behind a screen of green checks.
 *
 * SO IT IS MEASURED HERE AND FROM THE PACK, not from a string typed into
 * this file: a check that parses its own literal proves only that the
 * literal parses.
 */
ok("G7 A UNITLESS RADIUS DOES NOT PARSE, which is why the areas were repaired",
  parseSpellArea("10-radius") === null,
  "the shape of the defect, kept so nobody restores the unitless string");

/* ================= B. the bonus rows ================= */

eq("B1 FOUR ROWS, because the sheet has no all-saves slot", WARD_BONUS_ROWS.length, 4);
eq("B2 and they are the printed four",
  WARD_BONUS_ROWS.map((r) => r.slot).join(","), "defence,fortitude,reflex,will");
ok("B3 EVERY ONE LANDS SOMEWHERE REAL",
  WARD_BONUS_ROWS.every((r) => typeof bonusTargetFor(r.slot) === "string"),
  "a slot with nowhere to land is a bonus nobody ever receives — measured against "
  + "bonusTargetFor rather than trusted");
ok("B4 each is +1", WARD_BONUS_ROWS.every((r) => Number(r.value) === 1));
ok("B5 AND STATUS, because the page says \"+1-status\"",
  WARD_BONUS_ROWS.every((r) => r.bonusType === "status"));
ok("B6 every row is a bonus row the emanation applier understands",
  WARD_BONUS_ROWS.every((r) => r.kind === "bonus"));
ok("B7 the ward hands the applier an emanation-shaped descriptor",
  wardAsEmanation(seed()).effects.length === 4 && wardAsEmanation(seed()).name === "Rune of Warding",
  "reusing emanationEffectData is the point — a parallel applier would be a second "
  + "chance to disagree about what a status bonus is");
ok("B8 the rows are frozen, so a cast cannot edit the rule",
  Object.isFrozen(WARD_BONUS_ROWS) && WARD_BONUS_ROWS.every((r) => Object.isFrozen(r)));

/* ================= C. the card ================= */

ok("C1 the ward names who it warded and the radius",
  /Borin/.test(wardInscribedLine("Rune of Warding", 10, ["Borin"]))
  && /10-foot/.test(wardInscribedLine("Rune of Warding", 10, ["Borin"])));
ok("C1b and what they gain",
  /Defence and all three saves/.test(wardInscribedLine("Rune of Warding", 10, ["Borin"])));
ok("C2 A CAST THAT WARDED NOBODY SAYS SO",
  /nobody was designated/.test(wardDesignatesNobodyLine("Rune of Warding")),
  "a PP 4 ritual that bought nothing must not look like a working spell");
ok("C2b and says the list cannot be added to",
  /cannot be added to later/.test(wardDesignatesNobodyLine("Rune of Warding")));
ok("C3 entering and leaving are both reported",
  /is inside/.test(wardEnteredLine("Rune of Warding", "X"))
  && /has left/.test(wardLeftLine("Rune of Warding", "X")));
ok("C4 the warning names the trait and the radius",
  /elf/.test(warningInscribedLine("Rune of Warning", 30, "elf"))
  && /30 feet/.test(warningInscribedLine("Rune of Warning", 30, "elf")));
ok("C5 A WARNING WITH NO TRAIT SAYS IT CAN NEVER GLOW",
  /can never glow/.test(warningNoTraitLine("Rune of Warning")));
ok("C6 the glow names the creature and the trait",
  /Lysa/.test(warningGlowsLine("Rune of Warning", "Lysa", "elf"))
  && /elf/.test(warningGlowsLine("Rune of Warning", "Lysa", "elf"))
  && /silver/.test(warningGlowsLine("Rune of Warning", "Lysa", "elf")));
ok("C7 the table's half is named",
  /surface survives/.test(runeJudgedAtTheTableLine())
  && /present to see/.test(runeJudgedAtTheTableLine()));

/* ================= W. the workflow ================= */

const flow = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "inscribed-rune-workflow.mjs"), "utf8");
ok("W1 the ward reuses the emanation applier",
  flow.includes("applyEmanationEffectsTo") && flow.includes("removeEmanationEffectsFrom"));
ok("W2 THE WARD IS ONLY APPLIED TO THE DESIGNATED",
  flow.includes("if (!runeDesignates(record, uuid)) continue;"),
  "the enemy standing in the doorway must not be warded");
ok("W3 and only taken off the designated",
  flow.includes('if (record.kind !== "runeWard" || !runeDesignates(record, uuid)) continue;'));
ok("W4 THE GLOW IS WHISPERED TO THE GM",
  /whisper: ChatMessage\.getWhisperRecipients\("GM"\)/.test(flow),
  "Graham's ruling: the rune fires whether or not anybody is there to see it");
ok("W5 the record's memory is written back after every sweep",
  flow.includes("await region.setFlag(SYSTEM_ID, RUNE_FLAG, { ...record, inside });"),
  "without this the crossings are recomputed from a stale list for ever");
ok("W6 A LAPSED RUNE TAKES ITS WARD BACK BEFORE IT VANISHES",
  flow.indexOf("removeEmanationEffectsFrom(actor, record.castId);\n        }\n      }\n      result.expired")
  > 0 || (flow.indexOf("result.expired.push") > flow.indexOf("if (actor && record.kind === \"runeWard\")")),
  "a Region deleted first leaves the bonus stranded on a sheet with nothing to explain it");
ok("W7 nothing happens when nothing crossed",
  flow.includes("if (!entered.length && !left.length) continue;"));
ok("W8 the watcher only fires on movement",
  flow.includes('if (!("x" in changed) && !("y" in changed)) return;'),
  "a token renamed or re-imaged has not walked");
ok("W9 and only the acting GM sweeps", flow.includes("if (!isActingGM()) return;"));
ok("W10 runesOn reads the flag rather than the Region's name",
  flow.includes("region.getFlag?.(SYSTEM_ID, RUNE_FLAG)"));

const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
ok("W11 the rune is recorded on the Region the cast just drew",
  cast.includes("await region.setFlag(SYSTEM_ID, RUNE_FLAG, record);"));
ok("W12 THE DESIGNATION PICKER ONLY OFFERS WHO IS INSIDE",
  cast.includes("return pointInRune({ centre, radiusFeet }, point, pxPerFoot);"),
  "\"all creatures you designate\" is a designation made at an inscription, of people there");
ok("W13 the ward applies at once to whoever is already standing in it",
  cast.includes("await refreshRunes(canvas.scene);"),
  "without this the allies present at the inscription gain nothing until somebody moves");
ok("W14 THE WARPED DURATION IS USED, not the printed one",
  cast.includes("parseSpellDuration(warpedDurationText(spellData.duration, warpMods))"),
  "both runes sell \"+2 PP: change duration to 24 hours\" — reading the item's own field "
  + "would charge for a warp that bought nothing");
ok("W15 the registration sits beside the tether's own watcher", (() => {
  const boot = fs.readFileSync(path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"), "utf8");
  return /registerDistanceTriggers\(\);[\s\S]{0,400}registerInscribedRunes\(\);/.test(boot);
})());
ok("W16 runesOn survives a scene with no regions", runesOn(null, 0).length === 0);

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

for (const [name, kind] of [["Rune Of Warding", "runeWard"], ["Rune Of Warning", "runeWarning"]]) {
  const sy = found[name];
  ok(`P1 ${name} carries its rune row`, (sy?.effects ?? []).some((e) => e.kind === kind));
  ok(`P1b ${name} carries exactly one`,
    (sy?.effects ?? []).filter((e) => e.kind === kind).length === 1);
  ok(`P2 ${name}'s area still parses`, Boolean(parseSpellArea(sy?.area ?? "")),
    "without a parseable area no Region is drawn and the rune cannot exist");
  ok(`P3 ${name} keeps its eight hours`, /8 hours/.test(String(sy?.duration ?? "")));
  ok(`P4 ${name} keeps its 24-hour warp`,
    (sy?.warps ?? []).some((w) => w.mods?.durationText === "24 hours"),
    "the warp is live and W14 is what makes it buy something");
}
eq("P5 THE WARD'S AREA PARSES, off the pack and not off a literal",
  parseSpellArea(found["Rune Of Warding"]?.area)?.distance ?? null, 10,
  "without this the Region is never drawn and the whole release does nothing");
eq("P5b and the warning's does too",
  parseSpellArea(found["Rune Of Warning"]?.area)?.distance ?? null, 30);
ok("P5c both are circles", parseSpellArea(found["Rune Of Warding"]?.area)?.t === "circle"
  && parseSpellArea(found["Rune Of Warning"]?.area)?.t === "circle");

/*
 * P8 SWEEPS EVERY AREA IN THE PACK, because the rune defect was not special:
 * an unparseable Area is a spell whose template cannot be drawn, and nothing
 * anywhere was checking for one. The exceptions are named with reasons rather
 * than counted, so a NEW unparseable area fails here.
 */
const AREA_EXCEPTIONS = new Map([
  // Squares. `parseSpellArea` has no square shape at all — a pre-existing gap
  // in three spells, reported rather than quietly widened by this release.
  ["Harrow", "square"],
  ["Flaming Sphere", "square"],
  ["Snagging Pit", "square"],
  // Its shapes come from `apOptions` per mode since 3.603.0, which is why the
  // spell's own field reads "varies" and must not parse.
  ["Shadow Blast", "chosen per cast"],
  // Prose the GM places by hand; no shape word to read.
  ["Transmute Rock & Mud", "prose"]
]);
{
  const broken = [];
  for (const [name, sy] of Object.entries(found)) {
    const area = String(sy?.area ?? "").trim();
    if (!area || AREA_EXCEPTIONS.has(name)) continue;
    if (!parseSpellArea(area, sy?.range)) broken.push(`${name} (${area})`);
  }
  ok("P8 EVERY OTHER SPELL AREA IN THE PACK PARSES", broken.length === 0,
    broken.length ? `unparseable: ${broken.join("; ")}` : "");
  // AND THE EXCEPTION LIST IS NOT ALLOWED TO ROT: an entry for a spell that
  // now parses is a line nobody has read since it was written.
  const stale = [...AREA_EXCEPTIONS.keys()].filter(
    (n) => found[n] && parseSpellArea(String(found[n].area ?? ""), found[n].range));
  ok("P8b and no exception is listed for an area that already parses", stale.length === 0,
    stale.length ? `stale exceptions: ${stale.join(", ")}` : "");
}
ok("P6 the ward explains that designation is fixed",
  (found["Rune Of Warding"]?.effects ?? []).some((e) => /DESIGNATION IS FIXED/.test(e.text ?? "")));
ok("P6b and that the bonus follows the radius",
  (found["Rune Of Warding"]?.effects ?? []).some((e) => /COMES AND GOES WITH THE RADIUS/.test(e.text ?? "")));
ok("P6c and that four slots are involved",
  (found["Rune Of Warding"]?.effects ?? []).some((e) => /FOUR BONUSES/.test(e.text ?? "")));
ok("P7 the warning explains the GM-only glow",
  (found["Rune Of Warning"]?.effects ?? []).some((e) => /TOLD TO THE GM/.test(e.text ?? "")));
ok("P7b and that it fires on entering, not on being inside",
  (found["Rune Of Warning"]?.effects ?? []).some((e) => /FIRES ON ENTERING/.test(e.text ?? "")));

/* ================= K. the manifest covers what the author tool wrote ================= */

/*
 * THE SAME RATCHET 3.603.1 ADDED, pointed at this release's author tool.
 *
 * It exists because 3.603.0 wrote four fields and the manifest carried two,
 * and a carried copy came out half-repaired. This release writes TWO fields
 * per rune — `area` as well as `effects` — which is exactly the shape that
 * gap had.
 */
const authorSrc = fs.readFileSync(
  path.join(SYSTEM_ROOT, "tools", "author-inscribed-runes.mjs"), "utf8");
const wroteFields = {};
{
  const blocks = [...authorSrc.matchAll(/"([^"]+)":\s*\(sy\)\s*=>\s*\{([\s\S]*?)\n  \}/g)];
  for (const [, spell, body] of blocks) {
    const fields = new Set();
    for (const [, f] of body.matchAll(/\bsy\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) fields.add(f);
    wroteFields[spell] = [...fields];
  }
}
ok("K0 the author tool's plan could be read at all",
  Object.keys(wroteFields).length === 2 && Object.values(wroteFields).every((f) => f.length >= 2),
  "a check that cannot parse the thing it measures passes for the wrong reason");
const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
for (const [spell, fields] of Object.entries(wroteFields)) {
  for (const field of fields) {
    ok(`K1 ${spell}.${field} has a pack-repair entry`,
      PACK_REPAIRS.some((r) => r.name === spell && r.field === field),
      "a field written by the authoring tool and missing from the manifest is repaired on "
      + "the compendium and left stale on every copy an actor already carries");
  }
}
ok("K2 AND `area` IS ONE OF THEM",
  PACK_REPAIRS.some((r) => r.name === "Rune Of Warding" && r.field === "area"),
  "a carried copy with the unitless area draws no Region, so the ward would be repaired "
  + "into a rune that still cannot exist");

if (failed) {
  console.error(`\nverify-inscribed-runes: FAILED — ${failed} of ${ran} check(s).`);
  process.exit(1);
}
console.log(`verify-inscribed-runes: OK — ${ran} checks. A ward that follows its radius, `
  + `and a rune that tells the GM who walked past.`);
