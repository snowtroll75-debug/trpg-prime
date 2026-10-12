#!/usr/bin/env node
/**
 * verify-stale-note-feats — two Chapter 5 feats built at 3.379.0.
 *
 *   FURRY FRIEND       grants a familiar (gnome)
 *   ELEVATED LINEAGE   grants an elf heritage (half-elf)
 *
 * WHY THESE TWO TOGETHER. Neither needed a new engine. Both sat unbuilt
 * because their own pack notes apologised for a system that had since
 * shipped:
 *
 *   Furry Friend      "Run as an NPC for now — the familiar companion
 *                      model is a later milestone."
 *   Elevated Lineage  "apply when heritages are built (heritage
 *                      compendium pending)."
 *
 * The familiar model shipped under the Wizard's "Familiar" feat. The
 * heritage compendium shipped with six elf heritages. Both notes are
 * STALE, and a stale apology is indistinguishable from a real blocker —
 * which is precisely how a feat goes unbuilt while sitting next to
 * everything it needs.
 *
 * So section C reads the PACKS. The claim these feats rest on is a claim
 * about data, and this project has already been caught once this week
 * asserting an absence in the data from a search of the code.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { elevatedLineageBlocked, elevatedLineageChoices, heritageMechanics } from "../module/feats.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ================================================================== *
 * A. ELEVATED LINEAGE — the pure rules
 * ================================================================== */

const elf = (name, conditionals = 1, extra = {}) => ({
  name,
  id: name.toLowerCase(),
  system: { sourceRace: "Elf", grantedFeats: "", racialAbilities: "", ...extra },
  flags: { "trg-prime": { conditionals: Array.from({ length: conditionals }, () => ({})) } }
});
const dwarf = { name: "Stoutheart", system: { sourceRace: "Dwarf" }, flags: {} };

const pool = [elf("Noldorni"), dwarf, elf("Silvarni"), elf("Drelvarni", 0)];
const choices = elevatedLineageChoices(pool);

equal("A1 only elf heritages are offered", choices.length, 3);
ok("A2 the dwarf heritage is not among them", !choices.some((h) => h.name === "Stoutheart"));
equal("A3 they are sorted, so the dialog is stable",
  choices.map((h) => h.name).join(","), "Drelvarni,Noldorni,Silvarni");
equal("A4 an empty pool offers nothing", elevatedLineageChoices([]).length, 0);
equal("A5 rubbish input offers nothing", elevatedLineageChoices(null).length, 0);
// The source race is matched case-insensitively, because a data entry
// typed "elf" is the same ancestry as one typed "Elf".
equal("A6 the source race is matched case-insensitively",
  elevatedLineageChoices([{ name: "x", system: { sourceRace: " elf " } }]).length, 1);

// A HERITAGE IS A SINGLE SLOT. The sheet warns; a feat quietly adding a
// second must refuse instead.
ok("A7 an actor with a heritage is refused",
  Boolean(elevatedLineageBlocked({ hasHeritage: true, choiceCount: 3 })));
ok("A8 and told why", /already has a heritage/.test(elevatedLineageBlocked({ hasHeritage: true, choiceCount: 3 })));
ok("A9 an empty compendium is refused",
  /no elf heritages/.test(elevatedLineageBlocked({ hasHeritage: false, choiceCount: 0 })));
equal("A10 otherwise nothing blocks it", elevatedLineageBlocked({ hasHeritage: false, choiceCount: 3 }), null);
// A refusal must never be silent — this project's anti-silence rule.
for (const state of [{ hasHeritage: true, choiceCount: 3 }, { hasHeritage: false, choiceCount: 0 }]) {
  const reason = elevatedLineageBlocked(state);
  ok("A11 every refusal carries a readable reason",
    typeof reason === "string" && reason.length > 15, JSON.stringify(state));
}

/* ================================================================== *
 * B. What a heritage actually does, counted rather than assumed
 * ================================================================== */

equal("B1 a heritage with one conditional is mechanical", heritageMechanics(elf("Silvarni", 1)).mechanical, true);
equal("B2 and reports the count", heritageMechanics(elf("Sindarni", 3)).conditionals, 3);
// DRELVARNI CARRIES NOTHING. Applying it is legitimate and changes no
// number, and the player must be told — silence and success look the
// same from the outside.
equal("B3 a heritage with nothing is NOT mechanical", heritageMechanics(elf("Drelvarni", 0)).mechanical, false);
equal("B4 granted feats count as mechanics",
  heritageMechanics(elf("X", 0, { grantedFeats: "Keen Ears" })).grants, 1);
equal("B5 several granted names are counted",
  heritageMechanics(elf("X", 0, { grantedFeats: "A, B", racialAbilities: "C" })).grants, 3);
equal("B6 an empty grant string counts nothing",
  heritageMechanics(elf("X", 0, { grantedFeats: "  " })).grants, 0);
equal("B7 rubbish input is not mechanical", heritageMechanics(null).mechanical, false);

/* ================================================================== *
 * C. THE PACKS — the claim both feats rest on
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");

async function packItems(name, filter) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  await db.open();
  const found = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!")) continue;
      if (filter(value)) found.push(value);
    }
  } finally {
    await db.close();
  }
  return found;
}

const heritages = await packItems("heritages", (v) => v?.type === "heritage");
const elves = elevatedLineageChoices(heritages);
ok("C1 the heritage compendium exists and holds heritages", heritages.length > 0,
  "Elevated Lineage's note says it is 'pending' — this is the check that the note is stale");
ok("C2 and holds elf heritages for the feat to offer", elves.length >= 6,
  `found ${elves.length}`);
// Named, so that a rename or a deletion is a failure rather than a
// quietly shorter dialog.
for (const name of ["Silvarni", "Tolderni", "Elarni", "Sindarni", "Drelvarni", "Noldorni"]) {
  ok(`C3 ${name} is in the compendium`, elves.some((h) => h.name === name));
}
// The mechanical/non-mechanical split is a fact about the data, and the
// dialog's per-row note depends on it being real.
const mechanical = elves.filter((h) => heritageMechanics(h).mechanical);
ok("C4 most elf heritages carry mechanics", mechanical.length >= 4, `${mechanical.length} of ${elves.length}`);
ok("C5 and at least one carries none — the case the dialog warns about",
  mechanical.length < elves.length,
  "if every heritage became mechanical, the 'no mechanical effect' path would be dead code");

const familiarStat = await packItems("familiars", () => true);
ok("C6 the familiar compendium exists", familiarStat.length > 0,
  "Furry Friend's note says the familiar model is 'a later milestone' — it shipped");

/* ================================================================== *
 * D. The wiring
 * ================================================================== */

const featsWork = fs.readFileSync(path.join(SYSTEM_ROOT, "module/feats-workflow.mjs"), "utf8");

ok("D1 Furry Friend has an automation entry", /"furry friend": \{/.test(featsWork));
// THE SAME FUNCTION AS THE WIZARD'S FEAT, deliberately — a second
// familiar-creation path would be two places deciding one question, and
// the one-familiar-per-master guard lives inside this one.
ok("D2 and it calls the SAME familiar creator the Wizard feat uses",
  (featsWork.match(/const \{ createFamiliarFor \} = await import\("\.\/familiar-workflow\.mjs"\);/g) ?? []).length === 2,
  "a second implementation would let a character hold two familiars");
ok("D3 Elevated Lineage has an automation entry", /"elevated lineage": \{/.test(featsWork));
ok("D4 and refuses before it offers anything",
  featsWork.indexOf("elevatedLineageBlocked({") < featsWork.indexOf("Which elf heritage did your elven parent"),
  "asking a player to choose and then refusing wastes the choice");
ok("D5 the chosen heritage goes through the ordinary grant path",
  /if \(added\) await applyAllGrants\(actor, added\);/.test(featsWork),
  "reproducing grants here would be a second grant engine");
// D6 ASSERTS THE GUARD, NOT THE SENTENCE. Its first version tested only
// that the words existed, and a mutation that disabled the branch left
// them sitting in the dead arm of the ternary and walked through. That is
// the THIRD time this exact shape has got past a check in this session —
// Grapple's D2, Born to Ride's D11, and here. The pattern is worth naming
// rather than fixing three times: a string literal survives almost every
// mutation, because a mutation removes BEHAVIOUR and the literal is not
// behaviour. Assert the condition that chooses the string.
ok("D6 a heritage with no mechanics says so on the card",
  /\+ \(m\.mechanical\s*\n\s*\? ""\s*\n\s*: `<p><em>\$\{heritage\.name\} carries no recorded mechanical benefit/.test(featsWork),
  "silence and success are indistinguishable to a player");
ok("D7 the dialog shows what each heritage does BEFORE it is chosen",
  /no mechanical effect recorded/.test(featsWork));

/* ------------------------------------------------------------------ */

if (failures.length) {
  process.stderr.write(`\nverify-stale-note-feats: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-stale-note-feats: OK — ${checks} checks.\n`);
