#!/usr/bin/env node
/**
 * verify-stone-wise — one Stone Lore, not two.
 *
 * NEW at 3.546.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG.
 *
 * Graham, 10 Sep 2026: Stone Wise "is adding a duplicate copy of Stone
 * Lore to the specialist skills rather than applying the +2 bonus to the
 * existing skill."
 *
 * Stone Wise is a DWARF feat, and the Dwarf race grants "Dwarven Lore,
 * Stone Lore" — so every character this feat exists for ALREADY has the
 * skill before the button is pressed. The handler called
 * `uniqueKey(slugifyKey("Stone Lore"), ...)` regardless, and uniqueKey
 * does what its name says: `stoneLore` was taken, so it returned
 * `stoneLore2`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEDUPE ALREADY EXISTED, ONE FILE AWAY.
 *
 * `planSpecialistSkills` has matched by LABEL, case-insensitively, since
 * it was written, under a comment describing this exact failure: "a
 * player who typed 'Stone Lore' by hand before picking the race should
 * not end up with a second one called stoneLore2."
 *
 * So this was not a missing rule. It was a SECOND IMPLEMENTATION of a
 * solved problem, written a few thousand lines away from the solution —
 * the same shape as the tier gate that lived in classFeat and never
 * reached archetypeFeat. The repair extracts the matcher rather than
 * copying it a third time.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  findSpecialistSkillByLabel, planSpecialistSkills, parseSpecialistList
} from "../module/specialist-grants.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

async function readPack(name) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [, v] of db.iterator()) if (v?.name) out.push(v);
  await db.close();
  return out;
}

/* ── P: WHY THIS FEAT ALWAYS COLLIDES ─────────────────────────────── */

const races = await readPack("races");
const dwarf = races.find((r) => r.name === "Dwarf");
const dwarfSkills = parseSpecialistList(
  dwarf?.system?.specialistSkills ?? dwarf?.system?.specialistSkill ?? ""
);

ok("P1 THE DWARF RACE STILL GRANTS STONE LORE",
  dwarfSkills.some((n) => n.toLowerCase() === "stone lore"),
  `Dwarf grants: ${JSON.stringify(dwarfSkills)} — this is WHY the collision is certain `
  + "rather than occasional: Stone Wise is a Dwarf feat, so the skill is always already "
  + "there. If this ever stops being true the checks below stop meaning anything");

const feats = await readPack("feats");
const stoneWise = feats.find((f) => f.name === "Stone Wise");
equal("P2 AND STONE WISE IS STILL A DWARF RACIAL FEAT",
  String(stoneWise?.system?.category ?? ""), "Racial");

/* ── M: THE MATCHER ───────────────────────────────────────────────── */

const DWARF_SHEET = {
  dwarvenLore: { label: "Dwarven Lore", racial: 0 },
  stoneLore: { label: "Stone Lore", racial: 0 }
};

equal("M1 AN EXISTING STONE LORE IS FOUND",
  findSpecialistSkillByLabel(DWARF_SHEET, "Stone Lore"), "stoneLore",
  "the question the old handler never asked");

equal("M1b WHATEVER ITS CASE AND SPACING",
  findSpecialistSkillByLabel(DWARF_SHEET, "  stone lore "), "stoneLore",
  "a player who typed it by hand may not have matched the capitalisation");

equal("M2 AND A SKILL THAT IS NOT THERE IS NOT INVENTED",
  findSpecialistSkillByLabel(DWARF_SHEET, "Dragon Lore"), null,
  "without this, M1 passes on a matcher that returns the first key it sees");

equal("M2b NOR IS ONE MATCHED BY ITS KEY INSTEAD OF ITS LABEL",
  findSpecialistSkillByLabel({ stoneLore: { label: "Something Else" } }, "Stone Lore"), null,
  "the key is a slug this system chose; the LABEL is what the player reads and what two "
  + "sources have to agree on");

equal("M3 an empty sheet finds nothing",
  findSpecialistSkillByLabel({}, "Stone Lore"), null);
/* M3b NEEDS A SHEET WITH A BLANK-LABELLED SKILL, and the first version
 * did not have one — asked against the Dwarf sheet, deleting the guard
 * changed no answer and the mutation SURVIVED. A half-filled row is a
 * real sheet state: the specialist table has empty slots until a player
 * names them. */
equal("M3b and an empty label matches nothing",
  findSpecialistSkillByLabel({ blank: { label: "" }, stoneLore: { label: "Stone Lore" } }, "   "),
  null,
  "an empty request must not find the unnamed slot and quietly raise a bonus on it");

/* ── D: THE DUPLICATE ─────────────────────────────────────────────── */

const plan = planSpecialistSkills(["Stone Lore"], DWARF_SHEET);
equal("D1 GRANTING STONE LORE TO A DWARF CREATES NOTHING",
  JSON.stringify(plan), JSON.stringify({ create: [], skipped: ["Stone Lore"] }),
  "the rule that was already right, and that Stone Wise did not use");

const fresh = planSpecialistSkills(["Stone Lore"], {});
equal("D2 BUT A CHARACTER WITHOUT IT STILL GETS ONE",
  fresh.create.length, 1,
  "WITHOUT THIS, D1 passes on a planner that never creates anything");

ok("D2b AND THE NEW ONE IS NOT CALLED stoneLore2",
  fresh.create[0]?.key === "stoneLore",
  `got ${JSON.stringify(fresh.create[0]?.key)} — the suffixed key is the visible symptom `
  + "Graham reported, and it only appears when something collided");

/* D3 IS THE REPORTED DEFECT, STATED AS THE INVARIANT IT BROKE.
 *
 * Whatever route grants it, a sheet must never end up with two skills
 * carrying the same label — that is the thing a player sees. */
{
  const after = { ...DWARF_SHEET };
  for (const made of planSpecialistSkills(["Stone Lore", "Dwarven Lore"], DWARF_SHEET).create) {
    after[made.key] = { label: made.label };
  }
  const labels = Object.values(after).map((s) => String(s.label).toLowerCase());
  equal("D3 NO SHEET ENDS UP WITH TWO SKILLS OF THE SAME NAME",
    labels.length, new Set(labels).size,
    `labels: ${JSON.stringify(labels)} — "Stone Lore" twice is what was reported`);
}

/* ── H: THE HANDLER'S OWN SHAPE ───────────────────────────────────────
 *
 * The Use button lives in feats-workflow.mjs, which needs Foundry, so
 * the DECISION it makes is asserted here through the same matcher it now
 * calls. What the check can hold is that the two states are told apart:
 * a Dwarf who already has the skill must take the bonus path, and a
 * character without it the creation path. */

const decide = (sheet) => {
  const key = findSpecialistSkillByLabel(sheet, "Stone Lore");
  const existing = key ? sheet[key] : null;
  if (existing && Number(existing.racial ?? 0) < 2) return "raise";
  if (!key) return "create";
  return "queue";
};

equal("H1 A DWARF WITH STONE LORE AND NO BONUS RAISES IT", decide(DWARF_SHEET), "raise",
  "the path that used to make a second skill");
equal("H2 A CHARACTER WITHOUT IT CREATES ONE", decide({}), "create",
  "the path the old handler always took");
equal("H3 AND PRESSING AGAIN QUEUES THE PERCEPTION BONUS",
  decide({ stoneLore: { label: "Stone Lore", racial: 2 } }), "queue",
  "the +2 stonework bonus is the feat's OTHER half, and it must still be reachable — "
  + "a repair that left the button stuck on \"raise\" would break the half that worked");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-stone-wise: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-stone-wise: OK — ${checks} checks. A Dwarf gets the +2 on the `
  + `Stone Lore they already have, and nobody ends up with two.\n`);
