#!/usr/bin/env node
/** mutate-skill-tumble — the mutation half of verify-skill-tumble. NEW at 3.715.1. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const TU = m("combat", "tumble.mjs"), TW = m("combat", "tumble-workflow.mjs"), AW = m("combat", "action-workflow.mjs");
const MW = m("combat", "movement-workflow.mjs"), OP = m("combat", "opportunity.mjs");
const MUTATIONS = [
  // T — the rules
  { name: "the enemy's reach is not counted", file: TU, from: "feet <= speed + Math.max(5, feetOf(row.reach)))", to: "feet <= speed + 5)", breaks: "T1" },
  { name: "a reach of 0 threatens nothing", file: TU, from: "feet <= speed + Math.max(5, feetOf(row.reach)))", to: "feet <= speed + feetOf(row.reach))", breaks: "T1/T2" },
  { name: "the candidates are not sorted", file: TU, from: "    .sort((a, b) => a.feet - b.feet || a.i - b.i)\n", to: "", breaks: "T1" },
  { name: "an unmeasured token counts as touching", file: TU, from: "row?.feet === null || row?.feet === undefined ? NaN : Number(row.feet)", to: "Number(row?.feet)", breaks: "T1" },
  { name: "the default goes through the space", file: TU, from: "  return tumbleChoiceValue(picked, TUMBLE_THROUGH.area);", to: "  return tumbleChoiceValue(picked, TUMBLE_THROUGH.space);", breaks: "T9/T10" },
  { name: "the default ignores the target", file: TU, from: "  const picked = id && list.some((c) => String(c?.id) === id) ? id : String(list[0].id);", to: "  const picked = String(list[0].id);", breaks: "T9" },
  { name: "the space costs no more", file: TU, from: "const TUMBLE_SPACE_DC = 2;", to: "const TUMBLE_SPACE_DC = 0;", breaks: "T12" },
  { name: "past it costs the +2 too", file: TU, from: "  return through === TUMBLE_THROUGH.space ? TUMBLE_SPACE_DC : 0;", to: "  return TUMBLE_SPACE_DC;", breaks: "T13" },
  { name: "a success is normal movement", file: TU, from: "(d === \"success\" ? \"difficult\" : \"normal\")", to: "\"normal\"", breaks: "T16" },
  { name: "past it opens the space", file: TU, from: "  const viaSpace = through !== TUMBLE_THROUGH.area;", to: "  const viaSpace = true;", breaks: "T18" },
  { name: "a pass gives no Stride", file: TU, from: "    armStride: passed,", to: "    armStride: false,", breaks: "T15/T16/T18" },
  { name: "a failure draws no reactions", file: TU, from: "    failureReactions: failed", to: "    failureReactions: false", breaks: "T19/T20" },
  { name: "heroic is not a pass", file: TU, from: "const PASSED = new Set([\"heroic\", \"critical\", \"success\"]);", to: "const PASSED = new Set([\"critical\", \"success\"]);", breaks: "T17" },
  { name: "the Stride provokes from nobody", file: TU, from: "    provokes: true,\n    exemptReactorTokenIds: exempt,", to: "    provokes: false,\n    exemptReactorTokenIds: exempt,", breaks: "T23" },
  { name: "the enemy is not exempt", file: TU, from: "  const exempt = exemptTokenId ? [String(exemptTokenId)] : [];", to: "  const exempt = [];", breaks: "T23" },
  { name: "the Stride lingers past the next action", file: TU, from: "    note: \"Tumble's Stride\",\n    nextAction: true", to: "    note: \"Tumble's Stride\"", breaks: "T23/L1" },
  { name: "the card's line charges AP", file: TU, from: "ft, no further AP.", to: "ft for 1 AP.", breaks: "T27" },
  // M — the movement reactions
  { name: "the exemption is ignored", file: OP, from: "    if (exempt.has(String(enemy?.id))) continue;\n", to: "", breaks: "M1" },
  { name: "the exemption silences everyone", file: OP, from: "    if (exempt.has(String(enemy?.id))) continue;", to: "    if (exempt.size) continue;", breaks: "M1" },
  { name: "the hook drops the exemption", file: MW, from: "m.detectMovementAoO(tokenDocument, movement, { exemptTokenIds })", to: "m.detectMovementAoO(tokenDocument, movement)", breaks: "W9" },
  { name: "detection drops the exemption", file: OP, from: "movementReactors(moverToken, movement, { exemptTokenIds }), \"movement\"", to: "movementReactors(moverToken, movement), \"movement\"", breaks: "W9/W10" },
  // F — the failure
  { name: "the departure is offered as a ranged provoke", file: OP, from: "    await offerAttacksOfOpportunity(moverToken, stationaryReactors(moverToken), \"movement\");\n  } catch (_e) {\n    /* detection is best-effort */\n  }\n}\n", to: "    await offerAttacksOfOpportunity(moverToken, stationaryReactors(moverToken), \"ranged\");\n  } catch (_e) {\n    /* detection is best-effort */\n  }\n}\n", breaks: "W10" },
  { name: "a failure's reactions are never offered", file: AW, from: "          void tumbleFailureReactions(actor).catch(() => {});\n", to: "", breaks: "W5" },
  // L — the notice
  { name: "the Stride's lapse says Step", file: MW, from: "=== \"step\" ? \"Step\" : \"move\";", to: "=== \"step\" ? \"Step\" : \"Step\";", breaks: "L2" },
  // W — the wiring
  { name: "a cancelled chooser goes on to roll", file: AW, from: "    if (chosen?.cancelled) return null;\n", to: "", breaks: "W1" },
  { name: "the chooser is asked after the target is read", file: AW, from: "    tumbleSetup = chosen?.setup ?? null;\n  }\n  const targetActor = presetDispel ? null : firstTargetActor();", to: "    tumbleSetup = chosen?.setup ?? null;\n  }\n  const targetActorLate = presetDispel ? null : firstTargetActor();\n  const targetActor = targetActorLate;", breaks: "W1" },
  { name: "the +2 never reaches the DC", file: AW, from: "    resolved.dc += tumbleDCAdjustment(tumbleSetup.through);\n", to: "", breaks: "W3" },
  { name: "a resumed card forgets the setup", file: AW, from: "      tumbleSetup: stored?.tumbleSetup ?? null,\n", to: "", breaks: "W4" },
  { name: "the outcome never sees the setup", file: AW, from: "    tumbleSetup = null,\n    ignoreActionImmunity = false", to: "    ignoreActionImmunity = false", breaks: "W4" },
  { name: "the Stride is never armed", file: AW, from: "if (plan.armStride && await armTumbleStride(actor, tumbleSetup)) {", to: "if (false) {", breaks: "W5" },
  { name: "the leg is armed out of combat", file: TW, from: "  if (!game.combat?.started) return false;\n  const { armCompoundLeg }", to: "  const { armCompoundLeg }", breaks: "W6" },
  { name: "the leg keeps no armed pool", file: TW, from: "    apAtArm: Number(actor.system?.resources?.ap?.value ?? 0)\n", to: "", breaks: "W6" },
  { name: "the chosen enemy is not targeted", file: TW, from: "  token.setTarget?.(true, { user: game.user, releaseOthers: true });\n", to: "", breaks: "W7" },
  { name: "allies are offered", file: TW, from: "myDisposition, \"enemies\")", to: "myDisposition, \"all\")", breaks: "W8" },
  { name: "the passage marker is never set", file: AW, from: "        if (plan.passage) await actor.setFlag(SYSTEM_ID, TUMBLE_FLAG, plan.passage);\n", to: "", breaks: "W11/O9" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-skill-tumble.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-skill-tumble: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-skill-tumble: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-skill-tumble: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
