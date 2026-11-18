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
 *   Z  The version.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { AUDIT_3698_FIXES } from "./declare-audit-3698.mjs";

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
    const r = PACK_REPAIRS.find((x) => x.id === fix.id);
    equal(`D3 ${fix.id}: the owned-copy repair matches`, [r?.field, r?.from, r?.to], [fix.path.replace(/^system\./, ""), fix.from, fix.to]);
  }
}

/* Z ------------------------------------------------------------------------ */
const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.698.0, and the download names it", [sys.version, JSON.parse(read("package.json")).version, sys.download.includes("/v3.698.0/")], ["3.698.0", "3.698.0", true]);

console.log(`verify-audit-3698: ${checks} checks — ${failures.length ? `${failures.length} FAILED` : "all green."}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
