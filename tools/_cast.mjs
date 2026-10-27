import { ClassicLevel } from "classic-level";
const db = new ClassicLevel(process.argv[2], { valueEncoding: "json" });
const seen = {};
for await (const [k, v] of db.iterator()) { if (!k.startsWith("!items!")) continue; const c = JSON.stringify(v.system.castAP) + "|" + (v.system.castTime ?? ""); seen[c] = seen[c] ?? []; if (seen[c].length < 3) seen[c].push(v.name); }
console.log(JSON.stringify(seen, null, 0).slice(0, 2000));
await db.close();
