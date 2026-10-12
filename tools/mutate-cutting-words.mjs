#!/usr/bin/env node
/**
 * mutate-cutting-words — can verify-cutting-words fail?
 *
 * NEW at 3.432.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT and it is the reason this file exists: remove
 * the line that records the penalty and everything else still works.
 * The cast spends the reaction, spends the PP, rolls a real Will save,
 * prints "is affected" and — because `selfApplying` suppresses the
 * by-hand advice — says nothing about applying it. That is a green
 * system doing nothing, which is exactly what Graham reported.
 *
 * #10 IS THE OTHER HALF: restore `getActiveTokens(true)` and the helper
 * goes blind to every monster in the game again.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULES = path.join(SYSTEM_ROOT, "module", "magic", "cutting-words.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "magic", "cutting-words-workflow.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK_SRC = path.join(SYSTEM_ROOT, "module", "dice", "check.mjs");
const GEOMETRY = path.join(SYSTEM_ROOT, "module", "combat", "geometry.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-cutting-words.mjs");

const MUTATIONS = [
  {
    file: CAST,
    name: "THE SHIPPED DEFECT: nothing applies what `selfApplying` promises",
    from: "      if (spellAppliesItself(spell) && !saved) {",
    to: "      if (false && spellAppliesItself(spell) && !saved) {",
    breaks: "F1 — the cast prints 'is affected', suppresses the by-hand advice, and does nothing"
  },
  {
    file: CAST,
    name: "the penalty is recorded even on a successful save",
    from: "      if (spellAppliesItself(spell) && !saved) {",
    to: "      if (spellAppliesItself(spell)) {",
    breaks: "F3 — a creature that resisted still carries the penalty"
  },
  {
    file: CAST,
    name: "it is keyed on the spell's name instead of the flag",
    from: "      if (spellAppliesItself(spell) && !saved) {",
    to: '      if (spell?.name === "Cutting Words" && !saved) {',
    breaks: "F2 — the next self-applying spell needs castSpell edited to work"
  },
  {
    file: CHECK_SRC,
    name: "the waiting penalty is never spent",
    from: "    await this.#takeCuttingWords();",
    to: "    // await this.#takeCuttingWords();",
    breaks: "F5 — it sits on the creature for ever and reaches no roll"
  },
  {
    file: CHECK_SRC,
    name: "THE ORDERING: it is applied after the outcome is built",
    // RE-ANCHORED at 3.443.0. Counter Perform's hook was added directly
    // beneath this one, so the old anchor — which required a blank line
    // between the call and the roll — stopped matching and the mutation
    // silently stopped running. It now MOVES the call below the roll,
    // which tests the ordering claim more directly than deleting it did:
    // the penalty is still taken, and taken too late to change a degree.
    from: "    await this.#takeCuttingWords();",
    to: "",
    // RE-ANCHORED 3.612.0: `reroll()` (Lucky Break) throws the dice with the
    // same line, so the find carries the line after it in `evaluate()` too.
    extra: {
      find: "    this.dice = this.die === \"d100\" ? await this.#rollD100() : await this.#rollD20();\n\n    const difficulty = DIFFICULTY_BY_KEY[this.difficulty];",
      replace: "    this.dice = this.die === \"d100\" ? await this.#rollD100() : await this.#rollD20();\n    await this.#takeCuttingWords();\n\n    const difficulty = DIFFICULTY_BY_KEY[this.difficulty];"
    },
    breaks: "F5/F6 — a modifier added after buildOutcome prints and changes no degree"
  },
  {
    file: CHECK_SRC,
    name: "the penalty is spent but never cleared",
    from: "      await consumeCuttingWords(this.actor);",
    to: "      void consumeCuttingWords;",
    breaks: "F7 — one cast penalises every roll the target makes for the rest of the session"
  },
  {
    file: RULES,
    name: "a Critical save records a zero instead of nothing",
    from: "  const penalty = cuttingWordsPenalty(degree);\n  if (!penalty) return null;",
    to: "  const penalty = cuttingWordsPenalty(degree);",
    breaks: "B2 — a record that does nothing sits on the creature looking like an effect"
  },
  {
    file: RULES,
    name: "the ladder is read as the caster's, inverting the spell",
    from: "  success: -1,\n  partial: -2,\n  failure: -2,\n  fumble: -3,\n  blunder: -3",
    to: "  success: -3,\n  partial: -2,\n  failure: -2,\n  fumble: -1,\n  blunder: -1",
    breaks: "A2/A4 — the target's Fumble becomes the cheapest result for them"
  },
  {
    file: RULES,
    name: "an unresolved degree shrugs the spell off",
    from: "    : CUTTING_WORDS_LADDER.failure;",
    to: "    : 0;",
    breaks: "A8 — the PP and the reaction are quietly refunded"
  },
  {
    file: RULES,
    name: "the penalty stops being circumstance-typed, so two Bards stack",
    from: '    type: "circumstance"\n  };\n}\n\n/**\n * Whether this check is the one that takes',
    to: '    type: "untyped"\n  };\n}\n\n/**\n * Whether this check is the one that takes',
    breaks: "D1/D6 — two Bards cutting at one swing reach -5"
  },
  {
    file: RULES,
    name: "every roll spends it, not only attacks and skill checks",
    from: '  return key === "attack" || key === "skill";',
    to: "  return true;",
    breaks: "C3 — the target's next saving throw eats the penalty instead"
  },
  {
    file: RULES,
    name: "allies may be targeted again",
    // RE-ANCHORED at 3.443.1: the enemies branch is now the `else if` tail
    // of a three-way side test, so the old standalone line is gone.
    from: '  } else if (!isEnemy) {\n    return { eligible: false, reason: "is not an enemy" };\n  }',
    to: "  } else if (false) {\n    return { eligible: false, reason: \"is not an enemy\" };\n  }",
    breaks: "E2/E3 — the complaint that started this: it lands on friendly players"
  },
  {
    file: RULES,
    name: "range stops being enforced",
    from: "  if (distance > reach) {",
    to: "  if (false) {",
    breaks: "E5 — a 30-foot spell reaches across the map"
  },
  {
    file: FLOW,
    name: "an AREA spell is gated as though it were targeted",
    from: '  if (String(system.area ?? "").trim()) return null;',
    to: "  if (false) return null;",
    breaks: "G7b — Bane and every other enemies-only area spell is refused at cast"
  },
  {
    file: FLOW,
    name: "the range comes from a constant rather than the spell",
    from: "  const rangeFeet = parseRangeFeet(String(system.range ?? \"\")) ?? CUTTING_WORDS_RANGE;",
    to: "  const rangeFeet = CUTTING_WORDS_RANGE;",
    breaks: "G7c — the next spell to declare this is judged at Cutting Words' reach"
  },
  {
    file: FLOW,
    name: "the refusal is asked of every spell, not only this one",
    // RE-ANCHORED at 3.443.1: the gate reads the declared side into a
    // variable now and answers to two words rather than one.
    from: '  if (side !== "enemies" && side !== "allies") return null;',
    to: "  if (false) return null;",
    breaks: "G7 — every spell in the game is refused unless aimed at an enemy in range"
  },
  {
    file: FLOW,
    name: "THE INERT GATE: sameSide is handed tokens instead of dispositions",
    from: "        ? !sameSide(casterToken.document?.disposition, token.document?.disposition)",
    to: "        ? !sameSide(casterToken, token)",
    breaks: "G8b — Number(token) is NaN, every ally reads as an enemy, the gate refuses nothing"
  },
  {
    file: FLOW,
    name: "the side test is rewritten here instead of imported",
    from: 'import { sameSide } from "../combat/aid-bonus.mjs";',
    to: "function sameSide(a, b) { return a?.document?.disposition === b?.document?.disposition; }",
    breaks: "G8 — a second copy of a rule Graham already ruled on once"
  },
  {
    file: GEOMETRY,
    name: "THE MISREAD RESTORED: activeToken demands a linked token again",
    from: "    return actor?.getActiveTokens?.()?.[0] ?? null;",
    to: "    return actor?.getActiveTokens?.(true)?.[0] ?? null;",
    breaks: "G3 — every monster in the game becomes invisible to 17 call sites"
  },
  {
    file: CAST,
    name: "the enemies-only refusal is never asked",
    from: "    const refusal = dispositionRefusal(actor, spell, Array.from(game.user?.targets ?? []));",
    to: "    const refusal = null;",
    breaks: "G5 — the target restriction exists and nothing consults it"
  },
  {
    // THE NEW WAY THIS GATE CAN GO INERT (3.443.1). It reads the declared
    // side, refuses spells that declare neither — and then judges every
    // target as an enemy anyway, so Counter Perform's allies gate silently
    // becomes the enemies gate it replaced. The same shape as the
    // `sameSide` misread above: the wiring present, the value not passed.
    file: FLOW,
    name: "the side is read and then not passed on",
    from: "      rangeFeet,\n      side",
    to: "      rangeFeet",
    breaks: "G7c — an allies spell is judged by the enemies rule"
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

const guard = guardFiles([RULES, FLOW, CAST, CHECK_SRC, GEOMETRY, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-cutting-words: verify already fails on an unmodified tree.\n");
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
    let mutated = original.replace(m.from, m.to);
    // SOME DEFECTS ARE A MOVE, NOT A DELETION, and a move is two edits.
    // Added at 3.443.0 so the ordering mutation can put a call back in the
    // wrong place rather than merely removing it.
    if (m.extra) {
      if (mutated.split(m.extra.find).length - 1 !== 1) {
        results.push({ name: m.name, state: "ANCHOR MISSING" });
        continue;
      }
      mutated = mutated.replace(m.extra.find, m.extra.replace);
    }
    fs.writeFileSync(m.file, mutated);
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
    ? `\nmutate-cutting-words: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-cutting-words: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
