#!/usr/bin/env node
/**
 * verify-block36 — block 36 (pages 361–370), 3.615.0: the armour and shield
 * runes, the specific armours, and the charged items.
 *
 * NEW at 3.615.0. The audit is claude/audit-pages-361-370.md; Graham ruled
 * R1–R20 on 2 October 2026.
 *
 *   A  potency: the shield's ladder cap (R1), its place in the shield's own
 *      DB (R2), and the potency rune's hit points (A1)
 *   B  Energy Resistance's types per tier (A3)
 *   C  the timed runes — Animated's minute and cooldown (R5), Arrow
 *      Catching's activation (R6), the activation AP (R10)
 *   D  Indestructible (R8, B4), Fortification's ACP (B5), Deathless (B6),
 *      Spell Effect on runed clothing (B7), and the stale rune data (A8)
 *   E  the specific armours (R3, A9–A11, B1, B2)
 *   F  the charged items (R17–R20, A12–A17, B8–B10)
 *   G  the pack, the repairs and the version
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { computeRuneModifiers, shieldDefenceWithPotency } from "../module/runes.mjs";
import { computeFullCustomisation } from "../module/item-quality.mjs";
import { priceSelection, perTierChoices, RUNE_PARAMETERS } from "../module/rune-catalogue.mjs";
import { runeBonusesFor } from "../module/rune-effects.mjs";
import { RUNE_ACTIONS, runeActionsFor } from "../module/rune-actions.mjs";
import { runeTimerFlags, runeCooldownLeft, cooldownWords, RUNE_TIMER_FLAG } from "../module/rune-timers.mjs";
import { runeUsageNotes } from "../module/codex-runes.mjs";
import { spellEffectRunesOf } from "../module/rune-spell-effect.mjs";
import { spellEffectGrants } from "../module/rune-spell-workflow.mjs";
import { shouldOfferCustomisation } from "../module/customise-on-add.mjs";
import { ARMOUR_RUNES } from "../module/armour-rune-data.mjs";
import {
  castFromItemOptions, chargedItemLevelOf, warpCeiling, itemRecharge, dailyRecharge
} from "../module/charged-items.mjs";
import { buildCharged } from "../module/magic-item-builder.mjs";
import { TRG_SCHEMA_VERSION } from "../module/migration.mjs";
import { PACK_REPAIRS } from "../module/data/pack-repairs.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ACTOR = strip(read("module", "documents", "actor.mjs"));
const AID = strip(read("module", "combat", "aid-bonus.mjs"));
const ATTACK = strip(read("module", "combat", "attack-workflow.mjs"));
const COMBAT = strip(read("module", "documents", "combat.mjs"));
const RAW = strip(read("module", "rune-actions-workflow.mjs"));
const TIMERS = strip(read("module", "rune-timers-workflow.mjs"));
const BOOT = read("scripts", "trg-prime.mjs");
const CUSTOM = strip(read("module", "item-customize-workflow.mjs"));
const REFRESH = strip(read("module", "compendium-refresh.mjs"));
const CHARGEDF = strip(read("module", "charged-items-workflow.mjs"));
const SKILLOPT = strip(read("module", "general-skill-options-workflow.mjs"));
const BUILDERF = strip(read("module", "magic-item-builder-workflow.mjs"));
const GATE = strip(read("module", "magic", "component-gate.mjs"));
const CAST = strip(read("module", "magic", "cast-workflow.mjs"));
const RUNESPELL = strip(read("module", "rune-spell-workflow.mjs"));
const body = (src, head) => {
  const at = src.indexOf(head);
  return at === -1 ? "" : src.slice(at, src.indexOf("\n}", at));
};

async function packRows(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open({ readOnly: true });
  const rows = new Map();
  for await (const [key, value] of db.iterator()) if (key.startsWith("!items!")) rows.set(value.name, value);
  await db.close();
  return rows;
}

/* ================================================================== *
 * A. Potency
 * ================================================================== */
{
  const six = computeRuneModifiers({ kind: "shield", runes: "Potency VI", quality: "legendary" });
  ok("A1 R1 — a Legendary shield's Potency VI is a Potency IV, not nothing",
    six.potency?.numeral === 4 && six.db === 4 && six.hp === 80 && /treated as IV/.test(six.problems.join(" ")));
  const five = computeRuneModifiers({ kind: "shield", runes: "Potency V, Animated I", quality: "master" });
  ok("A2 and its other runes are not 'no potency rune'", five.db === 4 && !/no potency rune/.test(five.problems.join(" ")));
  ok("A3 armour still reaches VI", computeRuneModifiers({ kind: "armour", runes: "Potency VI", quality: "legendary" }).db === 6);
  ok("A4 the Customise dialog says IV at most for a shield",
    priceSelection("shield", "legendary", [{ key: "potency", tier: 6 }]).problems.some((p) => /Potency IV at most/.test(p)));

  ok("A5 R2 — a shield's bonus carries its potency", shieldDefenceWithPotency({ defenceBonus: 2, runeDefenceBonus: 1 }) === 3
    && shieldDefenceWithPotency({ defenceBonus: 2 }) === 2);
  ok("A6 the shield's DB in play includes its potency, so it is suppressed with it",
    ACTOR.includes('? shieldDefenceWithPotency(item.system)\n        : 0,'));
  ok("A7 and potency reaches the item-bonus pool from armour only",
    /const runeKind = runeKindOf\(item\);\s*if \(runeKind !== "armour"\) continue;/.test(ACTOR));
  ok("A8 Benevolent adds the shield's whole bonus", AID.includes("if (found) benevolent = shieldDefenceWithPotency(found.item.system);"));

  const armour = computeFullCustomisation("armour", { level: 1, price: 10, hp: 40, category: "Light" }, { quality: "expert", runes: "Potency III" });
  const plain = computeFullCustomisation("armour", { level: 1, price: 10, hp: 40, category: "Light" }, { quality: "expert", runes: "" });
  const shield = computeFullCustomisation("shield", { level: 1, price: 10, hp: 20, category: "heavy" }, { quality: "standard", runes: "Potency II" });
  const weapon = computeFullCustomisation("weapon", { level: 1, price: 10, hp: 10 }, { quality: "expert", runes: "Potency II" });
  ok("A9 A1 — armour's potency adds its hit points (+15 at III)", armour.hpMax === plain.hpMax + 15, `${armour.hpMax} vs ${plain.hpMax}`);
  ok("A10 a shield's potency adds its own (+40 at II)", shield.hpMax === 60, String(shield.hpMax));
  // 3.618.0 (Graham's R8 of block 37): a weapon that tracks its HP gains +5 a
  // potency tier, as armour does; one that tracks none stays untracked.
  const untracked = computeFullCustomisation("weapon", { level: 1, price: 10, hp: 0 }, { quality: "expert", runes: "Potency II" });
  ok("A11 a weapon's potency adds +5 HP a tier, and an untracked weapon stays untracked", weapon.hpMax === 20 && untracked.hpMax === 0, `${weapon.hpMax}, ${untracked.hpMax}`);
}

/* ================================================================== *
 * B. Energy Resistance
 * ================================================================== */
{
  const res = (runes) => runeBonusesFor({ type: "armour", name: "A", system: { runes } });
  ok("B1 A3 — Energy Resistance II grants two types", JSON.stringify(res("Potency I, Energy Resistance II (fire, cold)").resistances) === '["fire","cold"]');
  ok("B2 IV grants four", res("Potency I, Energy Resistance IV (acid, cold, electricity, fire)").resistances.length === 4);
  const over = res("Potency I, Energy Resistance I (fire, cold)");
  ok("B3 a tier I naming two grants the first, and says so", JSON.stringify(over.resistances) === '["fire"]' && over.problems.length === 1);
  ok("B4 no magnitude is written as if it were one", !res("Potency I, Energy Resistance III (fire)").resistances.some((r) => /\d/.test(r)));
  ok("B5 an unknown type is reported", res("Potency I, Energy Resistance II (fire, steam)").problems.some((p) => /steam/.test(p)));
  ok("B6 the parameter is one tick per type", RUNE_PARAMETERS.energyResistance.perTier === true
    && perTierChoices("energyResistance", "fire, cold, fire", 2).types.length === 2);
  ok("B7 the dialog renders ticks and reads them back",
    CUSTOM.includes('class="trg-rune-parameter-tick"') && CUSTOM.includes(".trg-rune-parameter-tick[data-rune=")
    && CUSTOM.includes('".trg-rune-tier, .trg-rune-parameter, .trg-rune-parameter-tick, .trg-rune-spell, .trg-rune-frequency"'));
  ok("B8 the dialog reports too many", priceSelection("armour", "expert",
    [{ key: "potency", tier: 1 }, { key: "energyResistance", tier: 1, parameter: "fire, cold" }]).problems.some((p) => /first 1 count/.test(p)));
}

/* ================================================================== *
 * C. The timed runes
 * ================================================================== */
{
  ok("C1 R5 — Animated is 1 AP, a minute, and a minute's cooldown",
    RUNE_ACTIONS.animated.apCost === 1 && RUNE_ACTIONS.animated.durationSeconds === 60 && RUNE_ACTIONS.animated.cooldownSeconds === 60);
  ok("C2 R6 — Arrow Catching is an activation of 1 AP for a minute, on armour or a shield",
    RUNE_ACTIONS.arrowCatching?.apCost === 1 && RUNE_ACTIONS.arrowCatching.durationSeconds === 60
    && JSON.stringify(RUNE_ACTIONS.arrowCatching.on) === '["armour","shield"]');
  ok("C3 R10 — Glamoured is 1 AP", RUNE_ACTIONS.glamoured.apCost === 1);
  const catching = { type: "shield", name: "S", system: { runes: "Potency I, Arrow Catching" }, flags: {} };
  ok("C4 the sheet offers Arrow Catching's button", runeActionsFor(catching).some((a) => a.key === "arrowCatching" && a.apCost === 1));
  ok("C5 the +1 against missiles only while activated",
    runeBonusesFor(catching).missileDefence === 0
    && runeBonusesFor({ ...catching, flags: { "trg-prime": { runeState: { arrowCatching: true } } } }).missileDefence === 1);

  const flags = runeTimerFlags({ itemId: "i", key: "animated", state: "animated", durationSeconds: 60, cooldownSeconds: 60 }, { worldTime: 100, round: 3 });
  ok("C6 the timer is a spell-style effect: a world-time end and, in combat, an end round",
    flags.spellEffect === true && flags.spellEffectEnd === 160 && flags.conditionExpiresRound === 13
    && flags[RUNE_TIMER_FLAG].cooldownSeconds === 60);
  ok("C7 out of combat it has no end round", !("conditionExpiresRound" in runeTimerFlags({ durationSeconds: 60 }, { worldTime: 0, round: null })));
  ok("C8 the cooldown counts down by world time",
    runeCooldownLeft({ flags: { "trg-prime": { runeState: { cooldown: { animated: 160 } } } } }, "animated", 130) === 30
    && runeCooldownLeft({}, "animated", 130) === 0 && cooldownWords(60) === "1 minute");
  const animated = body(RAW, "async function useAnimated(");
  ok("C9 Animated refuses while cooling down, pays its AP, then starts the minute",
    animated.indexOf("runeReady(item, \"animated\"") > -1
    && animated.indexOf("runeReady(") < animated.indexOf("payRuneActivation(")
    && animated.indexOf("payRuneActivation(") < animated.indexOf("startRuneTimer("));
  ok("C10 pressing it again ends the minute early", animated.includes('if (await stopRuneTimer(actor, item, "animated")) return null;'));
  ok("C11 Glamoured pays its AP to switch on, not off", /if \(!on\) \{[\s\S]*payRuneActivation\(actor, action\?\.apCost/.test(body(RAW, "async function useGlamoured(")));
  ok("C12 the timer's end clears the state, starts the cooldown, and an Animated shield drops",
    TIMERS.includes('const updates = { [`flags.${SYSTEM_ID}.runeState.${timer.state}`]: false };')
    && TIMERS.includes('updates[`flags.${SYSTEM_ID}.runeState.cooldown.${timer.key}`]')
    && TIMERS.includes('if (lapsed && ending.dropsOnLapse) updates["system.equipped"] = false;'));
  ok("C13 the hook is registered", BOOT.includes("registerRuneTimers();"));
  ok("C14 AP is spent in combat only, through the ordinary gate",
    /await ensureActionPoints\(actor, cost, label\)\) return false;\s*await spendActionPoints\(actor, cost, label\);/.test(TIMERS));
}

/* ================================================================== *
 * D. Indestructible, Fortification, Deathless, Spell Effect, rune data
 * ================================================================== */
{
  const injury = body(ATTACK, "export async function rollCriticalInjury(");
  const negate = injury.indexOf("const indestructiblePiece =");
  ok("D1 R8 — Indestructible is asked before the death save and before any condition lands",
    negate > -1 && negate < injury.indexOf("const save = deathOrFatalSave(")
    && negate < injury.indexOf("applyConditionTags(targetActor"));
  ok("D2 and returns a negated injury, for any target whose armour amends it",
    injury.includes("const indestructiblePiece = targetActor && criticalAmendmentApplies(row, targetArmour)")
    && /if \(indestructiblePiece\) \{[\s\S]*?negated: true/.test(injury));
  ok("D3 only the piece covering the struck location, with an amendment that applies",
    /criticalAmendmentApplies\(row, targetArmour\)[\s\S]*armourPieceCoversLocation\(item, hitLocation\)[\s\S]*equippedEventRune\(\[item\], "indestructible"\)/.test(injury));
  const note = (material) => runeUsageNotes({ type: "armour", name: "X", system: { runes: "Potency I, Indestructible", material } })
    .find((n) => n.key === "indestructible");
  ok("D4 B4 — Indestructible's metal is checked", note("mithril")?.met === true && note("steel")?.met === false && note("")?.met === null);

  ok("D5 B5 — Fortification's -1 is on the piece, where Iron Walker sees it",
    ACTOR.includes("const bulk = Number(runeBonusesFor(item).acpPenalty ?? 0) || 0;")
    && !ACTOR.includes("total += runeBonusesForActor(Array.from(actor?.items ?? [])).acpPenalty;"));
  const order = body(ACTOR, "function prepareArmourCheckPenalty(");
  ok("D6 and the total is taken from the pieces before Iron Walker", order.indexOf("totalArmourCheckPenalty(pieces)") < order.indexOf("acpReductionPerPiece"));
  ok("D7 B6 — Deathless is not offered on a Heroic", COMBAT.includes('if (deathless && degree !== DEATHLESS_DEGREE && degree !== "heroic"'));
  const clothing = { type: "gear", name: "Travellers", system: { equipped: true, runes: "Potency I, Spell Effect (Feather Fall, 1/day)" }, flags: { "trg-prime": { runeBearing: "armour" } } };
  ok("D8 B7 — runed clothing's Spell Effect is read", spellEffectRunesOf(clothing).length === 1 && spellEffectRunesOf(clothing)[0].kind === "armour");
  ok("D9 and granted only with no armour over it",
    spellEffectGrants([clothing]).length === 1
    && spellEffectGrants([clothing, { type: "armour", name: "Chain", system: { equipped: true, coversTorso: true, category: "Medium", runes: "" } }]).length === 0);
  const stale = ARMOUR_RUNES.filter((r) => /no floating-shield state|add them to the wearer's own Resistances field/.test(r.note ?? ""));
  ok("D10 A8 — no rune note says the system cannot do what it does", stale.length === 0, stale.map((r) => r.key).join(", "));
}

/* ================================================================== *
 * E. Specific armour
 * ================================================================== */
{
  ok("E1 R3 — a specific item's quality is not applied again",
    /const printedFinal = Boolean\(item\.flags\?\.\["trg-prime"\]\?\.specificItem\);\s*if \(printedFinal\) \{/.test(ACTOR));
  const specific = { type: "armour", parent: {}, flags: { "trg-prime": { specificItem: { runes: [] } } }, system: {} };
  ok("E2 A10 — Customise is not offered for a specific item",
    shouldOfferCustomisation(specific, "u", { currentUserId: "u" }) === false
    && shouldOfferCustomisation({ ...specific, flags: {} }, "u", { currentUserId: "u" }) === true);
  ok("E3 nor does a compendium refresh re-price one",
    /const specific = Boolean\([^)]*specificItem[^)]*\);\s*const customised = !specific &&/.test(REFRESH));
  const quick = { type: "armour", id: "q", name: "Quick Plate", system: { equipped: true, runes: "Potency I, Spell Effect (Haste, 1/day)" },
    flags: { "trg-prime": { specificItem: { activationAP: 1 } } } };
  const grant = spellEffectGrants([quick])[0];
  ok("E4 R10/B2 — Quick Plate grants Haste 1/day at its own 1 AP", grant?.spell === "Haste" && grant.castAP === 1);
  ok("E5 and the granted spell takes the item's AP", RUNESPELL.includes("if (Number(grant.castAP) > 0) data.system.castAP = Number(grant.castAP);"));
}

/* ================================================================== *
 * F. Charged items
 * ================================================================== */
{
  const sc = (pp, level) => castFromItemOptions({ spellPPCost: pp, spellTradition: "arcane", casterLevel: level, casterTradition: "arcane" })[0];
  ok("F1 R20 — Spellcraft reaches PP up to caster level + 1", sc(2, 1).available && !sc(3, 1).available && sc(6, 5).available);
  ok("F2 A13 — a charged item's DC level is its printed level", chargedItemLevelOf({ system: { itemLevel: 6 }, flags: { "trg-prime": { chargedItem: { kind: "rod", spells: [] } } } }) === 6
    && SKILLOPT.includes("const level = chargedItemLevelOf(item);"));
  ok("F3 A14 — a built rod holds 10 PP", buildCharged("rod", { spells: [{ name: "X", pp: 2 }, { name: "Y", pp: 4 }] }).maximumPP === 10);
  ok("F4 and a spell's school is the trait naming one of the eight",
    BUILDERF.includes("SPELL_SCHOOLS.some((school) => school.toLowerCase() === t)") && !BUILDERF.includes('split(",")[0].trim()'));
  ok("F5 A15 — a flexible wand warps to its printed PP, not its pool",
    warpCeiling({ kind: "wand", maximumPP: 18, flexible: true }).ceiling === 6 && warpCeiling({ kind: "staff", level: 8 }).ceiling === 8);
  ok("F6 R18 — the printed recharge stands", itemRecharge({ maximumPP: 28, printedRecharge: 2 }) === 2
    && itemRecharge({ maximumPP: 28 }) === dailyRecharge(28) && itemRecharge({ maximumPP: 28, printedRecharge: 2 }, { invested: false }) === 0
    && CHARGEDF.includes("const gain = itemRecharge(charged, { invested: Boolean(item.system?.invested) });"));
  const choose = body(CHARGEDF, "async function chooseItemWarp(");
  ok("F7 B10/R19 — the warp is chosen from the spell's own options, capped by the item",
    choose.includes("buildWarpChooser(spell, base)") && choose.includes("if (total > ceiling) {")
    && choose.includes("warp: { form, mods:") && !CHARGEDF.includes('name="warpTo"'));
  ok("F8 a flexible wand starts from the spell's own base cost", choose.includes("const base = flexible && spell ? Math.max(0, Math.floor(Number(spell.system?.ppCost ?? listed) || 0)) : listed;"));
  ok("F9 R17 — a held rod, staff or wand stands in for the somatic hand",
    GATE.includes('["rod", "staff", "wand"].includes(String(i.flags?.["trg-prime"]?.chargedItem?.kind ?? "").toLowerCase())')
    && GATE.includes("!(implementHand && focusSatisfiesHand(components)) &&"));
  const hc = CAST.indexOf("if (healingChannelApplies(spell.name, hasHealingChannel) && Array.isArray(effEffects)) {");
  const cure = CAST.indexOf("const cureBonus = Math.max(0, ...Array.from(actor.items ?? [])");
  ok("F10 B9 — a Staff of Cure's +1 to Cure, after Healing Channel", hc > -1 && cure > hc);
}

/* ================================================================== *
 * G. The packs, the repairs and the version
 * ================================================================== */
{
  const specific = await packRows("specific-items");
  ok("G1 Diplomat Armour and Quick Plate cover the torso",
    specific.get("Diplomat Armour")?.system?.coversTorso === true && specific.get("Quick Plate")?.system?.coversTorso === true);
  ok("G2 Quick Plate's Haste and Air Drake's electricity are runes",
    specific.get("Quick Plate")?.system?.runes === "Potency I, Spell Effect (Haste, 1/day)"
    && specific.get("Quick Plate")?.flags?.["trg-prime"]?.specificItem?.activationAP === 1
    // 3.616.0 added its Fly (R11) after the electricity; the electricity
    // is what this check is about.
    && /^Potency II, Energy Resistance I \(electricity\)/.test(specific.get("Air Drake Armour")?.system?.runes ?? ""));
  ok("G3 Elven Chainmail's Shadow I stays +1 (R4)", runeBonusesFor({ type: "armour", name: "E", system: specific.get("Elven Chainmail")?.system ?? {} })
    .bonuses.some((b) => b.target === "system.skills.stealth" && b.entry.value === 1));

  const runes = await packRows("runes");
  ok("G4 the potency runes go on their own kind", JSON.stringify(runes.get("Shield Potency II")?.flags?.["trg-prime"]?.rune?.on) === '["shield"]'
    && JSON.stringify(runes.get("Armour Potency II")?.flags?.["trg-prime"]?.rune?.on) === '["armour"]');
  ok("G5 Animated's description no longer says there is no floating state",
    !/no floating-shield state/.test(runes.get("Animated I")?.system?.description ?? "x"));
  ok("G6 Spell Effect (Armour) is the wearer's", /allows the wearer to cast/.test(runes.get("Spell Effect (Armour)")?.system?.description ?? ""));

  const charged = await packRows("charged-items");
  const spellsOf = (n) => (charged.get(n)?.flags?.["trg-prime"]?.chargedItem?.spells ?? []).map((s) => s.name);
  ok("G7 A16 — Verdant Staff carries Shillelagh", spellsOf("Verdant Staff").includes("Shillelagh"));
  ok("G8 B8 — Rod of Alertness casts See Invisible", spellsOf("Rod of Alertness").includes("See Invisible"));
  const vs = charged.get("Versarians Sight")?.flags?.["trg-prime"]?.chargedItem ?? {};
  ok("G9 A17/R18 — Versarians Sight: 28 PP as printed, Recharge 2",
    vs.printedPowerPoints === 28 && vs.correctedFromPrinted === false && vs.printedRecharge === 2
    && !/The book prints 16 PP/.test(charged.get("Versarians Sight")?.system?.description ?? "x"));
  ok("G10 Staff of Cure's stale note is gone, and its +1 to Cure is data",
    !/The book prints 8 PP/.test(charged.get("Staff of Cure")?.system?.description ?? "x")
    && charged.get("Staff of Cure")?.flags?.["trg-prime"]?.chargedItem?.cureBonus === 1
    && charged.get("Staff of Healing")?.flags?.["trg-prime"]?.chargedItem?.cureBonus === 1);
  const withBonus = ["Animal Staff", "Staff of Imagery", "Staff of the Coast Runner", "Verdant Staff", "Versarians Sight"]
    .filter((n) => (charged.get(n)?.flags?.["trg-prime"]?.conditionals ?? []).length === 1);
  ok("G11 B9 — five staves carry their item bonus as a conditional", withBonus.length === 5, withBonus.join(", "));
  ok("G12 no leaked book text in the wands",
    !/OTHER CHARGED ITEMS/.test(charged.get("Wand of Charm Kind")?.system?.description ?? "x")
    && !/\[Heading 1\]/.test(charged.get("Wand of Magic Missile")?.system?.description ?? "x"));

  // BY ID, not by `since`: 3.616.0 moved the Air Drake entry on when its
  // Fly joined the runes (R11).
  const mine = PACK_REPAIRS.filter((e) => /-3615$/.test(e.id));
  ok("G13 four repair entries carry the specific armours to owned copies",
    mine.length === 4 && mine.every((e) => e.pack === "specific-items"));
  const sys = JSON.parse(read("system.json"));
  const gate = /runIf\("(\d+\.\d+\.\d+)", "stale owned copies/.exec(read("module", "migration.mjs"))?.[1];
  const atLeast = (v) => { const [a, b] = String(v).split(".").map(Number); return a > 3 || (a === 3 && b >= 615); };
  ok("G14 the version and schema are 3.615 or later, and the gate is current",
    // THE SCHEMA MAY TRAIL THE VERSION (3.616.1): a point release that
    // changes no stored shape keeps the schema at its newest migration pass,
    // which verify-speed-pool F4 requires. It may never lead it.
    atLeast(sys.version) && atLeast(TRG_SCHEMA_VERSION) && TRG_SCHEMA_VERSION.localeCompare(sys.version, undefined, { numeric: true }) <= 0 && atLeast(gate));
}

if (failures.length) {
  console.log(`verify-block36: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block36: OK — ${checks} checks. Potency, Energy Resistance, the timed runes, Indestructible, the specific armours and the charged items.`);
