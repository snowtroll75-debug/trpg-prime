#!/usr/bin/env node
/**
 * verify-item-mechanisms-3626 — what an item may declare beyond a rune
 * (3.626.0): a healing rider on a worn or held item (Hands of Mercy, a
 * rod's extra die), a wondrous `use` ability run by a registered
 * automation and a Focus frequency, an ability requiring a trait or a
 * feat, a rod naming actions or buying a bonus, a consumable with a
 * choice of effects or a required trait, and a Focus innate grant.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const api = await import(new URL("../module/module-api.mjs", import.meta.url));
const heal = await import(new URL("../module/magic/healing-riders.mjs", import.meta.url));
const wuse = await import(new URL("../module/wondrous-use.mjs", import.meta.url));
const weff = await import(new URL("../module/wondrous-effects.mjs", import.meta.url));
const rods = await import(new URL("../module/rod-powers.mjs", import.meta.url));
const cons = await import(new URL("../module/consumable-use.mjs", import.meta.url));
const freq = await import(new URL("../module/rune-spell-effect.mjs", import.meta.url));
api.resetModuleRegistry();

/* A. Item healing riders */
const gloves = { id: "g", name: "Hands of Mercy", type: "gear", system: { invested: true, equipped: true }, flags: { "trg-prime": { wondrous: { abilities: [] }, healingRider: { label: "Steady Gift", maximiseDice: 1, frequency: "daily", maximiseDiceWith: { feat: "Lifebinder", dice: 2 } } } } };
const rod = { id: "r", name: "Rod of Merciful Channeling", type: "gear", system: { equipped: true, uses: 10 }, flags: { "trg-prime": { chargedItem: { kind: "rod", maximumPP: 10 }, healingRider: { label: "Rod of Merciful Channeling", extraDice: "1d8", oneTarget: true, ppCost: 1 } } } };
const read1 = heal.itemHealingRiders([gloves, rod]);
equal("A1 a worn, invested pair of gloves and a held rod each read; the gloves maximise one die daily, the rod adds 1d8 to one creature for 1 PP", read1.map((r) => [r.id, r.maximiseDice, r.extraDice, r.ppCost, r.frequency, r.oneTarget]), [["item:g", 1, "", 0, "daily", true], ["item:r", 0, "1d8", 1, "atWill", true]]);
equal("A2 the Lifebinder reading: two dice", heal.itemHealingRiders([gloves], { featNames: ["Lifebinder"] })[0].maximiseDice, 2);
equal("A3 an uninvested pair, or a rod not in hand, reads nothing", [heal.itemHealingRiders([{ ...gloves, system: { invested: false, equipped: true } }]).length, heal.itemHealingRiders([{ ...rod, system: { equipped: false } }]).length], [0, 0]);
equal("A4 maximiseDice walks the dice one at a time and stops when none are left", [heal.maximiseDice("3d6+6", 2), heal.maximiseDice("1d8", 3), heal.maximiseDice("10", 1)], ["1d6 + 6 + 6+6", "8", "10"]);
ok("A5 a daily rider spent today is not offered; the rod always is", !heal.itemRiderAvailable({ frequency: "daily", usedToday: true }) && heal.itemRiderAvailable({ frequency: "daily", usedToday: false }) && heal.itemRiderAvailable({ frequency: "atWill", usedToday: true }));
equal("A6 the used-today marker is read off the item's day map", heal.itemHealingRiders([{ ...gloves, flags: { "trg-prime": { ...gloves.flags["trg-prime"], runeUsedToday: { healingRider: true } } } }])[0].usedToday, true);

/* B. Wondrous use kinds and restrictions */
const locket = { id: "l", name: "Ancestor's Locket", type: "gear", system: { invested: true, equipped: true }, flags: { "trg-prime": { wondrous: { abilities: [{ kind: "use", automation: "pastLifeInsight", activation: "Free (0 AP)", frequency: "daily", label: "Past-Life Insight" }] } } } };
equal("B1 a `use` ability is the item's use", [wuse.wondrousUseOf(locket)?.automation, wuse.wondrousUseLabel(locket)], ["pastLifeInsight", "Past-Life Insight (Free (0 AP), 1/day)"]);
equal("B2 labels and refusals: packed, used today, a Focus one expended", [
  wuse.wondrousUseLabel({ ...locket, system: { invested: false, equipped: false } }),
  wuse.wondrousUseRefusal({ ...locket, flags: { "trg-prime": { ...locket.flags["trg-prime"], wondrousUsedToday: true } } }).ok,
  wuse.wondrousUseRefusal({ ...locket, flags: { "trg-prime": { wondrous: { abilities: [{ kind: "use", automation: "x", frequency: "focus", label: "Open the Lantern", activation: "Engage (1 AP)" }] }, wondrousFocusExpended: true } } }).reason
], ["Past-Life Insight: invest and wear it to use (Free (0 AP), 1/day)", false, "is expended — Refocus restores it"]);
ok("B3 an ability requiring a trait or a feat applies only to a creature with it", weff.abilityApplies({ requiresTrait: "unliving" }, { traits: "undead, unliving" }) && !weff.abilityApplies({ requiresTrait: "unliving" }, { traits: "humanoid" }) && weff.abilityApplies({ requiresFeat: "Recite from the Text" }, { featNames: ["Recite from the Text"] }) && !weff.abilityApplies({ requiresFeat: "Recite from the Text" }, { featNames: [] }));
ok("B4 registerItemAutomation keeps a { hint, use } under the name; a spec without use is refused", api.registerItemAutomation("pastLifeInsight", { hint: "h", use: async () => true }, "pof") && typeof api.registeredItemAutomation("PastLifeInsight")?.use === "function" && !api.registerItemAutomation("bad", {}, "pof"));
equal("B5 the Focus frequency is one use a day, flagged focus", [freq.frequencyFor("focus").usesPerDay, freq.frequencyFor("focus").focus, freq.frequencyFor("Focus").key], ["1", true, "focus"]);

/* C. Rods */
const recall = { id: "s", name: "Rod of Scholarly Recall", system: { equipped: true, uses: 10, hp: { max: 0, value: 0 } }, flags: { "trg-prime": { chargedItem: { kind: "rod", maximumPP: 10, checkAdvantage: { actions: ["recallKnowledge", "identifyPower", "analyseScripture", "recogniseDoctrine", "traceReligiousProvenance"], cost: 2 } } } } };
ok("C1 a rod naming actions answers the action, not the skill", rods.advantageRodFor([recall], "religion", { actionKey: "recallKnowledge" })?.cost === 2 && rods.advantageRodFor([recall], "religion", { actionKey: "" }) === null && rods.advantageRodFor([recall], "perception", { actionKey: "search" }) === null);
const intercession = { id: "i", name: "Rod of Intercession", system: { equipped: true, uses: 10, hp: { max: 0, value: 0 } }, flags: { "trg-prime": { chargedItem: { kind: "rod", maximumPP: 10, checkBonus: { checkTypes: ["spellcraft"], cost: 2, value: 2, type: "item", scope: "a Counteract against possession or a Soul effect" } } } } };
equal("C2 a rod buying a bonus answers the check type with its value and type", [rods.bonusRodFor([intercession], { checkType: "spellcraft" })?.value, rods.bonusRodFor([intercession], { checkType: "spellcraft" })?.type, rods.bonusRodFor([intercession], { checkType: "skill", subject: "religion" })], [2, "item", null]);
ok("C3 a rod in the pack buys nothing", rods.bonusRodFor([{ ...intercession, system: { ...intercession.system, equipped: false } }], { checkType: "spellcraft" }) === null);

/* D. Consumables */
const vial = { name: "Vial of Sanctified Dew", flags: { "trg-prime": { consumable: { effect: { label: "Vial of Sanctified Dew", choose: [{ label: "Reduce Soul Drain by 5", effects: [{ kind: "conditionRelief", condition: "soulDrain", amount: 5 }] }, { label: "+4 status to the next save against possession", effects: [{ kind: "conditional", grants: [] }] }] } } } } };
const ref = cons.consumableEffectRef(vial);
equal("D1 a choose-only effect reads, with its options", [ref?.effects.length, ref?.choose.map((c) => c.label)], [0, ["Reduce Soul Drain by 5", "+4 status to the next save against possession"]]);
equal("D2 the chosen set's rows join the fixed rows", cons.chosenConsumableEffects({ effects: [{ kind: "note", text: "x" }], choose: ref.choose }, 1).map((e) => e.kind), ["note", "conditional"]);
equal("D3 no choice: the fixed rows alone", cons.chosenConsumableEffects({ effects: [{ kind: "note" }], choose: ref.choose }, -1).length, 1);
const resin = { name: "Embalmer's Black Resin", flags: { "trg-prime": { consumable: { effect: { effects: [{ kind: "heal", formula: "3d8" }], requiresTrait: "Unliving" } } } } };
equal("D4 a required trait reads lower-cased and refuses a creature without it", [cons.consumableEffectRef(resin).requiresTrait, cons.consumableTraitRefusal(cons.consumableEffectRef(resin), "humanoid", "Tebb"), cons.consumableTraitRefusal(cons.consumableEffectRef(resin), "undead, unliving", "Hesk")], ["unliving", "Tebb does not possess the Unliving trait — it has no effect.", ""]);

/* E. Structural */
const se = read("module", "magic", "spell-effects.mjs");
ok("E1 the heal case asks the items before the roll and after the heal", /const itemMax = await offerItemMaximise\(caster, \{ formula: riderPlan\.formula, castId \}\);/.test(se) && /await offerRodExtraHeal\(caster, target, \{ castId, healed, healActor \}\)/.test(se) && /await offerOnHealedRelief\(target, \{ spellName: spell\.name/.test(se));
const ih = read("module", "magic", "item-healing-workflow.mjs");
ok("E2 the maximise is once per cast and marks the gloves' day; the rod spends from itself", /memory\.maximised\.add\(rider\.id\);/.test(ih) && /healingRider: true/.test(ih) && /await spendFromRod\(caster, item, rider\.ppCost\)/.test(ih));
ok("E3 Last Vigil offers only the steps the spell's PP reached, and only conditions held", /\.filter\(\(s\) => Number\(s\?\.minPP \?\? 0\) <= Number\(ppRequired\)\)/.test(ih) && /const held = offered\.filter\(/.test(ih));
const ww = read("module", "wondrous-use-workflow.mjs");
ok("E4 a `use` ability runs the registered automation, pays its AP, and marks daily or Focus only once it ran", /if \(use\.kind === "use"\) return useRegisteredAbility\(actor, item, use\);/.test(ww) && /const ran = await automation\.use\(actor, item, use\);\s*if \(ran === false\) return null;/.test(ww) && /setFlag\(SYSTEM_ID, "wondrousFocusExpended", true\)/.test(ww));
const ck = read("module", "dice", "check.mjs");
ok("E5 the check offers a bonus rod when no advantage rod answers", /if \(!rod && bonusRod && DialogV2\) \{/.test(ck) && /check\.modifiers\.push\(\{ label: bonusRod\.name, value: bonusRod\.value, type: bonusRod\.type \}\);/.test(ck));
const cw = read("module", "consumable-use-workflow.mjs");
ok("E6 a consumable's choice is asked before anything is paid, and a required trait refuses the recipient", /data = syntheticSpellData\(item, \{ \.\.\.effect, effects: chosenConsumableEffects\(effect, choice\) \}\);/.test(cw) && /const refusal = consumableTraitRefusal\(/.test(cw) && cw.indexOf("consumableTraitRefusal(") < cw.indexOf("const cost = activationCost(item.system?.activation, { inCombat });"));
const rs = read("module", "rune-spell-workflow.mjs");
ok("E7 a granted spell is looked for in every spells pack, and a Focus grant carries the trait", /contentPacksFor\("spells"\)/.test(rs) && /data\.system\.traits = \[String\(data\.system\.traits \?\? ""\)\.trim\(\), "Focus"\]/.test(rs));
const ac = read("module", "documents", "actor.mjs");
ok("E8 the actor hands its traits and feats to the wondrous restrictions", /traits: creatureTraits\(system\)\.join\(", "\),\s*featNames: Array\.from\(actor\.items \?\? \[\]\)\.filter\(\(i\) => i\.type === "feat" \|\| i\.type === "ability"\)\.map\(\(i\) => i\.name\)/.test(ac));

api.resetModuleRegistry();
const EXPECTED = 27;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-item-mechanisms-3626: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-item-mechanisms-3626: ${checks} checks — all green.`);
