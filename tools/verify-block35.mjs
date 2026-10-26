#!/usr/bin/env node
/**
 * verify-block35 — block 35, part one (3.613.0).
 *
 * NEW at 3.613.0. The audit is claude/audit-pages-351-360.md; Graham's
 * rulings of 2 October 2026 are R1–R15, of which this release builds R1,
 * R3, R4, R5, R12, R13 and R14 and the audit's no-ruling fixes.
 *
 *   A  R1   a check's abilities, and Physical Boost reaching all of them
 *   B  R3   a live aura that carries a resistance (Protector's Sphere)
 *   C  R4   one per-round advantage however many castings
 *   D  R5   Shifting Form's chooser, half-Speed grants, the claws
 *   E  R12  a strike rider of the weapon's own die (Weapon Surge)
 *   F  R13  rows gated on the attack's outcome (Sickly Ray)
 *   G  R14  counteracting an effect by its source's trait
 *   H       the no-ruling fixes
 *   I       the pack, the repairs and the version
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { checkAbilities, weaponAttackAbilities, SAVE_ABILITIES } from "../module/dice/check-abilities.mjs";
import {
  normaliseHeldBonus, heldBonusMatches, heldBonusCastLine, heldOffersThisRound, heldRoundKey
} from "../module/magic/held-bonus.mjs";
import { LIVE_EMANATION_EFFECT_KINDS, emanationIsLive } from "../module/magic/emanation.mjs";
import { emanationEffectData } from "../module/magic/emanation-effects.mjs";
import { warpedEmanationEffects, warpMaxTimes, aggregateWarpSelection } from "../module/magic/spell-warp.mjs";
import { normaliseGrantedSpeed, grantedSpeedBase } from "../module/combat/granted-speeds.mjs";
import { normaliseGrantedAbility } from "../module/magic/granted-ability.mjs";
import { normaliseStrikeRider, riderPacketsFor, riderCastLine, weaponOwnDie } from "../module/magic/strike-riders.mjs";
import { attackRowRecipients } from "../module/magic/attack-degree-rows.mjs";
import {
  normaliseCounteract, counteractCandidates, nothingToCounteractLine, traitList
} from "../module/magic/counteract-row.mjs";
import { warpedThorns, normaliseThorns } from "../module/magic/thorns.mjs";
import { warpedHealFormula } from "../module/magic/caster-level-mods.mjs";
import { warpedConditionValue } from "../module/magic/condition-warp.mjs";
import { normaliseHealingRate } from "../module/magic/healing-rate.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { TRG_SCHEMA_VERSION } from "../module/migration.mjs";
import { PACK_REPAIRS } from "../module/data/pack-repairs.mjs";
import { PLAN } from "./block35-plan.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const CHECK = read("module", "dice", "check.mjs");
const ATTACK = read("module", "combat", "attack-workflow.mjs");
const CARD = read("module", "dice", "check-card-interactions.mjs");
const SPEND = read("module", "magic", "held-bonus-workflow.mjs");
const FX = read("module", "magic", "spell-effects.mjs");
const CAST = read("module", "magic", "cast-workflow.mjs");
const APPLY = read("module", "combat", "effect-application-workflow.mjs");
const RIDERF = read("module", "magic", "strike-riders-workflow.mjs");
const row = (name, kind, i = 0) => (PLAN[name]?.effects ?? []).filter((e) => e.kind === kind)[i];

/* ================================================================== *
 * A. R1 — "any check affected by the ability score"
 * ================================================================== */
{
  ok("A1 an attribute check is based on that attribute",
    JSON.stringify(checkAbilities({ type: "attribute", subject: "strength" })) === '["strength"]');
  ok("A2 a skill is based on its governing ability, the actor's own first",
    JSON.stringify(checkAbilities({ type: "skill", subject: "athletics" })) === '["strength"]'
    && JSON.stringify(checkAbilities({ type: "skill", subject: "acrobatics" })) === '["dexterity"]'
    && JSON.stringify(checkAbilities({ type: "skill", subject: "athletics" }, { skills: { athletics: { ability: "dexterity" } } })) === '["dexterity"]');
  ok("A3 Fortitude is Constitution, Reflex Dexterity, Will Wisdom",
    SAVE_ABILITIES.fortitude === "constitution" && SAVE_ABILITIES.reflex === "dexterity" && SAVE_ABILITIES.will === "wisdom"
    && JSON.stringify(checkAbilities({ type: "save", subject: "reflex" })) === '["dexterity"]');
  ok("A4 initiative is Dexterity and Wisdom",
    JSON.stringify(checkAbilities({ type: "initiative" })) === '["dexterity","wisdom"]');
  ok("A5 an attack names only what its caller names; damage and Spellcraft name nothing",
    checkAbilities({ type: "attack" }).length === 0 && checkAbilities({ type: "damage" }).length === 0
    && checkAbilities({ type: "spellcraft", subject: "spellcraft" }).length === 0
    && JSON.stringify(checkAbilities({ type: "attack", abilities: ["Strength", "nonsense"] })) === '["strength"]');
  ok("A6 a Strike is Strength in melee, Dexterity at range, both with finesse",
    JSON.stringify(weaponAttackAbilities({})) === '["strength"]'
    && JSON.stringify(weaponAttackAbilities({ ranged: true })) === '["dexterity"]'
    && JSON.stringify(weaponAttackAbilities({ finesse: true })) === '["strength","dexterity"]');
  ok("A7 a check works its abilities out when rolled and the card carries them",
    /this\.abilities = checkAbilities\(\{ type: this\.type, subject: this\.subject, abilities: config\.abilities \}/.test(CHECK)
    && CHECK.includes("              abilities: this.abilities,"));
  ok("A8 a weapon Strike names its abilities",
    ATTACK.includes("abilities: weaponAttackAbilities({ ranged: isRanged, finesse }),"));
  const pb = normaliseHeldBonus(row("Physical Boost", "heldBonus"));
  ok("A9 Physical Boost reaches a Strength skill, a Reflex save and a melee Strike",
    pb && heldBonusMatches(pb, { type: "skill", subject: "athletics" })
    && heldBonusMatches(pb, { type: "save", subject: "reflex" })
    && heldBonusMatches(pb, { type: "attack", abilities: ["strength"] })
    && heldBonusMatches(pb, { type: "initiative" }));
  ok("A10 …and not an Intelligence skill, a Will save, a spell attack or damage",
    pb && !heldBonusMatches(pb, { type: "skill", subject: "arcana" })
    && !heldBonusMatches(pb, { type: "save", subject: "will" })
    && !heldBonusMatches(pb, { type: "attack" })
    && !heldBonusMatches(pb, { type: "damage", subject: "strength" }));
  ok("A11 the ability axis survives the round trip through the flag",
    pb && JSON.stringify(normaliseHeldBonus(pb)) === JSON.stringify(pb));
  ok("A12 the cast line names the abilities as the page does",
    pb && heldBonusCastLine(pb).includes("one Strength, Dexterity or Constitution-based check"));
}

/* ================================================================== *
 * B. R3 — Protector's Sphere
 * ================================================================== */
{
  const plan = PLAN["Protector’s Sphere"];
  ok("B1 a resistance travels with an emanation", LIVE_EMANATION_EFFECT_KINDS.includes("defence"));
  ok("B2 Protector's Sphere is a live emanation", emanationIsLive({ area: plan.area, effects: plan.effects }));
  const data = emanationEffectData({ name: "Protector's Sphere", effects: plan.effects }, "c1", "Wiz");
  ok("B3 a creature walking in carries the resistance",
    data?.changes?.some((c) => c.key === "system.combat.resistances" && c.value === ", physical (adamantine)"));
  const warped6 = warpedEmanationEffects(plan.effects, aggregateWarpSelection(plan.warps, { "warp-0": 1 }).mods);
  const warped10 = warpedEmanationEffects(plan.effects, aggregateWarpSelection(plan.warps, { "warp-0": 1, "warp-1": 1 }).mods);
  ok("B4 the warps widen it to physical, then to all damage",
    warped6[0]?.value === "physical" && warped10[0]?.value === "all damage");
  ok("B5 an immunity warp turns an emanation's resistance into an immunity",
    warpedEmanationEffects([{ kind: "defence", field: "resistance", value: "fire" }], { defenceField: "immunity" })[0]?.field === "immunity");
  ok("B6 a bonus emanation is unchanged",
    JSON.stringify(warpedEmanationEffects([{ kind: "bonus", slot: "defence", value: 1 }], {})) === '[{"kind":"bonus","slot":"defence","value":1}]');
}

/* ================================================================== *
 * C. R4 — one advantage a round however many castings
 * ================================================================== */
{
  const now = heldRoundKey({ combatId: "c", round: 3 });
  const ih = (id, spent = null) => ({ effect: { id }, spec: { label: "Inspire Heroics", perRound: true }, spentKey: spent });
  const once = (id) => ({ effect: { id }, spec: { label: "Guidance", perRound: false } });
  ok("C1 two unspent castings offer one button",
    heldOffersThisRound([ih("a"), ih("b")], now).length === 1);
  ok("C2 one casting spent this round offers none",
    heldOffersThisRound([ih("a", now), ih("b")], now).length === 0);
  ok("C3 spent in an earlier round is offered again",
    heldOffersThisRound([ih("a", heldRoundKey({ combatId: "c", round: 2 }))], now).length === 1);
  ok("C4 a once-only bonus is untouched — two Guidances are two",
    heldOffersThisRound([once("g1"), once("g2"), ih("a")], now).length === 3);
  ok("C5 the card filters through it",
    CARD.includes("const held = heldOffersThisRound(candidates, roundNow);"));
  ok("C6 spending refuses when another casting of it was spent this round",
    /const siblingSpent = [\s\S]{0,500}if \(siblingSpent\) return false;\s*\n\s*await effect\.setFlag\(SYSTEM_ID, HELD_SPENT_ROUND_FLAG, key\);/.test(SPEND));
}

/* ================================================================== *
 * D. R5 — Shifting Form
 * ================================================================== */
{
  const modes = PLAN["Shifting Form"].apOptions;
  ok("D1 Shifting Form offers the page's choices — six, swim and climb apart",
    modes.length === 6 && modes.every((m) => m.ap === 1 && Array.isArray(m.effects) && m.effects.length === 1));
  const half = normaliseGrantedSpeed({ key: "climb", feet: 0, orLand: true, landFraction: 0.5 }, ["climb", "swim"]);
  ok("D2 half the Speed is half the Speed, rounded down to the grid",
    half?.landFraction === 0.5 && grantedSpeedBase(half, 30) === 15 && grantedSpeedBase(half, 25) === 10);
  ok("D3 a whole-Speed grant is unchanged, and a nonsense share is ignored",
    JSON.stringify(normaliseGrantedSpeed({ key: "fly", feet: 20, orLand: true }, ["fly"])) === '{"key":"fly","feet":20,"orLand":true}'
    && normaliseGrantedSpeed({ key: "fly", feet: 0, orLand: true, landFraction: 3 }, ["fly"])?.landFraction === undefined);
  ok("D4 the grant survives the round trip",
    JSON.stringify(normaliseGrantedSpeed(half, ["climb"])) === JSON.stringify(half));
  const claws = modes.find((m) => /claws/i.test(m.label))?.effects?.[0];
  const spec = normaliseGrantedAbility(claws);
  ok("D5 the claws are the pack's Claw, laid over with the page's 1d6 slashing agile finesse",
    spec?.uuid?.includes("creature-attacks") && spec.system?.damage === "1d6" && spec.system?.damageType === "slashing"
    && spec.system?.traits === "Agile, Finesse");
  ok("D6 the grant lays the overrides over the copy",
    FX.includes("if (spec.system) payload.system = { ...(payload.system ?? {}), ...spec.system };"));
  ok("D7 a grant with no overrides is unchanged",
    JSON.stringify(normaliseGrantedAbility({ uuid: "X", label: "Y" })) === '{"uuid":"X","label":"Y"}');
  ok("D8 Darkvision and Scent come from the abilities pack",
    modes.filter((m) => m.effects[0].kind === "grantAbility" && m.effects[0].uuid.includes(".abilities.")).length === 2);
}

/* ================================================================== *
 * E. R12 — Weapon Surge's extra die
 * ================================================================== */
{
  const raw = row("Weapon Surge", "strikeRider");
  const spec = normaliseStrikeRider({ ...raw, weaponId: "w1" });
  ok("E1 a weapon-die rider needs no dice and no type of its own",
    spec?.weaponDie === true && spec.dice === "" && spec.damageType === "");
  ok("E2 …and survives the round trip", JSON.stringify(normaliseStrikeRider(spec)) === JSON.stringify(spec));
  ok("E3 an ordinary rider still needs both", normaliseStrikeRider({ label: "X", scope: "any" }) === null);
  ok("E4 one die of the weapon's size, of its first type",
    JSON.stringify(weaponOwnDie({ damage: "2d6", damageType: "Slashing, Piercing" })) === '{"dice":"1d6","type":"slashing"}'
    && weaponOwnDie({ damage: "" }) === null);
  const packets = riderPacketsFor([spec], { weaponId: "w1", damage: "1d8", damageType: "piercing" });
  ok("E5 the next Strike with that weapon carries it", packets.length === 1 && packets[0].dice === "1d8" && packets[0].type === "piercing");
  ok("E6 another weapon does not", riderPacketsFor([spec], { weaponId: "w2", damage: "1d8" }).length === 0);
  ok("E7 the cast card names it as the weapon's own", riderCastLine(spec).includes("weapon's own damage dice"));
  ok("E8 the strike reads the weapon's die and type", RIDERF.includes('damage: String(weapon?.system?.damage ?? ""),'));
  ok("E9 Weapon Surge lasts until the start of your next turn and keeps its +1",
    PLAN["Weapon Surge"].duration === "until the start of your next turn"
    && normaliseHeldBonus(row("Weapon Surge", "heldBonus"))?.value === 1);
}

/* ================================================================== *
 * F. R13 — Sickly Ray
 * ================================================================== */
{
  const [hit, crit] = [{ name: "Hit" }, { name: "Crit" }];
  const results = [{ target: hit, critical: false }, { target: crit, critical: true }];
  const rows = PLAN["Sickly Ray"].effects;
  const reach = (r) => attackRowRecipients(r, [hit, crit], results).map((t) => t.name).join();
  ok("F1 sickened 1 lands on a hit, not a critical", reach(rows[0]) === "Hit");
  ok("F2 sickened 2 and slowed 1 land on a critical only", reach(rows[1]) === "Crit" && reach(rows[2]) === "Crit");
  ok("F3 an ungated row lands on every struck target", attackRowRecipients({ kind: "condition" }, [hit, crit], results).length === 2);
  ok("F4 the slowed ends with the sickened", rows[2].endsWith === "sickened"
    && FX.includes("...(effect.endsWith ? { endsWith: String(effect.endsWith).trim() } : {})"));
  ok("F5 the cast hands the effect engine how each target was struck",
    // 3.672.0 adds the critical's severity to each (Water Bolt's push).
    CAST.includes(".map((r) => ({ target: r?.targetActor ?? null, critical: Boolean(r?.critical), severity: r?.critical?.severity ?? null }))")
    && FX.includes("recipients = attackRowRecipients(effect, recipients, attackResults);"));
}

/* ================================================================== *
 * G. R14 — "one emotion effect"
 * ================================================================== */
{
  const words = normaliseCounteract(row("Soothing Words", "counteract"));
  ok("G1 Soothing Words counteracts one emotion effect: frightened, fleeing, or an emotion spell's",
    words && words.limit === 1 && words.traits.includes("emotion")
    && JSON.stringify(words.conditions) === '["frightened","fleeing"]');
  const effects = [
    { id: "e1", name: "Frightened", statuses: ["frightened"], sourceTraits: ["fear", "emotion"] },
    { id: "e2", name: "Charmed", statuses: [], sourceTraits: "Emotion, Enchantment" },
    { id: "e3", name: "Bless", statuses: [], sourceTraits: ["warding"] }
  ];
  const got = counteractCandidates(words, (c) => c === "frightened", effects);
  ok("G2 a named condition once, then any effect of an emotion spell, and nothing else",
    got.map((g) => `${g.kind}:${g.key}`).join() === "condition:frightened,effect:e2");
  ok("G3 a row with no traits is Restore Senses as before",
    counteractCandidates(normaliseCounteract({ kind: "counteract", conditions: ["blinded"] }), () => true, effects).length === 1);
  ok("G4 a row naming nothing is still refused",
    normaliseCounteract({ kind: "counteract", conditions: [] }) === null);
  ok("G5 nothing to counteract says both halves",
    nothingToCounteractLine("Ally", words).includes("not frightened or fleeing") && nothingToCounteractLine("Ally", words).includes("emotion"));
  ok("G6 a spell's condition carries the spell's traits",
    // BOTH BRANCHES — a valued condition and an unvalued one.
    APPLY.split("updates[`flags.${SYSTEM_ID}.${SOURCE_TRAITS_FLAG}`] = sourceTraits;").length - 1 === 2
    && FX.includes("sourceTraits: traitList(spell?.system?.traits)")
    && JSON.stringify(traitList("Composition, Emotion")) === '["composition","emotion"]');
  ok("G7 the counteract never takes the casting's own effects",
    FX.includes("&& x.origin !== spell.uuid && !(castId && x.flags?.[SYSTEM_ID]?.castId === castId)"));
  ok("G8 more than the limit asks the caster which",
    FX.includes("if (spec.limit && held.length > spec.limit) {"));
  const ballad = normaliseCounteract(row("Soothing Ballad", "counteract"));
  ok("G9 Soothing Ballad counteracts fear and paralysis, every one", ballad && ballad.limit === 0
    && ballad.conditions.includes("paralyzed") && ballad.traits.includes("fear"));
}

/* ================================================================== *
 * H. The no-ruling fixes
 * ================================================================== */
{
  ok("H1 Wizard Strike gives advantage", normaliseHeldBonus(row("Wizard Strike", "heldBonus"))?.kind === "advantage");
  ok("H2 Purge The Unlife is undead only", PLAN["Purge The Unlife"].kindGate === "undead");
  ok("H3 Unliving Vitality grants fast healing 5, undead only, and is beneficial",
    normaliseHealingRate(row("Unliving Vitality", "healingRate"))?.value === 5
    && PLAN["Unliving Vitality"].kindGate === "undead" && PLAN["Unliving Vitality"].beneficial === true);
  const rt = aggregateWarpSelection(PLAN["Renewal’s Touch"].warps, { "warp-0": 1 }).mods;
  ok("H4 Renewal's Touch's warp adds 1d8+8", warpedHealFormula("2d8 + 16", rt) === "2d8 + 16 + 1d8 + 8");
  const surge = aggregateWarpSelection(PLAN["Surge Of The Tempest"].warps, { "warp-0": 2 }).mods;
  ok("H5 Surge Of The Tempest's Fumble recurs, and grows with the warp",
    row("Surge Of The Tempest", "condition", 1)?.condition === "recurring"
    && row("Surge Of The Tempest", "condition", 1)?.damageType === "electricity"
    && warpedConditionValue(1, surge, {}) === 3);
  ok("H6 Talon Strike's 2d6 is bought once", warpMaxTimes(PLAN["Talon Strike"].warps[0]) === 1
    && warpMaxTimes({ mods: { damageDice: "1d6" } }) > 1);
  const spoil = aggregateWarpSelection(PLAN["Spoil The Profane"].warps, { "warp-1": 4 }).mods;
  ok("H7 Spoil The Profane's weakened grows to 5 and no further",
    warpedConditionValue(1, spoil, {}) === 5 && warpMaxTimes(PLAN["Spoil The Profane"].warps[1]) === 4
    && FX.includes("conditionValue: warpedConditionValue(Math.max(1, Number(effect.conditionValue ?? 1) || 1), warpMods, effect)"));
  const thorns = normaliseThorns(warpedThorns(row("Vibrant Thorns", "thorns"), 1));
  ok("H8 Vibrant Thorns' warp: 2, or 2d6 intensified", thorns?.damage === "2" && thorns.intensified === "2d6"
    && FX.includes("const spec = normaliseThorns(warpedThorns(effect, warpBonus));"));
  ok("H9 the thorns' 'by hand' note is gone, and the warp says essence",
    !(PLAN["Vibrant Thorns"].effects.some((e) => e.kind === "note")) && /essence spell/.test(PLAN["Vibrant Thorns"].warps[0].text));
  const vs = row("Veiled Secret", "conditional");
  ok("H10 Veiled Secret's +4 is offered on skills and saves, never automatic",
    vs?.grants?.length === 2 && vs.grants.every((g) => g.value === 4 && !g.auto));
  const was = row("Wash Away Sin", "conditional");
  ok("H11 Wash Away Sin's allies hold +1 against fear and disease until your next turn",
    was?.target === "allies" && was.duration === "until the start of your next turn"
    && JSON.stringify(was.grants[0].when.traits) === '["fear","disease"]');
  ok("H12 Wash Away Sin's die warp grows the heal", warpedHealFormula("1d8", aggregateWarpSelection(PLAN["Wash Away Sin"].warps, { "warp-0": 1 }).mods) === "2d8");
  ok("H13 Resilient Fortitude resists the trigger until the end of the turn; the warp makes it immunity",
    row("Resilient Fortitude", "defence")?.value === "all damage"
    && PLAN["Resilient Fortitude"].duration === "until the end of the current turn"
    && PLAN["Resilient Fortitude"].warps[0].mods.defenceField === "immunity");
  ok("H14 Stasis's Success stuns 1", row("Stasis", "condition")?.condition === "stunned"
    && JSON.stringify(row("Stasis", "condition")?.onSave) === '["success"]');
  ok("H15 every planned row is a kind the engine handles",
    Object.values(PLAN).flatMap((p) => [...(p.effects ?? []), ...(p.apOptions ?? []).flatMap((m) => m.effects ?? [])])
      .every((e) => HANDLED_EFFECT_KINDS.includes(e.kind) || e.kind === "note"));
}

/* ================================================================== *
 * I. The pack, the repairs, the version
 * ================================================================== */
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  const held = {};
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && PLAN[value?.name]) held[value.name] = value.system;
    }
  } finally {
    await db.close();
  }
  // A FIELD BLOCK 35'S SECOND PART REWROTE (3.614.0) is that plan's to answer
  // for — Stasis's rows and Renewal's Touch's warps. See verify-block35b I.
  const { PLAN: LATER } = await import("./block35b-plan.mjs");
  for (const [name, plan] of Object.entries(PLAN)) {
    for (const [field, to] of Object.entries(plan)) {
      if (LATER[name]?.[field] !== undefined) continue;
      ok(`I1 ${name}'s ${field} is the plan's`, JSON.stringify(held[name]?.[field]) === JSON.stringify(to));
      const entry = PACK_REPAIRS.find((e) => e.name === name && e.field === field && e.pack === "spells");
      ok(`I2 ${name}'s ${field} has a 3.613 repair entry to the plan's value`, entry && /^3\.613\.\d+$/.test(entry.since)
        && JSON.stringify(entry.to) === JSON.stringify(to));
    }
  }
  const sys = JSON.parse(read("system.json"));
  const gate = /runIf\("(\d+\.\d+\.\d+)", "stale owned copies/.exec(read("module", "migration.mjs"))?.[1];
  const atLeast = (v) => { const [a, b] = String(v).split(".").map(Number); return a > 3 || (a === 3 && b >= 613); };
  ok("I3 the version, the schema and the pack-copy gate are current, 3.613 or later",
    // THE SCHEMA MAY TRAIL THE VERSION (3.616.1): a point release that
    // changes no stored shape keeps the schema at its newest migration pass,
    // which verify-speed-pool F4 requires. It may never lead it.
    atLeast(sys.version) && atLeast(TRG_SCHEMA_VERSION) && TRG_SCHEMA_VERSION.localeCompare(sys.version, undefined, { numeric: true }) <= 0 && atLeast(gate));
  // THE GATE FOLLOWS THE NEWEST REPAIR ENTRY, not the release (3.614.1): a
  // point release with no new entries leaves it where it is, and
  // verify-pack-repairs F1b holds it to the manifest.
}

if (failures.length) {
  console.log(`verify-block35: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block35: OK — ${checks} checks. Block 35's ability-based checks, Protector's Sphere, one advantage a round, Shifting Form, Weapon Surge, Sickly Ray's critical, emotion counteracts, and the no-ruling fixes.`);
