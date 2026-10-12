import { CRITICAL_TABLES } from "../module/data/critical-tables.mjs";
const all = [];
for (const [t, rows] of Object.entries(CRITICAL_TABLES)) {
  for (const r of rows) {
    const texts = [r.effect, ...(r.armourClauses ?? []).map(c => `[${c.kind}] ${c.text}`)];
    all.push({ table: t, range: `${r.min}-${r.max}`, p: r.persistence, text: texts.join(" || ") });
  }
}
const show = (label, re) => {
  const hits = all.filter(r => re.test(r.text));
  console.log(`\n### ${label} — ${hits.length}`);
  for (const h of hits) console.log(`  ${h.table} ${h.range} [${h.p}] ${h.text}`);
};
show("D2 until-X-stops/ends", /\buntil\s+(the\s+)?(bleed\w*|damage|recurring\w*)\s+(stops|ends)/i);
show("D2b when-X-ends", /\bwhen\s+(the\s+)?\w+\s+(ends|stops)/i);
show("D10 for-N-minutes/hours", /\bfor\s+\d+(d\d+)?\s*(minute|hour|day)/i);
show("conditional or-be/or-fall/to-avoid", /\b(or\s+(be|fall|become|they|suffer|gain|is|are)|to\s+avoid)\b/i);
