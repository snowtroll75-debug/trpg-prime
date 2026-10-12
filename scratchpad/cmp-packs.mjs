import { ClassicLevel } from "classic-level";
import fs from "node:fs";
const [a, b] = process.argv.slice(2);
let diffs = 0, packs = 0;
async function load(dir) { const db = new ClassicLevel(dir, { valueEncoding: "json", readOnly: true }); const m = new Map(); for await (const [k, v] of db.iterator()) m.set(k, JSON.stringify(v)); await db.close(); return m; }
for (const p of fs.readdirSync(a)) {
  if (!fs.existsSync(`${b}/${p}`)) { console.log("missing", p); diffs++; continue; }
  const x = await load(`${a}/${p}`), y = await load(`${b}/${p}`); packs++;
  if (x.size !== y.size) { console.log(p, "size", x.size, y.size); diffs++; continue; }
  for (const [k, v] of x) if (y.get(k) !== v) { console.log(p, "differs at", k); diffs++; break; }
}
console.log(`compared ${packs} packs, ${diffs} differ`);
