#!/usr/bin/env node
/**
 * verify-held-change-3702 — core 3.702.0, drawing and putting away in combat.
 *
 * Chapter 6: worn items "can be swiftly retrieved or returned with a 1 AP
 * (Interact) action". Interact is a Manipulate action, and a Manipulate
 * action in reach provokes; Release does not. Graham, 19 November 2026:
 * "Drawing a weapon is an Interact action. This has the manipulate trait
 * which provokes". His rulings: in combat the sheet's equip tickbox draws as
 * an Interact; unticking asks Drop (Release) or Sheathe/Stow (Interact); a
 * GM may just set it.
 *
 *   A  when a change is an action (`heldChangeIsAction`, pure)
 *   B  the draw's update and the card's line
 *   C  the workflow: the GM's choice, Interact for a draw, Drop or Sheathe
 *   D  resolveAction: the item reaches Release and Interact, and Interact
 *      changes it only once taken and paid for
 *   E  the character sheet and the item sheet both route through it
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

/* A — when it is an action ------------------------------------------------ */
const hc = await mod("combat", "held-change.mjs");
{
  const sword = { type: "weapon", name: "Longsword", system: { size: "medium", traits: "" } };
  const fight = { combatStarted: true, actorInCombat: true, actorSize: "medium" };
  ok("A1 a sword drawn in combat: an action", hc.heldChangeIsAction({ ...fight, item: sword }) === true);
  ok("A2 out of combat: free", hc.heldChangeIsAction({ ...fight, combatStarted: false, item: sword }) === false);
  ok("A3 a combat this actor is not in: free", hc.heldChangeIsAction({ ...fight, actorInCombat: false, item: sword }) === false);
  ok("A4 a natural attack is never drawn", hc.heldChangeIsAction({ ...fight, item: { type: "weapon", name: "Bite", system: { natural: true } } }) === false);
  ok("A5 a shield: an action", hc.heldChangeIsAction({ ...fight, item: { type: "shield", name: "Heavy Shield", system: { size: "medium" } } }) === true);
  ok("A6 a potion (a consumable takes a hand): an action", hc.heldChangeIsAction({ ...fight, item: { type: "consumable", name: "Potion", system: {} } }) === true);
  ok("A7 a torch held in one hand: an action", hc.heldChangeIsAction({ ...fight, item: { type: "gear", name: "Torch", system: { heldHands: 1 } } }) === true);
  ok("A8 gear that takes no hand (a backpack): free", hc.heldChangeIsAction({ ...fight, item: { type: "gear", name: "Backpack", system: { heldHands: 0 } } }) === false);
  ok("A9 armour is worn, not held: free here", hc.heldChangeIsAction({ ...fight, item: { type: "armour", name: "Chain Shirt", system: {} } }) === false);
  ok("A10 a Free Hand weapon takes no hand: free", hc.heldChangeIsAction({ ...fight, item: { type: "weapon", name: "Armblade", system: { traits: "Free Hand" } } }) === false);
}

/* B — the draw's update and the line ------------------------------------------ */
{
  equal("B1 a plain draw", hc.drawChanges({ system: {} }), { "system.equipped": true });
  equal("B2 out of the sack", hc.drawChanges({ system: { stowed: true } }), { "system.equipped": true, "system.stowed": false });
  equal("B3 with its grip", hc.drawChanges({ system: {} }, true), { "system.equipped": true, "system.twoHandedGrip": true });
  equal("B4 a one-handed grip is still set", hc.drawChanges({ system: {} }, false), { "system.equipped": true, "system.twoHandedGrip": false });
  ok("B5 the lines", /is drawn, and is now in hand/.test(hc.heldChangeLine("Longsword", true)) && /is put away/.test(hc.heldChangeLine("Longsword", false)));
}

/* C — the workflow ---------------------------------------------------------- */
const wf = read("module", "combat", "held-change-workflow.mjs");
{
  ok("C1 not an action: handed back to change freely", /if \(!isAction\) return \{ handled: false, changed: false \};/.test(wf));
  ok("C2 a GM is asked, and 'just set it' is free",
    /if \(game\.user\?\.isGM\) \{[\s\S]*?if \(how === "set"\) return \{ handled: false, changed: false \};\s*if \(how !== "act"\) return \{ handled: true, changed: false \};/.test(wf));
  ok("C3 a draw is the Interact action, with the draw's update",
    /await resolveAction\(actor, interact, \{ heldChange: \{ item, equip: true, changes: drawChanges\(item, grip\) \} \}\);/.test(wf));
  ok("C4 putting away asks Drop or Sheathe/Stow", /\{ action: "drop", label: "Drop \(Release, free\)" \}/.test(wf) && /\{ action: "sheathe", label: "Sheathe or Stow \(Interact, 1 AP\)", default: true \}/.test(wf));
  ok("C5 a drop is the Release action", /if \(way === "drop"\) \{\s*await resolveAction\(actor, release, \{ heldChange: \{ item, equip: false \} \}\);/.test(wf));
  ok("C6 a sheathe is the Interact action", /else if \(way === "sheathe"\) \{\s*await resolveAction\(actor, interact, \{ heldChange: \{ item, equip: false, changes: \{ "system\.equipped": false \} \} \}\);/.test(wf));
  ok("C7 a cancel changes nothing", /\} else \{\s*return \{ handled: true, changed: false \};\s*\}/.test(wf));
  ok("C8 whether it changed is read from the item afterwards", /changed: Boolean\(actor\.items\.get\(item\.id\)\?\.system\?\.equipped\)/.test(wf) && /changed: !actor\.items\.get\(item\.id\)\?\.system\?\.equipped/.test(wf));
}

/* D — resolveAction ------------------------------------------------------------ */
const aw = read("module", "combat", "action-workflow.mjs");
{
  ok("D1 the option exists", /^\s*heldChange = null,\s*$/m.test(aw));
  ok("D2 Release drops the item chosen, without asking which",
    /if \(action\.key === "release" && heldChange\?\.item\) \{\s*releaseChoice = \{ item: heldChange\.item \};\s*\} else if \(action\.key === "release" && !skipDialog\(event\)\) \{/.test(aw));
  const apply = aw.indexOf('if (action.key === "interact" && heldChange?.item && heldChange.changes) {');
  const paid = aw.indexOf("else await commitActionCost(actor, action, readied, action.apCost, action.name, { traits: action.traits });");
  const gate = aw.indexOf("if (!(await conditionCommitGate(actor, action))) return null;", paid);
  ok("D3 Interact changes the item", apply > 0 && /await heldChange\.item\.update\(heldChange\.changes\);/.test(aw.slice(apply, apply + 400)));
  ok("D4 ...only after it is paid for", paid > 0 && apply > paid);
  ok("D5 ...and after the conditions that forbid it (Grabbed) have had their say", gate > paid && apply > gate);
  ok("D6 ...and the card says what was done", /lines\.push\(line\(heldChangeLine\(heldChange\.item\.name, Boolean\(heldChange\.equip\)\)\)\);/.test(aw.slice(apply, apply + 500)));
  ok("D7 Interact is still a Manipulate action, and is not exempt from provoking", (() => {
    const src = read("module", "data", "basic-actions.mjs");
    const block = src.slice(src.indexOf('key: "interact"'), src.indexOf('key: "prepare"'));
    return /traits: "Manipulate"/.test(block) && !/provokeExempt/.test(block);
  })());
  ok("D8 Release still does not provoke", (() => {
    const src = read("module", "data", "basic-actions.mjs");
    const block = src.slice(src.indexOf('key: "release"'), src.indexOf('key: "release"') + 400);
    return /provokeExempt: true/.test(block);
  })());
}

/* E — the sheets ----------------------------------------------------------- */
{
  const sheet = read("module", "sheets", "actor-sheet.mjs");
  const t = sheet.slice(sheet.indexOf("static async toggleItemEquipped"), sheet.indexOf("static async itemDelete"));
  const routeAt = t.indexOf("const routed = await heldChangeInCombat(this.actor, item, {");
  const handsAt = t.indexOf("const result = canEquip(this.actor, asEquipped);");
  const freeAt = t.indexOf("await item.update(changes);");
  ok("E1 the character sheet asks the workflow, after the grip and the hands", routeAt > handsAt && handsAt > 0);
  ok("E2 ...and changes freely only when it is not an action", /if \(routed\.handled\) \{[\s\S]*?return;\s*\}\s*await item\.update\(changes\);/.test(t) && freeAt > routeAt);
  ok("E3 ...passing the grip chosen", /grip: changes\["system\.twoHandedGrip"\] \?\? null/.test(t));
  const isheet = read("module", "sheets", "item-sheet.mjs");
  const p = isheet.slice(isheet.indexOf("async _processSubmitData"), isheet.indexOf("static DEFAULT_OPTIONS"));
  ok("E4 the item sheet's Equipped box goes the same way in combat",
    /if \(isAction\) \{[\s\S]*?delete submitData\.system\.equipped;[\s\S]*?await super\._processSubmitData\(event, form, submitData, options\);[\s\S]*?const routed = await heldChangeInCombat\(actor, item, \{ equip: wanted \}\);/.test(p));
  ok("E5 ...checks the hands before a draw", /if \(wanted\) \{\s*const \{ canEquip \} = await import\("\.\.\/held-items-workflow\.mjs"\);\s*const hands = canEquip\(actor, item\);\s*if \(!hands\.allowed\) \{/.test(p));
  ok("E6 ...and saves everything else as before", /return super\._processSubmitData\(event, form, submitData, options\);\s*\}$/m.test(p.trimEnd()));
}

console.log(`verify-held-change-3702: ${checks} checks${failures.length ? ` — ${failures.length} FAILED` : " — all green."}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
