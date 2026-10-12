#!/usr/bin/env node
/**
 * verify-bonus-slots — every bonus a spell grants must land somewhere real.
 *
 * NEW at 3.410.0.
 *
 * THE TRAP THIS CLOSES, found before anything fell into it. A bonus row
 * names a SLOT, and `bonusTargetFor` turns it into a path on the actor.
 * Four places exist — attributes, skills, movement and combat — and a
 * slot that resolves to a path no actor has applies **absolutely
 * nothing, quietly**. That has already happened twice in this project's
 * history (a polymorph spell's Strength line, Animal Spirit's Athletics
 * line), and `speed` was the third one waiting: it resolved to
 * `system.combat.speed` while the template stores
 * `combat.movement.land`.
 *
 * So this checks the resolved path against the ACTOR TEMPLATE rather
 * than against a list of slots typed here — §5.3, a check written beside
 * the code encodes the same mistake.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { bonusTargetFor, ALL_SKILLS_SLOT, ALL_SPEEDS_SLOT, speedsPresentOn } from "../module/magic/spell-effects.mjs";
import { meetsActionRequirement } from "../module/combat/action.mjs";
import { TARGET_SLOTS } from "../module/bonuses/registry.mjs";
import { pooledSpeedValue } from "../module/migration.mjs";

let checks = 0;
const failures = [];
const ok = (l, c, d = "") => { checks += 1; if (!c) failures.push(`${l}${d ? ` — ${d}` : ""}`); };

/** The character's merged system shape, from template.json itself. */
const template = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "template.json"), "utf8"));
const merged = {};
for (const name of template.Actor?.character?.templates ?? []) {
  Object.assign(merged, template.Actor.templates?.[name] ?? {});
}
for (const [k, v] of Object.entries(template.Actor?.character ?? {})) {
  if (k !== "templates") merged[k] = v;
}

/** The template node at a dotted path, or undefined. */
function nodeAt(dotted) {
  let node = merged;
  for (const part of String(dotted).replace(/^system\./, "").split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

/**
 * Targets that exist ONLY in derived data, and are reached only through
 * the typed bonus pool.
 *
 * NEW at 3.590.0. `effect-change-types.mjs` names these three and says
 * why: "POOL-ONLY TARGETS APPLIED NOTHING AT ALL. `system.combat.dr` and
 * the two natural-armour targets have no sheet slots by design
 * (TARGET_SLOTS.dr is `{}`) \u2014 they are read from the typed bonus pool,
 * and only a CUSTOM-mode change ever reaches that pool."
 *
 * `system.combat.dr` is not in template.json AT ALL; it is built in
 * `prepareDerivedData` each cycle. So the template test below cannot see
 * it and reported Iron Body's DR row as landing nowhere.
 *
 * MEASURED LIVE BEFORE DECLARING IT, 25 September 2026, on a real actor
 * in Graham's world: a CUSTOM change to `system.combat.dr.status` took
 * the total 0 \u2192 8, and a 20-point slashing hit went 20 \u2192 12 through
 * `resolveAgainstDefences`. The bonus lands and it reaches damage.
 *
 * A DECLARED LIST RATHER THAN A LOOSENED TEST: anything not named here
 * still has to exist on the template, so the 3.410.0 defect this file
 * was written for \u2014 a bonus written to a bare number \u2014 cannot come
 * back through the exemption.
 */
const POOL_ONLY_TARGETS = Object.freeze([
  "system.combat.dr",
  "system.combat.naturalArmourFlat",
  "system.combat.naturalArmourBase"
]);

/** Does this dotted path exist on the template, or is it a derived pool? */
function pathExists(dotted) {
  if (POOL_ONLY_TARGETS.includes(String(dotted))) return true;
  return nodeAt(dotted) !== undefined;
}

/**
 * Is the template node at this path shaped like a bonus pool?
 *
 * THE PROPERTY THAT ACTUALLY MATTERS, and the one 3.410.0's check did not
 * ask. `applyBonusEffect` writes `<target>.<bonusType>`, which only means
 * anything if the target carries those keys. `combat.movement.land`
 * EXISTED — it was the number 30 — and a bonus written into it vanished.
 *
 * Checked against `template.json`, where the STORED shape lives. Derived
 * pools carry more (breakdown, tooltip, total), but a slot that is a bare
 * number in the template can never gain them.
 */
function isPoolShaped(dotted) {
  const node = nodeAt(dotted);
  return Boolean(node) && typeof node === "object" && !Array.isArray(node)
    && Object.hasOwn(node, "status");
}

ok("A1 the template parsed into a shape with combat and skills",
  Boolean(merged.combat) && Boolean(merged.skills),
  `top-level keys: ${Object.keys(merged).join(", ")}`);

// A2 IS THE GUARD ON THE GUARD. If pathExists said yes to everything,
// every check below would pass while proving nothing.
ok("A2 a path that cannot exist is rejected", pathExists("system.combat.notAThing") === false);
ok("A2b and a real one is accepted", pathExists("system.combat.defence") === true);
// A3 GIVES THE POOL TEST A NEGATIVE CASE. Without one it could be
// loosened to "does the path exist" and nothing would notice — which is
// precisely the mistake it exists to prevent, one level up.
ok("A3 a real pool is recognised", isPoolShaped("system.combat.defence") === true);
ok("A3b a bare number in the template is not",
  isPoolShaped("system.combat.deathState") === false,
  "if this passes, the pool test has been loosened back into a path test");

/* ================================================================== *
 * B. Every slot that resolves must resolve somewhere real
 * ================================================================== */

for (const slot of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]) {
  ok(`B1 attribute "${slot}" resolves`, pathExists(bonusTargetFor(slot)), String(bonusTargetFor(slot)));
}
for (const slot of ["athletics", "deception", "stealth", "medicine", "diplomacy"]) {
  ok(`B2 skill "${slot}" resolves`, pathExists(bonusTargetFor(slot)), String(bonusTargetFor(slot)));
}
for (const slot of ["fortitude", "reflex", "will"]) {
  ok(`B3 save "${slot}" resolves`, pathExists(bonusTargetFor(slot)), String(bonusTargetFor(slot)));
}
ok("B4 defence resolves", pathExists(bonusTargetFor("defence")), String(bonusTargetFor("defence")));

/* ================================================================== *
 * C. A slot with nowhere pooled to land is REFUSED, not resolved
 * ================================================================== *
 *
 * THE DEFECT THIS SECTION EXISTS FOR. 3.410.0 mapped "speed" to
 * `system.combat.movement.land` and the then-current check confirmed the
 * path existed. It does — it is the NUMBER 30. `applyBonusEffect` writes
 * to `<target>.<bonusType>`, so the change landed on `movement.land.status`,
 * a property on a number, and did nothing while 63 checks passed.
 *
 * Live proof, one cast of Physical Surge:
 *     Athletics    0 → 2      skills are pools
 *     land        20 → 20     movement is a bare number
 *
 * Poolness is DERIVED and no Node harness can see it, so the honest check
 * is not "is this a pool" but "does the resolver refuse what it cannot
 * place". Null is visible; a wrong path is not.
 */

// C1 IS THE POOL ITSELF. A slot only works if the thing it names carries
// the bonus keys — path existence was the wrong property and is what made
// 63 checks pass over a bonus that could never land.
for (const slot of ["speed", "land", "fly", "swim", "climb", "burrow"]) {
  const target = bonusTargetFor(slot);
  ok(`C1 movement slot "${slot}" resolves`, target !== null, "pooled at 3.412.0");
  ok(`C1b and "${slot}" lands in something carrying the bonus keys`,
    isPoolShaped(target),
    `${target} is not a pool — a bonus written to .status would vanish`);
}
ok("C2 and a real slot is still resolved", bonusTargetFor("defence") !== null);

// C3: THE VIRTUAL SLOT stays refused by the resolver — it expands at
// apply time to however many speeds the creature has, per Graham's ruling.
ok("C3 allSpeeds is virtual, not a path", bonusTargetFor(ALL_SPEEDS_SLOT) === null);
{
  const human = { combat: { movement: { land: { base: 30 }, fly: { base: 0 }, swim: { base: 0 } } } };
  const dragon = { combat: { movement: { land: { base: 40 }, fly: { base: 80 }, swim: { base: 30 } } } };
  ok("C3b a landbound creature has land only", speedsPresentOn(human).join() === "land");
  ok("C3c a dragon has each it actually has", speedsPresentOn(dragon).join() === "land,fly,swim");
  ok("C3d nobody gains one they never had", !speedsPresentOn(human).includes("swim"));
  ok("C3e it reads BASE, not total",
    speedsPresentOn({ combat: { movement: { fly: { base: 0, status: 10, total: 10 } } } }).length === 0,
    "a speed a creature only has because of this very spell must not bootstrap itself");
}

/* ================================================================== *
 * E. Everything that READS a speed must survive it becoming a pool
 * ================================================================== */

// E1 IS THE BREAK THIS CHANGE NEARLY CAUSED. `meetsActionRequirement` did
// `Number(value) > 0` on the resolved node; on a pool that is NaN, and
// every Fly and Burrow action would have silently stopped being offered.
ok("E1 an action requirement reads a pool's total",
  meetsActionRequirement("combat.movement.fly", { combat: { movement: { fly: { base: 0, total: 30 } } } }) === true);
ok("E1b and refuses a speed of zero",
  meetsActionRequirement("combat.movement.fly", { combat: { movement: { fly: { base: 0, total: 0 } } } }) === false);
ok("E1c while a plain number still works",
  meetsActionRequirement("combat.movement.fly", { combat: { movement: { fly: 30 } } }) === true,
  "an unmigrated token actor must not lose its actions mid-session");
ok("E1d and a missing node is refused",
  meetsActionRequirement("combat.movement.fly", {}) === false);

ok("E2 the movement slot table exists", Boolean(TARGET_SLOTS.movement));
ok("E2b carrying base and the typed keys",
  ["base", "item", "status", "circumstance", "other"].every((k) => k in TARGET_SLOTS.movement));

// C3: THE APPLIER MUST ACT ON THE REFUSAL. A null target used anyway
// writes to the string "null.status" — a path even more imaginary than
// the one this replaced. Added after a mutation gutting the guard
// SURVIVED, because nothing asserted the guard existed.
{
  const fx = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");
  // C4 IS THE OTHER HALF, and the live pass is why it exists. The
  // applier refused correctly and the CALLER printed the bonus anyway:
  // nothing applied, card said otherwise. A refusal nobody reads is
  // worse than no refusal, because it produces a confident lie.
  ok("C4 and the caller reports the refusal instead of announcing the bonus",
    /bonusResult\.applied === false[\s\S]{0,260}nothing applied/.test(fx)
    && /const bonusResult =/.test(fx),
    "the card must not announce what did not happen");
  ok("C3 the applier refuses a slot it cannot place",
    /const placed = bonusTargetFor\(effect\.slot\);\s*\n\s*if \(!placed\) \{[\s\S]{0,240}return \{ applied: false/.test(fx),
    "without the guard the change goes to \"null.status\"");
}

/* ================================================================== *
 * D. Every bonus row in every pack
 * ================================================================== */
{
  const packs = ["spells", "feats", "gear", "classes", "races"];
  const { ClassicLevel } = await import("classic-level");
  let rows = 0;
  for (const pack of packs) {
    const dir = path.join(SYSTEM_ROOT, "packs", pack);
    if (!fs.existsSync(dir)) continue;
    const db = new ClassicLevel(dir, { valueEncoding: "json" });
    await db.open();
    try {
      for await (const [key, value] of db.iterator()) {
        if (!key.startsWith("!items!")) continue;
        for (const effect of value.system?.effects ?? []) {
          if (effect?.kind !== "bonus" || !effect.slot) continue;
          rows += 1;
          // The virtual slot has no path by design — it expands at apply
          // time to however many speeds the creature has. Section C covers it.
          // TWO EXPANSIONS, NOT SLOTS (3.594.0). `allSkills` joined
          // `allSpeeds` for Prayer and Qualm: both name a list of pools
          // rather than one, so `bonusTargetFor` refuses them on purpose
          // and this census must skip them or it reports the refusal it
          // was written to rely on.
          if (String(effect.slot) === ALL_SPEEDS_SLOT) continue;
          if (String(effect.slot) === ALL_SKILLS_SLOT) continue;
          const target = bonusTargetFor(String(effect.slot));
          // D1 CATCHES BOTH FAILURES: a slot the resolver refuses, and one
          // it resolves to a path no actor has.
          ok(`D1 ${pack}/"${value.name}" bonus to "${effect.slot}" can land`,
            target !== null && pathExists(target),
            target === null
              ? `"${effect.slot}" is not a bonus slot — it would apply nothing`
              : `${target} is not on the actor`);
        }
      }
    } finally { await db.close(); }
  }
  ok("D2 there are bonus rows to check at all", rows > 0, `${rows} found`);
  process.stdout.write(`  (${rows} bonus rows across the packs)\n`);
}

/* ================================================================== *
 * F. The migration that gets existing characters here
 * ================================================================== *
 *
 * Every stored actor holds the OLD shape — a bare number — and without
 * this every character in the world would read a Speed of 0.
 */

ok("F1 a stored number becomes a pool with that base",
  JSON.stringify(pooledSpeedValue(30))
    === JSON.stringify({ base: 30, item: 0, status: 0, circumstance: 0, other: 0, total: 30 }));
ok("F2 the value is preserved, not recomputed", pooledSpeedValue(25).base === 25);
ok("F3 a zero speed is still pooled", pooledSpeedValue(0)?.base === 0,
  "a creature with no fly speed still needs somewhere for one to be granted");

// F4 IS IDEMPOTENCE, and it matters more than usual: a second run, or a
// world half-migrated when somebody closed the tab, must not wrap a pool
// inside another pool.
ok("F4 a speed already pooled is left alone",
  pooledSpeedValue({ base: 30, status: 0 }) === null);
ok("F5 the 3.223.3 array corruption is treated as absent, not guessed at",
  pooledSpeedValue([0, 0])?.base === 0);
ok("F6 nonsense floors at zero rather than going negative",
  pooledSpeedValue(-10)?.base === 0 && pooledSpeedValue("x")?.base === 0);

/* ================================================================== *
 * D. NO SLOT DECLARED TWICE (3.595.0)
 *
 * `TARGET_SLOTS` CARRIED `movement` TWICE until this release — two entries
 * in one object literal, with the same five keys and the same fifteen-line
 * comment above each. The later won, silently, the way a duplicate key
 * always does; because the two were identical, nothing on any sheet was
 * wrong and nothing would ever have shown it.
 *
 * Found by reading the file for the Shape family's speeds, not by a check.
 * This is that check: the next duplicate may differ, and then the loser's
 * pool would be a slot every author believes in and nothing reads.
 * ================================================================== */
{
  const src = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "bonuses", "registry.mjs"), "utf8");
  const body = src.slice(src.indexOf("export const TARGET_SLOTS"), src.indexOf("export const TARGET_SLOTS") + 4000);
  const names = (body.match(/^  ([a-zA-Z]+): \{/gm) ?? []).map((m) => m.trim().replace(":", "").replace(" {", ""));
  const seen = new Set();
  const twice = names.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
  ok("D1 NO TARGET SLOT IS DECLARED TWICE", twice.length === 0, `declared twice: ${twice.join(", ")}`);
  ok("D1b and the slots were found at all", names.length > 5, `${names.length} slot(s) parsed`);
}

process.stdout.write(`verify-bonus-slots: ${checks} checks\n`);
if (failures.length) {
  process.stdout.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
