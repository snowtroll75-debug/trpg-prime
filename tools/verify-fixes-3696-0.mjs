#!/usr/bin/env node
/**
 * verify-fixes-3696-0 — TRG Prime 3.696.0: the Pillars of Faith audit's
 * remaining core proposals (Graham, 16 Nov 2026: "build CD1-CD9 and CD12").
 *   CD1  a check reaction's reroll with advantage, keeping the better result
 *   CD2  a strike rider filtered by weapon and living target, of its own
 *        damage type, laying conditions or an effect on a critical
 *   CD3  a counteract row that always asks (with "none of these"), and a warp
 *        that raises its limit
 *   CD4  DR against one damage type
 *   CD5  forced-movement reduction — already in the core (3.669.0); checked
 *   CD6  a shield whose bash carries a maneuver trait
 *   CD7  a feat's value for one degree's stated bonus
 *   CD8  a critical-injury reaction that lowers the severity — already in the
 *        core (3.685.0, `after` → severitySteps); checked
 *   CD9  every spell heal announced (trgPrimeSpellHealed)
 *   CD12 a strike rider that also rides a Grimward spell, sharing the round's
 *        marker; the HP-gated growth (3.625.0) checked
 *   and: a step of a cure in order is rolled blind (found live on 3.695.0).
 *
 *   node tools/verify-fixes-3696-0.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

/* CD1 ------------------------------------------------------------------ */
{
  const rx = await mod("reactions", "reactions-workflow.mjs");
  const o = (rank, total) => ({ degree: { rank }, total });
  equal("CD1a the better result: degree first, then total; a tie keeps the second", [rx.keepFirst(o(4, 20), o(3, 30)), rx.keepFirst(o(2, 25), o(3, 10)), rx.keepFirst(o(3, 18), o(3, 12)), rx.keepFirst(o(3, 12), o(3, 12))], [true, false, true, false]);
  const src = read("module", "reactions", "reactions-workflow.mjs");
  ok("CD1b an `advantage` answer sets the reroll's bias before it is rolled", /if \(out\.advantage === true\) \{[\s\S]{0,260}check\.bias = resolveBias\(check\.bias, \["advantage"\], BIAS\);\n\s*\}\n\s*let next = check;/.test(src));
  ok("CD1c a `keepBetter` answer restores the first result when it is better, and says which stands", /if \(out\.keepBetter === true && keepFirst\(first, next\.outcome\)\) \{/.test(src) && /check\.outcome = first;\n\s*check\.dice = firstDice;/.test(src) && /the better, \$\{first\?\.total \?\? "\?"\}, stands/.test(src));
  ok("CD1d the default is unchanged: the second result stands", /the second result stands and cannot be modified or rerolled\.`\];\n\s*return \{ check: next, rerolled: true, lines \};/.test(src));
}

/* CD2 / CD12 ------------------------------------------------------------ */
{
  const dr = await mod("combat", "damage-riders.mjs");
  const fx = (id, rider) => ({ id, flags: { "trg-prime": { strikeDamageRider: rider } } });
  const riders = dr.declaredDamageRiders([
    fx("ba", { dice: "1d6", label: "Blood Awakened", weaponNames: ["Bite", "Fangs"], damageType: "essence", targetLiving: true, oncePerRound: true }),
    fx("jd", { dice: "1d6", label: "Judgement", targetUuids: ["S"], oncePerRound: true, spells: true, lowHalfExtraDice: "1d6", onCritical: { label: "Final Sanction", effect: { name: "Final Sanction: −1 status to DB" } } }),
    fx("hf", { dice: "0d6", label: "broken" }),
    fx("pr", { dice: "1d4", label: "Strike only", targetUuids: ["P"] }),
    fx("nc", { label: "no dice, no critical" }),
    fx("ne", { label: "no dice, an empty critical", onCritical: { conditions: [] } }),
    fx("fg", { label: "Hunter's Fangs", weaponNames: ["Fangs"], targetLiving: true, onCritical: { label: "Hunter's Fangs", conditions: [{ key: "bleeding", value: 1 }] } })
  ]);
  const names = (ctx) => dr.damageRidersFor(riders, ctx).map((r) => r.label);
  equal("CD2a the weapon filter: the Fangs carry Blood Awakened, a longsword does not", [names({ targetUuid: "X", weaponName: "Fangs", living: true }), names({ targetUuid: "X", weaponName: "Longsword", living: true })], [["Blood Awakened"], []]);
  equal("CD2j a critical-only rider (no dice) is declared, but adds nothing to a blow; one with neither is dropped", [riders.map((r) => r.label).includes("Hunter's Fangs"), riders.map((r) => r.label).some((l) => l.startsWith("no dice")), riders.find((r) => r.label === "Hunter's Fangs").count], [true, false, 0]);
  equal("CD2b the living filter: not against an undead", names({ targetUuid: "X", weaponName: "Bite", living: false }), []);
  const ba = dr.damageRidersFor(riders, { targetUuid: "X", weaponName: "Bite", living: true });
  equal("CD2c a typed rider is its own packet, not in the weapon's formula", [dr.riderFormula(ba), dr.typedRiderPackets(ba).map((p) => [p.dice, p.type])], ["", [["1d6", "essence"]]]);
  equal("CD2d an untyped rider still joins the formula", dr.riderFormula(dr.damageRidersFor(riders, { targetUuid: "S", weaponName: "Longsword" })), " + 1d6");
  equal("CD2e a critical's riders: by target and weapon, not by the round's burn", [dr.criticalRiders(riders, { targetUuid: "X", weaponName: "Fangs", living: true }).map((r) => r.label), dr.criticalRiders(riders, { targetUuid: "S", weaponName: "", spell: true }).map((r) => r.label)], [["Hunter's Fangs"], ["Judgement"]]);
  equal("CD2f the critical declaration is kept: conditions and an effect", [riders.find((r) => r.label === "Hunter's Fangs").onCritical.conditions, Boolean(riders.find((r) => r.label === "Judgement").onCritical.effect)], [[{ key: "bleeding", value: 1, label: "bleeding" }], true]);
  equal("CD12a a spell's damage takes only a rider that says `spells`", [names({ targetUuid: "S", spell: true }), names({ targetUuid: "X", spell: true, living: true }), names({ targetUuid: "P", spell: true }), names({ targetUuid: "P", weaponName: "Mace" })], [["Judgement"], [], [], ["Strike only"]]);
  {
    const g = dr.declaredDamageRiders([fx("gw", { dice: "1d6", label: "Judgement", spells: true, spellClasses: ["Grimward"] })]);
    equal("CD12c a rider may admit one class's specialist spells only", [dr.damageRidersFor(g, { spell: true, spellClass: "Grimward" }).length, dr.damageRidersFor(g, { spell: true, spellClass: "Healer" }).length, dr.damageRidersFor(g, { spell: true }).length, dr.damageRidersFor(g, { weaponName: "Mace" }).length], [1, 0, 0, 1]);
    equal("CD12d whose spell (3.696.3): a specialist spell is its class's, an innate spell nobody's, a list spell the caster's classes'", [dr.spellCastingClasses({ specialist: true, specialistClass: "Grimward" }, ["Cleric"]), dr.spellCastingClasses({ innate: true }, ["Grimward"]), dr.spellCastingClasses({}, ["Grimward"]), dr.spellCastingClasses({}, [])], [["Grimward"], [], ["Grimward"], []]);
    equal("CD12e a Grimward's list spell (Divinity) carries Judgement; a multiclass caster's spell is admitted for any of its classes", [dr.damageRidersFor(g, { spell: true, spellClass: ["Grimward"] }).length, dr.damageRidersFor(g, { spell: true, spellClass: ["Cleric", "Grimward"] }).length, dr.damageRidersFor(g, { spell: true, spellClass: [] }).length], [1, 1, 0]);
    ok("CD12f the cast hands the classes the spell was cast as", read("module", "magic", "cast-workflow.mjs").includes('spellClass: spellCastingClasses(spell?.system ?? {}, Array.from(actor?.items ?? []).filter((i) => i.type === "class").map((i) => i.name)),'));
  }
  equal("CD12b the HP-gated growth (3.625.0) still reads the target's HP", dr.damageRidersFor(riders, { targetUuid: "S", targetHp: 10, targetMax: 30, spell: true })[0]?.dice, "1d6 + 1d6");
  const aw = read("module", "combat", "attack-workflow.mjs");
  ok("CD2g the Strike hands the weapon and whether the target lives", /weaponName: weapon\?\.name \?\? "",\n\s*living: targetActor \? isLivingCreature\(targetActor\.system \?\? \{\}\) : true/.test(aw));
  ok("CD2h typed riders join the typed extras", /\.\.\.\(replacingFlat \? \[\] : typedRiderPackets\(damageRiders \?\? \[\]\)\)/.test(aw));
  ok("CD2i a critical injury lays its riders' conditions and effect, through the relay", /for \(const rider of criticalRiders\(declaredRidersForCritical\(/.test(aw) && /if \(rider\.onCritical\.conditions\.length\) \{\n\s*const got = await relayConditionTags\(targetActor, rider\.onCritical\.conditions/.test(aw) && /createEffectsOn\(targetActor, \[/.test(aw));
  const cw = read("module", "magic", "cast-workflow.mjs");
  ok("CD12c a spell's successful damage asks the strike riders and spends the same marker", /const strikeHP = taken > 0 \? await applySpellStrikeRiders\(/.test(cw) && /damageRidersFor\(declaredDamageRiders\(/.test(cw) && /ridersBurnUpdate\(joining, used\)/.test(cw) && /RIDERS_USED_FLAG, burnt\)/.test(cw));
}

/* CD3 ------------------------------------------------------------------- */
{
  const cr = await mod("magic", "counteract-row.mjs");
  equal("CD3a `confirm` is read off the row", [cr.normaliseCounteract({ kind: "counteract", traits: ["curse"], limit: 1, confirm: true }).confirm, cr.normaliseCounteract({ kind: "counteract", traits: ["curse"], limit: 1 }).confirm], [true, false]);
  equal("CD3b the warp raises a limit, never an unlimited row", [cr.counteractLimit(1, 1), cr.counteractLimit(1, 0), cr.counteractLimit(0, 2)], [2, 1, 0]);
  const choice = await mod("magic", "counteract-workflow-choice.mjs");
  equal("CD3c the chosen candidates: in order, deduplicated, at most the limit", choice.chosenCandidates(["a", "b", "c"], [2, 0, 2, 1], 2), ["c", "a"]);
  const sfx = read("module", "magic", "spell-effects.mjs");
  ok("CD3d the row asks when it confirms, or when it has more than its (warped) limit", /const rowLimit = counteractLimit\(spec\.limit, warpMods\?\.counteractLimitBonus\);/.test(sfx) && /if \(held\.length && \(spec\.confirm \|\| \(rowLimit && held\.length > rowLimit\)\)\) \{/.test(sfx));
  ok("CD3e the warp key is in the vocabulary, sums, and merges", (read("module", "magic", "spell-warp.mjs").match(/counteractLimitBonus/g) ?? []).length >= 4);
  ok("CD3f the prompt offers \"None of these\" on a confirming row", /\.\.\.\(confirm \? \[\{ action: "none", label: "None of these", callback: \(\) => \[\] \}\] : \[\]\)/.test(read("module", "magic", "counteract-workflow-choice.mjs")));
}

/* CD4 ------------------------------------------------------------------- */
{
  const dv = await mod("combat", "dr-versus.mjs");
  const e = (raw, extra = {}) => ({ flags: { "trg-prime": { drVersus: raw } }, ...extra });
  equal("CD4a DR against one type: summed, case-free, never negative, suppressed effects out", [dv.drVersusFor([e({ slashing: 1 }), e({ Slashing: 2 })], "slashing"), dv.drVersusFor([e({ slashing: 1 })], "piercing"), dv.drVersusFor([e({ slashing: -3 })], "slashing"), dv.drVersusFor([e({ slashing: 1 }, { isSuppressed: true })], "slashing")], [3, 0, 0, 0]);
  globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: {} };
  const { resolveAgainstDefences } = await mod("combat", "damage-workflow.mjs");
  const target = (fxs) => ({ combat: { armour: { dr: 0 }, bdb: { total: 0 }, naturalArmour: { dr: 0 }, dr: { total: 0 } }, parent: { appliedEffects: fxs } });
  const hit = (type, fxs, opts = {}) => resolveAgainstDefences(target(fxs), { amount: 10, type, ...opts }).taken;
  equal("CD4b the damage path takes it: slashing 10 → 9, piercing 10, an unarmoured location 10", [hit("slashing", [e({ slashing: 1 })]), hit("piercing", [e({ slashing: 1 })]), hit("slashing", [e({ slashing: 1 })], { drBypassed: true })], [9, 10, 10]);
}

/* CD5 / CD8 (already in the core) -------------------------------------- */
{
  const fm = await mod("combat", "forced-movement.mjs");
  equal("CD5 forced-movement reduction: declared feet summed, the push never below 0", [fm.forcedMovementReduction([{ flags: { "trg-prime": { forcedMovementReduction: 5 } } }]), fm.reducedPushFeet(5, 5), fm.reducedPushFeet(10, 5)], [5, 0, 5]);
  ok("CD8 a critical reaction's `after` answer lowers the severity (3.685.0)", /severitySteps/.test(read("module", "module-api.mjs")) && /registeredCriticalAfterReactions/.test(read("module", "reactions", "reactions-workflow.mjs")) && /severityStepsFrom/.test(read("module", "reactions", "reactions-workflow.mjs")));
}

/* CD6 ------------------------------------------------------------------- */
{
  const at = await mod("combat", "attack.mjs");
  const board = { type: "shield", name: "Ossuary Board", system: { equipped: true, shieldBashDamage: "1d6" }, flags: { "trg-prime": { bashTraits: ["Shove"] } } };
  equal("CD6a a shield whose bash carries Shove is the Shove's weapon; not for Trip, not unequipped, not a buckler", [at.maneuverWeapon([board], "shove")?.name, at.maneuverWeapon([board], "trip"), at.maneuverWeapon([{ ...board, system: { ...board.system, equipped: false } }], "shove"), at.maneuverWeapon([{ ...board, system: { ...board.system, shieldBashDamage: "" } }], "shove")], ["Ossuary Board", null, null, null]);
  equal("CD6b a Shove-trait weapon still comes first", at.maneuverWeapon([board, { type: "weapon", name: "Whip", system: { equipped: true, traits: "Shove, Trip" } }], "shove")?.name, "Whip");
  ok("CD6d the maneuver's proficiency for a shield is SHIELD proficiency (found live: the board's \"heavy\" read as a heavy weapon)", read("module", "combat", "attack-workflow.mjs").includes('proficiencyOf(proficiencyProfile(actor), { type: weapon.type === "shield" ? "shield" : "weapon", name: weapon.name'));
  ok("L1 (3.696.1, live) a typed rider's card line names its type and its own packet", read("module", "combat", "attack-workflow.mjs").includes('${rider.damageType ? ` — ${rider.damageType}, rolled as its own packet` : ""}.`));'));
  ok("L2 (3.696.1, live) a critical rider's effect already named for it is not named twice", read("module", "combat", "attack-workflow.mjs").includes("said.push(effectName.startsWith(labelled) ? effectName.slice(labelled.length) : effectName || rider.onCritical.label);"));
  {
    const AWF = read("module", "combat", "action-workflow.mjs");
    ok("L3 (3.696.2, live) a maneuver made with a shield's bash or a trait weapon names it in the check's title, not \"Unarmed attack check\"",
      AWF.includes('if (weapon) madeWith = weapon.type === "shield" ? `Shield Bash attack with ${weapon.name}` : `Attack check with ${weapon.name}`;')
      && AWF.includes("label: `${action.name} — ${madeWith || kind.label}`,"));
  }
  ok("CD6c the card names the shield", /if \(weapon\?\.type === "shield"\) modifiers\.push\(\{ label: `\$\{action\.name\} with \$\{weapon\.name\}'s Shield Bash/.test(read("module", "combat", "action-workflow.mjs")));
}

/* CD7 ------------------------------------------------------------------- */
{
  const api = await mod("module-api.mjs");
  api.registerDegreeUpgrades("Expert Autopsist QA", [{ actionKey: "performAutopsy", from: "fumble", to: "failure" }, { actionKey: "performAutopsy", degree: "critical", bonusValue: 4 }], "qa");
  const sf = await mod("skill-feats.mjs");
  equal("CD7a both shapes register: the upgrade still upgrades, the bonus is found at its degree only", [sf.shadowbornAgilityDegree("performAutopsy", "fumble", ["Expert Autopsist QA"]).degree, sf.degreeBonusFor("performAutopsy", "critical", ["Expert Autopsist QA"]), sf.degreeBonusFor("performAutopsy", "success", ["Expert Autopsist QA"]), sf.degreeBonusFor("performAutopsy", "critical", [])], ["failure", { value: 4, feat: "Expert Autopsist QA" }, null, null]);
  ok("CD7b the outcome's stated bonus takes the feat's value, and the card says so", /const raised = degreeBonusFor\(action\.key, degree, featNames\);\n\s*if \(raised && Math\.sign\(raised\.value\) === Math\.sign\(modifier\.value\)\) \{/.test(read("module", "combat", "action-workflow.mjs")));
}

/* CD9 ------------------------------------------------------------------- */
ok("CD9 every spell heal is announced, after the heal is written, with the PP and whether the target was Dying", /globalThis\.Hooks\?\.callAll\?\.\("trgPrimeSpellHealed", \{ caster, target, spell, healed, excess, dying: wasDying, ppSpent:/.test(read("module", "magic", "spell-effects.mjs")));

/* The blind cure step ---------------------------------------------------- */
{
  const cure = await mod("affliction-countered.mjs");
  equal("BL1 Mummy Rot's counteract is rolled blind; an ordinary disease's is not", [cure.cureIsOrdered({ type: "affliction", name: "Mummy Rot", flags: {} }), cure.cureIsOrdered({ type: "affliction", name: "Ghoul Fever", flags: {} })], [true, false]);
  ok("BL2 the counteract passes the blind mode to the check", /cureIsOrdered\(chosen\) \? \{ rollMode: BLIND_ROLL_MODE \} : \{\}/.test(read("module", "magic", "spell-effects.mjs")) && /\.\.\.\(rollMode \? \{ rollMode \} : \{\}\)/.test(read("module", "combat", "counteract-workflow.mjs")));
}

/* Z ---------------------------------------------------------------------- */
const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.696.0, and the download names it", [sys.version, JSON.parse(read("package.json")).version, sys.download.includes("/v3.704.1/")], ["3.704.1", "3.704.1", true]);

console.log(`verify-fixes-3696-0: ${checks} checks — ${failures.length ? `${failures.length} FAILED` : "all green."}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
