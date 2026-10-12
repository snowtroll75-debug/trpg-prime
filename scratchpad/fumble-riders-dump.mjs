import { FUMBLE_TABLES } from "../module/data/fumble-tables.mjs";
import { fumbleRowRiders, fumbleSaveDC } from "../module/combat/fumble-riders.mjs";
const counts = {};
for (const [table, rows] of Object.entries(FUMBLE_TABLES)) {
  for (const r of rows) {
    const rd = fumbleRowRiders(r);
    const bits = [];
    for (const [k, v] of Object.entries(rd)) {
      if (v === null || v === false || (Array.isArray(v) && !v.length)) continue;
      counts[k] = (counts[k] ?? 0) + 1;
      bits.push(`${k}=${JSON.stringify(v)}`);
    }
    if (bits.length) console.log(`${table} ${String(r.min).padStart(3)}-${String(r.max).padEnd(3)} ${bits.join("  ")}`);
  }
}
console.log("\ncounts:", JSON.stringify(counts));
console.log("fumbleSaveDC(5) =", fumbleSaveDC(5), " (levelDC(5)=19, Hard +2 → 21)");
