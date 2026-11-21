#!/usr/bin/env node
/**
 * verify-lunge-actions-3705 — core 3.705.0: the attack actions' reach, and
 * Lunge with any action with the attack trait.
 *
 * Graham, 20 November 2026:
 *   - Lunge with natural attacks: yes.
 *   - Lunge with any action with the attack trait (Trip, Disarm, Vital
 *     Strike …): yes.
 *   - Trip, Disarm, Shove, Grapple, Shield Bash, Aid and Coup de Grace could
 *     be used on a creature any distance away: "Add reach check + Lunge".
 *
 * The rules read (Core 3.7):
 *   reach (Ch. 11)   "A creature's reach is how far it can make melee attacks"
 *   Trip/Shove/Disarm traits  "This uses the weapon's reach (if different
 *                    from your own)"
 *   Grapple          "You can Grapple a target you already have grabbed"
 *   Aid Off./Def.    "You make a melee Strike against the target"
 *   Coup de Grace    "an adjacent helpless opponent"
 *   Reach trait      +5 ft, -2 at the extended distance (Graham's ruling);
 *                    never on a Lunge ("-1 only for lunge")
 *
 *   R  the defect reproduced: no action measured reach
 *   A  `actionReachVerdict`, every kind
 *   B  `actionWeaponExtension`
 *   C  `lungeActionOptions`: what a Lunge can be made with
 *   D  the Lunge scope: set for one action, always cleared
 *   E  the wiring: the reach check, its place before the AP, the exemptions,
 *      the Strike's merge, Charge, runLunge
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const ar = await import(new URL("../module/combat/action-reach.mjs", import.meta.url));
const af = await import(new URL("../module/combat/action-feats.mjs", import.meta.url));
const ls = await import(new URL("../module/combat/lunge-scope.mjs", import.meta.url));
const { BASIC_ACTIONS } = await import(new URL("../module/data/basic-actions.mjs", import.meta.url));

function block(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return j < 0 ? "" : src.slice(i, j);
}

const AW = read("module", "combat", "action-workflow.mjs");

/* R — the defect -------------------------------------------------------- */
{
  // 3.704.1's resolveAction never measured an action's reach: the only distance
  // it read was for Prone's +-4. A Trip at 30 ft went ahead.
  const v = ar.actionReachVerdict({ key: "tripAttack", distance: 30, ownReach: 5 });
  ok("R1 a Trip at 30 ft is now refused", v?.allowed === false && v.limit === 5);
  ok("R2 the check sits in resolveAction", /if \(ACTION_REACH\[action\.key\] && !reachExempt\) \{/.test(AW));
}

/* A — the verdicts ------------------------------------------------------ */
{
  const V = (o) => ar.actionReachVerdict({ ownReach: 5, ...o });
  equal("A1 Trip adjacent: allowed, no penalty", V({ key: "tripAttack", distance: 5 }), { allowed: true, limit: 5, reachPenalty: 0, extendedBy: null });
  equal("A2 Trip at 10 ft, no reach weapon: refused", V({ key: "tripAttack", distance: 10 }).allowed, false);
  equal("A3 Trip at 10 ft with a Trip-trait Reach weapon: allowed at the Reach -2",
    V({ key: "tripAttack", distance: 10, weaponExtension: 5 }), { allowed: true, limit: 10, reachPenalty: -2, extendedBy: "weapon" });
  // 3.705.1 (Graham's revised Lunge): the Lunge's Reach is the trait whole, -2 included.
  equal("A4 Trip at 10 ft as a Lunge: allowed, at the Reach -2", V({ key: "tripAttack", distance: 10, lunge: true }), { allowed: true, limit: 10, reachPenalty: -2, extendedBy: "lunge" });
  equal("A5 a Lunge with a Reach trait weapon gains nothing more; the -2 as before",
    V({ key: "tripAttack", distance: 10, weaponExtension: 5, lunge: true }), { allowed: true, limit: 10, reachPenalty: -2, extendedBy: "weapon" });
  equal("A5b a Lunge against an adjacent foe: no penalty", V({ key: "tripAttack", distance: 5, lunge: true }).reachPenalty, 0);
  equal("A6 a Lunge at 15 ft: refused", V({ key: "shoveAttack", distance: 15, lunge: true }).allowed, false);
  equal("A7 a Large creature's own 10 ft reach", V({ key: "grappleAttack", distance: 10, ownReach: 10 }).allowed, true);
  ok("A8 Grapple ignores a weapon's reach", V({ key: "grappleAttack", distance: 10, weaponExtension: 5 }).allowed === false);
  ok("A9 Grapple of a creature you already hold is never refused", V({ key: "grappleAttack", distance: 15, holdsTarget: true }).allowed === true);
  ok("A10 Shield Bash ignores a weapon's reach", V({ key: "shieldBash", distance: 10, weaponExtension: 5 }).allowed === false);
  equal("A11 Aid at 10 ft with a held Reach weapon: allowed at -2", V({ key: "aidOffensive", distance: 10, weaponExtension: 5 }).reachPenalty, -2);
  equal("A12 Coup de Grace: adjacent only", [V({ key: "coupDeGrace", distance: 5 }).allowed, V({ key: "coupDeGrace", distance: 10, ownReach: 10 }).allowed], [true, false]);
  ok("A13 Coup de Grace: a Lunge does not change adjacency", V({ key: "coupDeGrace", distance: 10, lunge: true }).allowed === false);
  equal("A14 no distance (no tokens): not measured", V({ key: "tripAttack", distance: null }), null);
  equal("A15 Escape and other actions are not measured", [V({ key: "escape", distance: 30 }), V({ key: "strike", distance: 30 })], [null, null]);
  equal("A16 a Tiny creature (reach 0) must share the square", [V({ key: "tripAttack", distance: 0, ownReach: 0 }).allowed, V({ key: "tripAttack", distance: 5, ownReach: 0 }).allowed], [true, false]);
  ok("A17 the refusal names the distance and the limit", ar.actionReachRefusal("Trip Attack", "Orc", 15, { limit: 10 }) === "Trip Attack: Orc is 15 ft away — beyond your reach (max 10 ft).");
  ok("A18 ...or adjacency", /must be adjacent/.test(ar.actionReachRefusal("Coup de Grace", "Orc", 10, { limit: 5, adjacentOnly: true })));
  const keys = Object.keys(ar.ACTION_REACH).sort();
  equal("A19 the measured actions", keys, ["aidDefensive", "aidOffensive", "coupDeGrace", "disarmAttack", "grappleAttack", "shieldBash", "shoveAttack", "tripAttack"]);
  ok("A20 every measured action is a basic action with the Attack trait",
    keys.every((k) => /\bAttack\b/.test(BASIC_ACTIONS.find((a) => a.key === k)?.traits ?? "")));
}

/* B — the weapon's reach ------------------------------------------------ */
{
  const w = (name, system) => ({ type: "weapon", name, system: { equipped: true, attackMode: "melee", ...system } });
  const items = [
    w("Guisarme", { traits: "Reach, Trip" }),
    w("Whip", { traits: "Disarm, Reach, Trip", reachFeet: 15 }),
    w("Glaive", { traits: "Deadly, Reach" }),
    w("Longbow", { attackMode: "missile", traits: "Reach" }),
    { type: "weapon", name: "Sheathed Halberd", system: { equipped: false, attackMode: "melee", traits: "Reach, Trip" } }
  ];
  equal("B1 Trip: the longest Trip-trait weapon's reach (the Whip's 15 ft = +10)", ar.actionWeaponExtension("tripAttack", items), 10);
  equal("B2 Shove: no Shove-trait weapon, no extension", ar.actionWeaponExtension("shoveAttack", items), 0);
  equal("B3 Disarm: the Whip", ar.actionWeaponExtension("disarmAttack", items), 10);
  equal("B4 Aid: any held melee Reach weapon", ar.actionWeaponExtension("aidDefensive", [items[2]]), 5);
  equal("B5 Grapple: none", ar.actionWeaponExtension("grappleAttack", items), 0);
  equal("B6 a sheathed weapon or a bow adds nothing", ar.actionWeaponExtension("tripAttack", [items[3], items[4]]), 0);
}

/* C — what a Lunge can be made with ------------------------------------- */
{
  const opts = af.lungeActionOptions({ featNames: ["Vital Strike", "Quick Draw", "Swipe", "Lunge"] });
  equal("C1 Strike first", opts[0], { kind: "strike", key: "strike", label: "Strike" });
  const keys = opts.map((o) => o.key);
  for (const k of ["doubleSlice", "charge", "tripAttack", "disarmAttack", "shoveAttack", "grappleAttack", "shieldBash", "aidOffensive", "aidDefensive", "improvisedAttack"]) {
    ok(`C2 ${k} is offered`, keys.includes(k));
  }
  ok("C3 every basic action offered carries the Attack trait",
    opts.filter((o) => o.kind === "basic").every((o) => /\bAttack\b/.test(BASIC_ACTIONS.find((a) => a.key === o.key)?.traits ?? "")));
  ok("C4 the feats this character has, and only those", keys.includes("vital strike") && keys.includes("quick draw") && !keys.includes("combat grapple"));
  ok("C5 not Coup de Grace, Escape, the reactions, Fight Defensively, Swipe",
    !["coupDeGrace", "escape", "attackOfOpportunity", "fightDefensively", "swipe"].some((k) => keys.includes(k)));
  equal("C6 the labels are the actions' own names",
    opts.filter((o) => o.kind === "basic").every((o) => BASIC_ACTIONS.find((a) => a.key === o.key)?.name === o.label), true);
}

/* D — the scope --------------------------------------------------------- */
{
  const actor = { uuid: "Actor.x" };
  const terms = af.lungeStrikeTerms();
  ok("D1 nothing in scope outside a Lunge", ls.lungeScopeFor(actor) === null);
  let inside = null;
  const out = await ls.withLunge(actor, terms, async () => { inside = ls.lungeScopeFor(actor); return 7; });
  ok("D2 in scope during the action, and its result returned", inside === terms && out === 7);
  ok("D3 cleared afterwards", ls.lungeScopeFor(actor) === null);
  try { await ls.withLunge(actor, terms, async () => { throw new Error("cancelled"); }); } catch { /* expected */ }
  ok("D4 cleared after a failure too", ls.lungeScopeFor(actor) === null);
  ok("D5 another actor is not in scope", await ls.withLunge(actor, terms, async () => ls.lungeScopeFor({ uuid: "Actor.y" })) === null);
}

/* E — the wiring ------------------------------------------------------- */
{
  const gate = AW.indexOf("if (ACTION_REACH[action.key] && !reachExempt) {");
  const target = AW.indexOf("const targetActor = presetDispel ? null : firstTargetActor();");
  const spend = AW.indexOf("if (!(await ensureActionPoints(actor, action.apCost, action.name, { traits: action.traits }))) return null;", gate);
  ok("E1 the check comes after the target is read and before any AP is spent", target > 0 && gate > target && spend > gate);
  const body = AW.slice(gate, gate + 3000);
  ok("E2 refused with the reason, returning nothing", /if \(verdict && !verdict\.allowed\) \{\n\s+ui\.notifications\.warn\(actionReachRefusal\(action\.name, targetActor\.name, distance, verdict\)\);\n\s+return null;/.test(body));
  ok("E3 measured from this actor's token to the targeted token, a rider at the pair's reach",
    /const distance = distanceBetween\(mine, targetToken\);/.test(body) && /mountedReach\(/.test(body));
  ok("E4 the weapon's reach, the Lunge and a held target all reach the verdict",
    /weaponExtension: actionWeaponExtension\(action\.key, Array\.from\(actor\.items \?\? \[\]\)\)/.test(body) && /lunge: Boolean\(lunging\)/.test(body) && /holdsTarget: targetActor\.getFlag\?\.\(SYSTEM_ID, "grabbedBy"\)\?\.uuid === actor\.uuid/.test(body));
  ok("E5 the Reach -2 reaches the check, unless the Lunge's stance waives it", /\.\.\.actionReachRows,/.test(AW) && /if \(lunging\) actionReachRows\.push\(\.\.\.\(lunging\.extraModifiers \?\? \[\]\)\);/.test(body)
    && /if \(verdict\?\.reachPenalty && !lunging\?\.waiveReachPenalty\) actionReachRows\.push\(/.test(body));
  ok("E6 a Lunge does not reach adjacency", /const lunging = ACTION_REACH\[action\.key\]\.kind === "adjacent" \? null : lungeScopeFor\(actor\);/.test(body));
  ok("E7 the positional setting switches it off, as for a Strike", /game\.settings\.get\(SYSTEM_ID, "positionalAutomation"\) !== false/.test(body));
  const RF = read("module", "combat", "reaction-feats-workflow.mjs");
  const RD = read("module", "combat", "reactive-disarm-workflow.mjs");
  // Graham, 20 Nov 2026: "Yes disarm does use reach" — the reaction Disarms are measured.
  ok("E8 the reactions' Aid and Shove are exempt; their Disarms are not",
    (RF.match(/\{ reachExempt: true \}/g) ?? []).length === 2
    && /if \(disarm\) await resolveAction\(reactor, \{ \.\.\.disarm, apCost: "0" \}\);/.test(RF)
    && /return resolveAction\(defender, action, \{\}\);/.test(RD) && !/reachExempt/.test(RD));
  const AWK = read("module", "combat", "attack-workflow.mjs");
  const merge = block(AWK, "  // A LUNGE WITH ANOTHER ATTACK ACTION (3.705.0", "  const viaRefused");
  ok("E9 a Strike in a Lunge's action gains Reach, its -2 waived only in the stance; not a reaction; melee only",
    /const lunging = \(isReaction \|\| asReaction\) \? null : lungeScopeFor\(actor\);/.test(merge)
    && /if \(lunging && \(weapon\?\.system\?\.attackMode \?\? "melee"\) === "melee"\) \{/.test(merge)
    && /grantTraits = \[\.\.\.grantTraits, \.\.\.\(lunging\.grantTraits \?\? \[\]\)\];/.test(merge)
    && /if \(lunging\.waiveReachPenalty\) waiveReachPenalty = true;/.test(merge)
    && /extraModifiers = \[\.\.\.extraModifiers, \.\.\.\(lunging\.extraModifiers \?\? \[\]\)\];/.test(merge));
  const CW = read("module", "combat", "charge-workflow.mjs");
  ok("E10 a Charge records its Lunge, and its Strike on arrival uses it",
    /\{ lunge: lungeScopeFor\(actor\) \}\);/.test(AW) && /\.\.\.\(lunge \? \{ lunge \} : \{\}\)/.test(CW)
    && /const reach = reachOf\(chargerToken\?\.object \?\? chargerToken\) \+ \(lunge \? 5 : 0\);/.test(CW)
    && /extraModifiers: \[chargeStrikeModifier\(\), \.\.\.\(lunge\?\.extraModifiers \?\? \[\]\)\],/.test(CW)
    && /\.\.\.\(lunge \? \{ grantTraits: lunge\.grantTraits \?\? \["Reach"\], waiveReachPenalty: Boolean\(lunge\.waiveReachPenalty\) \} : \{\}\)/.test(CW));
  const AFW = read("module", "combat", "action-feats-workflow.mjs");
  const run = block(AFW, "async function runLunge(actor, item, entry) {", "\n}\n");
  ok("E11 runLunge asks which action before anything", /const options = lungeActionOptions\(\{ featNames \}\);/.test(run) && /if \(!pick\) return null;/.test(run));
  ok("E12 a basic action runs as the sheet starts it, in the Lunge's scope",
    /result = await withLunge\(actor, terms, \(\) => resolveAction\(actor, action, \{\n\s+invokedSkillKey: actionNeedsSkillChoice\(action\) \? null : \(action\.skills\?\.\[0\] \?\? null\)/.test(run));
  ok("E13 a feat runs as its own Use, in the scope", /result = await withLunge\(actor, terms, \(\) => runActionFeat\(actor, feat\)\);/.test(run));
  ok("E14 the stance's negation reaches it", /const terms = lungeStrikeTerms\(\{ lungingStance \}\);/.test(run));
  const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes;
  const n3 = fixes.find((f) => f.id === "lunge-note-3705");
  ok("E16 Lunge's note now offers any attack action, the 3.704.1 row retired to it",
    /Attack trait/.test(n3?.to ?? "") && !/-2/.test(n3?.to ?? "-2") && fixes.find((f) => f.id === "lunge-note-3704-1")?.supersededBy === "lunge-note-3705");
  ok("E15 the Lunge card only after an action that happened", /if \(result === null \|\| result === undefined\) return result;\n\s+await card\(/.test(run));
}

const EXPECTED = 66;
checks += 1;
if (checks !== EXPECTED) failures.push(`Z the suite ran ${checks} checks, expected ${EXPECTED}`);
if (failures.length) {
  console.log(`verify-lunge-actions-3705: FAILED — ${failures.length} of ${checks}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-lunge-actions-3705: OK — ${checks} checks`);
