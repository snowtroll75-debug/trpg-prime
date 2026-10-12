import { CRITICAL_TABLES } from "../module/data/critical-tables.mjs";
import { criticalRowRiders } from "../module/combat/critical-riders.mjs";
import { durationAfter } from "../module/combat/critical-durations.mjs";
const fmt = (d) => d === null ? "none" : d.kind === "rounds" ? `${d.rounds}r` : d.kind === "linked" ? `~${d.to}` : `${d.formula} ${d.unit}`;
const counts = {};
for (const [t, rows] of Object.entries(CRITICAL_TABLES)) {
  for (const r of rows) {
    const rd = criticalRowRiders(r, (r.armourClauses ?? []).map(c => c.text).join(" "));
    const bits = [];
    if (rd.save) { counts.save = (counts.save??0)+1; bits.push(`save=${JSON.stringify(rd.save)}`); }
    if (rd.escape) { counts.escape=(counts.escape??0)+1; bits.push(`escape=${JSON.stringify(rd.escape)}`); }
    if (rd.apWatch) { counts.apWatch=(counts.apWatch??0)+1; bits.push(`apWatch=${JSON.stringify(rd.apWatch)}`); }
    if (rd.ppDrain) { counts.ppDrain=(counts.ppDrain??0)+1; bits.push(`ppDrain=${rd.ppDrain}`); }
    if (rd.lockout) { counts.lockout=(counts.lockout??0)+1; bits.push(`lockout=${rd.lockout.scope}/${rd.lockout.persistence ?? "-"}/dur=${fmt(durationAfter(r.effect, rd.lockout.index))}`); }
    if (rd.concentration) { counts.conc=(counts.conc??0)+1; bits.push(`conc=${JSON.stringify(rd.concentration)}`); }
    if (bits.length) console.log(`${t} ${r.min}-${r.max}  ${bits.join("  ")}`);
  }
}
console.log("\n", counts);
