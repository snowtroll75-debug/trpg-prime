#!/usr/bin/env node
/**
 * mutate-improved-reposition — can verify-improved-reposition fail?
 *
 * NEW at 3.381.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE ONES WORTH READING are the two that would never be reported by a
 * player. Letting the avoidance survive its move, or leak onto a Stride,
 * both make the feat quietly better — and nobody at a table complains
 * that their reactions stopped provoking.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const REPO = path.join(SYSTEM_ROOT, "module", "combat", "improved-reposition.mjs");
const RULES = path.join(SYSTEM_ROOT, "module", "combat", "opportunity-rules.mjs");
const MOVEW = path.join(SYSTEM_ROOT, "module", "combat", "movement-workflow.mjs");
const WORK = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");

const MUTATIONS = [
  {
    name: "THE ONE-SHOT SURVIVES ITS MOVE",
    file: MOVEW,
    from: "      actor?.unsetFlag?.(SYSTEM_ID, \"repositionReactionsAvoided\")?.catch?.(() => {});",
    to: "      void actor;",
    breaks: "E5 — one save would buy silence for the rest of the fight"
  },
  {
    name: "THE AVOIDANCE LEAKS ONTO EVERY MOVE",
    file: MOVEW,
    from: "    const avoided = armedKey === \"reposition\"\n      && Boolean(actor?.getFlag?.(SYSTEM_ID, \"repositionReactionsAvoided\"));",
    to: "    const avoided = Boolean(actor?.getFlag?.(SYSTEM_ID, \"repositionReactionsAvoided\"));",
    breaks: "E4 — an avoidance bought for a Reposition would pay for a Stride"
  },
  {
    name: "the move stops reading the flag at all",
    file: MOVEW,
    // THE CALL GAINED `moverImmune` AT 3.548.0 and wrapped onto two
    // lines. The mutation is the same one: drop `avoided` and watch the
    // save roll and change nothing.
    from: "      armedKey, config?.provokesReactions, avoided, moverImmune);",
    to: "      armedKey, config?.provokesReactions, false, moverImmune);",
    breaks: "E6 — the save would roll and change nothing"
  },
  {
    name: "the avoidance INVENTS a provoke where there was none",
    file: RULES,
    from: "  if (avoided) return false;",
    to: "  if (avoided) return !armedConfigProvokes;",
    breaks: "C6 — avoiding on a Step would start it provoking"
  },
  {
    name: "avoided is ignored by the provoke rule",
    file: RULES,
    from: "  if (avoided) return false;",
    to: "  void avoided;",
    breaks: "C2 — the whole clause would be inert"
  },
  {
    name: "the flag is set whether or not the save was made",
    file: WORK,
    from: "      if (avoided) await actor.setFlag(SYSTEM_ID, \"repositionReactionsAvoided\", true);",
    to: "      await actor.setFlag(SYSTEM_ID, \"repositionReactionsAvoided\", true);",
    breaks: "E2 — a failed save would still avoid the reactions"
  },
  {
    name: "A PARTIAL COUNTS AS MAKING THE SAVE",
    file: REPO,
    from: "  return [\"success\", \"critical\", \"heroic\"].includes(String(degree ?? \"\").trim().toLowerCase());",
    to: "  return [\"success\", \"critical\", \"heroic\", \"partial\"].includes(String(degree ?? \"\").trim().toLowerCase());",
    breaks: "B4 — there is no half of 'avoid reactions' to give"
  },
  {
    name: "a fumble counts as making the save",
    file: REPO,
    from: "  return [\"success\", \"critical\", \"heroic\"].includes",
    to: "  return [\"success\", \"critical\", \"heroic\", \"fumble\"].includes",
    breaks: "B6 — the worst roll would be the best outcome"
  },
  {
    name: "a negative level lowers the DC below the ladder",
    file: REPO,
    from: "  return levelDC(Math.max(0, Math.floor(Number(targetLevel) || 0)));",
    to: "  return levelDC(Math.floor(Number(targetLevel) || 0));",
    breaks: "A4 — a DC below the ladder's own floor"
  },
  {
    name: "the DC stops using the level ladder",
    file: REPO,
    from: "import { levelDC } from \"../dice/resolution.mjs\";",
    to: "const levelDC = (n) => Number(n) + 15;",
    breaks: "A1 — a second level ladder, drifting from the real one"
  },
  {
    name: "a failed save says nothing",
    file: REPO,
    from: "    : `<em>Improved Reposition: the save fails — repositioning with <strong>${targetName}</strong> provokes as usual.</em>`;",
    to: "    : \"\";",
    breaks: "E8 — silence reads as the feat not having fired"
  },
  {
    name: "the hint stops explaining the free-hand clause",
    file: WORK,
    from: "(The free-hand clause needs no automation — this system does not enforce a free hand for Reposition.)",
    to: "",
    breaks: "D2 — the player is left wondering which half of the feat they got"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-improved-reposition.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([REPO, RULES, MOVEW, WORK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-improved-reposition: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-improved-reposition: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-improved-reposition: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
