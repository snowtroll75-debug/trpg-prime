import { ClassicLevel } from "classic-level";
import fs from "node:fs";
let n = 0;
for (const pack of fs.readdirSync("packs")) {
  const db = new ClassicLevel(`packs/${pack}`, { valueEncoding: "json", readOnly: true });
  try {
    for await (const [k, v] of db.iterator()) {
      const walk = (o) => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (o && typeof o === "object") {
          if (o.kind === "condition" && "duration" in o) { n++; if (n < 6) console.log(pack, v?.name, o.duration); }
          for (const x of Object.values(o)) walk(x);
        }
      };
      walk(v);
    }
  } finally { await db.close(); }
}
console.log("total", n);
