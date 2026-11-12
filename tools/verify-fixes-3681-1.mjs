#!/usr/bin/env node
/**
 * verify-fixes-3681-1 — TRG Prime 3.681.1: what the Eldritch Arts 0.6.0 live
 * test of 3 November 2026 found, in code older than 3.681.0.
 *
 *   T  a check's total is its outcome's: no caller reads `.total` off a
 *      TRGCheck itself, which has none (the Death critical's save, every
 *      one a failure; an unwilling touch, every one a miss)
 *   D  the Death critical's save reads the outcome's total
 *   U  the unwilling touch reads the outcome's total
 *   L  a reactor who leaves the game is told apart from one who ran out of time
 *   Z  the version
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

/* T — every check's total is read off its outcome */
const files = walk(path.join(SYSTEM_ROOT, "module"));
const misreads = [];
let rolled = 0;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*await\s+TRGCheck\.roll\(/g)) {
    rolled += 1;
    const name = m[1];
    const body = text.slice(m.index + m[0].length, m.index + m[0].length + 6000);
    // A read of `name.total` or `name?.total` is a misread — unless it is only
    // the fallback after the outcome's, `?? name?.total`, which is harmless.
    for (const use of body.matchAll(new RegExp(`(\\?\\?\\s*)?\\b${name}\\??\\.total\\b`, "g"))) {
      if (use[1]) continue;
      const line = text.slice(0, m.index + m[0].length + use.index).split("\n").length;
      misreads.push(`${path.relative(SYSTEM_ROOT, file)}:${line} ${name}.total`);
    }
  }
}
ok("T1 the scan found the checks it is about", rolled >= 50, `${rolled} TRGCheck.roll results named`);
ok("T2 no caller reads a total off the check itself (a TRGCheck has none; its outcome has)", misreads.length === 0, misreads.join(", "));
const check = read("module", "dice", "check.mjs");
ok("T3 …and still has none: if TRGCheck ever grows a `total`, this whole scan is to be revisited",
  /export class TRGCheck\b/.test(check) && /this\.outcome\s*=/.test(check) && !/\n\s{2}get total\(\)/.test(check) && !/\bthis\.total\s*=/.test(check));

/* D — the Death critical */
const aw = read("module", "combat", "attack-workflow.mjs");
ok("D1 the Death critical's save reads the outcome's total, and the verdict and the card use it",
  /const saveTotal = saveRoll\?\.outcome\?\.total;[\s\S]{0,400}?const verdict = deathCriticalOutcome\(save, saveTotal, result, [^\n]*\n\s*lines\.push\(line\(\s*`\$\{targetActor\.name\} rolls <strong>\$\{saveTotal \?\? "—"\}<\/strong>/.test(aw));

const ds = await import(new URL("../module/combat/death-state.mjs", import.meta.url));
const dsave = { dc: 17, reduction: 10 };
ok("D2 (found in review) the save's degree decides, when it has one: a failed total converted to a success survives, a made total shifted to a failure dies",
  ds.deathCriticalOutcome(dsave, 12, 100, { saved: true }).died === false && ds.deathCriticalOutcome(dsave, 23, 100, { saved: false }).died === true);
ok("D3 …and with no degree the total against the DC decides, as before",
  ds.deathCriticalOutcome(dsave, 17, 100).died === false && ds.deathCriticalOutcome(dsave, 16, 100).died === true && ds.deathCriticalOutcome(dsave, undefined, 100).died === true);
ok("D4 the workflow hands the save's degree over",
  /const saveDegree = saveRoll\?\.outcome\?\.degree \?\? null;\s*const verdict = deathCriticalOutcome\(save, saveTotal, result, saveDegree \? \{ saved: Boolean\(saveDegree\.success\) \} : \{\}\);/.test(aw));

/* U — the unwilling touch */
const cw = read("module", "magic", "cast-workflow.mjs");
ok("U1 the unwilling touch reads the outcome's total", // RE-ANCHORED AT 3.682.0: the d20's face rides along (the natural 1 and 20).
  /const result = touchAttackOutcome\(Number\(touch\?\.outcome\?\.total \?\? 0\), defence(, \{ natural: [^}]+\})?\);/.test(cw));
const { touchAttackOutcome } = await import(new URL("../module/magic/spell-range.mjs", import.meta.url));
ok("U2 …which is what decides it: 18 against Defence 15 lands, 12 does not",
  typeof touchAttackOutcome === "function" ? (touchAttackOutcome(18, 15).landed === true && touchAttackOutcome(12, 15).landed === false) : false);

/* L — the reactor who leaves */
const ask = read("module", "reactions", "reaction-ask-workflow.mjs");
ok("L1 a reactor who disconnects is marked as having left, and told so",
  /entry\.resolve\(\{ answer: null, result: null, left: true \}\);/.test(ask)
  && ask.includes("out.left ? `${answererName} left the game — no reaction.` : `${answererName} did not answer in time — no reaction.`"));

/* Z — the version */
const sys = JSON.parse(read("system.json"));
// 3.681.1 OR LATER (3.681.2): these fixes stand in the releases after it.
const [zMaj, zMin, zPat] = String(sys.version).split(".").map(Number);
ok("Z 3.681.1 or later, and its download names it", (zMaj > 3 || (zMaj === 3 && (zMin > 681 || (zMin === 681 && zPat >= 1)))) && (sys.download ?? "").includes(`/v${sys.version}/`));

if (failures.length) {
  console.error(`verify-fixes-3681-1: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-fixes-3681-1: all ${checks} checks pass (${rolled} rolled checks scanned).`);
