#!/usr/bin/env node
/**
 * verify-fixes-3688-2 — TRG Prime 3.688.2: two faults behind Graham's report
 * ("When an arcane caster casts from an item such as a wand and staff it does
 * not allow them to add their spellcraft mod"), found live on 13 November
 * 2026 with a copy of Valmorius releasing Wand of Cure on 3.688.1.
 *
 *   A  THE SPELLCRAFT PATH ROLLED +0. `castFromItemOptions` names that path's
 *      skill "spellcraft"; the release check read it as a skill
 *      (`system.skills.spellcraft`, which does not exist) and rolled
 *      "Spellcraft Untyped +0" instead of the caster's +14.
 *   B  THE RELEASED SPELL WAS REFUSED AFTER ITS CHECK PASSED: "Cure cannot be
 *      cast — you have not studied your Spell Library today". A spell
 *      released from an item is not one of the caster's library; the library
 *      gate (`spellCastBlocked`: not prepared, cantrips-only day) does not
 *      apply to it.
 *
 *   node tools/verify-fixes-3688-2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ci = await import(new URL("../module/charged-items.mjs", import.meta.url));
const ciw = strip(read("module", "charged-items-workflow.mjs"));
const cw = strip(read("module", "magic", "cast-workflow.mjs"));

// A — the path's own name is why it misread.
const opts = ci.castFromItemOptions({ spellPPCost: 2, spellTradition: "divinity, verdant", casterLevel: 8, casterTradition: "arcane", highMagicCaster: true, skillRanks: { religion: 4 }, hasUseMagicDevice: true });
equal("A the Spellcraft path names its skill \"spellcraft\"; the others a real skill", opts.map((o) => [o.key, o.skill]), [["spellcraft", "spellcraft"], ["tradition:divinity", "religion"], ["tradition:verdant", "nature"]]);
ok("A the release reads a skill only for a path that is not Spellcraft",
  /const bySkill = Boolean\(option\.skill\) && option\.skill !== "spellcraft";/.test(ciw)
  && /const skill = bySkill \? actor\.system\?\.skills\?\.\[option\.skill\] : null;/.test(ciw)
  && /const modifiers = bySkill\n\s*\? \(skill\?\.checkModifiers \?\?/.test(ciw));
ok("A …and the Spellcraft path rolls the caster's Spellcraft (system.magic.spellcraft), as a Spellcraft check",
  /: \(actor\.system\?\.magic\?\.spellcraft\?\.checkModifiers \?\? \[\n\s*\{ label: "Spellcraft", value: Number\(actor\.system\?\.magic\?\.spellcraft\?\.total \?\? 0\), type: "untyped" \}/.test(ciw)
  // RE-ANCHORED AT 3.690.0 (Block 9c, H23): a registered kind's DC parts join the DC.
  && /type: bySkill \? "skill" : "spellcraft",\n\s*dc: castingDC\(cost\)(?: \+ partsTotal)?,/.test(ciw));
ok("A its fumble is a Spellcraft check's too", /check: \{ type: bySkill \? "skill" : "spellcraft", skill: bySkill \? option\.skill : "" \},/.test(ciw));
ok("A nothing reads `option.skill ?` as the skill test any more", !/option\.skill \?(?!\?)/.test(ciw));

// B — the library gate.
ok("B a spell released from an item is not asked the library's question",
  /const releasedFromItem = Boolean\(spell\.getFlag\?\.\(SYSTEM_ID, "itemCast"\)\);\n\s*const castBlocked = \(ritualNonCaster \|\| releasedFromItem\) \? "" : spellCastBlocked\(spell\);/.test(cw));
ok("B …the flag it reads is the one the release sets on the built spell (`itemCast`, read again as isItemCast)",
  /const itemCast = spell\.getFlag\?\.\(SYSTEM_ID, "itemCast"\) \?\? null;/.test(cw));
ok("B and a spell of the caster's own is still asked", /spellCastBlocked\(spell\)/.test(cw) && cw.indexOf("const releasedFromItem") < cw.indexOf("const castBlocked"));

const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.691.0", [sys.version, JSON.parse(read("package.json")).version], ["3.711.1", "3.711.1"]);

if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); console.log(`verify-fixes-3688-2: ${failures.length} failure(s) of ${checks}`); process.exit(1); }
console.log(`verify-fixes-3688-2: all ${checks} checks pass`);
