#!/usr/bin/env node
/** mutate-lunge-actions-3705 — the mutation half of verify-lunge-actions-3705 (action reach and Lunge with any attack action, 3.705.0). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AR = M("combat", "action-reach.mjs");
const AF = M("combat", "action-feats.mjs");
const AFW = M("combat", "action-feats-workflow.mjs");
const AW = M("combat", "action-workflow.mjs");
const AWK = M("combat", "attack-workflow.mjs");
const CW = M("combat", "charge-workflow.mjs");
const LS = M("combat", "lunge-scope.mjs");
const RF = M("combat", "reaction-feats-workflow.mjs");
const MUTATIONS = [
  { name: "A the reach check refuses nothing", file: AR, from: "  const allowed = d <= limit;", to: "  const allowed = true;" },
  { name: "A a Lunge adds nothing", file: AR, from: "  const lungeExt = lunge ? LUNGE_EXTENSION_FEET : 0;", to: "  const lungeExt = 0;" },
  { name: "A a Lunge takes the Reach -2", file: AR, from: "reachPenalty: extended && extendedBy === \"weapon\" && !lunge ? -2 : 0", to: "reachPenalty: extended ? -2 : 0" },
  { name: "A a reach weapon's -2 dropped", file: AR, from: "reachPenalty: extended && extendedBy === \"weapon\" && !lunge ? -2 : 0", to: "reachPenalty: 0" },
  { name: "A Grapple uses a weapon's reach", file: AR, from: "  const weaponExt = spec.kind === \"own\" ? 0 : ", to: "  const weaponExt = " },
  { name: "A a held target refused", file: AR, from: "  if (key === \"grappleAttack\" && holdsTarget) return", to: "  if (false) return" },
  { name: "A Coup de Grace at reach, not adjacency", file: AR, from: "  if (spec.kind === \"adjacent\") {", to: "  if (false) {" },
  { name: "B a sheathed weapon lends its reach", file: AR, from: "    .filter((i) => i?.type === \"weapon\" && i.system?.equipped && (i.system?.attackMode", to: "    .filter((i) => i?.type === \"weapon\" && (i.system?.attackMode" },
  { name: "C Trip not offered", file: AF, from: "  [\"tripAttack\", \"Trip Attack\"],\n", to: "" },
  { name: "C feats offered whether owned or not", file: AF, from: "    ...LUNGE_FEAT_ACTIONS.filter((key) => owned.has(key))", to: "    ...LUNGE_FEAT_ACTIONS" },
  { name: "D the scope never cleared", file: LS, from: "  } finally {\n    ACTIVE.delete(key);\n  }", to: "  } finally {\n  }" },
  { name: "D the scope never set", file: LS, from: "  ACTIVE.set(key, terms);", to: "" },
  { name: "E the reach check not run", file: AW, from: "  if (ACTION_REACH[action.key] && !reachExempt) {", to: "  if (false) {" },
  { name: "E the refusal does not stop the action", file: AW, from: "        ui.notifications.warn(actionReachRefusal(action.name, targetActor.name, distance, verdict));\n        return null;", to: "        ui.notifications.warn(actionReachRefusal(action.name, targetActor.name, distance, verdict));" },
  { name: "E the Lunge's -1 not on a maneuver", file: AW, from: "    if (lunging) actionReachRows.push(...(lunging.extraModifiers ?? []));", to: "" },
  { name: "E the rows never reach the check", file: AW, from: "      ...actionReachRows,\n", to: "" },
  { name: "E a Lunge reaches adjacency", file: AW, from: "    const lunging = ACTION_REACH[action.key].kind === \"adjacent\" ? null : lungeScopeFor(actor);", to: "    const lunging = lungeScopeFor(actor);" },
  { name: "E a reaction's Disarm exempt again", file: RF, from: "if (disarm) await resolveAction(reactor, { ...disarm, apCost: \"0\" });", to: "if (disarm) await resolveAction(reactor, { ...disarm, apCost: \"0\" }, { reachExempt: true });" },
  { name: "E Reactive Disarm exempt again", file: M("combat", "reactive-disarm-workflow.mjs"), from: "  return resolveAction(defender, action, {});", to: "  return resolveAction(defender, action, { reachExempt: true });" },
  { name: "E a reaction's Shove gated", file: RF, from: "if (shove) await resolveAction(reactor, { ...shove, apCost: \"0\" }, { reachExempt: true });", to: "if (shove) await resolveAction(reactor, { ...shove, apCost: \"0\" });" },
  { name: "E a Strike in a Lunge's action gains nothing", file: AWK, from: "      grantTraits = [...grantTraits, ...(lunging.grantTraits ?? [])];", to: "" },
  { name: "E a reaction Strike takes the Lunge", file: AWK, from: "    const lunging = (isReaction || asReaction) ? null : lungeScopeFor(actor);", to: "    const lunging = lungeScopeFor(actor);" },
  { name: "E a Charge forgets its Lunge", file: CW, from: "    ...(lunge ? { lunge } : {})\n", to: "" },
  { name: "E a Charge's Lunge does not reach further", file: CW, from: "  const reach = reachOf(chargerToken?.object ?? chargerToken) + (lunge ? 5 : 0);", to: "  const reach = reachOf(chargerToken?.object ?? chargerToken);" },
  { name: "E runLunge runs the action outside the scope", file: AFW, from: "    result = await withLunge(actor, terms, () => runActionFeat(actor, feat));", to: "    result = await runActionFeat(actor, feat);" },
  { name: "E the Lunge card after a refused action", file: AFW, from: "  if (result === null || result === undefined) return result;\n  await card(", to: "  await card(" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-lunge-actions-3705.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-lunge-actions-3705: verify-lunge-actions-3705 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-lunge-actions-3705: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-lunge-actions-3705: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
