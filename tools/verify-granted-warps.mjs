#!/usr/bin/env node
/**
 * verify-granted-warps — a feat may grant a warping option to the spells
 * it names (3.625.0): registerSpellWarps → grantedSpellWarps, matched by
 * name, trait, tradition and innateness; aggregated by the warp
 * arithmetic (castApDelta, extraTargets, and the new ignoreDailyLimit);
 * the cast offers them beside the spell's own; the daily-limit waiver
 * reaches the conditionRelief case.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const { grantedSpellWarps, warpsWithGranted } = await import(new URL("../module/magic/granted-warps.mjs", import.meta.url));
const { registerSpellWarps, registeredSpellWarps, registrationProblems } = await import(new URL("../module/module-api.mjs", import.meta.url));
const { aggregateWarpSelection, emptyWarp } = await import(new URL("../module/magic/spell-warp.mjs", import.meta.url));

const swift = { match: { traits: ["healing"] }, warp: { ppCost: 4, text: "Swift Mender: 1 AP less (minimum 1)", mods: { castApDelta: -1 } } };
const renewed = { match: { name: "Restoration" }, warp: { ppCost: 4, text: "Renewed Restoration: ignore the daily limit", mods: { ignoreDailyLimit: true } } };
const guiding = { match: { name: "Guidance", innate: true }, warp: { ppCost: 0, text: "Guiding Luminescence: a second target", mods: { extraTargets: 1 } } };
ok("A1 registerSpellWarps accepts well-formed entries", registerSpellWarps("Swift Mender", [swift], "test") && registerSpellWarps("Renewed Restoration", renewed, "test") && registerSpellWarps("Guiding Luminescence", [guiding], "test"));
ok("A2 it refuses an entry with no text or no mods", !registerSpellWarps("Bad", [{ match: {}, warp: { ppCost: 1 } }], "test") && registrationProblems().some((p) => /registerSpellWarps: "Bad"/.test(p)));
equal("A3 the record normalises the match and the warp", registeredSpellWarps("Guiding Luminescence"), [{ match: { name: "guidance", traits: [], tradition: "", innate: true }, warp: { ppCost: 0, text: "Guiding Luminescence: a second target", mods: { extraTargets: 1 }, max: 1 } }]);
equal("A4 an undeclared innate axis is null", registeredSpellWarps("Swift Mender")[0].match.innate, null);

const owned = [["swift mender", registeredSpellWarps("Swift Mender")], ["renewed restoration", registeredSpellWarps("Renewed Restoration")], ["guiding luminescence", registeredSpellWarps("Guiding Luminescence")]];
const cure = { name: "Cure", system: { traits: "Divinity, Healing", tradition: "divinity", warps: [{ ppCost: 2, text: "+1d8", mods: { healDice: "1d8" } }] } };
const restoration = { name: "Restoration", system: { traits: "Divinity, Healing", tradition: "divinity", warps: [] } };
const guidance = { name: "Guidance", system: { traits: "Divinity", tradition: "divinity", warps: [] } };
equal("B1 a Healing spell gets Swift Mender", grantedSpellWarps(owned, cure).map((w) => w.grantedBy), ["swift mender"]);
equal("B2 Restoration gets both Healing warps", grantedSpellWarps(owned, restoration).map((w) => w.grantedBy), ["swift mender", "renewed restoration"]);
equal("B3 an innate Guidance gets the second target; a learned one does not", [grantedSpellWarps(owned, guidance, { innate: true }).map((w) => w.grantedBy), grantedSpellWarps(owned, guidance, { innate: false }).map((w) => w.grantedBy)], [["guiding luminescence"], []]);
equal("B4 a spell matching nothing gets nothing", grantedSpellWarps(owned, { name: "Fireball", system: { traits: "Arcane, Fire", tradition: "arcane" } }), []);
equal("B5 every declared axis must hold (trait and tradition)", grantedSpellWarps([["x", [{ match: { traits: ["healing"], tradition: "verdant" }, warp: { ppCost: 1, text: "t", mods: {}, max: 1 } }]]], cure), []);
equal("B6 the granted warps follow the spell's own", warpsWithGranted(cure, grantedSpellWarps(owned, cure)).map((w) => w.text), ["+1d8", "Swift Mender: 1 AP less (minimum 1)"]);
ok("B7 a granted warp is a fresh object (mods not shared with the registry)", grantedSpellWarps(owned, cure)[0].mods !== registeredSpellWarps("Swift Mender")[0].warp.mods);

const list = warpsWithGranted(restoration, grantedSpellWarps(owned, restoration));
const agg = aggregateWarpSelection(list, { "warp-0": true, "warp-1": true });
equal("C1 ticking both granted warps spends 8 PP, 1 AP less, and waives the daily limit", [agg.ppSpent, agg.mods.castApDelta, agg.mods.ignoreDailyLimit], [8, -1, true]);
equal("C2 the empty mods carry the new key false", emptyWarp().mods.ignoreDailyLimit, false);
equal("C3 nothing ticked waives nothing", aggregateWarpSelection(list, {}).mods.ignoreDailyLimit, false);

const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
ok("D1 STRUCTURAL: the cast builds the granted warps from the actor's feats", /const grantedWarps = grantedSpellWarps\(/.test(cast) && /registeredSpellWarps\(i\.name\)/.test(cast));
ok("D2 STRUCTURAL: the chooser and both aggregations read the merged list", /buildWarpChooser\(warpSpell, basePP, \{ casterLevel \}\)/.test(cast) && /aggregateWarpSelection\(warpSpell\.system\?\.warps, form\)/.test(cast) && /promptWarpManipulation\(warpSpell, basePP, offer, casterLevel\)/.test(cast));
const effects = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");
ok("D3 STRUCTURAL: the relief case honours the waiver", /if \(!warpMods\?\.ignoreDailyLimit && alreadyRelievedToday\(reliefRecord, reliefSpec\.oncePerDay\)\)/.test(effects));
const api = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "module-api-workflow.mjs"), "utf8");
ok("D4 STRUCTURAL: registerSpellWarps is on the module api", /registerSpellWarps: \(featName, entries, moduleId\) => registerSpellWarps\(featName, entries, moduleId\)/.test(api));

const EXPECTED = 19;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-granted-warps: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-granted-warps: ${checks} checks — all green.`);
