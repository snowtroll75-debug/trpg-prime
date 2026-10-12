#!/usr/bin/env node
/**
 * verify-chapter10-311-320b — the spells in pages 311-320 that did nothing.
 *
 * NEW at 3.596.0. Graham's rulings of 26 September 2026, R1-R10; this file
 * covers the four whose mechanisms now exist.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO MECHANISMS EXISTED AND NO SPELL COULD REACH EITHER.
 *
 * `rollCounteractCheck` has been in `combat/counteract-workflow.mjs` since
 * the action blocks, and `temporary-immunity.mjs` has held `withImmunity`
 * and its clock for as long. Restore Senses' ONLY content is a counteract
 * check and Scrying's two better degrees are two immunities — and both
 * spells carried `effects: []`. A PP 4 spell and a PP 12 spell, doing
 * nothing, with the machinery for both already shipped.
 *
 * Shadow Weapon is the third of the same shape: `conjuredWeapon` was built
 * for Eldritch Weapon at 3.543.0 and the one other spell in the Grimoire
 * that conjures a weapon never used it.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import {
  counteractableOn, counteractedLine, normaliseCounteract, nothingToCounteractLine
} from "../module/magic/counteract-row.mjs";
import {
  ONE_DAY, ONE_WEEK, alreadyImmuneLine, normaliseTempImmunity
} from "../module/magic/temp-immunity-row.mjs";
import { normaliseConjuredWeapon } from "../module/magic/conjured-weapon.mjs";
import { parseRolledDuration } from "../module/magic/condition-timing-rules.mjs";
import { effectAppliesOnDegree } from "../module/magic/spell-degrees.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => {
  checks += 1;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};
const eq = (label, got, want, detail = "") =>
  ok(label, String(got) === String(want), `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${detail ? ` — ${detail}` : ""}`);

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const applier = strip(read("module", "magic", "spell-effects.mjs"));

async function spells() {
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [k, v] of db.iterator()) {
      if (k.startsWith("!items!") && v?.type === "spell") out.set(String(v.name).trim().toLowerCase(), v);
    }
  } finally { await db.close(); }
  return out;
}
const pack = await spells();
ok("A0 the spells pack could be read", pack.size > 0);
const sysOf = (n) => pack.get(n.toLowerCase())?.system ?? null;
const rowsOf = (n) => sysOf(n)?.effects ?? [];
const rowOf = (n, kind) => rowsOf(n).find((r) => r.kind === kind) ?? null;
const notesOf = (n) => rowsOf(n).filter((r) => r.kind === "note").map((r) => String(r.text ?? "")).join(" ");
const onDegree = (n, d) => rowsOf(n).filter((r) => r.kind !== "note" && effectAppliesOnDegree(r, d));

/* ================================================================== *
 * C. RESTORE SENSES (R7) — a counteract check, at last
 * ================================================================== */

{
  const spec = normaliseCounteract(rowOf("Restore Senses", "counteract"));
  ok("C1 RESTORE SENSES HAS A COUNTERACT ROW", Boolean(spec),
    "a PP 4 spell whose only content is that check carried `effects: []`");
  eq("C1b against the two conditions the page names",
    JSON.stringify(spec?.conditions), JSON.stringify(["blinded", "deafened"]));
  eq("C2 a row naming no condition is refused",
    normaliseCounteract({ kind: "counteract", conditions: [] }), null,
    "a check with nothing to remove on a success is not a rule");
  eq("C2b and so is another kind wearing the field",
    normaliseCounteract({ kind: "heal", conditions: ["blinded"] }), null);
  eq("C3 only the conditions the creature HAS are rolled for",
    JSON.stringify(counteractableOn(spec, (c) => c === "deafened")), JSON.stringify(["deafened"]));
  eq("C3b and a creature with neither is rolled for at all", counteractableOn(spec, () => false).length, 0);
  ok("C3c AND THE APPLIER ASKS THE TARGET, rather than rolling for both regardless",
    // RE-ANCHORED 3.613.0 (R14): the candidates come from counteractCandidates,
    // which asks the target the same question before adding traited effects.
    /let held = counteractCandidates\(spec, \(c\) => Boolean\(target\.hasCondition\?\.\(c\)\), traitedRows\);/.test(applier));
  ok("C4 THE LINE SAYS SO RATHER THAN ROLLING AGAINST NOTHING",
    /not blinded or deafened/.test(nothingToCounteractLine("X", spec)),
    "a check against nothing reads as a failure that cost a spell");
  ok("C4b and a success names the condition it removed",
    /no longer <strong>blinded/.test(counteractedLine("X", "blinded")));
  ok("C4c and the applier is what says it, before any check is rolled",
    /if \(!held\.length\) \{[\s\S]{0,240}nothingToCounteractLine\(target\.name, spec\)/.test(applier));
  ok("C5 the applier handles the kind",
    HANDLED_EFFECT_KINDS.includes("counteract") && /case "counteract": \{/.test(applier));
  /*
   * C6 IS THE DEFECT THAT WAS NEARLY SHIPPED. `rollCounteractCheck` returns
   * a TRGCheck, not `{success}` — so `result.success` would have been
   * undefined for ever and every counteract would have failed, plausibly
   * and silently. The applier reads the check's own degree.
   */
  ok("C6 THE CHECK'S DEGREE IS WHAT DECIDES IT, not a field the check has no such thing as",
    /const degree = result\?\.outcome\?\.degree \?\? null;/.test(applier)
    && /if \(degree\.success\) \{/.test(applier)
    && !/result\?\.success/.test(applier),
    "`result.success` is undefined on a TRGCheck and every counteract would have failed");
  ok("C6b a check rolled with no DC is reported rather than counted as a failure",
    // 3.629.0's counteractPeril has a no-DC line of its own: this one's is
    // the condition's.
    /if \(!degree\) \{\s*lines\.push\(line\(`<em>\$\{target\.name\}'s \$\{condition\} — the counteract check was rolled `/.test(applier) && /with no DC/.test(applier),
    "the dialog allows a blank DC and says the GM adjudicates");
  ok("C7 THE CASTER ROLLS IT",
    /rollCounteractCheck\(caster\)/.test(applier),
    "this function's parameter is `caster`; `actor` is the attack path's name and is not in scope");
  ok("C9 BOTH ITS WARPS NOW HAVE SOMETHING TO DO",
    JSON.stringify(sysOf("Restore Senses")?.warps?.map((w) => w.mods))
      === JSON.stringify([{ extraTargets: 1 }, { castApSet: "10 minutes" }]),
    "the extra-target warp was wired to a spell that applied nothing");
  ok("C8 and the page's two refusals are printed",
    /TEMPORARY OR PERMANENT/.test(notesOf("Restore Senses"))
    && /CANNOT HEAL A PHYSICAL INJURY/i.test(notesOf("Restore Senses")));
}

/* ================================================================== *
 * S. SCRYING (R7) — two degrees that buy immunity
 * ================================================================== */

{
  const week = rowsOf("Scrying").find((r) => r.kind === "tempImmunity" && r.onSave?.includes("critical"));
  const day = rowsOf("Scrying").find((r) => r.kind === "tempImmunity" && r.onSave?.includes("success"));
  /*
   * MEASURED IN SECONDS, NOT AGAINST THE CONSTANT THAT PRODUCED THEM. The
   * row says "1 week" and the reader turns that into seconds with its own
   * UNITS table — so comparing to ONE_WEEK would compare the constant to
   * itself and a wrong week would survive. 604800 is the world clock's.
   */
  eq("S1 A CRITICAL BUYS A WEEK'S IMMUNITY", normaliseTempImmunity(week)?.seconds, 604800);
  eq("S1b and a success buys a day's", normaliseTempImmunity(day)?.seconds, 86400);
  eq("S1c and the exported names are those same seconds", `${ONE_DAY}/${ONE_WEEK}`, "86400/604800");
  eq("S2 NEITHER FAILURE NOR FUMBLE MAKES ANYBODY IMMUNE",
    onDegree("Scrying", "failure").length + onDegree("Scrying", "fumble").length, 0,
    "on those degrees the spell SUCCEEDS; an immunity there would be the Nightmare defect again");
  eq("S3 a length nothing can read is refused",
    normaliseTempImmunity({ kind: "tempImmunity", length: "1 fortnight" }), null,
    "an immunity of no duration is an immunity that does nothing");
  eq("S3b and so is a row with no length at all",
    normaliseTempImmunity({ kind: "tempImmunity" }), null);
  eq("S3d and so is another kind wearing the field",
    normaliseTempImmunity({ kind: "note", length: "1 week" }), null);
  eq("S3c seconds are taken as they are", normaliseTempImmunity({ kind: "tempImmunity", seconds: 600 })?.seconds, 600);
  ok("S4 the applier handles the kind",
    HANDLED_EFFECT_KINDS.includes("tempImmunity") && /case "tempImmunity": \{/.test(applier));
  ok("S4b KEYED BY THE SPELL'S OWN NAME unless the row names one",
    /const key = spec\.key \|\| spell\.name;/.test(applier),
    "the page means immune to THIS spell, not to a school of them");
  ok("S4c a target already immune is told, not re-stamped",
    /const already = immunityRemaining\(record, key, now\);\s*if \(already > 0\) \{/.test(applier)
    && /alreadyImmuneLine/.test(applier));
  ok("S4d and the record is pruned as the clock moves",
    /withImmunity\(prunedImmunities\(record, now\), key, spec\.seconds, now\)/.test(applier));
  ok("S5 every degree is printed, including the two that are not immunities",
    /glimpse of YOU/.test(notesOf("Scrying")) && /THE EYE FOLLOWS/.test(notesOf("Scrying")));
  ok("S5b and the Study Target shift says why it is by hand",
    /STUDY TARGET MAKES IT WORSE BY ONE DEGREE/.test(notesOf("Scrying"))
    && /Nothing in this system shifts a save degree/.test(notesOf("Scrying")));
  ok("S6 the already-immune line names what is left",
    /already immune to/.test(alreadyImmuneLine("X", "Scrying", "6 days")));
}

/* ================================================================== *
 * W. SHADOW WEAPON — the rail built for the other weapon spell
 * ================================================================== */

{
  const spec = normaliseConjuredWeapon(rowOf("Shadow Weapon", "conjuredWeapon"));
  ok("W1 SHADOW WEAPON CONJURES A REAL WEAPON", Boolean(spec),
    "`conjuredWeapon` was built at 3.543.0 and the other weapon spell in the Grimoire never used it");
  eq("W1b a melee weapon of your choice is both categories",
    JSON.stringify(spec?.categories), JSON.stringify(["Simple", "Martial"]),
    "\"the appearance and statistics of a melee weapon of your choice\"");
  eq("W1c melee", spec?.melee, true);
  ok("W2 and the two halves it cannot automate are printed with their reasons",
    /IGNORES THE CONCEALED CONDITION/.test(notesOf("Shadow Weapon"))
    && /\+1 magical bonus/.test(notesOf("Shadow Weapon"))
    && /no channel for a bonus/.test(notesOf("Shadow Weapon")));
}

/* ================================================================== *
 * P. SCINTILLATING PATTERN — a save with two rolled durations
 * ================================================================== */

{
  const dazzle = rowsOf("Scintillating Pattern").find((r) => r.condition === "dazzled");
  ok("P1 THE DAZZLE IS UNGATED, as printed", Boolean(dazzle) && !dazzle.onSave,
    "\"Creatures are dazzled while inside the pattern\" is not an outcome of the save");
  const confusedFail = rowsOf("Scintillating Pattern")
    .find((r) => r.condition === "confused" && r.onSave?.includes("failure"));
  eq("P2 A FAILURE IS CONFUSED FOR 1d4 ROUNDS",
    JSON.stringify(parseRolledDuration(confusedFail?.durationRoll)),
    JSON.stringify({ formula: "1d4", unit: "round" }));
  const stun = rowsOf("Scintillating Pattern")
    .find((r) => r.condition === "stunned" && r.onSave?.includes("fumble"));
  eq("P3 A FUMBLE IS STUNNED FOR 1d4 ROUNDS",
    JSON.stringify(parseRolledDuration(stun?.durationRoll)),
    JSON.stringify({ formula: "1d4", unit: "round" }));
  const confusedFumble = rowsOf("Scintillating Pattern")
    .find((r) => r.condition === "confused" && r.onSave?.includes("fumble"));
  ok("P3b AND CONFUSED AFTERWARDS for the spell's own duration",
    Boolean(confusedFumble) && !confusedFumble.durationRoll,
    "\"After the stunned condition ends, the creature is confused for the remaining duration\"");
  eq("P4 NOTHING HAPPENS ON A CRITICAL OR A SUCCESS beyond the dazzle",
    onDegree("Scintillating Pattern", "critical").filter((r) => r.condition !== "dazzled").length
    + onDegree("Scintillating Pattern", "success").filter((r) => r.condition !== "dazzled").length, 0);
  /*
   * P4b IS A LIVE-DRIVE FINDING (3.597.0). The card printed "Dazzled
   * (sustained up to 1 minute)." and then "Unaffected." directly beneath
   * it — both correct, and together a contradiction a GM has to resolve
   * mid-turn. The save decides the confusion; the dazzle is not an outcome
   * of it, and the note now says which.
   */
  ok("P4b AND THE NOTE FOR THOSE DEGREES DOES NOT CONTRADICT THE DAZZLE",
    rowsOf("Scintillating Pattern").some((r) => r.kind === "note"
      && Array.isArray(r.onSave) && r.onSave.includes("critical")
      && /Unaffected by the pattern's confusion — still dazzled/.test(String(r.text ?? ""))),
    "a bare \"Unaffected.\" under a line that just applied a condition reads as a bug");
  ok("P5 the overlap, the ring and the re-save triggers are printed with their reasons",
    /THE CONFUSION FOLLOWS THE STUN/.test(notesOf("Scintillating Pattern"))
    && /DAZZLE REACHES 20 FEET BEYOND/.test(notesOf("Scintillating Pattern"))
    && /re-save triggers are the table's/.test(notesOf("Scintillating Pattern")));
}

if (failures.length) {
  process.stderr.write(`verify-chapter10-311-320b: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-chapter10-311-320b: OK — ${checks} checks. A counteract check a spell `
  + `can ask for, two degrees that buy immunity, and a shadow blade with real statistics.\n`);
