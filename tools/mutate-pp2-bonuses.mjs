#!/usr/bin/env node
/**
 * mutate-pp2-bonuses — can verify-pp2-bonuses fail?
 *
 * NEW at 3.504.0.
 *
 * W2 IS THE DEFECT THIS RELEASE NEARLY SHIPPED. Without `warpedGrants`,
 * five already-live "+1 to the bonus" warps go inert the moment their
 * spells become conditionals — the 3.499.1 phantom-key defect from the
 * other direction, in the release whose whole point is making spells do
 * what they print.
 *
 * S4 IS THE RULING WITH TEETH. A scope that widened to the whole skill
 * would give a Jump caster +4 to Climb, Force Open and Swim, and nobody
 * would notice for months because the number would look plausible.
 *
 * S7 IS THE SILENT ONE. A mistyped action key is a bonus that never
 * fires, and the only thing that would ever say so is this check.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const COND = path.join(SYSTEM_ROOT, "module", "magic", "spell-conditional.mjs");
const KEYS = path.join(SYSTEM_ROOT, "tools", "lib", "skill-action-keys.mjs");
const CONDITIONALS = path.join(SYSTEM_ROOT, "module", "conditionals.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-pp2-bonuses.mjs");

const MUTATIONS = [
  /* ── W: the warp ───────────────────────────────────────────────── */
  {
    file: COND,
    name: "W1 THE WARP STOPS REACHING A CONDITIONAL — five live warps go inert",
    from: "  if (!added || typeof warpValue !== \"function\") return granted;",
    to: "  return granted;",
    breaks: "W2 — Jump's +1 PP would buy nothing, as it would have before this release"
  },
  {
    file: COND,
    name: "W2 the cap is ignored",
    from: "    : { ...g, value: warpValue(Number(g.value) || 0, added, warpMods?.bonusMax ?? null) }));",
    to: "    : { ...g, value: (Number(g.value) || 0) + added }));",
    breaks: "W3 — \"max +50\" is printed and would stop being enforced"
  },
  {
    file: COND,
    name: "W3 AN ADVANTAGE GRANT GROWS A MEANINGLESS NUMBER",
    from: "  return granted.map((g) => (String(g?.kind) !== \"modifier\"",
    to: "  return granted.map((g) => (false",
    breaks: "W5 — a `value` on an advantage is a number nothing reads"
  },
  {
    file: COND,
    name: "W4 a negative mod shrinks the bonus",
    from: "  const added = Math.max(0, int(warpMods?.bonusValue));",
    to: "  const added = int(warpMods?.bonusValue);",
    breaks: "W4b — a nonsense mod would sell the caster a smaller spell"
  },

  /* ── C: the three the live test found ──────────────────────────── */
  {
    file: COND,
    name: "C1 THE CARD CALLS A +4 AN ADVANTAGE AGAIN",
    // Re-anchored 3.609.1: advantage and disadvantage are now said apart (F6).
    from: "  if (ahead.length) clauses.push(`advantage on ${ahead.map((g) => g.scope).join(\"; \")}`);",
    to: "  return `<strong>${targetName}</strong>: advantage on ${rows.map((g) => g.scope).join(\"; \")}.`;",
    breaks: "C1 — the sentence this release shipped on seven cards, telling the table the wrong rule"
  },
  {
    file: COND,
    name: "C1b the number and bonus type are dropped from the sentence",
    from: "    clauses.push(`${n >= 0 ? \"+\" : \"\"}${n}${type} to ${g.scope}`);",
    to: "    clauses.push(`a bonus to ${g.scope}`);",
    breaks: "C1b — \"+4 status\" is the part a player needs and the part that was missing"
  },
  {
    // THE SAME DEFECT, ONE LINE LOWER. C1 fixed the grant sentence at
    // 3.505.0 and this line, printed directly beneath it on every card,
    // still read "The advantage is offered on the rolls it covers" —
    // found live the moment the fixed card was read.
    file: COND,
    name: "C1e THE REMAINDER LINE CALLS IT AN ADVANTAGE AGAIN",
    from: "  return \"<em>This is offered on the rolls it covers, ticked in advance where the \"",
    to: "  return \"<em>The advantage is offered on the rolls it covers, ticked in advance where the \"",
    breaks: "C1e — the sentence under the one this release fixed"
  },
  {
    file: COND,
    name: "C2 THE `bonusType` ALIAS IS DROPPED — five status bonuses become circumstance",
    from: "  if (grant.type !== undefined || grant.bonusType === undefined) return grant;",
    to: "  return grant;",
    breaks: "C2 — silent, and wrong only in how the bonus stacks"
  },

  /* ── S: the scope ──────────────────────────────────────────────── */
  {
    file: CONDITIONALS,
    name: "S1 THE ACTION AXIS STOPS NARROWING ANYTHING",
    from: "  actions: \"actionKey\",",
    to: "  actionsUnused: \"actionKey\",",
    breaks: "S6 — the axis these twelve spells are scoped along"
  },
  {
    file: KEYS,
    name: "S2 THE ACTION-KEY READER FINDS NOTHING",
    from: "[...SOURCE.matchAll(/key:\\s*\"([A-Za-z0-9]+)\"/g)].map((m) => m[1])",
    to: "[]",
    breaks: "S8 — an empty list makes every scoped action pass for the wrong reason"
  },
  {
    file: KEYS,
    name: "S3 the reader stops deduplicating and sorting",
    from: "  [...new Set([...SOURCE.matchAll(/key:\\s*\"([A-Za-z0-9]+)\"/g)].map((m) => m[1]))].sort());",
    to: "  [\"highJump\"]);",
    breaks: "S7/S8 — every other scoped key would report as a typo"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([COND, KEYS, CONDITIONALS, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-pp2-bonuses: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-pp2-bonuses: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-pp2-bonuses: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
