#!/usr/bin/env node
/**
 * verify-audit-3697 — the 3.697.0 core automation audit's repairs.
 *
 *   A  Fast Movement (familiar): +15 feet to every speed the familiar has,
 *      and only those; pooled by actor preparation.
 *   B  The four familiar abilities whose items say "press Use" now have a
 *      Use: Energy Resistant, Ability Enhancement, Speak in Tongues and
 *      General Adeptness.
 *   C  Long Arm: a longArm marker, read where reach is set from size.
 *   D  Inner Focus: an innerFocus marker; the casting focus rules waive the
 *      -2 and the +10 fumble on it, and give no +1.
 *   F  Spell Battery: the caster's familiar is a +1 Spell Adder within 30 ft.
 *   E  The pack carries the three spells' new rows, exactly as data-fixes
 *      declares them, and the owned-copy repairs say the same thing.
 *   Z  The version.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { AUDIT_3697_FIXES } from "./declare-audit-3697.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

/* A — Fast Movement ------------------------------------------------------ */
{
  const fd = await mod("familiar-derive.mjs");
  const movement = { land: { base: 25 }, swim: { base: 25 }, fly: { base: 0 }, climb: 0, burrow: { base: 0 } };
  const got = fd.familiarSpeedEntries(["Empathic Link", "Fast Movement", "Amphibious"], movement);
  equal("A1 Fast Movement raises the two speeds the familiar has (land, swim), and gives it no fly, climb or burrow",
    Object.keys(got).sort(), ["system.combat.movement.land", "system.combat.movement.swim"]);
  equal("A2 …by 15 feet, untyped, labelled", got["system.combat.movement.land"], [{ label: "Fast Movement", value: 15, type: "untyped", source: "familiarAbility" }]);
  equal("A4 without the ability, nothing", fd.familiarSpeedEntries(["Tough"], movement), {});
  equal("A5 a bare-number speed counts as a speed it has", Object.keys(fd.familiarSpeedEntries(["fast movement"], { land: 25 })), ["system.combat.movement.land"]);
  const actor = read("module", "documents", "actor.mjs");
  ok("A6 actor preparation pools it for a familiar, before the movement step resolves",
    /familiarSpeedEntries\(ownedAbilityNames, combat\.movement\)\)\) \{\n\s*for \(const entry of entries\) actor\.addBonus\(target, entry\);/.test(actor)
      && actor.indexOf("familiarSpeedEntries(ownedAbilityNames") < actor.indexOf("resolveMovement({"));
}

/* B — the four Use buttons ---------------------------------------------- */
{
  const fw = read("module", "feats-workflow.mjs");
  for (const name of ["energy resistant", "ability enhancement", "speak in tongues", "general adeptness"]) {
    ok(`B1 FEAT_AUTOMATION answers "${name}"`, fw.includes(`  "${name}": {\n    hint:`));
  }
  ok("B2 Energy Resistant writes the chosen type into Resistances, on the familiar, replacing its own earlier choice",
    /Energy Resistant: \$\{labels\[picked\]\}[\s\S]{0,200}key: "system\.combat\.resistances", type: CHANGE_TYPE\.ADD, value: `, \$\{labels\[picked\]\}`/.test(fw)
      && /"energy resistant": \{[\s\S]{0,400}WARDING_ENERGY_TYPES/.test(fw));
  ok("B3 Ability Enhancement adds 1 to the chosen score's untyped slot, one effect per copy of the ability",
    /key: `system\.attributes\.\$\{picked\}\.other`, type: CHANGE_TYPE\.ADD, value: "1"/.test(fw)
      && /"ability enhancement": \{[\s\S]{0,2000}replaceFeatEffect\(actor, item,/.test(fw));
  ok("B4 Speak in Tongues offers the master's known languages and swaps out its own earlier pick",
    /actorLanguageState\(master\)\.known/.test(fw) && /\.filter\(\(n\) => !previous \|\| n\.toLowerCase\(\) !== String\(previous\)\.toLowerCase\(\)\)/.test(fw));
  ok("B5 General Adeptness picks a general feat it does not have, and records the ability as its source",
    /String\(e\.system\?\.category \?\? ""\)\.trim\(\)\.toLowerCase\(\) === "general" && !owned\.has\(normalise\(e\.name\)\)/.test(fw)
      && /grantedBy`, \{\n\s*sourceId: item\.id, sourceName: item\.name, requested: feat\.name\n\s*\}\);/.test(fw));
}

/* C, D — the markers ------------------------------------------------------ */
{
  const mk = await mod("magic", "markers.mjs");
  equal("C1 longArm and innerFocus are registered, read and not spent, by actor preparation",
    ["longArm", "innerFocus"].map((k) => [mk.isMarkerKey(k), mk.MARKERS[k]?.reader, mk.MARKERS[k]?.consumed]),
    [[true, "module/documents/actor.mjs", false], [true, "module/documents/actor.mjs", false]]);
  const actor = read("module", "documents", "actor.mjs");
  ok("C2 reach is size plus 5 feet while Long Arm's marker lasts",
    /if \(sizeEntry\) combat\.reach = sizeEntry\.reach \+ \(findMarker\(actor, "longArm"\) \? LONG_ARM_FEET : 0\);/.test(actor)
      && /const LONG_ARM_FEET = 5;/.test(actor));
  ok("D1 actor preparation sets the illusory focus from Inner Focus's marker",
    /system\.magic\.focusIllusory = Boolean\(findMarker\(actor, "innerFocus"\)\);/.test(actor));
  const c = await mod("magic", "casting.mjs");
  const m = (ready, illusory) => ({ focusCasting: true, focusReady: ready, focusIllusory: illusory });
  equal("D2 the check: focus in hand +1; no focus -2; Inner Focus neither", [c.focusCheckModifier(m(true, false))?.value, c.focusCheckModifier(m(false, false))?.value, c.focusCheckModifier(m(false, true)), c.focusCheckModifier(m(true, true))?.value], [1, -2, null, 1]);
  equal("D3 the fumble: +10 without the focus, none with Inner Focus", [c.focusFumblePenalty(m(false, false)), c.focusFumblePenalty(m(false, true)), c.focusFumblePenalty(m(true, false))], [10, 0, 0]);
  equal("D4 a caster who does not cast with a focus is untouched", [c.focusCheckModifier({ focusCasting: false, focusIllusory: true }), c.focusFumblePenalty({ focusCasting: false })], [null, 0]);
}

/* E — the pack, the declaration and the owned-copy repairs ---------------- */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v3697-spells-"));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "spells"), tmp, { recursive: true });
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  const spells = new Map();
  for await (const [k, v] of db.iterator({ gte: "!items!", lt: "!items!~" })) spells.set(v.name, v);
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes;
  const { PACK_REPAIRS } = await mod("data", "pack-repairs.mjs");
  for (const fix of AUDIT_3697_FIXES) {
    equal(`E1 ${fix.name}: the pack carries the declared rows`, spells.get(fix.name)?.system?.effects, fix.to);
    equal(`E2 ${fix.name}: tools/data-fixes.json declares the same change`, fixes.find((f) => f.id === fix.id)?.to, fix.to);
    const repair = PACK_REPAIRS.find((r) => r.id === fix.id);
    equal(`E3 ${fix.name}: the owned-copy repair goes from the same old value to the same new one`, [repair?.pack, repair?.field, repair?.from, repair?.to], ["spells", "effects", fix.from, fix.to]);
  }
  const markersUsed = AUDIT_3697_FIXES.flatMap((f) => f.to).filter((r) => r.kind === "marker").map((r) => r.marker);
  equal("E4 the three rows use the three markers", markersUsed, ["waterBreathing", "longArm", "innerFocus"]);
}

/* F — Spell Battery -------------------------------------------------------- */
{
  const sa = await mod("magic", "spell-adder.mjs");
  const fam = (name, abilities) => ({ name, items: abilities.map((n) => ({ type: "ability", name: n })) });
  const owl = fam("Owl", ["Empathic Link", "Spell Battery"]);
  const cat = fam("Cat", ["Empathic Link", "Fast Movement"]);
  equal("F1 a familiar with Spell Battery is a +1 Spell Adder; one without it is not",
    sa.familiarSpellAdders([owl, cat], { distanceTo: () => 10 }), [{ label: "Owl: Spell Battery", value: 1 }]);
  equal("F2 …but not when it is measured more than 30 feet away; exactly 30 still counts",
    [sa.familiarSpellAdders([owl], { distanceTo: () => 35 }).length, sa.familiarSpellAdders([owl], { distanceTo: () => 30 }).length], [0, 1]);
  equal("F3 with no measurable distance it counts, and says the range is the table's",
    sa.familiarSpellAdders([owl]), [{ label: "Owl: Spell Battery (within 30 ft)", value: 1 }]);
  equal("F4 it joins the caster's own adders as one more source",
    sa.withWondrousAdders(sa.withWondrousAdders({ sources: [{ label: "Ring", value: 2 }], total: 2 }, []), sa.familiarSpellAdders([owl])).total, 3);
  const cw = read("module", "magic", "cast-workflow.mjs");
  ok("F5 the cast asks the caster's familiars, measured token to token",
    /const battery = familiarSpellAdders\(familiarsOf\(actor\), \{[\s\S]{0,200}distanceBetween\(casterToken, t\)/.test(cw)
      && /withWondrousAdders\(withWondrousAdders\(spellAdderSources\(actor\), wondrous\), battery\)/.test(cw));
}

/* Z ------------------------------------------------------------------------ */
const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.707.3 (3.697.0 or later), and the download names it", [sys.version, JSON.parse(read("package.json")).version, sys.download.includes("/v3.710.1/")], ["3.710.1", "3.710.1", true]);

console.log(`verify-audit-3697: ${checks} checks — ${failures.length ? `${failures.length} FAILED` : "all green."}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
