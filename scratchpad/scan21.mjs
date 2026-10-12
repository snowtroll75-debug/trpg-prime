import { CRITICAL_TABLES } from "../module/data/critical-tables.mjs";
import { FUMBLE_TABLES } from "../module/data/fumble-tables.mjs";

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
  for (const h of hits) console.log(`${h.table} ${h.range} [${h.p}] ${h.text}`);
};
show("D1 their-next-turn", /\buntil\s+(the\s+)?(beginning|end)\s+of\s+(their|the\s+target's|his|her|its)\s+next\s+turn\b/i);
show("D1b any next turn", /\bnext\s+turn\b/i);
