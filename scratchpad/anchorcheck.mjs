// Do every mutation anchor across the whole corpus still MATCH the tree?
// Cheap: string search, no check runs. Catches the stale-anchor shape
// without paying for 174 runners.
import fs from "node:fs";
import path from "node:path";
const dir = "tools";
let missing = 0, total = 0;
for (const f of fs.readdirSync(dir).filter(n => n.startsWith("mutate-") && n.endsWith(".mjs"))) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  // pull { file: X, ... from: "..." } pairs by evaluating the module's MUTATIONS
  let mod;
  try { mod = await import(path.resolve(dir, f) + "?probe=1"); } catch { continue; }
}
