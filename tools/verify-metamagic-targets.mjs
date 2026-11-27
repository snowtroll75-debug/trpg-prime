#!/usr/bin/env node
/**
 * verify-metamagic-targets — Graham's answers of 27 November 2026, as built
 * in 3.717.0. NEW at 3.717.0.
 *
 *   O4 "Should be automated": Selective Spell, Split Spell, Aligned Spell and
 *      Imposing Will now decide who the cast affects (A, I, S, X, W).
 *   O5 "Need building": Geas's three warps and Pass Without Trace's area warp
 *      carry structured mods (G, P).
 *   O6 "Needs checking": Unshakable's "(arcane only)" touch warp is refused to
 *      a caster outside the arcane tradition, before anything is spent (T).
 *
 * The rules are driven through the real functions; the cast workflow is
 * checked for each one's wiring at the point where it must sit (W).
 *
 * Paired with mutate-metamagic-targets.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: { wait: async () => null } }, ux: {} }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), hasProperty: () => false, escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
globalThis.Hooks = globalThis.Hooks ?? { on() {}, once() {}, off() {}, callAll() {}, call() { return true; } };
globalThis.ui = globalThis.ui ?? { notifications: { warn() {}, info() {}, error() {} } };

const MM = await imp("magic/metamagic.mjs");
const MT = await imp("magic/metamagic-targets.mjs");
const TI = await imp("magic/spell-trait-immunity.mjs");
const SW = await imp("magic/spell-warp.mjs");
const TG = await imp("magic/tradition-gate.mjs");

const FEATS = ["aligned spell", "imposing will", "selective spell", "split spell"];
const opts = (spellData, more = {}) => MM.buildMetamagicOptions({ featNames: FEATS, spellData, basePP: 4, casterLevel: 10, tradition: "divinity", charisma: 3, ...more });
const opt = (spellData, id, more) => opts(spellData, more).find((o) => o.id === id);

/* ================================================================== */
/* A — Aligned Spell                                                   */
/* ================================================================== */
{
  const al = opt({}, "aligned");
  ok("A1 offered to a divine caster", Boolean(al));
  ok("A2 …not to an arcane one ('Divine Caster only')", !opt({}, "aligned", { tradition: "arcane" }));
  equal("A3 the choice is the purchase: four traits at +1, six pairs at +2",
    [al?.kind, al?.select, al?.choices?.length, al?.choices?.filter((c) => c.ppCost === 1).length, al?.choices?.filter((c) => c.ppCost === 2).length],
    ["select", "aligned", 10, 4, 6]);
  equal("A4 the feat's four traits, and not balance", al?.choices?.filter((c) => c.ppCost === 1).map((c) => c.value), ["chaos", "evil", "good", "order"]);
  const one = MM.aggregateMetamagicSelection([al], { "mm-aligned": "evil" });
  equal("A5 one trait: +1 PP, the cast carries it", [one.ppSpent, one.alignedTraits], [1, ["evil"]]);
  const two = MM.aggregateMetamagicSelection([al], { "mm-aligned": "chaos+evil" });
  equal("A6 two traits: +2 PP, both carried", [two.ppSpent, two.alignedTraits], [2, ["chaos", "evil"]]);
  equal("A7 nothing chosen: nothing paid, nothing carried", [MM.aggregateMetamagicSelection([al], {}).ppSpent, MM.aggregateMetamagicSelection([al], {}).alignedTraits], [0, []]);
  const fiend = { name: "Fiend", t: ["evil", "chaos"] }, paladin = { name: "Paladin", t: ["good"] }, wolf = { name: "Wolf", t: [] };
  const part = MT.alignedPartition([fiend, paladin, wolf], ["evil"], (a) => a.t);
  equal("A8 only a creature with a chosen trait is affected", part.kept.map((a) => a.name), ["Fiend"]);
  equal("A9 the rest are passed by and named", part.skipped.map((s) => s.name), ["Paladin", "Wolf"]);
  equal("A10 either of two traits will do", MT.alignedPartition([fiend, paladin, wolf], ["good", "chaos"], (a) => a.t).kept.map((a) => a.name), ["Fiend", "Paladin"]);
  equal("A11 no traits chosen keeps everyone", MT.alignedPartition([fiend, wolf], [], (a) => a.t).kept.length, 2);
}

/* ================================================================== */
/* I — Imposing Will                                                   */
/* ================================================================== */
{
  const iw = opt({ traits: "Enchantment, Mental" }, "imposingWill");
  equal("I1 a select the cast reads", [iw?.kind, iw?.select], ["select", "imposingWill"]);
  const agg = MM.aggregateMetamagicSelection([iw], { "mm-imposingWill": "undead" });
  equal("I2 the type's own cost, and the type carried", [agg.ppSpent, agg.imposingType], [8, "undead"]);
  ok("I3 it overcomes a mental-family immunity of its type", MT.imposingWillOvercomes("mental", true) && MT.imposingWillOvercomes("fear", true) && MT.imposingWillOvercomes("emotion", true));
  ok("I4 …not another trait's, nor another type's", !MT.imposingWillOvercomes("essence", true) && !MT.imposingWillOvercomes("mental", false));
  // The real gate, with a Mindless undead and a Mindless construct.
  const zombie = { name: "Zombie", system: { details: { traits: "Undead, Mindless", creatureType: "undead" } } };
  const golem = { name: "Golem", system: { details: { traits: "Construct, Mindless", creatureType: "construct" } } };
  const none = TI.partitionTraitImmune([zombie, golem], "Mental", () => null);
  equal("I5 without the feat both are immune", none.kept.length, 0);
  const paid = TI.partitionTraitImmune([zombie, golem], "Mental", () => null, { imposes: (a) => a.name === "Zombie" });
  equal("I6 with undead paid for, the zombie is reached and named; the golem is not", [paid.kept.map((a) => a.name), paid.imposed.map((a) => a.name), paid.skipped.map((s) => s.name)], [["Zombie"], ["Zombie"], ["Golem"]]);
  const owner = { items: [{ name: "Imposing Will" }] };
  ok("I7 the cast defers the target gate only for an owner casting a mental spell",
    MT.mayImposeWill(owner, { traits: "Mental" }) && !MT.mayImposeWill(owner, { traits: "Fire" }) && !MT.mayImposeWill({ items: [] }, { traits: "Mental" }));
  ok("I8 the card names who was let through", /Zombie is affected despite its immunity to the mental trait/.test(MT.imposingWillLine([{ name: "Zombie", trait: "mental" }])));
  ok("I9 …with no full stop of its own, as the notes add one (3.717.1; the live card read \"trait..\")", !/\.$/.test(MT.imposingWillLine([{ name: "Zombie", trait: "mental" }])));
}

/* ================================================================== */
/* S — Selective Spell                                                 */
/* ================================================================== */
{
  const sel = opt({ area: "20-foot radius" }, "selective");
  equal("S1 a count the cast reads", sel?.kind, "selective");
  equal("S2 the count bought is carried", MM.aggregateMetamagicSelection([sel], { "mm-selective": 2 }).selectiveCount, 2);
  const a = { id: "a", name: "Ally" }, b = { id: "b", name: "Bard" }, f = { id: "f", name: "Foe" };
  const two = MT.selectiveExclusion([a, b, f], ["a", "b"], 2);
  equal("S3 up to what was bought is excluded", [two.kept.map((x) => x.name), two.excluded.map((x) => x.name), two.over], [["Foe"], ["Ally", "Bard"], false]);
  equal("S4 more than was bought is refused, not trimmed", [MT.selectiveExclusion([a, b, f], ["a", "b"], 1).over, MT.selectiveExclusion([a, b, f], ["a", "b"], 1).kept.length], [true, 3]);
  ok("S5 the card names the excluded, or says nobody was", /excluded Ally/.test(MT.selectiveLine("Fireball", [a], 1)) && /nobody was excluded/.test(MT.selectiveLine("Fireball", [], 1)));
}

/* ================================================================== */
/* X — Split Spell                                                     */
/* ================================================================== */
{
  const sp = opt({ category: "attack", damage: { formula: "2d8" } }, "split");
  equal("X1 a count the cast reads", sp?.kind, "split");
  equal("X2 the extra targets bought are carried", MM.aggregateMetamagicSelection([sp], { "mm-split": 2 }).splitExtra, 2);
  const stepped = (f, n) => MT.splitDamageRow({ formula: f }, n)?.formula;
  equal("X3 the book's example: d8 -> d6 for one, d4 for two", [stepped("2d8 + 3", 1), stepped("2d8 + 3", 2)], ["2d6 + 3", "2d4 + 3"]);
  equal("X4 every die in the formula steps; a d4 stays a d4", stepped("1d10 + 2d4", 1), "1d8 + 2d4");
  equal("X5 no steps, no change", stepped("3d6", 0), "3d6");
  equal("X6 the row keeps its type", MT.splitDamageRow({ formula: "1d8", type: "fire" }, 1), { formula: "1d6", type: "fire" });
  equal("X7 the target cap rises by the count; an open cap stays open", [MT.splitTargetCap(1, 2), MT.splitTargetCap(null, 2), MT.splitTargetCap(Infinity, 1)], [3, null, Infinity]);
  ok("X8 the card says one attack for MAP, and what went unused", /one attack for the multiple attack penalty; 1 extra target paid for and not targeted/.test(MT.splitLine("Ray", ["Goblin"], 2, "1d4")));
}

/* ================================================================== */
/* G, P, T — the warps (O5, O6)                                        */
/* ================================================================== */
{
  const agg = SW.aggregateWarpSelection([{ ppCost: 4, mods: { defence: "Will Negates" } }, { ppCost: 4, mods: { onlyTradition: "arcane" } }], { "warp-0": true, "warp-1": true });
  equal("G1 a warp's save and its tradition reach the cast", [agg.mods.defence, agg.mods.onlyTradition], ["Will Negates", ["arcane"]]);
  equal("G2 none bought: the spell's own", [SW.emptyWarp().mods.defence, SW.emptyWarp().mods.onlyTradition], [null, []]);
  const merged = SW.mergeWarpSelections(SW.aggregateWarpSelection([{ ppCost: 1, mods: { onlyTradition: "arcane" } }], { "warp-0": true }), SW.aggregateWarpSelection([{ ppCost: 1, mods: { defence: "Will" } }], { "warp-0": true }));
  equal("G3 a second chooser keeps both", [merged.mods.defence, merged.mods.onlyTradition], ["Will", ["arcane"]]);
  equal("T1 an arcane caster may buy the arcane-only warp", TG.warpTraditionRefusals(["arcane"], "Arcane"), []);
  equal("T2 a divine one is refused", TG.warpTraditionRefusals(["arcane"], "Divinity").length, 1);
  equal("T3 'divine' and 'divinity' are one tradition", TG.warpTraditionRefusals(["divine"], "divinity"), []);
  equal("T4 nothing required, nothing refused", TG.warpTraditionRefusals([], ""), []);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vmt-"));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "spells"), tmp, { recursive: true });
  try { fs.rmSync(path.join(tmp, "LOCK")); } catch { /* none */ }
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  const byName = {};
  for await (const [k, v] of db.iterator()) if (k.startsWith("!items!")) byName[v.name] = v.system;
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  equal("G4 Geas: the unwilling creature's Will save on every tier; 1 year and unlimited on the clock",
    byName.Geas.warps.map((w) => [w.mods.defence, w.mods.durationText ?? null]), [["Will Negates", null], ["Will Negates", "1 year"], ["Will Negates", "unlimited"]]);
  equal("P1 Pass Without Trace: a 20-foot emanation within 20 feet, of up to 10 creatures of the caster's choice",
    [byName["Pass Without Trace"].warps[1].mods.rangeOverride, byName["Pass Without Trace"].warps[1].mods.areaOverride, byName["Pass Without Trace"].warps[1].mods.targetCap, byName["Pass Without Trace"].areaChoice], ["20 feet", "20-foot emanation", 10, true]);
  equal("T5 Unshakable's touch warp is arcane only", byName.Unshakable.warps[1].mods.onlyTradition, "arcane");
  equal("T6 …and no note tells the table to cast it by hand (3.717.1)", byName.Unshakable.effects.map((e) => e.kind), ["defence"]);
  // U8 can see them now.
  const geasDur = SW.aggregateWarpSelection(byName.Geas.warps, { "warp-1": true }).mods;
  const ext = MM.aggregateMetamagicSelection(MM.buildMetamagicOptions({ featNames: ["extend spell"], spellData: { duration: "1 week (D)" }, basePP: 6, casterLevel: 10, tradition: "arcane" }), { "mm-extend": true });
  ok("G5 Extend beside Geas's 1-year warp is refused (U8)", MM.metamagicWarpConflicts(ext, geasDur).length === 1);
}

/* ================================================================== */
/* C — the caster's tradition, not the spell's list (3.717.0)          */
/* ================================================================== */
{
  const self = { range: "", area: "", targets: "", duration: "1 hour" };
  const build = (more) => MM.buildMetamagicOptions({ featNames: ["distant spell", "aligned spell"], spellData: self, basePP: 2, casterLevel: 10, ...more });
  const distant = (more) => build(more).find((o) => o.id === "distant")?.ppCost;
  equal("C1 an arcane caster pays +4 for Distant on a spell that lists ethereal too (case 7)", distant({ tradition: "arcane, ethereal", casterTradition: "arcane" }), 4);
  equal("C2 an ethereal caster pays +6", distant({ tradition: "arcane, ethereal", casterTradition: "ethereal" }), 6);
  ok("C3 Aligned is not offered to an arcane caster because the spell lists divinity",
    !build({ tradition: "arcane, divinity", casterTradition: "arcane" }).some((o) => o.id === "aligned")
    && build({ tradition: "arcane, divinity", casterTradition: "divinity" }).some((o) => o.id === "aligned"));
  equal("C4 a caller that names no caster tradition reads the cast's", distant({ tradition: "ethereal" }), 6);
  ok("C5 the cast names the caster's tradition", /casterTradition: String\(system\.magic\?\.tradition \?\? ""\),/.test(read("module", "magic", "cast-workflow.mjs")));
}

/* ================================================================== */
/* R — the owned copies                                                */
/* ================================================================== */
{
  const { PACK_REPAIRS } = await imp("data/pack-repairs.mjs");
  const ids = PACK_REPAIRS.map((r) => r.id);
  ok("R1 Geas, Pass Without Trace (warps and choice) declared", ["geas-warps-3717", "pass-without-trace-warps-3717", "pass-without-trace-areachoice-3717"].every((id) => ids.includes(id)));
  const un = PACK_REPAIRS.find((r) => r.id === "unshakable-touch-warp");
  ok("R2 Unshakable's entry reaches 3.716.0's copy too", un?.to?.[1]?.mods?.onlyTradition === "arcane" && un?.alsoFrom?.[0]?.[1]?.mods?.rangeOverride === "touch" && !un?.alsoFrom?.[0]?.[1]?.mods?.onlyTradition);
  const ue = PACK_REPAIRS.find((r) => r.id === "unshakable-effects-3609");
  ok("R4 Unshakable's stale note is repaired on owned copies (3.717.1)", ue?.to?.length === 1 && ue?.alsoFrom?.[0]?.some((e) => e.kind === "note"));
  const mig = read("module", "migration.mjs");
  ok("R3 the pack-copy pass and the schema are re-gated for them", /runIf\("3\.71[78]\.[01]", "stale owned copies of repaired pack items"/.test(mig) && /TRG_SCHEMA_VERSION = "3\.71[78]\.[01]"/.test(mig));
}

/* ================================================================== */
/* W — the wiring                                                      */
/* ================================================================== */
{
  const cw = read("module", "magic", "cast-workflow.mjs");
  ok("W1 the early immunity gate waits for Imposing Will", /&& !storingNow && !imposingWillDeferred\) \{/.test(cw));
  ok("W2 …and is asked after the warp dialog, the paid-for type let through",
    /imposes: mm\.imposingType \? \(a\) => isOfKind\(a\.system, mm\.imposingType\) : null/.test(cw));
  ok("W3 Aligned prunes a targeted spell's targets", /const aligned = alignedPartition\(reached, mm\.alignedTraits/.test(cw));
  ok("W4 …and refuses, nothing spent, when nobody is left", /if \(!reached\.length\) \{\s*for \(const miss of passedBy\) ui\.notifications\.warn\([^\n]*\);\s*return null;/.test(cw));
  ok("W5 that gate sits before the target cap", cw.indexOf("WHO THE METAMAGIC LETS IN") > 0 && cw.indexOf("WHO THE METAMAGIC LETS IN") < cw.indexOf("cap: splitTargetCap("));
  ok("W6 Split raises the target cap", /cap: splitTargetCap\(targetCapFor\(apMode\?\.targets \?\? spellData\?\.targets, warp\.mods, casterLevel\), mm\.splitExtra\)/.test(cw));
  ok("W7 an area lets the paid-for type through", /imposes: mm\.imposingType \? \(a\) => isOfKindForWill\(a\.system, mm\.imposingType\) : null/.test(cw));
  ok("W8 an area keeps only the chosen alignment", /areaAligned = alignedPartition\(areaTargets, mm\.alignedTraits, \(a\) => alignedTraitsOf\(a\.system\)\);\s*areaTargets = areaAligned\.kept;/.test(cw) && /\.\.\.areaImmunity\.skipped, \.\.\.areaAligned\.skipped\]/.test(cw));
  ok("W9 an area asks who Selective excludes", /if \(mm\.selectiveCount > 0 && areaTargets\.length\) \{/.test(cw) && /areaTargets = picked\.kept;/.test(cw));
  ok("W10 Split's first target takes the stepped die", /damageOverride: splitDamage \?\? damageForCast,\n\s*dieSteps: splitBought,\n\s*splashSaveDC: nominalSaveDC,\n\s*\/\/ The caster's declared/.test(cw));
  ok("W17 …and so does each other target's (3.717.1)", /damageOverride: splitDamage \?\? damageForCast, dieSteps: splitBought,/.test(cw));
  ok("W18 the critical's dice step with the hit's (3.717.1; the live test's 4d4 + 2d6)",
    /const critFormula = dieSteps > 0 && critRaw \? \(splitDamageRow\(\{ formula: critRaw \}, dieSteps\)\?\.formula \?\? critRaw\) : critRaw;/.test(cw));
  ok("W11 each other target is compared with the same check, one attack for MAP",
    /for \(const target of splitTargets\) \{\s*await resolveSpellAttack\(actor, spell, check, lines, clMods, warpMods, \{\s*targetOverride: target, mapCount: splitMapCount, deferMapAdvance: true/.test(cw));
  ok("W12 Split's targets are the next ones the caster targeted, up to what was bought", /\.slice\(1, 1 \+ splitBought\)/.test(cw));
  ok("W13 a warp's save is the save the cast rolls", /const castDefence = effDefence \?\? warpDefenceOf\(warpMods\) \?\? spellData\.defence;/.test(cw)
    && /const saveDefence = effDefence \?\? warpDefenceOf\(warpMods\);/.test(cw) && /defence: saveDefence,/.test(cw));
  ok("W14 a tradition-only warp is refused with U8's refusal, before anything is spent",
    /\.\.\.warpTraditionRefusals\(warpMods\?\.onlyTradition \?\? \[\], system\.magic\?\.tradition \?\? ""\)/.test(cw));
  const sw = read("module", "magic", "selective-spell-workflow.mjs");
  ok("W15 Selective's dialog asks again when too many are ticked", /if \(!result\.over\) return \{ kept: result\.kept, excluded: result\.excluded \};/.test(sw));
  ok("W16 Cancel excludes nobody", /\{ action: "cancel", label: "Exclude nobody", callback: \(\) => resolve\(\[\]\) \}/.test(sw));
}

if (failures.length) {
  process.stdout.write(`verify-metamagic-targets: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-metamagic-targets: OK — ${checks} checks\n`);
