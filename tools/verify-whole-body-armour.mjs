#!/usr/bin/env node
/**
 * verify-whole-body-armour — Mage Armour and Bracers of Armour cover every
 * hit location (3.617.4).
 *
 * Graham, 4 October 2026, Q1 of the 3.617.3 drive: "Yes it should cover every
 * hit location." Before, a critical counted as armoured only where a WORN
 * piece covered the struck location. On a caster in no armour every critical
 * went past the spell's DR ("DR bypassed (unarmoured location)"), the pool
 * drained nothing, and its CL 10 rigidity never reached the table.
 *
 *   A  the rule, run: live, spent, inert, rigid, metal, the name
 *   B  run through the real Base DR channel: a Mage Armour effect and a pair
 *      of bracers, made into `system.combat.bracers` the way the actor does
 *   C  the wiring: the injury table, Vital Strike's named location, the
 *      backfire, the card, and the damage step's bypass
 *   D  the version
 *   E  the armour's share of an amended critical comes off the pool
 *      (3.617.5, Graham's Q2: "Yes it should")
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const { wholeBodyArmour, withWholeBodyArmour, armourAtLocation } = await import("../module/combat/hit-location.mjs");
const { normaliseSpellArmour, spellArmourAtCast, spellArmourEntries, SPELL_ARMOUR_FLAG } = await import("../module/magic/spell-armour.mjs");
const { bracersBaseDR } = await import("../module/wondrous-effects.mjs");
const { armourCRBypass } = await import("../module/combat/attack.mjs");
const { MAGE_ARMOUR_EFFECTS } = await import("./author-mage-armour.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ATTACK = strip(read("module", "combat", "attack-workflow.mjs"));

const bare = { armoured: false, rigid: false, metal: false };
const withBase = (bracers, spellArmour = { cr: 0, rigid: false }) => ({ combat: { bracers, spellArmour } });
const MA = { itemId: "", effectId: "e1", effective: 5, itemName: "Mage Armour" };
const BRACERS = { itemId: "b1", effectId: "", effective: 6, itemName: "Bracers of Armour II" };

/* A — the rule */
{
  const a = withWholeBodyArmour(bare, withBase(MA));
  ok("A1 Mage Armour with HP: an unarmoured location is armoured, and the card names it",
    a.armoured === true && a.coveredBy === "Mage Armour" && a.metal === false);
  ok("A2 so are Bracers of Armour", withWholeBodyArmour(bare, withBase(BRACERS)).armoured === true);
  ok("A3 spent or inert (effective 0), or nothing worn: no cover",
    withWholeBodyArmour(bare, withBase({ ...MA, effective: 0 })).armoured === false
    && withWholeBodyArmour(bare, withBase({ itemId: "", effectId: "", effective: 0 })).armoured === false
    && withWholeBodyArmour(bare, {}).armoured === false);
  ok("A4 rigid only with Mage Armour's CL 10 (MA4)",
    withWholeBodyArmour(bare, withBase(MA, { cr: 1, rigid: true })).rigid === true
    && withWholeBodyArmour(bare, withBase(BRACERS)).rigid === false);
  const metal = { armoured: true, rigid: true, metal: true };
  const m = withWholeBodyArmour(metal, withBase(MA));
  ok("A5 a worn piece at the spot keeps its metal and rigidity, and the card names no spell",
    m.metal && m.rigid && m.coveredBy === "");
  ok("A6 the bare answer: a live source of zero DR covers nothing",
    wholeBodyArmour(withBase({ ...BRACERS, effective: 0 })).armoured === false && wholeBodyArmour(withBase(BRACERS)).name === "Bracers of Armour II");
}

/* B — through the real channel */
{
  const spec = normaliseSpellArmour(MAGE_ARMOUR_EFFECTS[0]);
  const effectAt = (hp) => {
    const state = spellArmourAtCast(spec, { casterLevel: 12, bsb: 13 });
    return { id: "e1", flags: { "trg-prime": { castId: "c1", [SPELL_ARMOUR_FLAG]: { ...state, hp: hp ?? state.hp, spellName: "Mage Armour" } } } };
  };
  const channel = (hp) => {
    const sa = spellArmourEntries([effectAt(hp)]);
    return withBase(bracersBaseDR(sa.entries, 0, 0), { cr: sa.cr, rigid: sa.rigid });
  };
  const live = channel();
  ok("B1 the drive's Wiz (CL 12, BSB 13): DR 5, and its Chest is armoured, rigid",
    live.combat.bracers.effective === 5 && withWholeBodyArmour(bare, live).armoured && withWholeBodyArmour(bare, live).rigid);
  ok("B2 on 3 HP it still covers", withWholeBodyArmour(bare, channel(3)).armoured === true);
  ok("B3 destroyed (0 HP): it covers nothing, and nothing is rigid",
    withWholeBodyArmour(bare, channel(0)).armoured === false && withWholeBodyArmour(bare, channel(0)).rigid === false);
  ok("B4 a named location (Vital Strike) no longer strips its CR while it stands",
    armourCRBypass({ criticalResistance: 1, armourCriticalResistance: 1, declaredLocation: "legs",
      locationArmoured: wholeBodyArmour(live).armoured }).criticalResistance === 1
    && armourCRBypass({ criticalResistance: 1, armourCriticalResistance: 1, declaredLocation: "legs",
      locationArmoured: wholeBodyArmour(channel(0)).armoured }).criticalResistance === 0);
  ok("B5 worn armour alone is unchanged: a leg hit under a breastplate is not armoured",
    withWholeBodyArmour(armourAtLocation([{ type: "armour", system: { equipped: true, coversTorso: true, traits: "" } }], "legs"), {}).armoured === false);
}

/* C — the wiring */
{
  ok("C1 the injury table reads the worn pieces with the whole-body armour laid over them",
    /const targetArmour = targetActor\s*\? withWholeBodyArmour\(armourAtLocation\(seenItems, hitLocation\), targetActor\.system\)/.test(ATTACK));
  ok("C2 the old rigidity line is gone (one rule, in hit-location.mjs)",
    !/spellArmour\?\.rigid\) targetArmour\.rigid = true/.test(ATTACK));
  ok("C3 Vital Strike's named location is covered by it",
    /locationCoveredByArmour\(Array\.from\(targetActor\.items \?\? \[\]\), declaredLocation\)\s*\|\| wholeBodyArmour\(targetActor\.system\)\.armoured/.test(ATTACK));
  ok("C4 a backfired row reads the attacker's own Mage Armour too",
    /const ownArmour = withWholeBodyArmour\(armourAtLocation\(Array\.from\(actor\.items \?\? \[\]\), hitLocation\), actor\.system\);/.test(ATTACK));
  ok("C5 the card says what covers the spot",
    /armoured\$\{targetArmour\.coveredBy \? ` by \$\{targetArmour\.coveredBy\}` : ""\}/.test(ATTACK));
  ok("C6 the damage step's bypass follows the table's answer, and drains the pool when it doesn't bypass",
    /locationArmoured: targetArmoured,/.test(ATTACK) && /const drBypassed = Boolean\(critical\) && !locationArmoured;/.test(ATTACK)
    && /drainBracers\(targetActor, packet, bracersSource && !drBypassed\)/.test(ATTACK));
}

/* E — the amendment's damage comes off the pool (3.617.5) */
{
  globalThis.game ??= { time: { worldTime: 1000 } };
  const { absorbAmendment } = await import("../module/bracers-workflow.mjs");
  const DRAIN = strip(read("module", "bracers-workflow.mjs"));
  const fakeEffect = (state) => {
    const flags = { spellArmour: { ...state } };
    return { id: "e1", name: "Mage Armour", flags, getFlag: (_s, k) => flags[k], setFlag: async (_s, k, v) => { flags[k] = v; } };
  };
  const maActor = (hp) => {
    const effect = fakeEffect({ hp, max: 80, lockoutMinutes: 60, spellName: "Mage Armour" });
    return { effect, actor: { system: { combat: { bracers: { ...MA, source: "effect", hp, max: 80 } } },
      effects: { get: (id) => (id === "e1" ? effect : null) }, items: { get: () => null } } };
  };
  const { effect, actor } = maActor(80);
  const lineMA = await absorbAmendment(actor, 6, "base die x2");
  ok("E1 Mage Armour's pool takes the amendment whole: 80 → 74, and the card says so",
    effect.flags.spellArmour.hp === 74 && /absorbs the critical: 6 damage \(base die x2\)/.test(lineMA) && /74\/80 HP left/.test(lineMA));
  const item = { name: "Bracers of Armour II", flags: {}, setFlag: async (_s, k, v) => { item.flags[k] = v; } };
  const brActor = (hp) => ({ system: { combat: { bracers: { ...BRACERS, source: "item", hp, max: 30 } } },
    items: { get: (id) => (id === "b1" ? item : null) }, effects: { get: () => null } });
  const lineBr = await absorbAmendment(brActor(30), 4, "base die x1");
  ok("E2 so does a pair of bracers' pool", Object.values(item.flags)[0]?.hp === 26 && /26\/30 HP left/.test(lineBr));
  const spent = await absorbAmendment(brActor(3), 4, "base die x1");
  ok("E3 more than is left: the bracers go inert", Object.values(item.flags)[0]?.hp === 0 && /inert for 1 hour/.test(spent));
  ok("E4 no pool, or one already spent by the blow: nothing, and no line",
    (await absorbAmendment({ system: { combat: { bracers: { itemId: "", effectId: "", hp: 0 } } } }, 5)) === ""
    && (await absorbAmendment(maActor(0).actor, 5)) === "");
  ok("E5 the damage step sends it to the armour the blow met, and a worn piece takes it otherwise",
    /if \(bracersSource && !drBypassed\) \{\s*const \{ absorbAmendment \} = await import\("\.\.\/bracers-workflow\.mjs"\);/.test(ATTACK)
    && /\} else if \(targetArmourItem\) \{\s*const armourDamage = await amendmentDamage\(\);/.test(ATTACK));
  ok("E6 one drain for both: the blow's DR and the amendment share the pool code",
    /return drainPool\(actor, stopped, \{ verb: `the magical armour stops \$\{stopped\}` \}\);/.test(DRAIN)
    && /return drainPool\(actor, taken, \{/.test(DRAIN));
}

/* D — the version */
{
  const sys = JSON.parse(read("system.json"));
  ok("D1 the version is 3.617.5 or later",
    /^\d+\.\d+\.\d+$/.test(String(sys.version ?? "")) && String(sys.version).localeCompare("3.617.5", undefined, { numeric: true }) >= 0);
}

if (failures.length) {
  console.log(`verify-whole-body-armour: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-whole-body-armour: OK — ${checks} checks. Mage Armour and Bracers of Armour cover every hit location, and take their share of an amended critical.`);
