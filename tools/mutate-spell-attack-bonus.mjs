#!/usr/bin/env node
/**
 * mutate-spell-attack-bonus — can verify-spell-attack-bonus fail?
 *
 * NEW at 3.425.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT — the spell attack never reading the pool.
 * #2 AND #3 ARE THE OVERCORRECTION: handing a spell attack the whole
 * node, which would be a rules change wearing a bug fix's clothes.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "magic", "spell-attack-bonus.mjs");
const DC = path.join(SYSTEM_ROOT, "module", "magic", "casting-dc.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-spell-attack-bonus.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT.
    file: CAST,
    name: "THE SHIPPED DEFECT: the spell attack stops reading the attack pool",
    from: "  const poolRows = (stackedPool.modifiers ?? []).filter((row) => row.applied !== false);",
    to: "  const poolRows = [];",
    breaks: "E3/E4 — Bless applies to weapon Strikes and to nothing else"
  },
  {
    // THE OVERCORRECTION, in its most tempting form.
    file: RULE,
    name: "THE OVERCORRECTION: every typed bonus travels",
    from: 'export const SPELL_ATTACK_BONUS_TYPES = Object.freeze(["status", "circumstance"]);',
    to: 'export const SPELL_ATTACK_BONUS_TYPES = Object.freeze(["status", "circumstance", "item", "class", "untyped"]);',
    breaks: "B1/B2/B3/B4 — a Fire Bolt gains BAB, Bless Weapon and the class progression"
  },
  {
    file: RULE,
    name: "an item bonus meant for a weapon travels",
    from: 'Object.freeze(["status", "circumstance"]);',
    to: 'Object.freeze(["status", "circumstance", "item"]);',
    breaks: "B2/B4 — Bless Weapon's +2 buffs a spell"
  },
  {
    file: RULE,
    name: "only status travels, so postures and conditions are lost",
    from: 'Object.freeze(["status", "circumstance"]);',
    to: 'Object.freeze(["status"]);',
    breaks: "A2/B4 — Rage, Aim, Prone and Divine Favour stop reaching spell attacks"
  },
  {
    // THE INDEX SHORTCUT. Dropping "the first row" works on a character
    // with BAB and eats Bless on one without.
    file: RULE,
    name: "the additive row is dropped by position rather than by type",
    from: "  return (Array.isArray(checkModifiers) ? checkModifiers : []).filter((row) =>\n    SPELL_ATTACK_BONUS_TYPES.includes(String(row?.type ?? \"\").trim().toLowerCase())\n  );",
    to: "  return (Array.isArray(checkModifiers) ? checkModifiers : []).slice(1);",
    breaks: "B1/B2/B5/B6 — right for one character shape and wrong for the rest"
  },
  {
    file: RULE,
    name: "the type match becomes case-sensitive",
    from: 'String(row?.type ?? "").trim().toLowerCase()',
    to: 'String(row?.type ?? "")',
    breaks: "A4 — a type stored with different casing silently stops travelling"
  },
  {
    file: RULE,
    name: "a missing node throws instead of yielding nothing",
    from: "  return (Array.isArray(checkModifiers) ? checkModifiers : []).filter((row) =>",
    to: "  return checkModifiers.filter((row) =>",
    breaks: "A3 — a creature with no attack node breaks every spell attack"
  },
  {
    // STACKING. Two Blesses must not both pay.
    file: CAST,
    name: "the pool is summed rather than stacked",
    // RE-ANCHORED AT 3.608.0: the pool now carries Shocking Grasp's metal row too.
    // RE-ANCHORED AT 3.616.0: and the Rod of Accuracy's row (R14 of block 36).
    // RE-ANCHORED AT 3.621.0: and the target's conditions (block 39's R7).
    from: "  const stackedPool = applyStacking(\n    spellAttackBonusRows(actor.system?.combat?.attack?.checkModifiers).concat(metalRow ? [metalRow] : [])\n      .concat(conditionRows)\n      .concat(Array.isArray(extraAttackRows) ? extraAttackRows : []), {});",
    to: "  const stackedPool = { modifiers: spellAttackBonusRows(actor.system?.combat?.attack?.checkModifiers).concat(metalRow ? [metalRow] : [])\n      .concat(conditionRows)\n      .concat(Array.isArray(extraAttackRows) ? extraAttackRows : []) };",
    breaks: "E2 — Bless and Heroism would both apply, against the stacking rule"
  },
  {
    file: CAST,
    name: "suppressed rows reach the total",
    from: ".filter((row) => row.applied !== false);",
    to: ".filter(() => true);",
    breaks: "E3 — applyStacking marks losers rather than removing them"
  },
  {
    file: DC,
    name: "the assembled total ignores the rows it was given",
    from: "  for (const row of Array.isArray(poolRows) ? poolRows : []) {\n    total += push(parts, String(row?.label ?? \"Bonus\"), int(row?.value));\n  }",
    to: "",
    breaks: "D1/D2 — the rows are collected and then thrown away"
  },
  {
    file: DC,
    name: "the assembler stops recording the row",
    from: "    total += push(parts, String(row?.label ?? \"Bonus\"), int(row?.value));",
    to: "    total += int(row?.value);",
    breaks: "D2 — necessary for a card line, though not sufficient on its own"
  },
  {
    // THE DEFECT FOUND BY DRIVING 3.425.0: the bonus applied and the
    // card said nothing, because `parts` is an array nothing renders.
    file: CAST,
    name: "THE LIVE DEFECT: the bonus applies with nothing on the card to explain it",
    // RE-ANCHORED at 3.600.0: the loop gained a `quiet` gate for Scorching Ray's
    // volley, which prints the cast's pool once rather than once per ray.
    from: "  for (const row of quiet ? [] : poolRows) {",
    to: "  for (const row of []) {",
    breaks: "F1 — 17 becomes 18 and the player cannot account for it"
  },
  {
    file: CAST,
    name: "the card line omits the bonus type",
    from: "`<em>${row.label}: ${row.value > 0 ? \"+\" : \"\"}${row.value} ${row.type} to the attack.</em>`",
    to: "`<em>${row.label}: ${row.value > 0 ? \"+\" : \"\"}${row.value} to the attack.</em>`",
    breaks: "F2 — the type is what tells a player whether a second one would stack"
  },
  {
    file: CAST,
    name: "a zero-valued row prints a line saying nothing happened",
    from: "    if (!Number(row.value)) continue;",
    to: "    if (false) continue;",
    breaks: "F3 — the card should say what applied, not list what did not"
  },
  {
    file: CAST,
    name: "suppressed bonuses are discarded silently",
    // RE-ANCHORED at 3.600.0, for the same reason as F1's above.
    from: "  for (const row of quiet ? [] : (stackedPool.modifiers ?? [])) {",
    to: "  for (const row of []) {",
    breaks: "F4 — a player holding Bless and Heroism cannot see which lost"
  },
  {
    file: DC,
    name: "the pool replaces the other three extras instead of adding to them",
    from: "  total += push(parts, \"Caster level modifications\", int(attackWarp));",
    to: "",
    breaks: "D6 — poolRows must be additive to what was already there"
  },
  {
    // THE WEAPON SIDE MUST NOT BE NARROWED BY THIS RELEASE.
    file: ATTACK,
    name: "the weapon Strike is narrowed to the travelling types too",
    // Re-anchored 3.609.2: read off the live actor after the ward gate (G1).
    from: "    ...(actor.system.combat?.attack?.checkModifiers ?? [",
    to: "    ...(actor.system.combat?.attack?.checkModifiersX ?? [",
    breaks: "E5 — BAB, ability, item and class all belong on a weapon attack"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RULE, DC, CAST, ATTACK, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spell-attack-bonus: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-spell-attack-bonus: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-spell-attack-bonus: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
