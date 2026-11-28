#!/usr/bin/env node
/**
 * verify-fixes-3718-3 — the pack-copy matcher and empty schema defaults.
 *
 * Found in the 3.718.2 live migration: "ZZ SW Wizard — Shock Bolt: damage …
 * left alone" on a copy identical to the pack. Foundry's data model had since
 * given `damage` a `persistentOn: ""` default; the copy carried it and the
 * manifest's `from`/`to` (older than the field) did not, so the copy matched
 * neither. A copy that WAS stale would never have been repaired.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { classifyRepairs, repairUpdate } from "../module/pack-repair.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const entry = {
  id: "shock", field: "damage", since: "3.608.0",
  from: { formula: "2d12", type: "electricity", persistent: "" },
  to: { formula: "2d12", type: "electricity", persistent: "", critSplash: { fraction: 0.5 } }
};
const state = (own) => classifyRepairs({ damage: own }, [entry])[0].state;

ok("A1 the current value with a schema default reads current",
  state({ formula: "2d12", type: "electricity", persistent: "", persistentOn: "", critSplash: { fraction: 0.5 } }) === "current");
ok("A2 the stale value with a schema default reads stale",
  state({ formula: "2d12", type: "electricity", persistent: "", persistentOn: "" }) === "stale");
ok("A3 …and is repaired", JSON.stringify(repairUpdate(classifyRepairs({ damage: { formula: "2d12", type: "electricity", persistent: "", persistentOn: "" } }, [entry])))
  === JSON.stringify({ "system.damage": entry.to }));
ok("A4 a filled-in extra key is somebody's edit", state({ formula: "2d12", type: "electricity", persistent: "", persistentOn: "crit" }) === "custom");
ok("A5 a false is a value, not a default", state({ formula: "2d12", type: "electricity", persistent: "", flag: false }) === "custom");
ok("A6 a 0 is a value, not a default", state({ formula: "2d12", type: "electricity", persistent: "", count: 0 }) === "custom");
ok("A7 null, an empty list and an empty object are defaults",
  state({ formula: "2d12", type: "electricity", persistent: "", a: null, b: [], c: {} }) === "stale");
ok("A8 a key the copy LACKS that the manifest has empty still matches",
  classifyRepairs({ damage: { formula: "2d12", type: "electricity" } }, [entry])[0].state === "stale");
ok("A9 key order still does not matter",
  state({ critSplash: { fraction: 0.5 }, persistent: "", type: "electricity", formula: "2d12" }) === "current");
ok("A10 inside a list, too",
  classifyRepairs({ effects: [{ kind: "note", text: "x", extra: "" }] }, [{ id: "e", field: "effects", from: [{ kind: "note", text: "x" }], to: [] }])[0].state === "stale");
ok("A12 a shared key that differs is somebody's edit", state({ formula: "3d12", type: "electricity", persistent: "", persistentOn: "" }) === "custom");
const mig = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "migration.mjs"), "utf8");
ok("A11 the pass is re-gated so every world reads its copies again", /runIf\("3\.718\.3", "stale owned copies of repaired pack items"/.test(mig));

if (failures.length) {
  process.stderr.write(`verify-fixes-3718-3: FAILED ${failures.length} of ${checks}\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write(`verify-fixes-3718-3: OK — ${checks} checks.\n`);
