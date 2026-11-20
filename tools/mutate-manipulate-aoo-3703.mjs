#!/usr/bin/env node
/** mutate-manipulate-aoo-3703 — the mutation half of verify-manipulate-aoo-3703 (the Manipulate Attack of Opportunity when the action is taken). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AW = M("combat", "action-workflow.mjs");
const MUTATIONS = [
  { name: "A the early offer is back", file: AW, from: "  // THE MANIPULATE ATTACK OF OPPORTUNITY IS OFFERED WHEN THE ACTION IS TAKEN\n", to: "  provokeIfManipulate(actor, action);\n  // THE MANIPULATE ATTACK OF OPPORTUNITY IS OFFERED WHEN THE ACTION IS TAKEN\n  import(\"./opportunity.mjs\").then((m) => m.detectStationaryAoO(actor, \"manipulate\")).catch(() => {});\n" },
  { name: "B basicActionTaken never offers it", file: AW, from: "  provokeIfManipulate(actor, action);\n  return lapseNextActionLeg(", to: "  return lapseNextActionLeg(" },
  { name: "B an exempt action provokes", file: AW, from: "    !action.provokeExempt &&\n    action.key !== \"attackOfOpportunity\" &&\n    game.combat?.started\n  ) {\n    import(\"./opportunity.mjs\")", to: "    action.key !== \"attackOfOpportunity\" &&\n    game.combat?.started\n  ) {\n    import(\"./opportunity.mjs\")" },
  { name: "B out of combat too", file: AW, from: "    action.key !== \"attackOfOpportunity\" &&\n    game.combat?.started\n  ) {\n    import(\"./opportunity.mjs\")", to: "    action.key !== \"attackOfOpportunity\"\n  ) {\n    import(\"./opportunity.mjs\")" },
  { name: "C the first prepared payment stays silent", file: AW, from: "      await consumePreparedReaction(actor, action.key);\n      provokeIfManipulate(actor, action);\n    } else await commitActionCost(actor, action, readied, action.apCost,", to: "      await consumePreparedReaction(actor, action.key);\n    } else await commitActionCost(actor, action, readied, action.apCost," },
  { name: "C the second prepared payment stays silent", file: AW, from: "      await consumePreparedReaction(actor, action.key);\n      provokeIfManipulate(actor, action);\n    } else await commitActionCost(actor, action, readied, effectiveApCost,", to: "      await consumePreparedReaction(actor, action.key);\n    } else await commitActionCost(actor, action, readied, effectiveApCost," }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-manipulate-aoo-3703.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-manipulate-aoo-3703: verify-manipulate-aoo-3703 already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-manipulate-aoo-3703: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-manipulate-aoo-3703: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
