#!/usr/bin/env node
/**
 * verify-recovery-companions — two 3.625.0 additions to recovery:
 *   A. Power Recovery extras — a feat's "+1 PP per caster level on a
 *      Critical or Heroic" declared on an effect (Spiritual Reserve).
 *   B. A companion restore on a successful Refocus — "you may choose
 *      Manifest Spirit or Spirit Intercession and restore that ability in
 *      addition" (Deepened Bond).
 * Driven through the pure modules; the two workflows structural.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const { powerRecoveryBonus, powerRecoveryExtras } = await import(new URL("../module/rest/recovery.mjs", import.meta.url));
const { refocusCompanions, refocusSucceeded, refocusCompanionCandidates } = await import(new URL("../module/combat/refocus.mjs", import.meta.url));

const eff = (name, key, raw, extra = {}) => ({ id: name, name, flags: { "trg-prime": { [key]: raw } }, ...extra });
const reserve = powerRecoveryExtras([eff("Spiritual Reserve", "powerRecoveryExtra", { degrees: ["Critical", "heroic"], perCasterLevel: 1 }), eff("Bad", "powerRecoveryExtra", { degrees: ["win"], perCasterLevel: 1 }), eff("Off", "powerRecoveryExtra", { degrees: ["critical"], perCasterLevel: 1 }, { disabled: true })]);
equal("A1 one extra reads (an unknown degree and a disabled effect do not), degrees lower-cased", reserve, [{ label: "Spiritual Reserve", degrees: ["critical", "heroic"], perCasterLevel: 1, flat: 0 }]);
equal("A2 the ladder without extras is the book's: 2/level, 1/level, half up, 1, 0", [powerRecoveryBonus("heroic", 5), powerRecoveryBonus("critical", 5), powerRecoveryBonus("success", 5), powerRecoveryBonus("partial", 5), powerRecoveryBonus("failure", 5)], [10, 5, 3, 1, 0]);
equal("A3 Spiritual Reserve adds a level on a Critical and a Heroic, nothing on a Success", [powerRecoveryBonus("heroic", 5, reserve), powerRecoveryBonus("critical", 5, reserve), powerRecoveryBonus("success", 5, reserve)], [15, 10, 3]);
equal("A4 a flat extra and a per-level one stack", powerRecoveryBonus("critical", 4, [{ degrees: ["critical"], perCasterLevel: 1, flat: 2 }]), 10);

const bond = refocusCompanions([eff("Deepened Bond", "refocusAlsoRestores", { names: ["Manifest Spirit", "Spirit Intercession"] }), eff("Empty", "refocusAlsoRestores", { names: [] })]);
equal("B1 one declaration reads, names lower-cased", bond, [{ label: "Deepened Bond", names: ["manifest spirit", "spirit intercession"] }]);
equal("B2 success is Success and better", ["heroic", "critical", "success", "partial", "failure", "fumble"].map(refocusSucceeded), [true, true, true, false, false, false]);
const items = [{ id: "m", name: "Manifest Spirit", spent: true }, { id: "s", name: "Spirit Intercession", spent: true }, { id: "e", name: "Elemental Mantle", spent: true }, { id: "f", name: "Manifest Spirit", spent: false }];
equal("B3 the candidates: the named, spent ones, not the one just refocused, not the unspent copy", [refocusCompanionCandidates(bond, items, "e").map((i) => i.id), refocusCompanionCandidates(bond, items, "m").map((i) => i.id)], [["m", "s"], ["s"]]);
equal("B4 no declaration: no candidates", refocusCompanionCandidates([], items, "e"), []);

const rest = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "rest", "rest-workflow.mjs"), "utf8");
ok("C1 STRUCTURAL: the rest hands the actor's extras to powerRecoveryBonus", /powerRecoveryBonus\(degree, casterLevel,\s*(\/\/[^\n]*\n\s*)?powerRecoveryExtras\(Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\)\)\)/.test(rest));
const rw = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "refocus-workflow.mjs"), "utf8");
ok("C2 STRUCTURAL: the companion goes through applyRefocusOutcome on the same degree (same timing), after a success only", /if \(!refocusSucceeded\(degree\)\) return "";/.test(rw) && /const outcome = await applyRefocusOutcome\(pick\.item, degree, \{ inCombat, worldTime \}\);/.test(rw));
const aw = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs"), "utf8");
ok("C3 STRUCTURAL: the Refocus action asks for the companion beside the restore", /const companionLine = await restoreRefocusCompanion\(actor, refocusTarget, degree, \{ inCombat: Boolean\(actor\.inCombat\) \}\);/.test(aw));

const EXPECTED = 12;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-recovery-companions: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-recovery-companions: ${checks} checks — all green.`);
