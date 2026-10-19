#!/usr/bin/env node
/**
 * verify-ff30-block23 — 3.656.0, Fiends & Fables 3.0 block 23 (the Primals;
 * Graham, 17 October 2026: "Go with your recommendations").
 *
 *   R5   a weapon's "recurring +N": a hit lays Recurring N of its type
 *   R6   a strike with an innate spell (Air Blast Magic): the innate cast free
 *        at the same target, its attack on the strike's bonus
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (...p) => import(pathToFileURL(path.join(SYSTEM_ROOT, "module", ...p)).href);
const CR = await imp("codex-action-rules.mjs");

/* ---- R5 ---- */
equal("B1 recurring +N is read from the traits; none, junk or a bare word is nothing",
  [CR.weaponRecurringValue("Agile, Finesse, Magical, Recurring +3"), CR.weaponRecurringValue("recurring+1"), CR.weaponRecurringValue("Agile"), CR.weaponRecurringValue("Recurring"), CR.weaponRecurringValue(""), CR.weaponRecurringValue("Unrecurring +2")],
  [3, 1, 0, 0, 0, 0]);

/* ---- R6 ---- */
const items = [{ type: "spell", name: "Gust", system: { innate: true } }, { type: "spell", name: "Deflections", system: { innate: true } },
  { type: "spell", name: "Fireball", system: { innate: false } }, { type: "ability", name: "Gustly", system: { innate: true } }];
equal("B2 the innates it may combine, by name; not its other spells or abilities", CR.strikeInnateSpells(items, {}).map((s) => s.name), ["Deflections", "Gust"]);
equal("B3 a named tradition narrows them; a spell that lists none is kept",
  CR.strikeInnateSpells([{ type: "spell", name: "A", system: { innate: true, tradition: "arcane" } }, { type: "spell", name: "B", system: { innate: true, tradition: "verdant, divinity" } }, { type: "spell", name: "C", system: { innate: true } }], { tradition: "verdant" }).map((s) => s.name),
  ["B", "C"]);

// 3.656.1 — found live testing 3.656.0.
equal("B4 the Strike's bonus for the spell: its own modifiers, not that roll's penalty, range or circumstance",
  CR.strikeAttackBonus([{ label: "BAB and ability", value: 20 }, { label: "Creature level", value: 7 }, { label: "Ranged (Dexterity) — replaces Strength", value: -1 }, { label: "Air Blast", value: 1, type: "item" },
    { label: "Target Prone (beyond 5 ft)", value: -4, type: "circumstance" }, { label: "Multiple Attack Penalty (attack 3)", value: -10 }, { label: "Range increment 2 (30 ft)", value: -4 }]), 27);

/* ---- source ---- */
const src = { aw: read("module", "combat", "attack-workflow.mjs"), cw: read("module", "codex-actions-workflow.mjs"), cast: read("module", "magic", "cast-workflow.mjs") };
ok("S1 a hit with recurring +N lays it, of the damage type, through the bombs' rule, and not on an immune target",
  /const recurring = weaponRecurringValue\(weapon\.system\?\.traits\);\n\s+if \(recurring > 0\) lines\.push\(line\(await layWeaponRecurring\(targetActor, recurring, String\(effectiveDamageType/.test(src.aw)
  && /async function layWeaponRecurring\(targetActor, amount, damageType, immune\) \{\n\s+if \(immune\) return/.test(src.aw)
  && /const next = recurringAfterHit\(existing, amount, damageType\);\n\s+await targetActor\.toggleStatusEffect\("recurring", \{ value: next\.value, damageType: next\.damageType \}\);/.test(src.aw));
ok("S2 Air Blast Magic: one target, the spell chosen before the AP is spent, the strike rolled, then the innate cast free at it on the strike's bonus",
  /if \(!target\?\.actor \|\| game\.user\.targets\.size !== 1\)/.test(src.cw)
  && /const spell = spells\[Number\(index\)\];\n\s+if \(!\(await spendAp\(actor, spec\.ap \?\? 2, item\.name\)\)\) return false;/.test(src.cw)
  && /const check = await rollWeaponAttack\(actor, weapon, \{ apPaid: true, skipTargetPrompt: true \}\);\n\s+if \(!check\) return true;\n(\s+\/\/[^\n]*\n)+\s+const attackBonus = Array\.isArray\(check\?\.modifiers\) \? strikeAttackBonus\(check\.modifiers\) : Number\.NaN;/.test(src.cw)
  && /await castSpell\(actor, spell, \{ presetTargets: true, apPaid: true, carried: \{ label: weapon\.name, attackBonus:/.test(src.cw)
  && /const KINDS = Object\.freeze\(\{ strikeWithInnate,/.test(src.cw));
ok("S3 the cast uses a carried attack bonus in place of the innate's own, and names it",
  /const innateAttackHere = Number\.isFinite\(carried\?\.attackBonus\)\n\s+\? \{ value: carried\.attackBonus, printed: false, from:/.test(src.cast)
  && /label: innateAttackHere\.from \? `\$\{innateAttackHere\.from\}'s attack bonus`/.test(src.cast));

const EXPECTED = 8;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block23: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block23: ${checks} checks\n  all pass\n`);
