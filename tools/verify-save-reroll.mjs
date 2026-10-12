#!/usr/bin/env node
/**
 * verify-save-reroll — a spell cast in answer to a save, declared as a row
 * (3.625.0): Lucky Break's shape for a caster who need not be the saver
 * (Pillars of Faith's Saintly Intercession); the warps that widen the
 * degrees it answers and add a bonus to the second roll; relief's three
 * new conditions; a Judgement rider that grows against a wounded Subject.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const { normaliseSaveReroll, saveRerollOf, offerableDegrees, rerollCovers, rerollModifier, saveRerollLine } = await import(new URL("../module/magic/save-reroll.mjs", import.meta.url));
const { aggregateWarpSelection, emptyWarp } = await import(new URL("../module/magic/spell-warp.mjs", import.meta.url));
const { HANDLED_EFFECT_KINDS } = await import(new URL("../module/magic/effect-kinds.mjs", import.meta.url));
const { RELIEVABLE } = await import(new URL("../module/magic/condition-relief.mjs", import.meta.url));
const { declaredDamageRiders, damageRidersFor, riderFormula } = await import(new URL("../module/combat/damage-riders.mjs", import.meta.url));

const row = { kind: "saveReroll", target: "targets", degrees: ["partial", "Failure"], immunity: "10 minutes" };
equal("A1 the row normalises: degrees lower-cased, immunity in seconds", normaliseSaveReroll(row), { degrees: ["partial", "failure"], immunitySeconds: 600 });
equal("A2 a row with no real degree, or the wrong kind, is null; an unreadable immunity is 0", [normaliseSaveReroll({ kind: "saveReroll", degrees: ["win"] }), normaliseSaveReroll({ kind: "note", degrees: ["failure"] }), normaliseSaveReroll({ kind: "saveReroll", degrees: ["failure"], immunity: "a while" })?.immunitySeconds], [null, null, 0]);
ok("A3 the kind is one the applier handles", HANDLED_EFFECT_KINDS.includes("saveReroll"));
const spell = { name: "Saintly Intercession", system: { effects: [{ kind: "note", text: "x" }, row], warps: [{ ppCost: 2, text: "a Fumble", mods: { rerollDegrees: ["fumble"] } }, { ppCost: 4, text: "a Blunder", mods: { rerollDegrees: ["blunder"] } }, { ppCost: 4, text: "+2 status", mods: { rerollBonus: 2 } }] } };
const spec = saveRerollOf(spell.system);
equal("B1 saveRerollOf finds the row among others; a spell without one gives null", [spec?.degrees, saveRerollOf({ effects: [{ kind: "note" }] })], [["partial", "failure"], null]);
equal("B2 the offerable degrees include what the warps could buy", offerableDegrees(spec, spell.system.warps).sort(), ["blunder", "failure", "fumble", "partial"]);
const agg = aggregateWarpSelection(spell.system.warps, { "warp-0": true, "warp-2": true });
equal("C1 the warps aggregate: 6 PP, fumble answered, +2 to the reroll; the empty mods carry both keys", [agg.ppSpent, agg.mods.rerollDegrees, agg.mods.rerollBonus, emptyWarp().mods.rerollDegrees, emptyWarp().mods.rerollBonus], [6, ["fumble"], 2, [], 0]);
equal("C2 rerollCovers: a Failure always; a Fumble only with the warp; a Blunder not with this selection", [rerollCovers(spec, agg.mods, "failure"), rerollCovers(spec, agg.mods, "fumble"), rerollCovers(spec, agg.mods, "blunder"), rerollCovers(spec, emptyWarp().mods, "fumble")], [true, true, false, false]);
equal("C3 the reroll modifier is a status bonus, or null", [rerollModifier(agg.mods, "Saintly Intercession"), rerollModifier(emptyWarp().mods, "x")], [{ label: "Saintly Intercession", value: 2, type: "status" }, null]);
ok("C4 the card line names the spell, the caster, the first result and the bonus", /Saintly Intercession \(Mara\): Toben's Failure \(9\) is rerolled at \+2 status/.test(saveRerollLine("Saintly Intercession", "Mara", "Failure", 9, "Toben", 2)));
ok("C5 …and the immunity's own span (3.625.1): 600 s reads \"10 minutes\", 3600 \"1 hour\", none \"for a while\"", /immune to Saintly Intercession for 10 minutes\./.test(saveRerollLine("Saintly Intercession", "Mara", "Failure", 9, "Toben", 0, 600)) && /for 1 hour\./.test(saveRerollLine("S", "M", "Failure", 9, "T", 0, 3600)) && /for a while\./.test(saveRerollLine("S", "M", "Failure", 9, "T", 0, 0)));

// DYING JOINED THE RAIL AT 3.630.0 (Soulvine, Divine Nectar); Dazzled is removed outright instead.
equal("D1 Sickened, Frightened and Dying are relievable at step 1; Dazzled (not valued) is not", [RELIEVABLE.sickened?.step, RELIEVABLE.frightened?.step, "dazzled" in RELIEVABLE, RELIEVABLE.dying?.step], [1, 1, false, 1]);

const judgement = declaredDamageRiders([{ id: "j", name: "Judgement", flags: { "trg-prime": { strikeDamageRider: { dice: "1d6", label: "Judgement", targetUuids: ["Actor.s"], oncePerRound: true, lowHalfExtraDice: "1d6" } } } }]);
equal("E1 the extra dice read", judgement[0].lowHalfExtraDice, "1d6");
equal("E2 against a Subject at half HP or fewer the rider grows for this strike; above half it does not; the stored rider is untouched", [riderFormula(damageRidersFor(judgement, { targetUuid: "Actor.s", targetHp: 10, targetMax: 20 })), riderFormula(damageRidersFor(judgement, { targetUuid: "Actor.s", targetHp: 11, targetMax: 20 })), judgement[0].dice], [" + 1d6 + 1d6", " + 1d6", "1d6"]);
equal("E3 a rider without the field never grows", riderFormula(damageRidersFor(declaredDamageRiders([{ id: "p", flags: { "trg-prime": { strikeDamageRider: { dice: "1d6" } } } }]), { targetHp: 1, targetMax: 20 })), " + 1d6");

const wf = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "save-reaction-spells-workflow.mjs"), "utf8");
ok("F1b STRUCTURAL: the line is handed the row's seconds", /saver\.name, bonus\?\.value \?\? 0, chosen\.spec\.immunitySeconds\);/.test(wf));
ok("F1 STRUCTURAL: the offer walks every token's spells for a row, gates on side, range, reactions and immunity, and rerolls only what the warps cover", /const spec = saveRerollOf\(spell\.system\);/.test(wf) && /immune: immunityRemaining\(record, spell\.name, now\) > 0/.test(wf) && /if \(!rerollCovers\(chosen\.spec, result\.warpMods, degree\.key\)\)/.test(wf) && /await check\.reroll\(\);/.test(wf));
const ck = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "dice", "check.mjs"), "utf8");
ok("F2 STRUCTURAL: the save path asks after Lucky Break, and only when Lucky Break found nothing", /const luck = await offerLuckyBreak\(check\);[\s\S]{0,400}if \(!luck\) \{\s*const answered = await offerSaveRerollSpells\(check\);/.test(ck));
const aw = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs"), "utf8");
ok("F3 STRUCTURAL: the attack hands the target's HP to damageRidersFor", /targetHp: Number\(targetActor\?\.system\?\.resources\?\.hp\?\.value \?\? NaN\),\s*targetMax: Number\(targetActor\?\.system\?\.resources\?\.hp\?\.max \?\? 0\)(,[\s\S]{0,400}?)?\s*\}\s*\);/.test(aw));

const EXPECTED = 19;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-save-reroll: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-save-reroll: ${checks} checks — all green.`);
