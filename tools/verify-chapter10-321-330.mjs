#!/usr/bin/env node
/**
 * verify-chapter10-321-330 — block 32, the first half of R1 (3.606.0).
 *
 * Nine save ladders from pages 325-333, and the small pieces they needed:
 *
 *   L  the save ladder's three words (half, full, margin), its destination
 *      and soul rungs, and a critical with no dice in front of it
 *   W  the cast workflow using them — the ladder's own damage type, one
 *      shared roll, the one door every rung's amount comes through
 *   E  a save owed when a spell ends (Speed)
 *   F  a forced Step and a fall, as spell rows
 *   H  the haunting, and the Rest workflow that reads it
 *   R  a destroyed soul, and Resurrection refusing it
 *   A  "an Acrobatics check" — the 3.605.1 article defect
 *   D  the degree reading of the new gated rows
 *   P  the pack, against the plan, and the manifest against both
 *
 * DRIVEN WHERE IT CAN BE. The pure modules are called with the degrees and
 * margins a table would roll; source is read only where the rule lives in
 * Foundry-bound code that cannot be run here, and those checks name the
 * exact expression rather than a word near it.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  DEGREE_ORDER, normaliseSaveLadder, normaliseRecurringLadder, saveLadderOutcome,
  saveLadderLine, ladderRungAmount, ladderUsesSharedRoll
} from "../module/magic/save-ladder.mjs";
import { valueFromMargin } from "../module/magic/condition-timing-rules.mjs";
import { normaliseEndSave, endSaveOutcome, endSaveLine, END_SAVE_FLAG } from "../module/magic/end-save.mjs";
import { effectiveSaveDegree } from "../module/magic/spell-degrees.mjs";
import { MARKERS, isMarkerKey } from "../module/magic/markers.mjs";
import {
  SOUL_DESTROYED_FLAG, soulDestroyedRecord, soulIsGone, soulDestroyedByLine, soulGoneRefusalLine
} from "../module/magic/resurrection.mjs";
import { skillLadderOpeningLine } from "../module/magic/skill-ladder.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { SKILLS } from "../module/config.mjs";
import { PLAN, plannedFields } from "./block32-plan.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const src = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MARGINS = { heroic: 22, critical: 12, success: 2, partial: -3, failure: -7, fumble: -15, blunder: -25 };
const amount = (spec, d, shared = 13) => ladderRungAmount(saveLadderOutcome(spec, d),
  { shared, margin: MARGINS[d], fromMargin: valueFromMargin });

/* ================================================================== *
 * L. The save ladder's new vocabulary — driven
 * ================================================================== */

const slay = normaliseSaveLadder(PLAN["Slay The Soul"].effects[0]);
const soul = normaliseSaveLadder(PLAN["Soul Destruction"].effects[0]);
const burst = normaliseSaveLadder(PLAN["Sound Burst"].effects[0]);

ok("L1 all three authored ladders parse", Boolean(slay && soul && burst));
ok("L1b a rung of \"half\" is read as a word, not refused as bad dice", burst?.ladder?.success === "half");
ok("L1c and a rung of \"margin\"", slay?.ladder?.partial === "margin");
ok("L1d a genuinely bad rung is still refused",
  normaliseSaveLadder({ kind: "saveLadder", damageType: "fire", ladder: { success: "halfish" } }) === null);

ok("L2 a recurring ladder refuses \"half\" — its roll is long gone by the end of a turn",
  normaliseRecurringLadder({ save: "will", damageType: "fire", ladder: { success: "half" } }) === null);
ok("L2b and \"margin\", which its sweep would hand to new Roll() and throw",
  normaliseRecurringLadder({ save: "will", damageType: "fire", ladder: { failure: "margin" } }) === null);
ok("L2c and still accepts dice",
  normaliseRecurringLadder({ save: "will", damageType: "fire", ladder: { failure: "1d6" } }) !== null);

ok("L3 a ladder with a half rung needs the cast's roll", ladderUsesSharedRoll(burst) === true);
ok("L3b a margin ladder does not", ladderUsesSharedRoll(slay) === false);
ok("L3c nor a dice ladder", ladderUsesSharedRoll(soul) === false);

ok("L4 Sound Burst's Success takes HALF the burst, floored", amount(burst, "success", 13).fixed === 6);
ok("L4b its Failure takes it all", amount(burst, "failure", 13).fixed === 13);
ok("L4c a Partial reads at Failure and takes it all", amount(burst, "partial", 13).fixed === 13);
ok("L4d with no roll to share, the rung says why rather than dealing 0",
  amount(burst, "failure", null).why !== "" && amount(burst, "failure", null).fixed === null);
ok("L4e a Critical is unaffected", saveLadderOutcome(burst, "critical").harmless === true);
ok("L4f a Fumble takes it all AND a minor critical",
  amount(burst, "fumble", 13).fixed === 13 && saveLadderOutcome(burst, "fumble").severity === "minor");

ok("L5 Slay The Soul's Partial deals one per point of failure — 3 short, 3 essence",
  amount(slay, "partial").fixed === 3, JSON.stringify(amount(slay, "partial")));
ok("L5b with a serious critical", saveLadderOutcome(slay, "partial").severity === "serious");
ok("L5c an unmeasured margin is said, not read as the minimum",
  ladderRungAmount(saveLadderOutcome(slay, "partial"), { margin: null, fromMargin: valueFromMargin }).why !== "");
ok("L5d its Failure is a DESTINATION of 0 HP", saveLadderOutcome(slay, "failure").dropsTo === 0);
ok("L5e and a destination is not harmless", saveLadderOutcome(slay, "failure").harmless === false);
ok("L5f its Fumble kills", saveLadderOutcome(slay, "fumble").slays === true);
ok("L5g a Blunder kills too — the worst roll is never the safest",
  saveLadderOutcome(slay, "blunder").slays === true);
ok("L5h a Critical and a Heroic read at the printed Success: unaffected",
  saveLadderOutcome(slay, "critical").harmless === true && saveLadderOutcome(slay, "heroic").harmless === true);
ok("L5i a 0 destination survives normalising — 0 is a destination, not an absence",
  normaliseSaveLadder({ kind: "saveLadder", damageType: "x", ladder: { failure: "" }, dropsToOn: { failure: 0 } })
    ?.dropsToOn?.failure === 0);

ok("L6 a rung with a critical and no dice is NOT harmless — Soul Destruction's Success",
  saveLadderOutcome(soul, "success").harmless === false && saveLadderOutcome(soul, "success").severity === "minor");
ok("L6b the rungs rise minor, serious, deadly",
  ["success", "partial", "failure"].map((d) => saveLadderOutcome(soul, d).severity).join() === "minor,serious,deadly");
ok("L6c its Critical rolls 2d10", amount(soul, "critical").formula === "2d10");
ok("L6d its Fumble kills and destroys the soul",
  saveLadderOutcome(soul, "fumble").slays === true && saveLadderOutcome(soul, "fumble").soulDestroyed === true);

{
  const line = saveLadderLine("Ann", "partial", saveLadderOutcome(soul, "partial"), 0, "essence");
  ok("L7 a dice-less rung does not print \"0 essence damage\"", !/\b0<\/strong> essence damage/.test(line), line);
  ok("L7b it names the critical", /serious critical injury/.test(line), line);
  const dealt = saveLadderLine("Ann", "failure", saveLadderOutcome(burst, "failure"), 11, "sonic");
  ok("L7c a rung that dealt damage still prints it", /<strong>11<\/strong> sonic damage/.test(dealt), dealt);
}

/* ================================================================== *
 * W. The cast workflow — source, because resolveSpellSave is Foundry's
 * ================================================================== */

const cast = src("module", "magic", "cast-workflow.mjs");
const ladderBranch = cast.slice(cast.indexOf("    if (saveLadder) {"), cast.indexOf("    } else if (isBasic) {"));
ok("W1 the ladder branch was found", ladderBranch.length > 200);
ok("W2 THE LADDER'S OWN TYPE — Slay The Soul stores no spell damage, so the spell's type is force",
  /const ladderType = saveLadder\.damageType \|\| damageType;/.test(ladderBranch));
ok("W2b and it is the type the defences see", /type: ladderType,/.test(ladderBranch));
ok("W2c the type the card prints", /saveLadderLine\(target\.name, degreeLabel, outcome, taken, ladderType\)/.test(ladderBranch));
ok("W2d and the type the critical is rolled on", /damageType: ladderType,/.test(ladderBranch));
ok("W3 every rung's amount comes through ladderRungAmount", /ladderRungAmount\(outcome, \{/.test(ladderBranch));
ok("W3b with this target's own margin", /\n\s+margin,\n/.test(ladderBranch));
ok("W3c and valueFromMargin as the rule, not a restatement", /fromMargin: valueFromMargin/.test(ladderBranch));
// THE `if`, NOT THE WORD. The first draft matched `rungAmount.why` and
// survived a mutation that made the branch unreachable, because the word
// also appears inside the card line the branch prints.
ok("W3d a rung that cannot be measured is said on the card", /\n\s+if \(rungAmount\.why\) \{/.test(ladderBranch));
ok("W4 a destination goes through enterDyingAt", /await enterDyingAt\(target, outcome\.dropsTo/.test(ladderBranch));
ok("W4b and is skipped when the rung also kills", /outcome\.dropsTo !== undefined && !outcome\.slays/.test(ladderBranch));
ok("W5 a destroyed soul is written onto the body",
  // ANCHORED ON `await target.`, because `setFlag` is a substring of
  // `unsetFlag` and the first draft passed a mutation that cleared the flag.
  /await target\.setFlag\?\.\(SYSTEM_ID, SOUL_DESTROYED_FLAG,/.test(ladderBranch));
ok("W6 A CRITICAL WITH NO DICE IN FRONT OF IT STILL LANDS",
  /outcome\.severity && \(taken > 0 \|\| \(!outcome\.dice && !outcome\.slays\)\)/.test(ladderBranch));
{
  const sharedAt = cast.indexOf("saveLadder && ladderUsesSharedRoll(saveLadder) && damageFormula");
  ok("W7 a half/full ladder rolls the spell's damage ONCE, before the per-target loop",
    sharedAt > 0 && sharedAt < cast.indexOf("for (const target of targets) {\n    const save = target.system?.combat?.saves?.[parsed.key];"));
  ok("W7b and hands that roll to every rung", /shared: ladderUsesSharedRoll\(saveLadder\) && damageFormula \? baseDamage : null/.test(ladderBranch));
}

/* ================================================================== *
 * E. A save owed when the spell ends — Speed
 * ================================================================== */

const speedRow = PLAN["Speed"].effects.find((e) => e.endSave);
const speed = normaliseEndSave({ ...speedRow.endSave, saveDC: 18, label: "Speed" });
ok("E1 Speed's end save parses", Boolean(speed));
const cost = (d) => endSaveOutcome(speed, d);
ok("E2 the four printed prices: 1, 2, 3, 4",
  ["critical", "success", "failure", "fumble"].map((d) => cost(d).value).join() === "1,2,3,4");
ok("E2b a Partial pays the Failure's 3", cost("partial").value === 3 && cost("partial").rung === "failure");
ok("E2c a Blunder pays the Fumble's 4 and its critical",
  cost("blunder").value === 4 && cost("blunder").severity === "minor");
ok("E2d A HEROIC STILL PAYS — the Critical's 1, not nothing", cost("heroic").value === 1);
ok("E2e only the Fumble carries the critical",
  DEGREE_ORDER.filter((d) => cost(d).severity).join() === "fumble,blunder");
ok("E3 no DC is not a DC of 0", normaliseEndSave({ ...speedRow.endSave, saveDC: 0 })?.saveDC === null);
ok("E3b an unknown save is refused", normaliseEndSave({ ...speedRow.endSave, save: "luck" }) === null);
ok("E3c a negative price is refused",
  normaliseEndSave({ ...speedRow.endSave, values: { failure: -1 } }) === null);
{
  const said = endSaveLine(speed, "Bob", "partial", cost("partial"), 14);
  ok("E4 the card names the roll, the DC, the rung and the price",
    /14<\/strong> vs DC 18/.test(said) && /read as Failure/.test(said) && /Fatigued 3/.test(said), said);
}
const endWf = src("module", "magic", "end-save-workflow.mjs");
const boot = src("scripts", "trg-prime.mjs");
const applier = src("module", "magic", "spell-effects.mjs");
ok("E5 the hook is registered at init", /\n\s+registerEndSaveHooks\(\);/.test(boot));
ok("E5b on deleteActiveEffect, so every ending owes it",
  /Hooks\.on\("deleteActiveEffect", \(effect\) => \{\n\s+try \{\n\s+const raw = effect\?\.getFlag\?\.\(SYSTEM_ID, END_SAVE_FLAG\)/.test(endWf));
ok("E5c by the active GM only", /activeGM\.id !== game\.user\?\.id\) return;/.test(endWf));
ok("E6 the applier stamps it on the GRANTED condition's effect, not the charged one",
  /recordEndSave\(target, \{[\s\S]{0,200}\}, \{ on: effect\.condition, castId \}\)/.test(applier));
ok("E6b and with a cast id it takes that cast's effect or none",
  /castId\n\s+\? candidates\.find\(\(e\) => e\.getFlag\?\.\(SYSTEM_ID, "castId"\) === castId\) \?\? null/.test(endWf));
ok("E6c the flag names match", /END_SAVE_FLAG = "endSave"/.test(src("module", "magic", "end-save.mjs"))
  && END_SAVE_FLAG === "endSave");

/* ================================================================== *
 * F. A forced Step and a fall
 * ================================================================== */

ok("F1 forcedMove is a handled kind", HANDLED_EFFECT_KINDS.includes("forcedMove"));
ok("F1b and fall", HANDLED_EFFECT_KINDS.includes("fall"));
const fmWf = src("module", "combat", "forced-movement-workflow.mjs");
const fmFn = fmWf.slice(fmWf.indexOf("export async function forceMoveAway("));
ok("F2 the forced Step is the Shove button's own planner", /planPushFromIds\(ids, feet\)/.test(fmFn));
ok("F2b and moves only when the plan moved",
  /const destination = plan\.ok && plan\.moved \? \{ x: plan\.finalX, y: plan\.finalY \} : null;\n\s+if \(destination\) await targetToken\.update\(destination\);/.test(fmFn));
ok("F2c no token pair is said, not guessed", /Move it by hand/.test(fmFn));
const fmCase = applier.slice(applier.indexOf('case "forcedMove": {'), applier.indexOf('case "marker": {'));
ok("F3 the applier moves the target away from the CASTER", /forceMoveAway\(caster, target, feet\)/.test(fmCase));
ok("F3b an unknown direction is refused rather than read as away",
  /String\(effect\.direction \?\? "away"\) !== "away"/.test(fmCase));
const fallCase = applier.slice(applier.indexOf('case "fall": {'), applier.indexOf('case "forcedMove": {'));
ok("F4 a fall is the falling rules, prefilled with the depth",
  /rollFalling\(target, \{ distance: feet, onto: null, note \}\)/.test(fallCase));
ok("F4b the Fumble's no-reactions is on the card", /effect\.noReactions/.test(fallCase));
const fallWf = src("module", "combat", "falling-workflow.mjs");
ok("F5 NOBODY LANDS ON THEMSELVES — a spell's victims are this user's targets",
  /targeted && targeted !== actor && targeted\.uuid !== actor\?\.uuid \? targeted : null/.test(fallWf));
ok("F5b onto:null means nobody below; undefined keeps the old behaviour",
  /onto === undefined\n\s+\? Array\.from\(game\.user\?\.targets \?\? \[\]\)\[0\]\?\.actor \?\? null\n\s+: onto;/.test(fallWf));

/* ================================================================== *
 * H. The haunting
 * ================================================================== */

ok("H1 haunted is a marker", isMarkerKey("haunted"));
ok("H1b read by the Rest workflow", MARKERS.haunted?.reader === "module/rest/rest-workflow.mjs");
ok("H1c and not consumed — a day, not one night", MARKERS.haunted?.consumed === false);
const rest = src("module", "rest", "rest-workflow.mjs");
ok("H2 the Rest workflow finds it", /const haunted = Boolean\(findMarker\(actor, "haunted"\)\);/.test(rest));
ok("H2b and a haunted rest recovers from NO hours", /const realHours = haunted \? 0 : tableHours;/.test(rest));
ok("H2c while the table's clock still moves", /hours: tableHours,/.test(rest));
ok("H2d and the card says why", /if \(summary\.haunted\) \{/.test(rest));
ok("H3 A GATED SELF ROW ANSWERS TO THE TARGETS' ROLLS",
  /effect\.target === "self"\n\s+\? \(isDegreeGated\(effect\)\n\s+\? \(ladderResults\.some\(\(r\) => effectAppliesOnDegree\(effect, r\?\.degree\)\)/.test(applier));

/* ================================================================== *
 * R. A destroyed soul
 * ================================================================== */

{
  const rec = soulDestroyedRecord("Soul Destruction", 1000);
  ok("R1 the record names the spell", rec.by === "Soul Destruction" && rec.at === 1000);
  ok("R1b a record is a gone soul", soulIsGone(rec) === true);
  ok("R1c no record is not", soulIsGone(null) === false && soulIsGone({}) === false);
  ok("R2 the moment says resurrection is impossible",
    /resurrection is impossible/.test(soulDestroyedByLine("Ann", "Soul Destruction")));
  ok("R2b the refusal names the spell and how the GM lifts it",
    /Soul Destruction/.test(soulGoneRefusalLine("Ann", rec)) && /soulDestroyed/.test(soulGoneRefusalLine("Ann", rec)));
  ok("R2c a DIFFERENT flag from a failed Resurrection's", SOUL_DESTROYED_FLAG === "soulDestroyed");
  const res = applier.slice(applier.indexOf("resurrectionRefused(target.getFlag"), applier.indexOf("THE BODY COMES BACK"));
  ok("R3 Resurrection refuses a destroyed soul BEFORE touching anything",
    /soulIsGone\(gone\)\) \{\n\s+lines\.push\(line\(soulGoneRefusalLine\(target\.name, gone\)\)\);\n\s+break;/.test(res));
}

/* ================================================================== *
 * A. "an Acrobatics check"
 * ================================================================== */

for (const [key, skill] of Object.entries(SKILLS)) {
  const said = skillLadderOpeningLine("X", { skills: [key] }, 15, ["Ann"]);
  const want = /^[aeiou]/i.test(skill.label) ? "an" : "a";
  ok(`A1 ${skill.label} takes "${want}"`, said.includes(` attempt ${want} <strong>${skill.label}</strong>`), said);
}

/* ================================================================== *
 * D. The degree reading of the new gated rows
 * ================================================================== */

{
  const sd = PLAN["Soul Destruction"].effects;
  ok("D1 THE FUMBLE IS DECLARED — so the slain do not also take the Failure's 10d10",
    effectiveSaveDegree(sd, "fumble") === "fumble");
  ok("D1b and a Blunder reads there too", effectiveSaveDegree(sd, "blunder") === "fumble");
  ok("D1c the 10d10 row is gated on Failure alone",
    deepEqual(sd.find((e) => e.formula === "10d10")?.onSave, ["failure"]));
  const sun = PLAN["Sunburst"].effects;
  ok("D2 Sunburst's blindness is a Fumble rider on a BASIC save — a Failure is not blinded",
    effectiveSaveDegree(sun, "failure", { basicSave: true }) === "failure"
      && !sun[0].onSave.includes("failure"));
  ok("D2b a Blunder is blinded", effectiveSaveDegree(sun, "blunder", { basicSave: true }) === "fumble");
  const st = PLAN["Startle"].effects;
  ok("D3 Startle's Partial reads at Failure and is moved", effectiveSaveDegree(st, "partial") === "failure");
  ok("D3b a Success is not", effectiveSaveDegree(st, "success") === "success"
    && !st.some((e) => e.onSave?.includes("success")));
}

/* ================================================================== *
 * P. The pack, the plan and the manifest
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const pack = new Map();
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") pack.set(String(v.name).trim(), v.system);
  }
} finally { await db.close(); }

// A FIELD A LATER RULING REWROTE is checked against the later plan (3.608.1:
// Graham's "heroic should also haunt the caster" on Speak With Dead). This
// plan stays the record of what 3.606.0 wrote, and P11 still holds it to that.
const { PLAN: LATER } = await import("./block32d-plan.mjs");
for (const [name, fields] of Object.entries(PLAN)) {
  const sy = pack.get(name);
  ok(`P1 ${name} is in the pack`, Boolean(sy));
  for (const [field, value] of Object.entries(fields)) {
    const expected = LATER[name]?.[field] ?? value;
    ok(`P1b ${name}.${field} is exactly the plan`, deepEqual(sy?.[field], expected));
  }
}
{
  const kind = (n, k) => (pack.get(n)?.effects ?? []).filter((e) => e.kind === k);
  ok("P2 Slay The Soul carries its ladder", kind("Slay The Soul", "saveLadder").length === 1);
  ok("P2b with no Critical rung — the page prints none",
    !Object.hasOwn(kind("Slay The Soul", "saveLadder")[0]?.ladder ?? {}, "critical"));
  ok("P3 Soul Destruction carries three Soul Drain rows",
    kind("Soul Destruction", "resource").map((e) => e.formula).join() === "4d10,6d10,10d10");
  ok("P4 Sound Burst's deafened is 1 round, on Failure and Fumble",
    kind("Sound Burst", "condition").some((e) => e.condition === "deafened" && e.duration === "1 round"
      && deepEqual(e.onSave, ["failure", "fumble"])));
  ok("P4b and its stored 2d10 is what the ladder shares", pack.get("Sound Burst")?.damage?.formula === "2d10");
  ok("P5 Sunburst stays Basic", /basic/i.test(pack.get("Sunburst")?.defence ?? ""));
  ok("P5b its blindness is permanent",
    kind("Sunburst", "condition").some((e) => e.condition === "blinded" && e.duration === "permanent"));
  ok("P6 Startle's Step is 5 feet, away", kind("Startle", "forcedMove").some((e) => e.feet === 5 && e.direction === "away"));
  ok("P7 Snagging Pit's falls are 10 feet, the Fumble's with no reactions",
    kind("Snagging Pit", "fall").map((e) => `${e.feet}:${Boolean(e.noReactions)}`).join() === "10:false,10:true");
  ok("P8 Speed's quickened owes the save", kind("Speed", "condition").some((e) => e.condition === "quickened" && e.endSave));
  ok("P9 Speak With Dead now rolls a Will save", pack.get("Speak With Dead")?.defence === "Will");
  ok("P9b its haunting is a self row gated on the Heroic and the Critical, for a day",
    kind("Speak With Dead", "marker").some((e) => e.target === "self" && e.marker === "haunted"
      && deepEqual(e.onSave, ["heroic", "critical"]) && e.duration === "1 day"));
  ok("P10 Suggestion names all four rungs",
    ["critical", "success", "failure", "fumble"].every((d) =>
      (pack.get("Suggestion")?.effects ?? []).some((e) => e.kind === "note" && e.onSave?.includes(d))));
}
{
  const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
  for (const [name, fields] of Object.entries(plannedFields())) {
    for (const field of fields) {
      // A FIELD A LATER RULING REWROTE keeps ONE entry (verify-pack-repairs
      // E4), re-dated, with what 3.606.0 wrote kept in `alsoFrom` so copies
      // already brought up to it are still recognised as stale.
      const later = Boolean(LATER[name]?.[field]);
      const entry = PACK_REPAIRS.find((r) => r.name === name && r.field === field
        && r.since === (later ? "3.608.1" : "3.606.0"));
      ok(`P11 ${name}.${field} has a pack-repair entry`, Boolean(entry),
        "a field written here and missing from the manifest is stale on every copy an actor carries");
      ok(`P11b and its \`to\` is the plan`, later
        ? deepEqual(entry?.to, LATER[name][field]) && (entry?.alsoFrom ?? []).some((f) => deepEqual(f, PLAN[name][field]))
        : deepEqual(entry?.to, PLAN[name][field]));
      ok(`P11c and its \`from\` is not the plan — a repair that changes nothing is not one`,
        !deepEqual(entry?.from, entry?.to));
    }
  }
}

if (failures.length) {
  console.log(`verify-chapter10-321-330: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-chapter10-321-330: OK — ${checks} checks. Block 32's first nine ladders, read at the rung the book printed.`);
