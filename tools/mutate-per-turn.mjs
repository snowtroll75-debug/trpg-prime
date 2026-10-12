#!/usr/bin/env node
/**
 * mutate-per-turn — can verify-per-turn fail?
 * NEW at 3.461.0.
 *
 * N2 IS THE ONE THAT PROTECTS LUMINANCE. `on` defaults to `self` so the
 * only row that existed before this release keeps the behaviour it has
 * had since August. A mutation that flipped the default would silently
 * move Luminance's healing to the caster's turn.
 *
 * R3/R4 ARE THE REACH. The caster path must be taken for a caster row and
 * the Luminance path must not be — a row falling through to
 * `luminanceTurnEffect` would inherit growing dice and an undead
 * inversion it never asked for.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "per-turn.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "luminance-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-per-turn.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT, 3.461.0 to 3.463.0: the members come back as
    // ids and the loop reads `.id` off them, so every creature is
    // silently skipped and the aura heals nobody.
    file: W,
    name: "M4 THE SHIPPED DEFECT: members are read as objects, not ids",
    from: "canvas.tokens.placeables.find((t) => t.id === memberId)",
    to: "canvas.tokens.placeables.find((t) => t.id === memberId.id)",
    breaks: "M4 — `.id` on an id string is undefined and skips every member"
  },

  {
    file: P,
    name: "N1 THE DEFAULT FLIPS: an undeclared row fires on the caster's turn",
    from: '  const on = text(raw.on).toLowerCase() || "self";',
    to: '  const on = text(raw.on).toLowerCase() || "caster";',
    breaks: "N2/A7 — Luminance's healing would silently move"
  },
  {
    file: P,
    name: "N2 an unknown trigger is accepted",
    from: "  if (!PER_TURN_TRIGGERS.includes(on)) return null;",
    to: "  ;",
    breaks: "N4 — a typo would become a trigger nothing fires on"
  },
  {
    file: P,
    name: "N3 a damage row needs no type",
    from: '  if (mode === "damage" && !damageType) return null;',
    to: "  ;",
    breaks: "N8 — an empty type means something else in this system"
  },
  {
    file: P,
    name: "N4 any mode is accepted",
    from: '  if (mode !== "heal" && mode !== "damage") return null;',
    to: "  ;",
    breaks: "N7 — a row could declare a mode nothing implements"
  },
  {
    file: P,
    name: "T1 a caster row fires for any member",
    from: '  if (spec.on === "caster") return isCaster;',
    to: "  ;",
    breaks: "T3 — every ally would open the round for the whole circle"
  },
  {
    file: P,
    name: "T2 every row reaches the whole circle",
    from: '  return spec?.on === "caster" ? "all" : "one";',
    to: '  return "all";',
    breaks: "T5 — Luminance would heal everybody on one creature's turn"
  },
  {
    file: P,
    name: "C1 a creature at full health is said to be healed",
    from: "    ? `healed <strong>${healed}</strong> HP (${formula} rolled ${rolled}).`",
    to: "    ? `healed <strong>${rolled}</strong> HP (${formula} rolled ${rolled}).`",
    breaks: "C1 — the card would print the roll rather than what landed"
  },
  {
    file: W,
    name: "R1 the caster path is never taken",
    from: '    if (general && perTurnReaches(general) === "all") {',
    to: "    if (false) {",
    breaks: "R3 — Aura Of Vitality would fall through to Luminance's own rule"
  },
  {
    file: W,
    name: "R2 the caster applier ignores whose turn it is",
    from: "  if (!perTurnFires(spec, { isCaster })) return lines;",
    to: "  ;",
    breaks: "R5 — the circle would heal on everybody's turn"
  },
  {
    file: W,
    name: "R3 one roll is shared across the circle",
    from: "  for (const memberId of inside) {\n    const memberToken = canvas.tokens.placeables.find((t) => t.id === memberId);",
    to: "  const sharedRoll = await new Roll(spec.formula).evaluate();\n  for (const memberId of inside) {\n    const memberToken = canvas.tokens.placeables.find((t) => t.id === memberId);",
    breaks: "R7 — every ally would be healed the same number"
  },
  {
    file: W,
    name: "R4 the healing is printed but never written",
    from: '    if (healed > 0) await target.update({ "system.resources.hp.value": beforeHP + healed });',
    to: "    ;",
    breaks: "R8 — a card reporting healing nobody received"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, W, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-per-turn: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-per-turn: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-per-turn: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
