import { CRITICAL_TABLES } from "../module/data/critical-tables.mjs";
import { scopedConditionDurations, followOnClauses } from "../module/combat/critical-durations.mjs";
const fmt = (d) => d === null ? "-" : d.kind === "rounds" ? `${d.rounds ?? "?"}r${d.seconds ? "/" + d.seconds + "s" : ""}` : d.kind === "linked" ? `~${d.to}` : `${d.formula} ${d.unit}`;
let timed = 0, linked = 0, follows = 0;
for (const [t, rows] of Object.entries(CRITICAL_TABLES)) {
  for (const r of rows) {
    const scoped = scopedConditionDurations(r.effect);
    const fo = followOnClauses(r.effect);
    const withDur = scoped.filter(s => s.duration);
    if (!withDur.length && !fo.length) continue;
    for (const s of withDur) { if (s.duration.kind === "linked") linked++; else timed++; }
    follows += fo.length;
    console.log(`${t} ${r.min}-${r.max} [${r.persistence}]  ${scoped.map(s => `${s.key}${s.value===null?"":":"+s.value}=${fmt(s.duration)}`).join("  ")}${fo.length ? "   FOLLOW: " + fo.map(f=>`${f.tags.map(x=>x.key+(x.value===null?"":":"+x.value)).join("+")} after ${f.after} ${fmt(f.duration)}`).join("; ") : ""}`);
  }
}
console.log(`\ntimed=${timed} linked=${linked} followOns=${follows}`);
