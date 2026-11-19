#!/usr/bin/env node
/**
 * verify-skirmish-3700 — core 3.700.0, Skirmish.
 *
 * The book: "Action 1 AP. You may take a Strike action and Step action
 * together for 1 AP. It matters not, which order you carry the actions
 * out in." Graham, 19 November 2026: "Skirmish is not working." It rolled
 * the Strike at once and granted no Step, so the drag after it was charged
 * as a Step of its own, and the Step could never come first.
 *
 *   A  the free Step (`skirmishLeg`), and that another action removes it
 *   B  when the card's Strike may still be made (`skirmishStrikeAllowed`)
 *   C  any Strike, melee or ranged
 *   D  the handler arms the Step and does not roll the Strike itself
 *   E  the card's Strike keeps the Step; the button is registered
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const af = await import(new URL("../module/combat/action-feats.mjs", import.meta.url));
const ad = await import(new URL("../module/combat/agile-display.mjs", import.meta.url));

/** The text of one block, from its opening line to the next sibling's. */
function block(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return j < 0 ? "" : src.slice(i, j);
}

/* A — the free Step ------------------------------------------------------- */
{
  const leg = af.skirmishLeg(5, 2);
  equal("A1 a 5-ft land Step, no reactions, counted as a Step", [leg.speedKey, leg.maxFeet, leg.provokes, leg.countsAs], ["land", 5, false, "step"]);
  equal("A2 a longer Step (a feat's) is the Step's own distance", af.skirmishLeg(10, 2).maxFeet, 10);
  equal("A3 no distance measured: still 5 ft", af.skirmishLeg(0, 2).maxFeet, 5);
  equal("A4 the pool after the 1 AP is kept", leg.apAtArm, 2);
  ok("A5 another action removes it (it is the same action as the Strike)", ad.nextActionLegLapses("compoundLeg", leg) === true);
  ok("A6 ...a reaction does not", ad.nextActionLegLapses("compoundLeg", leg, { reaction: true }) === false);
  ok("A7 ...an AP write below the pool at arming does", ad.nextActionLegLapses("compoundLeg", leg, { apNow: 1 }) === true);
  ok("A8 ...an AP write that leaves the pool alone does not", ad.nextActionLegLapses("compoundLeg", leg, { apNow: 2 }) === false);
}

/* B — the card's Strike --------------------------------------------------- */
{
  const rec = { used: false, combatId: "c1", round: 3, turn: 1, apAtArm: 2 };
  const now = { combatId: "c1", round: 3, turn: 1, ap: 2 };
  ok("B1 same turn, nothing else done: allowed (before or after the Step)", af.skirmishStrikeAllowed(rec, now).ok === true);
  ok("B2 already made: refused", af.skirmishStrikeAllowed({ ...rec, used: true }, now).ok === false);
  ok("B3 a later turn: refused", af.skirmishStrikeAllowed(rec, { ...now, turn: 2 }).ok === false);
  ok("B4 a later round: refused", af.skirmishStrikeAllowed(rec, { ...now, round: 4 }).ok === false);
  ok("B5 another combat: refused", af.skirmishStrikeAllowed(rec, { ...now, combatId: "c2" }).ok === false);
  ok("B6 another action spent AP since: refused", af.skirmishStrikeAllowed(rec, { ...now, ap: 1 }).ok === false);
  ok("B7 out of combat: allowed", af.skirmishStrikeAllowed({ used: false, combatId: null }, { combatId: null, ap: 0 }).ok === true);
  ok("B8 no record: refused", af.skirmishStrikeAllowed(null, now).ok === false);
}

/* C — any Strike ---------------------------------------------------------- */
const AFW = read("module", "combat", "action-feats-workflow.mjs");
{
  equal("C1 Skirmish keeps its 1 AP and single-Strike penalty rule", [af.ACTION_FEATS.skirmish.apCost, af.ACTION_FEATS.skirmish.map], ["1", af.MAP_RULES.single]);
  ok("C2 Skirmish is declared any-weapon", af.ACTION_FEATS.skirmish.anyWeapon === true);
  const melee = block(AFW, "const MELEE_WEAPON_FEATS = new Set([", "]);");
  ok("C3 ...and is not in the melee-only list", melee.length > 0 && !/"skirmish"/.test(melee));
  ok("C4 the any-weapon chooser is asked for it, before the AP",
    /: ANY_WEAPON_FEATS\.has\(state\.key\) \? await chooseAnyAttack\(actor, entry\.label\) : undefined;\n  if \(chosen === null\) return null;\n  if \(entry\.apCost !== "0"\)/.test(AFW));
  const STRIKE = read("module", "combat", "strike.mjs");
  const chooser = block(STRIKE, "export async function chooseAnyAttack(", "\n}\n");
  ok("C5 the chooser offers every ready attack, not only melee", /const ready = usableAttacks\(/.test(chooser) && !/=== "melee"\);\n/.test(chooser.split("const isMelee")[0]));
}

/* D — the handler ------------------------------------------------------- */
{
  const run = block(AFW, "  async skirmish(actor, item, entry, chosen = null) {", '  async "striding charge"(');
  ok("D1 the handler exists", run.length > 0);
  ok("D2 it no longer rolls the Strike itself", run.length > 0 && !/strikePlan\(/.test(run));
  ok("D3 it arms the free Step in combat, after the AP", /if \(combat\) \{\n\s+const \{ armCompoundLeg \}[^\n]*\n\s+await armCompoundLeg\(actor, skirmishLeg\(stepFeet, apAtArm\), entry\.label\);/.test(run));
  ok("D4 the Step's distance is the actor's Step", /const stepFeet = stepDistance\(actor\);/.test(run));
  ok("D5 the card carries the Strike button and the turn it belongs to",
    /data-action="skirmishStrike"/.test(run) && /combatId: combat\?\.id \?\? null, round: Number\(combat\?\.round \?\? 0\), turn: Number\(combat\?\.turn \?\? 0\)/.test(run) && /\n\s+apAtArm\n/.test(run));
}

/* E — the button -------------------------------------------------------- */
{
  const press = block(AFW, "async function pressSkirmishStrike(message) {", "export function registerSkirmishHooks()");
  ok("E1 the button checks the rule first", /const allowed = skirmishStrikeAllowed\(raw, \{/.test(press) && /if \(!allowed\.ok\) \{ ui\.notifications\.warn\([^\n]*\); return null; \}/.test(press));
  ok("E2 its Strike keeps the Step", /await strikePlan\(actor, weapon, "skirmish", \{ keepsStep: true \}\)/.test(press));
  ok("E3 used only once a Strike was made", /if \(checks\.resolved > 0\) await message\.setFlag\(SYSTEM_ID, "skirmish", \{ \.\.\.raw, used: true \}\);/.test(press));
  ok("E4 strikePlan passes keepsStep to the attack", /keepsStep = false \} = \{\}\) \{/.test(AFW) && /\n\s+keepsStep,\s+\/\/ Skirmish/.test(AFW));
  const AW = read("module", "combat", "attack-workflow.mjs");
  ok("E5 the attack does not remove the Step when asked to keep it", /const strikeTaken = async \(\) => \{\n    if \(keepsStep\) return;\n/.test(AW) && /\n  keepsStep = false,\n/.test(AW));
  const MAIN = read("scripts", "trg-prime.mjs");
  ok("E6 the button's hook is registered", /import \{ registerSkirmishHooks \} from "\.\.\/module\/combat\/action-feats-workflow\.mjs";/.test(MAIN) && /\n  registerSkirmishHooks\(\);\n/.test(MAIN));
}

const EXPECTED = 33;
checks += 1;
if (checks !== EXPECTED) failures.push(`Z the suite ran ${checks} checks, expected ${EXPECTED}`);
if (failures.length) {
  console.log(`verify-skirmish-3700: FAILED — ${failures.length} of ${checks}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-skirmish-3700: OK — ${checks} checks`);
