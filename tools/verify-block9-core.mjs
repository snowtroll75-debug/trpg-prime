#!/usr/bin/env node
/**
 * verify-block9-core — TRG Prime 3.673.0: the seams Inner Tempest's Block 9
 * (Chapter 9's magic items and the aging appendix) needs, from its audit's
 * C1 to C10 and Graham's rulings B9-1 to B9-11 of 26 October 2026.
 *
 *   C1  a rune that keeps its wearer from Dying, a reaction asked of its own
 *       player, and the minute of help it leaves (Karmic Resilience)
 *   C2  a rune that eases bleeding, and a flat check for the bands above
 *       Light (Staunching I–III)
 *   C3  a rune's value by the wearer's class (Harmony, Karmic Resilience)
 *   C4  the creature struck negates a critical's extra damage and heals half
 *       (Guarded)
 *   C5  the attacker rolls the critical injury at advantage (Harmony Edge;
 *       B9-3)
 *   C6  a module's rune Commanded on and off like an energy rune, with its
 *       secondary critical (Soulful Strike; B9-2)
 *   C7  a rune action that waits for the next Strike, and a rider gated on
 *       distance and dealt as precision (Tranquil Quiver); C7b, the offer
 *       lifted at the wielder's next turn (Mindful)
 *   C8  another skill's road to Create (Monastic Items; B9-5)
 *   C9  an item's aura that runs only while lit (Mystic Incense Burner; B9-7)
 *   C10 age modifiers that take no Hit Points and give no skill points
 *       (B9-11)
 *   C12 a declared value by the rune's tier, and one name on armour and on
 *       weapons at two prices (Centred I–III)
 *   C11 an item's spell released at the item's own PP, for a module's Use
 *       (Restorative Mat)
 *   Q   asking a creature's own player (both reactions above)
 *   R   found in review: the relay waits for a player's answer; a late yes
 *       spends nothing; Harmony Edge is not asked where it changes nothing;
 *       an unmeasured distance is unknown; Guarded on a spell's critical; a
 *       registered rune's usage line; an item timer ended by hand
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

const api = await imp("module-api.mjs");
const decl = await imp("rune-declarations.mjs");
const guard = await imp("combat/death-guard.mjs");
const riders = await imp("magic/strike-riders.mjs");
const runeActions = await imp("rune-actions.mjs");
const runeDamage = await imp("rune-damage.mjs");
const create = await imp("create-crafting.mjs");
const skillActions = await imp("data/skill-actions.mjs");
const auras = await imp("creature-auras.mjs");
const timers = await imp("rune-timers.mjs");
const age = await imp("age-modifiers.mjs");
const classDerive = await imp("class-derive.mjs");
const ownerQuery = await imp("owner-query.mjs");

const aw = read("module", "combat", "attack-workflow.mjs");
const dgw = read("module", "combat", "death-guard-workflow.mjs");
const cgw = read("module", "combat", "critical-guard-workflow.mjs");
const combat = read("module", "documents", "combat.mjs");
const raw = read("module", "rune-actions-workflow.mjs");
const acw = read("module", "combat", "action-workflow.mjs");
const ccw = read("module", "create-crafting-workflow.mjs");
const apiw = read("module", "module-api-workflow.mjs");
const actorSrc = read("module", "documents", "actor.mjs");
const rtw = read("module", "rune-timers-workflow.mjs");
const oqw = read("module", "owner-query-workflow.mjs");
const boot = read("scripts", "trg-prime.mjs");

/* The runes the module will register, in its own shape. */
api.resetModuleRegistry?.();
api.registerRunes([
  { key: "karmicResilience", name: "Karmic Resilience", on: ["armour"], level: 11, price: 11000,
    declares: { deathGuard: { offer: true, reaction: true, askOwner: true, frequency: "daily", notOutright: true,
      grants: { label: "Karmic Resilience", seconds: 60, conditionals: [{ kind: "modifier", value: 2, type: "circumstance", label: "Karmic Resilience", auto: true, when: { actions: ["dyingCheck"] }, classValue: { classes: ["disciple", "mystic"], value: 4 } }] } } } },
  { key: "staunching", name: "Staunching", on: ["armour"], tiers: [{ level: 6, price: 2000 }, { level: 12, price: 16000 }, { level: 18, price: 180000 }],
    declares: { bleedFlatCheckReduction: [2, 3, 4], bleedReduceCheck: [null, { dc: 16, bands: "moderate" }, { dc: 16, bands: "any" }] } },
  { key: "harmony", name: "Harmony", on: ["armour", "shield"], level: 11, armourPrice: 11000, shieldPrice: 7700,
    declares: { conditionals: [{ kind: "modifier", value: 2, type: "resistance", label: "Harmony", when: { checkTypes: ["save"] }, classValue: { classes: ["disciple", "mystic"], value: 3 } }] } },
  { key: "guarded", name: "Guarded", on: ["armour"], level: 7, price: 3000, declares: { criticalGuard: { frequency: "daily" } } },
  { key: "harmonyEdge", name: "Harmony Edge", on: ["weapon"], level: 12, price: 11000, declares: { criticalAdvantage: { frequency: "daily" } } },
  { key: "soulfulStrike", name: "Soulful Strike", on: ["weapon"], tiers: [{ level: 7, price: 2100 }, { level: 12, price: 11000 }, { level: 17, price: 90000 }],
    declares: { energy: { type: "force", tiers: [{ dice: "1d6", secondaryCritical: null }, { dice: "2d6", secondaryCritical: -40 }, { dice: "3d6", secondaryCritical: -20 }] } } },
  { key: "tranquilQuiver", name: "Tranquil Quiver", on: ["weapon"], level: 10, price: 6000,
    declares: { action: { verb: "Engage", apCost: 1, frequency: "focus", durationSeconds: 0, describe: "x",
      effect: { conditionals: [{ kind: "modifier", value: 2, type: "status", label: "Tranquil Quiver", auto: true, when: { checkTypes: ["attack"], attackModes: ["ranged"] } }],
        strikeRider: { dice: "1d6", damageType: "piercing", scope: "ranged", precision: true, beyondFeet: 30, label: "Tranquil Quiver" } } } },
    usage: { ranged: true, text: "any ranged weapon" } },
  { key: "mindful", name: "Mindful", on: ["weapon"], level: 10, price: 6000,
    declares: { action: { verb: "Engage", apCost: 1, frequency: "focus", durationSeconds: 0, describe: "x",
      effect: { untilTurnStart: true, conditionals: [{ kind: "modifier", valueFrom: "wisdom", type: "untyped", label: "Mindful", auto: false, oneShot: true, when: { checkTypes: ["attack"] } }] } } } }
  ,{ key: "centredArmour", name: "Centred", on: ["armour"], tiers: [{ level: 4, price: 750 }, { level: 8, price: 4200 }, { level: 12, price: 16000 }],
    declares: { conditionals: [{ kind: "modifier", value: [1, 2, 3], type: "item", label: "Centred", auto: true, when: { actions: ["refocus"] } }] } },
  { key: "centredWeapon", name: "Centred", on: ["weapon"], tiers: [{ level: 3, price: 350 }, { level: 6, price: 1400 }, { level: 10, price: 6000 }],
    declares: { conditionals: [{ kind: "modifier", value: [1, 2, 3], type: "item", label: "Centred", auto: true, when: { actions: ["refocus"] } }] } }
], "trg-inner-tempest");
const armour = (runes, extra = {}) => ({ id: "a1", name: "Robe", type: "armour", system: { equipped: true, category: "medium", runes }, flags: {}, ...extra });
const weapon = (runes, flags = {}) => ({ id: "w1", name: "Bow", type: "weapon", system: { equipped: true, runes, damage: "1d8", damageType: "piercing", attackMode: "missile" }, flags: { "trg-prime": flags } });
const discipleClass = { type: "class", name: "Disciple" };

/* C1 — Karmic Resilience */
{
  const carriers = decl.runeDeathGuardCarriers([armour("Karmic Resilience"), discipleClass]);
  const spec = guard.declaredDeathGuards(carriers)[0];
  equal("C1 a worn rune's guard is read as a guard: offered, a reaction, its player's, daily, not against massive damage",
    [carriers.length, spec?.label, spec?.offer, spec?.reaction, spec?.askOwner, spec?.frequency, spec?.notOutright],
    [1, "Karmic Resilience", true, true, true, "daily", true]);
  equal("C1 …its minute of help is +4 for a Disciple (C3), +2 otherwise, on the dying check only",
    [spec?.grants?.conditionals?.[0]?.value, guard.declaredDeathGuards(decl.runeDeathGuardCarriers([armour("Karmic Resilience")]))[0]?.grants?.conditionals?.[0]?.value, spec?.grants?.conditionals?.[0]?.when?.actions, spec?.grants?.seconds],
    [4, 2, ["dyingCheck"], 60]);
  equal("C1 …no rune, or the armour off, guards nothing", [decl.runeDeathGuardCarriers([armour("")]).length, decl.runeDeathGuardCarriers([armour("Karmic Resilience", { system: { equipped: false, category: "medium", runes: "Karmic Resilience" } })]).length], [0, 0]);
  const grant = guard.deathGuardGrantEffect(spec.grants, { worldTime: 1000, round: 3 });
  equal("C1 the grant is an effect with its conditionals, ending a minute later by clock and round",
    [grant.name, grant.flags["trg-prime"].spellEffectEnd, grant.flags["trg-prime"].conditionExpiresRound, grant.flags["trg-prime"].conditionals.length], ["Karmic Resilience", 1060, 13, 1]);
  equal("C1 a grant with no time or no rows is none", [guard.declaredDeathGuards([{ flags: { "trg-prime": { deathGuard: { offer: true, grants: { seconds: 0, conditionals: [{ kind: "modifier" }] } } } } }])[0].grants, guard.deathGuardGrantEffect(null)], [undefined, null]);
  ok("C1 the 0-HP moment asks the worn runes beside the effects", /const effects = \[\.\.\.declarationCarriers\(actor\), \.\.\.runeDeathGuardCarriers\(Array\.from\(actor\?\.items \?\? \[\]\)\)\];/.test(dgw));
  ok("C1 a reaction guard is refused without a reaction, asked of its player, and spends one",
    /const refused = spec\.reaction \? reactionRefusal\(actor\) : "";\n\s*if \(refused\) \{/.test(dgw)
    && /if \(spec\.askOwner\) \{\n\s*const \{ askOwner \} = await import\("\.\.\/owner-query-workflow\.mjs"\);/.test(dgw)
    && /if \(spec\.reaction && !await spendReaction\(actor, spec\.label\)\)/.test(dgw));
  ok("C1 a held guard lays its grant", /if \(spec\.grants\) lines\.push\(\.\.\.await applyGuardGrants\(actor, spec\)\);/.test(dgw)
    && /const data = deathGuardGrantEffect\(spec\.grants, \{/.test(dgw) && /await actor\.createEmbeddedDocuments\("ActiveEffect", \[data\]\);/.test(dgw));
}

/* C2 — Staunching */
{
  const ease = (t) => decl.runeBleedEasing([armour(`Staunching ${t}`)]);
  equal("C2 Staunching I, II, III: the Light check eased by 2, 3, 4; II reaches Moderate, III any",
    [["I", "II", "III"].map((t) => ease(t).reduction), ["I", "II", "III"].map((t) => ease(t).reduceCheck?.bands ?? null), ease("III").reduceCheck?.dc],
    [[2, 3, 4], [null, "moderate", "any"], 16]);
  equal("C2 the reduce check reaches: II Moderate only; III Moderate, Severe and Dire; neither Light",
    [["light", "moderate", "severe", "dire"].map((b) => decl.bleedReduceReaches(ease("II").reduceCheck, b)), ["light", "moderate", "severe", "dire"].map((b) => decl.bleedReduceReaches(ease("III").reduceCheck, b))],
    [[false, true, false, false], [false, true, true, true]]);
  equal("C2 no rune, nothing", decl.runeBleedEasing([armour("")]), { reduction: 0, reduceCheck: null, labels: [] });
  ok("C2 the Light check subtracts the rune's reduction", /\+ runeBleed\.reduction;/.test(combat) && /const runeBleed = runeBleedEasing\(Array\.from\(actor\.items \?\? \[\]\)\);/.test(combat));
  ok("C2 above Light, a rune's check lowers the largest bleed by 1",
    /\} else if \(rawBleedTotal && bleedReduceReaches\(runeBleed\.reduceCheck, bleedingSeverity\(rawBleedTotal\)\?\.key\)\) \{/.test(combat)
    && /dc: runeBleed\.reduceCheck\.dc\n/.test(combat)
    && /const largest = \[\.\.\.bleeds\]\.sort\(\(a, b\) => b\.value - a\.value\)\[0\];/.test(combat)
    && /const next = largest\.value - 1;\n\s*if \(next <= 0\) await largest\.effect\.delete\(\);/.test(combat));
}

/* C3 — by class */
{
  equal("C3 classValued: a held class takes the class value; another keeps the row's; the key goes either way",
    [decl.classValued({ value: 2, classValue: { classes: ["disciple"], value: 3 } }, ["disciple"]), decl.classValued({ value: 2, classValue: { classes: ["disciple"], value: 3 } }, ["fighter"]), decl.classValued({ value: "2", classValue: { classes: ["mystic"], value: 3 } }, ["mystic"])],
    [{ value: 3 }, { value: 2 }, { value: "3" }]);
  equal("C3 the classes read off class items", decl.classNamesOf([discipleClass, { type: "feat", name: "Mystic" }, { type: "class", name: " Mystic " }]), ["disciple", "mystic"]);
  const withClass = decl.runeDeclaredBonuses(armour("Harmony"), [armour("Harmony"), discipleClass]).conditionals[0]?.value;
  const without = decl.runeDeclaredBonuses(armour("Harmony"), [armour("Harmony")]).conditionals[0]?.value;
  equal("C3 a worn rune's offer is read by the wearer's class", [withClass, without], [3, 2]);
  ok("C3 a rune action's effect is read by class before it is laid",
    /const classes = classNamesOf\(Array\.from\(actor\?\.items \?\? \[\]\)\);/.test(raw)
    && /for \(const k of \["auras", "conditionals", "bonuses"\]\) if \(Array\.isArray\(action\.effect\?\.\[k\]\)\) extra\[k\] = byClass\(action\.effect\[k\]\);/.test(raw)
    && /const changes = Array\.isArray\(action\.effect\?\.changes\) \? byClass\(action\.effect\.changes\) : \[\];/.test(raw));
}

/* C4 — Guarded */
{
  const worn = armour("Guarded");
  equal("C4 Guarded is ready, then spent for the day; its heal is half, rounded up",
    [decl.runeCriticalGuard([worn], 100)?.key, decl.runeCriticalGuard([{ ...worn, flags: { "trg-prime": { runeUsedToday: { guarded: true } } } }], 100), decl.criticalGuardHeal(7), decl.criticalGuardHeal(0)],
    ["guarded", null, 4, 0]);
  ok("C4 the critical's dice are kept off the blow when the guard is taken",
    /if \(critDiceKept && !drainDice && targetActor && actor\) \{\n\s*const \{ offerCriticalGuard \} = await import\("\.\/critical-guard-workflow\.mjs"\);\n\s*if \(await offerCriticalGuard\(targetActor, actor, weapon\)\) guardDice = critDiceKept;/.test(aw)
    && /criticalDice: \(drainDice \|\| guardDice\) \? 0 : critDiceKept,/.test(aw));
  ok("C4 …rolled after the blow to say what was negated, and half healed through the relay",
    /const negatedRoll = await new Roll\(`\$\{guardDice\}d\$\{die\}`\)\.evaluate\(\);/.test(aw)
    && /const heal = criticalGuardHeal\(negatedRoll\.total\);/.test(aw)
    && /if \(heal > 0\) await relayHeal\(targetActor, heal, \{\}, \(\) => healActor\(targetActor, heal\)\);/.test(aw));
  ok("C4 asked of the wearer's player, refused without a reaction; their client spends it and marks the day",
    /if \(reactionRefusal\(target\)\) return null;/.test(cgw) && /const yes = await askOwner\(target, \{/.test(cgw)
    && /then: GUARD_STEP,/.test(cgw) && /const updates = runeUseUpdates\(runeMarkersOf\(item\), key, frequency, worldNow\(\)\);/.test(cgw)
    && /await spendReaction\(actor, label \|\| "Rune"\);/.test(cgw) && /registerCriticalGuardStep\(\);/.test(boot));
}

/* C5 — Harmony Edge */
{
  const bow = weapon("Harmony Edge");
  equal("C5 Harmony Edge is ready on the weapon, then spent; advantage raises serious, cancels minor, leaves deadly",
    [decl.runeCriticalAdvantage(bow, 0)?.key, decl.runeCriticalAdvantage(weapon("Harmony Edge", { runeUsedToday: { harmonyEdge: true } }), 0), ["normal", "disadvantage", "advantage"].map(decl.biasWithAdvantage)],
    ["harmonyEdge", null, ["advantage", "normal", "advantage"]]);
  ok("C5 asked before the injury roll, never for a forced re-read, and the roll takes its bias",
    /let bias =\n/.test(aw)
    && /if \(weapon && \(forcedResult === null \|\| forcedResult === undefined\)\) \{\n\s*const \{ offerCriticalAdvantage \} = await import\("\.\/critical-guard-workflow\.mjs"\);\n\s*const edge = await offerCriticalAdvantage\(actor, weapon, bias\);\n\s*if \(edge\) \{ bias = edge\.bias; edgeLine = edge\.line; \}/.test(aw)
    && aw.indexOf("const edge = await offerCriticalAdvantage(actor, weapon, bias);") < aw.indexOf("? await rollPercentile({")
    && /if \(edgeLine\) lines\.push\(line\(edgeLine\)\);/.test(aw));
}

/* C6 — Soulful Strike */
{
  equal("C6 a registered energy rune reads in the five's shape",
    decl.registeredEnergyRune("soulfulStrike"), { label: "Soulful Strike", type: "force", tiers: [{ dice: "1d6", secondaryCritical: null }, { dice: "2d6", secondaryCritical: -40 }, { dice: "3d6", secondaryCritical: -20 }] });
  const off = runeDamage.runeDamageFor(weapon("Soulful Strike II"));
  const on = runeDamage.runeDamageFor(weapon("Soulful Strike II", { runeState: { [runeDamage.energyRuneState("soulfulStrike")]: true } }));
  equal("C6 switched off it deals nothing; on, 2d6 force with a −40 secondary critical (B9-2)",
    [off.length, on.map((r) => [r.label, r.dice, r.type, r.secondaryCritical])], [0, [["Soulful Strike II", "2d6", "force", -40]]]);
  const button = runeActions.runeActionsFor(weapon("Soulful Strike III"))[0];
  equal("C6 its Command button is the five's switch: 1 AP, the state, the energy", [button?.verb, button?.apCost, button?.state, button?.energy, button?.declaredEnergy, button?.label],
    ["Command", 1, "soulfulStrikeActive", "force", true, "Soulful Strike III"]);
  equal("C6 a rune declaring no energy is not one", [decl.registeredEnergyRune("guarded"), decl.registeredEnergyRune("nothing")], [null, null]);
  ok("C6 pressed, it is switched as the five are", /if \(action\.declaredEnergy\) return useEnergyRune\(actor, item, action\);/.test(raw)
    && raw.indexOf("if (action.declaredEnergy) return useEnergyRune") < raw.indexOf("if (action.declared) return useDeclaredRune"));
}

/* C7 — Tranquil Quiver */
{
  const action = runeActions.runeActionsFor(weapon("Tranquil Quiver")).find((a) => a.key === "tranquilQuiver");
  const effect = runeActions.nextStrikeEffect({ id: "w1", name: "Bow", uuid: "Item.w1" }, action, { conditionals: action.effect.conditionals });
  const rider = riders.normaliseStrikeRider(effect.flags["trg-prime"].strikeRider);
  equal("C7 an action with no minute lays the offer and a once-rider for the next ranged Strike",
    [action.durationSeconds, action.focus, effect.flags["trg-prime"].conditionals.length, rider?.once, rider?.scope, rider?.beyondFeet, rider?.precision, rider?.weaponScoped],
    [0, true, 1, true, "ranged", 30, true, false]);
  // A sling, so the weapon's own type differs from the row's placeholder.
  const bow = { attackMode: "missile", weaponId: "w1", damage: "1d4", damageType: "bludgeoning" };
  const far = riders.riderPacketsFor([rider], bow, { distanceFeet: 35 })[0];
  const near = riders.riderPacketsFor([rider], bow, { distanceFeet: 30 })[0];
  const immune = riders.riderPacketsFor([rider], bow, { distanceFeet: 60, precisionImmune: true })[0];
  equal("C7 beyond 30 ft it deals 1d6 of the weapon's own type; at 30 ft or less, or against precision immunity, nothing",
    [[far.applies, far.conditional, far.type, far.dice], [near.applies, near.conditional, near.resolved], [immune.applies, immune.conditional]],
    [[true, false, "bludgeoning", "1d6"], [false, true, true], [false, true]]);
  equal("C7 …an unknown distance is unmet; resistance halves 1d6 to nothing",
    [riders.riderPacketsFor([rider], bow, {})[0].applies, riders.riderPacketsFor([rider], bow, { distanceFeet: 40, precisionResisted: true })[0].applies],
    [false, false]);
  equal("C7 the distance does not stop it being spent, near or far", [riders.ridersSpentBy([rider], bow, { hit: true, ctx: { distanceFeet: 10 } }).length, riders.ridersSpentBy([rider], bow, { hit: false })].map((x) => (Array.isArray(x) ? x.length : x)), [1, 1]);
  ok("C7 the Strike tells its riders how far and whether precision lands",
    /distanceFeet: await strikeDistanceFeet\(actor, targetTokenHere\),\n\s*precisionImmune,\n\s*precisionResisted\n/.test(aw)
    && /const \{ activeToken, distanceBetween \} = await import\("\.\/geometry\.mjs"\);/.test(aw));
  ok("C7 a declared action with no minute lays that effect", /\} else if \(action\.effect\?\.strikeRider \|\| extra\.conditionals\?\.length\) \{/.test(raw)
    && /await actor\.createEmbeddedDocuments\("ActiveEffect", \[nextStrikeEffect\(item, action, \{ \.\.\.extra, expiresRound \}\)\]\);/.test(raw));
  // C7b — Mindful: "before the beginning of your next turn".
  const mindful = runeActions.runeActionsFor(weapon("Mindful")).find((a) => a.key === "mindful");
  const fx = (round) => runeActions.nextStrikeEffect({ id: "w1", name: "Katana", uuid: "Item.w1" }, mindful, { conditionals: mindful.effect.conditionals, expiresRound: round }).flags["trg-prime"];
  equal("C7b an offer until the next turn carries the round it ends in; out of combat it waits; Tranquil Quiver keeps no round",
    [fx(4).conditionExpiresRound, "conditionExpiresRound" in fx(null), fx(4).conditionals[0].oneShot, fx(4).conditionals[0].valueFrom,
      "conditionExpiresRound" in runeActions.nextStrikeEffect({ name: "Bow" }, runeActions.runeActionsFor(weapon("Tranquil Quiver")).find((a) => a.key === "tranquilQuiver"), { expiresRound: 4 }).flags["trg-prime"]],
    [4, false, true, "wisdom", false]);
  ok("C7b the workflow hands it the next round only while the wielder fights in a running combat",
    /const fighting = Boolean\(combat\?\.started && Array\.from\(combat\.combatants \?\? \[\]\)\.some\(\(c\) => c\.actor\?\.id === actor\.id\)\);\n\s*const expiresRound = fighting \? Number\(combat\.round \?\? 0\) \+ 1 : null;/.test(raw)
    && /const ends = action\.effect\?\.untilTurnStart === true && Number\.isFinite\(Number\(extra\.expiresRound\)\) && extra\.expiresRound !== null/.test(read("module", "rune-actions.mjs")));
}

/* C8 — Monastic Items */
{
  const route = create.normaliseCreateRoute({ key: "monastic", label: "Monastic Items", skill: "meditation", itemTypes: ["magical", "nonsense"], requires: ["Inner Discipline"], dcStep: 2, ticks: ["a", "b"] });
  equal("C8 a route keeps the types Create knows, its requirement, the DC step and the ticks",
    [route.itemTypes, route.requires, route.dcStep, route.ticks.length], [["magical"], ["inner discipline"], 2, 2]);
  equal("C8 the route opens to a creature holding Inner Discipline, through its own skill only",
    [create.createRouteFor([route], "meditation", ["Inner Discipline"])?.key, create.createRouteFor([route], "meditation", ["Flurry"]), create.createRouteFor([route], "arcana", ["Inner Discipline"])],
    ["monastic", null, null]);
  equal("C8 Meditation is not a Create skill of its own; Arcana is", [create.createSkillIsNative("meditation"), create.createSkillIsNative("arcana")], [false, true]);
  equal("C8 a route lacking a skill, a known type or a requirement is refused",
    [create.normaliseCreateRoute({ key: "x", skill: "meditation", itemTypes: ["magical"] }), create.normaliseCreateRoute({ key: "x", skill: "meditation", itemTypes: ["wands"], requires: ["y"] })], [null, null]);
  const before = skillActions.SKILL_ACTIONS.find((a) => a.key === "create").skills.length;
  const added = api.registerCreateRoute({ key: "monastic", skill: "meditation", itemTypes: ["magical"], requires: ["Inner Discipline"], dcStep: 2 }, "trg-inner-tempest", { addSkill: skillActions.addSkillToAction });
  const create2 = skillActions.SKILL_ACTIONS.find((a) => a.key === "create");
  equal("C8 registered, Meditation joins Create's skills, once", [added, create2.skills.length - before, create2.skills.includes("meditation"), skillActions.addSkillToAction("create", "meditation"), Object.isFrozen(create2), api.registeredCreateRoutes().length], [true, 1, true, false, true, 1]);
  ok("C8 Create refuses Meditation without a route, takes the route's DC, and remembers it on the project",
    /if \(!createSkillIsNative\(skillKey\) && !route\) \{/.test(acw) && /createRouteDC = route\?\.dcStep \?\? 0;/.test(acw)
    && /createRouteDC = Math\.max\(0, Math\.trunc\(Number\(active\.routeDC\) \|\| 0\)\);/.test(acw)
    && /if \(action\.key === "create" && createRouteDC && finalDC !== null\) \{\n\s*finalDC \+= createRouteDC;/.test(acw)
    && /routeDC: Math\.max\(0, Math\.trunc\(Number\(setup\.routeDC\) \|\| 0\)\)/.test(ccw));
  ok("C8 the setup dialog offers the route's types and asks its ticks",
    /\? Object\.entries\(ITEM_TYPES\)\.filter\(\(\[key\]\) => route\.itemTypes\.includes\(key\)\)/.test(ccw)
    && /route\.ticks\.map\(\(t, i\) => req\(`reqRoute\$\{i\}`, esc\(t\)\)\)/.test(ccw)
    && /registerCreateRoute: \(route, moduleId\) => registerCreateRoute\(route, moduleId, \{ addSkill: addSkillToAction \}\),/.test(apiw));
}

/* C9 — the Incense Burner */
{
  const burner = (lit) => ({ id: "b1", name: "Burner", type: "gear", flags: { "trg-prime": { auras: [{ kind: "ally", radius: 30, includeSelf: true, whileState: "lit", allyEffect: { conditionals: [{ kind: "modifier", value: 2, type: "status", when: { subjects: ["meditation"] } }] } }], runeState: { lit } } } });
  equal("C9 an aura declaring a state is emitted only while the item's state runs", [auras.aurasOf([burner(true)], 5).length, auras.aurasOf([burner(false)], 5).length], [1, 0]);
  const flags = timers.runeTimerFlags({ itemId: "b1", key: "incense", state: "lit", durationSeconds: 3600, ending: { lapsed: "The incense burns out." } }, { worldTime: 10, round: null });
  equal("C9 a timed item state ends an hour on, in its own words", [flags.spellEffectEnd, flags.runeTimer?.ending?.lapsed ?? Object.values(flags).find((v) => v?.ending)?.ending?.lapsed], [3610, "The incense burns out."]);
  ok("C9 the timer's end reads those words; the module may start one",
    /const ending = timer\.ending\?\.lapsed\n/.test(rtw) && /startItemTimer: async \(actor, item, \{ key, state, label, durationSeconds, ending = null \}\) => \{/.test(apiw));
}

/* C10 — age */
{
  const old = { flags: { "trg-prime": { age: "old" } }, changes: [
    { key: "system.attributes.strength.untyped", value: "-2" }, { key: "system.attributes.constitution.untyped", value: "-2" }, { key: "system.attributes.intelligence.untyped", value: "2" }] };
  const shift = age.ageShiftOf([old, { flags: {}, changes: [{ key: "system.attributes.constitution.untyped", value: "5" }] }, { ...old, disabled: true }]);
  equal("C10 an age effect's ability changes are summed; other effects and a disabled one are not",
    [shift.strength, shift.constitution, shift.intelligence, age.withoutAge(-1, shift, "constitution")], [-2, -2, 2, 1]);
  const system = { progression: { skillPoints: 4, skillPointAbility: "" }, attributes: { intelligence: { total: 3 } } };
  const budget = classDerive.prepareSkillPointBudget(system, { items: [], appliedEffects: [old] });
  equal("C10 the skill budget reads Intelligence without its age bonus (B9-11)", [budget, system.progression.skillPointsThisLevel],
    [classDerive.prepareSkillPointBudget({ progression: { skillPoints: 4 }, attributes: { intelligence: { total: 1 } } }, { items: [] }), budget]);
  ok("C10 max HP reads Constitution without its age penalty",
    /const ageShift = ageShiftOf\(actor\?\.appliedEffects \?\? actor\?\.effects \?\? \[\]\);/.test(actorSrc)
    && /conTotal: withoutAge\(system\.attributes\?\.constitution\?\.total \?\? 0, ageShift, "constitution"\),/.test(actorSrc));
}

/* Q — asking the owner */
{
  const player = { id: "p", active: true, isGM: false }, idle = { id: "q", active: false, isGM: false }, gm = { id: "g", active: true, isGM: true };
  equal("Q the player answers; then the GM; then this client",
    [ownerQuery.answeringUserId([gm, player], { gmId: "g", selfId: "g" }), ownerQuery.answeringUserId([idle, gm], { gmId: "g", selfId: "x" }), ownerQuery.answeringUserId([idle], { gmId: "", selfId: "x" }), ownerQuery.answeringUserId([player], { gmId: "g", selfId: "p" })],
    ["p", "g", "", ""]);
  ok("Q the query is registered at init and a silence is a no",
    /CONFIG\.queries\[OWNER_QUERY\] = async \(data\) => askHere\(data, \{ windowMs: ANSWER_WINDOW_MS \}\);/.test(oqw) && /registerOwnerQuery\(\);/.test(boot)
    && /return Boolean\(await user\.query\(OWNER_QUERY, question, \{ timeout: WAIT_MS \}\)\);/.test(oqw) && /\} catch \(err\) \{\n\s*console\.warn\(`TRG Prime \| \$\{user\.name\} did not answer/.test(oqw));
}

/* C12 — Centred I–III */
{
  const offer = (item) => decl.runeDeclaredBonuses(item, [item]).conditionals.map((c) => [c.value, c.type, c.when.actions[0]]);
  equal("C12 the tier's value: I +1, II +2, III +3 (and a tier past the list keeps the last)",
    [offer(armour("Centred I")), offer(armour("Centred II")), offer(armour("Centred III")), decl.tierValued({ value: [1, 2, 3] }, 6).value, decl.tierValued({ value: 4 }, 2).value],
    [[[1, "item", "refocus"]], [[2, "item", "refocus"]], [[3, "item", "refocus"]], 3, 4]);
  const catalogue = await imp("rune-catalogue.mjs");
  const price = (kind) => catalogue.runesFor(kind).filter((r) => r.name === "Centred").map((r) => [r.key, r.tiers.map((t) => t.price)]);
  equal("C12 one name, two runes: armour's ladder on armour, a weapon's on weapons, each found by the name written",
    [price("armour"), price("weapon"), catalogue.fieldToRunes("weapon", "Centred II")[0]?.key, catalogue.fieldToRunes("armour", "Centred II")[0]?.key],
    [[["centredArmour", [750, 4200, 16000]]], [["centredWeapon", [350, 1400, 6000]]], "centredWeapon", "centredArmour"]);
}

/* C11 — an item's spell at its own PP (Restorative Mat) */
{
  ok("C11 the helper releases the spell through the consumables' own release, at the item's PP, its activation paid",
    /releaseItemSpell: async \(actor, item, \{ name = "", uuid = "", pp = 0 \} = \{\}, \{ apPaid = false, fixedDC = null \} = \{\}\) => \{\n\s*const \{ releaseItemSpell \} = await import\("\.\/consumable-use-workflow\.mjs"\);\n\s*const ref = \{ name: String\(name \?\? ""\), uuid: String\(uuid \?\? ""\), pp: Math\.max\(0, Math\.trunc\(Number\(pp\) \|\| 0\)\), warp: null \};\n\s*const out = await releaseItemSpell\(actor, item, ref, \{ apPaid: Boolean\(apPaid\), fixedDC \}\);/.test(apiw));
  ok("C11 …and the release it calls still casts an item cast at that PP", /export async function releaseItemSpell\(actor, item, ref, \{/.test(read("module", "consumable-use-workflow.mjs"))
    && /foundry\.utils\.setProperty\(data, `flags\.\$\{SYSTEM_ID\}\.itemCast`, \{\n\s*itemName: item\.name,\n\s*itemId: item\.id,\n\s*kind: consumableKind\(item\),\n\s*pp: ref\.pp,/.test(read("module", "consumable-use-workflow.mjs")));
}

/* R — found in review */
{
  const relay = await imp("combat/target-relay.mjs");
  const said = [];
  const deps = { acknowledge: (m) => said.push(["ack", m.action, m.requestId]), reply: (m) => said.push(["reply", m.action, m.requestId]) };
  await relay.handleRelayMessage({ action: relay.RELAY_ACTIONS.HP_ZERO, requestId: "r1", userId: "p", uuid: "Actor.none" }, { user: { isGM: true, id: "g" }, activeGM: { id: "g" }, deps: { ...deps, fromUuid: async () => null } });
  const reply = await relay.handleRelayMessage({ action: relay.RELAY_ACTIONS.WORKING, requestId: "r2" }, { user: { isGM: true, id: "g" }, activeGM: { id: "g" }, deps });
  const rtwSrc = read("module", "combat", "target-relay-workflow.mjs");
  equal("R1 the GM's client says it has a request before carrying it out, and a WORKING is never carried out; the wait it buys outlasts a player's minute",
    [said[0], said.at(-1)?.[0], reply.handled, relay.RELAY_WORKING_TIMEOUT_MS > ownerQuery.ASK_WAIT_MS],
    [["ack", "target.working", "r1"], "reply", false, true]);
  ok("R1 …and the asker, told, waits on the longer clock",
    /if \(data\?\.action === RELAY_ACTIONS\.WORKING\) \{\n\s*if \(data\.userId === game\.user\?\.id\) working\.get\(data\.requestId\)\?\.\(\);/.test(rtwSrc)
    && /timer = setTimeout\(giveUp\("the GM's client took too long to answer"\), RELAY_WORKING_TIMEOUT_MS\);/.test(rtwSrc)
    && /acknowledge: \(message\) => game\.socket\.emit\(RELAY_SOCKET, message\)/.test(rtwSrc));
  equal("R2 an answer inside the window counts; one after it, or untimed, does not; the window closes before the asker gives up",
    [ownerQuery.answeredInTime(0, 54000), ownerQuery.answeredInTime(0, 56000), ownerQuery.answeredInTime(null, 1), ownerQuery.ANSWER_WINDOW_MS < ownerQuery.ASK_WAIT_MS],
    [true, false, false, true]);
  ok("R2 …a question for another client closes itself and a late yes runs no step",
    /CONFIG\.queries\[OWNER_QUERY\] = async \(data\) => askHere\(data, \{ windowMs: ANSWER_WINDOW_MS \}\);/.test(oqw)
    && /if \(windowMs > 0 && !answeredInTime\(askedAt, Date\.now\(\), windowMs\)\) \{/.test(oqw) && /try \{ shown\?\.close\?\.\(\); \}/.test(oqw));
  ok("R3 Harmony Edge is not asked where advantage changes nothing (a deadly critical)", /if \(!edge \|\| !attacker \|\| biasWithAdvantage\(bias\) === bias\) return null;/.test(cgw)
    && decl.biasWithAdvantage("advantage") === "advantage");
  ok("R4 a distance that cannot be measured is unknown, not 0 feet", /const raw = distanceBetween\(mine, targetToken\);\n\s*if \(raw === null \|\| raw === undefined \|\| raw === ""\) return NaN;/.test(aw));
  const cast = read("module", "magic", "cast-workflow.mjs");
  ok("R5 Guarded answers a spell attack's critical: asked before its dice, which are then not dealt, and half healed",
    /const guarded = await offerCriticalGuard\(targetActor, actor, spell\);/.test(cast) && /if \(guarded\) guardedNegated = \{ formula: critFormula, total: critRoll\.total \};\n\s*else \{\n\s*critBonus = critRoll\.total;\n\s*dealt \+= critBonus;/.test(cast)
    && /const heal = criticalGuardHeal\(guardedNegated\.total\);/.test(cast));
  const usage = await imp("weapon-rune-usage.mjs");
  const melee = { name: "Katana", type: "weapon", system: { equipped: true, runes: "Tranquil Quiver", attackMode: "melee", damageType: "slashing" }, flags: {} };
  const bow = { name: "Bow", type: "weapon", system: { equipped: true, runes: "Tranquil Quiver", attackMode: "missile", damageType: "piercing" }, flags: {} };
  equal("R6 a registered rune's usage: Tranquil Quiver on a bow, not on a katana or a thrown dagger (no button there)",
    [usage.runeUsageAllows("tranquilQuiver", usage.weaponUsage(bow.system)).ok, usage.runeUsageAllows("tranquilQuiver", usage.weaponUsage(melee.system)).ok,
      usage.runeUsageAllows("tranquilQuiver", usage.weaponUsage({ attackMode: "thrown" })).ok, runeActions.runeActionsFor(bow).some((a) => a.key === "tranquilQuiver"), runeActions.runeActionsFor(melee).some((a) => a.key === "tranquilQuiver"),
      api.registeredRune("tranquilQuiver")?.usage?.text],
    [true, false, false, true, false, "any ranged weapon"]);
  ok("R7 an item timer can be ended by hand, saying its manual ending", /stopItemTimer: async \(actor, item, key\) => \{\n\s*const \{ stopRuneTimer \} = await import\("\.\/rune-timers-workflow\.mjs"\);\n\s*return stopRuneTimer\(actor, item, key\);/.test(apiw));
}

// 3.673.0 OR LATER.
{
  const [ma, mi] = String(JSON.parse(read("system.json")).version).split(".").map(Number);
  ok("Z0 the system is 3.673.0 or later", ma > 3 || (ma === 3 && mi >= 673));
}

const EXPECTED = 66;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-block9-core: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-block9-core: ${checks} checks — all green.`);
