#!/usr/bin/env node
/**
 * verify-equipment-conditionals — an equipment item's conditionals count
 * only while it is worn or held and standing (3.607.0), shipped with
 * Pillars of Faith's Chapter 6 (the first armour, shields, weapons and
 * kits to carry a conditional).
 *
 * DRIVEN, pure (conditionals.mjs, item-quality.mjs): collectConditionals
 * on plain item objects — armour, shield, weapon and gear unequipped,
 * equipped, destroyed; a feat, an ability and a race unaffected; an
 * effect unaffected.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const { collectConditionals } = await import(new URL("../module/conditionals.mjs", import.meta.url));
const row = (label) => [{ kind: "modifier", value: 1, type: "item", label, scope: "a scope", when: { checkTypes: ["save"] } }];
const item = (type, label, { equipped = true, hp = null } = {}) => ({ id: label, name: label, type, system: { equipped, ...(hp ? { hp } : {}) }, flags: { "trg-prime": { conditionals: row(label) } } });
const labels = (items, effects = []) => collectConditionals(items, effects).map((e) => e.label);

equal("A1 unequipped armour, shield, weapon and gear offer nothing", labels([item("armour", "A", { equipped: false }), item("shield", "S", { equipped: false }), item("weapon", "W", { equipped: false }), item("gear", "G", { equipped: false })]), []);
equal("A2 equipped, all four offer their rows", labels([item("armour", "A"), item("shield", "S"), item("weapon", "W"), item("gear", "G")]), ["A", "S", "W", "G"]);
equal("A3 a destroyed suit offers nothing (HP below minus half its maximum)", labels([item("armour", "A", { hp: { value: -6, max: 10 } })]), []);
equal("A4 a damaged but standing suit still does", labels([item("armour", "A", { hp: { value: -4, max: 10 } })]), ["A"]);
equal("A5 an item with no HP pool is standing when equipped", labels([item("gear", "G", { hp: { value: 0, max: 0 } })]), ["G"]);
equal("A6 a feat, an ability and a race are untouched by the gate", labels([item("feat", "F", { equipped: false }), item("ability", "B", { equipped: false }), item("race", "R", { equipped: false })]), ["F", "B", "R"]);
equal("A7 an item of an unknown type is untouched", labels([{ id: "x", name: "X", type: "wondrous", system: {}, flags: { "trg-prime": { conditionals: row("X") } } }]), ["X"]);
equal("A8 an effect is untouched", labels([], [{ id: "e", name: "E", flags: { "trg-prime": { conditionals: row("E") } } }]), ["E"]);
equal("A9 a disabled effect is still skipped", labels([], [{ id: "e", name: "E", disabled: true, flags: { "trg-prime": { conditionals: row("E") } } }]), []);
equal("A10 order is preserved across a mixed sheet", labels([item("feat", "F"), item("armour", "A", { equipped: false }), item("armour", "B"), item("gear", "G", { equipped: false })]), ["F", "B"]);

const src = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "conditionals.mjs"), "utf8");
ok("B1 STRUCTURAL: the gate reads wornAndStanding (the armour descriptions' and the Goods conditionals' gate)", /import \{ wornAndStanding \} from "\.\/item-quality\.mjs";/.test(src) && /return wornAndStanding\(item\);/.test(src));
ok("B2 STRUCTURAL: the gate is inside the harvest, on items only", /if \(kind === "item" && !equipmentInUse\(document\)\) continue;/.test(src));

const EXPECTED_CHECKS = 13;
equal("Z1 the suite ran every check it is meant to", checks + 1, EXPECTED_CHECKS);
if (failures.length) { console.log(`verify-equipment-conditionals: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-equipment-conditionals: ${checks} checks — all green.`);
