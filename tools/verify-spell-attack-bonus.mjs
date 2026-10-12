#!/usr/bin/env node
/**
 * verify-spell-attack-bonus — a bonus to attack rolls must reach BOTH
 * things the book calls an attack roll.
 *
 * NEW at 3.425.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT.
 *
 * Graham, 27 August 2026: "bless seems to add its bonus to attack checks
 * but not those created by attack spells."
 *
 * Bless writes `+1 status` into `system.combat.attack.status`. A weapon
 * Strike builds its modifiers from that node's `checkModifiers` and so
 * picks it up. A spell attack is assembled from the Cast a Spell check's
 * total plus three named extras, and had never read the pool at all.
 * The bonus was applied, visible on the Effects tab, correct on the
 * sheet — and read by exactly one of the two kinds of attack roll.
 *
 * EIGHT SPELLS aim at that pool (Bless, Bane, Aid, Heroism, Prayer,
 * Divine Favour, Inspire Courage, Bless Weapon), plus Rage, Aim, the two
 * attack stances, and the Prone and Fixated conditions.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE SCOPE IS THE POINT, so section B is the one that matters.
 *
 * "Add the attack total" would have been a rules change wearing a bug
 * fix's clothes: that total also contains BAB and the attacking
 * attribute, so a Wizard's Fire Bolt would gain a Fighter's base attack
 * bonus on top of the Spellcraft it is already built from.
 *
 * Graham's ruling: STATUS and CIRCUMSTANCE only. Blessings, curses,
 * postures and conditions travel; `item` (Bless Weapon's +2, granted to
 * a weapon), `class` (the weapon-attack progression) and the additive
 * half (BAB, ability, and the Wound Threshold penalty riding with them)
 * do not.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { SPELL_ATTACK_BONUS_TYPES, spellAttackBonusRows } from "../module/magic/spell-attack-bonus.mjs";
import { assembledSpellAttackTotal } from "../module/magic/casting-dc.mjs";
import { applyStacking } from "../module/dice/resolution.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const cast = read("module", "magic", "cast-workflow.mjs");
const attack = read("module", "combat", "attack-workflow.mjs");

/** What an actor's attack node hands a check, additive row included. */
const NODE = [
  { label: "BAB and ability", value: 7, type: "untyped" },
  { label: "Bless", value: 1, type: "status" },
  { label: "Rage", value: 2, type: "circumstance" },
  { label: "Bless Weapon", value: 2, type: "item" },
  { label: "Fighter", value: 1, type: "class" }
];

/* ================================================================== *
 * A. The rule reaches the pool at all
 * ================================================================== */

ok("A1 Bless travels to a spell attack",
  spellAttackBonusRows(NODE).some((r) => r.label === "Bless"),
  "the whole of Graham's report");
ok("A2 and so does a circumstance bonus",
  spellAttackBonusRows(NODE).some((r) => r.label === "Rage"));
ok("A3 an empty or missing node is safe",
  spellAttackBonusRows([]).length === 0 && spellAttackBonusRows(undefined).length === 0
  && spellAttackBonusRows(null).length === 0);
ok("A4 the type match ignores case and spacing",
  spellAttackBonusRows([{ label: "X", value: 1, type: " Status " }]).length === 1);

/* ================================================================== *
 * B. WHAT MUST NOT TRAVEL — the half that keeps this a fix
 * ================================================================== */

const rows = spellAttackBonusRows(NODE);
ok("B1 BAB and ability do not reach a spell attack",
  !rows.some((r) => r.label === "BAB and ability"),
  "a Wizard's Fire Bolt would gain a Fighter's base attack bonus");
ok("B2 an item bonus granted to a weapon does not",
  !rows.some((r) => r.label === "Bless Weapon"),
  "Bless Weapon names a weapon; a Fire Bolt is not holding one");
ok("B3 the class attack progression does not",
  !rows.some((r) => r.label === "Fighter"));
ok("B4 exactly the two ruled types travel",
  SPELL_ATTACK_BONUS_TYPES.length === 2
  && SPELL_ATTACK_BONUS_TYPES.includes("status")
  && SPELL_ATTACK_BONUS_TYPES.includes("circumstance"),
  SPELL_ATTACK_BONUS_TYPES.join(", "));
ok("B5 and nothing else does", rows.length === 2, rows.map((r) => r.label).join(", "));

// THE ADDITIVE ROW IS EXCLUDED BY TYPE, NOT POSITION. A node with no
// additive total emits no such row, and an index rule would then eat a
// real bonus instead.
ok("B6 a node with no additive row still yields its bonuses",
  spellAttackBonusRows([{ label: "Bless", value: 1, type: "status" }]).length === 1,
  "dropping 'the first row' would eat Bless on a character with BAB 0");

/* ================================================================== *
 * C. Stacking, because the pool hands over losers as well as winners
 * ================================================================== */

{
  const two = spellAttackBonusRows([
    { label: "BAB and ability", value: 3, type: "untyped" },
    { label: "Bless", value: 1, type: "status" },
    { label: "Heroism", value: 3, type: "status" }
  ]);
  const stacked = applyStacking(two, {});
  ok("C1 two status bonuses do not both apply", stacked.total === 3,
    `got ${stacked.total} — highest-wins, so 3 rather than 4`);
  ok("C2 and the loser is reported rather than dropped",
    stacked.modifiers.length === 2 && stacked.modifiers.some((m) => m.applied === false),
    "the card should be able to say what was discarded");
}
{
  const mixed = applyStacking(spellAttackBonusRows([
    { label: "Bless", value: 1, type: "status" },
    { label: "Bane", value: -1, type: "status" }
  ]), {});
  ok("C3 a bonus and a penalty of one type cancel", mixed.total === 0,
    `got ${mixed.total}`);
}
{
  const both = applyStacking(spellAttackBonusRows([
    { label: "Bless", value: 1, type: "status" },
    { label: "Rage", value: 2, type: "circumstance" }
  ]), {});
  ok("C4 different types do stack with each other", both.total === 3);
}

/* ================================================================== *
 * D. The assembled total, and saying what moved it
 * ================================================================== */

{
  const before = assembledSpellAttackTotal({ checkTotal: 18 });
  const after = assembledSpellAttackTotal({
    checkTotal: 18, poolRows: [{ label: "Bless", value: 1 }]
  });
  ok("D1 a pool bonus raises the assembled total", after.total === before.total + 1,
    `${before.total} -> ${after.total}`);
  // BEING IN `parts` IS NOT BEING ON THE CARD, and the first version of
  // this release proved it. The rows were collected, added to the total,
  // and pushed into this array — which nothing renders. Driving it
  // showed the attack moving 17 -> 18 with no line to account for it,
  // while this check passed. Section F now reads the card path itself;
  // this one is kept but demoted to what it actually proves.
  ok("D2 the assembler records the row for anyone who wants it",
    after.parts.some((p) => p.label === "Bless"),
    "necessary for a card line, and on its own not sufficient");
  ok("D3 the base is untouched", after.base === 18);
}
ok("D4 no pool rows changes nothing",
  assembledSpellAttackTotal({ checkTotal: 18, poolRows: [] }).total === 18
  && assembledSpellAttackTotal({ checkTotal: 18 }).total === 18);
// A ZERO ROW EARNS NO LINE. `push` drops it, which is right: the card
// should say what applied, not list what did not.
ok("D5 a zero-valued row adds no line",
  assembledSpellAttackTotal({ checkTotal: 18, poolRows: [{ label: "Nothing", value: 0 }] })
    .parts.length === 0);
ok("D6 the existing three extras still work",
  assembledSpellAttackTotal({ checkTotal: 10, attackWarp: 1, aggressiveMagic: 2, specialistUplift: 3 })
    .total === 16,
  "poolRows must be additive to what was already there, not a replacement");

/* ================================================================== *
 * E. Wired into the spell attack, and stacked before it is used
 * ================================================================== */

ok("E1 the spell attack reads the attack pool",
  /spellAttackBonusRows\(actor\.system\?\.combat\?\.attack\?\.checkModifiers\)/.test(cast),
  "the same node a weapon Strike builds its modifiers from");
ok("E2 and stacks it rather than summing it",
  /applyStacking\(\s*\n?\s*spellAttackBonusRows\(/.test(cast),
  "adding them raw would pay two Blesses twice");
ok("E3 suppressed rows are dropped before they reach the total",
  /\.filter\(\(row\) => row\.applied !== false\)/.test(cast),
  "applyStacking marks losers rather than removing them");
ok("E4 the rows are handed to the assembler",
  /assembledSpellAttackTotal\(\{[\s\S]{0,200}poolRows\s*\n?\s*\}\)/.test(cast));

// THE WEAPON SIDE MUST BE UNCHANGED. It already read the whole node, and
// this release must not narrow it to the two travelling types.
ok("E5 a weapon Strike still takes the whole attack node",
  /system\.combat\?\.attack\?\.checkModifiers \?\?/.test(attack),
  "BAB, ability, item and class all belong on a weapon attack");
ok("E6 and the spell path does not touch the weapon path's builder",
  !/spellAttackBonusRows/.test(attack));

/* ================================================================== *
 * F. THE CARD SAYS WHY
 *
 * THE DEFECT THIS SECTION EXISTS FOR, found by driving 3.425.0 and by
 * nothing in this file.
 *
 * The bonus applied — 17 became 18 on an otherwise identical roll — and
 * the card said nothing about it. `assembledSpellAttackTotal` builds a
 * `parts` array and NOTHING RENDERS IT; each of the other three extras
 * pushes its own line in `resolveSpellAttack` instead. D2 asserted the
 * label reached that array and it did. A number that moves an attack the
 * player watched land has to be accounted for on the card, and an array
 * nobody reads accounts for nothing.
 * ================================================================== */

/*
 * RE-ANCHORED at 3.600.0. The loop gained a `quiet` gate so a Scorching Ray
 * volley prints the cast's bonus pool once rather than once per ray — see
 * magic/ray-volley.mjs. The rule this check guards is unchanged: an applied
 * bonus pushes its own line.
 */
ok("F1 an applied pool bonus pushes its own card line",
  /for \(const row of (?:quiet \? \[\] : )?poolRows\) \{[\s\S]{0,400}lines\.push\(/.test(cast),
  "the three neighbouring extras each push one; this one did not");
ok("F2 the line names the bonus and its type",
  /\$\{row\.label\}[\s\S]{0,80}\$\{row\.type\}/.test(cast),
  "\"+1\" with no source is a number a player cannot check");
ok("F3 a zero-valued row prints nothing",
  /if \(!Number\(row\.value\)\) continue;/.test(cast),
  "the card should say what applied, not list what did not");
// AND THE LOSERS, because a player holding Bless and Heroism should see
// which one lost rather than wondering why the second did nothing.
// ANCHORED ON WHAT THE LOOP ITERATES, not on its body. The first draft
// asked only that the `applied !== false` guard and a `lines.push` both
// appeared — so a mutation replacing the SOURCE with an empty array
// sailed through, because the body it was checking never changed.
ok("F4 a suppressed bonus is reported too",
  /for \(const row of (?:quiet \? \[\] : \()?stackedPool\.modifiers \?\? \[\]\)?\) \{[\s\S]{0,300}lines\.push\(/.test(cast),
  "stacking discards silently otherwise");
ok("F5 and says why it was suppressed",
  /row\.suppressed \?\? "does not stack"/.test(cast));
// ORDERING: the lines must be pushed before the hit/miss line that uses
// the total, or the card explains a number the reader has already passed.
ok("F6 the reasons appear before the result they explain",
  cast.indexOf("for (const row of poolRows) {") < cast.indexOf("const total = attackTotal.total;"),
  "an explanation after the conclusion is a footnote nobody reads");

/* ================================================================== */

const label = "verify-spell-attack-bonus";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
