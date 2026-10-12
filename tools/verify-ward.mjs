#!/usr/bin/env node
/**
 * verify-ward — a bonus that applies against ONE named creature.
 *
 * NEW at 3.406.0.
 *
 * THE DEFECT THIS CHAPTER EXISTS TO KEEP DEAD: Stone Shield shipped as
 * an unconditional +4 to DB with the words "cover from one chosen enemy"
 * in a note beside it. The scope was written down and nothing read it.
 * Every section below is ultimately one question — does a bonus scoped
 * to a named creature reach that creature and NOBODY else.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  WARD_SLOTS, isWardSlot, wardSlots, unknownWardSlots, wardFlagData, wardHalvesDisagree
} from "../module/magic/ward.mjs";
import { normaliseConditional, matchesCheck } from "../module/conditionals.mjs";
import { normaliseDefenceDC, defenceDCBonus } from "../module/combat/defence-dc.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const A = "Scene.aaa.Token.AAA";
const B = "Scene.aaa.Token.BBB";

/* ================================================================== *
 * A. The slot vocabulary
 * ================================================================== */

ok("A1 the four defences are known", WARD_SLOTS.length === 4
  && ["defence", "fortitude", "reflex", "will"].every(isWardSlot));
ok("A2 a defence nobody implements is not a ward slot", !isWardSlot("morale"));
ok("A3 an effect declaring nothing covers all four",
  wardSlots({}).join() === WARD_SLOTS.join(),
  '"DB and saving throws" is four slots; making authors retype it is four chances to drop one');
ok("A4 a narrower ward is respected", wardSlots({ slots: ["defence"] }).join() === "defence");
ok("A5 a stray slot is reported", unknownWardSlots({ slots: ["defence", "morale"] }).join() === "morale");
ok("A5b a clean ward reports nothing", unknownWardSlots({ slots: ["will"] }).length === 0);

/* ================================================================== *
 * B. The writer
 * ================================================================== */

const full = wardFlagData({ value: 1, bonusType: "status", label: "Forbidding Ward", sourceUuids: [A] });

ok("B1 a full ward writes both halves", full.defenceDC.length === 1 && full.conditionals.length === 1,
  "DB is a static DC and saves are rolls; one sentence, two engines");
ok("B2 the DB half is scoped by uuid", full.defenceDC[0].when.sourceUuids.join() === A);
ok("B3 the save half is scoped by uuid", full.conditionals[0].when.sourceUuids.join() === A);
ok("B4 the save half names only the saves", full.conditionals[0].when.subjects.join() === "fortitude,reflex,will",
  "DB must not appear as a save subject — it is not a roll");
ok("B5 the save half carries the bonus pool", full.conditionals[0].type === "status");

// B6: THE ONE-WRITER RULE, checked rather than trusted. mutate-markers #10
// renamed a flag and 59 checks stayed green because the stub agreed with
// the reader.
ok("B6 the two halves agree", wardHalvesDisagree(full).length === 0);
ok("B6b and disagreement is detectable", wardHalvesDisagree({
  defenceDC: [{ value: 1, label: "X", when: { sourceUuids: [A] } }],
  conditionals: [{ value: 2, label: "X", when: { sourceUuids: [A] } }]
}).length === 1, "a check that cannot fail is not a check");
ok("B6c a scope drift is detectable", wardHalvesDisagree({
  defenceDC: [{ value: 1, label: "X", when: { sourceUuids: [A] } }],
  conditionals: [{ value: 1, label: "X", when: { sourceUuids: [B] } }]
}).length === 1);

// B7 IS THE STONE SHIELD DEFECT ITSELF. A ward with nobody to aim at
// must write NOTHING rather than an unscoped entry.
const aimless = wardFlagData({ value: 4, bonusType: "circumstance", label: "Stone Shield", sourceUuids: [] });
ok("B7 a ward with no enemy writes nothing",
  aimless.defenceDC.length === 0 && aimless.conditionals.length === 0,
  "an unscoped entry raises the number against everything — the exact bug");
ok("B7b a zero-value ward writes nothing",
  wardFlagData({ value: 0, sourceUuids: [A] }).defenceDC.length === 0);

const dbOnly = wardFlagData({ value: 4, bonusType: "status", label: "Anticipations", sourceUuids: [A], slots: ["defence"] });
ok("B8 a DB-only ward writes no conditional", dbOnly.defenceDC.length === 1 && dbOnly.conditionals.length === 0,
  "Anticipations names DB and says nothing about saves");

/* ================================================================== *
 * C. The DB half actually scopes — through the real engine
 * ================================================================== */

const wardedActor = {
  items: [],
  effects: [{ name: "Forbidding Ward", flags: { "trg-prime": { defenceDC: full.defenceDC } } }]
};

ok("C1 the warded enemy faces the raised DB",
  defenceDCBonus(wardedActor, "defence", "", [], A).total === 1);
ok("C2 anybody else does not",
  defenceDCBonus(wardedActor, "defence", "", [], B).total === 0,
  "THE WHOLE POINT — two ogres in a room are both called Ogre");
ok("C3 an unnamed attacker does not",
  defenceDCBonus(wardedActor, "defence", "", [], "").total === 0,
  "a ward that does not know who is attacking protects against nobody");

// C4: uuids are CASE-SENSITIVE and must not be folded.
const cased = normaliseDefenceDC(
  { dc: "defence", value: 1, label: "W", when: { sourceUuids: ["Scene.AbC.Token.XyZ"] } }, { name: "W" });
ok("C4 a uuid keeps its case through normalisation",
  cased.sourceUuids[0] === "Scene.AbC.Token.XyZ",
  "lower-casing a uuid makes the ward match nobody, silently");

// C5: an entry scoped by NOTHING is still refused, as it always was.
ok("C5 an unscoped defence entry is still refused",
  normaliseDefenceDC({ dc: "defence", value: 4, label: "X" }, { name: "X" }) === null);

/* ================================================================== *
 * D. The save half actually scopes — through the real engine
 * ================================================================== */

const cond = normaliseConditional(full.conditionals[0], { id: "fw", name: "Forbidding Ward" }, 0);

ok("D1 the ward survives normalisation", Boolean(cond));
ok("D2 it applies to a save forced by the warded creature",
  matchesCheck(cond, { checkType: "save", subject: "will", sourceUuid: A }));
ok("D3 not to one forced by anybody else",
  matchesCheck(cond, { checkType: "save", subject: "will", sourceUuid: B }) === false);
ok("D4 not to an unattributed sheet roll",
  matchesCheck(cond, { checkType: "save", subject: "will" }) === false,
  "a bare save names no source, and a ward is a claim about one creature");
ok("D5 not to a skill check against the same creature",
  matchesCheck(cond, { checkType: "skill", subject: "athletics", sourceUuid: A }) === false);
ok("D6 it is auto — the scope leaves nothing to judge", cond.auto === true);

// D7: THE AXIS MUST NOT LEAK. Adding an axis that every existing entry
// ignores must not change any of them.
const thengar = normaliseConditional(
  { kind: "modifier", value: 1, type: "racial", label: "Thengar",
    when: { checkTypes: ["save"], sourceTypes: ["undead"] } }, { id: "t", name: "Thengar" }, 0);
ok("D7 a type-scoped entry is untouched by the new axis",
  matchesCheck(thengar, { checkType: "save", subject: "will", sourceTypes: ["undead"] }) === true
  && matchesCheck(thengar, { checkType: "save", subject: "will", sourceTypes: ["dragon"] }) === false);
ok("D7b and still ignores a uuid it never named",
  matchesCheck(thengar, { checkType: "save", sourceTypes: ["undead"], sourceUuid: B }) === true);

/* ================================================================== *
 * E. The pack
 * ================================================================== */

async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.set(String(value.name).trim().toLowerCase(), value);
    }
  } finally {
    await db.close();
  }
  return out;
}

const spells = await spellsPack();
let wardSpells = 0;
for (const spell of spells.values()) {
  for (const effect of spell.system?.effects ?? []) {
    if (effect.kind !== "ward") continue;
    wardSpells += 1;
    ok(`E1 "${spell.name}" wards only defences that exist`, unknownWardSlots(effect).length === 0,
      unknownWardSlots(effect).join(", "));
    ok(`E2 "${spell.name}" wards by a non-zero amount`, Math.trunc(Number(effect.value) || 0) !== 0);
    ok(`E3 "${spell.name}" names who receives it`,
      ["self", "allies", "targets"].includes(String(effect.target ?? "")),
      `target: "${effect.target}"`);
  }
}
ok("E4 exactly the spells this release wired carry a ward", wardSpells === 3,
  `${wardSpells} ward effects in the pack — update this file when more are wired`);

// E5 IS THE REGRESSION GUARD ON THE DEFECT. Stone Shield must never go
// back to being an unconditional bonus.
{
  const stone = spells.get("stone shield");
  const effects = stone?.system?.effects ?? [];
  ok("E5 Stone Shield is a ward, not a flat bonus",
    effects.some((e) => e.kind === "ward")
    && !effects.some((e) => e.kind === "bonus" && e.slot === "defence"),
    "it shipped as +4 DB against everyone with the scope in a note");
  ok("E5b and its note no longer pretends to be the scope",
    !effects.some((e) => e.kind === "note" && /cover from one chosen enemy/i.test(e.text ?? "")),
    "a note that states a rule nothing enforces is automation's clothes on a reminder");
}

// E6: Forbidding Ward is the two-role spell and must target the ALLY.
{
  const fw = spells.get("forbidding ward")?.system?.effects ?? [];
  const ward = fw.find((e) => e.kind === "ward");
  ok("E6 Forbidding Ward benefits the ally", ward?.target === "allies",
    "targeting the enemy would ward it against itself");
  ok("E6b and covers DB and all three saves", wardSlots(ward).length === 4);
}

/* ================================================================== *
 * F. The engines are actually consulted
 * ================================================================== */
{
  const effectsFile = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
  const text = fs.readFileSync(effectsFile, "utf8");
  ok("F1 the applier writes wards through the single writer", /wardFlagData\(/.test(text));
  ok("F2 it refuses to apply a ward it cannot aim",
    /hostileUuids\.length[\s\S]{0,220}nothing applied/.test(text),
    "an unaimed ward applied anyway IS the Stone Shield defect");
  ok("F3 it splits the two roles by disposition", /keepByDisposition[\s\S]{0,120}enemies/.test(text));
  ok("F4 an allies-target effect skips the hostiles",
    /effect\.target === "allies"[\s\S]{0,160}!hostileUuids\.includes/.test(text));

  const attack = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs"), "utf8");
  ok("F5 the attack workflow names the attacker to the defence channel",
    /defenceDCBonus\(targetActor, "defence", "", attackerTypes, actor\?\.uuid/.test(attack),
    "an axis this call does not supply can never be asked about later");

  const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
  ok("F6 the cast workflow names the caster to a forced save",
    /sourceUuid: actor\?\.uuid/.test(cast));

  const check = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "dice", "check.mjs"), "utf8");
  ok("F7 the check carries the source through to the conditionals",
    /this\.sourceUuid = config\.sourceUuid/.test(check));
}

process.stdout.write(`verify-ward: ${checks} checks\n`);
if (failures.length) {
  process.stdout.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
