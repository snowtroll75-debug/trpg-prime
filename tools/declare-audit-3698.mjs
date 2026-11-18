#!/usr/bin/env node
/**
 * One-shot: Graham's rulings on the 3.697.0 audit, the pack half.
 *
 *   - Flame Blade (rules audit R3): "Should have no range or targets." The
 *     printed "Range 30 feet; Targets 1 creature" made the cast ask for a
 *     target 30 feet away for a blade that "springs forth from your hand".
 *
 *   - Flame Blade's blade (U12, 3.698.1): "Flame Blade is fire." A conjured
 *     Scimitar in the caster's hand, dealing fire (so its criticals are fire
 *     criticals), attacking with Spellcraft at -2.
 *
 * Declared old → new in tools/data-fixes.json and module/data/pack-repairs.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

/** The blade as 3.698.1 shipped it, before "the caster is always proficient". */
export const FLAME_BLADE_ROW_3698_1 = Object.freeze({
  kind: "conjuredWeapon", label: "Flame Blade", target: "self",
  categories: ["Martial"], weapons: ["Scimitar"], hands: 1, melee: true,
  damageType: "fire", attackBase: "spellcraft", attackAdjust: -2
});

/** The blade: "as if it were a scimitar using your Spellcraft bonus at -2 for your AB and inflicting fire criticals." */
export const FLAME_BLADE_ROW = Object.freeze({
  kind: "conjuredWeapon", label: "Flame Blade", target: "self",
  categories: ["Martial"], weapons: ["Scimitar"], hands: 1, melee: true,
  damageType: "fire", attackBase: "spellcraft", attackAdjust: -2,
  casterProficient: true
});

export const AUDIT_3698_FIXES = Object.freeze([
  {
    id: "audit3698-flame-blade-range", pack: "spells", name: "Flame Blade", path: "system.range",
    from: "30 feet", to: "",
    reason: "Graham, 18 Nov 2026 (rules audit R3): Flame Blade has no range. The blade springs from the caster's hand."
  },
  {
    id: "audit3698-flame-blade-targets", pack: "spells", name: "Flame Blade", path: "system.targets",
    from: "1 creature", to: "",
    reason: "Graham, 18 Nov 2026 (rules audit R3): Flame Blade has no targets. With one, the cast asked the caster to pick a creature for a blade they hold."
  },
  {
    id: "audit3698-flame-blade-effects", pack: "spells", name: "Flame Blade", path: "system.effects",
    from: [],
    to: [FLAME_BLADE_ROW_3698_1],
    // The owned-copy repair is ONE entry for the field (pack-repair.mjs):
    // its `to` is the final row, and this row is its `alsoFrom`.
    repair: { to: [FLAME_BLADE_ROW], since: "3.698.2" },
    reason: "Graham, 18 Nov 2026 (U12): \"Flame Blade is fire.\" The spell had no rows, so the blade was played from the card. Now a conjured Scimitar, fire damage and fire criticals, attacking with Spellcraft at -2, gone when the spell ends.",
    systemVersion: "3.698.1"
  },
  {
    id: "audit3698-flame-blade-proficient", pack: "spells", name: "Flame Blade", path: "system.effects",
    from: [FLAME_BLADE_ROW_3698_1],
    to: [FLAME_BLADE_ROW],
    repair: { id: "audit3698-flame-blade-effects", alsoFrom: true },
    reason: "Graham, 18 Nov 2026: \"Flame blade does not need martial proficiency. The caster is always proficient.\"",
    systemVersion: "3.698.2"
  }
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
  const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let added = 0;
  for (const fix of AUDIT_3698_FIXES) {
    if (file.fixes.some((f) => f.id === fix.id)) continue;
    { const { repair, ...entry } = fix; file.fixes.push({ declaredAt: "2026-11-18", systemVersion: "3.698.0", ...entry }); }
    added += 1;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
  process.stdout.write(`declare-audit-3698: ${added} declared, ${file.fixes.length} total.\n`);
}
