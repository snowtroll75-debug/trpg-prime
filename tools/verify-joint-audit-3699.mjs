#!/usr/bin/env node
/**
 * verify-joint-audit-3699 — core 3.699.0, Graham's rulings of 18 November
 * 2026 on the joint TRG Prime Codex / Fiends & Fables audit.
 *
 *   A  Mindless creatures are never collapsed by a mental score; the
 *      Mindless ethic counts for that rule; gaining Mindless re-settles.
 *   B  RD-03: Swim/Climb speed +4 is a row on the Swim / Climb action,
 *      not a +4 pooled into the whole skill.
 *   C  RD-04: Keen Sense is pooled into Perception; its roll row stands
 *      down; Acute Sense is untouched.
 *   D  CO-01: a printed-range ability is held under its base name.
 *   E  RD-01: Eternal has no Death State (pack + owned-copy repair).
 *   F  CO-02 / RD-08: Ooze immune to disease and precision (pack + owned
 *      effect repair).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

/* A — Mindless and the ability collapse ----------------------------------- */
{
  const c = await mod("combat", "ability-collapse.mjs");
  const sys = (attrs, extra = {}) => ({
    identity: { ethics: extra.ethics ?? "" }, details: { traits: extra.traits ?? "" },
    attributes: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, { total: v }]))
  });
  equal("A1 a mindless creature is excused all three mental scores",
    c.actorAbilityCollapse(sys({ intelligence: -5, wisdom: -5, charisma: -5 }, { traits: "Mindless" })).conditions, []);
  equal("A2 ...but not Strength", c.actorAbilityCollapse(sys({ strength: -5 }, { traits: "Mindless" })).conditions, ["unconscious"]);
  equal("A3 ...nor Dexterity", c.actorAbilityCollapse(sys({ dexterity: -5 }, { traits: "Mindless" })).conditions, ["immobilised"]);
  ok("A4 ...nor a fatal Constitution", c.actorAbilityCollapse(sys({ constitution: -5 }, { traits: "Mindless" })).dead === true);
  equal("A5 the Skeleton Warrior (Ethics Mindless, INT -5, CHA -5, no trait) stays on its feet",
    c.actorAbilityCollapse(sys({ strength: 3, intelligence: -5, wisdom: 1, charisma: -5 }, { ethics: "Mindless" })).conditions, []);
  equal("A6 a creature with neither still collapses",
    c.actorAbilityCollapse(sys({ intelligence: -5 })).conditions, ["unconscious"]);
  const traits = await mod("creature-traits.mjs");
  const ethicOnly = { identity: { ethics: "Mindless" }, details: { traits: "" } };
  ok("A7 the ethic does not bring the trait's -5 penalty or its Mental immunity",
    traits.isMindless(ethicOnly) === false && traits.mindlessAttributePenalty(ethicOnly, "intelligence") === 0
    && traits.mindlessAttributePenalty({ details: { traits: "Mindless" } }, "intelligence") === -5);
  const wf = read("module", "combat", "ability-collapse-workflow.mjs");
  ok("A8 gaining a trait or an ethic re-settles the rule",
    /hasProperty\(changes, "system\.details"\)/.test(wf) && /hasProperty\(changes, "system\.identity"\)/.test(wf));
}

/* B — RD-03 Swim / Climb speed ------------------------------------------- */
{
  const r = await mod("skill-sheet-rules.mjs");
  const rows = r.movementSkillConditionals({ swim: { base: 30 }, climb: { base: 20 } });
  equal("B1 a swimmer and climber gets two rows", rows.map((x) => x.label), ["Swim Speed", "Climb Speed"]);
  equal("B2 Swim: +4 circumstance, automatic, Athletics with the Swim action",
    [rows[0].value, rows[0].type, rows[0].auto, rows[0].when], [4, "circumstance", true, { checkTypes: ["skill"], subjects: ["athletics"], actions: ["swim"] }]);
  equal("B3 Climb: +4 circumstance, automatic, Climbing with the Climb action",
    [rows[1].value, rows[1].when], [4, { checkTypes: ["skill"], subjects: ["climbing"], actions: ["climb"] }]);
  equal("B4 no speed, no row", r.movementSkillConditionals({ swim: { base: 0 }, climb: {} }), []);
  const cond = await mod("conditionals.mjs");
  const entries = cond.collectConditionals([], [], rows);
  ok("B5 the row applies to a Swim check",
    cond.automaticSelections(entries, { checkType: "skill", subject: "athletics", actionKey: "swim" }).modifiers.some((m) => m.label === "Swim Speed"));
  ok("B6 ...and not to a plain Athletics check",
    !cond.automaticSelections(entries, { checkType: "skill", subject: "athletics" }).modifiers.some((m) => m.label === "Swim Speed"));
  ok("B7 ...nor to Grab an Edge on Climbing",
    !cond.automaticSelections(entries, { checkType: "skill", subject: "climbing", actionKey: "grabAnEdge" }).modifiers.some((m) => m.label === "Climb Speed"));
  const actor = read("module", "documents", "actor.mjs");
  ok("B8 the skill pool no longer receives the +4",
    !/label: "Swim Speed"/.test(actor) && !/label: "Climb Speed"/.test(actor) && /movementSkillConditionals\(movement\)/.test(actor));
  ok("B9 the rows are published where every check reads its declared rows",
    /if \(movementRows\.length && system\.combat\) \{\s*system\.combat\.runeConditionals = \[\.\.\.\(system\.combat\.runeConditionals \?\? \[\]\), \.\.\.movementRows\];/.test(actor)
    && /system\?\.combat\?\.runeConditionals/.test(read("module", "dice", "check.mjs"))
    && /system\?\.combat\?\.runeConditionals/.test(read("module", "apps", "check-dialog.mjs")));
}

/* C — RD-04 Keen Sense ---------------------------------------------------- */
{
  const r = await mod("skill-sheet-rules.mjs");
  ok("C1 Keen Sense is recognised", r.isKeenSenseName("Keen Sense") && r.isKeenSenseName(" keen sense (perception) "));
  ok("C2 Keen Sight and Acute Sense are not", !r.isKeenSenseName("Keen Sight") && !r.isKeenSenseName("Acute Sense (Sight)"));
  ok("C3 an actor with the ability", r.hasKeenSense({ items: [{ type: "ability", name: "Keen Sense" }] })
    && !r.hasKeenSense({ items: [{ type: "feat", name: "Keen Sense" }] }));
  const cond = await mod("conditionals.mjs");
  const keenRow = { kind: "modifier", value: 2, type: "race", label: "Keen Sense", scope: "Perception skill checks", auto: true, when: { subjects: ["perception"] } };
  const acuteRow = { kind: "modifier", value: 2, type: "race", label: "Acute Sense", auto: false, when: { checkTypes: ["skill"], subjects: ["perception"] } };
  const items = [
    { id: "k", name: "Keen Sense", type: "ability", flags: { "trg-prime": { conditionals: [keenRow] } }, system: {} },
    { id: "a", name: "Acute Sense (Sight)", type: "ability", flags: { "trg-prime": { conditionals: [acuteRow] } }, system: {} }
  ];
  const labels = cond.collectConditionals(items, [], []).map((e) => e.label);
  equal("C4 the Keen Sense roll row stands down; Acute Sense's is offered", labels, ["Acute Sense"]);
  const actor = read("module", "documents", "actor.mjs");
  ok("C5 Keen Sense is pooled into Perception as a racial +2",
    /if \(hasKeenSense\(actor\)\) \{\s*actor\.addBonus\("system\.skills\.perception", \{\s*label: "Keen Sense",\s*value: 2,\s*type: "race"/.test(actor));
}

/* D — CO-01 printed ranges ---------------------------------------------- */
{
  const gw = read("module", "grants-workflow.mjs");
  ok("D1 an ability is held under its base name",
    /if \(i\.type === "ability"\) held\.add\(abilityBaseName\(name\)\);/.test(gw));
  const body = /function abilityBaseName\(name\) \{([\s\S]*?)\n\}/.exec(gw)?.[1] ?? "";
  const base = new Function("name", body);
  equal("D2 printed ranges reduce to the sense", ["Darkvision (60 ft.)", "Darkvision 75 ft", "Telepathy 100 ft", "Scent"].map(base),
    ["darkvision", "darkvision", "telepathy", "scent"]);
  equal("D3 a parenthesised kind is not stripped into another ability's name", base("Acute Sense (Sight)"), "acute sense");
}

/* E, F — the packs and the owned-copy repairs ---------------------------- */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v3699-"));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "creature-types"), tmp, { recursive: true });
  fs.rmSync(path.join(tmp, "LOCK"), { force: true });
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  await db.open();
  const rows = [];
  for await (const kv of db.iterator()) rows.push(kv);
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  const item = (n) => rows.find(([k, v]) => k.startsWith("!items!") && v?.name === n)?.[1];
  const effect = (it, n) => rows.find(([k, v]) => k.startsWith(`!items.effects!${it?._id}.`) && v?.name === n)?.[1];
  ok("E1 Eternal has no Death State", item("Eternal")?.system?.noDeathState === true);
  ok("E2 ...the same as Undead, Construct and Elemental",
    ["Undead", "Construct", "Elemental"].every((n) => item(n)?.system?.noDeathState === true));
  const ooze = effect(item("Ooze"), "Ooze: immunities");
  const words = (ooze?.changes ?? ooze?.system?.changes ?? []).map((c) => String(c.value).replace(/^,\s*/, ""));
  ok("E3 Ooze immune to disease and precision", words.includes("disease") && words.includes("precision"), words.join(", "));
  ok("E4 ...and still to everything it was", ["mental", "poison", "sleep", "paralyzed", "polymorph", "stunned", "flatFooted"].every((w) => words.includes(w)));

  const repairs = await mod("data", "pack-repairs.mjs");
  const eternal = repairs.PACK_REPAIRS.find((r) => r.id === "rd01-eternal-no-death-state");
  ok("E5 owned Eternal types are repaired", eternal?.pack === "creature-types" && eternal.field === "noDeathState" && eternal.from === false && eternal.to === true);
  const oozeRepair = repairs.EFFECT_REPAIRS.find((r) => r.id === "co02-rd08-ooze-immunities");
  const stale = { name: "Ooze: immunities", changes: ["mental", "poison", "sleep", "paralyzed", "polymorph", "stunned", "flatFooted"]
    .map((v) => ({ key: "system.combat.immunities", mode: 2, value: `, ${v}`, priority: 20 })),
  description: "Immune to mental, poison, sleep, paralyzed, polymorph, stunned, flatFooted." };
  const update = repairs.effectRepairUpdate(oozeRepair, stale);
  ok("E6 a stale owned Ooze effect is brought up to date",
    update?.changes?.length === 9 && /disease/.test(update.description) && /precision/.test(update.description));
  equal("E7 the repaired value is what the pack ships", update?.changes?.map((c) => c.value), (ooze?.changes ?? []).map((c) => c.value));
  equal("E8 a house-ruled copy is left alone", repairs.effectRepairUpdate(oozeRepair, { ...stale, changes: [], description: "Mine." }), null);
  const mig = read("module", "migration.mjs");
  // A GATE FLOOR, NOT A PIN (3.700.0 re-gated both passes again for the
  // Movement trait): any later gate still runs them for a 3.698.x world.
  const atLeast = (a, b) => String(a).localeCompare(b, undefined, { numeric: true }) >= 0;
  const packGate = /runIf\("([\d.]+)", "stale owned copies of repaired pack items"/.exec(mig)?.[1] ?? "0";
  const effectGate = /runIf\("([\d.]+)", "declared effect repairs on owned items/.exec(mig)?.[1] ?? "0";
  const stamp = /export const TRG_SCHEMA_VERSION = "([\d.]+)";/.exec(mig)?.[1] ?? "0";
  ok("E9 both passes are gated at 3.699.0 or later and the schema is stamped at or past them",
    atLeast(packGate, "3.699.0") && atLeast(effectGate, "3.699.0") && atLeast(stamp, packGate) && atLeast(stamp, effectGate));
}

console.log(`verify-joint-audit-3699: ${checks} checks${failures.length ? ` — ${failures.length} FAILED` : " — all green."}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
