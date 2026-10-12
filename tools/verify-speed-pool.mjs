#!/usr/bin/env node
/**
 * verify-speed-pool — a speed reads the same whether or not the migration
 * has run.
 *
 * NEW at 3.412.1.
 *
 * THE DEFECTS THIS CHAPTER EXISTS TO KEEP DEAD, all four shipped in
 * 3.412.0 and all four the same defect: the shape changed and nine call
 * sites each knew it for themselves.
 *
 *   A  the migration was gated above TRG_SCHEMA_VERSION and could never run
 *   B  derivation crashed assigning `.total` to a bare number — twelve
 *      actors, every one, `Failed data preparation`
 *   C  `Number(pool)` is NaN, so the climb/swim +4 died ON MIGRATION SUCCESS
 *   D  `movement[key]?.base` is undefined on a number, so Quick Time saw
 *      no speeds at all before migrating
 *
 * SECTION F IS THE ONE THAT PAYS. B and C are caught by feeding both
 * shapes through every accessor, which is easy once the accessors exist.
 * A was invisible to every check in this project because it is not about
 * a value — it is about whether a migration pass is REACHABLE. F reads the
 * gate versions out of migration.mjs and compares them to the constant
 * that admits them.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SPEED_KEYS, SPEED_SLOTS, isSpeedPool, speedPool, pooledSpeedValue,
  speedValue, speedBase, normaliseMovement, resolveMovement
} from "../module/combat/speed-pool.mjs";
import { effectiveLandSpeed } from "../module/encumbrance.mjs";
import { TARGET_SLOTS } from "../module/bonuses/registry.mjs";
import { meetsActionRequirement } from "../module/combat/action.mjs";
import { speedsPresentOn } from "../module/magic/spell-effects.mjs";
import { migrateMovementEffectKeys } from "../module/migration.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/** ok() with the two values printed, for the checks that compare one. */
const eqv = (label, got, want, detail = "") =>
  ok(label, String(got) === String(want),
    `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${detail ? ` — ${detail}` : ""}`);

/** The two shapes any reader may be handed, for the same 30 ft speed. */
const OLD = 30;
const NEW = { base: 30, item: 0, status: 0, circumstance: 0, other: 0, total: 30 };

/* ================================================================== *
 * A. Telling the shapes apart
 * ================================================================== */

ok("A1 a bare number is not a pool", !isSpeedPool(OLD));
ok("A2 a pool is a pool", isSpeedPool(NEW));
ok("A3 null is not a pool", !isSpeedPool(null));
ok("A4 undefined is not a pool", !isSpeedPool(undefined));
// THE 3.223.3 CORRUPTION. `typeof [] === "object"` would wave an array
// through into a pool whose `base` is an array — NaN everywhere after.
ok("A5 an array is not a pool", !isSpeedPool([30]));

/* ================================================================== *
 * B. Coercion — derivation's view, which must always yield a pool
 * ================================================================== */

ok("B1 a bare number becomes a pool with base and total set",
  speedPool(OLD).base === 30 && speedPool(OLD).total === 30);
ok("B2 every slot is present on a coerced pool",
  SPEED_SLOTS.every((slot) => slot in speedPool(OLD)));
ok("B3 zero coerces to a real pool, not to absence",
  isSpeedPool(speedPool(0)) && speedPool(0).total === 0);
ok("B4 a negative stored speed floors at zero",
  speedPool(-10).base === 0, "no creature has a negative Speed");
ok("B5 rubbish coerces to zero rather than NaN",
  speedPool("fast").base === 0 && speedPool(undefined).base === 0);
ok("B6 an array coerces to zero", speedPool([30]).base === 0);

// THE IDENTITY RULE, AND THE REASON IT IS NOT A REBUILD. Derivation
// MUTATES the node it is handed — `applyTarget` writes bonuses into it and
// the armour step assigns `.total`. Handing back a fresh copy would put
// every one of those writes on an object nobody else holds, and the speed
// on the sheet would never move. A rebuilt-but-equal pool passes any
// value comparison, so this must be checked by IDENTITY.
const held = { base: 25, item: 0, status: 0, circumstance: 0, other: 0, total: 25 };
ok("B7 an existing pool is returned by identity, not rebuilt",
  speedPool(held) === held, "derivation writes through this reference");

/* ================================================================== *
 * C. The migration's view — the null that makes it idempotent
 * ================================================================== */

ok("C1 an unmigrated number yields an update", pooledSpeedValue(OLD)?.base === 30);
ok("C2 an already-pooled speed yields null", pooledSpeedValue(NEW) === null,
  "a second run must not wrap a pool inside a pool");
ok("C3 the two views agree about what a pool is",
  SPEED_KEYS.every(() => true)
  && pooledSpeedValue(OLD).base === speedPool(OLD).base
  && pooledSpeedValue(OLD).total === speedPool(OLD).total);

// A MIGRATED SPEED MUST SURVIVE A SECOND MIGRATION UNCHANGED. Graham can
// run Refresh/migrate more than once and a half-migrated world is a real
// state — someone closes the tab midway.
const twice = pooledSpeedValue(pooledSpeedValue(OLD));
ok("C4 migrating twice is the same as migrating once", twice === null);

/* ================================================================== *
 * D. Reading a speed — BOTH shapes, every accessor
 *
 * This is defect C and D's chapter. Every one of these pairs must agree,
 * because a reader cannot know which shape it was handed.
 * ================================================================== */

ok("D1 speedValue reads a bare number", speedValue(OLD) === 30);
ok("D2 speedValue reads a pool", speedValue(NEW) === 30);
ok("D3 speedValue never returns NaN for a pool",
  Number.isFinite(speedValue(NEW)), "Number({…}) is NaN — the climb/swim defect");
ok("D4 speedValue reads the TOTAL, so bonuses count",
  speedValue({ base: 30, status: 10, total: 40 }) === 40);
ok("D5 speedBase reads a bare number", speedBase(OLD) === 30);
ok("D6 speedBase reads a pool", speedBase(NEW) === 30);
// THE DISTINCTION QUICK TIME DEPENDS ON, per Graham's ruling that it
// affects "any speeds that the character has (but only if they have them)".
ok("D7 speedBase ignores a granted total, so a speed cannot bootstrap itself",
  speedBase({ base: 0, status: 30, total: 30 }) === 0);
ok("D8 speedValue and speedBase agree when nothing is granted",
  speedValue(NEW) === speedBase(NEW));
ok("D9 an absent speed reads as zero, not NaN",
  speedValue(undefined) === 0 && speedBase(undefined) === 0);

/* ================================================================== *
 * E. The readers themselves, driven through both shapes
 * ================================================================== */

const unmigrated = { combat: { movement: { land: 30, climb: 20, fly: 0 } } };
const migrated = {
  combat: {
    movement: {
      land: speedPool(30), climb: speedPool(20), fly: speedPool(0)
    }
  }
};

// speedsPresentOn — defect D. A landbound-plus-climb creature has two
// speeds in both shapes; the fly speed of 0 is not one of them.
const before = speedsPresentOn(unmigrated).sort().join(",");
const after = speedsPresentOn(migrated).sort().join(",");
ok("E1 Quick Time sees the same speeds before and after migrating",
  before === after, `unmigrated [${before}] vs migrated [${after}]`);
ok("E2 and it sees the right ones", after === "climb,land",
  "a fly speed of 0 is not a speed the creature has");

// meetsActionRequirement — already took both shapes at 3.412.0, and must
// keep doing so. This is the one reader I did get right, kept honest.
ok("E3 an action requirement reads an unmigrated speed",
  meetsActionRequirement("combat.movement.fly",
    { combat: { movement: { fly: 30 } } }) === true);
ok("E4 an action requirement reads a migrated speed",
  meetsActionRequirement("combat.movement.fly",
    { combat: { movement: { fly: speedPool(30) } } }) === true);
ok("E5 a zero speed does not satisfy a requirement in either shape",
  meetsActionRequirement("combat.movement.fly", { combat: { movement: { fly: 0 } } }) === false
  && meetsActionRequirement("combat.movement.fly",
    { combat: { movement: { fly: speedPool(0) } } }) === false);

// normaliseMovement — defect B, the crash. After it, assigning `.total`
// is safe for every key present.
const block = { land: 30, climb: 20, fly: speedPool(0) };
const returned = normaliseMovement(block);
ok("E6 normaliseMovement returns the SAME object",
  returned === block, "derivation writes through this reference");
ok("E7 every present speed is a pool afterwards",
  ["land", "climb", "fly"].every((key) => isSpeedPool(block[key])));
ok("E8 assigning .total no longer throws", (() => {
  try {
    for (const key of ["land", "climb", "fly"]) block[key].total = 99;
    return true;
  } catch { return false; }
})(), "Cannot create property 'total' on number '30'");
// ABSENT IS NOT ZERO. A creature with no burrow speed must not acquire a
// burrow pool, because `speedsPresentOn` and the sheet both distinguish
// the two.
ok("E9 a speed the creature does not have is not invented",
  !("burrow" in block));
ok("E10 normaliseMovement survives a missing block",
  normaliseMovement(undefined) === undefined);

// The pooling target table must name a slot for every pool slot, or a
// bonus aimed at one silently lands nowhere — the 3.410.0 defect.
ok("E11 the movement target table covers every pool slot",
  SPEED_SLOTS.every((slot) => slot in TARGET_SLOTS.movement));

/* ================================================================== *
 * G. THE WHOLE DERIVATION SEQUENCE, driven from unmigrated data.
 *
 * This section exists because `mutate-speed-pool` #11 — deleting the
 * coercion from `prepareDerivedData` — SURVIVED the first version of this
 * file. The rule was pure and checked; its only caller was a Foundry
 * method nothing can run, so the edit that caused the outage was
 * invisible. The work moved out to `resolveMovement` rather than the
 * mutation being deleted.
 * ================================================================== */

const land = (base, opts = {}) => resolveMovement({
  movement: { land: base, climb: 0, swim: 0 },
  landSpeed: effectiveLandSpeed,
  ...opts
});

// THE OUTAGE ITSELF: bare numbers, straight through, no throw.
ok("G1 derivation survives a fully unmigrated block", (() => {
  try {
    const m = land(30);
    return m.land.total === 30 && isSpeedPool(m.land);
  } catch { return false; }
})(), "this is the crash: Cannot create property 'total' on number '30'");

ok("G2 a migrated block derives identically",
  land(speedPool(30)).land.total === land(30).land.total,
  "the migration must be a tidy-up, never a prerequisite");

// Armour and encumbrance still apply, to both shapes.
ok("G3 armour and encumbrance reduce the speed",
  land(30, { armourPenalty: 5, encumbrancePenalty: 5 }).land.total === 20);
ok("G4 and identically on unmigrated data",
  land(30, { armourPenalty: 5, encumbrancePenalty: 5 }).land.total
  === land(speedPool(30), { armourPenalty: 5, encumbrancePenalty: 5 }).land.total);
ok("G5 the result is rounded to the 5 ft grid",
  land(30, { encumbrancePenalty: 3 }).land.total === 25);
ok("G6 grid rounding can be turned off",
  land(30, { encumbrancePenalty: 3, roundToGrid: false }).land.total === 27);
ok("G7 a speed cannot go negative", land(10, { armourPenalty: 50 }).land.total === 0);

// TYPED BONUSES POOL FIRST, penalties apply after — the ordering the
// pooling comment calls "the whole design". A +10 status Speed and a -5
// encumbrance penalty must not compete in one pool.
const boosted = resolveMovement({
  movement: { land: { base: 30, status: 10, total: 40 }, climb: 0 },
  encumbrancePenalty: 5,
  landSpeed: effectiveLandSpeed
});
ok("G8 a pooled bonus is present before the penalties are taken",
  boosted.land.total === 35, "40 pooled, then -5 encumbrance");

// The immobilised flag, and the distinction that keeps it honest.
// The flag lives on the movement BLOCK, not on the land pool — the
// encumbrance workflow reads `combat.movement.immobilisedByLoad`.
ok("G9 zero speed under load is immobilised",
  land(10, { encumbrancePenalty: 50, encumbered: true }).immobilisedByLoad === true);
ok("G10 zero speed with no load is NOT immobilised by load",
  land(0, { encumbered: false }).immobilisedByLoad === false,
  "a creature with no land speed is not immobilised BY ITS LOAD");
ok("G11 a moving creature under load is not immobilised",
  land(30, { encumbrancePenalty: 5, encumbered: true }).immobilisedByLoad === false);

// Quick Climber / Quick Swimmer.
const climber = land(30, { halfLandSpeeds: ["climb"] });
ok("G12 a half-land feat speed is granted from the FINAL land speed",
  climber.climb.total === 15);
ok("G13 and rounded to the grid",
  land(25, { halfLandSpeeds: ["climb"] }).climb.total === 10, "12.5 → 10");
ok("G14 armour is taken before the half is computed",
  land(30, { armourPenalty: 10, halfLandSpeeds: ["climb"] }).climb.total === 10);
// NEVER LOWERS A BETTER STORED SPEED — the reason this is a max.
ok("G15 a better stored climb speed is not reduced to half land",
  resolveMovement({
    movement: { land: 30, climb: speedPool(40) },
    halfLandSpeeds: ["climb"],
    landSpeed: effectiveLandSpeed
  }).climb.total === 40);
ok("G16 an unknown feat speed key is ignored",
  land(30, { halfLandSpeeds: ["teleport"] }).land.total === 30);

// The caller cannot get it wrong by forgetting to normalise.
ok("G17 resolveMovement normalises its own input",
  isSpeedPool(land(30).land), "a function that can be called wrongly will be");
ok("G18 a block with no land speed still gets one",
  isSpeedPool(resolveMovement({ movement: { fly: 60 }, landSpeed: effectiveLandSpeed }).land));
ok("G19 resolveMovement returns the caller's block", (() => {
  const block = { land: 30 };
  return resolveMovement({ movement: block, landSpeed: effectiveLandSpeed }) === block;
})(), "derivation writes through this reference");
ok("G20 resolveMovement survives a missing block",
  resolveMovement({ movement: null, landSpeed: effectiveLandSpeed }) === null);

// ─── THE INJECTED POOLING STEP ─────────────────────────────────────
// `applyBonuses` is where the typed bonuses land. It is a callback because
// it needs the actor; everything about WHEN and WHAT IT IS GIVEN is a rule
// and belongs here.
const seen = [];
const spy = resolveMovement({
  movement: { land: 30, climb: 0, fly: speedPool(60) },
  landSpeed: effectiveLandSpeed,
  applyBonuses: (node, key) => {
    seen.push({ key, pooled: isSpeedPool(node), base: node.base });
    if (key === "land") node.status = 10;
  }
});
ok("G22 every present speed is offered to the bonus applier",
  seen.map((s) => s.key).sort().join(",") === "climb,fly,land");
ok("G23 the applier is handed a POOL, never a bare number",
  seen.every((s) => s.pooled),
  "this is the 3.410.0 defect: a bonus written to the number 30 vanishes");
ok("G24 the applier is handed the right speed's node",
  seen.find((s) => s.key === "fly")?.base === 60);
// AND THE BONUS MUST SURVIVE INTO THE FINAL FIGURE — the live failure
// Graham saw: Athletics 0 → 2, land 20 → 20.
ok("G25 a bonus the applier writes reaches the derived total",
  spy.land.status === 10, "written, then read back after the whole sequence");
ok("G26 a speed the creature lacks is not offered to the applier",
  !seen.some((s) => s.key === "burrow"));

// AND THE READERS AGREE WITH DERIVATION'S OUTPUT. The climb/swim +4 is
// granted from the derived block — defect C's actual failure path.
ok("G21 a derived climb speed reads as a speed the creature has",
  speedValue(climber.climb) === 15 && Number.isFinite(speedValue(climber.climb)),
  "Number(pool) is NaN — the +4 silently stopped being granted");

/* ================================================================== *
 * K. THE EFFECT KEYS THAT STILL WRITE A BARE NUMBER (3.595.2)
 *
 * `migratePooledMovement` (3.412.1) pooled the STORED fields and left
 * ActiveEffect CHANGES alone. Twenty-two of them were still in Graham's
 * world on 26 September 2026, on race items, writing
 * `system.combat.movement.land` as the number 30 — and they had been
 * invisible for fourteen releases because `normaliseMovement` coerces a
 * number into a pool.
 *
 * What they cost, both silent: an OVERRIDE of the whole node discards the
 * item, status, circumstance and other pools every preparation, so a typed
 * Speed bonus on such an actor is thrown away (the defect the pooling was
 * introduced to remove); and any other write into the same node can throw
 * inside effect application, which aborts the whole of
 * `prepareDerivedData` — measured live, on the first cast of Shape Of The
 * Wyrm at 3.595.0.
 * ================================================================== */

{
  const fakeDoc = (name, changes) => {
    const writes = [];
    return {
      name,
      writes,
      effects: [{ id: "eff1", name: `${name}: size and speed`, _source: { changes } }],
      items: [],
      updateEmbeddedDocuments: async (type, updates) => { writes.push({ type, updates }); }
    };
  };
  const bare = [{ key: "system.combat.movement.land", mode: 5, value: 30 },
    { key: "system.identity.size", mode: 5, value: "medium" }];

  {
    const doc = fakeDoc("Elf", bare);
    const report = await migrateMovementEffectKeys([{ name: "Elf", effects: [], items: [doc] }], []);
    const written = doc.writes[0]?.updates?.[0]?.changes ?? [];
    eqv("K1 A BARE MOVEMENT KEY MOVES ONTO THE POOL'S BASE", written[0]?.key, "system.combat.movement.land.base");
    eqv("K1b the mode and value are not reinterpreted", `${written[0]?.mode}/${written[0]?.value}`, "5/30",
      "an override of the base is a species Speed; an add to it is a racial bonus; both are correct there");
    eqv("K1c and every other change is left exactly as it was", written[1]?.key, "system.identity.size");
    eqv("K1d the report names the document, the effect and the key", report.length, 1);
  }
  {
    const doc = fakeDoc("Elf", [{ key: "system.combat.movement.land.base", mode: 5, value: 30 }]);
    const report = await migrateMovementEffectKeys([{ name: "Elf", effects: [], items: [doc] }], []);
    eqv("K2 AN ALREADY-POOLED KEY IS NOT TOUCHED, which is what makes the pass idempotent", doc.writes.length, 0);
    eqv("K2b and nothing is reported", report.length, 0);
  }
  {
    const doc = fakeDoc("Sword", [{ key: "system.combat.attack.status", mode: 2, value: 1 }]);
    await migrateMovementEffectKeys([{ name: "Fighter", effects: [], items: [doc] }], []);
    eqv("K3 a change that is not a movement speed is left alone", doc.writes.length, 0);
  }
  {
    const onActor = fakeDoc("Ghost", bare);
    const worldItem = fakeDoc("Boots", bare);
    const report = await migrateMovementEffectKeys(
      [{ name: onActor.name, effects: onActor.effects, items: [], updateEmbeddedDocuments: onActor.updateEmbeddedDocuments }],
      [worldItem]);
    eqv("K4 the pass reaches an actor's OWN effects and a world item's", report.length, 2,
      "race items are the case that was found, and they are not the only place a change can live");
  }
  {
    const doc = fakeDoc("Dragon", [{ key: "system.combat.movement.fly", mode: 5, value: 60 }]);
    await migrateMovementEffectKeys([{ name: "Dragon", effects: [], items: [doc] }], []);
    eqv("K5 EVERY SPEED, not just land", doc.writes[0]?.updates?.[0]?.changes?.[0]?.key, "system.combat.movement.fly.base");
  }
}

/* ================================================================== *
 * L. AND THE MIGRATION SAYS WHAT IT DID (3.595.3)
 *
 * The completion notice counted only the BULK document writes, so a pass
 * that rewrites embedded ActiveEffects appeared in none of it. On
 * 26 September 2026 this pass rewrote nothing on Graham's world and the
 * notice read exactly as it would have if it had rewritten twenty-one keys.
 * A silent write is the wrong shape whatever it writes; so is a silent
 * no-op.
 * ================================================================== */

{
  const mig = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "migration.mjs"), "utf8");
  ok("L1 THE NOTICE COUNTS THE EFFECT-KEY PASS",
    /result\.movementEffectKeys\?\.length/.test(mig)
    && /movement effect key\(s\) moved onto the pool's base/.test(mig),
    "a pass whose writes are invisible in the report is a pass nobody can tell ran");
  /*
   * L1b READS THE CONDITION, NOT JUST THE SENTENCE. Its first version
   * looked for the words "nothing needed changing" and a `warn` call
   * anywhere in the file — and a mutation replacing the guard with
   * `if (false)` SURVIVED it, because both strings were still there. A
   * source check that does not read the test it depends on is a check on
   * spelling.
   */
  ok("L1b AND A MIGRATION THAT CHANGED NOTHING SAYS SO",
    /if \(!result\.actors && !result\.items && !alsoDid\.length\) \{[\s\S]{0,240}?nothing needed changing/
      .test(mig),
    "either the world was already current or a pass did not run, and both are worth knowing");
  ok("L1c the cheerful total is the other branch, not the only one",
    /\} else \{\s*ui\.notifications\.info\(/.test(mig));
}

/* ================================================================== *
 * J. NO READER MAY COERCE A POOL WITH Number()
 *
 * THE SECTION A LIVE COMBAT BOUGHT. 3.412.1 fixed the climb/swim bonus
 * that `Number(pool)` turned to NaN and called it "the silent one". It
 * fixed the readers I knew about. On 26 August 2026, setting up a
 * two-round combat before Graham's session, a token would not move:
 *
 *   "Bugbear Soldier would need Infinity more AP to move 15 ft
 *    (15 ft of Striding this turn at Speed NaN) but has 3."
 *
 * `speedForMovement` read `Number(movement[key])`, got NaN, `stridesFor`
 * saw a speed of 0 and charged Infinity AP. NOTHING COULD MOVE IN
 * COMBAT, in shipped code, for four releases — and three more readers
 * had the same defect beside it.
 *
 * Fixing four call sites is not the lesson. The lesson is that finding
 * them by hand does not converge: 3.412.1 swept by hand and missed four.
 * So this section reads the SOURCE and refuses the pattern outright.
 * ================================================================== */

{
  const moduleDir = path.join(SYSTEM_ROOT, "module");
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith(".mjs") ? [full] : [];
  });

  // `Number(...)` or a bare numeric read applied to a movement NODE —
  // `combat.movement.land`, `combat.movement[key]` — rather than to a
  // slot inside it. Reading `.base`/`.total`/`.status` is correct and
  // must not be flagged.
  const OFFENDER = /Number\(\s*[^)]*\bcombat\??\.?\s*\??\.movement\??\.?\s*(?:\.\s*)?(?:\[[^\]]+\]|land|fly|swim|climb|burrow)\s*(?!\s*\.\s*(?:base|total|status|item|circumstance|other))[^)]*\)/;

  const offenders = [];
  for (const file of walk(moduleDir)) {
    if (file.endsWith(path.join("combat", "speed-pool.mjs"))) continue;
    const text = fs.readFileSync(file, "utf8");
    text.split("\n").forEach((lineText, i) => {
      if (lineText.trim().startsWith("*") || lineText.trim().startsWith("//")) return;
      if (OFFENDER.test(lineText)) {
        offenders.push(`${path.relative(SYSTEM_ROOT, file)}:${i + 1}  ${lineText.trim().slice(0, 90)}`);
      }
    });
  }

  ok("J1 the source scan ran over the module tree", walk(moduleDir).length > 100,
    "a scan that reads nothing proves nothing");
  ok("J2 no reader coerces a movement pool with Number()",
    offenders.length === 0,
    offenders.join(" | ") + " — use speedValue()/speedBase() from combat/speed-pool.mjs");

  // AND THE SCAN MUST BE ABLE TO SEE ONE. A detector that cannot detect
  // is the thing this project keeps calling a check that proves nothing.
  ok("J3 the scan recognises the defect it exists for",
    OFFENDER.test("const speed = Number(actor.system.combat?.movement?.land ?? 30);")
    && OFFENDER.test("speed: Math.max(0, Number(actorSystem?.combat?.movement?.[key] ?? 0))"));
  ok("J4 and does not flag a correct read",
    !OFFENDER.test("Number(combat.movement.land.total ?? 0)")
    && !OFFENDER.test("Number(movement[key].base)"));
}

/* ================================================================== *
 * F. IS EVERY MIGRATION PASS REACHABLE?
 *
 * Defect A, and the only section here that is not about a value.
 *
 * `checkWorldMigration` offers a migration when TRG_SCHEMA_VERSION is
 * newer than the world's stored schema. Each pass is then gated by
 * `runIf("<version>", …)`, which runs it when that version is newer than
 * where the world came FROM. A pass gated at a version ABOVE
 * TRG_SCHEMA_VERSION is therefore unreachable: no world can ever be
 * offered a migration that would admit it.
 *
 * That is exactly what happened. `runIf("3.412.0", "pooled movement", …)`
 * with TRG_SCHEMA_VERSION at "3.312.0". The pass was correct and dead.
 * ================================================================== */

const migrationSource = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "migration.mjs"), "utf8");

const declared = migrationSource.match(/TRG_SCHEMA_VERSION\s*=\s*"([^"]+)"/);
ok("F1 the schema version is declared", Boolean(declared));

const parse = (v) => String(v).split(".").map((n) => Number(n) || 0);
const newer = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
};

const schema = declared?.[1] ?? "0.0.0";
const gates = [...migrationSource.matchAll(/runIf\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g)]
  .map(([, version, label]) => ({ version, label }));

ok("F2 migration passes were found to check", gates.length > 0,
  "if this fails the regex has drifted from the code — a check that " +
  "proves nothing is worse than no check");

const unreachable = gates.filter((gate) => newer(gate.version, schema));
ok("F3 every migration pass is reachable from the declared schema version",
  unreachable.length === 0,
  unreachable.map((g) => `"${g.label}" gated at ${g.version} > schema ${schema}`).join("; "));

// AND THE CONVERSE, cheaply: the newest gate should BE the schema version.
// Not a failure on its own — the schema legitimately trails when a release
// changes no stored shape — but if it ever exceeds every gate by a lot,
// somebody bumped it without a pass and every GM gets an empty migration.
const newestGate = gates.reduce((best, g) => (newer(g.version, best) ? g.version : best), "0.0.0");
ok("F4 the schema version is not ahead of every migration pass",
  !newer(schema, newestGate) || newestGate === "0.0.0",
  `schema ${schema} exceeds the newest pass ${newestGate} — GMs would be ` +
  "prompted to run a migration that does nothing");

/* ================================================================== */

const label = "verify-speed-pool";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
