#!/usr/bin/env node
/**
 * verify-conjured-weapon — can a spell make a weapon out of nothing?
 *
 * NEW at 3.543.0, beside the rule.
 *
 * THE DEFECT was not a wrong filter, it was NO SPELL: Eldritch Weapon
 * shipped with `effects: []`, so six PP produced nothing and all three of
 * its warping options were inert for want of a weapon to modify. P1 is
 * that measurement turned into a check.
 *
 * THE FILTER IS DRIVEN AGAINST THE REAL PACK, not a fixture, because the
 * question "which weapons may this spell make" is only interesting if the
 * answer is the ones actually in the game.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { aggregateWarpSelection } from "../module/magic/spell-warp.mjs";
import {
  normaliseConjuredWeapon, conjuredWeaponCategories, conjuredWeaponChoices,
  conjuredWeaponData, conjuredWeaponAllows, CONJURED_WEAPON_DAMAGE
} from "../module/magic/conjured-weapon.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

async function read(name) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [, v] of db.iterator()) if (v?.name) out.push(v);
  await db.close();
  return out;
}

const weapons = await read("weapons");
const spells = (await read("spells")).filter((s) => s.type === "spell");
const eldritch = spells.find((s) => s.name === "Eldritch Weapon");
const ROW = (eldritch?.system?.effects ?? []).find((e) => e?.kind === "conjuredWeapon");

/* ── P: THE SPELL EXISTS NOW ──────────────────────────────────────── */

ok("P1 ELDRITCH WEAPON HAS AN EFFECT ROW AT ALL",
  Boolean(ROW),
  "it shipped with effects: [] — six PP that produced nothing, and three warps with no "
  + "weapon to modify");

ok("P1b AND THE ROW IS WELL FORMED", Boolean(normaliseConjuredWeapon(ROW)));

equal("P2 AND ITS MARTIAL WARP IS BUILT",
  JSON.stringify(eldritch?.system?.warps?.[0]?.mods ?? {}),
  JSON.stringify({ weaponCategories: ["Martial"] }),
  "\"the weapon can be a martial weapon\" — unbuildable until there was a choice list "
  + "to widen");

ok("P3 THE WEAPONS PACK IS NOT EMPTY",
  weapons.filter((w) => w.type === "weapon").length > 20,
  `${weapons.length} entries — a collapse here makes every choice check below pass by `
  + "finding nothing");

/* ── C: WHAT IT MAY MAKE ──────────────────────────────────────────── */

const warped = aggregateWarpSelection(eldritch?.system?.warps ?? [], { "warp-0": true }).mods;

const plain = conjuredWeaponChoices(ROW, {}, weapons);
const wider = conjuredWeaponChoices(ROW, warped, weapons);

ok("C1 UNWARPED IT OFFERS SIMPLE WEAPONS AND SOME EXIST",
  plain.length > 0 && plain.every((w) => String(w.system.category).toLowerCase() === "simple"),
  `${plain.length} offered: ${plain.map((w) => w.name).join(", ")}`);

ok("C2 THE WARP WIDENS RATHER THAN REPLACES",
  wider.length > plain.length && plain.every((p) => wider.some((w) => w.name === p.name)),
  `${plain.length} → ${wider.length}. "can be a martial weapon" leaves the simple ones on `
  + "the table; no warp in the pack takes away something already paid for");

/* C3 CANNOT BE ASKED OF THE PACK, AND THAT IS THE FINDING.
 *
 * It first read `wider.every(hands === 1)` and passed — but the mutation
 * runner deleted the hand-count filter entirely and it STILL passed,
 * because the pack marks Greatsword, Greataxe, Greatpick and Longbow as
 * `hands: 1`. Only four weapons in seventy-six carry `hands: 2`.
 *
 * So the rule is checked against fixtures, where the answer is known, and
 * the pack's own data is pinned separately in P4 as the defect it is. */
ok("C3 A TWO-HANDED WEAPON IS REFUSED WHEN THE DATA SAYS SO",
  !conjuredWeaponAllows(ROW, warped, { type: "weapon", name: "Fixture Greatsword",
    system: { category: "Martial", hands: 2, traits: "" } }),
  "the spell says one-handed, and the widest warp does not change that");

ok("C3b WHILE A ONE-HANDED ONE IS ALLOWED",
  conjuredWeaponAllows(ROW, warped, { type: "weapon", name: "Fixture Mace",
    system: { category: "Martial", hands: 1, traits: "" } }),
  "without this, C3 passes on a filter that refuses everything");

/* C4 TESTED `system.range` FIRST AND WAS VACUOUS: every weapon in the
 * pack carries range 0 and states its reach in TRAITS, so the check
 * passed on a field nobody uses while a Composite Shortbow sat in the
 * offered list. It reads the trait now, and C4b proves the trait test
 * still rejects something. */
ok("C4 NOR A RANGED ONE",
  wider.every((w) => !/\brange\b/i.test(String(w.system.traits ?? ""))),
  "offered: " + wider.filter((w) => /\brange\b/i.test(String(w.system.traits ?? "")))
    .map((w) => w.name).join(", "));

ok("C4b AND A BOW IS REFUSED WHEN ONE IS OFFERED TO THE FILTER",
  !conjuredWeaponAllows(ROW, warped, { type: "weapon", name: "Fixture Bow",
    system: { category: "Martial", hands: 1, traits: "Range 60 ft" } }),
  "the pack has no one-handed bow to catch this naturally, so the filter is asked "
  + "directly — without it C4 passes by finding nothing again");

ok("C4c WHILE A THROWN WEAPON IS STILL A MELEE WEAPON",
  conjuredWeaponAllows(ROW, warped, { type: "weapon", name: "Fixture Javelin",
    system: { category: "Martial", hands: 1, traits: "Thrown 20 ft" } }),
  "Thrown and Range are not synonyms — a trident is a melee weapon you may also throw, "
  + "and excluding it would be the filter over-reaching");

equal("C5 CATEGORIES ARE A UNION, WITHOUT DUPLICATES",
  JSON.stringify(conjuredWeaponCategories(ROW, { weaponCategories: ["Simple", "Martial"] })),
  JSON.stringify(["Simple", "Martial"]),
  "the base already names Simple; buying it again must not list it twice");

/* ── D: WHAT IT MAKES ─────────────────────────────────────────────── */

const sample = plain[0];
/* CAPTURED BEFORE ANY COPY IS TAKEN. Reading this later — even from the
 * pack array — was defeated twice: `plain[0]` IS the pack object, so a
 * copy that wrote through had already changed both by the time D2b
 * looked. The only honest moment is before the first call. */
const originalDamageType = String(sample?.system?.damageType ?? "");
ok("D1 THERE IS A SAMPLE TO SHAPE", Boolean(sample));
if (sample) {
  equal("D2 THE COPY DEALS FORCE, WHATEVER IT WAS COPIED FROM",
    conjuredWeaponData(ROW, sample).system.damageType, CONJURED_WEAPON_DAMAGE,
    "\"inflicts force damage RATHER THAN its normal type\" — a replacement, so nothing "
    + "downstream has to remember to drop the original");
  /* THIS WAS `|| true` WHEN I FIRST WROTE IT — a check that could not
   * fail, which is the exact defect this harness keeps catching in other
   * files. Rewritten to assert the thing it was named for: the pack entry
   * must come back unchanged after a copy is taken from it. */
  equal("D2b AND THE PACK ENTRY IS NOT ALTERED BY THE COPY",
    String(sample.system.damageType ?? ""), originalDamageType,
    "the entry is a template — mutating it would turn every future mace in the game to "
    + "force damage, and the first cast would be the only one that looked right");
  ok("D3 AND KEEPS EVERYTHING ELSE",
    conjuredWeaponData(ROW, sample).system.damage === sample.system.damage
    && conjuredWeaponData(ROW, sample).system.category === sample.system.category,
    "the spell says it \"requires any usual proficiencies\", so category and dice stay");
  equal("D4 AND ARRIVES UNEQUIPPED",
    conjuredWeaponData(ROW, sample).system.equipped, false,
    "\"you can wield it OR GIVE IT to another creature\" — the spell makes it, it does "
    + "not put it in your hand");
}

/* ── P4: A DATA DEFECT, PINNED RATHER THAN HIDDEN ─────────────────── */

const twoHanders = ["Greatsword", "Greataxe", "Greatpick", "Longbow"];
const mismarked = twoHanders
  .map((n) => weapons.find((w) => w.name === n))
  .filter((w) => w && Number(w.system.hands ?? 1) !== 2)
  .map((w) => w.name);

equal("P4 THE PACK STILL MISMARKS THESE FOUR AS ONE-HANDED",
  JSON.stringify(mismarked), JSON.stringify(twoHanders),
  "NOT A PASSING GRADE — this pins a defect so it cannot be forgotten. Only 4 of 76 "
  + "weapons carry hands: 2, so the hand-count filter above currently refuses nothing "
  + "in practice and Eldritch Weapon would offer a Greatsword. When the pack is "
  + "corrected this check FAILS, and the fix is to delete it and let C3 do the work");

/* ── E: DOES IT EVER GO AWAY? ─────────────────────────────────────────
 *
 * THE HALF 3.543.0 DID NOT BUILD, and no check above would ever have
 * noticed. Every one of them asks WHICH weapon and WHAT it deals; not one
 * asks whether the spell's duration means anything. It did not: the
 * weapon carried a castId and nothing else, `removeSpellItemsByCastId`
 * collects only items declaring `endsWithSpell === true`, and a 1-minute
 * spell never registers — so the conjured weapon was permanent. Measured
 * live, 9 Sep 2026, after the release notes said the spell was fixed.
 *
 * DRIVEN, NOT GREPPED. The flag is stamped in the Foundry-side workflow,
 * so the workflow is CALLED against a stub actor and the payload it
 * actually builds is read back. Asserting the flag by searching the
 * source would be the same check the mutation runner keeps defeating. */

const { conjureWeaponOnto } = await import("../module/magic/conjured-weapon-workflow.mjs");
const { expireSpellEffects } = await import("../module/combat/effect-application-workflow.mjs");

const captured = [];
const stubTarget = {
  name: "Fixture Caster",
  uuid: "Actor.fixture",
  async createEmbeddedDocuments(type, payloads) {
    if (type === "Item") captured.push(...payloads);
    return payloads.map((p, i) => ({ ...p, id: `made-${i}` }));
  }
};
await conjureWeaponOnto(stubTarget, ROW, { name: "Fixture Mace",
  system: { category: "Simple", hands: 1, traits: "", damageType: "bludgeoning" } }, "cast-1");

ok("E1 THE CONJURED WEAPON DECLARES THAT IT ENDS WITH THE SPELL",
  captured[0]?.flags?.["trg-prime"]?.endsWithSpell === true,
  "at 3.543.0 it carried only a castId, and the comment beside it claimed that was "
  + "enough to have it removed. It was not — the collector reads endsWithSpell, because "
  + "Bless Water's Holy Water is also made by a spell and is meant to be kept");

equal("E1b AND STILL CARRIES THE CASTING THAT MADE IT",
  captured[0]?.flags?.["trg-prime"]?.castId, "cast-1",
  "the flag says WHETHER it ends; the castId says WITH WHAT");

/* E2 RUNS THE COLLECTOR RATHER THAN TRUSTING E1. A declaration nothing
 * reads is worth as much as the comment that preceded it. */
{
  /* THE ITEM UNDER TEST IS THE ONE THE WORKFLOW REALLY BUILT.
   *
   * Written first as a hand-made fixture carrying the right flags, which
   * made E2 a test of the collector and nothing else: deleting the
   * declaration from `conjureWeaponOnto` would have left it green. It is
   * fed the captured payload instead, so E1 and E2 fail together on the
   * regression they exist for. */
  const CONJURED = { id: "w1", name: captured[0]?.name ?? "Fixture Mace",
    flags: captured[0]?.flags?.["trg-prime"] ?? {} };
  const KEPT = { id: "w2", name: "Holy Water", flags: { castId: "cast-1" } };
  const OTHERS = { id: "w3", name: "Wild Morph Claw",
    flags: { castId: "cast-2", endsWithSpell: true } };
  const SYS = "trg-prime";
  const state = { items: [], effects: [] };
  const effect = {
    id: "eff-1",
    name: "Conjured Weapon",
    statuses: undefined,
    flags: { [SYS]: { spellBuff: true, spellEffect: true, castId: "cast-1", spellEffectEnd: 60 } },
    getFlag(_s, k) { return this.flags[SYS][k]; },
    async setFlag(_s, k, v) { this.flags[SYS][k] = v; },
    async delete() { state.effects = state.effects.filter((e) => e.id !== "eff-1"); }
  };
  state.effects = [effect];
  state.items = [CONJURED, KEPT, OTHERS].map((raw) => ({
    id: raw.id,
    name: raw.name,
    flags: { [SYS]: { ...raw.flags } },
    getFlag(_s, k) { return this.flags[SYS][k]; }
  }));
  const actor = {
    name: "Fixture Caster",
    get effects() {
      const list = state.effects;
      list.get = (id) => list.find((e) => e.id === id);
      return list;
    },
    get items() { return state.items; },
    async deleteEmbeddedDocuments(type, ids) {
      if (type === "Item") state.items = state.items.filter((i) => !ids.includes(i.id));
      if (type === "ActiveEffect") state.effects = state.effects.filter((e) => !ids.includes(e.id));
      return ids;
    }
  };
  await expireSpellEffects(actor, 120);

  ok("E2 THE WORLD CLOCK TAKES THE CONJURED WEAPON AWAY",
    !state.items.some((i) => i.id === "w1"),
    "found live: a Morning Star conjured for one minute was still on the sheet "
    + "afterwards, six PP for a permanent force weapon");
  ok("E2b BUT KEEPS AN ITEM THAT DOES NOT SAY IT ENDS",
    state.items.some((i) => i.name === "Holy Water"),
    "without this, E2 passes on a collector that simply empties the inventory");
  ok("E2c AND KEEPS ANOTHER CASTING'S TEMPORARY ITEM",
    state.items.some((i) => i.name === "Wild Morph Claw"),
    "one spell ending must not strip every temporary item on the sheet");
}

/* ── N: REFUSALS ──────────────────────────────────────────────────── */

equal("N1 A ROW WITH NO CATEGORIES IS REFUSED",
  normaliseConjuredWeapon({ kind: "conjuredWeapon" }), null,
  "defaulting would offer the caster every weapon in the pack, which is a bigger spell "
  + "than the one that was written");
equal("N1b AND A ROW OF THE WRONG KIND",
  normaliseConjuredWeapon({ kind: "conjureItem", categories: ["Simple"] }), null);

ok("N2 THE FILTER SAYS NO TO A WEAPON OF THE WRONG CATEGORY",
  !conjuredWeaponAllows(ROW, {},
    { type: "weapon", name: "Fixture Exotic", system: { category: "Exotic", hands: 1, range: 0 } }),
  "without this, C1 could pass on a filter that had stopped filtering");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-conjured-weapon: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-conjured-weapon: OK — ${checks} checks. Eldritch Weapon makes a `
  + `weapon again, it deals force, and the warp widens the choice without replacing it.\n`);
