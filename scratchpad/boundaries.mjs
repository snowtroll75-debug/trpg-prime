// Resolve every dynamic import in the block-21 files and ask the target
// file whether it really exports that name. The F2 pin, run by hand.
import fs from "node:fs";
import path from "node:path";
const FILES = [
  "module/combat/critical-durations.mjs","module/combat/critical-riders.mjs",
  "module/combat/linked-conditions-workflow.mjs","module/combat/critical-ap-watch.mjs",
  "module/magic/casting-restriction-workflow.mjs","module/combat/effect-application-workflow.mjs",
  "module/effect-parser.mjs","module/combat/attack-workflow.mjs",
  "module/dice/check-card-interactions.mjs","module/magic/cast-workflow.mjs",
  "module/combat/action-points-workflow.mjs","scripts/trg-prime.mjs"
];
const root = path.resolve(".");
let bad = 0, checked = 0;
const exportsOf = (file) => {
  const src = fs.readFileSync(file, "utf8");
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of m[1].split(",")) {
      const as = part.split(/\s+as\s+/i);
      const n = (as[1] ?? as[0]).trim(); if (n) names.add(n);
    }
  return names;
};
for (const rel of FILES) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  const pattern = /(?:const|let)\s*\{([^}]+)\}\s*=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/g;
  const statics = /import\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g;
  for (const pat of [pattern, statics]) {
    let m;
    while ((m = pat.exec(src))) {
      const target = path.resolve(path.dirname(path.join(root, rel)), m[2]);
      if (!fs.existsSync(target)) { console.log(`MISSING FILE  ${rel} -> ${m[2]}`); bad++; continue; }
      const have = exportsOf(target);
      for (const raw of m[1].split(",")) {
        const name = raw.split(/\s+as\s+|:/i)[0].trim();
        if (!name) continue;
        checked++;
        if (!have.has(name)) { console.log(`MISSING EXPORT  ${rel}: "${name}" is not exported by ${m[2]}`); bad++; }
      }
    }
  }
}
console.log(`\n${checked} named imports resolved, ${bad} bad.`);
process.exit(bad ? 1 : 0);
