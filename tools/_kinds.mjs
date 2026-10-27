import { ClassicLevel } from "classic-level";
const [,, dir, ...kinds] = process.argv;
const db = new ClassicLevel(dir, { valueEncoding: "json" });
const seen = {};
for await (const [k, v] of db.iterator()) { if (!k.startsWith("!items!")) continue;
  for (const e of v.system?.effects ?? []) { if (!kinds.includes(e.kind)) continue; seen[e.kind] = seen[e.kind] ?? []; if (seen[e.kind].length < 3) seen[e.kind].push({ spell: v.name, area: v.system.area, duration: v.system.duration, sustained: v.system.sustained, e }); } }
for (const [k, list] of Object.entries(seen)) { console.log("##", k); for (const x of list) console.log(JSON.stringify(x).slice(0, 700)); }
await db.close();
