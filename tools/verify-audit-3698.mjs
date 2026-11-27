#!/usr/bin/env node
/**
 * verify-audit-3698 — Graham's rulings on the 3.697.0 audit (18 Nov 2026).
 *
 *   A  U1: a level drop takes back levelled grants above the new level
 *      (the pure rule).
 *   B  …run on an actor: a Fighter dropped from 13th to 8th loses Weapon
 *      Supremacy and Unbreakable Resolve, keeps everything below, and keeps
 *      anything the class list does not name; the divine aspect is left to R7.
 *   C  Rules audit R7: Ability Enhancement, once per four levels.
 *   D  Rules audit R3: Flame Blade has no range and no targets.
 *   E  U12 (3.698.1): Flame Blade's blade is a fire Scimitar on Spellcraft −2;
 *      (3.698.2) and the caster is always proficient with it.
 *   F  Found live (3.698.3): no Customise dialog for a conjured weapon, and a
 *      fire blade's card does not say "of pure force".
 *   Z  The version.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { AUDIT_3698_FIXES, FLAME_BLADE_ROW, FLAME_BLADE_ROW_3698_1 } from "./declare-audit-3698.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

const FIGHTER = "1: Warrior's Resolve, 1: Martial Training, 2: Battle Readiness, 3: Armour Exemplar, 4: Weapon Exemplar, 4: Press the Advantage, 9: Unbreakable Resolve, 13: Weapon Supremacy";

/* A — the rule ------------------------------------------------------------ */
{
  const g = await mod("grants.mjs");
  const entries = g.parseMaybeLevelledGrantList(FIGHTER);
  const granted = entries.map((e, i) => ({ id: `id${i}`, requested: e.name }));
  equal("A1 at 8th, the 9th- and 13th-level abilities go", g.levelledGrantsAboveLevel({ entries, granted, level: 8 }), ["id6", "id7"]);
  equal("A2 at 13th, nothing goes; at 20th, nothing", [g.levelledGrantsAboveLevel({ entries, granted, level: 13 }), g.levelledGrantsAboveLevel({ entries, granted, level: 20 })], [[], []]);
  equal("A3 at 1st, everything above 1st goes", g.levelledGrantsAboveLevel({ entries, granted, level: 1 }), ["id2", "id3", "id4", "id5", "id6", "id7"]);
  equal("A4 a name the list does not hold is never touched",
    g.levelledGrantsAboveLevel({ entries, granted: [{ id: "x", requested: "Power Attack" }], level: 1 }), []);
  const twice = g.parseMaybeLevelledGrantList("1: Bonus Feat, 5: Bonus Feat");
  equal("A5 a name listed twice: at 3rd one copy is due, so the second goes; at 5th both stay",
    [g.levelledGrantsAboveLevel({ entries: twice, granted: [{ id: "a", requested: "Bonus Feat" }, { id: "b", requested: "Bonus Feat" }], level: 3 }),
      g.levelledGrantsAboveLevel({ entries: twice, granted: [{ id: "a", requested: "Bonus Feat" }, { id: "b", requested: "Bonus Feat" }], level: 5 })], [["b"], []]);
  equal("A6 names compare without case or padding", g.levelledGrantsAboveLevel({ entries, granted: [{ id: "w", requested: " weapon supremacy " }], level: 12 }), ["w"]);
}

/* B — on an actor --------------------------------------------------------- */
{
  const gw = await mod("grants-workflow.mjs");
  const deleted = [];
  const make = (id, name, type, extra = {}) => ({ id, name, type, system: extra.system ?? {}, flags: extra.flags ?? {} });
  const by = (source, requested) => ({ flags: { "trg-prime": { grantedBy: { sourceId: source, requested } } } });
  const items = [
    make("cls", "Fighter", "class", { system: { classAbilities: FIGHTER, grantedFeats: "" } }),
    make("a1", "Warrior's Resolve", "ability", by("cls", "Warrior's Resolve")),
    make("a4", "Press the Advantage", "ability", by("cls", "Press the Advantage")),
    make("a9", "Unbreakable Resolve", "ability", by("cls", "Unbreakable Resolve")),
    make("a13", "Weapon Supremacy", "ability", by("cls", "Weapon Supremacy")),
    make("own", "Power Attack", "feat"),
    make("asp", "Dawn", "divine-aspect", { system: { bonusSpells: "1: Light, 8: Fireball" } }),
    make("fb", "Fireball", "spell", by("asp", "Fireball")),
    // The same name, granted by something else (a feat): not the class's to take back.
    make("oth", "Mentor's Gift", "feat", { system: { grantedAbilities: "Weapon Supremacy" } }),
    make("ws2", "Weapon Supremacy", "ability", by("oth", "Weapon Supremacy"))
  ];
  const map = new Map(items.map((i) => [i.id, i]));
  const actor = {
    system: { identity: { level: 8 } },
    items: Object.assign(items, { get: (id) => map.get(id) }),
    async deleteEmbeddedDocuments(type, ids) { deleted.push(type, ...ids); for (const id of ids) map.delete(id); }
  };
  const lines = await gw.pruneLevelledGrantsAboveLevel(actor);
  equal("B1 a Fighter dropped to 8th loses exactly Unbreakable Resolve and Weapon Supremacy", deleted, ["Item", "a9", "a13"]);
  ok("B2 …and says so, naming them", /Granted above level 8, removed: Unbreakable Resolve, Weapon Supremacy\./.test(lines[0] ?? ""), lines[0]);
  ok("B3 a same-named ability another source granted is not the class's to take", !deleted.includes("ws2"));
  deleted.length = 0;
  actor.system.identity.level = 13;
  equal("B4 at the level it was granted, nothing goes, and nothing is said", [await gw.pruneLevelledGrantsAboveLevel(actor), deleted], [[], []]);
  actor.system.identity.level = 5;
  await gw.pruneLevelledGrantsAboveLevel(actor);
  ok("B4b at 5th, the divine aspect's 8th-level Fireball is left to R7's own pass (which spares the specialist pick)", !deleted.includes("fb"), JSON.stringify(deleted));
  const auto = read("module", "grant-autorun.mjs");
  ok("B5 the level hook runs it after the grant pass and R7, and notifies",
    /const pruned = await pruneAspectBonusSpells\(actor\);[\s\S]{0,700}const taken = await pruneLevelledGrantsAboveLevel\(actor\);\n\s*if \(taken\.length\) ui\.notifications\.info/.test(auto)
      && auto.indexOf("await queueGrantPass(actor);") < auto.indexOf("pruneLevelledGrantsAboveLevel(actor)"));
}

/* C — Ability Enhancement ------------------------------------------------- */
{
  const f = await mod("familiar.mjs");
  equal("C1 once at 1-4, twice at 5-8, three times at 9-12, five at 20", [1, 4, 5, 8, 9, 12, 20].map((l) => f.abilityEnhancementAllowance(l)), [1, 1, 2, 2, 3, 3, 5]);
  equal("C2 a level that is missing or nonsense counts as 1st", [f.abilityEnhancementAllowance(0), f.abilityEnhancementAllowance("x")], [1, 1]);
  const fw = read("module", "feats-workflow.mjs");
  ok("C3 a copy that has not chosen is refused once the familiar's level is used up; a copy that has chosen may change",
    /if \(!item\.getFlag\?\.\(SYSTEM_ID, "abilityEnhancementChoice"\) && chosenElsewhere >= allowance\) \{\n\s*ui\.notifications\.warn/.test(fw)
      && /const allowance = abilityEnhancementAllowance\(familiarLevel\);/.test(fw)
      && /actor\.system\?\.progression\?\.level \?\? actor\.system\?\.identity\?\.level/.test(fw));
}

/* D — Flame Blade --------------------------------------------------------- */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v3698-spells-"));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "spells"), tmp, { recursive: true });
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  let fb = null;
  for await (const [k, v] of db.iterator({ gte: "!items!", lt: "!items!~" })) if (v.name === "Flame Blade") fb = v;
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  equal("D1 the pack's Flame Blade has no range and no targets", [fb?.system?.range, fb?.system?.targets], ["", ""]);
  const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes;
  const { PACK_REPAIRS } = await mod("data", "pack-repairs.mjs");
  for (const fix of AUDIT_3698_FIXES) {
    equal(`D2 ${fix.id}: data-fixes declares it`, fixes.find((x) => x.id === fix.id)?.to, fix.to);
    // A FIELD RULED TWICE HAS ONE REPAIR (3.698.2): the later fix is that
    // repair's `alsoFrom`, and its `to` is the final value.
    const r = PACK_REPAIRS.find((x) => x.id === (fix.repair?.id ?? fix.id));
    const field = fix.path.replace(/^system\./, "");
    if (fix.repair?.alsoFrom) {
      ok(`D3 ${fix.id}: the owned-copy repair lists the earlier row as alsoFrom, and ends where this does`,
        r?.field === field && (r?.alsoFrom ?? []).some((f) => JSON.stringify(f) === JSON.stringify(fix.from)) && JSON.stringify(r?.to) === JSON.stringify(fix.to));
    } else {
      equal(`D3 ${fix.id}: the owned-copy repair matches`, [r?.field, r?.from, r?.to], [field, fix.from, fix.repair?.to ?? fix.to]);
    }
  }
}

/* E — Flame Blade's blade (3.698.1) ---------------------------------------- */
{
  const packDocs = async (name, pick) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `v3698-${name}-`));
    fs.cpSync(path.join(SYSTEM_ROOT, "packs", name), tmp, { recursive: true });
    const db = new ClassicLevel(tmp, { valueEncoding: "json" });
    const out = [];
    for await (const [, v] of db.iterator({ gte: "!items!", lt: "!items!~" })) if (pick(v)) out.push(v);
    await db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    return out;
  };
  const [fb] = await packDocs("spells", (v) => v.name === "Flame Blade");
  const [ew] = await packDocs("spells", (v) => v.name === "Eldritch Weapon");
  const weapons = await packDocs("weapons", (v) => v.type === "weapon");
  equal("E1 the pack's Flame Blade carries the blade", fb?.system?.effects, [FLAME_BLADE_ROW]);
  const cw = await mod("magic", "conjured-weapon.mjs");
  const spec = cw.normaliseConjuredWeapon(fb?.system?.effects?.[0]);
  equal("E2 the row reads: fire, Spellcraft, −2, the Scimitar alone",
    [spec?.damageType, spec?.attackBase, spec?.attackAdjust, spec?.weapons], ["fire", "spellcraft", -2, ["Scimitar"]]);
  const choices = cw.conjuredWeaponChoices(spec, {}, weapons);
  equal("E3 the only weapon offered is the Scimitar (so no dialog)", choices.map((w) => w.name), ["Scimitar"]);
  const made = cw.conjuredWeaponData(spec, choices[0]);
  equal("E4 the copy deals fire, so its criticals are fire criticals",
    [made.system?.damageType, made.system?.damage], ["fire", "1d6"]);
  equal("E5 the copy declares Spellcraft −2", [made.flags?.["trg-prime"]?.attackBase, made.flags?.["trg-prime"]?.attackAdjust], ["spellcraft", -2]);
  const ewSpec = cw.normaliseConjuredWeapon(ew?.system?.effects?.find((e) => e.kind === "conjuredWeapon"));
  const ewChoices = cw.conjuredWeaponChoices(ewSpec, {}, weapons);
  const ewMade = cw.conjuredWeaponData(ewSpec, ewChoices[0]);
  ok("E6 Eldritch Weapon unchanged: several simple weapons, force, the wielder's own attack bonus",
    ewChoices.length > 3 && ewMade.system?.damageType === "force" && ewMade.flags?.["trg-prime"]?.attackBase === undefined,
    `${ewChoices.length} choices, ${ewMade.system?.damageType}, ${ewMade.flags?.["trg-prime"]?.attackBase}`);

  const ab = await mod("combat", "attack-base.mjs");
  const system = { magic: { spellcraft: { total: 11 }, bsb: 0 }, progression: { bsb: 6 }, combat: { bab: { total: 8 }, attack: { total: 12 } } };
  const blade = { flags: { "trg-prime": { attackBase: "spellcraft", attackAdjust: -2 } } };
  const row = ab.spellcraftAttackRow(blade, system, 12);
  equal("E7 Spellcraft 11 −2 in place of an attack bonus of 12 is a −3 row", row?.value, -3);
  ok("E8 the row is named on the card", /Spellcraft 11 \u2212\s?2 in place of attack bonus 12/.test(row?.label ?? "") || /Spellcraft 11 −2 in place of attack bonus 12/.test(row?.label ?? ""), row?.label);
  equal("E9 and taken when it helps too (not a \"may\")", ab.spellcraftAttackRow(blade, { magic: { spellcraft: { total: 15 } } }, 4)?.value, 9);
  equal("E10 an ordinary weapon has no Spellcraft row, nor a BSB row from it",
    [ab.spellcraftAttackRow({}, system, 12), ab.attackBaseRow(blade, system), ab.attackBaseOf(blade), ab.attackBaseOf({})], [null, null, "spellcraft", "bab"]);

  const aw = read("module", "combat", "attack-workflow.mjs");
  ok("E11 the strike pushes the Spellcraft row against the attack total",
    /if \(spellcraftBased\) \{\s*const row = spellcraftAttackRow\(weapon, actor\.system, Number\(actor\.system\.combat\?\.attack\?\.total \?\? 0\)\);\s*if \(row\) modifiers\.push\(row\);/.test(aw));
  ok("E12 and drops the ability swaps it replaces (Finesse, a declared ability, Dexterity at range)",
    aw.includes("if (finesseBonus && !spellcraftBased)") && aw.includes("if (!isRanged && !spellcraftBased)") && aw.includes("const rangedAbilityBonus = spellcraftBased ? 0 :"));
  const cwf = read("module", "magic", "conjured-weapon-workflow.mjs");
  ok("E13 the shaping dialog names the spell's damage type, not always force",
    cwf.includes("It deals ${damageType} damage") && read("module", "magic", "spell-effects.mjs").includes("promptConjuredWeapon(spell.name, options, weaponSpec.damageType)"));
  const mig = read("module", "migration.mjs");
  // At 3.698.2 or later: 3.699.0 re-gated the same pass again for Eternal's
  // Death State, which still runs it for every world that predates 3.698.2.
  {
    const atLeast = (a, b) => String(a).localeCompare(b, undefined, { numeric: true }) >= 0;
    const gate = /runIf\("([\d.]+)", "stale owned copies of repaired pack items"/.exec(mig)?.[1] ?? "0";
    const stamp = /TRG_SCHEMA_VERSION = "([\d.]+)"/.exec(mig)?.[1] ?? "0";
    ok("E14 the owned-copy pass is re-gated so existing Flame Blades get the blade",
      atLeast(gate, "3.698.2") && atLeast(stamp, gate), `gate ${gate}, stamp ${stamp}`);
  }

  // 3.698.2: "The caster is always proficient."
  equal("E15 the blade is marked as the caster's own", made.flags?.["trg-prime"]?.casterProficient, true);
  equal("E16 Eldritch Weapon is not (the wielder's own proficiency still counts)", ewMade.flags?.["trg-prime"]?.casterProficient, undefined);
  const prof = await mod("proficiency-rules.mjs");
  const noMartial = prof.proficiencyProfile({ items: [], system: {} });
  const bladeVerdict = prof.proficiencyOf(noMartial, { type: "weapon", name: made.name, system: made.system, flags: made.flags });
  const shopVerdict = prof.proficiencyOf(noMartial, { type: "weapon", name: "Scimitar", system: choices[0].system, flags: choices[0].flags ?? {} });
  equal("E17 a caster with no martial proficiency is proficient with the blade, not with a bought Scimitar",
    [bladeVerdict.proficient, shopVerdict.proficient], [true, false]);
  const { PACK_REPAIRS } = await mod("data", "pack-repairs.mjs");
  const { classifyRepairs } = await mod("pack-repair.mjs");
  const rep = PACK_REPAIRS.filter((r) => r.name === "Flame Blade" && r.field === "effects");
  const row3698_1 = FLAME_BLADE_ROW_3698_1;
  equal("E18 an owned Flame Blade at 3.698.1's row, or with none, is stale; one already marked is current",
    [classifyRepairs({ effects: [row3698_1] }, rep)[0]?.state, classifyRepairs({ effects: [] }, rep)[0]?.state, classifyRepairs({ effects: [FLAME_BLADE_ROW] }, rep)[0]?.state, rep.length],
    ["stale", "stale", "current", 1]);
}

/* F — found live on 18 November (3.698.3) ---------------------------------- */
{
  const { shouldOfferCustomisation } = await mod("customise-on-add.mjs");
  const cw = await mod("magic", "conjured-weapon.mjs");
  const spec = cw.normaliseConjuredWeapon(FLAME_BLADE_ROW);
  const made = cw.conjuredWeaponData(spec, { name: "Scimitar", type: "weapon", system: { category: "Martial", damage: "1d6", hands: 1 } });
  // The workflow stamps conjured/conjuredWeapon on the copy before creating it.
  const onActor = { ...made, parent: {}, flags: { "trg-prime": { ...(made.flags?.["trg-prime"] ?? {}), conjured: true, conjuredWeapon: true } } };
  const bought = { type: "weapon", name: "Scimitar", parent: {}, system: { category: "Martial" }, flags: {} };
  equal("F1 a conjured blade opens no Customise dialog; a bought Scimitar still does",
    [shouldOfferCustomisation(onActor, "u", { currentUserId: "u" }), shouldOfferCustomisation(bought, "u", { currentUserId: "u" })], [false, true]);
  const cwf = read("module", "magic", "conjured-weapon-workflow.mjs");
  ok("F2 the workflow does stamp conjuredWeapon on the copy (what F1 relies on)", /conjuredWeapon: true/.test(cwf), "conjuredWeapon: true not found");
  const se = read("module", "magic", "spell-effects.mjs");
  ok("F3 the card says \"of pure force\" only for force, and names the spell otherwise",
    se.includes('weaponSpec.damageType === "force"') && se.includes("(${weaponSpec.label}) — ${weaponSpec.damageType} damage${durationText}."));
}

/* Z ------------------------------------------------------------------------ */
const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.707.3, and the download names it", [sys.version, JSON.parse(read("package.json")).version, sys.download.includes("/v3.718.0/")], ["3.718.0", "3.718.0", true]);

console.log(`verify-audit-3698: ${checks} checks — ${failures.length ? `${failures.length} FAILED` : "all green."}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
