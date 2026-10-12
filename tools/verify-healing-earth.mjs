#!/usr/bin/env node
/**
 * verify-healing-earth — the last PP 0 spell, which makes a THING.
 *
 * NEW at 3.407.0.
 *
 * THE FAILURE THIS EXISTS TO MAKE IMPOSSIBLE is a silent one: the earth
 * appears in the inventory looking exactly right, and substitutes for
 * nothing, because one field of the item it creates does not match what
 * `findEquippedGearByTrait` looks for. So the checks below run the REAL
 * finder over the REAL produced object rather than comparing it to a list
 * of fields typed out a second time here — §5.3, a check written beside
 * the code encodes the same mistake.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  healingEarthItemData, healingEarthBonus, healingEarthExpired, expiredHealingEarth,
  existingHealingEarth, isHealingEarth, HEALING_EARTH_CL, HEALING_EARTH_FLAG, HEALERS_TOOLS
} from "../module/magic/healing-earth.mjs";
import { findEquippedGearByTrait, isTemporaryGear, consumedUseValue } from "../module/gear-uses.mjs";
import { normaliseConditional, matchesCheck } from "../module/conditionals.mjs";
import { casterLevelOf } from "../module/magic/caster-level-mods.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const earth = (level = 5, expires = 600) =>
  healingEarthItemData({ casterLevel: level, expiresAt: expires });

const REAL_TOOLS = {
  name: "Healers Tools", type: "gear",
  system: { equipped: true, traits: "Healer's Tools", uses: { value: 10, max: 10 } }
};

/* ================================================================== *
 * A. The earth IS healer's tools, to the code that spends them
 * ================================================================== */

// A1 IS THE WHOLE SPELL. Run through the real finder, not a field list.
ok("A1 the finder accepts the earth as healer's tools",
  findEquippedGearByTrait([earth()], HEALERS_TOOLS) !== null,
  "if this fails the earth sits in the inventory substituting for nothing, silently");

// A2–A5: each field the finder requires, broken one at a time, so a
// future edit to the item's shape cannot pass A1 by accident.
for (const [field, mutate] of [
  ["type", (i) => ({ ...i, type: "loot" })],
  ["equipped", (i) => ({ ...i, system: { ...i.system, equipped: false } })],
  ["traits", (i) => ({ ...i, system: { ...i.system, traits: "Alteration, Earth" } })]
]) {
  ok(`A2 the finder needs "${field}"`,
    findEquippedGearByTrait([mutate(earth())], HEALERS_TOOLS) === null,
    "a field the finder needs must be one this check would notice losing");
}

ok("A3 the earth carries exactly one use", earth().system.uses.max === 1
  && earth().system.uses.value === 1,
  'the text says it reverts "if it remains UNUSED" — one application');
ok("A4 spending that use empties it", consumedUseValue(1, 1) === 0,
  "an earth with a use left after being used would be a second free casting");

/* ================================================================== *
 * B. Which kit gets spent — the declared ruling
 * ================================================================== */

// B1 IS A RULING, NOT A READING. The book does not say; document order
// decided it before, which is arbitrary and silent.
ok("B1 the conjured earth is spent before a real kit",
  findEquippedGearByTrait([REAL_TOOLS, earth()], HEALERS_TOOLS)?.name === "Healing Earth",
  "the earth reverts in ten minutes either way; the tools do not");
ok("B1b regardless of the order they sit in",
  findEquippedGearByTrait([earth(), REAL_TOOLS], HEALERS_TOOLS)?.name === "Healing Earth");
ok("B2 a real kit is still found when there is no earth",
  findEquippedGearByTrait([REAL_TOOLS], HEALERS_TOOLS)?.name === "Healers Tools",
  "the preference must not break the ordinary case");
ok("B3 nothing equipped finds nothing",
  findEquippedGearByTrait([], HEALERS_TOOLS) === null);
ok("B4 the earth is marked temporary", isTemporaryGear(earth()));
ok("B4b and a real kit is not", isTemporaryGear(REAL_TOOLS) === false);

/* ================================================================== *
 * C. The CL 5 bonus
 * ================================================================== */

ok(`C1 below CL ${HEALING_EARTH_CL} it grants nothing`, healingEarthBonus(4) === 0);
ok(`C2 at CL ${HEALING_EARTH_CL} it grants +1`, healingEarthBonus(5) === 1);
ok("C3 and above", healingEarthBonus(12) === 1);
ok("C4 a low-level earth carries no conditional",
  (earth(4).flags["trg-prime"].conditionals ?? []).length === 0);

{
  const raw = earth(5).flags["trg-prime"].conditionals[0];
  const entry = normaliseConditional(raw, { id: "he", name: "Healing Earth" }, 0);
  ok("C5 the bonus survives normalisation", Boolean(entry));
  ok("C6 it is an ITEM bonus", entry.type === "item",
    "the book says item bonus; it must not stack with the real kit's +2");
  ok("C7 it reaches Treat Wounds",
    matchesCheck(entry, { checkType: "skill", subject: "medicine", actionKey: "treatWounds" }));
  ok("C8 and Administer First Aid",
    matchesCheck(entry, { checkType: "skill", subject: "medicine", actionKey: "firstAid" }),
    "the CL 5 line names both, and needs no tools requirement to hang on");
  // C9: NOT the actions the spell does not name.
  ok("C9 not Treat Disease",
    matchesCheck(entry, { checkType: "skill", subject: "medicine", actionKey: "treatDisease" }) === false,
    "a blanket Medicine bonus would reach three actions the spell never mentions");
  ok("C10 not another skill entirely",
    matchesCheck(entry, { checkType: "skill", subject: "athletics", actionKey: "firstAid" }) === false);
}

/* ================================================================== *
 * D. Reverting to dirt
 * ================================================================== */

ok("D1 it has not reverted before its time", healingEarthExpired(earth(5, 600), 599) === false);
ok("D2 it reverts on the tick", healingEarthExpired(earth(5, 600), 600) === true);
ok("D3 and after", healingEarthExpired(earth(5, 600), 5000) === true);

// D4: A SPELL WITH NO READABLE DURATION MUST NOT DELETE A PLAYER'S ITEM
// on a clock nobody set.
ok("D4 an earth with no expiry never reverts",
  healingEarthExpired(earth(5, null), 999999) === false);
ok("D5 an ordinary item is never swept", healingEarthExpired(REAL_TOOLS, 999999) === false);
ok("D5b and is not recognised as earth", isHealingEarth(REAL_TOOLS) === false);
ok("D5c while the earth is", isHealingEarth(earth()) === true);

ok("D6 the sweep picks out only what has reverted",
  expiredHealingEarth([REAL_TOOLS, earth(5, 100), earth(5, 900)], 500).length === 1);

// D7: "OR IF YOU CAST THE SPELL AGAIN BEFORE USING IT" — a recast finds
// every earth, expired or not.
ok("D7 a recast finds the earlier earth",
  existingHealingEarth([REAL_TOOLS, earth(5, 900)]).length === 1);

/* ================================================================== *
 * E. One spelling of the trait
 * ================================================================== */
{
  const gear = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "gear-uses.mjs"), "utf8");
  const action = fs.readFileSync(
    path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs"), "utf8");
  ok("E1 the pattern is defined once, where it is consumed",
    /export const HEALERS_TOOLS = /.test(gear));
  // 3.577.0: the kit a Treat action spends is the kit the tool requirement
  // accepted (block 17, D4), so the pattern is read by tools-requirement.mjs
  // — as the treat* actions' `trait` — and the workflow spends through it.
  const tools = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "tools-requirement.mjs"), "utf8");
  ok("E2 the tool requirement imports it rather than re-typing it",
    /import \{ HEALERS_TOOLS, isTemporaryGear \} from "\.\/gear-uses\.mjs";/.test(tools)
    && (tools.match(/trait: HEALERS_TOOLS,/g) ?? []).length === 4
    && /await spendToolUse\(actor, action\.key\);/.test(action),
    "a second regex here is a second spelling of one fact");
  ok("E3 and no literal pattern survives beside it",
    !/consumeGearUse\(actor, \/\\bhealer/.test(action));
}

/* ================================================================== *
 * F. The pack and the wiring
 * ================================================================== */

async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.set(String(value.name).trim().toLowerCase(), value);
    }
  } finally {
    await db.close();
  }
  return out;
}

const spells = await spellsPack();
{
  const spell = spells.get("healing earth");
  const effects = spell?.system?.effects ?? [];
  ok("F1 Healing Earth is wired", effects.some((e) => e.kind === "healingEarth"),
    "it was the last unwired PP 0 spell");
  ok("F2 its duration is readable", /\d+\s*(minute|round|hour)/i.test(spell?.system?.duration ?? ""),
    `duration: "${spell?.system?.duration}" — an unreadable one never reverts`);
}

// F3: EXACTLY ONE SPELL USES THIS. Measured before it was built: no other
// spell in the book substitutes for equipment, so this stays specific
// until a second one needs it — the position markers.mjs takes.
{
  let users = 0;
  for (const spell of spells.values()) {
    if ((spell.system?.effects ?? []).some((e) => e.kind === "healingEarth")) users += 1;
  }
  ok("F3 exactly one spell makes the earth", users === 1,
    `${users} — if a second appears, this mechanism should be generalised first`);
}

{
  const effectsFile = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
  const text = fs.readFileSync(effectsFile, "utf8");
  ok("F4 the applier builds the item through the single writer",
    /healingEarthItemData\(/.test(text));
  ok("F5 and reverts an earlier earth on a recast",
    /existingHealingEarth[\s\S]{0,200}deleteEmbeddedDocuments/.test(text),
    '"or if you cast the spell again before using it"');

  const boot = fs.readFileSync(path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"), "utf8");
  // F6 MUST NOT SETTLE FOR THE NAME BEING PRESENT. It first read
  // `/expiredHealingEarth/`, and a mutation gutting the CALL survived,
  // because the IMPORT line still mentioned it. A check satisfied by an
  // import is a check on spelling, not behaviour.
  ok("F6 the world clock sweeps reverted earth",
    /expiredHealingEarth\(actor\.items, worldTime\)/.test(boot)
    && /gone\.length[\s\S]{0,160}deleteEmbeddedDocuments\("Item", gone\.map/.test(boot),
    "the sweep must call it AND delete what it returns");
  ok("F7 and only when the actor carries some",
    /items\?\.some\(\(i\) => i\.getFlag\?\.\("trg-prime", "healingEarth"\)\)/.test(boot),
    "every actor paying for an import on every clock tick is a cost nobody asked for");
}

/* ================================================================== *
 * G. The caster's level — the bug this release shipped with
 * ================================================================== *
 *
 * The applier read `system.level.value ?? system.details.level`. NEITHER
 * FIELD EXISTS on this system's actors, so every caster resolved to 0 and
 * the CL 5 bonus could never apply to anyone, silently.
 *
 * Section C did not catch it because `healingEarthItemData` takes the
 * level as a PARAMETER: the checks fed it the right value while the
 * applier fed it a wrong one. The decision lived inside a Foundry-only
 * function, which is why it now lives in a pure one instead.
 */

ok("G1 the derived class-table figure wins",
  casterLevelOf({ magic: { casterLevelValue: 7, casterLevel: 2 }, identity: { level: 3 } }) === 7);
ok("G2 the stored input is next", casterLevelOf({ magic: { casterLevel: 4 } }) === 4);
ok("G3 the character's own level is the last resort",
  casterLevelOf({ identity: { level: 3 } }) === 3,
  "an actor with no casting block at all");
ok("G4 an actor with none of them is level 0", casterLevelOf({}) === 0);
ok("G4b and so is no actor at all", casterLevelOf(undefined) === 0);

// G5: A STORED ZERO IS A REAL ANSWER, not a missing one. `??` falls
// through on null and undefined only, and a non-caster legitimately has
// casterLevel 0 beside a character level of 9 — falling back there would
// hand them a caster level they do not have. My first draft of this check
// expected 9 and the CODE was right, not the expectation.
ok("G5 a stored zero does not fall through to character level",
  casterLevelOf({ magic: { casterLevelValue: 0 }, identity: { level: 9 } }) === 0);

// G6: THE REAL SHAPE, taken from a live actor (Merrick Thorne).
ok("G6 a live actor's shape reads correctly",
  casterLevelOf({ magic: { casterLevelValue: 3, casterLevel: 0 }, identity: { level: 3 } }) === 3);

// G7: what the applier used to read must resolve to nothing, so this
// check fails if anyone reintroduces those paths as the source.
ok("G7 the fields the bug read are not the source",
  casterLevelOf({ level: { value: 8 }, details: { level: 8 } }) === 0,
  "if this ever returns 8, someone has taught the reader a field that does not exist");

{
  const effectsFile = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
  const text = fs.readFileSync(effectsFile, "utf8");
  ok("G8 the applier asks the shared reader",
    /const casterLevel = casterLevelOf\(caster\?\.system\)/.test(text),
    "the value the CL 5 bonus depends on must come from the one place that knows");
  ok("G9 and no longer reads the fields that do not exist",
    !/caster\?\.system\?\.level\?\.value/.test(text));

  const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
  ok("G10 the cast workflow's two copies are gone too",
    !/system\.magic\?\.casterLevelValue \?\? system\.magic\?\.casterLevel/.test(cast),
    "three copies of one fact, one of them wrong, is how the wrong one survives");
}

process.stdout.write(`verify-healing-earth: ${checks} checks\n`);
if (failures.length) {
  process.stdout.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
