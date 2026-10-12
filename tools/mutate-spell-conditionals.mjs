#!/usr/bin/env node
/**
 * mutate-spell-conditionals — can verify-spell-conditionals fail?
 *
 * NEW at 3.497.0.
 *
 * V3 IS THE ONE THIS FILE EXISTS FOR. `conditionals.mjs` returns null
 * for a malformed entry rather than throwing — right for a race read at
 * every roll, and exactly wrong at cast time, where it would apply an
 * effect that grants nothing and say the spell took effect. If the
 * authoring path stops running the collector's own validator, nothing
 * downstream complains and the spell quietly does nothing.
 *
 * S1 IS THE SHIPPED SCOPE. "Search (Perception) checks" is an ACTION,
 * not the whole Perception skill; widening it hands advantage to every
 * Perception roll the character makes for ten minutes.
 *
 * S3b IS THE MIRROR: a Courage that covered every save would be a 6 PP
 * spell doing what no 6 PP spell does.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "spell-conditional.mjs");
const SE = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const WARP = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const COND = path.join(SYSTEM_ROOT, "module", "conditionals.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-spell-conditionals.mjs");

const MUTATIONS = [
  /* ── V: one validator, both ends ───────────────────────────────── */
  {
    file: P,
    name: "V1 THE VALIDATOR BECOMES OPTIONAL: unusable grants ship as effects",
    from: "  if (typeof validate !== \"function\") return null;",
    to: "  if (typeof validate !== \"function\") validate = (g) => g;",
    breaks: "V3 — a spell would apply an effect granting nothing, silently"
  },
  {
    file: P,
    name: "V2 the grants are taken unvalidated",
    // RE-ANCHORED AT 3.505.0: the row passes through `withBonusType`
    // first, so a spell may spell its bonus type the way every other
    // spell effect row spells it.
    from: "  const grants = (Array.isArray(raw.grants) ? raw.grants : [])\n    .map((g, i) => validate(withBonusType(g), source, i))\n    .filter(Boolean);",
    to: "  const grants = Array.isArray(raw.grants) ? raw.grants : [];",
    breaks: "V4 — an unscoped entry would be offered on every roll, or dropped at the far end"
  },
  {
    file: P,
    name: "V3 a row granting nothing is applied anyway",
    from: "  if (!grants.length && !warpGrants.length && !raw.traditions) return null;",
    to: "",
    breaks: "V5 — an empty effect is what the note already was"
  },
  {
    file: P,
    name: "V4 the kind stops being checked, so any row becomes a conditional",
    from: "  if (raw.kind !== undefined && text(raw.kind) !== \"conditional\") return null;",
    to: "  if (false) return null;",
    breaks: "V2 — a note row would grant advantage"
  },

  /* ── W: the warps ──────────────────────────────────────────────── */
  {
    file: P,
    name: "W1 THE TRACK WARP BUYS NOTHING AGAIN",
    from: "  return [...spec.grants, ...spec.warpGrants.slice(0, extra)];",
    to: "  return [...spec.grants];",
    breaks: "W1b — the inert-warp shape this release removes"
  },
  {
    file: P,
    name: "W2 every alternate is unlocked whatever was paid",
    from: "  return [...spec.grants, ...spec.warpGrants.slice(0, extra)];",
    to: "  return [...spec.grants, ...spec.warpGrants];",
    breaks: "W1 — an unwarped casting would get the warp for free"
  },
  {
    file: P,
    name: "W3 buying the warp twice buys a third alternate",
    from: "  const extra = Math.max(0, int(warpMods?.extraConditionals));",
    to: "  const extra = 99;",
    breaks: "W1 — the list is what is on offer, not a multiplier"
  },
  {
    file: P,
    name: "W4 the second tradition is never bought",
    from: "  return spec.traditions + Math.max(0, int(warpMods?.extraTraditions));",
    to: "  return spec.traditions;",
    breaks: "W3b — the 2 PP warp would buy nothing"
  },
  {
    file: P,
    name: "W5 a spell that names no tradition is prompted anyway",
    from: "  if (!spec?.traditions) return 0;",
    to: "",
    breaks: "W4 — Spirit Of The Hunt would ask which realm it wards"
  },
  {
    file: WARP,
    name: "W6 the warp keys are dropped from the aggregate",
    from: "    extraConditionals: 0,\n    extraTraditions: 0",
    to: "    extraConditionalsUnused: 0",
    breaks: "W5 — an undeclared mod is dropped between the chooser and the cast"
  },

  /* ── T: the chosen tradition ───────────────────────────────────── */
  {
    file: P,
    name: "T1 THE WARD COVERS EVERY TRADITION, not the one named",
    from: "    when: { ...(base.when ?? {}), checkTypes: [\"save\"], traditions: [named] },",
    to: "    when: { ...(base.when ?? {}), checkTypes: [\"save\"] },",
    breaks: "T1b — warding against one realm would ward against all four"
  },
  {
    file: P,
    name: "T2 and every roll, not only saves",
    from: "    when: { ...(base.when ?? {}), checkTypes: [\"save\"], traditions: [named] },",
    to: "    when: { ...(base.when ?? {}), traditions: [named] },",
    breaks: "T1c — \"all saving throws against the specified realm\""
  },
  {
    file: P,
    name: "T3 an unknown tradition is accepted",
    from: "  if (!TRADITIONS.includes(named)) return null;",
    to: "",
    breaks: "T2 — a typo would become a ward against nothing"
  },
  {
    file: P,
    name: "T4 the four are no longer the printed four",
    from: "const TRADITIONS = Object.freeze([\"arcane\", \"divinity\", \"ethereal\", \"verdant\"]);",
    to: "const TRADITIONS = Object.freeze([\"arcane\", \"divine\", \"ethereal\", \"verdant\"]);",
    breaks: "T2b — the tradition axis is matched by name"
  },

  /* ── S: the scopes, in the shipped data ────────────────────────── */
  /*
   * THE FIRST TWO WRITTEN HERE MUTATED `AXIS_CONTEXT_KEYS` and both
   * SURVIVED — because `matchesCheck` reads `context.actionKey` and its
   * neighbours directly and never consults that map. The mutations were
   * inert, which is a fact about the shared module rather than a hole in
   * this file. These replace them, on the lines these scopes actually
   * rest on.
   */
  {
    file: COND,
    name: "S1 THE ACTION AXIS STOPS NARROWING ANYTHING",
    from: "  if (actions && !actions.includes(actionKey)) return false;",
    to: "",
    breaks: "S1 — Search would cover every Perception roll for ten minutes"
  },
  {
    file: COND,
    name: "S2 the traits axis stops narrowing anything",
    from: "  if (wanted && !wanted.some((t) => traits.includes(t))) return false;",
    to: "",
    breaks: "S3b — a 6 PP Courage would cover every save the target ever makes"
  },
  {
    file: COND,
    name: "S3 the subject axis stops narrowing anything",
    from: "  if (subjects && !subjects.includes(subject)) return false;",
    to: "",
    breaks: "S4b — Flawless Lies would cover every skill"
  },

  /* ── E: the effect reaches the collector ───────────────────────── */
  {
    file: SE,
    name: "E1 the effect kind stops being handled",
    from: '        case "conditional": {',
    to: '        case "conditionalDisabled": {',
    breaks: "E3 — the spell falls through to the unhandled-kind branch"
  },
  {
    file: SE,
    name: "E2 THE ENTRIES ARE NEVER WRITTEN ONTO THE EFFECT",
    from: "          const cFlags = { [SYSTEM_ID]: { spellBuff: true, conditionals: granted } };",
    to: "          const cFlags = { [SYSTEM_ID]: { spellBuff: true } };",
    breaks: "E3c — the effect would carry no advantage at all"
  },
  {
    file: SE,
    // RE-ANCHORED AT 3.504.0. The call site moved up to `warpedGrants`,
    // which folds the same `warpMods` in and additionally raises a
    // modifier grant's number. The old anchor read
    // `grantsFor(spec, warpMods)` and went ANCHOR MISSING — a mutation
    // that no longer fires is a check nobody is testing, which is what
    // the 3.502.0 re-anchoring pass exists to stop.
    name: "E3 the warps stop being folded in",
    from: "          const granted = warpedGrants(spec, warpMods, warpedBonusValue);",
    to: "          const granted = warpedGrants(spec, {}, warpedBonusValue);",
    breaks: "E4 — the Track warp would buy nothing"
  },
  {
    file: SE,
    name: "E4 a casting that warded nothing applies silently",
    from: "          if (!granted.length) {",
    to: "          if (false) {",
    breaks: "E5 — an effect granting nothing, reported as a spell that worked"
  },
  {
    file: SE,
    name: "E5 the row is validated by something other than the collector",
    from: "          const spec = normaliseSpellConditional(effect, normaliseConditional);",
    to: "          const spec = normaliseSpellConditional(effect, (g) => g);",
    breaks: "V3/E3b — two validators, free to disagree"
  },

  /* ── R: the card ───────────────────────────────────────────────── */
  {
    file: P,
    // RE-ANCHORED AT 3.505.0. `conditionalLine` derives its verb from the
    // grant now — it called a +4 an advantage on seven cards until a live
    // test read one. The scope is collected from the filtered rows.
    name: "R1 the card stops naming what the advantage covers",
    from: "  const rows = Array.isArray(grants) ? grants.filter((g) => g?.scope) : [];",
    to: "  const rows = [];",
    breaks: "R1 — advantage on something unnamed"
  },
  {
    file: P,
    name: "R2 a tradition paid for and unnamed is not reported",
    from: "  if (chosen >= wanted) return null;",
    to: "  return null; // eslint-disable-line",
    breaks: "R3 — a caster who bought a second ward and named one has no other way to know"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, SE, WARP, COND, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spell-conditionals: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-spell-conditionals: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-spell-conditionals: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
