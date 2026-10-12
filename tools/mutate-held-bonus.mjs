#!/usr/bin/env node
/** mutate-held-bonus — can verify-held-bonus fail? NEW at 3.411.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const HB = path.join(SYSTEM_ROOT, "module", "magic", "held-bonus.mjs");
const FX = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const IX = path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs");
const CK = path.join(SYSTEM_ROOT, "module", "dice", "check.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-held-bonus.mjs");

const MUTATIONS = [
  // ── 3.413.0: three payloads ────────────────────────────────────────
  {
    // THE DEFECT LIVE PLAY FOUND: normalise stops being idempotent, so
    // the spec survives being written to the flag and dies being read
    // back. The spell applies, and then no button appears.
    file: HB,
    name: "THE ROUND TRIP: a normalised spec is no longer readable",
    from: "  const declared = raw.heldKind\n    ?? (HELD_KINDS.includes(String(raw.kind ?? \"\").trim().toLowerCase()) ? raw.kind : null);",
    to: "  const declared = raw.heldKind ?? null;",
    breaks: "F19/F20 — Inspiration applies cleanly and then offers no button at all"
  },
  {
    // AND THE OTHER DIRECTION: accepting `kind` blindly would let the
    // routing word "heldBonus" be read as a payload kind.
    //
    // THIS REPLACES A MUTATION RETIRED AT 3.413.1. That one read the
    // payload from `raw.kind` outright — the collision that would have
    // refused all five shipped entries. Fixing the round-trip defect
    // rewrote the line it anchored to, and this edit is the same defect
    // expressed against the line that exists now, so keeping both would
    // have been one dead anchor and one live check of the same thing.
    file: HB,
    name: "the routing word becomes readable as a payload kind",
    from: "  const declared = raw.heldKind\n    ?? (HELD_KINDS.includes(String(raw.kind ?? \"\").trim().toLowerCase()) ? raw.kind : null);",
    to: "  const declared = raw.heldKind ?? raw.kind ?? null;",
    breaks: "F1/F21 — every shipped held bonus refuses again, from the other side"
  },
  {
    file: HB,
    name: "an unknown payload kind is accepted",
    from: "  if (!HELD_KINDS.includes(kind)) return null;",
    to: "  if (false) return null;",
    breaks: "F4 — a button whose click does nothing"
  },
  {
    file: HB,
    name: "advantage is made to demand a value",
    from: '  if (kind === "modifier") {\n    value = Math.trunc(Number(raw.value));\n    if (!Number.isFinite(value) || value === 0) return null;\n  }',
    to: "  value = Math.trunc(Number(raw.value));\n  if (!Number.isFinite(value) || value === 0) return null;",
    breaks: "F5 — the inference this file exists to refuse"
  },
  {
    file: HB,
    name: "a die formula nobody checked is passed to the roller",
    from: '  if (kind === "die" && !isHeldDie(die)) return null;',
    to: "  ;",
    breaks: "F9/F10 — '1d6+1' either throws at spend time or rolls something else"
  },
  {
    file: HB,
    name: "the button announces +0 for an advantage",
    // RE-ANCHORED 3.612.0: the label says "once this round" for Inspire Heroics.
    from: '  if (spec?.kind === "advantage") return `${label} — roll again, keep the better (free${spec.perRound ? ", once this round" : ""})`;',
    to: "  ;",
    breaks: "F13/F14 — a card describing behaviour it does not have"
  },
  {
    file: HB,
    name: "the cast line announces +0 status for an advantage",
    from: '  if (spec?.kind === "advantage") return `<strong>advantage</strong> on ${scope}`;',
    to: "  ;",
    breaks: "F16 — the Grapple lesson, on the cast card"
  },
  {
    // THE SENTENCE THAT READ WIDER THAN THE SPELL. Found live at 3.505.0
    // on Spirit Lore's card; three spells had printed it since 3.413.0.
    file: HB,
    name: "THE CAST LINE STOPS NAMING WHAT NARROWS THE SCOPE",
    // RE-ANCHORED 3.612.1: the line also says "each round" for a per-round bonus.
    from: "    + (narrow ? ` (${narrow})` : \"\") + (spec?.perRound ? \" each round\" : \"\");",
    to: "    + \"\" + (spec?.perRound ? \" each round\" : \"\");",
    breaks: "F19 — \"one skill check\" for a spell that raises one action"
  },
  {
    file: HB,
    name: "the narrowing axes are lower-cased again, so no sentence can name them",
    from: "    actions: keys(raw.actions),",
    to: "    actions: list(raw.actions),",
    breaks: "F19/F19e — `recallKnowledge` becomes `recallknowledge`, with no word boundary left"
  },
  {
    file: HB,
    name: "MATCHING BECOMES CASE-SENSITIVE — four live spells stop firing",
    from: "  const has = (declared, value) => declared.some((d) => d.toLowerCase() === value);",
    to: "  const has = (declared, value) => declared.includes(value);",
    breaks: "F19d — the card lower-cases its key, the spec no longer does"
  },
  {
    // KEEP THE BETTER. Keeping the newer one is a reroll, not advantage.
    file: HB,
    name: "the reroll always replaces the original",
    from: "  const kept = Math.max(original, challenger);",
    to: "  const kept = challenger;",
    breaks: "G3/G4 — a worse second roll would stand"
  },
  {
    file: HB,
    name: "a losing reroll is reported as an improvement",
    from: "    improved: gain > 0,",
    to: "    improved: true,",
    breaks: "G5/G6 — the card claims a gain that did not happen"
  },
  {
    file: HB,
    name: "a rolled die of 1 is swallowed",
    from: "  const value = Math.trunc(Number(rolled)) || 0;",
    to: "  const value = Math.trunc(Number(rolled)) > 1 ? Math.trunc(Number(rolled)) : 0;",
    breaks: "H3 — the player spent a spell and the card shows nothing"
  },
  {
    file: CK,
    name: "the card stops recording the open-ended rule",
    from: "              openEnded: this.openEnded,",
    to: "",
    breaks: "H5 — the challenger may be unable to explode when the original could"
  },
  {
    file: IX,
    name: "spending advantage adds a modifier instead of replacing the die",
    from: "          updated.dieTotal = outcome.kept;",
    to: "          updated.modifiers = [...(updated.modifiers ?? [])];",
    breaks: "H8 — a modifier row is not advantage"
  },
  { file: HB, name: "an unscoped held bonus is accepted",
    from: "  if (!checkTypes.length) return null;",
    to: "  if (false) return null;",
    breaks: "A2 — offered on damage rolls and flat checks alike" },
  { file: HB, name: "a check type nothing reports is accepted",
    from: "  if (checkTypes.some((type) => !CHECK_TYPES.includes(type))) return null;",
    to: "  if (false) return null;",
    breaks: "A4 — a scope that can never match, silently" },
  { file: HB, name: "a zero bonus is accepted",
    from: "  if (!Number.isFinite(value) || value === 0) return null;",
    to: "  if (!Number.isFinite(value)) return null;",
    breaks: "A3 — a button that changes nothing" },
  { file: HB, name: "the declared immunity is dropped on the way through",
    from: "    immunitySeconds: Math.max(0, Math.trunc(Number(raw.immunitySeconds) || 0)),",
    to: "    immunitySeconds: 0,",
    breaks: "A6b — Guidance becomes re-castable the instant it is spent" },
  { file: HB, name: "the type no longer has to match",
    from: "  if (!spec.checkTypes.includes(type)) return false;",
    to: "  if (false) return false;",
    breaks: "B2 — Guidance is offered on damage rolls" },
  { file: HB, name: "a declared subject stops narrowing",
    from: "  if (spec.subjects.length && !has(spec.subjects, subject)) return false;",
    to: "  if (false) return false;",
    breaks: "B3 — Physical Boost reaches Intelligence checks" },
  { file: HB, name: "a declared action stops narrowing",
    from: "  if (spec.actions.length && !has(spec.actions, action)) return false;",
    to: "  if (false) return false;",
    breaks: "B5" },
  { file: HB, name: "an undeclared axis becomes required",
    // RE-ANCHORED AT 3.505.0: the axes are compared through `has`, which
    // lower-cases both sides, since they now keep their declared case.
    from: "  if (spec.subjects.length && !has(spec.subjects, subject)) return false;",
    to: "  if (!has(spec.subjects, subject)) return false;",
    breaks: "B6 — Guidance names no subject and would reach nothing" },
  { file: HB, name: "a bonus that moved nothing is reported as applied",
    from: "    applied: after !== before,",
    to: "    applied: true,",
    breaks: "C3 — the card claims a gain the pool did not give" },
  { file: HB, name: "an already-successful check is reported as turned",
    from: "  return {\n    applied: after !== before,\n    before,\n    after,\n    dc: threshold,\n    turnedAside: threshold !== null && before < threshold && after >= threshold",
    to: "  return {\n    applied: after !== before,\n    before,\n    after,\n    dc: threshold,\n    turnedAside: threshold !== null && after >= threshold",
    breaks: "C4b" },
  { file: FX, name: "the applier accepts a malformed spec",
    // RE-ANCHORED 2 Oct 2026 (3.611.0): the normalised row is `authored`
    // now, warped into `spec` below it.
    from: "          const authored = normaliseHeldBonus(effect);\n          if (!authored) {",
    to: "          const authored = normaliseHeldBonus(effect) ?? effect;\n          if (false) {",
    breaks: "E2 — a spell grants an unusable bonus and says nothing" },
  { file: IX, name: "the card offers every held bonus regardless of scope",
    from: "    if (!heldBonusMatches(spec, raw)) continue;",
    to: "    if (false) continue;",
    breaks: "E4 — Weapon Surge is offered on a Diplomacy check" },
  { file: IX, name: "the buttons stop being per-effect",
    from: "    const action = `held-bonus-${effect.id}`;",
    to: '    const action = "held-bonus";',
    breaks: "E5 — a character holding two can only ever spend one" },
  { file: CK, name: "the card stops carrying the action",
    from: "              actionKey: this.actionKey,",
    to: "",
    breaks: "E7 — an action-scoped held bonus silently never matches" }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([HB, FX, IX, CK, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-held-bonus: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-held-bonus: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-held-bonus: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
