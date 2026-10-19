#!/usr/bin/env node
/**
 * verify-ff30-block29 — 3.660.0, Fiends & Fables 3.0 block 29 (the Spectre and
 * the Sphinx; Graham, 18 October 2026: "Go with Option A for the ruling").
 *
 *   R3   the Spectre's Corruption on the after-strike rail: a degree's hit
 *        damage becomes Soul Drain; an immunity window opened on a degree; a
 *        row's follow-on condition (the thrall's Injured 10 for an hour)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (...p) => import(pathToFileURL(path.join(SYSTEM_ROOT, "module", ...p)).href);
const DS = await imp("combat", "declared-after-strikes.mjs");

const carrier = (row) => ({ flags: { "trg-prime": { afterStrikes: [row] } } });
const base = { key: "corruption", label: "Corruption", save: "will", onCriticalInjury: true };
{
  const s = DS.declaredAfterStrikes([carrier({ ...base, damageAsDrain: ["Success", "failure"], immuneOn: { degrees: ["critical"], seconds: 60 } })])[0];
  const t = DS.declaredAfterStrikes([carrier({ ...base, immuneOn: { seconds: 60 } })])[0];
  const u = DS.declaredAfterStrikes([carrier({ ...base, immuneOn: { degrees: ["critical"] } })])[0];
  equal("B1 the drain degrees and the immunity window are read; a window with no degree is none; its time defaults to a minute",
    [s.damageAsDrain, s.immuneOn, t.immuneOn, u.immuneOn.seconds, DS.declaredAfterStrikes([carrier(base)])[0].damageAsDrain], [["success", "failure"], { degrees: ["critical"], seconds: 60 }, null, 60, []]);
}
{
  const k = DS.afterStrikeImmunityKey("Scene.a.Token.b.Actor.c", "Corruption");
  equal("B2 the immunity is this creature's rider's, and lasts until its time", [k.includes("."), DS.afterStrikeImmune({ [k]: 160 }, k, 159), DS.afterStrikeImmune({ [k]: 160 }, k, 160), DS.afterStrikeImmune({}, k, 0), DS.afterStrikeImmune(null, k, 0)], [false, true, false, false, false]);
}
{
  const fo = { tags: [{ key: "injured", value: 10 }], seconds: 3600 };
  equal("B3 a row's follow-on rides its tag; one with no tags does not",
    [DS.declaredConditionTag({ key: "controlled", rounds: 1, followOn: fo }, { combatRound: 3 }).followOn, DS.declaredConditionTag({ key: "controlled", followOn: { tags: [] } }, {}).followOn ?? null, DS.declaredConditionTag({ key: "controlled", rounds: 1, followOn: fo }, { combatRound: 3 }).expiresRound],
    [fo, null, 4]);
}
const w = read("module", "combat", "declared-after-strikes-workflow.mjs");
ok("S1 a target still immune is passed over; the hit's damage reaches the save",
  /if \(afterStrikeImmune\(targetActor\.getFlag\?\.\(SYSTEM_ID, IMMUNE_FLAG\), afterStrikeImmunityKey\(actor\.uuid, spec\.key\), Number\(game\.time\?\.worldTime \?\? 0\)\)\) \{\n[^\n]*still immune[^\n]*\n\s+continue;/.test(w)
  && /rollDeclaredSave\(actor, targetActor, spec, level, critical, damageTaken\)/.test(w));
ok("S2 on a drain degree the damage is given back and laid as Soul Drain; on an immunity degree the window opens",
  /if \(spec\.damageAsDrain\?\.includes\(degree\) && taken > 0\) \{\n\s+const \{ healActor \} = await import\("\.\.\/magic\/spell-effects\.mjs"\);\n\s+await healActor\(targetActor, taken, \{ magical: true \}\);/.test(w)
  && /const drainTags = \[\{ key: "soulDrain", value: taken, label: conditionLabel\("soulDrain"\) \}\];/.test(w)
  && /if \(spec\.immuneOn\?\.degrees\.includes\(degree\) && targetActor\.setFlag\) \{/.test(w)
  && /\[afterStrikeImmunityKey\(actor\.uuid, spec\.key\)\]: Number\(game\.time\?\.worldTime \?\? 0\) \+ spec\.immuneOn\.seconds/.test(w));

// 3.660.1 — found live testing 3.660.0: Soul Drain at full HP struck twice.
const SD = await imp("conditions", "soul-drain.mjs");
equal("B4 a drain owes only what the fallen maximum's clamp did not take",
  [SD.soulDrainDamageAfterClamp(17, 79, 62), SD.soulDrainDamageAfterClamp(17, 70, 62), SD.soulDrainDamageAfterClamp(5, 21, 21), SD.soulDrainDamageAfterClamp(0, 79, 79)], [0, 9, 5, 0]);
ok("S3 the drain's card and damage use the stored HP; a clamp alone is written back",
  /const owed = soulDrainDamageAfterClamp\(damage, stored, derived\);\n\s+const hpBefore = Math\.max\(stored, derived\);/.test(read("module", "conditions", "condition-events-workflow.mjs"))
  && /const result = await applyDamageAndCheckDying\(actor, owed\);/.test(read("module", "conditions", "condition-events-workflow.mjs"))
  && /\} else if \(stored !== derived\) \{\n\s+await actor\.update\(\{ "system\.resources\.hp\.value": derived \}\);/.test(read("module", "conditions", "condition-events-workflow.mjs")));
const EXPECTED = 8;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block29: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block29: ${checks} checks\n  all pass\n`);
