#!/usr/bin/env node
/**
 * One-shot: Graham's rulings on the 3.697.0 audit, the pack half.
 *
 *   - Flame Blade (rules audit R3): "Should have no range or targets." The
 *     printed "Range 30 feet; Targets 1 creature" made the cast ask for a
 *     target 30 feet away for a blade that "springs forth from your hand".
 *
 * Declared old → new in tools/data-fixes.json and module/data/pack-repairs.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

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
  }
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
  const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let added = 0;
  for (const fix of AUDIT_3698_FIXES) {
    if (file.fixes.some((f) => f.id === fix.id)) continue;
    file.fixes.push({ ...fix, declaredAt: "2026-11-18", systemVersion: "3.698.0" });
    added += 1;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
  process.stdout.write(`declare-audit-3698: ${added} declared, ${file.fixes.length} total.\n`);
}
