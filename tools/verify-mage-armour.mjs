#!/usr/bin/env node
/**
 * verify-mage-armour — Mage Armour, rebuilt as armour (3.617.2).
 *
 * Graham, 4 October 2026: "it needs to be done this way otherwise the spell
 * is not automated!"; MA1–MA4 "your recommendation". Block 29's R5 had asked
 * for the BSB scaling, and 3.591.0 shipped it as a note. This harness RUNS
 * the page's own worked example, so a note can never pass for it again.
 *
 *   A  the row, and the page's example (BSB 6: DR 2; warped: 4)
 *   B  the caster-level ladder (CL 4, 6, 8, 10)
 *   C  armour, not a bonus: the higher of it, the bracers and worn armour
 *   D  the pool, its destruction and the hour's lockout
 *   E  CR and rigidity while it has HP (rigid wherever it covers: 3.617.4)
 *   F  the pack, the repair and the version
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const { normaliseSpellArmour, spellArmourAtCast, spellArmourEntries, SPELL_ARMOUR_FLAG } = await import("../module/magic/spell-armour.mjs");
const { bracersBaseDR } = await import("../module/wondrous-effects.mjs");
const { bracersAreTheArmour } = await import("../module/bracers-workflow.mjs");
const { resolveAgainstDefences } = await import("../module/combat/damage-workflow.mjs");
const { HANDLED_EFFECT_KINDS } = await import("../module/magic/effect-kinds.mjs");
const { MAGE_ARMOUR_EFFECTS } = await import("./author-mage-armour.mjs");
const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
const { TRG_SCHEMA_VERSION } = await import("../module/migration.mjs");
const { withWholeBodyArmour } = await import("../module/combat/hit-location.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ACTOR = strip(read("module", "documents", "actor.mjs"));
const EFFECTS = strip(read("module", "magic", "spell-effects.mjs"));
const DRAIN = strip(read("module", "bracers-workflow.mjs"));
const ATTACK = strip(read("module", "combat", "attack-workflow.mjs"));

const spec = normaliseSpellArmour(MAGE_ARMOUR_EFFECTS[0]);
/** A cast's armour, as the effect would carry it, made into its Base DR. */
const armourAt = ({ casterLevel = 1, bsb = 0, warp = 0, hp = null } = {}) => {
  const state = spellArmourAtCast(spec, { casterLevel, bsb, warpMods: warp ? { bonusValue: warp } : {} });
  const effect = { id: "e1", flags: { "trg-prime": { castId: "c1", [SPELL_ARMOUR_FLAG]: { ...state, hp: hp ?? state.hp, spellName: "Mage Armour" } } } };
  return { state, effect, entries: spellArmourEntries([effect]) };
};
const dr = (a) => bracersBaseDR(a.entries.entries, 0, 0).effective;

/* A — the row, and the page's example */
{
  ok("A1 the row reads: Armour DR 1 with 20 HP", spec?.baseDR === 1 && spec?.hp === 20 && spec?.lockoutMinutes === 60);
  ok("A1b and the applier knows the kind", HANDLED_EFFECT_KINDS.includes("spellArmour"));
  // FOUND DRIVING 3.617.2: no target, so the row aimed at the cast's targets,
  // and a self spell has none — "Mage Armour finds nobody to affect".
  ok("A1c the row lands on the caster", MAGE_ARMOUR_EFFECTS[0].target === "self");
  ok("A2 THE PAGE'S EXAMPLE: \"a Wizard with a BSB of 6, would gain DR 2\"", dr(armourAt({ bsb: 6 })) === 2);
  ok("A3 \"warp the spell by +4 PP, the DR would increase to 4\"", dr(armourAt({ bsb: 6, warp: 1 })) === 4);
  ok("A4 BSB 0: DR 1; BSB 12: DR 3", dr(armourAt({ bsb: 0 })) === 1 && dr(armourAt({ bsb: 12 })) === 3);
  ok("A5 the cast reads the CASTER's BSB and caster level, and replaces an earlier casting",
    /bsb: casterBSB\(caster\),/.test(EFFECTS) && /casterLevel: Number\(rollData\?\.casterLevel \?\? casterLevelOf\(caster\?\.system\)\) \|\| 0,/.test(EFFECTS)
    && /\.filter\(\(e\) => e\.getFlag\?\.\(SYSTEM_ID, SPELL_ARMOUR_FLAG\)\?\.spellName === spell\.name\)/.test(EFFECTS));
}

/* B — the caster-level ladder */
{
  ok("B1 CL 4+: +20 HP (40 at CL 4, 60 at CL 8)",
    armourAt({ casterLevel: 3 }).state.max === 20 && armourAt({ casterLevel: 4 }).state.max === 40 && armourAt({ casterLevel: 8 }).state.max === 60);
  ok("B2 CL 6+: the multiplier rises by 1 — BSB 6 at CL 6 is DR 3",
    armourAt({ casterLevel: 6, bsb: 6 }).state.multiplierBonus === 1 && dr(armourAt({ casterLevel: 6, bsb: 6 })) === 3
    && dr(armourAt({ casterLevel: 5, bsb: 6 })) === 2);
  ok("B3 CL 8+: CR 1", armourAt({ casterLevel: 7 }).state.cr === 0 && armourAt({ casterLevel: 8 }).state.cr === 1);
  ok("B4 CL 10: rigid", !armourAt({ casterLevel: 9 }).state.rigid && armourAt({ casterLevel: 10 }).state.rigid);
}

/* C — armour, not a bonus (MA1, MA2, MA3) */
{
  const bracers = { itemId: "b", itemName: "Bracers of Armour II", value: 2, armourHP: 30, stored: null };
  const plain = armourAt({ casterLevel: 6, bsb: 6 });          // 1 × 3 = 3
  const warped = armourAt({ casterLevel: 6, bsb: 6, warp: 1 }); // 2 × 3 = 6
  const withBracers = (a) => bracersBaseDR([bracers, ...a.entries.entries], 0, 6);
  ok("C1 MA2 — with Bracers II (4 at BSB 6), only the higher: the bracers over a plain casting",
    withBracers(plain).effective === 4 && withBracers(plain).source === "item");
  ok("C2 and the warped casting over the bracers, named as the spell", withBracers(warped).effective === 6
    && withBracers(warped).source === "effect" && withBracers(warped).castId === "c1");
  ok("C3 MA1 — the spell's armour is the armour a blow meets when it is the higher, and not otherwise",
    bracersAreTheArmour(4, { itemId: "", effectId: "e1", effective: 6 }) && !bracersAreTheArmour(8, { itemId: "", effectId: "e1", effective: 6 }));
  const sys = (worn, armour) => ({ combat: { armour: { dr: worn }, bdb: { total: 6 }, bracers: armour,
    naturalArmour: { dr: 0 }, dr: { total: 0 } } });
  const best = withBracers(warped);
  const bare = resolveAgainstDefences(sys(0, best), { amount: 10, type: "slashing" });
  const chain = resolveAgainstDefences(sys(4, best), { amount: 10, type: "slashing" });
  ok("C4 a blow meets 6 bare, and 8 in chain (4 × 2) — not 14",
    bare.taken === 4 && bare.bracersSource === true && chain.taken === 2 && chain.bracersSource === false);
  const crit = resolveAgainstDefences(sys(0, best), { amount: 10, type: "slashing", drBypassed: true });
  ok("C5 MA3 — a critical to an unarmoured location bypasses it", crit.taken === 10);
  ok("C6 it is gathered beside the bracers, and no longer a bonus to the DR pool",
    /const spellArmour = spellArmourEntries\(Array\.from\(actor\.effects \?\? \[\]\)\);/.test(ACTOR)
    && /\[\.\.\.wondrousBonusesForActor\(Array\.from\(actor\.items \?\? \[\]\)\)\.baseDR, \.\.\.spellArmour\.entries\]/.test(ACTOR));
}

/* D — the pool, its destruction, the lockout */
{
  ok("D1 no more than the pool: on 2 HP a warped casting stops 2", dr({ entries: armourAt({ casterLevel: 6, bsb: 6, warp: 1, hp: 2 }).entries }) === 2);
  ok("D2 at 0 HP it gives nothing, and is no entry at all", armourAt({ hp: 0 }).entries.entries.length === 0);
  ok("D3 the drain writes the spell's own effect; at 0 the spell ends and is locked out for its hour",
    /if \(bracers\?\.source === "effect"\) return drainSpellArmour\(actor, bracers, amount, verb\);/.test(DRAIN)
    && /await endActiveSpell\(actor, castId, \{ dismissed: false \}\);/.test(DRAIN)
    && /withRecastLockout\(lockouts, state\.spellName \|\| name, Number\(game\.time\?\.worldTime \?\? 0\), minutes\)/.test(DRAIN));
}

/* E — CR and rigidity while it has HP (MA4) */
{
  const live = armourAt({ casterLevel: 10 }).entries;
  const gone = armourAt({ casterLevel: 10, hp: 0 }).entries;
  ok("E1 CR 1 and rigid while it stands; nothing once destroyed", live.cr === 1 && live.rigid && gone.cr === 0 && !gone.rigid);
  ok("E2 the CR is armour's CR (it covers every location from 3.617.4, so a named location no longer bypasses it)",
    /armourCR \+= spellArmourCR;/.test(ACTOR) && /system\.combat\.armourCriticalResistance = armourCR;/.test(ACTOR));
  // 3.617.4 (Graham's Q1 of the 3.617.3 drive): the spell covers EVERY
  // location, so its rigidity reaches the table wherever a critical lands —
  // run, not read (verify-whole-body-armour owns the wiring).
  const sys = (rigid) => ({ combat: { bracers: { effectId: "e1", effective: 5, itemName: "Mage Armour" }, spellArmour: { cr: 1, rigid } } });
  const bare = { armoured: false, rigid: false, metal: false };
  ok("E3 rigid wherever it covers, while it has HP",
    withWholeBodyArmour(bare, sys(true)).rigid === true && withWholeBodyArmour(bare, sys(false)).rigid === false
    && withWholeBodyArmour(bare, { combat: { bracers: { effectId: "", effective: 0 }, spellArmour: { cr: 0, rigid: false } } }).rigid === false
    && /withWholeBodyArmour\(armourAtLocation\(seenItems, hitLocation\), targetActor\.system\)/.test(ATTACK));
}

/* F — the pack, the repair, the version */
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open({ readOnly: true });
  let row = null;
  for await (const [key, value] of db.iterator()) if (key.startsWith("!items!") && value.name === "Mage Armour") row = value;
  await db.close();
  ok("F1 the pack's Mage Armour carries the row", JSON.stringify(row?.system?.effects) === JSON.stringify(MAGE_ARMOUR_EFFECTS));
  const repair = PACK_REPAIRS.find((r) => r.id === "mage-armour-effects-3617");
  ok("F2 owned copies are repaired — from the 3.591.0 row and from no rows at all",
    // 3.617.3: and from 3.617.2's row, which had no target.
    JSON.stringify(repair?.to) === JSON.stringify(MAGE_ARMOUR_EFFECTS) && repair?.from?.[0]?.kind === "bonus"
    && JSON.stringify(repair?.alsoFrom?.[0]) === "[]" && repair?.alsoFrom?.[1]?.[0]?.kind === "spellArmour"
    && repair?.alsoFrom?.[1]?.[0]?.target === undefined);
  const sys = JSON.parse(read("system.json"));
  const gate = /runIf\("(\d+\.\d+\.\d+)", "stale owned copies/.exec(read("module", "migration.mjs"))?.[1];
  const atLeast = (v) => /^\d+\.\d+\.\d+$/.test(String(v ?? "")) && String(v).localeCompare("3.617.3", undefined, { numeric: true }) >= 0;
  ok("F3 the version, schema and gate are 3.617.3 or later; the schema never leads",
    atLeast(sys.version) && atLeast(TRG_SCHEMA_VERSION) && atLeast(gate) && TRG_SCHEMA_VERSION.localeCompare(sys.version, undefined, { numeric: true }) <= 0);
}

if (failures.length) {
  console.log(`verify-mage-armour: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-mage-armour: OK — ${checks} checks. The page's own example runs: BSB 6 gives DR 2, warped 4; armour, not a bonus; a pool that ends the spell.`);
