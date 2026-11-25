#!/usr/bin/env node
/**
 * verify-movement-trait-3700 — core 3.700.0, the Movement trait on spells.
 *
 * Graham, 18 Nov 2026: "Any spell which moves either the caster or a target
 * as part of the casting (such as Misty Step) should have this trait", and
 * "your recommendation" on rulings C1–C6 of claude/movement-trait-spell-audit.md.
 * With it, the Storgar heritage's third clause (Chapter 2).
 *
 *   M  the pack: exactly the 34 declared spells carry Movement; Dimension
 *      Door's printed "Move" is gone; the spells ruled out do not have it.
 *   P  owned copies: a PACK_REPAIRS entry for every pack edit, matched old → new.
 *   R  the Storgar rule (pure): who rolls, who does not.
 *   W  the cast's wiring: after the cast, before the Teleportation arrival,
 *      and a Storgar it does not work on is handed nothing.
 *   S  the Storgar's +2 against being moved, as a save row the engine matches.
 *   N  the Storgar note no longer says to roll by hand (pack + owned copy).
 *   Q  a Quickened point "for Move" pays for a Movement-trait action.
 *   D  Astral Drift (ruled): a Movement spell's cast does not count as a
 *      movement action, because the cast reports no traits when it spends.
 *   G  the migration re-gate.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

const MOVEMENT_SPELLS = [
  // A — the cast moves the caster
  "Misty Step", "Dimension Door", "Dimension Shift", "Shadow Step", "Teleport", "Word Of Recall",
  "Plane Shift", "Shadow Walk", "Shifting Step", "Fluidity", "Physical Surge",
  // B — the cast moves a target
  "Slide", "Startle", "Gust", "Hydraulic Torrent", "Telekinetic Manoeuvre", "Spectral Grasp",
  "Forceful Strike", "Wall Of Blades", "Earth Prison", "Portal Maelstrom", "Punishing Winds",
  "Reverse Gravity", "Volcanic Inferno", "Wall Of Wind", "Levitate",
  // C1 and C2 — ruled in
  "Blink", "Wind Walk", "Map Of The Root-knit", "Tree Walk",
  "Banishment", "Maze", "Divine Decree", "Magnificent Dawn"
];
const RULED_OUT = [
  "Force Punch", "Passwall", "Ethereal Jaunt",                 // C1, side effects
  "Teleportation Circle", "Gate",                              // C3
  "Telekinetic Haul", "Mage Hand", "Call Item",                // C4
  "Command", "Coercive Retribution",                           // C5
  "Snagging Pit", "Earthquake", "Transmute Rock & Mud",        // C6
  "Fly", "Feather Fall", "Time Hop", "Fear"                    // D
];

async function readPack(name) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `mv-${name}-`));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", name), tmp, { recursive: true });
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  const items = [];
  const effects = new Map();
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!")) items.push(v);
    else if (k.startsWith("!items.effects!")) effects.set(k, v);
  }
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  return { items, effects };
}

const { hasTrait } = await mod("traits.mjs");

/* M — the pack --------------------------------------------------------- */
const spells = (await readPack("spells")).items;
const byName = (n) => spells.filter((s) => s.name === n);
{
  const carrying = spells.filter((s) => hasTrait(s.system?.traits ?? "", "movement")).map((s) => s.name).sort();
  equal("M1 exactly the 34 declared spells carry Movement", carrying, [...MOVEMENT_SPELLS].sort());
  ok("M2 every declared spell is in the pack once", MOVEMENT_SPELLS.every((n) => byName(n).length === 1),
    MOVEMENT_SPELLS.filter((n) => byName(n).length !== 1).join(", "));
  const moveWord = spells.filter((s) => String(s.system?.traits ?? "").split(",").some((t) => /^\s*move\s*$/i.test(t))).map((s) => s.name);
  equal("M3 no spell carries the misprinted \"Move\"", moveWord, []);
  equal("M4 Dimension Door reads Movement, Teleportation, Translocation", byName("Dimension Door")[0]?.system?.traits, "Movement, Teleportation, Translocation");
  equal("M5 Misty Step keeps its other traits", byName("Misty Step")[0]?.system?.traits, "Movement, Teleportation, Translocation");
  const ruledOutCarrying = RULED_OUT.filter((n) => byName(n).some((s) => hasTrait(s.system?.traits ?? "", "movement")));
  equal("M6 the spells ruled out (C1 side effects, C3–C6, D) do not carry it", ruledOutCarrying, []);
  const { APPENDIX_TRAITS } = await mod("data", "appendix-traits.mjs");
  ok("M7 Movement is an Appendix 3 trait (the chip resolves)", APPENDIX_TRAITS.includes("movement"));
}

/* P — owned copies ------------------------------------------------------- */
const repairs = await mod("data", "pack-repairs.mjs");
{
  const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes.filter((f) => /^movement-trait-/.test(f.id) && f.path === "system.traits");
  equal("P1 34 declared pack edits", fixes.length, 34);
  const missing = fixes.filter((f) => !repairs.PACK_REPAIRS.some((r) => r.pack === "spells" && r.name === f.name
    && r.field === "traits" && r.from === f.from && r.to === f.to && r.since === "3.701.0"));
  equal("P2 every pack edit has an owned-copy repair, old → new", missing.map((f) => f.name), []);
  const unmatched = fixes.filter((f) => byName(f.name)[0]?.system?.traits !== f.to);
  equal("P3 every repair's `to` is what the pack now ships", unmatched.map((f) => f.name), []);
  const fromHasMovement = fixes.filter((f) => hasTrait(f.from, "movement"));
  equal("P4 no `from` already has Movement (Dimension Door's Move is not the trait)", fromHasMovement.map((f) => f.name), []);
}

/* R — the Storgar rule, pure --------------------------------------------- */
const rm = await mod("magic", "rooted-movement.mjs");
{
  const storgar = [{ type: "heritage", name: "Storgar" }, { type: "race", name: "Dwarf" }];
  equal("R1 a Storgar makes a DC 5 flat check", rm.rootedFlatCheckDC(storgar), 5);
  equal("R2 a Thengar makes none", rm.rootedFlatCheckDC([{ type: "heritage", name: "Thengar" }]), null);
  equal("R3 a feat named Storgar is not the heritage", rm.rootedFlatCheckDC([{ type: "feat", name: "Storgar" }]), null);
  equal("R4 a module's own item opts in with its own DC", rm.rootedFlatCheckDC([{ type: "feat", name: "Rooted", flags: { "trg-prime": { friendlyMovementFlatCheck: 11 } } }]), 11);
  const due = (o) => rm.rootedCheckDue({ spellTraits: "Movement, Teleportation, Translocation", dc: 5, chosen: true, ...o });
  ok("R5 their own Misty Step: rolled", due({ isSelf: true }) === true);
  ok("R6 an ally's Slide on them: rolled", due({ sameSide: true }) === true);
  ok("R7 an enemy's spell: not rolled (the +2 save row covers it)", due({ sameSide: false }) === false);
  ok("R8 caught in an area, not chosen: not rolled", due({ sameSide: true, chosen: false }) === false);
  ok("R9 a spell without Movement: not rolled", rm.rootedCheckDue({ spellTraits: "Teleportation, Translocation", dc: 5, chosen: true, isSelf: true }) === false);
  ok("R10 a creature with no rooting: not rolled", rm.rootedCheckDue({ spellTraits: "Movement", dc: null, chosen: true, isSelf: true }) === false);
  const caster = { name: "Borin" };
  const ally = { name: "Merrick" };
  equal("R11 the chosen targets are asked", rm.rootedCandidates(caster, [ally]).map((a) => a.name), ["Merrick"]);
  equal("R12 a spell with no targets and no area asks the caster", rm.rootedCandidates(caster, []).map((a) => a.name), ["Borin"]);
  equal("R13 an area spell with no chosen targets asks nobody", rm.rootedCandidates(caster, [], { isArea: true }), []);
  equal("R13a Teleport (\"you and up to 4\") asks the caster beside the targets",
    rm.rootedCandidates(caster, [ally], { targetsText: "you and up to 4 targets touched" }).map((a) => a.name), ["Borin", "Merrick"]);
  equal("R13b ...once, when the caster also targeted their own token",
    rm.rootedCandidates(caster, [caster, ally], { targetsText: "You and touched objects or other willing creatures" }).map((a) => a.name), ["Borin", "Merrick"]);
  equal("R13c Slide (\"1 willing creature\") asks only the target",
    rm.rootedCandidates(caster, [ally], { targetsText: "1 willing creature" }).map((a) => a.name), ["Merrick"]);
  ok("R14 the failure line says the spell does not work and the token stays",
    /does not work on Borin/.test(rm.rootedFailureLine("Borin", "Misty Step", 5, 3)) && /Leave the token where it is/.test(rm.rootedFailureLine("Borin", "Misty Step", 5, 3)));
}

/* W — the cast's wiring --------------------------------------------------- */
{
  const cw = read("module", "magic", "cast-workflow.mjs");
  const at = (s) => cw.indexOf(s);
  const rootedAt = at("rootedMovementChecks(actor, spell");
  const arrivesAt = at("teleportationArrives(actor, spell, moved)");
  const effectsAt = at("effectTargets = effectTargets.filter(notRooted);");
  ok("W1 the check is rolled after the cast succeeds", /if \(outcome\.cast && !storingNow\) \{\s*const \{ rootedMovementChecks \}/.test(cw));
  ok("W2 ...and before the Teleportation arrival", rootedAt > 0 && arrivesAt > rootedAt);
  ok("W3 a rooted target is pruned from the targets (the arrival card and the effects read them)",
    /if \(!notRooted\(token\.actor\)\) token\.setTarget\(false, \{ releaseOthers: false, groupSelection: true \}\);/.test(cw));
  ok("W4 nobody is carded as teleported when nobody moved (a rooted lone caster, or every target rooted)",
    /const rootedNobodyMoved = rooted\.failed\.size > 0 && \(rootedTargeted\.length\s*\? rootedTargeted\.every\(\(t\) => !notRooted\(t\.actor\)\)\s*: rooted\.casterFailed\);/.test(cw)
    && /if \(outcome\.cast && !rootedNobodyMoved\) \{\s*const \{ teleportationArrives, teleportDeferred \}/.test(cw));
  ok("W5 a rooted target is handed no effects", effectsAt > arrivesAt);
  ok("W6 a rooted caster's self rows are dropped as a blocked shape's are", /let selfShapeBlocked = false;\s*(\/\/[^\n]*\n\s*)*if \(rooted\.casterFailed\) selfShapeBlocked = true;/.test(cw));
  const wf = read("module", "magic", "rooted-movement-workflow.mjs");
  ok("W7 the workflow rolls a flat check at the creature's own DC", /type: "flat",\s*flat: true,\s*dc\b/.test(wf));
  ok("W8 the workflow reads the side from token disposition", /sameSide\(casterSide, dispositionOf\(actor\)\)/.test(wf));
  ok("W9 the workflow hands the printed targets line to the candidates", /rootedCandidates\(caster, targeted, \{ isArea, targetsText: spell\?\.system\?\.targets \?\? "" \}\)/.test(wf));
}

/* S — the +2 save row ----------------------------------------------------- */
{
  const { collectConditionals, matchesCheck } = await mod("conditionals.mjs");
  const rows = rm.storgarSaveConditionals([{ type: "heritage", name: "Storgar" }]);
  equal("S1 a Storgar publishes one +2 racial row", rows.map((r) => [r.kind, r.value, r.type, r.auto]), [["modifier", 2, "race", true]]);
  equal("S2 anyone else publishes none", rm.storgarSaveConditionals([{ type: "heritage", name: "Hill" }]), []);
  const [entry] = collectConditionals([], [], rows);
  ok("S3 it matches a save against a Movement-trait spell", matchesCheck(entry, { checkType: "save", subject: "reflex", traits: "Air, Invocation, Movement" }) === true);
  ok("S4 ...not a save against anything else", matchesCheck(entry, { checkType: "save", subject: "reflex", traits: "Fire, Invocation" }) === false);
  ok("S5 ...nor a skill check", matchesCheck(entry, { checkType: "skill", subject: "athletics", traits: "Movement" }) === false);
  const actor = read("module", "documents", "actor.mjs");
  ok("S6 the actor publishes it beside the rune conditionals",
    /const storgarRows = storgarSaveConditionals\(Array\.from\(actor\.items \?\? \[\]\)\);\s*if \(storgarRows\.length && system\.combat\) \{\s*system\.combat\.runeConditionals = \[\.\.\.\(system\.combat\.runeConditionals \?\? \[\]\), \.\.\.storgarRows\]/.test(actor));
}

/* N — the Storgar note ---------------------------------------------------- */
{
  const { items, effects } = await readPack("heritages");
  const storgar = items.find((i) => i.name === "Storgar");
  const note = [...effects.values()].find((e) => e.name === "Storgar: rooted");
  ok("N1 the pack note says the cast rolls it", /Rolled for you when the spell is cast/.test(note?.description ?? "") && !/Flat Check button/.test(note?.description ?? ""));
  ok("N2 the Storgar keeps its shove DC and its forced-movement prompt",
    (storgar?.flags?.["trg-prime"]?.defenceDC ?? []).some((e) => e.value === 2) && Boolean(storgar?.flags?.["trg-prime"]?.involuntaryMovementNote));
  const repair = repairs.EFFECT_REPAIRS.find((r) => r.id === "movement-trait-storgar-rooted-note");
  const stale = { name: "Storgar: rooted", description: repair?.from?.description };
  equal("N3 a stale owned note is brought up to date", repairs.effectRepairUpdate(repair, stale)?.description, note?.description);
  equal("N4 a GM's own wording is left alone", repairs.effectRepairUpdate(repair, { name: "Storgar: rooted", description: "Mine." }), null);
  equal("N5 the repair is for the heritage", repair?.itemType, "heritage");
}

/* Q — Quickened "for Move" ------------------------------------------------ */
{
  const { useKindsOf } = await mod("combat", "restricted-ap.mjs");
  ok("Q1 Swim (Movement) is a Move", useKindsOf("Swim", { traits: "Movement" }).includes("move"));
  ok("Q2 Stand (Movement) is a Move", useKindsOf("Stand", { traits: "Movement" }).includes("move"));
  ok("Q3 \"Move\" is still read", useKindsOf("Climb", { traits: "Move" }).includes("move"));
  ok("Q4 a Strike is not a Move", !useKindsOf("Longsword — Strike", { traits: "Attack" }).includes("move"));
  ok("Q5 a word that merely starts with move is not", !useKindsOf("Movements Of The Mind", { traits: "Movements" }).includes("move"));
}

/* D — Astral Drift (ruled: a Movement spell is not a movement action) ------- */
{
  const cw = read("module", "magic", "cast-workflow.mjs");
  ok("D1 the cast's AP is spent without the spell's traits", /const castReceipt = apPaid \? null : await spendActionCost\(actor, totalCastAP, spell\.name\);/.test(cw));
  ok("D2 a cast never announces itself as a resolved action", !/trgPrimeActionResolved/.test(cw));
}

/* G — the migration ------------------------------------------------------- */
{
  const mig = read("module", "migration.mjs");
  const atLeast = (a, b) => String(a).localeCompare(b, undefined, { numeric: true }) >= 0;
  const packGate = /runIf\("([\d.]+)", "stale owned copies of repaired pack items"/.exec(mig)?.[1] ?? "0";
  const effectGate = /runIf\("([\d.]+)", "declared effect repairs on owned items/.exec(mig)?.[1] ?? "0";
  const stamp = /export const TRG_SCHEMA_VERSION = "([\d.]+)";/.exec(mig)?.[1] ?? "0";
  ok("G1 the pack-copy pass runs at 3.701.0 or later", atLeast(packGate, "3.701.0"), packGate);
  ok("G2 the effect pass runs at 3.701.0 or later", atLeast(effectGate, "3.701.0"), effectGate);
  ok("G3 the schema is stamped at or past both", atLeast(stamp, packGate) && atLeast(stamp, effectGate), stamp);
  const sys = JSON.parse(read("system.json"));
  equal("G4 the version and the download name 3.707.3", [sys.version, sys.download, JSON.parse(read("package.json")).version],
    ["3.715.0", "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.715.0/trg-prime.zip", "3.715.0"]);
}

console.log(`verify-movement-trait-3700: ${checks} checks${failures.length ? ` — ${failures.length} FAILED` : " — all green."}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
