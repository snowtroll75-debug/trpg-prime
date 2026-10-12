#!/usr/bin/env node
/**
 * mutate-bleed-relief — can verify-bleed-relief fail?
 *
 * NEW at 3.516.0.
 *
 * O1 IS THE ONE THIS FILE EXISTS FOR, and it is the mutation nobody would
 * report as a bug. Get the "or" backwards and Voice Of Healing stops
 * healing anyone who happens to be bleeding — the spell lands, the card
 * says something happened, and the ally it was cast on is still dying.
 *
 * E1 IS THE WIDEST. This release put a branch inside `case "heal"`, the
 * most-used effect kind in the system. Neuter the guard that keeps
 * ordinary healing out of it and every heal in the game starts asking
 * about bleeding.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const B = path.join(SYSTEM_ROOT, "module", "magic", "bleed-relief.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-bleed-relief.mjs");

const MUTATIONS = [
  /* ── O: "or" ───────────────────────────────────────────────────── */
  {
    file: B,
    name: "O1 THE \"OR\" IS INVERTED — Voice Of Healing stops healing the bleeding",
    from: "  if (!spec) return { heal: true, bleed: points };",
    to: "  if (!spec) return { heal: false, bleed: points };",
    breaks: "O3 — the spell lands, the card says so, and the ally is still dying"
  },
  {
    file: B,
    name: "O2 EVERY BLEED RELIEF REPLACES THE HEALING",
    // RE-ANCHORED 2 Oct 2026 (3.611.0): the line also reads a row's own
    // `both` now (Animal Healing). The mutation still disables the warp.
    from: "  if (warpMods?.bleedAndHeal || spec?.both) return { heal: true, bleed: points };",
    to: "  if (spec?.both) return { heal: true, bleed: points };",
    breaks: "O2 — the 2 PP \"heals both\" warp would be charged and buy nothing"
  },
  {
    file: B,
    name: "O3 a declared choice stops being exclusive",
    // ANCHORED ON THE RETURN, NOT THE BRACE AFTER IT. The first version
    // carried the function's closing `}`, which `A3 NO ANCHOR CARRIES A
    // CLOSING DELIMITER IT DOES NOT CHANGE` refuses — and rightly: it
    // anchors on where the function stops rather than on the rule. The
    // clause below is unique on its own.
    from: "return { heal: false, bleed: points };",
    to: "return { heal: true, bleed: points };",
    breaks: "O1 — Cure would heal AND stop bleeding for free, and the 2 PP warp buys nothing"
  },

  /* ── B: who is bleeding ────────────────────────────────────────── */
  {
    file: B,
    name: "B1 A CREATURE THAT IS NOT BLEEDING HAS ITS BLEEDING STOPPED",
    from: "  if (!isBleeding) return { heal: true, bleed: 0 };",
    to: "  if (false) return { heal: true, bleed: 0 };",
    breaks: "B1 — Cure on a hurt-but-not-bleeding ally would heal nothing at all"
  },
  /*
   * B2 WAS WRITTEN AND DELETED, along with the guard it aimed at.
   *
   * It removed `points < 1` from the line above and SURVIVED, because
   * `normaliseBleedAlternative` already refuses a row of fewer than one
   * point — so a `spec` that exists always carries at least one — and a
   * casting with no relief at all falls through to the `!spec` branch and
   * returns `bleed: 0` either way. The clause changed no answer anywhere.
   *
   * The SIXTH dead guard this project has deleted rather than written a
   * check around, and the second found by a mutation surviving rather
   * than by reading.
   */

  /* ── D: the declaration ────────────────────────────────────────── */
  {
    file: B,
    name: "D1 EVERY HEAL ROW DECLARES AN ALTERNATIVE",
    from: "  if (points < 1) return null;",
    to: "",
    breaks: "D2/E2 — the whole pack's healing would become exclusive-or"
  },
  {
    file: B,
    name: "D2 the alternative is read off any effect kind",
    from: "  if (String(raw.kind ?? \"\").trim() !== \"heal\") return null;",
    to: "  if (false) return null;",
    breaks: "D3 — a damage row could declare healing's alternative"
  },

  /* ── P: the points ─────────────────────────────────────────────── */
  {
    file: B,
    name: "P1 A NEGATIVE MOD BUYS LESS BLEED RELIEF",
    from: "  const extra = Math.max(0, int(warpMods?.bleedPoints));",
    to: "  const extra = int(warpMods?.bleedPoints);",
    breaks: "P3 — a warp only ever buys more"
  },
  {
    file: B,
    name: "P2 THE WARP STOPS ADDING POINTS",
    from: "  return (spec ? spec.points : 0) + extra;",
    to: "  return (spec ? spec.points : 0);",
    breaks: "P2/P4b — Graham's repeatable option would be charged and buy nothing"
  },

  /* ── W: the mod channel ────────────────────────────────────────── */
  {
    file: W,
    name: "W1 THE POINTS MOD IS DROPPED BY THE AGGREGATE — inert again",
    from: "    if (m.bleedPoints) mods.bleedPoints += Number(m.bleedPoints) * times;",
    to: "    ;",
    breaks: "W1 — offered, charged, printed as warped, and doing nothing"
  },
  {
    file: W,
    name: "W2 the both flag is dropped",
    from: "    if (m.bleedAndHeal) mods.bleedAndHeal = true;",
    to: "    ;",
    breaks: "W2 — the same inert shape, one line over"
  },
  {
    file: W,
    name: "W3 the points key leaves the declared list",
    from: "    bleedPoints: 0,",
    to: "    bleedPointsUnused: 0,",
    breaks: "W1 — an undeclared mod key is dropped in silence"
  },
  {
    file: W,
    name: "W4 THE EXTRA POINTS ARE BOUGHT ONCE AND NO MORE",
    from: "    if (m.bleedPoints) mods.bleedPoints += Number(m.bleedPoints) * times;",
    to: "    if (m.bleedPoints) mods.bleedPoints += Number(m.bleedPoints);",
    breaks: "W1b — the count box would be offered and only the first purchase would land"
  },

  /* ── L: the card ───────────────────────────────────────────────── */
  {
    file: B,
    name: "L1 THE CARD STOPS SAYING BLEEDING ENDED",
    from: "    return `${targetName}: <strong>bleeding stops</strong> (was ${before}).`;",
    to: "    return `${targetName}: bleeding reduced.`;",
    breaks: "L2/L2b — invisible on a sheet that already showed a number"
  },
  {
    file: B,
    name: "L2 every ordinary heal apologises for not bleeding",
    from: "  if (!spec) return null;\n  return `<em>${targetName} was not bleeding",
    to: "  if (false) return null;\n  return `<em>${targetName} was not bleeding",
    breaks: "L3b — a line on every Heal, Cure Wounds and Lifekeeping in the game"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([B, W, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-bleed-relief: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-bleed-relief: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-bleed-relief: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
