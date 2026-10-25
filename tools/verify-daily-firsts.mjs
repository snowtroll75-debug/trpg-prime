#!/usr/bin/env node
/**
 * verify-daily-firsts — 3.664.0: "the first time each day" (Inner Tempest's
 * Centred Recovery and Tianzhi Discipline). See module/daily-firsts.mjs.
 *
 *   A  the degree of the day's first Refocus
 *   B  the multiplier on the day's first Power Recovery
 *   C  the wiring: action roll, rest, daily preparation
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const df = await import(new URL("../module/daily-firsts.mjs", import.meta.url));
const C = (name, dailyFirst) => ({ name, flags: { "trg-prime": { dailyFirst } } });

const centred = C("Centred Recovery", [{ action: "refocus", improve: 1, max: "critical" }, { action: "powerRecovery", multiplier: 2 }]);
const discipline = C("Tianzhi Discipline", { action: "refocus", set: "critical" });
const deg = (carriers, d, spent = false) => df.dailyFirstDegree(carriers, "refocus", d, spent)?.degree ?? null;

equal("A1 one step better, to a maximum of Critical", [deg([centred], "failure"), deg([centred], "success"), deg([centred], "critical"), deg([centred], "heroic")], ["partial", "critical", "critical", "heroic"]);
equal("A2 spent today, nothing changes", deg([centred], "failure", true), null);
equal("A3 Tianzhi Discipline treats it as a Critical, and never worse than the roll", [deg([discipline], "blunder"), deg([discipline], "heroic")], ["critical", "heroic"]);
equal("A4 a set row wins over an improve row", deg([centred, discipline], "failure"), "critical");
equal("A5 two improvers add up, still capped", deg([centred, C("Other", { action: "refocus", improve: 1 })], "fumble"), "partial");
equal("A6 another action is untouched; a bad degree is untouched", [df.dailyFirstDegree([centred], "search", "failure"), df.dailyFirstDegree([centred], "refocus", "nonsense")], [null, null]);
equal("A7 the labels say who did it", df.dailyFirstDegree([centred], "refocus", "failure").labels, ["Centred Recovery"]);
equal("A8 spent is read from the actor's record", [df.dailyFirstSpent({ dailyFirsts: { refocus: true } }, "refocus"), df.dailyFirstSpent({}, "refocus"), df.dailyFirstSpent(undefined, "refocus")], [true, false, false]);

equal("B1 the first Power Recovery doubles; spent, it does not", [df.dailyFirstMultiplier([centred], "powerRecovery"), df.dailyFirstMultiplier([centred], "powerRecovery", true), df.dailyFirstMultiplier([], "powerRecovery")], [2, 1, 1]);
equal("B2 the kinds are kept apart", [df.hasDailyFirst([centred], "refocus", "degree"), df.hasDailyFirst([centred], "powerRecovery", "degree"), df.hasDailyFirst([centred], "powerRecovery", "multiplier"), df.hasDailyFirst([discipline], "refocus", "multiplier")], [true, false, true, false]);

const aw = read("module", "combat", "action-workflow.mjs");
ok("C1 the action's degree takes the day's first before the outcome is read", /const dailyFirst = firstCarriers\s*\? dailyFirstDegree\(firstCarriers, action\.key, attitudeImproved, dailyFirstSpent\(actor\.flags\?\.\[SYSTEM_ID\], action\.key\)\)\s*: null;/.test(aw) && /declaredDegree\(declaredOutcomeKeys\(action\), dailyFirst\?\.degree \?\? attitudeImproved, DEGREES\)/.test(aw));
ok("C2 …only for degree rows, and spends the first whatever it did", /hasDailyFirst\(declarationCarriers\(actor\), action\.key, "degree"\)/.test(aw) && /if \(firstCarriers && !dailyFirstSpent\(actor\.flags\?\.\[SYSTEM_ID\], action\.key\)\) \{\s*await actor\.setFlag\(SYSTEM_ID, DAILY_FIRSTS_FLAG, \{ \.\.\.\(actor\.getFlag\(SYSTEM_ID, DAILY_FIRSTS_FLAG\) \?\? \{\}\), \[action\.key\]: true \}\);/.test(aw));
ok("C3 …and the card says so", /if \(dailyFirstNote\) lines\.push\(line\(dailyFirstNote\)\);/.test(aw));
const rw = read("module", "rest", "rest-workflow.mjs");
ok("C4 the rest's first Power Recovery is multiplied and spent", /if \(hasDailyFirst\(carriers, "powerRecovery", "multiplier"\) && !dailyFirstSpent\(actor\.flags\?\.\[SYSTEM_ID\], "powerRecovery"\)\) \{\s*bonus \*= dailyFirstMultiplier\(carriers, "powerRecovery", false\);\s*await actor\.setFlag\(SYSTEM_ID, DAILY_FIRSTS_FLAG/.test(rw));
ok("C5 daily preparation starts a new day's firsts", /if \(actor\.getFlag\?\.\("trg-prime", DAILY_FIRSTS_FLAG\)\) await actor\.unsetFlag\("trg-prime", DAILY_FIRSTS_FLAG\);/.test(read("module", "uses-workflow.mjs")));

const EXPECTED = 16;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-daily-firsts: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-daily-firsts: ${checks} checks — all green.`);
