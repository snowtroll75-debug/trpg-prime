#!/usr/bin/env node
/**
 * mutate-dismissible-spells — can verify-dismissible-spells fail?
 *
 * NEW at 3.494.0.
 *
 * G1 IS THE SHIPPED DEFECT, and it shipped for four months: the gate
 * asked three questions and none of them was the one printed on the
 * duration line, so 53 of 56 dismissible spells could not be dismissed.
 *
 * X1 IS THE ONE THAT WOULD MAKE THIS RELEASE WORSE THAN THE GAP. Without
 * the entry's stamp, 53 more registrations never come off the panel and
 * a player's Spellcasting tab fills with last session's spells.
 *
 * X3c IS THE SUBTLE ONE. The world-clock sweep sits behind a guard that
 * asked only about emanation stamps; a widened sweep behind a narrow
 * guard is a widened sweep nobody reaches — which is the shape of the
 * defect this whole release exists to close.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const REG = path.join(SYSTEM_ROOT, "module", "magic", "active-spells.mjs");
const ENDS = path.join(SYSTEM_ROOT, "module", "magic", "spell-ends.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const EAW = path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const AS = path.join(SYSTEM_ROOT, "module", "magic", "active-spells.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-dismissible-spells.mjs");

const MUTATIONS = [
  /* ── D: reading the (D) ────────────────────────────────────────── */
  {
    file: REG,
    name: "D1 the (D) test catches a bare letter D anywhere",
    from: "  return /\\(\\s*D\\s*\\)/i.test(String(duration ?? \"\"));",
    to: "  return /d/i.test(String(duration ?? \"\"));",
    breaks: "D3 — \"1 day\" and \"until daily preparations\" would register as dismissible"
  },
  {
    file: REG,
    name: "D2 (S) is read as (D)",
    from: "  return /\\(\\s*D\\s*\\)/i.test(String(duration ?? \"\"));",
    to: "  return /\\([SD]\\)/i.test(String(duration ?? \"\"));",
    breaks: "D3 — a sustained spell is not a dismissible one"
  },
  {
    file: REG,
    name: "D3 nothing is ever dismissible",
    from: "  return /\\(\\s*D\\s*\\)/i.test(String(duration ?? \"\"));",
    to: "  return false;",
    breaks: "D1 — the gap this release closes, reopened"
  },

  /* ── E: the stamp ──────────────────────────────────────────────── */
  {
    file: ENDS,
    name: "E1 a null round becomes round zero",
    from: "  const byRound = rounds != null && round != null",
    to: "  const byRound = rounds != null",
    breaks: "E2 — outside an encounter every spell would end on a round already passed"
  },
  {
    file: ENDS,
    name: "E2 AN UNCOUNTABLE DURATION IS STAMPED WITH NULLS",
    from: "  if (byTime === null && byRound === null) return null;",
    to: "",
    breaks: "E3 — a stamp that can never elapse is asked about forever"
  },
  {
    file: ENDS,
    name: "E3 the world clock is not stamped",
    from: "  const byTime = seconds != null && worldTime != null\n    ? Number(worldTime) + Number(seconds)\n    : null;",
    to: "  const byTime = null;",
    breaks: "E1 — a spell cast in a corridor would never end"
  },

  /* ── G: the gate ───────────────────────────────────────────────── */
  {
    file: CAST,
    name: "G1 THE SHIPPED DEFECT: the gate stops asking about (D)",
    // THE LIMB MOVED (3.528.0). The gate's five questions now live in
    // `castWillRegister` so the effect stamp and the registration cannot
    // disagree; this breaks the same limb in its new home. Anchored on the
    // one clause, for the reason the old comment gave: a growing list's
    // end is not an anchor.
    file: AS,
    from: "    || isDismissibleDuration(durationText)",
    to: "",
    breaks: "G1/G1a — 53 of 56 dismissible spells could not be dismissed"
  },
  {
    file: CAST,
    name: "G2 the entry stops saying why it is listed",
    from: "        dismissible,\n",
    to: "",
    breaks: "G2 — the panel would have to deduce it from two absences"
  },
  {
    file: CAST,
    name: "G3 NO STAMP AT ALL: the panel fills with last session's spells",
    from: "        ends: (lock || warpedSustained) ? null : endsStamp({",
    to: "        ends: null ?? ((lock || warpedSustained) ? null : {",
    breaks: "G4/G3 — a registration with no clock never comes off"
  },
  {
    file: CAST,
    name: "G4 a sustained spell is stamped after all",
    from: "        ends: (lock || warpedSustained) ? null : endsStamp({",
    to: "        ends: lock ? null : endsStamp({",
    breaks: "G4 — invents the clock emanation-growth.mjs decided not to invent"
  },
  {
    file: CAST,
    name: "G5 a PP-locked spell gets a second clock",
    from: "        ends: (lock || warpedSustained) ? null : endsStamp({",
    to: "        ends: warpedSustained ? null : endsStamp({",
    breaks: "G4 — two clocks on one thing, the defect 3.476.0 paid for"
  },
  {
    file: CAST,
    name: "G6 the duration is read again instead of parsed once",
    from: "      const parsedForEnd = parseSpellDuration(durationText);",
    to: "      const parsedForEnd = null;",
    breaks: "G3 — nothing would ever be stamped"
  },

  /* ── X: it comes off again ─────────────────────────────────────── */
  {
    file: REG,
    name: "X1 THE SWEEP STOPS READING THE ENTRY'S OWN STAMP",
    from: "    const elapsed = endsHaveElapsed(entry?.ends, { worldTime, round })\n      || emanationHasElapsed(entry?.emanation, { worldTime, round });",
    to: "    const elapsed = emanationHasElapsed(entry?.emanation, { worldTime, round });",
    breaks: "X1 — worse than the gap: 53 spells that never leave the panel"
  },
  {
    file: REG,
    name: "X2 and stops reading the emanation's, so Protective Ward never ends",
    from: "    const elapsed = endsHaveElapsed(entry?.ends, { worldTime, round })\n      || emanationHasElapsed(entry?.emanation, { worldTime, round });",
    to: "    const elapsed = endsHaveElapsed(entry?.ends, { worldTime, round });",
    breaks: "X1b — the sweep was moved here to serve both, not to replace one"
  },
  {
    file: REG,
    // WIDENED AT 3.511.0. `sweepOrphanedSpells` ends its entries the same
    // way — not a dismissal either — and its line CONTAINS this one as a
    // substring, so the anchor matched twice and went ANCHOR x2. Carried
    // with the line above it, which belongs to this sweep alone.
    name: "X3 a duration running out is reported as a dismissal",
    from: "    if (!elapsed) continue;\n    await endActiveSpell(actor, entry.id, { dismissed: false });",
    to: "    if (!elapsed) continue;\n    await endActiveSpell(actor, entry.id);",
    breaks: "X2 — Delayed Respite's card would say \"released early\" of a clock"
  },
  {
    file: COMBAT,
    name: "X4 the turn clock stops sweeping",
    from: "    const faded = await sweepActiveSpellExpiry(actor, {",
    to: "    const faded = [] || await sweepActiveSpellExpiry(actor, {",
    breaks: "X3 — the result is bound, not merely the call present"
  },
  {
    file: BOOT,
    name: "X5 THE NARROW GUARD: the widened sweep is never reached",
    from: "(e) => e?.ends || e?.emanation?.ends",
    to: "(e) => e?.emanation?.ends",
    breaks: "X3c — the exact shape of the defect this release closes"
  },

  /* ── T: the option travels ─────────────────────────────────────── */
  {
    file: EAW,
    // RETARGETED AT BEHAVIOUR (3.527.0). This used to name the primitive's
    // exact signature, alongside a T1 that read the same text — so both the
    // check and its mutation broke when the signature gained a parameter,
    // while the rule itself was fine. T1 now drives the primitive, so this
    // breaks what it DOES.
    name: "T1 THE CAST ID IS IGNORED — one spell ending takes every spell with it",
    // AND NARROWED TO THE ONE LINE IT REPLACES. The first version carried
    // `.map((e) => e.id);` through unchanged, and A5 — added last release
    // for exactly this — refused it. Deleting the filter alone leaves
    // valid JS and names the rule instead of its neighbours.
    from: "    .filter((e) => e.getFlag?.(SYSTEM_ID, CAST_ID_FLAG) === castId)",
    to: "",
    breaks: "T1 — dismissing one spell would strip every other effect on the target, including a second caster's"
  },
  {
    file: REG,
    name: "T2 the registry stops passing it down",
    from: "await removeEffectsByCastId(target, id, { dismissed });",
    to: "await removeEffectsByCastId(target, id);",
    breaks: "T2 — it would stop one layer short of the card that prints it"
  },
  {
    file: REG,
    name: "T3 the default becomes the sweep rather than the person",
    from: "async function endActiveSpell(actor, id, { dismissed = true } = {}) {",
    to: "async function endActiveSpell(actor, id, { dismissed = false } = {}) {",
    breaks: "T3 — the Dismiss action and the Magic tab both call it bare"
  },

  /* ── P: the panel ──────────────────────────────────────────────── */
  {
    file: REG,
    name: "P1 THE ROW LIES: a dismissible entry claims to lock PP",
    // ONE LINE, NOT THE WHOLE FALL-THROUGH. This anchor used to carry the
    // chain down to `return "Dismissible";`, and 3.512.0 inserted a fifth
    // word above that line — so it went MISSING on a change it was not
    // about. THE THIRD ANCHOR THIS RELEASE BROKE THAT WAY, alongside
    // mutate-dismissible G1 and mutate-emanation E2d. `A3` refuses an
    // anchor on a growing list's closing DELIMITER; all three of these
    // carried its last ELEMENT instead, which is the same fact wearing
    // different punctuation.
    from: "  if (entry?.lock) return `PP locked (${entry.lock})`;",
    to: "  return `PP locked (${entry?.lock})`;",
    breaks: "P3 — \"PP locked ()\" over a Shield that locks nothing"
  },
  {
    file: REG,
    name: "P2 a sustained entry loses its type",
    from: "    return entry.sustainType ? `Sustained (${entry.sustainType})` : \"Sustained\";",
    to: "    return \"Sustained\";",
    breaks: "P1b"
  },
  {
    file: SHEET,
    name: "P3 the sheet stops computing the state",
    from: "      state: activeSpellState(entry)",
    to: "      state: \"\"",
    breaks: "P5 — an empty State column"
  },
  {
    file: HBS,
    name: "P4 the template goes back to branching two ways over three cases",
    from: "            <span>{{spell.state}}</span>",
    to: "            <span>{{#if spell.sustained}}Sustained{{else}}PP locked ({{spell.lock}}){{/if}}</span>",
    breaks: "P4 — the branch whose else-half became a lie"
  },

  /* ── S: what it leaves alone ───────────────────────────────────── */
  {
    file: REG,
    name: "S1 A DISMISSIBLE ENTRY STARTS LOCKING PP",
    from: "  return entries.reduce((sum, e) => sum + (e?.lock ? Number(e.pp) || 0 : 0), 0);",
    to: "  return entries.reduce((sum, e) => sum + (Number(e?.pp) || 0), 0);",
    breaks: "S1 — 53 spells joining the list would lock 53 spells' worth of points"
  },
  {
    file: REG,
    name: "S2 and starts counting as sustained",
    from: "  return entries.some((e) => e?.sustained);",
    to: "  return entries.length > 0;",
    breaks: "S2 — PP recovery and rest both ask this"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([REG, ENDS, CAST, EAW, COMBAT, BOOT, SHEET, HBS, V, AS]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-dismissible-spells: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-dismissible-spells: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-dismissible-spells: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
