import { ClassicLevel } from "classic-level";
const [,, dir, pat, max] = process.argv;
const db = new ClassicLevel(dir, { valueEncoding: "json" });
let n = 0; const types = {};
for await (const [k, v] of db.iterator()) { if (!k.startsWith("!items!")) continue; types[v.type] = (types[v.type] ?? 0) + 1; if (pat && new RegExp(pat, "i").test(v.name) && n < Number(max ?? 3)) { n++; console.log(JSON.stringify({ name: v.name, type: v.type, img: v.img, system: v.system, flags: v.flags }).slice(0, 2500)); } }
console.log(JSON.stringify(types));
await db.close();
