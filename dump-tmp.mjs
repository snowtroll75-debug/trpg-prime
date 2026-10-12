import { ClassicLevel } from "classic-level";
const [pack, ...terms] = process.argv.slice(2);
const db = new ClassicLevel(`packs/${pack}`, { valueEncoding: "json" });
for await (const [k, v] of db.iterator()) {
  if (!k.startsWith("!")) continue;
  const name = String(v?.name ?? "");
  if (terms.length && !terms.some(t => name.toLowerCase() === t.toLowerCase())) continue;
  console.log(JSON.stringify({ name: v.name, duration: v.system?.duration, sustained: v.system?.sustained, sustainType: v.system?.sustainType }));
}
await db.close();
