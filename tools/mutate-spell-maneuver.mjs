#!/usr/bin/env node
/**
 * mutate-spell-maneuver — can verify-spell-maneuver fail?
 *
 * NEW at 3.401.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE ONE THIS FILE WAS BUILT AROUND. Writing Tanglefoot's
 * outcomes out by hand looks tidier than a pass-through and is a second
 * copy of a table Graham has already corrected once — against a typo in
 * the printed book that made a critical WORSE than a success. The copy
 * would be right today and wrong the next time the table moves, with
 * nothing to notice.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SRC = path.join(SYSTEM_ROOT, "module", "magic", "spell-maneuver.mjs");
const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack.mjs");
const CONDITIONS = path.join(SYSTEM_ROOT, "module", "combat", "basic-action-conditions.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-spell-maneuver.mjs");

const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");

const DAMAGE = path.join(SYSTEM_ROOT, "module", "magic", "spell-damage.mjs");

const MUTATIONS = [
  {
    // THE HEROIC BUG, restored. No action declares a heroic outcome, so
    // without the fallback a 22-point margin applies nothing where an
    // 11-point margin grabs. Rolling better made things worse.
    name: "THE HEROIC BUG: a succeeding degree stops falling back",
    file: CONDITIONS,
    from: "  if (!self) return [];",
    to: "  if (true) return [];",
    breaks: "G1/G2 — heroic and critical apply nothing at all"
  },
  {
    name: "the fallback stops one rung short",
    file: CONDITIONS,
    from: "    .filter((d) => d.success && d.rank < self.rank)",
    to: "    .filter((d) => d.success && d.rank === self.rank - 1)",
    breaks: "G1 — dropProne, createADiversion and sneak break again, as they did first time"
  },
  {
    // AIMED WHERE THE INVARIANT ACTUALLY LIVES. This started as a
    // mutation on a `!self?.success` guard and SURVIVED, because the
    // filter below already excluded failing degrees — the guard was
    // dead. `d.success` in the filter is the line that really holds it.
    name: "a heroic falls back to a FAILING degree",
    file: CONDITIONS,
    from: "    .filter((d) => d.success && d.rank < self.rank)",
    to: "    .filter((d) => d.rank < self.rank)",
    breaks: "G4 — a heroic Shove knocks the SHOVER prone, from the fumble entry"
  },
  {
    name: "the fallback climbs instead of falling",
    file: CONDITIONS,
    from: "    .sort((a, b) => b.rank - a.rank);",
    to: "    .sort((a, b) => a.rank - b.rank);",
    breaks: "G2 — a heroic takes the weakest outcome rather than the strongest"
  },
  {
    // GRAHAM'S SICKLY RAY RULING.
    name: "a damage-free spell inflicts a critical injury again",
    file: DAMAGE,
    from: "  return spellDealsDamage(spellSystem);",
    to: "  void spellSystem;\n  return true;",
    breaks: "H7 — a spell that deals no damage maims its target on a critical"
  },
  {
    name: "damage carried in the effects array stops counting",
    file: DAMAGE,
    from: '  if (Array.isArray(effects) && effects.some((e) => e?.kind === "damage")) return true;',
    to: "  void effects;",
    breaks: "H3 — Magic Missile reads as damage-free and loses its criticals"
  },
  {
    name: "multi-part damage stops counting",
    file: DAMAGE,
    from: "  if (Array.isArray(damage?.parts) && damage.parts.length > 0) return true;",
    to: "  void damage;",
    breaks: "H2 — a multi-part damage spell reads as damage-free"
  },
  {
    // THE LIVE BUG OF 3.401.0, restored. Without the predicate gating
    // `isAttack`, a maneuver spell rolls a spell attack as well as its
    // maneuver — and with no damage on the spell, that attack crits for
    // zero and rolls a critical injury.
    name: "THE LIVE BUG: a maneuver spell also rolls a spell attack",
    file: CAST,
    from: "    && !spellIsManeuver(spellData);",
    to: ";",
    breaks: "F7b — Tanglefoot maims its target with a 0-damage critical"
  },
  {
    name: "the maneuver predicate never recognises anything",
    file: SRC,
    from: '  return effects.some((e) => e?.kind === "maneuver");',
    to: "  return false;",
    breaks: "F1/F6 — every maneuver spell runs the attack pipeline as well"
  },
  {
    name: "the predicate recognises every spell",
    file: SRC,
    from: '  return effects.some((e) => e?.kind === "maneuver");',
    to: "  return true;",
    breaks: "F2/F3 — no attack spell in the game rolls its attack any more"
  },
  {
    // THE SECOND COPY.
    name: "THE COPY: the spell holds its own outcome table",
    file: SRC,
    from: "  return basicActionConditionEffects(actionKey, degree);",
    to: "  if (degree === \"critical\" || degree === \"success\") {\n    return [{ target: \"target\", conditionKey: \"grabbed\", active: true }];\n  }\n  return [];",
    breaks: "C1/C2b/C3 — plausible, wrong the moment the action's table changes"
  },
  {
    name: "the size penalty is dropped",
    file: SRC,
    from: "    if (penalty) modifiers.push({ label: \"Target size\", value: penalty, type: \"circumstance\" });",
    to: "    void penalty;",
    breaks: "B3/B4 — Graham's ruling that the action's size rule applies on top"
  },
  {
    name: "the spell's own penalty becomes typed",
    file: SRC,
    from: '  if (own !== 0) modifiers.push({ label, value: own, type: "untyped" });',
    to: '  if (own !== 0) modifiers.push({ label, value: own, type: "circumstance" });',
    breaks: "A3 — it would pool highest-wins against the size penalty and one would vanish"
  },
  {
    name: "the size penalty becomes untyped",
    file: SRC,
    from: '    if (penalty) modifiers.push({ label: "Target size", value: penalty, type: "circumstance" });',
    to: '    if (penalty) modifiers.push({ label: "Target size", value: penalty, type: "untyped" });',
    breaks: "B6 — the action applies it as a circumstance penalty"
  },
  {
    // ONE TABLE FOR EVERY MANEUVER would give Disarm grapple's threshold.
    name: "every maneuver uses grapple's size threshold",
    file: SRC,
    from: "  const config = MANEUVER_SIZE_PENALTY[actionKey];",
    to: "  const config = MANEUVER_SIZE_PENALTY.grappleAttack;",
    breaks: "B7/B8 — Disarm penalises at one category, not two"
  },
  {
    name: "an unknown action is given a size penalty anyway",
    file: SRC,
    from: "  if (config) {",
    to: "  if (config ?? true) {",
    breaks: "B8 — a typo'd action key silently acquires grapple's rule"
  },
  {
    name: "a failure is reported as having landed nothing",
    file: SRC,
    from: "  return spellManeuverEffects(actionKey, degree).length > 0;",
    to: "  return spellManeuverEffects(actionKey, degree).some((e) => e.active);",
    breaks: "C3b — a card saying 'no effect' while a creature is let go"
  },
  {
    // THE CORRECTION ITSELF, restored to the book's typo.
    name: "grapple's critical reverts to the printed typo",
    file: CONDITIONS,
    from: '    success: [{ target: "target", conditionKey: "grabbed", active: true }],',
    to: '    success: [{ target: "target", conditionKey: "immobilised", active: true }],',
    breaks: "C2c/C2d — a critical would leave the target less affected than a success"
  },
  {
    name: "the shared size table loses grapple's entry",
    file: ATTACK,
    from: "  grappleAttack: Object.freeze({ threshold: 2, perCategory: -4 }),",
    to: "  grappleAttack: Object.freeze({ threshold: 9, perCategory: -4 }),",
    breaks: "B3/E5 — no target is ever large enough to penalise"
  },
  {
    name: "grapple's size step stops being cumulative",
    file: ATTACK,
    from: "  return (diff - threshold + 1) * perCategory;",
    to: "  return perCategory;",
    breaks: "B4 — a Gargantuan target is no harder than a Huge one"
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

const guard = guardFiles([SRC, ATTACK, CONDITIONS, CAST, DAMAGE, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spell-maneuver: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-spell-maneuver: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-spell-maneuver: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
