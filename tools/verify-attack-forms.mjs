#!/usr/bin/env node
/**
 * verify-attack-forms — 3.667.3: the conditionals' `attackForms` axis, which
 * says what a weapon attack is struck with.
 *
 * FOUND LIVE on Inner Tempest 0.4.1 (23 October 2026). Inner Strike's "+1
 * status bonus to unarmed attack rolls" could only be written as a tick-box,
 * because no axis could tell a fist from a sword. Only the check dialog
 * offers a tick-box, and a weapon attack never opens it, so the +1 never
 * applied. With the axis, the module scopes the +1 to unarmed attacks and
 * marks it automatic.
 *
 *   A  attackFormOf: "unarmed" for the fists, a gauntlet or a Monastic
 *      weapon (D11); "natural" for a claw or a bite; "weapon" otherwise
 *   B  the axis: an entry scoped to it matches that form only, never a roll
 *      that carries no form, and applies on the automatic path
 *   C  wiring: the weapon attack fills it, and the check carries it to the
 *      automatic conditionals
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const up = await import(new URL("../module/combat/unarmed-profile.mjs", import.meta.url));
const cd = await import(new URL("../module/conditionals.mjs", import.meta.url));

/* A — what the blow is struck with (the pack's own weapon data) */
const FIST = { natural: true, category: "Unarmed", damageType: "subdual", traits: "Agile, Finesse" };
const GAUNTLET = { natural: false, category: "Simple", damageType: "bludgeoning", unarmed: true, traits: "Agile, Free-Hand" };
const MONASTIC = { natural: false, category: "Martial", damageType: "bludgeoning", traits: "Monastic, Reach" };
const CLAW = { natural: true, category: "Unarmed", damageType: "slashing", traits: "Agile, Finesse, Versatile (P)" };
const SWORD = { natural: false, category: "Martial", damageType: "slashing", traits: "Versatile (P)" };
equal("A1 the fists are unarmed", up.attackFormOf(FIST), "unarmed");
equal("A2 a gauntlet is unarmed", up.attackFormOf(GAUNTLET), "unarmed");
equal("A3 a Monastic weapon is unarmed (D11)", up.attackFormOf(MONASTIC), "unarmed");
equal("A4 a claw is natural, not unarmed", up.attackFormOf(CLAW), "natural");
equal("A5 a sword is a weapon", up.attackFormOf(SWORD), "weapon");
equal("A6 nothing at all is a weapon", up.attackFormOf(undefined), "weapon");

/* B — the axis */
ok("B1 the axis is declared, with its context key",
  cd.SCOPE_AXES.includes("attackForms") && cd.AXIS_CONTEXT_KEYS.attackForms === "attackForm");
const strike = cd.normaliseConditional(
  { kind: "modifier", value: 1, type: "status", label: "Inner Strike", scope: "Unarmed attack rolls", auto: true,
    when: { checkTypes: ["attack"], attackModes: ["melee"], attackForms: ["unarmed"] } },
  { id: "is", name: "Inner Strike", kind: "effect" }, 0);
ok("B2 the entry keeps the axis", JSON.stringify(strike?.when?.attackForms) === JSON.stringify(["unarmed"]));
const attack = (attackForm) => ({ checkType: "attack", attackMode: "melee", ...(attackForm === undefined ? {} : { attackForm }) });
ok("B3 it matches an unarmed attack", cd.matchesCheck(strike, attack("unarmed")) === true);
ok("B4 …not a sword", cd.matchesCheck(strike, attack("weapon")) === false);
ok("B5 …not a claw", cd.matchesCheck(strike, attack("natural")) === false);
ok("B6 …and not an attack that names no form", cd.matchesCheck(strike, attack(undefined)) === false);
ok("B7 the form is read case-blind", cd.matchesCheck(strike, attack("Unarmed")) === true);
const notFists = cd.normaliseConditional(
  { kind: "modifier", value: -2, type: "circumstance", label: "X", auto: true,
    when: { checkTypes: ["attack"], not: { attackForms: ["unarmed"] } } },
  { id: "x", name: "X", kind: "effect" }, 0);
ok("B8 an exclusion on the axis stands down on that form only",
  cd.matchesCheck(notFists, attack("unarmed")) === false && cd.matchesCheck(notFists, attack("weapon")) === true);
equal("B9 on the automatic path, an unarmed attack gets the +1 and a sword does not",
  [cd.automaticSelections([strike], attack("unarmed")).modifiers.map((x) => x.value),
    cd.automaticSelections([strike], attack("weapon")).modifiers.length],
  [[1], 0]);

/* C — wiring */
const aw = read("module", "combat", "attack-workflow.mjs");
const config = aw.slice(aw.indexOf("  const attackCheckConfig = {"), aw.indexOf("  let check = await TRGCheck.roll(attackCheckConfig);"));
ok("C1 the weapon attack's check says what it is struck with",
  config.length > 0 && /\n    attackForm: attackFormOf\((?:weaponData|abilityData)\),\n/.test(config));
// Re-anchored at 3.671.0: the import gained the B7-6 helpers beside it.
ok("C2 …from the core's own rule", /import \{[^}]*\battackFormOf\b[^}]*\} from "\.\/unarmed-profile\.mjs";/.test(aw));
const ck = read("module", "dice", "check.mjs");
ok("C3 the check stores it", /this\.attackForm = config\.attackForm \?\? "";/.test(ck));
ok("C4 …and hands it to the automatic conditionals", /attackForm: check\.attackForm,?\n/.test(ck));

const EXPECTED = 20;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-attack-forms: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-attack-forms: ${checks} checks — all green.`);
