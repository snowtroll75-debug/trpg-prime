#!/usr/bin/env node
/**
 * verify-ff30-block3 — 3.633.0, Fiends & Fables 3.0 block 3 (creature pages
 * 1–10: the stat-block rules, Aboleth, Aboleth Magi, Aetherlings, Avoral;
 * Graham's rulings of 11 October 2026: "go with your recommendations").
 *
 *   A  the pure rules, driven — printed innate numbers, weapon secondary
 *      packets, weapon-carried after-strikes and own afflictions, cures that
 *      reach a curse, Mucus Cloud's aura, several-packet breaths, High
 *      Magic, the EL adjustment, Extraplanar death, condition labels
 *   B  the workflows read them where the rule lives (source anchors)
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (p) => import(new URL(`../module/${p}`, import.meta.url));

/* ------------------------------------------------------------ A. printed innate numbers (R1) */
const ip = await mod("magic/innate-printed.mjs");
const printedSpell = { flags: { "trg-prime": { innatePrinted: { dc: 24, attack: 14 } } } };
equal("A1 a printed innate pair wins; an absent one is derived (10 + ability + level, ability + level)", [
  ip.innateSaveFor(printedSpell, 0, 9), ip.innateAttackFor(printedSpell, 0, 9),
  ip.innateSaveFor({}, 5, 9), ip.innateAttackFor({}, 5, 9),
  ip.innateSaveFor({ flags: { "trg-prime": { innatePrinted: { attack: 3 } } } }, 1, 1)
], [{ value: 24, printed: true }, { value: 14, printed: true }, { value: 24, printed: false }, { value: 14, printed: false }, { value: 12, printed: false }]);

/* ------------------------------------------------------------ A. secondary packets (R2) */
const sec = await mod("combat/creature-secondary.mjs");
const claw = (secondary, traits = "agile, finesse, magical") => ({ name: "Claw", type: "weapon", system: { traits }, flags: { "trg-prime": { creatureAttack: { secondary } } } });
const evil = { details: { traits: "Evil" } };
const plain = { details: { traits: "Humanoid" } };
const fire = sec.creatureSecondaryPackets(claw([{ dice: "1d4", type: "fire" }], "agile"));
equal("A2 'plus 1d4 fire' is a packet of its own type, as magical as the strike when the claw is not", fire.map((p) => [p.dice, p.type, p.conditional, p.mundane]), [["1d4", "fire", false, true]]);
const good = (t) => sec.creatureSecondaryPackets(claw([{ dice: "2d6", type: "good" }]), t)[0];
equal("A3 'plus 2d6 good' is aligned damage: it reaches an evil creature, not a neutral one, and waits for a target", [
  [good(evil).type, good(evil).applies, good(evil).resolved], [good(plain).applies, good(plain).resolved], [good(null).resolved, good(null).mundane]
], [["aligned", true, true], [false, true], [false, false]]);
equal("A17 an aligned packet's label carries its dice; its line names the alignment (3.633.1)", [good(evil).label, fire[0].label], ["Claw (2d6)", "Claw (1d4 fire)"]);
equal("A4 a malformed row, and a weapon with none, give nothing", [sec.creatureSecondaryPackets(claw([{ dice: "Life Drain", type: "" }])), sec.creatureSecondaryPackets({ name: "Bite", system: {} })], [[], []]);

/* ------------------------------------------------------------ A. weapon after-strikes, own affliction (R3), cures (R8) */
const das = await mod("combat/declared-after-strikes.mjs");
const tentacle = { type: "weapon", name: "Tentacle", flags: { "trg-prime": { afterStrikes: [{ key: "slime", label: "Slime", expose: { affliction: "Slime" } }] } } };
const specs = das.weaponAfterStrikes(tentacle);
equal("A5 a weapon's own after-strike fires for that weapon only", [specs.length, specs[0]?.weaponNames, specs[0]?.expose?.affliction, das.weaponAfterStrikes({ type: "ability", flags: tentacle.flags })], [1, ["tentacle"], "Slime", []]);
equal("A6 the attacker's own affliction item is found by name; none, null", [
  das.ownAfflictionItem({ items: [{ type: "weapon", name: "Slime" }, { type: "affliction", name: "Slime", id: "s" }] }, "slime")?.id,
  das.ownAfflictionItem({ items: [] }, "Slime")
], ["s", null]);
const cure = await mod("affliction-countered.mjs");
equal("A7 a disease cure reaches a disease, and a curse that declares it; not an ordinary curse", [
  cure.afflictionCounteredBy({ system: { afflictionType: "disease" } }, ["disease"]),
  cure.afflictionCounteredBy({ system: { afflictionType: "curse" }, flags: { "trg-prime": { counteredAs: ["disease"] } } }, ["disease", "poison"]),
  cure.afflictionCounteredBy({ system: { afflictionType: "curse" } }, ["disease"])
], [true, true, false]);

/* ------------------------------------------------------------ A. Mucus Cloud (R7) */
const ca = await mod("creature-auras.mjs");
const mucus = ca.normaliseAura({ radius: 5, save: "fortitude", emitterState: "submerged", exemptTraits: ["Aquatic"], immunitySeconds: 86400, immunityOn: "success",
  traitEffect: { name: "Mucus-Bound", seconds: 7200, traits: "Aquatic" } }, { id: "m", name: "Mucus Cloud" });
equal("A8 the declaration reads: emitter state, exempt traits, the trait effect on failed degrees", [mucus.emitterState, mucus.exemptTraits, mucus.traitEffect, ca.auraRolls(mucus),
  ca.auraTraitEffectLands(mucus, "failure"), ca.auraTraitEffectLands(mucus, "success")],
["submerged", ["aquatic"], { on: ["failure", "fumble", "blunder"], traits: "Aquatic", seconds: 7200, name: "Mucus-Bound", text: "" }, true, true, false]);
const emitter = (states) => ({ id: "e", centreFeet: { x: 0, y: 0 }, widthFeet: 15, auras: [mucus], states });
const subject = (traits) => ({ id: "s", centreFeet: { x: 10, y: 0 }, immunities: {}, traits });
equal("A9 it catches an air-breather beside a submerged Aboleth — not a dry one, not an aquatic creature", [
  ca.aurasCatching({ trigger: "enter", subject: subject(["humanoid"]), emitters: [emitter(["submerged"])] }).length,
  ca.aurasCatching({ trigger: "enter", subject: subject(["humanoid"]), emitters: [emitter([])] }).length,
  ca.aurasCatching({ trigger: "enter", subject: subject(["aquatic"]), emitters: [emitter(["submerged"])] }).length
], [1, 0, 0]);

const large = { id: "s", centreFeet: { x: 55, y: 25 }, widthFeet: 10, immunities: {}, traits: ["beast"] };
const huge = { ...emitter(["submerged"]), centreFeet: { x: 42.5, y: 22.5 } };
equal("A16 a Large creature adjacent to the Aboleth is caught by its near edge (3.633.1, found live)", [
  ca.aurasCatching({ trigger: "enter", subject: large, emitters: [huge] }).length,
  ca.aurasCatching({ trigger: "enter", subject: { ...large, widthFeet: 5 }, emitters: [huge] }).length
], [1, 0]);

/* ------------------------------------------------------------ A. several-packet breaths (R10) */
const area = await mod("creature-area.mjs");
const ice = area.moduleBreathArea({ type: "ability", name: "Breath Weapon", system: { description: "Action 2 AP (cold, save, verdant). The Aetherling breathes a 15-foot cone that inflicts 1d6 slashing plus 1d6 cold. Targets may make a basic Reflex save." } });
equal("A10 '1d6 slashing plus 1d6 cold' is a breath of two packets", [ice?.damage, ice?.extraDamage, ice?.save, ice?.ap], [{ formula: "1d6", type: "slashing" }, [{ formula: "1d6", type: "cold" }], "reflex", 2]);
const pe = await mod("peril-effect.mjs");
equal("A11 the area spec keeps good further packets and drops malformed ones", pe.perilEffectSpec({ save: "reflex", extraDamage: [{ formula: "1d6", type: "cold" }, { formula: "lots", type: "fire" }, { dice: "2d4", type: "Acid" }] }).extraDamage,
  [{ formula: "1d6", type: "cold" }, { formula: "2d4", type: "acid" }]);

/* ------------------------------------------------------------ A. High Magic (R12) */
const hm = await mod("magic/high-magic.mjs");
const high = { flags: { "trg-prime": { highMagic: true } } };
equal("A12 High Magic: +2 to a derived DC (not a printed one), free Heighten, +50 to the fumble", [
  hm.highMagicSaveStep(high), hm.highMagicSaveStep(high, { printed: true }), hm.highMagicSaveStep({}),
  hm.highMagicHeightens(high), hm.highMagicHeightens({}), hm.highMagicHeightens({}, true), hm.highMagicFumble(high), hm.highMagicFumble({})
], [2, 0, 0, true, false, true, 50, 0]);

/* ------------------------------------------------------------ A. Adjusting Level (R13) */
const el = await mod("el-adjust.mjs");
const rows = el.elAdjustRows({ skills: { perception: {}, stealth: {} }, specialistSkills: { planes: {} } }, 2);
equal("A13 an EL step adds to every d20 pool and DB, and 8 HP; bounded to ±5", [
  rows.map((r) => r.path), rows[0].entry, el.elAdjustHP(-2), el.elAdjustOf({ flags: { "trg-prime": { elAdjust: 9 } } }), el.elAdjustOf({}), el.elAdjustRows({}, 0)
], [["system.combat.attack", "system.combat.defence", "system.combat.saves.fortitude", "system.combat.saves.reflex", "system.combat.saves.will", "system.magic.spellcraft", "system.skills.perception", "system.skills.stealth", "system.specialistSkills.planes"],
  { label: "EL adjustment +2", value: 2, type: "untyped", source: "elAdjust" }, -16, 5, 0, []]);

/* ------------------------------------------------------------ A. Extraplanar (R14), labels */
const ep = await mod("extraplanar.mjs");
const outsider = { name: "Avoral", type: "npc", system: { details: { traits: "Eternal, Extraplanar" }, gm: { isMook: true } } };
equal("A14 an Extraplanar creature is destroyed on death (when the world says so); a mook of one dies at 0 HP", [
  Boolean(ep.extraplanarDestructionLine(outsider)), ep.extraplanarDestructionLine(outsider, { enabled: false }), ep.extraplanarDestructionLine({ system: { details: { traits: "Humanoid" } } }),
  ep.extraplanarMookDiesAtZero(outsider), ep.extraplanarMookDiesAtZero({ ...outsider, system: { ...outsider.system, gm: {} } })
], [true, "", "", true, false]);
const cr = await mod("conditions/condition-rules.mjs");
equal("A15 every condition prints its own name", [cr.conditionLabel("controlled"), cr.conditionLabel("frightened"), cr.conditionLabel("prone")], ["Controlled", "Frightened", "Prone"]);

/* ------------------------------------------------------------ B. the workflows */
const src = {
  cast: read("module", "magic", "cast-workflow.mjs"), sheet: read("module", "sheets", "actor-sheet.mjs"), attack: read("module", "combat", "attack-workflow.mjs"),
  after: read("module", "combat", "declared-after-strikes-workflow.mjs"), spells: read("module", "magic", "spell-effects.mjs"), auraWf: read("module", "creature-aura-workflow.mjs"),
  traitFx: read("module", "aura-trait-effect-workflow.mjs"), init: read("scripts", "trg-prime.mjs"), peril: read("module", "peril-workflow.mjs"), actor: read("module", "documents", "actor.mjs"),
  tpl: read("templates", "actor", "actor-sheet.hbs"), settings: read("module", "settings.mjs"), death: read("module", "combat", "death-state.mjs"), epWf: read("module", "extraplanar-workflow.mjs")
};
ok("B1 the cast takes the printed innate attack and DC", /const innateAttackHere = (?:Number\.isFinite\(carried\?\.attackBonus\)\n[^\n]*\n\s+: )?innateAttackFor\(spell, innateAbility, innateLevel\);/.test(src.cast) && /value: innateAttackHere\.value,/.test(src.cast) && /const innateSaveHere = isInnate \? innateSaveFor\(spell, castingAbility, innateLevel\) : null;/.test(src.cast) && /\? innateSaveHere\.value/.test(src.cast));
ok("B2 the sheet shows the printed pair", /row\.innateAttack = innateAttackFor\(item, (?:innateAbility|ownAbility), innateLevel\)\.value;/.test(src.sheet) && /row\.innateSave = innateSaveFor\(item, (?:innateAbility|ownAbility), innateLevel\)\.value;/.test(src.sheet));
ok("B3 a creature's secondary packets join the strike's typed extras, with the target", /\.\.\.creatureSecondaryPackets\(weapon, targetActor\?\.system \?\? null\),?\n/.test(src.attack));
ok("B4 a weapon's after-strikes are read, and its own affliction exposed", /for \(const spec of weaponAfterStrikes\(weapon\)\) \{\n\s+const at = specs\.findIndex\(\(s\) => s\.key === spec\.key\);\n\s+if \(at < 0\) specs\.push\(spec\);/.test(src.after) && /const own = ownAfflictionItem\(actor, affliction\);/.test(src.after) && /data = own\.toObject\(\);/.test(src.after));
ok("B5 a counteract asks which cures reach the affliction", /&& afflictionCounteredBy\(i, kinds\)\);/.test(src.spells));
ok("B6 the aura reads the emitter's state, the subject's traits, and lays the trait effect", /\.\.\.\(Array\.from\(token\.actor\?\.effects \?\? \[\]\)\.some\(\(e\) => !e\.disabled && e\.getFlag\?\.\(SYSTEM_ID, "submerged"\)\) \? \["submerged"\] : \[\]\),/.test(src.auraWf) && /traits: creatureTraits\(token\.actor\?\.system \?\? \{\}\)\.map/.test(src.auraWf) && /lines\.push\(await applyAuraTraitEffect\(actor, aura\.traitEffect, \{ source: emitterToken\?\.name \?\? aura\.name \}\)\);/.test(src.auraWf));
ok("B7 Mucus-Bound grants its trait as a flag on a world clock, and the breath is settled both ways", /grantedTraits: effect\.traits, \[END_TIME_FLAG\]: now \+ effect\.seconds/.test(src.traitFx) && /await settleBreath\(actor, effect\.name\);/.test(src.traitFx) && /settleBreath\(actor, `\$\{effect\.name\} ends`\)/.test(src.traitFx) && /registerAuraTraitEffectHooks\(\);/.test(src.init));
ok("B8 further packets are rolled once and applied per target under the same save", /for \(const extra of spec\.extraDamage \?\? \[\]\) \{/.test(src.peril) && /const extraAmount = Math\.floor\(extra\.roll\.total \* bs\.damageMultiplier\);/.test(src.peril));
ok("B9 High Magic reaches the save DC, Heighten and the fumble", /\+ highMagicSaveStep\(actor, \{ printed: innateSaveHere\?\.printed === true \}\)\n\s*\+ harmonyHere;/.test(src.cast) && /heightenedSavePP\(totalPP, cap, highMagicHeightens\(actor, mm\.heightenSave(?: \|\| carried\?\.heighten === true)?\)\)/.test(src.cast) && /const highMagicMod = highMagicFumble\(actor\);/.test(src.cast));
ok("B10 the EL adjustment fills the pools before combat, adds HP, and is on the NPC sheet for the GM", /for \(const \{ path, entry \} of elAdjustRows\(system, elAdjustOf\(this\)\)\) this\.addBonus\(path, entry\);\n    prepareCombat\(system, this\);/.test(src.actor) && /if \(elHP\) hp\.max = Math\.max\(1, hp\.max \+ elHP\);/.test(src.actor) && /name="flags\.trg-prime\.elAdjust"/.test(src.tpl) && /context\.elAdjust = elAdjustOf\(actor\);/.test(src.sheet));
ok("B11 Extraplanar death: the setting, the card at death, the mook hook", /game\.settings\.register\(SYSTEM_ID, "extraplanarDestruction", \{/.test(src.settings) && /out\.extraplanar = await announceExtraplanarDestruction\(actor\);/.test(src.death) && /if \(!extraplanarMookDiesAtZero\(actor, \{ enabled: enabled\(\) \}\)\) return;/.test(src.epWf) && /registerExtraplanarHooks\(\);/.test(src.init));

ok("B12 an Extraplanar mook at 0 HP is made dead, then reaped (3.633.1, found live)", /await actor\.toggleStatusEffect\("dying", \{ active: true, value: fatal \}\);\n  return reapDead\(actor\);/.test(src.epWf) && /dieAtZero\(actor\)\.catch/.test(src.epWf));
ok("B13 the cast card names a printed DC and High Magic's +2", /isInnate \? \(innateSaveHere\?\.printed \? " \(as printed\)" : " \(10 \+ magical ability \+ level\)"\)/.test(src.cast) && /\? " \(\+2 High Magic\)" : ""/.test(src.cast));

const EXPECTED = 31;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block3: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block3: ${checks} checks — all green.`);
