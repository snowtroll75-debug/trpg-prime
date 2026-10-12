#!/usr/bin/env node
/**
 * verify-refresh-ownership — what a compendium refresh must not destroy.
 *
 * NEW at 3.406.1.
 *
 * `compendium-refresh.mjs` had NO harness at all, for a module whose
 * entire job is to copy the rulebook's numbers onto a character's items
 * WITHOUT eating the player's own state. The rule that decides which is
 * which was pure the whole time and sat in a file no harness could
 * import, so nothing checked it — and it was wrong: `prepared` was
 * missing, and a refresh proposed un-preparing every prepared spell in
 * the world.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  PRESERVED_FIELDS, fieldIsPlayerOwned, pathIsPlayerOwned, leafName, preserveSpent
} from "../module/refresh-ownership.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. The fields the player owns
 * ================================================================== */

// A1 IS THE DEFECT THIS FILE WAS BORN FROM. Which spells are prepared
// today is chosen at dawn and the compendium cannot know it.
ok("A1 prepared belongs to the player", fieldIsPlayerOwned("prepared"),
  "a refresh would set every prepared spell in the world back to false");
ok("A2 innate belongs to the player", fieldIsPlayerOwned("innate"),
  "a spell is innate to THIS creature, never to the rulebook's generic entry");

// The hazards the module's own header already named.
for (const [field, why] of [
  ["equipped", "un-equips armour mid-combat"],
  ["quantity", "invents or destroys stock"],
  ["quality", "wipes an expert Mithril breastplate back to standard steel"],
  ["material", "same"],
  ["superiorTraits", "same"],
  ["invested", "drops an invested item"],
  ["attackedThisTurn", "per-turn combat state"],
  ["loaded", "reloads a spent crossbow"],
  ["usesValue", "refills expended uses"]
]) {
  ok(`A3 "${field}" belongs to the player`, fieldIsPlayerOwned(field), why);
}

/* ================================================================== *
 * B. The fields the RULEBOOK owns — the other half, and the half that
 *    makes the refresh worth running at all
 * ================================================================== */

// B1 IS WHY 3.406.0's STONE SHIELD FIX CAN REACH AN EXISTING CHARACTER.
// If `effects` were ever preserved, a corrected spell would never arrive.
ok("B1 effects belong to the rulebook", !fieldIsPlayerOwned("effects"),
  "preserving it would mean no data correction ever reaches an owned item");
for (const field of ["value", "max", "damage", "range", "ppCost", "description", "traits"]) {
  ok(`B2 "${field}" is not blanket-preserved`, !fieldIsPlayerOwned(field));
}

// B3: "value" IS THE TRAP. It is the most common leaf name in the schema
// and preserving it would freeze half the rulebook.
ok("B3 the bare leaf \"value\" is not preserved", !fieldIsPlayerOwned("value"),
  "spent amounts are carried by preserveSpent, not by blanket-preserving a leaf name");

/* ================================================================== *
 * C. Leaf matching
 * ================================================================== */

ok("C1 a nested path resolves to its leaf", leafName("system.uses.value") === "value");
ok("C2 a bare name is its own leaf", leafName("prepared") === "prepared");
ok("C3 an empty path is harmless", leafName("") === "" && !fieldIsPlayerOwned(""));
ok("C4 a preserved leaf is matched at any depth", pathIsPlayerOwned("system.spell.prepared"));
ok("C5 and a rulebook leaf is not", pathIsPlayerOwned("system.spell.effects") === false);

// C5b: MATCHING IS EXACT, NOT SUFFIX. Added after a mutation SURVIVED:
// loosening `includes` to `endsWith` broke nothing, because every field
// the check named happened to share no ending with a preserved one. A
// field is player-owned because it IS one of these names, not because it
// finishes with one — "baseQuality" is the rulebook's, "quality" is the
// player's, and a suffix test cannot tell them apart.
// The names must end with the preserved token EXACTLY, case included —
// the first attempt used "baseQuality", which ends with "Quality" and not
// "quality", so the suffix mutation slipped through a second time. A test
// for loose matching that is itself too loose proves nothing.
for (const near of ["unprepared", "unequipped", "reloaded", "notinnate"]) {
  ok(`C5b "${near}" is not player-owned merely for ending with one that is`,
    fieldIsPlayerOwned(near) === false);
}

// C6: A PRESERVED NAME MUST BE A LEAF, NOT A PATH. One written as
// "uses.value" would match nothing, silently — the exact silent-failure
// shape this module is supposed to prevent.
ok("C6 every preserved name is a bare leaf",
  PRESERVED_FIELDS.every((f) => !f.includes(".")),
  PRESERVED_FIELDS.filter((f) => f.includes(".")).join(", "));
ok("C6b and none is blank", PRESERVED_FIELDS.every((f) => f.trim().length > 0));
ok("C6c and none is duplicated",
  new Set(PRESERVED_FIELDS).size === PRESERVED_FIELDS.length);

/* ================================================================== *
 * D. Spent amounts survive a change of maximum
 * ================================================================== */

ok("D1 what was spent stays spent", preserveSpent(3, 5, 10) === 8,
  "2 of 5 used → 2 of 10 used");
ok("D2 a raised maximum does not refill", preserveSpent(0, 5, 10) === 5,
  "the first live run proposed refilling a half-used set of healer's tools");
ok("D3 a lowered maximum clamps", preserveSpent(5, 5, 3) === 3);
ok("D4 an uninitialised maximum comes back full", preserveSpent(0, 0, 4) === 4);
ok("D5 it never goes negative", preserveSpent(0, 100, 4) === 0);

/* ================================================================== *
 * E. The refresh module actually uses this rule
 * ================================================================== */
{
  const file = path.join(SYSTEM_ROOT, "module", "compendium-refresh.mjs");
  const text = fs.readFileSync(file, "utf8");
  ok("E1 compendium-refresh imports the shared ownership rule",
    /from "\.\/refresh-ownership\.mjs"/.test(text));
  ok("E2 and consults it when diffing",
    /const leaf = leafName\(path\);[\s\S]{0,120}PRESERVED_FIELDS\.includes\(leaf\)/.test(text),
    "a rule the differ does not consult is a rule the refresh does not have");
  ok("E3 and defines no second copy of the list",
    !/const PRESERVED_FIELDS = Object\.freeze/.test(text),
    "two places deciding one question");
  ok("E4 and no second copy of leafName",
    !/^function leafName/m.test(text));
  // E5: ONE PUBLIC HOME. The first cut left a re-export here "for
  // compatibility"; nothing imported it, and the uncalled-export ratchet
  // noticed. A second doorway to one function is the same smell as a
  // second copy of it.
  ok("E5 and does not re-export it either",
    !/preserveSpent/.test(text.split("\n").filter((l) => /^export/.test(l)).join("\n")),
    "one function, one public home");
}

process.stdout.write(`verify-refresh-ownership: ${checks} checks\n`);
if (failures.length) {
  process.stdout.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
