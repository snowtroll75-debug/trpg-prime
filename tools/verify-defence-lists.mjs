#!/usr/bin/env node
/**
 * verify-defence-lists — 3.666.4: stored Resistances / Immunities /
 * Weaknesses no longer gain a copy of what effects grant every time the
 * sheet is saved.
 *
 * Found on 22 October 2026 while fixing Graham's Vhalendar module: a
 * Greater Resonance Echo read "disease, poison, disease, poison" after one
 * sheet save, and his hand-made Lesser Echo held the Construct type's eleven
 * immunities nine times.
 *
 *   A  the pure rules: tidy, granted, baked
 *   B  the derived lists are de-duplicated
 *   C  the sheet's boxes show and save the STORED value, and list what
 *      effects add under them
 *   D  a migration pass cleans the stored lists copies were baked into,
 *      gated where the stamp reaches it
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

const dl = await mod("defence-lists.mjs");
const CONSTRUCT = "bleeding, healing, mental, poison, soul, subdual, doomed, fatigued, paralyzed, sickened, unconscious";

/* A — the pure rules */
equal("A1 the three lists, by name", [...dl.DEFENCE_LIST_KEYS], ["resistances", "immunities", "weaknesses"]);
equal("A2 a list is tidied and each entry kept once, first spelling",
  dl.tidyDefenceList(" Fire , cold, fire;COLD ,, acid"), "Fire, cold, acid");
equal("A3 THE ECHO: the derived 'disease, poison, disease, poison' reads once",
  dl.tidyDefenceList("disease, poison, disease, poison"), "disease, poison");
equal("A4 what effects add is the derived entries the stored text does not hold",
  dl.grantedDefenceEntries(`stun, ${CONSTRUCT}`, "Stun"), CONSTRUCT.split(", "));
equal("A5 nothing granted when the stored text holds it all",
  dl.grantedDefenceEntries("fire, cold", "cold, fire"), []);
const lesser = Array.from({ length: 9 }, () => CONSTRUCT).join(", ");
equal("A6 THE LESSER ECHO: nine baked copies of the Construct list clean to nothing",
  dl.bakedDefenceList(lesser, CONSTRUCT.split(", ")), "");
equal("A7 a baked list keeps what the GM typed that no effect grants",
  dl.bakedDefenceList(`fire, ${CONSTRUCT}, ${CONSTRUCT}`, CONSTRUCT.split(", ")), "fire");
equal("A8 a list with no repeat is the GM's typing and is left alone, even matching an effect",
  dl.bakedDefenceList("disease, poison", ["disease", "poison"]), null);
equal("A9 a repeat with no effect behind it is only de-duplicated",
  dl.bakedDefenceList("fire, Fire, cold", []), "fire, cold");
equal("A10 an effect change adds its entries to its own list only",
  [dl.defenceEntriesAddedBy({ key: "system.combat.immunities", value: ", disease" }, "immunities"),
    dl.defenceEntriesAddedBy({ key: "system.combat.immunities", value: "poison, fire" }, "resistances"),
    dl.defenceEntriesAddedBy({ key: "system.combat.resistances", value: "fire" }, "resistances")],
  [["disease"], [], ["fire"]]);

/* B — the derived lists */
const actor = read("module", "documents", "actor.mjs");
ok("B1 the derived lists are tidied by the de-duplicating rule, all three",
  /import \{ DEFENCE_LIST_KEYS, tidyDefenceList \} from "\.\.\/defence-lists\.mjs";/.test(actor)
  && /for \(const key of DEFENCE_LIST_KEYS\) \{\s*if \(typeof system\.combat\[key\] === "string"\) system\.combat\[key\] = tidyDefenceList\(system\.combat\[key\]\);/.test(actor));

/* C — the sheet */
const sheet = read("module", "sheets", "actor-sheet.mjs");
const hbs = read("templates", "actor", "actor-sheet.hbs");
ok("C1 the sheet reads the STORED lists, not the derived ones",
  /const storedCombat = actor\._source\?\.system\?\.combat \?\? \{\};/.test(sheet)
  && /context\.defenceStored = Object\.fromEntries\(DEFENCE_LIST_KEYS\.map\(\(key\) =>\s*\[key, tidyDefenceList\(storedCombat\[key\]\)\]\)\);/.test(sheet));
ok("C2 what effects add is worked out for each list",
  /context\.defenceGranted = Object\.fromEntries\(DEFENCE_LIST_KEYS\.map\(\(key\) =>\s*\[key, grantedDefenceEntries\(system\.combat\?\.\[key\], storedCombat\[key\]\)\.join\(", "\)\]\)\);/.test(sheet));
for (const key of dl.DEFENCE_LIST_KEYS) {
  ok(`C3 THE COMPOUNDING: the ${key} box is filled from the stored value`,
    new RegExp(`name="system\\.combat\\.${key}"\\s*value="\\{\\{defenceStored\\.${key}\\}\\}"`).test(hbs)
    && !new RegExp(`value="\\{\\{system\\.combat\\.${key}\\}\\}"`).test(hbs));
  ok(`C4 what effects add to ${key} is listed under its box`,
    new RegExp(`\\{\\{#if defenceGranted\\.${key}\\}\\}\\s*<p class="hint trg-defence-granted"[^>]*>Also from effects: \\{\\{defenceGranted\\.${key}\\}\\}</p>`).test(hbs));
}

/* D — the migration */
const mig = read("module", "migration.mjs");
ok("D1 the pass reads each actor's stored lists and every effect that still applies",
  /const stored = actor\?\._source\?\.system\?\.combat;/.test(mig)
  && /Array\.from\(actor\.allApplicableEffects\(\)\)/.test(mig)
  && /\.filter\(\(e\) => !e\?\.disabled\)\s*\.flatMap\(\(e\) => Array\.from\(e\?\.changes \?\? \[\]\)\.flatMap\(\(c\) => defenceEntriesAddedBy\(c, key\)\)\);/.test(mig));
ok("D2 it writes only a baked list, and only when cleaning changes it",
  /const cleaned = bakedDefenceList\(stored\[key\], granted\);\s*if \(cleaned === null \|\| cleaned === stored\[key\]\) continue;/.test(mig));
ok("D3 it is run, gated at 3.666.4, over world actors and unlinked tokens, and reported",
  /runIf\("3\.666\.4", "creature-type and effect entries baked into stored resistances, immunities and weaknesses",\s*\(\) => migrateBakedDefenceLists\(actors, tokenActors\)\)\)/.test(mig)
  && /result\.bakedDefences = bakedDefences;/.test(mig)
  && /if \(result\.bakedDefences\?\.length\) \{/.test(mig));
ok("D4 the stamp reaches the pass", (() => {
  const m = /export const TRG_SCHEMA_VERSION = "([\d.]+)";/.exec(mig);
  if (!m) return false;
  const [a, b, c] = m[1].split(".").map(Number);
  return a > 3 || (a === 3 && (b > 666 || (b === 666 && c >= 4)));
})());
ok("D5 the pass is internal: not exported", /\nasync function migrateBakedDefenceLists\(/.test(mig));

const EXPECTED = 25;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-defence-lists: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-defence-lists: ${checks} checks — all green.`);
