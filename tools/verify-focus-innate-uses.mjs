#!/usr/bin/env node
/**
 * verify-focus-innate-uses — Graham's two rulings of 17 September 2026.
 *
 *   1. A per-day item ARRIVES FULL. The six core feats with a flat count
 *      are read back out of the compiled feats pack and must carry
 *      usesValue equal to their usesPerDay.
 *   2. A granted Focus innate spell with no printed count is ONE USE per
 *      Refocus. `focusInnateDefaultUses` is pure and driven here; that
 *      `itemUsesMax` consults it and that item creation writes the one
 *      use are structural checks, marked as such.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0; const failures = [];
const ok = (l, c, d = "") => { checks += 1; if (!c) failures.push(`${l}${d ? ` — ${d}` : ""}`); };
const equal = (l, a, e) => ok(l, a === e, `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

const uses = await import(new URL("../module/uses.mjs", import.meta.url));
const f = uses.focusInnateDefaultUses;

equal("A1 innate + Focus + blank count → 1", f({ innate: true, traits: "Divinity, Focus", usesPerDay: "" }), 1);
equal("A2 not innate → null", f({ innate: false, traits: "Focus", usesPerDay: "" }), null);
equal("A3 no Focus trait → null", f({ innate: true, traits: "Divinity", usesPerDay: "" }), null);
equal("A4 a printed count wins → null", f({ innate: true, traits: "Focus", usesPerDay: "2" }), null);
equal("A5 'unlimited' is a printed count → null", f({ innate: true, traits: "Focus", usesPerDay: "unlimited" }), null);
equal("A6 not a spell → null", f({ innate: true, traits: "Focus", usesPerDay: "" }, "feat"), null);
equal("A7 'Focused' is not Focus", f({ innate: true, traits: "Focused", usesPerDay: "" }), null);
equal("A8 case-insensitive", f({ innate: true, traits: "FOCUS", usesPerDay: "" }), 1);
equal("A9 whitespace count is blank", f({ innate: true, traits: "Focus", usesPerDay: "  " }), 1);

const usesWorkflow = read("module/uses-workflow.mjs");
ok("B1 itemUsesMax consults the default before the formula (through focusDefaultUses since 3.665.0, which hands spells to this rule)", /const focusDefault = focusDefaultUses\(owner\.system, owner\.type\);\s*if \(focusDefault !== null\) return focusDefault/.test(usesWorkflow));
const item = read("module/documents/item.mjs");
// Re-anchored at 3.667.1: the one use plus any declared extra uses.
ok("B2 item creation writes the one use when the rule applies", /focusDefaultUses\(\{ \.\.\.this\.system, traits: traits \?\? this\.system\?\.traits \}, this\.type\)[\s\S]{0,800}const full = focusUses \+ extra;[\s\S]{0,120}"system\.usesValue": full/.test(item));
ok("B3 …only when the stored value is below it", /Number\(this\.system\?\.usesValue \?\? 0\) < full\)/.test(item));
ok("B4 the innate cast branch tracks through itemUsesMax", /const innateUsesMax = isInnate \? itemUsesMax\(spell\) : null;/.test(read("module/magic/cast-workflow.mjs")));
ok("B5 Refocus's candidate list reads the same maximum", /const max = itemUsesMax\(item\);/.test(read("module/combat/refocus-workflow.mjs")));

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "feats"), { valueEncoding: "json" });
const perDay = [];
for await (const [key, value] of db.iterator()) {
  if (!key.startsWith("!items!")) continue;
  const per = Number(String(value.system?.usesPerDay ?? "").trim());
  if (Number.isFinite(per) && per > 0) perDay.push({ name: value.name, per, value: Number(value.system?.usesValue ?? 0) });
}
await db.close();
ok("C1 the pack has per-day feats to check", perDay.length >= 6, String(perDay.length));
for (const row of perDay) equal(`C2 ${row.name} arrives full`, row.value, row.per);
const fixes = JSON.parse(read("tools/data-fixes.json")).fixes;
equal("C3 the six arrive-full fixes are declared", fixes.filter((x) => String(x.id).startsWith("arrive-full-")).length, 6);

const EXPECTED = 23;
equal("Z1 the suite ran every check", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-focus-innate-uses: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-focus-innate-uses: ${checks} checks — all green.`);
