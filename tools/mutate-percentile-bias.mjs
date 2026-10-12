#!/usr/bin/env node
/**
 * mutate-percentile-bias — can verify-percentile-bias fail?
 *
 * NEW at 3.419.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT, restored whole: the d20 habit of rolling
 * twice and keeping one, applied to a d100. It still produces plausible
 * numbers, which is exactly why it survived until somebody checked a
 * worked example against it.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const ENGINE = path.join(SYSTEM_ROOT, "module", "dice", "open-ended.mjs");
const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const CARD = path.join(SYSTEM_ROOT, "templates", "chat", "check-card.hbs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-percentile-bias.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT, whole.
    file: ENGINE,
    name: "THE SHIPPED DEFECT: a second tens die is drawn and the best kept",
    from: "  const second = digit(await drawUnit());",
    to: "  const extra = digit(await drawTen());\n  const second = digit(await drawUnit());\n  void extra;",
    breaks: "B8 — three dice for a two-digit roll, which is the old rule's tell"
  },
  {
    file: ENGINE,
    name: "advantage takes the lower digit",
    from: "    tens = Math.max(first, second);\n    unit = Math.min(first, second);",
    to: "    tens = Math.min(first, second);\n    unit = Math.max(first, second);",
    breaks: "A1/B1 — 67 reads 76 no longer; advantage becomes disadvantage"
  },
  {
    file: ENGINE,
    name: "disadvantage takes the higher digit",
    from: "    tens = Math.min(first, second);\n    unit = Math.max(first, second);",
    to: "    tens = Math.max(first, second);\n    unit = Math.min(first, second);",
    breaks: "A1/B3 — 87 reads 78 no longer"
  },
  {
    // THE HALF THAT MOVES THE HIT LOCATION. Reordering the tens while
    // leaving the units alone is the old rule's real signature, and the
    // VALUE still comes out right — only the location is wrong.
    file: ENGINE,
    name: "the units digit is left where it was rolled",
    from: "  let unit = second;",
    to: "  const unit = second;\n  let _unused;",
    breaks: "D1/D2 — the value is right and the blow lands on the wrong body part"
  },
  {
    // THE ROLL STOPS ASKING THE RULE AND DOES THE SUM ITSELF — which is
    // how the three unowned copies came to exist in the first place.
    file: ENGINE,
    name: "the roll inlines the sum instead of asking the rule",
    from: "  const value = percentileValue(tens, unit);",
    to: "  const value = tens * 10 + unit;",
    breaks: "C1 — a roll of 00 becomes 0, off both ends of the table"
  },
  {
    file: ENGINE,
    name: "the swap is no longer reported",
    from: "    swapped: tens !== first",
    to: "    swapped: false",
    breaks: "B10 — the card cannot show a reordering it is not told about"
  },
  {
    file: ATTACK,
    name: "a minor critical rolls at advantage",
    from: '        ? "disadvantage"',
    to: '        ? "advantage"',
    breaks: "E2 — the weakest critical rolls like the deadliest"
  },
  {
    file: ATTACK,
    name: "a deadly critical rolls normally",
    from: '      ? "advantage"',
    to: '      ? "normal"',
    breaks: "E1 — Deadly loses its advantage entirely"
  },
  /* ---------------- THE ZERO RULE (3.420.0) ---------------- */
  {
    // Graham, 27 August 2026: a 0 in the tens place is worth nothing
    // unless the units die is also 0, and then the pair is 100.
    file: ENGINE,
    name: "a 0 in the tens place starts meaning ten",
    from: "  const raw = digit(tens) * 10 + digit(unit);",
    to: "  const raw = (digit(tens) || 10) * 10 + digit(unit);",
    breaks: "G1 — a roll of 07 reads 107, off the top of every table"
  },
  {
    file: ENGINE,
    name: "the pair 00 is no longer 100",
    from: "  return raw === 0 ? 100 : raw;",
    to: "  return raw;",
    breaks: "G3/G5 — the hundred pairs cover 0-99, and 100 becomes unrollable"
  },
  {
    // A SPECIAL CASE THAT FIRES TOO OFTEN. It answers 100 for the pair
    // 00 correctly and for ten other pairs besides.
    file: ENGINE,
    name: "any zero in the units place reads as 100",
    from: "  return raw === 0 ? 100 : raw;",
    to: "  return raw % 10 === 0 ? 100 : raw;",
    breaks: "G4/G5 — 70 and 30 and 100 all read as 100; the die stops being a d100"
  },
  {
    // THE FOLD MOVED BACK AFTER THE COMPARISON. A d10's 10 is the digit
    // zero, and zero is the smallest digit — but 10 is the largest
    // NUMBER, so advantage picks it and prints a leading zero.
    file: ENGINE,
    name: "the digits are folded after the bias compares them",
    from: "  const first = digit(await drawTen());\n  const second = digit(await drawUnit());",
    to: "  const first = Number(await drawTen());\n  const second = Number(await drawUnit());",
    breaks: "G7 — advantage on an unfolded 10 answers 07, the worst tens digit as the best"
  },
  {
    // THE SHIPPED DEFECT ON THE INVERSE SIDE, restored as the one call
    // it was. Ambush and Sniping shift a critical and feed the new
    // number back; a forced 100 came apart into a tens digit of TEN.
    file: ENGINE,
    name: "THE SHIPPED DEFECT: a forced 100 takes apart into a tens die of ten",
    from: "  return { tens: Math.floor(v / 10) % 10, unit: v % 10 };",
    to: "  return { tens: Math.floor(v / 10), unit: v % 10 };",
    breaks: "G8/G9 — right for 1-99 and wrong for the hundredth value, which is the card Ambush prints"
  },
  {
    file: ENGINE,
    name: "the inverse loses the pair that produced 100",
    from: "  const v = Math.max(1, Math.min(100, Math.trunc(Number(value) || 0)));",
    to: "  const v = Math.max(1, Math.min(99, Math.trunc(Number(value) || 0)));",
    breaks: "G8 — a shifted critical of 100 silently becomes 99"
  },
  {
    file: ATTACK,
    name: "the critical-shift path takes its digits apart by hand again",
    from: "    : { value: forced, ...percentileDigits(forced), drawn: null, swapped: false };",
    to: "    : { value: forced, unit: forced % 10, tens: Math.floor(forced / 10), drawn: null, swapped: false };",
    breaks: "G11/H1 — a second copy of the rule, which is how the first one went wrong"
  },
  {
    // ONE OWNER. The Spell Fumble table restates the rule instead of
    // reading it — the state the tree was in until 3.420.0.
    file: CAST,
    name: "the Spell Fumble roll keeps its own copy of the zero rule",
    from: "    draw: async () => percentileValue(await draw(10), await draw(10)),\n    profile: CHAIN_PROFILES.d100,\n    openEnded: OPEN_ENDED.TOP\n  });\n\n  const noFocus",
    to: "    draw: async () => {\n      const t = (await draw(10)) % 10;\n      const u = (await draw(10)) % 10;\n      const v = t * 10 + u;\n      return v === 0 ? 100 : v;\n    },\n    profile: CHAIN_PROFILES.d100,\n    openEnded: OPEN_ENDED.TOP\n  });\n\n  const noFocus",
    breaks: "H1/H2 — two copies of a rule agree until one of them is edited"
  },
  {
    file: CARD,
    name: "the card stops showing the reordering",
    from: "          {{#if percentile.swapped}}",
    to: "          {{#if percentile.neverSet}}",
    breaks: "F5 — a player sees a number they cannot account for"
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

const guard = guardFiles([ENGINE, ATTACK, CARD, CAST, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-percentile-bias: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-percentile-bias: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-percentile-bias: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
