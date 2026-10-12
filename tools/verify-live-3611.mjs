#!/usr/bin/env node
/**
 * verify-live-3611 — what the 3.611.0 live drive found.
 *
 * NEW at 3.611.1. `claude/live-testing-report-3.611.0.md` has the drive.
 *
 *   A  F1  the Words' immunity rows name only the printed degrees
 *   B  F2  a recovery that costs no fatigue writes no "Fatigued 0"
 *   C  F3  a relief reads what the creature has; a permanent removal replaces the ignoring
 *   D  G1  a mental-ability choice is worded as one
 *   E  G2  an area the caster chooses is held to the warp's "up to"
 *   F  G3  a Success that still lands a rung is not said to resist
 *   G  G4  the choice is said once per cast
 *   H  Q1  a hostile spell centred on its caster spares the caster (Graham, 2 October 2026)
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { effectiveSaveDegree } from "../module/magic/spell-degrees.mjs";
import { rowAppliesToCast } from "../module/magic/condition-warp.mjs";
import { slotChoiceEmptyLine, slotChoiceWords } from "../module/magic/slot-choice.mjs";
import { nonBasicSaveLine, savedRungActsWith } from "../module/magic/casting.mjs";
import { PLAN } from "./block34-plan.mjs";
import { areaSparesCaster } from "../module/magic/caster-in-area.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* ================================================================== *
 * A. F1 — the Words keep their fallbacks
 * ================================================================== */
for (const name of ["Word Of Stunning", "Word Of Blinding"]) {
  const rows = PLAN[name].effects;
  const imm = rows.find((e) => e.kind === "tempImmunity");
  ok(`A1 ${name}'s immunity names only the printed degrees`,
    JSON.stringify(imm?.onSave) === JSON.stringify(["critical", "success", "failure", "fumble"]), JSON.stringify(imm?.onSave));
  const reads = (rolled) => effectiveSaveDegree(rows.filter((e) => Array.isArray(e.onSave)), rolled);
  ok(`A2 ${name}: a Blunder reads as the Fumble, a Partial as the Failure, a Heroic as the Critical`,
    reads("blunder") === "fumble" && reads("partial") === "failure" && reads("heroic") === "critical",
    `${reads("blunder")}/${reads("partial")}/${reads("heroic")}`);
  ok(`A3 ${name}: and each of those reaches a condition row`,
    ["blunder", "partial", "heroic"].every((d) => rows.some((e) => e.kind === "condition" && e.onSave?.includes(reads(d)))));
}

/* ================================================================== *
 * B. F2 — no "Fatigued 0"
 * ================================================================== */
{
  const death = read("module", "combat", "death-state.mjs");
  ok("B1 the no-fatigue recovery writes no fatigued value",
    /if \(!noFatigue\) await actor\.toggleStatusEffect\("fatigued", \{ value: state\.fatigued \}\);/.test(death)
    && !/\n  await actor\.toggleStatusEffect\("fatigued", \{ value: state\.fatigued \}\);/.test(death));
}

/* ================================================================== *
 * C. F3 — a relief reads what the creature has
 * ================================================================== */
{
  const effects = read("module", "magic", "spell-effects.mjs");
  ok("C1 a relief reads the raw condition value first",
    /target\.conditions\?\.rawValues\?\.get\?\.\(relief\.condition\)\s*\n\s*\?\? target\.getConditionValue\?\.\(relief\.condition\)/.test(effects));
  ok("C2 a superseded row is skipped once its warp is bought",
    !rowAppliesToCast({ kind: "suppress", supersededBy: "permanent" }, { unlocks: ["permanent"] }, 5)
    && rowAppliesToCast({ kind: "suppress", supersededBy: "permanent" }, { unlocks: [] }, 5)
    && rowAppliesToCast({ kind: "suppress", supersededBy: "permanent" }, {}, 5));
  const banish = PLAN["Banish Fatigue"].effects;
  ok("C3 Banish Fatigue's ignoring gives way to its permanent removal",
    banish.find((e) => e.kind === "suppress")?.supersededBy === "permanent"
    && banish.find((e) => e.kind === "conditionRelief")?.unlockedBy === "permanent");
  ok("C4 so with the +4 PP option exactly one of the two applies, and without it the other",
    banish.filter((e) => rowAppliesToCast(e, { unlocks: ["permanent"] }, 5)).map((e) => e.kind).join() === "conditionRelief"
    && banish.filter((e) => rowAppliesToCast(e, {}, 5)).map((e) => e.kind).join() === "suppress");
}

/* ================================================================== *
 * D. G1 — the words of a mental-ability choice
 * ================================================================== */
{
  const m = slotChoiceWords("mental");
  ok("D1 a mental choice asks for an ability score", m.question === "Which ability score?" && m.confirm === "Enhance");
  ok("D2 a save choice still asks for a saving throw", slotChoiceWords("saves").question === "Which saving throw?"
    && slotChoiceWords().confirm === "Protect");
  ok("D3 an empty mental choice says so", /No ability score was chosen for Wits/.test(slotChoiceEmptyLine("Wits", "mental"))
    && /No saving throw was chosen/.test(slotChoiceEmptyLine("Resistance")));
  const effects = read("module", "magic", "spell-effects.mjs");
  ok("D4 the prompt is given the list's words",
    effects.includes("await promptSlotChoice(spell.name, choice.options, count, slotChoiceWords(choice.chooseFrom)));"));
}

/* ================================================================== *
 * E. G2 — "up to six"
 * ================================================================== */
{
  const cast = read("module", "magic", "cast-workflow.mjs");
  ok("E1 a chosen area is held to the warp's total",
    /areaTargets = applyAreaChoice\(before, chosen\);[\s\S]{0,700}const areaCap = Math\.max\(0, Math\.trunc\(Number\(warpMods\?\.targetCap\) \|\| 0\)\);\s*\n\s*if \(areaCap > 0 && areaTargets\.length > areaCap\) \{[\s\S]{0,300}areaTargets = areaTargets\.slice\(0, areaCap\);/.test(cast));
  ok("E2 Wits lets the caster choose", PLAN.Wits.areaChoice === true);
}

/* ================================================================== *
 * F. G3 — a Success that still lands a rung
 * ================================================================== */
{
  const wd = PLAN["Woeful Dread"].effects;
  ok("F1 Woeful Dread's Success lands a rung; its Critical does not",
    savedRungActsWith(wd, "success", effectiveSaveDegree) && !savedRungActsWith(wd, "critical", effectiveSaveDegree)
    && !savedRungActsWith(wd, "heroic", effectiveSaveDegree));
  ok("F2 an immunity or a note is not 'affected'",
    !savedRungActsWith([{ kind: "tempImmunity", onSave: ["success"] }, { kind: "note", onSave: ["success"], text: "x" }], "success", effectiveSaveDegree));
  ok("F3 the line says so", /is affected even so\./.test(nonBasicSaveLine({ targetName: "A", saved: true, reachedOnSave: true }))
    && /resists\./.test(nonBasicSaveLine({ targetName: "A", saved: true }))
    && /is affected\./.test(nonBasicSaveLine({ targetName: "A", saved: false, hasEffects: true })));
  const cast = read("module", "magic", "cast-workflow.mjs");
  ok("F4 the cast tells the line", cast.includes("reachedOnSave: saved && savedRungActs(spellData.effects, degreeKey)"));
}

/* ================================================================== *
 * G. G4 — once per cast
 * ================================================================== */
{
  const effects = read("module", "magic", "spell-effects.mjs");
  ok("G1 the choice line is said once per cast",
    /if \(chosenLine && !castChoices\.has\(`slotSaid:\$\{effects\.indexOf\(effect\)\}`\)\) \{/.test(effects));
}

/* ================================================================== *
 * H. Q1 — who a caster-centred area catches
 * ================================================================== */
{
  ok("H1 a save spell centred on the caster spares the caster (Waves Of Fatigue)",
    areaSparesCaster({ centredOnCaster: true, defence: "Fortitude", category: "save" }));
  ok("H2 an attack spell centred on the caster spares the caster", areaSparesCaster({ centredOnCaster: true, category: "attack" }));
  ok("H3 a beneficial one does not (Battle's Call, Luminance)", !areaSparesCaster({ centredOnCaster: true, category: "utility" }));
  ok("H4 nor does a hostile area placed at range (Fireball)", !areaSparesCaster({ centredOnCaster: false, defence: "Basic Reflex", category: "save" }));
  ok("H5 Devastating Might — utility, \"including yourself\" — still catches its caster",
    !areaSparesCaster({ centredOnCaster: true, defence: "", category: "utility" }));
  const cast = read("module", "magic", "cast-workflow.mjs");
  ok("H6 the cast leaves the caster out before anyone else is filtered",
    cast.includes("centredOnCaster: !wallSpec && rangeFeet === null,")
    && cast.includes("defence: effDefence ?? spellData.defence,")
    && cast.includes(".filter((tok) => !(sparesCaster && casterToken && tok === casterToken))")
    && cast.indexOf("const sparesCaster = areaSparesCaster({") < cast.indexOf("const disp = reached"));
}

if (failures.length) {
  console.log(`verify-live-3611: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-live-3611: OK — ${checks} checks. The seven things the 3.611.0 drive found, and Graham's ruling on its first question, each fixed where it happened.`);
