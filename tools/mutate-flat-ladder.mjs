#!/usr/bin/env node
/**
 * mutate-flat-ladder — can verify-flat-ladder fail?
 * NEW at 3.485.0.
 *
 * T3 IS THE ONE THAT KILLS A PC. "100 HP or fewer" includes 100; a `<`
 * where a `<=` belongs is the difference between a dead character and a
 * living one, and nobody would ever report it as anything but bad luck.
 *
 * W2 RESTORES THE 3.457.0 DEFECT: writing HP to zero instead of going
 * through Dying and the reaper leaves a corpse at Dying 1, still in the
 * initiative order, on a card that says it died.
 *
 * S2 IS THE PARSER'S DISTINCTION between a rung of zero (decided) and a
 * rung that is absent (nobody decided).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const L = path.join(SYSTEM_ROOT, "module", "magic", "flat-ladder.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "flat-ladder-workflow.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const A = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const D = path.join(SYSTEM_ROOT, "module", "combat", "dying-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-flat-ladder.mjs");

const MUTATIONS = [
  {
    file: L,
    name: "T3 THE BOUNDARY EXCLUDES ITSELF: exactly 100 HP survives",
    from: "    if (hp <= rung.diesAtOrBelow) {",
    to: "    if (hp < rung.diesAtOrBelow) {",
    breaks: "T3 — \"100 HP or fewer\" would spare a creature on exactly 100"
  },
  {
    file: L,
    name: "T3b the threshold is asked AFTER the drop",
    from: "  if (rung.diesAtOrBelow !== null) {",
    to: "  if (false && rung.diesAtOrBelow !== null) {",
    breaks: "T3/T4 — nobody would ever die on a Failure"
  },
  {
    file: L,
    name: "T5 success kills from the starting HP, not from its own damage",
    from: "  if (rung.diesIfReducedToZero && after <= 0) {",
    to: "  if (rung.diesIfReducedToZero && hp <= 50) {",
    breaks: "T5 — the death would stop following from the damage"
  },
  {
    file: L,
    name: "T1 a fumble stops killing",
    from: "  if (rung.dies) {",
    to: "  if (false) {",
    breaks: "T1 — \"The target dies instantly\" would do nothing"
  },
  {
    file: L,
    name: "S2 a rung of zero is treated as a missing rung",
    from: "    if (rung === undefined || rung === null) return null;",
    to: "    if (!rung || !rung.damage) return null;",
    breaks: "S2 — Serenity's \"unaffected\" Critical would refuse the whole spell"
  },
  {
    file: L,
    // TARGETS THE FIRST GUARD. The first draft mutated the `typeof` line,
    // which an earlier `undefined || null` check already handles — so it
    // changed nothing for a deleted rung and survived. The mutation was
    // ineffective, not the check weak.
    name: "R3 a MISSING rung is accepted and silently zeroed",
    from: "    if (rung === undefined || rung === null) return null;",
    to: "    if (rung === undefined || rung === null) { ladder[degree] = { damage: 0 }; continue; }",
    breaks: "R3 — a degree nobody decided would cost nothing"
  },
  {
    file: L,
    name: "S3 the critical-injury modifier is dropped",
    from: "      criticalModifier: int(rung.criticalModifier)",
    to: "      criticalModifier: 0",
    breaks: "S3 — Serenity's \"-20 critical injury\" becomes an ordinary one"
  },
  {
    file: L,
    name: "O2 THE RULING BROKEN: Aid Defensive and Escape become offensive",
    from: "  if (NOT_OFFENSIVE.includes(key)) return false;",
    to: "",
    breaks: "O2 — a cursed creature punished for escaping a grapple"
  },
  {
    file: L,
    name: "O1 nothing is offensive any more",
    from: "  return /\\battack\\b/i.test(String(action?.traits ?? \"\"));",
    to: "  return false;",
    breaks: "O1 — the curse would never bite"
  },
  {
    file: L,
    name: "R5 the repeat is inferred rather than declared",
    from: "    repeatsOnOffensiveAction: raw.repeatsOnOffensiveAction === true,",
    to: "    repeatsOnOffensiveAction: true,",
    breaks: "R5 — Word Of Death would become a standing curse"
  },
  {
    file: F,
    /*
     * ─────────────────────────────────────────────────────────────────
     * THIS MUTATION USED TO DESCRIBE THE PRODUCTION CODE.
     *
     * At 3.485.0 the anchor was the real line — a write to
     * `system.conditions.dying.value` — and W2 passed against it,
     * because W2 asked whether `reapDead` and `deathState + 1` appeared
     * rather than what the write was. The defect and the mutation of the
     * defect were the same text. Restored here as what it always should
     * have been: a mutation AWAY from the mechanism, not toward it.
     */
    name: "W2 THE 3.457.0 DEFECT: Dying written to a field the reaper cannot read",
    from: "    await target.toggleStatusEffect(\"dying\", { value: deathState + 1 });",
    to: "    await target.update({ \"system.conditions.dying.value\": deathState + 1 }).catch(() => {});",
    breaks: "W2/W2b — getConditionValue never sees it, so the corpse stays in the tracker"
  },
  {
    file: F,
    name: "W2c the reaper is never asked",
    from: "    await reapDead(target, game.combat ?? null);",
    to: "",
    breaks: "W2 — a dead creature keeps taking turns"
  },
  {
    file: F,
    name: "W9 the -10 drop goes back to a bare hit-point write",
    from: "    const { enterDyingAt } = await import(\"../combat/dying-workflow.mjs\");\n    await enterDyingAt(target, resolution.finalHP);",
    to: "    await target.update({ \"system.resources.hp.value\": resolution.finalHP }).catch(() => {});",
    breaks: "W9/W9b — a creature at -10 HP with no Dying condition at all"
  },
  {
    file: F,
    name: "W12 a rung that cannot be found returns nothing again",
    from: "  if (!rung) {\n    lines.push(flatNoRungLine(spec, target.name, degree));\n    return lines;\n  }",
    to: "  if (!rung) return lines;",
    breaks: "W12 — the silence that hid the whole defect for a release"
  },
  {
    file: F,
    name: "W3 the critical injury is rolled without the rung's modifier",
    from: "      modifier: rung.criticalModifier",
    to: "      modifier: 0",
    breaks: "W3 — the -20 resolved and never reached the roll"
  },
  {
    file: F,
    name: "W4 the curse records no degree, so it cannot repeat correctly",
    from: "      label: spec.label, degree, castId: castId ?? null,",
    to: "      label: spec.label, castId: castId ?? null,",
    breaks: "W4 — the verdict the target must suffer again is lost"
  },
  {
    file: E,
    name: "W1 one degree is applied to everybody",
    // RE-AIMED AT 3.606.0, when the loop this mutated turned out to be the
    // defect — see W1 in the verify file.
    from: "          const mine = ladderResults.find((r) => r?.target === target);",
    to: "          const mine = ladderResults[0];",
    breaks: "W1 — everyone would suffer whatever the first target rolled"
  },
  {
    file: E,
    name: "W1 THE 3.606.0 DEFECT RESTORED: every target is handed every result",
    from: "          if (mine) {\n            for (const l of await applyFlatLadder(caster, spec, target, mine.degree, castId)) {",
    to: "          for (const r of ladderResults) {\n            for (const l of await applyFlatLadder(caster, spec, r.target, r.degree, castId)) {",
    breaks: "W1 — Serenity bites each of two targets twice"
  },
  {
    file: E,
    /*
     * THE 3.485.0 DEFECT ITSELF. A ladder falling to the ungated branch
     * takes `targets`, which for a save spell is the failures — so
     * nobody failing meant the switch never ran at all.
     */
    name: "W11 a ladder falls back to the failures again",
    // RE-ANCHORED 3.609.0: a second save owed by a critical sits between.
    from: "        : LADDER_KINDS.includes(effect.kind)\n          ? ladderResults.map((r) => r?.target).filter(Boolean)",
    to: "        : false\n          ? null",
    breaks: "W11 — Serenity's Success would fire only when somebody else failed"
  },
  {
    file: L,
    /*
     * D3 IS THE ONE THIS RELEASE EXISTS FOR. Removing the mapping puts
     * the raw rolled degree back through the door, and heroic, partial
     * and blunder go back to matching nothing.
     */
    name: "D3 THE MAPPING LEAVES THE DOOR: a rolled degree is used raw",
    from: "  const d = flatDegree(degree);\n  if (!d || !FLAT_DEGREES.includes(d)) return null;",
    to: "  const d = lower(degree);\n  if (!FLAT_DEGREES.includes(d)) return null;",
    breaks: "D3/D4 — a blunder would match no rung and do nothing at all"
  },
  {
    file: L,
    name: "D7 the normaliser stops surviving its own output",
    from: "      diesAtOrBelow: rung.diesAtOrBelow === undefined || rung.diesAtOrBelow === null\n        ? null : int(rung.diesAtOrBelow),",
    to: "      diesAtOrBelow: rung.diesAtOrBelow === undefined ? null : int(rung.diesAtOrBelow),",
    breaks: "D7/D8 — a stored Serenity would drop its victim to 0 HP on the first bite"
  },
  {
    file: L,
    name: "D9 the stated drop is lost on a round trip",
    from: "      dropsTo: rung.dropsTo === undefined || rung.dropsTo === null\n        ? null : int(rung.dropsTo),",
    to: "      dropsTo: rung.dropsTo === undefined ? null : int(rung.dropsTo),",
    breaks: "D9 — -10 becomes 0 the second time the ladder is read"
  },
  {
    file: A,
    /*
     * THE FORM 3.485.0 ACTUALLY SHIPPED at two of its three commit
     * points. It runs; the AST-walking dead-export ratchet cannot see
     * it. W6 counted it as a caller because W6 matched the call text.
     */
    name: "W6b a bite goes back to member access on the import",
    from: "    const { biteOffensiveCurses } = await import(\"../magic/flat-ladder-workflow.mjs\");\n    await biteOffensiveCurses(actor, action);",
    to: "    await (await import(\"../magic/flat-ladder-workflow.mjs\")).biteOffensiveCurses(actor, action);",
    breaks: "W6/W6b — the ratchet would stop counting that commit point"
  },
  {
    file: D,
    name: "W10 the -10 drop invents its own Dying value",
    from: "  const dropped = zeroHPDyingValue(isCritical);",
    to: "  const dropped = 1;",
    breaks: "W10 — the two branches of one rule would drift apart"
  },
  {
    file: D,
    name: "W10b a construct dropped to -10 is no longer destroyed",
    from: "  if (hasNoDeathState(ownedCreatureTypeSystem(actor))) {",
    to: "  if (false && hasNoDeathState(ownedCreatureTypeSystem(actor))) {",
    breaks: "W10b — an undead at -10 would lie there Dying instead of destroyed"
  }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
guardFiles(files);

const survivors = [];
let applied = 0;
const verifyPasses = () => {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
};

if (!verifyPasses()) {
  console.error("mutate-flat-ladder: the verifier does not pass BEFORE any mutation");
  process.exit(1);
}

try {
  for (const m of MUTATIONS) {
    const source = originals.get(m.file);
    if (!source.includes(m.from)) {
      console.error(`mutate-flat-ladder: anchor missing for "${m.name}"`);
      process.exit(1);
    }
    if (m.from === m.to) {
      console.error(`mutate-flat-ladder: "${m.name}" changes nothing`);
      process.exit(1);
    }
    applied += 1;
    fs.writeFileSync(m.file, source.replace(m.from, m.to));
    if (verifyPasses()) survivors.push(`${m.name} (should break ${m.breaks})`);
    fs.writeFileSync(m.file, source);
  }
} finally {
  for (const [f, s] of originals) fs.writeFileSync(f, s);
}

if (survivors.length) {
  console.error(`mutate-flat-ladder: ${survivors.length} of ${applied} mutations SURVIVED`);
  for (const s of survivors) console.error(`  ✗ ${s}`);
  process.exit(1);
}
console.log(`mutate-flat-ladder: all ${applied} mutations were caught`);
