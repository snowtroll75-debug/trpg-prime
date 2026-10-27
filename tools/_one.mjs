import { ClassicLevel } from "classic-level";
const [,, dir, name] = process.argv;
const db = new ClassicLevel(dir, { valueEncoding: "json" });
for await (const [k, v] of db.iterator()) { if (!k.startsWith("!items!")) continue; if (v.name === name) { const s = { ...v.system }; delete s.description; console.log(JSON.stringify({ name: v.name, system: s, effects: v.effects, flags: v.flags }, null, 1)); } }
await db.close();
