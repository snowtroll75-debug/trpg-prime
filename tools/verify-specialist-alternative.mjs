#!/usr/bin/env node
/**
 * verify-specialist-alternative — 3.665.0: an item whose specialist skill
 * another item already confers grants an alternative, chosen by the player
 * (Graham's ruling of 21 October 2026 on Inner Tempest's Spirit Warrior and
 * the Miraku's Spirit Lore). See specialistAlternativeOwed.
 *
 *   A  when an alternative is owed, pure
 *   B  the wiring: the Use button, the shared chooser, Apply Grants
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const sg = await import(new URL("../module/specialist-grants.mjs", import.meta.url));

const ALT = { label: "another Lore", suffix: "Lore" };
const warrior = { id: "bg", type: "background", name: "Spirit Warrior", system: { specialistSkill: "Spirit Lore" }, flags: { "trg-prime": { specialistAlternative: ALT } } };
const miraku = { id: "race", type: "race", name: "Miraku", system: { specialistSkills: "Miraku Lore, Spirit Lore" } };
const ryukari = { id: "race2", type: "race", name: "Ryukari", system: { specialistSkills: "Ryukari Lore, Dragon Lore" } };
const owed = sg.specialistAlternativeOwed;

equal("A1 a Miraku Spirit Warrior is owed an alternative to Spirit Lore", owed(warrior, [miraku, warrior]), ["Spirit Lore"]);
equal("A2 a Ryukari Spirit Warrior is not", owed(warrior, [ryukari, warrior]), []);
equal("A3 the item itself never counts as the other source", owed(warrior, [warrior, { ...warrior }]), []);
equal("A4 without the declaration nothing is owed (every core background)", owed({ ...warrior, flags: {} }, [miraku]), []);
equal("A5 matched as the sheet matches, ignoring case and spacing", owed(warrior, [{ id: "x", system: { specialistSkills: " spirit lore " } }]), ["Spirit Lore"]);

const fw = read("module", "feats-workflow.mjs");
ok("B1 the background's Use asks for the alternative when it is declared", /if \(alternativeDeclared\) did = await useSpecialistAlternative\(actor, item\) \|\| did;/.test(fw));
ok("B2 …only while it is owed, and says why not otherwise", /const owed = specialistAlternativeOwed\(item, Array\.from\(actor\?\.items \?\? \[\]\)\);\s*const alternative = [^\n]+\n\s*if \(!owed\.length\) \{/.test(fw));
ok("B3 …through the same chooser a \"name your lore\" background uses", /return useBackgroundSpecialistChoice\(actor, item, \{\s*count: 1,/.test(fw) && /const choice = choiceOverride \?\? item\?\.getFlag\?\.\(SYSTEM_ID, "specialistChoice"\);/.test(fw));
const gw = read("module", "grants-workflow.mjs");
ok("B4 Apply Grants names an owed alternative on any item on the sheet, until it is chosen", /for \(const carrier of Array\.from\(actor\.items \?\? \[\]\)\) \{\s*const owed = specialistAlternativeOwed\(carrier, Array\.from\(actor\.items \?\? \[\]\)\);\s*if \(!owed\.length\) continue;\s*if \(\(actor\.getFlag\?\.\("trg-prime", "backgroundChoiceKeys"\) \?\? \{\}\)\[carrier\.id\]\?\.some\?\.\(Boolean\)\) continue;/.test(gw));
ok("B5 …and the generic nudge does not name it twice", /const alreadyNamed = \["specialistChoice", "skillChoice", "spellChoice", "specialistAlternative"\]/.test(gw));

const EXPECTED = 11;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-specialist-alternative: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-specialist-alternative: ${checks} checks — all green.`);
