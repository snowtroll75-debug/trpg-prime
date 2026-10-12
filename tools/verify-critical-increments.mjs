#!/usr/bin/env node
/**
 * verify-critical-increments — an armour clause that RAISES a condition.
 *
 * NEW at 3.608.3. Graham, 30 September 2026: "the +1 on electricity
 * criticals for metal armour need adding in." Found on the 3.608.1 live
 * drive: five Electricity rows print a metal clause "Recurring +1",
 * "Stunned +1" or "Injured +1", and the clause reader applied none of them
 * — one (row 59) because its clause had been transcribed inside the row's
 * own text, where no clause reader looks.
 *
 *   A  the reader: what counts as a raise and what does not
 *   B  the five rows, read for leather, metal and nothing
 *   C  every clause in every table: no "+N" on a condition left unread, and
 *      no clause text left inside a row's effect
 */

import { CRITICAL_TABLES } from "../module/data/critical-tables.mjs";
import { extractIncreasedConditions, resolveEffectiveConditions } from "../module/effect-parser.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const eq = (label, actual, expected) =>
  ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

/* A. the reader */
eq("A1 Recurring +1 is a raise of one", extractIncreasedConditions("Recurring +1.").map((i) => `${i.key}${i.delta}`), ["recurring1"]);
eq("A2 Stunned +2 is a raise of two", extractIncreasedConditions("Stunned +2.").map((i) => `${i.key}${i.delta}`), ["stunned2"]);
eq("A3 a damage bonus after a condition is not a raise",
  extractIncreasedConditions("Bleeding 1 +2 base damage."), []);
eq("A3b nor a bare damage bonus", extractIncreasedConditions("+5 base damage & Injured 1."), []);
eq("A4 a plain value is not a raise", extractIncreasedConditions("Stunned 1."), []);
eq("A5 a raise of nothing is not a raise", extractIncreasedConditions("Stunned +0."), []);

/* B. the five rows */
const rows = (t) => CRITICAL_TABLES[t]?.rows ?? CRITICAL_TABLES[t] ?? [];
const rowOf = (t, n) => rows(t).find((r) => r.min <= n && r.max >= n);
const LEATHER = { armoured: true, rigid: false, metal: false };
const METAL = { armoured: true, rigid: false, metal: true };
const BARE = { armoured: false, rigid: false, metal: false };
const read = (n, armour) => resolveEffectiveConditions(rowOf("electricity", n), armour).map((t) => `${t.key}${t.value ?? ""}`);
const EXPECT = {
  50: { plain: ["recurring2", "stunned1"], metal: ["recurring3", "stunned1"] },
  59: { plain: ["recurring3", "stunned2"], metal: ["recurring3", "stunned3"] },
  67: { plain: ["injured1"], metal: ["injured2"] },
  79: { plain: ["recurring3", "slowed1"], metal: ["recurring4", "slowed1"] },
  89: { plain: ["injured2"], metal: ["injured3"] }
};
for (const [n, want] of Object.entries(EXPECT)) {
  eq(`B${n} metal armour takes the raise`, read(Number(n), METAL), want.metal);
  eq(`B${n}b leather does not`, read(Number(n), LEATHER), want.plain);
  eq(`B${n}c nor does no armour`, read(Number(n), BARE), want.plain);
}
eq("B59d row 59's clause is a clause now, not row text",
  (rowOf("electricity", 59)?.armourClauses ?? []).map((c) => `${c.kind}:${c.text}`), ["metal:Stunned +1."]);

/* C. every table */
const unread = [];
const inline = [];
for (const [table, tab] of Object.entries(CRITICAL_TABLES)) {
  for (const row of rows(table)) {
    if (/\b(metal|rigid)?\s*armou?r(ed)?\s*:/i.test(row.effect ?? "")) inline.push(`${table} ${row.min}`);
    for (const clause of row.armourClauses ?? []) {
      const raises = extractIncreasedConditions(clause.text);
      if (!raises.length) continue;
      const armour = { armoured: true, rigid: clause.kind === "rigid", metal: clause.kind === "metal" };
      const before = new Map(resolveEffectiveConditions({ effect: row.effect }, armour).map((t) => [t.key, t.value ?? 0]));
      const after = new Map(resolveEffectiveConditions(row, armour).map((t) => [t.key, t.value ?? 0]));
      for (const r of raises) {
        if ((after.get(r.key) ?? 0) !== (before.get(r.key) ?? 0) + r.delta) unread.push(`${table} ${row.min} ${r.key}`);
      }
    }
  }
}
eq("C1 every raise in every table is applied", unread, []);
eq("C2 no armour clause is left inside a row's own text", inline, []);

if (failures.length) {
  console.log(`verify-critical-increments: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-critical-increments: OK — ${checks} checks. Metal armour now takes the +1 the Electricity table prints.`);
