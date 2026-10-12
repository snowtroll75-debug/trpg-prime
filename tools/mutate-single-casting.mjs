#!/usr/bin/env node
/**
 * mutate-single-casting — can verify-single-casting fail?
 *
 * NEW at 3.512.0.
 *
 * S1 IS THE ONE THIS RELEASE EXISTS FOR, and it is the mutation that turns
 * the rule from a declaration back into a heuristic. With the gate dropped,
 * ANY spell whose name matches a running entry ends it — including Fatigue,
 * which prints "multiple uses of this spell stack" in its own text. Nobody
 * would report that as a bug. They would report that Fatigue felt weak.
 *
 * E1 IS THE QUIET ONE. The entry stops carrying the reason it is on the
 * list, the panel reads `undefined`, and four spells that are not
 * dismissible are announced as "Dismissible" — the exact shape of the
 * banner defect found live at 3.508.0, where the rule was right, the
 * plumbing was right, and the field the display reads was never set.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SC = path.join(SYSTEM_ROOT, "module", "magic", "single-casting.mjs");
const AS = path.join(SYSTEM_ROOT, "module", "magic", "active-spells.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-single-casting.mjs");

const MUTATIONS = [
  /* ── D: the declaration ────────────────────────────────────────── */
  {
    file: SC,
    name: "D1 THE FIELD STOPS BEING READ STRICTLY — every spell declares the rule",
    from: "  return spellData?.singleCasting === true;",
    to: "  return spellData?.singleCasting !== false;",
    breaks: "D2/D4/S3 — every recast in the game would cancel its predecessor"
  },
  {
    file: SC,
    name: "D2 an authored typo is accepted as a declaration",
    from: "  return spellData?.singleCasting === true;",
    to: "  return Boolean(spellData?.singleCasting);",
    breaks: "D3 — `singleCasting: \"true\"` would silently cancel a running spell"
  },

  /* ── S: which entries go ───────────────────────────────────────── */
  {
    file: SC,
    name: "S1 THE DECLARATION GATE IS DROPPED — Fatigue stops stacking",
    from: "  if (!declaresSingleCasting(spellData)) return [];",
    to: "  if (false) return [];",
    breaks: "S3 — a second Fatigue would cancel the first instead of adding a level"
  },
  {
    file: SC,
    name: "S2 THE NAME MATCH GOES — a recast ends every spell the caster has running",
    from: "    .filter((entry) => String(entry?.name ?? \"\").trim().toLowerCase() === name);",
    to: "    .filter(Boolean);",
    breaks: "S2 — casting Breeze would end somebody's Bless"
  },
  {
    file: SC,
    name: "S3 case and padding start mattering",
    from: "    .filter((entry) => String(entry?.name ?? \"\").trim().toLowerCase() === name);",
    to: "    .filter((entry) => String(entry?.name ?? \"\") === name);",
    breaks: "S4 — a stored \" Breeze \" would not be the Breeze being cast"
  },
  {
    file: SC,
    name: "S4 the nameless guard goes",
    from: "  if (!name) return [];",
    to: "  if (false) return [];",
    breaks: "S5c — a nameless spell would end every nameless entry on the list"
  },

  /* ── L: the card line ──────────────────────────────────────────── */
  {
    file: SC,
    name: "L1 A FIRST CASTING IS TOLD SOMETHING ENDED",
    from: "  if (n < 1) return null;",
    to: "  if (n < 0) return null;",
    breaks: "L1 — a line on every cast is a line the caster learns to ignore"
  },
  {
    file: SC,
    name: "L2 one casting is announced in the plural",
    from: "  const earlier = n === 1 ? \"casting\" : \"castings\";",
    to: "  const earlier = \"castings\";",
    breaks: "L2 — \"your earlier castings of Breeze\" over one spell"
  },
  {
    file: SC,
    name: "L3 the verb stops agreeing with it",
    from: "  return `<em>Your earlier ${earlier} of ${spellName} ${n === 1 ? \"ends\" : \"end\"}`",
    to: "  return `<em>Your earlier ${earlier} of ${spellName} ${\"end\"}`",
    breaks: "L2 — \"your earlier casting of Breeze end\""
  },

  /* ── A: the panel ──────────────────────────────────────────────── */
  {
    file: AS,
    name: "A1 THE FIFTH WORD IS LOST — four spells are called Dismissible again",
    from: "  if (entry?.singleCasting) return \"One at a time\";",
    to: "  ;",
    breaks: "A1 — Breeze, Veiled Secret, Contingency and Pass Without Trace print (D) they do not have"
  },
  {
    file: AS,
    name: "A2 the new word displaces an ordinary (D) spell's",
    from: "  if (entry?.singleCasting) return \"One at a time\";\n  return \"Dismissible\";",
    to: "  return \"One at a time\";",
    breaks: "A5 — 56 (D) spells would change what their row says"
  },

  /* ── E: the entry ──────────────────────────────────────────────── */
  {
    file: AS,
    name: "E1 THE ENTRY STOPS REMEMBERING WHY IT IS ON THE LIST",
    from: "    singleCasting: Boolean(singleCasting),",
    to: "    singleCasting: false,",
    breaks: "E1/E1b/E3 — the rule would be right and the panel would still be wrong"
  },
  {
    file: AS,
    name: "E2 every registration is marked one-at-a-time",
    from: "    singleCasting: Boolean(singleCasting),",
    to: "    singleCasting: true,",
    breaks: "E2 — Shield would end the Shield somebody else is holding"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([SC, AS, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-single-casting: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-single-casting: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-single-casting: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
