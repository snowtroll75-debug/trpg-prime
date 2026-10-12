import { ClassicLevel } from "classic-level";
const [,, pack, filter] = process.argv;
const db = new ClassicLevel(`packs/${pack}`, { valueEncoding: "json" });
const out = [];
for await (const [k, v] of db.iterator()) { if (!k.startsWith("!items!")) continue; if (filter && !new RegExp(filter, "i").test(v.name)) continue; out.push(v); }
console.log(JSON.stringify(out, null, 1)); await db.close();
