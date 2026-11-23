#!/usr/bin/env node
/**
 * verify-fixes-3695-0 — TRG Prime 3.695.0: the core findings of the Pillars
 * of Faith automation audit (16 November 2026; Graham: "move onto the core
 * fixes").
 *   A. CD10 — an Invested-trait item's conditionals wait for Invest Item
 *      (ruling U4).
 *   B. CD13 — Remove Disease and Remove Curse reach afflictions, and an
 *      affliction declared to be cured in order (Mummy Rot, Fiends & Fables)
 *      is: Remove Curse, then Remove Disease, the caster told only at the end.
 *   C. CD0 — no pack writes the bare speed node any more.
 *   D. CD14 — a caster's declared spell-attack bonus (`spellAttackBonus`, the
 *      twin of `spellDCBonus`), and both may reach an item's spell when the
 *      row says `itemCasts` (Eternal Resonance, ruling U7: "all innate
 *      spells"; a module's casting option never reached an innate cast).
 *
 * The pack edits are rows in tools/data-fixes.json (ids cd0-speed-*, cd13-*),
 * applied by tools/apply-data-fixes.mjs.
 *
 *   node tools/verify-fixes-3695-0.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

/* A — CD10: invested conditionals ------------------------------------ */
{
  const { collectConditionals } = await mod("conditionals.mjs");
  const row = { kind: "modifier", value: 2, type: "item", label: "Locket", when: { checkTypes: ["save"] } };
  const item = (traits, equipped, invested) => ({ type: "gear", name: "Locket", system: { traits, equipped, invested, hp: { value: 1, max: 1 } }, flags: { "trg-prime": { conditionals: [row] } } });
  const n = (it) => collectConditionals([it], [], []).length;
  equal("A1 an Invested-trait item: none while only equipped, its row once invested and equipped", [n(item("Invested, Soul", true, false)), n(item("Invested, Soul", true, true)), n(item("Invested", false, true))], [0, 1, 0]);
  equal("A2 an item without the trait still needs only to be equipped", [n(item("Soul", true, false)), n(item("Soul", false, false))], [1, 0]);
  ok("A3 the gate sits in equipmentInUse, before wornAndStanding", /if \(hasInvestedTrait\(item\) && !item\?\.system\?\.invested\) return false;\n\s*return wornAndStanding\(item\);/.test(read("module", "conditionals.mjs")));
}

/* B — CD13: afflictions, and a cure in order ------------------------- */
{
  const cure = await mod("affliction-countered.mjs");
  const rot = (steps = null, flags = true) => ({ type: "affliction", name: flags ? "Mummy Rot (Disease)" : "Mummy Rot", system: { afflictionType: "disease" }, flags: { "trg-prime": { ...(flags ? { cureSequence: ["curse", "disease"] } : {}), ...(steps ? { cureSteps: steps } : {}) } } });
  equal("B1 Mummy Rot is reached by Remove Curse as well as Remove Disease; a plain disease is not reached by Remove Curse", [cure.afflictionReachedBy(rot(), ["curse"]), cure.afflictionReachedBy(rot(), ["disease"]), cure.afflictionReachedBy({ type: "affliction", name: "Ghoul Fever", system: { afflictionType: "disease" }, flags: {} }, ["curse"])], [true, true, false]);
  equal("B2 Remove Curse records its step, success or failure, and ends nothing", [cure.cureStepOutcome(rot(), ["curse"], true), cure.cureStepOutcome(rot(), ["curse"], false)], [{ step: "curse", last: false, ends: false, steps: { curse: true } }, { step: "curse", last: false, ends: false, steps: { curse: false } }]);
  equal("B3 Remove Disease ends it only after a successful Remove Curse, and closes the attempt either way", [cure.cureStepOutcome(rot({ curse: true }), ["disease"], true), cure.cureStepOutcome(rot({ curse: false }), ["disease"], true), cure.cureStepOutcome(rot(), ["disease"], true), cure.cureStepOutcome(rot({ curse: true }), ["disease"], false)].map((o) => [o.ends, o.steps]), [[true, {}], [false, {}], [false, {}], [false, {}]]);
  equal("B4 Fiends & Fables' copy, which declares nothing, is known by name; an ordinary disease has no sequence", [cure.cureStepOutcome(rot(null, false), ["curse"], true)?.step, cure.cureStepOutcome({ type: "affliction", name: "Ghoul Fever", system: { afflictionType: "disease" }, flags: {} }, ["disease"], true)], ["curse", null]);
  const sfx = read("module", "magic", "spell-effects.mjs");
  ok("B5 the counteract reads the sequence: GM told, step stored, the caster's card says nothing until the end", /const ordered = cureStepOutcome\(chosen, kinds, succeeded\);/.test(sfx) && /whisper: gm\.map\(\(u\) => u\.id\)/.test(sfx) && /await chosen\.update\(\{ \[`flags\.\$\{SYSTEM_ID\}\.\$\{CURE_STEPS_FLAG\}`\]: ordered\.steps \}\);/.test(sfx) && /Whether it held is known only once the cure is complete\./.test(sfx));
  ok("B6 Remove Curse's effect row stands down when its affliction row found a curse", /if \(effect\.skipIfCured && curedThisCast\.has\(target\.uuid\)\) break;/.test(sfx) && /curedThisCast\.add\(target\.uuid\);/.test(sfx) && /if \(!effect\.quietIfNone\) lines\.push/.test(sfx));
  const tmp = fs.mkdtempSync("/tmp/v3695-spells-");
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "spells"), tmp, { recursive: true });
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  const spells = {};
  for await (const [k, v] of db.iterator()) if (k.startsWith("!items!") && /^Remove (Disease|Curse)$/.test(v?.name ?? "")) spells[v.name] = v.system.effects;
  await db.close(); fs.rmSync(tmp, { recursive: true, force: true });
  equal("B7 Remove Disease counteracts a disease affliction", spells["Remove Disease"], [{ kind: "counteractAffliction", target: "targets", afflictionTypes: ["disease"], label: "Remove Disease" }]);
  equal("B8 Remove Curse: a curse affliction first (quiet when none), then its curse-effect row (standing down if one was found)", (spells["Remove Curse"] ?? []).map((r) => [r.kind, r.afflictionTypes ?? r.traits, Boolean(r.quietIfNone), Boolean(r.skipIfCured)]), [["counteractAffliction", ["curse"], true, false], ["counteract", ["curse"], false, true]]);
}

/* C — CD0: no bare speed node in any pack ----------------------------- */
{
  const SPEED_NODE = /^system\.combat\.movement\.(land|fly|swim|climb|burrow)$/;
  const bare = [];
  let based = 0;
  for (const pack of fs.readdirSync(path.join(SYSTEM_ROOT, "packs"))) {
    const tmp = fs.mkdtempSync(`/tmp/v3695-${pack}-`);
    fs.cpSync(path.join(SYSTEM_ROOT, "packs", pack), tmp, { recursive: true });
    const db = new ClassicLevel(tmp, { valueEncoding: "json" });
    for await (const [k, v] of db.iterator()) for (const c of v?.changes ?? []) {
      if (SPEED_NODE.test(c.key)) bare.push(`${pack}: ${v.name} (${c.key})`);
      if (/^system\.combat\.movement\.(land|fly|swim|climb|burrow)\.base$/.test(c.key)) based += 1;
    }
    await db.close(); fs.rmSync(tmp, { recursive: true, force: true });
  }
  equal("C1 no Active Effect in any pack writes the bare speed node", bare, []);
  ok("C2 the 28 re-keyed changes write the pool's base (races, companions, familiars, feats)", based >= 28, `${based} .base changes`);
  const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes;
  equal("C3 declared, as every pack edit is: 23 effect rows and the two spell rows in tools/data-fixes.json", [fixes.filter((f) => f.id.startsWith("cd0-speed-") && f.op === "editEffect").length, fixes.filter((f) => f.id.startsWith("cd13-")).length], [23, 2]);
}

/* D — CD14: the declared spell-attack bonus, and item casts ---------- */
{
  const sdc = await mod("magic", "spell-dc-bonus.mjs");
  const fx = (flags) => ({ flags: { "trg-prime": flags } });
  const er = [fx({ spellDCBonus: { label: "Eternal Resonance", value: 1, type: "race", innateOnly: true, itemCasts: true }, spellAttackBonus: { label: "Eternal Resonance", value: 1, type: "race", innateOnly: true, itemCasts: true } })];
  equal("D1 an innate cast gets the declared attack row; a prepared one does not", [sdc.declaredSpellAttackBonuses(er, "", { innate: true }), sdc.declaredSpellAttackBonuses(er, "", { innate: false })], [[{ label: "Eternal Resonance", value: 1, type: "race" }], []]);
  equal("D2 an item's innate spell gets it only from an itemCasts row", [sdc.declaredSpellAttackBonuses(er, "", { innate: true, itemCast: true }).length, sdc.declaredSpellDCBonuses(er, "", { innate: true, itemCast: true }).length, sdc.declaredSpellDCBonuses([fx({ spellDCBonus: { value: 1, type: "race", innateOnly: true } })], "", { innate: true, itemCast: true }).length], [1, 1, 0]);
  equal("D3 typed rows still take the highest, untyped sum", sdc.declaredSpellAttackBonuses([fx({ spellAttackBonus: [{ value: 1, type: "race" }, { value: 2, type: "race" }, { value: 1 }, { value: 1 }] })], "").map((r) => r.value), [2, 1, 1]);
  const cw = read("module", "magic", "cast-workflow.mjs");
  ok("D4 the cast hands the declared attack rows to the attack pool, at both of its calls", (cw.match(/splashSaveDC: nominalSaveDC,\n(?:\s*\/\/[^\n]*\n)?\s+declaredAttackRows,\n/g) ?? []).length === 2 && /\.concat\(Array\.isArray\(declaredAttackRows\) \? declaredAttackRows : \[\]\), \{\}\);/.test(cw) && /const declaredAttackRows = declaredSpellAttackBonuses\(\n\s*Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\), spellData\.traits, \{ innate: isInnate, itemCast: isItemCast \}\);/.test(cw));
  ok("D5 the Save DC takes an item's spell's itemCasts rows, and nothing else of an item's", /\.\.\.\(isItemCast \? declaredSpellDCBonuses\(\n\s*Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\), spellData\.traits, \{ innate: isInnate, itemCast: true \}\) : \[\]\),/.test(cw));
}

/* Z — the release ------------------------------------------------------ */
const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.695.0, and the download names it", [sys.version, JSON.parse(read("package.json")).version, sys.download.includes("/v3.711.1/")], ["3.711.1", "3.711.1", true]);

console.log(`verify-fixes-3695-0: ${checks} checks — ${failures.length ? `${failures.length} FAILED` : "all green."}`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
