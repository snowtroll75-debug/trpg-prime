#!/usr/bin/env node
/**
 * verify-skill-ladder — Shape Stone, the last of block 31 (3.605.0).
 *
 * A named skill check the spell's bystanders roll against the caster's DC,
 * with a degree ladder whose rungs each say what happens.
 *
 * SECTIONS
 *   N  the ladder a row declares, and what it refuses
 *   L  reading a roll at a rung, including the degrees nobody printed
 *   A  AGREEMENT with `effectiveSaveDegree`, so two answers cannot drift
 *   B  the bystander list
 *   C  the card
 *   W  the workflow
 *   P  the pack
 *   K  the manifest covers what the author tool wrote
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SKILL_LADDER_KIND, normaliseSkillLadder, skillLadderDegree, skillLadderOutcome,
  skillLadderLabels, skillLadderOpeningLine, skillLadderNobodyLine,
  skillLadderResultLine, skillLadderJudgedLine
} from "../module/magic/skill-ladder.mjs";
import { bystanderCandidates } from "../module/magic/skill-ladder-workflow.mjs";
import { effectiveSaveDegree } from "../module/magic/spell-degrees.mjs";
import { DEGREES } from "../module/dice/resolution.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { SKILLS } from "../module/config.mjs";

let failed = 0;
let ran = 0;
const ok = (name, cond, why = "") => {
  ran++;
  if (cond) return;
  failed++;
  console.error(`  FAIL  ${name}${why ? `\n        ${why}` : ""}`);
};
const eq = (name, got, want, why = "") =>
  ok(name, got === want, why || `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const ROW = {
  kind: "skillLadder", label: "Shape Stone", skills: ["acrobatics"],
  degrees: {
    success: { text: "is unaffected" },
    failure: { text: "falls prone atop the stone", conditions: [{ key: "prone" }] },
    fumble: { text: "falls off and lands prone", conditions: [{ key: "prone" }] }
  }
};
const SPEC = normaliseSkillLadder(ROW);

/* ================= N. the declaration ================= */

ok("N0 the kind is handled", HANDLED_EFFECT_KINDS.includes(SKILL_LADDER_KIND));
ok("N1 a well-formed row normalises", Boolean(SPEC));
eq("N1b with the skill it named", SPEC.skills.join(","), "acrobatics");
eq("N1c and the rungs it printed", Object.keys(SPEC.degrees).sort().join(","), "failure,fumble,success");
eq("N2 ANOTHER KIND IS NOT A LADDER", normaliseSkillLadder({ ...ROW, kind: "saveLadder" }), null);
eq("N2b nor is nothing", normaliseSkillLadder(null), null);
eq("N3 A SKILL THE SHEET DOES NOT HAVE IS REFUSED",
  normaliseSkillLadder({ ...ROW, skills: ["tumbling"] }), null,
  "a row naming a skill nobody has rolls a check with no bonus and fails silently");
eq("N3b and a row naming no skill at all", normaliseSkillLadder({ ...ROW, skills: [] }), null);
eq("N3c an unknown skill is dropped from a list that still has a real one",
  normaliseSkillLadder({ ...ROW, skills: ["tumbling", "athletics"] }).skills.join(","), "athletics");
eq("N3d and duplicates collapse",
  normaliseSkillLadder({ ...ROW, skills: ["acrobatics", "acrobatics"] }).skills.length, 1);
eq("N4 A LADDER WITH NO RUNGS IS NOT A LADDER", normaliseSkillLadder({ ...ROW, degrees: {} }), null,
  "it would make every creature roll a check that could not do anything");
eq("N4b a rung named for no real degree is dropped",
  normaliseSkillLadder({ ...ROW, degrees: { success: { text: "x" }, splendid: { text: "y" } } })
    .degrees.splendid, undefined);
eq("N5 a rung's conditions are normalised",
  SPEC.degrees.failure.conditions[0].key, "prone");
eq("N5b a valued condition keeps its value",
  normaliseSkillLadder({ ...ROW, degrees: { failure: { conditions: [{ key: "dazed", value: 2 }] } } })
    .degrees.failure.conditions[0].value, 2);
eq("N5c and a valueless one carries null",
  SPEC.degrees.failure.conditions[0].value, null);
eq("N6 the offered skills get their printed labels", skillLadderLabels(SPEC).join(","), "Acrobatics");

/* ================= L. reading the ladder ================= */

eq("L1 a printed rung is read at itself", skillLadderDegree(SPEC, "failure"), "failure");
eq("L2 SUCCESS IS UNAFFECTED, so better rolls do nothing", skillLadderOutcome(SPEC, "success").conditions.length, 0);
ok("L2b and a Critical does nothing either", skillLadderOutcome(SPEC, "critical").unaffected,
  "Success is the 'unaffected' rung, so a degree above it arrives at nothing by the ordinary route");
ok("L2c as does a Heroic", skillLadderOutcome(SPEC, "heroic").unaffected);
eq("L3 A PARTIAL FALLS TO FAILURE", skillLadderDegree(SPEC, "partial"), "failure",
  "an unnamed failing degree clamps to the harsher printed rung");
eq("L4 A BLUNDER FALLS TO FUMBLE", skillLadderDegree(SPEC, "blunder"), "fumble",
  "letting it fall off the bottom would make the worst roll in the game safer than the second worst");
ok("L5 a clamped result says so", skillLadderOutcome(SPEC, "partial").clamped);
ok("L5b and an exact one does not", !skillLadderOutcome(SPEC, "failure").clamped);
eq("L6 the roll that was made is carried through", skillLadderOutcome(SPEC, "blunder").rolled, "blunder");
eq("L6b beside the rung it was read at", skillLadderOutcome(SPEC, "blunder").at, "fumble");
ok("L7 a fumble still applies prone",
  skillLadderOutcome(SPEC, "fumble").conditions.some((c) => c.key === "prone"));

/* ================= A. agreement with the save ladder ================= */

/*
 * TWO FUNCTIONS ANSWER ONE QUESTION, so they are held against each other
 * rather than described as agreeing. `effectiveSaveDegree` reads effect
 * ROWS gated by `onSave`; `skillLadderDegree` reads a rung MAP. The rule
 * is the same rule and a drift between them would be invisible.
 */
{
  const asRows = Object.keys(SPEC.degrees).map((d) => ({ kind: "note", onSave: d }));
  const disagreements = DEGREES.map((d) => d.key).filter(
    (key) => skillLadderDegree(SPEC, key) !== effectiveSaveDegree(asRows, key));
  ok("A1 THE SKILL LADDER AND THE SAVE LADDER AGREE ON ALL SEVEN DEGREES",
    disagreements.length === 0,
    disagreements.length ? `they differ on: ${disagreements.join(", ")}` : "");
}
{
  // AND ON A LADDER SHAPED DIFFERENTLY, so the agreement is not a fluke of
  // this one spell's three rungs.
  const sparse = normaliseSkillLadder({ ...ROW, degrees: { fumble: { text: "x" } } });
  const asRows = [{ kind: "note", onSave: "fumble" }];
  const disagreements = DEGREES.map((d) => d.key).filter(
    (key) => skillLadderDegree(sparse, key) !== effectiveSaveDegree(asRows, key));
  ok("A1b including a ladder with a single rung", disagreements.length === 0,
    disagreements.length ? `they differ on: ${disagreements.join(", ")}` : "");
}

/* ================= B. the bystanders ================= */

const tok = (id, name, x, y) => ({ id, name, x, y, uuid: `Scene.s.Token.${id}`, actor: { name } });
{
  const all = [tok("c", "Caster", 0, 0), tok("far", "Far", 500, 0), tok("near", "Near", 50, 0)];
  const list = bystanderCandidates(all, "c", { x: 0, y: 0 });
  eq("B1 THE CASTER IS NOT OFFERED", list.some((t) => t.id === "c"), false,
    "a caster touching the stone is not standing on it being reshaped");
  eq("B2 and the rest are nearest first", list.map((t) => t.name).join(","), "Near,Far");
  eq("B3 EVERY OTHER TOKEN IS OFFERED, not just those within some radius", list.length, 2,
    "the book gives no radius; an invented one that hides a creature is worse than a long list");
  eq("B4 a token with no actor is left out",
    bystanderCandidates([{ id: "x", name: "Light", x: 1, y: 1 }], "c", { x: 0, y: 0 }).length, 0);
  eq("B5 with no centre the list still comes back",
    bystanderCandidates(all, "c", null).length, 2);
  eq("B6 and nothing at all is an empty list", bystanderCandidates(null, "c", null).length, 0);
}

/* ================= C. the card ================= */

ok("C1 the opening names the skill and the DC",
  /Acrobatics/.test(skillLadderOpeningLine("Shape Stone", SPEC, 18, ["Borin"]))
  && /DC <strong>18/.test(skillLadderOpeningLine("Shape Stone", SPEC, 18, ["Borin"])));
ok("C2 NOBODY NAMED SAYS SO", /nobody was standing on it/.test(skillLadderNobodyLine("Shape Stone")),
  "a spell that asked no questions must not look like one that did");
ok("C3 A RESULT NAMES BOTH THE ROLL AND THE RUNG when they differ", (() => {
  const l = skillLadderResultLine("Borin", SPEC, skillLadderOutcome(SPEC, "partial"), 14, 20);
  return /Partial/.test(l) && /Failure/.test(l) && /read at/.test(l);
})(), "a card showing only the rung would print a degree the player did not roll");
ok("C3b and names it once when they agree", (() => {
  const l = skillLadderResultLine("Borin", SPEC, skillLadderOutcome(SPEC, "fumble"), 4, 20);
  return /Fumble/.test(l) && !/read at/.test(l);
})());
ok("C4 an unaffected creature is told so",
  /is unaffected/.test(skillLadderResultLine("B", SPEC, skillLadderOutcome(SPEC, "critical"), 30, 20)));
ok("C5 the table's half is named",
  /who was standing on the stone/.test(skillLadderJudgedLine())
  && /anywhere to fall off/.test(skillLadderJudgedLine()));

/* ================= W. the workflow ================= */

const flow = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "skill-ladder-workflow.mjs"), "utf8");
// AIMED AT THE INPUT, NOT AT THE WORD. The first version searched the file
// for "checked" and failed on the selector that READS the ticked boxes —
// a check matching a word rather than the behaviour it stands for.
ok("W1 NOBODY IS PRE-TICKED",
  /<input type="checkbox" `\s*\+ `name="bystander" value="\$\{t\.uuid\}">/.test(flow),
  "the printed default is not 'everyone nearby'; a Continue nobody read should knock nobody "
  + "over. The input carries no `checked` attribute.");
ok("W2 THE CHECK IS A REAL SKILL CHECK, built as the sheet builds one",
  flow.includes("skill?.checkModifiers ?? ["),
  "a bare d20 + total would miss every conditional, aura and item bonus the creature has");
ok("W2b rolled through the system's own check class", flow.includes("TRGCheck.roll({"));
ok("W2c and typed as a skill check, so conditionals can find it",
  /type: "skill"/.test(flow) && /subject: best/.test(flow));
ok("W3 THE BEST OF THE OFFERED SKILLS IS USED",
  flow.includes("if (a > b) best = key;"),
  "Web and Transmute Rock & Mud print a choice, and a creature choosing badly on purpose "
  + "is not a rule anybody plays");
// AIMED AT THE IMPORT, NOT AT THE NAME — the second time in this file. A
// check for the bare word `applyConditionTags` still matched when the call
// was replaced by a local no-op that happened to use the same identifier.
// What the claim is really about is that the conditions go through the
// SHARED applier rather than this file growing its own.
ok("W4 the rung's conditions are applied through the shared applier",
  flow.includes('const { applyConditionTags } = await import("../combat/effect-application-workflow.mjs")')
  && flow.includes("await applyConditionTags(actor, outcome.conditions.map("),
  "a local stub with the same name is not the shared applier");
ok("W5 a cancelled picker names nobody", flow.includes("if (!chosen.length) {"));
const eff = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");
ok("W6 a malformed ladder is refused out loud",
  eff.includes("declares a malformed skill ladder"));
/*
 * W8 IS THE 3.605.0 LIVE-TEST DEFECT, and the shape of it matters more than
 * the line.
 *
 * The first version handled this row inside the per-recipient switch. Shape
 * Stone has no creature targets — it touches a cube of stone — so
 * `recipients` was empty, the applier's `if (!recipients.length) continue`
 * fired, and the row was never reached on any cast. Every other check in
 * this file passed: they measured the ladder in isolation and not one asked
 * whether the applier gets to it.
 */
{
  const ladderAt = eff.indexOf('if (effect.kind === "skillLadder") {');
  const gateAt = eff.indexOf("if (!recipients.length) {");
  ok("W8 THE LADDER IS HANDLED BEFORE THE RECIPIENTS GATE",
    ladderAt > 0 && gateAt > 0 && ladderAt < gateAt,
    "a ladder finds its own subjects — the GM names them — so a spell with no "
    + "creature targets must still reach it");
  ok("W8b and it is not also left in the per-recipient switch",
    !/case "skillLadder":/.test(eff),
    "two routes to one row is how they disagree about which ran");
}

ok("W7 THE DC COMES FROM THE CAST, not from a `defence` string",
  eff.includes("dc: Number(saveDC ?? rollData?.saveDC ?? 0) || 0"),
  "the check is not a saving throw, so the spell has no defence field to read");

/* ================= P. the pack ================= */

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
let stone = null;
const ladderSpells = [];
try {
  for await (const [key, v] of db.iterator()) {
    if (!key.startsWith("!items!") || v?.type !== "spell") continue;
    if (String(v.name).trim() === "Shape Stone") stone = v.system;
    if ((v.system.effects ?? []).some((e) => e.kind === SKILL_LADDER_KIND)) {
      ladderSpells.push(String(v.name).trim());
    }
  }
} finally { await db.close(); }

const packRow = (stone?.effects ?? []).find((e) => e.kind === SKILL_LADDER_KIND) ?? null;
ok("P1 Shape Stone carries a ladder row", Boolean(packRow));
ok("P1b AND IT NORMALISES, off the pack rather than off a literal",
  Boolean(normaliseSkillLadder(packRow)),
  "a row that cannot be read is a spell that prints a malformed-ladder refusal");
eq("P2 it rolls Acrobatics", normaliseSkillLadder(packRow).skills.join(","), "acrobatics");
eq("P3 with the three printed rungs",
  Object.keys(normaliseSkillLadder(packRow).degrees).sort().join(","), "failure,fumble,success");
ok("P4 Failure applies prone",
  normaliseSkillLadder(packRow).degrees.failure.conditions.some((c) => c.key === "prone"));
ok("P4b and so does Fumble",
  normaliseSkillLadder(packRow).degrees.fumble.conditions.some((c) => c.key === "prone"));
ok("P4c while Success applies nothing",
  (normaliseSkillLadder(packRow).degrees.success.conditions ?? []).length === 0,
  "\"The creature is unaffected\" is written as a rung with no conditions");
ok("P5 the card explains whose call the bystander list is",
  (stone?.effects ?? []).some((e) => /THE GM SAYS WHO WAS STANDING ON IT/.test(e.text ?? "")));
ok("P5b and how the unprinted degrees are read",
  (stone?.effects ?? []).some((e) => /THREE RUNGS OF SEVEN/.test(e.text ?? "")));
ok("P5c and that \"if applicable\" is the table's",
  (stone?.effects ?? []).some((e) => /IF APPLICABLE/.test(e.text ?? "")));
// TWO AT 3.606.0: Shroud joined under block 32's R2, as the first ladder
// aimed at the cast's own targets. Transmute Rock & Mud and Web remain
// rulings of their own.
eq("P6 the spells using the mechanism are the ruled ones", ladderSpells.join(","), "Shape Stone,Shroud",
  "Transmute Rock & Mud and Web print the same shape and are each a ruling of their own");
ok("P7 the skill it names is real", Object.prototype.hasOwnProperty.call(SKILLS, "acrobatics"));

/* ================= K. the manifest ================= */

const authorSrc = fs.readFileSync(
  path.join(SYSTEM_ROOT, "tools", "author-shape-stone.mjs"), "utf8");
const wroteFields = {};
{
  const blocks = [...authorSrc.matchAll(/"([^"]+)":\s*\(sy\)\s*=>\s*\{([\s\S]*?)\n  \}/g)];
  for (const [, spell, body] of blocks) {
    const fields = new Set();
    for (const [, f] of body.matchAll(/\bsy\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) fields.add(f);
    wroteFields[spell] = [...fields];
  }
}
ok("K0 the author tool's plan could be read at all",
  Object.keys(wroteFields).length === 1 && (wroteFields["Shape Stone"] ?? []).length >= 1,
  "a check that cannot parse the thing it measures passes for the wrong reason");
const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
for (const [spell, fields] of Object.entries(wroteFields)) {
  for (const field of fields) {
    ok(`K1 ${spell}.${field} has a pack-repair entry`,
      PACK_REPAIRS.some((r) => r.name === spell && r.field === field),
      "a field written by the authoring tool and missing from the manifest is repaired on "
      + "the compendium and left stale on every copy an actor already carries");
  }
}

if (failed) {
  console.error(`\nverify-skill-ladder: FAILED — ${failed} of ${ran} check(s).`);
  process.exit(1);
}
console.log(`verify-skill-ladder: OK — ${ran} checks. A check the bystanders roll, `
  + `read at the rung the book printed.`);
