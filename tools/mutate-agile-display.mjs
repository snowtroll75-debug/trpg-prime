#!/usr/bin/env node
/** mutate-agile-display — the mutation half of verify-agile-display. NEW at 3.684.2. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AD = m("combat", "agile-display.mjs"), MV = m("combat", "movement.mjs"), MW = m("combat", "movement-workflow.mjs"), FW = m("feats-workflow.mjs");
const APW = m("combat", "action-points-workflow.mjs"), AW = m("combat", "action-workflow.mjs"), ATK = m("combat", "attack-workflow.mjs");
const RF = m("combat", "reaction-feats.mjs"), CW = m("magic", "cast-workflow.mjs"), RAP = m("combat", "restricted-ap.mjs");
const MUTATIONS = [
  // R — the reach
  { name: "the reach forgets adjacency after the Step", file: AD, from: "  return step + 5;", to: "  return step;", breaks: "R1/U2" },
  { name: "the reach is exclusive", file: AD, from: "Number.isFinite(feet) && feet <= limit)", to: "Number.isFinite(feet) && feet < limit)", breaks: "R2/U2" },
  { name: "an unmeasured token counts as touching", file: AD, from: "row?.feet === null || row?.feet === undefined ? NaN : Number(row.feet)", to: "Number(row?.feet)", breaks: "R2" },
  { name: "the candidates are not sorted", file: AD, from: "    .sort((a, b) => a.feet - b.feet || a.i - b.i)\n", to: "", breaks: "R2/U2" },
  { name: "a target out of reach is pre-selected", file: AD, from: "  return id && (candidates ?? []).some((c) => String(c?.id) === id) ? id : AGILE_DISPLAY_NO_CHECK;", to: "  return id || AGILE_DISPLAY_NO_CHECK;", breaks: "R4" },
  // L — the leg
  { name: "the Step provokes reactions", file: AD, from: "  return { speedKey: \"land\", maxFeet, provokes: false, countsAs: \"step\"", to: "  return { speedKey: \"land\", maxFeet, provokes: true, countsAs: \"step\"", breaks: "L1/U4/W6" },
  { name: "the leg is not a Step", file: AD, from: ", countsAs: \"step\", note:", to: ", note:", breaks: "L1/U4" },
  { name: "the leg flies", file: AD, from: "  return { speedKey: \"land\", maxFeet,", to: "  return { speedKey: \"fly\", maxFeet,", breaks: "L1/U4" },
  { name: "the leg ignores the Step's distance", file: AD, from: "  const maxFeet = Math.max(0, Math.trunc(Number(stepFeet) || 0)) || 5;", to: "  const maxFeet = 5;", breaks: "L1" },
  { name: "the card's Step line charges AP", file: AD, from: "ft — no AP, no reactions provoked.`;", to: "ft for 1 AP.`;", breaks: "L3/U5" },
  { name: "the Step ignores Graceful Step", file: MW, from: "  return armedMoveLimit(\"step\", speed, featMovementBonus(actor, \"step\"), featMovementFraction(actor, \"step\")) ?? 5;", to: "  return 5;", breaks: "L4" },
  // K — counts as a Step
  { name: "a leg's countsAs is ignored", file: MV, from: "  return as && as !== COMPOUND_LEG_KEY && Object.hasOwn(ARMED_MOVEMENT_ACTIONS, as) ? as : COMPOUND_LEG_KEY;", to: "  return COMPOUND_LEG_KEY;", breaks: "K1" },
  { name: "any countsAs is honoured", file: MV, from: "  return as && as !== COMPOUND_LEG_KEY && Object.hasOwn(ARMED_MOVEMENT_ACTIONS, as) ? as : COMPOUND_LEG_KEY;", to: "  return as || COMPOUND_LEG_KEY;", breaks: "K1" },
  { name: "the path is eased by the raw key", file: MW, from: "pathCost(movement, actor, armedAs)", to: "pathCost(movement, actor, armedNow)", breaks: "K2" },
  { name: "the leg's spend is never a Step's", file: MW, from: " || armedAs === \"step\" ? \"step\" : \"move\"", to: " ? \"step\" : \"move\"", breaks: "K3" },
  // U / W — the use
  { name: "a cancelled chooser goes on to spend", file: FW, from: "        if (picked === null || picked === undefined) return; // cancelled: no AP, no Step\n", to: "", breaks: "U1/W1" },
  { name: "the Step is never armed", file: FW, from: "        await armCompoundLeg(actor, { ...agileDisplayLeg(stepFeet), apAtArm: Number(actor.system.resources?.ap?.value ?? 0) }, \"Agile Display\");\n", to: "", breaks: "U4/W1/W2" },
  { name: "the AP is not spent", file: FW, from: "        await actor.update({ \"system.resources.ap.value\": Number(actor.system.resources?.ap?.value ?? 0) - 1 });\n        // THE STEP", to: "        // THE STEP", breaks: "U4/W1" },
  { name: "the AP is checked after the chooser", file: FW, from: "      if (game.combat?.started && ap < 1) {\n        ui.notifications.warn(\"Agile Display: 1 AP required.\");\n        return;\n      }\n      const stepFeet", to: "      const stepFeet", breaks: "U6/W1" },
  { name: "only creatures adjacent now are offered", file: FW, from: "        const reach = agileDisplayReach(stepFeet);", to: "        const reach = 5;", breaks: "U2" },
  { name: "the chooser opens on nothing", file: FW, from: "          agileDisplayDefault(candidates, game.user?.targets?.first?.()?.id ?? null));", to: "          null);", breaks: "U3" },
  { name: "\"no check\" is not offered", file: FW, from: ", [AGILE_DISPLAY_NO_CHECK, \"No check — just Step\"]]", to: "]", breaks: "U2/W7" },
  { name: "the chosen creature is not targeted", file: FW, from: "        if (target) target.setTarget?.(true, { user: game.user, releaseOthers: true });\n", to: "", breaks: "W4" },
  { name: "the typed DC's cancel goes on", file: FW, from: "        if (typed === null) return; // cancelled: no AP, no Step\n", to: "", breaks: "U7" },
  { name: "the card leaves out the Step", file: FW, from: "        await postCard(actor, \"Agile Display\", [stepLine, line(\"No Acrobatics check attempted.\")]);", to: "        await postCard(actor, \"Agile Display\", [line(\"No Acrobatics check attempted.\")]);", breaks: "U5" },
  // N — the Step must be the next action (3.684.5; Graham, 5 November 2026)
  { name: "the leg is not marked as the next action", file: AD, from: ", note: \"Agile Display's Step\", nextAction: true };", to: ", note: \"Agile Display's Step\" };", breaks: "L1/N2/N3/N5" },
  { name: "every compound leg lapses", file: AD, from: " || leg?.nextAction !== true) return false;", to: ") return false;", breaks: "N1/N2/N3" },
  { name: "any AP write lapses it", file: AD, from: "  return Number.isFinite(at) && Number(apNow) < at;", to: "  return true;", breaks: "N1/N4" },
  { name: "an AP write at the armed pool lapses it", file: AD, from: "  return Number.isFinite(at) && Number(apNow) < at;", to: "  return Number.isFinite(at) && Number(apNow) <= at;", breaks: "N1/N4" },
  { name: "the lapse leaves the leg armed", file: MW, from: "  if (actor.getFlag?.(SYSTEM_ID, ARMED_FLAG) === COMPOUND_LEG_KEY) await clearArmedMovement(actor);\n", to: "", breaks: "N2/N3" },
  { name: "the lapse keeps the leg's flag", file: MW, from: "  await actor.unsetFlag(SYSTEM_ID, COMPOUND_LEG_KEY);\n  // KEPT FOR A REFUND", to: "  // KEPT FOR A REFUND", breaks: "N2" },
  { name: "the lapse says nothing", file: MW, from: "  globalThis.ui?.notifications?.info?.(`${leg.label || \"The free Step\"}: the free Step is removed", to: "  void (`${leg.label || \"The free Step\"}: the free Step is removed", breaks: "N2" },
  { name: "the hook takes any user's write", file: MW, from: "  if (userId !== undefined && userId !== globalThis.game?.user?.id) return;\n", to: "", breaks: "N4" },
  { name: "the hook misses a flat AP write", file: MW, from: "  const ap = changes?.[\"system.resources.ap.value\"] ?? foundry.utils", to: "  const ap = foundry.utils", breaks: "N4" },
  { name: "the hook is not registered", file: MW, from: "  Hooks.on(\"updateActor\", onApWriteLapse);\n", to: "", breaks: "N9" },
  { name: "spending AP does not lapse it", file: APW, from: "    else await lapseNextActionLeg(actor, { spendFrom: Number(actor.system?.resources?.ap?.value ?? 0) });\n", to: "", breaks: "N3/N6" },
  { name: "a 0-AP spend (the leg's own drag) lapses it", file: APW, from: "  if (!cost) return;\n\n  // A LEG THAT MUST BE", to: "  if (!cost) { const { lapseNextActionLeg } = await import(\"./movement-workflow.mjs\"); await lapseNextActionLeg(actor); return; }\n\n  // A LEG THAT MUST BE", breaks: "N3/N6" },
  // N11–N19 — a reaction, a refusal and a cancel keep the Step (3.684.6; Graham, 5 November 2026)
  { name: "a reaction lapses it", file: AD, from: "  if (reaction === true) return false;\n", to: "", breaks: "N11/N12/N15/N17" },
  { name: "a refund restores over an armed Step", file: AD, from: "(armed !== null && armed !== undefined) || leg) return false;", to: "leg) return false;", breaks: "N11/N17" },
  { name: "any refund restores it", file: AD, from: "  return Number.isFinite(before) && Number(apNow) >= before;", to: "  return Number.isFinite(before);", breaks: "N11/N17" },
  { name: "a refund is weighed against the AP at Agile Display (review 1)", file: AD, from: "  const before = Number(saved.apBefore);", to: "  const before = Number(saved.leg.apAtArm);", breaks: "N11/N21b" },
  { name: "a reaction feat's frozen Strike is not a reaction", file: AD, from: " || Boolean(readied) || Boolean(asReaction);", to: " || Boolean(readied);", breaks: "N11/N15" },
  { name: "a readied Strike is not a reaction", file: AD, from: "  return Boolean(isReaction) || Boolean(readied) || Boolean(asReaction);", to: "  return Boolean(isReaction) || Boolean(asReaction);", breaks: "N11/N15" },
  { name: "the lapse drops the reaction", file: MW, from: "  if (reaction === true) return false;\n  const leg = actor?.getFlag?.(SYSTEM_ID, COMPOUND_LEG_KEY) ?? null;\n  if (!nextActionLegLapses(", to: "  const leg = actor?.getFlag?.(SYSTEM_ID, COMPOUND_LEG_KEY) ?? null;\n  if (!nextActionLegLapses(", breaks: "N12/N15/N17" },
  { name: "a basic action clears the leg at the click", file: AW, from: "  if (!isArmableMovement(action.key) && !nextActionLegArmed(actor)) {", to: "  if (!isArmableMovement(action.key)) {", breaks: "N7/N12/N13" },
  { name: "a basic action lapses it at the click", file: AW, from: "  await clearAimIfOtherAction(actor, action.key);\n\n  // An armed movement action survives", to: "  await clearAimIfOtherAction(actor, action.key);\n  await lapseNextActionLeg(actor);\n\n  // An armed movement action survives", breaks: "N7/N12/N13" },
  { name: "a reaction-cost basic action lapses it", file: AW, from: "{ reaction: Boolean(readied) || isReactionCost(action) }", to: "{ reaction: false }", breaks: "N12/N13" },
  { name: "a readied action lapses it", file: AW, from: "{ reaction: Boolean(readied) || isReactionCost(action) }", to: "{ reaction: isReactionCost(action) }", breaks: "N13" },
  { name: "a commit point does not take it", file: AW, from: "  await basicActionTaken(actor, action, { readied });\n  return spendActionCost(", to: "  return spendActionCost(", breaks: "N14" },
  { name: "the main commit point pays bare", file: AW, from: "    else await commitActionCost(actor, action, readied, action.apCost, action.name, { traits: action.traits });\n    await recordTraitUsage(actor, action);\n    {", to: "    else await spendActionCost(actor, action.apCost, action.name, { traits: action.traits });\n    await recordTraitUsage(actor, action);\n    {", breaks: "N19" },
  { name: "arming a movement keeps it", file: AW, from: "      await basicActionTaken(actor, action, { readied });\n      await armMovementAction(actor, action.key);", to: "      await armMovementAction(actor, action.key);", breaks: "N19" },
  { name: "Delay keeps it", file: AW, from: "      await basicActionTaken(actor, action, { readied });\n      await enterDelay(", to: "      await enterDelay(", breaks: "N19" },
  { name: "a rage roll keeps it", file: AW, from: "    // A RAGE ACTION PAYS ON ITS RESULT, but is taken here, at the roll.\n    await basicActionTaken(actor, action, { readied });\n", to: "    // A RAGE ACTION PAYS ON ITS RESULT, but is taken here, at the roll.\n", breaks: "N19" },
  { name: "a reaction Strike lapses it", file: ATK, from: "    await lapseNextActionLeg(actor, { reaction: strikeSpendsReaction({ isReaction, readied, asReaction }) });\n  };", to: "    await lapseNextActionLeg(actor, { reaction: false });\n  };", breaks: "N8/N15/N24" },
  { name: "a Strike taken does not lapse it", file: ATK, from: "  await strikeTaken();\n\n  // Parry", to: "\n  // Parry", breaks: "N8/N15" },
  { name: "the Strike lapses it at its spend", file: ATK, from: "{ use: \"strike\", deferNextAction: true });", to: "{ use: \"strike\" });", breaks: "N16/N19" },
  { name: "a Strike wasted by Sanctuary takes the Step", file: ATK, from: "  if (sanctuary.blocked) return null;", to: "  if (sanctuary.blocked) { await strikeTaken(); return null; }", breaks: "N23/N19" },
  { name: "a reaction feat's frozen Strike is not marked", file: RF, from: "skipTargetPrompt: true, asReaction: true }", to: "skipTargetPrompt: true }", breaks: "N15" },
  { name: "the hook lapses a deferred spend", file: MW, from: "  if (options?.trgPrimeNextActionDeferred === true) return;\n", to: "", breaks: "N16" },
  { name: "the deferred spend is not marked", file: APW, from: "  }, deferNextAction ? { trgPrimeNextActionDeferred: true } : {});", to: "  });", breaks: "N16" },
  { name: "the spender ignores the deferral", file: APW, from: "    if (deferNextAction) await forgetLapsedLeg(actor);\n    else await", to: "    await", breaks: "N16" },
  { name: "a Strike's own spend keeps a saved Step", file: APW, from: "    if (deferNextAction) await forgetLapsedLeg(actor);\n", to: "    if (deferNextAction) {}\n", breaks: "N21b" },
  { name: "a continuing spend is a new one", file: APW, from: "  if (!continuesSpend) {\n", to: "  {\n", breaks: "N21" },
  { name: "spendActionCost drops continuesSpend", file: APW, from: "{ use, traits, continuesSpend });", to: "{ use, traits });", breaks: "N21" },
  { name: "a refund does not restore it", file: APW, from: "  await restoreNextActionLeg(actor);\n}", to: "}", breaks: "N17/N19" },
  { name: "the lapse keeps no record", file: MW, from: "  if (Number.isFinite(spendFrom)) await actor.setFlag?.(SYSTEM_ID, LAPSED_LEG_FLAG, { leg: { ...leg }, apBefore: Number(spendFrom) });\n  else await forgetLapsedLeg(actor);", to: "  await forgetLapsedLeg(actor);", breaks: "N17/N18" },
  { name: "any lapse keeps a record (review 1)", file: MW, from: "  if (Number.isFinite(spendFrom)) await actor.setFlag?.(SYSTEM_ID, LAPSED_LEG_FLAG, { leg: { ...leg }, apBefore: Number(spendFrom) });\n  else await forgetLapsedLeg(actor);", to: "  await actor.setFlag?.(SYSTEM_ID, LAPSED_LEG_FLAG, { leg: { ...leg }, apBefore: Number(spendFrom ?? leg.apAtArm) });", breaks: "N20" },
  { name: "a spend that stood keeps its saved Step (review 2)", file: MW, from: "    if (apNow === null || apNow === undefined) await forgetLapsedLeg(actor);\n", to: "", breaks: "N21" },
  { name: "the hook drops a saved Step", file: MW, from: "    if (apNow === null || apNow === undefined) await forgetLapsedLeg(actor);\n", to: "    await forgetLapsedLeg(actor);\n", breaks: "N21b" },
  { name: "forgetting forgets nothing", file: MW, from: "  if (actor?.getFlag?.(SYSTEM_ID, LAPSED_LEG_FLAG) !== undefined) await actor.unsetFlag(SYSTEM_ID, LAPSED_LEG_FLAG);\n}", to: "}", breaks: "N20/N21" },
  // 3.684.7 — Graham's three answers of 6 November 2026
  { name: "a Strike cancelled at Versatile goes on (and so sets everything off)", file: ATK, from: "    if (versatileDamageType === null) return null;", to: "    if (versatileDamageType === null) versatileDamageType = undefined;", breaks: "N16/N28/N28b" },
  { name: "a Strike cancelled at Unsteady goes on", file: ATK, from: "    if (unsteadyRested === null) return null;", to: "    if (unsteadyRested === null) unsteadyRested = true;", breaks: "N22/N28/N28b" },
  { name: "a Strike cancelled at Blunt Arrows goes on", file: ATK, from: "    if (subdualShot === null) return null;", to: "    if (subdualShot === null) subdualShot = false;", breaks: "N28b" },
  { name: "Natural Leaper's actionless jump keeps the Step", file: AW, from: "          await basicActionTaken(actor, action, { readied });\n        }\n        await postCard(actor, action.name, [line(naturalLeaperLine(jumpSetup))]);", to: "        }\n        await postCard(actor, action.name, [line(naturalLeaperLine(jumpSetup))]);", breaks: "N29/N19" },
  { name: "a spend's receipt names nothing it took", file: APW, from: "    restrictedSpent = restrictedTaken(cappedEntries(grant.entries, currentAP), plan.entries);\n", to: "", breaks: "N30b" },
  { name: "a refund ignores its receipt", file: APW, from: "  const taken = receipt?.restricted ?? [];", to: "  const taken = [];", breaks: "N30b" },
  { name: "a refund puts the restricted points back uncapped", file: RAP, from: "  return cappedEntries(out, apValue);\n}\n\n/** \"Strike or Stride\". */", to: "  return out;\n}\n\n/** \"Strike or Stride\". */", breaks: "N30a" },
  { name: "a refund replaces the entries with what was taken (a snapshot, not an add-back)", file: RAP, from: "    if (at >= 0) out[at].value = Math.max(0, Number(out[at].value) || 0) + v;", to: "    if (at >= 0) out[at].value = v;", breaks: "N30a" },
  { name: "what was taken counts what was left", file: RAP, from: "    if (v - kept > 0) out.push({ ...e, value: v - kept });", to: "    if (kept > 0) out.push({ ...e, value: kept });", breaks: "N30a/N30b" },
  { name: "the cast's refund has no receipt", file: CW, from: "refundActionCost(actor, totalCastAP, { receipt: castReceipt });", to: "refundActionCost(actor, totalCastAP);", breaks: "N30c" },
  { name: "the cast's option refund has no receipt", file: CW, from: "refundActionCost(actor, castAPOwed.option, { receipt: optionReceipt });", to: "refundActionCost(actor, castAPOwed.option);", breaks: "N30c" },
  { name: "the spend returns no receipt", file: APW, from: "  return { cost, restricted: restrictedSpent };", to: "  return undefined;", breaks: "N30b" },
  { name: "a refund is read as an action (re-review 1)", file: APW, from: "  await actor.update({ \"system.resources.ap.value\": restored, ...grantBack }, { trgPrimeNextActionDeferred: true });", to: "  await actor.update({ \"system.resources.ap.value\": restored, ...grantBack });", breaks: "N26" },
  { name: "a Strike stopped by the flat check keeps the Step (review 3)", file: ATK, from: "      await strikeTaken();\n      return null;", to: "      return null;", breaks: "N24/N19" },
  { name: "ending Take Cover keeps the Step (review 4)", file: AW, from: "        await basicActionTaken(actor, action, { readied });\n        await endTakeCover(actor);", to: "        await endTakeCover(actor);", breaks: "N25/N19" },
  { name: "a cast's option AP is a new spend", file: CW, from: ".join(\", \")}`, { continuesSpend: true });", to: ".join(\", \")}`);", breaks: "N19" },
  { name: "the restore does not re-arm", file: MW, from: "  await actor.setFlag(SYSTEM_ID, ARMED_FLAG, COMPOUND_LEG_KEY);\n", to: "", breaks: "N17" },
  { name: "the restore puts no leg back", file: MW, from: "  await actor.setFlag(SYSTEM_ID, COMPOUND_LEG_KEY, saved.leg);\n", to: "", breaks: "N17" },
  { name: "the restore keeps its record", file: MW, from: "  await actor.unsetFlag(SYSTEM_ID, LAPSED_LEG_FLAG);\n  await actor.setFlag(SYSTEM_ID, COMPOUND_LEG_KEY, saved.leg);", to: "  await actor.setFlag(SYSTEM_ID, COMPOUND_LEG_KEY, saved.leg);", breaks: "N17" },
  { name: "the turn keeps the record", file: MW, from: "TUMBLE_FLAG, LAPSED_LEG_FLAG, ...LEGACY_FLAGS", to: "TUMBLE_FLAG, ...LEGACY_FLAGS", breaks: "N18" },
  { name: "the Use keeps no armed pool", file: FW, from: ", apAtArm: Number(actor.system.resources?.ap?.value ?? 0) }, \"Agile Display\");", to: " }, \"Agile Display\");", breaks: "N5/W1" },
  { name: "a second Use keeps the first Step", file: FW, from: "        await lapseNextActionLeg(actor);\n        await actor.update({", to: "        await actor.update({", breaks: "N5/N10" },
  { name: "the chooser cannot pre-select", file: FW, from: "String(v) === String(selected) ? \" selected\" : \"\"", to: "false ? \" selected\" : \"\"", breaks: "U3/W8" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-agile-display.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-agile-display: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-agile-display: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-agile-display: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
