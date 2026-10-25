#!/usr/bin/env node
/**
 * verify-natural-ready — 3.666.0: a character's natural attacks are always
 * ready and take no hand (Graham, 21 October 2026). See
 * module/combat/natural-ready.mjs.
 *
 *   A  who: characters, companions and familiars; never a creature, whose
 *      forms switch its strikes through the stored state
 *   B  a Change Shape form still sets aside the strikes it lists
 *   C  the item derives it (never writes it); the sheet has no toggle for it
 *   D  it still takes no hand, and a fumble cannot make you drop it
 *   E  it counts as the "other weapon" (Graham, 21 October 2026): for
 *      Double Slice and for Parry's "while another weapon is equipped"
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

const nr = await mod("combat", "natural-ready.mjs");
const claw = { type: "weapon", natural: true, name: "Claw" };
/* A */
equal("A1 a character's, a companion's and a familiar's natural attack is ready", ["character", "companion", "familiar"].map((t) => nr.naturalAlwaysReady(claw, t)), [true, true, true]);
equal("A2 a creature's is left to its stored state; a party has none", [nr.naturalAlwaysReady(claw, "npc"), nr.naturalAlwaysReady(claw, "party")], [false, false]);
equal("A3 a held weapon, or anything not a weapon, is never made ready", [nr.naturalAlwaysReady({ type: "weapon", natural: false, name: "Sword" }, "character"), nr.naturalAlwaysReady({ type: "armour", natural: true, name: "Claw" }, "character")], [false, false]);
/* B */
const form = (loses, disabled = false) => ({ disabled, flags: { "trg-prime": { changeShapeForm: { key: "wolf", loses } } } });
equal("B1 a form's lost strikes are read from its effect; a disabled form sets nothing aside", [nr.formLosesOf([form(["Claw"])]), nr.formLosesOf([form(["Claw"], true)]), nr.formLosesOf([{ flags: {} }])], [["Claw"], [], []]);
equal("B2 a strike a form has set aside is not ready; the others are", [nr.naturalAlwaysReady(claw, "character", ["Claw"]), nr.naturalAlwaysReady({ ...claw, name: "Bite" }, "character", ["Claw"])], [false, true]);
/* C */
const item = read("module", "documents", "item.mjs");
ok("C1 the item derives it, after resizing and before the runes read it", /this\._resizeNaturalAttack\(\);\s*this\._readyNaturalAttack\(\);\s*this\._applyRunes\(\);/.test(item));
ok("C2 …from the shared rule, the form's losses included, setting only the derived value", /_readyNaturalAttack\(\) \{\s*if \(this\.type !== "weapon" \|\| !this\.system\?\.natural \|\| this\.system\.equipped\) return;[\s\S]{0,200}const loses = formLosesOf\(actor\.effects, "trg-prime", "changeShapeForm"\);\s*if \(naturalAlwaysReady\(\{ type: this\.type, natural: true, name: this\.name \}, actor\.type, loses\)\) this\.system\.equipped = true;/.test(item) && !/_readyNaturalAttack\(\) \{[\s\S]{0,600}\.update\(/.test(item));
const cs = await mod("change-shape.mjs");
equal("C3 the form flag it reads is the one Change Shape writes", cs.CHANGE_SHAPE_FLAG, "changeShapeForm");
const sheet = read("module", "sheets", "actor-sheet.mjs");
const hbs = read("templates", "actor", "actor-sheet.hbs");
ok("C4 the sheet marks it always ready, and the template shows no toggle for it", /if \(item\.type === "weapon" && item\.system\?\.natural && ALWAYS_READY_ACTOR_TYPES\.includes\(this\.actor\.type\)\) \{\s*row\.alwaysReady = true;/.test(sheet) && /\{\{#if item\.alwaysReady\}\}\s*<span class="always-ready"[\s\S]{0,200}\{\{else\}\}\s*<button type="button" data-action="toggleItemEquipped"/.test(hbs));
ok("C5 the toggle itself refuses, should anything reach it", /static async toggleItemEquipped\(event, target\) \{[\s\S]{0,200}if \(item\.type === "weapon" && item\.system\?\.natural && ALWAYS_READY_ACTOR_TYPES\.includes\(this\.actor\.type\)\) \{\s*ui\.notifications\.info\([^)]*\);\s*return;/.test(sheet));
/* D */
const held = await mod("held-items.mjs");
equal("D1 it still takes no hand", held.itemRequiredHands({ type: "weapon", system: { natural: true, size: "medium", traits: "" } }, "medium"), 0);
ok("D2 a fumble's \"you drop it\" passes a natural attack by", /if \(dropped && weapon && !weapon\.system\?\.natural\) \{/.test(read("module", "combat", "fumble-riders-workflow.mjs")));

/* E */
const ds = await mod("combat", "double-slice.mjs");
const atk = await mod("combat", "attack.mjs");
const sword = { id: "s", type: "weapon", name: "Shortsword", system: { equipped: true, attackMode: "melee", traits: "Agile", size: "medium" } };
const fist = { id: "f", type: "weapon", name: "Unarmed Strike", system: { equipped: true, natural: true, attackMode: "melee", traits: "", size: "medium" } };
const dagger = { id: "d", type: "weapon", name: "Main Gauche", system: { equipped: true, attackMode: "melee", traits: "Parry", size: "medium" } };
equal("E1 a held weapon and a natural attack make a Double Slice; the natural attack alone does not", [ds.doubleSliceRequirement([sword, fist]).allowed, ds.doubleSliceRequirement([fist]).allowed], [true, false]);
ok("E2 a Parry weapon beside a natural attack gives Parry's DB", atk.parryBonus([dagger, fist], new Set()) > 0 && atk.parryBonus([dagger], new Set()) === 0);

const EXPECTED = 15;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-natural-ready: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-natural-ready: ${checks} checks — all green.`);
