#!/usr/bin/env node
/**
 * verify-live-fixes-3-627-1 — the defects the 7 October 2026 live pass of
 * 3.627.0 / Pillars of Faith 0.9.0 found, and Graham's Undead ruling.
 *
 *   C  a forced save or skill check carries the sheet's modifiers
 *   E  the once-a-day exposure marker is a flat key that can be found again
 *   L  a Natural Leaper's automatic High Jump pays the printed AP
 *   R  a player's critical injury writes its records through the GM relay
 *   U  the Undead creature type is immune to disease, in the pack and on
 *      the copies NPCs already own
 */
import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* ------------------------------------------------------------------ *
 * C — the modifiers a forced check starts from
 * ------------------------------------------------------------------ */
const { withCheckModifiers } = await import(new URL("../module/dice/check-modifiers.mjs", import.meta.url));
const sheetRow = { label: "Constitution and Cleric base", value: 13, type: "untyped" };
const actor = { system: {
  combat: { saves: { fortitude: { total: 13, checkModifiers: [sheetRow] }, will: { total: 9 } } },
  skills: { athletics: { label: "Athletics", total: 17, checkModifiers: [{ label: "Athletics", value: 17, type: "untyped" }] } }
} };
const fort = withCheckModifiers({ actor, type: "save", save: "fortitude", dc: 26 });
equal("C1 a save named by `save` gains its subject and the sheet's rows", [fort.subject, fort.modifiers], ["fortitude", [sheetRow]]);
ok("C2 the rows are copies — the roll cannot write back into the sheet", fort.modifiers[0] !== sheetRow);
equal("C3 a save with no prepared rows rolls its total, untyped", withCheckModifiers({ actor, type: "save", save: "will" }).modifiers, [{ label: "Will save", value: 9, type: "untyped" }]);
equal("C4 a skill check gains the skill's rows", withCheckModifiers({ actor, type: "skill", subject: "athletics" }).modifiers.map((m) => m.value), [17]);
const given = [{ label: "Given", value: 2, type: "status" }];
equal("C5 a config that brings its own modifiers keeps them", withCheckModifiers({ actor, type: "save", subject: "fortitude", modifiers: given }).modifiers, given);
equal("C6 anything else passes through untouched", withCheckModifiers({ actor, type: "attack", dc: 10 }).modifiers, undefined);
const SITES = [
  ["combat", "death-guard-workflow.mjs"], ["combat", "declared-after-strikes-workflow.mjs"],
  ["creature-aura-workflow.mjs"], ["drink-blood-workflow.mjs"]
];
for (const [i, parts] of SITES.entries()) {
  ok(`C${7 + i} ${parts.at(-1)} rolls through withCheckModifiers`, /TRGCheck\.roll\(withCheckModifiers\(\{/.test(read("module", ...parts)) && !/TRGCheck\.roll\(\{/.test(read("module", ...parts)));
}
ok("C11 a module's rollCheck helper is made whole the same way", /rollCheck: async \(config\) => \{\s*const \{ withCheckModifiers \} = await import\("\.\/dice\/check-modifiers\.mjs"\);\s*return \(await import\("\.\/dice\/check\.mjs"\)\)\.TRGCheck\.roll\(withCheckModifiers\(config\)\);/.test(read("module", "module-api-workflow.mjs")));

/* ------------------------------------------------------------------ *
 * E — the exposure marker
 * ------------------------------------------------------------------ */
const da = await import(new URL("../module/combat/declared-after-strikes.mjs", import.meta.url));
const key = da.exposureKey("Actor.7FkMqfDRudPUcBuW", "Ghoul Fever (Disease)");
equal("E1 the key carries no dot, so a flag write stores it flat", [key.includes("."), key], [false, "Actor_7FkMqfDRudPUcBuW:ghoul fever (disease)"]);
ok("E2 written flat, it closes the day", da.exposureBlocked({ [key]: 1000 }, key, 1000 + 3600) === true && da.exposureBlocked({ [key]: 1000 }, key, 1000 + da.DAY_SECONDS) === false);
ok("E3 a dot in the affliction's name is made safe too", !da.exposureKey("Actor.x", "Mummy Rot v1.2").includes("."));

/* ------------------------------------------------------------------ *
 * L — the Natural Leaper's AP
 * ------------------------------------------------------------------ */
const jumping = await import(new URL("../module/jumping.mjs", import.meta.url));
equal("L1 the printed cost before the trade is what a checkless leap pays", [jumping.leapApCost("2 (or 1 with a +2 difficulty increase)"), jumping.leapApCost("1"), jumping.leapApCost("Free"), jumping.leapApCost("Reaction")], ["2", "1", "Free", "Reaction"]);
const aw = read("module", "combat", "action-workflow.mjs");
ok("L2 the leap spends that cost, not the whole string", /const leapCost = leapApCost\(action\.apCost\);\s*if \(!\(await ensureActionPoints\(actor, leapCost, action\.name(, \{ traits: action\.traits \})?\)\)\) return null;\s*await spendActionCost\(actor, leapCost, action\.name/.test(aw));

/* ------------------------------------------------------------------ *
 * R — the injury records through the relay
 * ------------------------------------------------------------------ */
const relay = await import(new URL("../module/combat/target-relay.mjs", import.meta.url));
equal("R1 the action exists", relay.RELAY_ACTIONS.INJURY_RECORD, "target.injuryRecord");
const calls = [];
const deps = { fromUuid: async () => ({ name: "NPC" }), recordInjury: async (t, kind, entry) => { calls.push([kind, entry]); return true; } };
const okReply = await relay.performRelay({ action: relay.RELAY_ACTIONS.INJURY_RECORD, uuid: "Actor.x", payload: { kind: "persistence", entry: { code: "UH" } } }, deps);
equal("R2 a named record is written on the GM's client", [okReply, calls], [{ ok: true, result: true }, [["persistence", { code: "UH" }]]]);
const bad = await relay.performRelay({ action: relay.RELAY_ACTIONS.INJURY_RECORD, uuid: "Actor.x", payload: { kind: "flags.anything", entry: {} } }, deps);
equal("R3 any other kind is refused and nothing is written", [bad.ok, calls.length], [false, 1]);
const atk = read("module", "combat", "attack-workflow.mjs");
ok("R4 the Persistence record relays", /await relayInjuryRecord\(targetActor, "persistence", persistenceEntry,\s*\(\) => recordPersistence\(targetActor, persistenceEntry\)\)/.test(atk));
ok("R5 the Fatal mark relays", /await relayInjuryRecord\(targetActor, "fatal", fatalEntry, \(\) => markFatalInjury\(targetActor, fatalEntry\)\);/.test(atk));
ok("R6 the Injured location relays", /const located = await relayInjuryRecord\(targetActor, "location", \{ location: hitLocation \}, async \(\) => \{/.test(atk) && /if \(located\) \{/.test(atk));
ok("R7 a held breath's lost air relays", /await relayInjuryRecord\(targetActor, "air", \{\}, \(\) => loseAirToEvent\(targetActor, \{ criticallyHit: true \}\)\);/.test(atk));
ok("R8 nothing in the strike writes those records directly any more", !/^\s*await (recordPersistence|markFatalInjury|loseAirToEvent)\(targetActor/m.test(atk) && !/if \(await recordPersistence\(targetActor/.test(atk));
const rw = read("module", "combat", "target-relay-workflow.mjs");
ok("R9 the GM's client knows how to write each kind", /recordInjury: async \(target, kind, entry\) => \{/.test(rw) && /kind === "persistence" \? recordPersistence\(target, entry\) : markFatalInjury\(target, entry\)/.test(rw) && /loseAirToEvent\(target, \{ criticallyHit: true \}\)/.test(rw) && /injured\.setFlag\("trg-prime", "injuryLocation"/.test(rw));
ok("R10 an owner writes directly; a failure is announced, never thrown", /export async function relayInjuryRecord\(target, kind, entry, applyDirect\) \{\s*if \(!needsRelay\(target\)\) return applyDirect\(\);[\s\S]{0,200}announceRelayFailure\(target, null, reply\.reason, "Injury record not written"\);\s*return false;/.test(rw));

// 3.627.2 — the re-test as a player found three more direct writes in a critical.
ok("R11 a Death critical's dying crosses at the relay, and only an owner reaps", /await relayStatus\(targetActor, "dying", \{ value: deadAt \}, \(\) =>\s*targetActor\.toggleStatusEffect\("dying", \{ value: deadAt \}\)\);\s*const reaped = targetActor\.isOwner \? await reapDead\(targetActor, game\.combat \?\? null\) : \{ removed: false \};/.test(atk));
ok("R12 the PP drain and the AP watch relay", /relayInjuryRecord\(targetActor, "ppDrain", \{ amount: spent \}/.test(atk) && /relayInjuryRecord\(targetActor, "apWatch", watch, \(\) => armApSpendWatch\(targetActor, watch\)\)/.test(atk) && !/^\s*await armApSpendWatch\(targetActor/m.test(atk));
const drained = []; const ppDeps = { fromUuid: async () => ({}), recordInjury: async (t, kind, entry) => { drained.push([kind, entry]); return true; } };
equal("R13 the GM's client accepts the two new kinds", [(await relay.performRelay({ action: relay.RELAY_ACTIONS.INJURY_RECORD, uuid: "Actor.x", payload: { kind: "ppDrain", entry: { amount: 2 } } }, ppDeps)).ok, (await relay.performRelay({ action: relay.RELAY_ACTIONS.INJURY_RECORD, uuid: "Actor.x", payload: { kind: "apWatch", entry: { threshold: 2 } } }, ppDeps)).ok], [true, true]);
ok("R14 and drains no more than the pool holds", /const spent = Math\.min\(pool, Math\.max\(0, Math\.floor\(Number\(entry\.amount\) \|\| 0\)\)\);/.test(rw));

/* ------------------------------------------------------------------ *
 * U — Undead disease immunity
 * ------------------------------------------------------------------ */
const repairs = await import(new URL("../module/data/pack-repairs.mjs", import.meta.url));
const undead = repairs.EFFECT_REPAIRS.find((r) => r.id === "undead-disease-immunity");
equal("U1 the repair adds disease and nothing else", undead && undead.to.changes.map((c) => c.value).filter((v) => !undead.from.changes.some((f) => f.value === v)), [", disease"]);
const stale = { name: "Undead: immunities", changes: JSON.parse(JSON.stringify(undead.from.changes)), description: undead.from.description };
equal("U2 an owned copy still holding the old list is brought up to the new one", repairs.effectRepairUpdate(undead, stale), { changes: undead.to.changes, description: undead.to.description });
equal("U3 an already-repaired copy is left alone", repairs.effectRepairUpdate(undead, { name: "Undead: immunities", changes: undead.to.changes, description: undead.to.description }), null);
const houseRuled = { name: "Undead: immunities", changes: [...stale.changes, { key: "system.combat.immunities", mode: 2, value: ", fear", priority: 20 }], description: "House rule." };
equal("U4 a GM's own edit is left alone", repairs.effectRepairUpdate(undead, houseRuled), null);
equal("U5 a different effect is not touched", repairs.effectRepairUpdate(undead, { ...stale, name: "Undead: ability modifiers" }), null);
const mig = read("module", "migration.mjs");
ok("U6 the migration runs the pass at 3.627.1 and is stamped there", /runIf\("3\.627\.1", "declared effect repairs on owned items \(Undead disease immunity\)",\s*\(\) => migrateOwnedEffectRepairs\(actors, tokenActors, Array\.from\(game\.items \?\? \[\]\)\)\)\)/.test(mig) && (/export const TRG_SCHEMA_VERSION = "([\d.]+)";/.exec(mig)?.[1] ?? "0").localeCompare("3.627.1", undefined, { numeric: true }) >= 0);
ok("U7 the pass matches by item type and name and writes only what effectRepairUpdate returns", /if \(item\?\.type !== repair\.itemType \|\| lower\(item\?\.name\) !== lower\(repair\.name\)\) continue;/.test(mig) && /const update = effectRepairUpdate\(repair, effect\._source \?\? effect\);\s*if \(!update\) continue;/.test(mig));
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "creature-types"), { valueEncoding: "json" });
let packEffect = null;
await db.open();
try {
  let undeadId = null;
  const effects = [];
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.name === "Undead") undeadId = v._id;
    if (k.startsWith("!items.effects!")) effects.push([k, v]);
  }
  packEffect = effects.find(([k, v]) => k.startsWith(`!items.effects!${undeadId}.`) && v?.name === "Undead: immunities")?.[1] ?? null;
} finally { await db.close(); }
ok("U8 the pack's Undead carries exactly the repaired effect", packEffect && repairs.effectRepairUpdate(undead, packEffect) === null
  && JSON.stringify(packEffect.changes) === JSON.stringify(undead.to.changes) && packEffect.description === undead.to.description);
const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes;
const row = fixes.find((f) => f.id === "undead-immunities-disease-changes");
ok("U9 the data-fix row and the owned-copy repair declare the same old and new", row && JSON.stringify(row.from) === JSON.stringify(undead.from.changes) && JSON.stringify(row.to) === JSON.stringify(undead.to.changes));

/* ------------------------------------------------------------------ *
 * T — "racial" is read as the core's "race"
 * ------------------------------------------------------------------ */
const cond = await import(new URL("../module/conditionals.mjs", import.meta.url));
const { BONUS_TYPES } = await import(new URL("../module/dice/resolution.mjs", import.meta.url));
const racial = cond.normaliseConditional({ kind: "modifier", value: 2, type: "racial", label: "Iron Will of the Tomb", when: { checkTypes: ["save"] } }, { name: "Iron Will of the Tomb" }, 0);
equal("T1 a copy written 'racial' is read as race, a type the stacking knows", [racial?.type, "race" in BONUS_TYPES, "racial" in BONUS_TYPES], ["race", true, false]);
equal("T2 other types pass through", cond.normaliseConditional({ kind: "modifier", value: 1, type: "Status", label: "x", when: { checkTypes: ["save"] } }, { name: "x" }, 0)?.type, "status");

const EXPECTED = 42;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-live-fixes-3-627-1: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-live-fixes-3-627-1: ${checks} checks — all green.`);
