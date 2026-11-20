#!/usr/bin/env node
/** mutate-armour-change-3703 — the mutation half of verify-armour-change-3703 (donning and removing armour). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AC = M("combat", "armour-change.mjs");
const AWF = M("combat", "armour-change-workflow.mjs");
const AW = M("combat", "action-workflow.mjs");
const AS = M("sheets", "actor-sheet.mjs");
const IS = M("sheets", "item-sheet.mjs");
const FW = M("feats-workflow.mjs");
const TR = M("combat", "target-relay.mjs");
const MAIN = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const MUTATIONS = [
  { name: "A Other is a suit", file: AC, from: "  return armourCategory(item?.system?.category) ? \"suit\" : \"piece\";", to: "  return \"suit\";" },
  { name: "A out of combat is an action", file: AC, from: "  return Boolean(combatStarted && actorInCombat && armourChangeKind(item));", to: "  return Boolean(armourChangeKind(item));" },
  { name: "B Critical removal takes the donning time", file: AC, from: "    if (removing || cat === \"light\") return { ap: 2 * AP_PER_ROUND };", to: "    if (cat === \"light\") return { ap: 2 * AP_PER_ROUND };" },
  { name: "B Success medium is 1 minute", file: AC, from: "    return { ap: 2 * AP_PER_MINUTE };", to: "    return { ap: 1 * AP_PER_MINUTE };" },
  { name: "B a Fumble is the usual time", file: AC, from: "    ap = usualAP * effect.multiplier;", to: "    ap = usualAP;" },
  { name: "B Quick Donning beats a shorter rune", file: AC, from: "    if (effect.ap < usualAP) {", to: "    if (true) {" },
  { name: "C a turn pays 1 AP", file: AC, from: "  return Math.min(remaining, Math.max(1, have));", to: "  return Math.min(remaining, 1);" },
  { name: "C progress is not kept", file: AC, from: "  const paid = Math.min(Number(task?.total ?? 0), Number(task?.paid ?? 0) + Math.max(0, Number(ap) || 0));", to: "  const paid = Math.min(Number(task?.total ?? 0), Math.max(0, Number(ap) || 0));" },
  { name: "D a piece is free in combat", file: AWF, from: "    await resolveAction(actor, interact, { armourChange: { item, piece: true, equip } });\n    return", to: "    await item.update({ \"system.equipped\": Boolean(equip) });\n    return" },
  { name: "D out of combat posts no time", file: AWF, from: "    await card(actor, `${armourVerb(removing)} Armour`, [\n      armourTimeLine(esc(item.name), removing, time),\n      time.why ? `<em>${esc(time.why)}</em>` : \"\",\n      \"<em>The world clock is not advanced.</em>\"\n    ]);\n", to: "" },
  { name: "D in combat it is set at once", file: AWF, from: "  await actor.setFlag(SYSTEM_ID, ARMOUR_TASK_FLAG, newArmourTask({ item, removing, time, quick: time.quick }));", to: "  await item.update({ \"system.equipped\": Boolean(equip) });\n  await actor.setFlag(SYSTEM_ID, ARMOUR_TASK_FLAG, newArmourTask({ item, removing, time, quick: time.quick }));" },
  { name: "D the GM cannot just set a suit", file: AWF, from: "        { action: \"act\", label: `Start ${removing ? \"removing\" : \"donning\"}`, default: true },\n        { action: \"set\", label: \"Just set it (no action)\" },\n        { action: \"cancel\", label: \"Cancel\" }\n      ]);\n    if (how === \"set\") return { handled: false, changed: false };", to: "        { action: \"act\", label: `Start ${removing ? \"removing\" : \"donning\"}`, default: true },\n        { action: \"set\", label: \"Just set it (no action)\" },\n        { action: \"cancel\", label: \"Cancel\" }\n      ]);" },
  { name: "D abandoning keeps the task", file: AWF, from: "  if (!task) return false;\n  await actor.unsetFlag(SYSTEM_ID, ARMOUR_TASK_FLAG);", to: "  if (!task) return false;" },
  { name: "D a payment provokes nothing", file: AWF, from: "    traits: \"Manipulate\",\n    apCost: String(pay),", to: "    traits: \"\",\n    apCost: String(pay)," },
  { name: "D the Quick Donning result is never used", file: AWF, from: "  if (time?.quick && actor?.getFlag?.(SYSTEM_ID, QUICK_DONNING_FLAG)) await actor.unsetFlag(SYSTEM_ID, QUICK_DONNING_FLAG);", to: "  return;" },
  { name: "D a paid-off task leaves the armour", file: AWF, from: "  if (done) {\n    await item.update({ \"system.equipped\": !task.removing });\n", to: "  if (done) {\n" },
  { name: "D no Continue button", file: AWF, from: "  return [armourProgressLine(next), continueButton(actor, next)];", to: "  return [armourProgressLine(next)];" },
  { name: "D runes ignored", file: AWF, from: "  const usual = donningTimeFor(item, { fullSuit: isFullSuit(item) });", to: "  const usual = (await import(\"../donning.mjs\")).donningTime(item?.system?.category, { fullSuit: isFullSuit(item) });" },
  { name: "E applied before the AP is paid", file: AW, from: "    if (!(await ensureActionPoints(actor, action.apCost, action.name, { traits: action.traits }))) return null;\n    if (preparedPaysFor) {\n      await consumePreparedReaction(actor, action.key);\n      provokeIfManipulate(actor, action);\n    } else await commitActionCost(actor, action, readied, action.apCost,", to: "    if (armourChange?.item) { const { applyArmourChange } = await import(\"./armour-change-workflow.mjs\"); await applyArmourChange(actor, armourChange); }\n    if (!(await ensureActionPoints(actor, action.apCost, action.name, { traits: action.traits }))) return null;\n    if (preparedPaysFor) {\n      await consumePreparedReaction(actor, action.key);\n      provokeIfManipulate(actor, action);\n    } else await commitActionCost(actor, action, readied, action.apCost," },
  { name: "E never applied", file: AW, from: "      for (const said of await applyArmourChange(actor, armourChange)) lines.push(line(said));\n", to: "" },
  { name: "F the Worn box ignores armour", file: AS, from: "      if (worn.handled) return;\n", to: "\n" },
  { name: "F the item sheet's box saves freely", file: IS, from: "        if (routes) {\n", to: "        if (false) {\n" },
  { name: "F the button never registered", file: MAIN, from: "\n  registerArmourChangeHooks();\n", to: "\n" },
  { name: "F Quick Donning sets nothing", file: FW, from: "      const set = await setQuickDonning(creature, { degree, by: actor.name });", to: "      const set = true;" },
  { name: "F a made-up degree is set", file: AWF, from: "  if (!QUICK_DONNING_DEGREES.includes(String(record?.degree ?? \"\"))) return false;\n", to: "" },
  { name: "H the AP printed twice", file: AC, from: "  return /\\bAP\\b/.test(label) ? label : `${label} (${time?.ap ?? 0} AP)`;", to: "  return `${label} (${time?.ap ?? 0} AP)`;" },
  { name: "H minutes without their AP", file: AC, from: "  return /\\bAP\\b/.test(label) ? label : `${label} (${time?.ap ?? 0} AP)`;", to: "  return label;" },
  { name: "F the relay accepts any degree", file: TR, from: "      if (!QUICK_DONNING_RELAY_DEGREES.includes(degree)) return { ok: false, reason: \"not a Quick Donning result\" };\n", to: "" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-armour-change-3703.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-armour-change-3703: verify-armour-change-3703 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-armour-change-3703: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-armour-change-3703: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
