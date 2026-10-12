#!/usr/bin/env node
/**
 * mutate-casting-feats — can verify-casting-feats actually fail?
 *
 * NEW at 3.382.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE TWO WORTH READING are the ones that would cost a player something
 * real and never be reported as a bug:
 *
 *   - Altered Cantrip deleting the outgoing cantrip BEFORE creating the
 *     incoming one. Any failure in between and the character is simply
 *     down a cantrip, which looks like they misclicked.
 *   - Spontaneous Scholar spending its allowance at the gate rather than
 *     at the cast, so a cancelled spell burns a day's use.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULES = path.join(SYSTEM_ROOT, "module", "magic", "casting-feats.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const USES = path.join(SYSTEM_ROOT, "module", "uses-workflow.mjs");
const WORK = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");

const MUTATIONS = [
  /* ---- Spontaneous Scholar ---- */
  {
    name: "the allowance becomes the MODIFIER instead of the score",
    file: RULES,
    from: "  const score = Math.floor(Number(intelligenceScore) || 0);",
    to: "  const score = Math.floor((Number(intelligenceScore) - 10) / 2);",
    breaks: "A2/A3/A4 — the reading the sentence does not support"
  },
  {
    // THE 3.382.1 BUG. `.base` is the points allocated at creation;
    // `.total` is the score the character actually has. Reading base
    // silently denied a racial or item Intelligence bonus to every holder
    // — found by building a caster live, not by any amount of arithmetic.
    name: "THE SHIPPED BUG: the raw allocation is read instead of the score",
    file: CAST,
    from: "      intelligenceScore: actor.system?.attributes?.intelligence?.total,",
    to: "      intelligenceScore: actor.system?.attributes?.intelligence?.base,",
    breaks: "G2b — a racial Intelligence bonus would buy no extra casts"
  },
  {
    name: "the PP cap rounds DOWN instead of up",
    file: RULES,
    from: "  return Math.ceil(level / 2);",
    to: "  return Math.floor(level / 2);",
    breaks: "B1 — every odd caster level would reach one PP less"
  },
  {
    name: "the PP cap becomes the ordinary per-cast ceiling",
    file: RULES,
    // NARROWED AT 3.625.0: the return line is unique on its own now that
    // recovery.mjs's twin grew an `+ extra`, so the carried line bought nothing.
    from: "  return Math.ceil(level / 2);",
    to: "  return level + 1;",
    breaks: "B1/B6 — the tighter cap swallowed by the looser one"
  },
  {
    name: "the cap stops being checked",
    file: RULES,
    from: "  if (pp > cap) {",
    to: "  if (false) {",
    breaks: "B3 — any spell in the library at any cost"
  },
  {
    name: "the daily allowance stops being checked",
    file: RULES,
    from: "  if (remaining <= 0) {",
    to: "  if (false) {",
    breaks: "A6 — unlimited spontaneous casts"
  },
  {
    name: "the feat gate stops being checked",
    file: RULES,
    from: "  if (!ownsSpontaneousScholar(featNames)) {",
    to: "  if (false) {",
    breaks: "C1 — every caster would ignore preparation"
  },
  {
    name: "a non-holder is told about a feat they do not have",
    file: RULES,
    from: "    return { allowed: false, reason: null, remaining: 0, cap };",
    to: "    return { allowed: false, reason: \"you do not have Spontaneous Scholar\", remaining: 0, cap };",
    breaks: "C2 — noise on every unprepared spell, for everybody"
  },
  {
    name: "THE ALLOWANCE IS SPENT AT THE GATE, NOT AT THE CAST",
    file: CAST,
    from: "  if (spontaneousSpent) {\n    const used = Number(actor.getFlag?.(SYSTEM_ID, \"spontaneousScholarUsed\") ?? 0);\n    await actor.setFlag(SYSTEM_ID, \"spontaneousScholarUsed\", used + 1);\n  }",
    to: "  void spontaneousSpent;",
    breaks: "G2/G4 — nothing would ever be spent"
  },
  {
    name: "the waiver moves outside the refusal it lifts",
    file: CAST,
    from: "  if (castBlocked) {",
    to: "  if (true) {",
    breaks: "G1 — the feat would be spent on spells that were castable anyway"
  },
  {
    name: "the per-day counter never resets",
    file: USES,
    from: "    if (Number(actor.getFlag?.(SYSTEM_ID, \"spontaneousScholarUsed\")) || 0) {\n      await actor.unsetFlag(SYSTEM_ID, \"spontaneousScholarUsed\");\n    }",
    to: "    void actor;",
    breaks: "G4 — a feat that works once per campaign"
  },
  {
    name: "the holder's own reason never reaches them",
    file: CAST,
    from: "      ui.notifications.warn(scholar.reason ? `${castBlocked} (${scholar.reason}.)` : castBlocked);",
    to: "      ui.notifications.warn(castBlocked);",
    breaks: "G5 — a holder who has run out is told only 'not prepared'"
  },

  /* ---- Altered Cantrip ---- */
  {
    name: "THE OUTGOING CANTRIP IS DELETED FIRST",
    file: WORK,
    from: "      const [created] = await actor.createEmbeddedDocuments(\"Item\", [data]);\n      if (!created) {\n        ui.notifications.warn(\"Altered Cantrip: the new cantrip could not be created — nothing was changed.\");\n        return;\n      }\n      await outgoing.delete();",
    to: "      await outgoing.delete();\n      const [created] = await actor.createEmbeddedDocuments(\"Item\", [data]);\n      if (!created) {\n        ui.notifications.warn(\"Altered Cantrip: the new cantrip could not be created — nothing was changed.\");\n        return;\n      }",
    breaks: "G8 — any failure would cost the character a cantrip for nothing"
  },
  {
    name: "an off-tradition spell that shares a tradition is offered anyway",
    file: RULES,
    from: "  return !theirs.some((t) => mine.includes(t));",
    to: "  return !theirs.every((t) => mine.includes(t));",
    breaks: "E3 — a spell on your list AND another would count as borrowed"
  },
  {
    name: "the filter accepts a spell with no tradition at all",
    file: RULES,
    from: "  if (!theirs.length) return false;",
    to: "  if (!theirs.length) return true;",
    breaks: "E6 — an unstated tradition is not 'another tradition'"
  },
  {
    name: "a caster with no tradition is offered every cantrip in the game",
    file: RULES,
    from: "  if (!mine.length) return false;",
    to: "  if (!mine.length) return true;",
    breaks: "E7/F4 — a feat about ancestry, granted to somebody with none"
  },
  {
    name: "A CASTER WITH NO CANTRIPS IS GIVEN THEIR FIRST ONE",
    file: RULES,
    from: "  if (ownedCantrips <= 0) {",
    to: "  if (false) {",
    breaks: "F2/F3 — the feat's last sentence forbids adding one"
  },
  {
    name: "an empty candidate list is accepted silently",
    file: RULES,
    from: "  if (candidates <= 0) {",
    to: "  if (false) {",
    breaks: "F5 — a dialog with nothing to pick and no explanation"
  },
  {
    name: "leveled spells are treated as cantrips",
    file: WORK,
    from: "        .filter((i) => i.type === \"spell\" && Number(i.system?.ppCost ?? 0) === 0);",
    to: "        .filter((i) => i.type === \"spell\");",
    breaks: "G10 — a character could give up a real spell for a cantrip"
  },
  {
    name: "the candidate list stops being filtered by tradition",
    file: WORK,
    from: "          && isOffTradition(e.system?.tradition, casterTradition))",
    to: "          && true)",
    breaks: "G11 — the feat's first sentence would mean nothing"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-casting-feats.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RULES, CAST, USES, WORK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-casting-feats: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-casting-feats: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-casting-feats: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
