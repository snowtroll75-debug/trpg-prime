#!/usr/bin/env node
/**
 * mutate-save-net — can verify-save-net fail?
 *
 * NEW at 3.488.0.
 *
 * W1 IS THE SHIPPED DEFECT: the net declared and never read, which is
 * this project's most-repeated failure — `flatDegree` imported, exported,
 * tested and uncalled for weeks; the Shatter formula; the hazard
 * recording. Every one of them existed and did nothing.
 *
 * F1–F3 ARE THE DANGEROUS ONES. A wider net that skips disposition, line
 * of effect or the kind gate is a worse spell than one that reaches
 * nobody: it charms the party, reaches through walls, or stuns the living
 * with Turn Undead. Widening a reach must never become a way around the
 * three filters that decide who a spell may legally touch.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const N = path.join(SYSTEM_ROOT, "module", "magic", "save-net.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-save-net.mjs");

const MUTATIONS = [
  /* ── N: the rule ───────────────────────────────────────────────── */
  {
    file: N,
    name: "N1 the narrowest declared net wins instead of the widest",
    from: "    if (widest === null || feet > widest) widest = feet;",
    to: "    if (widest === null || feet < widest) widest = feet;",
    breaks: "N3 — the net decides who is ASKED to save, so the narrowest drops a "
      + "creature from every effect at once"
  },
  {
    file: N,
    name: "N2 a net of zero is honoured",
    from: "    if (feet <= 0) continue;",
    to: "    if (feet < 0) continue;",
    breaks: "N4 — a zero net catches nobody, which is worse than the template"
  },
  {
    file: N,
    name: "N3 the card line stops naming the distance",
    from: "  return `<em>${spellName} tests every creature within ${int(netFeet)} ft of the area${drawn}.</em>`;",
    to: "  return `<em>${spellName} tests creatures around the area${drawn}.</em>`;",
    breaks: "N5 — the number is the whole point of saying it"
  },
  {
    file: N,
    name: "N4 the card stops naming the drawn shape",
    from: "  const drawn = area ? ` &mdash; the ${area} is the illusion itself` : \"\";",
    to: "  const drawn = \"\";",
    breaks: "N5 — the reader is looking at a 5-foot circle and 4 saves"
  },

  /* ── W: is it reached ──────────────────────────────────────────── */
  {
    file: W,
    name: "W1 THE SHIPPED DEFECT: the net is declared and never read",
    from: "        const netFeet = declaredSaveNetFeet(spellData);",
    to: "        const netFeet = null;",
    breaks: "W1/W4 — imported and never called, for the fourth time in this project"
  },
  {
    file: W,
    name: "W2 the branch is inverted, so the template is used when a net exists",
    from: "        const reached = netFeet === null",
    to: "        const reached = netFeet !== null",
    breaks: "W2 — Fools Riches would test the one square it says is immune"
  },
  {
    file: W,
    name: "W3 the wide branch measures from the wrong place",
    from: "feetFromPointToToken(origin, tok) <= netFeet",
    to: "feetFromPointToToken(tok.center, tok) <= netFeet",
    breaks: "W2b — measured from each token to itself, every creature is at 0 ft"
  },

  /* ── F: THE FILTERS. The dangerous ones. ───────────────────────── */
  {
    file: W,
    name: "F1 the wider net skips the disposition filter",
    // RE-ANCHORED 2 Oct 2026 (3.611.1): the caster-sparing filter comes first.
    from: "          .filter((tok) => !(sparesCaster && casterToken && tok === casterToken))\n          .filter((tok) => keepByDisposition(tok.document?.disposition ?? tok.disposition, casterDisp, mode));",
    to: "          .filter((tok) => !(sparesCaster && casterToken && tok === casterToken));",
    breaks: "W3 — an allies-only spell becomes an everyone spell at 20 ft"
  },
  {
    file: W,
    name: "F2 the wider net skips line of effect",
    from: "        const blocked = breach ? [] : disp.filter((tok) => lineOfEffectBlocked(origin, tok.center));",
    to: "        const blocked = [];",
    breaks: "W3b — 20 feet through a wall is still through a wall"
  },
  {
    file: W,
    name: "F3 the wider net skips the kind gate",
    from: "        const kindFiltered = filterAreaByKind(actor, spellData, caught);",
    to: "        const kindFiltered = { kept: caught, skipped: [], widened: [] };",
    breaks: "W3c — Turn Undead widened to 20 ft would stun the party"
  },

  /* ── C: the card ───────────────────────────────────────────────── */
  {
    file: W,
    name: "C1 the wider net stops naming itself on the card",
    from: "        if (netFeet !== null) {\n          lines.push(line(saveNetLine(spell.name, netFeet, describeArea(areaConfig))));\n        }",
    to: "",
    breaks: "W5 — a five-foot circle catching four creatures looks exactly like a bug"
  },
  {
    file: W,
    name: "C2 or names itself on every card",
    from: "        if (netFeet !== null) {",
    to: "        if (true) {",
    breaks: "W5 — every other spell's card would gain a line about a net it has not got"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([N, W, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-save-net: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-save-net: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-save-net: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
