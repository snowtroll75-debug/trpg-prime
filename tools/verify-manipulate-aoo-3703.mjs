#!/usr/bin/env node
/**
 * verify-manipulate-aoo-3703 — core 3.703.0, the Manipulate Attack of
 * Opportunity is offered when the action is taken.
 *
 * Found in the 3.702.0 live test: at 0 AP, an Interact in a foe's reach
 * posted the foe's Attack of Opportunity offer, and then the "Not Enough AP"
 * prompt cancelled the Interact. The offer was made at the top of
 * `resolveAction`, before the AP gate. Graham: "Yes do the fix."
 *
 *   A  the early offer is gone from the top of resolveAction
 *   B  `provokeIfManipulate` keeps the rule (Manipulate, not exempt, not the
 *      AoO itself, a started combat) and is called from `basicActionTaken`
 *   C  the two prepared-reaction payments, which do not pass through
 *      `basicActionTaken`, call it themselves
 *   D  every commit point is still one of those
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const AW = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs"), "utf8");
const between = (src, a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i + a.length); return i < 0 || j < 0 ? "" : src.slice(i, j); };

/* A */
{
  const top = between(AW, "export async function resolveAction(actor, action, {", "if (!(await ensureActionPoints(");
  ok("A1 resolveAction found", top.length > 0);
  ok("A2 no offer before the AP gate", !/detectStationaryAoO/.test(top));
  ok("A3 the note where it stood", /THE MANIPULATE ATTACK OF OPPORTUNITY IS OFFERED WHEN THE ACTION IS TAKEN/.test(top));
  ok("A4 the detection appears once in the file, in the helper",
    (AW.match(/detectStationaryAoO\(actor, "manipulate"\)/g) ?? []).length === 1);
}

/* B */
{
  const helper = between(AW, "function provokeIfManipulate(actor, action) {", "\n}\n");
  ok("B1 the helper exists", helper.length > 0);
  ok("B2 a Manipulate action", /hasTrait\(action, "manipulate"\)/.test(helper));
  ok("B3 not an exempt one (Release, grip)", /!action\.provokeExempt/.test(helper));
  ok("B4 not the AoO itself", /action\.key !== "attackOfOpportunity"/.test(helper));
  ok("B5 only in a started combat", /game\.combat\?\.started/.test(helper));
  ok("B6 detached: it never blocks the action", /import\("\.\/opportunity\.mjs"\)\s*\.then\(\(m\) => m\.detectStationaryAoO\(actor, "manipulate"\)\)\s*\.catch\(\(\) => \{\}\)/.test(helper));
  const taken = between(AW, "async function basicActionTaken(actor, action, { readied = false } = {}) {", "\n}\n");
  ok("B7 basicActionTaken offers it", /^\s*provokeIfManipulate\(actor, action\);/m.test(taken));
  ok("B8 commitActionCost still goes through basicActionTaken",
    /async function commitActionCost\([^)]*\) \{\n  await basicActionTaken\(actor, action, \{ readied \}\);/.test(AW));
}

/* C */
{
  const prepared = AW.match(/if \(preparedPaysFor\) \{\n\s*await consumePreparedReaction\(actor, action\.key\);\n\s*provokeIfManipulate\(actor, action\);\n\s*\} else await commitActionCost/g) ?? [];
  ok("C1 both prepared-reaction payments offer it", prepared.length === 2, `found ${prepared.length}`);
  ok("C2 no prepared payment is left without it",
    !/if \(preparedPaysFor\) await consumePreparedReaction/.test(AW));
}

/* D */
{
  const consumed = (AW.match(/await consumePreparedReaction\(actor, action\.key\);/g) ?? []).length;
  ok("D1 the only prepared payments are the two above", consumed === 2, `found ${consumed}`);
}

console.log(`verify-manipulate-aoo-3703: ${checks - failures.length}/${checks} checks passed`);
if (failures.length) { for (const f of failures) console.log(`  FAIL ${f}`); process.exit(1); }
