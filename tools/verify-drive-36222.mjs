#!/usr/bin/env node
/**
 * verify-drive-36222 — the 3.622.2 drive's finding, 3.622.3.
 *
 * Graham's ruling of 5 October 2026 (R1, "your recommendation") on
 * claude/live-testing-report-3.622.2.md: a creature's own token, never the
 * first token whose actor shares its id. Two unlinked copies of one actor
 * share that id, so Fairy Fire drew U's circle on F — and, now that circles
 * follow, followed F.
 *
 *   A  the circle is drawn on, and anchored to, the target's own token (run)
 *   B  no lookup by actor id is left, and the five sites ask `activeToken`
 *   C  the version
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const LSW = await import("../module/magic/light-shift-workflow.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* A — the circle, driven */
{
  // F and U: two unlinked copies of one actor. Same actor id, own tokens.
  const tokenF = { id: "tokF", center: { x: 650, y: 550 } };
  const tokenU = { id: "tokU", center: { x: 1250, y: 550 } };
  const actorF = { id: "plainFoe", name: "F", getActiveTokens: () => [tokenF] };
  const actorU = { id: "plainFoe", name: "U", getActiveTokens: () => [tokenU] };
  tokenF.actor = actorF;
  tokenU.actor = actorU;
  let created = null;
  globalThis.CONST = { REGION_VISIBILITY: { ALWAYS: 2 } };
  globalThis.game = { time: { worldTime: 1000 }, combat: null };
  globalThis.canvas = {
    dimensions: { size: 100, distance: 5, width: 3000, height: 2000 },
    tokens: { placeables: [tokenF, tokenU] },
    scene: { createEmbeddedDocuments: async (_t, docs) => { created = docs[0]; return [{ id: "r1" }]; } }
  };
  const spec = { steps: 1, floor: 1, cap: 8, radiusFeet: 5, follows: true, droppable: false };
  const id = await LSW.createLightShiftRegion({ name: "W" }, actorU, { name: "Fairy Fire" }, spec, { castId: "c1", parsedDuration: { seconds: 600 } });
  const shape = created?.shapes?.[0];
  ok("A1 THE OLD DEFECT, cured: U's circle is drawn on U, not on F (the first token sharing its actor's id)",
    id === "r1" && shape?.x === 1250 && shape?.y === 550, JSON.stringify(shape));
  ok("A2 and it follows U",
    created?.flags?.["trg-prime"]?.lightShiftAnchor === "tokU", JSON.stringify(created?.flags));
}

/* B — every site */
{
  const sites = [
    ["module", "magic", "light-shift-workflow.mjs", /const token = activeToken\(target\);/],
    ["module", "magic", "cast-workflow.mjs", /const casterToken = activeToken\(actor\);/],
    ["module", "combat", "targeting.mjs", /const actorToken = activeToken\(actor\);/],
    ["module", "combat", "aid-bonus.mjs", /const actorToken = activeToken\(actor\);/],
    ["module", "skills.mjs", /const myToken = activeToken\(actor\);/]
  ];
  for (const site of sites) {
    const re = site.pop();
    const src = strip(read(...site));
    ok(`B1 ${site.join("/")} asks for the creature's own token`,
      re.test(src) && /import \{[^}]*\bactiveToken\b[^}]*\} from "[./]*(combat\/)?geometry\.mjs";/.test(src));
  }
  // B2 NONE LEFT ANYWHERE. Walked over every module file, so a sixth copy
  // written later fails here rather than in a drive.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".mjs")) {
        const src = strip(fs.readFileSync(full, "utf8"));
        if (/\.find\(\(t\) => t\.actor\?\.id === (actor|target\?)\.id\)/.test(src)) offenders.push(path.relative(SYSTEM_ROOT, full));
      }
    }
  };
  walk(path.join(SYSTEM_ROOT, "module"));
  ok("B2 no token is found by its actor's id anywhere in the system", offenders.length === 0, offenders.join(", "));
  const geometry = strip(read("module", "combat", "geometry.mjs"));
  ok("B3 and the helper names the creature's own token",
    /return actor\?\.getActiveTokens\?\.\(\)\?\.\[0\] \?\? null;/.test(geometry));
}

/* C — the version */
{
  const sys = JSON.parse(read("system.json"));
  ok("C1 the version is 3.622.3 or later", String(sys.version).localeCompare("3.622.3", undefined, { numeric: true }) >= 0);
}

if (failures.length) {
  console.log(`verify-drive-36222: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-drive-36222: OK — ${checks} checks. A creature's own token, never the first token sharing its actor's id.`);
