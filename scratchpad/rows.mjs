import { CRITICAL_TABLES } from "../module/data/critical-tables.mjs";
const want = [["aligned",19],["force",96],["force",39],["cold",90],["cold",51],["sonic",90],["mental",60],["mental",64],["poison",60],["subdual",96],["acid",96],["acid",67],["acid",31],["aligned",57],["piercing",50],["slashing",70],["piercing",71],["essence",59]];
for (const [t,n] of want) {
  const r = (CRITICAL_TABLES[t]||[]).find(r=>n>=r.min&&n<=r.max);
  console.log(`\n--- ${t} ${n} [${r?.persistence}]\n${r?.effect}`);
  for (const c of r?.armourClauses ?? []) console.log(`    <${c.kind}> ${c.text}`);
}
