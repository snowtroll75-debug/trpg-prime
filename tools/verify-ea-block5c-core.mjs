#!/usr/bin/env node
/**
 * verify-ea-block5c-core — TRG Prime 3.683.0, group c of the seams Eldritch
 * Arts' Block 5 (racial and general feats) needs, from the Block 5 audit
 * (docs/ELDRITCH_ARTS_BLOCK5_AUDIT.md in the module), answered by Graham on
 * 3 November 2026 ("as proposed", Q70 and Q71 among them).
 *
 *   C6  `spellDamageBonus` per die and by the pool's damage type (Emberborn
 *       Fury, Elemental Apotheosis), on every pool a cast rolls, and
 *       `helpers.spellDamagePerDieBonus` for a module's own pools
 *   C7  a death guard's `healTo` (Tideweaver's Resilience: level + Wisdom)
 *   C8  `registerDyingRecoveryModifier`: the fatigue for leaving Dying waived
 *       (Relentless Will)
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
globalThis.Hooks = globalThis.Hooks ?? { on() {}, callAll() {} };

const sdb = await imp("magic/spell-damage-bonus.mjs");
const dg = await imp("combat/death-guard.mjs");
const ds = await imp("combat/death-state.mjs");
const api = await imp("module-api.mjs");
const src = {
  cast: read("module", "magic", "cast-workflow.mjs"),
  apiw: read("module", "module-api-workflow.mjs"),
  dgw: read("module", "combat", "death-guard-workflow.mjs"),
  combat: read("module", "documents", "combat.mjs"),
  effects: read("module", "magic", "spell-effects.mjs"),
  medicine: read("module", "dice", "check-card-interactions.mjs")
};
const fx = (flags, extra = {}) => ({ name: "Effect", flags: { "trg-prime": flags }, ...extra });

// ── C6: per die, by the pool's damage type ─────────────────────────────
const fury = fx({ spellDamageBonus: { label: "Emberborn Fury", perDie: 1, damageTypes: ["fire"], type: "race" } });
const apotheosis = fx({ spellDamageBonus: { label: "Elemental Apotheosis", perDie: 1, damageTypes: "fire", type: "race" } });
const surge = fx({ spellDamageBonus: { label: "Elemental Surge", valueFrom: "charisma", type: "race" } });
equal("C6-1 a per-die fire row is read for a fire pool", sdb.declaredSpellDamagePerDie([fury], { damageType: "Fire" }), [{ label: "Emberborn Fury", perDie: 1, type: "race" }]);
equal("C6-2 …and not for a cold one (the pool's type, not the spell's traits)", sdb.declaredSpellDamagePerDie([fury], { damageType: "cold", traits: "fire" }), []);
equal("C6-3 Q70: Fury and Apotheosis stack, +2 a fire die", sdb.spellDamagePerDie("3d6 + 2", sdb.declaredSpellDamagePerDie([fury, apotheosis], { damageType: "fire" })).total, 6);
equal("C6-4 the dice in the pool are counted, every die", [sdb.countDamageDice("2d6 + 1d4 + 3"), sdb.countDamageDice("d8"), sdb.countDamageDice("4d6kh3 + 10"), sdb.countDamageDice("14d6"), sdb.countDamageDice("5"), sdb.countDamageDice("")], [3, 1, 4, 14, 0, 0]);
equal("C6-5 a number of dice may be given instead (a module's own pool)", sdb.spellDamagePerDie(4, sdb.declaredSpellDamagePerDie([fury], { damageType: "fire" })).total, 4);
equal("C6-6 the flat reader skips a per-die row, and a flat row reads as before",
  [sdb.declaredSpellDamageBonuses([fury, apotheosis], { traits: "fire" }), sdb.declaredSpellDamageBonuses([fury, surge], { attributes: { charisma: { total: 3 } } })],
  [[], [{ label: "Elemental Surge", value: 3, type: "race" }]]);
equal("C6-7 the per-die reader skips a flat row", sdb.declaredSpellDamagePerDie([surge, fx({ spellDamageBonus: { label: "Flat", value: 2 } })], { damageType: "fire" }), []);
equal("C6-7b a per-die row that also carries a value is per die only", sdb.declaredSpellDamageBonuses([fx({ spellDamageBonus: { label: "Both", perDie: 1, value: 2 } })]), []);
equal("C6-8 a disabled effect adds nothing", sdb.declaredSpellDamagePerDie([{ ...fury, disabled: true }], { damageType: "fire" }), []);
equal("C6-9 a row naming no damage type reaches every type", sdb.declaredSpellDamagePerDie([fx({ spellDamageBonus: { label: "Any", perDie: 1 } })], { damageType: "acid" }).length, 1);
equal("C6-10 a highest-wins type keeps its best per die",
  sdb.declaredSpellDamagePerDie([fx({ spellDamageBonus: { label: "A", perDie: 1, type: "status" } }), fx({ spellDamageBonus: { label: "B", perDie: 2, type: "status" } })], { damageType: "fire" }).map((r) => r.perDie), [2]);
equal("C6-11 zero, negative or nonsense per die is no row", sdb.declaredSpellDamagePerDie([fx({ spellDamageBonus: [{ perDie: 0 }, { perDie: -1 }, { perDie: "x" }] })], { damageType: "fire" }), []);
equal("C6-12 a per-die row's traits still scope it", [
  sdb.declaredSpellDamagePerDie([fx({ spellDamageBonus: { perDie: 1, traits: ["invocation"] } })], { damageType: "fire", traits: "Fire, Invocation" }).length,
  sdb.declaredSpellDamagePerDie([fx({ spellDamageBonus: { perDie: 1, traits: ["invocation"] } })], { damageType: "fire", traits: "Fire" }).length], [1, 0]);
equal("C6-13 the card's words", sdb.spellDamagePerDie("2d6", sdb.declaredSpellDamagePerDie([fury], { damageType: "fire" })),
  { dice: 2, perDie: 1, total: 2, text: "Emberborn Fury +1 racial per die × 2 dice = +2" });
equal("C6-14 no dice, nothing to say", sdb.spellDamagePerDie("5", sdb.declaredSpellDamagePerDie([fury], { damageType: "fire" })), { dice: 0, perDie: 1, total: 0, text: "" });
ok("C6-15 one asker reads the caster's effects for the pool's type", /async function spellPoolPerDie\(actor, spell, formula, type\) \{[\s\S]{0,400}declaredSpellDamagePerDie\(\s*Array\.from\(actor\?\.appliedEffects \?\? actor\?\.effects \?\? \[\]\),\s*\{ damageType: String\(type \?\? ""\), traits: spell\?\.system\?\.traits \?\? "" \}\)/.test(src.cast));
ok("C6-16 the attack path folds the bolt's per die into the formula it rolls", /const boltPerDie = await spellPoolPerDie\(actor, spell, abilityFormula, damageType\);\s*if \(boltPerDie\.total && surged\.formula\) surged\.formula = `\$\{surged\.formula\} \+ \$\{boltPerDie\.total\}`;\s*const damageFormula = surged\.formula;/.test(src.cast));
ok("C6-17 a spell critical's extra dice take it, and a guard negates it with them", /const critPerDie = await spellPoolPerDie\(actor, spell, critFormula, damageType\);[\s\S]{0,300}if \(critPerDie\.total\) \{\s*if \(guardedNegated\) guardedNegated\.total \+= critPerDie\.total;\s*else \{ critBonus \+= critPerDie\.total; dealt \+= critPerDie\.total; \}/.test(src.cast));
ok("C6-18 the attack path's second pool, of its own type", /const secondPerDie = await spellPoolPerDie\(actor, spell, formula, second\.type\);[\s\S]{0,200}amount: secondRoll\.total \+ secondPerDie\.total,/.test(src.cast));
ok("C6-19 the save path's primary, of the ladder's type on a ladder, not on a condition", /if \(damageFormula && \(\(isBasic && !asCondition\) \|\| \(saveLadder && ladderUsesSharedRoll\(saveLadder\)\)\)\) \{\s*\/\/[^\n]*\n\s*const primaryType = saveLadder \? \(saveLadder\.damageType \|\| damageType\) : damageType;\s*const primaryPerDie = await spellPoolPerDie\(actor, spell, damageFormula, primaryType\);\s*if \(primaryPerDie\.total\) \{\s*damageFormula = `\$\{damageFormula\} \+ \$\{primaryPerDie\.total\}`;/.test(src.cast));
ok("C6-20 the save path's second pool (Meteor Swarm's)", /const secondaryPerDie = await spellPoolPerDie\(actor, spell, secondaryFormula, secondary\.type\);\s*secondaryBase \+= secondaryPerDie\.total;/.test(src.cast));
ok("C6-21 a ladder's rung dice", /const rungPerDie = await spellPoolPerDie\(actor, spell, addDice\(rungAmount\.formula, warpMods\?\.rungDice\?\.\[outcome\.rung\]\), ladderType\);\s*if \(rungPerDie\.total\) \{\s*rungTotal \+= rungPerDie\.total;/.test(src.cast));
ok("C6-22 the immune alternate", /const altPerDie = await spellPoolPerDie\(actor, spell, immuneAlternate\.formula, immuneAlternate\.type\);\s*alternateBase \+= altPerDie\.total;/.test(src.cast));
ok("C6-23 a basic save's critical dice", /const saveCritPerDie = await spellPoolPerDie\(actor, spell, saveCrit, damageType\);\s*if \(saveCritPerDie\.total\) \{\s*amount \+= saveCritPerDie\.total;/.test(src.cast));
ok("C6-24 every pool says it on the card", (src.cast.match(/perDieLine\(/g) ?? []).length >= 8);
ok("C6-25 never on recurring damage: no recurring formula is asked", !/spellPoolPerDie\([^)]*(?:persist|Persist|recurring)/.test(src.cast));
ok("C6-26 the helper for a module's own pool", /spellDamagePerDieBonus: async \(actor, \{ type = "", dice = 0, traits = \[\] \} = \{\}\) => \{[\s\S]{0,300}return spellDamagePerDie\(dice, declaredSpellDamagePerDie\(\s*Array\.from\(actor\?\.appliedEffects \?\? actor\?\.effects \?\? \[\]\), \{ damageType: String\(type \?\? ""\), traits \}\)\);/.test(src.apiw));

// ── C7: a death guard's healTo ──────────────────────────────────────────
const tide = { label: "Tideweaver's Resilience", offer: true, askOwner: true, frequency: "daily", notOutright: true, healTo: { level: true, ability: "Wisdom" } };
const [tideSpec] = dg.declaredDeathGuards([fx({ deathGuard: tide })]);
equal("C7-1 healTo is kept, its ability read loosely", tideSpec?.healTo, { level: true, ability: "wisdom" });
equal("C7-2 Q71: level + Wisdom", dg.deathGuardHealTo(tideSpec, 60, { level: 7, attributes: { wisdom: { total: 3 } } }), 10);
equal("C7-3 at least 1", dg.deathGuardHealTo(tideSpec, 60, { level: 1, attributes: { wisdom: { total: -3 } } }), 1);
equal("C7-4 never above the maximum", dg.deathGuardHealTo(tideSpec, 8, { level: 7, attributes: { wisdom: { total: 3 } } }), 8);
equal("C7-5 the ability alone, or the level alone", [
  dg.deathGuardHealTo(dg.declaredDeathGuards([fx({ deathGuard: { offer: true, healTo: { ability: "constitution" } } })])[0], 50, { level: 9, attributes: { constitution: { total: 4 } } }),
  dg.deathGuardHealTo(dg.declaredDeathGuards([fx({ deathGuard: { offer: true, healTo: { level: true } } })])[0], 50, { level: 9, attributes: {} })], [4, 9]);
equal("C7-6 a healTo naming nothing is no healTo", [
  "healTo" in (dg.declaredDeathGuards([fx({ deathGuard: { offer: true, healTo: { ability: "luck" } } })])[0] ?? {}),
  "healTo" in (dg.declaredDeathGuards([fx({ deathGuard: { offer: true } })])[0] ?? {})], [false, false]);
const unliving = dg.declaredDeathGuards([fx({ deathGuard: { label: "Unliving Fortitude", save: "fortitude" } })])[0];
const lotus = dg.declaredDeathGuardSources([fx({ deathGuard: { label: "Prism Lotus", auto: true, trigger: "death", heal: "half" } })], { trigger: "death" })[0].spec;
equal("C7-7 the guards that do not say it are as they were", [dg.deathGuardHealTo(unliving, 40, { level: 7, attributes: { wisdom: { total: 3 } } }), dg.deathGuardHealTo(lotus, 41), dg.deathGuardHealTo(unliving, 40)], [1, 20, 1]);
equal("C7-8 Q71: not against a blow that kills outright (the guard's notOutright)", dg.deathGuardExcepted(tideSpec, { massive: true }), "the blow kills outright (massive damage)");
ok("C7-9 the zero-HP guard computes it from the creature's level and attributes, writes it and returns it",
  /const healTo = deathGuardHealTo\(spec, actor\.system\?\.resources\?\.hp\?\.max, \{\s*level: actor\.system\?\.identity\?\.level, attributes: actor\.system\?\.attributes\s*\}\);/.test(src.dgw)
  && /await actor\.update\(\{ "system\.resources\.hp\.value": healTo \}\);/.test(src.dgw)
  && /return \{ case: "death-guard", guard: spec\.label, newHP: healTo \};/.test(src.dgw));
ok("C7-10 its question and its lines say the number", /and stay at \$\{healTo\} HP\?<\/p>/.test(src.dgw) && /drops to <strong>\$\{healTo\} HP<\/strong> instead/.test(src.dgw) && /stays at <strong>\$\{healTo\} HP<\/strong> instead of falling/.test(src.dgw));
ok("C7-11 a would-die guard is told the level too", /const hp = deathGuardHealTo\(spec, actor\.system\?\.resources\?\.hp\?\.max, \{\s*level: actor\.system\?\.identity\?\.level/.test(src.dgw));

// ── C8: the fatigue for leaving Dying, waived ───────────────────────────
api.resetModuleRegistry?.();
equal("C8-1 a modifier needs a function", [api.registerDyingRecoveryModifier("bad", null, "test"), api.registrationProblems().some((p) => /registerDyingRecoveryModifier/.test(p))], [false, true]);
equal("C8-2 and is listed once registered", [api.registerDyingRecoveryModifier("Relentless Will", () => null, "test"), api.registeredDyingRecoveryModifiers().map((m) => m.key)], [true, ["relentless will"]]);
api.resetModuleRegistry?.();
{
  const asked = [];
  const mods = [
    { key: "talk", modify: () => { asked.push("talk"); return { line: "A word." }; } },
    { key: "throws", modify: () => { asked.push("throws"); throw new Error("x"); } },
    { key: "rw", modify: (ctx) => { asked.push("rw"); return { noFatigue: true, line: `Relentless Will (${ctx.route})` }; } },
    { key: "late", modify: () => { asked.push("late"); return { noFatigue: true, line: "late" }; } }
  ];
  const out = await quiet(() => ds.dyingRecoveryModifiersFor(mods, { route: "healing" }));
  equal("C8-3 the first waiver wins and stops the asking; a throw is skipped; every line is kept",
    [out, asked], [{ noFatigue: true, key: "rw", lines: ["A word.", "Relentless Will (healing)"] }, ["talk", "throws", "rw"]]);
  equal("C8-4 nothing answered, nothing waived", await ds.dyingRecoveryModifiersFor([{ key: "n", modify: () => null }], {}), { noFatigue: false, key: "", lines: [] });
}
function dyingActor({ fatigued = 1, hp = 0, fatal = false } = {}) {
  const toggles = [];
  return {
    toggles,
    actor: {
      name: "Hero", items: [], effects: [], system: { resources: { hp: { value: hp } } },
      getConditionValue: (k) => (k === "fatigued" ? fatigued : 0),
      getFlag: (_s, key) => (fatal && /fatal/i.test(String(key)) ? [{ name: "Fatal" }] : undefined),
      toggleStatusEffect: async (k, o) => { toggles.push([k, o]); }
    }
  };
}
{
  api.resetModuleRegistry?.();
  const plain = dyingActor();
  const before = await ds.applyDyingRecovery(plain.actor, { route: "recoveryCheck", lines: [] });
  equal("C8-5 with no modifier the recovery is as it was: Fatigued rises by 1", [before.fatigued, before.fatigueWaived, plain.toggles.find(([k]) => k === "fatigued")], [2, undefined, ["fatigued", { value: 2 }]]);
  const seen = [];
  api.registerDyingRecoveryModifier("Relentless Will", (ctx) => { seen.push({ route: ctx.route, hp: ctx.hp, fatigued: ctx.fatigued, unconscious: ctx.unconscious, actor: ctx.actor?.name }); return { noFatigue: true, line: "<strong>Relentless Will</strong>: no Fatigued for leaving Dying." }; }, "test");
  const willing = dyingActor();
  const lines = [];
  const state = await ds.applyDyingRecovery(willing.actor, { route: "recoveryCheck", lines });
  equal("C8-6 a waiver: Fatigued untouched, the key returned, the line on the caller's card",
    [state.fatigued, state.fatigueWaived, willing.toggles.some(([k]) => k === "fatigued"), lines], [1, "relentless will", false, ["<p style=\"margin:2px 0\"><strong>Relentless Will</strong>: no Fatigued for leaving Dying.</p>"]]);
  equal("C8-7 the modifier is told the actor, the route and the state before", seen, [{ route: "recoveryCheck", hp: 0, fatigued: 1, unconscious: true, actor: "Hero" }]);
  seen.length = 0;
  await ds.applyDyingRecovery(dyingActor().actor, { noFatigue: true, lines: [] });
  equal("C8-8 not asked when the caller already waived it (Death's Defiance)", seen.length, 0);
  const held = dyingActor({ fatal: true });
  const blocked = await ds.applyDyingRecovery(held.actor, { lines: [] });
  equal("C8-9 not asked when a fatal injury holds them in Dying", [Boolean(blocked.blocked), seen.length], [true, 0]);
  api.resetModuleRegistry?.();
}
ok("C8-10 the API exposes the registration", /registerDyingRecoveryModifier: \(key, modify, moduleId\) => registerDyingRecoveryModifier\(key, modify, moduleId\)/.test(src.apiw));
ok("C8-11 every route out of Dying says which it is",
  /applyDyingRecovery\(actor, \{ route: "recoveryCheck", lines: waived \}\)/.test(src.combat)
  && /applyDyingRecovery\(actor, \{ route: "deathGuard", lines: waived \}\)/.test(src.dgw)
  && /applyDyingRecovery\(actor, \{ noFatigue: noDyingFatigue, route: "healing" \}\)/.test(src.effects)
  && /applyDyingRecovery\(target, \{ route: "relief", lines \}\)/.test(src.effects)
  && /applyDyingRecovery\(target, \{ route: "medicine" \}\)/.test(src.medicine));
ok("C8-12 the recovery check's card does not claim the fatigue it waived", /const fatigue = state\.fatigueWaived \? "No Fatigued for leaving it\." : `Fatigued rises to \$\{state\.fatigued\}\.`;/.test(src.combat)
  && /state\?\.fatigueWaived \? "; no Fatigued for leaving Dying"/.test(src.dgw));

if (failures.length) {
  process.stdout.write(`verify-ea-block5c-core: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-ea-block5c-core: OK — ${checks} checks.\n`);
