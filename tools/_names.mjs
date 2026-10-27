import { ClassicLevel } from "classic-level";
const [,, dir] = process.argv;
const db = new ClassicLevel(dir, { valueEncoding: "json" });
for await (const [k, v] of db.iterator()) { if (!k.startsWith("!items!")) continue; console.log([v.name, v.type, v.system?.ppCost ?? v.system?.level ?? "", v.system?.tradition ?? "", v.system?.traits ?? ""].join("\t")); }
await db.close();
