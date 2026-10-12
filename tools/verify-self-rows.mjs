#!/usr/bin/env node
/**
 * verify-self-rows — no spell cast on its caster aims a row at nobody.
 *
 * NEW at 3.617.3. Found driving 3.617.2: the rebuilt Mage Armour row had no
 * `target`, so a self spell's empty target list received it — "Mage Armour
 * finds nobody to affect". The same shape, already in the pack for longer:
 * Invisibility and Shield Of Faith. This asks the question of EVERY spell, so
 * the next row written without a target fails here rather than at the table.
 *
 *   A  the rule, run on hand-made spells
 *   B  every spell in the pack
 *   C  the two old ones, their touch warps, and their repairs
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { castOnSelfOnly, rowsThatReachNobody } from "../module/magic/self-rows.mjs";
import { selfRowRecipients } from "../module/magic/spell-degrees.mjs";
import { SELF_ROW_FIXES } from "./author-self-rows.mjs";
import { PACK_REPAIRS } from "../module/data/pack-repairs.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* A — the rule */
{
  ok("A1 no range, no target, no area: cast on the caster",
    castOnSelfOnly({ range: "", targets: "", area: "" }) && castOnSelfOnly({ range: "self" })
    && !castOnSelfOnly({ range: "touch" }) && !castOnSelfOnly({ targets: "1 creature" }) && !castOnSelfOnly({ area: "10-foot radius" }));
  ok("A2 a targets row on such a spell reaches nobody; a self row, a note or a gated row does not count",
    rowsThatReachNobody({ effects: [{ kind: "bonus", target: "targets" }] }).length === 1
    && rowsThatReachNobody({ effects: [{ kind: "spellArmour" }] }).length === 1
    && rowsThatReachNobody({ effects: [{ kind: "bonus", target: "self" }, { kind: "note" }, { kind: "condition", onSave: ["failure"] }] }).length === 0
    && rowsThatReachNobody({ range: "touch", effects: [{ kind: "bonus", target: "targets" }] }).length === 0);
  ok("A3 a self row reaches the caster, and the touch warp moves it to the creature touched",
    selfRowRecipients("C", [], {}).join() === "C" && selfRowRecipients("C", ["T"], { retargetSelfRows: true }).join() === "T");
}

/* B — every spell in the pack */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open({ readOnly: true });
const spells = new Map();
for await (const [key, value] of db.iterator()) if (key.startsWith("!items!")) spells.set(value.name, value);
await db.close();
{
  const nobody = Array.from(spells.values())
    .map((s) => ({ name: s.name, rows: rowsThatReachNobody(s.system) }))
    .filter((s) => s.rows.length)
    .map((s) => `${s.name} (${s.rows.map((r) => r.kind).join(", ")})`);
  ok("B1 NO SELF SPELL AIMS A ROW AT NOBODY", nobody.length === 0, nobody.join("; "));
  ok("B2 and the pack was read", spells.size > 600 && Array.from(spells.values()).filter((s) => castOnSelfOnly(s.system)).length > 50);
}

/* C — the two old ones */
{
  for (const name of ["Invisibility", "Shield Of Faith"]) {
    const sys = spells.get(name)?.system ?? {};
    ok(`C1 ${name}: its rows are the caster's, as written`, JSON.stringify(sys.effects) === JSON.stringify(SELF_ROW_FIXES[name].effects));
    ok(`C2 ${name}: its touch warp moves them to the creature touched`,
      sys.warps?.some((w) => w?.mods?.rangeOverride === "touch" && w?.mods?.retargetSelfRows === true));
    const ids = PACK_REPAIRS.filter((r) => r.name === name && r.since === "3.617.3").map((r) => r.field).sort().join();
    ok(`C3 ${name}: owned copies are repaired, effects and warps`, ids === "effects,warps");
  }
}

if (failures.length) {
  console.log(`verify-self-rows: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-self-rows: OK — ${checks} checks. Every spell cast on its caster lands on its caster.`);
