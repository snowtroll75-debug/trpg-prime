#!/usr/bin/env node
/**
 * verify-quick-draw-3702 — core 3.702.0, Quick Draw.
 *
 * The book: "You draw your melee or thrown weapon and attack with the same
 * motion … You use a 1 AP to Interact and Strike with your weapon." Graham,
 * 19 November 2026: "Quick Draw is not working". It offered only the weapons
 * already in hand, so it was a plain 1 AP Strike that drew nothing.
 *
 *   A  which weapons can be drawn (`drawableWeapons`, pure)
 *   B  the chooser: none → warned, one → no dialog, several → asked
 *   C  the order: weapon, grip and a free hand settled before the AP
 *   D  the draw: equipped (out of any sack, with its grip), then the Strike
 *      with that weapon, and it stays drawn when the Strike is refused
 *   E  the table entry and the melee-chooser list
 *   G  the version
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

/* A — which weapons ------------------------------------------------------ */
const { drawableWeapons } = await mod("combat", "strike.mjs");
{
  const w = (name, system) => ({ type: "weapon", name, system });
  const items = [
    w("Longsword (held)", { attackMode: "melee", equipped: true }),
    w("Scimitar", { attackMode: "melee", equipped: false }),
    w("Dagger", { attackMode: "melee", traits: "Agile, Finesse, Thrown 10 ft", equipped: false }),
    w("Javelin", { attackMode: "thrown", equipped: false }),
    w("Longbow", { attackMode: "missile", equipped: false }),
    w("Light Crossbow", { attackMode: "ranged", equipped: false }),
    w("Bite", { attackMode: "melee", natural: true, equipped: false }),
    w("Rapier (in the sack)", { attackMode: "melee", equipped: false, stowed: true }),
    w("Club (no mode)", { equipped: false }),
    w("Throwing Axe (ranged, Thrown trait)", { attackMode: "ranged", traits: "Thrown 20 ft", equipped: false }),
    { type: "equipment", name: "Shield", system: { equipped: false } }
  ];
  equal("A1 the weapons not in hand that are melee or thrown",
    drawableWeapons(items).map((i) => i.name),
    ["Scimitar", "Dagger", "Javelin", "Rapier (in the sack)", "Club (no mode)", "Throwing Axe (ranged, Thrown trait)"]);
  ok("A2 a weapon already in hand is not drawn again", !drawableWeapons(items).some((i) => i.name === "Longsword (held)"));
  ok("A3 a bow or a crossbow is neither melee nor thrown", !drawableWeapons(items).some((i) => /bow/i.test(i.name)));
  ok("A4 a natural attack is never drawn", !drawableWeapons(items).some((i) => i.name === "Bite"));
  ok("A5 a melee weapon with the Thrown trait counts", drawableWeapons(items).some((i) => i.name === "Dagger"));
  ok("A5b so does any weapon with the Thrown trait, whatever its mode", drawableWeapons(items).some((i) => /Throwing Axe/.test(i.name)));
  equal("A6 nothing to draw: an empty list", drawableWeapons([items[0], items[4]]), []);
}

/* B — the chooser ---------------------------------------------------------- */
const strikeSrc = read("module", "combat", "strike.mjs");
{
  const body = strikeSrc.slice(strikeSrc.indexOf("export async function chooseWeaponToDraw"), strikeSrc.indexOf("export async function chooseAnyAttack"));
  ok("B1 none to draw: warned and refused", /if \(!drawable\.length\) \{\s*ui\.notifications\.warn\([^;]*no melee or thrown weapon to draw[^;]*;\s*return null;\s*\}/.test(body));
  ok("B2 exactly one: no dialog", /if \(drawable\.length === 1\) return drawable\[0\];/.test(body));
  ok("B3 several: asked, and a cancel is null", /DialogV2\.wait\(/.test(body) && /if \(picked === null \|\| picked === undefined \|\| picked === "cancel"\) return null;/.test(body));
  ok("B4 it chooses among the drawable weapons", /const drawable = drawableWeapons\(Array\.from\(actor\?\.items \?\? \[\]\)\);/.test(body));
}

/* C — settled before the AP ------------------------------------------------- */
const wf = read("module", "combat", "action-feats-workflow.mjs");
{
  const run = wf.slice(wf.indexOf("if (entry.draws) {"), wf.indexOf("const chosen = MELEE_WEAPON_FEATS"));
  const drawAt = run.indexOf("const drawn = await readyToDraw(actor, entry.label);");
  const refuseAt = run.indexOf("if (!drawn) return null;");
  const payAt = run.indexOf("await spendActionCost(actor, entry.apCost, entry.label, { traits: entry.traits });");
  ok("C1 a drawing feat settles its weapon first", run.length > 0 && drawAt > 0);
  ok("C2 ...refuses at no cost when nothing is ready", refuseAt > drawAt && payAt > refuseAt);
  ok("C3 ...and only then pays its AP", payAt > drawAt);
  ok("C4 ...and hands the drawn weapon to its handler", /return run \? run\(actor, item, entry, drawn\) : null;/.test(run));
  const ready = wf.slice(wf.indexOf("async function readyToDraw"), wf.indexOf("const RUN = {"));
  ok("C5 the Hand & a Half grip is asked, and a cancel costs nothing",
    /if \(isHandAndAHalf\(weapon\.system\?\.traits\)\) \{\s*grip = await promptTwoHandedGrip\(weapon\.name, Boolean\(weapon\.system\?\.twoHandedGrip\)\);\s*if \(grip === null\) return null;/.test(ready));
  ok("C6 a free hand is tested with the sheet's own canEquip, against the chosen grip",
    /const hands = canEquip\(actor, asHeld\);\s*if \(!hands\.allowed\) \{\s*ui\.notifications\.warn\([^;]*hands\.reason[^;]*;\s*return null;\s*\}/.test(ready));
}

/* D — the draw and the Strike ----------------------------------------------- */
{
  const h = wf.slice(wf.indexOf('async "quick draw"'), wf.indexOf('async "reverse strike"'));
  ok("D1 the weapon is put in hand", /const changes = \{ "system\.equipped": true \};/.test(h) && /await weapon\.update\(changes\);/.test(h));
  ok("D2 ...out of any sack", /if \(weapon\.system\?\.stowed\) changes\["system\.stowed"\] = false;/.test(h));
  ok("D3 ...with the grip chosen", /changes\["system\.twoHandedGrip"\] = drawn\.grip;/.test(h));
  ok("D4 ...before the Strike, which is made with it", h.indexOf("await weapon.update(changes);") < h.indexOf('await strikePlan(actor, weapon, "quick draw");') && h.indexOf("await weapon.update(changes);") > 0);
  ok("D5 the card names the weapon drawn", /draws <strong>\$\{esc\(weapon\?\.name \?\? "a weapon"\)\}<\/strong> and strikes in one motion/.test(h));
  // 3.706.0 (Graham: a refused Strike costs a Strike feat nothing): no Strike, no draw, no AP.
  ok("D6 a refused Strike puts the weapon back, and says so", /const unmade = !checks\.resolved;\n\s+if \(unmade && weapon && before\) await weapon\.update\(before\);/.test(h)
    && /goes back where it was: no Strike, so no draw/.test(h) && /const before = weapon \? quickDrawRestore\(weapon\.system\) : null;/.test(h));
  ok("D7 no fallback to a weapon already in hand", !/meleeWeapon\(actor\)/.test(h));
}

/* E — the table ------------------------------------------------------------- */
{
  const { ACTION_FEATS } = await mod("combat", "action-feats.mjs");
  const qd = ACTION_FEATS["quick draw"];
  equal("E1 Quick Draw: 1 AP, Expert and Martial, one Strike, draws", [qd?.apCost, qd?.traits, qd?.draws], ["1", "Expert, Martial", true]);
  ok("E2 no other feat draws", Object.entries(ACTION_FEATS).filter(([, e]) => e.draws).map(([k]) => k).join() === "quick draw");
  const melee = /const MELEE_WEAPON_FEATS = new Set\(\[([\s\S]*?)\]\);/.exec(wf)?.[1] ?? "";
  ok("E3 Quick Draw left the held-melee chooser", !/"quick draw"/.test(melee) && /"swipe"/.test(melee));
}

/* G — the version ----------------------------------------------------------- */
{
  const sys = JSON.parse(read("system.json"));
  equal("G1 the version and the download name 3.707.2", [sys.version, sys.download, JSON.parse(read("package.json")).version],
    ["3.707.2", "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.707.2/trg-prime.zip", "3.707.2"]);
}

console.log(`verify-quick-draw-3702: ${checks} checks${failures.length ? ` — ${failures.length} FAILED` : " — all green."}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
