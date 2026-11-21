#!/usr/bin/env node
/**
 * verify-live-findings-3705-2 — core 3.705.2: the defects the
 * player-perspective live test of 3.705.1 found (PC Tester, the "Test" world,
 * 21 November 2026).
 *
 *   A  A Lunge made with Vital Strike, Distracting Strike, Combat Grapple or
 *      Quick Draw posted no Lunge card: the four handlers returned nothing,
 *      and `runLunge` reads nothing as "cancelled". `struckOrNull`.
 *   B  Coup de Grace's card read "AV 11 — [object Object] critical", and
 *      "[object Object] critical" for a critical-immune target too.
 *      `coupDeGraceHitLine`.
 *   C  Reactive Disarm's button threw in Foundry V14
 *      (`game.user.updateTokenTargets is not a function`), so it could never
 *      be taken; and it marked the card and the round's use before the
 *      Disarm was tried, so a fumbler out of reach used it up for nothing.
 *      `reactiveDisarmTaken`.
 *   D  Disarm Block posted "turns the blow and grabs for the weapon" before
 *      its Disarm was refused for reach.
 *
 *   R  each defect reproduced against the pre-3.705.2 shape
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

// The workflow modules read these at load; nothing here calls Foundry.
globalThis.foundry ??= { applications: { api: { DialogV2: class {} } }, utils: {} };
globalThis.game ??= { settings: { get: () => null } };
globalThis.CONFIG ??= {};
globalThis.Hooks ??= { on() {}, once() {} };

function block(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return j < 0 ? "" : src.slice(i, j);
}

const { struckOrNull } = await mod("combat", "action-feats-workflow.mjs");
const { coupDeGraceAttackOutcome, coupDeGraceHitLine } = await mod("combat", "coup-de-grace.mjs");
const { reactiveDisarmTaken } = await mod("combat", "reactive-disarm-workflow.mjs");
const af = await mod("combat", "action-feats.mjs");

const AFW = read("module", "combat", "action-feats-workflow.mjs");
const AW = read("module", "combat", "action-workflow.mjs");
const RD = read("module", "combat", "reactive-disarm-workflow.mjs");
const RF = read("module", "combat", "reaction-feats-workflow.mjs");

/* R — the defects, as they were ------------------------------------------- */
{
  // A: `runLunge` posts its card only for a result that is not null/undefined;
  // a handler ending in `await card(...)` returns undefined.
  const handlerEndingInCard = async () => { await Promise.resolve("card"); };
  ok("R1 a handler that only awaits its card returns undefined", (await handlerEndingInCard()) === undefined);
  // B: the critical is an object, and a template prints an object as this.
  const out = coupDeGraceAttackOutcome(40, 10, {});
  ok("R2 the outcome's critical is an object", typeof out.critical === "object" && out.critical !== null);
  ok("R3 so the old template printed [object Object]", `${out.critical} critical` === "[object Object] critical");
  ok("R4 and an immune target still has one (3.548.0's ruling for a Strike)",
    coupDeGraceAttackOutcome(40, 10, { criticalImmune: true }).critical?.injuryImmune === true);
}

/* A — a feat's Lunge card ---------------------------------------------------- */
{
  const made = Object.assign([{ total: 12 }], { resolved: 1, refused: 0 });
  const refused = Object.assign([null], { resolved: 0, refused: 1 });
  const two = Object.assign([{ total: 9 }, null], { resolved: 1, refused: 1 });
  ok("A1 a Strike made: the Strikes come back", struckOrNull(made) === made);
  ok("A2 every Strike refused: null", struckOrNull(refused) === null);
  ok("A3 one of two made: the Strikes come back", struckOrNull(two) === two);
  ok("A4 nothing at all (no weapon): null", struckOrNull(undefined) === null && struckOrNull([]) === null);
  // Each feat a Lunge can be made with returns it. The list is the one the
  // Lunge chooser offers, so a feat added there without this fails here.
  const featKeys = af.lungeActionOptions({ featNames: ["Vital Strike", "Combat Grapple", "Distracting Strike", "Quick Draw"] })
    .filter((o) => o.kind === "feat").map((o) => o.key);
  equal("A5 the feats a Lunge is made with", [...featKeys].sort(), ["combat grapple", "distracting strike", "quick draw", "vital strike"]);
  const ends = ["\n  async \"", "\n  async ", "\n};\n"];
  for (const key of featKeys) {
    const start = `  async "${key}"(`;
    const i = AFW.indexOf(start);
    let j = AFW.length;
    for (const e of ends) { const k = AFW.indexOf(e, i + start.length); if (k > 0 && k < j) j = k; }
    const body = i < 0 ? "" : AFW.slice(i, j);
    ok(`A6 ${key} returns whether it struck`, /\n    return struckOrNull\(checks\);\n  \},?\s*$/.test(body), body.slice(-120));
  }
  const run = block(AFW, "async function runLunge(actor, item, entry) {", "\n}\n");
  ok("A7 runLunge's card still waits on a result", /if \(result === null \|\| result === undefined\) return result;\n\s+await card\(/.test(run));
}

/* B — Coup de Grace's line ---------------------------------------------------- */
{
  const hit = coupDeGraceAttackOutcome(40, 10, {});
  const line = coupDeGraceHitLine(hit, false);
  ok("B1 the severity is printed", line.includes(`<strong>${hit.critical.severity} critical</strong>`), line);
  ok("B2 never an object", !line.includes("[object Object]"));
  const immune = coupDeGraceHitLine(coupDeGraceAttackOutcome(40, 10, { criticalImmune: true }), true);
  ok("B3 immune: no critical, said", immune.includes("no critical (target is immune)") && !/critical<\/strong>/.test(immune), immune);
  const none = coupDeGraceHitLine({ av: 1, critical: null }, false);
  equal("B4 no critical and not immune: the AV alone", none, "<strong>Automatic hit</strong> (treated as an unmodified 20): AV 1.");
  ok("B5 the AV is the outcome's", line.includes(`AV ${hit.av}`));
  ok("B6 the card uses it", /lines\.push\(line\(coupDeGraceHitLine\(result, Boolean\(coupImmune\)\)\)\);/.test(AW)
    && /coupDeGraceHitLine,\n/.test(AW));
  ok("B7 and no longer prints the critical itself", !/\$\{result\.critical\}/.test(AW));
}

/* C — Reactive Disarm --------------------------------------------------------- */
{
  ok("C1 refused or cancelled: not taken", reactiveDisarmTaken(null) === false && reactiveDisarmTaken(undefined) === false);
  ok("C2 a Disarm that happened: taken", reactiveDisarmTaken({ id: "msg" }) === true);
  const press = block(RD, "async function pressReactiveDisarm(message) {", "\n}\n");
  ok("C3 the fumbler is targeted with Token#setTarget, as every reaction does",
    /if \(token && game\.user\) token\.setTarget\(true, \{ user: game\.user, releaseOthers: true \}\);/.test(press));
  ok("C4 nothing calls the V13 updateTokenTargets", !/\.updateTokenTargets\(/.test(RD));
  const tried = press.indexOf("const result = await resolveAction(defender, action, {});");
  const gate = press.indexOf("if (!reactiveDisarmTaken(result)) return null;");
  const used = press.indexOf("used: true");
  const round = press.indexOf("\"reactiveDisarmRound\", raw.round");
  ok("C5 the Disarm is tried first", tried > 0 && tried < gate);
  ok("C6 the card and the round are marked only after it was taken", gate > 0 && gate < used && gate < round);
  ok("C7 a press that took nothing leaves the button usable",
    /if \(!\(await pressReactiveDisarm\(message\)\)\) button\.disabled = false;/.test(RD));
}

/* D — Disarm Block's card ------------------------------------------------------ */
{
  const body = block(RF, "  async \"disarm block\"(reactor, ctx) {", "\n  },\n");
  const tried = body.indexOf("const result = disarm ? await resolveAction(reactor, { ...disarm, apCost: \"0\" }) : null;");
  const gate = body.indexOf("if (result === null || result === undefined) return;");
  const said = body.indexOf("await report(reactor, \"Disarm Block\"");
  ok("D1 the Disarm is tried first", tried > 0 && tried < gate);
  ok("D2 the card follows only a Disarm that happened", gate > 0 && gate < said);
  ok("D3 the card no longer says it is grabbing before it has", !/turns the blow and grabs for the weapon/.test(body));
}

const EXPECTED = 32;
checks += 1;
if (checks !== EXPECTED) failures.push(`Z the suite ran ${checks} checks, expected ${EXPECTED}`);
if (failures.length) {
  console.log(`verify-live-findings-3705-2: FAILED — ${failures.length} of ${checks}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-live-findings-3705-2: OK — ${checks} checks`);
