#!/usr/bin/env node
/**
 * verify-block8-core — TRG Prime 3.672.0: the seams Inner Tempest's Block 8
 * (the Grimoire) needs, from its audit's C1 to C10 and Graham's rulings
 * B8-1 to B8-9 of 26 October 2026.
 *
 *   C1  two ability scores' totals traded, through the bonus pool (Ability
 *       Inversion; B8-1)
 *   C2  a rider's condition save with a value per rung, at the caster's
 *       spell save DC when it names none (Acidic Touch; B8-2) — and a rider
 *       lasting "until removed" keeps doing so through its round trip
 *   C3  a projectile's own range-increment multiple (Arrows Flight; B8-3)
 *   C4  flank immunity from an applied effect (Boundless Vision)
 *   C5  a module's answer before a casting's check, and the casting's paid
 *       cost announced (Spiritual Distraction, Disrupt Soul; B8-4, B8-5)
 *   C6  a module's own mark on a spell's target, and a save rolled later
 *       rather than on casting (the same two)
 *   C7  a second Focus ability for Refocus, chosen with the first (Tranquil
 *       Mastery; B8-7)
 *   C8  whether a 10 would succeed, before the next d20 check; the GM asked
 *       when the DC is theirs; a skill action or Strike called back (Foretell
 *       Failure; B8-6)
 *   C9  the declared flags Flowing Step, Timeless Motion and Boundless Vision
 *       need
 *   C10 a spell attack's critical severity, and a row gated on it (Water
 *       Bolt's push, B8-9)
 *   C11 a caster's spell ended by its target's roll, through the GM when
 *       need be; a basic save's severity and the injury roll for a module
 *       (Spiritual Distraction's and Disrupt Soul's "the spell ends", Disrupt
 *       Soul's essence critical)
 *   C12 a DC bonus row's warp stops at its printed cap (Root, max +4)
 *   C13 a declared tick that grows with a bonus warp (Root's balance bonus)
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
const tp = (f, extra = {}) => ({ ...extra, flags: { "trg-prime": f } });

const se = read("module", "magic", "spell-effects.mjs");
const cw = read("module", "magic", "cast-workflow.mjs");
const aw = read("module", "combat", "attack-workflow.mjs");
const acw = read("module", "combat", "action-workflow.mjs");
const ck = read("module", "dice", "check.mjs");
const api = read("module", "module-api-workflow.mjs");
const srw = read("module", "magic", "strike-riders-workflow.mjs");
const kinds = await imp("magic/effect-kinds.mjs");
// ONE CASE OF THE APPLIER, cut at the next, so a check cannot borrow a
// neighbouring case's line.
const caseOf = (kind, next) => { const a = se.indexOf(`        case "${kind}": {`); const b = se.indexOf(`        case "${next}": {`, a + 1); return a > 0 && b > a ? se.slice(a, b) : ""; };
const swapCase = caseOf("abilitySwap", "moduleMark");
const markCase = caseOf("moduleMark", "marker");

/* C1 — Ability Inversion */
{
  const as = await imp("magic/ability-swap.mjs");
  const attrs = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { total: v }]));
  equal("C1 the highest and lowest totals, ties returned whole for the caster",
    as.abilitySwapCandidates(attrs({ strength: 4, dexterity: -1, constitution: 4, intelligence: 0, wisdom: 1, charisma: -1 })),
    { high: 4, low: -1, highKeys: ["strength", "constitution"], lowKeys: ["dexterity", "charisma"] });
  equal("C1 all equal, or nothing to read, is nothing to switch",
    [as.abilitySwapCandidates(attrs({ strength: 2, dexterity: 2, constitution: 2, intelligence: 2, wisdom: 2, charisma: 2 })), as.abilitySwapCandidates({})], [null, null]);
  equal("C1 the trade is two untyped CUSTOM entries of the gap, opposite signs",
    as.abilitySwapChanges("strength", "dexterity", 4, -1, "custom"),
    [{ key: "system.attributes.strength.untyped", type: "custom", value: "-5" }, { key: "system.attributes.dexterity.untyped", type: "custom", value: "5" }]);
  const reg = await imp("bonuses/registry.mjs");
  const [hi, lo] = as.abilitySwapChanges("strength", "dexterity", 4, -1, "custom");
  equal("C1 each key reaches the attribute's pool as an untyped entry",
    [reg.parseBonusKey(hi.key), reg.parseBonusKey(lo.key)],
    [{ target: "system.attributes.strength", type: "untyped" }, { target: "system.attributes.dexterity", type: "untyped" }]);
  const total = (slots, value) => reg.resolveBonuses({ slots, slotTypes: reg.TARGET_SLOTS.attribute, pool: [{ label: "Inversion", value, type: "untyped" }] }).total;
  equal("C1 THE TOTALS TRADE (B8-1): a +2 status Strength 4 and a −1 Dexterity land on −1 and 4, a later bonus on top",
    [total({ base: 2, status: 2 }, -5), total({ base: -1 }, 5), reg.resolveBonuses({ slots: { base: -1 }, slotTypes: reg.TARGET_SLOTS.attribute, pool: [{ label: "Inversion", value: 5, type: "untyped" }, { label: "Later", value: 1, type: "status" }] }).total],
    [-1, 4, 5]);
  ok("C1 a creature already switched is not switched again; a disabled one is",
    as.abilitySwapOn([tp({ abilitySwap: { high: "strength" } })]) && !as.abilitySwapOn([{ disabled: true, ...tp({ abilitySwap: { high: "strength" } }) }]) && !as.abilitySwapOn([]));
  ok("C1 the applier handles the kind, refuses a second, asks both ties, ends with the cast, and writes CUSTOM changes",
    kinds.HANDLED_EFFECT_KINDS.includes("abilitySwap")
    && /case "abilitySwap": \{[\s\S]*?if \(abilitySwapOn\(target\.effects, SYSTEM_ID\)\) \{[\s\S]*?const highKey = await chooseTiedAbility\(spell\.name, target\.name, found\.highKeys, "highest", found\.high\);\n\s*const lowKey = highKey \? await chooseTiedAbility\(spell\.name, target\.name, found\.lowKeys, "lowest", found\.low\) : "";[\s\S]*?if \(castId && registersCast\) flags\[SYSTEM_ID\]\.endsWithCast = true;[\s\S]*?changes: abilitySwapChanges\(highKey, lowKey, found\.high, found\.low, CHANGE_TYPE\.CUSTOM\),[\s\S]*?await createEffectsOn\(target, \[data\]\);/.test(swapCase));
}

/* C2 — a rider's save ladder */
{
  const sr = await imp("magic/strike-riders.mjs");
  equal("C2 a ladder names the failing rungs it answers; a bad value refuses it; none is null",
    [sr.normaliseRiderLadder({ failure: 1, fumble: 2, blunder: "2", success: 9 }), sr.normaliseRiderLadder({ failure: -1 }), sr.normaliseRiderLadder({}), sr.normaliseRiderLadder(null)],
    [{ failure: 1, fumble: 2, blunder: 2 }, null, null, null]);
  const acid = sr.normaliseStrikeRider({ label: "Acidic Touch", condition: "sickened", scope: "melee", once: false, conditionRounds: 0,
    conditionSave: { save: "fortitude", dc: 22, ladder: { failure: 1, fumble: 2, blunder: 2 } } });
  equal("C2 the rung picks the value; a rung the ladder leaves out takes nothing (IT-m24's Partial)",
    ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"].map((d) => sr.riderLadderValue(acid, d)), [0, 0, 0, 0, 1, 2, 2]);
  const tangle = sr.normaliseStrikeRider({ label: "Tangleweed", condition: "slowed", conditionValue: 1, conditionSave: { save: "reflex", dc: 15 } });
  equal("C2 without a ladder the old rule stands: any failing degree takes the rider's value",
    ["success", "partial", "failure", "blunder"].map((d) => sr.riderLadderValue(tangle, d)), [0, 1, 1, 1]);
  ok("C2 THE ROUND TRIP: the stored rider normalises to itself, \"until removed\" kept (Rose of Thorns' Bleeding too)",
    JSON.stringify(sr.normaliseStrikeRider(acid)) === JSON.stringify(acid) && acid.conditionRounds === null
    && sr.normaliseStrikeRider({ label: "R", condition: "bleeding", conditionValue: 2, conditionRounds: null }).conditionRounds === null
    && sr.normaliseStrikeRider({ label: "S", condition: "weakened" }).conditionRounds === undefined);
  equal("C2 the cast card names every rung", sr.riderCastLine(acid),
    "each creature a melee Strike hits saves Fortitude DC 22: <strong>sickened 1 on a Failure, 2 on a Fumble, 2 on a Blunder</strong>");
  ok("C2 the Strike reads the degree's value, says an untouched rung, and applies that value",
    /value = riderLadderValue\(spec, key\);\n\s*if \(!value\) \{\n\s*lines\.push\(`\$\{targetActor\.name\} is unaffected by \$\{spec\.label\}/.test(srw)
    && /value: cond\.valued \? value : null/.test(srw));
  ok("C2 a rider that names no DC takes the caster's spell save DC (B8-2), and a level DC still wins",
    /: effect\.conditionSave && !Number\(effect\.conditionSave\.dc\) && Number\(saveDC \?\? rollData\?\.saveDC \?\? 0\) > 0\n\s*\? \{ \.\.\.effect\.conditionSave, dc: Number\(saveDC \?\? rollData\?\.saveDC\) \}/.test(se)
    && se.indexOf("effect.conditionSave.dcLevel !== undefined\n            ? {") < se.indexOf(": effect.conditionSave && !Number(effect.conditionSave.dc) && Number(saveDC"));
}

/* C3 — a projectile's multiple */
{
  const am = await imp("combat/ammunition.mjs");
  const arrow = (raw) => tp({ rangeIncrementMultiplier: raw });
  equal("C3 the multiple doubles the increment after the round's own feet; none changes nothing",
    [am.effectiveRangeIncrement({ rangeIncrement: 60 }, { rangeIncrementBonus: 10 }, { multiplier: 2 }), am.effectiveRangeIncrement({ rangeIncrement: 60 }, { rangeIncrementBonus: 10 }), am.effectiveRangeIncrement({ traits: "Thrown 20" }, null, { multiplier: 2 })],
    [140, 70, 40]);
  equal("C3 the round is the projectile when loaded, else the thrown weapon; a timed multiple ends by itself; nonsense is 1",
    [am.rangeIncrementMultiplierOf(arrow(9), arrow(2)), am.rangeIncrementMultiplierOf(arrow(2), null), am.rangeIncrementMultiplierOf({}, null),
      am.rangeIncrementMultiplierOf(null, arrow({ value: 2, expiresAt: 600 }), 599), am.rangeIncrementMultiplierOf(null, arrow({ value: 2, expiresAt: 600 }), 600),
      am.rangeIncrementMultiplierOf(null, arrow("x")), am.rangeIncrementMultiplierOf(null, arrow(-2))],
    [2, 2, 1, 2, 1, 1, 1]);
  ok("C3 every increment the Strike and its damage read carries the projectile's multiple (range bands, first increment, Point Blank Shot, Penetrating)",
    (aw.match(/effectiveRangeIncrement\(weaponData, ammo(System)?, \{\s*multiplier: rangeIncrementMultiplierOf\(weapon, (ammo|ammo\?\.parent \?\? null), Number\(game\.time\?\.worldTime \?\? 0\)\)\s*\}\)/g) ?? []).length === 4
    && !/effectiveRangeIncrement\(weaponData, ammo(System)?\)/.test(aw));
}

/* C4 — flank immunity from an effect */
{
  const ca = await imp("creature-ability-rules.mjs");
  const bv = tp({ creatureAbility: { derives: { cannotBeFlanked: true } } });
  equal("C4 an item or an applied effect gives it; a disabled effect does not",
    [ca.abilitiesPreventFlanking([bv], []), ca.abilitiesPreventFlanking([], [bv]), ca.abilitiesPreventFlanking([], [{ ...bv, disabled: true }]), ca.abilitiesPreventFlanking([], [])],
    [true, true, false, false]);
  ok("C4 the Strike asks the target's applied effects",
    /abilitiesPreventFlanking\(Array\.from\(targetActor\.items \?\? \[\]\), Array\.from\(targetActor\.appliedEffects \?\? targetActor\.effects \?\? \[\]\)\)/.test(aw));
}

/* C5 — the spell-check gate and the settled cast */
{
  const mapi = await imp("module-api.mjs");
  const gates = await imp("magic/spell-check-gates.mjs");
  mapi.resetModuleRegistry();
  ok("C5 a gate needs a function", mapi.registerSpellCheckGate("x", 1) === false && mapi.registerSpellCheckGate("Spiritual Distraction", async () => null, "verify-block8-core") === true && mapi.registeredSpellCheckGates().length === 1);
  equal("C5 a gate's answer is cleaned: rows with a label and a value, a known type or untyped; string lines",
    gates.normaliseGateAnswer({ modifiers: [{ label: "Spiritual Distraction", value: -4, type: "circumstance" }, { label: "", value: 2 }, { label: "zero", value: 0 }, { label: "odd", value: 1, type: "weird" }], lines: ["said", 3, " "] }),
    { modifiers: [{ label: "Spiritual Distraction", value: -4, type: "circumstance" }, { label: "odd", value: 1, type: "untyped" }], lines: ["said"] });
  mapi.resetModuleRegistry();
  const seen = [];
  mapi.registerSpellCheckGate("a", async (ctx) => { seen.push(ctx.spell.name); return { modifiers: [{ label: "A", value: -2, type: "circumstance" }], lines: ["A said"] }; });
  mapi.registerSpellCheckGate("b", async () => { throw new Error("boom"); });
  mapi.registerSpellCheckGate("c", async () => ({ modifiers: [{ label: "C", value: -10, type: "circumstance" }] }));
  const quiet = console.error; console.error = () => {};
  const out = await gates.runSpellCheckGates({ spell: { name: "Bolt" } });
  console.error = quiet;
  equal("C5 every gate is asked in order; a failing one costs only its own answer, and says so",
    [seen, out.modifiers.map((m) => m.value), out.lines.length, /failed/.test(out.lines[1] ?? "")], [["Bolt"], [-2, -10], 2, true]);
  mapi.resetModuleRegistry();
  ok("C5 the API offers it", /registerSpellCheckGate: \(key, gate, moduleId\) => registerSpellCheckGate\(key, gate, moduleId\)/.test(api));
  const drainAt = cw.indexOf("  const drain = pendingSpellDrain(actor);");
  const gateAt = cw.indexOf("  const gated = await runSpellCheckGates({");
  const rollAt = cw.indexOf("  const check = noCheckCantrip\n");
  ok("C5 THE GATE: asked after the drain and before the check, its rows join the casting check, an innate attack and an item attack",
    drainAt > 0 && gateAt > drainAt && rollAt > gateAt && /\n  modifiers\.push\(\.\.\.gated\.modifiers\);/.test(cw)
    && /\]\), \.\.\.gated\.modifiers\]\n\s*\}\)\)/.test(cw) && /\/\/ A MODULE'S ANSWER \(3\.672\.0\): this roll is the casting's check\.\n\s*\.\.\.gated\.modifiers\n/.test(cw)
    && /rollsCheck: !noCheckCantrip && !ritual\?\.check && \(isItemCast \? \(isAttack && !itemCheck\) : isInnate \? isAttack : true\)/.test(cw));
  ok("C5 its lines reach the card", /const gateLines = gated\.lines\.map\(\(text\) => line\(text\)\);/.test(cw) && /const lines = \[\.\.\.reagentLines, \.\.\.gateLines\];/.test(cw));
  const payAt = cw.indexOf("      \"system.resources.pp.value\": Math.max(0, ppPool - casterPPSpent)");
  const refundAt = cw.indexOf("            castRefunded = true;");
  const settledAt = cw.indexOf("  Hooks.callAll(\"trgPrimeSpellSettled\", {");
  ok("C5 THE SETTLED CAST: announced last — after the charge and after the last refund (review) — with the PP actually spent (B8-5), whether refunded or innate, the level and the warps",
    payAt > 0 && refundAt > payAt && settledAt > refundAt && settledAt < cw.indexOf("  return { ...outcome, ppSpent, check, spellSave, refunded: castRefunded, warpMods };")
    && /Hooks\.callAll\("trgPrimeSpellSettled", \{\n\s*actor, spell, spellData, degree,\n\s*cast: Boolean\(outcome\.cast\),\n\s*ppSpent,\n\s*refunded: Boolean\(castRefunded\),\n\s*innate: Boolean\(isInnate\),\n\s*itemCast: Boolean\(isItemCast\),\n\s*level: characterLevel,\n(?:\s*\/\/[^\n]*\n)*\s*warpMods\n\s*\}\);/.test(cw));
}

/* C6 — a module's mark */
{
  const mm = await imp("magic/module-mark.mjs");
  equal("C6 a module's namespace and a key; the system's own, core's, or a bad key refused",
    [mm.normaliseModuleMark({ kind: "moduleMark", module: "trg-inner-tempest", key: "spiritualDistraction", label: "Spiritual Distraction" }),
      mm.normaliseModuleMark({ kind: "moduleMark", module: "trg-prime", key: "x" }), mm.normaliseModuleMark({ kind: "moduleMark", module: "core", key: "x" }),
      mm.normaliseModuleMark({ kind: "moduleMark", module: "trg-inner-tempest", key: "1x" })],
    [{ module: "trg-inner-tempest", key: "spiritualDistraction", label: "Spiritual Distraction" }, null, null, null]);
  equal("C6 the record: who cast it, at what level, and the DC it was cast at (B8-4)",
    mm.moduleMarkRecord({ caster: { uuid: "Actor.a", name: "Ana" }, level: 7, casterLevel: 7, dc: 24, castId: "c1", spell: { uuid: "Item.s", name: "Spiritual Distraction" } }),
    { casterUuid: "Actor.a", casterName: "Ana", level: 7, casterLevel: 7, dc: 24, castId: "c1", spellUuid: "Item.s", spellName: "Spiritual Distraction" });
  const marked = { flags: { "trg-inner-tempest": { disruptSoul: { dc: 30 } } } };
  const spec = { module: "trg-inner-tempest", key: "disruptSoul" };
  equal("C6 the mark is found; a disabled one is not; another key is not",
    [mm.moduleMarkOn([marked], spec), mm.moduleMarkOn([{ ...marked, disabled: true }], spec), mm.moduleMarkOn([marked], { ...spec, key: "other" })],
    [true, false, false]);
  ok("C6 the applier handles it: refuses a second, stamps the cast's DC, writes under the module, ends with the cast",
    kinds.HANDLED_EFFECT_KINDS.includes("moduleMark")
    && /case "moduleMark": \{[\s\S]*?if \(moduleMarkOn\(target\.effects, spec\)\) \{[\s\S]*?dc: Number\(saveDC \?\? rollData\?\.saveDC \?\? 0\) \|\| null[\s\S]*?const flags = \{ \[spec\.module\]: \{ \[spec\.key\]: record \}, \[SYSTEM_ID\]: \{ moduleMark: `\$\{spec\.module\}\.\$\{spec\.key\}` \} \};[\s\S]*?if \(castId && registersCast\) flags\[SYSTEM_ID\]\.endsWithCast = true;[\s\S]*?await createEffectsOn\(target, \[data\]\);/.test(markCase));
  const sanc = await imp("magic/sanctuary.mjs");
  equal("C6 A SAVE ROLLED LATER: a row saying `saveAtCast: false` keeps the cast from rolling it; the others are unchanged",
    [sanc.spellDefersItsSave([{ kind: "moduleMark", saveAtCast: false }]), sanc.spellDefersItsSave([{ kind: "strikeRider", saveAtCast: false }]), sanc.spellDefersItsSave([{ kind: "moduleMark" }]), sanc.spellDefersItsSave([{ kind: "sanctuary" }])],
    [true, true, false, true]);
  ok("C6 the card says the save waits", /\$\{spellDefersItsSave\(spellData\.effects\) \? " — rolled later, not on casting" : ""\}/.test(cw));
}

/* C7 — Tranquil Mastery */
{
  const rf = await imp("combat/refocus.mjs");
  equal("C7 declared on an item or an applied effect; a disabled effect does not",
    [rf.refocusExtraDeclared([tp({ refocusExtra: true })], []), rf.refocusExtraDeclared([], [tp({ refocusExtra: true })]), rf.refocusExtraDeclared([], [{ ...tp({ refocusExtra: true }), disabled: true }]), rf.refocusExtraDeclared([], [tp({ refocusExtra: "yes" })])],
    [true, true, false, false]);
  equal("C7 the second is any other spent ability; only a success touches it",
    [rf.refocusSecondCandidates([{ id: "a" }, { id: "b" }, { id: "c" }], "b").map((i) => i.id), ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"].map(rf.refocusSecondApplies)],
    [["a", "c"], [true, true, true, false, false, false, false]]);
  const pickAt = acw.indexOf("    refocusSecond = await chooseRefocusSecond(actor, refocusTarget, { event });");
  ok("C7 CHOSEN WITH THE FIRST, BEFORE THE ROLL (B8-7), and applied on the first's timing",
    pickAt > acw.indexOf("    refocusTarget = pick.item;") && pickAt < acw.indexOf("situational = await promptCheckConfiguration({")
    && /const secondLine = await applyRefocusSecond\(refocusSecond, degree, \{ inCombat: Boolean\(actor\.inCombat\) \}\);\n\s*if \(secondLine\) lines\.push\(line\(secondLine\)\);/.test(acw));
  ok("C7 closing the picker chooses none (review)", /if \(picked === null \|\| picked === undefined \|\| picked === ""\) return null;\n\s*const index = Number\(picked\);/.test(read("module", "combat", "refocus-workflow.mjs")));
  ok("C7 it survives a DC the GM sets later",
    /refocusSecondId: ctx\.refocusSecond\?\.id \?\? null/.test(acw) && /refocusSecond: item\(stored\?\.refocusSecondId\)/.test(acw) && /\n    refocusSecond,\n    dispelSetup,/.test(acw) && /\n    refocusSecond = null,\n/.test(acw));
}

/* C8 — Foretell Failure */
{
  const ft = await imp("dice/foretell.mjs");
  const actor = { name: "A" };
  equal("C8 the next d20 check of an action or a save; not flat, percentile, thrown dice, a declared degree, initiative or Luck",
    [ft.foretellApplies({ actor, type: "skill" }), ft.foretellApplies({ actor, type: "save" }), ft.foretellApplies({ actor, type: "attack" }),
      ft.foretellApplies({ actor, flat: true }), ft.foretellApplies({ actor, die: "d100" }), ft.foretellApplies({ actor, presetDice: {} }),
      ft.foretellApplies({ actor, declaredDegree: "success" }), ft.foretellApplies({ actor, type: "initiative" }), ft.foretellApplies({ type: "skill" })],
    [true, true, true, false, false, false, false, false, false]);
  const mods = [{ label: "a", value: 3, type: "status" }, { label: "b", value: 2, type: "status" }, { label: "c", value: 2, type: "untyped" }];
  equal("C8 THE ROLL'S OWN SUM with a 10: stacked as the roll stacks it (two status bonuses give the higher)",
    [ft.foretellVerdict({ dc: 15, modifiers: mods }), ft.foretellVerdict({ dc: 16, modifiers: mods })],
    [{ known: true, succeeds: true, total: 15, dc: 15 }, { known: true, succeeds: false, total: 15, dc: 16 }]);
  equal("C8 a DC not yet set is unknown (the GM's, B8-6); a routine check's is not",
    [ft.foretellVerdict({ dc: null, modifiers: mods }), ft.foretellVerdict({ dc: null, difficulty: "routine", modifiers: [] }).succeeds],
    [{ known: false, succeeds: null, total: 15, dc: null }, true]);
  ok("C8 the card says what it must", /must be taken/.test(ft.foretellLine("Foretell Failure", { succeeds: true, total: 15, dc: 15 })) && /<strong>not<\/strong> succeed/.test(ft.foretellLine("", { succeeds: false, total: 9, dc: 15 })));
  const fAt = ck.indexOf("      await answerForetell(check, { withdrawable: false });");
  ok("C8 TOLD AT THE ROLL, never called back there: after the check's own rows, before Luck; the roll does not return null for it (review)",
    fAt > ck.indexOf("const auto = pendingModifierRows(check.actor)") && fAt < ck.indexOf("const said = await applyLuckToCheck(check, { requested: check.useLuck });")
    && !/answer === "withdraw"\) return null/.test(ck) && !/withdrawable: config/.test(ck));
  const fw = read("module", "dice", "foretell-workflow.mjs");
  ok("C8 a DC that is the GM's goes to the GM through Foundry's user query, only when the answer can change something; spent either way",
    /return Boolean\(await gm\.query\(FORETELL_QUERY, payload, \{ timeout: 5 \* 60 \* 1000 \}\)\);/.test(fw)
    && /if \(!verdict\.known && !withdrawable\) \{\n\s*await effectGone\(effect, spellName, check\);/.test(fw)
    && fw.indexOf("if (!verdict.known && !withdrawable)") < fw.indexOf("const succeeds = await gmAnswer(")
    && /registerForetellQuery\(\);/.test(read("scripts", "trg-prime.mjs")));
  equal("C8 a forced failure is no success (an Immobilised Reflex save, review)", [ft.foretellVerdict({ dc: 5, modifiers: mods }, { forcedFailure: true }).succeeds, ft.foretellVerdict({ dc: 5, modifiers: mods }).succeeds], [false, true]);
  const commitAt = acw.indexOf("  // The same gate the cast path takes (3.311.3): refused by default when");
  const askAt = acw.indexOf("    const answer = await answerForetell(preview, { withdrawable: true });");
  ok("C8 A SKILL ACTION ASKS BEFORE IT SPENDS ANYTHING (review): from a preview of its own roll, before the AP, a prepared reaction, Born to Ride, a trait's use, a curse's bite, Sanctuary or a tool; a different action costs nothing",
    askAt > 0 && askAt < commitAt && commitAt < acw.indexOf("    await actor.setFlag(SYSTEM_ID, \"bornToRideUsed\", true);")
    && acw.indexOf("await biteOffensiveCurses(actor, action);", askAt) > commitAt && acw.indexOf("await spendToolUse(actor, action.key);", askAt) > commitAt
    && acw.indexOf("await biteOffensiveCurses(actor, action);", askAt) < acw.indexOf("  const check = await TRGCheck.roll({ pendingOutcome, ...rollConfig });")
    && /const preview = await TRGCheck\.preview\(\{ pendingOutcome: null, \.\.\.rollConfig \}\);/.test(acw)
    && /if \(answer === "withdraw"\) \{\n\s*await postCard\(actor, action\.name, \[line\(`<em>\$\{actor\.name\} takes a different action instead — nothing was spent\.<\/em>`\)\]\);\n\s*return null;/.test(acw)
    && /const check = await TRGCheck\.roll\(\{ pendingOutcome, \.\.\.rollConfig \}\);/.test(acw)
    && /const foretellAsked = !presetDice && !exactFirst && !defersApCost\n/.test(acw));
  ok("C8 the preview IS the roll, stopped before its first spend: no one-shot deleted, no tick asked, no pending row consumed, nothing told or rolled",
    /static async preview\(config = \{\}\) \{\n\s*return TRGCheck\.roll\(\{ \.\.\.config, previewOnly: true \}\);/.test(ck)
    && /this\.previewOnly = config\.previewOnly === true;/.test(ck)
    && ck.includes("for (const { sourceId, label } of check.previewOnly ? [] : (applied.spent ?? [])) {")
    && ck.includes("if (!check.previewOnly) await offerConditionalsOnRoll(check, entries, conditionalContext, BIAS);")
    && ck.includes("if (taken.consume.length && !check.previewOnly) await consumePendingModifiers(check.actor, taken.consume);")
    && ck.indexOf("    if (check.previewOnly) return check;") > ck.indexOf("if (taken.consume.length && !check.previewOnly)")
    && ck.indexOf("    if (check.previewOnly) return check;") < ck.indexOf("      await answerForetell(check, { withdrawable: false });"));
  ok("C8 a Strike is told, not asked: its roll is the plain one", /\n  let check = await TRGCheck\.roll\(attackCheckConfig\);\n/.test(aw) && !/withdrawable/.test(aw));
}

/* C9 — the declared flags */
{
  const de = await imp("magic/declared-effect.mjs");
  const d = (flags) => de.normaliseDeclaredEffect({ label: "X", flags });
  equal("C9 Flowing Step's terrain, Timeless Motion's first move, Foretell, Tranquil Mastery: a plain true, nothing else",
    [d({ ignoresDifficultTerrain: true })?.flags, d({ ignoresDifficultTerrain: ["stride"] }), d({ firstMoveNoReactions: true })?.flags, d({ foretell: true })?.flags, d({ refocusExtra: 1 })],
    [{ ignoresDifficultTerrain: true }, null, { firstMoveNoReactions: true }, { foretell: true }, null]);
  equal("C9 Boundless Vision's flank immunity: the two derives an effect is read for, true only",
    [d({ creatureAbility: { derives: { cannotBeFlanked: true } } })?.flags, d({ creatureAbility: { derives: { hover: true } } }), d({ creatureAbility: { derives: {} } }), d({ creatureAbility: { derives: { cannotBeFlanked: 1 } } })],
    [{ creatureAbility: { derives: { cannotBeFlanked: true } } }, null, null, null]);
  const pf = await imp("combat/passive-feats.mjs");
  const ca = await imp("creature-ability-rules.mjs");
  const data = (flags) => de.declaredEffectData(d(flags), "trg-prime", "add");
  const carrying = (flags) => ({ items: [], appliedEffects: [{ name: "Flowing Step", ...data(flags) }] });
  equal("C9 each reaches the rail that reads it (the terrain, the first move, the flank)",
    [pf.terrainReliefName(carrying({ ignoresDifficultTerrain: true })), pf.declaresFirstMoveNoReactions(carrying({ firstMoveNoReactions: true })),
      ca.abilitiesPreventFlanking([], carrying({ creatureAbility: { derives: { cannotBeFlanked: true } } }).appliedEffects)],
    ["X", true, true]);
  ok("C9 the cast card says each", /formidable terrain counts as difficult/.test(de.declaredCastLine(d({ ignoresDifficultTerrain: true }))) && /cannot be flanked/.test(de.declaredCastLine(d({ creatureAbility: { derives: { cannotBeFlanked: true } } })))
    && /a 10 on the die/.test(de.declaredCastLine(d({ foretell: true }))) && /second expended Focus ability/.test(de.declaredCastLine(d({ refocusExtra: true }))) && /provokes no reactions/.test(de.declaredCastLine(d({ firstMoveNoReactions: true }))));
}

/* C10 — critical severity */
{
  const ad = await imp("magic/attack-degree-rows.mjs");
  const a = { n: 1 }, b = { n: 2 }, c = { n: 3 }, e = { n: 4 };
  const results = [{ target: a, critical: true, severity: "minor" }, { target: b, critical: true, severity: "deadly" }, { target: c, critical: false }, { target: e, critical: true, severity: null }];
  equal("C10 a floor on the critical: serious or deadly only; an unknown severity does not clear it; a hit row is untouched",
    [ad.attackRowRecipients({ onAttack: ["critical"], minCriticalSeverity: "serious" }, [a, b, c, e], results).map((x) => x.n),
      ad.attackRowRecipients({ onAttack: ["critical"] }, [a, b, c, e], results).map((x) => x.n),
      ad.attackRowRecipients({ onAttack: ["hit"], minCriticalSeverity: "serious" }, [a, b, c, e], results).map((x) => x.n)],
    [[2], [1, 2, 4], [3]]);
  equal("C10 an unknown word is no floor", [ad.minimumSeverity({ minCriticalSeverity: "Serious" }), ad.minimumSeverity({ minCriticalSeverity: "huge" }), ad.minimumSeverity({})], ["serious", "", ""]);
  ok("C10 the cast hands each struck target its severity",
    /\.map\(\(r\) => \(\{ target: r\?\.targetActor \?\? null, critical: Boolean\(r\?\.critical\), severity: r\?\.critical\?\.severity \?\? null \}\)\)/.test(cw));
}

/* C11 — a caster's spell ended by its target's roll (found building Block 8) */
{
  const tr = await imp("combat/target-relay.mjs");
  const calls = [];
  const deps = { fromUuid: async (uuid) => (uuid === "Actor.caster" ? { uuid } : null), endSpell: async (target, castId) => { calls.push([target.uuid, castId]); return { id: castId }; } };
  const said = await tr.performRelay(tr.buildRelayRequest({ action: tr.RELAY_ACTIONS.END_SPELL, uuid: "Actor.caster", userId: "u", requestId: "r", payload: { castId: "cast1" } }), deps);
  equal("C11 the GM's client ends the CASTER's registered cast by its id, and says whether it was there",
    [tr.RELAY_ACTIONS.END_SPELL, said, calls], ["target.endSpell", { ok: true, result: true }, [["Actor.caster", "cast1"]]]);
  const trw = read("module", "combat", "target-relay-workflow.mjs");
  ok("C11 directly when this client owns the caster (not a dismissal), through the GM otherwise",
    /export async function relayEndSpell\(caster, castId\) \{[\s\S]*?if \(!needsRelay\(caster\)\) \{[\s\S]*?endActiveSpell\(caster, id, \{ dismissed: false \}\)[\s\S]*?return ask\(RELAY_ACTIONS\.END_SPELL, caster, \{ castId: id \}\);/.test(trw)
    && /endSpell: async \(caster, castId\) => \{\n\s*const \{ endActiveSpell \} = await import\("\.\.\/magic\/active-spells\.mjs"\);\n\s*return endActiveSpell\(caster, castId, \{ dismissed: false \}\);/.test(trw));
  ok("C11 a module may end it, read a basic save's severity, and roll the injury",
    /endSpellOf: async \(caster, castId\) => \(await import\("\.\/combat\/target-relay-workflow\.mjs"\)\)\.relayEndSpell\(caster, castId\),/.test(api)
    && /basicSaveSeverity: async \(degree, margin\) => \(await import\("\.\/dice\/resolution\.mjs"\)\)\.basicSavingThrow\(degree, margin\)\.criticalSeverity \?\? null,/.test(api)
    && /rollCriticalInjury: async \(\.\.\.args\) => \(await import\("\.\/combat\/attack-workflow\.mjs"\)\)\.rollCriticalInjury\(\.\.\.args\),/.test(api));
}

/* C12 — a DC bonus row's warp cap (Root, found building Block 8) */
{
  const sfx = await imp("magic/spell-effects.mjs");
  equal("C12 +2 with two +1 warps reaches +4; a third stops there; no cap adds all; a row at its cap takes none",
    [sfx.defenceDCWarpExtra(2, 2, 4), sfx.defenceDCWarpExtra(2, 3, 4), sfx.defenceDCWarpExtra(2, 3, null), sfx.defenceDCWarpExtra(4, 1, 4)], [2, 2, 3, 0]);
  ok("C12 Root's +1 a PP stops at +4: what a warp adds counts the cap; none uncapped as before",
    se.includes("const built = defenceDCRowFrom(effect, spell.name, defenceDCWarpExtra(effect.value, warpBonus, warpBonusMax));")
    && /export function defenceDCWarpExtra\(value, warpBonus = 0, warpBonusMax = null\) \{\n\s*const extra = Math\.max\(0, Number\(warpBonus\) \|\| 0\);\n\s*if \(warpBonusMax === null \|\| warpBonusMax === undefined\) return extra;\n\s*return Math\.max\(0, Math\.min\(extra, Math\.abs\(Number\(warpBonusMax\) \|\| 0\) - Math\.abs\(Number\(value\) \|\| 0\)\)\);/.test(se));
}

/* C13 — a declared tick that grows with a bonus warp (Root's balance) */
{
  const sfx = await imp("magic/spell-effects.mjs");
  const rows = [{ kind: "modifier", value: 2, warpBonus: true, label: "Root" }, { kind: "modifier", value: 2, label: "Other" }];
  equal("C13 only a row marked `warpBonus` grows, to its cap; none bought changes nothing",
    [sfx.declaredConditionalsWarped(rows, 3, 4).map((r) => r.value), sfx.declaredConditionalsWarped(rows, 1, 4).map((r) => r.value), sfx.declaredConditionalsWarped(rows, 0, null).map((r) => r.value)],
    [[4, 2], [3, 2], [2, 2]]);
  ok("C13 the declare row grows them before the effect is written",
    /if \(Array\.isArray\(spec\.flags\.conditionals\) && warpBonus\) \{\n\s*spec\.flags\.conditionals = declaredConditionalsWarped\(spec\.flags\.conditionals, warpBonus, warpBonusMax\);\n\s*\}/.test(se)
    && se.indexOf("spec.flags.conditionals = declaredConditionalsWarped(") < se.indexOf("const data = declaredEffectData(spec, SYSTEM_ID, CHANGE_TYPE.ADD);"));
}

// 3.672.0 OR LATER: a later release keeps these seams.
{
  const [ma, mi] = String(JSON.parse(read("system.json")).version).split(".").map(Number);
  ok("Z0 the system is 3.672.0 or later", ma > 3 || (ma === 3 && mi >= 672));
}

const EXPECTED = 63;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-block8-core: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-block8-core: ${checks} checks — all green.`);
