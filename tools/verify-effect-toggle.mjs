#!/usr/bin/env node
/**
 * verify-effect-toggle — TRG Prime 3.684.9: an inactive effect's row still
 * takes clicks.
 *
 * Graham, 6 November 2026: "I did make Mage Armour inactive but then the sheet
 * would not allow me to make it active again." The row is classed "disabled"
 * when its effect is (templates/actor/effect-row.hbs), and Foundry's own
 * stylesheet gives `.disabled` `pointer-events: none`: measured in his world,
 * the toggle's centre hit the card behind it, and a real click did nothing.
 *
 *   T1  the inactive row and its buttons have `pointer-events: auto`
 *   T2  the row is still the one marked "disabled" (what T1 answers)
 *   T3  the toggle still flips `disabled` (the handler)
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const css = read("styles", "trg-prime.css");
const rowRule = /\.trg-prime \.effect-row\.disabled \{([^}]*)\}/.exec(css)?.[1] ?? "";
const btnRule = /\.trg-prime \.effect-row\.disabled button \{([^}]*)\}/.exec(css)?.[1] ?? "";
ok("T1 an inactive effect's row takes clicks (pointer-events: auto), and so do its buttons",
  /pointer-events:\s*auto;/.test(rowRule) && /pointer-events:\s*auto;/.test(btnRule));
ok("T1b nothing else in the sheet's stylesheet switches the inactive row's clicks off",
  !/\.effect-row\.disabled[^{]*\{[^}]*pointer-events:\s*none/.test(css));
ok("T2 the row is classed \"disabled\" when its effect is", /class="effect-row \{\{#if effect\.disabled\}\}disabled\{\{\/if\}\}"/.test(read("templates", "actor", "effect-row.hbs")));
const sheet = read("module", "sheets", "actor-sheet.mjs");
ok("T3 the toggle flips the effect's disabled flag", /static async effectToggle\([^)]*\) \{[\s\S]{0,300}?await effect\.update\(\{ disabled: !effect\.disabled \}\);/.test(sheet)
  && /effectToggle: TRGActorSheet\.effectToggle/.test(sheet));

if (failures.length) {
  process.stdout.write(`verify-effect-toggle: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-effect-toggle: OK — ${checks} checks.\n`);
