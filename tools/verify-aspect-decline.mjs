#!/usr/bin/env node
/**
 * verify-aspect-decline — a registered class may DECLINE the Divine
 * Aspect requirement (3.625.0). The 3.623.0 banner infers "needs an
 * aspect" from a divinity tradition with a caster style; Pillars of
 * Faith's Archivist and Healer are divinity casters whose book says they
 * need none, so `registerClass(name, { needsDivineAspect: false })` must
 * stand the banner down, while an absent key changes nothing and an
 * explicit need still wins.
 *
 * DRIVEN, pure: aspect-rules.divinityCasterSources with the new flag;
 * module-api.registerClass → registeredClass; config's reader.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const { divinityCasterSources } = await import(new URL("../module/aspect-rules.mjs", import.meta.url));
const { registerClass, registeredClass } = await import(new URL("../module/module-api.mjs", import.meta.url));
const { classDeclinesDivineAspect, classNeedsDivineAspect } = await import(new URL("../module/config.mjs", import.meta.url));

const caster = (extra = {}) => ({ className: "Archivist", classTradition: "divinity", classCasterStyle: "learned", ...extra });
equal("A1 a divinity caster with no declaration is inferred to need an aspect (3.623.0)", divinityCasterSources(caster()), ["Archivist"]);
equal("A2 the same class, declining, is not", divinityCasterSources(caster({ classDeclinesAspect: true })), []);
equal("A3 an explicit need wins over a decline", divinityCasterSources(caster({ classDeclinesAspect: true, classNeedsAspect: true })), ["Archivist"]);
equal("A4 a decline does not touch the feat and archetype sources", divinityCasterSources(caster({ classDeclinesAspect: true, featNames: ["Divine Knight"], archetypeNames: ["Priest"] })), ["Divine Knight", "Priest"]);
equal("A5 a non-divinity class declining is still nothing", divinityCasterSources({ className: "Folkwarden", classTradition: "verdant", classCasterStyle: "instinctive", classDeclinesAspect: true }), []);

registerClass("Test Archivist", { needsDivineAspect: false }, "test");
registerClass("Test Grimward", { needsDivineAspect: true }, "test");
registerClass("Test Folkwarden", {}, "test");
equal("B1 registerClass records an explicit false as a decline", [registeredClass("Test Archivist").declinesDivineAspect, registeredClass("Test Archivist").needsDivineAspect], [true, false]);
equal("B2 an explicit true is a need, not a decline", [registeredClass("Test Grimward").declinesDivineAspect, registeredClass("Test Grimward").needsDivineAspect], [false, true]);
equal("B3 an absent key is neither", [registeredClass("Test Folkwarden").declinesDivineAspect, registeredClass("Test Folkwarden").needsDivineAspect], [false, false]);
equal("B4 config's readers agree", [classDeclinesDivineAspect("Test Archivist"), classNeedsDivineAspect("Test Archivist"), classDeclinesDivineAspect("Test Grimward"), classNeedsDivineAspect("Test Grimward"), classDeclinesDivineAspect("Cleric"), classNeedsDivineAspect("Cleric"), classDeclinesDivineAspect("Nobody")], [true, false, false, true, false, true, false]);

const sheet = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs"), "utf8");
ok("C1 STRUCTURAL: the sheet hands the decline to divinityCasterSources", /classDeclinesAspect: classDeclinesDivineAspect\(classItem\?\.name \?\? context\.identitySummary\.class\?\.name\),/.test(sheet));

const EXPECTED = 11;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-aspect-decline: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-aspect-decline: ${checks} checks — all green.`);
