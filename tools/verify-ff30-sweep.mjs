#!/usr/bin/env node
/**
 * verify-ff30-sweep — 3.663.5, found live while testing Fiends & Fables Prime
 * 0.45.0 (the sweep of the module's 116 manual items).
 *
 *   F1   Improved Combat Reflexes' extra reactions survive data preparation:
 *        the turn's refill records its bonus as `reactionGrant`, and the
 *        resource clamp allows it above the maximum, as it does Quickened's AP
 *   F1b  the allowance is read from that flag at the call site
 *   F1c  the refill writes the flag with the turn's bonus (0 when it cannot act)
 *
 * actor.mjs needs Foundry to import, so the clamp function is lifted out of
 * the source and run against the real clamp it calls.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const actorSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs"), "utf8");
const combatSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs"), "utf8");
const { clampResourceValue, resourcePercentage } = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "dice", "resolution.mjs")).href);
const fnText = /export function prepareResourcePercentages\([\s\S]*?\n\}\n/.exec(actorSrc)?.[0];
ok("F0 the clamp function is found", !!fnText);
const prepare = new Function("clampResourceValue", "resourcePercentage", `${(fnText ?? "").replace("export function", "function")}; return prepareResourcePercentages;`)(clampResourceValue, resourcePercentage);
const sys = (v) => ({ resources: { reactions: { value: v, max: 2 }, ap: { value: 5, max: 3 } } });
const run = (v, opts) => { const s = sys(v); prepare(s, opts); return [s.resources.reactions.value, s.resources.ap.value]; };
equal("F1 reactions: 9 stand with a 7 allowance, clamp to 2 without, and AP is not given it",
  [run(9, { reactionAllowance: 7 }), run(9, {}), run(9, { reactionAllowance: -3 }), run(12, { reactionAllowance: 7 }), run(9, { apAllowance: 7 })],
  [[9, 3], [2, 3], [2, 3], [9, 3], [2, 5]]);
ok("F1b the allowance is read from the reactionGrant flag",
  /reactionAllowance: Number\(this\.flags\?\.\["trg-prime"\]\?\.reactionGrant\?\.bonus\) \|\| 0/.test(actorSrc));
ok("F1c the refill writes the turn's bonus",
  /\[`flags\.\$\{SYSTEM_ID\}\.reactionGrant`\]: \{ combatId: this\.id, bonus: acting\.canAct \? reactionState\.bonus : 0 \}/.test(combatSrc)
  && /"system\.resources\.reactions\.value": newReactions,[\s\S]{0,2500}reactionGrant/.test(combatSrc));
const EXPECTED = 5;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-sweep: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-sweep: ${checks} checks\n  all pass\n`);
