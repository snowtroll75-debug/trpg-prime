#!/usr/bin/env node
/**
 * verify-stash-stow — TRG Prime 3.684.9: anything you carry can go in a
 * Never-Ending Stash Sack.
 *
 * Graham, 6 November 2026: "The Never Ending Stash Sack(s) are not applying
 * their weight modifier." The weight rule worked (stowage.mjs, actor.mjs
 * computeCarriedWeight), but the sheet's stow control was on the Gear rows
 * only. A weapon, armour, a shield, a consumable, ammunition, a charged item
 * or a wondrous item could not be put in the sack, so its weight always counted.
 *
 *   S1  every carried-item table on the Items and Magic Items tabs has the stow control
 *   S2  the action refuses a Stash Sack itself (it holds things; it is not stowed)
 *   S4  the Wt. column is not hidden under the row's buttons
 *   S3  the weight rule over every kind of row: stowed items weigh nothing up
 *       to the invested capacity; equipped items are never stowed; a bundle
 *       weighs as a bundle; the overflow is carried
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* S1 — the control on every carried row */
const hbs = read("templates", "actor", "actor-sheet.hbs");
const lines = hbs.split("\n");
const GROUPS = ["weapons", "armour", "shields", "gear", "consumables", "ammunition", "chargedItems", "wondrousItems"];
const withControl = GROUPS.filter((g) => {
  const i = lines.findIndex((l) => l.includes(`{{#each itemGroups.${g} as |item|}}`));
  if (i < 0) return false;
  const end = lines.findIndex((l, k) => k > i && l.startsWith("          {{/each}}"));
  return lines.slice(i, end).some((l) => l.includes('data-action="toggleItemStowed"'));
});
equal("S1 every carried-item table has the stow control (weapons, armour, shields, gear, consumables, ammunition, charged items, wondrous items)", withControl, GROUPS);
ok("S1b the action is registered on the sheet", /toggleItemStowed: TRGActorSheet\.toggleItemStowed,/.test(read("module", "sheets", "actor-sheet.mjs")));

/* S2 — a sack is not stowed in itself */
const sheet = read("module", "sheets", "actor-sheet.mjs");
const action = sheet.slice(sheet.indexOf("static async toggleItemStowed("), sheet.indexOf("static async toggleItemStowed(") + 1600);
ok("S2 stowing a Stash Sack is refused (its capacity read the way the weight rule reads it), after the equipped check and before the update",
  /if \(itemStashCapacity\(item\) > 0\) \{\s*ui\.notifications\.warn\(`\$\{item\.name\} is a Stash Sack — it holds things; it is not stowed\.`\);\s*return;\s*\}/.test(action)
  && action.indexOf("item.system.equipped") < action.indexOf("itemStashCapacity(item)")
  && action.indexOf("itemStashCapacity(item)") < action.indexOf('item.update({ "system.stowed": willStow })')
  && /^import \{ itemStashCapacity, stashCapacity \} from "\.\.\/stowage\.mjs";/.test(sheet));

/* S3 — the weight rule over every kind of row */
const st = await import(new URL("../module/stowage.mjs", import.meta.url));
const sack = (invested, cap = 200) => ({ type: "gear", name: `Never-Ending Stash Sack (${cap})`, system: { weight: 15, quantity: 1, invested, equipped: invested }, flags: { "trg-prime": { container: { capacityLbs: cap } } } });
const item = (type, weight, extra = {}) => ({ type, name: type, system: { weight, quantity: 1, stowed: true, equipped: false, ...extra }, flags: {} });
const kit = [
  sack(true),
  item("weapon", 8), item("armour", 30), item("shield", 6), item("consumable", 1, { quantity: 3 }),
  item("ammunition", 3, { quantity: 20, batchSize: 20 }), item("gear", 2, { charged: true }),
  item("armour", 50, { equipped: true })
];
const sum = st.stowageSummary(kit);
equal("S3 a stowed weapon, armour, shield, consumables (×3), a bundle of ammunition, a charged item: all stowed, worn armour not; capacity 200; nothing over",
  [sum.count, sum.capacity, sum.over, st.isStowed(kit[7]), sum.stowed],
  [6, 200, 0, false, 8 + 30 + 6 + 3 + 3 + 2]);
const small = st.stowageSummary([sack(true, 50), item("armour", 30), item("weapon", 25)]);
equal("S3b over the capacity, the overflow is carried (30 + 25 in a 50-lb sack: 5 over)", [small.stowed, small.over], [55, 5]);
const none = st.stowageSummary([sack(false), item("weapon", 8)]);
equal("S3c an uninvested sack holds nothing: everything stowed is carried", [none.capacity, none.over], [0, 8]);
equal("S3d a sack's own capacity is what the refusal reads", [st.itemStashCapacity(sack(true, 500)), st.itemStashCapacity(item("weapon", 8))], [500, 0]);

/* S5 — drawing a stowed item takes it out of the sack; the equip tooltips
   no longer say "stow" for "put away" (3.684.9, review) */
const equip = sheet.slice(sheet.indexOf("static async toggleItemEquipped("), sheet.indexOf("static async toggleItemEquipped(") + 2400);
ok("S5 equipping a stowed item clears its stowed mark in the same update",
  /if \(willBeEquipped && item\.system\.stowed\) changes\["system\.stowed"\] = false;/.test(equip)
  && equip.indexOf('changes["system.stowed"] = false') < equip.indexOf("await item.update(changes);"));
ok("S5b the charged and wondrous rows' equip tooltips no longer use \"stow\" (the Stash Sack's word)",
  !/Held — click to stow|Stowed — click to hold|Worn — click to stow|Stowed — click to wear/.test(hbs)
  && hbs.includes("Held — click to put away") && hbs.includes("Worn — click to take off"));

/* S4 — the weight column is not covered by the controls (3.684.9; Graham:
   "weight does not actually show on the gear tab, it is hidden") */
const css = read("styles", "trg-prime.css");
const cols = /\.trg-prime \.inventory-header,\s*\.trg-prime \.inventory-row \{[^}]*?grid-template-columns:\s*([^;]+);/.exec(css)?.[1] ?? "";
const ctrlPx = Number(/(\d+)px\s*$/.exec(cols.trim())?.[1] ?? 0);
const wraps = /\.trg-prime \.inventory-row \.item-controls \{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*hidden;/.test(css);
ok("S4 the inventory rows' controls column is four buttons wide (27px each, 2px gaps) and its buttons wrap inside it instead of spilling over the Wt. column",
  ctrlPx >= 4 * 27 + 3 * 2 && wraps, `controls column ${ctrlPx}px, wraps ${wraps}`);

if (failures.length) {
  process.stdout.write(`verify-stash-stow: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-stash-stow: OK — ${checks} checks.\n`);
