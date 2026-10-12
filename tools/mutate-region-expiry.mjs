#!/usr/bin/env node
/**
 * mutate-region-expiry — can verify-region-expiry fail?
 *
 * NEW at 3.500.0.
 *
 * U4 IS THE ONE THAT WOULD BE FOUND AS A RULES DISPUTE. A sweep that
 * stopped asking for the flag would delete a GM's own hand-placed
 * Regions — walls, hazards, lighting cues — the first time a turn ticked
 * over, and the report would be "Foundry ate my map".
 *
 * W2 IS THE QUIET ONE. Stamping a live emanation gives one document two
 * clocks, and the faster one wins: Protective Ward's Region would vanish
 * while the ward was still following its caster.
 *
 * C2 IS THE RATCHET. A seventh claimant with an uncountable duration is a
 * new permanent Region, and it would arrive silently — which is exactly
 * how the six being fixed here arrived.
 *
 * E3 IS THE HALF THAT IS EASY TO LOSE. One clock looks like enough right
 * up until Consecrate's day is asked about inside a combat that will
 * never run 14,400 rounds.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "region-expiry.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "magic", "region-expiry-workflow.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const SCRIPT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const LIFE = path.join(SYSTEM_ROOT, "module", "magic", "area-region-life.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-region-expiry.mjs");

const MUTATIONS = [
  /* ── R: the record ─────────────────────────────────────────────── */
  {
    file: P,
    name: "R1 A STAMP OF TWO NULLS IS STORED AS A CLOCK",
    from: "  if (byTime === null && byRound === null) return null;\n  return { endsAtWorldTime: byTime, endsOnRound: byRound };",
    to: "  return { endsAtWorldTime: byTime, endsOnRound: byRound };",
    breaks: "R3 — the sweep would ask about it for ever and never act"
  },
  {
    file: P,
    name: "R2 a nameless spell keeps its nameless name",
    from: "    spellName: text(spellName) || \"A spell\",",
    to: "    spellName: text(spellName),",
    breaks: "R2 — \"undefined's area disperses\" is a bug report, not a line"
  },
  {
    file: P,
    name: "R3 a Region that is not ours becomes one that is",
    from: "  if (!raw || typeof raw !== \"object\") return null;\n  return regionExpiryRecord(raw);",
    to: "  return regionExpiryRecord(raw ?? {});",
    breaks: "R5 — every unflagged Region would answer as a record"
  },

  /* ── E: the two clocks ─────────────────────────────────────────── */
  {
    file: P,
    name: "E1 THE WORLD CLOCK IS DROPPED",
    from: "  const byTime = raw.endsAtWorldTime == null ? null : int(raw.endsAtWorldTime);",
    to: "  const byTime = null;",
    breaks: "E2 — a Region placed in a corridor would never expire"
  },
  {
    file: P,
    name: "E2 THE ROUND CLOCK IS DROPPED",
    from: "  const byRound = raw.endsOnRound == null ? null : int(raw.endsOnRound);",
    to: "  const byRound = null;",
    breaks: "E3 — Consecrate's day asked about inside a combat"
  },
  {
    // RETARGETED AT 3.500.0. This aimed at a guard reading
    // `if (!parsed?.ends) return false;` and SURVIVED, because
    // `endsHaveElapsed` refuses a null stamp itself one call later — the
    // guard was dead and is now deleted. What is mutated instead is the
    // refusal that is actually load-bearing, inside spell-ends.mjs.
    file: path.join(SYSTEM_ROOT, "module", "magic", "spell-ends.mjs"),
    name: "E3 AN UNSTAMPED THING EXPIRES IMMEDIATELY",
    from: "  if (!ends) return false;",
    to: "",
    breaks: "E4/E5/U5 — \"varies\" has no end anybody can compute, and every "
      + "unstamped Region would go on the first tick"
  },

  /* ── U: what the sweep will not touch ──────────────────────────── */
  {
    file: P,
    name: "U1 THE SWEEP STOPS ASKING FOR THE FLAG",
    from: "    if (!regionHasExpired(entry.record, { worldTime, round })) continue;",
    to: "",
    breaks: "U1/U4 — a GM's own Regions deleted the first time a turn ticked over"
  },
  {
    file: P,
    name: "U2 a running Region goes with the expired one",
    from: "    if (!regionHasExpired(entry.record, { worldTime, round })) continue;",
    to: "    if (regionHasExpired(entry.record, { worldTime, round }) === null) continue;",
    breaks: "U1/U2 — Consecrate's day would end on the first turn"
  },
  {
    file: P,
    name: "U3 the name is dropped on the way out",
    from: "    out.push({ id: entry.id, spellName: normaliseRegionExpiry(entry.record).spellName });",
    to: "    out.push({ id: entry.id, spellName: \"\" });",
    breaks: "U3 — a Region vanishing with no name is a mystery"
  },
  {
    file: P,
    name: "U4 a row with no id is swept anyway",
    from: "    if (!entry?.id) continue;",
    to: "",
    breaks: "U6 — deleteEmbeddedDocuments would be handed an undefined"
  },

  /* ── W: where it is wired ──────────────────────────────────────── */
  {
    file: CAST,
    name: "W1 THE STAMP MOVES ONTO THE CLEAR BRANCH",
    from: "  } else if (placedArea?.regionId && !emanationIsLive(spellData)) {",
    to: "  }\n  if (placedArea?.regionId && !emanationIsLive(spellData)) {",
    breaks: "W1 — a stamp written onto a Region that was just deleted"
  },
  {
    file: CAST,
    name: "W2 A LIVE EMANATION IS STAMPED TOO",
    from: "  } else if (placedArea?.regionId && !emanationIsLive(spellData)) {",
    to: "  } else if (placedArea?.regionId) {",
    breaks: "W2 — two clocks on one document, and the faster one wins"
  },
  {
    file: CAST,
    name: "W3 the stamp ignores the warp that bought a longer duration",
    from: "    const parsedForRegion = parseSpellDuration(warpedDurationText(spellData?.duration, warpMods));",
    to: "    const parsedForRegion = parseSpellDuration(spellData?.duration);",
    breaks: "W3 — a warped hour would disperse after the printed minute"
  },
  {
    file: COMBAT,
    name: "W4 THE ROUND CLOCK STOPS SWEEPING",
    from: "    const { sweepRegionExpiry } = await import(\"../magic/region-expiry-workflow.mjs\");",
    to: "    const sweepRegionExpiry = async () => [];",
    breaks: "W4 — nothing would expire inside an encounter"
  },
  {
    file: SCRIPT,
    name: "W5 THE WORLD CLOCK STOPS SWEEPING",
    from: "    const { sweepRegionExpiry } = await import(\"../module/magic/region-expiry-workflow.mjs\");",
    to: "    const sweepRegionExpiry = async () => [];",
    breaks: "W5 — a Region placed outside combat would never go"
  },
  {
    file: FLOW,
    name: "W6 A CLOCKLESS REGION IS STAMPED",
    from: "  if (!record.ends) return false;",
    to: "",
    breaks: "W7 — a flag claiming a Region for a sweep that can never act on it"
  },
  {
    file: FLOW,
    name: "W7 the sweep reads a flag nobody writes",
    from: "    record: region.getFlag?.(SYSTEM_ID, REGION_EXPIRY_FLAG) ?? null",
    to: "    record: region.getFlag?.(SYSTEM_ID, \"regionExpiry\") ?? null",
    breaks: "W8 — the stamp and the sweep would name different flags"
  },

  /* ── C: the claimants ──────────────────────────────────────────── */
  {
    file: LIFE,
    name: "C1 A SEVENTH KIND CLAIMS A REGION",
    from: "  \"hazard\", \"elementalNexus\", \"areaRider\"",
    to: "  \"hazard\", \"elementalNexus\", \"areaRider\", \"note\"",
    breaks: "C1/C2 — every spell with a note row would keep its Region, most with "
      + "no duration to count"
  },
  {
    file: LIFE,
    name: "C2 a claiming kind stops claiming",
    from: "  \"hazard\", \"elementalNexus\", \"areaRider\"",
    to: "  \"hazard\", \"elementalNexus\"",
    breaks: "C1 — the six would become five and Consecrate's ground would vanish on cast"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, FLOW, CAST, COMBAT, SCRIPT, LIFE, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-region-expiry: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-region-expiry: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-region-expiry: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
