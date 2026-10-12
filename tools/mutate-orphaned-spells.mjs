#!/usr/bin/env node
/**
 * mutate-orphaned-spells — can verify-orphaned-spells fail?
 *
 * NEW at 3.511.0.
 *
 * THE THREE GUARDS ARE THE WHOLE FILE. Every one of them is a spell this
 * ruling would end on the round it was cast, and none of the three would
 * look wrong on the panel — the row would simply not be there, which is
 * exactly what the ruling was asked to fix. A guard that fails open here
 * makes the fix worse than the problem.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const OS = path.join(SYSTEM_ROOT, "module", "magic", "orphaned-spells.mjs");
const AS = path.join(SYSTEM_ROOT, "module", "magic", "active-spells.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-orphaned-spells.mjs");

const MUTATIONS = [
  /* ── the mirror: effects whose row is gone (3.528.0) ───────────── */
  {
    file: AS,
    name: "S3 THE 96 — an unstamped effect becomes fair game",
    from: "      if (!f?.endsWithCast || !f.castId) return false;",
    to: "      if (!f?.castId) return false;",
    breaks: "S3 — Holy Shout, Banishment and 94 others leave effects with no clock and no row BY DESIGN; this deletes them the instant they land"
  },
  {
    file: AS,
    name: "S2 A LIVE ROW STOPS PROTECTING ITS EFFECTS",
    from: "      return !live.has(f.castId);",
    to: "      return true;",
    breaks: "S2/S6 — every sustained buff in the game would be swept while its spell is still running"
  },
  {
    file: AS,
    name: "S8 A PLAIN LIST OF IDS IS TREATED AS EMPTY",
    from: "  const live = registeredIds instanceof Set ? registeredIds : new Set(registeredIds ?? []);",
    to: "  const live = registeredIds instanceof Set ? registeredIds : new Set();",
    breaks: "S8 — a caller passing an array would have every stamped effect look stranded"
  },
  {
    file: AS,
    name: "R1 ONLY ONE ACTOR'S ROWS ARE GATHERED",
    from: "      if (e?.id) out.add(e.id);",
    to: "      if (e?.id && out.size < 1) out.add(e.id);",
    breaks: "R1 — the row lives on the caster and the effect on the ally, so a partial gather calls live buffs orphans"
  },
  {
    file: AS,
    name: "M6 AN ORDINARY MINUTE STARTS REGISTERING",
    from: "    || isDismissibleDuration(durationText)",
    to: "    || true",
    breaks: "M6/M7/M7b — every cast would be stamped, and the sweep would reach the 96 after all"
  },
  {
    file: AS,
    name: "M1 A SUSTAINED CAST STOPS REGISTERING",
    from: "    || Boolean(sustained)",
    to: "",
    breaks: "M1 — Bless would leave unstamped effects, which is the very family this was built for"
  },

  {
    file: OS,
    name: "N1 A LOCKED SPELL IS SWEPT — the caster gets their PP back early",
    from: "  if (entry.lock) return false;",
    to: "  ;",
    breaks: "N1/N1b — the lock is the row's own reason to exist"
  },
  {
    file: OS,
    name: "N2 A LIVE EMANATION IS SWEPT the moment its area is empty",
    from: "  if (entry.emanation) return false;",
    to: "  ;",
    breaks: "N2 — Protective Ward deleted while still standing"
  },
  {
    file: OS,
    name: "N3 A SPELL THAT APPLIED NOTHING IS SWEPT ON ITS FIRST ROUND",
    from: "  if (!Array.isArray(entry.targets) || !entry.targets.length) return false;",
    to: "  ;",
    breaks: "N3/N3b/N3c — a composition whose whole trace is a conviction point"
  },
  {
    file: OS,
    name: "N3b a non-array target list is treated as a real one",
    from: "  if (!Array.isArray(entry.targets) || !entry.targets.length) return false;",
    to: "  if (!entry.targets?.length) return false;",
    breaks: "N3c — a string target list has a length and would pass"
  },
  {
    file: OS,
    name: "N4 an entry with no id is swept, matching nothing",
    from: "  if (!entry?.id) return false;",
    to: "  ;",
    breaks: "N4 — a sweep keyed on nothing"
  },
  {
    file: OS,
    name: "O1 NOTHING IS EVER SWEPT — the ruling does nothing at all",
    from: "  return !carriesCastId;",
    to: "  return false;",
    breaks: "O1/O4 — the row this release exists to end"
  },
  {
    file: OS,
    name: "O2 A ROW IS SWEPT WHILE ITS EFFECTS ARE STILL THERE",
    from: "  return !carriesCastId;",
    to: "  return true;",
    breaks: "O2 — a live Bless deleted from under its caster"
  },
  {
    file: OS,
    name: "L1 the caster is not told why the row went",
    from: "  return `<strong>${name}</strong> ends — nothing it applied is left.`;",
    to: "  return `<strong>${name}</strong>.`;",
    breaks: "L1 — a row vanishing between glances is indistinguishable from a bug"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([OS, AS, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-orphaned-spells: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-orphaned-spells: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-orphaned-spells: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
