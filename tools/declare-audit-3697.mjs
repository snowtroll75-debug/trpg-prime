#!/usr/bin/env node
/**
 * One-shot: the 3.697.0 core automation audit's pack corrections.
 *
 * Three spells whose printed effect has a rail in this system and whose pack
 * entry used none of them, found by tools/audit-inventory.mjs (no mechanism
 * of any kind) and confirmed against each spell's own text in the pack:
 *
 *   - Changing Lungs: "You can breathe freely when underwater ..." — the
 *     same rule Water Breathing automates with the waterBreathing marker
 *     (3.617.0), which the drowning workflow reads. Changing Lungs never
 *     used it, so its caster still drowned.
 *   - Long Arm: "+5 feet reach" — the new longArm marker, read where actor
 *     preparation sets reach.
 *   - Inner Focus: "no penalty for not using your Spell Focus item" — the
 *     new innerFocus marker, read by the casting focus rules.
 *
 * Each is declared old → new in tools/data-fixes.json (applied to the pack
 * by apply-data-fixes.mjs) and in module/data/pack-repairs.mjs (applied to
 * owned copies in a world), as the pack-repairs header requires.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const VERSION = "3.697.0";
const TODAY = "2026-11-17";

export const AUDIT_3697_FIXES = Object.freeze([
  {
    id: "audit3697-changing-lungs-effects", pack: "spells", name: "Changing Lungs", path: "system.effects",
    from: [],
    to: [
      { kind: "marker", target: "self", marker: "waterBreathing" },
      { kind: "note", text: "You also breathe freely in a poisonous or toxic atmosphere: an inhaled poison or a toxic air hazard does not affect your breathing while the spell lasts (applied by the GM)." }
    ],
    reason: "\"You can breathe freely when underwater ...\" The pack carried no rows, so the caster's breath clock still started and they drowned. Water Breathing's waterBreathing marker (3.617.0) is the same rule and the drowning workflow already reads it. The toxic-atmosphere half has no rail and is a note (3.697.0 audit)."
  },
  {
    id: "audit3697-long-arm-effects", pack: "spells", name: "Long Arm", path: "system.effects",
    from: [],
    to: [{ kind: "marker", target: "self", marker: "longArm" }],
    reason: "\"Your arms temporarily grow in length, increasing your reach with those limbs by 5 feet.\" No rows, and no rail: reach was set from size after effects. The new longArm marker is read on that line (3.697.0 audit)."
  },
  {
    id: "audit3697-inner-focus-effects", pack: "spells", name: "Inner Focus", path: "system.effects",
    from: [],
    to: [{ kind: "marker", target: "self", marker: "innerFocus" }],
    reason: "\"You do not need to provide focus spell components and take no penalty for not using your Spell Focus item.\" No rows, so a focus caster without the focus still took -2 and +10 on the fumble. The innerFocus marker waives both; no +1 is given, as no focus is held (3.697.0 audit; see TRG_CORE_RULES_AUDIT.md R2)."
  }
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
  const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let added = 0;
  for (const fix of AUDIT_3697_FIXES) {
    if (file.fixes.some((f) => f.id === fix.id)) continue;
    file.fixes.push({ ...fix, declaredAt: TODAY, systemVersion: VERSION });
    added += 1;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
  process.stdout.write(`declare-audit-3697: ${added} declared, ${file.fixes.length} total.\n`);
}
