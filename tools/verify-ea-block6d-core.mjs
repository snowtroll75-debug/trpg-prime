#!/usr/bin/env node
/**
 * verify-ea-block6d-core — TRG Prime 3.684.0: group d of the seams Eldritch
 * Arts' Block 6 (archetypes, class feats, metamagic) needs, from the Block 6
 * audit (docs/ELDRITCH_ARTS_BLOCK6_AUDIT.md in the module), answered by Graham
 * on 4 November 2026 ("proposed except Q89: One release").
 *
 *   P   G12: the PP a spell is cast at (Q101): per-PP damage and healing
 *       riders; a spell damage bonus valued at the printed PP (Q146)
 *   O   G14: a cast option's attack-only bonus and one-target Save DC; a
 *       spell-check gate row that is attack-only
 *   T   G15: a warp that changes the damage type (Q106)
 *   B   G19: rune damage that bypasses resistance (Runeforge Mastery)
 *   D   G20: defender DB rows against spell attacks (a FIX: wards apply);
 *       D8-D12 (3.684.1): the rows stack by type, status bonuses to DB not at
 *       all (Graham, 4 November 2026)
 *   F   G22: a free somatic component by tradition (Ferromancer, Q112)
 *   N   G23: spell damage names its caster on trgPrimeDamageApplied
 *   S   G24: a cast measured from another token; a spell sustained by another (Q137)
 *   H   G25: the innate save DC (Q136), the weapon on the reaction ctx, bonus
 *       cantrips, declared melee abilities, target-scoped riders,
 *       warpFreeSchool "*", a prepared-sigil cast (Q123, Q124), Combat
 *       Inscription's DC part, helpers.spellCastable
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
const warned = [];
globalThis.ui = globalThis.ui ?? { notifications: { warn: (m) => warned.push(m), info() {}, error() {} } };

const api = await imp("module-api.mjs");
const cpp = await imp("magic/cast-pp.mjs");
const cdr = await imp("magic/caster-damage-riders.mjs");
const hr = await imp("magic/healing-riders.mjs");
const sdb = await imp("magic/spell-damage-bonus.mjs");
const co = await imp("magic/cast-options.mjs");
const scg = await imp("magic/spell-check-gates.mjs");
const gw = await imp("magic/granted-warps.mjs");
const sw = await imp("magic/spell-warp.mjs");
const rdb = await imp("combat/rune-damage-bypass.mjs");
const dw = await imp("combat/damage-workflow.mjs");
const ddc = await imp("combat/defence-dc.mjs");
const cg = await imp("magic/component-gate.mjs");
const as = await imp("magic/active-spells.mjs");
const isd = await imp("magic/innate-save-dc.mjs");
const rw = await imp("reactions/reactions-workflow.mjs");
const kc = await imp("magic/known-cantrips.mjs");
const mem = await imp("magic/memorisation.mjs");
const ma = await imp("combat/melee-ability.mjs");
const sr = await imp("magic/strike-riders.mjs");
const rm = await imp("magic/runemage.mjs");
const cdc = await imp("magic/casting-dc.mjs");
const cw = await imp("magic/cast-workflow.mjs");
const src = {
  cast: read("module", "magic", "cast-workflow.mjs"),
  attack: read("module", "combat", "attack-workflow.mjs"),
  effects: read("module", "magic", "spell-effects.mjs"),
  area: read("module", "magic", "area-save-workflow.mjs"),
  dmg: read("module", "combat", "damage-workflow.mjs"),
  sustain: read("module", "magic", "sustain-workflow.mjs"),
  check: read("module", "dice", "check.mjs"),
  apiw: read("module", "module-api-workflow.mjs"),
  apim: read("module", "module-api.mjs"),
  memwf: read("module", "magic", "memorisation-workflow.mjs"),
  repwf: read("module", "magic", "repertoire-workflow.mjs")
};
const eff = (flags, extra = {}) => ({ id: extra.id ?? "e1", name: extra.name ?? "Effect", disabled: false, flags: { "trg-prime": flags }, ...extra });

// ── P: G12, the PP a spell is cast at (Q101) ───────────────────────────
equal("P1 an ordinary cast is its total (base + warps + metamagic), whatever a Partial refunds",
  cpp.castRiderPP({ totalPP: 7, spellPP: 3, warpPP: 2, metamagicPP: 2 }), 7);
equal("P2 an innate cast is the spell's own PP and what its budget and pool bought (the Warlock); a cantrip is 0",
  [cpp.castRiderPP({ innate: true, spellPP: 3, warpPP: 2, metamagicPP: 1, totalPP: 0 }), cpp.castRiderPP({ cantrip: true, totalPP: 4, spellPP: 0, warpPP: 4 })], [6, 0]);
equal("P2b an item's cast is the PP the item releases it at", cpp.castRiderPP({ innate: true, itemCast: true, itemPP: 5, spellPP: 3 }), 5);
equal("P2c THE REVIEW FIX (Q101): …plus the metamagic taken on it (\"base + warps and metamagic\")", cpp.castRiderPP({ innate: true, itemCast: true, itemPP: 5, spellPP: 3, metamagicPP: 2 }), 7);
{
  const riders = cdr.declaredSpellDamageRiders([eff({ spellDamageRider: { label: "Demonic Pact", perPP: 1, damageType: "fire" } }), eff({ spellDamageRider: { label: "Old", dice: "1d6", damageType: "essence" } }, { id: "e2" })]);
  equal("P3 a rider may say perPP in place of dice; a dice rider is as before", riders.map((r) => [r.label, r.dice, r.perPP ?? 0]), [["Demonic Pact", "", 1], ["Old", "1d6", 0]]);
  equal("P4 a per-PP rider joins a cast of PP; a cantrip (0) takes nothing from it",
    [cdr.spellDamageRidersFor(riders, { damageType: "fire", taken: 5, castPP: 6 }).map((r) => r.label), cdr.spellDamageRidersFor(riders, { damageType: "fire", taken: 5, castPP: 0 }).map((r) => r.label)],
    [["Demonic Pact", "Old"], ["Old"]]);
  equal("P5 it rolls perPP × the cast's PP, and the card says so",
    [cdr.spellRiderFormula(riders[0], 6), cdr.spellRiderFormula(riders[1], 6), cdr.spellRiderLine("Orc", riders[0], 6, false, 6)],
    ["6", "1d6", "Orc: <strong>6</strong> fire (Demonic Pact, 1 per PP × 6 PP)."]);
  equal("P5b a rider with neither dice nor perPP is dropped", cdr.declaredSpellDamageRiders([eff({ spellDamageRider: { label: "X", damageType: "fire" } })]).length, 0);
}
{
  const riders = hr.declaredHealingRiders([eff({ healingRider: { label: "Angelic Pact", perPP: 1, traits: ["healing"] } })]);
  equal("P6 a healing rider per PP is read (it alone is enough)", riders.map((r) => [r.label, r.perPP, r.traits]), [["Angelic Pact", 1, ["healing"]]]);
  const heal = (castPP, traits) => hr.applyHealingRiders(riders, { formula: "1d8", castPP, traits }).extra;
  equal("P7 +1 HP per PP on a Healing-trait spell; nothing on another, nothing on a cantrip", [heal(4, "Healing, Restoration"), heal(4, "Fire"), heal(0, "Healing")], [4, 0, 0]);
}
{
  const ds = [eff({ spellDamageBonus: { label: "Dangerous Sorcery", valueFrom: "spellPP", instantOnly: true, type: "status" } })];
  const rows = (ctx) => sdb.declaredSpellDamageBonuses(ds, ctx).map((r) => [r.label, r.value, r.type]);
  equal("P8 THE RULING (Q146): the printed PP as a status bonus, on a spell printing no Duration",
    rows({ spellPP: 4, noDuration: true }), [["Dangerous Sorcery", 4, "status"]]);
  equal("P9 …not on a spell with a duration, not when the caller does not say, and a cantrip adds 0",
    [rows({ spellPP: 4, noDuration: false }), rows({ spellPP: 4 }), rows({ spellPP: 0, noDuration: true })], [[], [], []]);
  equal("P9b the printed PP and the duration test read the spell",
    [cpp.printedSpellPP({ ppCost: 6 }), cpp.spellHasNoDuration({ duration: "" }), cpp.spellHasNoDuration({ duration: "1 minute" })], [6, true, false]);
}
ok("P10 the cast values its PP once, through the rule, after totalPP",
  /const castPP = castRiderPP\(\{/.test(src.cast) && src.cast.indexOf("const castPP = castRiderPP({") > src.cast.indexOf("  const totalPP = Math.max("));
ok("P11 …and hands it to both damage paths' riders, the effects (the heal) and the settled hook",
  /castPP, attack: true\n/.test(src.cast) && /castPP, attack: false\n/.test(src.cast) && /\n      castPP\n    \}\);/.test(src.cast)
  && /castPP,\n      saveDCTargets: castOptionsApplied\.saveDCTargets/.test(src.cast) && /registersCast,\n(?:\s*\/\/[^\n]*\n)*\s*castPP,/.test(src.cast)
  && src.cast.indexOf("    preparedSymbol: Boolean(sigil), castPP,\n") > src.cast.indexOf("  Hooks.callAll(\"trgPrimeSpellSettled\", {")
  && src.cast.indexOf("  Hooks.callAll(\"trgPrimeSpellSettled\", {") > 0
  && src.cast.indexOf("    preparedSymbol: Boolean(sigil), castPP,\n") < src.cast.indexOf("  return { ...outcome, ppSpent, check, spellSave, refunded: castRefunded, warpMods };")
  && /threaded,\n(?:\s*\/\/[^\n]*\n)*\s*preparedSymbol: Boolean\(sigil\), castPP\n\s*\}\);/.test(src.cast));
ok("P12 both spell damage bonus sites hand in the printed PP and the duration test",
  (src.cast.match(/spellPP: printedSpellPP\(spell(?:Data|\.system \?\? \{\})\), noDuration: spellHasNoDuration\(spell(?:Data|\.system \?\? \{\})\)/g) ?? []).length === 2);
ok("P13 the heal row hands the cast's PP and the spell's traits to the riders", /used: ridersUsed,\n(?:\s*\/\/[^\n]*\n)*\s*castPP,\n\s*traits: String\(spell\?\.system\?\.traits \?\? ""\)/.test(src.effects));

// ── O: G14, attack-only rows and one target's DC ───────────────────────
{
  api.resetModuleRegistry();
  api.registerCastOption("Sanguine Channel", { offer: () => ({ label: "Sanguine Channel" }), apply: (ctx) => (ctx.pick === "dc" ? { label: "Sanguine Channel", saveDCTarget: { uuid: "Actor.b", value: 1 } } : { label: "Sanguine Channel", attack: 1, attackType: "circumstance" }) });
  const atk = await co.appliedCastOptions({ pick: "attack" }, ["sanguine channel"]);
  const dc = await co.appliedCastOptions({ pick: "dc" }, ["sanguine channel"]);
  equal("O1 an option's attack answer is an attack row, typed; nothing on the casting DC", [atk.attackRows, atk.castingDC, atk.saveDC], [[{ label: "Sanguine Channel", value: 1, type: "circumstance" }], [], 0]);
  equal("O2 its saveDCTarget is one creature's, and moves no other's", [dc.saveDCTargets, dc.saveDC, co.castOptionDCFor(dc.saveDCTargets, "Actor.b").value, co.castOptionDCFor(dc.saveDCTargets, "Actor.c").value], [[{ uuid: "Actor.b", value: 1, label: "Sanguine Channel" }], 0, 1, 0]);
  equal("O2b a malformed target DC is no answer", [co.castOptionTargetDC({ uuid: "", value: 1 }), co.castOptionTargetDC({ uuid: "Actor.x", value: 0 })], [null, null]);
  api.resetModuleRegistry();
}
equal("O3 a gate row may be attackOnly; castingOnly wins when both are said",
  scg.normaliseGateAnswer({ modifiers: [{ label: "Mark", value: 1, type: "circumstance", attackOnly: true }, { label: "Both", value: 1, castingOnly: true, attackOnly: true }] }).modifiers,
  [{ label: "Mark", value: 1, type: "circumstance", attackOnly: true }, { label: "Both", value: 1, type: "untyped", castingOnly: true }]);
equal("O4 an attack-only row never reaches the check", scg.splitGateRows([{ label: "a", value: 1 }, { label: "m", value: 1, attackOnly: true }]), { check: [{ label: "a", value: 1 }], attackOnly: [{ label: "m", value: 1, attackOnly: true }] });
ok("O5 the cast pushes only the check's rows onto the check, and the attack-only ones into the spell attack's pool",
  /\n  modifiers\.push\(\.\.\.gateSplit\.check\);/.test(src.cast) && /const gateAttackRows = gateSplit\.check\.filter\(\(m\) => !m\.castingOnly\);/.test(src.cast)
  && /extraAttackRows: \[\.\.\.\(accuracyAttackRow \? \[accuracyAttackRow\] : \[\]\), \.\.\.\(castOptionsApplied\.attackRows \?\? \[\]\), \.\.\.gateAttackOnlyRows\],\n\s*\/\/ "\+ MAGICAL ABILITY SCORE"/.test(src.cast));
ok("O6 each target saves against the cast's DC moved by its own option rows only",
  /const castSaveDC = saveDC;[\s\S]{0,200}for \(const target of targets\) \{\n\s*const targetShift = castOptionDCFor\(saveDCTargets, target\?\.uuid \?\? ""\);\n\s*const saveDC = castSaveDC \+ targetShift\.value;/.test(src.cast));
ok("O7 the gates are told who is targeted, and the contracts say so", /targetUuids: Array\.from\(game\.user\?\.targets \?\? \[\]\)\.map\(\(t\) => t\?\.actor\?\.uuid\)\.filter\(Boolean\)/.test(src.cast)
  && /`attackOnly: true` \(3\.684\.0/.test(src.apim) && /answer `attack: n`/.test(src.apim));

// ── T: G15, a warp that changes the damage type (Q106) ─────────────────
{
  const ELEMENTAL = ["elemental", "air", "earth", "fire", "water", "acid", "cold", "electricity", "sonic", "poison"];
  api.resetModuleRegistry();
  api.registerSpellWarps("Blood of the Wyrm", [{ match: { anyTraits: ELEMENTAL, damaging: true }, when: (a) => a?.dragon === "cold", warp: { ppCost: 2, text: "Blood of the Wyrm: cold", mods: { damageType: "cold" } } }]);
  const reg = api.registeredSpellWarps("Blood of the Wyrm");
  equal("T1 the registry keeps anyTraits, damaging and when", [reg[0].match.anyTraits.length, reg[0].match.damaging, typeof reg[0].when], [10, true, "function"]);
  const fire = { name: "Fire Bolt", system: { traits: "Fire, Invocation", damage: { formula: "1d10", type: "fire" } } };
  const heal = { name: "Warm Light", system: { traits: "Fire, Healing", damage: { formula: "" }, effects: [{ kind: "heal", formula: "1d8" }] } };
  const offered = (spell, actor) => gw.grantedSpellWarps([["blood of the wyrm", reg]], spell, { actor }).map((w) => w.text);
  const force = { name: "Force Bolt", system: { traits: "Force, Invocation", damage: { formula: "1d8", type: "force" } } };
  equal("T2 offered on a damaging elemental spell to its dragon; not to another dragon, not on a spell that deals no damage, not on one with no element or energy trait",
    [offered(fire, { dragon: "cold" }), offered(fire, { dragon: "fire" }), offered(heal, { dragon: "cold" }), offered(force, { dragon: "cold" })], [["Blood of the Wyrm: cold"], [], [], []]);
  equal("T2b a when that throws offers nothing", await quiet(() => gw.grantedSpellWarps([["x", [{ match: {}, when: () => { throw new Error("x"); }, warp: { ppCost: 0, text: "x", mods: {} } }]]], fire, {})), []);
  api.resetModuleRegistry();
  const mods = sw.aggregateWarpSelection([{ ppCost: 2, text: "cold", mods: { damageType: "Cold" } }], { "warp-0": 1 }).mods;
  equal("T3 the aggregate carries the type; none bought, none carried", [mods.damageType, sw.aggregateWarpSelection([{ ppCost: 2, text: "cold", mods: { damageType: "cold" } }], {}).mods.damageType], ["cold", ""]);
  equal("T4 a warped row is all of that type; no warp, no change",
    [gw.warpedDamageRow({ formula: "2d6", type: "fire" }, { damageType: "cold" }), gw.warpedDamageRow({ formula: "2d6", type: "fire" }, {}), gw.warpedDamageRow(null, { damageType: "cold" })],
    [{ formula: "2d6", type: "cold" }, { formula: "2d6", type: "fire" }, null]);
  equal("T5 a damaging spell: a damage formula, a second pool, or a damage effect row",
    [gw.spellDealsDamage(fire.system), gw.spellDealsDamage(heal.system), gw.spellDealsDamage({ secondaryDamage: { formula: "1d4", type: "cold" } }), gw.spellDealsDamage({ effects: [{ kind: "damage", formula: "3d4" }] }), gw.spellDealsDamage({ secondaryDamage: { type: "cold" } })],
    [true, false, true, true, false]);
}
ok("T6 the cast lays it over the primary, both second pools and the effect rows, and asks the warp of the caster",
  /const damageForCast = warpMods\?\.damageType && [^\n]*\n\s*\? warpedDamageRow\(damageChosen \?\? baseDamageRow, warpMods\)/.test(src.cast)
  && /const second = warpedDamageRow\(normaliseSecondaryDamage\(spellData\), warpMods\);/.test(src.cast)
  && /const secondary = warpedDamageRow\(normaliseSecondaryDamage\(spell\.system\), warpMods\);/.test(src.cast)
  && /elementalType: warpMods\?\.damageType \|\| \(warpMods\?\.elementalType \?\? null\)/.test(src.effects)
  && /spell, \{ innate: isInnate, actor \}\);/.test(src.cast));

// ── B: G19, rune damage past resistance ────────────────────────────────
{
  const docs = [eff({ runeDamageBypass: { label: "Runeforge Mastery", runes: ["flaming", "shock"], immunityAsResistance: true } })];
  equal("B1 the attacker's named runes are bypassed; another rune is not; '*' is every rune; a weapon-scoped one only on its weapon",
    [rdb.declaredRuneDamageBypass(docs, { runeKey: "flaming" }), rdb.declaredRuneDamageBypass(docs, { runeKey: "frost" }),
      Boolean(rdb.declaredRuneDamageBypass([eff({ runeDamageBypass: { runes: ["*"] } })], { runeKey: "frost" })),
      rdb.declaredRuneDamageBypass([eff({ runeDamageBypass: { runes: ["*"], weaponId: "w1" } })], { runeKey: "frost", weaponId: "w2" })],
    [{ label: "Runeforge Mastery", immunityAsResistance: true }, null, true, null]);
  const resist = { combat: { resistances: "fire", immunities: "" } };
  const immune = { combat: { resistances: "", immunities: "fire" } };
  const hit = (sys, opts) => dw.resolveAgainstDefences(sys, { amount: 10, type: "fire", magical: true, ...opts }).taken;
  equal("B2 THE RULE: a resisted rune is not halved; an immune target resists it instead; without the bypass, as before",
    [hit(resist, { ignoreResistance: true }), hit(immune, { ignoreResistance: true, immunityAsResistance: true }), hit(resist, {}), hit(immune, {}), hit(immune, { ignoreResistance: true })],
    [10, 5, 5, 0, 0]);
  equal("B3 the lists, pure: the type's resistance lifted, its immunity turned to resistance",
    rdb.runeBypassedDefences({ resistances: new Set(["fire", "cold"]), immunities: new Set(["fire"]), resistanceTraits: ["fire"] }, "fire", { ignoreResistance: true, immunityAsResistance: true }),
    { resistances: new Set(["cold", "fire"]), immunities: new Set([]), resistanceTraits: [] });
}
ok("B4 a Strike's weapon-rune packets ask it, and only those", /if \(strikeRunes\.includes\(rune\) && rune\.key\) \{[\s\S]{0,300}declaredRuneDamageBypass\(/.test(src.attack)
  && /\.\.\.\(runeBypass \? \{ ignoreResistance: true, immunityAsResistance: runeBypass\.immunityAsResistance \} : \{\}\),/.test(src.attack));

// ── D: G20, DB rows against a spell attack (the ward FIX) ──────────────
{
  const defender = (rows) => ({ items: [{ id: "i1", name: "Shadowmantle", flags: { "trg-prime": { defenceDC: rows } } }], appliedEffects: [] });
  const shadow = defender([{ dc: "defence", value: 1, label: "Shadowmantle", when: { attackKinds: ["spell"], lightLevels: { max: 5 } } }]);
  const db = (actor, kind, light, uuid = "") => ddc.defenceDCBonus(actor, "defence", "", [], uuid, [], [], { attackKind: kind, lightLevel: light }).total;
  equal("D1 a spell-only, light-gated row: a spell attack in dim light; not in bright light, not a Strike, not with no light measured",
    [db(shadow, "spell", 4), db(shadow, "spell", 8), db(shadow, "", 4), db(shadow, "spell", null)], [1, 0, 0, 0]);
  const ward = defender([{ dc: "defence", value: 1, label: "Forbidding Ward", when: { sourceUuids: ["Actor.foe"] } }]);
  equal("D2 THE FIX: a ward against one creature now meets that creature's spell attack as well as its Strike, and no one else's",
    [db(ward, "spell", null, "Actor.foe"), db(ward, "", null, "Actor.foe"), db(ward, "spell", null, "Actor.other")], [1, 1, 0]);
  equal("D3 an attack kind is not scope on its own; light is", [ddc.normaliseDefenceDC({ dc: "defence", value: 1, when: { attackKinds: ["spell"] } }), Boolean(ddc.normaliseDefenceDC({ dc: "defence", value: 1, when: { lightLevels: [1, 2] } }))], [null, true]);
  equal("D4 light levels: a number, a list, a range", [ddc.defenceLightLevels(5), ddc.defenceLightLevels([1, 3]), ddc.defenceLightLevels({ min: 8 }), ddc.defenceLightLevels("x")], [[5], [1, 3], [8, 9, 10], null]);
}
ok("D5 the spell attack asks the defender's rows as a spell, with the attacker's facts and the light, and adds them to the DB it meets",
  /typedDefence = defenceDCBonus\(targetActor, "defence", "", creatureTypesOf\(actor\.system \?\? \{\}\), actor\?\.uuid \?\? "",\n\s*alignedTraitsOf\(actor\.system \?\? \{\}\), creatureTraits\(actor\.system \?\? \{\}\), \{ attackKind: "spell", lightLevel \}\);/.test(src.cast)
  && /const defendedDB = Number\.isFinite\(baseDB\) \? baseDB \+ dragonhideDB \+ resilienceDB \+ Number\(typedDefence\.total \?\? 0\) : NaN;/.test(src.cast));

// ── F: G22, a free somatic component by tradition (Q112) ───────────────
{
  const decl = [{ traditions: ["arcane"], needsPouch: true, label: "Ferromancer" }];
  equal("F1 THE RULING: an arcane caster's arcane spell; not a divine one; not a Sorcerer whose own tradition is not arcane",
    [cg.traditionComponentWaiver(decl, { tradition: "arcane, verdant" }, "arcane")?.label, cg.traditionComponentWaiver(decl, { tradition: "divinity" }, "arcane"), cg.traditionComponentWaiver(decl, { tradition: "arcane" }, "verdant")],
    ["Ferromancer", null, null]);
  const flags = (f) => ({ getFlag: (s, k) => f[k] });
  const actor = (opts = {}) => ({ name: "Ferro", ...flags(opts.flag ?? {}), system: { identity: { size: "medium" }, magic: { tradition: "arcane" } }, items: opts.items ?? [], appliedEffects: [] });
  const feat = { type: "feat", name: "Ferromancer", flags: { "trg-prime": { freeSomatic: { traditions: ["arcane"], needsPouch: true } } } };
  equal("F2 declared on a feat; an actor-wide object flag is scoped, not the old blanket override",
    [cg.declaredTraditionComponents(actor({ items: [feat] })).map((d) => d.label), cg.hasSomaticOverride(actor({ flag: { freeSomatic: { traditions: ["arcane"] } } })), cg.hasSomaticOverride(actor({ flag: { freeSomatic: true } }))],
    [["Ferromancer"], false, true]);
  const greatsword = { type: "weapon", name: "Greatsword", system: { equipped: true, traits: "Two-Handed", size: "medium" } };
  const pouch = { type: "gear", name: "Material Component Pouch", system: { equipped: true, traits: "Material Component Pouch", uses: { max: 10, value: 3 } } };
  const somatic = { tradition: "arcane", components: { somatic: true, verbal: true } };
  warned.length = 0;
  equal("F3 both hands full: refused without the feat; cast with it and a pouch; refused with it and no pouch",
    [cg.componentGate(actor({ items: [greatsword, pouch] }), somatic, "Shock"), cg.componentGate(actor({ items: [greatsword, pouch, feat] }), somatic, "Shock"), cg.componentGate(actor({ items: [greatsword, feat] }), somatic, "Shock")],
    [false, true, false]);
  equal("F4 the pouch is spent on each arcane cast, material or not", [cg.castSpendsPouch({ material: false }, decl[0]), cg.castSpendsPouch({ material: false }, null), cg.castSpendsPouch({ material: true }, null)], [true, false, true]);
}
ok("F5 the cast spends the pouch through the rule", /if \(!isInnate && castSpendsPouch\(effectiveComponents, shardsHere\)\) \{\n\s*await consumeGearUse\(actor, \/\\bmaterial component pouch\\b\/i\);/.test(src.cast));

// ── N: G23, spell damage names its caster ──────────────────────────────
ok("N1 applyTypedDamage hands a source uuid and context to the hook, on both of its writes",
  /sourceUuid = "",\n\s*context = null\n\} = \{\}\) \{/.test(src.dmg) && /\{ isCritical, \.\.\.told \}/.test(src.dmg) && /sourceName,\n\s*\.\.\.told\n\s*\}\);/.test(src.dmg));
ok("N2 an area save's damage names its caster; a spell's damage row and riders name theirs",
  /\.\.\.\(caster\?\.uuid \? \{ sourceUuid: caster\.uuid, context: \{ kind: "areaSave"/.test(src.area)
  && /caster\?\.uuid \? \{ sourceUuid: caster\.uuid, context: \{ kind: "spell", spellName: String\(spellName \?\? ""\) \} \} : \{\}/.test(src.effects)
  && /applyDamageAndCheckDying\(target, packet\.taken, \{ sourceUuid: actor\?\.uuid \?\? "", context: \{ kind: "spell", spellName: spell\?\.name \?\? "", rider: rider\.label \} \}\)/.test(src.cast));
ok("N3 the attack's vs-trait half and second pool, and the save's immune alternate, name the caster",
  /vsPacket\.taken, \{ sourceUuid: actor\?\.uuid \?\? "", context: \{ kind: "spell"/.test(src.cast) && /secondPacket\.taken, \{ sourceUuid: actor\?\.uuid \?\? "", context: \{ kind: "spell"/.test(src.cast)
  && /isCritical: Boolean\(bs\.criticalSeverity\),\n(?:\s*\/\/[^\n]*\n)*\s*sourceUuid: actor\?\.uuid \?\? "", context: \{ kind: "spell", spellName: spell\?\.name \?\? "" \}\n\s*\}\);\n\s*altHP/.test(src.cast));

{
  const defender = (rows) => ({ items: [{ id: "i1", name: "Ward", flags: { "trg-prime": { defenceDC: rows } } }], appliedEffects: [] });
  const weaponOnly = defender([{ dc: "defence", value: 2, label: "Parry", when: { attackKinds: ["weapon"], sourceUuids: ["Actor.foe"] } }]);
  const plain = defender([{ dc: "defence", value: 1, label: "Thengar's", when: { sourceUuids: ["Actor.foe"] } }]);
  const db = (actor, kind) => ddc.defenceDCBonus(actor, "defence", "", [], "Actor.foe", [], [], { attackKind: kind }).total;
  equal("D6 THE REVIEW FIX (G20): a weapon-only row meets a Strike and nothing else; a row naming no kind still meets every attack",
    [db(weaponOnly, "weapon"), db(weaponOnly, "spell"), db(weaponOnly, "bomb"), db(weaponOnly, ""), db(plain, "weapon"), db(plain, "spell"), db(plain, "bomb"), db(plain, "action"), db(plain, "")],
    [2, 0, 0, 0, 1, 1, 1, 1, 1]);
  const alch = read("module", "alchemical-workflow.mjs");
  const act = read("module", "combat", "action-workflow.mjs");
  ok("D6b …so every attack caller names its kind: the Strike \"weapon\", the bomb \"bomb\", an action \"action\"",
    /defenceDCBonus\(targetActor, "defence", "", attackerTypes, actor\?\.uuid \?\? "", attackerAlignments, creatureTraits\(actor\.system \?\? \{\}\), \{ attackKind: "weapon" \}\)/.test(src.attack)
    && /creatureTraits\(actor\.system \?\? \{\}\), \{ attackKind: "bomb" \}\n\s*\);/.test(alch)
    && /creatureTraits\(actor\?\.system \?\? \{\}\), \{ attackKind: "action" \}\);/.test(act));
  const spend = src.cast.indexOf('await consumeOneAttackEffects(targetActor, { kind: "spell", attackerUuid: actor?.uuid ?? "" });');
  ok("D7 THE REVIEW FIX (G20, Medium): a spell attack spends its one-attack wards AFTER the DB rows are read (Observe Technique's +2), as the Strike and the bomb do — once",
    spend > src.cast.indexOf("    typedDefence = defenceDCBonus(targetActor, \"defence\", \"\", creatureTypesOf(actor.system ?? {}), actor?.uuid ?? \"\",")
    && spend > src.cast.indexOf("  const defendedDB = Number.isFinite(baseDB) ? baseDB + dragonhideDB + resilienceDB")
    && src.cast.indexOf("const typedDefence = targetActor") < 0
    && (src.cast.match(/consumeOneAttackEffects\(targetActor, \{ kind: "spell"/g) ?? []).length === 1);
}

// ── D8+: 3.684.1, status bonuses to DB do not stack (Graham, 4 Nov 2026) ─
{
  const ward = await imp("magic/ward.mjs");
  const oa = await imp("magic/opposed-aura.mjs");
  const foe = ["Actor.foe"];
  const rowsOf = (...rows) => rows.map((r) => ({ dc: "defence", when: { sourceUuids: foe }, ...r }));
  const defender = (rows, base = []) => ({ items: [{ id: "i1", name: "Rows", flags: { "trg-prime": { defenceDC: rows } } }], appliedEffects: [],
    system: { combat: { defence: { breakdown: { entries: base } } } } });
  const bonus = (actor, against = "defence") => ddc.defenceDCBonus(actor, against, "", [], "Actor.foe", [], [], { attackKind: "weapon" });
  const two = defender(rowsOf({ value: 4, type: "status", label: "Anticipations" }, { value: 1, type: "status", label: "Forbidding Ward" }, { value: 1, label: "Thengar's" }));
  const r8 = bonus(two);
  equal("D8 THE RULING: two status rows give the higher only (+4, not +5); an untyped row still adds; every row is still listed, the lost one named",
    [r8.total, r8.entries.length, r8.notCounted.map((n) => n.entry.label), /higher status bonus/.test(r8.notCounted[0]?.reason ?? "")], [5, 3, ["Forbidding Ward"], true]);
  const status = (v) => [{ label: "Bless", value: v, type: "status", applied: true }];
  equal("D9 …and against the DB's own status bonus: +1 under +2 adds nothing (named); +4 over +1 adds +3; a circumstance row adds beside it; another DC ignores the DB's breakdown",
    [bonus(defender(rowsOf({ value: 1, type: "status", label: "Forbidding Ward" }), status(2))).total,
      bonus(defender(rowsOf({ value: 1, type: "status", label: "Forbidding Ward" }), status(2))).notCounted.length,
      bonus(defender(rowsOf({ value: 4, type: "status", label: "Anticipations" }), status(1))).total,
      bonus(defender(rowsOf({ value: 4, type: "circumstance", label: "Stone Shield" }), status(1))).total,
      ddc.defenceDCBonus(defender([{ dc: "willDC", value: 1, type: "status", label: "W", when: { sourceUuids: foe } }], status(2)), "willDC", "", [], "Actor.foe").total],
    [0, 1, 3, 4, 1]);
  equal("D10 the core's rule, as applyStacking has it: same-type penalties give the worst; race and untyped add; no rows, nothing",
    [ddc.stackDefenceRows([{ label: "a", value: -2, type: "circumstance" }, { label: "b", value: -1, type: "circumstance" }]).total,
      ddc.stackDefenceRows([{ label: "a", value: 2, type: "race" }, { label: "b", value: 1, type: "race" }, { label: "c", value: 1 }]).total,
      ddc.stackDefenceRows([], status(3)).total],
    [-2, 4, 0]);
  equal("D11 a row's type is what it declares, through the core's aliases; none is untyped; a ward's, an aura's and a spell row's travel onto the row",
    [ddc.normaliseDefenceDC({ dc: "defence", value: 1, type: "status", when: { sourceUuids: foe } }).type,
      ddc.normaliseDefenceDC({ dc: "defence", value: 1, bonusType: "racial", when: { sourceUuids: foe } }).type,
      ddc.normaliseDefenceDC({ dc: "defence", value: 1, when: { sourceUuids: foe } }).type,
      ward.wardFlagData({ value: 4, bonusType: "status", label: "Anticipations", sourceUuids: foe, slots: ["defence"] }).defenceDC[0].type,
      oa.opposedAuraRecordsFor({ value: 1, bonusType: "status", slot: "defence" }, ["chaos"], "Radiant Aegis").defenceDC[0].type,
      ddc.defenceDCRowFrom({ dc: "skillDC:deception", value: 4, bonusType: "status", actions: ["disguise"] }, "Self Mirage").row.type],
    ["status", "race", "untyped", "status", "status", "status"]);
  const act = read("module", "combat", "action-workflow.mjs");
  const alch = read("module", "alchemical-workflow.mjs");
  ok("D12 every card says which rows did not count: the action's DC line, the spell's, the Strike's and the bomb's DB lines (Fearful Power's on the Strike)",
    /const lost = defence\.notCounted\?\.find\(\(n\) => n\.entry === entry\);/.test(act) && /\(not counted: \$\{lost\.reason\.toLowerCase\(\)\}\)/.test(act)
    && /const lost = typedDefence\.notCounted\?\.find\(\(n\) => n\.entry === entry\);/.test(src.cast) && /not counted: \$\{esc\(lost\.reason\.toLowerCase\(\)\)\}/.test(src.cast)
    && /for \(const entry of typedDefence\.entries \?\? \[\]\) \{\s*const lost = notCountedOf\(entry\);/.test(src.attack) && /const notCountedOf = \(entry\) => \(defenceStack\.notCounted \?\? \[\]\)\.find\(\(n\) => n\.entry === entry\);/.test(src.attack)
    && (src.attack.match(/ — not counted: \$\{escRow\(lost\.reason\.toLowerCase\(\)\)\}/g) ?? []).length === 1 && /const lost = notCountedOf\(fearfulRow\);/.test(src.attack)
    && /for \(const entry of typedRows\?\.entries \?\? \[\]\) \{\s*const lost = typedRows\.notCounted\?\.find\(\(n\) => n\.entry === entry\);/.test(alch) && / — not counted: \$\{esc\(lost\.reason\.toLowerCase\(\)\)\}/.test(alch)
    // RE-POINTED AT 3.684.3: the bomb's rows are its defence rows and its cover, stacked together (D18).
    && /    typedRows = \{ \.\.\.typed, entries: \[\.\.\.\(typed\?\.entries \?\? \[\]\), \.\.\.coverRows\], notCounted: stacked\.notCounted \};\n/.test(alch));

  // D13 — Formless Cut pays back the stacked DB with the stance less without it (review)
  const so = await imp("combat/strike-options.mjs");
  const st = (rows, base = [], uuids = ["A.Stance"]) => so.stanceDefenceOf({ breakdown: base, stanceUuids: uuids, dcEntries: rows });
  const sRow = (value, type = "status", extra = {}) => ({ label: `Stance ${value}`, value, type, fromStance: true, ...extra });
  const wRow = (value, type = "status") => ({ label: `Ward ${value}`, value, type });
  equal("D13 Formless Cut: a +4 status stance row over the sheet's +1 status pays back +3, not +4; a +2 status ward it held down counts once it is ignored (+2); a +3 status stance entry over that ward pays +1; untyped pays in full; a stance's penalty is not ignored (+3 and −2 pay back +3); no stance, nothing",
    [st([sRow(4)], status(1)).total, st([sRow(4), wRow(2)]).total,
      st([wRow(2)], [{ label: "Crane", value: 3, type: "status", applied: true, source: "A.Stance" }]).total,
      st([sRow(2, "untyped"), wRow(2)], status(1)).total, st([sRow(3, "untyped"), sRow(-2, "untyped")]).total, st([wRow(2)], status(1), []).total,
      st([sRow(4)], status(1)).labels],
    [3, 2, 1, 2, 3, 0, ["Stance 4 +4"]]);
  ok("D13b the Strike pays back against the stacking base, with every row and Fearful Power's beside the stance's",
    /stanceDefenceOf\(\{\s*breakdown: defenceBase,[\s\S]{0,200}dcEntries: \[\.\.\.rowsMet, \.\.\.\(fearfulRow \? \[fearfulRow\] : \[\]\)\]/.test(src.attack));
  // RE-POINTED AT 3.684.3: `rowsMet` is the defence rows and the Strike's other DB bonuses (D17).

  // D14 — Fearful Power stacks as a status row with the defence rows (review)
  const fp = (rows, base, v) => { const r = ddc.stackFearfulPower(rows, base, v); return [r.fearfulDB, r.stack.total, r.stack.notCounted.map((n) => n.entry.label)]; };
  equal("D14 Fearful Power is one status row among the rest: +3 over a +1 status ward adds +2 (the ward not counted); under a +4 status ward adds 0 (it not counted); over the sheet's +1 status adds +2; beside a circumstance row adds +3; 0, no row",
    [fp([wRow(1)], [], 3), fp([wRow(4)], [], 3), fp([], status(1), 3), fp([wRow(2, "circumstance")], [], 3), ddc.stackFearfulPower([wRow(1)], [], 0).row],
    [[2, 3, ["Ward 1"]], [0, 4, ["Fearful Power"]], [2, 2, []], [3, 5, []], null]);
  ok("D14b the Strike's DB adds what Fearful Power adds over the rows, from the rows' own stacking",
    // RE-POINTED AT 3.684.3: weighed among `rowsMet` (the Strike's other DB
    // bonuses too), and the DB adds the stack's total, which holds it (D17).
    /const fearful = stackFearfulPower\(rowsMet, defenceBase, fearfulBonus\);\n\s*defenceStack = fearful\.stack;\n\s*if \(fearful\.row\) \(\{ row: fearfulRow, fearfulDB \} = fearful\);/.test(src.attack)
    && /fearfulPowerBonus\(targetActor\)/.test(src.attack)
    && !/statusBonusOver/.test(src.attack) && /\? baseDB \+ defenceStack\.total - pierce\.amount/.test(src.attack));

  // D15 — a restricted DB: the rows stack against what it kept (review)
  const restricted = (rows, breakdown, restrictedName, kept) => ({ ...defender(rows, breakdown),
    system: { combat: { defence: { breakdown: { entries: breakdown }, restricted: restrictedName, ...(kept ? { restrictedEntries: kept } : {}) } } } });
  const armour = { label: "Mail", value: 5, type: "armour", applied: true };
  const bless = { label: "Bless", value: 2, type: "status", applied: true };
  equal("D15 Paralyzed: a +1 status row adds +1, the lost status bonus not on the DB to hold it down; Petrified: a +2 status row stacks against nothing; not restricted, the whole breakdown (+0); a restriction with nothing recorded keeps nothing",
    [bonus(restricted(rowsOf({ value: 1, type: "status", label: "W" }), [armour, bless], "Paralyzed", [armour])).total,
      bonus(restricted(rowsOf({ value: 2, type: "status", label: "W" }), [armour, bless], "Petrified", [])).total,
      bonus(defender(rowsOf({ value: 1, type: "status", label: "W" }), [armour, bless])).total,
      ddc.defenceStackBase(restricted([], [armour, bless], "Unconscious")),
      ddc.defenceStackBase(restricted([], [armour, bless], "Paralyzed", [armour])).map((e) => e.label)],
    [1, 2, 0, [], ["Mail"]]);
  const actorSrc = read("module", "documents", "actor.mjs");
  ok("D15b the actor records what a restricted DB kept (none for Petrified), and sums exactly those",
    /combat\.defence\.restricted = "Petrified";\n\s*combat\.defence\.restrictedEntries = \[\];/.test(actorSrc)
    && /const kept = keptEntries\.reduce\(\(sum, entry\) => sum \+ \(Number\(entry\.value\) \|\| 0\), 0\);\n\s*combat\.defence\.restrictedEntries = keptEntries;/.test(actorSrc));

  // D16 — a row's type, in any case; a blank type falls back (review)
  const typeOf = (raw) => ddc.normaliseDefenceDC({ dc: "defence", value: 1, when: { sourceUuids: foe }, ...raw }).type;
  equal("D16 a row's type in any case (Status, STATUS, naturalArmour, NaturalArmour, natural armour, Racial); a blank type reads bonusType; an unknown one, or Object's own keys, untyped",
    [typeOf({ type: "Status" }), typeOf({ type: "STATUS" }), typeOf({ type: "naturalArmour" }), typeOf({ type: "NaturalArmour" }), typeOf({ type: "natural armour" }),
      typeOf({ type: "Racial" }), typeOf({ type: "", bonusType: "circumstance" }), typeOf({ type: "bogus" }), typeOf({ type: "constructor" }), typeOf({ type: "toString" })],
    ["status", "status", "naturalArmour", "naturalArmour", "naturalArmour", "race", "circumstance", "untyped", "untyped", "untyped"]);
  equal("D16b two status rows spelt differently still do not stack", bonus(defender(rowsOf({ value: 4, type: "Status", label: "A" }, { value: 1, type: "status", label: "B" }))).total, 4);
}

// ── D17+: 3.684.3, the Strike's other DB bonuses stack by type ──────────
// Graham, 5 November 2026, asked "Cover, Aid Defensive, Warden Hunter, Trap
// Finder and the rest still add flat, outside the typed stacking. Should they
// stack by type with the defence rows too?": "Yes."
{
  const sr = (o) => ddc.strikeDefenceRows(o).map((r) => [r.key, r.value, r.type]);
  equal("D17 each typed as its text has it: cover, Aid Defensive, Warden Hunter and Trap Finder circumstance; Arrow Catching, Shielded Stride and Dragonhide untyped (increases, or no type); zeros give no row",
    sr({ cover: 4, aid: { amount: 2, label: "Aid" }, warden: 1, trapFinder: 2, arrowCatching: 1, shieldedStride: 4, dragonhide: 2 }).concat(sr({ cover: 0, aid: null, warden: 0 })),
    [["cover", 4, "circumstance"], ["aid", 2, "circumstance"], ["warden", 1, "circumstance"], ["trapFinder", 2, "circumstance"],
      ["arrowCatching", 1, "untyped"], ["shieldedStride", 4, "untyped"], ["dragonhide", 2, "untyped"]]);
  const takeCover = [{ label: "Take Cover", value: 4, type: "circumstance", applied: true }];
  const shieldBase = [{ label: "Shield", value: 2, type: "shield", applied: true }];
  const stackOf = (o, base = [], rows = []) => { const strike = ddc.strikeDefenceRows(o); const r = ddc.stackDefenceRows([...rows, ...strike], base); return [r.total, r.notCounted.map((n) => n.entry.key ?? n.entry.label)]; };
  equal("D17b THE ANSWER: firing-into-melee cover over a Take Cover the sheet has adds 0 (named), not +4; Aid +2 beside Warden +1 gives +2 (Warden named); Trap Finder +2 beside a +4 circumstance ward adds the ward's +4 only; Shielded Stride's +4 over the sheet's shield +2 still adds +4; untyped Arrow Catching and Dragonhide add in full",
    [stackOf({ cover: 4 }, takeCover), stackOf({ aid: { amount: 2 }, warden: 1 }), stackOf({ trapFinder: 2 }, [], [{ label: "Stone Shield", value: 4, type: "circumstance" }]),
      stackOf({ shieldedStride: 4 }, shieldBase), stackOf({ arrowCatching: 1, dragonhide: 2 }, takeCover)],
    [[0, ["cover"]], [2, ["warden"]], [4, ["trapFinder"]], [4, []], [3, []]]);
  ok("D17c the Strike: every bonus is a row among `rowsMet`, typed by `strikeDefenceRows`; the DB is the sheet's plus the one stacked total; none is added flat",
    /const strikeRows = targetActor\n\s*\? strikeDefenceRows\(\{ \.\.\.strikeBonuses, cover: coverBonus - intoMeleeStep \}\)/.test(src.attack)
    && /cover: coverBonus, aid: aidDefence, warden: wardenDB, trapFinder: trapFinderDB,\n\s*arrowCatching: arrowCatchingDB, shieldedStride: shieldedStrideDB, dragonhide: dragonhideDB/.test(src.attack)
    && /const rowsMet = \[\.\.\.\(typedDefence\.entries \?\? \[\]\), \.\.\.strikeRows\];/.test(src.attack)
    && /const db = Number\.isFinite\(baseDB\)\n\s*\? baseDB \+ defenceStack\.total - pierce\.amount - takenCoverLoss\n/.test(src.attack)
    && !/\+ coverBonus \+ wardenDB/.test(src.attack) && !/\(aidDefence\?\.amount \?\? 0\) -/.test(src.attack));
  ok("D17d the Strike card names each that did not count, and now says Aid Defensive at all",
    /const lost = row \? \(defenceStack\.notCounted \?\? \[\]\)\.find\(\(n\) => n\.entry === row\) : null;/.test(src.attack)
    && src.attack.includes("    return lost ? ` — not counted: ${String(lost.reason).toLowerCase()}` : \"\";")
    && ["cover", "arrowCatching", "dragonhide", "shieldedStride", "warden", "trapFinder", "aid"].every((k) => src.attack.includes(`\${strikeRowLost("${k}")}`))
    && /if \(aidDefence\) \{\n\s*lines\.push\(line\(`<em>\$\{targetActor\?\.name \?\? "The target"\}'s \$\{escRow\(aidDefence\.label/.test(src.attack));
  // D18 — the bomb's cover is a circumstance row too
  const alch = read("module", "alchemical-workflow.mjs");
  ok("D18 the bomb: its firing-into-melee cover a circumstance row, stacked with its defence rows against the DB's entries; not added flat",
    /const coverRows = strikeDefenceRows\(\{ cover: coverBonus \}\);\n\s*const stacked = stackDefenceRows\(\[\.\.\.\(typed\?\.entries \?\? \[\]\), \.\.\.coverRows\], defenceStackBase\(targetActor\)\);\n\s*db = Number\.isFinite\(base\) \? base \+ stacked\.total : null;/.test(alch)
    && !/base \+ coverBonus/.test(alch));
  // D19 — Shooting Star's step down of firing-into-melee cover: what the stack loses
  ok("D19 a stepped-down firing-into-melee cover is the stepped row, and the DB loses what the stack loses; a taken cover's step is made on the DB entries the rows stack against",
    /const intoMeleeStep = coverStep && !coverStep\.taken \? coverStep\.lost : 0;/.test(src.attack)
    && /coverStep = \{ \.\.\.coverStep, lost: Math\.max\(0, unstepped\.stack\.total - defenceStack\.total\) \};/.test(src.attack)
    && /const sheetEntries = taken \? \(await import\("\.\/defence-dc\.mjs"\)\)\.defenceStackBase\(targetActor\) : \[\];\n(\s*\/\/[^\n]*\n)*\s*const coverSource = taken \? \{ uuid: coverEffect\.uuid, id: coverEffect\.id, name: coverEffect\.name \} : null;/.test(src.attack)
    && /const sheetLoss = coverLossInDefence\(sheetEntries, step\.lost, coverSource\);/.test(src.attack)
    && /coverStep = \{ \.\.\.step, taken: true, lost: sheetLoss, sheetLoss, tableLost: step\.lost, coverSource, steppedCoverEntries \};/.test(src.attack)
    && /\? coverStep\.steppedCoverEntries\(unsteppedBase, coverStep\.tableLost, coverStep\.coverSource\)\n\s*: unsteppedBase;/.test(src.attack)
    && /const takenCoverLoss = coverStep\?\.taken \? Number\(coverStep\.sheetLoss \?\? 0\) : 0;\n(?:\s*\/\/[^\n]*\n)*\s*const coverTieNote = coverStep\?\.tie\n[^\n]*\n\s*: "";\n\s*if \(coverStep && !coverStep\.lost\) coverStep = null;/.test(src.attack)
    && /lost: Math\.max\(0, coverStep\.sheetLoss \+ unstepped\.stack\.total - defenceStack\.total\)/.test(src.attack));
  const step = ddc.stackDefenceRows(ddc.strikeDefenceRows({ cover: 2 }), []).total;
  const full = ddc.stackDefenceRows(ddc.strikeDefenceRows({ cover: 4 }), []).total;
  const heldUp = (c) => ddc.stackDefenceRows([...ddc.strikeDefenceRows({ cover: c, aid: { amount: 3 } })], []).total;
  equal("D19b standard cover stepped to lesser loses 2; with a +3 circumstance Aid holding it up, 1", [full - step, heldUp(4) - heldUp(2)], [2, 1]);
  // D19c (3.684.3, review): a TAKEN cover stepped down, the Strike's own
  // circumstance rows stacked against the stepped entries — the arithmetic
  // attack-workflow runs, through the real helpers.
  const se = await imp("magic/strike-edge.mjs");
  const takenDB = (aid, tableLost = 2, sheetDB = 14) => {
    const entries = [{ label: "Take Cover", value: 4, type: "circumstance", source: "sheet", applied: true }];
    const rows = ddc.strikeDefenceRows(aid ? { aid: { amount: aid } } : {});
    const sheetLoss = se.coverLossInDefence(entries, tableLost);
    const stepped = ddc.stackFearfulPower(rows, se.steppedCoverEntries(entries, tableLost), 0).stack.total;
    const unstepped = ddc.stackFearfulPower(rows, entries, 0).stack.total;
    return [sheetDB + stepped - sheetLoss, Math.max(0, sheetLoss + unstepped - stepped)];
  };
  equal("D19c Take Cover standard (+4, DB 14) stepped to lesser: alone DB 12 (loses 2); with Aid +4, DB 14 (loses 0); with Aid +3, DB 13 (loses 1); entries without a sheet slot are returned as they are",
    [takenDB(0), takenDB(4), takenDB(3), se.steppedCoverEntries([{ type: "circumstance", value: 2, source: "spell" }], 2)[0].value],
    [[12, 2], [14, 0], [13, 1], 2]);
  // D19d (3.684.4, live test): THE ENTRY TAKE COVER REALLY MAKES. Its changes
  // run through the core's own routing (applyCustomBonusChange → the bonus
  // pool → resolveBonuses), so the entry has the effect's uuid as its source,
  // as in play — not the sheet slot the earlier checks built by hand.
  globalThis.ActiveEffect ??= class {};
  const aeMod = await imp("documents/active-effect.mjs");
  const basMod = await imp("combat/basic-action-stances.mjs");
  const regMod = await imp("bonuses/registry.mjs");
  const liveEntries = (level, id = "tc1", parent = "Actor.def") => {
    const effect = { uuid: `${parent}.ActiveEffect.${id}`, id, name: basMod.TAKE_COVER_EFFECTS[level].name };
    const pool = [];
    const fake = { addBonus: (target, b) => { if (/defence$/.test(target)) pool.push(b); } };
    for (const c of basMod.TAKE_COVER_EFFECTS[level].changes) aeMod.applyCustomBonusChange(fake, { key: c.key, type: "custom", value: String(c.value), effect });
    return { effect, entries: regMod.resolveBonuses({ pool }).entries };
  };
  const live = liveEntries("standard");
  const tokenLive = liveEntries("standard", "tc2", "Scene.s.Token.t.Actor.def");
  const liveDB = (aid) => {
    const rows = ddc.strikeDefenceRows(aid ? { aid: { amount: aid } } : {});
    const src = { uuid: live.effect.uuid, id: live.effect.id, name: live.effect.name };
    const sheetLoss = se.coverLossInDefence(live.entries, 2, src);
    const stepped = ddc.stackFearfulPower(rows, se.steppedCoverEntries(live.entries, 2, src), 0).stack.total;
    return 14 + stepped - sheetLoss;
  };
  equal("D19d a real Take Cover entry (source: the effect's uuid) is found and stepped: by uuid 2; by id on a token's actor 2; by name 2; with no source given 0 (the sheet slot only); DB 12, with Aid +4 14, with Aid +3 13",
    [live.entries.map((e) => [e.value, e.type, e.source]),
      se.coverLossInDefence(live.entries, 2, live.effect.uuid),
      se.coverLossInDefence(tokenLive.entries, 2, { id: "tc2" }),
      se.coverLossInDefence(live.entries, 2, { name: "Take Cover (Standard)" }),
      se.coverLossInDefence(live.entries, 2),
      liveDB(0), liveDB(4), liveDB(3)],
    [[[4, "circumstance", "Actor.def.ActiveEffect.tc1"]], 2, 2, 2, 0, 12, 14, 13]);
  ok("D19f the card's firing-into-melee cover line gives the stepped cover, not the table's +4 (3.684.4, live test)",
    src.attack.includes("is engaged in melee: +${coverBonus - intoMeleeStep} DB (Standard cover, firing into melee${intoMeleeStep ? `, stepped down to ${intoMeleeTo} cover` : \"\"}, circumstance)")
    && /const intoMeleeTo = intoMeleeStep \? \(coverStep\.to \|\| "no"\) : "";/.test(src.attack));
  // D19g-D19j (3.684.5; Graham, 5 November 2026, asked "Should it step
  // whichever cover is higher instead?": "Yes"). A target with its own Take
  // Cover AND firing-into-melee cover: the higher is stepped, one degree,
  // once; on a tie the firing-into-melee cover, said on the card.
  equal("D19g coverToStep: the higher cover; a tie steps the firing-into-melee cover; one cover alone is that one; none is nothing",
    [se.coverToStep({ taken: 8, intoMelee: 4 }), se.coverToStep({ taken: 2, intoMelee: 4 }), se.coverToStep({ taken: 4, intoMelee: 4 }),
      se.coverToStep({ taken: 0, intoMelee: 4 }), se.coverToStep({ taken: 4, intoMelee: 0 }), se.coverToStep({})],
    [{ step: "taken", both: true, tie: false }, { step: "intoMelee", both: true, tie: false }, { step: "intoMelee", both: true, tie: true },
      { step: "intoMelee", both: false, tie: false }, { step: "taken", both: false, tie: false }, { step: "", both: false, tie: false }]);
  const { COVER_TYPES } = await imp("combat/ranged.mjs");
  // The DB attack-workflow composes, through the real helpers and a real
  // Take Cover entry, with the firing-into-melee cover (+4) beside it. The
  // sheet's DB is 10 plus the Take Cover. Returns [DB, the step's loss].
  const bothDB = (level, aid = 0, restricted = false) => {
    const lv = liveEntries(level);
    const entries = restricted ? [] : lv.entries;
    const src = { uuid: lv.effect.uuid, id: lv.effect.id, name: lv.effect.name };
    const takenValue = se.coverEntryIn(entries, src) ? COVER_TYPES[level].bonus : 0;
    const sheetDB = 10 + takenValue;
    const pick = se.coverToStep({ taken: takenValue, intoMelee: 4 });
    const extra = aid ? { aid: { amount: aid } } : {};
    const unstepped = ddc.stackFearfulPower(ddc.strikeDefenceRows({ cover: 4, ...extra }), entries, 0).stack.total;
    if (pick.step === "taken") {
      const st = se.coverSteppedDown(level, 1);
      const sheetLoss = se.coverLossInDefence(entries, st.lost, src);
      const stepped = ddc.stackFearfulPower(ddc.strikeDefenceRows({ cover: 4, ...extra }), se.steppedCoverEntries(entries, st.lost, src), 0).stack.total;
      return [sheetDB + stepped - sheetLoss, Math.max(0, sheetLoss + unstepped - stepped), pick.step];
    }
    const st = se.coverSteppedDown("standard", 1);
    const stepped = ddc.stackFearfulPower(ddc.strikeDefenceRows({ cover: 4 - st.lost, ...extra }), entries, 0).stack.total;
    return [sheetDB + stepped, Math.max(0, unstepped - stepped), pick.step];
  };
  equal("D19h both covers: lesser Take Cover (+2) — the firing-into-melee +4 is stepped, DB 12 (was 14), −2; standard — a tie, the firing-into-melee one stepped, DB 14, nothing lost; greater (+8) — the Take Cover stepped to standard, DB 14, −4",
    [bothDB("lesser"), bothDB("standard"), bothDB("greater")],
    [[12, 2, "intoMelee"], [14, 0, "intoMelee"], [14, 4, "taken"]]);
  equal("D19i with Aid Defensive +3 beside them: 13, 14, 14; a Paralyzed target's DB keeps no Take Cover, so the firing-into-melee cover is the one stepped: 12",
    [bothDB("lesser", 3)[0], bothDB("standard", 3)[0], bothDB("greater", 3)[0], bothDB("greater", 0, true).slice(0, 1).concat(bothDB("greater", 0, true)[2])],
    [13, 14, 14, [12, "intoMelee"]]);
  ok("D19j attack-workflow: the Take Cover weighed only when the DB holds it; the pick made by coverToStep; the Take Cover stepped only when it is not the firing-into-melee cover's turn; the card says which cover, and says a tie",
    /const takenValue = taken && coverEntryIn\(sheetEntries, coverSource\) \? Number\(COVER_TYPES\[taken\]\?\.bonus \?\? 0\) : 0;/.test(src.attack)
    && /coverPick = coverToStep\(\{ taken: takenValue, intoMelee: coverBonus \}\);\n\s*if \(taken && coverPick\.step !== "intoMelee"\) \{/.test(src.attack)
    && /\} else if \(coverBonus\) \{\n\s*coverStep = coverSteppedDown\("standard", strikeEdge\.reduceCover\);\n\s*\}\n\s*if \(coverStep\) coverStep = \{ \.\.\.coverStep, both: coverPick\.both, tie: coverPick\.tie \};/.test(src.attack)
    && /const coverTieNote = coverStep\?\.tie\n/.test(src.attack)
    && src.attack.includes("are both ${coverStep.from} cover; the firing-into-melee cover is the one stepped down (stepping the Take Cover gives the same DB)")
    && /const takenCoverLoss[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*const coverTieNote[\s\S]{0,400}\n\s*if \(coverStep && !coverStep\.lost\) coverStep = null;/.test(src.attack)
    && /if \(coverTieNote\) lines\.push\(line\(`<em>\$\{coverTieNote\}<\/em>`\)\);/.test(src.attack)
    && /const whichCover = coverStep\.both && !coverStep\.tie\n\s*\? ` \(\$\{coverStep\.taken \? "Take Cover" : "firing into melee"\}, the higher of its two covers\)`/.test(src.attack)
    && src.attack.includes("'s ${coverStep.from} cover${whichCover} is ${coverStep.to || \"no\"} cover (−${coverStep.lost} DB)`"));
  equal("D19e coverEntryIn: the effect's entry before the sheet slot; the sheet slot when no entry matches; null when neither",
    [se.coverEntryIn([{ type: "circumstance", value: 1, source: "sheet" }, { type: "circumstance", value: 4, source: "Actor.a.ActiveEffect.x", label: "Take Cover (Standard)" }], { id: "x" })?.value,
      se.coverEntryIn([{ type: "circumstance", value: 3, source: "sheet" }], { id: "x" })?.value,
      se.coverEntryIn([{ type: "circumstance", value: 3, source: "Actor.a.ActiveEffect.y" }], { id: "x" })],
    [4, 3, null]);
}

// ── S: G24, another token's range; another creature's sustain (Q137) ───
equal("S1 a cast measured from another token, or a sigil's, is the core's own call (no prelude)",
  [cw.castPreludeOwed({ rangeFrom: "Scene.s.Token.t" }), cw.castPreludeOwed({ preparedSymbol: { label: "Prepared Sigil" } }), cw.castPreludeOwed({})], [false, false, true]);
ok("S2 the range test and the area's aim measure from that token", /const casterToken = rangeOrigin\?\.token \?\? actor\.getActiveTokens\?\.\(\)\?\.\[0\] \?\? null;/.test(src.cast)
  && /const aimFrom = rangeOrigin\?\.actor \?\? actor;/.test(src.cast) && /placeSpellTemplate\(areaConfig, aimFrom, rangeFeet,/.test(src.cast));
{
  const held = { id: "a", sustained: true, sustainType: "duration", castRound: 1, sustainedBy: { uuid: "Actor.fam", label: "Familiar" } };
  const own = { id: "b", sustained: true, sustainType: "duration", castRound: 1 };
  equal("S3 held by another: no Sustain owed, PP recovery free; the caster's own still lapses and still blocks",
    [as.sustainedLapses(held, 9), as.sustainedLapses(own, 9), as.hasSustained([held]), as.hasSustained([held, own])], [false, true, false, true]);
  equal("S4 it ends when the sustainer is gone, at 0 HP or dead",
    [as.sustainerLapses(held, null), as.sustainerLapses(held, { system: { resources: { hp: { value: 0 } } } }), as.sustainerLapses(held, { system: { resources: { hp: { value: 5 } } }, statuses: new Set() }), as.sustainerLapses(own, null)],
    [true, true, false, false]);
  let store = [{ ...own, id: "c" }, { ...own, id: "d", sustainedBy: { uuid: "Actor.fam", label: "Familiar" } }];
  const caster = { getFlag: () => store, setFlag: async (_s, _k, v) => { store = v; }, update: async () => {} };
  await as.setSpellSustainer(caster, "c", { uuid: "Actor.fam", label: "Familiar" });
  equal("S5 handing a spell to a creature takes the one it held (\"any one spell\")", store.map((e) => [e.id, e.sustainedBy?.uuid ?? ""]), [["c", "Actor.fam"], ["d", ""]]);
  await as.setSpellSustainer(caster, "c", null);
  equal("S5b and null hands it back", store.map((e) => e.sustainedBy?.uuid ?? ""), ["", ""]);
}
ok("S6 the interruption watches the sustainer's hit points for the spells it holds, and not the caster's for those",
  /getActiveSpells\(actor\)\.filter\(\(entry\) => entry\?\.sustained && !sustainerOf\(entry\)\)/.test(src.sustain) && /for \(const \{ caster, entries \} of held\) interruptSustained\(caster, entries\);/.test(src.sustain)
  && /setSpellSustainer: async \(caster, entryId, sustainer = null\)/.test(src.apiw));

{
  // THE REVIEW FIX (G24, Low): the HP hook walks the world only for a known sustainer.
  const sw2 = await imp("magic/sustain-workflow.mjs");
  let reads = 0;
  const mk = (uuid, entries) => ({ uuid, getFlag: (scope, key) => { reads += 1; return key === "activeSpells" ? entries() : null; } });
  let witchSpells = [];
  const witch = mk("Actor.witch", () => witchSpells);
  const fam = mk("Actor.fam", () => []);
  const bystander = mk("Actor.by", () => []);
  const savedActors = globalThis.game.actors;
  globalThis.game.actors = [witch, fam, bystander];
  sw2.invalidateSustainerIndex();
  const first = sw2.heldForOthersBy(bystander);
  const afterFirst = reads;
  const again = sw2.heldForOthersBy(bystander);
  equal("S7 no one sustains anything: a blow costs one walk to build the index, then none", [first, again, reads - afterFirst], [[], [], 0]);
  witchSpells = [{ id: "w1", sustained: true, sustainedBy: { uuid: "Actor.fam", label: "Familiar" } }];
  const handlers = {};
  const savedOn = globalThis.Hooks.on;
  globalThis.Hooks.on = (name, fn) => { (handlers[name] ??= []).push(fn); };
  sw2.registerSustainInterruptHooks();
  globalThis.Hooks.on = savedOn;
  for (const fn of handlers.updateActor ?? []) fn(witch, { flags: { "trg-prime": { activeSpells: witchSpells } } });
  const held = sw2.heldForOthersBy(fam);
  const beforeBy = reads;
  sw2.heldForOthersBy(bystander);
  equal("S7b a spell handed to a familiar re-reads the index (its update hook), the familiar's blow finds it, a bystander's walks nothing",
    [held.map((h) => [h.caster.uuid, h.entries.map((e) => e.id)]), reads - beforeBy, ["createActor", "deleteActor", "createToken", "deleteToken", "canvasReady", "updateToken"].every((h) => (handlers[h] ?? []).length > 0)],
    [[["Actor.witch", ["w1"]]], 0, true]);
  for (const fn of handlers.updateActor ?? []) fn(witch, { system: { resources: { hp: { value: 3 } } } });
  const r0 = reads;
  sw2.heldForOthersBy(bystander);
  equal("S7c an update that touches no active spells keeps the index", reads - r0, 0);
  globalThis.game.actors = savedActors;
  sw2.invalidateSustainerIndex();
}
{
  const settled = src.cast.slice(src.cast.indexOf('Hooks.callAll("trgPrimeSpellSettled", {'), src.cast.indexOf("\n  });", src.cast.indexOf('Hooks.callAll("trgPrimeSpellSettled", {')));
  ok("V1 THE REVIEW ADDITION: trgPrimeSpellSettled carries the cast's Save DC — the one its saves were rolled against, every bonus in, before a per-target shift — and an innate cast's own formula",
    /saveDC: nominalSaveDC \?\? null,/.test(settled) && /innateSaveDC: isInnate \? innateSaveDCBase : null,/.test(settled)
    && /if \(innateSaveHere\) innateSaveDCBase = Number\(innateSaveHere\.value \?\? 0\) \|\| null;/.test(src.cast)
    && /nominalSaveDC = saveDCResult\.dc;/.test(src.cast) && /if \(castDefence\) \{\n\s*saveDC = nominalSaveDC;/.test(src.cast)
    && /const saveDC = castSaveDC \+ targetShift\.value;/.test(src.cast));
}

ok("V2 THE REVIEW ADDITION (Q119): the cast-reaction ctx carries `castPP` — the rider PP plus a manipulation's warp, 0 for a cantrip — beside the unchanged `pp`",
  /pp: Number\(totalPP \?\? 0\) \+ Number\(manipulationPP \?\? 0\),\n(\s*\/\/[^\n]*\n)*\s*castPP: isCantrip \? 0 : Number\(castPP \?\? 0\) \+ Number\(manipulationPP \?\? 0\),/.test(src.cast)
  && src.cast.indexOf("const castPP = castRiderPP({") < src.cast.indexOf("await castReactionsFor({"));

// ── H: G25, helpers and fields ─────────────────────────────────────────
{
  api.resetModuleRegistry();
  const warlock = { system: { identity: { level: 5 }, magic: { castingAbility: "charisma" }, attributes: { charisma: { total: 3 } } }, items: [] };
  const xithra = { name: "Xithra", system: { innate: true, traits: "Fire, Invocation" }, flags: {} };
  const before = await isd.innateSaveDCFor(warlock, xithra);
  api.registerInnateLevelBonus("Emberlord", (ctx) => (ctx.traits.includes("fire") ? 1 : 0));
  const withSoul = await isd.innateSaveDCFor(warlock, xithra);
  equal("H1 THE RULING (Q136): 10 + Charisma + level, and the soul's +1 where its traits apply", [before.value, withSoul.value, withSoul.level], [18, 19, 6]);
  api.resetModuleRegistry();
  ok("H1b exposed as a helper", /innateSaveDCFor: async \(actor, spell\) => \(await import\("\.\/magic\/innate-save-dc\.mjs"\)\)\.innateSaveDCFor\(actor, spell\)/.test(src.apiw));
}
{
  api.resetModuleRegistry();
  const seen = [];
  api.registerCheckReaction("Arcane Fencer", { before: async (ctx) => { seen.push([ctx.weaponUuid, ctx.twoHanded]); return null; } });
  const BIAS = { NORMAL: "normal", ADVANTAGE: "advantage", DISADVANTAGE: "disadvantage" };
  await rw.checkReactionsBefore({ actor: { name: "A" }, type: "attack", subject: "", label: "Strike", dc: 15, modifiers: [], weaponUuid: "Actor.a.Item.rapier", twoHanded: false }, BIAS);
  await rw.checkReactionsBefore({ actor: { name: "A" }, type: "save", subject: "will", label: "Will", dc: 15, modifiers: [] }, BIAS);
  equal("H2 a check reaction is told the weapon and its grip; a save is told none", seen, [["Actor.a.Item.rapier", false], ["", false]]);
  api.resetModuleRegistry();
  ok("H2b the Strike's check carries them", /weaponUuid: String\(weapon\?\.uuid \?\? ""\),\n\s*twoHanded: Boolean\(usedTwoHanded \|\| itemRequiredHands\(/.test(src.attack)
    && /this\.weaponUuid = String\(config\.weaponUuid \?\? ""\);\n\s*this\.twoHanded = config\.twoHanded === true;/.test(src.check));
}
{
  const items = [{ type: "feat", name: "Extra Cantrip", flags: { "trg-prime": { cantripBonus: 1 } } }, { type: "feat", name: "Extra Cantrip", flags: { "trg-prime": { cantripBonus: 1 } } }, { type: "spell", flags: { "trg-prime": { cantripBonus: 5 } } }];
  equal("H3 bonus cantrips: a copy a cantrip, feats only; a known pool grows, no pool is invented; the memorised allowance grows",
    [kc.declaredCantripBonus(items), kc.knownCantripAllowance({ system: { cantripsKnown: 2 } }, items), kc.knownCantripAllowance({ system: { cantripsKnown: 0 } }, items),
      mem.memorisationState({ level: 4, cantripAllowance: 4, bonusCantrips: 2 }).cantripsAllowed, mem.memorisationState({ level: 4, cantripAllowance: 4 }).cantripsAllowed],
    [2, 4, 0, 6, 4]);
  ok("H3b both allowances read it", /bonusCantrips: declaredCantripBonus\(Array\.from\(actor\.items \?\? \[\]\)\),/.test(src.memwf) && /const allowed = knownCantripAllowance\(classItem, Array\.from\(actor\.items \?\? \[\]\)\);/.test(src.repwf));
}
{
  const docs = [{ type: "feat", name: "Clever Strike", flags: { "trg-prime": { meleeAbility: { attack: ["intelligence"] } } } }];
  const attrs = { intelligence: { total: 4 }, strength: { total: 1 }, dexterity: { total: 3 } };
  const best = (current) => ma.bestMeleeAbility(ma.declaredMeleeAbilities(docs, "attack"), attrs, current);
  equal("H4 Clever Strike: Int over Str (+3), over Finesse's Dex (+1), never below what is used; the damage half declares nothing here",
    [best(1)?.delta, best(3)?.delta, best(5), ma.declaredMeleeAbilities(docs, "damage")], [3, 1, null, []]);
  ok("H4b the Strike adds the difference over Finesse, melee only; the damage uses it, and Rage and Weakened then leave it alone",
    /bestMeleeAbility\(declared, system\.attributes \?\? \{\}, Number\(system\.combat\?\.attack\?\.ability \?\? 0\) \+ finesseBonus\)/.test(src.attack)
    && /const strengthMod = declaredDamageAbility \? declaredDamageAbility\.value : weaponFinesseDamage \? dexterityMod : hardmanStrength;/.test(src.attack)
    && /isStrengthBasedAttack\(weaponData\) && !declaredDamageAbility\) \{/.test(src.attack));
}
{
  const mark = sr.normaliseStrikeRider({ label: "Spellblade's Mark", dice: "1d6", damageType: "force", scope: "any", targetUuids: ["Actor.mark"], once: false });
  const packets = (uuid) => sr.riderPacketsFor([mark], { attackMode: "melee" }, { targetUuid: uuid }).map((p) => p.applies);
  equal("H5 a strike rider against one named creature: it, and no one else", [mark.targetUuids, packets("Actor.mark"), packets("Actor.other")], [["Actor.mark"], [true], [false]]);
  const spellMark = cdr.declaredSpellDamageRiders([eff({ spellDamageRider: { label: "Mark", dice: "1d6", damageType: "force", when: { targetUuids: ["Actor.mark"], attackOnly: true } } })]);
  const joins = (uuid, attack) => cdr.spellDamageRidersFor(spellMark, { damageType: "fire", taken: 3, targetUuid: uuid, attack }).length;
  equal("H6 a spell rider: the named creature, an attack only", [joins("Actor.mark", true), joins("Actor.mark", false), joins("Actor.other", true)], [1, 0, 0]);
  ok("H6b the Strike tells its riders which creature", /targetUuid: String\(targetActor\?\.uuid \?\? ""\),?\n(?:\s*\/\/[^\n]*\n\s*\.\.\.\(discardedReplacement \? \{ keepRiderIds: \[discardedReplacement\] \} : \{\}\)\n)?\s*\};/.test(src.attack));
}
equal("H7 warpFreeSchool '*' is every spell; a school is its own; no value is nothing",
  [gw.freeWarpSchoolMatches({ school: "*", value: 2 }, ["invocation"]), gw.freeWarpSchoolMatches({ school: "illusion", value: 2 }, ["invocation"]), gw.freeWarpSchoolMatches({ school: "illusion", value: 2 }, ["illusion"]), gw.freeWarpSchoolMatches({ school: "*", value: 0 }, ["x"])],
  [true, false, true, false]);
ok("H7b the free warp asks the rule", /\.filter\(\(\{ scoped \}\) => freeWarpSchoolMatches\(scoped, spellTraits\)\);/.test(src.cast));
{
  const runemage = { type: "feat", name: "Runemage", flags: {} };
  const shield = { type: "shield", name: "Heavy Shield", system: { equipped: true } };
  const sword = { type: "weapon", name: "Longsword", system: { equipped: true, traits: "", size: "medium" } };
  const actor = { name: "Rune", getFlag: () => null, system: { identity: { size: "medium" }, magic: {} }, items: [runemage, shield, sword], appliedEffects: [], effects: [] };
  const verbal = { tradition: "arcane", components: { verbal: true } };
  const somatic = { tradition: "arcane", components: { verbal: true, somatic: true } };
  equal("H8 THE RULING (Q123): a sigil's Symbol needs no hand; a somatic spell still does; an unprepared Symbol does",
    [cg.componentGate(actor, verbal, "Light", { symbolPrepared: true }), cg.componentGate(actor, somatic, "Shock", { symbolPrepared: true }), cg.componentGate(actor, verbal, "Light")], [true, false, false]);
  equal("H9 the room line: a sigil needs none; Combat Inscription's note; else the core's",
    [rm.symbolRoomLine({ symbol: true }, { prepared: true }).includes("inscribed in advance"), rm.symbolRoomLine({ symbol: true }, { roomNote: "a hand-sized space suffices (Combat Inscription)" }).includes("hand-sized"), rm.symbolRoomLine({ symbol: true }).includes("room to draw the rune"), rm.symbolRoomLine({})],
    [true, true, true, null]);
  ok("H10 (Q124) the sigil's −1 AP joins Quicken's in every cast-time sum and the early pool test, never below 1",
    (src.cast.match(/totalCastTime\(warpedCastAP, \{ apDelta: mm\.apDelta \+ sigilAP \}\)/g) ?? []).length === 3 && /const sigilAP = sigil \? -1 : 0;/.test(src.cast)
    && /castTimeApCost\(sigil \? totalCastTime\(effCastAPWithScale, \{ apDelta: -1 \}\) : effCastAPWithScale\)/.test(src.cast)
    && /componentGate\(actor, spellData, spell\.name, \{ symbolPrepared: Boolean\(sigil\) \}\)/.test(src.cast));
}
{
  const ci = [{ type: "feat", name: "Combat Inscription", flags: { "trg-prime": { runemage: { defensiveIncrease: 0, roomNote: "a hand-sized space suffices (Combat Inscription)" } } } }];
  const adj = rm.runemageAdjustments(ci);
  equal("H11 Combat Inscription declares no defensive increase and a room note; nothing declared is the core's 2", [adj, rm.runemageAdjustments([]).defensiveIncrease], [{ defensiveIncrease: 0, label: "Combat Inscription", roomNote: "a hand-sized space suffices (Combat Inscription)" }, 2]);
  const part = (o) => cdc.assembledCastingDC({ totalPP: 2, casterLevel: 2, runemage: true, defensive: true, ...o }).parts.find((p) => p.label.startsWith("Runemage"));
  equal("H12 the defensive Runemage part: +1 as before; -1 named with Combat Inscription", [part({}), part({ runemageDefensive: 0, runemageDefensiveLabel: "Combat Inscription" })],
    [{ label: "Runemage, defensive", value: 1 }, { label: "Runemage, defensive, Combat Inscription", value: -1 }]);
  ok("H12b the cast hands the declared increase to the DC", /runemageDefensive: runeAdjust\.defensiveIncrease,\n\s*runemageDefensiveLabel: runeAdjust\.label,/.test(src.cast));
}
ok("H13 helpers.spellCastable asks the core's one availability rule", /spellCastable: async \(actor, spell\) => \{[\s\S]{0,300}return spellCastBlocked\(spell\) === null;/.test(src.apiw));

if (failures.length) {
  process.stdout.write(`verify-ea-block6d-core: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-ea-block6d-core: OK — ${checks} checks.\n`);
